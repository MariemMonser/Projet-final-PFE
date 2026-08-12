const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const nodemailer = require('nodemailer');
const db       = require('../config/db');

const logAction = async (idUser, action, tableCible = null, ip = null) => {
  try {
    await db.query(
      'INSERT INTO audit_log (id_user, action, table_cible, ip_address) VALUES ($1, $2, $3, $4)',
      [idUser, action, tableCible, ip]
    );
  } catch (err) {
    console.error('Erreur audit_log:', err.message);
  }
};

const login = async (req, res) => {
  const { email, mot_de_passe } = req.body;
  const ip = req.ip;

  if (!email || !mot_de_passe) {
    return res.status(400).json({ message: 'Email et mot de passe requis.' });
  }

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!EMAIL_RE.test(email)) {
    return res.status(400).json({ message: 'Format d\'email invalide.' });
  }

  try {
    
    const rows = await db.query(
      'SELECT * FROM utilisateurs WHERE email = $1',
      [email.toLowerCase().trim()]
    );

    if (rows.rows.length === 0) {
      return res.status(401).json({ message: 'Email ou mot de passe incorrect.' });
    }

    const user = rows.rows[0];

    if (!user.est_actif) {
      return res.status(403).json({ message: 'Compte desactive. Contactez l administrateur.' });
    }

    if (user.verrouille_jusqu && new Date(user.verrouille_jusqu) > new Date()) {
      const min = Math.ceil((new Date(user.verrouille_jusqu) - new Date()) / 60000);
      return res.status(423).json({ message: `Compte bloque. Reessayez dans ${min} minute(s).` });
    }

    const mdpCorrect = await bcrypt.compare(mot_de_passe, user.mot_de_passe);

    if (!mdpCorrect) {
      const tentatives = (user.tentatives_connexion || 0) + 1;
      const lockUntil  = tentatives >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null;
      await db.query(
        'UPDATE utilisateurs SET tentatives_connexion = $1, verrouille_jusqu = $2 WHERE id = $3',
        [tentatives, lockUntil, user.id]
      );
      const msg = lockUntil
        ? 'Compte bloque apres 5 echecs. Reessayez dans 15 minute(s).'
        : 'Email ou mot de passe incorrect.';
      return res.status(lockUntil ? 423 : 401).json({ message: msg });
    }

    // Réinitialiser le compteur après connexion réussie
    await db.query(
      'UPDATE utilisateurs SET verrouille_jusqu = NULL, tentatives_connexion = 0 WHERE id = $1',
      [user.id]
    );

    
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    await logAction(user.id, 'LOGIN', 'utilisateurs', ip);

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        prenom: user.prenom,
        nom: user.nom,
        role: user.role
      }
    });

  } catch (err) {
    console.error('Erreur login:', err);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
};

const logout = async (req, res) => {
  try {
    const decoded  = jwt.decode(req.token);
    const expireAt = new Date(decoded.exp * 1000);

    
    await db.query(
      'INSERT INTO token_blacklist (token_jti, id_user, expire_at) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
      [req.token, req.user.id, expireAt]
    );

    await logAction(req.user.id, 'LOGOUT', 'utilisateurs', req.ip);
    res.json({ message: 'Deconnexion reussie.' });

  } catch (err) {
    console.error('Erreur logout:', err);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
};

const getProfil = (req, res) => {
  res.json(req.user);
};

const resetDemande = async (req, res) => {
  const { email } = req.body;

  // Always return same message to prevent email enumeration
  res.json({ message: 'Si cet email existe, un mot de passe temporaire a été envoyé.' });

  try {
    const result = await db.query(
      'SELECT * FROM utilisateurs WHERE email = $1 AND est_actif = true',
      [email.toLowerCase().trim()]
    );
    if (result.rows.length === 0) return;

    const user = result.rows[0];

    // Generate 8-char alphanumeric temp password (no ambiguous chars like 0/O/1/l)
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let tempPassword = '';
    for (let i = 0; i < 8; i++) tempPassword += chars[Math.floor(Math.random() * chars.length)];

    const hash = await bcrypt.hash(tempPassword, 12);
    await db.query(
      'UPDATE utilisateurs SET mot_de_passe = $1, tentatives_connexion = 0, verrouille_jusqu = NULL WHERE id = $2',
      [hash, user.id]
    );
    await db.query(
      'UPDATE tokens_reinitialisation SET utilise = true WHERE id_user = $1 AND utilise = false',
      [user.id]
    );

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
      tls: { rejectUnauthorized: false }
    });

    await transporter.sendMail({
      from:    process.env.EMAIL_USER,
      to:      user.email,
      subject: 'ELEONETECH - Mot de passe temporaire',
      html: `
        <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:20px;">
          <h2 style="color:#1e3a5f;border-bottom:2px solid #2563eb;padding-bottom:10px;">
            ELEONETECH — Accès temporaire
          </h2>
          <p>Bonjour <strong>${user.prenom} ${user.nom}</strong>,</p>
          <p>Suite à votre demande, voici votre mot de passe temporaire :</p>
          <div style="background:#f0f4f8;border-left:4px solid #2563eb;padding:16px 24px;margin:20px 0;border-radius:4px;text-align:center;">
            <p style="font-size:28px;font-weight:bold;letter-spacing:6px;color:#1e3a5f;margin:0;font-family:monospace;">
              ${tempPassword}
            </p>
          </div>
          <p><strong>Important :</strong> Connectez-vous avec ce mot de passe, puis changez-le immédiatement via votre profil.</p>
          <p style="color:#999;font-size:12px;margin-top:20px;">
            Si vous n'avez pas fait cette demande, contactez l'administrateur.
          </p>
        </div>
      `
    });
    await logAction(user.id, 'RESET_PASSWORD_TEMP', 'utilisateurs', null);
  } catch (err) {
    console.error('Erreur reset demande:', err);
  }
};

const resetConfirm = async (req, res) => {
  const { token } = req.params;
  const { nouveau_mot_de_passe } = req.body;

  if (!nouveau_mot_de_passe || nouveau_mot_de_passe.length < 8) {
    return res.status(400).json({ message: 'Mot de passe minimum 8 caracteres.' });
  }

  try {
    const result = await db.query(
      `SELECT tr.*, u.email FROM tokens_reinitialisation tr
       JOIN utilisateurs u ON u.id = tr.id_user
       WHERE tr.token = $1 AND tr.utilise = false AND tr.expire_at > NOW()`,
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ message: 'Lien invalide ou expire.' });
    }

    const resetToken = result.rows[0];
    const hash       = await bcrypt.hash(nouveau_mot_de_passe, 12);

    await db.query(
      'UPDATE utilisateurs SET mot_de_passe = $1, tentatives_connexion = 0, verrouille_jusqu = NULL WHERE id = $2',
      [hash, resetToken.id_user]
    );

    await db.query(
      'UPDATE tokens_reinitialisation SET utilise = true WHERE id = $1',
      [resetToken.id]
    );

    await logAction(resetToken.id_user, 'RESET_PASSWORD', 'utilisateurs', req.ip);
    res.json({ message: 'Mot de passe change avec succes.' });

  } catch (err) {
    console.error('Erreur reset confirm:', err);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
};

const changePassword = async (req, res) => {
  const { ancien_mot_de_passe, nouveau_mot_de_passe } = req.body;

  if (!ancien_mot_de_passe || !nouveau_mot_de_passe) {
    return res.status(400).json({ message: 'Tous les champs sont requis.' });
  }

  if (nouveau_mot_de_passe.length < 8) {
    return res.status(400).json({ message: 'Le nouveau mot de passe doit contenir au moins 8 caracteres.' });
  }

  try {
    
    const rows = await db.query(
      'SELECT mot_de_passe FROM utilisateurs WHERE id = $1',
      [req.user.id]
    );

    if (rows.rows.length === 0) {
      return res.status(404).json({ message: 'Utilisateur non trouve.' });
    }

    const user = rows.rows[0];
    const mdpCorrect = await bcrypt.compare(ancien_mot_de_passe, user.mot_de_passe);

    if (!mdpCorrect) {
      return res.status(401).json({ message: 'Ancien mot de passe incorrect.' });
    }

    
    const hash = await bcrypt.hash(nouveau_mot_de_passe, 12);
    await db.query(
      'UPDATE utilisateurs SET mot_de_passe = $1 WHERE id = $2',
      [hash, req.user.id]
    );

    await logAction(req.user.id, 'CHANGE_PASSWORD', 'utilisateurs', req.ip);
    res.json({ message: 'Mot de passe modifie avec succes.' });

  } catch (err) {
    console.error('Erreur change password:', err);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
};

module.exports = { login, logout, getProfil, resetDemande, resetConfirm, changePassword };

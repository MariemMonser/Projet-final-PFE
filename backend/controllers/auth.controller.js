// ============================================================
// AUTH CONTROLLER
// Login, Logout, Reset mot de passe, Profil
// ============================================================
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const nodemailer = require('nodemailer');
const db       = require('../config/db');

// ── Helper : enregistrer dans audit_log ──────────────────
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

// ── POST /api/auth/login ─────────────────────────────────
const login = async (req, res) => {
  const { email, mot_de_passe } = req.body;
  const ip = req.ip;

  if (!email || !mot_de_passe) {
    return res.status(400).json({ message: 'Email et mot de passe requis.' });
  }

  try {
    // Chercher l'utilisateur par email
    const rows = await db.query(
      'SELECT * FROM utilisateurs WHERE email = $1',
      [email.toLowerCase().trim()]
    );

    if (rows.rows.length === 0) {
      return res.status(401).json({ message: 'Email ou mot de passe incorrect.' });
    }

    const user = rows.rows[0];

    // Compte desactive
    if (!user.est_actif) {
      return res.status(403).json({ message: 'Compte desactive. Contactez l administrateur.' });
    }

    // Compte bloque
    if (user.verrouille_jusqu && new Date(user.verrouille_jusqu) > new Date()) {
      const min = Math.ceil((new Date(user.verrouille_jusqu) - new Date()) / 60000);
      return res.status(423).json({ message: `Compte bloque. Reessayez dans ${min} minute(s).` });
    }

    // Verifier le mot de passe
    const mdpCorrect = await bcrypt.compare(mot_de_passe, user.mot_de_passe);

    if (!mdpCorrect) {
      return res.status(401).json({ message: 'Mot de passe incorrect.' });
    }

    // Login reussi
    await db.query(
      'UPDATE utilisateurs SET verrouille_jusqu = NULL WHERE id = $1',
      [user.id]
    );

    // Creer le token JWT (8 heures)
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

// ── POST /api/auth/logout ────────────────────────────────
const logout = async (req, res) => {
  try {
    const decoded  = jwt.decode(req.token);
    const expireAt = new Date(decoded.exp * 1000);

    // Blacklister le token (PostgreSQL)
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

// ── GET /api/auth/profil ─────────────────────────────────
const getProfil = (req, res) => {
  res.json(req.user);
};

// ── POST /api/auth/reset-demande ─────────────────────────
const resetDemande = async (req, res) => {
  const { email } = req.body;

  try {
    const result = await db.query(
      'SELECT * FROM utilisateurs WHERE email = $1 AND est_actif = true',
      [email.toLowerCase().trim()]
    );

    if (result.rows.length === 0) {
      return res.json({ message: 'Si cet email existe, un lien a ete envoye.' });
    }

    const user     = result.rows[0];
    const token    = uuidv4();
    const expireAt = new Date(Date.now() + 30 * 60 * 1000);

    // Invalider anciens tokens
    await db.query(
      'UPDATE tokens_reinitialisation SET utilise = true WHERE id_user = $1 AND utilise = false',
      [user.id]
    );

    // Sauvegarder nouveau token
    await db.query(
      'INSERT INTO tokens_reinitialisation (id_user, token, expire_at) VALUES ($1, $2, $3)',
      [user.id, token, expireAt]
    );

    // Envoyer email
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
      tls: { rejectUnauthorized: false }
    });

    const appUrl = process.env.APP_URL || 'http://localhost:3000';
    const lien = `${appUrl}/reset-password/${token}`;

    await transporter.sendMail({
      from:    process.env.EMAIL_USER,
      to:      user.email,
      subject: 'ELEONETECH - Reinitialisation mot de passe',
      html:    `<p>Bonjour ${user.prenom},</p>
                <p>Cliquez sur ce lien (valable 30 min) :</p>
                <a href="${lien}">${lien}</a>`
    });

    res.json({ message: 'Si cet email existe, un lien a ete envoye.' });

  } catch (err) {
    console.error('Erreur reset demande:', err);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
};

// ── POST /api/auth/reset/:token ──────────────────────────
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
// ── POST /api/auth/change-password ───────────────────────
const changePassword = async (req, res) => {
  const { ancien_mot_de_passe, nouveau_mot_de_passe } = req.body;

  if (!ancien_mot_de_passe || !nouveau_mot_de_passe) {
    return res.status(400).json({ message: 'Tous les champs sont requis.' });
  }

  if (nouveau_mot_de_passe.length < 8) {
    return res.status(400).json({ message: 'Le nouveau mot de passe doit contenir au moins 8 caracteres.' });
  }

  try {
    // Verifier le mot de passe actuel
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

    // Mettre a jour le mot de passe
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

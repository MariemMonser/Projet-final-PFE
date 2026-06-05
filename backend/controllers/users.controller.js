// ============================================================
// USERS CONTROLLER
// CRUD utilisateurs + Audit Log (Administrateur seulement)
// ============================================================
const bcrypt = require('bcryptjs');
const db     = require('../config/db');
const nodemailer = require('nodemailer');

const ROLES_VALIDES = ['Administrateur', 'Responsable', 'Technicien', 'Lecteur'];

const validerMotDePasse = (mdp) => {
  if (!mdp || mdp.length < 8) return 'Mot de passe : minimum 8 caractères.';
  if (!/[A-Z]/.test(mdp)) return 'Mot de passe : au moins 1 lettre majuscule requise.';
  if (!/[a-z]/.test(mdp)) return 'Mot de passe : au moins 1 lettre minuscule requise.';
  if (!/[0-9]/.test(mdp)) return 'Mot de passe : au moins 1 chiffre requis.';
  if (!/[!@#$%^&*()\-_=+[\]{};:'",.<>/?\\|`~]/.test(mdp))
    return 'Mot de passe : au moins 1 caractère spécial requis (ex: @, #, !).';
  return null;
};

const validerNomChamp = (valeur, label) => {
  if (!valeur || !valeur.trim()) return `${label} est obligatoire.`;
  if (!/^[A-Za-zÀ-ÖØ-öø-ÿ\s\-]+$/.test(valeur.trim()))
    return `${label} : lettres, espaces et tirets uniquement.`;
  return null;
};

// ── Helper audit ─────────────────────────────────────────
const logAction = async (idUser, action, tableCible = null, ip = null) => {
  try {
    await db.query(
      'INSERT INTO audit_log (id_user, action, table_cible, ip_address) VALUES ($1, $2, $3, $4)',
      [idUser, action, tableCible, ip]
    );
  } catch (err) {
    console.error('Erreur audit:', err.message);
  }
};

const tryQuery = async (sql, params = []) => {
  try {
    await db.query(sql, params);
  } catch (err) {
    console.warn('Nettoyage suppression utilisateur ignore:', err.message);
  }
};

// ── GET /api/users - Liste tous les utilisateurs ─────────
const getUtilisateurs = async (req, res) => {
  try {
    const rows = await db.query(
      'SELECT id, nom, prenom, email, role, est_actif, date_creation FROM utilisateurs ORDER BY date_creation DESC'
    );
    res.json(rows.rows);
  } catch (err) {
    console.error('Erreur getUtilisateurs:', err);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
};

// ── GET /api/users/:id ───────────────────────────────────
const getUtilisateurById = async (req, res) => {
  try {
    const rows = await db.query(
      'SELECT id, nom, prenom, email, role, est_actif, date_creation FROM utilisateurs WHERE id = $1',
      [req.params.id]
    );
    if (rows.rows.length === 0) {
      return res.status(404).json({ message: 'Utilisateur non trouve.' });
    }
    res.json(rows.rows[0]);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur.' });
  }
};

// ── GET /api/users/techniciens - Liste des techniciens actifs ─────────
const getTechniciens = async (req, res) => {
  try {
    const rows = await db.query(
      `SELECT id, nom, prenom, email
       FROM utilisateurs
       WHERE role = $1 AND est_actif = true
       ORDER BY prenom, nom`,
      ['Technicien']
    );
    res.json(rows.rows);
  } catch (err) {
    console.error('Erreur getTechniciens:', err);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
};

// ── POST /api/users - Creer un utilisateur ───────────────
const creerUtilisateur = async (req, res) => {
  const { nom, prenom, email, mot_de_passe, role } = req.body;

  const errNom    = validerNomChamp(nom,    'Le nom');
  const errPrenom = validerNomChamp(prenom, 'Le prénom');
  const errMdp    = validerMotDePasse(mot_de_passe);

  if (!email || !mot_de_passe || !role) {
    return res.status(400).json({ message: 'Tous les champs sont requis.' });
  }
  if (errNom)    return res.status(400).json({ message: errNom });
  if (errPrenom) return res.status(400).json({ message: errPrenom });
  if (errMdp)    return res.status(400).json({ message: errMdp });

  if (!ROLES_VALIDES.includes(role)) {
    return res.status(400).json({ message: `Role invalide. Valeurs: ${ROLES_VALIDES.join(', ')}` });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) {
    return res.status(400).json({ message: "Format d'email invalide." });
  }

  try {
    // Verifier email unique
    const existe = await db.query(
      'SELECT id FROM utilisateurs WHERE email = $1', [email.toLowerCase()]
    );
    if (existe.rows.length > 0) {
      return res.status(409).json({ message: 'Cet email est deja utilise.' });
    }

    const hash = await bcrypt.hash(mot_de_passe, 12);

    const result = await db.query(
      'INSERT INTO utilisateurs (prenom, nom, email, mot_de_passe, role, date_creation) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP) RETURNING id',
      [prenom.trim(), nom.trim(), email.toLowerCase().trim(), hash, role]
    );

    await logAction(req.user.id, 'CREATE_USER', 'utilisateurs', req.ip);

    // Envoyer email avec le mot de passe au nouvel utilisateur
    try {
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
        tls: { rejectUnauthorized: false }
      });

      await transporter.sendMail({
        from:    process.env.EMAIL_USER,
        to:      email.toLowerCase().trim(),
        subject: 'ELEONETECH - Creation de votre compte',
        html:    `<p>Bonjour ${prenom.trim()} ${nom.trim()},</p>
                  <p>Votre compte ELEONETECH a ete cree avec succes.</p>
                  <p>Voici vos identifiants de connexion :</p>
                  <ul>
                    <li><strong>Email :</strong> ${email.toLowerCase().trim()}</li>
                    <li><strong>Mot de passe :</strong> ${mot_de_passe}</li>
                  </ul>
                  <p>Nous vous conseillons de le conserver en toute securite.</p>
                  <br>
                  <p>Cordialement,<br>L'equipe ELEONETECH</p>`
      });
    } catch (emailErr) {
      console.error("Erreur lors de l'envoi de l'email de creation:", emailErr);
    }

    res.status(201).json({
      message: 'Utilisateur cree avec succes.',
      user: {
        id:       result.rows[0].id,
        nom:      nom.trim(),
        prenom:   prenom.trim(),
        email:    email.toLowerCase().trim(),
        role,
        est_actif: true,
      }
    });

  } catch (err) {
    console.error('Erreur creer utilisateur:', err);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
};

// ── PUT /api/users/:id - Modifier un utilisateur ─────────
const modifierUtilisateur = async (req, res) => {
  const { nom, prenom, email, role, est_actif, mot_de_passe } = req.body;
  const { id } = req.params;

  try {
    const existe = await db.query('SELECT id FROM utilisateurs WHERE id = $1', [id]);
    if (existe.rows.length === 0) {
      return res.status(404).json({ message: 'Utilisateur non trouve.' });
    }

    if (role && !ROLES_VALIDES.includes(role)) {
      return res.status(400).json({ message: 'Role invalide.' });
    }

    // Construire la requete dynamiquement
    const champs  = [];
    const valeurs = [];
    let paramIndex = 1;

    if (nom)       { champs.push(`nom = $${paramIndex++}`);       valeurs.push(nom.trim()); }
    if (prenom)    { champs.push(`prenom = $${paramIndex++}`);     valeurs.push(prenom.trim()); }
    if (email)     { champs.push(`email = $${paramIndex++}`);      valeurs.push(email.toLowerCase().trim()); }
    if (role)      { champs.push(`role = $${paramIndex++}`);       valeurs.push(role); }
    if (est_actif !== undefined) {
      champs.push(`est_actif = $${paramIndex++}`);
      valeurs.push(est_actif);
    }
    if (mot_de_passe) {
      const errMdp = validerMotDePasse(mot_de_passe);
      if (errMdp) return res.status(400).json({ message: errMdp });
      const hash = await bcrypt.hash(mot_de_passe, 12);
      champs.push(`mot_de_passe = $${paramIndex++}`);
      valeurs.push(hash);
    }

    if (champs.length === 0) {
      return res.status(400).json({ message: 'Aucun champ a modifier.' });
    }

    valeurs.push(id);
    await db.query(`UPDATE utilisateurs SET ${champs.join(', ')} WHERE id = $${paramIndex}`, valeurs);

    const updated = await db.query(
      'SELECT id, nom, prenom, email, role, est_actif FROM utilisateurs WHERE id = $1', [id]
    );

    await logAction(req.user.id, 'UPDATE_USER', 'utilisateurs', req.ip);
    res.json({ message: 'Utilisateur modifie.', user: updated.rows[0] });

  } catch (err) {
    console.error('Erreur modifier utilisateur:', err);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
};

// ── PATCH /api/users/:id/desactiver ──────────────────────
const desactiverUtilisateur = async (req, res) => {
  try {
    if (req.params.id == req.user.id) {
      return res.status(400).json({ message: 'Vous ne pouvez pas desactiver votre propre compte.' });
    }

    await db.query('UPDATE utilisateurs SET est_actif = false WHERE id = $1', [req.params.id]);
    await logAction(req.user.id, 'DEACTIVATE_USER', 'utilisateurs', req.ip);
    res.json({ message: 'Utilisateur desactive.' });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur.' });
  }
};

// ── GET /api/users/audit - Journal d'audit ───────────────
const getAuditLog = async (req, res) => {
  try {
    const rows = await db.query(
      `SELECT al.*, u.nom, u.prenom, u.email AS user_email
       FROM audit_log al
       LEFT JOIN utilisateurs u ON u.id = al.id_user
       ORDER BY al.timestamp DESC
       LIMIT 100`
    );
    res.json(rows.rows);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur.' });
  }
};

// ── POST /api/users/:id/forcer-deconnexion ───────────────
const forcerDeconnexion = async (req, res) => {
  try {
    await db.query(
      'UPDATE utilisateurs SET verrouille_jusqu = NOW() + INTERVAL \'5 minutes\' WHERE id = $1',
      [req.params.id]
    );
    await logAction(req.user.id, 'FORCE_LOGOUT', 'utilisateurs', req.ip);
    res.json({ message: 'Utilisateur deconnecte de force.' });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur.' });
  }
};

// ── DELETE /api/users/:id ────────────────────────────────
const supprimerUtilisateur = async (req, res) => {
  try {
    if (req.params.id == req.user.id) {
      return res.status(400).json({ message: 'Vous ne pouvez pas supprimer votre propre compte.' });
    }

    // On supprime d'abord les donnees liees. Certaines tables peuvent ne pas
    // exister selon l'installation locale, donc le nettoyage reste tolerant.
    await tryQuery('DELETE FROM token_blacklist WHERE id_user = $1', [req.params.id]);
    await tryQuery('DELETE FROM tokens_reinitialisation WHERE id_user = $1', [req.params.id]);
    // Conserver les logs d'audit : on anonymise la référence plutôt que de supprimer
    await tryQuery('UPDATE audit_log SET id_user = NULL WHERE id_user = $1', [req.params.id]);
    
    const result = await db.query('DELETE FROM utilisateurs WHERE id = $1 RETURNING id', [req.params.id]);
    
    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Utilisateur non trouve.' });
    }

    await logAction(req.user.id, 'DELETE_USER', 'utilisateurs', req.ip);
    res.json({ message: 'Utilisateur supprime avec succes.' });
  } catch (err) {
    if (err.code === '23503') {
      return res.status(400).json({ message: "Impossible de supprimer cet utilisateur car il est reference par d'autres donnees. Vous pouvez le desactiver." });
    }
    console.error('Erreur supprimer utilisateur:', err);
    res.status(500).json({ message: `Erreur serveur: ${err.message}` });
  }
};

module.exports = {
  getUtilisateurs,
  getTechniciens,
  getUtilisateurById,
  creerUtilisateur,
  modifierUtilisateur,
  desactiverUtilisateur,
  supprimerUtilisateur,
  getAuditLog,
  forcerDeconnexion,
};

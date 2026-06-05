// ============================================================
// MIDDLEWARE AUTHENTIFICATION
// Verifie le token JWT avant chaque route protegee
// ============================================================
const jwt = require('jsonwebtoken');
const db  = require('../config/db');

// Ensure JWT_SECRET is set
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'eleonetech_jwt_secret_key_2026';
}

// ── Verifier le token JWT ─────────────────────────────────
const verifierToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  // Verifier que le header Authorization existe
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Token manquant. Veuillez vous connecter.' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Verifier que l'utilisateur existe et est actif
    const rows = await db.query(
      'SELECT id, prenom, nom, email, role, est_actif FROM utilisateurs WHERE id = $1',
      [decoded.id]
    );

    if (rows.rows.length === 0 || !rows.rows[0].est_actif) {
      return res.status(401).json({ message: 'Utilisateur introuvable ou desactive.' });
    }

    req.user  = rows.rows[0];
    req.token = token;
    next();

  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token expire. Reconnectez-vous.' });
    }
    return res.status(401).json({ message: 'Token invalide.' });
  }
};

// ── Verifier le role (RBAC) ───────────────────────────────
// Usage: autoriser('Administrateur') ou autoriser('Administrateur','Responsable')
const autoriser = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        message: `Acces refuse. Role requis : ${roles.join(' ou ')}`
      });
    }
    next();
  };
};

module.exports = { verifierToken, autoriser };

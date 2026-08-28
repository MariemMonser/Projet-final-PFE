const jwt = require('jsonwebtoken');
const db  = require('../config/db');

const verifierToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Token manquant. Veuillez vous connecter.' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (!decoded.id) {
      return res.status(401).json({ message: 'Token invalide.' });
    }

    // Vérifier si le token a été révoqué (déconnexion)
    const blacklisted = await db.query(
      'SELECT id FROM token_blacklist WHERE token_jti = $1',
      [token]
    );
    if (blacklisted.rows.length > 0) {
      return res.status(401).json({ message: 'Token invalide. Reconnectez-vous.' });
    }

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

// Purge les tokens expirés de la blacklist pour éviter la croissance infinie de la table.
const purgerBlacklist = async () => {
  try {
    const r = await db.query('DELETE FROM token_blacklist WHERE expire_at < NOW()');
    if (r.rowCount > 0) console.log(`🧹 token_blacklist: ${r.rowCount} token(s) expirés supprimés.`);
  } catch (err) {
    console.warn('Purge blacklist échouée:', err.message);
  }
};

module.exports = { verifierToken, autoriser, purgerBlacklist };

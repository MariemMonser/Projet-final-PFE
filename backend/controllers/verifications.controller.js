// ============================================================
// VERIFICATIONS QUOTIDIENNES CONTROLLER
// ============================================================
const db = require('../config/db');

const today = () => new Date().toISOString().split('T')[0];

// GET — vérifications du jour pour le technicien connecté
const getAujourdhui = async (req, res) => {
  const technicien = `${req.user.prenom} ${req.user.nom}`;
  try {
    const result = await db.query(
      `SELECT * FROM verifications_quotidiennes
       WHERE technicien = $1 AND date_verification = $2
       ORDER BY equipement_nom ASC`,
      [technicien, today()]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Erreur getAujourdhui:', err);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
};

// POST — sauvegarder (insert ou update) une vérification
const sauvegarder = async (req, res) => {
  const technicien = `${req.user.prenom} ${req.user.nom}`;
  const { equipement_id, equipement_nom, statut, observation } = req.body;

  if (!equipement_id || !equipement_nom || !statut) {
    return res.status(400).json({ message: 'equipement_id, equipement_nom et statut sont requis.' });
  }
  if (!['ok', 'probleme', 'hors_service'].includes(statut)) {
    return res.status(400).json({ message: 'Statut invalide.' });
  }

  try {
    const result = await db.query(
      `INSERT INTO verifications_quotidiennes
         (equipement_id, equipement_nom, technicien, date_verification, statut, observation)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (equipement_id, technicien, date_verification)
       DO UPDATE SET statut = $5, observation = $6, created_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [equipement_id, equipement_nom, technicien, today(), statut, observation || null]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Erreur sauvegarder:', err);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
};

// GET — toutes les vérifications (responsable / admin)
const getAll = async (req, res) => {
  const { date } = req.query;
  try {
    const result = await db.query(
      `SELECT * FROM verifications_quotidiennes
       WHERE ($1::date IS NULL OR date_verification = $1::date)
       ORDER BY date_verification DESC, technicien ASC, equipement_nom ASC`,
      [date || null]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Erreur getAll:', err);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
};

module.exports = { getAujourdhui, sauvegarder, getAll };

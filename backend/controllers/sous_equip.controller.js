// ============================================================
// SOUS_EQUIP CONTROLLER — table sous_equip existante
// ============================================================
const db = require('../config/db');

const logAction = async (idUser, action, ip = null) => {
  try {
    await db.query(
      'INSERT INTO audit_log (id_user, action, table_cible, ip_address) VALUES ($1, $2, $3, $4)',
      [idUser, action, 'sous_equip', ip]
    );
  } catch (err) {
    console.error('Erreur audit_log:', err.message);
  }
};

// GET /api/sous-equip/by-equipement/:equipementId
const getByEquipement = async (req, res) => {
  const { equipementId } = req.params;
  try {
    const result = await db.query(
      `SELECT id, equipement_id, nom, statut, created_at
       FROM sous_equip
       WHERE equipement_id = $1
       ORDER BY nom ASC`,
      [equipementId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Erreur getByEquipement sous_equip:', err);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
};

// POST /api/sous-equip
const creer = async (req, res) => {
  const { nom, equipement_id, statut = 'actif' } = req.body;
  const ip = req.ip;

  if (!nom || nom.trim() === '') {
    return res.status(400).json({ message: 'Le nom du sous-équipement est requis.' });
  }
  if (!equipement_id) {
    return res.status(400).json({ message: "L'équipement parent est requis." });
  }

  const statutsValides = ['actif', 'en_panne', 'en_maintenance', 'hors_service'];
  if (!statutsValides.includes(statut)) {
    return res.status(400).json({ message: 'Statut invalide.' });
  }

  try {
    const parentExists = await db.query('SELECT id FROM equipements WHERE id = $1', [equipement_id]);
    if (parentExists.rows.length === 0) {
      return res.status(404).json({ message: 'Équipement parent non trouvé.' });
    }

    const result = await db.query(
      'INSERT INTO sous_equip (nom, equipement_id, statut) VALUES ($1, $2, $3) RETURNING *',
      [nom.trim(), equipement_id, statut]
    );

    await logAction(req.user.id, 'CREATE_SOUS_EQUIP', ip);

    res.status(201).json({
      message: 'Sous-équipement créé avec succès.',
      sous_equip: result.rows[0],
    });
  } catch (err) {
    console.error('Erreur creer sous_equip:', err);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
};

// PUT /api/sous-equip/:id
const modifier = async (req, res) => {
  const { id } = req.params;
  const { nom, statut } = req.body;
  const ip = req.ip;

  if (!nom || nom.trim() === '') {
    return res.status(400).json({ message: 'Le nom du sous-équipement est requis.' });
  }

  const statutsValides = ['actif', 'en_panne', 'en_maintenance', 'hors_service'];
  if (statut && !statutsValides.includes(statut)) {
    return res.status(400).json({ message: 'Statut invalide.' });
  }

  try {
    const existing = await db.query('SELECT id FROM sous_equip WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ message: 'Sous-équipement non trouvé.' });
    }

    const result = await db.query(
      'UPDATE sous_equip SET nom = $1, statut = $2 WHERE id = $3 RETURNING *',
      [nom.trim(), statut || 'actif', id]
    );

    await logAction(req.user.id, 'UPDATE_SOUS_EQUIP', ip);

    res.json({
      message: 'Sous-équipement mis à jour avec succès.',
      sous_equip: result.rows[0],
    });
  } catch (err) {
    console.error('Erreur modifier sous_equip:', err);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
};

// DELETE /api/sous-equip/:id
const supprimer = async (req, res) => {
  const { id } = req.params;
  const ip = req.ip;

  try {
    const existing = await db.query('SELECT id FROM sous_equip WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ message: 'Sous-équipement non trouvé.' });
    }

    await db.query('DELETE FROM sous_equip WHERE id = $1', [id]);

    await logAction(req.user.id, 'DELETE_SOUS_EQUIP', ip);

    res.json({ message: 'Sous-équipement supprimé avec succès.' });
  } catch (err) {
    console.error('Erreur supprimer sous_equip:', err);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
};

module.exports = { getByEquipement, creer, modifier, supprimer };

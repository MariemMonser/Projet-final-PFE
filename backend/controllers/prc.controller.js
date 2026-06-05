// ============================================================
// PRC CONTROLLER - Gestion des pièces de rechange
// ============================================================
const db = require('../config/db');

// ── GET /api/prc ─────────────────────────────────────────
const getAll = async (req, res) => {
  try {
    const result = await db.query(`
      SELECT p.id, p.code_prc, p.designation, p.cout, p.stock,
             p.equipement_id, e.nom AS equipement_nom
      FROM prc p
      LEFT JOIN equipements e ON e.id = p.equipement_id
      ORDER BY e.nom ASC, p.code_prc ASC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('Erreur getAll prc:', err);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
};

// ── POST /api/prc ─────────────────────────────────────────
const creer = async (req, res) => {
  const { code_prc, designation, cout, stock, equipement_id } = req.body;

  if (!code_prc || !designation) {
    return res.status(400).json({ message: 'Code PRC et désignation sont requis.' });
  }

  try {
    const existing = await db.query('SELECT id FROM prc WHERE code_prc = $1', [code_prc.trim()]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ message: 'Ce code PRC existe déjà.' });
    }

    const result = await db.query(
      `INSERT INTO prc (code_prc, designation, cout, stock, equipement_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [code_prc.trim(), designation.trim(), parseFloat(cout || 0), parseInt(stock || 0), equipement_id || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Erreur creer prc:', err);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
};

// ── PUT /api/prc/:id ──────────────────────────────────────
const modifier = async (req, res) => {
  const { id } = req.params;
  const { code_prc, designation, cout, stock, equipement_id } = req.body;

  if (!code_prc || !designation) {
    return res.status(400).json({ message: 'Code PRC et désignation sont requis.' });
  }

  try {
    const existing = await db.query('SELECT id FROM prc WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ message: 'Pièce non trouvée.' });
    }

    const duplicate = await db.query(
      'SELECT id FROM prc WHERE code_prc = $1 AND id != $2', [code_prc.trim(), id]
    );
    if (duplicate.rows.length > 0) {
      return res.status(409).json({ message: 'Ce code PRC est déjà utilisé par une autre pièce.' });
    }

    const result = await db.query(
      `UPDATE prc SET code_prc=$1, designation=$2, cout=$3, stock=$4, equipement_id=$5
       WHERE id=$6 RETURNING *`,
      [code_prc.trim(), designation.trim(), parseFloat(cout || 0), parseInt(stock || 0), equipement_id || null, id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Erreur modifier prc:', err);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
};

// ── PATCH /api/prc/:id/stock ──────────────────────────────
const modifierStock = async (req, res) => {
  const { id } = req.params;
  const { mouvement, quantite } = req.body; // mouvement: 'entree' | 'sortie'

  if (!mouvement || !quantite || isNaN(quantite)) {
    return res.status(400).json({ message: 'Mouvement et quantité sont requis.' });
  }

  try {
    const prc = await db.query('SELECT id, stock FROM prc WHERE id = $1', [id]);
    if (prc.rows.length === 0) return res.status(404).json({ message: 'Pièce non trouvée.' });

    const qty = parseInt(quantite);
    const newStock = mouvement === 'entree'
      ? prc.rows[0].stock + qty
      : prc.rows[0].stock - qty;

    if (newStock < 0) {
      return res.status(400).json({ message: `Stock insuffisant. Stock actuel: ${prc.rows[0].stock}` });
    }

    const result = await db.query(
      'UPDATE prc SET stock = $1 WHERE id = $2 RETURNING *',
      [newStock, id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Erreur modifierStock prc:', err);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
};

// ── DELETE /api/prc/:id ───────────────────────────────────
const supprimer = async (req, res) => {
  const { id } = req.params;
  try {
    const existing = await db.query('SELECT id FROM prc WHERE id = $1', [id]);
    if (existing.rows.length === 0) return res.status(404).json({ message: 'Pièce non trouvée.' });

    await db.query('DELETE FROM prc WHERE id = $1', [id]);
    res.json({ message: 'Pièce supprimée avec succès.' });
  } catch (err) {
    console.error('Erreur supprimer prc:', err);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
};

module.exports = { getAll, creer, modifier, modifierStock, supprimer };

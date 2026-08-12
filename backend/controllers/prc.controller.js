

const db = require('../config/db');

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

const modifierStock = async (req, res) => {
  const { id } = req.params;
  const { mouvement, quantite, technicien, motif, intervention_staging_id, equipement } = req.body;

  if (!mouvement || !quantite || isNaN(quantite)) {
    return res.status(400).json({ message: 'Mouvement et quantité sont requis.' });
  }

  try {
    const prcRow = await db.query('SELECT id, stock, code_prc, designation FROM prc WHERE id = $1', [id]);
    if (prcRow.rows.length === 0) return res.status(404).json({ message: 'Pièce non trouvée.' });

    const qty       = parseInt(quantite);
    const stockAvant = prcRow.rows[0].stock;
    const newStock  = mouvement === 'entree' ? stockAvant + qty : stockAvant - qty;

    if (newStock < 0) {
      return res.status(400).json({ message: `Stock insuffisant. Stock actuel: ${stockAvant}` });
    }

    const result = await db.query(
      'UPDATE prc SET stock = $1 WHERE id = $2 RETURNING *',
      [newStock, id]
    );

    await db.query(
      `INSERT INTO mouvements_prc
         (prc_id, type_mouvement, quantite, stock_avant, stock_apres, intervention_staging_id, technicien, motif)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [id, mouvement, qty, stockAvant, newStock, intervention_staging_id || null, technicien || null, motif || null]
    );

    if (mouvement === 'sortie' && technicien) {
      await db.query(
        `INSERT INTO prc_notifications
           (prc_id, code_prc, designation, quantite, stock_apres, technicien, equipement, intervention_staging_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [id, prcRow.rows[0].code_prc, prcRow.rows[0].designation, qty, newStock, technicien, equipement || null, intervention_staging_id || null]
      );
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Erreur modifierStock prc:', err);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
};

const getMouvements = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await db.query(
      `SELECT * FROM mouvements_prc WHERE prc_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Erreur getMouvements prc:', err);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
};

const getNotificationsPrc = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT * FROM prc_notifications ORDER BY created_at DESC LIMIT 100`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Erreur getNotificationsPrc:', err);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
};

const marquerLuePrc = async (req, res) => {
  const { id } = req.params;
  try {
    await db.query('UPDATE prc_notifications SET lu = TRUE WHERE id = $1', [id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur.' });
  }
};

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

module.exports = { getAll, creer, modifier, modifierStock, supprimer, getMouvements, getNotificationsPrc, marquerLuePrc };

// ============================================================
// ROUTES EQUIPEMENTS
// ============================================================
const express = require('express');
const router  = express.Router();
const { verifierToken, autoriser } = require('../middleware/auth.middleware');
const {
  getAll,
  getById,
  genererQrIntervention,
  creer,
  modifier,
  supprimer
} = require('../controllers/equipement.controller');

// ── Routes publiques (lecture seule) ─────────────────────
// GET /api/equipements              - Lister tous les équipements
router.get('/', verifierToken, getAll);

// GET /api/equipements/:id          - Détails d'un équipement
router.get('/:id/intervention-qr', verifierToken, autoriser('Administrateur', 'Responsable'), genererQrIntervention);
router.get('/:id', verifierToken, getById);

// ── Routes protégées (écriture) ───────────────────────────
// POST /api/equipements             - Créer un équipement (Admin + Responsable)
router.post('/', verifierToken, autoriser('Administrateur', 'Responsable'), creer);

// PUT /api/equipements/:id          - Modifier un équipement (Admin + Responsable)
router.put('/:id', verifierToken, autoriser('Administrateur', 'Responsable'), modifier);

// DELETE /api/equipements/:id       - Supprimer un équipement (Admin + Responsable)
router.delete('/:id', verifierToken, autoriser('Administrateur', 'Responsable'), supprimer);

module.exports = router;

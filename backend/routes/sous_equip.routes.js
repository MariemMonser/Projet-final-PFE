// ============================================================
// ROUTES SOUS_EQUIP
// ============================================================
const express = require('express');
const router  = express.Router();
const { verifierToken, autoriser } = require('../middleware/auth.middleware');
const { getByEquipement, creer, modifier, supprimer } = require('../controllers/sous_equip.controller');

// GET  /api/sous-equip/by-equipement/:equipementId  (tous les rôles connectés)
router.get('/by-equipement/:equipementId', verifierToken, getByEquipement);

// POST /api/sous-equip  (Admin + Responsable)
router.post('/', verifierToken, autoriser('Administrateur', 'Responsable'), creer);

// PUT  /api/sous-equip/:id  (Admin + Responsable)
router.put('/:id', verifierToken, autoriser('Administrateur', 'Responsable'), modifier);

// DELETE /api/sous-equip/:id  (Admin + Responsable)
router.delete('/:id', verifierToken, autoriser('Administrateur', 'Responsable'), supprimer);

module.exports = router;

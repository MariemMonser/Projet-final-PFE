

const express = require('express');
const router  = express.Router();
const { verifierToken, autoriser } = require('../middleware/auth.middleware');
const { getAll, creer, modifier, modifierStock, supprimer, getMouvements } = require('../controllers/prc.controller');

router.use(verifierToken);

router.get('/',            autoriser('Administrateur', 'Responsable', 'Technicien'), getAll);
router.post('/',           autoriser('Administrateur', 'Responsable'), creer);
router.put('/:id',         autoriser('Administrateur', 'Responsable'), modifier);
router.patch('/:id/stock', autoriser('Administrateur', 'Responsable', 'Technicien'), modifierStock);
router.delete('/:id',      autoriser('Administrateur', 'Responsable'), supprimer);
router.get('/:id/mouvements', autoriser('Administrateur', 'Responsable'), getMouvements);

module.exports = router;

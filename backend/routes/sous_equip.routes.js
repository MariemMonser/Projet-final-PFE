

const express = require('express');
const router  = express.Router();
const { verifierToken, autoriser } = require('../middleware/auth.middleware');
const { getByEquipement, getAll, creer, modifier, supprimer } = require('../controllers/sous_equip.controller');

router.get('/',                            verifierToken, getAll);
router.get('/by-equipement/:equipementId', verifierToken, getByEquipement);

router.post('/', verifierToken, autoriser('Administrateur', 'Responsable'), creer);

router.put('/:id', verifierToken, autoriser('Administrateur', 'Responsable'), modifier);

router.delete('/:id', verifierToken, autoriser('Administrateur', 'Responsable'), supprimer);

module.exports = router;

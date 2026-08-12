

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

router.get('/', verifierToken, getAll);

router.get('/:id/intervention-qr', verifierToken, autoriser('Administrateur', 'Responsable'), genererQrIntervention);
router.get('/:id', verifierToken, getById);

router.post('/', verifierToken, autoriser('Administrateur', 'Responsable'), creer);

router.put('/:id', verifierToken, autoriser('Administrateur', 'Responsable'), modifier);

router.delete('/:id', verifierToken, autoriser('Administrateur', 'Responsable'), supprimer);

module.exports = router;

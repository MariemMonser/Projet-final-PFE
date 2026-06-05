const express = require('express');
const router  = express.Router();
const { verifierToken, autoriser } = require('../middleware/auth.middleware');
const { getAujourdhui, sauvegarder, getAll } = require('../controllers/verifications.controller');

router.get('/aujourd-hui', verifierToken, getAujourdhui);
router.post('/',           verifierToken, sauvegarder);
router.get('/',            verifierToken, autoriser('Administrateur', 'Responsable'), getAll);

module.exports = router;

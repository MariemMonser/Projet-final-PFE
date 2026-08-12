const express = require('express');
const router  = express.Router();
const { verifierToken, autoriser } = require('../middleware/auth.middleware');
const { getAujourdhui, sauvegarder, getAll, getAujourdhuiSousEquip, sauvegarderSousEquip } = require('../controllers/verifications.controller');

router.get('/aujourd-hui',             verifierToken, getAujourdhui);
router.get('/sous-equip/aujourd-hui',  verifierToken, getAujourdhuiSousEquip);
router.post('/',                       verifierToken, sauvegarder);
router.post('/sous-equip',             verifierToken, sauvegarderSousEquip);
router.get('/',                        verifierToken, autoriser('Administrateur', 'Responsable'), getAll);

module.exports = router;

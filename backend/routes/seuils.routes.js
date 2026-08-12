

const express = require('express');
const router = express.Router();
const { verifierToken } = require('../middleware/auth.middleware');
const {
  getSeuils,
  updateSeuils,
  checkAlertes,
  sendAlertEmail,
  getAlertHistory,
  getAlertesMtbf,
  getAlertesPdr,
} = require('../controllers/seuils.controller');

router.get('/', verifierToken, getSeuils);
router.put('/', verifierToken, updateSeuils);
router.get('/alertes', verifierToken, checkAlertes);
router.get('/history', verifierToken, getAlertHistory);
router.post('/alert-email', verifierToken, sendAlertEmail);
router.get('/alertes-mtbf',  verifierToken, getAlertesMtbf);
router.get('/alertes-pdr',   verifierToken, getAlertesPdr);

module.exports = router;

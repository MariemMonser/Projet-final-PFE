const express = require('express');
const router  = express.Router();
const { verifierToken } = require('../middleware/auth.middleware');
const { getKpiResponsable, getKpiTechnicien, getMesTachesPreventives } = require('../controllers/kpi.controller');

router.get('/responsable',             verifierToken, getKpiResponsable);
router.get('/technicien',              verifierToken, getKpiTechnicien);
router.get('/mes-taches-preventives',  verifierToken, getMesTachesPreventives);

module.exports = router;

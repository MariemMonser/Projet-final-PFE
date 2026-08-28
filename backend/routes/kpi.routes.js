const express = require('express');
const router  = express.Router();
const { verifierToken } = require('../middleware/auth.middleware');
const { autoriser } = require('../middleware/auth.middleware');
const { getKpiResponsable, getKpiTechnicien, getMesTachesPreventives, triggerDwSync, getDwSyncStatus } = require('../controllers/kpi.controller');

router.get('/responsable',             verifierToken, getKpiResponsable);
router.get('/technicien',              verifierToken, getKpiTechnicien);
router.get('/mes-taches-preventives',  verifierToken, getMesTachesPreventives);

router.post('/sync-dw',    verifierToken, autoriser('Administrateur', 'Responsable'), triggerDwSync);
router.get('/sync-status', verifierToken, getDwSyncStatus);


module.exports = router;

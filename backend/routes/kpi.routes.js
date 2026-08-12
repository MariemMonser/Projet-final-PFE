const express = require('express');
const router  = express.Router();
const { verifierToken } = require('../middleware/auth.middleware');
const { autoriser } = require('../middleware/auth.middleware');
const { getKpiResponsable, getKpiTechnicien, getMesTachesPreventives, triggerDwSync, getDwSyncStatus } = require('../controllers/kpi.controller');

router.get('/responsable',             verifierToken, getKpiResponsable);
router.get('/technicien',              verifierToken, getKpiTechnicien);
router.get('/mes-taches-preventives',  verifierToken, getMesTachesPreventives);

// DW sync — trigger (admin or responsable) and status (any authenticated)
router.post('/sync-dw',    verifierToken, autoriser('Administrateur', 'Responsable'), triggerDwSync);
router.get('/sync-status', verifierToken, getDwSyncStatus);

// Prévisions ML — lecture des fichiers générés par le pipeline ETL

module.exports = router;

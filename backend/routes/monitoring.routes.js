const express = require('express');
const router = express.Router();
const { verifierToken } = require('../middleware/auth.middleware');
const {
  getWaterConsumption,
  getWaterConsumptionStats,
  addWaterConsumption,
  updateWaterConsumption,
  deleteWaterConsumption,
  recalculerEau,
  recalculerElec,
  getElectricityConsumption,
  getElectricityConsumptionStats,
  addElectricityConsumption,
  updateElectricityConsumption,
  deleteElectricityConsumption,
  getPhotovoltaicProduction,
  getPhotovoltaicProductionStats,
  addPhotovoltaicProduction,
  updatePhotovoltaicProduction,
  deletePhotovoltaicProduction,
  getInterventions,
  getInterventionsStats,
  addIntervention,
  updateIntervention,
  deleteIntervention,
  getEnergieQr,
  getInterventionFormQr,
  verifierTechnicienPublic,
  addInterventionStaging,
  getInterventionsStaging,
  validerInterventionStaging,
  rejeterInterventionStaging,
  supprimerInterventionStaging,
  getMesOuvertesStaging,
  cloturerInterventionStaging,
  getPersonnelPublic,
  getInterventionsPlanifieesParEquipement,
} = require('../controllers/monitoring.controller');

router.get('/eau', verifierToken, getWaterConsumption);
router.get('/eau/stats', verifierToken, getWaterConsumptionStats);
router.post('/eau/recalculer', verifierToken, recalculerEau);
router.post('/eau', verifierToken, addWaterConsumption);
router.put('/eau/:id', verifierToken, updateWaterConsumption);
router.delete('/eau/:id', verifierToken, deleteWaterConsumption);

router.post('/electricite/recalculer', verifierToken, recalculerElec);
router.get('/electricite', verifierToken, getElectricityConsumption);
router.get('/electricite/stats', verifierToken, getElectricityConsumptionStats);
router.post('/electricite', verifierToken, addElectricityConsumption);
router.put('/electricite/:id', verifierToken, updateElectricityConsumption);
router.delete('/electricite/:id', verifierToken, deleteElectricityConsumption);

router.get('/photovoltaique', verifierToken, getPhotovoltaicProduction);
router.get('/photovoltaique/stats', verifierToken, getPhotovoltaicProductionStats);
router.post('/photovoltaique', verifierToken, addPhotovoltaicProduction);
router.put('/photovoltaique/:id', verifierToken, updatePhotovoltaicProduction);
router.delete('/photovoltaique/:id', verifierToken, deletePhotovoltaicProduction);

router.get('/energie-qr', verifierToken, getEnergieQr);

router.post('/eau/scan',         addWaterConsumption);
router.post('/electricite/scan', addElectricityConsumption);

router.get('/personnel/public', getPersonnelPublic);
router.get('/interventions/form-qr', getInterventionFormQr);

router.post('/interventions/verifier-tech', verifierTechnicienPublic);
router.post('/interventions/staging', addInterventionStaging);
router.get('/interventions/staging', verifierToken, getInterventionsStaging);
router.get('/interventions/staging/mes-ouvertes', getMesOuvertesStaging);
router.put('/interventions/staging/:id/valider', verifierToken, validerInterventionStaging);
router.put('/interventions/staging/:id/rejeter', verifierToken, rejeterInterventionStaging);
router.put('/interventions/staging/:id/cloturer', cloturerInterventionStaging);
router.delete('/interventions/staging/:id', verifierToken, supprimerInterventionStaging);

router.get('/interventions/planifiees-equip/:equipementId', getInterventionsPlanifieesParEquipement);

router.post('/interventions/mobile', addIntervention);
router.get('/interventions', verifierToken, getInterventions);
router.get('/interventions/stats', verifierToken, getInterventionsStats);
router.post('/interventions', verifierToken, addIntervention);
router.put('/interventions/:id', verifierToken, updateIntervention);
router.delete('/interventions/:id', verifierToken, deleteIntervention);

module.exports = router;

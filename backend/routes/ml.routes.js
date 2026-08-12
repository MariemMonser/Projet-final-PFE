const express = require('express');
const router  = express.Router();
const { verifierToken, autoriser } = require('../middleware/auth.middleware');
const { getPredictions, triggerRetrain, getRetrainStatus } = require('../controllers/ml.controller');

router.get('/predictions',     verifierToken, autoriser('Responsable', 'Administrateur'), getPredictions);
router.post('/retrain',        verifierToken, autoriser('Responsable', 'Administrateur'), triggerRetrain);
router.get('/retrain/status',  verifierToken, autoriser('Responsable', 'Administrateur'), getRetrainStatus);

module.exports = router;

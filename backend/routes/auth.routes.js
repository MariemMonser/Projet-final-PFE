const express = require('express');
const router  = express.Router();
const { verifierToken } = require('../middleware/auth.middleware');
const {
  login,
  logout,
  getProfil,
  resetDemande,
  resetConfirm,
  changePassword,
} = require('../controllers/auth.controller');

router.post('/login', login);

router.post('/logout', verifierToken, logout);

router.get('/profil', verifierToken, getProfil);

router.post('/reset-demande', resetDemande);

router.post('/reset/:token', resetConfirm);

router.post('/change-password', verifierToken, changePassword);

module.exports = router;

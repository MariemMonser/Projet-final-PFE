// ============================================================
// ROUTES AUTHENTIFICATION
// ============================================================
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

// POST /api/auth/login          - Connexion
router.post('/login', login);

// POST /api/auth/logout         - Deconnexion (token requis)
router.post('/logout', verifierToken, logout);

// GET  /api/auth/profil         - Profil utilisateur connecte
router.get('/profil', verifierToken, getProfil);

// POST /api/auth/reset-demande  - Demande reset mot de passe
router.post('/reset-demande', resetDemande);

// POST /api/auth/reset/:token   - Confirmer reset mot de passe
router.post('/reset/:token', resetConfirm);

// POST /api/auth/change-password - Modifier le mot de passe
router.post('/change-password', verifierToken, changePassword);

module.exports = router;

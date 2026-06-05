// ============================================================
// ROUTES UTILISATEURS (Administrateur seulement)
// ============================================================
const express = require('express');
const router  = express.Router();
const { verifierToken, autoriser } = require('../middleware/auth.middleware');
const {
  getUtilisateurs,
  getTechniciens,
  getUtilisateurById,
  creerUtilisateur,
  modifierUtilisateur,
  desactiverUtilisateur,
  supprimerUtilisateur,
  getAuditLog,
  forcerDeconnexion,
} = require('../controllers/users.controller');

// Toutes les routes necessitent un token valide
router.use(verifierToken);

// GET  /api/users              - Liste utilisateurs
router.get('/',          autoriser('Administrateur'), getUtilisateurs);

// GET  /api/users/techniciens  - Liste techniciens actifs pour planification
router.get('/techniciens', autoriser('Administrateur', 'Responsable'), getTechniciens);

// GET  /api/users/audit        - Journal audit
router.get('/audit',     autoriser('Administrateur'), getAuditLog);

// GET  /api/users/:id          - Un utilisateur
router.get('/:id',       autoriser('Administrateur'), getUtilisateurById);

// POST /api/users              - Creer utilisateur
router.post('/',         autoriser('Administrateur'), creerUtilisateur);

// PUT  /api/users/:id          - Modifier utilisateur
router.put('/:id',       autoriser('Administrateur'), modifierUtilisateur);

// PATCH /api/users/:id/desactiver - Desactiver
router.patch('/:id/desactiver',          autoriser('Administrateur'), desactiverUtilisateur);

// DELETE /api/users/:id - Supprimer
router.delete('/:id',                    autoriser('Administrateur'), supprimerUtilisateur);

// POST /api/users/:id/forcer-deconnexion
router.post('/:id/forcer-deconnexion',   autoriser('Administrateur'), forcerDeconnexion);

module.exports = router;

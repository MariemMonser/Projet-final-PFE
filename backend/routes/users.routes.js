

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

router.use(verifierToken);

router.get('/',          autoriser('Administrateur'), getUtilisateurs);

router.get('/techniciens', autoriser('Administrateur', 'Responsable'), getTechniciens);

router.get('/audit',     autoriser('Administrateur'), getAuditLog);

router.get('/:id',       autoriser('Administrateur'), getUtilisateurById);

router.post('/',         autoriser('Administrateur'), creerUtilisateur);

router.put('/:id',       autoriser('Administrateur'), modifierUtilisateur);

router.patch('/:id/desactiver',          autoriser('Administrateur'), desactiverUtilisateur);

router.delete('/:id',                    autoriser('Administrateur'), supprimerUtilisateur);

router.post('/:id/forcer-deconnexion',   autoriser('Administrateur'), forcerDeconnexion);

module.exports = router;

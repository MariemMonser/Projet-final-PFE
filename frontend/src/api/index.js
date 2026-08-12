

import axios from 'axios';

const getBaseURL = () => {
  if (process.env.REACT_APP_API_URL) return process.env.REACT_APP_API_URL;
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') return 'http://localhost:5000/api';
  return `http://${host}:5000/api`;
};

const api = axios.create({ baseURL: getBaseURL() });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export const authAPI = {
  login:        (data)          => api.post('/auth/login', data),
  logout:       ()              => api.post('/auth/logout'),
  resetDemande: (email)         => api.post('/auth/reset-demande', { email }),
  resetConfirm: (token, mdp)    => api.post(`/auth/reset/${token}`, { nouveau_mot_de_passe: mdp }),
  changePassword: (data)        => api.post('/auth/change-password', data),
};

export const usersAPI = {
  getAll:             ()              => api.get('/users'),
  getTechniciens:     ()              => api.get('/users/techniciens'),
  getById:            (id)            => api.get(`/users/${id}`),
  create:             (data)          => api.post('/users', data),
  update:             (id, data)      => api.put(`/users/${id}`, data),
  delete:             (id)            => api.delete(`/users/${id}`),
  desactiver:         (id)            => api.patch(`/users/${id}/desactiver`),
  forcerDeconnexion:  (id)            => api.post(`/users/${id}/forcer-deconnexion`),
  getAudit:           ()              => api.get('/users/audit'),
};

export const equipementsAPI = {
  getAll:       ()              => api.get('/equipements'),
  getById:      (id)            => api.get(`/equipements/${id}`),
  getInterventionQr: (id, baseUrl) => api.get(`/equipements/${id}/intervention-qr`, { params: { baseUrl } }),
  create:       (data)          => api.post('/equipements', data),
  update:       (id, data)      => api.put(`/equipements/${id}`, data),
  delete:       (id)            => api.delete(`/equipements/${id}`),
};

export const sousEquipAPI = {
  getAll:          ()             => api.get('/sous-equip'),
  getByEquipement: (equipementId) => api.get(`/sous-equip/by-equipement/${equipementId}`),
  create:          (data)         => api.post('/sous-equip', data),
  update:          (id, data)     => api.put(`/sous-equip/${id}`, data),
  delete:          (id)           => api.delete(`/sous-equip/${id}`),
};

export const monitoringAPI = {
  
  getWaterConsumption:     (params)         => api.get('/monitoring/eau', { params }),
  getWaterStats:            ()              => api.get('/monitoring/eau/stats'),
  recalculerEau:            ()              => api.post('/monitoring/eau/recalculer'),
  recalculerElec:           ()              => api.post('/monitoring/electricite/recalculer'),
  addWaterConsumption:      (data)          => api.post('/monitoring/eau', data),
  updateWaterConsumption:   (id, data)      => api.put(`/monitoring/eau/${id}`, data),
  deleteWaterConsumption:   (id)            => api.delete(`/monitoring/eau/${id}`),

  
  getElectricityConsumption: (params)       => api.get('/monitoring/electricite', { params }),
  getElectricityStats:      ()              => api.get('/monitoring/electricite/stats'),
  addElectricityConsumption: (data)          => api.post('/monitoring/electricite', data),
  updateElectricityConsumption: (id, data)  => api.put(`/monitoring/electricite/${id}`, data),
  deleteElectricityConsumption: (id)        => api.delete(`/monitoring/electricite/${id}`),
  
  
  getPhotovoltaicProduction: ()             => api.get('/monitoring/photovoltaique'),
  getPhotovoltaicStats:     ()              => api.get('/monitoring/photovoltaique/stats'),
  addPhotovoltaicProduction: (data)         => api.post('/monitoring/photovoltaique', data),
  updatePhotovoltaicProduction: (id, data)   => api.put(`/monitoring/photovoltaique/${id}`, data),
  deletePhotovoltaicProduction: (id)         => api.delete(`/monitoring/photovoltaique/${id}`),
  
  
  getInterventions:             ()           => api.get('/monitoring/interventions'),
  getInterventionsStats:        ()           => api.get('/monitoring/interventions/stats'),
  getInterventionFormQr:        (baseUrl)    => api.get('/monitoring/interventions/form-qr', { params: { baseUrl } }),
  addIntervention:              (data)       => api.post('/monitoring/interventions', data),
  addInterventionMobile:        (data)       => api.post('/monitoring/interventions/mobile', data),
  updateIntervention:           (id, data)   => api.put(`/monitoring/interventions/${id}`, data),
  deleteIntervention:           (id)         => api.delete(`/monitoring/interventions/${id}`),
  
  addInterventionStaging:                    (data)      => api.post('/monitoring/interventions/staging', data),
  getInterventionsStaging:                   ()          => api.get('/monitoring/interventions/staging'),
  getMesOuvertesStaging:                     (technicien, equipement) => api.get('/monitoring/interventions/staging/mes-ouvertes', { params: { technicien, equipement } }),
  validerInterventionStaging:                (id)        => api.put(`/monitoring/interventions/staging/${id}/valider`),
  rejeterInterventionStaging:                (id)        => api.put(`/monitoring/interventions/staging/${id}/rejeter`),
  cloturerInterventionStaging:               (id, data)  => api.put(`/monitoring/interventions/staging/${id}/cloturer`, data),
  supprimerInterventionStaging:              (id)        => api.delete(`/monitoring/interventions/staging/${id}`),
  getInterventionsPlanifieesParEquipement:   (equipId)   => api.get(`/monitoring/interventions/planifiees-equip/${equipId}`),

  
  getEnergieQr: (type, baseUrl) => api.get('/monitoring/energie-qr', { params: { type, baseUrl } }),

  
  getSeuils:               ()              => api.get('/seuils'),
  updateSeuils:            (data)          => api.put('/seuils', data),
  checkAlertes:            ()              => api.get('/seuils/alertes'),
  getAlertHistory:         ()              => api.get('/seuils/history'),
  sendAlertEmail:          (alertData)     => api.post('/seuils/alert-email', alertData),
};

export const prcAPI = {
  getAll:           ()         => api.get('/prc'),
  create:           (data)     => api.post('/prc', data),
  update:           (id, data) => api.put(`/prc/${id}`, data),
  updateStock:      (id, data) => api.patch(`/prc/${id}/stock`, data),
  delete:           (id)       => api.delete(`/prc/${id}`),
  getMouvements:    (id)       => api.get(`/prc/${id}/mouvements`),
};

export const kpiAPI = {
  getResponsable:          () => api.get('/kpi/responsable'),
  getTechnicien:           () => api.get('/kpi/technicien'),
  getMesTachesPreventives: () => api.get('/kpi/mes-taches-preventives'),
  syncDW:                  () => api.post('/kpi/sync-dw'),
  getSyncStatus:           () => api.get('/kpi/sync-status'),
};

export const mlAPI = {
  getPredictions:   ()   => api.get('/ml/predictions'),
  triggerRetrain:   ()   => api.post('/ml/retrain'),
  getRetrainStatus: ()   => api.get('/ml/retrain/status'),
};

export const verificationsAPI = {
  getAujourdhui:            ()     => api.get('/verifications/aujourd-hui'),
  getAujourdhuiSousEquip:   ()     => api.get('/verifications/sous-equip/aujourd-hui'),
  sauvegarder:              (data) => api.post('/verifications', data),
  sauvegarderSousEquip:     (data) => api.post('/verifications/sous-equip', data),
  getAll:                   (date) => api.get('/verifications', { params: { date } }),
};

export default api;

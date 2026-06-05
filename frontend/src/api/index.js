// ============================================================
// CONFIGURATION AXIOS
// Toutes les requetes API passent par cette instance
// ============================================================
import axios from 'axios';

const getBaseURL = () => {
  if (process.env.REACT_APP_API_URL) return process.env.REACT_APP_API_URL;
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') return 'http://localhost:5000/api';
  return `http://${host}:5000/api`;
};

const api = axios.create({ baseURL: getBaseURL() });

// Ajouter le token JWT automatiquement dans chaque requete
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Si token expire (401) -> rediriger vers login
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.clear();
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

// Auth endpoints
export const authAPI = {
  login:        (data)          => api.post('/auth/login', data),
  logout:       ()              => api.post('/auth/logout'),
  resetDemande: (email)         => api.post('/auth/reset-demande', { email }),
  resetConfirm: (token, mdp)    => api.post(`/auth/reset/${token}`, { nouveau_mot_de_passe: mdp }),
  changePassword: (data)        => api.post('/auth/change-password', data),
};

// Users endpoints
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

// Equipements endpoints
export const equipementsAPI = {
  getAll:       ()              => api.get('/equipements'),
  getById:      (id)            => api.get(`/equipements/${id}`),
  getInterventionQr: (id, baseUrl) => api.get(`/equipements/${id}/intervention-qr`, { params: { baseUrl } }),
  create:       (data)          => api.post('/equipements', data),
  update:       (id, data)      => api.put(`/equipements/${id}`, data),
  delete:       (id)            => api.delete(`/equipements/${id}`),
};

// Sous-equip endpoints (table sous_equip)
export const sousEquipAPI = {
  getByEquipement: (equipementId) => api.get(`/sous-equip/by-equipement/${equipementId}`),
  create:          (data)         => api.post('/sous-equip', data),
  update:          (id, data)     => api.put(`/sous-equip/${id}`, data),
  delete:          (id)           => api.delete(`/sous-equip/${id}`),
};

// Monitoring endpoints
export const monitoringAPI = {
  // Water consumption
  getWaterConsumption:     (params)         => api.get('/monitoring/eau', { params }),
  getWaterStats:            ()              => api.get('/monitoring/eau/stats'),
  recalculerEau:            ()              => api.post('/monitoring/eau/recalculer'),
  addWaterConsumption:      (data)          => api.post('/monitoring/eau', data),
  updateWaterConsumption:   (id, data)      => api.put(`/monitoring/eau/${id}`, data),
  deleteWaterConsumption:   (id)            => api.delete(`/monitoring/eau/${id}`),

  // Electricity consumption
  getElectricityConsumption: (params)       => api.get('/monitoring/electricite', { params }),
  getElectricityStats:      ()              => api.get('/monitoring/electricite/stats'),
  addElectricityConsumption: (data)          => api.post('/monitoring/electricite', data),
  updateElectricityConsumption: (id, data)  => api.put(`/monitoring/electricite/${id}`, data),
  deleteElectricityConsumption: (id)        => api.delete(`/monitoring/electricite/${id}`),
  
  // Photovoltaic production
  getPhotovoltaicProduction: ()             => api.get('/monitoring/photovoltaique'),
  getPhotovoltaicStats:     ()              => api.get('/monitoring/photovoltaique/stats'),
  addPhotovoltaicProduction: (data)         => api.post('/monitoring/photovoltaique', data),
  updatePhotovoltaicProduction: (id, data)   => api.put(`/monitoring/photovoltaique/${id}`, data),
  deletePhotovoltaicProduction: (id)         => api.delete(`/monitoring/photovoltaique/${id}`),
  
  // Interventions
  getInterventions:             ()           => api.get('/monitoring/interventions'),
  getInterventionsStats:        ()           => api.get('/monitoring/interventions/stats'),
  getInterventionFormQr:        (baseUrl)    => api.get('/monitoring/interventions/form-qr', { params: { baseUrl } }),
  addIntervention:              (data)       => api.post('/monitoring/interventions', data),
  addInterventionMobile:        (data)       => api.post('/monitoring/interventions/mobile', data),
  updateIntervention:           (id, data)   => api.put(`/monitoring/interventions/${id}`, data),
  deleteIntervention:           (id)         => api.delete(`/monitoring/interventions/${id}`),
  // Staging
  addInterventionStaging:                    (data)      => api.post('/monitoring/interventions/staging', data),
  getInterventionsStaging:                   ()          => api.get('/monitoring/interventions/staging'),
  getMesOuvertesStaging:                     (technicien, equipement) => api.get('/monitoring/interventions/staging/mes-ouvertes', { params: { technicien, equipement } }),
  validerInterventionStaging:                (id)        => api.put(`/monitoring/interventions/staging/${id}/valider`),
  rejeterInterventionStaging:                (id)        => api.put(`/monitoring/interventions/staging/${id}/rejeter`),
  cloturerInterventionStaging:               (id, data)  => api.put(`/monitoring/interventions/staging/${id}/cloturer`, data),
  supprimerInterventionStaging:              (id)        => api.delete(`/monitoring/interventions/staging/${id}`),
  getInterventionsPlanifieesParEquipement:   (equipId)   => api.get(`/monitoring/interventions/planifiees-equip/${equipId}`),

  // QR codes énergie
  getEnergieQr: (type, baseUrl) => api.get('/monitoring/energie-qr', { params: { type, baseUrl } }),

  // Seuils et alertes
  getSeuils:               ()              => api.get('/seuils'),
  updateSeuils:            (data)          => api.put('/seuils', data),
  checkAlertes:            ()              => api.get('/seuils/alertes'),
  getAlertHistory:         ()              => api.get('/seuils/history'),
  sendAlertEmail:          (alertData)     => api.post('/seuils/alert-email', alertData),
  getNotifications:        ()              => api.get('/seuils/notifications'),
};

// PRC endpoints
export const prcAPI = {
  getAll:        ()                  => api.get('/prc'),
  create:        (data)              => api.post('/prc', data),
  update:        (id, data)          => api.put(`/prc/${id}`, data),
  updateStock:   (id, data)          => api.patch(`/prc/${id}/stock`, data),
  delete:        (id)                => api.delete(`/prc/${id}`),
};

// KPI endpoints
export const kpiAPI = {
  getResponsable:          () => api.get('/kpi/responsable'),
  getTechnicien:           () => api.get('/kpi/technicien'),
  getMesTachesPreventives: () => api.get('/kpi/mes-taches-preventives'),
};

// Verifications quotidiennes endpoints
export const verificationsAPI = {
  getAujourdhui: ()           => api.get('/verifications/aujourd-hui'),
  sauvegarder:   (data)       => api.post('/verifications', data),
  getAll:        (date)       => api.get('/verifications', { params: { date } }),
};

export default api;

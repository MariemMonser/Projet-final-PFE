// ============================================================
// SEUILS PAGE - TECHNICIEN
// Gestion des seuils de consommation et alertes
// ============================================================
import React, { useState, useEffect } from 'react';
import { monitoringAPI, usersAPI } from '../../api';

const SeuilsPage = () => {
  const [seuils, setSeuils] = useState([]);
  const [alertes, setAlertes] = useState([]);
  const [alertHistory, setAlertHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({});
  const [currentUser, setCurrentUser] = useState(null);
  const [commentaire, setCommentaire] = useState('');
  const [sendingEmail, setSendingEmail] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // Get current user name from database using JWT token
  useEffect(() => {
    const getCurrentUser = async () => {
      const token = localStorage.getItem('token');
      let technicianName = 'Technicien';
      
      if (token) {
        try {
          const tokenPayload = JSON.parse(atob(token.split('.')[1]));
          const userId = tokenPayload.id;
          if (userId) {
            try {
              const response = await usersAPI.getById(userId);
              const userData = response.data;
              if (userData.prenom || userData.nom) {
                technicianName = `${userData.prenom || ''} ${userData.nom || ''}`.trim();
              }
            } catch { /* silencieux */ }
          }
        } catch { /* silencieux */ }
      }
      
      // Set current user with the name
      setCurrentUser({ nom: technicianName, prenom: '' });
      
      loadData();
    };
    
    getCurrentUser();
  }, []);

  // Load alert history
  const loadAlertHistory = async () => {
    try {
      const response = await monitoringAPI.getAlertHistory();
      setAlertHistory(response.data);
    } catch (err) {
      console.error('Erreur chargement historique alertes:', err);
    }
  };

  // Send manual alert with custom comment
  const sendManualAlert = async () => {
    if (!commentaire.trim()) {
      setError('Veuillez ajouter un commentaire avant d\'envoyer l\'alerte');
      return;
    }
    
    if (alertes.length === 0) {
      setError('Aucune alerte active à envoyer');
      return;
    }
    
    setSendingEmail(true);
    setError('');
    
    try {
      const nomTechnicien = currentUser
        ? `${currentUser.prenom || ''} ${currentUser.nom || ''}`.trim() || 'Technicien'
        : 'Technicien';
      await monitoringAPI.sendAlertEmail({
        email: 'montassarbenhassine44@gmail.com',
        alerts: alertes,
        timestamp: new Date().toISOString(),
        technicianName: nomTechnicien,
        comment: commentaire.trim()
      });
      
      console.log('Alerte manuelle envoyée avec succès');
      setCommentaire(''); // Clear comment after sending
      
      // Optionally refresh alerts to show they've been sent
      loadData();
      
    } catch (emailErr) {
      console.error('Erreur envoi alerte manuelle:', emailErr);
      setError('Erreur lors de l\'envoi de l\'alerte');
    } finally {
      setSendingEmail(false);
    }
  };

  const loadData = async () => {
    try {
      setLoading(true);
      setError('');
      const [seuilsRes, alertesRes] = await Promise.all([
        monitoringAPI.getSeuils(),
        monitoringAPI.checkAlertes()
      ]);
      
      setSeuils(seuilsRes.data);
      
      const alertData = alertesRes.data;
      if (alertData.currentUser) {
        setCurrentUser(alertData.currentUser);
      }
      setAlertes(alertData.alertes || []);
      setLoading(false);
    } catch (err) {
      console.error('Erreur loadData:', err);
      setError('Erreur lors du chargement des données.');
      setLoading(false);
    }
  };

  const handleUpdateSeuils = async () => {
    try {
      await monitoringAPI.updateSeuils(seuils);
      alert('Seuils mis à jour avec succès!');
      setShowModal(false);
    } catch (err) {
      console.error('Erreur updateSeuils:', err);
      setError('Erreur lors de la mise à jour des seuils.');
    }
  };

  const handleChange = (type, field, value) => {
    setSeuils(prev => prev.map(seuil => 
      seuil.type_consommation === type 
        ? { ...seuil, [field]: parseFloat(value) || 0 }
        : seuil
    ));
  };

  const getAlerteColor = (alerte) => {
    if (alerte.depassement > 0) return 'bg-red-50 border-red-200 text-red-700';
    if (alerte.depassement > -50) return 'bg-yellow-50 border-yellow-200 text-yellow-700';
    return 'bg-green-50 border-green-200 text-green-700';
  };

  const getAlerteIcon = (alerte) => {
    if (alerte.depassement > 0) return '⚠️';
    if (alerte.depassement > -50) return '⚡';
    return '✅';
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Seuils et Alertes</h1>
        <p className="text-gray-600 mt-1">Gérez les seuils de consommation et consultez les alertes</p>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Seuils Actuels */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-gray-800">Seuils de Consommation</h2>
          <button
            onClick={() => setShowModal(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Modifier les seuils
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {seuils.map((seuil) => (
            <div key={seuil.type_consommation} className="border border-gray-200 rounded-lg p-4">
              <h3 className="font-semibold text-lg mb-3 capitalize text-gray-800">
                {seuil.type_consommation === 'eau' ? '💧 Eau' : '⚡ Électricité'}
              </h3>
              
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-600">Seuil Hiver:</span>
                  <span className="font-medium">{seuil.seuil_hiver} {seuil.unite}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Seuil Été:</span>
                  <span className="font-medium">{seuil.seuil_ete} {seuil.unite}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Prix Unitaire:</span>
                  <span className="font-medium">{seuil.prix_unitaire} DT/{seuil.unite}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Alertes Actives */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-gray-800">
            Alertes de Consommation {alertes.length > 0 && `(${alertes.length})`}
          </h2>
          <button
            onClick={() => {
              setShowHistory(!showHistory);
              if (!showHistory) loadAlertHistory();
            }}
            className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors text-sm"
          >
            {showHistory ? 'Masquer l\'historique' : 'Voir l\'historique'}
          </button>
        </div>

        {alertes.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <div className="text-4xl mb-2">✅</div>
            <p>Aucune alerte active</p>
            <p className="text-sm">Toutes les consommations sont dans les limites normales</p>
          </div>
        ) : (
          <div className="space-y-3">
            {alertes.map((alerte, index) => (
              <div key={index} className={`border rounded-lg p-4 ${getAlerteColor(alerte)}`}>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center mb-2">
                      <span className="text-xl mr-2">{getAlerteIcon(alerte)}</span>
                      <span className="font-semibold capitalize">
                        {alerte.type === 'eau' ? 'Eau' : 'Électricité'}
                      </span>
                    </div>
                    <p className="text-sm">{alerte.message}</p>
                    <div className="mt-2 text-xs text-gray-600">
                      <div>Date: {new Date(alerte.date).toLocaleDateString('fr-FR')}</div>
                      <div>Dépassement: {alerte.depassement.toFixed(2)} {alerte.type === 'eau' ? 'm³' : 'kWh'}</div>
                      <div>Coût estimé: {alerte.cout_estime.toFixed(2)} DT</div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
            
            {/* Manual alert sending section */}
            <div className="border rounded-lg p-4 bg-blue-50">
              <h4 className="font-semibold mb-3 text-blue-800">Envoyer l'alerte</h4>
              
              <div className="mb-3">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Commentaire (obligatoire)
                </label>
                <textarea
                  value={commentaire}
                  onChange={(e) => setCommentaire(e.target.value)}
                  placeholder="Ajoutez votre commentaire sur cette alerte..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows="3"
                />
              </div>
              
              {error && (
                <div className="mb-3 p-2 bg-red-100 border border-red-400 text-red-700 rounded">
                  {error}
                </div>
              )}
              
              <button
                onClick={sendManualAlert}
                disabled={sendingEmail || !commentaire.trim()}
                className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                {sendingEmail ? 'Envoi en cours...' : 'Envoyer l\'alerte par email'}
              </button>
              
              <p className="text-xs text-gray-600 mt-2">
                L'alerte sera envoyée à montassarbenhassine44@gmail.com avec votre nom et commentaire
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Alert History */}
      {showHistory && (
        <div className="bg-white rounded-lg shadow-md p-6 mt-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Historique des Alertes</h3>
          
          {alertHistory.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p>Aucune alerte dans l'historique</p>
            </div>
          ) : (
            <div className="space-y-3">
              {alertHistory.map((alerte, index) => (
                <div key={index} className={`border rounded-lg p-4 ${
                  alerte.email_envoye ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'
                }`}>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center mb-2">
                        <span className="text-lg mr-2">
                          {alerte.type_consommation === 'eau' ? 'Eau' : 'Électricité'}
                        </span>
                        <span className={`px-2 py-1 text-xs rounded ${
                          alerte.email_envoye 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-yellow-100 text-yellow-800'
                        }`}>
                          {alerte.email_envoye ? 'Envoyée' : 'En attente'}
                        </span>
                      </div>
                      <p className="text-sm mb-2">{alerte.message}</p>
                      <div className="text-xs text-gray-600 space-y-1">
                        <div>Date: {new Date(alerte.date_alerte).toLocaleDateString('fr-FR')}</div>
                        <div>Dépassement: {Number(alerte.depassement).toFixed(2)} {alerte.type_consommation === 'eau' ? 'm³' : 'kWh'}</div>
                        <div>Coût estimé: {Number(alerte.cout_estime).toFixed(2)} DT</div>
                        {alerte.technicien_nom && (
                          <div>Technicien: {alerte.technicien_nom}</div>
                        )}
                        {alerte.commentaire && (
                          <div>Commentaire: {alerte.commentaire}</div>
                        )}
                        {alerte.email_envoye && (
                          <div>Envoyée le: {new Date(alerte.date_email_envoye).toLocaleString('fr-FR')}</div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modal de modification des seuils */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Modifier les Seuils</h3>
            
            {seuils.map((seuil) => (
              <div key={seuil.type_consommation} className="mb-4">
                <h4 className="font-medium mb-2 capitalize">
                  {seuil.type_consommation === 'eau' ? 'Eau' : 'Électricité'}
                </h4>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Seuil Hiver ({seuil.unite})
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={seuil.seuil_hiver}
                      onChange={(e) => handleChange(seuil.type_consommation, 'seuil_hiver', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Seuil Été ({seuil.unite})
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={seuil.seuil_ete}
                      onChange={(e) => handleChange(seuil.type_consommation, 'seuil_ete', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Prix Unitaire (DT/{seuil.unite})
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={seuil.prix_unitaire}
                      onChange={(e) => handleChange(seuil.type_consommation, 'prix_unitaire', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>
            ))}

            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Annuler
              </button>
              <button
                onClick={handleUpdateSeuils}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SeuilsPage;

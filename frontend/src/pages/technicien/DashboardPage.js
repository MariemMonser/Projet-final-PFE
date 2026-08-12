

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import api from '../../api';

const DashboardPage = () => {
  const { user }    = useAuth();
  const navigate    = useNavigate();
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/kpi/technicien');
      setData(res.data);
      setUpdatedAt(new Date());
    } catch (_) {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const d = data || {};
  const ot = d.mes_interventions || {};
  const planifiees = d.planifiees_semaine || [];
  const eaux = d.releves_eau || [];
  const elecs = d.releves_elec || [];

  const today = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="p-6 space-y-6">
      
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Bonjour, {user?.prenom} 👋
          </h1>
          <p className="text-gray-500 text-sm mt-0.5 capitalize">{today}
            {updatedAt && (
              <span className="ml-2 text-gray-400">
                · {updatedAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-blue-900 text-white rounded-lg text-sm hover:bg-blue-800 disabled:opacity-60 transition"
        >
          <span className={loading ? 'animate-spin' : ''}>↻</span>
          Actualiser
        </button>
      </div>

      
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Mes OT ce mois',  value: ot.total,     color: 'text-blue-700',   bg: 'bg-blue-50',   border: 'border-blue-400'   },
          { label: 'Terminées',        value: ot.terminees, color: 'text-green-700',  bg: 'bg-green-50',  border: 'border-green-400'  },
          { label: 'Curatives',        value: ot.cura,      color: 'text-red-700',    bg: 'bg-red-50',    border: 'border-red-400'    },
          { label: 'Préventives',      value: ot.prev,      color: 'text-purple-700', bg: 'bg-purple-50', border: 'border-purple-400' },
        ].map(({ label, value, color, bg, border }) => (
          <button
            key={label}
            onClick={() => navigate('/technicien/interventions')}
            className={`${bg} border-l-4 ${border} rounded-xl p-4 text-center hover:opacity-80 transition`}
          >
            {loading ? (
              <div className="h-8 w-12 bg-gray-200 animate-pulse rounded mx-auto" />
            ) : (
              <p className={`text-3xl font-bold ${color}`}>{value ?? 0}</p>
            )}
            <p className="text-xs text-gray-500 mt-1">{label}</p>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        <div className="bg-white rounded-xl shadow p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-800">📅 Tâches préventives — cette semaine</h2>
            <button
              onClick={() => navigate('/technicien/interventions')}
              className="text-xs text-blue-600 hover:underline"
            >
              Voir tout →
            </button>
          </div>
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-12 bg-gray-100 animate-pulse rounded-lg" />
              ))}
            </div>
          ) : planifiees.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <div className="text-3xl mb-2">✅</div>
              <p className="text-sm">Aucune tâche planifiée cette semaine</p>
            </div>
          ) : (
            <div className="space-y-2">
              {planifiees.map((p) => {
                const isToday = new Date(p.date_intervention).toDateString() === new Date().toDateString();
                const desc = (p.description || '').split(' | ')[0].replace('Equipement: ', '').slice(0, 60);
                return (
                  <div
                    key={p.id}
                    className={`flex items-center justify-between p-3 rounded-lg border ${
                      isToday ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-200'
                    }`}
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-800">{desc || `Intervention #${p.id}`}</p>
                      <p className="text-xs text-gray-500">
                        {new Date(p.date_intervention).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })}
                      </p>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full font-semibold ${
                      p.statut === 'En cours'
                        ? 'bg-yellow-100 text-yellow-700'
                        : 'bg-blue-100 text-blue-700'
                    }`}>
                      {p.statut}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        
        <div className="bg-white rounded-xl shadow p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-800">⚡ Relevés énergie — 7 derniers jours</h2>
            <button
              onClick={() => navigate('/technicien/monitoring')}
              className="text-xs text-blue-600 hover:underline"
            >
              Voir tout →
            </button>
          </div>
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-10 bg-gray-100 animate-pulse rounded-lg" />
              ))}
            </div>
          ) : eaux.length === 0 && elecs.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <div className="text-3xl mb-2">📊</div>
              <p className="text-sm">Aucun relevé ces 7 derniers jours</p>
            </div>
          ) : (
            <div className="space-y-2">
              
              {eaux.slice(0, 3).map((r, i) => (
                <div key={`eau-${i}`} className="flex items-center justify-between p-2.5 bg-blue-50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <span>💧</span>
                    <div>
                      <p className="text-xs font-medium text-gray-800">Eau</p>
                      <p className="text-xs text-gray-400">{new Date(r.date_releve).toLocaleDateString('fr-FR')}</p>
                    </div>
                  </div>
                  <span className="text-sm font-bold text-blue-700">{r.compteur} m³</span>
                </div>
              ))}
              
              {elecs.slice(0, 3).map((r, i) => (
                <div key={`elec-${i}`} className="flex items-center justify-between p-2.5 bg-yellow-50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <span>⚡</span>
                    <div>
                      <p className="text-xs font-medium text-gray-800">Électricité</p>
                      <p className="text-xs text-gray-400">{new Date(r.date_releve).toLocaleDateString('fr-FR')}</p>
                    </div>
                  </div>
                  <span className="text-sm font-bold text-yellow-700">
                    {r.consommation_jour != null ? `${r.consommation_jour} kWh` : '—'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          { label: 'Mes interventions', icon: '🔧', path: '/technicien/interventions' },
          { label: 'Monitoring',         icon: '📊', path: '/technicien/monitoring' },
          { label: 'Seuils & Alertes',   icon: '⚠️', path: '/technicien/seuils' },
          { label: 'Vérifications',       icon: '✅', path: '/technicien/verifications' },
          { label: 'Mes équipements',    icon: '⚙️',  path: '/technicien/equipements' },
        ].map(({ label, icon, path }) => (
          <button
            key={path}
            onClick={() => navigate(path)}
            className="flex items-center gap-3 bg-white rounded-xl shadow p-4 hover:bg-blue-50 transition text-left"
          >
            <span className="text-2xl">{icon}</span>
            <span className="text-sm font-medium text-gray-700">{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default DashboardPage;

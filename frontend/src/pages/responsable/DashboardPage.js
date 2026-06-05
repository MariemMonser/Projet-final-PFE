// ============================================================
// DASHBOARD RESPONSABLE — KPIs temps réel
// ============================================================
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api';

const fetchKpi = () => api.get('/kpi/responsable');

const KpiCard = ({ title, value, sub, icon, color, onClick, loading }) => (
  <button
    onClick={onClick}
    className={`bg-white rounded-xl shadow p-5 text-left hover:shadow-md transition w-full border-l-4 ${color}`}
  >
    <div className="flex items-start justify-between">
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{title}</p>
        {loading ? (
          <div className="h-8 w-20 bg-gray-200 animate-pulse rounded" />
        ) : (
          <p className="text-3xl font-bold text-gray-900">{value ?? '—'}</p>
        )}
        {sub && !loading && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
      </div>
      <span className="text-3xl">{icon}</span>
    </div>
  </button>
);

const DashboardPage = () => {
  const navigate  = useNavigate();
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchKpi();
      setData(res.data);
      setUpdatedAt(new Date());
    } catch (_) {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const d = data || {};

  return (
    <div className="p-6 space-y-6">
      {/* En-tête */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tableau de bord</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            Indicateurs du mois en cours
            {updatedAt && (
              <span className="ml-2 text-gray-400">
                · Mis à jour {updatedAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
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

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard
          title="Ordres de travail"
          value={loading ? null : d.ot?.total}
          sub={loading ? null : `Taux réalisation : ${d.ot?.taux_realisation ?? 0} % · ${d.ot?.cura ?? 0} CURA · ${d.ot?.prev ?? 0} PREV`}
          icon="🔧"
          color="border-blue-500"
          loading={loading}
          onClick={() => navigate('/responsable/interventions')}
        />
        <KpiCard
          title="MTBF moyen"
          value={loading ? null : d.mtbf?.moyen != null ? `${d.mtbf.moyen} h` : 'N/D'}
          sub={loading ? null : `${d.mtbf?.nb_non_conformes ?? 0} équipement(s) < 715 h`}
          icon="⏱️"
          color={d.mtbf?.nb_non_conformes > 0 ? 'border-red-500' : 'border-green-500'}
          loading={loading}
          onClick={() => navigate('/responsable/interventions')}
        />
        <KpiCard
          title="Consommation électrique"
          value={loading ? null : `${d.energie?.kwh_total ?? 0} kWh`}
          sub={loading ? null : `Coût : ${d.energie?.cout_total ?? 0} DT`}
          icon="⚡"
          color="border-yellow-500"
          loading={loading}
          />
        <KpiCard
          title="Alertes actives"
          value={loading ? null : d.alertes?.nb_actives}
          sub={loading ? null : `${d.alertes?.nb_attente ?? 0} fiche(s) terrain en attente`}
          icon="🔔"
          color={d.alertes?.nb_actives > 0 ? 'border-red-500' : 'border-gray-300'}
          loading={loading}
          onClick={() => navigate('/responsable/interventions-terrain')}
        />
      </div>

      {/* Détail OT */}
      {!loading && d.ot && (
        <div className="bg-white rounded-xl shadow p-5">
          <h2 className="font-semibold text-gray-800 mb-4">Détail des OT — mois en cours</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Total OT',     value: d.ot.total,     color: 'text-blue-700',   bg: 'bg-blue-50'   },
              { label: 'Terminées',    value: d.ot.terminees,  color: 'text-green-700',  bg: 'bg-green-50'  },
              { label: 'Curatives',    value: d.ot.cura,       color: 'text-red-700',    bg: 'bg-red-50'    },
              { label: 'Préventives',  value: d.ot.prev,       color: 'text-purple-700', bg: 'bg-purple-50' },
            ].map(({ label, value, color, bg }) => (
              <div key={label} className={`${bg} rounded-lg p-4 text-center`}>
                <p className={`text-2xl font-bold ${color}`}>{value}</p>
                <p className="text-xs text-gray-500 mt-1">{label}</p>
              </div>
            ))}
          </div>

          {/* Barre de progression taux réalisation */}
          <div className="mt-4">
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>Taux de réalisation</span>
              <span className="font-bold text-gray-700">{d.ot.taux_realisation} %</span>
            </div>
            <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  d.ot.taux_realisation >= 80 ? 'bg-green-500'
                  : d.ot.taux_realisation >= 50 ? 'bg-yellow-500'
                  : 'bg-red-500'
                }`}
                style={{ width: `${d.ot.taux_realisation}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Raccourcis */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          { label: 'Planification',         icon: '📅', path: '/responsable/interventions' },
          { label: 'Fiches terrain',         icon: '📋', path: '/responsable/interventions-terrain' },
          { label: 'Équipements',            icon: '⚙️',  path: '/responsable/equipements' },
          { label: 'KPIs avancés',           icon: '📈', path: '/responsable/kpis' },
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

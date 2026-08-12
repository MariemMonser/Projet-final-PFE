

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { monitoringAPI, kpiAPI } from '../../api';

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
  const [error, setError]     = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [syncStatus, setSyncStatus]   = useState(null);
  const [syncing,    setSyncing]      = useState(false);
  // Prévisions charge/PRC désactivées : aucun appel API ni affichage associé.
  const chargePrev = null;
  const prcPrev = null;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchKpi();
      setData(res.data);
      setUpdatedAt(new Date());
    } catch (err) {
      setError(err.response?.data?.message || 'Impossible de charger les indicateurs.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Fetch DW sync status on mount
  useEffect(() => {
    kpiAPI.getSyncStatus()
      .then(r => setSyncStatus(r.data))
      .catch(() => {});
  }, []);

  const handleSyncDW = async () => {
    setSyncing(true);
    try {
      await kpiAPI.syncDW();
      // Poll until sync finishes
      const poll = setInterval(async () => {
        try {
          const r = await kpiAPI.getSyncStatus();
          setSyncStatus(r.data);
          if (!r.data.running) {
            clearInterval(poll);
            setSyncing(false);
            load(); // refresh KPIs after sync
          }
        } catch (_) { clearInterval(poll); setSyncing(false); }
      }, 1500);
    } catch (err) {
      setSyncing(false);
    }
  };

  const d = data || {};

  return (
    <div className="p-6 space-y-6">

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm flex items-center gap-2">
          <span>⚠</span>
          <span>{error}</span>
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-3">
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
        <div className="flex items-center gap-2">
          <button
            onClick={handleSyncDW}
            disabled={syncing || loading}
            title={syncStatus?.lastAt ? `Dernière sync DW : ${new Date(syncStatus.lastAt).toLocaleString('fr-FR')}` : 'Synchroniser le Data Warehouse'}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition disabled:opacity-60 ${
              syncStatus?.lastStatus === 'error'
                ? 'bg-red-50 text-red-700 border-red-300 hover:bg-red-100'
                : syncStatus?.lastStatus === 'ok'
                ? 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100'
                : 'bg-gray-50 text-gray-600 border-gray-300 hover:bg-gray-100'
            }`}
          >
            <span className={syncing ? 'animate-spin inline-block' : ''}>
              {syncing ? '⏳' : syncStatus?.lastStatus === 'error' ? '⚠️' : '🔄'}
            </span>
            {syncing ? 'Sync DW…' : 'Sync DW'}
            {syncStatus?.lastAt && !syncing && (
              <span className="text-xs opacity-70 ml-1">
                {new Date(syncStatus.lastAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </button>
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-blue-900 text-white rounded-lg text-sm hover:bg-blue-800 disabled:opacity-60 transition"
          >
            <span className={loading ? 'animate-spin' : ''}>↻</span>
            Actualiser
          </button>
        </div>
      </div>

      {/* DW sync error banner */}
      {syncStatus?.lastStatus === 'error' && (
        <div className="flex items-center gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-800">
          <span className="text-lg">⚠️</span>
          <span>Dernière synchronisation DW échouée : <strong>{syncStatus.lastError}</strong></span>
        </div>
      )}
      {syncStatus?.lastStatus === 'partial' && (
        <div className="flex items-center gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
          <span className="text-lg">⚠️</span>
          <span>Synchronisation DW partielle — certaines tables n'ont pas pu être mises à jour.</span>
        </div>
      )}

      
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        <KpiCard
          title="Ordres de travail"
          value={loading ? null : d.ot?.total}
          sub={loading ? null : `Réalisation : ${d.ot?.taux_realisation ?? 0} % · ${d.ot?.cura ?? 0} CURA · ${d.ot?.prev ?? 0} PREV`}
          icon="🔧" color="border-blue-500" loading={loading}
          onClick={() => navigate('/responsable/interventions')}
        />
        <KpiCard
          title={
            <span className="flex items-center gap-2">
              MTBF
              {!loading && d.dw_disponible === false && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded-full border border-amber-200">
                  DW hors ligne
                </span>
              )}
            </span>
          }
          value={loading ? null : d.mtbf?.moyen != null ? `${d.mtbf.moyen} h` : 'N/D'}
          sub={loading ? null : d.dw_disponible === false ? 'Données analytiques indisponibles' : `${d.mtbf?.nb_non_conformes ?? 0} équipement(s) < 715 h`}
          icon="⏱️" color={d.mtbf?.nb_non_conformes > 0 ? 'border-red-500' : 'border-green-500'}
          loading={loading} onClick={() => navigate('/responsable/interventions')}
        />
        <KpiCard
          title="Alertes actives"
          value={loading ? null : d.alertes?.nb_actives}
          sub={loading ? null : `${d.alertes?.nb_attente ?? 0} fiche(s) terrain en attente`}
          icon="🔔" color={d.alertes?.nb_actives > 0 ? 'border-red-500' : 'border-gray-300'}
          loading={loading} onClick={() => navigate('/responsable/interventions-terrain')}
        />
        <KpiCard
          title="Électricité — mois en cours"
          value={loading ? null : `${d.energie?.kwh_total ?? 0} kWh`}
          sub={loading ? null : `Coût : ${d.energie?.cout_total ?? 0} DT`}
          icon="⚡" color="border-yellow-500" loading={loading}
        />
        <KpiCard
          title="Eau — mois en cours"
          value={loading ? null : `${d.eau?.m3_total ?? 0} m³`}
          sub={loading ? null : `Coût : ${d.eau?.cout_total ?? 0} DT`}
          icon="💧" color="border-cyan-500" loading={loading}
        />
        <KpiCard
          title="Production PV — mois"
          value={loading ? null : `${d.pv?.kwh_total ?? 0} kWh`}
          sub={loading ? null : 'Production photovoltaïque'}
          icon="☀️" color="border-orange-500" loading={loading}
        />
      </div>

      
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

      {/* Alert details */}
      {!loading && d.alertes?.details?.length > 0 && (
        <div className="bg-white rounded-xl shadow p-5">
          <h2 className="font-semibold text-gray-800 mb-3">Alertes récentes (30 jours)</h2>
          <div className="space-y-2">
            {d.alertes.details.map((a) => (
              <div key={a.id} className={`flex items-start gap-3 p-3 rounded-lg border text-sm ${
                a.type_consommation === 'eau' ? 'bg-cyan-50 border-cyan-200' : 'bg-yellow-50 border-yellow-200'
              }`}>
                <span className="text-lg flex-shrink-0">{a.type_consommation === 'eau' ? '💧' : '⚡'}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-800 truncate">{a.message}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {new Date(a.date_alerte).toLocaleDateString('fr-FR')} ·
                    Dépassement : {parseFloat(a.depassement || 0).toFixed(2)} ·
                    Coût estimé : {parseFloat(a.cout_estime || 0).toFixed(3)} DT
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Prévisions ML mois prochain ──────────────────────────────── */}
      {false && <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Charge technicien */}
        <div className="bg-white rounded-xl shadow p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-800">
              Charge prévue — {chargePrev ? chargePrev.mois_prevu : '…'}
            </h2>
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
              {chargePrev ? 'ML · EWMA' : 'non disponible'}
            </span>
          </div>

          {!chargePrev ? (
            <p className="text-sm text-gray-400 italic">
              Aucune prévision — relancer le pipeline ETL (étape 6).
            </p>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-3 mb-3">
                {[
                  { label: 'Curatif',   val: chargePrev.heures.cura.value,  vs: chargePrev.heures.cura.vs_mois_prec,  color: 'text-red-600',    bg: 'bg-red-50'    },
                  { label: 'Préventif', val: chargePrev.heures.prev.value,  vs: chargePrev.heures.prev.vs_mois_prec,  color: 'text-green-600',  bg: 'bg-green-50'  },
                  { label: 'Total',     val: chargePrev.heures.total.value, vs: chargePrev.heures.total.vs_mois_prec, color: 'text-blue-600',   bg: 'bg-blue-50'   },
                ].map(({ label, val, vs, color, bg }) => (
                  <div key={label} className={`${bg} rounded-lg p-3 text-center`}>
                    <p className={`text-xl font-bold ${color}`}>{val} h</p>
                    <p className="text-xs text-gray-500 mt-0.5">{label}</p>
                    <p className={`text-xs font-medium mt-0.5 ${vs?.startsWith('+') ? 'text-red-500' : 'text-green-600'}`}>
                      {vs}
                    </p>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-3 text-xs text-gray-500 border-t pt-2">
                <span>OT prévus : <strong className="text-gray-700">{chargePrev.nb_ot.cura} CURA · {chargePrev.nb_ot.prev} PREV</strong></span>
                <span className="ml-auto">±{chargePrev.heures.cura.mae} h MAE</span>
              </div>
              {chargePrev.alertes?.length > 0 && (
                <div className="mt-2 space-y-1">
                  {chargePrev.alertes.map((a, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 rounded px-2 py-1">
                      <span>⚠</span><span>{a}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Commandes PRC urgentes */}
        <div className="bg-white rounded-xl shadow p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-800">
              Commandes PRC urgentes — {prcPrev?.mois_prevu ?? '…'}
            </h2>
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
              {prcPrev ? `${prcPrev.commandes?.length ?? 0} pièces` : 'non disponible'}
            </span>
          </div>

          {!prcPrev ? (
            <p className="text-sm text-gray-400 italic">
              Aucune prévision — relancer le pipeline ETL (étape 7).
            </p>
          ) : prcPrev.commandes?.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2">
              <span>✓</span><span>Aucune commande urgente ce mois-ci.</span>
            </div>
          ) : (
            <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
              {prcPrev.commandes.slice(0, 8).map((c, i) => (
                <div key={i} className="flex items-center justify-between text-sm border border-gray-100 rounded-lg px-3 py-2 hover:bg-gray-50">
                  <div className="min-w-0">
                    <p className="font-medium text-gray-800 truncate">{c.code_prc}</p>
                    <p className="text-xs text-gray-500 truncate">{c.designation}</p>
                  </div>
                  <div className="text-right ml-3 flex-shrink-0">
                    <p className="text-xs text-gray-500">Stock: <span className="font-medium text-gray-700">{c.stock_actuel}</span></p>
                    <p className="text-xs font-semibold text-red-600">Cmd: {c.qtite_a_commander} u.</p>
                    <p className="text-xs text-gray-400">{c.valeur_commande_tnd} TND</p>
                  </div>
                </div>
              ))}
              {prcPrev.commandes.length > 8 && (
                <p className="text-xs text-center text-gray-400 pt-1">
                  + {prcPrev.commandes.length - 8} autres pièces dans le rapport complet
                </p>
              )}
            </div>
          )}
        </div>
      </div>}

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

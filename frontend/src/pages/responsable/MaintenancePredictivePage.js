import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { mlAPI } from '../../api';

const RISQUE_CONFIG = {
  'Élevé':  { bg: 'bg-red-50',    border: 'border-red-200',    text: 'text-red-700',    bar: 'bg-red-500',    header: 'bg-red-100',    icon: '🔴' },
  'Modéré': { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700', bar: 'bg-orange-400', header: 'bg-orange-100', icon: '🟠' },
  'Faible': { bg: 'bg-green-50',  border: 'border-green-200',  text: 'text-green-700',  bar: 'bg-green-500',  header: 'bg-green-100',  icon: '🟢' },
};

const StatCard = ({ label, value, color, icon }) => (
  <div className={`rounded-xl p-5 flex items-center gap-4 ${color} shadow-sm`}>
    <span className="text-3xl">{icon}</span>
    <div>
      <p className="text-2xl font-bold text-gray-800">{value}</p>
      <p className="text-sm text-gray-600 mt-0.5">{label}</p>
    </div>
  </div>
);

const EquipCard = ({ p, onPlanifier }) => {
  const cfg = RISQUE_CONFIG[p.risque] || RISQUE_CONFIG['Faible'];
  const pct = Math.round(p.proba_panne * 100);
  return (
    <div className={`rounded-xl border ${cfg.border} bg-white p-4 flex items-center gap-4 shadow-sm hover:shadow-md transition-shadow`}>
      <div className="flex-shrink-0 w-14 text-center">
        <div className={`text-xl font-bold ${cfg.text}`}>{pct}%</div>
        <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden mt-1">
          <div className={`h-1.5 rounded-full ${cfg.bar}`} style={{ width: `${pct}%` }} />
        </div>
        <div className="text-xs text-gray-400 mt-0.5">panne</div>
      </div>

      <div className="flex-1 min-w-0">
        <div className="font-mono text-xs text-gray-400">{p.code_equipement}</div>
        <div className="font-semibold text-gray-800 text-sm truncate mt-0.5" title={p.libelle}>
          {p.libelle || '—'}
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-1.5 text-xs text-gray-500">
          <span className={p.nb_cura_roll3 > 0 ? 'text-red-600 font-medium' : ''}>
            {p.nb_cura_roll3} curatif{p.nb_cura_roll3 !== 1 ? 's' : ''} / 3 mois
          </span>
          {p.mois_depuis_cura !== null && !isNaN(p.mois_depuis_cura) && (
            <span className="text-gray-400">· dernier il y a {Math.round(p.mois_depuis_cura)} mois</span>
          )}
        </div>
      </div>

      {p.risque !== 'Faible' && (
        <button
          onClick={() => onPlanifier(p)}
          className="flex-shrink-0 px-3 py-1.5 bg-blue-900 hover:bg-blue-800 text-white text-xs rounded-lg font-medium transition">
          Planifier
        </button>
      )}
    </div>
  );
};

const RiskGroup = ({ risque, items, onPlanifier, defaultOpen }) => {
  const [open, setOpen] = useState(defaultOpen);
  const cfg = RISQUE_CONFIG[risque];
  if (items.length === 0) return null;
  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden shadow-sm">
      <button
        onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center justify-between px-5 py-3 ${cfg.header} text-left hover:brightness-95 transition`}>
        <div className="flex items-center gap-2">
          <span>{cfg.icon}</span>
          <span className={`font-semibold ${cfg.text}`}>Risque {risque}</span>
          <span className={`text-xs px-2.5 py-0.5 rounded-full bg-white font-semibold ${cfg.text}`}>
            {items.length}
          </span>
        </div>
        <span className="text-gray-500 text-xs font-medium">{open ? '▲ Réduire' : '▼ Afficher'}</span>
      </button>
      {open && (
        <div className="p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 bg-gray-50">
          {items.map((p, i) => <EquipCard key={i} p={p} onPlanifier={onPlanifier} />)}
        </div>
      )}
    </div>
  );
};

const MaintenancePredictivePage = () => {
  const navigate = useNavigate();

  const [predictions,  setPredictions]  = useState([]);
  const [stats,        setStats]        = useState({ eleve: 0, modere: 0, faible: 0, total: 0 });
  const [modelInfo,    setModelInfo]    = useState(null);
  const [freshness,    setFreshness]    = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState(null);
  const [search,        setSearch]        = useState('');
  const [filterRisque,  setFilterRisque]  = useState('Tous');
  const [retraining,    setRetraining]    = useState(false);
  const [retrainMsg,    setRetrainMsg]    = useState(null);
  const pollRef = useRef(null);

  const loadPredictions = () =>
    mlAPI.getPredictions().then(res => {
      setPredictions(res.data.predictions || []);
      setStats(res.data.stats || { eleve: 0, modere: 0, faible: 0, total: 0 });
      setModelInfo(res.data.modelInfo || null);
      setFreshness(res.data.freshness || null);
    });

  useEffect(() => {
    loadPredictions()
      .catch(err => setError(err.response?.data?.message || 'Impossible de charger les prédictions ML.'))
      .finally(() => setLoading(false));
    return () => clearInterval(pollRef.current);
  }, []);

  const handleRetrain = async () => {
    try {
      setRetraining(true);
      setRetrainMsg('Lancement de l\'entraînement...');
      await mlAPI.triggerRetrain();

      pollRef.current = setInterval(async () => {
        try {
          const r   = await mlAPI.getRetrainStatus();
          const job = r.data.job;
          if (job.status === 'running') {
            setRetrainMsg(`Entraînement en cours… (${job.log?.length || 0} lignes de log)`);
          } else if (job.status === 'done') {
            clearInterval(pollRef.current);
            setRetrainMsg('Entraînement terminé — rechargement des prédictions...');
            await loadPredictions();
            setRetraining(false);
            setRetrainMsg(null);
          } else if (job.status === 'error') {
            clearInterval(pollRef.current);
            setRetraining(false);
            setRetrainMsg(`Erreur : ${job.error}`);
          }
        } catch {
          clearInterval(pollRef.current);
          setRetraining(false);
          setRetrainMsg('Impossible de récupérer le statut du job.');
        }
      }, 3000);
    } catch (err) {
      setRetraining(false);
      setRetrainMsg(err.response?.data?.message || 'Erreur lors du lancement.');
    }
  };

  const filtered = useMemo(() => {
    return [...predictions]
      .filter(p => {
        const matchRisque = filterRisque === 'Tous' || p.risque === filterRisque;
        const matchSearch = !search ||
          p.code_equipement.toLowerCase().includes(search.toLowerCase()) ||
          p.libelle.toLowerCase().includes(search.toLowerCase());
        return matchRisque && matchSearch;
      })
      .sort((a, b) => b.proba_panne - a.proba_panne);
  }, [predictions, filterRisque, search]);

  const byRisque = useMemo(() => ({
    'Élevé':  filtered.filter(p => p.risque === 'Élevé'),
    'Modéré': filtered.filter(p => p.risque === 'Modéré'),
    'Faible': filtered.filter(p => p.risque === 'Faible'),
  }), [filtered]);

  const handlePlanifier = (equip) => {
    navigate('/responsable/interventions', { state: { equipement_prefill: equip.code_equipement } });
  };

  const total     = stats.total || 1;
  const elevePct  = Math.round((stats.eleve  / total) * 100);
  const moderePct = Math.round((stats.modere / total) * 100);
  const faiblePct = Math.round((stats.faible / total) * 100);

  return (
    <div className="p-6 space-y-6">

      {retrainMsg && (
        <div className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm border ${
          retrainMsg.startsWith('Erreur')
            ? 'bg-red-50 border-red-200 text-red-800'
            : 'bg-blue-50 border-blue-200 text-blue-800'
        }`}>
          {retraining && <span className="animate-spin text-base">⏳</span>}
          <span>{retrainMsg}</span>
        </div>
      )}

      {freshness?.stale && !retraining && (
        <div className="flex items-center gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
          <span className="text-lg">⚠️</span>
          <span>
            Les prédictions ML ont <strong>{freshness.age_jours} jour(s)</strong> — données potentiellement périmées.
          </span>
          <button
            onClick={handleRetrain}
            className="ml-auto flex-shrink-0 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs rounded-lg font-medium transition">
            Relancer l'analyse
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Maintenance Prédictive</h1>
          <p className="text-sm text-gray-500 mt-1">
            Prédictions du modèle ML — risque de panne par équipement pour le mois prochain
          </p>
          {modelInfo && (
            <p className="text-xs text-gray-400 mt-0.5">
              Modèle : {modelInfo.model_name} &nbsp;|&nbsp; AUC : {modelInfo.auc}
              {modelInfo.trained_at && ` | Entraîné le ${new Date(modelInfo.trained_at).toLocaleDateString('fr-FR')}`}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-3 py-1.5 rounded-full font-medium">
            Catégories : percentiles 66 / 85
          </span>
          <button
            onClick={handleRetrain}
            disabled={retraining}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-900 hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm rounded-lg font-medium transition">
            {retraining ? <><span className="animate-spin">⏳</span> En cours...</> : '↻ Relancer l\'analyse'}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm flex items-center gap-2">
          <span className="text-lg">⚠</span><span>{error}</span>
        </div>
      )}

      {!loading && !error && (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Risque élevé — action prioritaire" value={stats.eleve}  color="bg-red-50"    icon="🔴" />
            <StatCard label="Risque modéré — à surveiller"      value={stats.modere} color="bg-orange-50" icon="🟠" />
            <StatCard label="Risque faible — OK"                value={stats.faible} color="bg-green-50"  icon="🟢" />
            <StatCard label="Équipements analysés"              value={stats.total}  color="bg-blue-50"   icon="⚙️" />
          </div>

          {/* Risk distribution bar */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">Répartition du risque</span>
              <span className="text-xs text-gray-400">{stats.total} équipements analysés</span>
            </div>
            <div className="flex rounded-full overflow-hidden h-5 gap-px">
              {elevePct  > 0 && <div className="bg-red-500    flex items-center justify-center text-white text-xs font-bold" style={{ width: `${elevePct}%`  }}>{elevePct  >= 8 ? `${elevePct}%`  : ''}</div>}
              {moderePct > 0 && <div className="bg-orange-400 flex items-center justify-center text-white text-xs font-bold" style={{ width: `${moderePct}%` }}>{moderePct >= 8 ? `${moderePct}%` : ''}</div>}
              {faiblePct > 0 && <div className="bg-green-500  flex items-center justify-center text-white text-xs font-bold" style={{ width: `${faiblePct}%` }}>{faiblePct >= 8 ? `${faiblePct}%` : ''}</div>}
            </div>
            <div className="flex gap-5 mt-2">
              <span className="text-xs flex items-center gap-1.5 text-red-600">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" /> Élevé {elevePct}%
              </span>
              <span className="text-xs flex items-center gap-1.5 text-orange-600">
                <span className="w-2.5 h-2.5 rounded-full bg-orange-400 inline-block" /> Modéré {moderePct}%
              </span>
              <span className="text-xs flex items-center gap-1.5 text-green-600">
                <span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" /> Faible {faiblePct}%
              </span>
            </div>
          </div>
        </>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <input
          type="text"
          placeholder="Rechercher un équipement..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 w-64"
        />
        {['Tous', 'Élevé', 'Modéré', 'Faible'].map(r => (
          <button key={r}
            onClick={() => setFilterRisque(r)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition border ${
              filterRisque === r
                ? 'bg-blue-900 text-white border-blue-900'
                : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
            }`}>
            {r}
          </button>
        ))}
        <span className="text-xs text-gray-400 ml-auto">
          {filtered.length} équipement{filtered.length !== 1 ? 's' : ''} · triés par probabilité
        </span>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <span className="animate-spin text-2xl mr-3">⏳</span> Chargement des prédictions...
        </div>
      ) : !error && (
        <div className="space-y-4">
          {filterRisque === 'Tous' ? (
            <>
              <RiskGroup risque="Élevé"  items={byRisque['Élevé']}  onPlanifier={handlePlanifier} defaultOpen={true} />
              <RiskGroup risque="Modéré" items={byRisque['Modéré']} onPlanifier={handlePlanifier} defaultOpen={true} />
              <RiskGroup risque="Faible" items={byRisque['Faible']} onPlanifier={handlePlanifier} defaultOpen={false} />
            </>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-gray-400 bg-white rounded-xl border border-gray-200">
              Aucun équipement ne correspond aux filtres sélectionnés.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {filtered.map((p, i) => <EquipCard key={i} p={p} onPlanifier={handlePlanifier} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default MaintenancePredictivePage;

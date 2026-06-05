// ============================================================
// VÉRIFICATIONS QUOTIDIENNES — Technicien
// Checklist journalière : chaque équipement OK / Problème / HS
// ============================================================
import React, { useEffect, useState, useCallback } from 'react';
import { equipementsAPI, verificationsAPI } from '../../api';
import { useAuth } from '../../context/AuthContext';

const STATUTS = [
  { value: 'ok',           label: 'OK',           icon: '✅', ring: 'ring-emerald-400', bg: 'bg-emerald-500', text: 'text-white',        light: 'bg-emerald-50 border-emerald-200'  },
  { value: 'probleme',     label: 'Problème',     icon: '⚠️', ring: 'ring-amber-400',   bg: 'bg-amber-500',   text: 'text-white',        light: 'bg-amber-50 border-amber-200'      },
  { value: 'hors_service', label: 'Hors service', icon: '❌', ring: 'ring-red-400',     bg: 'bg-red-500',     text: 'text-white',        light: 'bg-red-50 border-red-200'          },
];

const todayFR = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const todayISO = new Date().toISOString().split('T')[0];

export default function VerificationsPage() {
  const { user } = useAuth();

  const [equipements, setEquipements]   = useState([]);
  const [checks, setChecks]             = useState({});     // { equipementId: { statut, observation, saving, saved } }
  const [loading, setLoading]           = useState(true);
  const [erreur, setErreur]             = useState('');
  const [observations, setObservations] = useState({});     // { equipementId: text }

  // Charger équipements + vérifications du jour
  useEffect(() => {
    const charger = async () => {
      try {
        const [eqRes, vRes] = await Promise.all([
          equipementsAPI.getAll(),
          verificationsAPI.getAujourdhui(),
        ]);

        setEquipements(eqRes.data || []);

        // Indexer les vérifications existantes par equipement_id
        const map = {};
        const obs = {};
        (vRes.data || []).forEach(v => {
          map[v.equipement_id] = { statut: v.statut, saved: true };
          obs[v.equipement_id] = v.observation || '';
        });
        setChecks(map);
        setObservations(obs);
      } catch {
        setErreur('Erreur lors du chargement.');
      } finally {
        setLoading(false);
      }
    };
    charger();
  }, []);

  const cocher = useCallback(async (eq, statut) => {
    setChecks(prev => ({ ...prev, [eq.id]: { statut, saving: true, saved: false } }));
    try {
      await verificationsAPI.sauvegarder({
        equipement_id:  eq.id,
        equipement_nom: eq.nom,
        statut,
        observation:    observations[eq.id] || null,
      });
      setChecks(prev => ({ ...prev, [eq.id]: { statut, saving: false, saved: true } }));
    } catch {
      setChecks(prev => ({ ...prev, [eq.id]: { statut, saving: false, saved: false, erreur: true } }));
    }
  }, [observations]);

  const sauvegarderObservation = useCallback(async (eq) => {
    const current = checks[eq.id];
    if (!current?.statut) return;
    setChecks(prev => ({ ...prev, [eq.id]: { ...current, saving: true, saved: false } }));
    try {
      await verificationsAPI.sauvegarder({
        equipement_id:  eq.id,
        equipement_nom: eq.nom,
        statut:         current.statut,
        observation:    observations[eq.id] || null,
      });
      setChecks(prev => ({ ...prev, [eq.id]: { ...current, saving: false, saved: true } }));
    } catch {
      setChecks(prev => ({ ...prev, [eq.id]: { ...current, saving: false, erreur: true } }));
    }
  }, [checks, observations]);

  // Statistiques
  const total     = equipements.length;
  const verifies  = Object.keys(checks).filter(id => checks[id]?.statut).length;
  const nbOk      = Object.values(checks).filter(c => c.statut === 'ok').length;
  const nbPb      = Object.values(checks).filter(c => c.statut === 'probleme').length;
  const nbHs      = Object.values(checks).filter(c => c.statut === 'hors_service').length;
  const pct       = total > 0 ? Math.round((verifies / total) * 100) : 0;
  const complet   = verifies === total && total > 0;

  return (
    <div className="p-6 bg-gray-50 min-h-full">

      {/* ── En-tête ── */}
      <div className="mb-6">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Vérifications Quotidiennes</h1>
            <p className="text-sm text-gray-500 mt-0.5 capitalize">{todayFR}</p>
          </div>
          {complet && (
            <span className="px-4 py-2 bg-emerald-100 text-emerald-800 rounded-full text-sm font-bold border border-emerald-200">
              ✅ Checklist complète !
            </span>
          )}
        </div>

        {/* Barre de progression */}
        <div className="mt-4 bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-gray-700">Progression du jour</span>
            <span className="text-sm font-bold text-blue-900">{verifies} / {total} équipements</span>
          </div>
          <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${complet ? 'bg-emerald-500' : 'bg-blue-600'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex gap-4 mt-3 flex-wrap">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block"/> {nbOk} OK
            </span>
            <span className="flex items-center gap-1.5 text-xs font-semibold text-amber-700">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block"/> {nbPb} Problème
            </span>
            <span className="flex items-center gap-1.5 text-xs font-semibold text-red-700">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block"/> {nbHs} Hors service
            </span>
            <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-400">
              <span className="w-2.5 h-2.5 rounded-full bg-gray-300 inline-block"/> {total - verifies} Non vérifié
            </span>
          </div>
        </div>
      </div>

      {erreur && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{erreur}</div>
      )}

      {/* ── Liste des équipements ── */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-900"/>
        </div>
      ) : equipements.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <div className="text-5xl mb-3">⚙️</div>
          <p className="text-sm">Aucun équipement à vérifier.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {equipements.map((eq) => {
            const check   = checks[eq.id];
            const statut  = check?.statut;
            const saving  = check?.saving;
            const saved   = check?.saved;
            const hasErr  = check?.erreur;
            const needObs = statut === 'probleme' || statut === 'hors_service';
            const cfg     = STATUTS.find(s => s.value === statut);

            return (
              <div key={eq.id}
                className={`bg-white rounded-xl border-2 shadow-sm transition-all duration-200 overflow-hidden ${
                  statut === 'ok'           ? 'border-emerald-200' :
                  statut === 'probleme'     ? 'border-amber-300'   :
                  statut === 'hors_service' ? 'border-red-300'     :
                  'border-gray-100'
                }`}
              >
                {/* Card header */}
                <div className="flex items-center justify-between px-4 py-3 gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Indicateur statut */}
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-xl flex-shrink-0 ${
                      statut ? cfg?.bg : 'bg-gray-100'
                    }`}>
                      {statut ? cfg?.icon : '❓'}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900 text-sm truncate">{eq.nom}</p>
                      <p className="text-xs text-gray-400">ID #{eq.id}</p>
                    </div>
                  </div>

                  {/* Boutons de statut */}
                  <div className="flex gap-1.5 flex-shrink-0">
                    {STATUTS.map(s => (
                      <button
                        key={s.value}
                        onClick={() => cocher(eq, s.value)}
                        disabled={saving}
                        title={s.label}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all duration-150 ${
                          statut === s.value
                            ? `${s.bg} ${s.text} border-transparent ring-2 ${s.ring} ring-offset-1`
                            : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        {s.icon} {s.label}
                      </button>
                    ))}
                  </div>

                  {/* Indicateur sauvegarde */}
                  <div className="w-5 flex-shrink-0 text-center">
                    {saving  && <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto"/>}
                    {saved   && !saving && <span className="text-emerald-500 text-sm">✓</span>}
                    {hasErr  && !saving && <span className="text-red-500 text-sm">!</span>}
                  </div>
                </div>

                {/* Champ observation (visible si problème ou hors service) */}
                {needObs && (
                  <div className={`px-4 pb-3 border-t ${cfg?.light} border`}>
                    <label className="block text-xs font-semibold text-gray-600 mt-2 mb-1">
                      Observation / Détail du problème
                    </label>
                    <div className="flex gap-2">
                      <textarea
                        value={observations[eq.id] || ''}
                        onChange={e => setObservations(prev => ({ ...prev, [eq.id]: e.target.value }))}
                        rows={2}
                        placeholder="Décrivez le problème constaté..."
                        className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                      />
                      <button
                        onClick={() => sauvegarderObservation(eq)}
                        disabled={saving}
                        className="px-3 py-2 bg-blue-900 text-white rounded-lg text-xs font-bold hover:bg-blue-800 transition disabled:opacity-50 self-end"
                      >
                        Sauv.
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Résumé final si checklist complète ── */}
      {complet && (
        <div className="mt-6 p-5 bg-emerald-50 border border-emerald-200 rounded-xl text-center">
          <div className="text-4xl mb-2">🎉</div>
          <p className="font-bold text-emerald-800 text-lg">Vérification journalière terminée !</p>
          <p className="text-emerald-600 text-sm mt-1">
            {nbOk} OK · {nbPb} problème(s) · {nbHs} hors service
          </p>
          {(nbPb > 0 || nbHs > 0) && (
            <p className="text-amber-700 text-sm mt-2 font-semibold">
              ⚠️ {nbPb + nbHs} équipement(s) à signaler au responsable.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

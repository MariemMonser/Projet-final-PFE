

import React, { useEffect, useState, useCallback } from 'react';
import { equipementsAPI, sousEquipAPI, verificationsAPI } from '../../api';
import { useAuth } from '../../context/AuthContext';

const STATUTS = [
  { value: 'ok',           label: 'OK',           icon: '✅', ring: 'ring-emerald-400', bg: 'bg-emerald-500', text: 'text-white', light: 'bg-emerald-50 border-emerald-200'  },
  { value: 'probleme',     label: 'Problème',     icon: '⚠️', ring: 'ring-amber-400',   bg: 'bg-amber-500',   text: 'text-white', light: 'bg-amber-50 border-amber-200'      },
  { value: 'hors_service', label: 'Hors service', icon: '❌', ring: 'ring-red-400',     bg: 'bg-red-500',     text: 'text-white', light: 'bg-red-50 border-red-200'          },
];

const todayFR  = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

export default function VerificationsPage() {
  const { user } = useAuth();

  const [equipements,   setEquipements]   = useState([]);
  const [sousEquips,    setSousEquips]     = useState([]);
  const [checks,        setChecks]         = useState({});      // { 'eq_1': {statut,saving,saved}, 'se_3': ... }
  const [observations,  setObservations]   = useState({});      // { 'eq_1': 'texte', 'se_3': '...' }
  const [loading,       setLoading]        = useState(true);
  const [erreur,        setErreur]         = useState('');

  useEffect(() => {
    const charger = async () => {
      try {
        const [eqRes, seRes, vRes, vSeRes] = await Promise.all([
          equipementsAPI.getAll(),
          sousEquipAPI.getAll(),
          verificationsAPI.getAujourdhui(),
          verificationsAPI.getAujourdhuiSousEquip(),
        ]);

        setEquipements(eqRes.data || []);
        setSousEquips(seRes.data  || []);

        const map = {};
        const obs = {};
        (vRes.data || []).forEach(v => {
          map[`eq_${v.equipement_id}`] = { statut: v.statut, saved: true };
          obs[`eq_${v.equipement_id}`] = v.observation || '';
        });
        (vSeRes.data || []).forEach(v => {
          map[`se_${v.sous_equip_id}`] = { statut: v.statut, saved: true };
          obs[`se_${v.sous_equip_id}`] = v.observation || '';
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

  const cocherEquip = useCallback(async (eq, statut) => {
    const k = `eq_${eq.id}`;
    setChecks(prev => ({ ...prev, [k]: { statut, saving: true, saved: false } }));
    try {
      await verificationsAPI.sauvegarder({
        equipement_id:  eq.id,
        equipement_nom: eq.nom,
        statut,
        observation: observations[k] || null,
      });
      setChecks(prev => ({ ...prev, [k]: { statut, saving: false, saved: true } }));
    } catch {
      setChecks(prev => ({ ...prev, [k]: { statut, saving: false, saved: false, erreur: true } }));
    }
  }, [observations]);

  const cocherSousEquip = useCallback(async (se, statut) => {
    const k = `se_${se.id}`;
    setChecks(prev => ({ ...prev, [k]: { statut, saving: true, saved: false } }));
    try {
      await verificationsAPI.sauvegarderSousEquip({
        sous_equip_id:  se.id,
        sous_equip_nom: se.nom,
        equipement_id:  se.equipement_id,
        equipement_nom: se.equipement_nom,
        statut,
        observation: observations[k] || null,
      });
      setChecks(prev => ({ ...prev, [k]: { statut, saving: false, saved: true } }));
    } catch {
      setChecks(prev => ({ ...prev, [k]: { statut, saving: false, saved: false, erreur: true } }));
    }
  }, [observations]);

  const sauvegarderObs = useCallback(async (key, isEquip, item) => {
    const current = checks[key];
    if (!current?.statut) return;
    setChecks(prev => ({ ...prev, [key]: { ...current, saving: true, saved: false } }));
    try {
      if (isEquip) {
        await verificationsAPI.sauvegarder({
          equipement_id: item.id, equipement_nom: item.nom,
          statut: current.statut, observation: observations[key] || null,
        });
      } else {
        await verificationsAPI.sauvegarderSousEquip({
          sous_equip_id: item.id, sous_equip_nom: item.nom,
          equipement_id: item.equipement_id, equipement_nom: item.equipement_nom,
          statut: current.statut, observation: observations[key] || null,
        });
      }
      setChecks(prev => ({ ...prev, [key]: { ...current, saving: false, saved: true } }));
    } catch {
      setChecks(prev => ({ ...prev, [key]: { ...current, saving: false, erreur: true } }));
    }
  }, [checks, observations]);

  // Compteurs pour la barre de progression
  const totalItems  = equipements.length + sousEquips.length;
  const verifies    = Object.keys(checks).filter(k => checks[k]?.statut).length;
  const nbOk        = Object.values(checks).filter(c => c.statut === 'ok').length;
  const nbPb        = Object.values(checks).filter(c => c.statut === 'probleme').length;
  const nbHs        = Object.values(checks).filter(c => c.statut === 'hors_service').length;
  const pct         = totalItems > 0 ? Math.round((verifies / totalItems) * 100) : 0;
  const complet     = verifies === totalItems && totalItems > 0;

  // Groupement : pour chaque équipement, on liste ses sous-équipements juste après
  const grouped = equipements.map(eq => ({
    equip:    eq,
    sousEqs:  sousEquips.filter(se => se.equipement_id === eq.id),
  }));

  const renderCard = (key, nom, isEquip, item, subtitle = null) => {
    const check   = checks[key];
    const statut  = check?.statut;
    const saving  = check?.saving;
    const saved   = check?.saved;
    const hasErr  = check?.erreur;
    const needObs = statut === 'probleme' || statut === 'hors_service';
    const cfg     = STATUTS.find(s => s.value === statut);

    return (
      <div key={key}
        className={`bg-white rounded-xl border-2 shadow-sm transition-all duration-200 overflow-hidden ${
          isEquip ? '' : 'ml-6 border-l-4'
        } ${
          statut === 'ok'           ? 'border-emerald-200' :
          statut === 'probleme'     ? 'border-amber-300'   :
          statut === 'hors_service' ? 'border-red-300'     :
          'border-gray-100'
        }`}
      >
        <div className="flex items-center justify-between px-4 py-3 gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-xl flex-shrink-0 ${
              statut ? cfg?.bg : isEquip ? 'bg-gray-100' : 'bg-slate-50'
            }`}>
              {statut ? cfg?.icon : isEquip ? '❓' : '🔩'}
            </div>
            <div className="min-w-0">
              <p className={`font-semibold text-gray-900 truncate ${isEquip ? 'text-sm' : 'text-xs'}`}>{nom}</p>
              {subtitle && <p className="text-xs text-gray-400">{subtitle}</p>}
              {!subtitle && <p className="text-xs text-gray-400">{isEquip ? `ID #${item.id}` : `Sous-équip. #${item.id}`}</p>}
            </div>
          </div>

          <div className="flex gap-1.5 flex-shrink-0">
            {STATUTS.map(s => (
              <button
                key={s.value}
                onClick={() => isEquip ? cocherEquip(item, s.value) : cocherSousEquip(item, s.value)}
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

          <div className="w-5 flex-shrink-0 text-center">
            {saving  && <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto"/>}
            {saved   && !saving && <span className="text-emerald-500 text-sm">✓</span>}
            {hasErr  && !saving && <span className="text-red-500 text-sm">!</span>}
          </div>
        </div>

        {needObs && (
          <div className={`px-4 pb-3 border-t ${cfg?.light} border`}>
            <label className="block text-xs font-semibold text-gray-600 mt-2 mb-1">
              Observation / Détail du problème
            </label>
            <div className="flex gap-2">
              <textarea
                value={observations[key] || ''}
                onChange={e => setObservations(prev => ({ ...prev, [key]: e.target.value }))}
                rows={2}
                placeholder="Décrivez le problème constaté..."
                className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
              <button
                onClick={() => sauvegarderObs(key, isEquip, item)}
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
  };

  return (
    <div className="p-6 bg-gray-50 min-h-full">

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

        <div className="mt-4 bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-gray-700">Progression du jour</span>
            <span className="text-sm font-bold text-blue-900">{verifies} / {totalItems} éléments</span>
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
              <span className="w-2.5 h-2.5 rounded-full bg-gray-300 inline-block"/> {totalItems - verifies} Non vérifié
            </span>
          </div>
        </div>
      </div>

      {erreur && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{erreur}</div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-900"/>
        </div>
      ) : totalItems === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <div className="text-5xl mb-3">⚙️</div>
          <p className="text-sm">Aucun équipement à vérifier.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {grouped.map(({ equip, sousEqs }) => (
            <div key={`grp_${equip.id}`} className="space-y-2">
              {renderCard(`eq_${equip.id}`, equip.nom, true, equip)}
              {sousEqs.map(se =>
                renderCard(`se_${se.id}`, se.nom, false, se, `↳ ${equip.nom}`)
              )}
            </div>
          ))}
        </div>
      )}

      {complet && (
        <div className="mt-6 p-5 bg-emerald-50 border border-emerald-200 rounded-xl text-center">
          <div className="text-4xl mb-2">🎉</div>
          <p className="font-bold text-emerald-800 text-lg">Vérification journalière terminée !</p>
          <p className="text-emerald-600 text-sm mt-1">
            {nbOk} OK · {nbPb} problème(s) · {nbHs} hors service
          </p>
          {(nbPb > 0 || nbHs > 0) && (
            <p className="text-amber-700 text-sm mt-2 font-semibold">
              ⚠️ {nbPb + nbHs} élément(s) à signaler au responsable.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

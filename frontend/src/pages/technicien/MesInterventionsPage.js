// ============================================================
// PAGE MES INTERVENTIONS (TECHNICIEN)
// Section 1 : interventions préventives planifiées
// Section 2 : fiches terrain soumises via QR
// ============================================================
import React, { useEffect, useMemo, useState } from 'react';
import { monitoringAPI, kpiAPI } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { calculerMTTR } from '../../utils/mttr';

const statuts = ['Planifiee', 'En cours', 'Terminee', 'Reportee'];

const getDelaiLabel = (tache) => {
  const j = parseInt(tache.jours_avant);
  const depuis = parseInt(tache.jours_depuis);
  const statut = tache.statut;
  if (['Terminee', 'Cloturee', 'Validee'].includes(statut)) return null;
  if (depuis > 0)  return { label: `En retard (+${depuis}j)`, cls: 'bg-red-100 text-red-700 border-red-200' };
  if (j === 0)     return { label: "Aujourd'hui", cls: 'bg-orange-100 text-orange-700 border-orange-200' };
  if (j === 1)     return { label: 'Demain',       cls: 'bg-amber-100 text-amber-700 border-amber-200' };
  if (j <= 3)      return { label: `J-${j}`,       cls: 'bg-yellow-100 text-yellow-700 border-yellow-200' };
  if (j <= 7)      return { label: `J-${j}`,       cls: 'bg-blue-100 text-blue-700 border-blue-200' };
  return null;
};

const STATUT_FICHE = {
  'En attente': { bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'En attente' },
  'Validee':    { bg: 'bg-green-100',  text: 'text-green-800',  label: 'Validée'    },
  'Rejetee':    { bg: 'bg-red-100',    text: 'text-red-800',    label: 'Rejetée'    },
};

const formatDate = (value) => {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('fr-FR');
};

const extraireDetails = (description = '') => {
  return description.split('|').reduce((acc, item) => {
    const [cle, ...reste] = item.trim().split(':');
    if (cle && reste.length) acc[cle.trim().toLowerCase()] = reste.join(':').trim();
    return acc;
  }, {});
};

export default function MesInterventionsPage() {
  const { user } = useAuth();

  /* ── Tâches préventives (filtrées côté serveur) ── */
  const [taches, setTaches]             = useState([]);
  const [loading, setLoading]           = useState(true);
  const [erreur, setErreur]             = useState('');
  const [message, setMessage]           = useState('');
  const [filtreStatut, setFiltreStatut] = useState('Tous');
  const [searchTerm, setSearchTerm]     = useState('');

  /* ── Fiches terrain ── */
  const [fiches, setFiches]               = useState([]);
  const [fichesLoading, setFichesLoading] = useState(true);
  const [filtreFiche, setFiltreFiche]     = useState('Toutes');

  const nomTechnicien = `${user?.prenom || ''} ${user?.nom || ''}`.trim().toLowerCase();

  const chargerTout = async () => {
    setLoading(true);
    setFichesLoading(true);
    setErreur('');
    try {
      const [tachesRes, stagRes] = await Promise.all([
        kpiAPI.getMesTachesPreventives(),
        monitoringAPI.getInterventionsStaging(),
      ]);
      setTaches(tachesRes.data || []);

      const mesFiches = (stagRes.data || []).filter((f) =>
        f.technicien?.toLowerCase().includes(nomTechnicien) || nomTechnicien.includes(f.technicien?.toLowerCase())
      );
      setFiches(mesFiches);
    } catch (err) {
      setErreur(err.response?.data?.message || 'Erreur lors du chargement.');
    } finally {
      setLoading(false);
      setFichesLoading(false);
    }
  };

  useEffect(() => { chargerTout(); }, []);

  /* ── Tâches préventives filtrées (déjà filtrées par technicien côté serveur) ── */
  const interventionsPreventives = useMemo(() => {
    return taches.filter((i) => {
      const statutOk = filtreStatut === 'Tous' || i.statut === filtreStatut;
      const texte    = `${i.description || ''} ${i.technicien || ''}`.toLowerCase();
      return statutOk && texte.includes(searchTerm.toLowerCase());
    });
  }, [taches, filtreStatut, searchTerm]);

  const stats = useMemo(() => ({
    total:    interventionsPreventives.length,
    aFaire:   interventionsPreventives.filter((i) => i.statut === 'Planifiee').length,
    enCours:  interventionsPreventives.filter((i) => i.statut === 'En cours').length,
    terminees:interventionsPreventives.filter((i) => i.statut === 'Terminee').length,
  }), [interventionsPreventives]);

  /* ── Fiches terrain filtrées ── */
  const fichesFiltrees = useMemo(() => {
    if (filtreFiche === 'Toutes') return fiches;
    return fiches.filter((f) => f.statut === filtreFiche);
  }, [fiches, filtreFiche]);

  const statsFiches = useMemo(() => ({
    attente: fiches.filter((f) => f.statut === 'En attente').length,
    validee: fiches.filter((f) => f.statut === 'Validee').length,
    rejetee: fiches.filter((f) => f.statut === 'Rejetee').length,
  }), [fiches]);

  const changerStatut = async (tache, statut) => {
    try {
      setErreur(''); setMessage('');
      await monitoringAPI.updateIntervention(tache.id, {
        date_intervention: tache.date_intervention,
        type_intervention: 'Preventive',
        description:       tache.description,
        technicien:        tache.technicien,
        statut,
        cout:              tache.cout || 0,
      });
      setMessage('Statut mis à jour.');
      const res = await kpiAPI.getMesTachesPreventives();
      setTaches(res.data || []);
    } catch (err) {
      setErreur(err.response?.data?.message || 'Erreur lors de la mise à jour.');
    }
  };

  return (
    <div className="p-6 space-y-8 bg-gray-50 min-h-full">

      {/* ══ En-tête ══════════════════════════════════════════ */}
      <div className="flex flex-wrap justify-between items-start gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Mes Interventions</h1>
          <p className="text-sm text-gray-500 mt-0.5">Planification reçue + fiches terrain soumises</p>
        </div>
        <button onClick={chargerTout}
          className="px-4 py-2 bg-blue-900 text-white rounded-lg hover:bg-blue-800 text-sm font-medium transition">
          Actualiser
        </button>
      </div>

      {(erreur || message) && (
        <div className={`p-3 rounded-lg border text-sm ${erreur ? 'bg-red-50 border-red-200 text-red-700' : 'bg-green-50 border-green-200 text-green-700'}`}>
          {erreur || message}
        </div>
      )}

      {/* ══ SECTION 1 : Interventions planifiées ════════════ */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-1 h-6 bg-blue-900 rounded-full"></div>
          <h2 className="text-lg font-bold text-gray-800">Interventions planifiées</h2>
          <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded-full text-xs font-semibold">{interventionsPreventives.length}</span>
        </div>

        {/* Stats planifiées */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Total',     value: stats.total,     color: 'bg-white border-gray-200',       text: 'text-blue-900'  },
            { label: 'À faire',   value: stats.aFaire,    color: 'bg-indigo-50 border-indigo-200',  text: 'text-indigo-700'},
            { label: 'En cours',  value: stats.enCours,   color: 'bg-amber-50 border-amber-200',    text: 'text-amber-700' },
            { label: 'Terminées', value: stats.terminees, color: 'bg-emerald-50 border-emerald-200',text: 'text-emerald-700'},
          ].map((s) => (
            <div key={s.label} className={`${s.color} border rounded-xl p-4 shadow-sm`}>
              <p className="text-xs text-gray-500 font-medium">{s.label}</p>
              <p className={`text-2xl font-bold ${s.text}`}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Table planifiées */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-4 border-b border-gray-100 flex flex-wrap gap-3 items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">Mes tâches préventives assignées</h3>
            <div className="flex flex-wrap gap-2">
              <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Rechercher..." className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none w-44"/>
              <select value={filtreStatut} onChange={(e) => setFiltreStatut(e.target.value)}
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none">
                <option>Tous</option>
                {statuts.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {loading ? (
            <div className="p-8 text-center text-gray-400">Chargement...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Équipement</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Tâches</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Planification</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Statut</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {interventionsPreventives.map((intervention, idx) => {
                    const details = extraireDetails(intervention.description);
                    const delai   = getDelaiLabel(intervention);
                    return (
                      <tr key={intervention.id} className={`hover:bg-gray-50 align-top ${idx % 2 === 1 ? 'bg-gray-50/50' : ''}`}>
                        <td className="px-4 py-3 text-sm font-medium text-gray-900 whitespace-nowrap">
                          {formatDate(intervention.date_intervention)}
                          {delai && (
                            <span className={`ml-2 px-2 py-0.5 rounded-full text-xs font-semibold border ${delai.cls}`}>
                              {delai.label}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <p className="font-semibold text-gray-800">{details.equipement || '-'}</p>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 max-w-xs">{details.taches || intervention.description || '-'}</td>
                        <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                          <div>Heure : {details.heure || '-'}</div>
                          <div>Périodicité : {details.periodicite || '-'}</div>
                          <div>Priorité : {details.priorite || '-'}</div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <select value={intervention.statut || 'Planifiee'}
                            onChange={(e) => changerStatut(intervention, e.target.value)}
                            className="px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none">
                            {statuts.map((s) => <option key={s}>{s}</option>)}
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {interventionsPreventives.length === 0 && (
                <div className="p-10 text-center text-gray-400 text-sm">Aucune intervention planifiée.</div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ══ SECTION 2 : Fiches terrain soumises ════════════ */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-1 h-6 bg-emerald-600 rounded-full"></div>
          <h2 className="text-lg font-bold text-gray-800">Mes fiches terrain soumises</h2>
          <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full text-xs font-semibold">{fiches.length}</span>
        </div>

        {/* Stats fiches */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'En attente', value: statsFiches.attente, color: 'bg-yellow-50 border-yellow-200', text: 'text-yellow-700', icon: '⏳' },
            { label: 'Validées',   value: statsFiches.validee, color: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700', icon: '✅' },
            { label: 'Rejetées',   value: statsFiches.rejetee, color: 'bg-red-50 border-red-200',   text: 'text-red-700',     icon: '❌' },
          ].map((s) => (
            <div key={s.label} className={`${s.color} border rounded-xl p-4 shadow-sm flex items-center gap-3`}>
              <span className="text-2xl">{s.icon}</span>
              <div>
                <p className="text-xs text-gray-500 font-medium">{s.label}</p>
                <p className={`text-2xl font-bold ${s.text}`}>{s.value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Filtres fiches */}
        <div className="flex gap-2 flex-wrap">
          {['Toutes', 'En attente', 'Validee', 'Rejetee'].map((f) => (
            <button key={f} onClick={() => setFiltreFiche(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                filtreFiche === f ? 'bg-blue-900 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}>
              {f === 'Validee' ? 'Validées' : f === 'Rejetee' ? 'Rejetées' : f}
            </button>
          ))}
        </div>

        {/* Cartes fiches */}
        {fichesLoading ? (
          <div className="p-8 text-center text-gray-400">Chargement...</div>
        ) : fichesFiltrees.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 p-10 text-center text-gray-400 shadow-sm">
            <div className="text-4xl mb-2">📋</div>
            <p className="text-sm">Aucune fiche soumise{filtreFiche !== 'Toutes' ? ` (${filtreFiche})` : ''}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {fichesFiltrees.map((f) => {
              const statutCfg = STATUT_FICHE[f.statut] || STATUT_FICHE['En attente'];
              const mttr      = calculerMTTR(f.date_intervention, f.heure, f.date_cloture, f.heure_cloture);
              const enCours   = f.action === 'Ouverture' && !f.date_cloture && f.statut === 'En attente';
              return (
                <div key={f.id} className={`bg-white rounded-xl border shadow-sm p-4 space-y-3 transition ${enCours ? 'border-amber-300 ring-1 ring-amber-100' : 'border-gray-100 hover:border-blue-200'}`}>
                  {/* Header carte */}
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2 flex-wrap">
                      {enCours ? (
                        <span className="px-2.5 py-1 rounded-full text-xs font-bold border bg-amber-50 text-amber-700 border-amber-200">
                          🔴 En cours
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded-full text-xs font-bold border bg-emerald-50 text-emerald-700 border-emerald-200">
                          🔒 Clôturée
                        </span>
                      )}
                      <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${statutCfg.bg} ${statutCfg.text}`}>
                        {statutCfg.label}
                      </span>
                      {mttr && (
                        <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-green-50 text-green-700 border border-green-200">
                          ⏱ {mttr}
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-gray-400 font-mono">#{f.id}</span>
                  </div>

                  {/* Timeline ouverture → clôture */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-green-50 border border-green-100 rounded-lg px-3 py-2">
                      <p className="text-xs text-green-600 font-bold mb-0.5">🔓 Ouverture</p>
                      <p className="text-sm font-semibold text-gray-800">{formatDate(f.date_intervention)}</p>
                      <p className="text-xs text-blue-700 font-bold">{f.heure || '—'}</p>
                    </div>
                    <div className={`${f.date_cloture ? 'bg-blue-50 border-blue-100' : 'bg-gray-50 border-gray-100'} border rounded-lg px-3 py-2`}>
                      <p className={`text-xs font-bold mb-0.5 ${f.date_cloture ? 'text-blue-600' : 'text-gray-400'}`}>🔒 Clôture</p>
                      {f.date_cloture ? (
                        <>
                          <p className="text-sm font-semibold text-gray-800">{formatDate(f.date_cloture)}</p>
                          <p className="text-xs text-blue-700 font-bold">{f.heure_cloture || '—'}</p>
                        </>
                      ) : (
                        <p className="text-sm text-gray-400 italic">En attente…</p>
                      )}
                    </div>
                  </div>

                  {/* Équipement + type */}
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-xs text-gray-400 font-medium">Équipement</p>
                      <p className="text-gray-800 font-semibold">{f.equipement || '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 font-medium">Type</p>
                      <p className="text-gray-800 font-semibold">{f.type_intervention}</p>
                    </div>
                  </div>

                  {/* Observations ouverture */}
                  {f.description && (
                    <div className="bg-gray-50 rounded-lg px-3 py-2">
                      <p className="text-xs text-gray-400 font-medium mb-0.5">Observations (ouverture)</p>
                      <p className="text-sm text-gray-700">{f.description}</p>
                    </div>
                  )}

                  {/* Travaux effectués (clôture) */}
                  {f.description_cloture && (
                    <div className="bg-blue-50 rounded-lg px-3 py-2">
                      <p className="text-xs text-blue-500 font-bold mb-0.5">Travaux effectués (clôture)</p>
                      <p className="text-sm text-blue-800">{f.description_cloture}</p>
                    </div>
                  )}

                  {/* Intervention liée */}
                  {f.intervention_id && (
                    <span className="inline-block px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-full text-xs font-semibold">
                      Liée à l'intervention planifiée #{f.intervention_id}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

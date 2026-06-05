// ============================================================
// PAGE PLANIFICATION PREVENTIVE (RESPONSABLE)
// Ultra-premium modern planification & scheduling interface
// ============================================================
import React, { useEffect, useMemo, useState } from 'react';
import { equipementsAPI, monitoringAPI, usersAPI } from '../../api';

const initialForm = {
  equipementId: '',
  date_intervention: '',
  heure: '09:00',
  technicien: '',
  priorite: 'Normale',
  periodicite: 'Mensuelle',
  duree: '2',
  taches: 'Inspection generale, nettoyage et controle des points sensibles',
  commentaire: '',
};

const statuts = ['Planifiee', 'En cours', 'Terminee', 'Reportee'];
const periodicites = ['Hebdomadaire', 'Mensuelle', 'Trimestrielle', 'Semestrielle', 'Annuelle'];
const priorites = ['Basse', 'Normale', 'Haute', 'Critique'];

// Helpers de parsing pour la vue premium
const parseTechnicien = (str) => {
  if (!str) return { name: '-', email: '' };
  const match = str.match(/^(.*?)\s*<(.*?)>$/);
  if (match) {
    return { name: match[1].trim(), email: match[2].trim() };
  }
  return { name: str, email: '' };
};

const parseDescription = (desc) => {
  const details = {};
  if (!desc) return details;
  if (!desc.includes(' | ')) {
    details.Taches = desc;
    return details;
  }
  const parts = desc.split(' | ');
  parts.forEach(part => {
    const match = part.match(/^(.*?):\s*(.*)$/);
    if (match) {
      details[match[1].trim()] = match[2].trim();
    }
  });
  return details;
};

const PlanificationPreventivePage = () => {
  const [equipements, setEquipements] = useState([]);
  const [techniciens, setTechniciens] = useState([]);
  const [interventions, setInterventions] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [filtreStatut, setFiltreStatut] = useState('Tous');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [erreur, setErreur] = useState('');

  const chargerDonnees = async () => {
    try {
      setLoading(true);
      setErreur('');

      const [equipementsResponse, interventionsResponse, techniciensResponse] = await Promise.all([
        equipementsAPI.getAll(),
        monitoringAPI.getInterventions(),
        usersAPI.getTechniciens(),
      ]);

      setEquipements(equipementsResponse.data || []);
      setInterventions(interventionsResponse.data || []);
      setTechniciens(techniciensResponse.data || []);
    } catch (err) {
      setErreur(err.response?.data?.message || 'Erreur lors du chargement des donnees.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    chargerDonnees();
  }, []);

  const interventionsPreventives = useMemo(() => {
    return interventions
      .filter((intervention) => intervention.type_intervention === 'Preventive')
      .filter((intervention) => {
        const statutOk = filtreStatut === 'Tous' || intervention.statut === filtreStatut;
        const texte = `${intervention.description || ''} ${intervention.technicien || ''}`.toLowerCase();
        const rechercheOk = texte.includes(searchTerm.toLowerCase());
        return statutOk && rechercheOk;
      });
  }, [interventions, filtreStatut, searchTerm]);

  const stats = useMemo(() => {
    const total = interventionsPreventives.length;
    const planifiees = interventionsPreventives.filter((item) => item.statut === 'Planifiee').length;
    const enCours = interventionsPreventives.filter((item) => item.statut === 'En cours').length;
    const terminees = interventionsPreventives.filter((item) => item.statut === 'Terminee').length;

    return { total, planifiees, enCours, terminees };
  }, [interventionsPreventives]);

  const handleChange = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setErreur('');
    setMessage('');

    const equipement = equipements.find((item) => String(item.id) === String(form.equipementId));
    if (!equipement) {
      setErreur('Veuillez selectionner un equipement.');
      return;
    }

    const technicien = techniciens.find((item) => String(item.id) === String(form.technicien));
    const technicienLibelle = technicien
      ? `${technicien.prenom} ${technicien.nom} <${technicien.email}>`
      : form.technicien;

    const description = [
      `Equipement: ${equipement.nom}`,
      `Heure: ${form.heure}`,
      `Periodicite: ${form.periodicite}`,
      `Priorite: ${form.priorite}`,
      `Duree estimee: ${form.duree} h`,
      `Taches: ${form.taches}`,
      form.commentaire ? `Commentaire: ${form.commentaire}` : '',
    ].filter(Boolean).join(' | ');

    try {
      setSaving(true);
      await monitoringAPI.addIntervention({
        date_intervention: form.date_intervention,
        type_intervention: 'Preventive',
        description,
        technicien: technicienLibelle,
        statut: 'Planifiee',
        cout: 0,
      });

      setMessage('Intervention preventive planifiee avec succes.');
      setForm(initialForm);
      await chargerDonnees();
    } catch (err) {
      setErreur(err.response?.data?.message || 'Erreur lors de la planification.');
    } finally {
      setSaving(false);
    }
  };

  const supprimerIntervention = async (id) => {
    if (!window.confirm('Supprimer cette intervention planifiée ?')) return;
    try {
      setErreur('');
      setMessage('');
      await monitoringAPI.deleteIntervention(id);
      setMessage('Intervention supprimée.');
      await chargerDonnees();
    } catch (err) {
      setErreur(err.response?.data?.message || 'Erreur lors de la suppression.');
    }
  };

  // Obtenir la classe css d'un badge de statut
  const getStatusBadgeClass = (status) => {
    switch (status) {
      case 'Planifiee':
        return 'bg-indigo-50 text-indigo-700 border border-indigo-200';
      case 'En cours':
        return 'bg-amber-50 text-amber-700 border border-amber-200';
      case 'Terminee':
        return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
      case 'Reportee':
        return 'bg-rose-50 text-rose-700 border border-rose-200';
      default:
        return 'bg-slate-50 text-slate-700 border border-slate-200';
    }
  };

  return (
    <div className="p-6 space-y-6 bg-slate-50/50 min-h-screen">
      {/* En-tête */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight">Planification Préventive</h1>
          <p className="text-xs text-slate-500 mt-1 font-medium">
            Programmez, suivez et optimisez la maintenance préventive de vos équipements industriels.
          </p>
        </div>
        <div className="px-3.5 py-1.5 bg-white border border-slate-100 rounded-xl shadow-sm text-xs font-bold text-slate-700">
          🔋 {interventionsPreventives.length} intervention(s) programmée(s)
        </div>
      </div>

      {/* Alertes d'état */}
      {(erreur || message) && (
        <div className={`p-4 rounded-xl border flex items-center gap-3 text-xs font-medium shadow-sm transition-all duration-300 ${erreur ? 'bg-red-50 border-red-200 text-red-700' : 'bg-emerald-50 border-emerald-200 text-emerald-800'}`}>
          {erreur ? (
            <svg className="w-5 h-5 text-red-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          ) : (
            <svg className="w-5 h-5 text-emerald-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          )}
          <span>{erreur || message}</span>
        </div>
      )}

      {/* Cartes statistiques haut de gamme */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600 text-lg shadow-inner">📋</div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Préventif</p>
            <p className="text-xl font-extrabold text-slate-800 mt-1">{stats.total}</p>
          </div>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600 text-lg shadow-inner">📅</div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Planifiées</p>
            <p className="text-xl font-extrabold text-indigo-900 mt-1">{stats.planifiees}</p>
          </div>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 bg-amber-50 rounded-xl flex items-center justify-center text-amber-600 text-lg shadow-inner">⚡</div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">En cours</p>
            <p className="text-xl font-extrabold text-amber-800 mt-1">{stats.enCours}</p>
          </div>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600 text-lg shadow-inner">✅</div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Terminées</p>
            <p className="text-xl font-extrabold text-emerald-800 mt-1">{stats.terminees}</p>
          </div>
        </div>
      </div>

      {/* Formulaire + Planning empilés */}
      <div className="flex flex-col gap-6">
        {/* Formulaire */}
        <form onSubmit={handleSubmit} className="bg-white border border-slate-100 rounded-2xl shadow-sm p-6 space-y-5">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
            <svg className="w-5 h-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h2 className="text-sm font-bold text-slate-800">Planifier une intervention</h2>
          </div>

          {/* Équipement */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Équipement cible *</label>
            <select
              value={form.equipementId}
              onChange={(e) => handleChange('equipementId', e.target.value)}
              required
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none transition-all duration-200"
            >
              <option value="">Sélectionner l'équipement</option>
              {equipements.map((equipement) => (
                <option key={equipement.id} value={equipement.id}>
                  #{equipement.id} - {equipement.nom}
                </option>
              ))}
            </select>
          </div>

          {/* Date & Heure */}
          <div className="grid grid-cols-2 gap-3.5">
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Date *</label>
              <input
                type="date"
                value={form.date_intervention}
                onChange={(e) => handleChange('date_intervention', e.target.value)}
                required
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none transition-all duration-200"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Heure</label>
              <input
                type="time"
                value={form.heure}
                onChange={(e) => handleChange('heure', e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none transition-all duration-200"
              />
            </div>
          </div>

          {/* Technicien */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Technicien affecté *</label>
            <select
              value={form.technicien}
              onChange={(e) => handleChange('technicien', e.target.value)}
              required
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none transition-all duration-200"
            >
              <option value="">Sélectionner le technicien</option>
              {techniciens.map((technicien) => (
                <option key={technicien.id} value={technicien.id}>
                  {technicien.prenom} {technicien.nom}
                </option>
              ))}
            </select>
          </div>

          {/* Périodicité & Priorité */}
          <div className="grid grid-cols-2 gap-3.5">
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Périodicité</label>
              <select
                value={form.periodicite}
                onChange={(e) => handleChange('periodicite', e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none transition-all duration-200"
              >
                {periodicites.map((item) => <option key={item}>{item}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Priorité</label>
              <select
                value={form.priorite}
                onChange={(e) => handleChange('priorite', e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none transition-all duration-200"
              >
                {priorites.map((item) => <option key={item}>{item}</option>)}
              </select>
            </div>
          </div>

          {/* Durée estimée */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Durée estimée (heures)</label>
            <input
              type="number"
              min="0.5"
              step="0.5"
              value={form.duree}
              onChange={(e) => handleChange('duree', e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none transition-all duration-200"
            />
          </div>

          {/* Tâches */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Tâches prévues *</label>
            <textarea
              value={form.taches}
              onChange={(e) => handleChange('taches', e.target.value)}
              rows={3}
              required
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none transition-all duration-200"
            />
          </div>

          {/* Commentaire */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Commentaire interne</label>
            <textarea
              value={form.commentaire}
              onChange={(e) => handleChange('commentaire', e.target.value)}
              rows={2}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none transition-all duration-200"
              placeholder="Instructions ou remarques particulières..."
            />
          </div>

          {/* Bouton de soumission */}
          <button
            type="submit"
            disabled={saving}
            className="w-full py-3 bg-indigo-900 text-white rounded-xl hover:bg-indigo-800 text-xs font-bold shadow-md hover:shadow-lg disabled:opacity-60 transition-all duration-200 flex items-center justify-center gap-2"
          >
            {saving ? (
              <>
                <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>Planification en cours...</span>
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span>Planifier l'Intervention</span>
              </>
            )}
          </button>
        </form>

        {/* Planning préventif */}
        <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
          {/* Entête de liste avec filtres et recherche */}
          <div className="p-5 border-b border-slate-100 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between bg-gradient-to-r from-slate-50/50 to-white">
            <div>
              <h2 className="text-sm font-bold text-slate-800">Planning Préventif Actif</h2>
              <p className="text-[10px] text-slate-400 mt-0.5">Suivi en temps réel des récurrences planifiées</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3.5">
              {/* Recherche */}
              <div className="relative flex items-center">
                <svg className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Rechercher technicien, tâche..."
                  className="pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none transition-all duration-200"
                />
              </div>

              {/* Filtre */}
              <div className="relative flex items-center">
                <select
                  value={filtreStatut}
                  onChange={(e) => setFiltreStatut(e.target.value)}
                  className="pl-3 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none transition-all duration-200 appearance-none"
                >
                  <option>Tous</option>
                  {statuts.map((item) => <option key={item}>{item}</option>)}
                </select>
                <svg className="w-4 h-4 text-slate-400 absolute right-2.5 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
          </div>

          {/* Table list */}
          {loading ? (
            <div className="p-16 flex flex-col items-center justify-center gap-3 text-slate-400">
              <svg className="animate-spin h-8 w-8 text-indigo-600" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span className="text-xs font-bold tracking-wider">Chargement du planning...</span>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead className="bg-slate-50 border-b border-slate-100">
                  <tr>
                    <th className="px-5 py-3.5 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Date programmée</th>
                    <th className="px-5 py-3.5 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Intervenant</th>
                    <th className="px-5 py-3.5 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Fiche Technique / Détails</th>
                    <th className="px-5 py-3.5 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Statut</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-100">
                  {interventionsPreventives.map((intervention) => {
                    const tech = parseTechnicien(intervention.technicien);
                    const details = parseDescription(intervention.description);
                    const initials = tech.name
                      .split(' ')
                      .map((n) => n[0])
                      .join('')
                      .substring(0, 2)
                      .toUpperCase();

                    return (
                      <tr key={intervention.id} className="hover:bg-slate-50/40 align-top transition-all duration-150">
                        {/* Cellule 1 : Date Premium */}
                        <td className="px-5 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 shrink-0 bg-indigo-50 border border-indigo-100 rounded-xl flex flex-col items-center justify-center text-indigo-700 shadow-sm">
                              <span className="text-[9px] font-black uppercase tracking-wider -mb-0.5">
                                {new Date(intervention.date_intervention).toLocaleDateString('fr-FR', { month: 'short' }).replace('.', '').substring(0, 3)}
                              </span>
                              <span className="text-sm font-extrabold leading-none">
                                {new Date(intervention.date_intervention).toLocaleDateString('fr-FR', { day: '2-digit' })}
                              </span>
                            </div>
                            <div className="text-left">
                              <span className="text-xs font-bold text-slate-800 capitalize">
                                {new Date(intervention.date_intervention).toLocaleDateString('fr-FR', { weekday: 'long' })}
                              </span>
                              <p className="text-[10px] text-slate-400 mt-0.5 font-medium">Récurrent</p>
                            </div>
                          </div>
                        </td>

                        {/* Cellule 2 : Intervenant Premium */}
                        <td className="px-5 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-indigo-600 to-indigo-700 text-white flex items-center justify-center font-black text-[11px] shadow-sm border-2 border-white ring-2 ring-indigo-50">
                              {initials}
                            </div>
                            <div className="text-left">
                              <p className="text-xs font-bold text-slate-800 leading-tight">{tech.name}</p>
                              <p className="text-[10px] text-slate-400 mt-0.5 font-medium">{tech.email}</p>
                            </div>
                          </div>
                        </td>

                        {/* Cellule 3 : Fiche Technique & Grid de Détails */}
                        <td className="px-5 py-4 text-xs text-slate-700 max-w-xl">
                          <div className="space-y-3.5">
                            {/* Badges de structure */}
                            <div className="flex flex-wrap items-center gap-2">
                              {/* Nom équipement */}
                              <span className="px-2.5 py-0.5 bg-slate-800 text-white rounded-md text-[10px] font-extrabold shadow-sm">
                                🔌 {details.Equipement || 'Équipement'}
                              </span>

                              {/* Priorité */}
                              {details.Priorite && (
                                <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold shadow-sm ${
                                  details.Priorite === 'Critique'
                                    ? 'bg-rose-500 text-white border border-rose-600 animate-pulse'
                                    : details.Priorite === 'Haute'
                                    ? 'bg-orange-100 text-orange-800 border border-orange-200'
                                    : details.Priorite === 'Normale'
                                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                    : 'bg-slate-100 text-slate-600 border border-slate-200'
                                }`}>
                                  ⚠️ {details.Priorite}
                                </span>
                              )}

                              {/* Périodicité */}
                              {details.Periodicite && (
                                <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                                  details.Periodicite === 'Hebdomadaire'
                                    ? 'bg-purple-50 text-purple-700 border-purple-200'
                                    : details.Periodicite === 'Mensuelle'
                                    ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                                    : details.Periodicite === 'Trimestrielle'
                                    ? 'bg-sky-50 text-sky-700 border-sky-200'
                                    : details.Periodicite === 'Semestrielle'
                                    ? 'bg-teal-50 text-teal-700 border-teal-200'
                                    : 'bg-pink-50 text-pink-700 border-pink-200'
                                }`}>
                                  🔄 {details.Periodicite}
                                </span>
                              )}

                              {/* Durée estimée */}
                              {details['Duree estimee'] && (
                                <span className="px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-md text-[10px] font-bold">
                                  ⏳ {details['Duree estimee']}
                                </span>
                              )}

                              {/* Heure */}
                              {details.Heure && (
                                <span className="px-2 py-0.5 bg-slate-50 text-slate-600 border border-slate-200 rounded-md text-[10px] font-bold flex items-center gap-1">
                                  🕒 {details.Heure}
                                </span>
                              )}
                            </div>

                            {/* Bloc tâches */}
                            <div className="p-3 bg-slate-50/70 border border-slate-100 rounded-xl">
                              <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-1">Tâches planifiées</p>
                              <p className="text-xs font-semibold text-slate-700 leading-relaxed">
                                {details.Taches || details.description || '-'}
                              </p>
                            </div>

                            {/* Bloc commentaire */}
                            {details.Commentaire && (
                              <div className="pl-3 border-l-2 border-indigo-500 py-0.5">
                                <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-0.5">Remarque responsable</p>
                                <p className="text-xs font-medium italic text-slate-600">
                                  "{details.Commentaire}"
                                </p>
                              </div>
                            )}
                          </div>
                        </td>

                        {/* Cellule 4 : Statut (lecture seule) + Supprimer */}
                        <td className="px-5 py-4 whitespace-nowrap">
                          <div className="flex flex-col gap-2 items-start">
                            <span className={`px-3 py-1 rounded-xl text-xs font-bold shadow-sm ${getStatusBadgeClass(intervention.statut)}`}>
                              {intervention.statut || 'Planifiee'}
                            </span>
                            {intervention.statut === 'Planifiee' && (
                              <button
                                onClick={() => supprimerIntervention(intervention.id)}
                                className="px-2.5 py-1 text-[10px] font-bold text-rose-600 border border-rose-200 bg-rose-50 rounded-lg hover:bg-rose-100 transition-all"
                              >
                                Supprimer
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {interventionsPreventives.length === 0 && (
                <div className="p-16 flex flex-col items-center justify-center gap-3 text-slate-400 border-t border-slate-100">
                  <span className="text-2xl">🔋</span>
                  <p className="text-xs font-bold">Aucune intervention préventive trouvée pour ce filtrage.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PlanificationPreventivePage;

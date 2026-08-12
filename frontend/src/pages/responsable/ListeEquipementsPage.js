

import React, { useState, useEffect, useCallback } from 'react';
import { equipementsAPI, sousEquipAPI } from '../../api';
import QrInterventionModal from '../../components/QrInterventionModal';

const STATUT_CONFIG = {
  actif:          { label: 'Actif',           badge: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500', icon: '✅' },
  en_panne:       { label: 'En panne',         badge: 'bg-red-100 text-red-700',         dot: 'bg-red-500',     icon: '🔴' },
  en_maintenance: { label: 'En maintenance',   badge: 'bg-amber-100 text-amber-700',     dot: 'bg-amber-500',   icon: '🟡' },
  hors_service:   { label: 'Hors service',     badge: 'bg-gray-100 text-gray-500',       dot: 'bg-gray-400',    icon: '⚫' },
};

const STATUTS = ['actif', 'en_panne', 'en_maintenance', 'hors_service'];

export default function ListeEquipementsPage() {
  const [equipements, setEquipements] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [erreur, setErreur]           = useState('');
  const [searchTerm, setSearchTerm]   = useState('');

  const [selectedEq, setSelectedEq] = useState(null);
  const [sousEquips, setSousEquips]  = useState([]);
  const [seLoading, setSeLoading]    = useState(false);

  const [showSeModal, setShowSeModal] = useState(false);
  const [editingSe, setEditingSe]     = useState(null);
  const [seForm, setSeForm]           = useState({ nom: '', statut: 'actif' });
  const [seErreur, setSeErreur]       = useState('');

  const [showEqModal, setShowEqModal] = useState(false);
  const [editingEq, setEditingEq]     = useState(null);
  const [eqForm, setEqForm]           = useState({ nom: '', famille_equipement: '' });
  const [eqErreur, setEqErreur]       = useState('');

  const [qrModal, setQrModal]   = useState(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [copied, setCopied]       = useState(false);

  const chargerEquipements = useCallback(async () => {
    try {
      setLoading(true);
      const res = await equipementsAPI.getAll();
      setEquipements(res.data);
      setErreur('');
    } catch {
      setErreur('Erreur lors du chargement des équipements.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { chargerEquipements(); }, [chargerEquipements]);

  const chargerSousEquips = useCallback(async (id) => {
    try {
      setSeLoading(true);
      const res = await sousEquipAPI.getByEquipement(id);
      setSousEquips(res.data);
    } catch {
      setSousEquips([]);
    } finally {
      setSeLoading(false);
    }
  }, []);

  const ouvrirDetails = (eq) => {
    setSelectedEq(eq);
    setSousEquips([]);
    setSeErreur('');
    chargerSousEquips(eq.id);
  };

  const handleEqSubmit = async (e) => {
    e.preventDefault();
    setEqErreur('');
    try {
      if (editingEq) {
        await equipementsAPI.update(editingEq.id, eqForm);
      } else {
        await equipementsAPI.create(eqForm);
      }
      setShowEqModal(false);
      setEditingEq(null);
      setEqForm({ nom: '', famille_equipement: '' });
      chargerEquipements();
    } catch (err) {
      setEqErreur(err.response?.data?.message || "Erreur lors de l'opération.");
    }
  };

  const handleEqSupprimer = async (id) => {
    if (!window.confirm('Supprimer cet équipement ? Ses sous-équipements seront également supprimés.')) return;
    try {
      await equipementsAPI.delete(id);
      if (selectedEq?.id === id) setSelectedEq(null);
      chargerEquipements();
    } catch (err) {
      setErreur(err.response?.data?.message || 'Erreur lors de la suppression.');
    }
  };

  const handleQr = async (eq) => {
    try {
      setQrLoading(true);
      const res = await equipementsAPI.getInterventionQr(eq.id, window.location.origin);
      setQrModal(res.data);
    } catch (err) {
      setErreur(err.response?.data?.message || 'Erreur QR code.');
    } finally {
      setQrLoading(false);
    }
  };

  const handleSeSubmit = async (e) => {
    e.preventDefault();
    setSeErreur('');
    try {
      if (editingSe) {
        await sousEquipAPI.update(editingSe.id, seForm);
      } else {
        await sousEquipAPI.create({ ...seForm, equipement_id: selectedEq.id });
      }
      setShowSeModal(false);
      setEditingSe(null);
      setSeForm({ nom: '', statut: 'actif' });
      chargerSousEquips(selectedEq.id);
    } catch (err) {
      setSeErreur(err.response?.data?.message || "Erreur lors de l'opération.");
    }
  };

  const handleSeSupprimer = async (id) => {
    if (!window.confirm('Supprimer ce sous-équipement ?')) return;
    try {
      await sousEquipAPI.delete(id);
      chargerSousEquips(selectedEq.id);
    } catch (err) {
      setSeErreur(err.response?.data?.message || 'Erreur suppression.');
    }
  };

  const countParStatut = (statut) => sousEquips.filter((se) => se.statut === statut).length;

  const equipementsFiltres = equipements.filter((e) =>
    e.nom.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-6 bg-gray-50 min-h-full">

      <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Équipements</h1>
          <p className="text-gray-500 text-sm mt-0.5">Sélectionnez un équipement pour consulter ses sous-équipements</p>
        </div>
        <button
          onClick={() => { setEditingEq(null); setEqForm({ nom: '', famille_equipement: '' }); setEqErreur(''); setShowEqModal(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-900 text-white rounded-lg hover:bg-blue-800 transition shadow-sm text-sm font-medium"
        >
          <span>+</span> Ajouter un équipement
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-4 mb-6">
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
          <input
            type="text" placeholder="Rechercher..." value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 pr-4 py-2 border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm shadow-sm w-56"
          />
        </div>
        <div className="flex items-center gap-2 px-3 py-2 bg-blue-900 text-white rounded-lg text-sm font-medium">
          <span>⚙️</span><span>{equipements.length} équipement(s)</span>
        </div>
      </div>

      {erreur && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{erreur}</div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-900"></div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
            {equipementsFiltres.map((eq) => (
              <div key={eq.id} className={`bg-white rounded-xl border-2 shadow-sm overflow-hidden transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 ${
                selectedEq?.id === eq.id ? 'border-blue-500 ring-2 ring-blue-100' : 'border-gray-100 hover:border-blue-200'
              }`}>
                <div
                  className="bg-gradient-to-r from-blue-900 to-blue-700 px-5 py-4 flex items-center justify-between cursor-pointer"
                  onClick={() => ouvrirDetails(eq)}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center text-xl">⚙️</div>
                    <div>
                      <p className="text-white font-semibold text-sm leading-tight">{eq.nom}</p>
                      <p className="text-blue-200 text-xs">ID #{eq.id}</p>
                      {eq.famille_equipement && <p className="text-blue-200 text-xs">{eq.famille_equipement}</p>}
                    </div>
                  </div>
                  {selectedEq?.id === eq.id && (
                    <span className="w-2.5 h-2.5 bg-emerald-400 rounded-full ring-2 ring-white flex-shrink-0"></span>
                  )}
                </div>

                <div className="px-4 py-3 flex flex-wrap gap-2 border-t border-gray-100">
                  <button
                    onClick={() => ouvrirDetails(eq)}
                    className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                      selectedEq?.id === eq.id ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                    }`}
                  >
                    🔩 Sous-équip.
                  </button>
                  <button
                    onClick={() => handleQr(eq)}
                    disabled={qrLoading}
                    className="px-3 py-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg text-xs font-medium transition disabled:opacity-50"
                  >
                    📷 QR
                  </button>
                  <button
                    onClick={() => { setEditingEq(eq); setEqForm({ nom: eq.nom, famille_equipement: eq.famille_equipement || '' }); setEqErreur(''); setShowEqModal(true); }}
                    className="px-3 py-1.5 bg-gray-100 text-gray-600 hover:bg-gray-200 rounded-lg text-xs font-medium transition"
                  >
                    Modifier
                  </button>
                  <button
                    onClick={() => handleEqSupprimer(eq.id)}
                    className="px-3 py-1.5 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg text-xs font-medium transition"
                  >
                    Supprimer
                  </button>
                </div>
              </div>
            ))}

            {equipementsFiltres.length === 0 && (
              <div className="col-span-3 text-center py-16 text-gray-400">
                <div className="text-5xl mb-3">⚙️</div>
                <p className="text-sm">Aucun équipement trouvé</p>
              </div>
            )}
          </div>
        </>
      )}

      {selectedEq && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">

            <div className="bg-gradient-to-r from-blue-900 to-blue-700 px-6 py-5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center text-2xl flex-shrink-0">⚙️</div>
                  <div>
                    <p className="text-blue-200 text-xs uppercase font-semibold tracking-wider">Sous-équipements</p>
                    <h2 className="text-white text-xl font-bold leading-tight">{selectedEq.nom}</h2>
                    <p className="text-blue-200 text-sm">ID #{selectedEq.id}</p>
                  </div>
                </div>
                <button onClick={() => setSelectedEq(null)} className="text-blue-200 hover:text-white transition text-2xl leading-none mt-1">✕</button>
              </div>
              {!seLoading && sousEquips.length > 0 && (
                <div className="flex gap-2 mt-4 flex-wrap">
                  {Object.entries(STATUT_CONFIG).map(([key, cfg]) => {
                    const n = countParStatut(key);
                    if (n === 0) return null;
                    return (
                      <span key={key} className="flex items-center gap-1 px-2 py-1 bg-white/20 rounded-full text-white text-xs font-medium">
                        {cfg.icon} {n} {cfg.label}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="px-6 pt-4 pb-2 flex-shrink-0 border-b border-gray-100">
              <button
                onClick={() => { setEditingSe(null); setSeForm({ nom: '', statut: 'actif' }); setSeErreur(''); setShowSeModal(true); }}
                className="w-full py-2 rounded-lg border-2 border-dashed border-blue-200 text-blue-600 hover:bg-blue-50 text-sm font-medium transition flex items-center justify-center gap-1"
              >
                <span className="text-base">+</span> Ajouter un sous-équipement
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Liste</h3>
                {!seLoading && (
                  <span className="px-2.5 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-semibold">{sousEquips.length}</span>
                )}
              </div>
              {seErreur && <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs">{seErreur}</div>}
              {seLoading ? (
                <div className="flex justify-center py-10">
                  <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-blue-900"></div>
                </div>
              ) : sousEquips.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <div className="text-5xl mb-3">🔩</div>
                  <p className="text-sm font-medium">Aucun sous-équipement</p>
                </div>
              ) : (
                <ul className="space-y-2.5">
                  {sousEquips.map((se) => {
                    const cfg = STATUT_CONFIG[se.statut] || STATUT_CONFIG.actif;
                    return (
                      <li key={se.id} className="flex items-center justify-between p-3.5 bg-gray-50 rounded-xl border border-gray-100 hover:border-blue-200 transition">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${cfg.dot}`}></div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-gray-800 truncate">{se.nom}</p>
                            <p className="text-xs text-gray-400">ID #{se.id}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 ml-3 flex-shrink-0">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${cfg.badge}`}>{cfg.icon} {cfg.label}</span>
                          <button
                            onClick={() => { setEditingSe(se); setSeForm({ nom: se.nom, statut: se.statut }); setSeErreur(''); setShowSeModal(true); }}
                            className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                          >Modifier</button>
                          <button
                            onClick={() => handleSeSupprimer(se.id)}
                            className="text-xs text-red-500 hover:text-red-700 font-medium"
                          >Supprimer</button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex gap-3">
              <button
                onClick={() => handleQr(selectedEq)}
                disabled={qrLoading}
                className="px-4 py-2.5 bg-emerald-700 text-white rounded-xl hover:bg-emerald-600 font-medium text-sm transition flex items-center gap-2 disabled:opacity-50"
              >
                📷 QR Code
              </button>
              <button
                onClick={() => setSelectedEq(null)}
                className="flex-1 py-2.5 bg-blue-900 text-white rounded-xl hover:bg-blue-800 font-medium text-sm transition"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {showEqModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="bg-gradient-to-r from-blue-900 to-blue-700 px-6 py-4">
              <h2 className="text-white font-bold text-lg">{editingEq ? "Modifier l'équipement" : 'Nouvel équipement'}</h2>
            </div>
            <form onSubmit={handleEqSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Nom *</label>
                <input type="text" value={eqForm.nom} onChange={(e) => setEqForm({ ...eqForm, nom: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  placeholder="Ex : Groupe électrogène, Pompe..." required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Famille / Catégorie</label>
                <input type="text" value={eqForm.famille_equipement} onChange={(e) => setEqForm({ ...eqForm, famille_equipement: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  placeholder="Ex : Electrique, Mécanique..." />
              </div>
              {eqErreur && <p className="text-red-600 text-sm bg-red-50 p-2 rounded-lg">{eqErreur}</p>}
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowEqModal(false)}
                  className="flex-1 py-2.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 text-sm font-medium transition">Annuler</button>
                <button type="submit"
                  className="flex-1 py-2.5 bg-blue-900 text-white rounded-lg hover:bg-blue-800 text-sm font-medium transition">
                  {editingEq ? 'Enregistrer' : 'Ajouter'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showSeModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="bg-gradient-to-r from-blue-900 to-blue-700 px-6 py-4">
              <h2 className="text-white font-bold text-lg">{editingSe ? 'Modifier le sous-équipement' : 'Nouveau sous-équipement'}</h2>
              <p className="text-blue-200 text-sm mt-0.5">Équipement : {selectedEq?.nom}</p>
            </div>
            <form onSubmit={handleSeSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Nom *</label>
                <input type="text" value={seForm.nom} onChange={(e) => setSeForm({ ...seForm, nom: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  placeholder="Ex : Pompe principale, Capteur T1..." required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Statut *</label>
                <div className="grid grid-cols-2 gap-2">
                  {STATUTS.map((s) => {
                    const cfg = STATUT_CONFIG[s];
                    return (
                      <button key={s} type="button" onClick={() => setSeForm({ ...seForm, statut: s })}
                        className={`py-2 px-3 rounded-lg text-xs font-medium border-2 transition text-left flex items-center gap-2 ${
                          seForm.statut === s ? 'border-blue-500 bg-blue-50 text-blue-800' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                        }`}
                      >
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot}`}></span>{cfg.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              {seErreur && <p className="text-red-600 text-sm bg-red-50 p-2 rounded-lg">{seErreur}</p>}
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowSeModal(false)}
                  className="flex-1 py-2.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 text-sm font-medium transition">Annuler</button>
                <button type="submit"
                  className="flex-1 py-2.5 bg-blue-900 text-white rounded-lg hover:bg-blue-800 text-sm font-medium transition">
                  {editingSe ? 'Enregistrer' : 'Ajouter'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <QrInterventionModal
        qrModal={qrModal}
        onClose={() => { setQrModal(null); setCopied(false); }}
        copied={copied}
        onCopy={() => { navigator.clipboard.writeText(qrModal.url); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      />
    </div>
  );
}

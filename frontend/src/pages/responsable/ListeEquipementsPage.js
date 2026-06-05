// ============================================================
// PAGE ÉQUIPEMENTS (RESPONSABLE)
// CRUD équipements + gestion des sous-équipements inline
// ============================================================
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { equipementsAPI, sousEquipAPI } from '../../api';
import QrInterventionModal from '../../components/QrInterventionModal';

const STATUT_STYLE = {
  actif:          { badge: 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200', dot: 'bg-emerald-500' },
  en_panne:       { badge: 'bg-red-100 text-red-700 ring-1 ring-red-200',             dot: 'bg-red-500'     },
  en_maintenance: { badge: 'bg-amber-100 text-amber-700 ring-1 ring-amber-200',       dot: 'bg-amber-500'   },
  hors_service:   { badge: 'bg-gray-100 text-gray-500 ring-1 ring-gray-200',          dot: 'bg-gray-400'    },
};

const STATUTS = ['actif', 'en_panne', 'en_maintenance', 'hors_service'];

const STATUT_LABEL = {
  actif:          'Actif',
  en_panne:       'En panne',
  en_maintenance: 'En maintenance',
  hors_service:   'Hors service',
};

export default function ListeEquipementsPage() {
  const [equipements, setEquipements]   = useState([]);
  const [loading, setLoading]           = useState(true);
  const [erreur, setErreur]             = useState('');
  const [searchTerm, setSearchTerm]     = useState('');

  const [showEqModal, setShowEqModal]   = useState(false);
  const [editingEq, setEditingEq]       = useState(null);
  const [eqForm, setEqForm]             = useState({ nom: '' });

  const [panelEq, setPanelEq]           = useState(null);
  const [sousEquips, setSousEquips]     = useState([]);
  const [seLoading, setSeLoading]       = useState(false);
  const [showSeModal, setShowSeModal]   = useState(false);
  const [editingSe, setEditingSe]       = useState(null);
  const [seForm, setSeForm]             = useState({ nom: '', statut: 'actif' });
  const [seErreur, setSeErreur]         = useState('');

  const [qrModal, setQrModal]           = useState(null);
  const [qrLoading, setQrLoading]       = useState(false);
  const [copied, setCopied]             = useState(false);

  const tableRef   = useRef(null);
  const [tableH, setTableH] = useState(null);

  useEffect(() => {
    if (!tableRef.current) return;
    const update = () => { if (tableRef.current) setTableH(tableRef.current.offsetHeight); };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(tableRef.current);
    return () => ro.disconnect();
  }, [equipements, loading]);

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

  const chargerSousEquips = useCallback(async (equipementId) => {
    try {
      setSeLoading(true);
      const res = await sousEquipAPI.getByEquipement(equipementId);
      setSousEquips(res.data);
    } catch {
      setSeErreur('Erreur chargement sous-équipements.');
    } finally {
      setSeLoading(false);
    }
  }, []);

  const ouvrirPanel = (eq) => {
    setPanelEq(eq);
    setSousEquips([]);
    setSeErreur('');
    chargerSousEquips(eq.id);
  };

  const handleEqSubmit = async (e) => {
    e.preventDefault();
    setErreur('');
    try {
      if (editingEq) {
        await equipementsAPI.update(editingEq.id, eqForm);
      } else {
        await equipementsAPI.create(eqForm);
      }
      setShowEqModal(false);
      setEditingEq(null);
      setEqForm({ nom: '' });
      chargerEquipements();
    } catch (err) {
      setErreur(err.response?.data?.message || "Erreur lors de l'opération.");
    }
  };

  const handleEqSupprimer = async (id) => {
    if (!window.confirm('Supprimer cet équipement ? Ses sous-équipements seront également supprimés.')) return;
    try {
      await equipementsAPI.delete(id);
      if (panelEq?.id === id) setPanelEq(null);
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
        await sousEquipAPI.create({ ...seForm, equipement_id: panelEq.id });
      }
      setShowSeModal(false);
      setEditingSe(null);
      setSeForm({ nom: '', statut: 'actif' });
      chargerSousEquips(panelEq.id);
    } catch (err) {
      setSeErreur(err.response?.data?.message || "Erreur lors de l'opération.");
    }
  };

  const handleSeSupprimer = async (id) => {
    if (!window.confirm('Supprimer ce sous-équipement ?')) return;
    try {
      await sousEquipAPI.delete(id);
      chargerSousEquips(panelEq.id);
    } catch (err) {
      setSeErreur(err.response?.data?.message || 'Erreur suppression.');
    }
  };

  const equipementsFiltres = equipements.filter((e) =>
    e.nom.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-6 bg-gray-50 min-h-full">

      {/* ── En-tête ── */}
      <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Équipements</h1>
          <p className="text-sm text-gray-500 mt-0.5">{equipements.length} équipement(s) enregistré(s)</p>
        </div>
        <button
          onClick={() => { setEditingEq(null); setEqForm({ nom: '' }); setErreur(''); setShowEqModal(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-900 text-white rounded-lg hover:bg-blue-800 transition shadow-sm text-sm font-medium"
        >
          <span className="text-base">+</span> Ajouter un équipement
        </button>
      </div>

      {/* ── Recherche ── */}
      <div className="mb-5">
        <div className="relative w-full max-w-sm">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
          <input
            type="text"
            placeholder="Rechercher un équipement..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm shadow-sm"
          />
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
        <div className="flex gap-5 items-start">

          {/* ── Table équipements ── */}
          <div ref={tableRef} className="flex-1 bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <table className="min-w-full">
              <thead>
                <tr className="bg-gradient-to-r from-blue-900 to-blue-800">
                  <th className="px-5 py-3 text-left text-xs font-semibold text-blue-100 uppercase tracking-wider w-16">ID</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-blue-100 uppercase tracking-wider">Nom</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold text-blue-100 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody>
                {equipementsFiltres.map((eq, idx) => (
                  <tr
                    key={eq.id}
                    className={`transition ${
                      panelEq?.id === eq.id
                        ? 'bg-blue-50 border-l-4 border-blue-500'
                        : idx % 2 === 0 ? 'bg-white hover:bg-gray-50' : 'bg-gray-50/50 hover:bg-gray-100'
                    }`}
                  >
                    <td className="px-5 py-3.5 text-sm text-gray-400 font-mono">#{eq.id}</td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">⚙️</span>
                        <span className="text-sm font-semibold text-gray-800">{eq.nom}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => ouvrirPanel(eq)}
                          className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                            panelEq?.id === eq.id
                              ? 'bg-blue-600 text-white'
                              : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                          }`}
                        >
                          🔩 Sous-équip.
                        </button>
                        <button
                          onClick={() => handleQr(eq)}
                          disabled={qrLoading}
                          className="px-3 py-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg text-xs font-medium transition disabled:opacity-50"
                        >
                          QR
                        </button>
                        <button
                          onClick={() => { setEditingEq(eq); setEqForm({ nom: eq.nom }); setErreur(''); setShowEqModal(true); }}
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
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {equipementsFiltres.length === 0 && (
              <div className="text-center py-16 text-gray-400">
                <div className="text-5xl mb-3">⚙️</div>
                <p className="text-sm">Aucun équipement trouvé</p>
              </div>
            )}
          </div>

          {/* ── Panel sous-équipements ── */}
          {panelEq && (
            <div className="w-80 flex-shrink-0 bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col overflow-hidden" style={{ height: tableH ? `${tableH}px` : 'auto' }}>
              {/* Header panel */}
              <div className="bg-gradient-to-r from-blue-900 to-blue-700 px-4 py-4 rounded-t-xl flex-shrink-0">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-blue-200 text-xs uppercase font-semibold tracking-wider mb-1">Sous-équipements</p>
                    <p className="text-white font-bold text-base leading-tight">{panelEq.nom}</p>
                    <p className="text-blue-200 text-xs mt-1">{sousEquips.length} élément(s)</p>
                  </div>
                  <button onClick={() => setPanelEq(null)} className="text-blue-200 hover:text-white transition text-xl leading-none mt-0.5">✕</button>
                </div>
              </div>

              {/* Bouton ajouter */}
              <div className="px-4 pt-4 pb-2 flex-shrink-0">
                <button
                  onClick={() => { setEditingSe(null); setSeForm({ nom: '', statut: 'actif' }); setSeErreur(''); setShowSeModal(true); }}
                  className="w-full py-2 rounded-lg border-2 border-dashed border-blue-200 text-blue-600 hover:bg-blue-50 text-sm font-medium transition flex items-center justify-center gap-1"
                >
                  <span className="text-base">+</span> Ajouter un sous-équipement
                </button>
              </div>

              {/* Liste scrollable */}
              <div className="overflow-y-auto px-4 pb-4 flex-1 scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-transparent">
                {seErreur && (
                  <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs">{seErreur}</div>
                )}

                {seLoading ? (
                  <div className="flex justify-center py-8">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-900"></div>
                  </div>
                ) : sousEquips.length === 0 ? (
                  <div className="text-center py-10 text-gray-400">
                    <div className="text-3xl mb-2">🔩</div>
                    <p className="text-xs">Aucun sous-équipement</p>
                  </div>
                ) : (
                  <ul className="space-y-2 mt-1">
                    {sousEquips.map((se) => (
                      <li key={se.id} className="bg-gray-50 rounded-lg border border-gray-100 p-3 hover:border-blue-200 transition">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-gray-800 truncate">{se.nom}</p>
                            <div className="flex items-center gap-1.5 mt-1.5">
                              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUT_STYLE[se.statut]?.dot}`}></span>
                              <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUT_STYLE[se.statut]?.badge}`}>
                                {STATUT_LABEL[se.statut]}
                              </span>
                            </div>
                          </div>
                          <div className="flex flex-col gap-1 flex-shrink-0">
                            <button
                              onClick={() => { setEditingSe(se); setSeForm({ nom: se.nom, statut: se.statut }); setSeErreur(''); setShowSeModal(true); }}
                              className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                            >
                              Modifier
                            </button>
                            <button
                              onClick={() => handleSeSupprimer(se.id)}
                              className="text-xs text-red-500 hover:text-red-700 font-medium"
                            >
                              Supprimer
                            </button>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Stats ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
        {[
          { icon: '⚙️', label: 'Total Équipements', value: equipements.length, color: 'bg-blue-50 text-blue-900' },
          { icon: '🔩', label: 'Sous-équipements', value: sousEquips.length, color: 'bg-emerald-50 text-emerald-900' },
          { icon: '📊', label: 'Équipements actifs', value: equipements.length, color: 'bg-purple-50 text-purple-900' },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 flex items-center gap-4">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl ${s.color}`}>{s.icon}</div>
            <div>
              <p className="text-xs text-gray-500 font-medium">{s.label}</p>
              <p className="text-2xl font-bold text-gray-900">{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Modal équipement ── */}
      {showEqModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="bg-gradient-to-r from-blue-900 to-blue-700 px-6 py-4">
              <h2 className="text-white font-bold text-lg">
                {editingEq ? "Modifier l'équipement" : 'Nouvel équipement'}
              </h2>
            </div>
            <form onSubmit={handleEqSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Nom de l'équipement *</label>
                <input
                  type="text"
                  value={eqForm.nom}
                  onChange={(e) => setEqForm({ nom: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  placeholder="Ex : Groupe électrogène, Pompe..."
                  required
                />
              </div>
              {erreur && <p className="text-red-600 text-sm bg-red-50 p-2 rounded-lg">{erreur}</p>}
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowEqModal(false)}
                  className="flex-1 py-2.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 text-sm font-medium transition">
                  Annuler
                </button>
                <button type="submit"
                  className="flex-1 py-2.5 bg-blue-900 text-white rounded-lg hover:bg-blue-800 text-sm font-medium transition">
                  {editingEq ? 'Enregistrer' : 'Ajouter'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal sous-équipement ── */}
      {showSeModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="bg-gradient-to-r from-blue-900 to-blue-700 px-6 py-4">
              <h2 className="text-white font-bold text-lg">
                {editingSe ? 'Modifier le sous-équipement' : 'Nouveau sous-équipement'}
              </h2>
              <p className="text-blue-200 text-sm mt-0.5">Équipement : {panelEq?.nom}</p>
            </div>
            <form onSubmit={handleSeSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Nom *</label>
                <input
                  type="text"
                  value={seForm.nom}
                  onChange={(e) => setSeForm({ ...seForm, nom: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  placeholder="Ex : Pompe principale, Capteur T1..."
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Statut *</label>
                <div className="grid grid-cols-2 gap-2">
                  {STATUTS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setSeForm({ ...seForm, statut: s })}
                      className={`py-2 px-3 rounded-lg text-xs font-medium border-2 transition text-left flex items-center gap-2 ${
                        seForm.statut === s
                          ? 'border-blue-500 bg-blue-50 text-blue-800'
                          : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUT_STYLE[s]?.dot}`}></span>
                      {STATUT_LABEL[s]}
                    </button>
                  ))}
                </div>
              </div>
              {seErreur && <p className="text-red-600 text-sm bg-red-50 p-2 rounded-lg">{seErreur}</p>}
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowSeModal(false)}
                  className="flex-1 py-2.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 text-sm font-medium transition">
                  Annuler
                </button>
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
        onCopy={() => {
          navigator.clipboard.writeText(qrModal.url);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
      />
    </div>
  );
}

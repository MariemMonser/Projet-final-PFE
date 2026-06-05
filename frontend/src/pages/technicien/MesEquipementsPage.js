// ============================================================
// PAGE MES ÉQUIPEMENTS (TECHNICIEN)
// Cartes équipements + modal détails avec sous-équipements
// ============================================================
import React, { useState, useEffect } from 'react';
import { equipementsAPI, sousEquipAPI } from '../../api';

const STATUT_CONFIG = {
  actif:          { label: 'Actif',           badge: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500', icon: '✅' },
  en_panne:       { label: 'En panne',         badge: 'bg-red-100 text-red-700',         dot: 'bg-red-500',     icon: '🔴' },
  en_maintenance: { label: 'En maintenance',   badge: 'bg-amber-100 text-amber-700',     dot: 'bg-amber-500',   icon: '🟡' },
  hors_service:   { label: 'Hors service',     badge: 'bg-gray-100 text-gray-500',       dot: 'bg-gray-400',    icon: '⚫' },
};

export default function MesEquipementsPage() {
  const [equipements, setEquipements]   = useState([]);
  const [loading, setLoading]           = useState(true);
  const [erreur, setErreur]             = useState('');
  const [searchTerm, setSearchTerm]     = useState('');
  const [selectedEq, setSelectedEq]     = useState(null);
  const [sousEquips, setSousEquips]     = useState([]);
  const [seLoading, setSeLoading]       = useState(false);

  useEffect(() => {
    const charger = async () => {
      try {
        setLoading(true);
        const res = await equipementsAPI.getAll();
        setEquipements(res.data);
      } catch {
        setErreur('Erreur lors du chargement des équipements.');
      } finally {
        setLoading(false);
      }
    };
    charger();
  }, []);

  const ouvrirDetails = async (eq) => {
    setSelectedEq(eq);
    setSousEquips([]);
    setSeLoading(true);
    try {
      const res = await sousEquipAPI.getByEquipement(eq.id);
      setSousEquips(res.data);
    } catch {
      setSousEquips([]);
    } finally {
      setSeLoading(false);
    }
  };

  const equipementsFiltres = equipements.filter((e) =>
    e.nom.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const countParStatut = (statut) => sousEquips.filter((se) => se.statut === statut).length;

  return (
    <div className="p-6 bg-gray-50 min-h-full">

      {/* ── En-tête ── */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Mes Équipements</h1>
        <p className="text-gray-500 text-sm mt-0.5">Sélectionnez un équipement pour consulter ses sous-équipements</p>
      </div>

      {/* ── Recherche + stats ── */}
      <div className="flex flex-wrap items-center gap-4 mb-6">
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
          <input
            type="text"
            placeholder="Rechercher..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 pr-4 py-2 border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm shadow-sm w-56"
          />
        </div>
        <div className="flex items-center gap-2 px-3 py-2 bg-blue-900 text-white rounded-lg text-sm font-medium">
          <span>⚙️</span>
          <span>{equipements.length} équipement(s)</span>
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
          {/* ── Grille équipements ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
            {equipementsFiltres.map((eq) => (
              <div
                key={eq.id}
                onClick={() => ouvrirDetails(eq)}
                className={`bg-white rounded-xl border-2 shadow-sm cursor-pointer transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 overflow-hidden ${
                  selectedEq?.id === eq.id
                    ? 'border-blue-500 ring-2 ring-blue-100'
                    : 'border-gray-100 hover:border-blue-200'
                }`}
              >
                {/* Card header */}
                <div className="bg-gradient-to-r from-blue-900 to-blue-700 px-5 py-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center text-xl">⚙️</div>
                    <div>
                      <p className="text-white font-semibold text-sm leading-tight">{eq.nom}</p>
                      <p className="text-blue-200 text-xs">ID #{eq.id}</p>
                    </div>
                  </div>
                  {selectedEq?.id === eq.id && (
                    <span className="w-2.5 h-2.5 bg-emerald-400 rounded-full ring-2 ring-white"></span>
                  )}
                </div>

                {/* Card body */}
                <div className="px-5 py-4 flex items-center justify-between">
                  <p className="text-xs text-gray-400">Cliquer pour voir les détails</p>
                  <span className="text-blue-600 text-sm font-medium">→</span>
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

          {/* ── Stats ── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { icon: '⚙️', label: 'Équipements', value: equipements.length, bg: 'bg-blue-50', text: 'text-blue-900' },
              { icon: '🔩', label: 'Sous-équipements', value: sousEquips.length, bg: 'bg-gray-50', text: 'text-gray-900' },
              { icon: '✅', label: 'Actifs', value: countParStatut('actif'), bg: 'bg-emerald-50', text: 'text-emerald-900' },
              { icon: '🔴', label: 'En panne', value: countParStatut('en_panne'), bg: 'bg-red-50', text: 'text-red-900' },
            ].map((s) => (
              <div key={s.label} className={`${s.bg} rounded-xl p-4 flex items-center gap-3 border border-white shadow-sm`}>
                <span className="text-2xl">{s.icon}</span>
                <div>
                  <p className="text-xs text-gray-500">{s.label}</p>
                  <p className={`text-xl font-bold ${s.text}`}>{s.value}</p>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── Modal détails ── */}
      {selectedEq && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">

            {/* Header modal */}
            <div className="bg-gradient-to-r from-blue-900 to-blue-700 px-6 py-5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center text-2xl flex-shrink-0">⚙️</div>
                  <div>
                    <p className="text-blue-200 text-xs uppercase font-semibold tracking-wider">Équipement</p>
                    <h2 className="text-white text-xl font-bold leading-tight">{selectedEq.nom}</h2>
                    <p className="text-blue-200 text-sm">ID #{selectedEq.id}</p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedEq(null)}
                  className="text-blue-200 hover:text-white transition text-2xl leading-none mt-1"
                >
                  ✕
                </button>
              </div>

              {/* Résumé statuts */}
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

            {/* Corps modal */}
            <div className="flex-1 overflow-y-auto px-6 py-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">
                  Sous-équipements
                </h3>
                {!seLoading && (
                  <span className="px-2.5 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-semibold">
                    {sousEquips.length}
                  </span>
                )}
              </div>

              {seLoading ? (
                <div className="flex justify-center py-10">
                  <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-blue-900"></div>
                </div>
              ) : sousEquips.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <div className="text-5xl mb-3">🔩</div>
                  <p className="text-sm font-medium">Aucun sous-équipement</p>
                  <p className="text-xs mt-1">Cet équipement n'a pas encore de sous-équipements</p>
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
                        <span className={`ml-3 px-2.5 py-1 rounded-full text-xs font-semibold flex-shrink-0 ${cfg.badge}`}>
                          {cfg.icon} {cfg.label}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-100 bg-gray-50">
              <button
                onClick={() => setSelectedEq(null)}
                className="w-full py-2.5 bg-blue-900 text-white rounded-xl hover:bg-blue-800 font-medium text-sm transition"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

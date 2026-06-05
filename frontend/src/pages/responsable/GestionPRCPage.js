// ============================================================
// GESTION PRC - Pièces de rechange (Responsable)
// ============================================================
import React, { useState, useEffect } from 'react';
import { prcAPI, equipementsAPI } from '../../api';

const GestionPRCPage = () => {
  const [prcList, setPrcList]       = useState([]);
  const [equipements, setEquipements] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState('');
  const [filterEquip, setFilterEquip] = useState('');

  // Modal PRC
  const [showModal, setShowModal]   = useState(false);
  const [editItem, setEditItem]     = useState(null);
  const [formData, setFormData]     = useState({ code_prc:'', designation:'', cout:'', stock:'', equipement_id:'' });
  const [formError, setFormError]   = useState('');
  const [formLoading, setFormLoading] = useState(false);

  // Modal stock
  const [showStockModal, setShowStockModal] = useState(false);
  const [stockItem, setStockItem]   = useState(null);
  const [stockForm, setStockForm]   = useState({ mouvement:'entree', quantite:'' });
  const [stockError, setStockError] = useState('');

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [prcRes, equipRes] = await Promise.all([
        prcAPI.getAll(),
        equipementsAPI.getAll(),
      ]);
      setPrcList(prcRes.data);
      setEquipements(equipRes.data);
    } catch { }
    setLoading(false);
  };

  const filtered = prcList.filter(p => {
    const q = search.toLowerCase();
    const matchSearch = !q || p.code_prc?.toLowerCase().includes(q) || p.designation?.toLowerCase().includes(q);
    const matchEquip  = !filterEquip || String(p.equipement_id) === filterEquip;
    return matchSearch && matchEquip;
  });

  // ── Modal PRC ──────────────────────────────────────────
  const openModal = (item = null) => {
    setEditItem(item);
    setFormData(item
      ? { code_prc: item.code_prc, designation: item.designation, cout: item.cout, stock: item.stock, equipement_id: item.equipement_id || '' }
      : { code_prc:'', designation:'', cout:'', stock:'0', equipement_id:'' }
    );
    setFormError('');
    setShowModal(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!formData.code_prc.trim() || !formData.designation.trim()) {
      return setFormError('Code PRC et désignation sont obligatoires.');
    }
    setFormLoading(true);
    try {
      const payload = {
        code_prc:     formData.code_prc.trim(),
        designation:  formData.designation.trim(),
        cout:         parseFloat(formData.cout || 0),
        stock:        parseInt(formData.stock || 0),
        equipement_id: formData.equipement_id || null,
      };
      if (editItem) await prcAPI.update(editItem.id, payload);
      else          await prcAPI.create(payload);
      setShowModal(false);
      fetchAll();
    } catch (err) {
      setFormError(err.response?.data?.message || 'Erreur lors de la sauvegarde.');
    }
    setFormLoading(false);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Supprimer cette pièce ?')) return;
    try { await prcAPI.delete(id); fetchAll(); }
    catch (err) { alert(err.response?.data?.message || 'Erreur.'); }
  };

  // ── Modal Stock ────────────────────────────────────────
  const openStockModal = (item) => {
    setStockItem(item);
    setStockForm({ mouvement: 'entree', quantite: '' });
    setStockError('');
    setShowStockModal(true);
  };

  const handleStock = async (e) => {
    e.preventDefault();
    if (!stockForm.quantite || parseInt(stockForm.quantite) <= 0) {
      return setStockError('Quantité invalide.');
    }
    try {
      await prcAPI.updateStock(stockItem.id, { mouvement: stockForm.mouvement, quantite: parseInt(stockForm.quantite) });
      setShowStockModal(false);
      fetchAll();
    } catch (err) {
      setStockError(err.response?.data?.message || 'Erreur.');
    }
  };

  const totalValeur = filtered.reduce((sum, p) => sum + (parseFloat(p.cout || 0) * parseInt(p.stock || 0)), 0);
  const totalPieces = filtered.reduce((sum, p) => sum + parseInt(p.stock || 0), 0);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Pièces de Rechange (PRC)</h1>
          <p className="text-sm text-gray-500 mt-1">Gestion du catalogue et des stocks</p>
        </div>
        <button onClick={() => openModal()}
          className="bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-800 flex items-center gap-2">
          + Ajouter une pièce
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl shadow p-4 border-l-4 border-blue-500">
          <p className="text-xs text-gray-500 uppercase">Références</p>
          <p className="text-3xl font-bold text-blue-700">{filtered.length}</p>
        </div>
        <div className="bg-white rounded-xl shadow p-4 border-l-4 border-green-500">
          <p className="text-xs text-gray-500 uppercase">Stock total</p>
          <p className="text-3xl font-bold text-green-700">{totalPieces}</p>
        </div>
        <div className="bg-white rounded-xl shadow p-4 border-l-4 border-orange-500">
          <p className="text-xs text-gray-500 uppercase">Valeur totale (DT)</p>
          <p className="text-3xl font-bold text-orange-700">{totalValeur.toLocaleString('fr-FR', { minimumFractionDigits: 2 })}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow p-4 flex gap-4">
        <input
          type="text" placeholder="Rechercher par code ou désignation..."
          value={search} onChange={e => setSearch(e.target.value)}
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select value={filterEquip} onChange={e => setFilterEquip(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">Tous les équipements</option>
          {equipements.map(e => <option key={e.id} value={String(e.id)}>{e.nom}</option>)}
        </select>
        {(search || filterEquip) && (
          <button onClick={() => { setSearch(''); setFilterEquip(''); }}
            className="text-sm text-gray-500 hover:text-gray-700 px-2">Réinitialiser</button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-gray-400">Chargement...</div>
        ) : (
          <table className="min-w-full">
            <thead className="bg-gray-50">
              <tr>
                {['Code PRC','Désignation','Équipement','Coût unitaire (DT)','Stock','Valeur stock (DT)','Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Aucune pièce trouvée</td></tr>
              ) : filtered.map(p => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-mono font-medium text-blue-700">{p.code_prc}</td>
                  <td className="px-4 py-3 text-sm text-gray-900">{p.designation}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{p.equipement_nom || '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-900">{parseFloat(p.cout || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2 })}</td>
                  <td className="px-4 py-3 text-sm">
                    <span className={`font-bold ${parseInt(p.stock) === 0 ? 'text-red-600' : parseInt(p.stock) <= 2 ? 'text-orange-500' : 'text-green-600'}`}>
                      {p.stock}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">
                    {(parseFloat(p.cout || 0) * parseInt(p.stock || 0)).toLocaleString('fr-FR', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-3 text-sm flex gap-2">
                    <button onClick={() => openStockModal(p)}
                      className="text-green-600 hover:text-green-800 font-medium" title="Mouvement stock">📦</button>
                    <button onClick={() => openModal(p)}
                      className="text-blue-600 hover:text-blue-800 font-medium">✏️ Modifier</button>
                    <button onClick={() => handleDelete(p.id)}
                      className="text-red-600 hover:text-red-800 font-medium">🗑️ Supprimer</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal PRC */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
            <div className="px-6 py-4 border-b flex justify-between items-center">
              <h2 className="text-lg font-bold text-gray-800">
                {editItem ? 'Modifier la pièce' : 'Nouvelle pièce de rechange'}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-4">
              {formError && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{formError}</div>}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Code PRC *</label>
                  <input type="text" value={formData.code_prc}
                    onChange={e => setFormData({...formData, code_prc: e.target.value})}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Ex: 00001220" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Équipement</label>
                  <select value={formData.equipement_id}
                    onChange={e => setFormData({...formData, equipement_id: e.target.value})}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">— Aucun —</option>
                    {equipements.map(e => <option key={e.id} value={e.id}>{e.nom}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Désignation *</label>
                <input type="text" value={formData.designation}
                  onChange={e => setFormData({...formData, designation: e.target.value})}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Description de la pièce" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Coût unitaire (DT)</label>
                  <input type="number" step="0.01" min="0" value={formData.cout}
                    onChange={e => setFormData({...formData, cout: e.target.value})}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Stock initial</label>
                  <input type="number" min="0" value={formData.stock}
                    onChange={e => setFormData({...formData, stock: e.target.value})}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
                  Annuler
                </button>
                <button type="submit" disabled={formLoading}
                  className="px-4 py-2 text-sm bg-blue-700 text-white rounded-lg hover:bg-blue-800 disabled:opacity-50">
                  {formLoading ? 'Enregistrement...' : 'Enregistrer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Stock */}
      {showStockModal && stockItem && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
            <div className="px-6 py-4 border-b flex justify-between items-center">
              <h2 className="text-lg font-bold text-gray-800">Mouvement de stock</h2>
              <button onClick={() => setShowStockModal(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            <form onSubmit={handleStock} className="p-6 space-y-4">
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-sm font-medium text-gray-700">{stockItem.code_prc} — {stockItem.designation}</p>
                <p className="text-sm text-gray-500 mt-1">Stock actuel : <span className="font-bold text-gray-800">{stockItem.stock}</span></p>
              </div>
              {stockError && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{stockError}</div>}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Type de mouvement</label>
                <div className="flex gap-3">
                  {['entree','sortie'].map(m => (
                    <label key={m} className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-lg border-2 cursor-pointer text-sm font-medium transition
                      ${stockForm.mouvement === m
                        ? m === 'entree' ? 'border-green-500 bg-green-50 text-green-700' : 'border-red-500 bg-red-50 text-red-700'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                      <input type="radio" name="mouvement" value={m}
                        checked={stockForm.mouvement === m}
                        onChange={() => setStockForm({...stockForm, mouvement: m})}
                        className="hidden" />
                      {m === 'entree' ? '⬆ Entrée' : '⬇ Sortie'}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Quantité</label>
                <input type="number" min="1" value={stockForm.quantite}
                  onChange={e => setStockForm({...stockForm, quantite: e.target.value})}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Quantité" autoFocus />
              </div>
              <div className="flex justify-end gap-3 pt-1">
                <button type="button" onClick={() => setShowStockModal(false)}
                  className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
                  Annuler
                </button>
                <button type="submit"
                  className={`px-4 py-2 text-sm text-white rounded-lg ${stockForm.mouvement === 'entree' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}`}>
                  Confirmer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default GestionPRCPage;

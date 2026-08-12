

import React, { useState, useEffect, useMemo } from 'react';
import { monitoringAPI } from '../../api';
import { validerNumerique, validerDate, validerFormulaire } from '../../utils/validators';

const FieldError = ({ erreur }) => erreur
  ? <p className="text-red-600 text-xs mt-1">{erreur}</p>
  : null;

const AlerteSeuil = ({ message, onClose }) => (
  <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-300 rounded-xl text-amber-800 shadow-sm">
    <span className="text-2xl flex-shrink-0">⚠️</span>
    <div className="flex-1">
      <p className="font-bold text-sm">Seuil de consommation dépassé</p>
      <p className="text-sm mt-0.5">{message}</p>
      <p className="text-xs mt-1 text-amber-600">L'enregistrement a été sauvegardé malgré tout.</p>
    </div>
    <button onClick={onClose} className="text-amber-500 hover:text-amber-700 text-lg leading-none">✕</button>
  </div>
);

const MonitoringPage = () => {
  const [activeTab, setActiveTab] = useState('eau');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState([]);
  const [stats, setStats] = useState({});
  const [dateDebut, setDateDebut] = useState('');
  const [dateFin, setDateFin] = useState('');

  // Modal
  const [showModal, setShowModal]   = useState(false);
  const [modalType, setModalType]   = useState('');
  const [editItem, setEditItem]     = useState(null);
  const [formData, setFormData]     = useState({});
  const [formErreurs, setFormErreurs] = useState({});
  const [formError, setFormError]   = useState('');
  const [formLoading, setFormLoading] = useState(false);

  // QR code énergie dans le modal
  const [energieQr, setEnergieQr]   = useState(null);
  const [qrCopied, setQrCopied]     = useState(false);

  // Alerte seuil
  const [alerteSeuil,   setAlerteSeuil]   = useState(null);
  const [recalcMsg,     setRecalcMsg]     = useState(null);
  const [recalcLoading, setRecalcLoading] = useState(false);

  useEffect(() => {
    setDateDebut('');
    setDateFin('');
    setRecalcMsg(null);
    fetchData();
  }, [activeTab]);

  const handleRecalculer = async (type) => {
    setRecalcLoading(true);
    setRecalcMsg(null);
    try {
      const res = type === 'eau'
        ? await monitoringAPI.recalculerEau()
        : await monitoringAPI.recalculerElec();
      setRecalcMsg({ ok: true, text: res.data.message });
      fetchData();
    } catch (err) {
      setRecalcMsg({ ok: false, text: err.response?.data?.message || 'Erreur lors du recalcul.' });
    } finally {
      setRecalcLoading(false);
    }
  };

  const filteredData = useMemo(() => {
    let result = [...data];
    const getDateStr = (item) => {
      const d = activeTab === 'photovoltaique' ? item.date : item.date_releve;
      return d ? String(d).slice(0, 10) : null;
    };
    if (dateDebut) result = result.filter(item => { const d = getDateStr(item); return d && d >= dateDebut; });
    if (dateFin)   result = result.filter(item => { const d = getDateStr(item); return d && d <= dateFin;   });
    // PV: only show rows with actual production (> 0)
    if (activeTab === 'photovoltaique') result = result.filter(item => parseFloat(item.production_journaliere_kwh || 0) > 0);
    return result;
  }, [data, dateDebut, dateFin, activeTab]);

  const fetchData = async () => {
    setLoading(true);
    try {
      let dataResponse, statsResponse;
      switch (activeTab) {
        case 'eau':
          dataResponse  = await monitoringAPI.getWaterConsumption();
          statsResponse = await monitoringAPI.getWaterStats();
          break;
        case 'electricite':
          dataResponse  = await monitoringAPI.getElectricityConsumption();
          statsResponse = await monitoringAPI.getElectricityStats();
          break;
        case 'photovoltaique':
          dataResponse  = await monitoringAPI.getPhotovoltaicProduction();
          statsResponse = await monitoringAPI.getPhotovoltaicStats();
          break;
        default:
          return;
      }
      setData(dataResponse.data || []);
      setStats(statsResponse.data || {});
    } catch (error) {
      console.error('Erreur chargement monitoring:', error);
    } finally {
      setLoading(false);
    }
  };

    // ── Vérification seuil via le backend (consommation journalière réelle) ──
  const verifierSeuil = async (type) => {
    try {
      const res = await monitoringAPI.checkAlertes();
      const alertes = res.data?.alertes || [];
      const alerte = alertes.find(a => a.type === type);
      if (alerte) {
        const unite = type === 'eau' ? 'm³' : 'kWh';
        setAlerteSeuil(
          `${type === 'eau' ? 'Eau' : 'Électricité'} : consommation journalière de ${Number(alerte.valeur).toFixed(2)} ${unite} ` +
          `dépasse le seuil de ${Number(alerte.seuil).toFixed(2)} ${unite} ` +
          `(dépassement : +${Number(alerte.depassement).toFixed(2)} ${unite}, coût estimé : ${Number(alerte.cout_estime).toFixed(3)} DT)`
        );
      }
    } catch {
      // Ne pas bloquer si l'appel échoue
    }
  };

  
  const chargerEnergieQr = async (type) => {
    try {
      const res = await monitoringAPI.getEnergieQr(type, window.location.origin);
      setEnergieQr(res.data);
    } catch {
      setEnergieQr(null);
    }
  };

  const openEauModal = (item = null) => {
    setModalType('eau');
    setEditItem(item);
    setFormData({
      date_releve: item ? String(item.date_releve || '').slice(0, 10) : '',
      compteur:    item ? (item.compteur ?? '') : '',
    });
    setFormErreurs({});
    setFormError('');
    setEnergieQr(null);
    setQrCopied(false);
    setShowModal(true);
    chargerEnergieQr('eau');
  };

  const openElecModal = (item = null) => {
    setModalType('electricite');
    setEditItem(item);
    setFormData({
      date_releve: item ? String(item.date_releve || '').slice(0, 10) : '',
      phase1: item ? (item.phase1 ?? '') : '',
      phase2: item ? (item.phase2 ?? '') : '',
      phase3: item ? (item.phase3 ?? '') : '',
    });
    setFormErreurs({});
    setFormError('');
    setEnergieQr(null);
    setQrCopied(false);
    setShowModal(true);
    chargerEnergieQr('electricite');
  };

  const openPvModal = (item = null) => {
    setModalType('photovoltaique');
    setEditItem(item);
    setFormData({
      date: item ? String(item.date || '').slice(0, 10) : '',
      production_journaliere_kwh: item ? (item.production_journaliere_kwh ?? '') : '',
      puissance_installee_kwp:   item ? (item.puissance_installee_kwp ?? '') : '',
    });
    setFormErreurs({});
    setFormError('');
    setShowModal(true);
  };

  const handleDelete = async (type, id) => {
    if (!window.confirm('Confirmer la suppression de cet enregistrement ?')) return;
    try {
      if (type === 'eau')          await monitoringAPI.deleteWaterConsumption(id);
      else if (type === 'electricite')  await monitoringAPI.deleteElectricityConsumption(id);
      else if (type === 'photovoltaique') await monitoringAPI.deletePhotovoltaicProduction(id);
      fetchData();
    } catch (err) {
      alert('Erreur lors de la suppression : ' + (err.response?.data?.message || err.message));
    }
  };

  
  const handleFormSubmit = async () => {
    setFormError('');

    let regles = {};
    let payload = {};

    if (modalType === 'eau') {
      regles = {
        date_releve: validerDate(formData.date_releve, 'La date du relevé'),
        compteur:    validerNumerique(formData.compteur, 'La valeur du compteur', { min: 0 }),
      };
      
      if (!editItem && formData.compteur) {
        const dernierReleve = data.find(d => d.compteur != null);
        if (dernierReleve && parseFloat(formData.compteur) < parseFloat(dernierReleve.compteur)) {
          regles.compteur = `Valeur inférieure au dernier relevé (${dernierReleve.compteur} m³). Vérifiez la valeur ou supprimez l'ancien relevé si le compteur a été remplacé.`;
        }
      }
    } else if (modalType === 'electricite') {
      regles = {
        date_releve: validerDate(formData.date_releve, 'La date du relevé'),
        phase1: validerNumerique(formData.phase1, 'Phase 1', { min: 0 }),
        phase2: validerNumerique(formData.phase2, 'Phase 2', { min: 0 }),
        phase3: validerNumerique(formData.phase3, 'Phase 3', { min: 0 }),
      };
    } else if (modalType === 'photovoltaique') {
      regles = {
        date:                   validerDate(formData.date, 'La date'),
        puissance_installee_kwp: validerNumerique(formData.puissance_installee_kwp, 'La puissance installée', { min: 0 }),
      };
    }

    const { valide, erreurs } = validerFormulaire(regles);
    if (!valide) { setFormErreurs(erreurs); return; }

    setFormLoading(true);
    try {
      if (modalType === 'eau') {
        payload = { date_releve: formData.date_releve, compteur: parseFloat(formData.compteur) };
        if (editItem) await monitoringAPI.updateWaterConsumption(editItem.id, payload);
        else          await monitoringAPI.addWaterConsumption(payload);
      } else if (modalType === 'electricite') {
        payload = {
          date_releve: formData.date_releve,
          phase1: parseFloat(formData.phase1),
          phase2: parseFloat(formData.phase2),
          phase3: parseFloat(formData.phase3),
        };
        if (editItem) await monitoringAPI.updateElectricityConsumption(editItem.id, payload);
        else          await monitoringAPI.addElectricityConsumption(payload);
      } else if (modalType === 'photovoltaique') {
        payload = {
          date: formData.date,
          production_journaliere_kwh: formData.production_journaliere_kwh !== '' ? parseFloat(formData.production_journaliere_kwh) : null,
          puissance_installee_kwp:   parseFloat(formData.puissance_installee_kwp),
        };
        if (editItem) await monitoringAPI.updatePhotovoltaicProduction(editItem.id, payload);
        else          await monitoringAPI.addPhotovoltaicProduction(payload);
      }

      setShowModal(false);
      fetchData();

      
      if (!editItem && (modalType === 'eau' || modalType === 'electricite')) {
        await verifierSeuil(modalType);
      }

    } catch (err) {
      setFormError('Erreur : ' + (err.response?.data?.message || err.message));
    } finally {
      setFormLoading(false);
    }
  };

  
  const renderStats = (cards) => (
    <div className={`grid grid-cols-1 md:grid-cols-${cards.length} gap-4`}>
      {cards.map((c) => (
        <div key={c.label} className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500">{c.label}</h3>
          <p className={`text-2xl font-bold ${c.color}`}>{c.value}</p>
        </div>
      ))}
    </div>
  );

  
  const renderWaterTab = () => (
    <div className="space-y-6">
      {renderStats([
        { label: 'Total des relevés',     value: stats.total_readings || 0,    color: 'text-blue-600' },
        { label: 'Consommation totale',   value: `${stats.total_consumption || 0} m³`, color: 'text-green-600' },
        { label: 'Période',               value: stats.first_reading && stats.last_reading
          ? `${new Date(stats.first_reading).toLocaleDateString('fr-FR')} — ${new Date(stats.last_reading).toLocaleDateString('fr-FR')}`
          : 'N/A',                        color: 'text-gray-800 text-sm font-normal' },
      ])}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center flex-wrap gap-2">
          <h3 className="text-lg font-medium text-gray-900">Relevés de consommation d'eau</h3>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => handleRecalculer('eau')}
              disabled={recalcLoading}
              title="Recalcule consommation_jour et coût pour tous les relevés importés"
              className="bg-amber-500 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-amber-600 disabled:opacity-50"
            >
              {recalcLoading ? '...' : '🔄 Recalculer coûts'}
            </button>
            <button onClick={() => openEauModal()}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 flex items-center gap-2">
              <span>+</span> Ajouter un relevé
            </button>
          </div>
        </div>
        {recalcMsg && (
          <div className={`mx-6 mt-3 p-3 rounded-lg text-sm ${recalcMsg.ok ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
            {recalcMsg.text}
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-gray-50">
              <tr>
                {['Date', 'Compteur (m³)', 'Conso. Journalière (m³)', 'Coût Total (DT)', 'Actions'].map(h => (
                  <th key={h} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredData.length === 0 ? (
                <tr><td colSpan={5} className="px-6 py-8 text-center text-gray-400">Aucun relevé trouvé</td></tr>
              ) : filteredData.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{new Date(item.date_releve).toLocaleDateString('fr-FR')}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{item.compteur}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {item.consommation_journaliere == null ? '—'
                      : item.consommation_journaliere < 0
                        ? <span className="text-red-500 font-medium" title="Compteur inférieur au relevé précédent">⚠ {item.consommation_journaliere}</span>
                        : <span className="text-gray-900">{item.consommation_journaliere}</span>}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    {item.cout_total == null ? '—'
                      : item.cout_total < 0
                        ? <span className="text-red-500" title="Valeur négative — vérifier le relevé">⚠ {Number(item.cout_total).toLocaleString('fr-FR', { minimumFractionDigits: 3 })}</span>
                        : <span className="text-green-700">{Number(item.cout_total).toLocaleString('fr-FR', { minimumFractionDigits: 3 })}</span>}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <button onClick={() => openEauModal(item)} className="text-blue-600 hover:text-blue-800 font-medium mr-3">✏️ Modifier</button>
                    <button onClick={() => handleDelete('eau', item.id)} className="text-red-600 hover:text-red-800 font-medium">🗑️ Supprimer</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  // ── Render Électricité ────────────────────────────────────
  const renderElectricityTab = () => (
    <div className="space-y-6">
      {renderStats([
        { label: 'Total des relevés',      value: stats.total_readings || 0,          color: 'text-blue-600'  },
        { label: 'Consommation moyenne',   value: `${Math.round(stats.avg_consumption || 0)} kWh`, color: 'text-yellow-600' },
        { label: 'Période',                value: stats.first_reading && stats.last_reading
          ? `${new Date(stats.first_reading).toLocaleDateString('fr-FR')} — ${new Date(stats.last_reading).toLocaleDateString('fr-FR')}`
          : 'N/A',                         color: 'text-gray-800 text-sm font-normal' },
      ])}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center flex-wrap gap-2">
          <h3 className="text-lg font-medium text-gray-900">Relevés de consommation électrique</h3>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => handleRecalculer('electricite')}
              disabled={recalcLoading}
              title="Recalcule consommation_jour et coût pour tous les relevés importés"
              className="bg-amber-500 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-amber-600 disabled:opacity-50"
            >
              {recalcLoading ? '...' : '🔄 Recalculer coûts'}
            </button>
            <button onClick={() => openElecModal()}
              className="bg-yellow-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-yellow-600 flex items-center gap-2">
              <span>+</span> Ajouter un relevé
            </button>
          </div>
        </div>
        {recalcMsg && (
          <div className={`mx-6 mt-3 p-3 rounded-lg text-sm ${recalcMsg.ok ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
            {recalcMsg.text}
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-gray-50">
              <tr>
                {['Date', 'Phase 1 (kWh)', 'Phase 2 (kWh)', 'Phase 3 (kWh)', 'Conso. Jour (kWh)', 'Coût Total (DT)', 'Actions'].map(h => (
                  <th key={h} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredData.length === 0 ? (
                <tr><td colSpan={7} className="px-6 py-8 text-center text-gray-400">Aucun relevé trouvé</td></tr>
              ) : filteredData.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{new Date(item.date_releve).toLocaleDateString('fr-FR')}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{item.phase1}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{item.phase2}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{item.phase3}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-blue-700 font-medium">
                    {item.consommation_jour != null ? Number(item.consommation_jour).toLocaleString('fr-FR') : '—'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-green-700 font-medium">
                    {item.cout_total != null ? Number(item.cout_total).toLocaleString('fr-FR', { minimumFractionDigits: 3 }) : '—'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <button onClick={() => openElecModal(item)} className="text-blue-600 hover:text-blue-800 font-medium mr-3">✏️ Modifier</button>
                    <button onClick={() => handleDelete('electricite', item.id)} className="text-red-600 hover:text-red-800 font-medium">🗑️ Supprimer</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  // ── Render Photovoltaïque ─────────────────────────────────
  const renderPhotovoltaicTab = () => (
    <div className="space-y-6">
      {renderStats([
        { label: 'Total enregistrements', value: stats.total_records || 0,        color: 'text-blue-600'   },
        { label: 'Production totale',     value: `${stats.total_production || 0} kWh`, color: 'text-green-600'  },
        { label: 'Prod. moy./jour',       value: `${stats.avg_production || 0} kWh`,   color: 'text-yellow-600' },
        { label: 'Puissance installée',   value: `${stats.installed_power || 0} kWp`,  color: 'text-purple-600' },
      ])}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
          <h3 className="text-lg font-medium text-gray-900">Production photovoltaïque</h3>
          <button onClick={() => openPvModal()}
            className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-700 flex items-center gap-2">
            <span>+</span> Ajouter un enregistrement
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-gray-50">
              <tr>
                {['Date', 'Puissance (kWp)', 'Prod. journalière (kWh)', 'Prod. cumulée (kWh)', 'Heures équiv. (h)', 'Actions'].map(h => (
                  <th key={h} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredData.length === 0 ? (
                <tr><td colSpan={6} className="px-6 py-8 text-center text-gray-400">Aucun enregistrement trouvé</td></tr>
              ) : filteredData.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{new Date(item.date).toLocaleDateString('fr-FR')}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{item.puissance_installee_kwp ?? '-'}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{item.production_journaliere_kwh ?? '-'}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{item.production_cumulee_kwh ?? '-'}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{item.heures_equivalentes_h ?? '-'}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <button onClick={() => openPvModal(item)} className="text-blue-600 hover:text-blue-800 font-medium mr-3">✏️ Modifier</button>
                    <button onClick={() => handleDelete('photovoltaique', item.id)} className="text-red-600 hover:text-red-800 font-medium">🗑️ Supprimer</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  // ── Modal formulaire ──────────────────────────────────────
  const renderModal = () => {
    if (!showModal) return null;

    const titles = {
      eau:           { add: 'Ajouter un relevé eau',         edit: 'Modifier le relevé eau',         color: 'bg-blue-600',   hcolor: 'hover:bg-blue-700'  },
      electricite:   { add: 'Ajouter un relevé électricité', edit: 'Modifier le relevé électricité', color: 'bg-yellow-500', hcolor: 'hover:bg-yellow-600'},
      photovoltaique:{ add: 'Ajouter une production PV',     edit: 'Modifier la production PV',      color: 'bg-purple-600', hcolor: 'hover:bg-purple-700'},
    };
    const t = titles[modalType] || {};

    return (
      <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 max-h-[95vh] overflow-y-auto">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">{editItem ? t.edit : t.add}</h2>

          {formError && (
            <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{formError}</div>
          )}

          {/* ── QR Code saisie mobile (eau / électricité seulement) ── */}
          {!editItem && energieQr && (
            <div className="mb-5 p-4 bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-xl">
              <p className="text-xs font-bold text-blue-700 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                📱 Saisie mobile via QR Code
              </p>
              <div className="flex items-center gap-4">
                {/* QR image */}
                <div className="flex-shrink-0 border border-blue-200 rounded-xl p-2 bg-white shadow-sm">
                  <img src={energieQr.qrCode} alt="QR saisie énergie" className="w-24 h-24" />
                </div>
                {/* Info + actions */}
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-blue-600 font-semibold mb-1">{energieQr.label}</p>
                  <p className="text-xs text-gray-500 mb-2 truncate">{energieQr.url}</p>
                  <div className="flex gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(energieQr.url);
                        setQrCopied(true);
                        setTimeout(() => setQrCopied(false), 2000);
                      }}
                      className="px-3 py-1.5 bg-white border border-blue-200 text-blue-700 rounded-lg text-xs font-semibold hover:bg-blue-50 transition flex items-center gap-1"
                    >
                      {qrCopied ? '✅ Copié' : '📋 Copier lien'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const win = window.open('', '_blank');
                        win.document.write(`
                          <html><head><title>QR ${energieQr.label}</title>
                          <style>
                            body { font-family: Arial, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #f8fafc; }
                            .card { background: white; border-radius: 16px; padding: 32px; box-shadow: 0 4px 24px rgba(0,0,0,0.08); text-align: center; max-width: 340px; }
                            h2 { color: #1e3a8a; font-size: 20px; margin-bottom: 8px; }
                            p { color: #64748b; font-size: 13px; margin-bottom: 16px; word-break: break-all; }
                            img { width: 220px; height: 220px; border: 1px solid #e2e8f0; border-radius: 12px; }
                            @media print { body { background: white; } .card { box-shadow: none; } }
                          </style></head>
                          <body>
                            <div class="card">
                              <h2>📱 ${energieQr.label}</h2>
                              <p>Scannez ce QR code pour saisir un relevé depuis votre smartphone</p>
                              <img src="${energieQr.qrCode}" alt="QR Code" />
                              <p style="margin-top:12px; font-size:11px;">${energieQr.url}</p>
                            </div>
                            <script>window.onload = () => { window.print(); }<\/script>
                          </body></html>
                        `);
                        win.document.close();
                      }}
                      className="px-3 py-1.5 bg-blue-900 text-white rounded-lg text-xs font-semibold hover:bg-blue-800 transition flex items-center gap-1"
                    >
                      🖨️ Imprimer QR
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-4">
            {/* ── Eau ── */}
            {modalType === 'eau' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date du relevé *</label>
                  <input type="date" value={formData.date_releve}
                    onChange={e => { setFormData({ ...formData, date_releve: e.target.value }); setFormErreurs(p => ({...p, date_releve: null})); }}
                    className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${formErreurs.date_releve ? 'border-red-400' : 'border-gray-300'}`}
                  />
                  <FieldError erreur={formErreurs.date_releve} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Valeur du compteur (m³) *</label>
                  <input type="number" step="0.001" min="0" value={formData.compteur}
                    onChange={e => { setFormData({ ...formData, compteur: e.target.value }); setFormErreurs(p => ({...p, compteur: null})); }}
                    className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${formErreurs.compteur ? 'border-red-400' : 'border-gray-300'}`}
                    placeholder="ex: 3022.000"
                  />
                  <FieldError erreur={formErreurs.compteur} />
                </div>
              </>
            )}

            {/* ── Électricité ── */}
            {modalType === 'electricite' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date du relevé *</label>
                  <input type="date" value={formData.date_releve}
                    onChange={e => { setFormData({ ...formData, date_releve: e.target.value }); setFormErreurs(p => ({...p, date_releve: null})); }}
                    className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500 ${formErreurs.date_releve ? 'border-red-400' : 'border-gray-300'}`}
                  />
                  <FieldError erreur={formErreurs.date_releve} />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {['phase1', 'phase2', 'phase3'].map((ph, i) => (
                    <div key={ph}>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Phase {i+1} (kWh) *</label>
                      <input type="number" step="0.001" min="0" value={formData[ph]}
                        onChange={e => { setFormData({ ...formData, [ph]: e.target.value }); setFormErreurs(p => ({...p, [ph]: null})); }}
                        className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500 ${formErreurs[ph] ? 'border-red-400' : 'border-gray-300'}`}
                        placeholder={`ex: ${2500 + i * 100}`}
                      />
                      <FieldError erreur={formErreurs[ph]} />
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* ── Photovoltaïque ── */}
            {modalType === 'photovoltaique' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date *</label>
                  <input type="date" value={formData.date}
                    onChange={e => { setFormData({ ...formData, date: e.target.value }); setFormErreurs(p => ({...p, date: null})); }}
                    className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 ${formErreurs.date ? 'border-red-400' : 'border-gray-300'}`}
                  />
                  <FieldError erreur={formErreurs.date} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Puissance installée (kWp) *</label>
                  <input type="number" step="0.01" min="0" value={formData.puissance_installee_kwp}
                    onChange={e => { setFormData({ ...formData, puissance_installee_kwp: e.target.value }); setFormErreurs(p => ({...p, puissance_installee_kwp: null})); }}
                    className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 ${formErreurs.puissance_installee_kwp ? 'border-red-400' : 'border-gray-300'}`}
                    placeholder="ex: 322.00"
                  />
                  <FieldError erreur={formErreurs.puissance_installee_kwp} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Production journalière (kWh)</label>
                  <input type="number" step="0.01" min="0" value={formData.production_journaliere_kwh}
                    onChange={e => setFormData({ ...formData, production_journaliere_kwh: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                    placeholder="ex: 850.00"
                  />
                </div>
              </>
            )}
          </div>

          <div className="flex justify-end gap-3 mt-6">
            <button onClick={() => setShowModal(false)}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200">
              Annuler
            </button>
            <button onClick={handleFormSubmit} disabled={formLoading}
              className={`px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50 ${t.color} ${t.hcolor}`}>
              {formLoading ? 'Enregistrement...' : editItem ? '✅ Modifier' : '✅ Ajouter'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  const tabs = [
    { id: 'eau',           label: 'Consommation Eau',          icon: '💧' },
    { id: 'electricite',   label: 'Consommation Électricité',  icon: '⚡' },
    { id: 'photovoltaique',label: 'Production Photovoltaïque', icon: '☀️' },
  ];

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Monitoring des Énergies</h1>
        <p className="text-gray-600 mt-1">Gestion des relevés eau, électricité et production photovoltaïque</p>
      </div>

      {/* Alerte seuil */}
      {alerteSeuil && (
        <div className="mb-6">
          <AlerteSeuil message={alerteSeuil} onClose={() => setAlerteSeuil(null)} />
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-8 overflow-x-auto">
          {tabs.map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`py-2 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
                activeTab === tab.id ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}>
              <span className="mr-2">{tab.icon}</span>{tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Barre de filtre */}
      <div className="bg-white rounded-lg shadow p-4 flex flex-wrap gap-3 items-end mb-6">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Date début</label>
          <input type="date" value={dateDebut} onChange={e => setDateDebut(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"/>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Date fin</label>
          <input type="date" value={dateFin} onChange={e => setDateFin(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"/>
        </div>
        <button onClick={() => { setDateDebut(''); setDateFin(''); }}
          className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200">
          Réinitialiser
        </button>
        {!loading && (
          <span className="text-xs text-gray-400 self-end pb-2">
            {filteredData.length} / {data.length} enregistrement{data.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Contenu */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-gray-500">Chargement des données...</div>
        </div>
      ) : (
        <>
          {activeTab === 'eau'            && renderWaterTab()}
          {activeTab === 'electricite'    && renderElectricityTab()}
          {activeTab === 'photovoltaique' && renderPhotovoltaicTab()}
        </>
      )}

      {renderModal()}
    </div>
  );
};

export default MonitoringPage;

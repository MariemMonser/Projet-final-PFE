// ============================================================
// ADMIN MONITORING PAGE - VIEW ONLY
// Same as technician monitoring but without CRUD operations
// ============================================================
import React, { useState, useEffect, useMemo } from 'react';
import { monitoringAPI } from '../../api';

const AdminMonitoringPage = () => {
  const [activeTab, setActiveTab] = useState('eau');
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [stats, setStats] = useState({});
  const [dateDebut, setDateDebut] = useState('');
  const [dateFin, setDateFin] = useState('');
  const [search, setSearch] = useState('');

  const tabs = [
    { id: 'eau', label: 'Consommation Eau', icon: '💧' },
    { id: 'electricite', label: 'Consommation Électricité', icon: '⚡' },
    { id: 'photovoltaique', label: 'Production Photovoltaïque', icon: '☀️' },
    { id: 'interventions', label: 'Interventions', icon: '🔧' }
  ];

  useEffect(() => {
    setDateDebut('');
    setDateFin('');
    setSearch('');
    loadData();
  }, [activeTab]);

  const filteredData = useMemo(() => {
    let result = [...data];
    const getDateStr = (item) => {
      let d;
      if (activeTab === 'eau' || activeTab === 'electricite') d = item.date_releve;
      else if (activeTab === 'photovoltaique') d = item.date;
      else d = item.date_intervention;
      return d ? String(d).slice(0, 10) : null;
    };
    if (dateDebut) {
      result = result.filter(item => { const d = getDateStr(item); return d && d >= dateDebut; });
    }
    if (dateFin) {
      result = result.filter(item => { const d = getDateStr(item); return d && d <= dateFin; });
    }
    if (search && activeTab === 'interventions') {
      const q = search.toLowerCase();
      result = result.filter(item => (item.panne_description || '').toLowerCase().includes(q));
    }
    return result;
  }, [data, dateDebut, dateFin, search, activeTab]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError('');
      let dataResponse;
      let statsResponse;

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
        case 'interventions':
          dataResponse  = await monitoringAPI.getInterventions();
          statsResponse = await monitoringAPI.getInterventionsStats();
          break;
        default:
          dataResponse  = { data: [] };
          statsResponse = { data: {} };
      }

      setData(dataResponse.data || []);
      setStats(statsResponse.data || {});
    } catch (err) {
      setError('Erreur lors du chargement des données : ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const renderWaterTab = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500">Total des relevés</h3>
          <p className="text-2xl font-bold text-blue-600">{stats.total_readings || 0}</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500">Consommation totale</h3>
          <p className="text-2xl font-bold text-green-600">{stats.total_consumption || 0} m³</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500">Période</h3>
          <p className="text-sm text-gray-900">
            {stats.first_reading && stats.last_reading 
              ? `${new Date(stats.first_reading).toLocaleDateString('fr-FR')} - ${new Date(stats.last_reading).toLocaleDateString('fr-FR')}`
              : 'N/A'
            }
          </p>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Relevés de consommation d'eau</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Compteur (m³)</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Consommation Journalière (m³)</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Coût Total (DT)</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredData.map((item, index) => (
                <tr key={index} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {new Date(item.date_releve).toLocaleDateString('fr-FR')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {item.compteur}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {item.consommation_journaliere > 0 ? item.consommation_journaliere : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-green-700 font-medium">
                    {item.cout_total != null ? Number(item.cout_total).toLocaleString('fr-FR', { minimumFractionDigits: 3 }) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  const renderElectricityTab = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500">Total des relevés</h3>
          <p className="text-2xl font-bold text-blue-600">{stats.total_readings || 0}</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500">Consommation moyenne</h3>
          <p className="text-2xl font-bold text-yellow-600">{Math.round(stats.avg_consumption || 0)} kWh</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500">Période</h3>
          <p className="text-sm text-gray-900">
            {stats.first_reading && stats.last_reading
              ? `${new Date(stats.first_reading).toLocaleDateString('fr-FR')} - ${new Date(stats.last_reading).toLocaleDateString('fr-FR')}`
              : 'N/A'
            }
          </p>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Relevés de consommation électrique</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Phase 1</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Phase 2</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Phase 3</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Conso. Jour (kWh)</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Coût Total (DT)</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredData.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {new Date(item.date_releve).toLocaleDateString('fr-FR')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {item.phase1 != null ? item.phase1 : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {item.phase2 != null ? item.phase2 : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {item.phase3 != null ? item.phase3 : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-blue-700 font-medium">
                    {item.consommation_jour != null ? Number(item.consommation_jour).toLocaleString('fr-FR') : '—'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-green-700 font-medium">
                    {item.cout_total != null ? Number(item.cout_total).toLocaleString('fr-FR', { minimumFractionDigits: 3 }) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  const renderPhotovoltaicTab = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500">Total des enregistrements</h3>
          <p className="text-2xl font-bold text-blue-600">{stats.total_records || 0}</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500">Production totale</h3>
          <p className="text-2xl font-bold text-green-600">{stats.total_production || 0} kWh</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500">Production moyenne/jour</h3>
          <p className="text-2xl font-bold text-yellow-600">{stats.avg_production || 0} kWh</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500">Puissance installée</h3>
          <p className="text-2xl font-bold text-purple-600">{stats.installed_power || 0} kWp</p>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Production photovoltaïque</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Puissance (kWp)</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Production journalière (kWh)</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Production cumulée (kWh)</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Heures équivalentes (h)</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredData.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {new Date(item.date).toLocaleDateString('fr-FR')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {item.puissance_installee_kwp != null ? item.puissance_installee_kwp : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {item.production_journaliere_kwh != null ? item.production_journaliere_kwh : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {item.production_cumulee_kwh != null ? item.production_cumulee_kwh : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {item.heures_equivalentes_h != null ? item.heures_equivalentes_h : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  const renderInterventionsTab = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500">Total des interventions</h3>
          <p className="text-2xl font-bold text-blue-600">{stats.total_interventions || 0}</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500">Pannes uniques</h3>
          <p className="text-2xl font-bold text-orange-600">{stats.unique_pannes || 0}</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500">Quantité totale</h3>
          <p className="text-2xl font-bold text-green-600">{stats.total_quantity || 0}</p>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Liste des interventions</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID Panne</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID PRC</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Quantité</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredData.map((item) => (
                <tr key={item.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {item.id}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {item.panne_id}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {item.prc_id}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {item.quantite}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {item.panne_description || '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Monitoring des Systèmes</h1>
        <p className="text-gray-600 mt-1">Surveillance des consommations et des interventions</p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-8">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <span className="mr-2">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Filter bar */}
      <div className="bg-white rounded-lg shadow p-4 flex flex-wrap gap-3 items-end mb-6">
        {activeTab !== 'interventions' && (
          <>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Date début</label>
              <input
                type="date"
                value={dateDebut}
                onChange={e => setDateDebut(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Date fin</label>
              <input
                type="date"
                value={dateFin}
                onChange={e => setDateFin(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </>
        )}
        {activeTab === 'interventions' && (
          <div className="flex-1 min-w-64">
            <label className="block text-xs font-medium text-gray-500 mb-1">Recherche (description)</label>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        )}
        <button
          onClick={() => { setDateDebut(''); setDateFin(''); setSearch(''); }}
          className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200"
        >
          Réinitialiser
        </button>
        {!loading && (
          <span className="text-xs text-gray-400 self-end pb-2">
            {filteredData.length} / {data.length} enregistrement{data.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-gray-500">Chargement des données...</div>
        </div>
      ) : (
        <>
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700">
              {error}
            </div>
          )}
          {activeTab === 'eau' && renderWaterTab()}
          {activeTab === 'electricite' && renderElectricityTab()}
          {activeTab === 'photovoltaique' && renderPhotovoltaicTab()}
          {activeTab === 'interventions' && renderInterventionsTab()}
        </>
      )}
    </div>
  );
};

export default AdminMonitoringPage;

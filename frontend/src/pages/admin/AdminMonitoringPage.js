import React, { useState, useEffect, useMemo } from 'react';
import { monitoringAPI } from '../../api';

// Export data as CSV download
const exportCSV = (rows, filename, columns) => {
  if (!rows.length) return;
  const header = columns.map(c => c.label).join(';');
  const lines  = rows.map(row => columns.map(c => {
    const v = c.key ? row[c.key] : c.format(row);
    return String(v ?? '').replace(/;/g, ',');
  }).join(';'));
  const blob = new Blob(['﻿' + [header, ...lines].join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a'); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
};

const StatCard = ({ label, value, sub, icon, color }) => (
  <div className={`bg-white rounded-xl border-l-4 ${color} shadow-sm p-5`}>
    <div className="flex items-start justify-between">
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{label}</p>
        <p className="text-2xl font-bold text-gray-900">{value ?? '—'}</p>
        {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
      </div>
      <span className="text-2xl">{icon}</span>
    </div>
  </div>
);

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
    { id: 'eau',           label: 'Eau',              icon: '💧' },
    { id: 'electricite',   label: 'Électricité',       icon: '⚡' },
    { id: 'photovoltaique',label: 'Photovoltaïque',    icon: '☀️' },
    { id: 'planifiees',    label: 'Planifiées',         icon: '📅' },
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
      const d = activeTab === 'photovoltaique' ? item.date : (item.date_releve || item.date_intervention);
      return d ? String(d).slice(0, 10) : null;
    };
    if (dateDebut) result = result.filter(item => { const d = getDateStr(item); return d && d >= dateDebut; });
    if (dateFin)   result = result.filter(item => { const d = getDateStr(item); return d && d <= dateFin;   });
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(item =>
        (item.technicien || item.description || item.panne_description || '').toLowerCase().includes(q)
      );
    }
    // For PV: only show rows with actual production
    if (activeTab === 'photovoltaique') {
      result = result.filter(item => parseFloat(item.production_journaliere_kwh || 0) > 0);
    }
    // For planifiées: only show Preventive + Planifiee/En cours
    if (activeTab === 'planifiees') {
      result = result.filter(item =>
        item.type_intervention === 'Preventive' && ['Planifiee','En cours'].includes(item.statut)
      );
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
        case 'planifiees':
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

  const csvConfigs = {
    eau: {
      filename: 'consommation_eau.csv',
      columns: [
        { label: 'Date',           format: r => new Date(r.date_releve).toLocaleDateString('fr-FR') },
        { label: 'Compteur (m³)',  key: 'compteur' },
        { label: 'Conso. Jour',    key: 'consommation_journaliere' },
        { label: 'Coût (DT)',      key: 'cout_total' },
      ]
    },
    electricite: {
      filename: 'consommation_electricite.csv',
      columns: [
        { label: 'Date',       format: r => new Date(r.date_releve).toLocaleDateString('fr-FR') },
        { label: 'Phase 1',    key: 'phase1' },
        { label: 'Phase 2',    key: 'phase2' },
        { label: 'Phase 3',    key: 'phase3' },
        { label: 'Conso (kWh)',key: 'consommation_jour' },
        { label: 'Coût (DT)',  key: 'cout_total' },
      ]
    },
    photovoltaique: {
      filename: 'production_pv.csv',
      columns: [
        { label: 'Date',        format: r => new Date(r.date).toLocaleDateString('fr-FR') },
        { label: 'Puiss. (kWp)',key: 'puissance_installee_kwp' },
        { label: 'Prod. (kWh)', key: 'production_journaliere_kwh' },
        { label: 'Cumulé (kWh)',key: 'production_cumulee_kwh' },
      ]
    },
    planifiees: {
      filename: 'interventions_planifiees.csv',
      columns: [
        { label: 'Date',      format: r => new Date(r.date_intervention).toLocaleDateString('fr-FR') },
        { label: 'Type',      key: 'type_intervention' },
        { label: 'Technicien',key: 'technicien' },
        { label: 'Statut',    key: 'statut' },
        { label: 'Description',key: 'description' },
      ]
    },
  };

  const renderTable = (columns, rows) => (
    <div className="overflow-x-auto">
      <table className="min-w-full">
        <thead>
          <tr className="bg-gradient-to-r from-blue-900 to-blue-800">
            {columns.map(c => (
              <th key={c.label} className="px-5 py-3 text-left text-xs font-semibold text-blue-100 uppercase tracking-wider">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-100">
          {rows.map((row, i) => (
            <tr key={i} className="hover:bg-gray-50 transition">
              {columns.map(c => (
                <td key={c.label} className="px-5 py-3 text-sm text-gray-800 whitespace-nowrap">
                  {c.render ? c.render(row) : (row[c.key] != null ? row[c.key] : '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <p className="text-3xl mb-2">📭</p>
          <p className="text-sm">Aucune donnée pour ce filtre</p>
        </div>
      )}
    </div>
  );

  const renderContent = () => {
    if (activeTab === 'eau') {
      const period = stats.first_reading && stats.last_reading
        ? `${new Date(stats.first_reading).toLocaleDateString('fr-FR')} – ${new Date(stats.last_reading).toLocaleDateString('fr-FR')}`
        : 'N/A';
      return (
        <div className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <StatCard label="Total relevés" value={stats.total_readings || 0} icon="📊" color="border-blue-500" />
            <StatCard label="Consommation totale" value={`${stats.total_consumption || 0} m³`} icon="💧" color="border-cyan-500" />
            <StatCard label="Période" value={period} icon="📅" color="border-gray-300" />
          </div>
          {renderTable([
            { label: 'Date',      render: r => new Date(r.date_releve).toLocaleDateString('fr-FR') },
            { label: 'Compteur (m³)', key: 'compteur' },
            { label: 'Conso. jour (m³)', render: r => r.consommation_journaliere > 0 ? r.consommation_journaliere : '—' },
            { label: 'Coût (DT)', render: r => r.cout_total != null ? Number(r.cout_total).toLocaleString('fr-FR', { minimumFractionDigits: 3 }) : '—' },
          ], filteredData)}
        </div>
      );
    }
    if (activeTab === 'electricite') {
      return (
        <div className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <StatCard label="Total relevés" value={stats.total_readings || 0} icon="📊" color="border-blue-500" />
            <StatCard label="Conso. moyenne/jour" value={`${Math.round(stats.avg_consumption || 0)} kWh`} icon="⚡" color="border-yellow-500" />
            <StatCard label="Période" value={stats.first_reading ? `${new Date(stats.first_reading).toLocaleDateString('fr-FR')} – ${new Date(stats.last_reading).toLocaleDateString('fr-FR')}` : 'N/A'} icon="📅" color="border-gray-300" />
          </div>
          {renderTable([
            { label: 'Date',  render: r => new Date(r.date_releve).toLocaleDateString('fr-FR') },
            { label: 'Ph.1',  key: 'phase1' },
            { label: 'Ph.2',  key: 'phase2' },
            { label: 'Ph.3',  key: 'phase3' },
            { label: 'Conso (kWh)', render: r => r.consommation_jour != null ? Number(r.consommation_jour).toLocaleString('fr-FR') : '—' },
            { label: 'Coût (DT)',   render: r => r.cout_total != null ? Number(r.cout_total).toLocaleString('fr-FR', { minimumFractionDigits: 3 }) : '—' },
          ], filteredData)}
        </div>
      );
    }
    if (activeTab === 'photovoltaique') {
      return (
        <div className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <StatCard label="Jours avec production" value={filteredData.length} icon="☀️" color="border-yellow-500" />
            <StatCard label="Production totale" value={`${stats.total_production || 0} kWh`} icon="⚡" color="border-green-500" />
            <StatCard label="Prod. moy/jour" value={`${stats.avg_production || 0} kWh`} icon="📊" color="border-blue-500" />
            <StatCard label="Puissance installée" value={`${stats.installed_power || 0} kWp`} icon="🔌" color="border-purple-500" />
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-xs text-amber-700 font-medium">
            ☀️ Seuls les jours avec production réelle sont affichés (production &gt; 0 kWh)
          </div>
          {renderTable([
            { label: 'Date',         render: r => new Date(r.date).toLocaleDateString('fr-FR') },
            { label: 'Puiss. (kWp)', key: 'puissance_installee_kwp' },
            { label: 'Prod. jour (kWh)', key: 'production_journaliere_kwh' },
            { label: 'Cumulé (kWh)', key: 'production_cumulee_kwh' },
            { label: 'Heures éq.', key: 'heures_equivalentes_h' },
          ], filteredData)}
        </div>
      );
    }
    if (activeTab === 'planifiees') {
      const parseDesc = (desc) => {
        if (!desc) return {};
        const out = {};
        desc.split(' | ').forEach(p => { const m = p.match(/^(.*?):\s*(.*)$/); if (m) out[m[1].trim()] = m[2].trim(); });
        return out;
      };
      return (
        <div className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <StatCard label="Planifiées" value={filteredData.filter(r => r.statut === 'Planifiee').length} icon="📅" color="border-indigo-500" />
            <StatCard label="En cours" value={filteredData.filter(r => r.statut === 'En cours').length} icon="⚡" color="border-amber-500" />
          </div>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <table className="min-w-full">
              <thead>
                <tr className="bg-gradient-to-r from-indigo-900 to-indigo-700">
                  {['Date', 'Technicien', 'Équipement', 'Priorité', 'Statut'].map(h => (
                    <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-indigo-100 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredData.map((item, i) => {
                  const d = parseDesc(item.description);
                  const techName = (item.technicien || '').replace(/<.+?>/, '').trim();
                  return (
                    <tr key={i} className="hover:bg-gray-50 transition">
                      <td className="px-5 py-3 text-sm text-gray-800">{new Date(item.date_intervention).toLocaleDateString('fr-FR')}</td>
                      <td className="px-5 py-3 text-sm text-gray-800">{techName}</td>
                      <td className="px-5 py-3 text-sm text-gray-800">{d.Equipement || '—'}</td>
                      <td className="px-5 py-3">
                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                          d.Priorite === 'Critique' ? 'bg-red-100 text-red-700' :
                          d.Priorite === 'Haute'    ? 'bg-orange-100 text-orange-700' :
                          'bg-green-100 text-green-700'
                        }`}>{d.Priorite || 'Normale'}</span>
                      </td>
                      <td className="px-5 py-3">
                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                          item.statut === 'Planifiee' ? 'bg-indigo-100 text-indigo-700' : 'bg-amber-100 text-amber-700'
                        }`}>{item.statut}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filteredData.length === 0 && <div className="text-center py-12 text-gray-400"><p className="text-3xl mb-2">📅</p><p className="text-sm">Aucune intervention planifiée</p></div>}
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="p-6 bg-gray-50 min-h-full space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Monitoring des Systèmes</h1>
          <p className="text-sm text-gray-500 mt-0.5">Consultation des consommations et interventions planifiées</p>
        </div>
        <button
          onClick={() => exportCSV(filteredData, csvConfigs[activeTab]?.filename || 'export.csv', csvConfigs[activeTab]?.columns || [])}
          disabled={loading || filteredData.length === 0}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-700 text-white rounded-lg text-sm font-medium hover:bg-emerald-600 disabled:opacity-40 transition shadow-sm"
        >
          ⬇ Exporter CSV ({filteredData.length})
        </button>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-1 flex gap-1 flex-wrap">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => { setActiveTab(tab.id); setDateDebut(''); setDateFin(''); setSearch(''); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition ${
              activeTab === tab.id
                ? 'bg-blue-900 text-white shadow'
                : 'text-gray-500 hover:bg-gray-100'
            }`}
          >
            <span>{tab.icon}</span>{tab.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Date début</label>
          <input type="date" value={dateDebut} onChange={e => setDateDebut(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Date fin</label>
          <input type="date" value={dateFin} onChange={e => setDateFin(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div className="flex-1 min-w-44">
          <label className="block text-xs font-medium text-gray-500 mb-1">Recherche</label>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Technicien, description..."
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <button onClick={() => { setDateDebut(''); setDateFin(''); setSearch(''); }}
          className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition">
          Réinitialiser
        </button>
        {!loading && <span className="text-xs text-gray-400 self-end pb-1">{filteredData.length} / {data.length} lignes</span>}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-900"/>
        </div>
      ) : (
        <>
          {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            {renderContent()}
          </div>
        </>
      )}
    </div>
  );
};

export default AdminMonitoringPage;



import React, { useState, useEffect } from 'react';
import { usersAPI } from '../../api';
import { exportToPDF } from '../../utils/exportPDF';

const ACTION_COLORS = {
  LOGIN:             'bg-green-100 text-green-700',
  LOGOUT:            'bg-gray-100 text-gray-600',
  CREATE_USER:       'bg-blue-100 text-blue-700',
  UPDATE_USER:       'bg-yellow-100 text-yellow-700',
  DELETE_USER:       'bg-red-100 text-red-700',
  DEACTIVATE_USER:   'bg-orange-100 text-orange-700',
  FORCE_LOGOUT:      'bg-red-100 text-red-700',
  RESET_PASSWORD:    'bg-purple-100 text-purple-700',
  CREATE_EQUIPEMENT: 'bg-blue-100 text-blue-700',
  UPDATE_EQUIPEMENT: 'bg-yellow-100 text-yellow-700',
  DELETE_EQUIPEMENT: 'bg-red-100 text-red-700',
};

const AuditLogPage = () => {
  const [logs, setLogs]           = useState([]);
  const [loading, setLoading]     = useState(true);
  const [filterAction, setFilterAction] = useState('');

  const chargerLogs = async () => {
    setLoading(true);
    try {
      const res = await usersAPI.getAudit();
      setLogs(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { chargerLogs(); }, []);

  const filtres = logs.filter((l) =>
    !filterAction || l.action === filterAction
  );

  return (
    <div className="p-6" id="audit-log-page">

      
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Journal d'Audit</h1>
          <p className="text-gray-500 text-sm mt-1">Toutes les actions enregistrees dans le systeme</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            <span>🔒</span>
            <span className="text-red-700 text-xs font-semibold">Table immuable</span>
          </div>
          <button
            onClick={() => exportToPDF('audit-log-page', 'journal_audit')}
            className="flex items-center gap-1 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-xs hover:bg-gray-200 transition"
          >
            📄 Export PDF
          </button>
        </div>
      </div>

      {/* Filtres */}
      <div className="flex gap-3 mb-5">
        <select value={filterAction} onChange={(e) => setFilterAction(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">Toutes les actions</option>
          {Object.keys(ACTION_COLORS).map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
        <button onClick={chargerLogs}
          className="px-4 py-2 bg-blue-900 text-white rounded-lg text-sm hover:bg-blue-800 transition">
          🔄 Actualiser
        </button>
      </div>

      {/* Tableau */}
      <div className="bg-white rounded-xl shadow border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-900"></div>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-xs uppercase">
              <tr>
                <th className="px-5 py-3 text-left">Date / Heure</th>
                <th className="px-5 py-3 text-left">Utilisateur</th>
                <th className="px-5 py-3 text-left">Action</th>
                <th className="px-5 py-3 text-left">Table</th>
                <th className="px-5 py-3 text-left">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtres.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-gray-400">
                    Aucun log trouve.
                  </td>
                </tr>
              ) : filtres.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50 transition">
                  <td className="px-5 py-3 text-gray-500 text-xs whitespace-nowrap">
                    {log.timestamp ? new Date(log.timestamp).toLocaleString('fr-FR') : '—'}
                  </td>
                  <td className="px-5 py-3">
                    {log.prenom || log.nom ? (
                      <>
                        <div className="font-medium text-gray-900">{log.prenom} {log.nom}</div>
                        <div className="text-xs text-gray-400">{log.user_email}</div>
                      </>
                    ) : (
                      <>
                        <div className="font-medium text-gray-400 italic">[Utilisateur supprimé]</div>
                        <div className="text-xs text-gray-300">ID: {log.id_user ?? '—'}</div>
                      </>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${ACTION_COLORS[log.action] || 'bg-gray-100 text-gray-600'}`}>
                      {log.action}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-gray-500">{log.table_cible || '—'}</td>
                  <td className="px-5 py-3 text-gray-400 font-mono text-xs">{log.ip_address || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className="text-xs text-gray-400 mt-3">Affichage des 100 derniers logs.</p>
    </div>
  );
};

export default AuditLogPage;

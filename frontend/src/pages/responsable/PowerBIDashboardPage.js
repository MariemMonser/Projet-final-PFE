import React from 'react';

const POWERBI_EMBED_URL = 'https://app.powerbi.com/reportEmbed?reportId=76e6252c-655e-44d3-9d9c-5162b6ef2151&autoAuth=true&ctid=604f1a96-cbe8-43f8-abbf-f8eaf5d85730';

const PowerBIDashboardPage = () => (
  <div className="p-6 space-y-4">
    <div>
      <h1 className="text-2xl font-bold text-gray-900">KPIs Maintenance — Power BI</h1>
      <p className="text-gray-500 text-sm mt-0.5">Tableau de bord interactif</p>
    </div>
    <div className="bg-white rounded-xl shadow overflow-hidden" style={{ height: 'calc(100vh - 160px)' }}>
      <iframe
        title="pfeonetech"
        src={POWERBI_EMBED_URL}
        allowFullScreen
        className="w-full h-full border-0"
      />
    </div>
  </div>
);

export default PowerBIDashboardPage;

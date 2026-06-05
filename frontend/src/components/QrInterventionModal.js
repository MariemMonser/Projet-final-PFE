import React from 'react';

const QrInterventionModal = ({ qrModal, onClose, copied, onCopy }) => {
  if (!qrModal) return null;

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 transition-all duration-300"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-100 transform scale-100 transition-all duration-300"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-slate-50 to-white">
          <div>
            <h2 className="text-base font-extrabold text-slate-800 flex items-center gap-2">
              <svg className="w-5 h-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0a8 8 0 11-16 0 8 8 0 0116 0z" />
              </svg>
              QR Code d'Intervention
            </h2>
            <p className="text-xs text-slate-500 mt-0.5 font-medium">Généré pour l'accès mobile rapide</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-700 transition-all flex items-center justify-center font-bold text-lg leading-none"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="p-6 text-center">
          {/* Info Badge */}
          <div className="flex items-center justify-between mb-5 p-3.5 bg-slate-50 border border-slate-100 rounded-xl text-left">
            <div>
              <span className="text-[9px] font-bold tracking-wider text-slate-400 uppercase">Équipement ID</span>
              <h4 className="text-base font-extrabold text-indigo-900 mt-0.5">#{qrModal.equipement?.id}</h4>
            </div>
            <div className="text-right">
              <span className="text-[9px] font-bold tracking-wider text-slate-400 uppercase">Désignation</span>
              <h4 className="text-xs font-semibold text-slate-700 mt-0.5">{qrModal.equipement?.nom}</h4>
            </div>
          </div>

          {/* QR Frame */}
          <div className="relative group inline-block border border-slate-200 rounded-2xl p-4 bg-white shadow-sm hover:shadow-md transition-all duration-300">
            <img src={qrModal.qrCode} alt="QR intervention" className="w-52 h-52 rounded-lg" />
          </div>

          {/* Alert Auto IP */}
          <div className="mt-5 p-3.5 bg-emerald-50/70 border border-emerald-100/80 rounded-xl text-left flex gap-3 items-start shadow-sm">
            <svg className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <div>
              <p className="text-[11px] font-bold text-emerald-800">Résolution IP Locale Automatique</p>
              <p className="text-[10px] text-emerald-700/90 mt-0.5 leading-relaxed">
                Ce QR Code contient l'IP locale réelle de votre PC (
                <span className="font-bold underline">
                  {qrModal.url.match(/https?:\/\/([^:/]+)/)?.[1] || '192.168.1.9'}
                </span>
                ). Aucun réglage manuel n'est requis. Scannez directement depuis votre smartphone sur le Wi-Fi local !
              </p>
            </div>
          </div>

          {/* Redirection Link & Copy */}
          <div className="mt-5 text-left">
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Lien de redirection mobile</label>
            <div className="relative flex items-center">
              <input
                readOnly
                value={qrModal.url}
                className="w-full pl-3 pr-20 py-2 bg-slate-50 border border-slate-200 rounded-lg text-[11px] font-mono text-slate-600 focus:outline-none select-all"
              />
              <button
                onClick={onCopy}
                className="absolute right-1 px-2.5 py-1 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-md text-[10px] font-semibold shadow-sm transition-all flex items-center gap-1"
              >
                {copied ? (
                  <>
                    <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-emerald-600">Copié</span>
                  </>
                ) : (
                  <>
                    <svg className="w-3 h-3 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                    </svg>
                    <span>Copier</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50/80 border-t border-slate-100 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-white text-xs font-semibold shadow-sm transition-all"
          >
            Fermer
          </button>
          <button
            onClick={() => window.print()}
            className="px-4 py-2 bg-indigo-900 text-white rounded-lg hover:bg-indigo-800 text-xs font-semibold shadow-sm transition-all flex items-center gap-1.5"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Imprimer
          </button>
        </div>
      </div>
    </div>
  );
};

export default QrInterventionModal;

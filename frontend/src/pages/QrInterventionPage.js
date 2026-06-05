// ============================================================
// QR INTERVENTION PAGE - Affichage du QR code du formulaire
// IP modifiable pour scanner depuis mobile sur le reseau local
// ============================================================
import React, { useEffect, useState } from 'react';
import { monitoringAPI } from '../api';

const QrInterventionPage = () => {
  const [ip, setIp]           = useState('192.168.1.9');
  const [port, setPort]       = useState('3000');
  const [qrData, setQrData]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur]   = useState('');

  const generer = async (adresseIp, portFront) => {
    setLoading(true);
    setErreur('');
    setQrData(null);
    try {
      const baseUrl = `http://${adresseIp}:${portFront}`;
      const response = await monitoringAPI.getInterventionFormQr(baseUrl);
      setQrData(response.data);
    } catch {
      setErreur('Impossible de generer le QR code. Verifiez que le serveur est accessible.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { generer(ip, port); }, []);

  const telecharger = () => {
    if (!qrData?.qrCode) return;
    const link = document.createElement('a');
    link.download = `qr-intervention-${ip}.png`;
    link.href = qrData.qrCode;
    link.click();
  };

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h2 style={styles.title}>QR Code — Fiche Intervention</h2>
        <p style={styles.subtitle}>
          Imprimez ce QR code et collez-le dans l'atelier.
          Les techniciens le scannent pour remplir directement leur fiche d'intervention.
        </p>

        {/* Parametres IP */}
        <div style={styles.ipSection}>
          <span style={styles.ipLabel}>Adresse IP du serveur frontend</span>
          <div style={styles.ipRow}>
            <div style={styles.ipFieldGroup}>
              <label style={styles.fieldLabel}>IP</label>
              <input
                value={ip}
                onChange={e => setIp(e.target.value)}
                style={styles.ipInput}
                placeholder="192.168.1.22"
                spellCheck={false}
              />
            </div>
            <div style={styles.ipFieldGroup}>
              <label style={styles.fieldLabel}>Port</label>
              <input
                value={port}
                onChange={e => setPort(e.target.value)}
                style={{ ...styles.ipInput, width: 80 }}
                placeholder="3000"
              />
            </div>
            <button
              onClick={() => generer(ip, port)}
              style={styles.genBtn}
              disabled={loading}
            >
              {loading ? '...' : 'Regenerer'}
            </button>
          </div>
          <span style={styles.ipHint}>
            URL generee : <strong>http://{ip}:{port}/intervention/nouveau</strong>
          </span>
        </div>

        {erreur && <div style={styles.errorBox}>{erreur}</div>}

        {/* QR code */}
        <div style={styles.qrWrapper}>
          {loading ? (
            <div style={styles.qrPlaceholder}>Generation...</div>
          ) : qrData?.qrCode ? (
            <img src={qrData.qrCode} alt="QR Code intervention" style={styles.qrImage} />
          ) : null}
        </div>

        {/* URL */}
        {qrData?.url && (
          <div style={styles.urlBox}>
            <span style={styles.urlLabel}>URL du formulaire</span>
            <a href={qrData.url} target="_blank" rel="noopener noreferrer" style={styles.urlLink}>
              {qrData.url}
            </a>
          </div>
        )}

        {/* Actions */}
        <div style={styles.actions}>
          <button
            onClick={telecharger}
            disabled={!qrData?.qrCode}
            style={qrData?.qrCode ? styles.downloadBtn : styles.downloadBtnDisabled}
          >
            Telecharger PNG
          </button>
          {qrData?.url && (
            <a
              href={qrData.url}
              target="_blank"
              rel="noopener noreferrer"
              style={styles.openBtn}
            >
              Ouvrir le formulaire
            </a>
          )}
        </div>
      </div>
    </div>
  );
};

const styles = {
  page:    { padding: 32, maxWidth: 600, margin: '0 auto' },
  card:    { background: '#fff', borderRadius: 16, padding: 32, boxShadow: '0 4px 24px rgba(15,23,42,0.08)', border: '1px solid #e2e8f0' },
  title:   { margin: '0 0 8px', color: '#111827', fontSize: 22, fontWeight: 800 },
  subtitle:{ color: '#64748b', fontSize: 14, margin: '0 0 24px', lineHeight: 1.6 },

  ipSection: {
    background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12,
    padding: '14px 16px', marginBottom: 24, display: 'flex', flexDirection: 'column', gap: 10,
  },
  ipLabel:  { color: '#334155', fontSize: 13, fontWeight: 700 },
  ipRow:    { display: 'flex', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' },
  ipFieldGroup: { display: 'flex', flexDirection: 'column', gap: 4 },
  fieldLabel:   { color: '#64748b', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4 },
  ipInput: {
    border: '1px solid #cbd5e1', borderRadius: 8, padding: '8px 10px',
    fontSize: 14, color: '#111827', outline: 'none', width: 150, fontFamily: 'monospace',
  },
  genBtn: {
    padding: '9px 18px', background: '#1d4ed8', color: '#fff', border: 'none',
    borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', alignSelf: 'flex-end',
  },
  ipHint: { color: '#64748b', fontSize: 12 },

  errorBox: { background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 10, padding: 12, fontSize: 14, marginBottom: 16 },

  qrWrapper: {
    display: 'flex', justifyContent: 'center', margin: '0 0 24px',
    padding: 20, background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0', minHeight: 160,
    alignItems: 'center',
  },
  qrImage:       { width: 240, height: 240, imageRendering: 'pixelated' },
  qrPlaceholder: { color: '#94a3b8', fontSize: 14 },

  urlBox: {
    background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10,
    padding: '12px 16px', marginBottom: 24, display: 'flex', flexDirection: 'column', gap: 4,
  },
  urlLabel: { color: '#64748b', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 },
  urlLink:  { color: '#1d4ed8', fontSize: 14, wordBreak: 'break-all', textDecoration: 'none', fontWeight: 600 },

  actions:             { display: 'flex', gap: 12, flexWrap: 'wrap' },
  downloadBtn:         { flex: 1, padding: '12px 16px', background: '#1d4ed8', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer', minWidth: 160 },
  downloadBtnDisabled: { flex: 1, padding: '12px 16px', background: '#94a3b8', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, minWidth: 160 },
  openBtn: {
    flex: 1, padding: '12px 16px', background: '#f1f5f9', color: '#334155',
    border: '1px solid #cbd5e1', borderRadius: 10, fontSize: 14, fontWeight: 700,
    textDecoration: 'none', textAlign: 'center', minWidth: 160, boxSizing: 'border-box',
  },
};

export default QrInterventionPage;

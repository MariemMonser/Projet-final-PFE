// ============================================================
// SCAN EAU PAGE - Saisie directe sans login
// ============================================================
import React, { useState } from 'react';
import axios from 'axios';

const getBaseURL = () => {
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') return 'http://localhost:5000/api';
  return `http://${host}:5000/api`;
};

const ScanEauPage = () => {
  const [valeur, setValeur]   = useState('');
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const [erreur, setErreur]   = useState('');

  const today = new Date().toISOString().split('T')[0];

  const handleConfirm = async () => {
    if (!valeur || parseFloat(valeur) < 0) {
      return setErreur('Veuillez entrer une valeur valide (positive).');
    }
    setSaving(true);
    setErreur('');
    try {
      await axios.post(`${getBaseURL()}/monitoring/eau/scan`, {
        date_releve: today,
        compteur: parseFloat(valeur),
      });
      setSaved(true);
    } catch {
      setErreur("Erreur lors de l'enregistrement. Réessayez.");
    } finally {
      setSaving(false);
    }
  };

  const recommencer = () => {
    setSaved(false);
    setValeur('');
    setErreur('');
  };

  // ── SUCCÈS ────────────────────────────────────────────────
  if (saved) {
    return (
      <div style={s.page}>
        <div style={{ ...s.card, textAlign: 'center' }}>
          <div style={s.successIcon}>✓</div>
          <h1 style={s.title}>Relevé enregistré !</h1>
          <p style={s.muted}>Compteur eau — {today}</p>
          <div style={s.summaryBox}>
            <p style={s.summaryLine}><strong>Date :</strong> {today}</p>
            <p style={s.summaryLine}><strong>Valeur :</strong> {valeur} m³</p>
          </div>
          <button onClick={recommencer} style={{ ...s.btn, marginTop: 20 }}>
            Nouveau relevé
          </button>
        </div>
      </div>
    );
  }

  // ── FORMULAIRE ────────────────────────────────────────────
  return (
    <div style={s.page}>
      <div style={s.card}>
        <div style={s.logoWrap}><div style={s.logoBadge}>💧</div></div>
        <p style={s.kicker}>ELEONETECH</p>
        <h1 style={s.title}>Relevé Compteur Eau</h1>
        <p style={s.muted}>{new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>

        {erreur && <div style={s.errorBox}>{erreur}</div>}

        <label style={s.label}>Valeur du compteur (m³) *</label>
        <input
          type="number"
          value={valeur}
          onChange={e => { setValeur(e.target.value); setErreur(''); }}
          placeholder="ex: 3022.000"
          step="0.001"
          min="0"
          style={{ ...s.input, fontSize: 28, fontWeight: 700, textAlign: 'center', padding: '18px 14px' }}
          autoFocus
        />

        <button
          onClick={handleConfirm}
          disabled={saving || !valeur}
          style={saving || !valeur ? s.btnDisabled : { ...s.btn, background: '#0284c7' }}
        >
          {saving ? 'Enregistrement...' : '✅ Confirmer et enregistrer'}
        </button>
      </div>
    </div>
  );
};

const s = {
  page: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 20,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  card: {
    width: '100%', maxWidth: 440, background: '#fff', borderRadius: 24,
    padding: 28, boxShadow: '0 25px 50px -12px rgba(0,0,0,0.35)',
    boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 0,
  },
  logoWrap: { textAlign: 'center', marginBottom: 8 },
  logoBadge: {
    width: 56, height: 56, background: '#0284c7', borderRadius: '50%',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 26, boxShadow: '0 8px 16px rgba(2,132,199,0.35)',
  },
  kicker: { margin: '0 0 2px', color: '#0284c7', fontSize: 11, fontWeight: 800, letterSpacing: 1.5, textTransform: 'uppercase', textAlign: 'center' },
  title:  { margin: '2px 0 4px', color: '#0f172a', fontSize: 24, fontWeight: 800, textAlign: 'center' },
  muted:  { margin: '0 0 20px', color: '#64748b', fontSize: 13, textAlign: 'center' },
  label:  { display: 'block', color: '#334155', fontSize: 13, fontWeight: 700, margin: '8px 0 6px' },
  input: {
    width: '100%', border: '1.5px solid #bae6fd', borderRadius: 12,
    padding: '12px 14px', fontSize: 15, color: '#0f172a',
    boxSizing: 'border-box', outline: 'none', background: '#f0f9ff',
  },
  errorBox: {
    background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c',
    borderRadius: 10, padding: 12, fontSize: 14, margin: '8px 0',
  },
  btn: {
    width: '100%', marginTop: 16, border: 'none', borderRadius: 14, padding: 14,
    background: '#16a34a', color: '#fff', fontSize: 15, fontWeight: 800, cursor: 'pointer',
  },
  btnDisabled: {
    width: '100%', marginTop: 16, border: 'none', borderRadius: 14, padding: 14,
    background: '#94a3b8', color: '#fff', fontSize: 15, fontWeight: 800, cursor: 'not-allowed',
  },
  successIcon: {
    width: 64, height: 64, margin: '0 auto 12px', borderRadius: '50%',
    background: '#dcfce7', color: '#15803d', display: 'flex',
    alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 28,
  },
  summaryBox: {
    background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 12,
    padding: 14, marginTop: 12, textAlign: 'left',
  },
  summaryLine: { margin: '4px 0', fontSize: 13, color: '#334155' },
};

export default ScanEauPage;



import React, { useState } from 'react';
import axios from 'axios';

const getBaseURL = () => {
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') return 'http://localhost:5000/api';
  return `http://${host}:5000/api`;
};

const PHASES = [
  { key: 'phase1', code: '21.', label: 'Phase 1' },
  { key: 'phase2', code: '22.', label: 'Phase 2' },
  { key: 'phase3', code: '23.', label: 'Phase 3' },
];

const ScanElecPage = () => {
  const [step, setStep]       = useState(0);
  const [valeurs, setValeurs] = useState(['', '', '']);
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const [erreur, setErreur]   = useState('');

  const _d    = new Date();
  const today = `${_d.getFullYear()}-${String(_d.getMonth()+1).padStart(2,'0')}-${String(_d.getDate()).padStart(2,'0')}`;
  const current = PHASES[step];

  const handleValeurChange = (val) => {
    const newValeurs = [...valeurs];
    newValeurs[step] = val;
    setValeurs(newValeurs);
    setErreur('');
  };

  const handleNext = () => {
    if (!valeurs[step] || parseFloat(valeurs[step]) < 0) {
      return setErreur('Veuillez entrer une valeur valide (positive).');
    }
    setErreur('');
    setStep(step + 1);
  };

  const handleConfirm = async () => {
    if (!valeurs[2] || parseFloat(valeurs[2]) < 0) {
      return setErreur('Veuillez entrer une valeur valide.');
    }
    setSaving(true);
    setErreur('');
    try {
      await axios.post(`${getBaseURL()}/monitoring/electricite/scan`, {
        date_releve: today,
        phase1: parseFloat(valeurs[0]),
        phase2: parseFloat(valeurs[1]),
        phase3: parseFloat(valeurs[2]),
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
    setStep(0);
    setValeurs(['', '', '']);
    setErreur('');
  };

  
  if (saved) {
    return (
      <div style={s.page}>
        <div style={{ ...s.card, textAlign: 'center' }}>
          <div style={s.successIcon}>✓</div>
          <h1 style={s.title}>Relevé enregistré !</h1>
          <p style={s.muted}>Compteur électricité — {today}</p>
          <div style={s.summaryBox}>
            <p style={s.summaryLine}><strong>Date :</strong> {today}</p>
            {PHASES.map((p, i) => (
              <p key={i} style={s.summaryLine}>
                <strong>{p.label} :</strong> {valeurs[i]} kWh
              </p>
            ))}
          </div>
          <button onClick={recommencer} style={{ ...s.btn, marginTop: 20, background: '#d97706' }}>
            Nouveau relevé
          </button>
        </div>
      </div>
    );
  }

  
  return (
    <div style={s.page}>
      <div style={s.card}>
        <div style={s.logoWrap}><div style={s.logoBadge}>⚡</div></div>
        <p style={s.kicker}>ELEONETECH</p>
        <h1 style={s.title}>Relevé Électricité</h1>
        <p style={s.muted}>{new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>

        
        <div style={s.progressRow}>
          {PHASES.map((p, i) => (
            <div key={i} style={s.progressItem}>
              <div style={{
                ...s.dot,
                background: i < step ? '#16a34a' : i === step ? '#d97706' : '#e2e8f0',
                color: i <= step ? '#fff' : '#94a3b8',
              }}>
                {i < step ? '✓' : i + 1}
              </div>
              <span style={{
                ...s.dotLabel,
                color: i === step ? '#d97706' : i < step ? '#16a34a' : '#94a3b8',
                fontWeight: i === step ? 700 : 400,
              }}>
                {p.label}
              </span>
            </div>
          ))}
        </div>

        
        <div style={s.instructionBox}>
          <p style={s.instructionTitle}>
            Attendez le code <strong style={{ color: '#d97706', fontSize: 20 }}>{current.code}</strong> sur le compteur
          </p>
          <p style={s.instructionSub}>puis entrez la valeur du {current.label}</p>
        </div>

        {erreur && <div style={s.errorBox}>{erreur}</div>}

        <label style={s.label}>Valeur {current.label} (kWh) *</label>
        <input
          type="number"
          value={valeurs[step]}
          onChange={e => handleValeurChange(e.target.value)}
          placeholder="ex: 02560.147"
          step="0.001"
          min="0"
          style={{ ...s.input, fontSize: 28, fontWeight: 700, textAlign: 'center', padding: '18px 14px' }}
          autoFocus
          key={step}
        />

        {step < 2 ? (
          <button
            onClick={handleNext}
            disabled={!valeurs[step]}
            style={!valeurs[step] ? s.btnDisabled : { ...s.btn, background: '#d97706' }}
          >
            Suivant → {PHASES[step + 1].label}
          </button>
        ) : (
          <button
            onClick={handleConfirm}
            disabled={saving || !valeurs[2]}
            style={saving || !valeurs[2] ? s.btnDisabled : s.btn}
          >
            {saving ? 'Enregistrement...' : '✅ Confirmer et enregistrer'}
          </button>
        )}

        
        {step > 0 && (
          <div style={s.resumeBox}>
            {PHASES.slice(0, step).map((p, i) => (
              <div key={i} style={s.resumeItem}>
                <span style={s.resumeLabel}>✓ {p.label}</span>
                <span style={s.resumeVal}>{valeurs[i]} kWh</span>
              </div>
            ))}
          </div>
        )}
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
    width: 56, height: 56, background: '#d97706', borderRadius: '50%',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 26, boxShadow: '0 8px 16px rgba(217,119,6,0.35)',
  },
  kicker: { margin: '0 0 2px', color: '#d97706', fontSize: 11, fontWeight: 800, letterSpacing: 1.5, textTransform: 'uppercase', textAlign: 'center' },
  title:  { margin: '2px 0 4px', color: '#0f172a', fontSize: 24, fontWeight: 800, textAlign: 'center' },
  muted:  { margin: '0 0 16px', color: '#64748b', fontSize: 13, textAlign: 'center' },
  label:  { display: 'block', color: '#334155', fontSize: 13, fontWeight: 700, margin: '14px 0 6px' },
  input: {
    width: '100%', border: '1.5px solid #fde68a', borderRadius: 12,
    padding: '12px 14px', fontSize: 15, color: '#0f172a',
    boxSizing: 'border-box', outline: 'none', background: '#fffbeb',
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
  progressRow: { display: 'flex', justifyContent: 'center', gap: 32, marginBottom: 16 },
  progressItem: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 },
  dot: {
    width: 36, height: 36, borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 14, fontWeight: 700,
  },
  dotLabel: { fontSize: 12 },
  instructionBox: {
    background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 12,
    padding: 14, textAlign: 'center', marginBottom: 8,
  },
  instructionTitle: { fontSize: 15, color: '#78350f', margin: '0 0 4px' },
  instructionSub:   { fontSize: 13, color: '#92400e', margin: 0 },
  resumeBox: {
    marginTop: 16, padding: 14,
    background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 12,
  },
  resumeItem: {
    display: 'flex', justifyContent: 'space-between', padding: '5px 0',
    borderBottom: '1px solid #dcfce7',
  },
  resumeLabel: { color: '#16a34a', fontWeight: 600, fontSize: 13 },
  resumeVal:   { color: '#0f172a', fontWeight: 700, fontSize: 13 },
  successIcon: {
    width: 64, height: 64, margin: '0 auto 12px', borderRadius: '50%',
    background: '#dcfce7', color: '#15803d', display: 'flex',
    alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 28,
  },
  summaryBox: {
    background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 12,
    padding: 14, marginTop: 12, textAlign: 'left',
  },
  summaryLine: { margin: '4px 0', fontSize: 13, color: '#334155' },
};

export default ScanElecPage;

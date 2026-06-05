// ============================================================
// INTERVENTION PUBLIQUE PAGE
// Etape 1 : authentification technicien (email + mdp)
// Etape 2 : formulaire Ouverture/Cloture avec liste techniciens
// ============================================================
import React, { useState, useEffect } from 'react';

// Utilise toujours le même host que le frontend, port 5000 pour le backend
const BASE_URL = `http://${window.location.hostname}:5000`;

const api = (path, body) =>
  fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const InterventionPubliquePage = () => {
  // ── Etape 1 : login ───────────────────────────────────────
  const [etape, setEtape]         = useState('login');   // 'login' | 'form' | 'succes'
  const [userInfo, setUserInfo]   = useState(null);      // { prenom, nom, role }
  const [loginForm, setLoginForm] = useState({ email: '', mot_de_passe: '' });
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginErreur, setLoginErreur]   = useState('');

  // ── Etape 2 : formulaire ──────────────────────────────────
  const [personnel, setPersonnel] = useState([]);
  const [action, setAction]       = useState('Ouverture');
  const [form, setForm]           = useState({
    equipement:        '',
    type_intervention: 'Curative',
    description:       '',
  });
  const [saving, setSaving] = useState(false);
  const [erreur, setErreur] = useState('');

  const today = new Date().toISOString().split('T')[0];
  const heure = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

  // Charger liste personnel quand on passe au formulaire
  useEffect(() => {
    if (etape !== 'form') return;
    fetch(`${BASE_URL}/api/monitoring/personnel/public`)
      .then(r => r.json())
      .then(data => Array.isArray(data) && setPersonnel(data))
      .catch(() => {});
  }, [etape]);

  // ── Login ─────────────────────────────────────────────────
  const handleLogin = async (e) => {
    e.preventDefault();
    if (!loginForm.email.trim() || !loginForm.mot_de_passe) {
      return setLoginErreur('Veuillez saisir votre email et mot de passe.');
    }
    setLoginLoading(true);
    setLoginErreur('');
    try {
      const res = await api('/api/monitoring/interventions/verifier-tech', {
        email: loginForm.email.trim(),
        mot_de_passe: loginForm.mot_de_passe,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Identifiants incorrects.');
      setUserInfo(data);
      setEtape('form');
    } catch (err) {
      setLoginErreur(err.message);
    } finally {
      setLoginLoading(false);
    }
  };

  // ── Soumission fiche ──────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.description.trim()) return setErreur('Veuillez saisir une description.');
    setSaving(true);
    setErreur('');
    try {
      const res = await api('/api/monitoring/interventions/staging', {
        date_intervention: today,
        heure,
        action,
        type_intervention: form.type_intervention,
        description:       form.description.trim(),
        technicien:        `${userInfo.prenom} ${userInfo.nom}`,
        equipement:        form.equipement.trim() || null,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Erreur serveur.');
      setEtape('succes');
    } catch (err) {
      setErreur(err.message);
    } finally {
      setSaving(false);
    }
  };

  const recommencer = () => {
    setEtape('login');
    setUserInfo(null);
    setLoginForm({ email: '', mot_de_passe: '' });
    setForm({ equipement: '', type_intervention: 'Curative', description: '' });
    setAction('Ouverture');
    setLoginErreur('');
    setErreur('');
  };

  // ── Rendu : succès ────────────────────────────────────────
  if (etape === 'succes') {
    return (
      <div style={s.page}>
        <div style={s.successCard}>
          <div style={s.successIcon}>OK</div>
          <h1 style={s.successTitle}>Intervention enregistree</h1>
          <p style={s.muted}>{userInfo?.prenom} {userInfo?.nom}</p>
          <p style={s.muted}>{today} — {heure} · {action}</p>
          <button onClick={recommencer} style={{ ...s.btn, marginTop: 24 }}>
            Nouvelle intervention
          </button>
        </div>
      </div>
    );
  }

  // ── Rendu : login ─────────────────────────────────────────
  if (etape === 'login') {
    return (
      <div style={s.page}>
        <form onSubmit={handleLogin} style={s.card}>
          <p style={s.kicker}>ELEONETECH</p>
          <h1 style={s.title}>Fiche intervention</h1>
          <p style={s.muted}>Connectez-vous pour continuer</p>

          {loginErreur && <div style={s.errorBox}>{loginErreur}</div>}

          <label style={s.label}>Email</label>
          <input
            type="email"
            value={loginForm.email}
            onChange={e => setLoginForm(f => ({ ...f, email: e.target.value }))}
            style={s.input}
            placeholder="votre@email.com"
            autoComplete="username"
            required
          />

          <label style={s.label}>Mot de passe</label>
          <input
            type="password"
            value={loginForm.mot_de_passe}
            onChange={e => setLoginForm(f => ({ ...f, mot_de_passe: e.target.value }))}
            style={s.input}
            placeholder="••••••••"
            autoComplete="current-password"
            required
          />

          <button
            type="submit"
            disabled={loginLoading}
            style={loginLoading ? s.btnDisabled : s.btn}
          >
            {loginLoading ? 'Verification...' : 'Se connecter'}
          </button>
        </form>
      </div>
    );
  }

  // ── Rendu : formulaire ────────────────────────────────────
  return (
    <div style={s.page}>
      <form onSubmit={handleSubmit} style={s.card}>
        {/* En-tête */}
        <div style={s.headerRow}>
          <div>
            <p style={s.kicker}>ELEONETECH</p>
            <h1 style={s.title}>Fiche intervention</h1>
            <p style={s.muted}>{today} — {heure}</p>
          </div>
          <button type="button" onClick={recommencer} style={s.logoutBtn}>
            Deconnexion
          </button>
        </div>

        {/* Badge technicien connecte */}
        <div style={s.userBadge}>
          <div style={s.userAvatar}>
            {userInfo.prenom[0]}{userInfo.nom[0]}
          </div>
          <div>
            <div style={s.userName}>{userInfo.prenom} {userInfo.nom}</div>
            <div style={s.userRole}>{userInfo.role}</div>
          </div>
        </div>

        {erreur && <div style={s.errorBox}>{erreur}</div>}

        {/* Ouverture / Cloture */}
        <label style={s.label}>Type d'action *</label>
        <div style={s.segmented}>
          {['Ouverture', 'Cloture'].map(a => (
            <button
              key={a}
              type="button"
              onClick={() => setAction(a)}
              style={action === a ? s.segActive : s.seg}
            >
              {a === 'Ouverture' ? '🔓 Ouverture' : '🔒 Cloture'}
            </button>
          ))}
        </div>

        {/* Equipement */}
        <label style={s.label}>Equipement concerne</label>
        <input
          value={form.equipement}
          onChange={e => setForm(f => ({ ...f, equipement: e.target.value }))}
          style={s.input}
          placeholder="Nom ou code equipement (optionnel)"
        />

        {/* Type intervention */}
        <label style={s.label}>Type d'intervention *</label>
        <div style={s.segmented3}>
          {[
            { value: 'Curative',   label: '🔧 Curative' },
            { value: 'Preventive', label: '🛡️ Préventive' },
            { value: 'Autre',      label: '📋 Autre' },
          ].map(t => (
            <button
              key={t.value}
              type="button"
              onClick={() => setForm(f => ({ ...f, type_intervention: t.value }))}
              style={form.type_intervention === t.value ? s.segActive : s.seg}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Description */}
        <label style={s.label}>Description *</label>
        <textarea
          value={form.description}
          onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
          rows={5}
          style={{ ...s.input, resize: 'vertical', minHeight: 110, fontFamily: 'inherit' }}
          placeholder="Travaux effectues, anomalies constatees, observations..."
          required
        />

        <button
          type="submit"
          disabled={saving}
          style={saving ? s.btnDisabled : { ...s.btn, background: action === 'Cloture' ? '#1d4ed8' : '#16a34a' }}
        >
          {saving ? 'Enregistrement...' : `Enregistrer — ${action}`}
        </button>
      </form>
    </div>
  );
};

const s = {
  page: {
    minHeight: '100vh', background: '#eef2f7',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
  },
  card: {
    width: '100%', maxWidth: 480, background: '#fff', borderRadius: 18,
    padding: 24, boxShadow: '0 18px 45px rgba(15,23,42,0.12)', boxSizing: 'border-box',
  },
  headerRow: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18,
  },
  kicker: { margin: 0, color: '#1d4ed8', fontSize: 12, fontWeight: 800, letterSpacing: 1 },
  title:  { margin: '4px 0', color: '#111827', fontSize: 24, fontWeight: 800 },
  muted:  { margin: 0, color: '#64748b', fontSize: 13 },
  logoutBtn: {
    padding: '6px 12px', background: '#f1f5f9', border: '1px solid #cbd5e1',
    borderRadius: 8, color: '#64748b', fontSize: 12, fontWeight: 700, cursor: 'pointer',
  },
  userBadge: {
    display: 'flex', alignItems: 'center', gap: 12,
    background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 12,
    padding: '12px 14px', marginBottom: 18,
  },
  userAvatar: {
    width: 40, height: 40, borderRadius: '50%', background: '#16a34a',
    color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontWeight: 900, fontSize: 15, flexShrink: 0,
  },
  userName: { fontWeight: 800, color: '#111827', fontSize: 15 },
  userRole: { color: '#64748b', fontSize: 12, fontWeight: 600, marginTop: 2 },
  label: {
    display: 'block', color: '#334155', fontSize: 14,
    fontWeight: 700, margin: '14px 0 6px',
  },
  input: {
    width: '100%', border: '1px solid #cbd5e1', borderRadius: 10,
    padding: '13px 14px', fontSize: 15, color: '#111827',
    boxSizing: 'border-box', outline: 'none', background: '#fff', fontFamily: 'inherit',
  },
  segmented:  { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 4 },
  segmented3: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 4 },
  seg: {
    padding: 13, border: '1px solid #cbd5e1', background: '#fff',
    color: '#334155', borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: 'pointer',
  },
  segActive: {
    padding: 13, border: '2px solid #1d4ed8', background: '#eff6ff',
    color: '#1d4ed8', borderRadius: 10, fontWeight: 800, fontSize: 14, cursor: 'pointer',
  },
  btn: {
    width: '100%', marginTop: 20, border: 'none', borderRadius: 12, padding: 14,
    background: '#16a34a', color: '#fff', fontSize: 16, fontWeight: 800, cursor: 'pointer',
  },
  btnDisabled: {
    width: '100%', marginTop: 20, border: 'none', borderRadius: 12, padding: 14,
    background: '#94a3b8', color: '#fff', fontSize: 16, fontWeight: 800, cursor: 'not-allowed',
  },
  errorBox: {
    background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c',
    borderRadius: 10, padding: 12, fontSize: 14, marginBottom: 14,
  },
  successCard: {
    width: '100%', maxWidth: 420, background: '#fff', borderRadius: 18,
    padding: 32, textAlign: 'center', boxShadow: '0 18px 45px rgba(15,23,42,0.12)',
  },
  successIcon: {
    width: 64, height: 64, margin: '0 auto 16px', borderRadius: '50%',
    background: '#dcfce7', color: '#15803d', display: 'flex',
    alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 18,
  },
  successTitle: { margin: '0 0 8px', color: '#111827', fontSize: 22, fontWeight: 800 },
};

export default InterventionPubliquePage;

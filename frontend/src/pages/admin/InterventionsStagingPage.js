// ============================================================
// INTERVENTIONS STAGING — Responsable / Admin
// Validation + affichage MTTR (durée ouverture→clôture)
// ============================================================
import React, { useEffect, useState } from 'react';
import { monitoringAPI } from '../../api';
import { exportToPDF } from '../../utils/exportPDF';
import { calculerMTTR } from '../../utils/mttr';

const STATUT_COLOR = {
  'En attente': { bg: '#fef9c3', color: '#854d0e', border: '#fde047' },
  'Validee':    { bg: '#dcfce7', color: '#15803d', border: '#86efac' },
  'Rejetee':    { bg: '#fee2e2', color: '#b91c1c', border: '#fca5a5' },
};

const fmtDate = (v) => v ? new Date(v).toLocaleDateString('fr-FR') : '—';

const InterventionsStagingPage = () => {
  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtre, setFiltre]   = useState('En attente');
  const [actionId, setActionId] = useState(null);
  const [erreur, setErreur]   = useState('');

  const charger = async () => {
    try {
      setLoading(true);
      const res = await monitoringAPI.getInterventionsStaging();
      setRows(res.data);
    } catch {
      setErreur('Impossible de charger les interventions.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { charger(); }, []);

  const valider = async (id) => {
    setActionId(id);
    try {
      await monitoringAPI.validerInterventionStaging(id);
      await charger();
    } catch { setErreur('Erreur lors de la validation.'); }
    finally { setActionId(null); }
  };

  const rejeter = async (id) => {
    setActionId(id);
    try {
      await monitoringAPI.rejeterInterventionStaging(id);
      await charger();
    } catch { setErreur('Erreur lors du rejet.'); }
    finally { setActionId(null); }
  };

  const supprimer = async (id) => {
    if (!window.confirm('Supprimer définitivement cette fiche ?')) return;
    setActionId(id);
    try {
      await monitoringAPI.supprimerInterventionStaging(id);
      await charger();
    } catch { setErreur('Erreur lors de la suppression.'); }
    finally { setActionId(null); }
  };

  // "En cours" = ouverture sans clôture encore, en attente
  const filtrees = filtre === 'Toutes' ? rows
    : filtre === 'En cours' ? rows.filter(r => r.action === 'Ouverture' && !r.date_cloture && r.statut === 'En attente')
    : rows.filter(r => r.statut === filtre);

  const comptes = {
    'En attente': rows.filter(r => r.statut === 'En attente').length,
    'En cours':   rows.filter(r => r.action === 'Ouverture' && !r.date_cloture && r.statut === 'En attente').length,
    'Validee':    rows.filter(r => r.statut === 'Validee').length,
    'Rejetee':    rows.filter(r => r.statut === 'Rejetee').length,
  };

  return (
    <div style={styles.page} id="staging-page">
      {/* En-tête */}
      <div style={styles.header}>
        <div>
          <h2 style={styles.title}>Interventions — Fiches terrain</h2>
          <p style={styles.subtitle}>Soumises via QR code · ouverture + clôture · MTTR calculé automatiquement</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={charger} style={styles.refreshBtn}>↻ Actualiser</button>
          <button
            onClick={() => exportToPDF('staging-page', 'fiches_terrain')}
            style={{ ...styles.refreshBtn, background: '#f1f5f9', color: '#374151' }}
          >
            📄 Export PDF
          </button>
        </div>
      </div>

      {erreur && <div style={styles.errorBox}>{erreur}</div>}

      {/* Compteurs */}
      <div style={styles.stats}>
        {[
          { label: 'En attente', key: 'En attente', icon: '⏳' },
          { label: 'En cours',   key: 'En cours',   icon: '🔴' },
          { label: 'Validées',   key: 'Validee',    icon: '✅' },
          { label: 'Rejetées',   key: 'Rejetee',    icon: '❌' },
        ].map(({ label, key, icon }) => (
          <div key={key} style={styles.statCard}>
            <span style={styles.statIcon}>{icon}</span>
            <span style={styles.statCount}>{comptes[key]}</span>
            <span style={styles.statLabel}>{label}</span>
          </div>
        ))}
      </div>

      {/* Filtres */}
      <div style={styles.filtres}>
        {['En attente', 'En cours', 'Validee', 'Rejetee', 'Toutes'].map(f => (
          <button key={f} onClick={() => setFiltre(f)}
            style={filtre === f ? styles.filtreActif : styles.filtre}>
            {f === 'Validee' ? 'Validées' : f === 'Rejetee' ? 'Rejetées' : f}
          </button>
        ))}
      </div>

      {/* Tableau */}
      {loading ? (
        <div style={styles.centered}>Chargement...</div>
      ) : filtrees.length === 0 ? (
        <div style={styles.vide}>Aucune intervention "{filtre}".</div>
      ) : (
        <div style={styles.tableWrapper}>
          <table style={styles.table}>
            <thead>
              <tr style={styles.thead}>
                <th style={styles.th}>Technicien</th>
                <th style={styles.th}>Équipement</th>
                <th style={styles.th}>Sous-équipement</th>
                <th style={styles.th}>Type</th>
                <th style={styles.th}>🔓 Ouverture</th>
                <th style={styles.th}>🔒 Clôture</th>
                <th style={styles.th}>⏱ MTTR</th>
                <th style={styles.th}>Observations ouverture</th>
                <th style={styles.th}>Travaux effectués</th>
                <th style={styles.th}>Statut</th>
                <th style={styles.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtrees.map((row, i) => {
                const couleur  = STATUT_COLOR[row.statut] || STATUT_COLOR['En attente'];
                const isActing = actionId === row.id;
                const mttr     = calculerMTTR(row.date_intervention, row.heure, row.date_cloture, row.heure_cloture);
                const enCours  = row.action === 'Ouverture' && !row.date_cloture && row.statut === 'En attente';

                return (
                  <tr key={row.id} style={{
                    ...(i % 2 === 0 ? styles.trEven : styles.trOdd),
                    ...(enCours ? { background: '#fffbeb' } : {}),
                  }}>
                    <td style={{ ...styles.td, ...styles.tdPerson }}>
                      {row.technicien}
                      {row.intervention_id && (
                        <div><span style={styles.badgeLiee}>planif. #{row.intervention_id}</span></div>
                      )}
                    </td>
                    <td style={styles.td}>
                      {row.equipement || <span style={styles.na}>—</span>}
                    </td>
                    <td style={styles.td}>
                      {row.sous_equipement
                        ? <span style={styles.badgeSousEquip}>{row.sous_equipement}</span>
                        : <span style={styles.na}>—</span>}
                    </td>
                    <td style={styles.td}>
                      <span style={row.type_intervention === 'Preventive' ? styles.badgePreventif : styles.badgeCuratif}>
                        {row.type_intervention}
                      </span>
                    </td>

                    {/* Ouverture */}
                    <td style={{ ...styles.td }}>
                      <div style={styles.timeCell}>
                        <span style={styles.timeDate}>{fmtDate(row.date_intervention)}</span>
                        <span style={styles.timeHeure}>{row.heure || '—'}</span>
                      </div>
                    </td>

                    {/* Clôture */}
                    <td style={{ ...styles.td }}>
                      {row.date_cloture ? (
                        <div style={styles.timeCell}>
                          <span style={styles.timeDate}>{fmtDate(row.date_cloture)}</span>
                          <span style={styles.timeHeure}>{row.heure_cloture || '—'}</span>
                        </div>
                      ) : enCours ? (
                        <span style={styles.badgeEnCours}>🔴 En cours</span>
                      ) : (
                        <span style={styles.na}>—</span>
                      )}
                    </td>

                    {/* MTTR */}
                    <td style={styles.td}>
                      {mttr ? (
                        <span style={styles.mttrBadge}>{mttr}</span>
                      ) : (
                        <span style={styles.na}>—</span>
                      )}
                    </td>

                    {/* Description ouverture */}
                    <td style={{ ...styles.td, ...styles.tdDesc }}>
                      {row.description || <span style={styles.na}>—</span>}
                    </td>

                    {/* Travaux clôture */}
                    <td style={{ ...styles.td, ...styles.tdDesc }}>
                      {row.description_cloture || <span style={styles.na}>—</span>}
                    </td>

                    <td style={styles.td}>
                      <span style={{ ...styles.badge, background: couleur.bg, color: couleur.color, border: `1px solid ${couleur.border}` }}>
                        {row.statut}
                      </span>
                    </td>

                    <td style={styles.td}>
                      {row.statut === 'En attente' ? (
                        <div style={styles.actions}>
                          <button onClick={() => valider(row.id)} disabled={isActing} style={styles.btnValider}>
                            {isActing ? '...' : 'Valider'}
                          </button>
                          <button onClick={() => rejeter(row.id)} disabled={isActing} style={styles.btnRejeter}>
                            {isActing ? '...' : 'Rejeter'}
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => supprimer(row.id)} disabled={isActing} style={styles.btnSupprimer}>
                          {isActing ? '...' : 'Supprimer'}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

const styles = {
  page: { padding: '24px 28px', maxWidth: 1400, margin: '0 auto' },
  header: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 },
  title:   { margin: 0, color: '#111827', fontSize: 22, fontWeight: 800 },
  subtitle:{ margin: '4px 0 0', color: '#64748b', fontSize: 14 },
  refreshBtn: { padding: '8px 18px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 8, color: '#334155', fontSize: 14, fontWeight: 600, cursor: 'pointer' },
  errorBox: { background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 10, padding: 12, fontSize: 14, marginBottom: 20 },
  stats: { display: 'flex', gap: 14, marginBottom: 20, flexWrap: 'wrap' },
  statCard: {
    flex: 1, minWidth: 110, background: '#fff', border: '1px solid #e2e8f0',
    borderRadius: 12, padding: '14px 18px', display: 'flex', flexDirection: 'column',
    alignItems: 'center', gap: 4, boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
  },
  statIcon:  { fontSize: 22 },
  statCount: { fontSize: 28, fontWeight: 900, color: '#111827', lineHeight: 1 },
  statLabel: { fontSize: 13, color: '#64748b', fontWeight: 600 },
  filtres: { display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' },
  filtre: { padding: '7px 16px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, color: '#64748b', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  filtreActif: { padding: '7px 16px', background: '#1d4ed8', border: '1px solid #1d4ed8', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' },
  centered: { textAlign: 'center', padding: 40, color: '#64748b' },
  vide: { textAlign: 'center', padding: 40, color: '#94a3b8', fontSize: 15 },
  tableWrapper: { background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', boxShadow: '0 2px 12px rgba(0,0,0,0.05)', overflowX: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 14 },
  thead: { background: '#f8fafc' },
  th: { padding: '12px 14px', textAlign: 'left', color: '#64748b', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' },
  td: { padding: '11px 14px', color: '#334155', verticalAlign: 'middle', borderBottom: '1px solid #f1f5f9' },
  tdPerson: { fontWeight: 700, color: '#111827' },
  tdDesc: { maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  trEven: { background: '#ffffff' },
  trOdd:  { background: '#fafafa' },
  na: { color: '#94a3b8' },
  timeCell: { display: 'flex', flexDirection: 'column', gap: 1 },
  timeDate: { fontSize: 13, color: '#334155', fontWeight: 600 },
  timeHeure: { fontSize: 13, color: '#1d4ed8', fontWeight: 800, fontVariantNumeric: 'tabular-nums' },
  mttrBadge: {
    display: 'inline-block', padding: '3px 10px', borderRadius: 20,
    fontSize: 12, fontWeight: 800, background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0',
  },
  badgeEnCours: {
    display: 'inline-block', padding: '3px 10px', borderRadius: 20,
    fontSize: 12, fontWeight: 700, background: '#fffbeb', color: '#b45309', border: '1px solid #fde68a',
  },
  badge: { display: 'inline-block', padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700 },
  badgeSousEquip: { display: 'inline-block', padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700, background: '#f5f3ff', color: '#7c3aed', border: '1px solid #ddd6fe' },
  badgePreventif: { display: 'inline-block', padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700, background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' },
  badgeCuratif:   { display: 'inline-block', padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700, background: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa' },
  badgeLiee: { display: 'inline-block', padding: '2px 7px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0' },
  actions: { display: 'flex', gap: 6 },
  btnValider:   { padding: '5px 12px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: 'pointer' },
  btnRejeter:   { padding: '5px 12px', background: '#fff', color: '#b91c1c', border: '1px solid #fca5a5', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: 'pointer' },
  btnSupprimer: { padding: '5px 12px', background: '#fff', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: 'pointer' },
};

export default InterventionsStagingPage;

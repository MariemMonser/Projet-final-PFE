

import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { equipementsAPI, monitoringAPI, sousEquipAPI, prcAPI } from '../../api';
import { useAuth } from '../../context/AuthContext';

const today   = new Date().toISOString().split('T')[0];
const heureNow = () => new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

const parseDescription = (desc = '') => {
  const parts = {};
  desc.split(' | ').forEach(p => {
    const m = p.match(/^(.*?):\s*(.*)$/);
    if (m) parts[m[1].trim()] = m[2].trim();
  });
  return parts;
};

const formatDate = (v) => v ? new Date(v).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }) : '';
const formatDateShort = (v) => v ? new Date(v).toLocaleDateString('fr-FR') : '';

const ScanInterventionPage = () => {
  const { equipementId } = useParams();
  const { user, login }  = useAuth();

  
  const [loginForm, setLoginForm]       = useState({ email: '', password: '' });
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginErreur, setLoginErreur]   = useState('');

  
  const [equipement, setEquipement]     = useState(null);
  const [sousEquipements, setSousEquipements] = useState([]);
  const [planifiees, setPlanifiees]     = useState([]);
  const [ouvertes, setOuvertes]         = useState([]);

  
  const [selectedSousEquip, setSelectedSousEquip] = useState(null);

  
  const [selectedIntervention, setSelected] = useState(null);
  const [modeLibre, setModeLibre]           = useState(false);
  const [action, setAction]                 = useState('Ouverture');
  const [typeIntervention, setType]         = useState('Curative');
  const [description, setDescription]      = useState('');

  
  const [selectedOuvert, setSelectedOuvert] = useState(null);
  const [descCloture, setDescCloture]       = useState('');

  const [tachesSelectionnees, setTachesSelectionnees] = useState([]);
  const [prcDisponibles, setPrcDisponibles]           = useState([]);
  const [prcSelectionnes, setPrcSelectionnes]         = useState({}); 

  const [saving, setSaving]   = useState(false);
  const [erreur, setErreur]   = useState('');
  
  const [etape, setEtape]     = useState('login');

  const getTachesDisponibles = (equip, sousEquip) => {
    const sousNom = (sousEquip?.nom || '').toLowerCase();
    const famille = (equip?.famille_equipement || '').toLowerCase();
    const nom     = (equip?.nom || '').toLowerCase();
    const text    = `${famille} ${nom} ${sousNom}`;

    if (sousNom.includes('gerbeur') || text.includes('gerbeur'))
      return ['Graissage chaînes', 'Changement roues', 'Vérification et ajout eau batterie', 'Vérification galets'];
    if (sousNom.includes('monte') || sousNom.includes('monte charge'))
      return ['Graissage galets'];
    if (text.includes('rooftop') || sousNom.includes('cms') || sousNom.includes('tht'))
      return ['Changement courroies', 'Changement filtres'];
    if (text.includes('compresseur') || sousNom.includes('drb') || sousNom.includes('csb'))
      return ['Changement filtres', 'Changement purgeurs'];
    if (text.includes('mont') || text.includes('rideau'))
      return ['Graissage galets'];
    return [];
  };

  const toggleTache = (tache) =>
    setTachesSelectionnees(prev =>
      prev.includes(tache) ? prev.filter(t => t !== tache) : [...prev, tache]
    );

  const togglePrc = (prc) => {
    setPrcSelectionnes(prev => {
      if (prev[prc.id] !== undefined) {
        const next = { ...prev };
        delete next[prc.id];
        return next;
      }
      return { ...prev, [prc.id]: 1 };
    });
  };

  const setPrcQty = (id, qty, maxStock) => {
    const v = Math.max(1, Math.min(parseInt(qty) || 1, maxStock));
    setPrcSelectionnes(prev => ({ ...prev, [id]: v }));
  };

  const isLoggedIn    = !!user;
  const technicienNom = `${user?.prenom || ''} ${user?.nom || ''}`.trim();

  
  useEffect(() => {
    if (!isLoggedIn) return;
    const charger = async () => {
      try {
        const [equipRes, planRes, ouvertesRes, sousEquipRes, prcRes] = await Promise.allSettled([
          equipementsAPI.getById(equipementId),
          monitoringAPI.getInterventionsPlanifieesParEquipement(equipementId),
          monitoringAPI.getMesOuvertesStaging(technicienNom, null),
          sousEquipAPI.getByEquipement(equipementId),
          prcAPI.getAll(),
        ]);

        const planData = planRes.status === 'fulfilled' ? planRes.value.data : null;
        const equipInfo = equipRes.status === 'fulfilled'
          ? equipRes.value.data
          : planData?.equipement || null;
        setEquipement(equipInfo);
        const equipNom = equipInfo?.nom || '';

        setPlanifiees(planData?.interventions || (Array.isArray(planData) ? planData : []));

        if (ouvertesRes.status === 'fulfilled') {
          setOuvertes((ouvertesRes.value.data || []).filter(o =>
            !o.equipement || o.equipement.toLowerCase() === equipNom.toLowerCase()
          ));
        }

        const sous = sousEquipRes.status === 'fulfilled' ? (sousEquipRes.value.data || []) : [];
        setSousEquipements(sous);

        const allPrc = prcRes.status === 'fulfilled' ? (prcRes.value.data || []) : [];
        setPrcDisponibles(allPrc.filter(p => p.stock > 0 && (!p.equipement_id || p.equipement_id === parseInt(equipementId))));

        setEtape(sous.length > 0 ? 'sous-equip' : 'selection');
      } catch {
        setEtape('selection');
      }
    };
    charger();
  }, [isLoggedIn, equipementId]);

  
  const handleLogin = async (e) => {
    e.preventDefault();
    if (!loginForm.email.trim() || !loginForm.password)
      return setLoginErreur('Veuillez remplir tous les champs.');
    setLoginLoading(true);
    setLoginErreur('');
    try {
      await login(loginForm.email.trim(), loginForm.password);
    } catch (err) {
      setLoginErreur(err.response?.data?.message || 'Identifiants incorrects.');
    } finally {
      setLoginLoading(false);
    }
  };

  
  const choisirSousEquip = (se) => {
    setSelectedSousEquip(se);
    setEtape('selection');
  };

  
  const choisirIntervention = (interv) => {
    setSelected(interv);
    setAction(interv.statut === 'En cours' ? 'Cloture' : 'Ouverture');
    setType(interv.type_intervention || 'Preventive');
    setDescription('');
    setTachesSelectionnees([]);
    setEtape('form');
  };

  const choisirLibre = () => {
    setSelected(null);
    setModeLibre(true);
    setAction('Ouverture');
    setType('Curative');
    setDescription('');
    setTachesSelectionnees([]);
    setEtape('form');
  };

  
  const choisirCloture = (staging) => {
    setSelectedOuvert(staging);
    setDescCloture('');
    setEtape('cloture');
  };

  
  const handleSubmitOuverture = async (e) => {
    e.preventDefault();
    setSaving(true);
    setErreur('');
    try {
      const parts = [];
      if (tachesSelectionnees.length > 0)
        parts.push(`Tâches: ${tachesSelectionnees.join(', ')}`);
      const selectedPrcEntries = Object.entries(prcSelectionnes);
      if (selectedPrcEntries.length > 0) {
        const prcInfo = selectedPrcEntries.map(([id, qty]) => {
          const p = prcDisponibles.find(p => p.id === parseInt(id));
          return p ? `${p.code_prc} - ${p.designation} (x${qty})` : '';
        }).filter(Boolean);
        if (prcInfo.length > 0) parts.push(`PRC: ${prcInfo.join(', ')}`);
      }
      if (description.trim())
        parts.push(description.trim());
      const stagingRes = await monitoringAPI.addInterventionStaging({
        date_intervention: today,
        heure:             heureNow(),
        action,
        type_intervention: typeIntervention,
        description:       parts.join(' | '),
        technicien:        technicienNom,
        equipement:        equipement?.nom || null,
        sous_equipement:   selectedSousEquip?.nom || null,
        intervention_id:   selectedIntervention?.id || null,
      });
      if (selectedPrcEntries.length > 0) {
        const stagingId = stagingRes?.data?.id || null;
        await Promise.all(
          selectedPrcEntries.map(([id, qty]) =>
            prcAPI.updateStock(id, {
              mouvement: 'sortie',
              quantite: qty,
              technicien: technicienNom,
              equipement: equipement?.nom || null,
              intervention_staging_id: stagingId,
            })
          )
        );
      }
      setEtape('succes');
    } catch {
      setErreur("Erreur lors de l'enregistrement.");
    } finally {
      setSaving(false);
    }
  };

  
  const handleSubmitCloture = async (e) => {
    e.preventDefault();
    if (!descCloture.trim()) return setErreur('La description des travaux est obligatoire.');
    setSaving(true);
    setErreur('');
    try {
      await monitoringAPI.cloturerInterventionStaging(selectedOuvert.id, {
        date_cloture:        today,
        heure_cloture:       heureNow(),
        description_cloture: descCloture.trim(),
      });
      setEtape('succes');
    } catch (err) {
      setErreur(err.response?.data?.message || "Erreur lors de la clôture.");
    } finally {
      setSaving(false);
    }
  };

  const recommencer = () => {
    setEtape('login');
    setSelected(null);
    setSelectedOuvert(null);
    setSelectedSousEquip(null);
    setModeLibre(false);
    setDescription('');
    setDescCloture('');
    setTachesSelectionnees([]);
    setPrcSelectionnes({});
    setErreur('');
  };

  
  if (!isLoggedIn || etape === 'login') {
    return (
      <div style={s.page}>
        <form onSubmit={handleLogin} style={s.card}>
          <div style={s.logoWrap}><div style={s.logoBadge}>E</div></div>
          <p style={s.kicker}>ELEONETECH</p>
          <h1 style={s.title}>Fiche Intervention</h1>
          <p style={s.muted}>Connectez-vous pour continuer</p>
          {loginErreur && <div style={s.errorBox}>{loginErreur}</div>}
          <label style={s.label}>Adresse e-mail</label>
          <input type="email" value={loginForm.email}
            onChange={e => setLoginForm(f => ({ ...f, email: e.target.value }))}
            style={s.input} placeholder="votre@email.com" required />
          <label style={s.label}>Mot de passe</label>
          <input type="password" value={loginForm.password}
            onChange={e => setLoginForm(f => ({ ...f, password: e.target.value }))}
            style={s.input} placeholder="••••••••" required />
          <button type="submit" disabled={loginLoading} style={loginLoading ? s.btnDisabled : s.btn}>
            {loginLoading ? 'Vérification...' : '🔐 Se connecter'}
          </button>
        </form>
      </div>
    );
  }

  
  if (etape === 'sous-equip') {
    return (
      <div style={s.page}>
        <div style={s.card}>
          <p style={s.kicker}>ELEONETECH · Intervention</p>
          <h1 style={s.title}>Sur quel composant ?</h1>
          {equipement && (
            <div style={s.equipBadge}>
              <span style={s.equipId}>#{equipement.id}</span>
              <span style={s.equipNom}>{equipement.nom}</span>
            </div>
          )}
          <p style={{ ...s.sectionTitle, marginBottom: 10 }}>
            Choisissez le sous-équipement ({sousEquipements.length}) :
          </p>
          {sousEquipements.map((se, idx) => {
            const couleur = se.statut === 'actif' ? '#15803d'
                          : se.statut === 'en_panne' ? '#b91c1c'
                          : se.statut === 'en_maintenance' ? '#b45309'
                          : '#64748b';
            const label = se.statut === 'actif' ? 'Actif'
                        : se.statut === 'en_panne' ? 'En panne'
                        : se.statut === 'en_maintenance' ? 'En maintenance'
                        : 'Hors service';
            return (
              <button key={se.id} type="button" onClick={() => choisirSousEquip(se)} style={s.sousEquipTile}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ ...s.sousEquipBullet, background: couleur }}>{idx + 1}</div>
                  <div style={{ flex: 1, textAlign: 'left' }}>
                    <div style={s.sousEquipNom}>{se.nom}</div>
                    <div style={{ color: couleur, fontSize: 12, fontWeight: 600, marginTop: 2 }}>● {label}</div>
                  </div>
                  <span style={{ color: '#94a3b8', fontSize: 22, fontWeight: 700 }}>›</span>
                </div>
              </button>
            );
          })}
          <div style={s.divider}><span>ou</span></div>
          <button type="button" onClick={() => choisirSousEquip(null)} style={s.btnSecondary}>
            ⚙️ Équipement complet (sans sous-équipement)
          </button>
        </div>
      </div>
    );
  }

  
  if (etape === 'selection') {
    return (
      <div style={s.page}>
        <div style={s.card}>
          <p style={s.kicker}>ELEONETECH</p>
          <h1 style={s.title}>Intervention</h1>
          {equipement && (
            <div style={s.equipBadge}>
              <span style={s.equipId}>#{equipement.id}</span>
              <span style={s.equipNom}>{equipement.nom}</span>
            </div>
          )}

          
          {selectedSousEquip && (
            <div style={s.sousEquipSelectedBadge}>
              <span style={s.sousEquipSelectedLabel}>Sous-équipement :</span>
              <span style={s.sousEquipSelectedNom}>{selectedSousEquip.nom}</span>
              {sousEquipements.length > 0 && (
                <button type="button" onClick={() => setEtape('sous-equip')} style={s.changeSousEquipBtn}>
                  Changer
                </button>
              )}
            </div>
          )}

          {erreur && <div style={s.errorBox}>{erreur}</div>}

          
          {ouvertes.length > 0 && (
            <>
              <p style={{ ...s.sectionTitle, color: '#b91c1c' }}>🔴 Intervention(s) en cours</p>
              {ouvertes.map(o => (
                <div key={o.id} style={s.ouvertCard}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={s.badgeEnCours}>⚡ En cours</span>
                    {o.type_intervention && <span style={s.badgeTypeSmall}>{o.type_intervention}</span>}
                  </div>
                  {o.sous_equipement && <div style={s.planSousEquip}>🔩 {o.sous_equipement}</div>}
                  <div style={s.ouvertureHighlight}>
                    <p style={s.ouvertureHighlightLabel}>Heure d'ouverture</p>
                    <div style={s.ouvertureHighlightRow}>
                      <span style={s.ouvertureHighlightDate}>📅 {formatDateShort(o.date_intervention)}</span>
                      <span style={s.ouvertureHighlightTime}>🕐 {o.heure || '—'}</span>
                    </div>
                  </div>
                  {o.description && <p style={{ ...s.planTaches, marginBottom: 8 }}>{o.description}</p>}
                  <button type="button" onClick={() => choisirCloture(o)} style={s.btnCloture}>
                    🔒 Clôturer cette intervention
                  </button>
                </div>
              ))}
              <div style={s.divider}><span>ou</span></div>
            </>
          )}


          {planifiees.length > 0 && (
            <>
              <p style={s.sectionTitle}>📅 Interventions planifiées</p>
              {planifiees.map(interv => {
                const det = parseDescription(interv.description);
                const isEnCours = interv.statut === 'En cours';
                return (
                  <div key={interv.id} style={s.planifieCard}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <span style={isEnCours ? s.badgeEnCours : s.badgePlanifie}>
                        {isEnCours ? '⚡ En cours' : '📅 Planifiée'}
                      </span>
                    </div>
                    <div style={s.planDate}>{formatDate(interv.date_intervention)}</div>
                    {det.Taches && <div style={{ ...s.planTaches, marginBottom: 8 }}>Tâches : {det.Taches}</div>}
                    <button
                      type="button"
                      onClick={() => choisirIntervention(interv)}
                      style={isEnCours ? s.btnClotureBlue : s.btnOuvrir}
                    >
                      {isEnCours ? '🔒 Clôturer' : '🔓 Ouvrir cette intervention planifiée'}
                    </button>
                  </div>
                );
              })}
              <div style={s.divider}><span>ou</span></div>
            </>
          )}

          <button type="button" onClick={choisirLibre} style={s.btnSecondary}>
            + Nouvelle intervention (curative / autre)
          </button>
        </div>
      </div>
    );
  }

  
  if (etape === 'cloture') {
    return (
      <div style={s.page}>
        <form onSubmit={handleSubmitCloture} style={s.card}>
          <div style={s.headerRow}>
            <div>
              <p style={s.kicker}>ELEONETECH</p>
              <h1 style={s.title}>Clôture</h1>
              <p style={s.muted}>{today}</p>
            </div>
            <button type="button" onClick={() => setEtape('selection')} style={s.backBtn}>← Retour</button>
          </div>

          {equipement && (
            <div style={s.equipBadge}>
              <span style={s.equipId}>#{equipement.id}</span>
              <span style={s.equipNom}>{equipement.nom}</span>
            </div>
          )}

          {selectedOuvert?.sous_equipement && (
            <div style={s.sousEquipSelectedBadge}>
              <span style={s.sousEquipSelectedLabel}>Sous-équipement :</span>
              <span style={s.sousEquipSelectedNom}>{selectedOuvert.sous_equipement}</span>
            </div>
          )}

          
          <div style={s.ouvertureBox}>
            <p style={s.ouvertureLabel}>🔓 Ouverture</p>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <span style={s.ouvertureItem}>📅 {formatDateShort(selectedOuvert?.date_intervention)}</span>
              <span style={s.ouvertureItem}>🕐 {selectedOuvert?.heure || '—'}</span>
              <span style={s.ouvertureItem}>🔧 {selectedOuvert?.type_intervention}</span>
            </div>
            {selectedOuvert?.description && (
              <p style={s.ouvertureDesc}>{selectedOuvert.description}</p>
            )}
          </div>

          {erreur && <div style={s.errorBox}>{erreur}</div>}

          <div style={{ ...s.actionBadgeCloture, marginBottom: 8 }}>
            🔒 Clôture — maintenant {heureNow()}
          </div>

          <label style={s.label}>Travaux effectués / Observations <span style={s.required}>*</span></label>
          <textarea
            value={descCloture}
            onChange={e => setDescCloture(e.target.value)}
            rows={5}
            style={{ ...s.input, resize: 'vertical', minHeight: 110, fontFamily: 'inherit' }}
            placeholder="Décrivez les travaux effectués, pièces remplacées, état final de l'équipement..."
            required
          />

          <button type="submit" disabled={saving}
            style={saving ? s.btnDisabled : { ...s.btn, background: '#1d4ed8' }}>
            {saving ? 'Enregistrement...' : '🔒 Confirmer la clôture'}
          </button>
        </form>
      </div>
    );
  }

  
  if (etape === 'succes') {
    return (
      <div style={s.page}>
        <div style={{ ...s.card, textAlign: 'center' }}>
          <div style={s.successIcon}>✓</div>
          <h1 style={s.title}>Enregistrée</h1>
          <p style={s.muted}>
            Votre fiche a été soumise.<br />
            Elle sera validée par le responsable.
          </p>
          <div style={s.summaryBox}>
            <p style={s.summaryLine}><strong>Équipement :</strong> {equipement?.nom}</p>
            {selectedSousEquip && (
              <p style={s.summaryLine}><strong>Sous-équipement :</strong> {selectedSousEquip.nom}</p>
            )}
            {selectedOuvert?.sous_equipement && (
              <p style={s.summaryLine}><strong>Sous-équipement :</strong> {selectedOuvert.sous_equipement}</p>
            )}
            <p style={s.summaryLine}><strong>Action :</strong> {selectedOuvert ? 'Clôture' : action}</p>
            <p style={s.summaryLine}><strong>Par :</strong> {user?.prenom} {user?.nom}</p>
          </div>
          <button onClick={recommencer} style={{ ...s.btn, marginTop: 20 }}>
            Nouvelle fiche
          </button>
        </div>
      </div>
    );
  }

  
  return (
    <div style={s.page}>
      <form onSubmit={handleSubmitOuverture} style={s.card}>
        <div style={s.headerRow}>
          <div>
            <p style={s.kicker}>ELEONETECH</p>
            <h1 style={s.title}>Fiche Intervention</h1>
            <p style={s.muted}>{today}</p>
          </div>
          <button type="button" onClick={() => setEtape('selection')} style={s.backBtn}>← Retour</button>
        </div>

        {equipement && (
          <div style={s.equipBadge}>
            <span style={s.equipId}>#{equipement.id}</span>
            <span style={s.equipNom}>{equipement.nom}</span>
          </div>
        )}

        
        {selectedSousEquip ? (
          <div style={s.sousEquipSelectedBadge}>
            <span style={s.sousEquipSelectedLabel}>Sous-équipement :</span>
            <span style={s.sousEquipSelectedNom}>{selectedSousEquip.nom}</span>
            {modeLibre && sousEquipements.length > 0 && (
              <button type="button" onClick={() => setSelectedSousEquip(null)} style={s.changeSousEquipBtn}>
                Changer
              </button>
            )}
          </div>
        ) : (modeLibre && sousEquipements.length > 0) ? (
          <>
            <label style={s.label}>Sur quel sous-équipement ? <span style={{ color: '#94a3b8', fontWeight: 400 }}>(optionnel)</span></label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 4 }}>
              {sousEquipements.map((se, idx) => {
                const couleur = se.statut === 'actif' ? '#15803d'
                              : se.statut === 'en_panne' ? '#b91c1c'
                              : se.statut === 'en_maintenance' ? '#b45309' : '#64748b';
                return (
                  <button key={se.id} type="button" onClick={() => setSelectedSousEquip(se)} style={s.sousEquipTile}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ ...s.sousEquipBullet, background: couleur, width: 26, height: 26, fontSize: 12 }}>{idx + 1}</div>
                      <span style={{ ...s.sousEquipNom, fontSize: 14 }}>{se.nom}</span>
                      <span style={{ color: '#94a3b8', fontSize: 18, marginLeft: 'auto' }}>›</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        ) : null}

        {selectedIntervention && (
          <div style={s.linkedBadge}>
            <span style={s.linkedLabel}>Intervention planifiée liée</span>
            <span style={s.linkedDate}>
              {new Date(selectedIntervention.date_intervention).toLocaleDateString('fr-FR')}
            </span>
          </div>
        )}

        {erreur && <div style={s.errorBox}>{erreur}</div>}

        
        <label style={s.label}>Action *</label>
        {selectedIntervention ? (
          <div style={action === 'Cloture' ? s.actionBadgeCloture : s.actionBadgeOuverture}>
            {action === 'Cloture' ? '🔒 Clôture' : '🔓 Ouverture'}
            <span style={s.actionFixed}> (imposée par le statut)</span>
          </div>
        ) : (
          <div style={s.segmented}>
            {[{ v: 'Ouverture', l: '🔓 Ouverture' }, { v: 'Cloture', l: '🔒 Clôture' }].map(a => (
              <button key={a.v} type="button" onClick={() => setAction(a.v)}
                style={action === a.v ? s.segActive : s.seg}>{a.l}</button>
            ))}
          </div>
        )}

        
        {!selectedIntervention && (
          <>
            <label style={s.label}>Type d'intervention *</label>
            <div style={s.segmented3}>
              {[{ v: 'Curative', l: '🔧 Curative' }, { v: 'Preventive', l: '🛡️ Préventive' }, { v: 'Autre', l: '📋 Autre' }].map(t => (
                <button key={t.v} type="button" onClick={() => setType(t.v)}
                  style={typeIntervention === t.v ? s.segActive : s.seg}>{t.l}</button>
              ))}
            </div>
          </>
        )}

        {/* Tâches disponibles selon l'équipement */}
        {(() => {
          const taches = getTachesDisponibles(equipement, selectedSousEquip);
          if (!taches.length) return null;
          return (
            <>
              <label style={s.label}>Tâches à effectuer</label>
              <div style={s.tachesContainer}>
                {taches.map(tache => (
                  <button
                    key={tache}
                    type="button"
                    onClick={() => toggleTache(tache)}
                    style={tachesSelectionnees.includes(tache) ? s.tacheActive : s.tache}
                  >
                    <span style={s.tacheCheck}>
                      {tachesSelectionnees.includes(tache) ? '✓' : '○'}
                    </span>
                    {tache}
                  </button>
                ))}
              </div>
            </>
          );
        })()}

        
        {prcDisponibles.length > 0 && (
          <>
            <label style={s.label}>Pièces de rechange (PRC) utilisées</label>
            <div style={s.tachesContainer}>
              {prcDisponibles.map(prc => {
                const isSelected = prcSelectionnes[prc.id] !== undefined;
                return (
                  <div key={prc.id} style={isSelected ? s.prcItemActive : s.prcItem}>
                    <button type="button" onClick={() => togglePrc(prc)} style={s.prcToggle}>
                      <span style={s.tacheCheck}>{isSelected ? '✓' : '○'}</span>
                      <div style={{ flex: 1, textAlign: 'left' }}>
                        <div style={s.prcCode}>{prc.code_prc}</div>
                        <div style={s.prcDesig}>{prc.designation}</div>
                      </div>
                      <span style={prc.stock <= 2 ? s.prcStockLow : s.prcStockOk}>
                        Stock: {prc.stock}
                      </span>
                    </button>
                    {isSelected && (
                      <div style={s.prcQtyRow}>
                        <span style={s.prcQtyLabel}>Quantité utilisée :</span>
                        <button type="button" style={s.prcQtyBtn}
                          onClick={() => setPrcQty(prc.id, prcSelectionnes[prc.id] - 1, prc.stock)}>−</button>
                        <span style={s.prcQtyVal}>{prcSelectionnes[prc.id]}</span>
                        <button type="button" style={s.prcQtyBtn}
                          onClick={() => setPrcQty(prc.id, prcSelectionnes[prc.id] + 1, prc.stock)}>+</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        
        <label style={s.label}>
          Description / Observations
          {action === 'Cloture' && <span style={s.required}> *</span>}
        </label>
        <textarea value={description} onChange={e => setDescription(e.target.value)} rows={4}
          style={{ ...s.input, resize: 'vertical', minHeight: 100, fontFamily: 'inherit' }}
          placeholder={action === 'Cloture'
            ? 'Travaux effectués, pièces remplacées, observations...'
            : 'Observations initiales, état de l\'équipement...'}
          required={action === 'Cloture'}
        />

        <button type="submit" disabled={saving}
          style={saving ? s.btnDisabled : { ...s.btn, background: action === 'Cloture' ? '#1d4ed8' : '#16a34a' }}>
          {saving ? 'Envoi...' : `Enregistrer — ${action}`}
        </button>
      </form>
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
    width: '100%', maxWidth: 460, background: '#fff', borderRadius: 24,
    padding: 28, boxShadow: '0 25px 50px -12px rgba(0,0,0,0.35)',
    boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 0,
  },
  logoWrap: { textAlign: 'center', marginBottom: 8 },
  logoBadge: {
    width: 52, height: 52, background: '#1e3a8a', color: '#fff', borderRadius: '50%',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 24, fontWeight: 900, boxShadow: '0 8px 16px rgba(30,58,138,0.3)',
  },
  kicker: { margin: '0 0 2px', color: '#1d4ed8', fontSize: 11, fontWeight: 800, letterSpacing: 1.5, textTransform: 'uppercase' },
  title:  { margin: '2px 0 4px', color: '#0f172a', fontSize: 24, fontWeight: 800 },
  muted:  { margin: '0 0 16px', color: '#64748b', fontSize: 13 },
  label: { display: 'block', color: '#334155', fontSize: 13, fontWeight: 700, margin: '14px 0 6px' },
  required: { color: '#ef4444' },
  sectionTitle: { margin: '12px 0 8px', color: '#334155', fontSize: 13, fontWeight: 700 },
  input: {
    width: '100%', border: '1px solid #cbd5e1', borderRadius: 12,
    padding: '12px 14px', fontSize: 15, color: '#0f172a',
    boxSizing: 'border-box', outline: 'none', background: '#f8fafc',
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
  btnSecondary: {
    width: '100%', marginTop: 8, border: '1.5px dashed #cbd5e1', borderRadius: 14,
    padding: 13, background: '#f8fafc', color: '#475569', fontSize: 14, fontWeight: 700, cursor: 'pointer',
  },
  headerRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  backBtn: {
    padding: '6px 12px', background: '#f1f5f9', border: '1px solid #cbd5e1',
    borderRadius: 8, color: '#64748b', fontSize: 12, fontWeight: 700, cursor: 'pointer',
  },
  equipBadge: {
    display: 'flex', alignItems: 'center', gap: 10,
    background: 'linear-gradient(135deg,#eff6ff,#dbeafe)', border: '1px solid #bfdbfe',
    borderRadius: 12, padding: '10px 14px', marginBottom: 10,
  },
  equipId:  { color: '#1e3a8a', fontSize: 20, fontWeight: 900 },
  equipNom: { color: '#1e293b', fontSize: 14, fontWeight: 700 },
  
  sousEquipCard: {
    width: '100%', background: '#f8fafc', border: '1.5px solid #e2e8f0',
    borderRadius: 14, padding: '14px 16px', marginBottom: 10,
    cursor: 'pointer', textAlign: 'left',
  },
  sousEquipTile: {
    width: '100%', background: '#fff', border: '2px solid #e2e8f0',
    borderRadius: 14, padding: '12px 14px', marginBottom: 8,
    cursor: 'pointer', textAlign: 'left', boxSizing: 'border-box',
  },
  sousEquipBullet: {
    width: 32, height: 32, borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: '#fff', fontSize: 13, fontWeight: 900, flexShrink: 0,
  },
  sousEquipRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  sousEquipNom: { color: '#0f172a', fontSize: 15, fontWeight: 700 },
  sousEquipStatut: { fontSize: 12, fontWeight: 600, marginTop: 3 },
  sousEquipArrow: { color: '#1d4ed8', fontSize: 18, fontWeight: 800 },
  
  sousEquipSelectedBadge: {
    display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
    background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10,
    padding: '8px 12px', marginBottom: 10,
  },
  sousEquipSelectedLabel: { color: '#15803d', fontSize: 12, fontWeight: 700 },
  sousEquipSelectedNom:   { color: '#166534', fontSize: 13, fontWeight: 800, flex: 1 },
  changeSousEquipBtn: {
    padding: '3px 10px', background: '#fff', border: '1px solid #bbf7d0',
    borderRadius: 8, color: '#15803d', fontSize: 11, fontWeight: 700, cursor: 'pointer',
  },
  linkedBadge: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10,
    padding: '8px 12px', marginBottom: 4,
  },
  linkedLabel: { color: '#15803d', fontSize: 12, fontWeight: 700 },
  linkedDate:  { color: '#166534', fontSize: 12, fontWeight: 600 },
  ouvertureBox: {
    background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 12,
    padding: '10px 14px', marginBottom: 10,
  },
  ouvertureLabel: { margin: '0 0 6px', color: '#92400e', fontSize: 12, fontWeight: 800 },
  ouvertureItem:  { color: '#78350f', fontSize: 13, fontWeight: 600 },
  ouvertureDesc:  { margin: '6px 0 0', color: '#92400e', fontSize: 12 },
  planCard: {
    width: '100%', background: '#f8fafc', border: '1.5px solid #e2e8f0',
    borderRadius: 14, padding: '14px 16px', marginBottom: 10,
    cursor: 'pointer', textAlign: 'left',
  },
  planSousEquip: { color: '#1d4ed8', fontSize: 12, fontWeight: 600, marginTop: 3 },
  badgePlanifie: {
    display: 'inline-block', padding: '2px 8px', background: '#eff6ff',
    color: '#1d4ed8', border: '1px solid #bfdbfe', borderRadius: 20, fontSize: 11, fontWeight: 700,
  },
  badgeEnCours: {
    display: 'inline-block', padding: '2px 8px', background: '#fffbeb',
    color: '#b45309', border: '1px solid #fde68a', borderRadius: 20, fontSize: 11, fontWeight: 700,
  },
  planDate:   { color: '#334155', fontSize: 13, fontWeight: 700, marginTop: 6 },
  planTaches: { color: '#64748b', fontSize: 12, marginTop: 2, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  planAction: { color: '#1d4ed8', fontSize: 12, fontWeight: 800, whiteSpace: 'nowrap', paddingLeft: 8 },
  ouvertCard: {
    background: '#fff7ed', border: '2px solid #fed7aa', borderRadius: 16,
    padding: '14px 16px', marginBottom: 10, display: 'flex', flexDirection: 'column',
  },
  ouvertureHighlight: {
    background: '#fff', border: '1.5px solid #fed7aa', borderRadius: 10,
    padding: '10px 14px', margin: '8px 0',
  },
  ouvertureHighlightLabel: {
    margin: '0 0 4px', color: '#92400e', fontSize: 11, fontWeight: 800,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  ouvertureHighlightRow: { display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' },
  ouvertureHighlightDate: { color: '#78350f', fontSize: 14, fontWeight: 600 },
  ouvertureHighlightTime: { color: '#b45309', fontSize: 22, fontWeight: 900 },
  btnCloture: {
    width: '100%', marginTop: 6, padding: '13px 16px', background: '#dc2626',
    color: '#fff', border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 800, cursor: 'pointer',
  },
  planifieCard: {
    background: '#eff6ff', border: '1.5px solid #bfdbfe', borderRadius: 16,
    padding: '14px 16px', marginBottom: 10, display: 'flex', flexDirection: 'column',
  },
  btnOuvrir: {
    width: '100%', marginTop: 6, padding: '13px 16px', background: '#16a34a',
    color: '#fff', border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 800, cursor: 'pointer',
  },
  btnClotureBlue: {
    width: '100%', marginTop: 6, padding: '13px 16px', background: '#1d4ed8',
    color: '#fff', border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 800, cursor: 'pointer',
  },
  badgeTypeSmall: {
    display: 'inline-block', padding: '2px 8px', background: '#fef3c7',
    color: '#92400e', border: '1px solid #fde68a', borderRadius: 20, fontSize: 11, fontWeight: 700,
  },
  divider: {
    display: 'flex', alignItems: 'center', margin: '12px 0 8px', gap: 10,
    color: '#94a3b8', fontSize: 12,
  },
  segmented:  { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 4 },
  segmented3: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 4 },
  seg: {
    padding: 12, border: '1px solid #cbd5e1', background: '#fff',
    color: '#334155', borderRadius: 12, fontWeight: 700, fontSize: 13, cursor: 'pointer',
  },
  segActive: {
    padding: 12, border: '2px solid #1d4ed8', background: '#eff6ff',
    color: '#1d4ed8', borderRadius: 12, fontWeight: 800, fontSize: 13, cursor: 'pointer',
  },
  actionBadgeOuverture: {
    background: '#f0fdf4', border: '2px solid #16a34a', borderRadius: 12,
    padding: '12px 16px', color: '#15803d', fontWeight: 800, fontSize: 14, marginBottom: 4,
  },
  actionBadgeCloture: {
    background: '#eff6ff', border: '2px solid #1d4ed8', borderRadius: 12,
    padding: '12px 16px', color: '#1d4ed8', fontWeight: 800, fontSize: 14, marginBottom: 4,
  },
  actionFixed: { color: '#94a3b8', fontSize: 11, fontWeight: 500 },
  tachesContainer: { display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 4 },
  tache: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '11px 14px', background: '#f8fafc', border: '1.5px solid #e2e8f0',
    borderRadius: 12, color: '#334155', fontSize: 14, fontWeight: 600,
    cursor: 'pointer', textAlign: 'left',
  },
  tacheActive: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '11px 14px', background: '#f0fdf4', border: '2px solid #16a34a',
    borderRadius: 12, color: '#15803d', fontSize: 14, fontWeight: 700,
    cursor: 'pointer', textAlign: 'left',
  },
  tacheCheck: { fontSize: 16, fontWeight: 900, width: 20, textAlign: 'center', flexShrink: 0 },
  prcItem: {
    background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: 12, overflow: 'hidden',
  },
  prcItemActive: {
    background: '#f0fdf4', border: '2px solid #16a34a', borderRadius: 12, overflow: 'hidden',
  },
  prcToggle: {
    display: 'flex', alignItems: 'center', gap: 10, width: '100%',
    padding: '11px 14px', background: 'transparent', border: 'none',
    cursor: 'pointer',
  },
  prcCode:     { color: '#0f172a', fontSize: 13, fontWeight: 700 },
  prcDesig:    { color: '#64748b', fontSize: 12, marginTop: 1 },
  prcStockOk:  { padding: '2px 8px', background: '#dcfce7', color: '#15803d', borderRadius: 20, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' },
  prcStockLow: { padding: '2px 8px', background: '#fef3c7', color: '#b45309', borderRadius: 20, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' },
  prcQtyRow:   { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px 10px', borderTop: '1px solid #e2e8f0' },
  prcQtyLabel: { color: '#64748b', fontSize: 12, fontWeight: 600, flex: 1 },
  prcQtyBtn: {
    width: 28, height: 28, border: '1.5px solid #cbd5e1', borderRadius: 8,
    background: '#fff', color: '#334155', fontSize: 16, fontWeight: 800,
    cursor: 'pointer', padding: 0, lineHeight: 1,
  },
  prcQtyVal: { color: '#0f172a', fontSize: 15, fontWeight: 800, minWidth: 24, textAlign: 'center' },
  successIcon: {
    width: 64, height: 64, margin: '0 auto 12px', borderRadius: '50%',
    background: '#dcfce7', color: '#15803d', display: 'flex',
    alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 28,
  },
  summaryBox: {
    background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12,
    padding: 14, marginTop: 12, textAlign: 'left',
  },
  summaryLine: { margin: '4px 0', fontSize: 13, color: '#334155' },
};

export default ScanInterventionPage;

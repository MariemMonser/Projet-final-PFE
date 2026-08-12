

const db = require('../config/db');
const dw = require('../config/db_dw');
const nodemailer = require('nodemailer');

const makeTransporter = () => nodemailer.createTransport({
  host: 'smtp.gmail.com', port: 587, secure: false,
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
});

// Envoie une alerte automatiquement à tous les admins + responsables
const envoyerAlertesAutoAdmin = async (alerteData) => {
  try {
    const usersRes = await db.query(
      `SELECT email, prenom, nom FROM utilisateurs WHERE role IN ('Administrateur','Responsable') AND est_actif = true`
    );
    if (usersRes.rows.length === 0) return;
    const destinataires = usersRes.rows.map(u => u.email).join(',');
    const transporter = makeTransporter();
    await transporter.sendMail({
      from: `"ELEONETECH Alertes" <${process.env.EMAIL_USER}>`,
      to: destinataires,
      subject: `ELEONETECH - Alerte ${alerteData.type === 'eau' ? 'Eau' : 'Électricité'} détectée`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
          <div style="background:#fff3cd;padding:20px;border-radius:8px;border-left:4px solid #f59e0b;">
            <h2 style="color:#b45309;margin:0 0 10px 0;">⚠️ Alerte consommation</h2>
            <p><strong>Type :</strong> ${alerteData.type === 'eau' ? 'Eau' : 'Électricité'}</p>
            <p><strong>Message :</strong> ${alerteData.message}</p>
            <p><strong>Date :</strong> ${new Date(alerteData.date).toLocaleDateString('fr-FR')}</p>
            <p><strong>Dépassement :</strong> ${parseFloat(alerteData.depassement).toFixed(2)} ${alerteData.type === 'eau' ? 'm³' : 'kWh'}</p>
            <p><strong>Coût estimé :</strong> ${parseFloat(alerteData.cout_estime).toFixed(3)} DT</p>
          </div>
          <p style="color:#999;font-size:12px;margin-top:16px;">Alerte générée automatiquement par ELEONETECH.</p>
        </div>
      `
    });
    // Mark alert as emailed
    await db.query(
      `UPDATE alertes SET email_envoye = TRUE, date_email_envoye = NOW(), email_destinataire = $1
       WHERE type_consommation = $2 AND date_alerte = $3 AND (email_envoye = FALSE OR email_envoye IS NULL)`,
      [destinataires, alerteData.type, alerteData.date]
    );
  } catch (err) {
    console.error('Erreur envoyerAlertesAutoAdmin:', err.message);
  }
};

const dwSafe = async (sql) => {
  try { const r = await dw.query(sql); return r.rows; }
  catch (_) { return []; }
};

/* Mai(4)–Oct(9) = été, reste = hiver (Tunisie) */
const getSaison = () => {
  const m = new Date().getMonth();
  return (m >= 4 && m <= 9) ? 'ete' : 'hiver';
};

const getSeuils = async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM seuils_consommation ORDER BY id ASC'
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Erreur getSeuils:', err);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
};

const updateSeuils = async (req, res) => {
  try {
    const { seuils } = req.body;

    if (!Array.isArray(seuils) || seuils.length === 0) {
      return res.status(400).json({ message: 'Données invalides.' });
    }

    for (const s of seuils) {
      await db.query(
        `UPDATE seuils_consommation
         SET seuil_hiver = $1, seuil_ete = $2, prix_unitaire = $3, updated_at = CURRENT_TIMESTAMP
         WHERE type_consommation = $4`,
        [s.seuil_hiver, s.seuil_ete, s.prix_unitaire, s.type_consommation]
      );
    }

    res.json({ message: 'Seuils mis à jour avec succès.' });
  } catch (err) {
    console.error('Erreur updateSeuils:', err);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
};

const getAlertHistory = async (req, res) => {
  try {
    const result = await db.query(`
      SELECT id, type_consommation, message, date_alerte, valeur, seuil, depassement,
             cout_estime, technicien_id, technicien_nom, commentaire, email_envoye,
             date_email_envoye, email_destinataire, created_at
      FROM alertes
      ORDER BY created_at DESC
      LIMIT 50
    `);

    res.json(result.rows);
  } catch (err) {
    console.error('Erreur getAlertHistory:', err);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
};

// ── Core alert logic (no HTTP context needed) ─────────────────────────────
const verifierEtCreerAlertes = async (technicienId = null, technicienNom = 'Système') => {
  const alertes = [];

  const seuilsResult = await db.query('SELECT * FROM seuils_consommation');
  const seuilsMap = {};
  for (const row of seuilsResult.rows) seuilsMap[row.type_consommation] = row;

  const seuilEau  = seuilsMap['eau']        || { seuil_hiver: 9000,  seuil_ete: 12000, prix_unitaire: 0.200 };
  const seuilElec = seuilsMap['electricite'] || { seuil_hiver: 2300,  seuil_ete: 4000,  prix_unitaire: 0.700 };
  const saison = getSaison();

  // ── Eau : total mensuel du mois en cours ──────────────────────────────────
  try {
    const eauRes = await db.query(`
      SELECT
        DATE_TRUNC('month', date_releve)::date AS mois,
        SUM(consommation_jour)                 AS total_mois,
        MAX(date_releve)                       AS derniere_date
      FROM consommation_eau
      WHERE date_releve >= DATE_TRUNC('month', CURRENT_DATE)
      GROUP BY 1
    `);

    if (eauRes.rows.length > 0) {
      const { mois, total_mois, derniere_date } = eauRes.rows[0];
      const total    = parseFloat(total_mois || 0);
      const seuil    = parseFloat(saison === 'hiver' ? seuilEau.seuil_hiver : seuilEau.seuil_ete);

      if (total > seuil) {
        const alerteData = {
          type:       'eau',
          message:    `Consommation eau du mois elevee: ${total.toFixed(1)} m³ (seuil: ${seuil} m³)`,
          date:       derniere_date,
          valeur:     total,
          seuil,
          depassement: total - seuil,
          cout_estime: (total - seuil) * parseFloat(seuilEau.prix_unitaire),
        };

        const existing = await db.query(
          `SELECT id FROM alertes WHERE type_consommation = 'eau'
           AND date_alerte >= DATE_TRUNC('month', CURRENT_DATE)`,
        );
        if (existing.rows.length === 0) {
          await db.query(`
            INSERT INTO alertes
              (type_consommation, message, date_alerte, valeur, seuil, depassement,
               cout_estime, technicien_id, technicien_nom, commentaire, email_envoye)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,FALSE)
          `, [alerteData.type, alerteData.message, alerteData.date,
              alerteData.valeur, alerteData.seuil, alerteData.depassement,
              alerteData.cout_estime, technicienId, technicienNom,
              'Alerte générée automatiquement']);
          envoyerAlertesAutoAdmin(alerteData);
          console.log(`[Alertes] Alerte eau créée : ${total.toFixed(1)} m³ > ${seuil} m³`);
        }
        alertes.push(alerteData);
      }
    }
  } catch (err) {
    console.error('[Alertes] Erreur vérification eau:', err.message);
  }

  // ── Electricité : total mensuel du mois en cours ──────────────────────────
  try {
    const elecRes = await db.query(`
      SELECT
        DATE_TRUNC('month', date_releve)::date AS mois,
        SUM(consommation_jour)                 AS total_mois,
        MAX(date_releve)                       AS derniere_date
      FROM consommation_electricite
      WHERE date_releve >= DATE_TRUNC('month', CURRENT_DATE)
      GROUP BY 1
    `);

    if (elecRes.rows.length > 0) {
      const { mois, total_mois, derniere_date } = elecRes.rows[0];
      const total = parseFloat(total_mois || 0);
      const seuil = parseFloat(saison === 'hiver' ? seuilElec.seuil_hiver : seuilElec.seuil_ete);

      if (total > seuil) {
        const alerteData = {
          type:       'electricite',
          message:    `Consommation electricite du mois elevee: ${total.toFixed(1)} kWh (seuil: ${seuil} kWh)`,
          date:       derniere_date,
          valeur:     total,
          seuil,
          depassement: total - seuil,
          cout_estime: (total - seuil) * parseFloat(seuilElec.prix_unitaire),
        };

        const existing = await db.query(
          `SELECT id FROM alertes WHERE type_consommation = 'electricite'
           AND date_alerte >= DATE_TRUNC('month', CURRENT_DATE)`,
        );
        if (existing.rows.length === 0) {
          await db.query(`
            INSERT INTO alertes
              (type_consommation, message, date_alerte, valeur, seuil, depassement,
               cout_estime, technicien_id, technicien_nom, commentaire, email_envoye)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,FALSE)
          `, [alerteData.type, alerteData.message, alerteData.date,
              alerteData.valeur, alerteData.seuil, alerteData.depassement,
              alerteData.cout_estime, technicienId, technicienNom,
              'Alerte générée automatiquement']);
          envoyerAlertesAutoAdmin(alerteData);
          console.log(`[Alertes] Alerte élec créée : ${total.toFixed(1)} kWh > ${seuil} kWh`);
        }
        alertes.push(alerteData);
      }
    }
  } catch (err) {
    console.error('[Alertes] Erreur vérification électricité:', err.message);
  }

  return alertes;
};

const checkAlertes = async (req, res) => {
  try {
    const technicienId  = req.user?.id || null;
    const technicienNom = req.user?.nom
      ? `${req.user.prenom || ''} ${req.user.nom}`.trim()
      : 'Technicien';

    const alertes = await verifierEtCreerAlertes(technicienId, technicienNom);

    res.json({
      alertes,
      currentUser: {
        id:     req.user?.id,
        nom:    req.user?.nom,
        prenom: req.user?.prenom,
        email:  req.user?.email,
      },
    });
  } catch (err) {
    console.error('Erreur checkAlertes:', err);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
};

const sendAlertEmail = async (req, res) => {
  try {
    console.log('sendAlertEmail appele avec:', req.body);
    const { email, alerts, timestamp, technicianName, comment } = req.body;

    if (!email || !alerts || !Array.isArray(alerts)) {
      return res.status(400).json({ message: 'Donnees invalides.' });
    }

    
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false, 
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    
    const alertDetails = alerts.map(alert =>
      `Type: ${alert.type === 'eau' ? 'Eau' : 'Electricite'}<br/>
       Message: ${alert.message}<br/>
       Date: ${new Date(alert.date).toLocaleDateString('fr-FR')}<br/>
       Depassement: ${alert.depassement.toFixed(2)} ${alert.type === 'eau' ? 'm3' : 'kWh'}<br/>
       Cout estime: ${alert.cout_estime.toFixed(2)} DT`
    ).join('<br/><hr/>');

    const mailOptions = {
      from: `"ELEONETECH Alertes" <${process.env.EMAIL_USER}>`, 
      to: email,
      subject: `ELEONETECH - ${alerts.length} alerte(s) detectee(s)`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #fff3cd; padding: 20px; border-radius: 8px; border-left: 4px solid #f59e0b;">
            <h2 style="color: #f59e0b; margin: 0 0 10px 0;">Alerte ELEONETECH</h2>
            <p>${alerts.length} alerte(s) detectee(s) dans le systeme de monitoring.</p>
            <p style="color: #666; font-size: 14px;">Date: ${new Date(timestamp).toLocaleString('fr-FR')}</p>
            ${technicianName ? `<p style="color: #666; font-size: 14px;">Technicien: ${technicianName}</p>` : ''}
            ${comment ? `<p style="color: #666; font-size: 14px;">Commentaire: ${comment}</p>` : ''}
          </div>
          <div style="background: white; padding: 20px; border-radius: 8px; margin-top: 20px; border: 1px solid #dee2e6;">
            <h3 style="color: #495057;">Details des alertes:</h3>
            <p>${alertDetails}</p>
          </div>
          <div style="text-align: center; margin-top: 20px; color: #999; font-size: 12px;">
            <p>Message genere automatiquement par ELEONETECH.</p>
          </div>
        </div>
      `,
    };

    const result = await transporter.sendMail(mailOptions);
    console.log('Email envoye:', result.messageId);

    
    try {
      await db.query(`
        UPDATE alertes
        SET email_envoye = TRUE,
            date_email_envoye = CURRENT_TIMESTAMP,
            email_destinataire = $1,
            commentaire = $2
        WHERE email_envoye = FALSE
        AND type_consommation = ANY($3)
        AND date_alerte = ANY($4::date[])
      `, [email, comment || 'Alerte generee automatiquement',
          alerts.map(a => a.type),
          alerts.map(a => a.date)]);
      console.log('Alertes marquees comme email envoye avec commentaire en base de donnees');
    } catch (dbErr) {
      console.error('Erreur mise a jour statut email:', dbErr.message);
    }

    res.json({ message: 'Email envoye avec succes', alertCount: alerts.length });
  } catch (err) {
    console.error('Erreur sendAlertEmail:', err.message);
    res.status(500).json({ message: 'Erreur envoi email.', error: err.message });
  }
};

const dismissNotification = async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  try {
    await db.query(
      `INSERT INTO dismissed_notifications (user_id, notif_id, dismissed_at)
       VALUES ($1, $2, NOW()) ON CONFLICT (user_id, notif_id) DO NOTHING`,
      [userId, id]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('dismissNotification:', err);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
};

const getNotifications = async (req, res) => {
  const items = [];
  const userId = req.user.id;

  // Get dismissed notification IDs for this user
  let dismissed = new Set();
  try {
    const dRes = await db.query(
      'SELECT notif_id FROM dismissed_notifications WHERE user_id = $1', [userId]
    );
    dismissed = new Set(dRes.rows.map(r => r.notif_id));
  } catch (_) {}


  try {
    const alertes = await db.query(`
      SELECT id, type_consommation, message, date_alerte, valeur, seuil, depassement
      FROM alertes
      WHERE (email_envoye = false OR email_envoye IS NULL)
        AND date_alerte >= NOW() - INTERVAL '30 days'
      ORDER BY date_alerte DESC
      LIMIT 10
    `);
    for (const a of alertes.rows) {
      if (dismissed.has(`alerte-${a.id}`)) continue;
      items.push({
        id:       `alerte-${a.id}`,
        type:     'alerte',
        icon:     a.type_consommation === 'eau' ? 'eau' : 'electricite',
        message:  a.message,
        date:     a.date_alerte,
        severity: parseFloat(a.depassement) > 20 ? 'danger' : 'warning',
        link_admin:      '/admin/monitoring',
        link_technicien: '/technicien/seuils',
        link_responsable: '/responsable/dashboard',
      });
    }
  } catch (_) {}

  
  try {
    const staging = await db.query(`
      SELECT id, type_intervention, technicien, equipement, created_at
      FROM interventions_staging
      WHERE statut = 'En attente'
      ORDER BY created_at DESC
      LIMIT 10
    `);
    for (const s of staging.rows) {
      if (dismissed.has(`staging-${s.id}`)) continue;
      items.push({
        id:       `staging-${s.id}`,
        type:     'intervention',
        icon:     'intervention',
        message:  `Fiche terrain en attente - ${s.technicien}${s.equipement ? ` (${s.equipement})` : ''}`,
        date:     s.created_at,
        severity: 'info',
        link_admin:      '/admin/interventions-terrain',
        link_technicien: '/technicien/interventions',
        link_responsable: '/responsable/interventions-terrain',
      });
    }
  } catch (_) {}

  
  try {
    const planifiees = await db.query(`
      SELECT id, date_intervention, type_intervention, description
      FROM interventions
      WHERE statut IN ('Planifiee', 'En cours')
        AND date_intervention BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '3 days'
      ORDER BY date_intervention ASC
      LIMIT 5
    `);
    for (const p of planifiees.rows) {
      if (dismissed.has(`planifiee-${p.id}`)) continue;
      const desc = (p.description || '').split(' | ')[0].replace('Equipement: ', '');
      items.push({
        id:       `planifiee-${p.id}`,
        type:     'planifiee',
        icon:     'planning',
        message:  `Intervention planifiee le ${new Date(p.date_intervention).toLocaleDateString('fr-FR')}${desc ? ` - ${desc}` : ''}`,
        date:     p.date_intervention,
        severity: 'info',
        link_admin:      '/admin/monitoring',
        link_technicien: '/technicien/interventions',
        link_responsable: '/responsable/interventions',
      });
    }
  } catch (_) {}

  items.sort((a, b) => new Date(b.date) - new Date(a.date));

  res.json({ total: items.length, items: items.slice(0, 15) });
};

const getAlertesMtbf = async (req, res) => {
  const rows = await dwSafe(`
    SELECT de.code_equipement,
           ROUND(fa.mtbf_h::numeric, 2) AS mtbf_h,
           ROUND(fa.mttr_h::numeric, 2) AS mttr_h,
           CASE WHEN fa.mtbf_h < 715 THEN 'ALERTE' ELSE 'OK' END AS statut_mtbf,
           CASE WHEN fa.mttr_h > 1   THEN 'ALERTE' ELSE 'OK' END AS statut_mttr
    FROM fact_arret fa
    JOIN dim_equipement de ON de.equip_id = fa.equip_id
    JOIN dim_temps      dt ON dt.temps_id  = fa.temps_id
    WHERE dt.annee_mois = (SELECT MAX(annee_mois) FROM dim_temps)
    ORDER BY fa.mtbf_h ASC
  `);
  res.json(rows);
};

const getAlertesPdr = async (req, res) => {
  const rows = await dwSafe(`
    SELECT dp.code_prc, dp.designation,
           dp.stock_actuel,
           CASE
             WHEN dp.stock_actuel = 0  THEN 'RUPTURE'
             WHEN dp.stock_actuel <= 2 THEN 'CRITIQUE'
             ELSE 'OK'
           END AS statut
    FROM dim_prc dp
    WHERE dp.stock_actuel <= 2
    ORDER BY dp.stock_actuel ASC
  `);
  res.json(rows);
};

module.exports = {
  getSeuils,
  updateSeuils,
  checkAlertes,
  verifierEtCreerAlertes,
  sendAlertEmail,
  getAlertHistory,
  getNotifications,
  dismissNotification,
  getAlertesMtbf,
  getAlertesPdr,
};

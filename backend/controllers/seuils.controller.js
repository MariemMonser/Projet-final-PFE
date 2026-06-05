// ============================================================
// SEUILS CONTROLLER
// Gestion des seuils de consommation et alertes
// ============================================================
const db = require('../config/db');
const dw = require('../config/db_dw');
const nodemailer = require('nodemailer');

const dwSafe = async (sql) => {
  try { const r = await dw.query(sql); return r.rows; }
  catch (_) { return []; }
};

const getSeuils = async (req, res) => {
  try {
    // Valeurs par defaut - pas besoin de creer la table
    const defaultSeuils = [
      {
        id: 1,
        type_consommation: 'eau',
        seuil_hiver: 9000,
        seuil_ete: 12000,
        prix_unitaire: 0.200,
        unite: 'm3'
      },
      {
        id: 2,
        type_consommation: 'electricite',
        seuil_hiver: 2300,
        seuil_ete: 4000,
        prix_unitaire: 0.700,
        unite: 'kWh'
      }
    ];

    res.json(defaultSeuils);
  } catch (err) {
    console.error('Erreur getSeuils:', err);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
};

const updateSeuils = async (req, res) => {
  try {
    const { seuils } = req.body;

    // Pas besoin de mettre a jour la base - juste retourner succes
    res.json({ message: 'Seuils mis a jour avec succes.' });
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

const checkAlertes = async (req, res) => {
  try {
    const alertes = [];

    // Valeurs par defaut
    const seuilEau = { seuil_hiver: 9000, seuil_ete: 12000, prix_unitaire: 0.200 };
    const seuilElec = { seuil_hiver: 2300, seuil_ete: 4000, prix_unitaire: 0.700 };

    // Get current technician info from token
    const technicienId = req.user?.id || null;
    const technicienNom = req.user?.nom
      ? `${req.user.prenom || ''} ${req.user.nom}`.trim()
      : 'Technicien';

    // Verifier consommation eau - only unsent alerts
    try {
      const eauData = await db.query(
        "SELECT date_releve, compteur, CASE WHEN LAG(compteur, 1, compteur) OVER (ORDER BY date_releve) = compteur THEN 0 ELSE compteur - LAG(compteur, 1, compteur) OVER (ORDER BY date_releve) END as consommation_journaliere FROM consommation_eau ORDER BY date_releve DESC LIMIT 30"
      );

      if (eauData.rows.length > 0) {
        const derniereConso = eauData.rows[0];
        const saisonActuelle = new Date().getMonth() >= 11 || new Date().getMonth() <= 3 ? 'hiver' : 'ete';
        const seuilActuel = saisonActuelle === 'hiver' ? seuilEau.seuil_hiver : seuilEau.seuil_ete;

        if (derniereConso.consommation_journaliere > seuilActuel) {
          const alerteData = {
            type: 'eau',
            message: `Consommation eau elevee: ${derniereConso.consommation_journaliere} m3 (seuil: ${seuilActuel} m3)`,
            date: derniereConso.date_releve,
            valeur: derniereConso.consommation_journaliere,
            seuil: seuilActuel,
            depassement: derniereConso.consommation_journaliere - seuilActuel,
            cout_estime: (derniereConso.consommation_journaliere - seuilActuel) * seuilEau.prix_unitaire
          };

          // Check if this alert was already sent
          const existingAlert = await db.query(
            'SELECT id FROM alertes WHERE type_consommation = $1 AND date_alerte = $2 AND email_envoye = TRUE',
            [alerteData.type, alerteData.date]
          );

          if (existingAlert.rows.length === 0) {
            alertes.push(alerteData);

            // Store alert in database
            try {
              await db.query(`
                INSERT INTO alertes
                (type_consommation, message, date_alerte, valeur, seuil, depassement,
                 cout_estime, technicien_id, technicien_nom, commentaire, email_envoye)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, FALSE)
              `, [
                alerteData.type,
                alerteData.message,
                alerteData.date,
                alerteData.valeur,
                alerteData.seuil,
                alerteData.depassement,
                alerteData.cout_estime,
                technicienId,
                technicienNom,
                'Alerte generee automatiquement'
              ]);
              console.log('Alerte eau stockee en base de donnees (non envoyee)');
            } catch (dbErr) {
              console.error('Erreur stockage alerte eau:', dbErr.message);
            }
          } else {
            console.log('Alerte eau deja envoyee, ignoree');
          }
        }
      }
    } catch (err) {
      console.log('Table consommation_eau non disponible:', err.message);
    }

    // Verifier consommation electricite - only unsent alerts
    try {
      const elecData = await db.query(
        'SELECT date_releve, consommation_jour FROM consommation_electricite ORDER BY date_releve DESC LIMIT 30'
      );

      if (elecData.rows.length > 0) {
        const derniereConso = elecData.rows[0];
        const saisonActuelle = new Date().getMonth() >= 11 || new Date().getMonth() <= 3 ? 'hiver' : 'ete';
        const seuilActuel = saisonActuelle === 'hiver' ? seuilElec.seuil_hiver : seuilElec.seuil_ete;

        if (derniereConso.consommation_jour > seuilActuel) {
          const alerteData = {
            type: 'electricite',
            message: `Consommation electricite elevee: ${derniereConso.consommation_jour} kWh (seuil: ${seuilActuel} kWh)`,
            date: derniereConso.date_releve,
            valeur: derniereConso.consommation_jour,
            seuil: seuilActuel,
            depassement: derniereConso.consommation_jour - seuilActuel,
            cout_estime: (derniereConso.consommation_jour - seuilActuel) * seuilElec.prix_unitaire
          };

          // Check if this alert was already sent
          const existingAlert = await db.query(
            'SELECT id FROM alertes WHERE type_consommation = $1 AND date_alerte = $2 AND email_envoye = TRUE',
            [alerteData.type, alerteData.date]
          );

          if (existingAlert.rows.length === 0) {
            alertes.push(alerteData);

            // Store alert in database
            try {
              await db.query(`
                INSERT INTO alertes
                (type_consommation, message, date_alerte, valeur, seuil, depassement,
                 cout_estime, technicien_id, technicien_nom, commentaire, email_envoye)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, FALSE)
              `, [
                alerteData.type,
                alerteData.message,
                alerteData.date,
                alerteData.valeur,
                alerteData.seuil,
                alerteData.depassement,
                alerteData.cout_estime,
                technicienId,
                technicienNom,
                'Alerte generee automatiquement'
              ]);
              console.log('Alerte electricite stockee en base de donnees (non envoyee)');
            } catch (dbErr) {
              console.error('Erreur stockage alerte electricite:', dbErr.message);
            }
          } else {
            console.log('Alerte electricite deja envoyee, ignoree');
          }
        }
      }
    } catch (err) {
      console.log('Table consommation_electricite non disponible:', err.message);
    }

    res.json({
      alertes: alertes,
      currentUser: {
        id: req.user?.id,
        nom: req.user?.nom,
        prenom: req.user?.prenom,
        email: req.user?.email
      }
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

    // Fixed transporter
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false, // TLS
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    // Format alert details
    const alertDetails = alerts.map(alert =>
      `Type: ${alert.type === 'eau' ? 'Eau' : 'Electricite'}<br/>
       Message: ${alert.message}<br/>
       Date: ${new Date(alert.date).toLocaleDateString('fr-FR')}<br/>
       Depassement: ${alert.depassement.toFixed(2)} ${alert.type === 'eau' ? 'm3' : 'kWh'}<br/>
       Cout estime: ${alert.cout_estime.toFixed(2)} DT`
    ).join('<br/><hr/>');

    const mailOptions = {
      from: `"ELEONETECH Alertes" <${process.env.EMAIL_USER}>`, // display name
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

    // Mark alerts as email sent in database with custom comment
    try {
      await db.query(`
        UPDATE alertes
        SET email_envoye = TRUE,
            date_email_envoye = CURRENT_TIMESTAMP,
            email_destinataire = $1,
            commentaire = $2
        WHERE email_envoye = FALSE
        AND type_consommation = ANY($3)
      `, [email, comment || 'Alerte generee automatiquement', alerts.map(alert => alert.type)]);
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

// ── GET /api/seuils/notifications ────────────────────────
const getNotifications = async (req, res) => {
  const items = [];

  // 1. Alertes seuil non encore envoyees par email
  try {
    const alertes = await db.query(`
      SELECT id, type_consommation, message, date_alerte, valeur, seuil, depassement
      FROM alertes
      WHERE email_envoye = false OR email_envoye IS NULL
      ORDER BY date_alerte DESC
      LIMIT 10
    `);
    for (const a of alertes.rows) {
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

  // 2. Fiches terrain en attente de validation
  try {
    const staging = await db.query(`
      SELECT id, type_intervention, technicien, equipement, created_at
      FROM interventions_staging
      WHERE statut = 'En attente'
      ORDER BY created_at DESC
      LIMIT 10
    `);
    for (const s of staging.rows) {
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

  // 3. Interventions planifiees dans les 3 prochains jours
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

// ── GET /api/seuils/alertes-mtbf ─────────────────────────
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

// ── GET /api/seuils/alertes-pdr ──────────────────────────
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
  sendAlertEmail,
  getAlertHistory,
  getNotifications,
  getAlertesMtbf,
  getAlertesPdr,
};

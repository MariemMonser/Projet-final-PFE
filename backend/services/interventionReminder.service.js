

const nodemailer = require('nodemailer');
const db = require('../config/db');

const RAPPEL_JOURS = [7, 3, 1, 0];
const SIX_HOURS = 6 * 60 * 60 * 1000;

const normaliser = (value = '') =>
  value
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const formatDate = (value) => {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('fr-FR');
};

const extraireDetails = (description = '') => {
  return description.split('|').reduce((acc, item) => {
    const [cle, ...reste] = item.trim().split(':');
    if (cle && reste.length) acc[normaliser(cle)] = reste.join(':').trim();
    return acc;
  }, {});
};

const creerTransporter = () => nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  tls: { rejectUnauthorized: false },
});

const initialiserTableRappels = async () => {
  await db.query(`
    CREATE TABLE IF NOT EXISTS intervention_rappels_email (
      id SERIAL PRIMARY KEY,
      intervention_id INTEGER NOT NULL,
      jours_avant INTEGER NOT NULL,
      email_destinataire VARCHAR(255) NOT NULL,
      date_envoi TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (intervention_id, jours_avant, email_destinataire)
    )
  `);
};

const trouverTechnicien = async (technicienTexte = '') => {
  const emailDansTexte = technicienTexte.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
  if (emailDansTexte) {
    const userByEmail = await db.query(
      'SELECT id, prenom, nom, email FROM utilisateurs WHERE LOWER(email) = LOWER($1) AND est_actif = true LIMIT 1',
      [emailDansTexte]
    );
    if (userByEmail.rows.length > 0) return userByEmail.rows[0];
    return { prenom: '', nom: technicienTexte, email: emailDansTexte };
  }

  const users = await db.query(
    `SELECT id, prenom, nom, email
     FROM utilisateurs
     WHERE role = $1 AND est_actif = true`,
    ['Technicien']
  );

  const cible = normaliser(technicienTexte);
  return users.rows.find((user) => {
    const nomComplet = normaliser(`${user.prenom || ''} ${user.nom || ''}`);
    const nomInverse = normaliser(`${user.nom || ''} ${user.prenom || ''}`);
    return cible === nomComplet
      || cible === nomInverse
      || cible === normaliser(user.email)
      || (cible && nomComplet.includes(cible))
      || (cible && cible.includes(nomComplet));
  });
};

const rappelDejaEnvoye = async (interventionId, joursAvant, email) => {
  const result = await db.query(
    `SELECT id
     FROM intervention_rappels_email
     WHERE intervention_id = $1 AND jours_avant = $2 AND email_destinataire = $3`,
    [interventionId, joursAvant, email]
  );
  return result.rows.length > 0;
};

const enregistrerRappel = async (interventionId, joursAvant, email) => {
  await db.query(
    `INSERT INTO intervention_rappels_email (intervention_id, jours_avant, email_destinataire)
     VALUES ($1, $2, $3)
     ON CONFLICT (intervention_id, jours_avant, email_destinataire) DO NOTHING`,
    [interventionId, joursAvant, email]
  );
};

const envoyerRappel = async (intervention, technicien, joursAvant) => {
  const details = extraireDetails(intervention.description);
  const libelleDelai = joursAvant === 0 ? 'aujourd hui' : `dans ${joursAvant} jour(s)`;
  const nomTechnicien = `${technicien.prenom || ''} ${technicien.nom || ''}`.trim() || intervention.technicien;

  const transporter = creerTransporter();
  await transporter.sendMail({
    from: `"ELEONETECH Maintenance" <${process.env.EMAIL_USER}>`,
    to: technicien.email,
    subject: `Rappel intervention preventive - ${libelleDelai}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; color: #1f2937;">
        <div style="background: #1e3a8a; color: white; padding: 18px 22px; border-radius: 8px 8px 0 0;">
          <h2 style="margin: 0; font-size: 20px;">Rappel intervention preventive</h2>
          <p style="margin: 8px 0 0 0;">Bonjour ${nomTechnicien}, une intervention est prevue ${libelleDelai}.</p>
        </div>
        <div style="border: 1px solid #d1d5db; border-top: 0; padding: 22px; border-radius: 0 0 8px 8px;">
          <p><strong>Date :</strong> ${formatDate(intervention.date_intervention)}</p>
          <p><strong>Heure :</strong> ${details.heure || '-'}</p>
          <p><strong>Equipement :</strong> ${details.equipement || '-'}</p>
          <p><strong>Priorite :</strong> ${details.priorite || '-'}</p>
          <p><strong>Periodicite :</strong> ${details.periodicite || '-'}</p>
          <p><strong>Taches :</strong> ${details.taches || intervention.description || '-'}</p>
          <p style="color: #6b7280; font-size: 12px; margin-top: 24px;">
            Message genere automatiquement par ELEONETECH.
          </p>
        </div>
      </div>
    `,
  });
};

const chargerTechniciens = async () => {
  const res = await db.query(
    `SELECT id, prenom, nom, email FROM utilisateurs WHERE role = 'Technicien' AND est_actif = true`
  );
  return res.rows;
};

const trouverTechnicienDansListe = (technicienTexte = '', techniciens) => {
  const emailDansTexte = technicienTexte.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
  if (emailDansTexte) {
    const byEmail = techniciens.find(u => u.email.toLowerCase() === emailDansTexte.toLowerCase());
    return byEmail || { prenom: '', nom: technicienTexte, email: emailDansTexte };
  }
  const cible = normaliser(technicienTexte);
  return techniciens.find(user => {
    const nomComplet = normaliser(`${user.prenom || ''} ${user.nom || ''}`);
    const nomInverse = normaliser(`${user.nom || ''} ${user.prenom || ''}`);
    return cible === nomComplet
      || cible === nomInverse
      || cible === normaliser(user.email)
      || (cible && nomComplet.includes(cible))
      || (cible && cible.includes(nomComplet));
  });
};

const purgerAnciensRappels = async () => {
  try {
    await db.query(
      `DELETE FROM intervention_rappels_email WHERE date_envoi < NOW() - INTERVAL '60 days'`
    );
  } catch (_) {}
};

const traiterRappelsInterventions = async () => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.log('Rappels interventions: EMAIL_USER ou EMAIL_PASS manquant, envoi ignore.');
    return;
  }

  await initialiserTableRappels();
  await purgerAnciensRappels();

  const result = await db.query(`
    SELECT id, date_intervention, type_intervention, description, technicien, statut, cout
    FROM interventions
    WHERE type_intervention = $1
      AND statut IN ('Planifiee', 'En cours')
      AND date_intervention::date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'
    ORDER BY date_intervention ASC
  `, ['Preventive']);

  if (!result.rows.length) return;

  // Pré-charger tous les techniciens une seule fois (évite N+1 requêtes)
  const techniciens = await chargerTechniciens();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const intervention of result.rows) {
    const dateIntervention = new Date(intervention.date_intervention);
    dateIntervention.setHours(0, 0, 0, 0);
    const joursAvant = Math.round((dateIntervention - today) / (24 * 60 * 60 * 1000));

    if (!RAPPEL_JOURS.includes(joursAvant)) continue;

    const technicien = trouverTechnicienDansListe(intervention.technicien, techniciens);
    if (!technicien?.email) {
      console.log(`Rappel intervention ${intervention.id}: email technicien introuvable (${intervention.technicien}).`);
      continue;
    }

    if (await rappelDejaEnvoye(intervention.id, joursAvant, technicien.email)) continue;

    try {
      await envoyerRappel(intervention, technicien, joursAvant);
      await enregistrerRappel(intervention.id, joursAvant, technicien.email);
      console.log(`Rappel J-${joursAvant} envoye a ${technicien.email} pour intervention ${intervention.id}.`);
    } catch (err) {
      console.error(`Erreur envoi rappel intervention ${intervention.id}:`, err.message);
    }
  }
};

const RELANCE_JOURS = [3, 7, 14]; 

const envoyerRelance = async (intervention, technicien, joursApres) => {
  const details = extraireDetails(intervention.description);
  const nomTechnicien = `${technicien.prenom || ''} ${technicien.nom || ''}`.trim() || intervention.technicien;

  const transporter = creerTransporter();
  await transporter.sendMail({
    from: `"ELEONETECH Maintenance" <${process.env.EMAIL_USER}>`,
    to:   technicien.email,
    subject: `RELANCE J+${joursApres} — Intervention non clôturée`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; color: #1f2937;">
        <div style="background: #b91c1c; color: white; padding: 18px 22px; border-radius: 8px 8px 0 0;">
          <h2 style="margin: 0; font-size: 20px;">⚠️ Relance — Intervention en retard (J+${joursApres})</h2>
          <p style="margin: 8px 0 0 0;">Bonjour ${nomTechnicien}, une intervention est en retard de ${joursApres} jour(s).</p>
        </div>
        <div style="border: 1px solid #fca5a5; border-top: 0; padding: 22px; border-radius: 0 0 8px 8px; background: #fff5f5;">
          <p><strong>Date prévue :</strong> ${formatDate(intervention.date_intervention)}</p>
          <p><strong>Statut actuel :</strong> ${intervention.statut}</p>
          <p><strong>Equipement :</strong> ${details.equipement || '-'}</p>
          <p><strong>Type :</strong> ${intervention.type_intervention}</p>
          <p><strong>Description :</strong> ${intervention.description || '-'}</p>
          <p style="color: #b91c1c; font-weight: bold; margin-top: 16px;">
            Merci de clôturer cette intervention dès que possible.
          </p>
          <p style="color: #6b7280; font-size: 12px; margin-top: 24px;">
            Message généré automatiquement par ELEONETECH.
          </p>
        </div>
      </div>
    `,
  });
};

const traiterRelancesPostEcheance = async () => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) return;

  await initialiserTableRappels();

  await db.query(`
    ALTER TABLE intervention_rappels_email
    ADD COLUMN IF NOT EXISTS jours_apres INTEGER
  `).catch(() => {});

  const result = await db.query(`
    SELECT id, date_intervention, type_intervention, description, technicien, statut
    FROM interventions
    WHERE statut NOT IN ('Terminee', 'Cloturee', 'Validee')
      AND date_intervention < CURRENT_DATE - INTERVAL '2 days'
  `);

  if (!result.rows.length) return;

  // Pré-charger tous les techniciens une seule fois (évite N+1 requêtes)
  const techniciens = await chargerTechniciens();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const intervention of result.rows) {
    const dateIntervention = new Date(intervention.date_intervention);
    dateIntervention.setHours(0, 0, 0, 0);
    const joursApres = Math.round((today - dateIntervention) / (24 * 60 * 60 * 1000));

    if (!RELANCE_JOURS.includes(joursApres)) continue;

    const technicien = trouverTechnicienDansListe(intervention.technicien, techniciens);
    if (!technicien?.email) continue;

    
    const dejaEnvoye = await db.query(
      `SELECT id FROM intervention_rappels_email
       WHERE intervention_id = $1 AND jours_avant = $2 AND email_destinataire = $3`,
      [intervention.id, -joursApres, technicien.email]
    );
    if (dejaEnvoye.rows.length > 0) continue;

    try {
      await envoyerRelance(intervention, technicien, joursApres);
      await db.query(
        `INSERT INTO intervention_rappels_email (intervention_id, jours_avant, email_destinataire)
         VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
        [intervention.id, -joursApres, technicien.email]
      );
      console.log(`Relance J+${joursApres} envoyée à ${technicien.email} pour intervention ${intervention.id}.`);
    } catch (err) {
      console.error(`Erreur relance intervention ${intervention.id}:`, err.message);
    }
  }
};

const demarrerRappelsInterventions = () => {
  setTimeout(async () => {
    await traiterRappelsInterventions().catch(e => console.error('Rappels:', e.message));
    await traiterRelancesPostEcheance().catch(e => console.error('Relances:', e.message));
  }, 10000);

  setInterval(async () => {
    await traiterRappelsInterventions().catch(e => console.error('Rappels:', e.message));
    await traiterRelancesPostEcheance().catch(e => console.error('Relances:', e.message));
  }, SIX_HOURS);
};

module.exports = {
  demarrerRappelsInterventions,
  traiterRappelsInterventions,
  traiterRelancesPostEcheance,
};

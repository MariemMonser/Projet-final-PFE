// ============================================================
// KPI CONTROLLER - Données tableau de bord Responsable & Technicien
// ============================================================
const db   = require('../config/db');
const dw   = require('../config/db_dw');

const safe = (fn) => fn.catch(() => null);

// ── GET /api/kpi/responsable ──────────────────────────────
const getKpiResponsable = async (req, res) => {
  try {
    const [otRes, elecRes, alertesRes, stagingRes] = await Promise.all([
      // OT du dernier mois
      safe(db.query(`
        SELECT
          COUNT(*)                                               AS total_ot,
          COUNT(*) FILTER (WHERE statut = 'Terminee')           AS ot_terminees,
          COUNT(*) FILTER (WHERE type_intervention = 'Curative') AS ot_cura,
          COUNT(*) FILTER (WHERE type_intervention = 'Preventive') AS ot_prev
        FROM interventions
        WHERE date_intervention >= date_trunc('month', NOW())
      `)),
      // Conso électricité dernier mois
      safe(db.query(`
        SELECT
          SUM(consommation_jour) AS kwh_total,
          SUM(cout_total)        AS cout_total
        FROM consommation_electricite
        WHERE date_releve >= date_trunc('month', NOW())
      `)),
      // Alertes seuil actives (non envoyées)
      safe(db.query(`
        SELECT COUNT(*) AS nb_alertes
        FROM alertes
        WHERE email_envoye = false OR email_envoye IS NULL
      `)),
      // Fiches terrain en attente
      safe(db.query(`
        SELECT COUNT(*) AS nb_attente
        FROM interventions_staging
        WHERE statut = 'En attente'
      `)),
    ]);

    const ot         = otRes?.rows?.[0]  || {};
    const elec       = elecRes?.rows?.[0] || {};
    const alertes    = alertesRes?.rows?.[0] || {};
    const staging    = stagingRes?.rows?.[0] || {};

    const totalOt    = parseInt(ot.total_ot || 0);
    const otTerminees = parseInt(ot.ot_terminees || 0);
    const tauxReal   = totalOt > 0 ? Math.round((otTerminees / totalOt) * 100) : 0;

    // MTBF depuis le DW si disponible
    let mtbfMoyen = null;
    let nbNonConformes = 0;
    try {
      const mtbfRes = await dw.query(`
        SELECT
          ROUND(AVG(fa.mtbf_h)::numeric, 1) AS mtbf_moyen,
          COUNT(*) FILTER (WHERE fa.mtbf_h < 715) AS nb_non_conformes
        FROM fact_arret fa
        JOIN dim_temps dt ON dt.temps_id = fa.temps_id
        WHERE dt.annee_mois = (SELECT MAX(annee_mois) FROM dim_temps)
      `);
      mtbfMoyen      = parseFloat(mtbfRes.rows[0]?.mtbf_moyen) || null;
      nbNonConformes = parseInt(mtbfRes.rows[0]?.nb_non_conformes) || 0;
    } catch (_) {}

    res.json({
      ot: {
        total:       totalOt,
        terminees:   otTerminees,
        cura:        parseInt(ot.ot_cura || 0),
        prev:        parseInt(ot.ot_prev || 0),
        taux_realisation: tauxReal,
      },
      mtbf: {
        moyen:          mtbfMoyen,
        nb_non_conformes: nbNonConformes,
      },
      energie: {
        kwh_total:  parseFloat(elec.kwh_total  || 0).toFixed(1),
        cout_total: parseFloat(elec.cout_total || 0).toFixed(3),
      },
      alertes: {
        nb_actives:  parseInt(alertes.nb_alertes || 0),
        nb_attente:  parseInt(staging.nb_attente || 0),
      },
      updated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Erreur getKpiResponsable:', err.message);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
};

// ── GET /api/kpi/technicien ───────────────────────────────
const getKpiTechnicien = async (req, res) => {
  try {
    const technicien = `${req.user.prenom || ''} ${req.user.nom || ''}`.trim();

    const [mesOtRes, planifieesRes, eauRes, elecRes] = await Promise.all([
      // Mes interventions du mois
      safe(db.query(`
        SELECT
          COUNT(*)                                               AS total,
          COUNT(*) FILTER (WHERE type_intervention = 'Curative')   AS cura,
          COUNT(*) FILTER (WHERE type_intervention = 'Preventive')  AS prev,
          COUNT(*) FILTER (WHERE statut = 'Terminee')              AS terminees
        FROM interventions
        WHERE date_intervention >= date_trunc('month', NOW())
          AND description ILIKE $1
      `, [`%${technicien}%`])),
      // Tâches préventives planifiées cette semaine
      safe(db.query(`
        SELECT id, date_intervention, description, statut
        FROM interventions
        WHERE type_intervention = 'Preventive'
          AND statut IN ('Planifiee', 'En cours')
          AND date_intervention BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'
        ORDER BY date_intervention ASC
        LIMIT 10
      `)),
      // Derniers relevés eau (7 jours)
      safe(db.query(`
        SELECT date_releve, compteur, consommation_jour
        FROM consommation_eau
        WHERE date_releve >= CURRENT_DATE - INTERVAL '7 days'
        ORDER BY date_releve DESC
        LIMIT 7
      `)),
      // Derniers relevés élec (7 jours)
      safe(db.query(`
        SELECT date_releve, consommation_jour, cout_total
        FROM consommation_electricite
        WHERE date_releve >= CURRENT_DATE - INTERVAL '7 days'
        ORDER BY date_releve DESC
        LIMIT 7
      `)),
    ]);

    res.json({
      mes_interventions: {
        total:     parseInt(mesOtRes?.rows?.[0]?.total     || 0),
        cura:      parseInt(mesOtRes?.rows?.[0]?.cura      || 0),
        prev:      parseInt(mesOtRes?.rows?.[0]?.prev      || 0),
        terminees: parseInt(mesOtRes?.rows?.[0]?.terminees || 0),
      },
      planifiees_semaine: planifieesRes?.rows || [],
      releves_eau:        eauRes?.rows        || [],
      releves_elec:       elecRes?.rows       || [],
      updated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Erreur getKpiTechnicien:', err.message);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
};

// ── GET /api/kpi/mes-taches-preventives ──────────────────
const getMesTachesPreventives = async (req, res) => {
  try {
    const technicien = `${req.user.prenom || ''} ${req.user.nom || ''}`.trim();

    const result = await db.query(`
      SELECT
        id,
        date_intervention,
        description,
        statut,
        technicien,
        cout,
        (date_intervention::date - CURRENT_DATE) AS jours_avant,
        (CURRENT_DATE - date_intervention::date) AS jours_depuis
      FROM interventions
      WHERE type_intervention = 'Preventive'
        AND technicien ILIKE $1
      ORDER BY date_intervention ASC
    `, [`%${technicien}%`]);

    res.json(result.rows);
  } catch (err) {
    console.error('Erreur getMesTachesPreventives:', err.message);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
};

module.exports = { getKpiResponsable, getKpiTechnicien, getMesTachesPreventives };

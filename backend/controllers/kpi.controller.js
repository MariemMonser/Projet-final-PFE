

const fs   = require('fs');
const path = require('path');
const db   = require('../config/db');
const dw   = require('../config/db_dw');
const { syncNow, getSyncState } = require('../services/dwSync.service');

const ML_DIR = path.join(__dirname, '../../DATA/ml_output');

const safe = (fn) => fn.catch((err) => { console.warn('[KPI] requête non-fatale échouée:', err.message); return null; });

const MTBF_SEUIL_H = parseInt(process.env.MTBF_SEUIL_H) || 715;

const getKpiResponsable = async (req, res) => {
  try {
    const [otRes, elecRes, alertesRes, stagingRes, eauRes, pvRes, alerteDetailsRes] = await Promise.all([
      
      safe(db.query(`
        SELECT
          COUNT(*)                                               AS total_ot,
          COUNT(*) FILTER (WHERE statut = 'Terminee')           AS ot_terminees,
          COUNT(*) FILTER (WHERE type_intervention = 'Curative') AS ot_cura,
          COUNT(*) FILTER (WHERE type_intervention = 'Preventive') AS ot_prev
        FROM interventions
        WHERE date_intervention >= date_trunc('month', NOW())
      `)),
      
      safe(db.query(`
        SELECT
          SUM(consommation_jour) AS kwh_total,
          SUM(cout_total)        AS cout_total
        FROM consommation_electricite
        WHERE date_releve >= date_trunc('month', NOW())
      `)),
      
      safe(db.query(`
        SELECT COUNT(*) AS nb_alertes
        FROM alertes
        WHERE email_envoye = false OR email_envoye IS NULL
      `)),
      
      safe(db.query(`
        SELECT COUNT(*) AS nb_attente
        FROM interventions_staging
        WHERE statut = 'En attente'
      `)),
      // Water consumption current month
      safe(db.query(`
        SELECT SUM(consommation_jour) AS m3_total, SUM(cout_total) AS cout_total
        FROM consommation_eau
        WHERE date_releve >= date_trunc('month', NOW())
      `)),
      // PV production current month
      safe(db.query(`
        SELECT SUM(production_journaliere_kwh) AS kwh_total
        FROM production_photovoltaique
        WHERE date >= date_trunc('month', NOW())
      `)),
      // Recent alerts detail (last 5)
      safe(db.query(`
        SELECT id, type_consommation, message, date_alerte, depassement, cout_estime
        FROM alertes
        WHERE date_alerte >= NOW() - INTERVAL '30 days'
        ORDER BY date_alerte DESC LIMIT 5
      `)),
    ]);

    const ot         = otRes?.rows?.[0]  || {};
    const elec       = elecRes?.rows?.[0] || {};
    const alertes    = alertesRes?.rows?.[0] || {};
    const staging    = stagingRes?.rows?.[0] || {};
    const eau        = eauRes?.rows?.[0] || {};
    const pv         = pvRes?.rows?.[0] || {};
    const alertesList = alerteDetailsRes?.rows || [];

    const totalOt    = parseInt(ot.total_ot || 0);
    const otTerminees = parseInt(ot.ot_terminees || 0);
    const tauxReal   = totalOt > 0 ? Math.round((otTerminees / totalOt) * 100) : 0;

    
    let mtbfMoyen = null;
    let nbNonConformes = 0;
    let dwDisponible = false;
    try {
      const mtbfRes = await dw.query(`
        SELECT
          ROUND(AVG(fa.mtbf_h)::numeric, 1) AS mtbf_moyen,
          COUNT(*) FILTER (WHERE fa.mtbf_h < ${MTBF_SEUIL_H}) AS nb_non_conformes
        FROM fact_arret fa
        JOIN dim_temps dt ON dt.temps_id = fa.temps_id
        WHERE dt.annee_mois = (SELECT MAX(annee_mois) FROM dim_temps)
      `);
      mtbfMoyen      = parseFloat(mtbfRes.rows[0]?.mtbf_moyen) || null;
      nbNonConformes = parseInt(mtbfRes.rows[0]?.nb_non_conformes) || 0;
      dwDisponible   = true;
    } catch (_) {}

    res.json({
      dw_disponible: dwDisponible,
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
      eau: {
        m3_total:   parseFloat(eau.m3_total   || 0).toFixed(1),
        cout_total: parseFloat(eau.cout_total || 0).toFixed(3),
      },
      pv: {
        kwh_total: parseFloat(pv.kwh_total || 0).toFixed(1),
      },
      alertes: {
        nb_actives:  parseInt(alertes.nb_alertes || 0),
        nb_attente:  parseInt(staging.nb_attente || 0),
        details:     alertesList,
      },
      updated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Erreur getKpiResponsable:', err.message);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
};

const getKpiTechnicien = async (req, res) => {
  try {
    const technicien = `${req.user.prenom || ''} ${req.user.nom || ''}`.trim();

    const [mesOtRes, planifieesRes, eauRes, elecRes] = await Promise.all([
      
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
      
      safe(db.query(`
        SELECT id, date_intervention, description, statut
        FROM interventions
        WHERE type_intervention = 'Preventive'
          AND statut IN ('Planifiee', 'En cours')
          AND date_intervention BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'
        ORDER BY date_intervention ASC
        LIMIT 10
      `)),
      
      safe(db.query(`
        SELECT date_releve, compteur, consommation_jour
        FROM consommation_eau
        WHERE date_releve >= CURRENT_DATE - INTERVAL '7 days'
        ORDER BY date_releve DESC
        LIMIT 7
      `)),
      
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


const triggerDwSync = async (req, res) => {
  const current = getSyncState();
  if (current.running) {
    return res.json({ message: 'Synchronisation déjà en cours…', running: true });
  }
  // Fire async — don't await so the HTTP response returns immediately
  syncNow().catch(err => console.error('[DW Sync] triggerDwSync error:', err.message));
  res.json({ message: 'Synchronisation lancée.', running: true });
};

const getDwSyncStatus = (req, res) => {
  const s = getSyncState();
  res.json({
    running:       s.running,
    lastAt:        s.lastAt,
    lastStatus:    s.lastStatus,
    lastError:     s.lastError,
    lastDuration:  s.lastDuration,
    stats:         s.stats,
  });
};

// ── Prévision charge technicien ───────────────────────────────────────────────
const getChargePrevision = (req, res) => {
  const filePath = path.join(ML_DIR, 'charge_prevision.json');
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ message: 'Prévision charge non disponible. Relancer le pipeline ETL.' });
  }
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    res.json(data);
  } catch (e) {
    res.status(500).json({ message: 'Fichier de prévision corrompu.' });
  }
};

// ── Prévision demande PRC ─────────────────────────────────────────────────────
const getPrcPrevision = (req, res) => {
  const filePath = path.join(ML_DIR, 'prc_commande.csv');
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ message: 'Prévision PRC non disponible. Relancer le pipeline ETL.' });
  }
  try {
    const csv     = fs.readFileSync(filePath, 'utf8').replace(/^﻿/, '');
    const lines   = csv.split('\n').filter(l => l.trim());
    if (lines.length < 2) return res.json({ mois_prevu: null, commandes: [] });
    const headers = lines[0].split(',').map(h => h.trim());
    const rows    = lines.slice(1).map(line => {
      const vals = line.split(',');
      const obj  = {};
      headers.forEach((h, i) => {
        const v = (vals[i] || '').trim();
        obj[h]  = v === 'TRUE' ? true : v === 'FALSE' ? false : isNaN(v) || v === '' ? v : Number(v);
      });
      return obj;
    });
    res.json({ mois_prevu: rows[0]?.mois_prevu || null, commandes: rows });
  } catch (e) {
    res.status(500).json({ message: 'Erreur lecture prévision PRC.' });
  }
};

module.exports = {
  getKpiResponsable, getKpiTechnicien, getMesTachesPreventives,
  triggerDwSync, getDwSyncStatus,
  getChargePrevision, getPrcPrevision,
};

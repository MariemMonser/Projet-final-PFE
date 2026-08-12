'use strict';

const db = require('../config/db');
const dw = require('../config/db_dw');

// ── State ──────────────────────────────────────────────────────────────────
const state = {
  running:      false,
  lastAt:       null,
  lastStatus:   null,   // 'ok' | 'error' | 'partial'
  lastError:    null,
  lastDuration: null,
  stats:        {},
};

// ── Helpers ────────────────────────────────────────────────────────────────
const MOIS_NOM = [
  '', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

function isoWeek(d) {
  const dt = new Date(d);
  dt.setHours(0, 0, 0, 0);
  dt.setDate(dt.getDate() + 3 - ((dt.getDay() + 6) % 7));
  const w1 = new Date(dt.getFullYear(), 0, 4);
  return 1 + Math.round(((dt - w1) / 864e5 - 3 + ((w1.getDay() + 6) % 7)) / 7);
}

function toAnneeMois(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function toDateStr(val) {
  if (!val) return null;
  return val instanceof Date
    ? val.toISOString().slice(0, 10)
    : String(val).slice(0, 10);
}

// Find existing dim_temps for a month, or create one
async function getOrCreateMonthDimTemps(client, annee_mois) {
  const found = await client.query(
    `SELECT temps_id FROM dim_temps WHERE annee_mois = $1 LIMIT 1`,
    [annee_mois]
  );
  if (found.rows.length) return found.rows[0].temps_id;

  const [yr, mo] = annee_mois.split('-');
  const moisNum  = parseInt(mo);
  const d        = new Date(`${yr}-${mo}-01`);
  const res      = await client.query(
    `INSERT INTO dim_temps (date_debut, annee, semestre, trimestre, mois_num, mois_nom, annee_mois)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING temps_id`,
    [d, parseInt(yr), moisNum <= 6 ? 1 : 2, Math.ceil(moisNum / 3),
     moisNum, MOIS_NOM[moisNum], annee_mois]
  );
  return res.rows[0].temps_id;
}

// Find existing dim_temps for a specific day, or create one
async function getOrCreateDayDimTemps(client, dateStr) {
  const d        = new Date(dateStr);
  const annee    = d.getFullYear();
  const moisNum  = d.getMonth() + 1;
  const jour     = d.getDate();
  const am       = toAnneeMois(d);

  const found = await client.query(
    `SELECT temps_id FROM dim_temps WHERE annee_mois = $1 AND jour = $2 LIMIT 1`,
    [am, jour]
  );
  if (found.rows.length) return found.rows[0].temps_id;

  const res = await client.query(
    `INSERT INTO dim_temps (date_debut, annee, semestre, trimestre, mois_num, mois_nom, semaine, jour, jour_semaine, annee_mois)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING temps_id`,
    [d, annee, moisNum <= 6 ? 1 : 2, Math.ceil(moisNum / 3),
     moisNum, MOIS_NOM[moisNum], isoWeek(d), jour, d.getDay() || 7, am]
  );
  return res.rows[0].temps_id;
}

// ── Sync: fact_ot_global ───────────────────────────────────────────────────
async function syncFactOtGlobal(client) {
  const res = await db.query(`
    SELECT
      TO_CHAR(date_intervention, 'YYYY-MM')                                   AS annee_mois,
      COUNT(*)                                                                  AS nb_total,
      COUNT(*) FILTER (WHERE LOWER(type_intervention) LIKE '%curati%')          AS nb_cura,
      COUNT(*) FILTER (WHERE LOWER(type_intervention) LIKE '%preventi%')        AS nb_prev,
      COUNT(*) FILTER (WHERE LOWER(type_intervention) NOT LIKE '%curati%'
                         AND  LOWER(type_intervention) NOT LIKE '%preventi%')   AS nb_autre,
      COUNT(*) FILTER (WHERE LOWER(statut) = 'terminee')                        AS nb_honore
    FROM interventions
    GROUP BY TO_CHAR(date_intervention, 'YYYY-MM')
    ORDER BY 1
  `);

  let count = 0;
  for (const row of res.rows) {
    const am       = row.annee_mois;
    const nbTotal  = parseInt(row.nb_total);
    const nbCura   = parseInt(row.nb_cura);
    const nbPrev   = parseInt(row.nb_prev);
    const nbAutre  = parseInt(row.nb_autre);
    const nbHonore = parseInt(row.nb_honore);
    const tauxReal = nbTotal > 0 ? parseFloat((nbHonore / nbTotal * 100).toFixed(2)) : 0;
    const ratioPrev = nbTotal > 0 ? parseFloat((nbPrev   / nbTotal * 100).toFixed(2)) : 0;

    // Check if fact row already exists for this month (via JOIN)
    const existing = await client.query(
      `SELECT fog.id FROM fact_ot_global fog
       JOIN dim_temps dt ON dt.temps_id = fog.temps_id
       WHERE dt.annee_mois = $1 LIMIT 1`,
      [am]
    );

    if (existing.rows.length) {
      await client.query(
        `UPDATE fact_ot_global SET
           nb_ot_total=$1, nb_ot_curatif=$2, nb_ot_preventif=$3, nb_ot_autre=$4,
           nb_ot_honore=$5, taux_realisation_pct=$6, ratio_preventif_pct=$7
         WHERE id=$8`,
        [nbTotal, nbCura, nbPrev, nbAutre, nbHonore, tauxReal, ratioPrev,
         existing.rows[0].id]
      );
    } else {
      const tempsId = await getOrCreateMonthDimTemps(client, am);
      await client.query(
        `INSERT INTO fact_ot_global
           (temps_id, nb_ot_total, nb_ot_curatif, nb_ot_preventif, nb_ot_autre,
            nb_ot_honore, taux_realisation_pct, ratio_preventif_pct)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (temps_id) DO UPDATE SET
           nb_ot_total          = EXCLUDED.nb_ot_total,
           nb_ot_curatif        = EXCLUDED.nb_ot_curatif,
           nb_ot_preventif      = EXCLUDED.nb_ot_preventif,
           nb_ot_autre          = EXCLUDED.nb_ot_autre,
           nb_ot_honore         = EXCLUDED.nb_ot_honore,
           taux_realisation_pct = EXCLUDED.taux_realisation_pct,
           ratio_preventif_pct  = EXCLUDED.ratio_preventif_pct`,
        [tempsId, nbTotal, nbCura, nbPrev, nbAutre, nbHonore, tauxReal, ratioPrev]
      );
    }
    count++;
  }
  return count;
}

// ── Sync: dim_prc ──────────────────────────────────────────────────────────
async function syncDimPrc(client) {
  const res = await db.query(
    `SELECT p.code_prc, p.designation, e.famille_equipement, p.cout, p.stock
     FROM prc p
     LEFT JOIN equipements e ON e.id = p.equipement_id`
  );
  let count = 0;
  for (const row of res.rows) {
    await client.query(
      `INSERT INTO dim_prc (code_prc, designation, famille_equipement, cout_unitaire_tnd, stock_actuel)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (code_prc) DO UPDATE SET
         designation        = EXCLUDED.designation,
         famille_equipement = EXCLUDED.famille_equipement,
         cout_unitaire_tnd  = EXCLUDED.cout_unitaire_tnd,
         stock_actuel       = EXCLUDED.stock_actuel`,
      [row.code_prc, row.designation || '', row.famille_equipement || '',
       parseFloat(row.cout || 0), parseInt(row.stock || 0)]
    );
    count++;
  }
  return count;
}

// ── Sync: fact_energie_elec ────────────────────────────────────────────────
async function syncFactEnergieElec(client) {
  const res = await db.query(
    `SELECT date_releve, consommation_jour, cout_total FROM consommation_electricite ORDER BY date_releve`
  );
  let count = 0;
  for (const row of res.rows) {
    const ds = toDateStr(row.date_releve);
    if (!ds) continue;
    const d  = new Date(ds);
    const am = toAnneeMois(d);

    const dimRes = await client.query(
      `INSERT INTO dim_electricite (date_releve, annee_mois, annee, mois_num, jour, semaine, jour_semaine)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (date_releve) DO UPDATE SET annee_mois = EXCLUDED.annee_mois
       RETURNING elec_id`,
      [ds, am, d.getFullYear(), d.getMonth() + 1, d.getDate(), isoWeek(d), d.getDay() || 7]
    );
    const elecId  = dimRes.rows[0].elec_id;
    const tempsId = await getOrCreateDayDimTemps(client, ds);

    await client.query(
      `INSERT INTO fact_energie_elec (elec_id, temps_id, conso_jour_kwh, cout_jour_tnd)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (elec_id) DO UPDATE SET
         temps_id       = EXCLUDED.temps_id,
         conso_jour_kwh = EXCLUDED.conso_jour_kwh,
         cout_jour_tnd  = EXCLUDED.cout_jour_tnd`,
      [elecId, tempsId, parseFloat(row.consommation_jour || 0), parseFloat(row.cout_total || 0)]
    );
    count++;
  }
  return count;
}

// ── Sync: fact_energie_eau ─────────────────────────────────────────────────
async function syncFactEnergieEau(client) {
  const res = await db.query(
    `SELECT date_releve, consommation_jour FROM consommation_eau ORDER BY date_releve`
  );
  let count = 0;
  for (const row of res.rows) {
    const ds = toDateStr(row.date_releve);
    if (!ds) continue;
    const d  = new Date(ds);
    const am = toAnneeMois(d);

    const dimRes = await client.query(
      `INSERT INTO dim_eau (date_releve, annee_mois, annee, mois_num, jour, semaine, jour_semaine)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (date_releve) DO UPDATE SET annee_mois = EXCLUDED.annee_mois
       RETURNING eau_id`,
      [ds, am, d.getFullYear(), d.getMonth() + 1, d.getDate(), isoWeek(d), d.getDay() || 7]
    );
    const eauId   = dimRes.rows[0].eau_id;
    const tempsId = await getOrCreateDayDimTemps(client, ds);

    // cout_jour_tnd is a generated column — omit from INSERT
    await client.query(
      `INSERT INTO fact_energie_eau (eau_id, temps_id, conso_jour_m3)
       VALUES ($1,$2,$3)
       ON CONFLICT (eau_id) DO UPDATE SET
         temps_id      = EXCLUDED.temps_id,
         conso_jour_m3 = EXCLUDED.conso_jour_m3`,
      [eauId, tempsId, parseFloat(row.consommation_jour || 0)]
    );
    count++;
  }
  return count;
}

// ── Sync: fact_energie_pv ──────────────────────────────────────────────────
async function syncFactEnergiePv(client) {
  const res = await db.query(
    `SELECT date, production_journaliere_kwh FROM production_photovoltaique ORDER BY date`
  );
  let count = 0;
  for (const row of res.rows) {
    const ds = toDateStr(row.date);
    if (!ds) continue;
    const d   = new Date(ds);
    const am  = toAnneeMois(d);
    const kwh = parseFloat(row.production_journaliere_kwh || 0);

    const dimRes = await client.query(
      `INSERT INTO dim_pv (date_jour, annee_mois, annee, mois_num, jour, semaine, jour_semaine)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (date_jour) DO UPDATE SET annee_mois = EXCLUDED.annee_mois
       RETURNING pv_id`,
      [ds, am, d.getFullYear(), d.getMonth() + 1, d.getDate(), isoWeek(d), d.getDay() || 7]
    );
    const pvId    = dimRes.rows[0].pv_id;
    const tempsId = await getOrCreateDayDimTemps(client, ds);

    // valeur_pv_tnd is a generated column — omit from INSERT
    await client.query(
      `INSERT INTO fact_energie_pv (pv_id, temps_id, production_kwh, heures_equiv_h)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (pv_id) DO UPDATE SET
         temps_id       = EXCLUDED.temps_id,
         production_kwh = EXCLUDED.production_kwh,
         heures_equiv_h = EXCLUDED.heures_equiv_h`,
      [pvId, tempsId, kwh, kwh > 0 ? parseFloat((kwh / 7).toFixed(3)) : 0]
    );
    count++;
  }
  return count;
}

// ── Main sync ──────────────────────────────────────────────────────────────
const syncNow = async () => {
  if (state.running) {
    console.log('[DW Sync] Déjà en cours — ignoré.');
    return { ignored: true };
  }
  state.running = true;
  const t0 = Date.now();
  console.log('[DW Sync] Démarrage synchronisation DB→DW...');

  const client = await dw.connect();
  const stats  = {};
  let hasError = false;

  try {
    await client.query('BEGIN');

    const tasks = [
      ['ot_global', () => syncFactOtGlobal(client)],
      ['dim_prc',   () => syncDimPrc(client)],
      ['elec',      () => syncFactEnergieElec(client)],
      ['eau',       () => syncFactEnergieEau(client)],
      ['pv',        () => syncFactEnergiePv(client)],
    ];

    for (const [name, fn] of tasks) {
      await client.query(`SAVEPOINT sp_${name}`);
      try {
        stats[name] = await fn();
        await client.query(`RELEASE SAVEPOINT sp_${name}`);
      } catch (err) {
        await client.query(`ROLLBACK TO SAVEPOINT sp_${name}`);
        stats[name] = 0;
        console.warn(`[DW Sync] ${name} erreur (ignorée): ${err.message}`);
        hasError = true;
      }
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    const duration = Date.now() - t0;
    state.lastAt       = new Date();
    state.lastStatus   = 'error';
    state.lastError    = err.message;
    state.lastDuration = duration;
    state.running      = false;
    console.error('[DW Sync] ❌ Erreur critique:', err.message);
    client.release();
    return { ok: false, error: err.message };
  }

  client.release();
  const duration = Date.now() - t0;
  state.lastAt       = new Date();
  state.lastStatus   = hasError ? 'partial' : 'ok';
  state.lastError    = null;
  state.lastDuration = duration;
  state.stats        = stats;
  state.running      = false;

  console.log(
    `[DW Sync] ${hasError ? '⚠️ Partiel' : '✅ Terminé'} en ${duration}ms — ` +
    `OT:${stats.ot_global} PRC:${stats.dim_prc} Élec:${stats.elec} Eau:${stats.eau} PV:${stats.pv}`
  );
  return { ok: true, duration, stats };
};

// ── Scheduler: nightly at 02:00 ───────────────────────────────────────────
const demarrerDwSync = () => {
  const now    = new Date();
  const next   = new Date(now);
  next.setHours(2, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  const ms = next - now;

  console.log(
    `[DW Sync] Prochaine sync automatique : ${next.toLocaleString('fr-FR')} ` +
    `(dans ${Math.round(ms / 60000)} min)`
  );

  setTimeout(() => {
    syncNow();
    setInterval(syncNow, 24 * 60 * 60 * 1000);
  }, ms);
};

const getSyncState = () => ({ ...state });

module.exports = { syncNow, demarrerDwSync, getSyncState };

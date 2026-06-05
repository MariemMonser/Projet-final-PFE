// ============================================================
// MONITORING CONTROLLER
// Water, Electricity, Photovoltaic, and Interventions monitoring
// ============================================================
const db     = require('../config/db');
const QRCode = require('qrcode');
const bcrypt = require('bcryptjs');
const os     = require('os');

const getLocalIp = () => {
  const interfaces = os.networkInterfaces();

  // Mots-clés des adaptateurs virtuels à ignorer (VirtualBox, VMware, etc.)
  const virtualKeywords = ['virtualbox', 'vmware', 'vethernet', 'loopback', 'pseudo', 'virtual', 'vbox'];

  // 1er passage : chercher Wi-Fi ou Ethernet réel en priorité
  for (const name of Object.keys(interfaces)) {
    const lowerName = name.toLowerCase();
    const isVirtual = virtualKeywords.some(k => lowerName.includes(k));
    if (isVirtual) continue;

    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        // Exclure aussi les plages VirtualBox (192.168.56.x) et VMware (192.168.VMnet)
        if (iface.address.startsWith('192.168.56.')) continue;
        return iface.address;
      }
    }
  }

  // 2e passage : fallback — n'importe quelle IPv4 non-interne hors 192.168.56.x
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal && !iface.address.startsWith('192.168.56.')) {
        return iface.address;
      }
    }
  }

  return 'localhost';
};

// ── Helper : enregistrer dans audit_log ──────────────────
const logAction = async (idUser, action, tableCible = null, ip = null) => {
  try {
    await db.query(
      'INSERT INTO audit_log (id_user, action, table_cible, ip_address) VALUES ($1, $2, $3, $4)',
      [idUser, action, tableCible, ip]
    );
  } catch (err) {
    console.error('Erreur audit_log:', err.message);
  }
};

// ── Water Consumption ─────────────────────────────────────
const getWaterConsumption = async (req, res) => {
  try {
    const { debut, fin } = req.query;
    const params = [];
    let where = '';
    if (debut) { params.push(debut + '-01'); where += ` AND date_releve >= $${params.length}`; }
    if (fin)   { params.push(fin   + '-01'); where += ` AND date_releve <  ($${params.length}::date + INTERVAL '1 month')`; }

    const data = await db.query(`
      SELECT
        id, date_releve, compteur, consommation_jour, cout_total,
        CASE
          WHEN LAG(compteur, 1, compteur) OVER (ORDER BY date_releve) = compteur THEN 0
          ELSE compteur - LAG(compteur, 1, compteur) OVER (ORDER BY date_releve)
        END as consommation_journaliere
      FROM consommation_eau
      WHERE 1=1 ${where}
      ORDER BY date_releve DESC
    `, params);
    res.json(data.rows);
  } catch (err) {
    console.error('Erreur getWaterConsumption:', err);
    if (err.message.includes('does not exist') || err.code === '42P01') return res.json([]);
    res.status(500).json({ message: 'Erreur serveur: ' + err.message });
  }
};

const getWaterConsumptionStats = async (req, res) => {
  try {
    const stats = await db.query(`
      SELECT 
        COUNT(*) as total_readings,
        MIN(date_releve) as first_reading,
        MAX(date_releve) as last_reading,
        COALESCE(MAX(compteur) - MIN(compteur), 0) as total_consumption
      FROM consommation_eau
    `);
    const result = stats.rows[0];
    // Convert string values to numbers
    res.json({
      total_readings: parseInt(result.total_readings),
      first_reading: result.first_reading,
      last_reading: result.last_reading,
      total_consumption: parseFloat(result.total_consumption)
    });
  } catch (err) {
    console.error('Erreur getWaterConsumptionStats:', err);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
};

// ── Electricity Consumption ───────────────────────────────
const getElectricityConsumption = async (req, res) => {
  try {
    const { debut, fin } = req.query;
    const params = [];
    let where = '';
    if (debut) { params.push(debut + '-01'); where += ` AND date_releve >= $${params.length}`; }
    if (fin)   { params.push(fin   + '-01'); where += ` AND date_releve <  ($${params.length}::date + INTERVAL '1 month')`; }

    const data = await db.query(`
      SELECT id, date_releve, phase1, phase2, phase3, consommation_jour, cout_total
      FROM consommation_electricite
      WHERE 1=1 ${where}
      ORDER BY date_releve DESC
    `, params);
    res.json(data.rows);
  } catch (err) {
    console.error('Erreur getElectricityConsumption:', err);
    if (err.message.includes('does not exist') || err.code === '42P01') return res.json([]);
    res.status(500).json({ message: 'Erreur serveur: ' + err.message });
  }
};

const getElectricityConsumptionStats = async (req, res) => {
  try {
    const stats = await db.query(`
      SELECT
        COUNT(*) as total_readings,
        MIN(date_releve) as first_reading,
        MAX(date_releve) as last_reading,
        AVG(consommation_jour) FILTER (WHERE consommation_jour IS NOT NULL AND consommation_jour > 0) as avg_consumption
      FROM consommation_electricite
    `);

    const result = stats.rows[0];
    res.json({
      total_readings: parseInt(result.total_readings),
      first_reading: result.first_reading,
      last_reading: result.last_reading,
      avg_consumption: parseFloat(result.avg_consumption) || 0
    });
  } catch (err) {
    console.error('Erreur getElectricityConsumptionStats:', err);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
};

// ── Photovoltaic Production ───────────────────────────────
const getPhotovoltaicProduction = async (req, res) => {
  try {
    const data = await db.query(`
      SELECT id, date, mois, puissance_installee_kwp,
             production_journaliere_kwh, production_cumulee_kwh, heures_equivalentes_h
      FROM production_photovoltaique
      ORDER BY date DESC
    `);
    res.json(data.rows.map(row => ({
      id: row.id,
      date: row.date,
      mois: row.mois,
      puissance_installee_kwp:    row.puissance_installee_kwp    != null ? parseFloat(row.puissance_installee_kwp)    : null,
      production_journaliere_kwh: row.production_journaliere_kwh != null ? parseFloat(row.production_journaliere_kwh) : null,
      production_cumulee_kwh:     row.production_cumulee_kwh     != null ? parseFloat(row.production_cumulee_kwh)     : null,
      heures_equivalentes_h:      row.heures_equivalentes_h      != null ? parseFloat(row.heures_equivalentes_h)      : null,
    })));
  } catch (err) {
    console.error('Erreur getPhotovoltaicProduction:', err);
    if (err.code === '42P01') return res.json([]);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
};

const getPhotovoltaicProductionStats = async (req, res) => {
  const empty = { total_records:0, installed_power:'0.0', total_production:'0.0',
                  avg_production:'0.0', max_production:'0.0', min_production:'0.0', efficiency:'0.00' };
  try {
    const stats = await db.query(`
      SELECT COUNT(*)                              AS total_records,
             AVG(puissance_installee_kwp)          AS installed_power,
             SUM(production_journaliere_kwh)        AS total_production,
             AVG(production_journaliere_kwh)        AS avg_production,
             MAX(production_journaliere_kwh)        AS max_production,
             MIN(production_journaliere_kwh)        AS min_production
      FROM production_photovoltaique
    `);
    const r = stats.rows[0];
    if (!r || parseInt(r.total_records) === 0) return res.json(empty);

    const totalProd = parseFloat(r.total_production) || 0;
    const installed = parseFloat(r.installed_power)  || 0;
    const efficiency = installed > 0 ? ((totalProd / (installed * 365 * 5)) * 100).toFixed(2) : '0.00';

    res.json({
      total_records:    parseInt(r.total_records),
      installed_power:  installed.toFixed(1),
      total_production: totalProd.toFixed(1),
      avg_production:   (parseFloat(r.avg_production) || 0).toFixed(1),
      max_production:   (parseFloat(r.max_production) || 0).toFixed(1),
      min_production:   (parseFloat(r.min_production) || 0).toFixed(1),
      efficiency,
    });
  } catch (err) {
    console.error('Erreur getPhotovoltaicProductionStats:', err);
    res.json(empty);
  }
};

// ── Interventions ─────────────────────────────────────────
const getInterventions = async (req, res) => {
  try {
    const data = await db.query(`
      SELECT id, date_intervention, type_intervention, description, 
      technicien, statut, cout
      FROM interventions 
      ORDER BY date_intervention DESC
    `);
    res.json(data.rows);
  } catch (err) {
    console.error('Erreur getInterventions:', err);
    
    // Check if table doesn't exist
    if (err.message.includes('does not exist') || err.message.includes('relation') || err.code === '42P01') {
      console.log('interventions table does not exist');
      return res.json([]);
    }
    
    res.status(500).json({ message: 'Erreur serveur: ' + err.message });
  }
};

const getInterventionsStats = async (req, res) => {
  try {
    const stats = await db.query(`
      SELECT 
        COUNT(*) as total_interventions,
        COUNT(DISTINCT type_intervention) as unique_pannes,
        COALESCE(SUM(cout), 0) as total_quantity
      FROM interventions
    `);
    const result = stats.rows[0];
    res.json({
      total_interventions: parseInt(result.total_interventions),
      unique_pannes: parseInt(result.unique_pannes),
      total_quantity: parseFloat(result.total_quantity)
    });
  } catch (err) {
    console.error('Erreur getInterventionsStats:', err);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
};

// ── CRUD Operations for Water Consumption ─────────────────────
const addWaterConsumption = async (req, res) => {
  try {
    const { date_releve, compteur } = req.body;

    if (!date_releve || compteur === undefined || compteur === null) {
      return res.status(400).json({ message: 'Date et compteur sont requis.' });
    }

    const compteurVal = parseFloat(compteur);

    // Calcul consommation_jour = compteur actuel - dernier compteur
    const prevRes = await db.query(
      'SELECT compteur FROM consommation_eau WHERE date_releve < $1 ORDER BY date_releve DESC LIMIT 1',
      [date_releve]
    );
    const prevCompteur = prevRes.rows.length > 0 ? parseFloat(prevRes.rows[0].compteur) : compteurVal;
    const consommation_jour = parseFloat(Math.max(0, compteurVal - prevCompteur).toFixed(3));

    // Prix unitaire depuis seuils_consommation
    const seuilRes = await db.query(
      'SELECT prix_unitaire FROM seuils_consommation WHERE type_consommation = $1', ['eau']
    ).catch(() => ({ rows: [] }));
    const prix = seuilRes.rows.length > 0 ? parseFloat(seuilRes.rows[0].prix_unitaire) : 0.200;
    const cout_total = parseFloat((consommation_jour * prix).toFixed(3));

    const result = await db.query(
      'INSERT INTO consommation_eau (date_releve, compteur, consommation_jour, cout_total) VALUES ($1,$2,$3,$4) RETURNING *',
      [date_releve, compteurVal, consommation_jour, cout_total]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Erreur addWaterConsumption:', err);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
};

const updateWaterConsumption = async (req, res) => {
  try {
    const { id } = req.params;
    const { date_releve, compteur } = req.body;
    
    const result = await db.query(
      'UPDATE consommation_eau SET date_releve = $1, compteur = $2 WHERE id = $3 RETURNING *',
      [date_releve, parseFloat(compteur), id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Enregistrement non trouvé.' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Erreur updateWaterConsumption:', err);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
};

const deleteWaterConsumption = async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await db.query('DELETE FROM consommation_eau WHERE id = $1 RETURNING *', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Enregistrement non trouvé.' });
    }
    
    res.json({ message: 'Enregistrement supprimé avec succès.' });
  } catch (err) {
    console.error('Erreur deleteWaterConsumption:', err);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
};

// ── Recalculer consommation_jour et cout_total pour les relevés eau ──
const recalculerEau = async (req, res) => {
  try {
    const seuilRes = await db.query(
      'SELECT prix_unitaire FROM seuils_consommation WHERE type_consommation = $1', ['eau']
    ).catch(() => ({ rows: [] }));
    const prix = seuilRes.rows.length > 0 ? parseFloat(seuilRes.rows[0].prix_unitaire) : 0.200;

    const rows = await db.query(
      'SELECT id, date_releve, compteur FROM consommation_eau ORDER BY date_releve ASC'
    );

    let updated = 0;
    for (let i = 0; i < rows.rows.length; i++) {
      const curr = rows.rows[i];
      const prev = i > 0 ? rows.rows[i - 1] : null;
      const conso = prev ? Math.max(0, parseFloat(curr.compteur) - parseFloat(prev.compteur)) : 0;
      const cout  = parseFloat((conso * prix).toFixed(3));
      await db.query(
        'UPDATE consommation_eau SET consommation_jour = $1, cout_total = $2 WHERE id = $3',
        [parseFloat(conso.toFixed(3)), cout, curr.id]
      );
      updated++;
    }
    res.json({ message: `${updated} relevés eau recalculés.` });
  } catch (err) {
    console.error('Erreur recalculerEau:', err);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
};

// ── CRUD Operations for Electricity Consumption ───────────────────
const addElectricityConsumption = async (req, res) => {
  try {
    const { date_releve, phase1, phase2, phase3 } = req.body;

    if (!date_releve || phase1 === undefined || phase2 === undefined || phase3 === undefined) {
      return res.status(400).json({ message: 'Date et toutes les phases sont requises.' });
    }

    const p1 = parseFloat(phase1), p2 = parseFloat(phase2), p3 = parseFloat(phase3);
    const consommation_jour = parseFloat((p1 + p2 + p3).toFixed(3));

    // Prix unitaire depuis seuils_consommation
    const seuilRes = await db.query(
      'SELECT prix_unitaire FROM seuils_consommation WHERE type_consommation = $1', ['electricite']
    ).catch(() => ({ rows: [] }));
    const prix = seuilRes.rows.length > 0 ? parseFloat(seuilRes.rows[0].prix_unitaire) : 0.700;
    const cout_total = parseFloat((consommation_jour * prix).toFixed(3));

    const result = await db.query(
      'INSERT INTO consommation_electricite (date_releve, phase1, phase2, phase3, consommation_jour, cout_total) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [date_releve, p1, p2, p3, consommation_jour, cout_total]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Erreur addElectricityConsumption:', err);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
};

const updateElectricityConsumption = async (req, res) => {
  try {
    const { id } = req.params;
    const { date_releve, phase1, phase2, phase3 } = req.body;
    
    const result = await db.query(
      'UPDATE consommation_electricite SET date_releve = $1, phase1 = $2, phase2 = $3, phase3 = $4 WHERE id = $5 RETURNING *',
      [date_releve, parseFloat(phase1), parseFloat(phase2), parseFloat(phase3), id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Enregistrement non trouvé.' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Erreur updateElectricityConsumption:', err);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
};

const deleteElectricityConsumption = async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await db.query('DELETE FROM consommation_electricite WHERE id = $1 RETURNING *', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Enregistrement non trouvé.' });
    }
    
    res.json({ message: 'Enregistrement supprimé avec succès.' });
  } catch (err) {
    console.error('Erreur deleteElectricityConsumption:', err);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
};

// ── CRUD Operations for Photovoltaic Production ────────────────────
const addPhotovoltaicProduction = async (req, res) => {
  try {
    const { date, production_journaliere_kwh, puissance_installee_kwp, heures_equivalentes_h, production_cumulee_kwh } = req.body;

    if (!date || production_journaliere_kwh === undefined || puissance_installee_kwp === undefined) {
      return res.status(400).json({ message: 'Date, production et puissance installée sont requises.' });
    }

    const mois = (new Date(date).getMonth() + 1).toString();
    const prodKwh    = parseFloat(production_journaliere_kwh);
    const puissKwp   = parseFloat(puissance_installee_kwp);
    const heuresEquiv = heures_equivalentes_h ? parseFloat(heures_equivalentes_h) : null;
    const prodCumulee = production_cumulee_kwh ? parseFloat(production_cumulee_kwh) : null;

    const result = await db.query(
      `INSERT INTO production_photovoltaique
         (date, mois, production_journaliere_kwh, puissance_installee_kwp, heures_equivalentes_h, production_cumulee_kwh)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [date, mois, prodKwh, puissKwp, heuresEquiv, prodCumulee]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Erreur addPhotovoltaicProduction:', err);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
};

const updatePhotovoltaicProduction = async (req, res) => {
  try {
    const { id } = req.params;
    const { date, production_journaliere_kwh, puissance_installee_kwp } = req.body;
    
    const result = await db.query(
      'UPDATE production_photovoltaique SET date = $1, production_journaliere_kwh = $2, puissance_installee_kwp = $3 WHERE id = $4 RETURNING *',
      [date, parseFloat(production_journaliere_kwh), parseFloat(puissance_installee_kwp), id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Enregistrement non trouvé.' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Erreur updatePhotovoltaicProduction:', err);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
};

const deletePhotovoltaicProduction = async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await db.query('DELETE FROM production_photovoltaique WHERE id = $1 RETURNING *', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Enregistrement non trouvé.' });
    }
    
    res.json({ message: 'Enregistrement supprimé avec succès.' });
  } catch (err) {
    console.error('Erreur deletePhotovoltaicProduction:', err);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
};

// ── CRUD Operations for Interventions ─────────────────────────────
const addIntervention = async (req, res) => {
  try {
    const { date_intervention, type_intervention, description, technicien, statut, cout } = req.body;
    
    if (!date_intervention || !type_intervention || !technicien || !statut) {
      return res.status(400).json({ message: 'Date, type, technicien et statut sont requis.' });
    }
    
    const result = await db.query(
      'INSERT INTO interventions (date_intervention, type_intervention, description, technicien, statut, cout) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [date_intervention, type_intervention, description, technicien, statut, parseFloat(cout || 0)]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Erreur addIntervention:', err);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
};

const updateIntervention = async (req, res) => {
  try {
    const { id } = req.params;
    const { date_intervention, type_intervention, description, technicien, statut, cout } = req.body;
    
    const result = await db.query(
      'UPDATE interventions SET date_intervention = $1, type_intervention = $2, description = $3, technicien = $4, statut = $5, cout = $6 WHERE id = $7 RETURNING *',
      [date_intervention, type_intervention, description, technicien, statut, parseFloat(cout || 0), id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Enregistrement non trouvé.' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Erreur updateIntervention:', err);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
};

const deleteIntervention = async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await db.query('DELETE FROM interventions WHERE id = $1 RETURNING *', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Enregistrement non trouvé.' });
    }
    
    res.json({ message: 'Enregistrement supprimé avec succès.' });
  } catch (err) {
    console.error('Erreur deleteIntervention:', err);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
};

// ── Verification credentials technicien (public, sans JWT) ────────
const verifierTechnicienPublic = async (req, res) => {
  const { email, mot_de_passe } = req.body;
  if (!email || !mot_de_passe) {
    return res.status(400).json({ message: 'Email et mot de passe requis.' });
  }
  try {
    const result = await db.query(
      `SELECT id, prenom, nom, role, mot_de_passe, est_actif
       FROM utilisateurs WHERE email = $1`,
      [email.toLowerCase().trim()]
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ message: 'Email ou mot de passe incorrect.' });
    }
    const user = result.rows[0];
    if (!user.est_actif) {
      return res.status(401).json({ message: 'Compte desactive. Contactez l\'administrateur.' });
    }
    if (!['Technicien', 'Responsable'].includes(user.role)) {
      return res.status(403).json({ message: 'Acces reserve aux techniciens et responsables.' });
    }
    const valide = await bcrypt.compare(mot_de_passe, user.mot_de_passe);
    if (!valide) {
      return res.status(401).json({ message: 'Email ou mot de passe incorrect.' });
    }
    res.json({ prenom: user.prenom, nom: user.nom, role: user.role });
  } catch (err) {
    console.error('Erreur verifierTechnicienPublic:', err);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
};

// ── Interventions planifiées pour un équipement (scan QR) ─────────
// SQL MIGRATION requise (une seule fois) :
// ALTER TABLE interventions_staging ADD COLUMN IF NOT EXISTS intervention_id INTEGER REFERENCES interventions(id) ON DELETE SET NULL;
const getInterventionsPlanifieesParEquipement = async (req, res) => {
  const { equipementId } = req.params;
  try {
    const equip = await db.query('SELECT id, nom FROM equipements WHERE id = $1', [equipementId]);
    if (equip.rows.length === 0) return res.json({ equipement: null, interventions: [] });
    const { id: equipId, nom } = equip.rows[0];
    const rows = await db.query(
      `SELECT * FROM interventions
       WHERE statut IN ('Planifiee', 'En cours')
         AND type_intervention = 'Preventive'
         AND description LIKE $1
       ORDER BY date_intervention ASC`,
      [`%Equipement: ${nom}%`]
    );
    res.json({ equipement: { id: equipId, nom }, interventions: rows.rows });
  } catch (err) {
    console.error('Erreur getInterventionsPlanifieesParEquipement:', err);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
};

// ── CRUD Operations for Interventions Staging ─────────────────────
const addInterventionStaging = async (req, res) => {
  try {
    const { date_intervention, heure, action, type_intervention, description, technicien, equipement, intervention_id, sous_equipement } = req.body;

    if (!date_intervention || !type_intervention || !technicien) {
      return res.status(400).json({ message: 'Date, type et technicien sont requis.' });
    }

    const result = await db.query(
      `INSERT INTO interventions_staging
         (date_intervention, heure, action, type_intervention, description, technicien, equipement, intervention_id, sous_equipement)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [date_intervention, heure || null, action || 'Ouverture', type_intervention, description || '', technicien, equipement || null, intervention_id || null, sous_equipement || null]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Erreur addInterventionStaging:', err);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
};

const getInterventionsStaging = async (req, res) => {
  try {
    const rows = await db.query(
      `SELECT * FROM interventions_staging ORDER BY created_at DESC`
    );
    res.json(rows.rows);
  } catch (err) {
    console.error('Erreur getInterventionsStaging:', err);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
};

const validerInterventionStaging = async (req, res) => {
  const { id } = req.params;
  try {
    const staging = await db.query('SELECT * FROM interventions_staging WHERE id = $1', [id]);
    if (staging.rows.length === 0) {
      return res.status(404).json({ message: 'Intervention introuvable.' });
    }

    const s = staging.rows[0];

    // Déterminer le statut final : clôturée si date_cloture renseignée
    const estClotureee = !!s.date_cloture;

    if (s.intervention_id) {
      // Workflow planifié : mettre à jour le statut de l'intervention parente
      const nouveauStatut = estClotureee ? 'Terminee' : 'En cours';
      await db.query('UPDATE interventions SET statut = $1 WHERE id = $2', [nouveauStatut, s.intervention_id]);
    } else {
      // Curatif / libre : créer une entrée dans interventions
      const descParts = [
        s.heure            ? `Heure: ${s.heure}`                       : null,
        s.equipement       ? `Equipement: ${s.equipement}`             : null,
        s.sous_equipement  ? `Sous-equipement: ${s.sous_equipement}`   : null,
        `Technicien: ${s.technicien}`,
        s.description ? `Observations: ${s.description}` : null,
        estClotureee && s.heure_cloture ? `Cloture: ${s.heure_cloture}` : null,
        s.description_cloture ? `Travaux: ${s.description_cloture}` : null,
      ].filter(Boolean);

      await db.query(
        `INSERT INTO interventions (date_intervention, type_intervention, description, technicien, statut, cout)
         VALUES ($1, $2, $3, $4, $5, 0)`,
        [s.date_intervention, s.type_intervention, descParts.join(' | '), s.technicien,
         estClotureee ? 'Terminee' : 'En cours']
      );
    }

    await db.query('UPDATE interventions_staging SET statut = $1 WHERE id = $2', ['Validee', id]);
    res.json({ message: 'Intervention validee.' });
  } catch (err) {
    console.error('Erreur validerInterventionStaging:', err);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
};

const rejeterInterventionStaging = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await db.query(
      'UPDATE interventions_staging SET statut = $1 WHERE id = $2 RETURNING *',
      ['Rejetee', id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Intervention introuvable.' });
    }
    res.json({ message: 'Intervention rejetee.' });
  } catch (err) {
    console.error('Erreur rejeterInterventionStaging:', err);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
};

// ── GET open staging records for a technician (public — used from scan QR page) ──
const getMesOuvertesStaging = async (req, res) => {
  const { technicien, equipement } = req.query;
  if (!technicien) return res.status(400).json({ message: 'Technicien requis.' });
  try {
    let query = `SELECT * FROM interventions_staging
                 WHERE action = 'Ouverture'
                   AND date_cloture IS NULL
                   AND statut = 'En attente'
                   AND LOWER(technicien) = LOWER($1)`;
    const params = [technicien];
    if (equipement) {
      query += ` AND LOWER(equipement) = LOWER($2)`;
      params.push(equipement);
    }
    query += ` ORDER BY created_at DESC`;
    const rows = await db.query(query, params);
    res.json(rows.rows);
  } catch (err) {
    console.error('Erreur getMesOuvertesStaging:', err);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
};

// ── PUT close an open staging record (public — used from scan QR page) ──
const cloturerInterventionStaging = async (req, res) => {
  const { id } = req.params;
  const { date_cloture, heure_cloture, description_cloture } = req.body;
  if (!date_cloture || !heure_cloture) {
    return res.status(400).json({ message: 'Date et heure de clôture sont requises.' });
  }
  try {
    const result = await db.query(
      `UPDATE interventions_staging
       SET date_cloture = $1, heure_cloture = $2, description_cloture = $3
       WHERE id = $4 AND action = 'Ouverture' AND date_cloture IS NULL
       RETURNING *`,
      [date_cloture, heure_cloture, description_cloture || null, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Intervention ouverte introuvable (déjà clôturée ?).' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Erreur cloturerInterventionStaging:', err);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
};

const getPersonnelPublic = async (req, res) => {
  try {
    const rows = await db.query(
      `SELECT id, prenom, nom, role
       FROM utilisateurs
       WHERE role IN ('Technicien', 'Responsable') AND est_actif = true
       ORDER BY role DESC, prenom, nom`
    );
    res.json(rows.rows);
  } catch (err) {
    console.error('Erreur getPersonnelPublic:', err);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
};

const supprimerInterventionStaging = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await db.query('DELETE FROM interventions_staging WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) return res.status(404).json({ message: 'Introuvable.' });
    res.json({ message: 'Supprimé.' });
  } catch (err) {
    console.error('Erreur supprimerInterventionStaging:', err);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
};

const getEnergieQr = async (req, res) => {
  const { type, baseUrl } = req.query;
  if (!type || !['eau', 'electricite'].includes(type)) {
    return res.status(400).json({ message: "type doit être 'eau' ou 'electricite'." });
  }
  try {
    let appUrl = baseUrl || process.env.APP_URL || req.get('origin') || 'http://localhost:3000';
    if (appUrl.includes('localhost') || appUrl.includes('127.0.0.1')) {
      const localIp = getLocalIp();
      appUrl = appUrl.replace('localhost', localIp).replace('127.0.0.1', localIp);
    }
    const url = `${appUrl.replace(/\/$/, '')}/scan/${type}`;
    const label = type === 'eau' ? 'Relevé Eau' : 'Relevé Électricité';
    const qrCode = await QRCode.toDataURL(url, {
      width: 320,
      margin: 2,
      color: { dark: '#0f172a', light: '#ffffff' },
    });
    res.json({ url, qrCode, label, type });
  } catch (err) {
    res.status(500).json({ message: 'Erreur génération QR énergie.' });
  }
};

const getInterventionFormQr = async (req, res) => {
  const { baseUrl } = req.query;
  try {
    let appUrl = baseUrl || process.env.APP_URL || req.get('origin') || 'http://localhost:3000';
    if (appUrl.includes('localhost') || appUrl.includes('127.0.0.1')) {
      const localIp = getLocalIp();
      appUrl = appUrl.replace('localhost', localIp).replace('127.0.0.1', localIp);
    }
    const url = `${appUrl.replace(/\/$/, '')}/intervention/nouveau`;
    const qrCode = await QRCode.toDataURL(url, {
      width: 320,
      margin: 2,
      color: { dark: '#0f172a', light: '#ffffff' },
    });
    res.json({ url, qrCode });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur.' });
  }
};

module.exports = {
  // Water
  getWaterConsumption,
  getWaterConsumptionStats,
  addWaterConsumption,
  updateWaterConsumption,
  deleteWaterConsumption,
  recalculerEau,
  
  // Electricity
  getElectricityConsumption,
  getElectricityConsumptionStats,
  addElectricityConsumption,
  updateElectricityConsumption,
  deleteElectricityConsumption,
  
  // Photovoltaic
  getPhotovoltaicProduction,
  getPhotovoltaicProductionStats,
  addPhotovoltaicProduction,
  updatePhotovoltaicProduction,
  deletePhotovoltaicProduction,
  
  // Interventions
  getInterventions,
  getInterventionsStats,
  addIntervention,
  updateIntervention,
  deleteIntervention,
  getEnergieQr,
  getInterventionFormQr,
  // Staging
  verifierTechnicienPublic,
  addInterventionStaging,
  getInterventionsStaging,
  validerInterventionStaging,
  rejeterInterventionStaging,
  supprimerInterventionStaging,
  getMesOuvertesStaging,
  cloturerInterventionStaging,
  getPersonnelPublic,
  getInterventionsPlanifieesParEquipement,
};

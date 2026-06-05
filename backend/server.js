// ============================================================
// SERVEUR PRINCIPAL - ELEONETECH
// Node.js + Express + PostgreSQL
// ============================================================
require('dotenv').config({ path: __dirname + '/.env' });

const express = require('express');
const cors    = require('cors');
const db      = require('./config/db');

// Verify env loaded
console.log('EMAIL_USER loaded:', process.env.EMAIL_USER ? '✅' : '❌ MISSING');
console.log('EMAIL_PASS loaded:', process.env.EMAIL_PASS ? '✅' : '❌ MISSING');

// Fallback JWT_SECRET if .env is not loaded
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'eleonetech_jwt_secret_key_2026';
  console.log('⚠️  JWT_SECRET set to fallback value');
}

const authRoutes           = require('./routes/auth.routes');
const usersRoutes          = require('./routes/users.routes');
const equipementRoutes     = require('./routes/equipement.routes');
const sousEquipRoutes      = require('./routes/sous_equip.routes');
const monitoringRoutes     = require('./routes/monitoring.routes');
const seuilsRoutes           = require('./routes/seuils.routes');
const verificationsRoutes    = require('./routes/verifications.routes');
const kpiRoutes              = require('./routes/kpi.routes');
const prcRoutes              = require('./routes/prc.routes');
const { demarrerRappelsInterventions } = require('./services/interventionReminder.service');

const app  = express();
const PORT = process.env.PORT || 5000;

// ── Middlewares ───────────────────────────────────────────
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'cf-connecting-ip'],
}));

app.use(express.json());

// ── Routes API ────────────────────────────────────────────
app.use('/api/auth',         authRoutes);
app.use('/api/users',        usersRoutes);
app.use('/api/equipements',  equipementRoutes);
app.use('/api/sous-equip',   sousEquipRoutes);
app.use('/api/monitoring',   monitoringRoutes);
app.use('/api/seuils',         seuilsRoutes);
app.use('/api/verifications',  verificationsRoutes);
app.use('/api/kpi',            kpiRoutes);
app.use('/api/prc',            prcRoutes);

// ── Health check ──────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', app: 'ELEONETECH API', time: new Date().toISOString() });
});

// ── 404 ───────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ message: 'Route non trouvee.' });
});

// ── Demarrage ─────────────────────────────────────────────
app.listen(PORT, async () => {
  console.log(`🚀 Serveur demarre sur http://localhost:${PORT}`);
  demarrerRappelsInterventions();

  try {
    await db.query('SELECT 1');
    console.log('✅ PostgreSQL connecte - Base: eleonetech_db');

    // Creer la table interventions si elle n'existe pas
    await db.query(`
      CREATE TABLE IF NOT EXISTS interventions (
        id SERIAL PRIMARY KEY,
        date_intervention DATE NOT NULL,
        type_intervention VARCHAR(100) NOT NULL,
        description TEXT,
        technicien VARCHAR(100) NOT NULL,
        statut VARCHAR(50) NOT NULL DEFAULT 'Planifiee',
        cout DECIMAL(10,2) DEFAULT 0
      )
    `);
    console.log('✅ Table interventions prete');

    // Creer la table staging si elle n'existe pas
    await db.query(`
      CREATE TABLE IF NOT EXISTS interventions_staging (
        id SERIAL PRIMARY KEY,
        date_intervention DATE NOT NULL,
        heure VARCHAR(5),
        action VARCHAR(20) DEFAULT 'Ouverture',
        type_intervention VARCHAR(50) NOT NULL,
        description TEXT DEFAULT '',
        technicien VARCHAR(100) NOT NULL,
        equipement VARCHAR(200),
        statut VARCHAR(50) DEFAULT 'En attente',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await db.query(`
      ALTER TABLE interventions_staging
      ADD COLUMN IF NOT EXISTS action VARCHAR(20) DEFAULT 'Ouverture'
    `);
    await db.query(`
      ALTER TABLE interventions_staging
      ADD COLUMN IF NOT EXISTS intervention_id INTEGER REFERENCES interventions(id) ON DELETE SET NULL
    `);
    await db.query(`ALTER TABLE interventions_staging ADD COLUMN IF NOT EXISTS date_cloture DATE`);
    await db.query(`ALTER TABLE interventions_staging ADD COLUMN IF NOT EXISTS heure_cloture VARCHAR(5)`);
    await db.query(`ALTER TABLE interventions_staging ADD COLUMN IF NOT EXISTS description_cloture TEXT`);
    await db.query(`ALTER TABLE interventions_staging ADD COLUMN IF NOT EXISTS sous_equipement VARCHAR(255)`);
    console.log('✅ Table interventions_staging prete');

    await db.query(`ALTER TABLE equipements ADD COLUMN IF NOT EXISTS famille_equipement VARCHAR(100)`);
    console.log('✅ Colonne famille_equipement prete');

    await db.query(`
      CREATE TABLE IF NOT EXISTS verifications_quotidiennes (
        id SERIAL PRIMARY KEY,
        equipement_id INTEGER REFERENCES equipements(id) ON DELETE CASCADE,
        equipement_nom VARCHAR(200) NOT NULL,
        technicien VARCHAR(100) NOT NULL,
        date_verification DATE NOT NULL DEFAULT CURRENT_DATE,
        statut VARCHAR(20) NOT NULL DEFAULT 'ok',
        observation TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(equipement_id, technicien, date_verification)
      )
    `);
    console.log('✅ Table verifications_quotidiennes prete');

    // Check if required tables exist
    const requiredTables = ['consommation_eau', 'consommation_electricite', 'production_photovoltaique', 'interventions', 'interventions_staging', 'sous_equip'];
    console.log('👤 Verification des tables requises...');

    for (const table of requiredTables) {
      try {
        const result = await db.query(`SELECT COUNT(*) as count FROM ${table}`);
        console.log(`   ✓ ${table}: ${result.rows[0].count} enregistrements`);
      } catch (err) {
        console.log(`   ✗ ${table}: Manquante - ${err.message}`);
      }
    }

  } catch (err) {
    console.error('❌ Erreur PostgreSQL:', err.message);
    console.error('   → Verifier que PostgreSQL est demarre');
    console.error('   → Verifier que la base eleonetech_db existe');
  }
});



require('dotenv').config({ path: __dirname + '/.env' });

const http    = require('http');
const express = require('express');
const cors    = require('cors');
const db      = require('./config/db');

console.log('EMAIL_USER loaded:', process.env.EMAIL_USER ? '✅' : '❌ MISSING');
console.log('EMAIL_PASS loaded:', process.env.EMAIL_PASS ? '✅' : '❌ MISSING');

// Validation complète au démarrage — plante tôt plutôt que crasher à la première requête
const REQUIRED_ENV = ['JWT_SECRET', 'DB_HOST', 'DB_PASSWORD', 'DB_NAME'];
const missingEnv   = REQUIRED_ENV.filter(k => !process.env[k]);
if (missingEnv.length) {
  console.error(`❌ Variables d'environnement manquantes : ${missingEnv.join(', ')}`);
  console.error('   → Vérifiez votre fichier backend/.env');
  process.exit(1);
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
const mlRoutes                         = require('./routes/ml.routes');
const { demarrerRappelsInterventions } = require('./services/interventionReminder.service');
const { demarrerDwSync }               = require('./services/dwSync.service');
const { purgerBlacklist }              = require('./middleware/auth.middleware');

const app        = express();
const httpServer = http.createServer(app);
const PORT       = process.env.PORT || 5000;

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : ['http://localhost:3000'];

// Autorise les IPs du réseau local (téléphones/tablettes sur le même WiFi)
const isLocalNetwork = (origin) => {
  try {
    const host = new URL(origin).hostname;
    return (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      /^192\.168\.\d+\.\d+$/.test(host) ||
      /^10\.\d+\.\d+\.\d+$/.test(host)   ||
      /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(host)
    );
  } catch { return false; }
};

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin) || isLocalNetwork(origin)) return cb(null, true);
    cb(new Error(`CORS: origin non autorisée ${origin}`));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'cf-connecting-ip'],
  credentials: true,
}));

app.use(express.json());

app.use('/api/auth',         authRoutes);
app.use('/api/users',        usersRoutes);
app.use('/api/equipements',  equipementRoutes);
app.use('/api/sous-equip',   sousEquipRoutes);
app.use('/api/monitoring',   monitoringRoutes);
app.use('/api/seuils',         seuilsRoutes);
app.use('/api/verifications',  verificationsRoutes);
app.use('/api/kpi',            kpiRoutes);
app.use('/api/prc',            prcRoutes);
app.use('/api/ml',             mlRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', app: 'ELEONETECH API', time: new Date().toISOString() });
});

app.use((req, res) => {
  res.status(404).json({ message: 'Route non trouvee.' });
});

httpServer.listen(PORT, async () => {
  console.log(`🚀 Serveur demarre sur http://localhost:${PORT}`);
  demarrerRappelsInterventions();
  demarrerDwSync();

  // Nettoyage initial puis toutes les 6h des tokens blacklistés expirés
  purgerBlacklist();
  setInterval(purgerBlacklist, 6 * 60 * 60 * 1000);

  try {
    await db.query('SELECT 1');
    console.log('✅ PostgreSQL connecte - Base: eleonetech_db');

    
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
    await db.query(`
      CREATE TABLE IF NOT EXISTS verifications_sous_equip (
        id SERIAL PRIMARY KEY,
        sous_equip_id INTEGER NOT NULL,
        sous_equip_nom VARCHAR(200) NOT NULL,
        equipement_id INTEGER,
        equipement_nom VARCHAR(200),
        technicien VARCHAR(100) NOT NULL,
        date_verification DATE NOT NULL DEFAULT CURRENT_DATE,
        statut VARCHAR(20) NOT NULL DEFAULT 'ok',
        observation TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(sous_equip_id, technicien, date_verification)
      )
    `);
    console.log('✅ Table verifications_quotidiennes + verifications_sous_equip pretes');

    await db.query(`
      CREATE TABLE IF NOT EXISTS mouvements_prc (
        id SERIAL PRIMARY KEY,
        prc_id INTEGER REFERENCES prc(id) ON DELETE CASCADE,
        type_mouvement VARCHAR(10) NOT NULL,
        quantite INTEGER NOT NULL,
        stock_avant INTEGER NOT NULL,
        stock_apres INTEGER NOT NULL,
        intervention_staging_id INTEGER,
        technicien VARCHAR(100),
        motif VARCHAR(255),
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✅ Table mouvements_prc prete');

    await db.query(`
      CREATE TABLE IF NOT EXISTS seuils_consommation (
        id SERIAL PRIMARY KEY,
        type_consommation VARCHAR(50) NOT NULL UNIQUE,
        seuil_hiver DECIMAL(10,2) NOT NULL,
        seuil_ete DECIMAL(10,2) NOT NULL,
        prix_unitaire DECIMAL(10,2) NOT NULL,
        unite VARCHAR(20) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await db.query(`
      INSERT INTO seuils_consommation (type_consommation, seuil_hiver, seuil_ete, prix_unitaire, unite)
      VALUES ('eau', 9000, 12000, 0.200, 'm³'), ('electricite', 2300, 4000, 0.700, 'kWh')
      ON CONFLICT (type_consommation) DO NOTHING
    `);
    console.log('✅ Table seuils_consommation prete');

    
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

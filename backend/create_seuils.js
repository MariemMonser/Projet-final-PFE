const db = require('./config/db');

async function createSeuilsTable() {
  try {
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
      INSERT INTO seuils_consommation (type_consommation, seuil_hiver, seuil_ete, prix_unitaire, unite) VALUES
      ('eau', 9000, 12000, 0.200, 'm³'),
      ('electricite', 2300, 4000, 0.700, 'kWh')
      ON CONFLICT (type_consommation) DO UPDATE SET
        seuil_hiver = EXCLUDED.seuil_hiver,
        seuil_ete = EXCLUDED.seuil_ete,
        prix_unitaire = EXCLUDED.prix_unitaire,
        updated_at = CURRENT_TIMESTAMP
    `);

    console.log('✅ Table seuils_consommation créée avec données par défaut');
  } catch (err) {
    console.error('❌ Erreur:', err.message);
    throw err;
  }
}

createSeuilsTable().then(() => {
  console.log('✅ Initialisation des seuils terminée');
  process.exit(0);
}).catch(err => {
  console.error('❌ Erreur fatale:', err.message);
  process.exit(1);
});

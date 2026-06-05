// ============================================================
// CONNEXION DATA WAREHOUSE - eleonetech_dw
// Séparée de la base principale eleonetech_db
// ============================================================
const { Pool } = require('pg');

const dw = new Pool(
  process.env.DB_DW_URL
    ? {
        connectionString: process.env.DB_DW_URL,
        ssl: { rejectUnauthorized: false },
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
      }
    : {
        host:     process.env.DB_DW_HOST     || 'localhost',
        port:     process.env.DB_DW_PORT     || 5432,
        user:     process.env.DB_DW_USER     || 'postgres',
        password: process.env.DB_DW_PASSWORD || '',
        database: process.env.DB_DW_NAME     || 'eleonetech_dw',
        ssl: false,
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
      }
);

dw.on('error', (err) => {
  console.warn('⚠️  DW PostgreSQL error (non-fatal):', err.message);
});

module.exports = dw;

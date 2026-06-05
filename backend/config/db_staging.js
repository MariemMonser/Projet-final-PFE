// ============================================================
// CONNEXION STAGING - eleonetech_staging
// ============================================================
const { Pool } = require('pg');

const staging = new Pool(
  process.env.DB_STAGING_URL
    ? {
        connectionString: process.env.DB_STAGING_URL,
        ssl: { rejectUnauthorized: false },
        max: 5,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
      }
    : {
        host:     process.env.DB_STAGING_HOST     || 'localhost',
        port:     parseInt(process.env.DB_STAGING_PORT) || 5432,
        user:     process.env.DB_STAGING_USER     || 'postgres',
        password: process.env.DB_STAGING_PASSWORD || 'postgres123@',
        database: process.env.DB_STAGING_NAME     || 'eleonetech_staging',
        ssl: false,
        max: 5,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
      }
);

staging.on('error', (err) => {
  console.warn('⚠️  Staging PostgreSQL error (non-fatal):', err.message);
});

module.exports = staging;

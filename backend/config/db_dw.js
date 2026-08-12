const { Pool } = require('pg');

const _dwUrl = process.env.DB_DW_URL;
const _dwSsl = _dwUrl && !/localhost|127\.0\.0\.1/.test(_dwUrl)
  ? { rejectUnauthorized: false }
  : false;

const dw = new Pool(
  _dwUrl
    ? {
        connectionString: _dwUrl,
        ssl: _dwSsl,
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
      }
    : {
        host:     process.env.DB_DW_HOST     || 'localhost',
        port:     process.env.DB_DW_PORT     || 5432,
        user:     process.env.DB_DW_USER     || 'postgres',
        password: process.env.DB_DW_PASSWORD || process.env.DB_PASSWORD,
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

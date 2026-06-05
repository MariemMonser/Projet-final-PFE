const { Pool } = require('pg');

const db = new Pool({
  host:     process.env.DB_HOST || 'localhost',
  port:     parseInt(process.env.DB_PORT) || 5432,
  user:     process.env.DB_USER || 'postgres',
  // Passer undefined si vide pour laisser pg_hba.conf gérer l'auth
  password: process.env.DB_PASSWORD || undefined,
  database: process.env.DB_NAME || 'eleonetech_db',
  ssl: process.env.DB_HOST && process.env.DB_HOST !== 'localhost'
    ? { rejectUnauthorized: false }
    : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

module.exports = db;
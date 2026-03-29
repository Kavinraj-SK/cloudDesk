const { Pool } = require('pg');

let pool;

async function connectPostgres() {
  pool = new Pool({
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    database: process.env.POSTGRES_DB || 'clouddesk',
    user: process.env.POSTGRES_USER || 'clouddesk',
    password: process.env.POSTGRES_PASSWORD || 'clouddesk123',
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  });

  try {
    await pool.query('SELECT NOW()');
    console.log('[PostgreSQL] Connected successfully');
  } catch (err) {
    console.error('[PostgreSQL] Connection failed:', err.message);
    console.log('[PostgreSQL] Running in demo mode (no DB)');
    pool = null;
  }
}

async function runMigrations() {
  if (!pool) return;

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS desks (
        id SERIAL PRIMARY KEY,
        desk_id VARCHAR(20) UNIQUE NOT NULL,
        alias VARCHAR(100),
        created_at TIMESTAMP DEFAULT NOW(),
        last_seen TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id UUID PRIMARY KEY,
        desk_id VARCHAR(20) NOT NULL,
        host_name VARCHAR(100),
        status VARCHAR(20) DEFAULT 'WAITING',
        created_at TIMESTAMP DEFAULT NOW(),
        connected_at TIMESTAMP,
        duration INTEGER,
        FOREIGN KEY (desk_id) REFERENCES desks(desk_id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_sessions_desk_id ON sessions(desk_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
    `);
    console.log('[PostgreSQL] Migrations completed');
  } catch (err) {
    console.error('[PostgreSQL] Migration error:', err.message);
  }
}

function getPool() {
  return pool || {
    query: async () => ({ rows: [] }),
  };
}

module.exports = { connectPostgres, runMigrations, getPool };

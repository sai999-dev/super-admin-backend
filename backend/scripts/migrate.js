#!/usr/bin/env node

/**
 * Simple migration runner for Supabase/Postgres using node-postgres.
 * - Loads SQL files from backend/migrations (alphabetical order)
 * - Optional --pattern <glob-fragment> to filter which files run
 * - Runs each file in its own transaction; logs progress and errors
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const dotenv = require('dotenv');

// Load env (config.env first, then .env overrides)
dotenv.config({ path: path.join(__dirname, '..', '..', 'config.env') });
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

function getArg(flag, def = undefined) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return def;
  return process.argv[idx + 1] || def;
}

function buildPgConfig() {
  // Prefer explicit Supabase pooled connection envs from config.env
  const config = {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME,
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    ssl: { rejectUnauthorized: false }
  };

  const missing = Object.entries(config)
    .filter(([k, v]) => v === undefined || v === null || v === '')
    .map(([k]) => k);

  if (missing.length) {
    throw new Error(`Missing DB env vars: ${missing.join(', ')}. Check config.env/.env`);
  }

  return config;
}

async function runSql(client, sql, fileName) {
  await client.query('BEGIN');
  try {
    await client.query(sql);
    await client.query('COMMIT');
    console.log(`✅ Applied: ${fileName}`);
  } catch (err) {
    await client.query('ROLLBACK');
    // Common idempotent errors we can safely ignore on re-run
    const msg = String(err.message || err);
    const ignorable = [
      'already exists',
      'duplicate key value',
      'relation "',
      'function already exists',
      'type "',
      'column "',
      'constraint "',
      'cannot drop',
    ].some(t => msg.toLowerCase().includes(t));

    if (ignorable) {
      console.warn(`⚠️ Skipped (idempotent): ${fileName} -> ${msg}`);
      return;
    }

    console.error(`❌ Failed: ${fileName}`);
    console.error(msg);
    throw err;
  }
}

async function main() {
  const pattern = getArg('--pattern');

  if (!fs.existsSync(MIGRATIONS_DIR)) {
    console.error(`Migrations directory not found: ${MIGRATIONS_DIR}`);
    process.exit(1);
  }

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .filter((f) => (pattern ? f.includes(pattern) : true))
    .sort((a, b) => a.localeCompare(b));

  if (!files.length) {
    console.log('No migration files to run.');
    return;
  }

  console.log('🔧 Running migrations...');
  console.log(files.map((f) => ` - ${f}`).join('\n'));

  const client = new Client(buildPgConfig());
  await client.connect();

  try {
    for (const file of files) {
      const fullPath = path.join(MIGRATIONS_DIR, file);
      const sql = fs.readFileSync(fullPath, 'utf8');
      if (!sql.trim()) {
        console.warn(`⚠️ Empty file, skipping: ${file}`);
        continue;
      }
      await runSql(client, sql, file);
    }
    console.log('🎉 Migrations complete');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('Migration runner failed:', err.message || err);
  process.exit(1);
});

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getConfig } from '../config/env.js';
import { getPool } from './pool.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.join(__dirname, 'migrations');

interface MigrationFile {
  version: string;
  sql: string;
}

async function loadMigrations(): Promise<MigrationFile[]> {
  const files = await fs.readdir(migrationsDir);
  const sqlFiles = files.filter((file) => file.endsWith('.sql')).sort();

  const migrations: MigrationFile[] = [];
  for (const file of sqlFiles) {
    const sql = await fs.readFile(path.join(migrationsDir, file), 'utf8');
    migrations.push({ version: file, sql });
  }

  return migrations;
}

async function ensureMigrationsTable(): Promise<void> {
  const pool = getPool();
  const { DB_MIGRATIONS_TABLE: tableName } = getConfig();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${tableName} (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

async function getAppliedVersions(): Promise<Set<string>> {
  const pool = getPool();
  const { DB_MIGRATIONS_TABLE: tableName } = getConfig();

  const result = await pool.query<{ version: string }>(`SELECT version FROM ${tableName};`);
  return new Set(result.rows.map((row) => row.version));
}

export async function runMigrations(): Promise<string[]> {
  await ensureMigrationsTable();

  const appliedVersions = await getAppliedVersions();
  const migrations = await loadMigrations();
  const pool = getPool();
  const { DB_MIGRATIONS_TABLE: tableName } = getConfig();

  const appliedNow: string[] = [];
  for (const migration of migrations) {
    if (appliedVersions.has(migration.version)) {
      continue;
    }

    await pool.query('BEGIN');
    try {
      await pool.query(migration.sql);
      await pool.query(`INSERT INTO ${tableName} (version) VALUES ($1);`, [migration.version]);
      await pool.query('COMMIT');
      appliedNow.push(migration.version);
    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
    }
  }

  return appliedNow;
}

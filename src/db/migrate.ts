import type Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

export function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY,
      applied_at TEXT DEFAULT (datetime('now'))
    )
  `);

  const applied = new Set(
    (db.prepare('SELECT version FROM schema_version').all() as { version: number }[])
      .map(row => row.version)
  );

  // Look for migration files in both possible locations (src and dist)
  let migrationsDir = MIGRATIONS_DIR;
  if (!fs.existsSync(migrationsDir)) {
    // Fallback for compiled output where migrations are copied alongside
    migrationsDir = path.join(__dirname, '..', 'db', 'migrations');
  }
  if (!fs.existsSync(migrationsDir)) {
    console.warn(`Migrations directory not found at ${MIGRATIONS_DIR}`);
    return;
  }

  const migrationFiles = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  for (const file of migrationFiles) {
    const version = parseInt(file.split('_')[0], 10);
    if (applied.has(version)) continue;

    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
    db.exec(sql);
    db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(version);
    console.log(`Applied migration: ${file}`);
  }
}

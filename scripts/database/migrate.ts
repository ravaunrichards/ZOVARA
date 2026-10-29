import dotenv from 'dotenv';
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import pg from 'pg';
const envCandidates = [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')];
const envPath = envCandidates.find((candidate) => existsSync(candidate));
dotenv.config(envPath ? { path: envPath } : {});
const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required');
const pool = new pg.Pool({ connectionString: url });
const dir = resolve(process.cwd(), process.cwd().endsWith('/api') ? '../../database/migrations' : 'database/migrations');
try {
  await pool.query('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
  const already = new Set((await pool.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
  const names = (await readdir(dir)).filter((n) => /^000[1-7]_.+\\.sql$/.test(n)).sort();
  if (names.length !== 7) throw new Error(`Expected exactly 7 canonical migrations (0001–0007); found ${names.length}. Refusing to apply legacy or duplicate migration chains.`);
  for (const name of names) {
    if (already.has(name)) { console.log(`skip ${name}`); continue; }
    const sql = await readFile(resolve(dir, name), 'utf8');
    const client = await pool.connect();
    try { await client.query('BEGIN'); await client.query(sql); await client.query('INSERT INTO schema_migrations(name) VALUES($1)', [name]); await client.query('COMMIT'); console.log(`applied ${name}`); }
    catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }
} finally { await pool.end(); }

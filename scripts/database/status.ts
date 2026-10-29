import dotenv from 'dotenv';
import { existsSync } from 'node:fs'; import { readdir } from 'node:fs/promises'; import { resolve } from 'node:path'; import pg from 'pg';
const envCandidates = [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')];
const envPath = envCandidates.find((candidate) => existsSync(candidate));
dotenv.config(envPath ? { path: envPath } : {});
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
 const dir = resolve(process.cwd(), process.cwd().endsWith('/api') ? '../../database/migrations' : 'database/migrations');
 const files = (await readdir(dir)).filter((x) => x.endsWith('.sql')).sort();
 const check = await pool.query("SELECT to_regclass('public.schema_migrations') AS name");
 const applied = check.rows[0].name ? new Set((await pool.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name)) : new Set<string>();
 for (const f of files) console.log(`${applied.has(f) ? 'APPLIED' : 'PENDING'} ${f}`);
} finally { await pool.end(); }

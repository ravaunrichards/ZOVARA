import dotenv from 'dotenv';
import { existsSync } from 'node:fs'; import { resolve } from 'node:path'; import bcrypt from 'bcryptjs'; import pg from 'pg';
const envCandidates = [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')];
const envPath = envCandidates.find((candidate) => existsSync(candidate));
dotenv.config(envPath ? { path: envPath } : {});
const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase(); const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
if (!email || !password) { console.log('No admin created. Set BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD to explicitly bootstrap an administrator.'); process.exit(0); }
if (password.length < 14) throw new Error('Bootstrap administrator password must be at least 14 characters.');
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
 const username = `admin_${email.split('@')[0].replace(/[^a-z0-9_.]/gi, '').slice(0, 18)}`.toLowerCase().slice(0, 30).padEnd(3, '_');
 const hash = await bcrypt.hash(password, 12);
 const client = await pool.connect();
 try { await client.query('BEGIN'); const found = await client.query('SELECT id FROM users WHERE email=$1', [email]);
   if (found.rowCount) throw new Error('An account already exists for this email; refusing to overwrite it.');
   const user = await client.query("INSERT INTO users(email, username, password_hash, display_name, role) VALUES($1,$2,$3,$4,'admin') RETURNING id", [email, username, hash, 'ZOVARA Administrator']);
   await client.query('INSERT INTO profiles(user_id, mode) VALUES($1,\'creator\')', [user.rows[0].id]);
   await client.query('INSERT INTO wallets(user_id) VALUES($1)', [user.rows[0].id]); await client.query('COMMIT'); console.log('Administrator account created.');
 } catch(e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
} finally { await pool.end(); }

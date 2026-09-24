import { Pool } from 'pg';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
if (!process.env.DATABASE_URL) throw new Error('Missing DATABASE_URL');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const sql = readFileSync(fileURLToPath(new URL('../migrations/001_identity.sql', import.meta.url)), 'utf8');
const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query(sql);
  await client.query('COMMIT');
  console.info('Migration 001 applied');
} catch (error) { await client.query('ROLLBACK'); throw error; }
finally { client.release(); await pool.end(); }

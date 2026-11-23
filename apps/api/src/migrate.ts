import { Pool } from 'pg';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { migrationFiles } from './migration-files.js';
if (!process.env.DATABASE_URL) throw new Error('Missing DATABASE_URL');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
try {
  await client.query('BEGIN');
  for (const migration of migrationFiles) {
    const sql = readFileSync(fileURLToPath(new URL(`../migrations/${migration}`, import.meta.url)), 'utf8');
    await client.query(sql);
  }
  await client.query('COMMIT');
  console.info('Migrations 001 through 004 applied');
} catch (error) { await client.query('ROLLBACK'); throw error; }
finally { client.release(); await pool.end(); }

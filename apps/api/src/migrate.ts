import { Pool } from 'pg';
import { migrationFiles } from './migration-files.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
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
  console.info(`Applied first-party migrations: ${migrationFiles.join(', ')}`);
} catch (error) { await client.query('ROLLBACK'); throw error; }
finally { client.release(); await pool.end(); }

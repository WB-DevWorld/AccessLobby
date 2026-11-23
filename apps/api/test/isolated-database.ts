import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { migrationFiles } from '../src/migration-files.js';

export async function openIsolatedDatabase() {
  const source = process.env.TEST_DATABASE_URL;
  if (!source) throw new Error('TEST_DATABASE_URL is required');
  const schema = `aliso_${randomBytes(8).toString('hex')}`;
  if (!/^aliso_[0-9a-f]{16}$/.test(schema)) throw new Error('Refusing an unexpected schema name');
  const pool = new Pool({ connectionString: source, max: 10, options: `-c search_path=${schema}` });
  pool.on('error', () => { /* A connection can close while its schema is dropped. */ });
  const admin = new Pool({ connectionString: source, max: 1 });
  const drop = async () => {
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.end();
  };
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
    const client = await pool.connect();
    try {
      const current = await client.query<{ schema: string }>('SELECT current_schema() AS schema');
      if (current.rows[0]?.schema !== schema) throw new Error(`Expected schema ${schema}`);
      await client.query('BEGIN');
      try {
        for (const migration of migrationFiles) {
          const sql = readFileSync(fileURLToPath(new URL(`../migrations/${migration}`, import.meta.url)), 'utf8');
          await client.query(sql);
        }
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    } finally { client.release(); }
  } catch (error) {
    await pool.end();
    await drop();
    throw error;
  }
  return {
    pool,
    close: async () => {
      await pool.end();
      await drop();
    },
  };
}

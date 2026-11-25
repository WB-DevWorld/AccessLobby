/** Protected-host CLI only. Deliberately has no HTTP route or IAM dependency. */
import { Pool } from 'pg';
import { validId } from './organizations.js';
import { OperatorError, validOperatorReference, validOperatorRole } from './operators.js';

export async function manageOperatorRole(pool: Pool, personId: unknown, operation: unknown,
  role: unknown, reference: unknown) {
  if (!validId(personId) || (operation !== 'grant' && operation !== 'revoke') ||
      !validOperatorRole(role) || !validOperatorReference(reference)) {
    throw new OperatorError(400, 'invalid_operator_role_change');
  }
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const person = await db.query<{ status: string }>('SELECT status FROM persons WHERE id = $1 FOR UPDATE', [personId]);
    if (!person.rows[0] || (operation === 'grant' && person.rows[0].status !== 'active')) {
      throw new OperatorError(404, 'active_operator_person_required');
    }
    const change = operation === 'grant'
      ? await db.query(`INSERT INTO platform_operator_roles (person_id, role, grant_reference)
          VALUES ($1, $2, $3) ON CONFLICT (person_id, role) DO UPDATE SET granted_at = now(),
          grant_reference = EXCLUDED.grant_reference, revoked_at = NULL, revoke_reference = NULL
          WHERE platform_operator_roles.revoked_at IS NOT NULL RETURNING person_id`, [personId, role, reference])
      : await db.query(`UPDATE platform_operator_roles SET revoked_at = now(), revoke_reference = $3
          WHERE person_id = $1 AND role = $2 AND revoked_at IS NULL RETURNING person_id`, [personId, role, reference]);
    const changed = change.rowCount === 1;
    if (changed) {
      // A protected shell operation has no authenticated browser-person actor.
      await db.query(`INSERT INTO operator_audit_events (actor_person_id, action, target_type, target_id, reference)
        VALUES (NULL, $1, 'person', $2, $3)`, [`operator.role.${role}.${operation === 'grant' ? 'granted' : 'revoked'}`, personId, reference]);
    }
    await db.query('COMMIT');
    return { personId: personId.toLowerCase(), role, operation, changed };
  } catch (error) { await db.query('ROLLBACK'); throw error; }
  finally { db.release(); }
}

async function main() {
  const [personId, operation, role, reference, extra] = process.argv.slice(2);
  if (extra || !validId(personId) || !['grant', 'revoke'].includes(operation ?? '') ||
      !validOperatorRole(role) || !validOperatorReference(reference)) {
    throw new Error('Usage: manage-operator <person-uuid> grant|revoke support_reader|application_reviewer <review-reference>');
  }
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL required on the protected operator runner');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  try { console.info(JSON.stringify(await manageOperatorRole(pool, personId, operation, role, reference))); }
  finally { await pool.end(); }
}

if (process.argv[1]?.endsWith('/manage-operator.js') || process.argv[1]?.endsWith('/manage-operator.ts')) {
  main().catch(error => {
    console.error(error instanceof OperatorError ? error.code : 'Operator role change failed; check protected configuration and usage');
    process.exitCode = 1;
  });
}

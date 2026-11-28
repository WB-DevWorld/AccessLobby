import type { Pool, PoolClient } from 'pg';
import { OperatorError, OperatorStore, operatorContract, validOperatorRole } from './operators.js';
import { validId } from './organizations.js';

export const auditPageLimit = 25;
export const auditExportLimit = 1000;
export const auditCsvHeader = '"id","occurredAt","action","actorPersonId","targetType","targetId","reference"';
export const auditCsvFilename = 'accesslobby-operator-history.csv';
export const auditCsvByteLimit = 1024 * 1024;

export type AuditQuery = { action?: string; actorPersonId?: string; targetId?: string; reference?: string;
  from?: string; to?: string; after?: string };
export type AuditEvent = { id: string; actorPersonId: string | null; action: string;
  targetType: string; targetId: string; reference: string; occurredAt: string };
const keys = ['action', 'actorPersonId', 'targetId', 'reference', 'from', 'to', 'after'] as const;
const actionPattern = /^(?:operator|application|person)\.[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*){0,3}$/;
const fail = (code = 'invalid_audit_query'): never => { throw new OperatorError(400, code); };

function day(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number(value.slice(0, 4)) < 1) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** Exact allowlist; repeated/structured query parameters cannot widen a read. */
export function parseAuditQuery(value: unknown): AuditQuery {
  if (value === undefined) return {};
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return fail();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return fail();
  const query: AuditQuery = {};
  for (const [key, source] of Object.entries(value)) {
    if (!keys.includes(key as typeof keys[number]) || typeof source !== 'string' || source.length > 120 || /[\x00-\x1f\x7f]/.test(source)) return fail();
    const text = source.trim();
    if (!text) continue;
    if (key === 'action' && (text.length > 100 || !actionPattern.test(text))) return fail();
    if ((key === 'actorPersonId' || key === 'targetId') && !validId(text)) return fail();
    if ((key === 'from' || key === 'to') && !day(text)) return fail();
    if (key === 'after' && (!/^[1-9][0-9]{0,18}$/.test(text) || BigInt(text) > 9223372036854775807n)) return fail('invalid_admin_cursor');
    query[key as keyof AuditQuery] = key === 'actorPersonId' || key === 'targetId' ? text.toLowerCase() : text;
  }
  if (query.from && query.to && query.from > query.to) return fail();
  return query;
}

interface AuditRow { id: string; actor_person_id: string | null; action: string; target_type: string;
  target_id: string; reference: string; occurred_at: Date }
const present = (row: AuditRow): AuditEvent => ({ id: row.id, actorPersonId: row.actor_person_id,
  action: row.action, targetType: row.target_type, targetId: row.target_id, reference: row.reference,
  occurredAt: row.occurred_at.toISOString() });

/** Quote every cell. Prefix dangerous spreadsheet expressions even after hidden whitespace. */
export function auditCsvCell(value: string | null): string {
  const text = value ?? '';
  const safe = /^[\s\p{Cc}\p{Cf}]*[=+\-@]/u.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}
export function auditEventsCsv(events: readonly AuditEvent[]): string {
  if (events.length > auditExportLimit) throw new Error('Audit export row limit exceeded');
  const rows = events.map(event => [event.id, event.occurredAt, event.action, event.actorPersonId,
    event.targetType, event.targetId, event.reference].map(auditCsvCell).join(','));
  const csv = [auditCsvHeader, ...rows].join('\r\n') + '\r\n';
  if (Buffer.byteLength(csv, 'utf8') > auditCsvByteLimit) throw new Error('Audit export byte limit exceeded');
  return csv;
}

export class AuditToolsStore {
  constructor(private readonly pool: Pool, private readonly operators: OperatorStore) {}

  async list(actorId: string, source?: unknown) {
    await this.operators.require(actorId, 'read');
    const query = parseAuditQuery(source);
    return this.read(actorId, async db => {
      const found = await this.rows(db, query, auditPageLimit + 1);
      const events = found.slice(0, auditPageLimit).map(present);
      return { contract: operatorContract, events,
        nextCursor: found.length > auditPageLimit ? events.at(-1)!.id : null };
    });
  }

  async export(actorId: string, source?: unknown) {
    await this.operators.require(actorId, 'read');
    const query = parseAuditQuery(source);
    return this.read(actorId, async db => {
      const found = await this.rows(db, query, auditExportLimit + 1);
      const events = found.slice(0, auditExportLimit).map(present);
      // Serialize while current authority is locked. An export is a bounded read;
      // it writes no history event and cannot include a self-generated row.
      return { csv: auditEventsCsv(events), count: events.length, truncated: found.length > auditExportLimit };
    });
  }

  private async read<T>(actorId: string, work: (db: PoolClient) => Promise<T>): Promise<T> {
    const db = await this.pool.connect();
    try {
      await db.query('BEGIN');
      await db.query("SET LOCAL statement_timeout = '5000ms'");
      // Protected CLI revocation locks the person first, then updates its grant.
      // Keep that same order and hold both locks through snapshot/serialization.
      const person = await db.query<{ status: string }>('SELECT status FROM persons WHERE id=$1 FOR SHARE', [actorId]);
      const grants = await db.query<{ role: string }>(`SELECT role FROM platform_operator_roles
        WHERE person_id=$1 AND revoked_at IS NULL ORDER BY role FOR SHARE`, [actorId]);
      if (person.rows[0]?.status !== 'active' || !grants.rows.some(row => validOperatorRole(row.role))) {
        throw new OperatorError(403, 'operator_access_denied');
      }
      const result = await work(db);
      await db.query('COMMIT');
      return result;
    } catch (error) { await db.query('ROLLBACK'); throw error; }
    finally { db.release(); }
  }

  private async rows(db: PoolClient, query: AuditQuery, limit: number): Promise<AuditRow[]> {
    const literal = query.reference?.replace(/[\\%_]/g, '\\$&') ?? null;
    const result = await db.query<AuditRow>(`SELECT id,actor_person_id,action,target_type,target_id,reference,occurred_at
      FROM operator_audit_events
      WHERE ($1::text IS NULL OR action=$1)
        AND ($2::uuid IS NULL OR actor_person_id=$2::uuid)
        AND ($3::text IS NULL OR lower(target_id)=$3)
        AND ($4::text IS NULL OR reference ILIKE '%' || $4 || '%' ESCAPE '\\')
        AND ($5::date IS NULL OR occurred_at >= ($5::date::timestamp AT TIME ZONE 'UTC'))
        AND ($6::date IS NULL OR occurred_at < (($6::date + 1)::timestamp AT TIME ZONE 'UTC'))
        AND ($7::bigint IS NULL OR id < $7::bigint)
      ORDER BY id DESC LIMIT $8`, [query.action ?? null, query.actorPersonId ?? null, query.targetId ?? null,
      literal, query.from ?? null, query.to ?? null, query.after ?? null, limit]);
    return result.rows;
  }
}

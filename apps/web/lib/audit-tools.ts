import { adminUuid } from './admin-model';

export type AuditFilters = { action?: string; actorPersonId?: string; targetId?: string; reference?: string;
  from?: string; to?: string; after?: string };
const keys = ['action', 'actorPersonId', 'targetId', 'reference', 'from', 'to', 'after'] as const;
export const auditCsvFilename = 'accesslobby-operator-history.csv';
export const auditExportLimit = 1000;
const csvHeader = '"id","occurredAt","action","actorPersonId","targetType","targetId","reference"';
const byteLimit = 1024 * 1024;

function day(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number(value.slice(0, 4)) < 1) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
export function parseAuditFilters(value: unknown): AuditFilters | null {
  if (value === undefined) return {};
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return null;
  const filters: AuditFilters = {};
  for (const [key, source] of Object.entries(value)) {
    if (!keys.includes(key as typeof keys[number]) || typeof source !== 'string' || source.length > 120 || /[\x00-\x1f\x7f]/.test(source)) return null;
    const text = source.trim();
    if (!text) continue;
    if (key === 'action' && (text.length > 100 || !/^(?:operator|application|person)\.[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*){0,3}$/.test(text))) return null;
    if ((key === 'actorPersonId' || key === 'targetId') && !adminUuid(text)) return null;
    if ((key === 'from' || key === 'to') && !day(text)) return null;
    if (key === 'after' && (!/^[1-9][0-9]{0,18}$/.test(text) || BigInt(text) > 9223372036854775807n)) return null;
    filters[key as keyof AuditFilters] = key === 'actorPersonId' || key === 'targetId' ? text.toLowerCase() : text;
  }
  return filters.from && filters.to && filters.from > filters.to ? null : filters;
}
function search(filters: AuditFilters): string {
  const params = new URLSearchParams();
  for (const key of keys) if (filters[key]) params.set(key, filters[key]!);
  return params.size ? `?${params}` : '';
}
export function auditListApiPath(filters: AuditFilters): string { return `/v1/admin/audit${search(filters)}`; }
export function auditPageHref(filters: AuditFilters, after: string | null = null): string {
  return `/admin/audit${search({ ...filters, after: after ?? undefined })}`;
}
export function auditExportHref(filters: AuditFilters): string {
  return `/admin/audit/export${search({ ...filters, after: undefined })}`;
}

const headers = { 'cache-control': 'private, no-store, max-age=0', 'x-content-type-options': 'nosniff' };
const error = (code: string, status: number) => Response.json({ error: code }, { status, headers });
type AccessResult = { state: 'ready'; access: { capabilities: { read: true } } } | { state: 'signed-out' | 'forbidden' | 'unavailable' };
type ExportDependencies = { getAccess: () => Promise<AccessResult>; api: (path: string) => Promise<Response> };

async function boundedCsv(response: Response): Promise<string | null> {
  const declared = response.headers.get('content-length');
  if (declared && (!/^\d{1,8}$/.test(declared) || Number(declared) > byteLimit)) return null;
  const reader = response.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = []; let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > byteLimit) { await reader.cancel(); return null; }
      chunks.push(value);
    }
    const bytes = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch { return null; }
  finally { reader.releaseLock(); }
}

// A successful download accepts only the seven fixed, fully quoted CSV columns.
// This also refuses a mislabeled HTML/JSON document or spreadsheet expression.
export function validAuditCsv(csv: string, count: number): boolean {
  if (!Number.isInteger(count) || count < 0 || count > auditExportLimit || !csv.startsWith(csvHeader + '\r\n')) return false;
  let index = csvHeader.length + 2, rows = 0;
  while (index < csv.length) {
    const fields: string[] = [];
    while (true) {
      if (csv[index++] !== '"') return false;
      let value = '', closed = false;
      while (index < csv.length) {
        const char = csv[index++];
        if (char !== '"') { value += char; continue; }
        if (csv[index] === '"') { value += '"'; index++; continue; }
        closed = true; break;
      }
      if (!closed || value.length > 2048 || /^[\s\p{Cc}\p{Cf}]*[=+\-@]/u.test(value)) return false;
      fields.push(value);
      if (fields.length > 7) return false;
      if (csv[index] === ',') { index++; continue; }
      if (csv.slice(index, index + 2) !== '\r\n') return false;
      index += 2; break;
    }
    if (fields.length !== 7 || !/^[1-9][0-9]{0,18}$/.test(fields[0]!) ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(fields[1]!) ||
        !Number.isFinite(Date.parse(fields[1]!)) || (fields[3] !== '' && !adminUuid(fields[3]))) return false;
    if (++rows > auditExportLimit) return false;
  }
  return rows === count;
}

export async function handleAuditExport(request: Request, dependencies: ExportDependencies): Promise<Response> {
  if (request.method !== 'GET') return error('method_not_allowed', 405);
  let access: AccessResult;
  try { access = await dependencies.getAccess(); } catch { return error('audit_export_unavailable', 503); }
  if (access.state === 'signed-out') return error('unauthorized', 401);
  if (access.state === 'forbidden') return error('operator_access_denied', 403);
  if (access.state !== 'ready' || access.access.capabilities.read !== true) return error('audit_export_unavailable', 503);
  const url = new URL(request.url);
  if (url.search.length > 4096) return error('invalid_audit_query', 400);
  const source: Record<string, string> = Object.create(null);
  for (const [key, value] of url.searchParams) {
    if (Object.hasOwn(source, key)) return error('invalid_audit_query', 400);
    source[key] = value;
  }
  const parsed = parseAuditFilters(source);
  if (!parsed) return error('invalid_audit_query', 400);
  // Export starts at the first matching result, independent of the visible page.
  const filters = { ...parsed, after: undefined };
  try {
    const response = await dependencies.api(`/v1/admin/audit/export${search(filters)}`);
    if (response.status === 401) return error('unauthorized', 401);
    if (response.status === 403) return error('operator_access_denied', 403);
    if (!response.ok || response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'text/csv') {
      return error('audit_export_unavailable', 502);
    }
    const countHeader = response.headers.get('x-accesslobby-export-count');
    const truncatedHeader = response.headers.get('x-accesslobby-export-truncated');
    if (!countHeader || !/^(?:0|[1-9][0-9]{0,3})$/.test(countHeader) || Number(countHeader) > auditExportLimit ||
        !['true', 'false'].includes(truncatedHeader ?? '') || (truncatedHeader === 'true' && Number(countHeader) !== auditExportLimit)) {
      return error('audit_export_unavailable', 502);
    }
    const csv = await boundedCsv(response);
    if (csv === null || !validAuditCsv(csv, Number(countHeader))) return error('audit_export_unavailable', 502);
    return new Response(csv, { headers: { ...headers, 'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${auditCsvFilename}"`,
      'x-accesslobby-export-count': countHeader, 'x-accesslobby-export-truncated': truncatedHeader! } });
  } catch { return error('audit_export_unavailable', 503); }
}

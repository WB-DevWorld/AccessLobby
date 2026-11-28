import assert from 'node:assert/strict';
import test from 'node:test';
import { auditExportHref, auditListApiPath, auditPageHref, handleAuditExport, parseAuditFilters, validAuditCsv } from '../lib/audit-tools';

const origin = 'https://accesslobby.example.test';
const person = '18b72d01-8ac8-4afe-b75b-779c2ec09745';
const header = '"id","occurredAt","action","actorPersonId","targetType","targetId","reference"\r\n';
const row = `"1","2026-11-28T12:00:00.000Z","person.suspended","${person}","person","${person}","change-ref"\r\n`;
const csv = header + row;
const ready = async () => ({ state: 'ready' as const, access: { capabilities: { read: true as const } } });
const request = (query = '', method = 'GET', headers?: HeadersInit) => new Request(`${origin}/admin/audit/export${query}`, { method, headers });
function csvResponse(body = csv, count = 1, extra: Record<string, string> = {}) {
  return new Response(body, { headers: { 'content-type': 'text/csv; charset=utf-8',
    'x-accesslobby-export-count': String(count), 'x-accesslobby-export-truncated': 'false', ...extra } });
}

test('audit search, paging and export links preserve only reviewed filters; date bounds are whole UTC days', () => {
  const filters = parseAuditFilters({ action: 'person.suspended', actorPersonId: person.toUpperCase(), targetId: person,
    reference: '  change_ref  ', from: '2026-11-27', to: '2026-11-28', after: '17' });
  assert.ok(filters);
  assert.deepEqual(parseAuditFilters(Object.assign(Object.create(null), { reference: 'plain-query' })), { reference: 'plain-query' });
  assert.equal(filters.actorPersonId, person);
  const list = new URL(auditListApiPath(filters), origin);
  assert.equal(list.searchParams.get('reference'), 'change_ref');
  assert.equal(list.searchParams.get('after'), '17');
  assert.equal(new URL(auditPageHref(filters, '12'), origin).searchParams.get('after'), '12');
  assert.equal(new URL(auditPageHref(filters), origin).searchParams.has('after'), false);
  assert.equal(new URL(auditExportHref(filters), origin).searchParams.has('after'), false);
  for (const path of [auditPageHref(filters), auditExportHref(filters)]) {
    const params = new URL(path, origin).searchParams;
    for (const key of ['action', 'actorPersonId', 'targetId', 'reference', 'from', 'to']) assert.equal(params.get(key), filters[key as keyof typeof filters]);
  }
  for (const value of [[], null, new Date(), new Map(), new URLSearchParams('action=person.suspended'), { action: ['person.suspended'] }, { from: '2026-02-29' }, { from: '0000-01-01' },
    { to: '2026-11-30', from: '2026-12-01' }, { after: '9223372036854775808' }, { targetId: 'raw-session-id' },
    { reference: '\nvalue' }, { action: 'realm.delete' }, { reference: 'x'.repeat(121) }, { arbitraryUrl: 'https://evil.test' }]) {
    assert.equal(parseAuditFilters(value), null);
  }
});

test('CSV parser requires the seven-column quoted schema, count agreement and spreadsheet-safe cells', () => {
  assert.equal(validAuditCsv(header, 0), true);
  assert.equal(validAuditCsv(csv, 1), true);
  assert.equal(validAuditCsv(csv.replace('change-ref', "'-formula-ref"), 1), true);
  for (const bad of [csv.replace('change-ref', '=1+1'), csv.replace('change-ref', '\t@cmd'),
    csv.replace('change-ref', '\u200b+cmd'), csv.replace('change-ref', '-12'), csv.replace('\r\n', '\n'),
    csv.replace('"id"', 'id'), csv.slice(0, -2), csv.replace('"change-ref"', '"change-ref","extra-payload"'), '<html>private</html>']) {
    assert.equal(validAuditCsv(bad, 1), false);
  }
  assert.equal(validAuditCsv(csv, 0), false);
});

test('downloads require current operator read access before fetching; denial and errors remain JSON', async () => {
  let reads = 0;
  const api = async () => { reads++; return csvResponse(); };
  for (const [state, status] of [['signed-out', 401], ['forbidden', 403], ['unavailable', 503]] as const) {
    const response = await handleAuditExport(request(), { getAccess: async () => ({ state }), api });
    assert.equal(response.status, status);
    assert.match(response.headers.get('content-type')!, /application\/json/);
    assert.equal(response.headers.has('content-disposition'), false);
    assert.match(response.headers.get('cache-control')!, /private, no-store/);
  }
  assert.equal(reads, 0);
  assert.equal((await handleAuditExport(request('', 'POST'), { getAccess: ready, api })).status, 405);
  assert.equal(reads, 0);
});

test('export rejects duplicate/unknown/malformed query parameters and cannot forward URLs or claimed roles', async () => {
  let reads = 0;
  const dependencies = { getAccess: ready, api: async () => { reads++; return csvResponse(); } };
  for (const query of ['?action=person.suspended&action=application.suspended', '?role=administrator',
    '?returnTo=https://evil.test', '?url=https://evil.test', '?__proto__=ignored', '?action%5Ba%5D=person.suspended',
    '?from=2026-02-29', '?actorPersonId=not-a-person', '?after=-2', `?reference=${'x'.repeat(121)}`]) {
    const result = await handleAuditExport(request(query), dependencies);
    assert.equal(result.status, 400, query);
    assert.match(result.headers.get('content-type')!, /application\/json/);
  }
  assert.equal(reads, 0);
});

test('authorized read-only export uses a fixed API route, clears cursor and emits fixed safe download headers', async () => {
  const paths: string[] = [];
  // Cross-origin navigation does not need a CSRF token for this authorized,
  // side-effect-free GET. The browser still cannot read it across origins.
  const response = await handleAuditExport(request(`?reference=change_ref&actorPersonId=${person}&from=2026-11-28&to=2026-11-28&after=12`, 'GET', { origin: 'https://other.example' }), {
    getAccess: ready,
    api: async path => { paths.push(path); return csvResponse(csv, 1, {
      'content-disposition': 'attachment; filename="private-payload.html"', 'set-cookie': 'private=never-forward',
    }); },
  });
  assert.equal(response.status, 200);
  assert.deepEqual(paths, [`/v1/admin/audit/export?actorPersonId=${person}&reference=change_ref&from=2026-11-28&to=2026-11-28`]);
  assert.equal(response.headers.get('content-type'), 'text/csv; charset=utf-8');
  assert.equal(response.headers.get('content-disposition'), 'attachment; filename="accesslobby-operator-history.csv"');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('x-accesslobby-export-count'), '1');
  assert.equal(response.headers.get('set-cookie'), null);
  assert.equal(await response.text(), csv);
});

test('revocation after the page, malformed MIME/CSV/metadata, oversized streams and backend faults cannot become downloads', async () => {
  const bad = [
    Response.json({ secret: 'never-forward' }),
    csvResponse('<html>never-forward</html>'),
    csvResponse(csv, 2),
    csvResponse(csv, 1, { 'x-accesslobby-export-truncated': 'true' }),
    csvResponse(csv, 1, { 'x-accesslobby-export-count': '1001' }),
    csvResponse(csv, 1, { 'content-length': '1048577' }),
    csvResponse('x'.repeat(1024 * 1024 + 1)),
    new Response(new Uint8Array([0xff]), { headers: { 'content-type': 'text/csv', 'x-accesslobby-export-count': '0', 'x-accesslobby-export-truncated': 'false' } }),
  ];
  for (const upstream of bad) {
    const response = await handleAuditExport(request(), { getAccess: ready, api: async () => upstream });
    assert.equal(response.status, 502);
    assert.equal(response.headers.has('content-disposition'), false);
    assert.equal((await response.text()).includes('never-forward'), false);
  }
  for (const status of [401, 403]) {
    const response = await handleAuditExport(request(), { getAccess: ready, api: async () => Response.json({ private: 'never-forward' }, { status }) });
    assert.equal(response.status, status);
    assert.equal((await response.text()).includes('never-forward'), false);
  }
  const fault = await handleAuditExport(request(), { getAccess: ready, api: async () => { throw new Error('private network details'); } });
  assert.equal(fault.status, 503); assert.equal((await fault.text()).includes('private network details'), false);
});

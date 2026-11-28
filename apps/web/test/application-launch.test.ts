import assert from 'node:assert/strict';
import test from 'node:test';
import { adminContract, type AdminAccess } from '../lib/admin-model';
import { applicationLaunchContract, applicationLaunchLink, handleApplicationLaunch, parseApplicationLaunch, safeApplicationLaunchUrl } from '../lib/application-launch';

const id = '18b72d01-8ac8-4afe-b75b-779c2ec09745', origin = 'https://accesslobby.example.test', entry = 'https://launch.example.test/account';
const access: AdminAccess = { contract: adminContract, roles: ['application_operator'], capabilities: { read: true, reviewApplications: false, managePeople: false, activateApplications: true } };
const app = { id, clientId: 'launch-fixture', name: 'Launch fixture', status: 'active', trustClass: 'first_party', redirectUri: 'https://launch.example.test/wp-login.php?action=al_callback' };
const launch = { launchUrl: entry, version: 'a'.repeat(64), updatedAt: '2026-11-28T18:00:00.000Z', reference: 'issue:launch-fixture', needsReview: false };
const fields = { launchUrl: entry, expectedVersion: '0'.repeat(64), reference: launch.reference };
const detail = { contract: applicationLaunchContract, application: app, launch, canManage: true };
const completed = { ...detail, changed: true };
function request(body: BodyInit = new URLSearchParams(fields), from: string | null = origin, type = 'application/x-www-form-urlencoded') {
  return new Request(origin + `/admin/applications/${id}/launch/action`, { method: 'POST', headers: { ...(from === null ? {} : { origin: from }), 'content-type': type }, body });
}
const dependencies = { getAccess: async () => ({ state: 'ready' as const, access }), api: async () => Response.json(completed) };

test('launcher accepts only canonical public HTTPS entry URLs without query, credentials or fragments', () => {
  assert.equal(safeApplicationLaunchUrl(entry), entry);
  assert.equal(safeApplicationLaunchUrl('https://launch.example.test/'), 'https://launch.example.test/');
  for (const value of [undefined, null, [], '//evil.example/', 'javascript:alert(1)', 'data:text/html,Hi', 'http://launch.example.test/',
    'https://user:password@launch.example.test/', `${entry}?next=https://evil.example/`, `${entry}?`, `${entry}#`, `${entry}#section`,
    'https://127.0.0.1/', 'https://[::1]/', 'https://localhost/', 'https://box.localhost/', 'https://box.internal/', 'https://box.local/',
    'https://iam/', 'https://launch.example.test//evil.example/', 'https://launch.example.test/%2f%2fevil.example/',
    'https://launch.example.test/%5cpath', 'https://launch.example.test/%0aheader', entry + '\n', 'https://launch.example.test',
    'https://launch.example.test:443/', 'https://launch.example.test/' + 'x'.repeat(2048)]) assert.equal(safeApplicationLaunchUrl(value), null);
});

test('launch links require admission independently of discovery and never infer a grant from a provided URL', () => {
  assert.equal(applicationLaunchLink({ admission: 'authenticated_open', launchUrl: entry }), entry);
  assert.equal(applicationLaunchLink({ admission: 'grant_required', admitted: true, launchUrl: entry }), entry);
  for (const app of [{ admission: 'grant_required', launchUrl: entry }, { admission: 'grant_required', admitted: false, launchUrl: entry },
    { admission: 'unknown', admitted: true, launchUrl: entry }, { admission: 'authenticated_open', admitted: false, launchUrl: entry }, { admission: 'authenticated_open' },
    { admission: 'authenticated_open', launchUrl: 'javascript:alert(1)' }, { admission: 'grant_required', admitted: 'true' as unknown as boolean, launchUrl: entry }]) {
    assert.equal(applicationLaunchLink(app), null);
  }
});

test('operator launch parser strips private fields, checks the callback origin and derives eligible controls truthfully', () => {
  assert.deepEqual(parseApplicationLaunch({ ...detail, application: { ...app, providerSubject: 'private-subject' }, launch: { ...launch, credential: 'private-password' } }),
    { application: app, launch, canManage: true });
  assert.equal(parseApplicationLaunch({ ...detail, canManage: false })?.canManage, false);
  for (const changed of [{ launch: { ...launch, launchUrl: 'https://other.example.test/' } }, { launch: { ...launch, version: '0' } },
    { launch: { ...launch, updatedAt: 'invalid' } }, { launch: { ...launch, reference: 'free form notes' } },
    { launch: { ...launch, updatedAt: null } }, { application: { ...app, clientId: 'accesslobby-web' } },
    { application: { ...app, trustClass: 'external' } }, { application: { ...app, status: 'suspended' } },
    { application: { ...app, redirectUri: 'javascript:alert(1)' } }, { contract: 'unknown' }]) {
    assert.equal(parseApplicationLaunch({ ...detail, ...changed }), null);
  }
  assert.equal(parseApplicationLaunch({ ...detail, application: { ...app, status: 'suspended' }, canManage: false })?.application.status, 'suspended');
  assert.equal(parseApplicationLaunch({ ...detail, launch: { ...launch, launchUrl: null, updatedAt: null, reference: null } })?.launch.launchUrl, null);
});

test('launch forms reject cross-origin, signed-out and current read-only authority before a write', async () => {
  let reads = 0, writes = 0;
  const counted = { getAccess: async () => { reads++; return { state: 'ready' as const, access }; }, api: async () => { writes++; return Response.json(completed); } };
  for (const from of [null, 'https://other.example/', 'null']) assert.equal((await handleApplicationLaunch(request(undefined, from), origin, id, counted)).status, 403);
  assert.equal(reads, 0);
  const readOnly = { ...access, roles: ['support_reader' as const], capabilities: { ...access.capabilities, activateApplications: false } };
  assert.equal((await handleApplicationLaunch(request(), origin, id, { ...counted, getAccess: async () => ({ state: 'ready', access: readOnly }) })).status, 403);
  assert.equal((await handleApplicationLaunch(request(), origin, id, { ...counted, getAccess: async () => ({ state: 'forbidden' }) })).status, 403);
  assert.equal((await handleApplicationLaunch(request(), origin, id, { ...counted, getAccess: async () => ({ state: 'signed-out' }) })).headers.get('location'), origin + '/auth/login');
  assert.equal((await handleApplicationLaunch(request(), origin, '../other', counted)).status, 404);
  assert.equal(writes, 0);
});

test('native launch forms bound bytes and reject duplicate, extra authority and return fields', async () => {
  let writes = 0;
  const duplicate = new URLSearchParams(fields); duplicate.append('launchUrl', 'https://other.example/');
  const deps = { ...dependencies, api: async () => { writes++; return Response.json(completed); } };
  for (const body of [duplicate, new URLSearchParams({ ...fields, returnTo: 'https://evil.example/' }), new URLSearchParams({ ...fields, role: 'application_operator' }),
    new URLSearchParams({ ...fields, applicationId: id }), new URLSearchParams({ ...fields, expectedVersion: '0' }),
    new URLSearchParams({ ...fields, reference: 'free form private notes' }), new URLSearchParams({ ...fields, launchUrl: 'javascript:alert(1)' }),
    new URLSearchParams({ ...fields, reference: 'x'.repeat(8193) }), new Uint8Array([0xff, 0xfe])]) {
    assert.equal((await handleApplicationLaunch(request(body), origin, id, deps)).status, 400);
  }
  assert.equal((await handleApplicationLaunch(request(JSON.stringify(fields), origin, 'application/json'), origin, id, deps)).status, 400);
  assert.equal(writes, 0);
});

test('authorized launch and removal forms forward exact metadata and return only fixed same-origin destinations', async () => {
  const calls: unknown[] = [];
  const response = await handleApplicationLaunch(request(), origin, id, { ...dependencies, api: async (path, init) => { calls.push({ path, init }); return Response.json(completed); } });
  assert.equal(response.status, 303); assert.match(response.headers.get('cache-control')!, /private, no-store/);
  assert.equal(response.headers.get('location'), origin + `/admin/applications/${id}/launch?notice=saved`);
  assert.deepEqual(calls, [{ path: `/v1/admin/applications/${id}/launch`, init: { method: 'POST', body: { launchUrl: entry, expectedVersion: fields.expectedVersion, reference: fields.reference } } }]);
  const removed = await handleApplicationLaunch(request(new URLSearchParams({ ...fields, launchUrl: '' })), origin, id, { ...dependencies,
    api: async (path, init) => { assert.equal((init.body as { launchUrl: unknown }).launchUrl, null); return Response.json({ ...completed, launch: { ...launch, launchUrl: null } }); } });
  assert.equal(removed.headers.get('location'), origin + `/admin/applications/${id}/launch?notice=removed`);
});

test('stale, protected and revoked results remain explicit while transport and unknown errors stay private', async () => {
  for (const [status, error] of [[409, 'stale_application_launch'], [409, 'application_launch_reference_conflict'], [403, 'protected_application']] as const) {
    const result = await handleApplicationLaunch(request(), origin, id, { ...dependencies, api: async () => Response.json({ error }, { status }) });
    assert.equal(result.headers.get('location'), origin + `/admin/applications/${id}/launch?notice=${error}`);
  }
  assert.equal((await handleApplicationLaunch(request(), origin, id, { ...dependencies, api: async () => Response.json({ error: 'operator_access_denied' }, { status: 403 }) })).status, 403);
  assert.equal((await handleApplicationLaunch(request(), origin, id, { ...dependencies, api: async () => new Response(null, { status: 401 }) })).headers.get('location'), origin + '/auth/login');
  for (const api of [async () => Response.json({ error: 'private-canary' }, { status: 500 }), async () => { throw new Error('private transport token'); }]) {
    assert.equal((await handleApplicationLaunch(request(), origin, id, { ...dependencies, api })).headers.get('location'), origin + `/admin/applications/${id}/launch?notice=unavailable`);
  }
});

test('old idempotent replay reports current state neutrally and malformed success cannot claim a saved link', async () => {
  const replay = await handleApplicationLaunch(request(), origin, id, { ...dependencies,
    api: async () => Response.json({ ...completed, changed: false, launch: { ...launch, launchUrl: 'https://launch.example.test/later', reference: 'issue:later-command' } }) });
  assert.match(replay.headers.get('location')!, /notice=unchanged$/);
  for (const changed of [{ launch: { ...launch, launchUrl: 'https://launch.example.test/other' } }, { launch: { ...launch, version: fields.expectedVersion } },
    { launch: { ...launch, reference: 'issue:another-command' } }, { application: { ...app, id: 'c76d5f6b-f8f6-413b-b06b-19bfc95ff187' } },
    { canManage: false }, { changed: 'true' }]) {
    const response = await handleApplicationLaunch(request(), origin, id, { ...dependencies, api: async () => Response.json({ ...completed, ...changed }) });
    assert.match(response.headers.get('location')!, /notice=unavailable$/);
  }
});

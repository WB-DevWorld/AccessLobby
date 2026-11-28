import type { CurrentIdentityResult } from './current-identity-model';

export const accountSessionsContract = 'accesslobby.account-sessions.v0.1';
export const accountSecurityEventsContract = 'accesslobby.account-security-events.v0.1';
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
export const recordedSessionHandle = (value: unknown): value is string => typeof value === 'string' &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
const snapshot = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const date = (value: unknown): value is string => typeof value === 'string' && value.length <= 40 && Number.isFinite(Date.parse(value));
export type RecordedAppSession = { handle: string; clientId: string; applicationName: string | null;
  createdAt: string; expiresAt: string; receiptCount: number; expectedState: string; currentBrowser: boolean };
export type AccountSessions = { sessions: RecordedAppSession[]; nextCursor: string | null };
export type AccountSecurityEvent = { id: string; action: 'app_session_ended'; clientId: string; applicationName: string | null;
  occurredAt: string; receiptCount: number };
export type AccountSecurityHistory = { events: AccountSecurityEvent[]; nextCursor: string | null };

export function parseAccountSecurityHistory(value: unknown): AccountSecurityHistory | null {
  if (!record(value) || value.contract !== accountSecurityEventsContract || !Array.isArray(value.events) || value.events.length > 25 ||
      !(value.nextCursor === null || recordedSessionHandle(value.nextCursor))) return null;
  const events: AccountSecurityEvent[] = [];
  for (const item of value.events) {
    if (!record(item) || !recordedSessionHandle(item.id) || item.action !== 'app_session_ended' || typeof item.clientId !== 'string' ||
        !/^[a-z0-9_-]{1,80}$/.test(item.clientId) || !(item.applicationName === null || typeof item.applicationName === 'string' &&
          item.applicationName.length >= 2 && item.applicationName.length <= 120 && !/[\x00-\x1f\x7f]/.test(item.applicationName)) ||
        !date(item.occurredAt) || typeof item.receiptCount !== 'number' || !Number.isSafeInteger(item.receiptCount) || item.receiptCount < 1) return null;
    events.push({ id: item.id, action: item.action, clientId: item.clientId, applicationName: item.applicationName,
      occurredAt: item.occurredAt, receiptCount: item.receiptCount });
  }
  if (new Set(events.map(event => event.id.toLowerCase())).size !== events.length) return null;
  return { events, nextCursor: value.nextCursor };
}

export function accountSecurityEventsPath(after: unknown): string | null {
  if (after === undefined) return '/v1/account/security-events';
  return recordedSessionHandle(after) ? `/v1/account/security-events?after=${encodeURIComponent(after.toLowerCase())}` : null;
}

export function parseAccountSessions(value: unknown): AccountSessions | null {
  if (!record(value) || value.contract !== accountSessionsContract || !Array.isArray(value.sessions) || value.sessions.length > 25 ||
      !(value.nextCursor === null || recordedSessionHandle(value.nextCursor))) return null;
  const sessions: RecordedAppSession[] = [];
  for (const item of value.sessions) {
    if (!record(item) || !recordedSessionHandle(item.handle) || typeof item.clientId !== 'string' || !/^[a-z0-9_-]{1,80}$/.test(item.clientId) ||
        !(item.applicationName === null || typeof item.applicationName === 'string' && item.applicationName.length >= 2 && item.applicationName.length <= 120 &&
          !/[\x00-\x1f\x7f]/.test(item.applicationName)) || !date(item.createdAt) || !date(item.expiresAt) ||
        typeof item.receiptCount !== 'number' || !Number.isSafeInteger(item.receiptCount) || item.receiptCount < 1 ||
        !snapshot(item.expectedState) || typeof item.currentBrowser !== 'boolean') return null;
    sessions.push({ handle: item.handle, clientId: item.clientId, applicationName: item.applicationName,
      createdAt: item.createdAt, expiresAt: item.expiresAt, receiptCount: item.receiptCount,
      expectedState: item.expectedState, currentBrowser: item.currentBrowser });
  }
  if (new Set(sessions.map(session => session.handle.toLowerCase())).size !== sessions.length) return null;
  return { sessions, nextCursor: value.nextCursor };
}

export function accountSessionsPath(after: unknown): string | null {
  if (after === undefined) return '/v1/account/sessions';
  return recordedSessionHandle(after) ? `/v1/account/sessions?after=${encodeURIComponent(after.toLowerCase())}` : null;
}

export const accountSessionNotices: Record<string, string> = {
  ended: 'Recorded session ended. The app applies this on its next session check.',
  unchanged: 'This request was already completed. Newer sign-ins were left alone.',
  app_session_snapshot_changed: 'This session changed. Refresh the list before ending it.',
  app_session_not_found: 'That recorded session is no longer available. Check the current list.',
  app_session_end_already_recorded: 'A different request already ended that record. Check the current list.',
  invalid_app_session_end: 'Check the recorded session and confirmation before trying again.',
  unavailable: 'The result could not be confirmed. Check the current list before retrying.',
};

const noStore = { 'cache-control': 'private, no-store, max-age=0' };
const error = (text: string, status: number) => new Response(text, { status, headers: noStore });
const redirect = (path: string, origin: string) => new Response(null, { status: 303, headers: { ...noStore, location: new URL(path, origin).href } });
type Dependencies = { getIdentity: () => Promise<CurrentIdentityResult>;
  api: (path: string, init: { method: string; body: object }) => Promise<Response> };

async function form(request: Request): Promise<URLSearchParams | null> {
  if (request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/x-www-form-urlencoded' || !request.body) return null;
  const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength;
      if (size > 4096) { await reader.cancel(); return null; } chunks.push(part.value); }
    const all = new Uint8Array(size); let index = 0;
    for (const chunk of chunks) { all.set(chunk, index); index += chunk.length; }
    return new URLSearchParams(new TextDecoder('utf-8', { fatal: true }).decode(all));
  } catch { return null; } finally { reader.releaseLock(); }
}

export async function handleAccountSessionEnd(request: Request, origin: string, dependencies: Dependencies): Promise<Response> {
  if (request.method !== 'POST') return error('Method not allowed', 405);
  if (request.headers.get('origin') !== origin) return error('Origin rejected', 403);
  let identity: CurrentIdentityResult;
  try { identity = await dependencies.getIdentity(); } catch { return error('Account unavailable', 503); }
  if (identity.state === 'signed-out') return redirect('/auth/login', origin);
  if (identity.state === 'restricted') return error('Account unavailable', 403);
  if (identity.state !== 'ready' || identity.person.status !== 'active') return error('Account unavailable', 503);
  const body = await form(request), keys = ['intent', 'handle', 'expectedState', 'confirmEnd'];
  if (!body || keys.some(key => body.getAll(key).length !== 1) || Array.from(body.keys()).some(key => !keys.includes(key))) {
    return error('Invalid recorded session action', 400);
  }
  const handle = body.get('handle'), expectedState = body.get('expectedState');
  if (body.get('intent') !== 'end-recorded-session' || !recordedSessionHandle(handle) || !snapshot(expectedState) || body.get('confirmEnd') !== 'yes') {
    return error('Confirm the recorded session to end', 400);
  }
  const normalizedHandle = handle.toLowerCase();
  let notice = 'unavailable';
  try {
    const response = await dependencies.api(`/v1/account/sessions/${normalizedHandle}/end`, { method: 'POST', body: { expectedState } });
    if (response.status === 401) return redirect('/auth/login', origin);
    if (response.status === 403) return error('Account unavailable', 403);
    const value = await response.json().catch(() => ({})) as { contract?: string; handle?: string; ended?: boolean; changed?: boolean; error?: string };
    if (response.ok && value.contract === accountSessionsContract && value.handle === normalizedHandle && value.ended === true && typeof value.changed === 'boolean') {
      notice = value.changed ? 'ended' : 'unchanged';
    } else if (!response.ok && typeof value.error === 'string' && Object.hasOwn(accountSessionNotices, value.error)) notice = value.error;
  } catch { /* An uncertain reply does not establish that the action failed. */ }
  return redirect(`/security?notice=${encodeURIComponent(notice)}`, origin);
}

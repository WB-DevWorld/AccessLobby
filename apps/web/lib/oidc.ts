import { createRemoteJWKSet, jwtVerify, EncryptJWT, jwtDecrypt } from 'jose';
import { randomBytes, createHash } from 'node:crypto';

const base64url = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64url');
const required = (key: string) => {
  const value = process.env[key];
  if (!value) throw new Error(`Missing ${key}`);
  return value;
};
export const origin = () => new URL(required('WEB_BASE_URL')).origin;
export const issuer = () => required('OIDC_ISSUER');
export const clientId = () => required('OIDC_CLIENT_ID');
export const callbackUrl = () => `${origin()}/auth/callback`;
export const secureCookie = () => origin().startsWith('https://');
export const flowCookie = () => secureCookie() ? '__Host-al-flow' : 'al-flow';
export const sessionCookie = () => secureCookie() ? '__Host-al-session' : 'al-session';
export function clearCookie(response: { cookies: { set: (name: string, value: string, options: Record<string, unknown>) => void } }, name: string) {
  response.cookies.set(name, '', { httpOnly: true, secure: secureCookie(), sameSite: 'lax', path: '/', maxAge: 0 });
}

function key() {
  const bytes = Buffer.from(required('SESSION_SECRET'), 'base64url');
  if (bytes.length !== 32) throw new Error('SESSION_SECRET must encode 32 random bytes');
  return bytes;
}
export async function seal(value: Record<string, unknown>, seconds: number) {
  return new EncryptJWT(value).setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
    .setIssuedAt().setExpirationTime(`${seconds}s`).encrypt(key());
}
export async function unseal(value: string) {
  const { payload } = await jwtDecrypt(value, key(), { clockTolerance: 5 });
  return payload;
}

interface Discovery { issuer: string; authorization_endpoint: string; token_endpoint: string; jwks_uri: string; end_session_endpoint: string }
export async function discover(): Promise<Discovery> {
  const configured = issuer();
  const url = new URL(configured);
  if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
    throw new Error('OIDC issuer requires HTTPS');
  }
  const response = await fetch(`${configured}/.well-known/openid-configuration`, { cache: 'no-store', signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error('Issuer unavailable');
  const doc = await response.json() as Discovery;
  if (doc.issuer !== configured) throw new Error('Issuer mismatch');
  for (const endpoint of [doc.authorization_endpoint, doc.token_endpoint, doc.jwks_uri, doc.end_session_endpoint]) {
    if (new URL(endpoint).origin !== url.origin) throw new Error('OIDC endpoint origin mismatch');
  }
  return doc;
}
export function challenge() {
  const state = base64url(randomBytes(32));
  const nonce = base64url(randomBytes(32));
  const verifier = base64url(randomBytes(32));
  const codeChallenge = base64url(createHash('sha256').update(verifier).digest());
  return { state, nonce, verifier, codeChallenge };
}
export async function exchange(code: string, verifier: string, nonce: string) {
  const doc = await discover();
  const body = new URLSearchParams({ grant_type: 'authorization_code', client_id: clientId(), code,
    code_verifier: verifier, redirect_uri: callbackUrl() });
  const response = await fetch(doc.token_endpoint, { method: 'POST', body,
    headers: { 'content-type': 'application/x-www-form-urlencoded' }, cache: 'no-store', signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error('Code exchange failed');
  const tokens = await response.json() as { access_token: string; id_token: string; expires_in: number };
  if (!tokens.access_token || !tokens.id_token || !Number.isFinite(tokens.expires_in)) throw new Error('Invalid token response');
  await jwtVerify(tokens.id_token, createRemoteJWKSet(new URL(doc.jwks_uri)), {
    issuer: issuer(), audience: clientId(), algorithms: ['RS256'], clockTolerance: 5
  }).then(({ payload }) => { if (payload.nonce !== nonce) throw new Error('Nonce mismatch'); });
  return tokens;
}

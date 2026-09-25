import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import type { Config } from './config.js';

export interface AuthenticatedSubject { issuer: string; subject: string; client: string }
export type VerifyToken = (token: string) => Promise<AuthenticatedSubject>;

export async function discovery(issuer: string) {
  const response = await fetch(`${issuer}/.well-known/openid-configuration`, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error('OIDC discovery unavailable');
  const document = await response.json() as { issuer?: string; jwks_uri?: string };
  if (document.issuer !== issuer || !document.jwks_uri) throw new Error('OIDC discovery issuer mismatch');
  const jwks = new URL(document.jwks_uri);
  if (jwks.protocol !== new URL(issuer).protocol || jwks.origin !== new URL(issuer).origin) {
    throw new Error('OIDC JWKS origin mismatch');
  }
  return document.jwks_uri;
}

export function tokenVerifier(settings: Config, jwksUri: string): VerifyToken {
  const keys = createRemoteJWKSet(new URL(jwksUri));
  return async token => {
    const { payload } = await jwtVerify(token, keys, {
      issuer: settings.issuer, audience: settings.audience,
      algorithms: ['RS256'], clockTolerance: 5
    });
    return validateClaims(payload, settings);
  };
}

export function validateClaims(payload: JWTPayload, settings: Config): AuthenticatedSubject {
  const client = payload.azp;
  if (typeof payload.sub !== 'string' || !payload.sub ||
      payload.iss !== settings.issuer || typeof client !== 'string' ||
      !settings.allowedClients.includes(client)) {
    throw new Error('Invalid subject or client');
  }
  return { issuer: payload.iss, subject: payload.sub, client };
}

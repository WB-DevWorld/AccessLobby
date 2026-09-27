import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { Pool } from 'pg';

const eventName = 'http://schemas.openid.net/event/backchannel-logout';

export function logoutVerifier(issuer: string, jwksUri: string, clientId: string) {
  const keys = createRemoteJWKSet(new URL(jwksUri));
  return async (token: string) => {
    const { payload } = await jwtVerify(token, keys, {
      issuer, audience: clientId, algorithms: ['RS256'], clockTolerance: 5, maxTokenAge: '5 minutes'
    });
    const events = payload.events as Record<string, unknown> | undefined;
    if (!events || typeof events !== 'object' ||
        !Object.hasOwn(events, eventName) ||
        events[eventName] === null || typeof events[eventName] !== 'object' ||
        Object.keys(events).length !== 1 ||
        typeof payload.sid !== 'string' || !payload.sid ||
        typeof payload.jti !== 'string' || !payload.jti ||
        typeof payload.iat !== 'number' || 'nonce' in payload) {
      throw new Error('Invalid logout token');
    }
    return { sid: payload.sid, jti: payload.jti };
  };
}

export class SessionRevocations {
  constructor(private readonly pool: Pool) {}

  async revoke(issuer: string, sid: string, jti: string) {
    const db = await this.pool.connect();
    try {
      await db.query('BEGIN');
      await db.query("DELETE FROM oidc_logout_events WHERE received_at < now() - interval '2 hours'");
      await db.query('DELETE FROM revoked_oidc_sessions WHERE expires_at < now()');
      const prior = await db.query('INSERT INTO oidc_logout_events (issuer, jti) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING jti', [issuer, jti]);
      if (!prior.rowCount) { await db.query('ROLLBACK'); return false; }
      await db.query(`INSERT INTO revoked_oidc_sessions (issuer, sid, expires_at)
        VALUES ($1, $2, now() + interval '2 hours')
        ON CONFLICT (issuer, sid) DO UPDATE SET expires_at = GREATEST(revoked_oidc_sessions.expires_at, EXCLUDED.expires_at)`, [issuer, sid]);
      await db.query('COMMIT');
      return true;
    } catch (error) { await db.query('ROLLBACK'); throw error; }
    finally { db.release(); }
  }

  async isRevoked(issuer: string, sid: string) {
    const result = await this.pool.query(`SELECT 1 FROM revoked_oidc_sessions
      WHERE issuer = $1 AND sid = $2 AND expires_at > now()`, [issuer, sid]);
    return Boolean(result.rowCount);
  }
}

import { jwtVerify } from 'jose';

export const BACKCHANNEL_EVENT = 'http://schemas.openid.net/event/backchannel-logout';

/** Validate the issuer's logout token before deleting any local sessions. */
export async function verifyLogoutToken(token, keys, issuer, clientId) {
  const { payload } = await jwtVerify(token, keys, {
    issuer, audience: clientId, algorithms: ['RS256'], clockTolerance: 5,
    maxTokenAge: '5 minutes'
  });
  if (!payload.events || typeof payload.events !== 'object' ||
      !Object.hasOwn(payload.events, BACKCHANNEL_EVENT) ||
      payload.events[BACKCHANNEL_EVENT] === null ||
      typeof payload.events[BACKCHANNEL_EVENT] !== 'object' ||
      Object.keys(payload.events).length !== 1 ||
      typeof payload.jti !== 'string' || !payload.jti ||
      typeof payload.iat !== 'number' ||
      ('nonce' in payload) ||
      (!payload.sid && !payload.sub) ||
      (payload.sid !== undefined && (typeof payload.sid !== 'string' || !payload.sid)) ||
      (payload.sub !== undefined && (typeof payload.sub !== 'string' || !payload.sub))) {
    throw new Error('Invalid backchannel logout token');
  }
  return { sid: payload.sid, sub: payload.sub, jti: payload.jti };
}

export function removeSessions(sessions, logout) {
  for (const [id, session] of sessions) {
    // When both claims are present, both must match the local session.
    if ((!logout.sid || session.sid === logout.sid) &&
        (!logout.sub || session.subject === logout.sub)) sessions.delete(id);
  }
}

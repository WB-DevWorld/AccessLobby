/** Server-only durable marker; the issuer still ends its browser SSO session through RP logout. */
export async function recordSharedSessionEnd(accessToken: string, apiBase: string, fetcher: typeof fetch = fetch) {
  const response = await fetcher(`${apiBase.replace(/\/$/, '')}/v1/session/end`, {
    method: 'POST', headers: { authorization: `Bearer ${accessToken}` },
    cache: 'no-store', signal: AbortSignal.timeout(5000),
  });
  if (response.status === 404) return 'legacy' as const;
  if (!response.ok) throw new Error('shared_logout_marker_unavailable');
  const value = await response.json() as { contract?: string; ended?: boolean };
  if (value.contract !== 'accesslobby.browser-session.v0.1' || value.ended !== true) throw new Error('invalid_logout_marker_response');
  return 'recorded' as const;
}

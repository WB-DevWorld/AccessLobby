const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class AppEntryError extends Error {
  constructor(status) { super(status === 403 ? 'Application entry denied' : 'Application entry unavailable'); this.status = status; }
}

export async function loadAppEntry(api, session, clientId, fetcher = fetch) {
  if (!session.accessToken) throw new AppEntryError(503);
  let response, result;
  try {
    response = await fetcher(`${api}/v1/application-entry`, {
      headers: { authorization: `Bearer ${session.accessToken}` }, signal: AbortSignal.timeout(5000),
    });
    if (response.status === 403) throw new AppEntryError(403);
    if (!response.ok) throw new AppEntryError(503);
    result = await response.json();
  } catch (error) { throw error instanceof AppEntryError ? error : new AppEntryError(503); }
  if (result.contract !== 'accesslobby.app-entry.v0.1' || result.clientId !== clientId ||
      result.admitted !== true || !uuid.test(result.applicationId)) throw new AppEntryError(503);
  return result.applicationId;
}

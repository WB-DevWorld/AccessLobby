import { randomUUID } from 'node:crypto';

const safeRequestId = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(value)
  ? value : randomUUID();

const knownRoutes = new Set([
  '/', '/health/live', '/health/ready', '/login', '/register', '/connect',
  '/callback', '/account-choice', '/join', '/logout-accesslobby', '/logout',
  '/backchannel-logout', '/private', '/legacy-login',
]);

export function traceRequest(request, response) {
  const requestId = safeRequestId(request.headers['x-request-id']);
  const pathname = typeof request.url === 'string' ? request.url.split('?', 1)[0] : '';
  const route = knownRoutes.has(pathname) ? pathname : 'other';
  const started = process.hrtime.bigint();
  response.setHeader('x-request-id', requestId);
  let recorded = false;
  const record = completed => {
    if (recorded) return;
    recorded = true;
    console.info(JSON.stringify({
      event: 'consumer.request', at: new Date().toISOString(), requestId,
      method: request.method, route, status: response.statusCode, completed,
      durationMs: Math.round(Number(process.hrtime.bigint() - started) / 1e6),
    }));
  };
  response.once('finish', () => record(true));
  response.once('close', () => record(false));
  return requestId;
}

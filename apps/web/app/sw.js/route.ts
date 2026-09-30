import { serviceWorkerSource } from '@/lib/pwa-worker';

export const dynamic = 'force-dynamic';

export function GET() {
  const sha = process.env.GIT_SHA;
  const buildId = sha && /^[0-9a-f]{40}$/.test(sha) ? sha : 'local-build';
  return new Response(serviceWorkerSource(buildId), {
    headers: {
      'Content-Type': 'text/javascript; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Service-Worker-Allowed': '/',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

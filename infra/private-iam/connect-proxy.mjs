#!/usr/bin/env node
// Local, one-authority raw TLS tunnel. It is deliberately not a general proxy.
import http from 'node:http';
import net from 'node:net';
import { pathToFileURL } from 'node:url';

export function parseOrigin(value) {
  let u;
  try { u = new URL(value); } catch { throw new Error('unsafe_origin'); }
  const host = u.hostname;
  if (u.protocol !== 'https:' || u.username || u.password || u.search || u.hash || u.pathname !== '/' ||
      !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(host) || !host.includes('.') || host.includes('..') ||
      /^[0-9.]+$/.test(host) || host.endsWith('.localhost') || host.split('.').some(x => x.length > 63 || x.startsWith('-') || x.endsWith('-')) ||
      value.replace(/\/$/, '') !== u.origin) throw new Error('unsafe_origin');
  const port = Number(u.port || 443);
  if (port !== 443 && (port < 1024 || port > 65535)) throw new Error('unsafe_origin');
  return { origin: u.origin, authority: `${host}:${port}` };
}

export async function createConnectProxy({ canonicalOrigin, tunnelPort, listenPort = 0 }) {
  const { authority } = parseOrigin(canonicalOrigin);
  if (!Number.isInteger(tunnelPort) || tunnelPort < 1024 || tunnelPort > 65535 ||
      !Number.isInteger(listenPort) || listenPort < 0 || listenPort > 65535 || (listenPort > 0 && listenPort < 1024)) throw new Error('unsafe_port');
  const sockets = new Set();
  const server = http.createServer({ maxHeaderSize: 4096 }, (_req, res) => { res.writeHead(405, { Connection: 'close' }); res.end(); });
  server.headersTimeout = 5000;
  server.requestTimeout = 5000;
  server.maxConnections = 32;
  server.on('connection', s => { sockets.add(s); s.on('close', () => sockets.delete(s)); s.on('error', () => {}); });
  server.on('clientError', (_error, socket) => socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n'));
  server.on('connect', (req, client, head) => {
    if (req.url !== authority || head.length > 65536) { client.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); return; }
    const upstream = net.connect({ host: '127.0.0.1', port: tunnelPort });
    sockets.add(upstream);
    upstream.setTimeout(120000, () => upstream.destroy());
    client.setTimeout(120000, () => client.destroy());
    upstream.on('connect', () => { client.write('HTTP/1.1 200 Connection Established\r\n\r\n'); if (head.length) upstream.write(head); client.pipe(upstream); upstream.pipe(client); });
    upstream.on('error', () => { if (!client.destroyed) client.end('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n'); });
    upstream.on('close', () => { sockets.delete(upstream); client.destroy(); });
    client.on('close', () => upstream.destroy());
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(listenPort, '127.0.0.1', resolve); });
  return { port: server.address().port, close: async () => { for (const socket of sockets) socket.destroy(); await new Promise(resolve => server.close(resolve)); } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const values = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!['--canonical-origin', '--tunnel-port', '--listen-port'].includes(args[i]) || !args[i + 1] || values[args[i]]) {
      process.stderr.write('private_tunnel_arguments_refused\n'); process.exit(1);
    }
    values[args[i]] = args[i + 1];
  }
  try {
    const proxy = await createConnectProxy({ canonicalOrigin: values['--canonical-origin'], tunnelPort: Number(values['--tunnel-port']), listenPort: Number(values['--listen-port'] || 18888) });
    process.stdout.write(JSON.stringify({ contract: 'accesslobby.private-iam-tunnel.v1', ready: true, loopbackOnly: true, listenPort: proxy.port }) + '\n');
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await proxy.close(); process.exit(0); });
  } catch { process.stderr.write('private_tunnel_preflight_refused\n'); process.exit(1); }
}

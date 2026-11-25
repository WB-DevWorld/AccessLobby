// Bounded credential-free TLS probe. DNS and TLS identity remain separate.
import https from 'node:https';
import tls from 'node:tls';
import { parseOrigin } from './connect-proxy.mjs';

export async function loopbackHttpsGet({ canonicalOrigin, tunnelPort, ca, path, hostOverride }) {
  const { origin } = parseOrigin(canonicalOrigin);
  const canonical = new URL(origin);
  if (!Number.isInteger(tunnelPort) || tunnelPort < 1024 || tunnelPort > 65535 ||
      !/^\/[a-zA-Z0-9/._-]*$/.test(path) || path.length > 1024 ||
      (hostOverride && !/^[a-z0-9.-]+(?::[0-9]{1,5})?$/.test(hostOverride))) throw new Error('unsafe_probe');
  const agent = new https.Agent({ keepAlive: false });
  agent.createConnection = () => tls.connect({ host: '127.0.0.1', port: tunnelPort,
    servername: canonical.hostname, ...(ca ? { ca } : {}) });
  return new Promise((resolve, reject) => {
    const request = https.request({ hostname: canonical.hostname, port: Number(canonical.port || 443),
      path, method: 'GET', agent, headers: { Host: hostOverride || canonical.host } }, response => {
      const authorized = response.socket.authorized === true;
      let bytes = 0;
      response.on('data', data => { bytes += data.length; if (bytes > 262144) request.destroy(new Error('bounded_response')); });
      response.on('end', () => { agent.destroy(); resolve({ status: response.statusCode, authorized }); });
      response.on('error', () => { agent.destroy(); reject(new Error('probe_response_failed')); });
    });
    request.setTimeout(8000, () => request.destroy(new Error('probe_timeout')));
    request.on('error', error => { agent.destroy(); reject(error); });
    request.end();
  });
}

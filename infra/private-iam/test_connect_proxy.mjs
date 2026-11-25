import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import tls from 'node:tls';
import https from 'node:https';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createConnectProxy, parseOrigin } from './connect-proxy.mjs';
import { loopbackHttpsGet } from './loopback-https.mjs';
import { errorCategory, logCategories } from './diagnostics.mjs';

test('unsafe origins, browser port substitution and unsafe target ports are refused', async () => {
  for (const value of ['http://iam.example.test', 'https://name:password@iam.example.test', 'https://iam.example.test/admin', 'https://iam.example.test?code=x', 'https://127.0.0.1', 'https://iam.example.test:80', 'https://iam.example.test:443']) assert.throws(() => parseOrigin(value));
  assert.equal(parseOrigin('https://iam.example.test').authority, 'iam.example.test:443');
  await assert.rejects(createConnectProxy({ canonicalOrigin: 'https://iam.example.test', tunnelPort: 80 }));
});

function request(port, text) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, '127.0.0.1', () => socket.write(text));
    let response = '';
    socket.setTimeout(5000, () => socket.destroy(new Error('request_timeout')));
    socket.on('error', reject);
    socket.on('data', data => { response += data; if (response.includes('\r\n\r\n')) { socket.destroy(); resolve(response.split('\r\n')[0]); } });
  });
}

test('only exact canonical CONNECT authority reaches loopback upstream', async () => {
  let received = 0;
  const upstream = net.createServer(socket => { received++; socket.end(); });
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  const proxy = await createConnectProxy({ canonicalOrigin: 'https://iam.example.test', tunnelPort: upstream.address().port });
  try {
    for (const authority of ['other.example.test:443', 'iam.example.test:8443', 'user@iam.example.test:443', 'iam.example.test:443/anything', '127.0.0.1:443']) {
      assert.match(await request(proxy.port, `CONNECT ${authority} HTTP/1.1\r\nHost: ${authority}\r\n\r\n`), /403/);
    }
    assert.match(await request(proxy.port, 'GET http://iam.example.test/ HTTP/1.1\r\nHost: iam.example.test\r\nConnection: close\r\n\r\n'), /405/);
    assert.equal(received, 0);
    assert.match(await request(proxy.port, 'CONNECT iam.example.test:443 HTTP/1.1\r\nHost: iam.example.test:443\r\n\r\n'), /200/);
    assert.equal(received, 1);
  } finally { await proxy.close(); await new Promise(resolve => upstream.close(resolve)); }
});

test('raw CONNECT preserves genuine TLS verification and rejects untrusted/wrong-name certificates', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'al-private-tls-unit-'));
  let server, proxy;
  try {
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '2', '-keyout', join(dir, 'key'), '-out', join(dir, 'cert'), '-subj', '/CN=iam.example.test', '-addext', 'subjectAltName=DNS:iam.example.test'], { stdio: 'ignore' });
    const cert = await readFile(join(dir, 'cert'));
    server = tls.createServer({ key: await readFile(join(dir, 'key')), cert }, socket => socket.end('trusted'));
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    proxy = await createConnectProxy({ canonicalOrigin: 'https://iam.example.test', tunnelPort: server.address().port });
    const connect = (servername, ca) => new Promise((resolve, reject) => {
      const raw = net.connect(proxy.port, '127.0.0.1', () => raw.write('CONNECT iam.example.test:443 HTTP/1.1\r\nHost: iam.example.test:443\r\n\r\n'));
      raw.once('error', reject);
      raw.once('data', data => {
        assert.match(data.toString(), /200 Connection Established/);
        const secure = tls.connect({ socket: raw, servername, ...(ca ? { ca } : {}) });
        secure.setTimeout(5000, () => secure.destroy(new Error('tls_timeout')));
        secure.once('error', reject);
        secure.once('secureConnect', () => { const authorized = secure.authorized; secure.destroy(); resolve(authorized); });
      });
    });
    assert.equal(await connect('iam.example.test', cert), true);
    await assert.rejects(connect('iam.example.test'), error => error.code === 'DEPTH_ZERO_SELF_SIGNED_CERT');
    await assert.rejects(connect('wrong.example.test', cert), error => error.code === 'ERR_TLS_CERT_ALTNAME_INVALID');
  } finally {
    if (proxy) await proxy.close();
    if (server) await new Promise(resolve => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  }
});

test('native loopback probe preserves canonical Host/SNI and genuine CA checks', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'al-private-probe-unit-'));
  let server;
  try {
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '2', '-keyout', join(dir, 'key'), '-out', join(dir, 'cert'), '-subj', '/CN=iam.example.test', '-addext', 'subjectAltName=DNS:iam.example.test'], { stdio: 'ignore' });
    const cert = await readFile(join(dir, 'cert'));
    let host, sni;
    server = https.createServer({ key: await readFile(join(dir, 'key')), cert }, (req, res) => {
      host = req.headers.host; sni = req.socket.servername;
      res.writeHead(200); res.end(req.url === '/oversize' ? 'x'.repeat(262145) : 'ready');
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const probe = { canonicalOrigin: 'https://iam.example.test:8443', tunnelPort: server.address().port, path: '/admin/master/console/' };
    assert.deepEqual(await loopbackHttpsGet({ ...probe, ca: cert }), { status: 200, authorized: true });
    assert.equal(host, 'iam.example.test:8443');
    assert.equal(sni, 'iam.example.test');
    assert.deepEqual(await loopbackHttpsGet({ ...probe, ca: cert, collectBody: true }), { status: 200, authorized: true, body: 'ready' });
    await assert.rejects(loopbackHttpsGet({ ...probe, ca: cert, path: '/oversize', collectBody: true }));
    await assert.rejects(loopbackHttpsGet(probe), error => error.code === 'DEPTH_ZERO_SELF_SIGNED_CERT');
    await assert.rejects(loopbackHttpsGet({ ...probe, canonicalOrigin: 'https://wrong.example.test:8443', ca: cert }), error => error.code === 'ERR_TLS_CERT_ALTNAME_INVALID');
    await assert.rejects(loopbackHttpsGet({ ...probe, ca: cert, path: '/admin?code=secret' }));
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  }
});

test('failure evidence retains categories and never exception/log contents', () => {
  const secret = 'PRIVATE_PASSWORD_CANARY_DO_NOT_PUBLISH';
  const categories = logCategories(`FATAL: password authentication failed ${secret}\n[emerg] cannot load certificate ${secret}`);
  assert.equal(categories.databaseAuthenticationFailed, true);
  assert.equal(categories.serverStartupFailed, true);
  assert.equal(categories.tlsConfigurationFailed, true);
  assert.equal(JSON.stringify(categories).includes(secret), false);
  assert.equal(errorCategory({ code: 'ECONNREFUSED', message: secret }), 'econnrefused');
  assert.equal(errorCategory({ code: secret, category: secret, message: secret }), 'assertion_or_prerequisite_failed');
});

#!/usr/bin/env python3
"""Root-only one-app activation. Credentials remain in the private process and stdin."""
import argparse
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
import time

PROJECT = 'accesslobby-accesslobbystaging-beass9'
RUNNER = r'''
import assert from 'node:assert/strict';
import { Pool } from 'pg';
import { provisionApp, matchesClient } from './dist/provision-app.js';
let input = '';
for await (const chunk of process.stdin) input += chunk;
const operator = JSON.parse(input);
input = '';
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1, statement_timeout: 5000 });
let session;
try {
  const issuer = 'https://iam.accesslobby.realjanelove.com/realms/accesslobby-first-party';
  assert.equal(process.env.OIDC_ISSUER, issuer, 'Unexpected staging issuer');
  assert.ok(['91e1a66167aa4a74dea44062e41849f8e8efb02c', '09a6a223fa3ea7189f1ebf89df7d8a110f6ce28b'].includes(process.env.GIT_SHA),
    'API source differs from the reviewed staging baseline');
  const found = await pool.query('SELECT * FROM applications WHERE client_id = $1', ['enben-staging-open']);
  assert.equal(found.rows.length, 1, 'Expected one Enben request');
  const app = found.rows[0];
  assert.equal(app.admission, 'authenticated_open', 'Enben entry policy changed');
  assert.equal(app.visibility, 'discoverable', 'Enben visibility changed');
  const plan = await provisionApp(pool, app.id, '--plan', undefined, { issuer });
  const expected = {
    clientId: 'enben-staging-open', enabled: true, protocol: 'openid-connect', publicClient: true,
    standardFlowEnabled: true, implicitFlowEnabled: false, directAccessGrantsEnabled: false,
    serviceAccountsEnabled: false, redirectUris: ['https://enben.realjanelove.com/callback'],
    webOrigins: ['https://enben.realjanelove.com'], attributes: {
      'pkce.code.challenge.method': 'S256', 'post.logout.redirect.uris': 'https://enben.realjanelove.com/',
      'backchannel.logout.url': 'https://enben.realjanelove.com/backchannel-logout',
      'backchannel.logout.session.required': 'true',
    },
  };
  assert.equal(plan.client.name, 'Enben Notes staging', 'Enben name changed');
  assert.ok(matchesClient(plan.client, expected, plan.client.protocolMappers), 'Enben differs from the reviewed plan');
  const readiness = await fetch('http://127.0.0.1:3001/health/ready', { signal: AbortSignal.timeout(8000), redirect: 'error' });
  assert.ok(readiness.ok, 'Existing API is not ready');
  const signedIn = await fetch('http://iam:8080/realms/master/protocol/openid-connect/token', {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(8000),
    body: new URLSearchParams({ grant_type: 'password', client_id: 'admin-cli',
      username: operator.username, password: operator.password }),
  });
  operator.password = ''; operator.username = '';
  assert.ok(signedIn.ok, 'Existing protected operator sign-in failed; no app activation performed');
  session = await signedIn.json();
  const result = await withScopedClientToken({ base: 'http://iam:8080', issuer, adminToken: session.access_token },
    token => provisionApp(pool, app.id, '--activate-first-party', operator.review, { issuer, token }));
  const checked = await pool.query("SELECT status, trust_class, review_reference FROM applications WHERE id = $1", [app.id]);
  assert.equal(checked.rows[0].status, 'active');
  assert.equal(checked.rows[0].trust_class, 'first_party');
  assert.equal(checked.rows[0].review_reference, operator.review);
  console.log('ENBEN_ACTIVATION_AND_IAM_READBACK_PASS');
  console.log('Enben is active. The temporary operator client was removed.');
} catch (error) {
  console.error('Enben activation stopped: ' + error.message);
  process.exitCode = 1;
} finally {
  if (session?.refresh_token) {
    try {
      const response = await fetch('http://iam:8080/realms/master/protocol/openid-connect/logout', {
        method: 'POST', body: new URLSearchParams({ client_id: 'admin-cli', refresh_token: session.refresh_token }),
        redirect: 'error', signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error('logout');
    } catch { console.error('Private operator session cleanup failed; app status needs review.'); process.exitCode = 1; }
  }
  await pool.end();
}
'''


def private_backup(path):
    item = Path(path)
    info = item.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o077:
        raise ValueError('Use the root-only backup file from the completed restore check.')
    if info.st_size < 5 or not 0 <= time.time() - info.st_mtime <= 86400:
        raise ValueError('A current backup from the completed restore check is required.')
    with item.open('rb') as source:
        if source.read(5) != b'PGDMP':
            raise ValueError('Expected the PostgreSQL custom-format backup.')


def container(service):
    result = subprocess.run(['docker', 'ps', '-q', '--filter', f'label=com.docker.compose.project={PROJECT}',
                             '--filter', f'label=com.docker.compose.service={service}'],
                            check=True, capture_output=True, text=True, timeout=15)
    ids = result.stdout.split()
    if len(ids) != 1 or not re.fullmatch(r'[a-f0-9]{12,64}', ids[0]):
        raise ValueError(f'Expected one running staging {service} container.')
    return ids[0]


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--activate', action='store_true', help='Apply the exact reviewed Enben request')
    parser.add_argument('--review-reference', required=True, help='Reference to the actual recorded first-party review')
    parser.add_argument('--backup', required=True, help='Private backup whose isolated restore has passed')
    args = parser.parse_args(argv)
    if not args.activate:
        raise ValueError('No changes: --activate is required for this protected operator command.')
    if os.geteuid() != 0:
        raise ValueError('Run this only in the root VPS terminal.')
    if not re.fullmatch(r'[A-Za-z0-9._:/-]{4,120}', args.review_reference):
        raise ValueError('A recorded first-party review reference is required.')
    private_backup(args.backup)
    api, iam = container('api'), container('iam')
    # Capture only these two existing operator values. Never inspect or display the full environment.
    credentials = subprocess.run(['docker', 'exec', iam, '/bin/sh', '-c',
        'printf "%s\\0%s" "$KC_BOOTSTRAP_ADMIN_USERNAME" "$KC_BOOTSTRAP_ADMIN_PASSWORD"'],
        check=True, capture_output=True, timeout=15).stdout.split(b'\0')
    if len(credentials) != 2 or not all(credentials):
        raise ValueError('Existing protected operator credentials are unavailable. Do not paste secrets into chat.')
    payload = json.dumps({'username': credentials[0].decode(), 'password': credentials[1].decode(),
                          'review': args.review_reference})
    credentials = None
    helper = Path(__file__).with_name('private-client-token.mjs').read_text()
    result = subprocess.run(['docker', 'exec', '-i', api, 'node', '--input-type=module', '-e', helper + '\n' + RUNNER],
                            input=payload, text=True, timeout=180)
    payload = None
    return result.returncode


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (ValueError, OSError, subprocess.SubprocessError) as error:
        # Subprocess exceptions can contain command arguments; do not serialize them.
        print(str(error) if isinstance(error, ValueError) else 'Protected operator command failed; no credential details printed.', file=sys.stderr)
        sys.exit(1)

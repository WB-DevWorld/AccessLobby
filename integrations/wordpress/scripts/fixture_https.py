"""Nginx, PHP-FPM and TLS fixture for two disposable WordPress hostnames.

This is separate from the Windows HTTP gateway. Containers, certificates and host
entries are removed after the run. The sanitized report contains no credentials.
"""
from pathlib import Path
import hashlib
import json
import os
import shutil
import socket
import ssl
import subprocess
import time
import urllib.parse
import urllib.request
import uuid
import zipfile

EDGE_PORT = 8443
NAMES = ('a.alwp.test', 'b.alwp.test', 'auth.alwp.test', 'api.alwp.test')
HOSTS_MARK = '# alwp-https-fixture'
api_process = None


def main(args, plugin, repo, runtime):
    map_fixture_names()
    started = time.time()
    phases = {}
    report = {'profile': 'https-nginx-php-fpm', 'result': 'FAIL', 'phases': phases, 'commands': [
        'openssl req fixture CA and server certificate',
        'docker network create alwp-https',
        'docker build php:8.4-fpm mysqli curl',
        'docker run mariadb:11.4',
        'docker run postgres:17',
        'docker run quay.io/keycloak/keycloak:26.7.0',
        'docker run nginx:1.28-alpine',
        'wp core install inside php-fpm',
        'docker run axllent/mailpit:v1.21',
        'pnpm install --frozen-lockfile --filter @accesslobby/api...',
        'node tests/browser.mjs',
    ]}
    work = runtime / ('https-' + uuid.uuid4().hex[:8])
    work.mkdir(parents=True)
    retain = False
    containers = []
    network = 'alwp-https'
    ca = work / 'ca.crt'
    try:
        mark = time.monotonic()
        preflight(args, runtime, EDGE_PORT)
        phases['preflight'] = round(time.monotonic() - mark, 3)
        env = os.environ.copy()
        env['NO_PROXY'] = '127.0.0.1,localhost,.alwp.test,' + ','.join(NAMES)
        env['no_proxy'] = env['NO_PROXY']
        password = os.urandom(18).hex()
        db_password = os.urandom(18).hex()
        pg_password = os.urandom(18).hex()
        admin_password = os.urandom(18).hex()
        mark = time.monotonic()
        write_certificates(work, ca)
        trust_certificate(ca)
        ensure_hosts()
        phases['tls-and-names'] = round(time.monotonic() - mark, 3)
        subprocess.run(['docker', 'rm', '-f', *container_names()], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        subprocess.run(['docker', 'network', 'rm', network], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        run(['docker', 'network', 'create', network])
        mark = time.monotonic()
        run(['docker', 'build', '-t', 'alwp-fixture-php:8.4', str(plugin / 'fixture/https')])
        phases['php-image'] = round(time.monotonic() - mark, 3)
        mark = time.monotonic()
        start_data_services(network, containers, db_password, pg_password)
        phases['databases'] = round(time.monotonic() - mark, 3)
        issuer = f'https://auth.alwp.test:{EDGE_PORT}/realms/accesslobby-first-party'
        api = f'https://api.alwp.test:{EDGE_PORT}'
        sites = site_definitions(password)
        prepare_wordpress_trees(runtime, work, sites, db_password)
        mark = time.monotonic()
        start_mail(network, containers)
        start_keycloak(work, plugin, repo, network, containers, issuer, api, sites, admin_password, ca)
        start_edge_and_php(args, plugin, runtime, work, network, containers, ca, db_password)
        wait_https(issuer + '/.well-known/openid-configuration', ca, 180)
        assert_discovery(issuer, ca)
        phases['keycloak-and-edge'] = round(time.monotonic() - mark, 3)
        mark = time.monotonic()
        database_url = f'postgres://accesslobby:{pg_password}@alwp-https-pg:5432/accesslobby'
        install_wordpress(plugin, work, sites, password, issuer, api, db_password)
        prepare_api(repo, work, network, database_url, issuer, sites, ca)
        phases['wordpress'] = round(time.monotonic() - mark, 3)
        tls_probe(sites[0]['base'], ca, report)
        report['components'] = component_versions(work)
        report['assertions'] = load_assertions(work)
        mark = time.monotonic()
        browser = run_browser(repo, plugin, work, env, sites, issuer, api, password, ca)
        phases['browser'] = round(time.monotonic() - mark, 3)
        report['scenarios'] = [line for line in browser.splitlines() if line.startswith('FLOW ') or line == 'BROWSER_PASS']
        report['tls']['browser'] = browser_tls(browser)
        assert_browser_tls(report['tls']['browser'])
        lifecycle = run_lifecycle(sites[0])
        report['scenarios'].extend(line for line in lifecycle.splitlines() if line.startswith('LIFECYCLE '))
        report['result'] = 'PASS'
        print('QUALIFICATION_PASS profile=https artifacts=' + str(work), flush=True)
        return 0
    except Exception as error:
        retain = True
        report['error'] = type(error).__name__
        print('HTTPS fixture failed: ' + type(error).__name__, flush=True)
        raise
    finally:
        report['source'] = git_sha(repo)
        report['packageSha256'] = hashlib.sha256(args.package.read_bytes()).hexdigest()
        report['elapsedSeconds'] = round(time.time() - started, 3)
        destination = plugin / 'dist/https-qualification-report.json'
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(json.dumps(report, indent=2) + '\n')
        print('QUALIFICATION_REPORT ' + str(destination), flush=True)
        stop_api()
        if args.keep or retain:
            print('FIXTURE_RETAINED ' + str(work), flush=True)
        else:
            subprocess.run(['docker', 'rm', '-f', *container_names()], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            subprocess.run(['docker', 'network', 'rm', network], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            remove_hosts()
            untrust_certificate()
            shutil.rmtree(work, ignore_errors=True)


def map_fixture_names():
    original = socket.getaddrinfo

    def mapped(host, port, *args, **kwargs):
        if isinstance(host, str) and host.endswith('.alwp.test'):
            host = '127.0.0.1'
        return original(host, port, *args, **kwargs)

    socket.getaddrinfo = mapped


def container_names():
    return ['alwp-https-nginx', 'alwp-https-php', 'alwp-https-keycloak', 'alwp-https-api', 'alwp-https-mail', 'alwp-https-maria', 'alwp-https-pg']


def preflight(args, runtime, port):
    required = [args.package, runtime / 'wordpress.zip', runtime / 'woocommerce.zip', runtime / 'wp-cli.phar']
    missing = [str(path) for path in required if not path.is_file()]
    if missing:
        raise SystemExit('PREFLIGHT missing files: ' + ', '.join(missing))
    if shutil.which('docker') is None or openssl_bin() is None:
        raise SystemExit('PREFLIGHT requires docker and openssl')
    busy = []
    for candidate in (port, 3308, 54330, 18025):
        try:
            with socket.create_connection(('127.0.0.1', candidate), timeout=0.2):
                busy.append(candidate)
        except OSError:
            pass
    if busy:
        raise SystemExit('PREFLIGHT ports already in use: ' + ', '.join(str(item) for item in busy))
    print('PREFLIGHT https files, docker and ports accepted', flush=True)


def openssl_bin():
    found = shutil.which('openssl')
    if found:
        return found
    candidate = Path(r'C:\Program Files\Git\usr\bin\openssl.exe')
    return str(candidate) if candidate.is_file() else None


def write_certificates(work, ca_path):
    openssl = openssl_bin()
    key = work / 'ca.key'
    san = work / 'san.cnf'
    san.write_text('subjectAltName=DNS:a.alwp.test,DNS:b.alwp.test,DNS:auth.alwp.test,DNS:api.alwp.test\n'
                   'basicConstraints=CA:FALSE\nkeyUsage=digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n')
    run([openssl, 'req', '-x509', '-newkey', 'rsa:2048', '-keyout', str(key), '-out', str(ca_path),
         '-days', '2', '-nodes', '-subj', '/CN=AccessLobby Fixture CA',
         '-addext', 'basicConstraints=critical,CA:TRUE', '-addext', 'keyUsage=critical,keyCertSign,cRLSign'])
    run([openssl, 'req', '-newkey', 'rsa:2048', '-keyout', str(work / 'tls.key'), '-out', str(work / 'tls.csr'),
         '-nodes', '-subj', '/CN=a.alwp.test'])
    run([openssl, 'x509', '-req', '-in', str(work / 'tls.csr'), '-CA', str(ca_path), '-CAkey', str(key),
         '-CAcreateserial', '-out', str(work / 'tls.crt'), '-days', '2', '-extfile', str(san)])
    key.unlink()


def hosts_path():
    return Path(r'C:\Windows\System32\drivers\etc\hosts') if os.name == 'nt' else Path('/etc/hosts')


def ensure_hosts():
    path = hosts_path()
    line = '127.0.0.1 ' + ' '.join(NAMES) + ' ' + HOSTS_MARK + '\n'
    try:
        current = path.read_text(encoding='utf-8', errors='replace')
        if HOSTS_MARK not in current:
            with path.open('a', encoding='utf-8') as handle:
                handle.write(line)
    except OSError:
        if os.name == 'nt':
            print('PREFLIGHT hosts file is not writable; this process and the browser map .alwp.test to loopback', flush=True)
            return
        run(privileged(['tee', '-a', str(path)]), input=line)


def remove_hosts():
    path = hosts_path()
    try:
        lines = [line for line in path.read_text(encoding='utf-8', errors='replace').splitlines(True) if HOSTS_MARK not in line]
        path.write_text(''.join(lines), encoding='utf-8')
    except OSError:
        pass


def trust_certificate(ca):
    if os.name == 'nt':
        try:
            result = subprocess.run(['certutil', '-user', '-addstore', 'Root', str(ca)],
                                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=30)
        except subprocess.TimeoutExpired:
            raise SystemExit('PREFLIGHT the fixture CA trust prompt was not completed')
        if result.returncode:
            raise SystemExit('PREFLIGHT could not trust the fixture CA for this Windows user')
        return
    destination = Path('/usr/local/share/ca-certificates/alwp-fixture.crt')
    run(privileged(['cp', str(ca), str(destination)]))
    run(privileged(['update-ca-certificates']))
    if shutil.which('certutil'):
        nss = Path.home() / '.pki/nssdb'
        nss.mkdir(parents=True, exist_ok=True)
        subprocess.run(['certutil', '-d', f'sql:{nss}', '-N', '--empty-password'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        subprocess.run(['certutil', '-d', f'sql:{nss}', '-A', '-t', 'C,,', '-n', 'alwp-fixture', '-i', str(ca)], check=False)


def untrust_certificate():
    if os.name != 'nt':
        return
    try:
        subprocess.run(['certutil', '-user', '-delstore', 'Root', 'AccessLobby Fixture CA'],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=20)
    except subprocess.TimeoutExpired:
        return


def privileged(command):
    if os.name != 'nt' and hasattr(os, 'geteuid') and os.geteuid() != 0:
        return ['sudo', *command]
    return command


def run(command, *, cwd=None, input=None, extra=None, quiet=False, env=None):
    result = subprocess.run([str(item) for item in command], cwd=cwd, input=input, text=True,
                            env=env if env is not None else {**os.environ, **(extra or {})}, capture_output=True)
    if result.returncode:
        print((result.stdout or '')[-2000:], (result.stderr or '')[-2000:], flush=True)
        raise RuntimeError('Fixture command failed: ' + str(command[0]))
    if not quiet and result.stdout and result.stdout.strip():
        print(result.stdout[-2000:], flush=True)
    return result.stdout or ''


def start_data_services(network, containers, db_password, pg_password):
    maria = 'alwp-https-maria'
    postgres = 'alwp-https-pg'
    containers.extend([maria, postgres])
    run(['docker', 'run', '-d', '--name', maria, '--network', network, '--network-alias', 'maria',
         '-p', '127.0.0.1:3308:3306', '-e', 'MARIADB_ROOT_PASSWORD=' + db_password,
         '-e', 'MARIADB_ROOT_HOST=%', os.environ.get('ALWP_MARIADB_IMAGE', 'mariadb:11.4')], quiet=True)
    run(['docker', 'run', '-d', '--name', postgres, '--network', network,
         '-p', '127.0.0.1:54330:5432', '-e', 'POSTGRES_USER=accesslobby',
         '-e', 'POSTGRES_PASSWORD=' + pg_password, '-e', 'POSTGRES_DB=accesslobby', 'postgres:17'], quiet=True)
    wait_mysql(maria, db_password)
    wait_port(54330)


def wait_mysql(name, password):
    deadline = time.monotonic() + 90
    while time.monotonic() < deadline:
        probe = subprocess.run(['docker', 'exec', name, 'mariadb-admin', 'ping', '-h', '127.0.0.1', '-uroot',
                                '-p' + password, '--silent'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if probe.returncode == 0:
            return
        time.sleep(1)
    raise RuntimeError('MariaDB fixture did not become ready')


def wait_port(port):
    deadline = time.monotonic() + 60
    while time.monotonic() < deadline:
        try:
            with socket.create_connection(('127.0.0.1', port), timeout=0.5):
                return
        except OSError:
            time.sleep(0.3)
    raise RuntimeError('Fixture port did not open: ' + str(port))


def site_definitions(password):
    sites = []
    for label, prefix, woo in (('a', '', True), ('b', '/gh', False)):
        host = label + '.alwp.test'
        base = f'https://{host}:{EDGE_PORT}{prefix}'
        sites.append({'label': label, 'base': base, 'prefix': prefix, 'woo': woo, 'client': 'wordpress-' + label,
                      'host': host, 'id': str(uuid.uuid4()), 'password': password})
    return sites


def start_mail(network, containers):
    containers.append('alwp-https-mail')
    run(['docker', 'run', '-d', '--name', 'alwp-https-mail', '--network', network, '--network-alias', 'mailpit',
         '-p', '127.0.0.1:18025:8025', 'axllent/mailpit:v1.21'], quiet=True)
    wait_port(18025)


def start_keycloak(work, plugin, repo, network, containers, issuer, api, sites, admin_password, ca):
    realm = json.loads((repo / 'infra/keycloak/realm.template.json').read_text(encoding='utf-8'))
    realm.update({'loginTheme': 'keycloak', 'sslRequired': 'none', 'registrationAllowed': True,
                  'registrationEmailAsUsername': True, 'verifyEmail': True, 'resetPasswordAllowed': False,
                  'smtpServer': {'host': 'mailpit', 'port': '1025', 'from': 'noreply@alwp.test',
                                 'fromDisplayName': 'AccessLobby Fixture', 'ssl': 'false', 'starttls': 'false', 'auth': 'false'}})
    template = realm['clients'][0]
    template['redirectUris'] = [api + '/unused-reference']
    template['webOrigins'] = [api]
    template['attributes']['post.logout.redirect.uris'] = api + '/'
    template['attributes']['backchannel.logout.url'] = api + '/v1/backchannel-logout'
    for site in sites:
        client = json.loads(json.dumps(template))
        client.update({'clientId': site['client'], 'name': 'Disposable WordPress ' + site['label'],
                       'redirectUris': [site['base'] + '/wp-login.php?action=al_callback'],
                       'webOrigins': [f'https://{site["host"]}:{EDGE_PORT}'],
                       'defaultClientScopes': ['openid', 'basic', 'profile', 'email']})
        client['attributes'].update({'post.logout.redirect.uris': site['base'] + '/wp-login.php?action=al_signed_out',
            'backchannel.logout.url': site['base'] + '/?rest_route=/accesslobby/v1/backchannel-logout',
            'backchannel.logout.session.required': 'true'})
        realm['clients'].append(client)
    realm['users'] = [{'id': str(uuid.uuid4()), 'username': name, 'enabled': True, 'emailVerified': True,
        'email': name + '@example.test', 'firstName': name, 'lastName': 'Fixture',
        'credentials': [{'type': 'password', 'value': sites[0]['password'], 'temporary': False}]}
        for name in ('shopper', 'newperson', 'staff')]
    imports = work / 'keycloak-import'
    imports.mkdir()
    (imports / 'accesslobby-first-party-realm.json').write_text(json.dumps(realm), encoding='utf-8')
    name = 'alwp-https-keycloak'
    containers.append(name)
    run(['docker', 'run', '-d', '--name', name, '--network', network, '--network-alias', 'keycloak',
         '-v', f'{imports}:/opt/keycloak/data/import:ro', '-v', f'{ca}:/certs/ca.crt:ro',
         '-e', 'KC_BOOTSTRAP_ADMIN_USERNAME=fixture_operator', '-e', 'KC_BOOTSTRAP_ADMIN_PASSWORD=' + admin_password,
         '-e', 'KC_PROXY_HEADERS=xforwarded', '-e', f'KC_HOSTNAME={issuer.rsplit("/realms", 1)[0]}',
         '-e', 'KC_HTTP_ENABLED=true', '--entrypoint', '/bin/bash',
         os.environ.get('ALWP_KEYCLOAK_IMAGE', 'quay.io/keycloak/keycloak:26.7.0'),
         '-c', 'set -e; home=$(dirname "$(dirname "$(readlink -f "$(command -v java)")")"); '
               'cp -L "$home/lib/security/cacerts" /tmp/alwp-cacerts; chmod u+w /tmp/alwp-cacerts; '
               'keytool -importcert -noprompt -alias alwp-fixture -keystore /tmp/alwp-cacerts -storepass changeit -file /certs/ca.crt >/tmp/alwp-keytool.out; '
               'export JAVA_TOOL_OPTIONS="-Djavax.net.ssl.trustStore=/tmp/alwp-cacerts -Djavax.net.ssl.trustStorePassword=changeit"; '
               'exec /opt/keycloak/bin/kc.sh start-dev --http-port=8083 --http-host=0.0.0.0 --import-realm'], quiet=True)


def start_edge_and_php(args, plugin, runtime, work, network, containers, ca, db_password):
    logs = work / 'logs'
    logs.mkdir(exist_ok=True)
    (logs / 'edge-probe.php').write_text(EDGE_PROBE, encoding='utf-8')
    php_ini = work / 'fixture-ca.ini'
    php_ini.write_text('openssl.cafile=/certs/ca.crt\ncurl.cainfo=/certs/ca.crt\n', encoding='utf-8')
    php = 'alwp-https-php'
    nginx = 'alwp-https-nginx'
    containers.extend([php, nginx])
    run(['docker', 'run', '-d', '--name', php, '--network', network, '--network-alias', 'php',
         '-e', 'ALWP_DB_HOST=maria',
         '-v', f'{work / "site-a" / "root"}:/var/www/a', '-v', f'{work / "site-b"}:/var/www/b',
         '-v', f'{logs}:/fixture-logs',
         '-v', f'{ca}:/certs/ca.crt:ro', '-v', f'{php_ini}:/usr/local/etc/php/conf.d/fixture-ca.ini:ro',
         '-v', f'{runtime / "wp-cli.phar"}:/usr/local/bin/wp-cli.phar:ro',
         '-v', f'{plugin / "tests"}:/fixture-tests:ro', '-v', f'{args.package.resolve()}:/fixture/package.zip:ro',
         '-v', f'{runtime / "woocommerce.zip"}:/fixture/woocommerce.zip:ro',
         'alwp-fixture-php:8.4'], quiet=True)
    run(['docker', 'run', '-d', '--name', nginx, '--network', network,
         '--network-alias', 'a.alwp.test', '--network-alias', 'b.alwp.test',
         '--network-alias', 'auth.alwp.test', '--network-alias', 'api.alwp.test',
         '-p', f'127.0.0.1:{EDGE_PORT}:8443', '--add-host', 'host.docker.internal:host-gateway',
         '-v', f'{plugin / "fixture/https/nginx.conf"}:/etc/nginx/nginx.conf:ro',
         '-v', f'{work / "tls.crt"}:/certs/tls.crt:ro', '-v', f'{work / "tls.key"}:/certs/tls.key:ro',
         '-v', f'{work / "site-a" / "root"}:/var/www/a:ro', '-v', f'{work / "site-b"}:/var/www/b:ro',
         '-v', f'{logs}:/fixture-logs', 'nginx:1.28-alpine'], quiet=True)


def assert_discovery(issuer, ca):
    document = json.loads(edge_request(issuer + '/.well-known/openid-configuration')['body'])
    if document.get('issuer') != issuer:
        raise RuntimeError('Keycloak issuer did not match the public HTTPS hostname')
    for key in ('authorization_endpoint', 'token_endpoint', 'end_session_endpoint'):
        if not str(document.get(key, '')).startswith('https://auth.alwp.test:8443/'):
            raise RuntimeError('Keycloak ' + key + ' was not on the public HTTPS issuer')


def wait_https(url, ca, seconds):
    deadline = time.monotonic() + seconds
    last = 'not-started'
    while time.monotonic() < deadline:
        try:
            if edge_request(url)['status'] == 200:
                return
            last = 'http'
        except Exception as error:
            last = type(error).__name__
        time.sleep(1)
    raise RuntimeError('HTTPS fixture endpoint did not become ready: ' + last)


def edge_request(url):
    if not url.startswith('https://') or not any(name in url for name in NAMES):
        raise RuntimeError('Refusing a probe outside the fixture names')
    result = subprocess.run(['docker', 'exec', '-e', 'ALWP_PROBE_URL=' + url, 'alwp-https-php', 'php', '/fixture-logs/edge-probe.php'],
                            capture_output=True, text=True)
    if result.returncode:
        detail = (result.stderr or '').strip()[-200:]
        if any(word in detail.lower() for word in ('password', 'token', 'cookie', 'authorization')):
            detail = 'redacted'
        raise RuntimeError('Fixture edge probe failed: ' + detail)
    return json.loads(result.stdout)


EDGE_PROBE = r'''<?php
$url = getenv( 'ALWP_PROBE_URL' );
if ( ! is_string( $url ) || ! str_starts_with( $url, 'https://' ) ) { fwrite( STDERR, 'refusing probe' ); exit( 1 ); }
$ch = curl_init( $url );
curl_setopt_array( $ch, array( CURLOPT_RETURNTRANSFER => true, CURLOPT_CAINFO => '/certs/ca.crt', CURLOPT_HEADER => true, CURLOPT_TIMEOUT => 20, CURLOPT_FOLLOWLOCATION => false ) );
$raw = curl_exec( $ch );
if ( false === $raw ) { fwrite( STDERR, curl_error( $ch ) ); exit( 1 ); }
$size = curl_getinfo( $ch, CURLINFO_HEADER_SIZE );
echo json_encode( array( 'status' => curl_getinfo( $ch, CURLINFO_RESPONSE_CODE ), 'headers' => substr( $raw, 0, $size ), 'body' => substr( $raw, $size ) ) );
'''


def prepare_api(repo, work, network, database_url, issuer, sites, ca):
    clients = json.dumps([{key: value for key, value in site.items() if key != 'password'} for site in sites])
    seed = """import {Pool} from 'pg'; const p=new Pool({connectionString:process.env.DATABASE_URL});
const owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
await p.query("INSERT INTO persons(id,status) VALUES($1,'active')",[owner]);
for(const s of JSON.parse(process.env.ALWP_SITE_CLIENTS)){
await p.query(`INSERT INTO applications(id,client_id,name,owner_person_id,redirect_uri,logout_uri,backchannel_logout_uri,
visibility,admission,trust_class,status,activated_at,review_reference,origin_challenge,origin_verified_at,origin_verified_host)
VALUES($1,$2,$3,$4,$5,$6,$7,'hidden','authenticated_open','first_party','active',now(),'disposable-fixture','synthetic-proof',now(),$8)`,
[s.id,s.client,s.client,owner,s.base+'/wp-login.php?action=al_callback',s.base+'/wp-login.php?action=al_signed_out',s.base+'/?rest_route=/accesslobby/v1/backchannel-logout',s.host]);}
await p.end();
"""
    (work / 'api-seed.mjs').write_bytes(seed.replace('\r\n', '\n').encode())
    start = """#!/bin/sh
set -eu
npm install -g pnpm@11.19.0
mkdir -p /opt/src
tar -C /src-ro --exclude node_modules --exclude .git --exclude vendor --exclude dist -cf - . | tar -C /opt/src -xf -
cd /opt/src
pnpm install --frozen-lockfile --filter @accesslobby/api...
cd /opt/src/apps/api
cp /opt/api-seed.mjs ./seed.mjs
node --import tsx src/migrate.ts
node --import tsx seed.mjs
node /opt/api-versions.mjs
exec node --import tsx src/main.ts
"""
    versions = """import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const require = createRequire('/opt/src/apps/api/package.json');
const versions = { node: process.version, pnpm: execSync('pnpm -v', { encoding: 'utf8' }).trim() };
for (const name of ['pg', 'jose', '@nestjs/common', '@nestjs/core', 'tsx']) versions[name] = require(name + '/package.json').version;
writeFileSync('/tmp/api-versions.json', JSON.stringify(versions));
"""
    (work / 'api-versions.mjs').write_bytes(versions.replace('\r\n', '\n').encode())
    (work / 'api-start.sh').write_bytes(start.replace('\r\n', '\n').encode())
    run(['docker', 'run', '-d', '--name', 'alwp-https-api', '--network', network, '--network-alias', 'api',
         '-e', 'DATABASE_URL=' + database_url, '-e', 'OIDC_ISSUER=' + issuer, '-e', 'OIDC_API_AUDIENCE=accesslobby-api',
         '-e', 'ALLOWED_CLIENT_IDS=accesslobby-web,wordpress-a,wordpress-b', '-e', 'PORT=8090',
         '-e', 'GIT_SHA=wordpress-https-fixture', '-e', 'NODE_EXTRA_CA_CERTS=/certs/ca.crt',
         '-e', 'ALWP_SITE_CLIENTS=' + clients,
         '-v', f'{repo}:/src-ro:ro', '-v', f'{ca}:/certs/ca.crt:ro',
         '-v', f'{work / "api-seed.mjs"}:/opt/api-seed.mjs:ro', '-v', f'{work / "api-versions.mjs"}:/opt/api-versions.mjs:ro',
         '-v', f'{work / "api-start.sh"}:/api-start.sh:ro',
         'node:24-bookworm', 'sh', '/api-start.sh'], quiet=True)
    try:
        wait_https(f'https://api.alwp.test:{EDGE_PORT}/health/ready', ca, 180)
    except RuntimeError:
        print(api_log_excerpt(), flush=True)
        raise
    print('FIXTURE HTTPS API ready', flush=True)


def api_log_excerpt():
    result = subprocess.run(['docker', 'logs', '--tail', '40', 'alwp-https-api'], capture_output=True, text=True)
    lines = []
    for line in ((result.stdout or '') + (result.stderr or '')).splitlines()[-40:]:
        lowered = line.lower()
        lines.append('redacted' if 'postgres://' in lowered or 'password' in lowered or 'token' in lowered else line)
    return '\n'.join(lines)


def stop_api():
    global api_process
    if api_process is not None and api_process.poll() is None:
        api_process.terminate()
        try:
            api_process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            api_process.kill()
    api_process = None


def prepare_wordpress_trees(runtime, work, sites, db_password):
    with zipfile.ZipFile(runtime / 'wordpress.zip') as archive:
        archive.extractall(work / 'wordpress-src')
    source = work / 'wordpress-src' / 'wordpress'
    for site in sites:
        root = work / 'site-a' / 'root' if site['label'] == 'a' else work / 'site-b' / 'gh'
        shutil.copytree(source, root)
        site['path'] = str(root)
        (root / 'wp-config.php').write_text(wp_config(site, db_password), encoding='utf-8')
    (work / 'logs').mkdir(exist_ok=True)


def install_wordpress(plugin, work, sites, password, issuer, api, db_password):
    modules = run(['docker', 'exec', 'alwp-https-php', 'php', '-m'], quiet=True)
    if any(name not in modules for name in ('mysqli', 'curl', 'openssl', 'sodium', 'mbstring')):
        raise RuntimeError('PHP-FPM image is missing a required module')
    run(['docker', 'exec', 'alwp-https-php', 'chmod', '-R', 'a+rwX', '/var/www/a', '/var/www/b', '/fixture-logs'], quiet=True)
    for site in sites:
        root = work / 'site-a' / 'root' if site['label'] == 'a' else work / 'site-b' / 'gh'
        run(['docker', 'exec', 'alwp-https-maria', 'mariadb', '-uroot', '-p' + db_password,
             '-e', f"CREATE DATABASE IF NOT EXISTS alwp_{site['label']}"], quiet=True)
        wp(site, ['core', 'install', '--url=' + site['base'], '--title=WordPress ' + site['label'],
                  '--admin_user=fixture_admin', '--admin_password=' + password,
                  '--admin_email=admin-' + site['label'] + '@example.test', '--skip-email'], quiet=True)
        wp(site, ['plugin', 'install', '/fixture/package.zip', '--activate'], quiet=True)
        wp(site, ['plugin', 'deactivate', 'accesslobby-sso'], quiet=True)
        wp(site, ['plugin', 'activate', 'accesslobby-sso'], quiet=True)
        if site['woo']:
            wp(site, ['plugin', 'install', '/fixture/woocommerce.zip', '--activate'], quiet=True)
            wp(site, ['eval', 'WC_Install::install();'], quiet=True)
        option = {'issuer': issuer, 'api': api, 'client_id': site['client'], 'mode': 'hybrid', 'jit': True,
                  'default_role': 'customer' if site['woo'] else 'subscriber', 'machine_auth': True}
        wp(site, ['option', 'update', 'accesslobby_sso', json.dumps(option), '--format=json'], quiet=True)
        mu = root / 'wp-content/mu-plugins'
        mu.mkdir(exist_ok=True)
        shutil.copyfile(plugin / 'tests/fixture-mu.php', mu / 'accesslobby-fixture.php')
        data = wp(site, ['eval-file', '/fixture-tests/setup-fixture.php'], extra={'ALWP_FIXTURE_PASSWORD': password})
        payload = next(line for line in reversed(data.splitlines()) if line.startswith('{'))
        site.update(json.loads(payload))
        checks = '/fixture-tests/integration.php' if (plugin / 'tests/integration.php').is_file() else '/fixture-tests/fixture-checks.php'
        wp(site, ['eval-file', checks], extra={'ALWP_INTEGRATION_RESULT': '/fixture-logs/integration-' + site['label'] + '.json'})
        print('FIXTURE HTTPS WordPress ' + site['label'] + ' ready', flush=True)


def wp_config(site, db_password):
    salts = {name: os.urandom(32).hex() for name in (
        'AUTH_KEY', 'SECURE_AUTH_KEY', 'LOGGED_IN_KEY', 'NONCE_KEY',
        'AUTH_SALT', 'SECURE_AUTH_SALT', 'LOGGED_IN_SALT', 'NONCE_SALT')}
    salt_lines = '\n'.join(f"define('{name}', '{value}');" for name, value in salts.items())
    return f"""<?php
define('DB_NAME', 'alwp_{site['label']}');
define('DB_USER', 'root');
define('DB_PASSWORD', '{db_password}');
define('DB_HOST', getenv('ALWP_DB_HOST') ?: '127.0.0.1:3308');
define('DB_CHARSET', 'utf8mb4');
define('DB_COLLATE', '');
{salt_lines}
$table_prefix = 'wp_';
define('WP_ENVIRONMENT_TYPE', 'local');
define('ACCESSLOBBY_ALLOW_LOCAL_HTTP', true);
define('ACCESSLOBBY_FIXTURE', true);
define('DISABLE_WP_CRON', true);
define('ACCESSLOBBY_EMERGENCY_ENABLED', true);
define('ACCESSLOBBY_EMERGENCY_IPS', ['127.0.0.1']);
if (!defined('ABSPATH')) define('ABSPATH', __DIR__ . '/');
require_once ABSPATH . 'wp-settings.php';
"""


def wp(site, command, *, extra=None, quiet=False):
    container_path = '/var/www/a' if site['label'] == 'a' else '/var/www/b/gh'
    environment = [item for key, value in (extra or {}).items() for item in ('-e', key + '=' + value)]
    return run(['docker', 'exec', *environment, '-e', 'ALWP_DB_HOST=maria', 'alwp-https-php',
                'php', '/usr/local/bin/wp-cli.phar', '--allow-root', '--path=' + container_path, *command], quiet=quiet)


def tls_probe(base, ca, report):
    response = edge_request(base + '/wp-login.php?action=al_logout')
    cache = cache_control(response['headers'])
    if response['status'] != 200 or 'private' not in cache or 'no-store' not in cache:
        raise RuntimeError('Docker-network TLS logout response did not carry the application cache header')
    host = host_tls(base, ca)
    if host['verification'] != 'verified' or host['httpStatus'] != 200:
        raise RuntimeError('Host TLS verification did not succeed: ' + str(host.get('exceptionCategory') or host['verification']))
    if 'AccessLobby Fixture CA' not in str(host.get('issuer')) or base.split('/')[2].split(':')[0] not in (host.get('san') or []):
        raise RuntimeError('Host certificate was not the fixture certificate for this site')
    if host.get('protocol') not in ('TLSv1.2', 'TLSv1.3'):
        raise RuntimeError('Host negotiated an unexpected TLS version')
    report['tls'] = {
        'network': {'verification': 'verified', 'trustStore': 'fixture-ca', 'httpStatus': response['status'], 'cacheControl': cache},
        'host': host,
    }


def cache_control(headers):
    for line in headers.splitlines():
        if line.lower().startswith('cache-control:'):
            return line.split(':', 1)[1].strip()
    return ''


def certificate_name(certificate, field):
    values = []
    for item in certificate.get(field, ()):
        for pair in item:
            values.append(pair[1])
    return ', '.join(values)


def host_tls(base, ca):
    url = urllib.parse.urlparse(base + '/wp-login.php?action=al_logout')
    observation = {'urlHost': url.hostname, 'resolvedAddress': None, 'httpStatus': None, 'verification': 'not-completed',
                   'exceptionCategory': None, 'subject': None, 'issuer': None, 'protocol': None, 'san': []}
    try:
        observation['resolvedAddress'] = socket.getaddrinfo(url.hostname, url.port or EDGE_PORT, socket.AF_INET, socket.SOCK_STREAM)[0][4][0]
        context = ssl.create_default_context(cafile=str(ca))
        with socket.create_connection((observation['resolvedAddress'], int(url.port or EDGE_PORT)), timeout=20) as raw:
            with context.wrap_socket(raw, server_hostname=url.hostname) as tls:
                certificate = tls.getpeercert()
                observation.update({'verification': 'verified', 'protocol': tls.version(),
                                    'subject': certificate_name(certificate, 'subject'),
                                    'issuer': certificate_name(certificate, 'issuer'),
                                    'san': [value for kind, value in certificate.get('subjectAltName', ()) if kind == 'DNS']})
                tls.sendall(f'GET {url.path}?{url.query} HTTP/1.1\r\nHost: {url.hostname}:{url.port}\r\nConnection: close\r\n\r\n'.encode())
                status = tls.recv(80).decode('latin1', 'replace')
                observation['httpStatus'] = int(status.split(' ', 2)[1]) if status.startswith('HTTP/') else None
    except ssl.SSLCertVerificationError as error:
        observation.update({'verification': 'rejected', 'exceptionCategory': 'SSLCertVerificationError', 'verifyCode': error.verify_code})
    except Exception as error:
        observation.update({'verification': 'not-completed', 'exceptionCategory': type(error).__name__})
    return observation


def browser_tls(output):
    for line in output.splitlines():
        if line.startswith('TLS_BROWSER '):
            return json.loads(line.split(' ', 1)[1])
    raise RuntimeError('Browser TLS verification was not recorded')


def assert_browser_tls(details):
    if details.get('verification') != 'verified' or 'AccessLobby Fixture CA' not in str(details.get('issuer')):
        raise RuntimeError('Browser certificate was not verified as the fixture CA')
    if details.get('protocol') not in ('TLS 1.2', 'TLS 1.3') or details.get('subjectName') != 'a.alwp.test':
        raise RuntimeError('Browser TLS session did not match the site certificate')


def load_assertions(work):
    found = {}
    for path in (work / 'logs').glob('integration-*.json'):
        found[path.stem.removeprefix('integration-')] = json.loads(path.read_text(encoding='utf-8'))['passed']
    return found


def component_versions(work):
    versions = {'edgePort': EDGE_PORT, 'nginx': '1.28-alpine', 'phpImage': '8.4-fpm', 'keycloak': '26.7.0',
                'mariadb': '11.4', 'nodeImage': 'node:24-bookworm', 'mailpit': 'axllent/mailpit:v1.21',
                'images': {name: image_reference(name) for name in (
                    'nginx:1.28-alpine', 'mariadb:11.4', 'postgres:17', 'quay.io/keycloak/keycloak:26.7.0',
                    'node:24-bookworm', 'axllent/mailpit:v1.21', 'alwp-fixture-php:8.4')}}
    versions['api'] = json.loads(subprocess.run(['docker', 'exec', 'alwp-https-api', 'cat', '/tmp/api-versions.json'],
                                                 capture_output=True, text=True, check=True).stdout)
    for path in (work / 'logs').glob('integration-a.json'):
        data = json.loads(path.read_text(encoding='utf-8'))
        versions.update({'wordpress': data.get('wordpress'), 'php': data.get('php'), 'woocommerce': data.get('woocommerce')})
    return versions


def image_reference(name):
    result = subprocess.run(['docker', 'image', 'inspect', '--format', '{{if .RepoDigests}}{{index .RepoDigests 0}}{{else}}{{.Id}}{{end}}', name],
                            capture_output=True, text=True)
    return (result.stdout or '').strip()


def run_lifecycle(site):
    output = wp(site, ['eval-file', '/fixture-tests/lifecycle.php'], quiet=True)
    follow = wp(site, ['eval-file', '/fixture-tests/lifecycle-after.php'], quiet=True)
    combined = output + '\n' + follow
    required = (
        'LIFECYCLE deactivate-uninstall-activate-preserves-data',
        'LIFECYCLE schema-rebuild-preserves-links',
        'LIFECYCLE enforcement-readiness-preserves-hybrid',
        'LIFECYCLE unlinked-account-unchanged',
        'LIFECYCLE issuer-outage-fails-closed',
        'LIFECYCLE emergency-ineligible-rejected',
        'LIFECYCLE emergency-ticket-issued',
        'LIFECYCLE emergency-ticket-consumed',
        'LIFECYCLE administrator-role-preserved',
    )
    missing = [name for name in required if name not in combined]
    if missing:
        raise RuntimeError('Lifecycle checks missing: ' + ', '.join(missing))
    return combined


def run_browser(repo, plugin, work, env, sites, issuer, api, password, ca):
    public = []
    for site in sites:
        public.append({key: value for key, value in site.items() if key != 'password'})
    fixture = {'sites': public, 'issuer': issuer, 'api': api, 'password': password, 'php': env.get('ALWP_PHP', 'php'),
               'wpCli': str(Path(env.get('ALWP_RUNTIME_WP_CLI', ''))), 'artifactDir': str(work), 'logDir': str(work / 'logs'),
               'tls': True, 'package': ''}
    # Host wp-cli reaches MariaDB through the published port. The browser driver uses it for assertions.
    fixture['php'] = env.get('ALWP_PHP', 'php')
    fixture['wpCli'] = str(Path(os.environ.get('ALWP_WP_CLI', '')) if os.environ.get('ALWP_WP_CLI') else '')
    config = work / 'private-fixture-config.json'
    # The private config stays in the deleted work directory. The report does not include it.
    browser_config = {**fixture, 'php': env.get('ALWP_PHP', shutil.which('php') or 'php'),
                      'wpCli': os.environ.get('ALWP_WP_CLI', str(Path(os.environ.get('TEMP', '/tmp')) / 'accesslobby-wp-runtime' / 'wp-cli.phar'))}
    # Recover wp-cli from the caller through the runtime sibling of this module's work parent.
    browser_config['wpCli'] = str(work.parent / 'wp-cli.phar')
    browser_config['password'] = password
    browser_config['join'] = True
    browser_config['mailPort'] = 18025
    config.write_text(json.dumps(browser_config), encoding='utf-8')
    if os.name != 'nt':
        config.chmod(0o600)
    browser_env = {**env, 'NODE_EXTRA_CA_CERTS': str(ca)}
    result = subprocess.run(['node', str(plugin / 'tests/browser.mjs'), str(config)], cwd=repo, env=browser_env,
                            text=True, capture_output=True)
    if result.stdout:
        print(result.stdout, flush=True)
    if result.returncode:
        print((result.stderr or '')[-2000:], flush=True)
        raise RuntimeError('Fixture command failed: node')
    return result.stdout


def git_sha(repo):
    try:
        return subprocess.run(['git', 'rev-parse', 'HEAD'], cwd=repo, capture_output=True, text=True, check=True).stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        return 'unknown'

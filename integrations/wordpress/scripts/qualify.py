"""Real native Keycloak + unchanged AccessLobby API + two independent WP installations.

Run in one process namespace (also works in CI). All DBs, users, DNS-review rows and
credentials are disposable synthetic fixtures. This never connects to an estate site.
"""
from pathlib import Path
import argparse
import atexit
import copy
import itertools
import json
import os
import secrets
import shutil
import socket
import subprocess
import threading
import time
import urllib.request
import uuid
import zipfile

parser = argparse.ArgumentParser()
parser.add_argument('--runtime', type=Path, required=True)
parser.add_argument('--package', type=Path, required=True)
parser.add_argument('--keycloak-home', type=Path)
parser.add_argument('--keep', action='store_true')
parser.add_argument('--reuse-config', type=Path)
args = parser.parse_args()
runtime = args.runtime.resolve()
plugin = Path(__file__).resolve().parents[1]
repo = plugin.parents[1]
if not (plugin / 'tests/browser.mjs').is_file():
    raise SystemExit('Browser driver is missing. No fixture started.')
if args.reuse_config:
    os.environ['NO_PROXY'] = '127.0.0.1,localhost'
    subprocess.run(['node', str(plugin / 'tests/browser.mjs'), str(args.reuse_config.resolve())], check=True, cwd=repo)
    raise SystemExit(0)
work = runtime / ('qualification-' + uuid.uuid4().hex[:8])
work.mkdir(parents=True)
env = os.environ.copy()
env['NO_PROXY'] = '127.0.0.1,localhost'
env['no_proxy'] = env['NO_PROXY']
php = env.get('ALWP_PHP', 'php')
wp_cli = str(runtime / 'wp-cli.phar')
children = []
logs = []
containers = []
listeners = []
retain = False

def preflight():
    required = [args.package, runtime / 'wordpress.zip', runtime / 'woocommerce.zip', Path(wp_cli)]
    missing = [str(path) for path in required if not path.is_file()]
    if missing:
        raise SystemExit('PREFLIGHT missing files: ' + ', '.join(missing))
    modules = subprocess.run([php, '-m'], capture_output=True, text=True, env=env)
    available = set(modules.stdout.lower().split())
    absent = [name for name in ('mysqli', 'curl', 'openssl', 'sodium', 'mbstring') if name not in available]
    if absent:
        raise SystemExit('PREFLIGHT PHP is missing: ' + ', '.join(absent))
    ports = [3307, 8081, 8082, 8083, 8090] + [18000 + index for index in range(8)]
    if any(port < 1 or port > 65535 for port in ports):
        raise SystemExit('PREFLIGHT worker port is outside 1-65535')
    busy = []
    for port in (3307, 8081, 8082, 8083, 8090):
        try:
            with socket.create_connection(('127.0.0.1', port), timeout=0.2):
                busy.append(port)
        except OSError:
            pass
    if busy:
        raise SystemExit('PREFLIGHT ports already in use: ' + ', '.join(str(port) for port in busy))
    print('PREFLIGHT files, PHP modules, ports and worker allocation accepted', flush=True)

def run(command, *, cwd=None, input=None, extra=None, quiet=False):
    result = subprocess.run([str(x) for x in command], cwd=cwd, input=input, text=True,
                            env={**env, **(extra or {})}, capture_output=True)
    if result.returncode:
        # Test-only output; never print command lines that carry fixture credentials.
        print(result.stdout[-4000:], result.stderr[-4000:], flush=True)
        raise RuntimeError('Fixture command failed: ' + str(command[0]))
    if not quiet and result.stdout.strip():
        print(result.stdout[-4000:], flush=True)
    return result.stdout

def spawn(name, command, *, cwd=None, extra=None):
    log = (work / (name + '.log')).open('w', buffering=1)
    logs.append(log)
    process = subprocess.Popen([str(x) for x in command], cwd=cwd, stdout=log, stderr=subprocess.STDOUT,
                               env={**env, **(extra or {})})
    children.append(process)
    return process

def header_value(head, name):
    prefix = name.lower() + ':'
    for line in head.split(b'\r\n')[1:]:
        if line.lower().startswith(prefix.encode()):
            return line.split(b':', 1)[1].strip()
    return b''

def read_http_request(client):
    data = b''
    while b'\r\n\r\n' not in data:
        chunk = client.recv(65536)
        if not chunk:
            return data
        data += chunk
        if len(data) > 1048576:
            raise RuntimeError('Fixture request exceeded 1 MiB before the header ended')
    head, _, rest = data.partition(b'\r\n\r\n')
    length = int(header_value(head, 'content-length') or b'0')
    while len(rest) < length:
        chunk = client.recv(65536)
        if not chunk:
            break
        rest += chunk
    lines = [line for line in head.split(b'\r\n') if not line.lower().startswith(b'connection:')]
    return b'\r\n'.join(lines) + b'\r\nConnection: close\r\n\r\n' + rest[:length]

def bridge(client, backend):
    upstream = None
    try:
        request = read_http_request(client)
        if not request:
            return
        upstream = socket.create_connection(backend, timeout=20)
        upstream.sendall(request)
        while True:
            chunk = upstream.recv(65536)
            if not chunk:
                break
            client.sendall(chunk)
    except OSError:
        pass
    finally:
        if upstream is not None:
            upstream.close()
        client.close()

def start_php_pool(name, public_port, docroot, router, workers=4):
    """PHP's built-in server handles one request at a time. A login page deadlocks when its script uses that same server."""
    backends = []
    for index in range(workers):
        port = 18000 + (public_port - 8081) * 4 + index
        if port < 1 or port > 65535:
            raise RuntimeError('Refusing PHP worker port ' + str(port))
        process = spawn(name + '-' + str(index), [php, '-S', '127.0.0.1:' + str(port), '-t', str(docroot), str(router)])
        wait_port(port, process)
        backends.append(('127.0.0.1', port))
    listener = socket.socket()
    listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    listener.bind(('127.0.0.1', public_port))
    listener.listen(128)
    listeners.append(listener)
    cycle = itertools.cycle(backends)
    lock = threading.Lock()
    def accept_loop():
        while True:
            try:
                client, _ = listener.accept()
            except OSError:
                return
            with lock:
                backend = next(cycle)
            threading.Thread(target=bridge, args=(client, backend), daemon=True).start()
    threading.Thread(target=accept_loop, daemon=True).start()

def cleanup():
    if args.keep or retain:
        print('FIXTURE_RETAINED ' + str(work), flush=True)
        return
    for listener in listeners:
        try: listener.close()
        except OSError: pass
    for process in reversed(children):
        if process.poll() is None:
            process.terminate()
    for process in reversed(children):
        try: process.wait(timeout=10)
        except subprocess.TimeoutExpired: process.kill()
    for name in containers:
        with (work / (name + '.log')).open('w', encoding='utf-8', errors='replace') as handle:
            subprocess.run(['docker', 'logs', name], stdout=handle, stderr=subprocess.STDOUT)
        subprocess.run(['docker', 'rm', '-f', name], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for log in logs: log.close()
atexit.register(cleanup)

def wait_port(port, process):
    end = time.monotonic() + 60
    while time.monotonic() < end:
        if process.poll() is not None: raise RuntimeError('Fixture service exited; inspect logs in ' + str(work))
        try:
            with socket.create_connection(('127.0.0.1', port), timeout=.5): return
        except OSError: time.sleep(.2)
    raise RuntimeError('Fixture service startup timed out')

def wait_url(url, process, seconds=90):
    end = time.monotonic() + seconds
    while time.monotonic() < end:
        if process.poll() is not None: raise RuntimeError('Fixture HTTP service exited; inspect ' + str(work))
        try:
            with urllib.request.urlopen(url, timeout=2) as response:
                if response.status == 200: return
        except Exception: time.sleep(.3)
    raise RuntimeError('Fixture HTTP startup timed out')

preflight()
mysql_host = env.get('ALWP_MYSQL_HOST', '127.0.0.1')
mysql_port = int(env.get('ALWP_MYSQL_PORT', '3307'))
if env.get('ALWP_DOCKER') == '1':
    maria_name = 'alwp-fixture-maria'
    containers.append(maria_name)
    subprocess.run(['docker', 'rm', '-f', maria_name], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    run(['docker', 'run', '-d', '--name', maria_name, '-p', '127.0.0.1:' + str(mysql_port) + ':3306',
         '-e', 'MARIADB_ROOT_PASSWORD=' + env.get('ALWP_MYSQL_PASSWORD', ''),
         '-e', 'MARIADB_ROOT_HOST=%', env.get('ALWP_MARIADB_IMAGE', 'mariadb:11.4')], quiet=True)
    ready = time.monotonic() + 90
    while time.monotonic() < ready:
        probe = subprocess.run(['docker', 'exec', maria_name, 'mariadb-admin', 'ping', '-h', '127.0.0.1',
                                 '-uroot', '-p' + env.get('ALWP_MYSQL_PASSWORD', ''), '--silent'],
                                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if probe.returncode == 0:
            break
        time.sleep(1)
    else:
        raise RuntimeError('MariaDB fixture did not become ready')
elif env.get('ALWP_MARIADBD'):
    maria = spawn('mariadb', [env['ALWP_MARIADBD'], '--no-defaults',
        '--basedir=' + env['ALWP_NATIVE_USR'], '--datadir=' + str(runtime / 'db'), '--socket=',
        '--bind-address=127.0.0.1', '--port=' + str(mysql_port), '--pid-file=' + str(work / 'mariadb.pid')])
    wait_port(mysql_port, maria)
print('FIXTURE MariaDB ready', flush=True)

database_url = env.get('DATABASE_URL')
if env.get('ALWP_INITDB'):
    run([env['ALWP_INITDB'], '-D', work / 'pg', '--no-locale', '--encoding=UTF8', '--auth=trust', '-U', 'accesslobby'], quiet=True)
    pg = spawn('postgres', [env['ALWP_POSTGRES'], '-D', work / 'pg', '-h', '127.0.0.1', '-p', '5433', '-k', ''])
    wait_port(5433, pg)
    run([env['ALWP_PSQL'], '-h', '127.0.0.1', '-p', '5433', '-U', 'accesslobby', '-d', 'postgres', '-c', 'CREATE DATABASE accesslobby'], quiet=True)
    database_url = 'postgres://accesslobby@127.0.0.1:5433/accesslobby'
if not database_url: raise RuntimeError('DATABASE_URL or native PostgreSQL fixture commands required')

issuer = 'http://127.0.0.1:8083/realms/accesslobby-first-party'
api = 'http://127.0.0.1:8090'
password = secrets.token_urlsafe(24)
realm = json.loads((repo / 'infra/keycloak/realm.template.json').read_text())
realm.update({'loginTheme': 'keycloak', 'sslRequired': 'none', 'registrationAllowed': False,
              'verifyEmail': False, 'resetPasswordAllowed': False})
template = realm['clients'][0]
template['redirectUris'] = ['http://127.0.0.1:8091/callback']
template['webOrigins'] = ['http://127.0.0.1:8091']
template['attributes']['post.logout.redirect.uris'] = 'http://127.0.0.1:8091/'
template['attributes']['backchannel.logout.url'] = api + '/v1/backchannel-logout'
sites = []
backchannel_host = 'host.docker.internal' if env.get('ALWP_DOCKER') == '1' else '127.0.0.1'
for label, port, prefix, woo in [('a', 8081, '', True), ('b', 8082, '/gh', False)]:
    base = f'http://127.0.0.1:{port}{prefix}'
    client = copy.deepcopy(template)
    client.update({'clientId': 'wordpress-' + label, 'name': 'Disposable WordPress ' + label,
                   'redirectUris': [base + '/wp-login.php?action=al_callback'], 'webOrigins': [f'http://127.0.0.1:{port}'],
                   'defaultClientScopes': ['openid', 'basic', 'profile', 'email']})
    client['attributes'].update({'post.logout.redirect.uris': base + '/wp-login.php?action=al_signed_out',
        'backchannel.logout.url': f'http://{backchannel_host}:{port}{prefix}/?rest_route=/accesslobby/v1/backchannel-logout',
        'backchannel.logout.session.required': 'true'})
    realm['clients'].append(client)
    sites.append({'label': label, 'base': base, 'port': port, 'prefix': prefix, 'woo': woo, 'client': client['clientId']})
realm['users'] = [{'id': str(uuid.uuid4()), 'username': name, 'enabled': True, 'emailVerified': True,
    'email': name + '@example.test', 'firstName': name, 'lastName': 'Fixture',
    'credentials': [{'type': 'password', 'value': password, 'temporary': False}]}
    for name in ['shopper', 'newperson', 'staff']]
admin_password = secrets.token_urlsafe(32)
if env.get('ALWP_DOCKER') == '1':
    imports = work / 'keycloak-import'
    imports.mkdir(parents=True)
    (imports / 'accesslobby-first-party-realm.json').write_text(json.dumps(realm))
    kc_name = 'alwp-fixture-keycloak'
    containers.append(kc_name)
    subprocess.run(['docker', 'rm', '-f', kc_name], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    run(['docker', 'run', '-d', '--name', kc_name, '-p', '127.0.0.1:8083:8083',
         '-e', 'KC_BOOTSTRAP_ADMIN_USERNAME=fixture_operator', '-e', 'KC_BOOTSTRAP_ADMIN_PASSWORD=' + admin_password,
         '-v', str(imports) + ':/opt/keycloak/data/import',
         env.get('ALWP_KEYCLOAK_IMAGE', 'quay.io/keycloak/keycloak:26.7.0'),
         'start-dev', '--http-port=8083', '--http-host=0.0.0.0', '--hostname=http://127.0.0.1:8083', '--import-realm'], quiet=True)
    class DockerProcess:
        def poll(self):
            state = subprocess.run(['docker', 'inspect', '-f', '{{.State.Running}}', kc_name], capture_output=True, text=True)
            return None if state.stdout.strip() == 'true' else 1
    kc = DockerProcess()
else:
    if args.keycloak_home is None:
        raise RuntimeError('Native Keycloak home is required when ALWP_DOCKER is not set')
    imports = args.keycloak_home / 'data/import'
    imports.mkdir(parents=True, exist_ok=True)
    (imports / 'accesslobby-first-party-realm.json').write_text(json.dumps(realm))
    kc = spawn('keycloak', [args.keycloak_home / 'bin/kc.sh', 'start-dev', '--http-port=8083', '--http-host=127.0.0.1',
        '--hostname=http://127.0.0.1:8083', '--db-url=jdbc:h2:file:' + str(work / 'iam') + ';NON_KEYWORDS=VALUE;DB_CLOSE_ON_EXIT=FALSE',
        '--import-realm'], extra={'KC_BOOTSTRAP_ADMIN_USERNAME': 'fixture_operator', 'KC_BOOTSTRAP_ADMIN_PASSWORD': admin_password})
wait_url(issuer + '/.well-known/openid-configuration', kc, 180)
print('FIXTURE real Keycloak ready', flush=True)

api_env = {'DATABASE_URL': database_url, 'OIDC_ISSUER': issuer, 'OIDC_API_AUDIENCE': 'accesslobby-api',
    'ALLOWED_CLIENT_IDS': 'accesslobby-web,wordpress-a,wordpress-b', 'PORT': '8090', 'GIT_SHA': 'wordpress-disposable-fixture'}
run(['node', '--import', 'tsx', 'src/migrate.ts'], cwd=repo / 'apps/api', extra=api_env)
seed = """import {Pool} from 'pg'; const p=new Pool({connectionString:process.env.DATABASE_URL});
const owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
await p.query("INSERT INTO persons(id,status) VALUES($1,'active')",[owner]);
for(const s of JSON.parse(process.env.ALWP_SITE_CLIENTS)){
await p.query(`INSERT INTO applications(id,client_id,name,owner_person_id,redirect_uri,logout_uri,backchannel_logout_uri,
visibility,admission,trust_class,status,activated_at,review_reference,origin_challenge,origin_verified_at,origin_verified_host)
VALUES($1,$2,$3,$4,$5,$6,$7,'hidden','authenticated_open','first_party','active',now(),'disposable-fixture','synthetic-proof',now(),'127.0.0.1')`,
[s.id,s.client,s.client,owner,s.base+'/wp-login.php?action=al_callback',s.base+'/wp-login.php?action=al_signed_out',s.base+'/?rest_route=/accesslobby/v1/backchannel-logout']);}
await p.end();"""
for site in sites: site['id'] = str(uuid.uuid4())
run(['node', '--input-type=module', '-e', seed], cwd=repo / 'apps/api',
    extra={**api_env, 'ALWP_SITE_CLIENTS': json.dumps(sites)}, quiet=True)
api_process = spawn('api', ['node', '--import', 'tsx', 'src/main.ts'], cwd=repo / 'apps/api', extra=api_env)
wait_url(api + '/health/ready', api_process)
print('FIXTURE unchanged AccessLobby API and PostgreSQL ready', flush=True)

for site in sites:
    base_dir = work / ('site-' + site['label'])
    base_dir.mkdir()
    with zipfile.ZipFile(runtime / 'wordpress.zip') as archive: archive.extractall(base_dir)
    path = base_dir / 'wordpress'
    if site['prefix']:
        folder = base_dir / site['prefix'].lstrip('/')
        path.rename(folder); path = folder
    else:
        folder = base_dir / 'root'; path.rename(folder); path = folder
    site['path'] = str(path)
    dbname = 'alwp_' + site['label']
    create_db = '$d=new mysqli(getenv("ALWP_MYSQL_HOST"),getenv("ALWP_MYSQL_USER"),getenv("ALWP_MYSQL_PASSWORD"),null,(int)getenv("ALWP_MYSQL_PORT"));$d->query("DROP DATABASE IF EXISTS ' + dbname + '");$d->query("CREATE DATABASE ' + dbname + '");'
    db_env = {'ALWP_MYSQL_HOST': mysql_host, 'ALWP_MYSQL_PORT': str(mysql_port),
              'ALWP_MYSQL_USER': env.get('ALWP_MYSQL_USER', 'root'), 'ALWP_MYSQL_PASSWORD': env.get('ALWP_MYSQL_PASSWORD', '')}
    run([php, '-r', create_db], extra=db_env, quiet=True)
    def wp(*command, input=None, extra=None, quiet=False):
        return run([php, wp_cli, '--path=' + str(path), *command], input=input, extra=extra, quiet=quiet)
    wp('config', 'create', '--dbname=' + dbname, '--dbuser=' + db_env['ALWP_MYSQL_USER'],
       '--dbpass=' + db_env['ALWP_MYSQL_PASSWORD'], '--dbhost=' + mysql_host + ':' + str(mysql_port), '--skip-check', '--extra-php',
       input="define('WP_ENVIRONMENT_TYPE','local');\ndefine('ACCESSLOBBY_ALLOW_LOCAL_HTTP',true);\ndefine('ACCESSLOBBY_FIXTURE',true);\ndefine('DISABLE_WP_CRON',true);\ndefine('ACCESSLOBBY_EMERGENCY_ENABLED',true);\ndefine('ACCESSLOBBY_EMERGENCY_IPS',['127.0.0.1']);\n", quiet=True)
    wp('core', 'install', '--url=' + site['base'], '--title=WordPress ' + site['label'], '--admin_user=fixture_admin',
       '--admin_password=' + password, '--admin_email=admin-' + site['label'] + '@example.test', '--skip-email', quiet=True)
    wp('plugin', 'install', str(args.package.resolve()), '--activate', quiet=True)
    wp('plugin', 'deactivate', 'accesslobby-sso', quiet=True)
    wp('plugin', 'activate', 'accesslobby-sso', quiet=True)
    if site['woo']:
        wp('plugin', 'install', str(runtime / 'woocommerce.zip'), '--activate', quiet=True)
        wp('eval', 'WC_Install::install();', quiet=True)
    config = {'issuer': issuer, 'api': api, 'client_id': site['client'], 'mode': 'hybrid', 'jit': True,
              'default_role': 'customer' if site['woo'] else 'subscriber', 'machine_auth': True}
    wp('option', 'update', 'accesslobby_sso', json.dumps(config), '--format=json', quiet=True)
    mu = path / 'wp-content/mu-plugins'; mu.mkdir(exist_ok=True)
    shutil.copyfile(plugin / 'tests/fixture-mu.php', mu / 'accesslobby-fixture.php')
    data = wp('eval-file', str(plugin / 'tests/setup-fixture.php'), extra={'ALWP_FIXTURE_PASSWORD': password}, quiet=True)
    site.update(json.loads(data.strip()))
    checks = next(path for path in (plugin / 'tests/integration.php', plugin / 'tests/fixture-checks.php') if path.is_file())
    wp('eval-file', str(checks), extra={'ALWP_INTEGRATION_RESULT': str(work / ('integration-' + site['label'] + '.json'))})
    router = base_dir / 'router.php'
    docroot = path.parent if site['prefix'] else path
    router.write_text("<?php\n$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);\n$root = " + repr(str(docroot)) +
        ";\n$file = $root . str_replace('/', DIRECTORY_SEPARATOR, rawurldecode((string) $path));\nif (is_file($file)) return false;\nrequire " +
        repr(str(path / 'index.php')) + ";\n")
    start_php_pool('wordpress-' + site['label'], site['port'], docroot, router)
    wait_url(site['base'] + '/', children[-1])
    print('FIXTURE WordPress ' + site['label'] + ' ready', flush=True)

fixture = {'sites': sites, 'issuer': issuer, 'api': api, 'password': password, 'php': php, 'wpCli': wp_cli,
           'artifactDir': str(work), 'package': str(args.package.resolve())}
config_file = work / 'private-fixture-config.json'
config_file.write_text(json.dumps(fixture)); config_file.chmod(0o600)
try:
    run(['node', str(plugin / 'tests/browser.mjs'), str(config_file)], cwd=repo)
except Exception:
    retain = True
    raise
print('QUALIFICATION_PASS artifacts=' + str(work), flush=True)

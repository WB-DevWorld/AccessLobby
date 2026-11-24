"""Real native Keycloak + AccessLobby API + two independent WP installations.

Run in one process namespace (also works in CI). All DBs, users, DNS-review rows and
credentials are disposable synthetic fixtures. This never connects to an estate site.
"""
from pathlib import Path
import argparse
import sys
import atexit
import copy
import json
import os
import secrets
import shutil
import socket
import subprocess
import time
import urllib.request
import uuid
import zipfile
import ssl
import importlib.util
import hashlib
from urllib.parse import urlparse

parser = argparse.ArgumentParser()
parser.add_argument('--runtime', type=Path, required=True)
parser.add_argument('--package', type=Path, required=True)
parser.add_argument('--upgrade-from', type=Path)
parser.add_argument('--keycloak-home', type=Path)
parser.add_argument('--profile', choices=('native', 'https'), default='native')
parser.add_argument('--keep', action='store_true')
args = parser.parse_args()
if os.environ.get('ALWP_DISPOSABLE_FIXTURE') != '1':
    raise SystemExit('Set ALWP_DISPOSABLE_FIXTURE=1 only for isolated throwaway databases; no service started.')
if args.profile == 'https':
    from fixture_https import main
    plugin = Path(__file__).resolve().parents[1]
    raise SystemExit(main(args, plugin, plugin.parents[1], args.runtime.resolve()))
if not args.upgrade_from or not args.keycloak_home:
    raise SystemExit('Native profile requires --upgrade-from and --keycloak-home; no service started.')
if hashlib.sha256(args.upgrade_from.read_bytes()).hexdigest() != 'f85e2eb00ba3e71742f435e9bb9025c189c6b1f2819081a388d60969bada20c2':
    raise SystemExit('Upgrade requires the exact previously qualified alpha.5 ZIP; no service started.')
runtime = args.runtime.resolve()
plugin = Path(__file__).resolve().parents[1]
repo = plugin.parents[1]
if not (plugin / 'tests/browser.mjs').is_file():
    raise SystemExit('Missing browser fixture; no service started.')
work = runtime / ('qualification-' + uuid.uuid4().hex[:8])
work.mkdir(parents=True, mode=0o700)
env = os.environ.copy()
env['NO_PROXY'] = '127.0.0.1,localhost'
env['no_proxy'] = env['NO_PROXY']
php = env.get('ALWP_PHP', 'php')
wp_cli = str(runtime / 'wp-cli.phar')
children = []
logs = []
proxies = []
metadata = {
    'sourceRevision': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=repo, text=True).strip(),
    'candidateRevision': env.get('ALWP_CANDIDATE_SHA'),
    'sourceDirty': bool(subprocess.check_output(['git', 'status', '--porcelain'], cwd=repo, text=True).strip()),
    'packageSha256': hashlib.sha256(args.package.read_bytes()).hexdigest(),
    'upgradeFromPackageSha256': hashlib.sha256(args.upgrade_from.read_bytes()).hexdigest(),
    'wordpressArchiveSha256': hashlib.sha256((runtime / 'wordpress.zip').read_bytes()).hexdigest(),
    'wooEnabled': env.get('ALWP_WITH_WOO', 'true') == 'true',
    'hposRequested': env.get('ALWP_HPOS', 'false') == 'true',
    'keycloakDistribution': args.keycloak_home.name,
    'themeRequested': env.get('ALWP_THEME', 'default'),
    'woocommerceArchiveSha256': hashlib.sha256((runtime / 'woocommerce.zip').read_bytes()).hexdigest() if (runtime / 'woocommerce.zip').is_file() else None,
    'themeArchiveSha256': hashlib.sha256((runtime / 'kadence.zip').read_bytes()).hexdigest() if env.get('ALWP_THEME') == 'kadence' else None,
}
(work / 'build.json').write_text(json.dumps(metadata, indent=2) + '\n')

def run(command, *, cwd=None, input=None, extra=None, quiet=False, stream=False):
    result = subprocess.run([str(x) for x in command], cwd=cwd, input=input, text=True,
                            env={**env, **(extra or {})}, capture_output=not stream)
    if result.returncode:
        # Test-only output; never print command lines that carry fixture credentials.
        if not stream: print(result.stdout[-4000:], result.stderr[-4000:], flush=True)
        raise RuntimeError('Fixture command failed: ' + str(command[0]))
    if not stream and not quiet and result.stdout.strip():
        print(result.stdout[-4000:], flush=True)
    return result.stdout

def spawn(name, command, *, cwd=None, extra=None):
    log = (work / (name + '.log')).open('w')
    logs.append(log)
    process = subprocess.Popen([str(x) for x in command], cwd=cwd, stdout=log, stderr=subprocess.STDOUT,
                               env={**env, **(extra or {})})
    children.append(process)
    return process

def cleanup():
    for proxy in proxies:
        proxy.shutdown()
    for process in reversed(children):
        if process.poll() is None:
            process.terminate()
    for process in reversed(children):
        try: process.wait(timeout=10)
        except subprocess.TimeoutExpired: process.kill()
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
            context = ssl._create_unverified_context() if url.startswith('https://127.0.0.1:') else None
            with urllib.request.urlopen(url, timeout=2, context=context) as response:
                if response.status == 200: return
        except Exception: time.sleep(.3)
    raise RuntimeError('Fixture HTTP startup timed out')

mysql_host = env.get('ALWP_MYSQL_HOST', '127.0.0.1')
mysql_port = int(env.get('ALWP_MYSQL_PORT', '3307'))
if mysql_host not in {'127.0.0.1', 'localhost'}:
    raise SystemExit('Disposable fixture databases must be loopback-only.')
if env.get('ALWP_MARIADBD'):
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
if urlparse(database_url).hostname not in {'127.0.0.1', 'localhost'}:
    raise SystemExit('Disposable PostgreSQL fixtures must be loopback-only.')

issuer = 'https://127.0.0.1:8083/realms/accesslobby-first-party'
api = 'http://127.0.0.1:8090'
password = secrets.token_urlsafe(24)
https_marker = secrets.token_urlsafe(32)
cert = work / 'fixture-cert.pem'
key = work / 'fixture-key.pem'
run(['openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key,
     '-out', cert, '-days', '1', '-subj', '/CN=127.0.0.1',
     '-addext', 'subjectAltName=IP:127.0.0.1,DNS:localhost'], quiet=True)
key.chmod(0o600)
truststore = work / 'fixture-trust.p12'
keytool = str(Path(env['JAVA_HOME']) / 'bin/keytool') if env.get('JAVA_HOME') else 'keytool'
run([keytool, '-importcert', '-noprompt', '-alias', 'fixture', '-file', cert,
     '-keystore', truststore, '-storepass', 'fixture-only-password'], quiet=True)
spec = importlib.util.spec_from_file_location('alwp_tls_proxy', plugin / 'tests/tls_proxy.py')
tls_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tls_module)
mail_spec = importlib.util.spec_from_file_location('alwp_smtp_fixture', plugin / 'tests/smtp_fixture.py')
mail_module = importlib.util.module_from_spec(mail_spec)
mail_spec.loader.exec_module(mail_module)
mailbox = work / 'private-mailbox'
proxies.append(mail_module.start_mailbox(mailbox))
realm = json.loads((repo / 'infra/keycloak/realm.template.json').read_text())
realm.update({'loginTheme': 'keycloak', 'sslRequired': 'none', 'registrationAllowed': True,
              'verifyEmail': True, 'resetPasswordAllowed': False,
              'smtpServer': {'host': '127.0.0.1', 'port': '2525', 'from': 'iam@example.test',
                             'auth': 'false', 'ssl': 'false', 'starttls': 'false'}})
template = realm['clients'][0]
template['redirectUris'] = ['http://127.0.0.1:8091/callback']
template['webOrigins'] = ['http://127.0.0.1:8091']
template['attributes']['post.logout.redirect.uris'] = 'http://127.0.0.1:8091/'
template['attributes']['backchannel.logout.url'] = api + '/v1/backchannel-logout'
sites = []
for label, port, prefix, woo in [('a', 8081, '', True), ('b', 8082, '/gh', False)]:
    woo = woo and env.get('ALWP_WITH_WOO', 'true') == 'true'
    tls_port = port + 360
    base = f'https://127.0.0.1:{tls_port}{prefix}'
    client = copy.deepcopy(template)
    client.update({'clientId': 'wordpress-' + label, 'name': 'Disposable WordPress ' + label,
                   'redirectUris': [base + '/wp-login.php?action=al_callback'], 'webOrigins': [f'https://127.0.0.1:{tls_port}'],
                   'defaultClientScopes': ['basic', 'profile', 'email']})
    client['attributes'].update({'post.logout.redirect.uris': base + '/wp-login.php?action=al_signed_out',
        'backchannel.logout.url': base + '/?rest_route=/accesslobby/v1/backchannel-logout',
        'backchannel.logout.session.required': 'true'})
    realm['clients'].append(client)
    sites.append({'label': label, 'base': base, 'port': port, 'tlsPort': tls_port, 'prefix': prefix, 'woo': woo, 'client': client['clientId']})
# Isolated IAM-only privacy probes: never registered/admitted as AccessLobby external applications.
privacy_clients = []
for label in ['one', 'two']:
    external = copy.deepcopy(template)
    callback = f'https://external-{label}.example.test/wp-login.php?action=al_callback'
    external.update({'clientId': 'external-privacy-' + label, 'name': 'Inactive privacy probe',
        'redirectUris': [callback], 'webOrigins': [], 'defaultClientScopes': ['basic'], 'optionalClientScopes': [],
        'attributes': {'pkce.code.challenge.method': 'S256'}, 'protocolMappers': [
            {'name': 'pairwise-probe', 'protocol': 'openid-connect', 'protocolMapper': 'oidc-sha256-pairwise-sub-mapper',
             'config': {'pairwiseSubAlgorithmSalt': secrets.token_urlsafe(32)}},
            {'name': 'isolated-probe-audience', 'protocol': 'openid-connect', 'protocolMapper': 'oidc-audience-mapper',
             'config': {'included.custom.audience': 'external-api-pilot', 'access.token.claim': 'true', 'id.token.claim': 'false'}}]})
    realm['clients'].append(external)
    privacy_clients.append({'clientId': external['clientId'], 'callback': callback})
reference_origin = 'http://127.0.0.1:8093'
reference_client = copy.deepcopy(template)
reference_client.update({'clientId': 'wordpress-reference-peer', 'name': 'Independent reference consumer',
    'redirectUris': [reference_origin + '/callback'], 'webOrigins': [reference_origin]})
reference_client['attributes'].update({'post.logout.redirect.uris': reference_origin + '/',
    'backchannel.logout.url': reference_origin + '/backchannel-logout', 'backchannel.logout.session.required': 'true'})
realm['clients'].append(reference_client)
realm['users'] = [{'id': str(uuid.uuid4()), 'username': name, 'enabled': True, 'emailVerified': True,
    'email': name + '@example.test', 'firstName': name, 'lastName': 'Fixture',
    'credentials': [{'type': 'password', 'value': password, 'temporary': False}]}
    for name in ['shopper', 'newperson', 'staff']]
imports = args.keycloak_home / 'data/import'
imports.mkdir(parents=True, exist_ok=True)
(imports / 'wordpress-fixture-realm.json').unlink(missing_ok=True)
realm_file = imports / 'accesslobby-first-party-realm.json'
realm_file.write_text(json.dumps(realm)); realm_file.chmod(0o600)
kc = spawn('keycloak', [args.keycloak_home / 'bin/kc.sh', 'start-dev', '--http-enabled=false', '--https-port=8083', '--http-host=127.0.0.1',
    '--https-certificate-file=' + str(cert), '--https-certificate-key-file=' + str(key),
    '--hostname=https://127.0.0.1:8083', '--db-url=jdbc:h2:file:' + str(work / 'iam') + ';NON_KEYWORDS=VALUE;DB_CLOSE_ON_EXIT=FALSE',
    '--import-realm'], extra={'KC_BOOTSTRAP_ADMIN_USERNAME': 'fixture_operator', 'KC_BOOTSTRAP_ADMIN_PASSWORD': secrets.token_urlsafe(32),
    'JAVA_OPTS_APPEND': '-Djavax.net.ssl.trustStore=' + str(truststore) + ' -Djavax.net.ssl.trustStorePassword=fixture-only-password'})
wait_url(issuer + '/.well-known/openid-configuration', kc, 120)
print('FIXTURE real Keycloak ready', flush=True)

api_env = {'DATABASE_URL': database_url, 'OIDC_ISSUER': issuer, 'OIDC_API_AUDIENCE': 'accesslobby-api', 'NODE_EXTRA_CA_CERTS': str(cert),
    'ALLOWED_CLIENT_IDS': 'accesslobby-web,wordpress-a,wordpress-b', 'PORT': '8090', 'GIT_SHA': 'wordpress-disposable-fixture'}
run(['node', '--import', 'tsx', 'src/migrate.ts'], cwd=repo / 'apps/api', extra=api_env)
seed = """import {Pool} from 'pg'; const p=new Pool({connectionString:process.env.DATABASE_URL});
const owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
await p.query("INSERT INTO persons(id,status) VALUES($1,'active')",[owner]);
for(const s of JSON.parse(process.env.ALWP_SITE_CLIENTS)){
await p.query(`INSERT INTO applications(id,client_id,name,owner_person_id,redirect_uri,logout_uri,backchannel_logout_uri,
visibility,admission,trust_class,status,activated_at,review_reference,origin_challenge,origin_verified_at,origin_verified_host,platform)
VALUES($1,$2,$3,$4,$5,$6,$7,'hidden','authenticated_open','first_party','active',now(),'disposable-fixture','synthetic-proof',now(),'127.0.0.1','wordpress')`,
[s.id,s.client,s.client,owner,s.base+'/wp-login.php?action=al_callback',s.base+'/wp-login.php?action=al_signed_out',s.base+'/?rest_route=/accesslobby/v1/backchannel-logout']);}
await p.end();"""
for site in sites: site['id'] = str(uuid.uuid4())
run(['node', '--input-type=module', '-e', seed], cwd=repo / 'apps/api',
    extra={**api_env, 'ALWP_SITE_CLIENTS': json.dumps(sites)}, quiet=True)
run(['node', '--input-type=module', '-e', """import {Pool} from 'pg';const p=new Pool({connectionString:process.env.DATABASE_URL});
await p.query(`INSERT INTO applications(id,client_id,name,owner_person_id,redirect_uri,logout_uri,backchannel_logout_uri,
visibility,admission,trust_class,status,activated_at,origin_challenge,origin_verified_at,origin_verified_host,review_reference)
VALUES(gen_random_uuid(),'wordpress-reference-peer','Reference peer','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
'http://127.0.0.1:8093/callback','http://127.0.0.1:8093/','http://127.0.0.1:8093/backchannel-logout',
'hidden','authenticated_open','first_party','active',now(),'synthetic-proof',now(),'127.0.0.1','disposable-fixture')`);await p.end();"""],
    cwd=repo / 'apps/api', extra=api_env, quiet=True)
api_process = spawn('api', ['node', '--import', 'tsx', 'src/main.ts'], cwd=repo / 'apps/api', extra=api_env)
wait_url(api + '/health/ready', api_process)
print('FIXTURE AccessLobby API and PostgreSQL ready', flush=True)
reference = spawn('reference-peer', ['node', 'examples/reference-consumer/server.mjs'], cwd=repo,
    extra={'CONSUMER_ORIGIN': reference_origin, 'OIDC_ISSUER': issuer, 'OIDC_CLIENT_ID': 'wordpress-reference-peer',
           'ACCESSLOBBY_API_URL': api, 'APP_ENTRY_REQUIRED': 'true', 'PUBLIC_REGISTRATION_ENABLED': 'false',
           'PORT': '8093', 'NODE_EXTRA_CA_CERTS': str(cert)})
wait_url(reference_origin + '/health/ready', reference)
print('FIXTURE independent reference consumer ready', flush=True)

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
    wp('option', 'update', 'home', site['base'], quiet=True)
    wp('option', 'update', 'siteurl', site['base'], quiet=True)
    assert wp('option', 'get', 'siteurl', quiet=True).strip() == site['base']
    if env.get('ALWP_THEME') == 'kadence' and site['label'] == 'a':
        wp('theme', 'install', str(runtime / 'kadence.zip'), '--activate', quiet=True)
        assert wp('option', 'get', 'template', quiet=True).strip() == 'kadence', 'Requested theme did not activate'
    wp('plugin', 'install', str(args.package.resolve()), '--activate', quiet=True)
    wp('plugin', 'deactivate', 'accesslobby-sso', quiet=True)
    wp('plugin', 'activate', 'accesslobby-sso', quiet=True)
    if site['woo']:
        wp('plugin', 'install', str(runtime / 'woocommerce.zip'), '--activate', quiet=True)
        wp('eval', 'WC_Install::install();', quiet=True)
        # Fresh disposable stores only: make each storage lane explicit before any order exists.
        hpos = env.get('ALWP_HPOS', 'false') == 'true'
        wp('option', 'update', 'woocommerce_custom_orders_table_data_sync_enabled', 'no', quiet=True)
        wp('option', 'update', 'woocommerce_custom_orders_table_enabled', 'yes' if hpos else 'no', quiet=True)
        actual_hpos = wp('eval', 'echo Automattic\\WooCommerce\\Utilities\\OrderUtil::custom_orders_table_usage_is_enabled() ? "yes" : "no";', quiet=True).strip()
        assert actual_hpos == ('yes' if hpos else 'no'), 'Requested Woo order storage is not active'
    config = {'issuer': issuer, 'api': api, 'client_id': site['client'], 'mode': 'hybrid', 'jit': True,
              'default_role': 'customer' if site['woo'] else 'subscriber', 'machine_auth': True}
    wp('option', 'update', 'accesslobby_sso', json.dumps(config), '--format=json', quiet=True)
    mu = path / 'wp-content/mu-plugins'; mu.mkdir(exist_ok=True)
    shutil.copyfile(plugin / 'tests/fixture-mu.php', mu / 'accesslobby-fixture.php')
    shutil.copyfile(plugin / 'tests/unavailable-fixture.php', mu / 'accesslobby-unavailable-fixture.php')
    (mu / 'fixture-ca.php').write_text("<?php\nadd_filter('http_request_args',static function($args,$url){if(parse_url($url,PHP_URL_HOST)==='127.0.0.1'){$args['sslcertificates']=" + repr(str(cert)) + ";}return $args;},10,2);\n")
    data = wp('eval-file', str(plugin / 'tests/setup-fixture.php'), extra={'ALWP_FIXTURE_PASSWORD': password,
              'ALWP_FIXTURE_EMAIL': 'shopper@example.test' if site['label'] == 'a' else 'local-only@example.test'}, quiet=True)
    site.update(json.loads(data.strip()))
    wp('eval-file', str(plugin / 'tests/integration.php'), extra={'ALWP_INTEGRATION_RESULT': str(work / ('integration-' + site['label'] + '.json'))})
    wp('eval-file', str(plugin / 'tests/security-integration.php'), extra={'ALWP_SECURITY_RESULT': str(work / ('security-' + site['label'] + '.json'))})
    inventory_snapshot = '''$d=['users'=>count_users()['total_users'],'config'=>get_option('accesslobby_sso'),
        'guest'=>get_option('woocommerce_enable_guest_checkout')];
        if(function_exists('wc_get_orders')){$d['orders']=count(wc_get_orders(['limit'=>-1,'return'=>'ids']));}
        echo wp_json_encode($d);'''
    before_inventory = wp('eval', inventory_snapshot, quiet=True)
    inventory = wp('eval-file', str(plugin / 'scripts/site-inventory.php'), '--skip-plugins', '--skip-themes', quiet=True)
    report = json.loads(inventory)
    assert report['authenticationQualification'] == 'NOT_RUN'
    assert report['siteUrl'].rstrip('/') == site['base']
    assert all(value not in inventory for value in [password, 'legacy_shopper', 'shopper@example.test', 'local-only@example.test'])
    assert wp('eval', inventory_snapshot, quiet=True) == before_inventory, 'Inventory changed local state'
    (work / ('inventory-' + site['label'] + '.json')).write_text(json.dumps(report, indent=2) + '\n')
    router = base_dir / 'router.php'
    docroot = path.parent if site['prefix'] else path
    router.write_text("<?php\nif(($_SERVER['REMOTE_ADDR']??'')==='127.0.0.1' && hash_equals(" + repr(https_marker) + ",$_SERVER['HTTP_X_ALWP_FIXTURE_HTTPS']??'')){$_SERVER['HTTPS']='on';}\n$p=parse_url($_SERVER['REQUEST_URI'],PHP_URL_PATH);\n" +
        "$root=" + repr(str(docroot)) + ";\nif(is_file($root.$p)||is_dir($root.$p))return false;\nrequire " + repr(str(path / 'index.php')) + ";\n")
    http = spawn('wordpress-' + site['label'], [php, '-S', '127.0.0.1:' + str(site['port']), '-t', docroot, router])
    wait_port(site['port'], http)
    proxies.append(tls_module.start_proxy(site['tlsPort'], site['port'], cert, key, https_marker))
    wait_url(site['base'] + '/', http)
    print('FIXTURE WordPress ' + site['label'] + ' ready', flush=True)

fixture = {'sites': sites, 'issuer': issuer, 'api': api, 'password': password, 'php': php, 'wpCli': wp_cli,
           'artifactDir': str(work), 'certificate': str(cert), 'package': str(args.package.resolve()),
           'upgradePackage': str(args.upgrade_from.resolve()), 'mailbox': str(mailbox),
           'privacyClients': privacy_clients, 'privateProviderSubject': realm['users'][0]['id'], 'referencePeer': reference_origin}
config_file = work / 'private-fixture-config.json'
config_file.write_text(json.dumps(fixture)); config_file.chmod(0o600)
run(['node', '--import', 'tsx', 'test/external-privacy-live.mjs', str(config_file)], cwd=repo / 'apps/api',
    extra={'NODE_EXTRA_CA_CERTS': str(cert)}, stream=True)
run(['python3', str(plugin / 'tests/concurrency.py'), str(config_file)], cwd=repo, stream=True)
driver = env.get('ALWP_FIXTURE_DRIVER', 'browser')
if driver == 'http':
    run(['python3', str(plugin / 'tests/http_flow.py'), str(config_file)], cwd=repo, stream=True)
else:
    run(['node', str(plugin / 'tests/browser.mjs'), str(config_file)], cwd=repo, stream=True)
for site in sites:
    def final_wp(*command):
        return run([php, wp_cli, '--path=' + site['path'], *command], quiet=True).strip()
    snapshot_code = '''global $wpdb;
    $data=['users'=>count_users()['total_users'],'links'=>$wpdb->get_var("SELECT COUNT(*) FROM {$wpdb->prefix}accesslobby_links")];
    if(function_exists('wc_get_orders')){$data['orders']=count(wc_get_orders(['limit'=>-1,'return'=>'ids']));}
    echo wp_json_encode($data);'''
    before = final_wp('eval', snapshot_code)
    final_wp('plugin', 'uninstall', 'accesslobby-sso', '--deactivate')
    after = final_wp('eval', snapshot_code)
    assert json.loads(before) == json.loads(after), 'Uninstall changed local identity or commerce data'
    final_wp('plugin', 'install', str(args.package.resolve()), '--activate')
    assert json.loads(final_wp('eval', snapshot_code)) == json.loads(before)
    (work / ('lifecycle-' + site['label'] + '.json')).write_text(json.dumps({
        'install': 'PASS', 'activate': 'PASS', 'deactivateReactivate': 'PASS',
        'schemaUpgrade': 'PASS', 'uninstallDataPreservation': 'PASS', 'reinstallDataPreservation': 'PASS'}, indent=2) + '\n')
print('QUALIFICATION_PASS artifacts=' + str(work), flush=True)

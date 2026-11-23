"""Independent WP processes race real InnoDB mapping/state operations.

Data-layer tests with synthetic already-validated identities, not login evidence.
"""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import base64
import json
import subprocess
import sys
import uuid

fixture = json.loads(Path(sys.argv[1]).read_text())
site = fixture['sites'][0]
assert site['base'].startswith('https://127.0.0.1:')
cases = []


def wp(code):
    process = subprocess.run([fixture['php'], fixture['wpCli'], '--path=' + site['path'], 'eval', code],
                             capture_output=True, text=True, timeout=45)
    assert process.returncode == 0, 'Concurrent WordPress fixture worker failed'
    return process.stdout.strip()


def identity():
    return {'issuer': fixture['issuer'], 'identity': str(uuid.uuid4()), 'subject': str(uuid.uuid4()),
            'email': str(uuid.uuid4()) + '@example.test', 'email_verified': True}


def resolve(item, user=0):
    data = base64.b64encode(json.dumps(item).encode()).decode()
    code = '$s=new AccessLobby\\WordPress\\Store($GLOBALS["wpdb"]);'
    code += 'try{echo wp_json_encode(["user"=>$s->resolve(json_decode(base64_decode("' + data + '"),true),AccessLobby\\WordPress\\Config::get(),' + str(user) + ')]);}'
    code += 'catch(AccessLobby\\WordPress\\Failure $e){echo wp_json_encode(["error"=>$e->getMessage()]);}'
    return json.loads(wp(code))


def check(name, condition):
    assert condition, name
    cases.append({'name': name, 'status': 'PASS'})
    print('CONCURRENCY_PASS ' + name, flush=True)


try:
    before = int(wp('echo count_users()["total_users"];'))
    item = identity()
    with ThreadPoolExecutor(max_workers=2) as pool:
        outcomes = list(pool.map(lambda _: resolve(item), range(2)))
    check('concurrent JIT resolves exactly one local user and durable mapping',
          'user' in outcomes[0] and outcomes[0] == outcomes[1] and
          int(wp('echo count_users()["total_users"];')) == before + 1)

    local = int(wp('echo wp_insert_user(["user_login"=>"race_' + uuid.uuid4().hex + '","user_pass"=>wp_generate_password(64),"role"=>"subscriber"]);'))
    with ThreadPoolExecutor(max_workers=2) as pool:
        outcomes = list(pool.map(lambda item: resolve(item, local), [identity(), identity()]))
    check('conflicting concurrent links give one winner and one closed conflict',
          sorted('user' in result for result in outcomes) == [False, True] and
          [result.get('error') for result in outcomes if 'error' in result] == ['account_link_conflict'] and
          wp('echo implode(",",get_userdata(' + str(local) + ')->roles);') == 'subscriber')

    key = uuid.uuid4().hex
    prefix = '$s=new AccessLobby\\WordPress\\Store($GLOBALS["wpdb"]);'
    wp(prefix + '$s->state_put("' + key + '","auth_flow",[],300);')
    worker = prefix + 'try{$s->state_get("' + key + '","auth_flow",true);echo "consumed";}catch(AccessLobby\\WordPress\\Failure $e){echo "denied";}'
    with ThreadPoolExecutor(max_workers=2) as pool:
        outcomes = list(pool.map(lambda _: wp(worker), range(2)))
    check('concurrent callback state consumption succeeds once', sorted(outcomes) == ['consumed', 'denied'])
finally:
    Path(fixture['artifactDir'], 'concurrency.json').write_text(json.dumps({
        'evidenceType': 'REAL_WORDPRESS_DATABASE_CONCURRENCY', 'cases': cases}, indent=2) + '\n')

"""Real Code/PKCE/JWKS/API/WP HTTP acceptance when no local browser is available.

This is protocol evidence, explicitly separate from the Playwright UI suite.
"""
from html.parser import HTMLParser
from http.cookiejar import CookieJar
from pathlib import Path
from urllib.parse import urlencode, urljoin, urlparse, parse_qs
from urllib.request import build_opener, HTTPCookieProcessor, HTTPSHandler, Request
from urllib.error import HTTPError
import json
import ssl
import sys
import subprocess
import time

fixture = json.loads(Path(sys.argv[1]).read_text())
a, b = fixture['sites']
assert all(urlparse(s['base']).hostname == '127.0.0.1' for s in fixture['sites'])
jar = CookieJar()
client = build_opener(HTTPCookieProcessor(jar), HTTPSHandler(context=ssl.create_default_context(cafile=fixture['certificate'])))
cases = []


class Forms(HTMLParser):
    def __init__(self, html):
        super().__init__(); self.forms = []; self.form = None; self.feed(html)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'form':
            self.form = {'id': attrs.get('id'), 'action': attrs.get('action', ''), 'fields': {}}
            self.forms.append(self.form)
        elif self.form is not None and tag in {'input', 'button'} and attrs.get('name'):
            self.form['fields'][attrs['name']] = attrs.get('value', '')

    def handle_endtag(self, tag):
        if tag == 'form': self.form = None


def request(url, data=None):
    req = Request(url, data=urlencode(data).encode() if data is not None else None)
    try:
        with client.open(req, timeout=30) as response:
            return response.geturl(), response.read().decode(), response.status, response.headers
    except HTTPError as error:
        return error.geturl(), error.read().decode(), error.code, error.headers


def form(page, predicate):
    found = [f for f in Forms(page[1]).forms if predicate(f)]
    assert len(found) == 1, 'Expected one matching form, got ' + str(len(found))
    return found[0]


def submit(page, item, overrides=None):
    return request(urljoin(page[0], item['action']), {**item['fields'], **(overrides or {})})


def wp(site, code):
    result = subprocess.run([fixture['php'], fixture['wpCli'], '--path=' + site['path'], 'eval', code],
                            text=True, capture_output=True, timeout=30)
    assert result.returncode == 0, 'WP fixture inspection failed'
    return result.stdout.strip()


def check(name, operation):
    started = time.monotonic()
    operation()
    cases.append({'name': name, 'status': 'PASS', 'milliseconds': round((time.monotonic()-started)*1000)})
    print('HTTP_PASS ' + name, flush=True)


def account(site):
    page = request(site['account'])
    import re
    return int(re.search(r'id="fixture-identity" data-user="(\d+)"', page[1]).group(1))


def logout(site, scope='site'):
    page = request(site['base'] + '/wp-login.php?action=al_logout')
    item = form(page, lambda f: '_wpnonce' in f['fields'])
    result = submit(page, item, {'scope': scope})
    if scope == 'all' and urlparse(result[0]).port == 8083:
        item = form(result, lambda f: True)
        result = submit(result, item)
    assert result[2] == 200, 'Logout did not complete'
    return result


try:
    page = request(a['base'] + '/wp-login.php')
    item = form(page, lambda f: f['id'] == 'loginform')
    page = submit(page, item, {'log': 'legacy_shopper', 'pwd': fixture['password'], 'redirect_to': a['account'], 'testcookie': '1'})
    check('local WordPress login preserves legacy customer', lambda: account(a) == a['legacyUser'] or (_ for _ in ()).throw(AssertionError('Wrong local account')))
    page = request(a['account'])
    item = form(page, lambda f: f['fields'].get('intent') == 'link')
    page = submit(page, item)
    item = form(page, lambda f: f['id'] == 'kc-form-login')
    page = submit(page, item, {'username': 'shopper', 'password': fixture['password']})
    assert page[2] == 200, 'OIDC callback rejected: ' + str(page[2]) + ' / ' + page[1][-1200:]
    check('fresh real IAM dual proof links original WP customer', lambda: account(a) == a['legacyUser'] or (_ for _ in ()).throw(AssertionError('Link failed')))
    logout(a)
    assert account(a) == 0
    page = request(a['base'] + '/wp-login.php?action=al_start&' + urlencode({'redirect_to': a['protected']}))
    check('quiet OIDC re-entry restores original protected target', lambda: page[0] == a['protected'] or (_ for _ in ()).throw(AssertionError('Re-entry failed: ' + page[1][-1200:])))
    page = request(b['base'] + '/wp-login.php?action=al_start&' + urlencode({'redirect_to': b['protected']}))
    assert page[0] == b['protected'], 'Site B did not quietly reuse issuer session: ' + page[1][-1200:]
    b_user = account(b)
    assert b_user > 0 and b_user != a['legacyUser']
    check('independent subdirectory WordPress SSO creates separate local account', lambda: None)
    assert wp(a, 'echo implode(",",get_userdata(' + str(a['legacyUser']) + ')->roles);') == 'customer'
    assert wp(b, 'echo implode(",",get_userdata(' + str(b_user) + ')->roles);') == 'subscriber'
    check('site-local roles differ and commerce ownership remains local', lambda: None)
    logout(a)
    assert account(a) == 0 and account(b) == b_user
    check('site-only logout leaves the other WordPress session active', lambda: None)
    page = request(a['base'] + '/wp-login.php?action=al_start&' + urlencode({'redirect_to': a['account']}))
    assert account(a) == a['legacyUser']
    logout(a, 'all')
    assert account(a) == 0 and account(b) == 0
    check('actual issuer backchannel logout invalidates both participating peers', lambda: None)
    page = request(b['base'] + '/wp-login.php?action=al_start')
    assert 'kc-form-login' in page[1]
    check('shared logout ends quiet re-entry for this browser session', lambda: None)
finally:
    Path(fixture['artifactDir'], 'http-report.json').write_text(json.dumps({
        'evidenceType': 'HTTP_PROTOCOL_NOT_BROWSER_UI', 'cases': cases}, indent=2) + '\n')

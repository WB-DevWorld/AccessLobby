"""Loopback HTTP gateway for disposable WordPress fixtures.

Static files are served in-process. Each PHP request is a one-shot php-cgi
process, so a stuck page cannot stop the site from accepting the next request.
The Windows PHP built-in server deadlocks under that load.
"""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit
import argparse
import os
import re
import subprocess
import sys
import time

HOP = {'connection', 'keep-alive', 'proxy-connection', 'transfer-encoding', 'upgrade', 'te', 'trailer'}
TYPES = {
    '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
    '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.map': 'application/json',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
    '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
}

parser = argparse.ArgumentParser()
parser.add_argument('--port', type=int, required=True)
parser.add_argument('--docroot', type=Path, required=True)
parser.add_argument('--front', type=Path, required=True)
parser.add_argument('--php', type=Path, required=True)
parser.add_argument('--bind', default='127.0.0.1')
args = parser.parse_args()
if args.bind not in ('127.0.0.1', '0.0.0.0'):
    raise SystemExit('Fixture gateway refuses this bind address')
docroot = args.docroot.resolve()
front = args.front.resolve()
if not front.is_file() or not args.php.is_file() or docroot not in front.parents:
    raise SystemExit('Fixture gateway paths are not usable')

HIDDEN_QUERY = {'logout_token', 'code', 'id_token', 'access_token', 'refresh_token'}

def visible_target(raw):
    parts = urlsplit(raw)
    query = parts.query
    for key in HIDDEN_QUERY:
        query = re.sub('(?i)(^|&)' + re.escape(key) + '=[^&]*', r'\1' + key + '=redacted', query)
    return parts.path + (('?' + query) if query else '')

def inside(path):
    resolved = path.resolve()
    return resolved == docroot or docroot in resolved.parents, resolved

class Gateway(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'

    def do_GET(self): self.serve(False)
    def do_HEAD(self): self.serve(True)
    def do_POST(self): self.serve(False)

    def serve(self, head_only):
        started = time.monotonic()
        try:
            status = self.dispatch(head_only)
        except Exception as error:
            status = 500
            body = str(error).encode()
            self.reply(500, [('Content-Type', 'text/plain; charset=utf-8'), ('Content-Length', str(len(body)))], body, False)
        sys.stderr.write('%s %s %s %dms\n' % (self.command, visible_target(self.path), status, int((time.monotonic() - started) * 1000)))
        sys.stderr.flush()

    def dispatch(self, head_only):
        parts = urlsplit(self.path)
        if '\x00' in parts.path or parts.path.startswith('//'):
            self.reply(400, [('Content-Length', '0')], b'', head_only)
            return 400
        relative = Path(parts.path.lstrip('/'))
        allowed, candidate = inside(docroot / relative)
        if not allowed:
            self.reply(400, [('Content-Length', '0')], b'', head_only)
            return 400
        if candidate.is_file() and candidate.suffix.lower() != '.php':
            body = candidate.read_bytes()
            headers = [('Content-Type', TYPES.get(candidate.suffix.lower(), 'application/octet-stream')),
                       ('Content-Length', str(len(body)))]
            self.reply(200, headers, body, head_only)
            return 200
        script = candidate if candidate.is_file() else front
        script_path = '/' + script.relative_to(docroot).as_posix()
        length = int(self.headers.get('Content-Length', '0') or '0')
        if length < 0 or length > 8388608:
            self.reply(413, [('Content-Length', '0')], b'', head_only)
            return 413
        body = self.rfile.read(length) if length else b''
        status, headers, payload = self.php(script, script_path, parts.query, body)
        self.reply(status, headers, payload, head_only)
        return status

    def php(self, script, script_path, query, body):
        host = self.headers.get('Host', '127.0.0.1:%d' % args.port)
        name, _, port = host.partition(':')
        environment = os.environ.copy()
        environment.update({
            'REDIRECT_STATUS': '200', 'GATEWAY_INTERFACE': 'CGI/1.1', 'SERVER_PROTOCOL': 'HTTP/1.1',
            'REQUEST_METHOD': self.command, 'REQUEST_URI': self.path, 'QUERY_STRING': query,
            'SCRIPT_FILENAME': str(script), 'SCRIPT_NAME': script_path, 'PHP_SELF': script_path,
            'DOCUMENT_ROOT': str(docroot), 'SERVER_NAME': name or '127.0.0.1', 'SERVER_PORT': port or str(args.port),
            'REMOTE_ADDR': self.client_address[0], 'CONTENT_LENGTH': str(len(body)),
            'CONTENT_TYPE': self.headers.get('Content-Type', ''), 'HTTP_HOST': host,
        })
        for key, value in self.headers.items():
            if key.lower() in HOP or key.lower() in {'content-length', 'content-type', 'host'}:
                continue
            environment['HTTP_' + key.upper().replace('-', '_')] = value
        completed = subprocess.run([str(args.php)], input=body, capture_output=True, env=environment, timeout=25)
        if completed.returncode != 0 and not completed.stdout:
            raise RuntimeError('php-cgi exited %s' % completed.returncode)
        raw = completed.stdout
        separator = b'\r\n\r\n' if b'\r\n\r\n' in raw else b'\n\n'
        head, _, payload = raw.partition(separator)
        status = 200
        headers = []
        for line in head.decode('iso-8859-1', 'replace').splitlines():
            if not line or ':' not in line:
                continue
            field, value = line.split(':', 1)
            if field.lower() == 'status':
                status = int(value.strip().split(' ', 1)[0])
            elif field.lower() not in HOP | {'content-length'}:
                headers.append((field.strip(), value.strip()))
        headers.append(('Content-Length', str(len(payload))))
        return status, headers, payload

    def reply(self, status, headers, body, head_only):
        self.send_response(status)
        for field, value in headers:
            self.send_header(field, value)
        self.end_headers()
        if not head_only and body:
            self.wfile.write(body)

    def log_message(self, fmt, *values):
        return

class Server(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True

Server((args.bind, args.port), Gateway).serve_forever()

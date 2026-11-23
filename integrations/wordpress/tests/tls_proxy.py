"""Loopback-only HTTPS fixture proxy. No authentication bypass or production use."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from http.client import HTTPConnection
import ssl
from threading import Thread


def start_proxy(port, backend_port, certificate, key, marker):
    class Handler(BaseHTTPRequestHandler):
        def proxy(self):
            length = int(self.headers.get('Content-Length', '0'))
            if length > 1000000:
                self.send_error(413)
                return
            body = self.rfile.read(length) if length else None
            headers = {k: v for k, v in self.headers.items()
                       if k.lower() not in {'connection', 'transfer-encoding', 'x-alwp-fixture-https'}}
            headers['X-Alwp-Fixture-Https'] = marker
            connection = HTTPConnection('127.0.0.1', backend_port, timeout=30)
            try:
                connection.request(self.command, self.path, body=body, headers=headers)
                response = connection.getresponse()
                payload = response.read()
                self.send_response(response.status)
                for name, value in response.getheaders():
                    if name.lower() not in {'connection', 'transfer-encoding', 'content-length', 'server', 'date'}:
                        self.send_header(name, value)
                self.send_header('Content-Length', str(len(payload)))
                self.end_headers()
                if self.command != 'HEAD':
                    try:
                        self.wfile.write(payload)
                    except (BrokenPipeError, ConnectionResetError):
                        pass
            finally:
                connection.close()

        do_GET = proxy
        do_POST = proxy
        do_HEAD = proxy

        def log_message(self, *_):
            # Do not log authorization codes, state, cookies or POST bodies.
            pass

    server = ThreadingHTTPServer(('127.0.0.1', port), Handler)
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.load_cert_chain(certificate, key)
    server.socket = context.wrap_socket(server.socket, server_side=True)
    Thread(target=server.serve_forever, daemon=True).start()
    return server

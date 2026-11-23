"""Loopback-only capture of synthetic IAM verification mail; never delivers mail.

Private links stay in the disposable runtime directory and are never CI artifacts.
"""
from email import policy
from email.parser import BytesParser
from pathlib import Path
import hashlib
import json
import re
import socketserver
import threading


def start_mailbox(directory: Path):
    directory.mkdir(mode=0o700)

    class Capture(socketserver.StreamRequestHandler):
        def reply(self, text):
            self.wfile.write((text + '\r\n').encode()); self.wfile.flush()

        def handle(self):
            self.reply('220 fixture ESMTP')
            recipients = []
            while line := self.rfile.readline(8192):
                command = line.decode('ascii', errors='replace').strip()
                verb = command.split(' ', 1)[0].upper()
                if verb in {'EHLO', 'HELO'}:
                    self.reply('250-fixture'); self.reply('250 SIZE 1048576')
                elif verb == 'MAIL':
                    recipients = []; self.reply('250 OK')
                elif verb == 'RCPT':
                    address = re.search(r'<([^>]+)>', command)
                    if not address or not address[1].endswith('@example.test'):
                        self.reply('550 Synthetic fixture recipients only'); continue
                    recipients.append(address[1]); self.reply('250 OK')
                elif verb == 'DATA':
                    self.reply('354 End with a dot')
                    body = bytearray()
                    while chunk := self.rfile.readline(8192):
                        if chunk == b'.\r\n': break
                        body.extend(chunk[1:] if chunk.startswith(b'..') else chunk)
                        if len(body) > 1048576: return
                    message = BytesParser(policy=policy.default).parsebytes(bytes(body))
                    plain = message.get_body(preferencelist=('plain',))
                    text = plain.get_content() if plain else ''
                    links = re.findall(r'https://127\.0\.0\.1:8083/[^\s<>]+', text)
                    for recipient in recipients:
                        path = directory / (hashlib.sha256(recipient.encode()).hexdigest() + '.json')
                        path.write_text(json.dumps({'recipient': recipient, 'links': links}))
                        path.chmod(0o600)
                    self.reply('250 Captured locally')
                elif verb == 'QUIT':
                    self.reply('221 Bye'); return
                elif verb in {'RSET', 'NOOP'}:
                    self.reply('250 OK')
                else:
                    self.reply('502 Unsupported fixture command')

    server = socketserver.ThreadingTCPServer(('127.0.0.1', 2525), Capture)
    server.daemon_threads = True
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server

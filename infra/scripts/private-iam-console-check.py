#!/usr/bin/env python3
"""Credential-free private IAM routing readiness; never authenticates or changes IAM."""

import argparse
import http.client
import ipaddress
import json
import re
import socket
import ssl
import time
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from typing import NamedTuple
from urllib.parse import urljoin, urlsplit

REALM_PATH = "/realms/accesslobby-first-party"
CONSOLE_PATH = "/admin/master/console/"
MAX_DOCUMENT = 256 * 1024
MAX_ASSET = 8 * 1024 * 1024
MAX_ASSETS = 4


class ProbeFailure(Exception):
    def __init__(self, code):
        self.code = code


class Reply(NamedTuple):
    status: int
    headers: dict
    body: bytes


def checked_origin(value):
    try:
        p = urlsplit(value)
        if (p.scheme != "https" or not p.hostname or p.username is not None
                or p.password is not None or p.path not in ("", "/") or p.query
                or p.fragment or any(ord(c) < 33 or ord(c) > 126 for c in value)
                or any(c in value for c in ("%", "\\", "*")) or p.hostname.endswith(".")
                or (p.port is not None and not 1 <= p.port <= 65535)):
            raise ValueError
        host = p.hostname
        try:
            ipaddress.ip_address(host)
        except ValueError:
            if not re.fullmatch(r"[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?", host):
                raise ValueError
        return "https://" + p.netloc.lower()
    except (TypeError, ValueError):
        raise ProbeFailure("invalid_configuration") from None


def checked_issuer(value):
    try:
        p = urlsplit(value)
        base = checked_origin("https://" + p.netloc)
        if p.scheme != "https" or p.path != REALM_PATH or p.query or p.fragment:
            raise ProbeFailure("invalid_configuration")
        if value != base + REALM_PATH:
            raise ProbeFailure("invalid_configuration")
        return value
    except (TypeError, ValueError):
        raise ProbeFailure("invalid_configuration") from None


def checked_loopback(value):
    try:
        address = ipaddress.ip_address(value)
        if ("%" in value or not address.is_loopback
                or (isinstance(address, ipaddress.IPv6Address) and address.ipv4_mapped is not None)):
            raise ValueError
        return value
    except (TypeError, ValueError):
        raise ProbeFailure("private_transport_must_be_loopback") from None


def origin_of(value):
    p = urlsplit(value)
    return checked_origin("https://" + p.netloc)


def safe_link(value, base):
    if not isinstance(value, str) or len(value) > 4096 or any(ord(c) < 33 or ord(c) > 126 for c in value):
        raise ProbeFailure("unsafe_reference")
    p = urlsplit(urljoin(base, value))
    if p.scheme != "https" or p.username is not None or p.password is not None or p.query or p.fragment or "%" in p.path or "\\" in p.path:
        raise ProbeFailure("unsafe_reference")
    checked_origin("https://" + p.netloc)
    return p.geturl()


class LoopbackHTTPSConnection(http.client.HTTPSConnection):
    """Preserve the approved URL's Host/TLS SNI but pin TCP to an IP on loopback."""
    def __init__(self, host, port, *, connect_loopback, context, timeout):
        super().__init__(host, port, timeout=timeout, context=context)
        target = checked_loopback(connect_loopback)
        self._create_connection = lambda address, timeout, source_address=None: socket.create_connection(
            (target, address[1]), timeout, source_address)


def get_reply(url, *, context, timeout, max_body, connect_loopback=None):
    p = urlsplit(url)
    checked_origin("https://" + p.netloc)
    if p.scheme != "https" or p.query or p.fragment or p.username is not None or p.password is not None:
        raise ProbeFailure("unsafe_reference")
    if context.verify_mode != ssl.CERT_REQUIRED or not context.check_hostname:
        raise ProbeFailure("tls_verification_required")
    connection = (LoopbackHTTPSConnection(p.hostname, p.port or 443,
                  connect_loopback=connect_loopback, context=context, timeout=timeout)
                  if connect_loopback is not None else
                  http.client.HTTPSConnection(p.hostname, p.port or 443, timeout=timeout, context=context))
    try:
        connection.request("GET", p.path or "/", headers={
            "Accept": "application/json,text/html,text/css,application/javascript",
            "Cache-Control": "no-store", "User-Agent": "AccessLobby-Private-IAM-Readiness/1"})
        response = connection.getresponse()
        length = response.getheader("content-length")
        if length is not None and (not re.fullmatch(r"[0-9]{1,12}", length) or int(length) > max_body):
            raise ProbeFailure("response_too_large")
        body = response.read(max_body + 1)
        if len(body) > max_body:
            raise ProbeFailure("response_too_large")
        # Set-Cookie, authorization and all other response headers are discarded.
        return Reply(response.status, {"content-type": response.getheader("content-type", ""),
                                      "location": response.getheader("location", "")}, body)
    except ssl.SSLCertVerificationError:
        raise ProbeFailure("tls_validation_failed") from None
    except ssl.SSLError:
        raise ProbeFailure("tls_transport_failed") from None
    except (OSError, http.client.HTTPException, ValueError):
        raise ProbeFailure("transport_unavailable") from None
    finally:
        connection.close()


class ConsoleDocument(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.environments = []
        self.assets = []
        self._environment = None

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "script" and attrs.get("id") == "environment" and attrs.get("type") == "application/json":
            self._environment = []
        if tag == "script" and attrs.get("src"):
            self.assets.append(attrs["src"])
        if tag == "link" and attrs.get("rel") in ("stylesheet", "modulepreload") and attrs.get("href"):
            self.assets.append(attrs["href"])

    def handle_data(self, data):
        if self._environment is not None:
            self._environment.append(data)

    def handle_endtag(self, tag):
        if tag == "script" and self._environment is not None:
            self.environments.append("".join(self._environment))
            self._environment = None


def object_json(body):
    try:
        value = json.loads(body.decode("utf-8"))
        if not isinstance(value, dict):
            raise ValueError
        return value
    except (ValueError, UnicodeError):
        raise ProbeFailure("invalid_document") from None


class ReadinessChecker:
    def __init__(self, private_origin, connect_loopback, public_issuer, *, ca_file=None, timeout=5, getter=get_reply):
        self.private = checked_origin(private_origin)
        self.loopback = checked_loopback(connect_loopback)
        self.issuer = checked_issuer(public_issuer)
        self.public = origin_of(self.issuer)
        if not isinstance(timeout, (float, int)) or isinstance(timeout, bool) or not 1 <= timeout <= 8:
            raise ProbeFailure("invalid_configuration")
        self.timeout = timeout
        self.context = ssl.create_default_context()
        if ca_file:
            self.context.load_verify_locations(cafile=ca_file)
        # A private CA must not replace or extend the public issuer's trust.
        self.public_context = ssl.create_default_context()
        self.getter = getter
        self.assets = None
        self.deadline = 0
        self.result = {"contract": "accesslobby.private-iam-console-readiness.v1",
            "recordedAt": datetime.now(timezone.utc).isoformat(), "passed": False,
            "scope": "credential-free routing, metadata and bounded asset reads",
            "method": "GET", "privateTransportPinnedToLoopback": True,
            "authenticatedConsoleQualified": False, "loginAttempted": False,
            "targetConfigurationChanged": False, "checks": {}}

    def get(self, url, *, private=False, max_body=MAX_DOCUMENT):
        remaining = self.deadline - time.monotonic()
        if remaining <= 0:
            raise ProbeFailure("readiness_deadline_exceeded")
        return self.getter(url, context=self.context if private else self.public_context,
                           timeout=min(self.timeout, remaining),
                           max_body=max_body, connect_loopback=self.loopback if private else None)

    def private_reference(self, value):
        url = safe_link(value, self.private + "/")
        if origin_of(url) != self.private:
            if origin_of(url) == self.public:
                raise ProbeFailure("master_or_admin_reference_uses_public_origin")
            raise ProbeFailure("untrusted_reference_origin")
        return url

    def metadata(self, url, expected_issuer, *, private):
        reply = self.get(url, private=private)
        if reply.status != 200 or not reply.headers.get("content-type", "").lower().startswith("application/json"):
            raise ProbeFailure("metadata_unavailable")
        data = object_json(reply.body)
        if data.get("issuer") != expected_issuer:
            raise ProbeFailure("issuer_mismatch")
        for name in ("authorization_endpoint", "token_endpoint", "jwks_uri"):
            endpoint = safe_link(data.get(name), expected_issuer + "/")
            if origin_of(endpoint) != origin_of(expected_issuer) or not urlsplit(endpoint).path.startswith(urlsplit(expected_issuer).path + "/"):
                raise ProbeFailure("metadata_endpoint_mismatch")

    def check_console(self):
        url = self.private + CONSOLE_PATH
        for _ in range(3):
            reply = self.get(url, private=True)
            if 300 <= reply.status < 400:
                location = reply.headers.get("location", "")
                # Classify the public-master trap without following or logging
                # an OIDC redirect's transient query parameters.
                try:
                    target_parts = urlsplit(urljoin(url, location))
                    if (target_parts.scheme == "https" and target_parts.username is None
                            and target_parts.password is None):
                        target_origin = origin_of(target_parts.geturl())
                        if target_origin != self.private:
                            raise ProbeFailure("master_or_admin_reference_uses_public_origin"
                                               if target_origin == self.public else "untrusted_reference_origin")
                        if target_parts.path.startswith("/realms/master/"):
                            raise ProbeFailure("private_login_redirect_requires_browser_check")
                except ValueError:
                    raise ProbeFailure("unsafe_reference") from None
                target = self.private_reference(location)
                if urlsplit(target).path not in (CONSOLE_PATH, CONSOLE_PATH.rstrip("/")):
                    raise ProbeFailure("private_login_redirect_requires_browser_check")
                url = target
                continue
            break
        else:
            raise ProbeFailure("private_redirect_limit")
        if reply.status != 200 or not reply.headers.get("content-type", "").lower().startswith("text/html"):
            raise ProbeFailure("private_console_unavailable")
        try:
            parser = ConsoleDocument()
            parser.feed(reply.body.decode("utf-8"))
        except (UnicodeError, ValueError):
            raise ProbeFailure("invalid_console_document") from None
        if len(parser.environments) != 1:
            raise ProbeFailure("admin_environment_unconfirmed")
        env = object_json(parser.environments[0].encode())
        if (env.get("realm") != "master" or env.get("clientId") != "security-admin-console"
                or env.get("consoleBaseUrl") != CONSOLE_PATH):
            raise ProbeFailure("admin_environment_unconfirmed")
        # authServerUrl is deliberately checked as well as authUrl: a console
        # shell can load while JS sends authentication to blocked public master.
        for field in ("authServerUrl", "authUrl", "adminBaseUrl"):
            if urlsplit(self.private_reference(env.get(field))).path not in ("", "/"):
                raise ProbeFailure("admin_environment_unconfirmed")
        if not parser.assets or len(parser.assets) > 64:
            raise ProbeFailure("admin_assets_unconfirmed")
        assets = []
        for value in parser.assets:
            asset = self.private_reference(value)
            path = urlsplit(asset).path
            if not (path.startswith("/resources/") or path.startswith(CONSOLE_PATH + "assets/")) or not path.endswith((".js", ".css")):
                raise ProbeFailure("unsafe_asset_reference")
            if asset not in assets:
                assets.append(asset)
        self.assets = assets
        self.result["assetReferencesObserved"] = len(assets)

    def check_assets(self):
        if self.assets is None:
            raise ProbeFailure("console_prerequisite_missing")
        for asset in self.assets[:MAX_ASSETS]:
            reply = self.get(asset, private=True, max_body=MAX_ASSET)
            mime = reply.headers.get("content-type", "").lower().split(";")[0].strip()
            if reply.status != 200 or mime not in ("text/css", "application/javascript", "text/javascript") or not reply.body:
                raise ProbeFailure("admin_asset_unavailable")
        self.result["assetsChecked"] = min(len(self.assets), MAX_ASSETS)

    def check_public_restrictions(self):
        paths = {"adminRoot": "/admin/", "masterConsole": CONSOLE_PATH,
                 "masterRealm": "/realms/master/", "metrics": "/metrics", "health": "/health"}
        statuses = {}
        for label, path in paths.items():
            statuses[label] = self.get(self.public + path, max_body=8192).status
        self.result["publicRestrictedStatuses"] = statuses
        if any(status != 404 for status in statuses.values()):
            raise ProbeFailure("public_restriction_unconfirmed")

    def run(self):
        self.deadline = time.monotonic() + 45
        work = [
            ("publicIssuer", lambda: self.metadata(self.issuer + "/.well-known/openid-configuration", self.issuer, private=False)),
            ("publicRestrictedPaths", self.check_public_restrictions),
            ("privateConsoleDocument", self.check_console),
            ("privateMasterMetadata", lambda: self.metadata(self.private + "/realms/master/.well-known/openid-configuration", self.private + "/realms/master", private=True)),
            ("privateAssets", self.check_assets),
        ]
        for name, action in work:
            try:
                action()
                self.result["checks"][name] = {"result": "PASS"}
            except ProbeFailure as error:
                self.result["checks"][name] = {"result": "BLOCKED" if error.code == "console_prerequisite_missing" else "FAIL", "code": error.code}
            except Exception:
                # Never interpolate exception text, URLs, body data or headers.
                self.result["checks"][name] = {"result": "FAIL", "code": "check_unavailable"}
        self.result["passed"] = all(check["result"] == "PASS" for check in self.result["checks"].values())
        return self.result


class SafeParser(argparse.ArgumentParser):
    def error(self, message):
        raise ProbeFailure("invalid_arguments")


def main(argv=None):
    parser = SafeParser(description=__doc__)
    parser.add_argument("--private-origin", required=True, help="Exact approved HTTPS admin origin, with no credentials or path")
    parser.add_argument("--connect-loopback", required=True, help="IP literal of the local tunnel endpoint, such as 127.0.0.1")
    parser.add_argument("--public-issuer", required=True, help="Pinned public first-party HTTPS issuer")
    parser.add_argument("--ca-file", help="Optional approved CA bundle; certificate and hostname checks remain enabled")
    parser.add_argument("--timeout", type=float, default=5, help="Per-request seconds, 1 through 8; overall deadline 45 seconds")
    parser.add_argument("--output", type=Path, help="Optional categorical JSON result; no target URLs or response bodies")
    args = None
    try:
        args = parser.parse_args(argv)
        result = ReadinessChecker(args.private_origin, args.connect_loopback, args.public_issuer,
                                  ca_file=args.ca_file, timeout=args.timeout).run()
    except (ProbeFailure, OSError, ssl.SSLError) as error:
        result = {"contract": "accesslobby.private-iam-console-readiness.v1", "passed": False,
                  "authenticatedConsoleQualified": False, "loginAttempted": False,
                  "targetConfigurationChanged": False,
                  "code": error.code if isinstance(error, ProbeFailure) else "configuration_unavailable"}
    output = json.dumps(result, indent=2) + "\n"
    if args and args.output:
        try:
            args.output.parent.mkdir(parents=True, exist_ok=True)
            args.output.write_text(output)
        except OSError:
            result["passed"] = False
            result["outputWriteFailed"] = True
            output = json.dumps(result, indent=2) + "\n"
    print(output, end="")
    return 0 if result["passed"] else 2


if __name__ == "__main__":
    raise SystemExit(main())

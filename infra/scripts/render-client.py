#!/usr/bin/env python3
"""Render a public interactive OIDC client for an existing realm.

The output is a client representation for Keycloak's admin import, not a secret.
It does not mutate a running realm. Use one unique ID per consumer/environment.
"""
import argparse
import json
from pathlib import Path
from urllib.parse import urlparse


def exact_url(value: str, *, origin: bool = False) -> str:
    parsed = urlparse(value)
    if parsed.scheme not in ("https", "http") or not parsed.hostname:
        raise ValueError("absolute HTTPS URL required")
    if parsed.scheme == "http" and parsed.hostname not in ("localhost", "127.0.0.1"):
        raise ValueError("HTTP is allowed only on localhost")
    if parsed.username or parsed.password or parsed.fragment or parsed.query or "*" in value:
        raise ValueError("credentials, query, fragment and wildcards are forbidden")
    if origin and (parsed.path not in ("", "/") or parsed.params):
        raise ValueError("web origin must not contain a path")
    return value.rstrip("/") if origin else value


def representation(client_id: str, redirect: str, logout: str) -> dict:
    if not client_id or any(c not in "abcdefghijklmnopqrstuvwxyz0123456789-_" for c in client_id):
        raise ValueError("client ID must use lowercase letters, digits, hyphen or underscore")
    if client_id in ("accesslobby-api", "accesslobby-web"):
        raise ValueError("reserved client ID")
    callback = exact_url(redirect)
    post_logout = exact_url(logout)
    callback_origin = urlparse(callback)
    logout_origin = urlparse(post_logout)
    if (callback_origin.scheme, callback_origin.netloc) != (logout_origin.scheme, logout_origin.netloc):
        raise ValueError("logout and callback must have the same origin")
    origin = f"{callback_origin.scheme}://{callback_origin.netloc}"
    return {
        "clientId": client_id, "name": client_id, "enabled": True,
        "protocol": "openid-connect", "publicClient": True,
        "standardFlowEnabled": True, "implicitFlowEnabled": False,
        "directAccessGrantsEnabled": False, "serviceAccountsEnabled": False,
        "redirectUris": [callback], "webOrigins": [origin],
        "attributes": {"pkce.code.challenge.method": "S256", "post.logout.redirect.uris": post_logout},
        "protocolMappers": [{
            "name": "accesslobby-api-audience", "protocol": "openid-connect",
            "protocolMapper": "oidc-audience-mapper", "consentRequired": False,
            "config": {"included.client.audience": "accesslobby-api", "access.token.claim": "true", "id.token.claim": "false"},
        }],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--client-id", required=True)
    parser.add_argument("--redirect-uri", required=True)
    parser.add_argument("--logout-uri", required=True)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    try:
        document = representation(args.client_id, args.redirect_uri, args.logout_uri)
    except ValueError as error:
        parser.error(str(error))
    args.output.write_text(json.dumps(document, indent=2) + "\n")
    print(f"Rendered {args.output}")


if __name__ == "__main__":
    main()

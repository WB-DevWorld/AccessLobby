#!/usr/bin/env python3
"""Render a public interactive OIDC client for an existing realm.

The output is a client representation for Keycloak's admin import, not a secret.
It does not mutate a running realm. Use one unique ID per consumer/environment.
"""
import argparse
import json
import re
from pathlib import Path
from urllib.parse import urlparse


def exact_url(value: str, *, origin: bool = False, platform: str = 'web', purpose: str | None = None) -> str:
    parsed = urlparse(value)
    if parsed.scheme not in ("https", "http") or not parsed.hostname:
        raise ValueError("absolute HTTPS URL required")
    if parsed.scheme == "http" and parsed.hostname not in ("localhost", "127.0.0.1"):
        raise ValueError("HTTP is allowed only on localhost")
    if parsed.username or parsed.password or '#' in value or re.search(r'[\x00-\x20\x7f*\\]', value):
        raise ValueError("credentials, fragment, whitespace and wildcards are forbidden")
    if platform == 'wordpress' and not origin:
        if purpose in ('callback', 'logout'):
            action = 'al_callback' if purpose == 'callback' else 'al_signed_out'
            if (not parsed.path.endswith('/wp-login.php') or re.search('%2f|%5c', parsed.path, re.I)
                    or parsed.params or parsed.query != f'action={action}'):
                raise ValueError('invalid fixed WordPress login action')
        elif purpose != 'backchannel' or ('?' in value and not re.fullmatch(
                r'rest_route=(?:/accesslobby/v1/backchannel-logout|%2faccesslobby%2fv1%2fbackchannel-logout)', parsed.query, re.I)):
            raise ValueError('invalid fixed WordPress backchannel route')
    elif platform != 'web' or '?' in value:
        raise ValueError('queries are forbidden for web applications')
    if origin and (parsed.path not in ("", "/") or parsed.params):
        raise ValueError("web origin must not contain a path")
    return value.rstrip("/") if origin else value


def representation(client_id: str, redirect: str, logout: str, backchannel: str | None = None, platform: str = 'web') -> dict:
    if not client_id or any(c not in "abcdefghijklmnopqrstuvwxyz0123456789-_" for c in client_id):
        raise ValueError("client ID must use lowercase letters, digits, hyphen or underscore")
    if client_id in ("accesslobby-api", "accesslobby-web"):
        raise ValueError("reserved client ID")
    callback = exact_url(redirect, platform=platform, purpose='callback')
    post_logout = exact_url(logout, platform=platform, purpose='logout')
    callback_origin = urlparse(callback)
    logout_origin = urlparse(post_logout)
    if (callback_origin.scheme, callback_origin.netloc) != (logout_origin.scheme, logout_origin.netloc):
        raise ValueError("logout and callback must have the same origin")
    if platform == 'wordpress' and callback_origin.path != logout_origin.path:
        raise ValueError('WordPress callback and logout must share the wp-login.php path')
    if backchannel:
        exact_url(backchannel, platform=platform, purpose='backchannel')
        endpoint = urlparse(backchannel)
        if (endpoint.scheme, endpoint.netloc) != (callback_origin.scheme, callback_origin.netloc):
            raise ValueError("backchannel and callback must have the same origin")
    origin = f"{callback_origin.scheme}://{callback_origin.netloc}"
    client = {
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
    if backchannel:
        client["attributes"].update({
            "backchannel.logout.url": backchannel,
            "backchannel.logout.session.required": "true",
        })
    return client


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--client-id", required=True)
    parser.add_argument("--redirect-uri", required=True)
    parser.add_argument("--logout-uri", required=True)
    parser.add_argument("--backchannel-logout-uri", help="exact HTTPS endpoint implemented by the consumer")
    parser.add_argument('--platform', choices=('web', 'wordpress'), default='web')
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    try:
        document = representation(args.client_id, args.redirect_uri, args.logout_uri, args.backchannel_logout_uri, args.platform)
    except ValueError as error:
        parser.error(str(error))
    args.output.write_text(json.dumps(document, indent=2) + "\n")
    print(f"Rendered {args.output}")


if __name__ == "__main__":
    main()

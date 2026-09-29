#!/usr/bin/env python3
"""Plan an AccessLobby onboarding action without changing Keycloak or AccessLobby.

This is a boundary check for the current one-realm-per-environment pilot. It is
not an IAM provisioner or an application access grant. A separate approved
workflow must apply a client representation and update the API client registry.
"""
import argparse
import importlib.util
import json
from pathlib import Path
from urllib.parse import urlparse


def _client_renderer():
    path = Path(__file__).with_name('render-client.py')
    spec = importlib.util.spec_from_file_location('accesslobby_render_client', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def first_party_issuer(value: str) -> str:
    if not isinstance(value, str):
        raise ValueError('issuer must be a string')
    parsed = urlparse(value)
    if parsed.scheme not in ('https', 'http') or not parsed.hostname:
        raise ValueError('issuer must be an absolute URL')
    if parsed.scheme == 'http' and parsed.hostname not in ('localhost', '127.0.0.1'):
        raise ValueError('issuer must use HTTPS outside local development')
    if (parsed.path != '/realms/accesslobby-first-party' or parsed.params or
            parsed.query or parsed.fragment or parsed.username or parsed.password):
        raise ValueError('issuer must identify the configured first-party realm')
    return value


def plan(request: dict) -> dict:
    if not isinstance(request, dict):
        raise ValueError('request must be a JSON object')
    issuer = first_party_issuer(request.get('issuer', ''))
    action = request.get('action')
    base = {'issuer': issuer, 'realmAction': 'reuse-existing', 'realmCreation': False}
    if action == 'register-person':
        return {**base, 'action': action, 'iamAction': 'register-or-provision-user',
                'accesslobbyAction': 'resolve-durable-person-on-verified-sign-in',
                'applicationAdmission': 'not-implied'}
    if action == 'create-organization':
        return {**base, 'action': action, 'iamAction': 'none',
                'accesslobbyAction': 'create-organization-and-owner-membership',
                'applicationAdmission': 'not-implied'}
    if action == 'register-application':
        for field in ('clientId', 'redirectUri', 'logoutUri'):
            if not isinstance(request.get(field), str):
                raise ValueError(f'{field} must be a string')
        if request.get('backchannelLogoutUri') is not None and not isinstance(request['backchannelLogoutUri'], str):
            raise ValueError('backchannelLogoutUri must be a string')
        client = _client_renderer().representation(
            request.get('clientId'), request.get('redirectUri'),
            request.get('logoutUri'), request.get('backchannelLogoutUri'))
        return {**base, 'action': action, 'iamAction': 'register-oidc-client-in-existing-realm',
                'clientRepresentation': client,
                'apiAction': 'allow-client-after-controlled-registration',
                'applicationAdmission': 'separate-policy-required',
                'resourceAuthorization': 'owned-by-application'}
    if action == 'new-trust-domain':
        return {**base, 'action': action, 'realmAction': 'review-trust-domain',
                'iamAction': 'none-until-approved', 'decision': 'issuer-and-identity-linking-adr-required'}
    raise ValueError('action must be register-person, create-organization, register-application or new-trust-domain')


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--request', required=True, type=Path, help='JSON request; no credentials')
    parser.add_argument('--output', type=Path, help='optional JSON plan')
    args = parser.parse_args()
    try:
        result = plan(json.loads(args.request.read_text()))
    except (ValueError, OSError) as error:
        parser.error(str(error))
    output = json.dumps(result, indent=2) + '\n'
    if args.output:
        args.output.write_text(output)
        print(f'Plan written to {args.output}')
    else:
        print(output, end='')


if __name__ == '__main__':
    main()

#!/usr/bin/env python3
"""Render initial realm for a new environment. Import does not reconcile later changes."""
import json
import os
import pathlib
from urllib.parse import urlparse

origin = os.environ["WEB_BASE_URL"].rstrip("/")
api_origin = os.environ["API_PUBLIC_ORIGIN"].rstrip("/")
parsed = urlparse(origin)
if parsed.scheme != "https" and parsed.hostname not in ("localhost", "127.0.0.1"):
    raise SystemExit("WEB_BASE_URL requires HTTPS outside local development")
if parsed.path or parsed.query or parsed.fragment:
    raise SystemExit("WEB_BASE_URL must be an origin")
api_parsed = urlparse(api_origin)
if (api_parsed.scheme != "https" and api_parsed.hostname not in ("localhost", "127.0.0.1")) or api_parsed.path or api_parsed.query or api_parsed.fragment:
    raise SystemExit("API_PUBLIC_ORIGIN must be an HTTPS origin outside local development")
template = pathlib.Path(__file__).resolve().parents[1] / "keycloak" / "realm.template.json"
data = json.loads(template.read_text().replace("__WEB_ORIGIN__", origin).replace("__API_ORIGIN__", api_origin))
destination = pathlib.Path(__file__).resolve().parents[1] / "keycloak" / "generated" / "accesslobby-first-party-realm.json"
destination.parent.mkdir(parents=True, exist_ok=True)
destination.write_text(json.dumps(data, indent=2) + "\n")
print(f"Rendered {destination}")

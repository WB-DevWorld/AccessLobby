#!/usr/bin/env python3
"""Render initial realm for a new environment. Import does not reconcile later changes."""
import json
import os
import pathlib
from urllib.parse import urlparse

origin = os.environ["WEB_BASE_URL"].rstrip("/")
parsed = urlparse(origin)
if parsed.scheme != "https" and parsed.hostname not in ("localhost", "127.0.0.1"):
    raise SystemExit("WEB_BASE_URL requires HTTPS outside local development")
if parsed.path or parsed.query or parsed.fragment:
    raise SystemExit("WEB_BASE_URL must be an origin")
template = pathlib.Path(__file__).resolve().parents[1] / "keycloak" / "realm.template.json"
data = json.loads(template.read_text().replace("__WEB_ORIGIN__", origin))
destination = pathlib.Path(__file__).resolve().parents[1] / "keycloak" / "generated" / "accesslobby-first-party-realm.json"
destination.parent.mkdir(parents=True, exist_ok=True)
destination.write_text(json.dumps(data, indent=2) + "\n")
print(f"Rendered {destination}")

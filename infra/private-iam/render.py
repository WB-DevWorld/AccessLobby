#!/usr/bin/env python3
"""Render an optional, loopback-only TLS IAM console companion. Never deploys."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
from urllib.parse import urlsplit


class Refusal(ValueError):
    pass


def origin(value):
    if not isinstance(value, str) or len(value) > 253 or any(ord(c) < 33 for c in value):
        raise Refusal("unsafe_origin")
    try:
        u = urlsplit(value)
        port = u.port or 443
    except ValueError:
        raise Refusal("unsafe_origin") from None
    host = u.hostname or ""
    if (u.scheme != "https" or u.username or u.password or u.query or u.fragment
            or u.path not in ("", "/") or not re.fullmatch(r"[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?", host)
            or "." not in host or ".." in host or any(not label or len(label) > 63 or label.startswith("-") or label.endswith("-") for label in host.split("."))
            or host.endswith(".localhost") or host == "localhost" or re.fullmatch(r"[0-9.]+", host)
            or not 1024 <= port <= 65535 and port != 443):
        raise Refusal("unsafe_origin")
    authority = host if port == 443 else f"{host}:{port}"
    if value.rstrip("/") != f"https://{authority}":
        raise Refusal("noncanonical_origin")
    return host, port, authority


def image_ref(value):
    if not re.fullmatch(r"(?:[a-zA-Z0-9][a-zA-Z0-9._:/-]*@)?sha256:[0-9a-f]{64}", value):
        raise Refusal("image_digest_required")
    return value


def check_network(data, expected):
    if not re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9_.-]{1,119}", expected):
        raise Refusal("unsafe_network")
    if not isinstance(data, list) or len(data) != 1 or not isinstance(data[0], dict):
        raise Refusal("network_not_confirmed")
    n = data[0]
    labels = n.get("Labels") or {}
    if (n.get("Name") != expected or n.get("Driver") != "bridge" or n.get("Internal") is not True
            or n.get("Scope") != "local" or labels.get("com.docker.compose.network") != "iam-edge"
            or not labels.get("com.docker.compose.project")):
        raise Refusal("private_iam_edge_required")


def run_checked(args, timeout=10):
    try:
        p = subprocess.run(args, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                           stderr=subprocess.DEVNULL, timeout=timeout, check=False)
    except (OSError, subprocess.TimeoutExpired):
        raise Refusal("preflight_unavailable") from None
    if p.returncode:
        raise Refusal("preflight_failed")
    return p.stdout


def validate_tls(cert_path, key_path, ca_path, hostname):
    paths = []
    for value in [cert_path, key_path] + ([ca_path] if ca_path else []):
        p = Path(value)
        if not p.is_absolute() or not p.is_file() or p.is_symlink():
            raise Refusal("protected_regular_tls_file_required")
        paths.append(p.resolve(strict=True))
    cert, key = paths[:2]
    st = key.stat()
    if stat.S_IMODE(st.st_mode) & 0o077 or not stat.S_IMODE(st.st_mode) & 0o400:
        raise Refusal("private_key_permissions_required")
    # No key copying, permission change, password argument, output or prompt.
    cert_pub = run_checked(["openssl", "x509", "-in", str(cert), "-noout", "-pubkey"])
    key_pub = run_checked(["openssl", "pkey", "-in", str(key), "-pubout"])
    if cert_pub != key_pub:
        raise Refusal("certificate_key_mismatch")
    run_checked(["openssl", "x509", "-in", str(cert), "-noout", "-checkend", "86400"])
    command = ["openssl", "verify", "-purpose", "sslserver", "-verify_hostname", hostname,
               "-untrusted", str(cert)]
    if ca_path:
        command += ["-CAfile", str(paths[2])]
    run_checked(command + [str(cert)])
    return str(cert), str(key), st.st_uid, st.st_gid


def nginx_config(canonical_origin, root_key=False):
    host, port, authority = origin(canonical_origin)
    host_pattern = re.escape(host).replace("\\-", "-")
    authority_pattern = f"{host_pattern}(?::443)?" if port == 443 else re.escape(authority).replace("\\-", "-")
    forwards = f"""        proxy_set_header Host \"{authority}\";
        proxy_set_header X-Forwarded-Host \"{authority}\";
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-Port {port};
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header Forwarded \"\";
        proxy_set_header X-Forwarded-Prefix \"\";
"""
    locations = "\n".join(f"    location ^~ {path} {{\n        proxy_pass http://iam:8080{path};\n{forwards}    }}" for path in ["/admin/", "/realms/master/", "/resources/"])
    worker_mode = "user nginx nginx;\nmaster_process on;" if root_key else "master_process off;"
    return f"""# Generated private companion; no public-domain labels or IAM changes.
worker_processes 1;
{worker_mode}
pid /tmp/nginx.pid;
error_log /dev/stderr crit;
events {{ worker_connections 128; }}
http {{
    include /etc/nginx/mime.types;
    default_type application/octet-stream;
    access_log off;
    server_tokens off;
    client_body_temp_path /tmp/client_body;
    proxy_temp_path /tmp/proxy;
    fastcgi_temp_path /tmp/fastcgi;
    uwsgi_temp_path /tmp/uwsgi;
    scgi_temp_path /tmp/scgi;
    client_max_body_size 2m;
    server {{
    listen 8443 ssl default_server;
    server_name {host};
    ssl_certificate /run/private-iam/tls.crt;
    ssl_certificate_key /run/private-iam/tls.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_session_cache off;
    if ($ssl_server_name != \"{host}\") {{ return 421; }}
    if ($http_host !~ \"^{authority_pattern}$\") {{ return 421; }}
    location / {{ return 404; }}
{locations}
    }}
}}
"""


def compose_document(image, network, output, cert, key, uid, gid, listen_port):
    image_ref(image)
    if type(uid) is not int or uid < 0 or type(gid) is not int or gid < 0:
        raise Refusal("protected_key_owner_required")
    if type(listen_port) is not int or not 1024 <= listen_port <= 65535:
        raise Refusal("nonprivileged_loopback_port_required")
    # Root-only keys stay root-only: a standard root master reads TLS, then
    # workers drop to the image's nginx account. Only those two capabilities
    # are needed. Explicit worker-owned tmpfs paths avoid requiring CHOWN.
    worker_uid, worker_gid = (101, 101) if uid == 0 else (uid, gid)
    temp_mounts = [f"/tmp:rw,noexec,nosuid,size=2m,mode=1777,uid={uid},gid={gid}"]
    temp_mounts += [f"/tmp/{name}:rw,noexec,nosuid,size=4m,mode=0700,uid={worker_uid},gid={worker_gid}" for name in ["client_body", "proxy", "fastcgi", "uwsgi", "scgi"]]
    service = {
            "image": image,
            "entrypoint": ["nginx", "-c", "/etc/nginx/nginx.conf", "-g", "daemon off;"],
            "user": f"{uid}:{gid}", "read_only": True,
            "cap_drop": ["ALL"], "security_opt": ["no-new-privileges:true"],
            "restart": "unless-stopped", "pids_limit": 32,
            "ports": [{"target": 8443, "published": str(listen_port), "host_ip": "127.0.0.1", "protocol": "tcp"}],
            "tmpfs": temp_mounts,
            "volumes": [
                {"type": "bind", "source": str(output / "nginx.conf"), "target": "/etc/nginx/nginx.conf", "read_only": True},
                {"type": "bind", "source": cert, "target": "/run/private-iam/tls.crt", "read_only": True},
                {"type": "bind", "source": key, "target": "/run/private-iam/tls.key", "read_only": True},
            ],
            "networks": ["existing-iam-edge"],
            "logging": {"driver": "local", "options": {"max-size": "1m", "max-file": "1"}},
        }
    if uid == 0:
        service["cap_add"] = ["SETUID", "SETGID"]
    return {
        "services": {"iam-admin-private": service},
        "networks": {"existing-iam-edge": {"external": True, "name": network}},
    }


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--canonical-origin", required=True)
    p.add_argument("--network", required=True)
    p.add_argument("--proxy-image", required=True)
    p.add_argument("--certificate", required=True)
    p.add_argument("--private-key", required=True)
    p.add_argument("--ca-file")
    p.add_argument("--port", type=int, default=9443)
    p.add_argument("--output-directory", required=True)
    args = p.parse_args()
    try:
        host, _, _ = origin(args.canonical_origin)
        image_ref(args.proxy_image)
        output = Path(args.output_directory)
        repository = Path(__file__).resolve().parents[2]
        if not output.is_absolute() or output.exists() or repository == output or repository in output.parents:
            raise Refusal("new_protected_directory_outside_repository_required")
        # Validate the name before passing it to Docker; no option-like input.
        if not re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9_.-]{1,119}", args.network):
            raise Refusal("unsafe_network")
        # Exact selected network only. Never dumps inspected environment or credentials.
        network = json.loads(run_checked(["docker", "network", "inspect", args.network]))
        check_network(network, args.network)
        run_checked(["docker", "image", "inspect", args.proxy_image, "--format", "{{.Id}}"])
        cert, key, uid, gid = validate_tls(args.certificate, args.private_key, args.ca_file, host)
        if uid == 0:
            # The two-capability master mode depends on the pinned NGINX image's
            # unprivileged account. Refuse a different image/account mapping.
            isolated = ["docker", "run", "--rm", "--network", "none", "--read-only", "--cap-drop", "ALL",
                        "--security-opt", "no-new-privileges:true", "--pids-limit", "16", "--memory", "64m",
                        "--entrypoint", "id", args.proxy_image]
            if run_checked(isolated + ["-u", "nginx"]).strip() != b"101" or run_checked(isolated + ["-g", "nginx"]).strip() != b"101":
                raise Refusal("pinned_nginx_worker_account_required")
        config = nginx_config(args.canonical_origin, root_key=uid == 0)
        document = compose_document(args.proxy_image, args.network, output, cert, key, uid, gid, args.port)
        # Fail before creating output if any caller input is rejected.
        output.mkdir(mode=0o700)
        (output / "nginx.conf").write_text(config)
        os.chmod(output / "nginx.conf", 0o644)  # Non-secret; mapped key-owner UID can read it.
        (output / "compose.json").write_text(json.dumps(document, indent=2) + "\n")
        os.chmod(output / "compose.json", 0o600)
        (output / "preflight.json").write_text(json.dumps({"contract": "accesslobby.private-iam-package.v1", "rendered": True,
            "deployed": False, "loopbackOnly": True, "canonicalOriginPreserved": True,
            "networkInternal": True, "certificateValidated": True,
            "keyAccessMode": "root_master_unprivileged_workers" if uid == 0 else "nonroot_single_process",
            "configSha256": hashlib.sha256(config.encode()).hexdigest()}, indent=2) + "\n")
        os.chmod(output / "preflight.json", 0o600)
        print(json.dumps({"contract": "accesslobby.private-iam-package.v1", "rendered": True, "deployed": False}))
        return 0
    except (Refusal, OSError, ValueError) as error:
        code = str(error) if isinstance(error, Refusal) else "preflight_unavailable"
        print(json.dumps({"contract": "accesslobby.private-iam-package.v1", "rendered": False, "reason": code}))
        return 1


if __name__ == "__main__":
    sys.exit(main())

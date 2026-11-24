"""Isolate the locked maintained JWT library; deterministic, no runtime downloads."""
from pathlib import Path
import hashlib
import json

root = Path(__file__).resolve().parents[1]
source = root / "vendor/firebase/php-jwt"
target = root / "vendor-prefixed/jwt"
target.mkdir(parents=True, exist_ok=True)
lock = json.loads((root / "composer.lock").read_text())
package = next(p for p in lock["packages"] if p["name"] == "firebase/php-jwt")
for old in target.glob("*.php"):
    old.unlink()
hashes = {}
for file in sorted((source / "src").glob("*.php")):
    text = file.read_text().replace("Firebase\\JWT", "AccessLobby\\WordPress\\Vendor\\JWT")
    (target / file.name).write_text(text)
    hashes[file.name] = hashlib.sha256(text.encode()).hexdigest()
(target / "LICENSE").write_bytes((source / "LICENSE").read_bytes())
(target / "provenance.json").write_text(json.dumps({"package": package["name"], "version": package["version"],
    "source": package["source"], "transformation": "namespace-only", "sha256": hashes}, indent=2) + "\n")
print("Isolated", package["name"], package["version"], len(hashes), "files")

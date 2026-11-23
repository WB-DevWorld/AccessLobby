"""Build a deterministic installable ZIP from reviewed runtime files only."""
from pathlib import Path
import argparse
import hashlib
import zipfile

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument("--output", type=Path, required=True)
args = parser.parse_args()
allowed = ["accesslobby-sso.php", "autoload.php", "functions.php", "uninstall.php", "readme.txt", "LICENSE", "CHANGELOG.md"]
files = [root / name for name in allowed]
for name in ["src", "assets", "blocks", "vendor-prefixed", "docs"]:
    files.extend(p for p in (root / name).rglob("*") if p.is_file())
assert (root / "vendor-prefixed/jwt/JWT.php").is_file(), "Run locked dependency prefix step first"
args.output.parent.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(args.output, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for file in sorted(files):
        assert file.is_file(), file
        info = zipfile.ZipInfo("accesslobby-sso/" + str(file.relative_to(root)), date_time=(2026, 11, 23, 0, 0, 0))
        info.external_attr = 0o100644 << 16
        info.compress_type = zipfile.ZIP_DEFLATED
        archive.writestr(info, file.read_bytes())
with zipfile.ZipFile(args.output) as archive:
    assert archive.testzip() is None
    assert "accesslobby-sso/accesslobby-sso.php" in archive.namelist()
    assert not any("/tests/" in name or "/vendor/" in name or ".env" in name for name in archive.namelist())
digest = hashlib.sha256(args.output.read_bytes()).hexdigest()
args.output.with_suffix(".zip.sha256").write_text(digest + "  " + args.output.name + "\n")
print(args.output, digest)

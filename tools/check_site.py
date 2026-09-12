"""Read-only validation of this GitHub Pages distribution (Python standard library)."""

from __future__ import annotations

import hashlib
import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit


ROOT = Path(__file__).resolve().parents[1]
BASE = "/ZhichengFeng-Stealth-lab/"
HOST = "zhichengfeng.github.io"
ERRORS: list[str] = []
CHECKED: set[tuple[Path, str]] = set()


def label(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def error(source: Path, message: str) -> None:
    ERRORS.append(f"{label(source)}: {message}")


def local_path(source: Path, href: str, *, data_path: bool = False) -> Path | None:
    href = href.strip()
    if not href or href.startswith(("#", "data:", "blob:", "mailto:", "javascript:")):
        return None
    parsed = urlsplit(href)
    if parsed.netloc and (parsed.hostname != HOST or not parsed.path.startswith(BASE)):
        return None
    if parsed.scheme and parsed.scheme not in ("http", "https"):
        return None
    relative = unquote(parsed.path)
    if not relative:
        return None
    if relative.startswith(BASE):
        candidate = ROOT / relative[len(BASE):]
    elif data_path and relative.startswith("/data/"):
        candidate = ROOT / relative.lstrip("/")
    elif relative.startswith("/"):
        error(source, f"path lacks GitHub Pages project prefix: {href}")
        return None
    else:
        candidate = source.parent / relative
    candidate = candidate.resolve()
    if not candidate.is_relative_to(ROOT):
        error(source, f"reference escapes the published directory: {href}")
        return None
    return candidate


def check_reference(source: Path, href: str, *, data_path: bool = False) -> Path | None:
    target = local_path(source, href, data_path=data_path)
    if target is None:
        return None
    key = (source, href)
    if key not in CHECKED:
        CHECKED.add(key)
        if not target.exists():
            error(source, f"missing file: {href}")
        elif target.is_dir() and not any((target / name).is_file() for name in ("index.html", "README.md")):
            error(source, f"directory link has no index: {href}")
    return target if target.is_file() else None


class PageReferences(HTMLParser):
    def __init__(self, source: Path) -> None:
        super().__init__()
        self.source = source

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        for name, value in attrs:
            if name in ("src", "href", "poster") and value:
                check_reference(self.source, value)


def check_pages_and_assets() -> None:
    for route in ("index.html", "demo/index.html", "aerorepair-scan/index.html", "repair-workflow/index.html"):
        source = ROOT / route
        if not source.is_file():
            error(source, "required page is missing")
    for source in ROOT.rglob("*.html"):
        PageReferences(source).feed(source.read_text(encoding="utf-8"))
    for source in ROOT.rglob("*.css"):
        css = source.read_text(encoding="utf-8")
        for match in re.finditer(r"url\(\s*['\"]?([^)'\"]+)['\"]?\s*\)", css):
            check_reference(source, match.group(1))
    for source in ROOT.rglob("*.js"):
        js = source.read_text(encoding="utf-8")
        # Literal relative file references cover imports and simple fetch calls.
        # Template expressions and dynamically constructed URLs need browser QA.
        for match in re.finditer(r"['\"]((?:\./|\.\./)[^'\"\s`{}<>]+\.(?:js|json|css|webp|png|glb)(?:\?[^'\"\s]*)?)['\"]", js):
            check_reference(source, match.group(1))
    for source in ROOT.rglob("README.md"):
        for match in re.finditer(r"!?\[[^\]]*\]\(([^)\s]+)\)", source.read_text(encoding="utf-8")):
            check_reference(source, match.group(1))


def check_manifest() -> int:
    source = ROOT / "data/manifest.json"
    manifest = json.loads(source.read_text(encoding="utf-8"))
    count = 0
    for case in manifest["cases"]:
        for kind in manifest["requiredAssets"]:
            href = case.get("assets", {}).get(kind)
            if not href:
                error(source, f"{case['id']} lacks required asset {kind}")
                continue
            target = check_reference(source, href, data_path=True)
            meta = case.get("assetMeta", {}).get(kind, {})
            if not target:
                continue
            # Git stores these JSON assets with LF. core.autocrlf on Windows
            # expands line endings during checkout without changing the blob
            # published by GitHub Pages. Verify that canonical LF payload.
            payload = target.read_bytes().replace(b"\r\n", b"\n")
            if "bytes" in meta and len(payload) != meta["bytes"]:
                error(source, f"size mismatch: {href}")
            if "sha256" in meta and hashlib.sha256(payload).hexdigest() != meta["sha256"]:
                error(source, f"SHA-256 mismatch: {href}")
            json.loads(payload)
            count += 1
    for dataset in manifest.get("realDatasets", []):
        for field in ("path", "dataPath", "provenancePath"):
            if dataset.get(field):
                target = check_reference(source, dataset[field], data_path=True)
                if target and field == "dataPath":
                    payload = target.read_bytes().replace(b"\r\n", b"\n")
                    if "bytes" in dataset and len(payload) != dataset["bytes"]:
                        error(source, f"size mismatch: {dataset[field]}")
                    if "sha256" in dataset and hashlib.sha256(payload).hexdigest() != dataset["sha256"]:
                        error(source, f"SHA-256 mismatch: {dataset[field]}")
                    count += 1
    return count


def main() -> int:
    check_pages_and_assets()
    data_assets = check_manifest()
    if ERRORS:
        print("Static site validation failed:")
        for issue in ERRORS:
            print(f"  - {issue}")
        return 1
    print(f"PASS: {len(CHECKED)} local references and {data_assets} manifest data assets verified (LF normalized).")
    print("Browser checks are still required for rendering, interactions, and dynamic requests.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

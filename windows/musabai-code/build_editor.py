#!/usr/bin/env python3
"""Package a standalone Windows MusabAI Code editor from verified VSCodium and the local extension.

This uses the same verified product rebranding, builtin extension injection, and
integrity-checksum recalculation as the Linux builder. The result is a Windows
portable directory and ZIP; the GitHub workflow makes the installer with Inno Setup.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "linux" / "musabai-code"))
from build_editor import (  # noqa: E402
    APP_ID,
    APP_NAME,
    PRODUCT_FIELDS,
    inject_extensions,
    patch_inlined_product,
    patch_product_json,
    refresh_checksums,
)

EXE_NAME = "MusabAI Code.exe"
FOLDER_NAME = "MusabAI-Code-win32-x64"


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def package(vscodium: Path, extension: Path, out: Path) -> tuple[Path, Path]:
    if not (extension / "dist" / "extension.js").is_file():
        raise RuntimeError("Build the MusabAI extension first: cd musabai-code && npm ci && npm run package")
    manifest = json.loads((extension / "package.json").read_text(encoding="utf-8"))
    version = manifest["version"]
    out.mkdir(parents=True, exist_ok=True)
    scratch = out / ".windows-build"
    if scratch.exists():
        shutil.rmtree(scratch)
    scratch.mkdir()
    try:
        with zipfile.ZipFile(vscodium) as archive:
            archive.extractall(scratch)
        products = list(scratch.rglob("resources/app/product.json"))
        if len(products) != 1:
            raise RuntimeError(f"Expected exactly one VSCodium product.json, found {len(products)}")
        app_source = products[0].parents[2]
        app = out / FOLDER_NAME
        if app.exists():
            shutil.rmtree(app)
        shutil.move(str(app_source), str(app))

        resources = app / "resources" / "app"
        product_file = resources / "product.json"
        product = json.loads(product_file.read_text(encoding="utf-8"))
        product_file.write_text(
            json.dumps(patch_product_json(product), indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        package_file = resources / "package.json"
        package_json = json.loads(package_file.read_text(encoding="utf-8"))
        package_json["name"] = APP_ID
        package_file.write_text(json.dumps(package_json, indent=2) + "\n", encoding="utf-8")

        patched = []
        for bundle in sorted((resources / "out").rglob("*.js")):
            value = bundle.read_text(encoding="utf-8")
            if 'nameShort:"VSCodium"' in value:
                bundle.write_text(patch_inlined_product(value, str(bundle.relative_to(app))), encoding="utf-8")
                patched.append(bundle.relative_to(resources).as_posix())
        if not any(p in patched for p in ("out/main.js", "out/mainImpl.js")):
            raise RuntimeError("Did not patch the main Electron product configuration")

        inject_extensions(app, extension)
        changed = refresh_checksums(resources)
        print(f"Patched product in {len(patched)} JS files; refreshed {len(changed)} integrity checksums.")

        candidates = ["VSCodium.exe", "codium.exe", "Code - OSS.exe"]
        exe = next((app / x for x in candidates if (app / x).is_file()), None)
        if exe is None:
            found = [p.name for p in app.glob("*.exe")]
            raise RuntimeError(f"VSCodium Windows editor executable missing (root exe files: {found})")
        exe.rename(app / EXE_NAME)

        # Standalone editor and the terminal agent both use the bundled Electron runtime.
        (app / "musabai-code.cmd").write_text(
            '@echo off\r\nsetlocal\r\n"%~dp0MusabAI Code.exe" %*\r\n', encoding="utf-8"
        )
        (app / "musabai-agent.cmd").write_text(
            '@echo off\r\nsetlocal\r\nset "ELECTRON_RUN_AS_NODE=1"\r\n'
            '"%~dp0MusabAI Code.exe" "%~dp0resources\\app\\extensions\\musabai-code\\dist\\cli.js" %*\r\n',
            encoding="utf-8",
        )
        # Repair the upstream launcher too; it may otherwise reference the renamed executable.
        bin_dir = app / "bin"
        for candidate in ("codium.cmd", "codium"):
            entry = bin_dir / candidate
            if entry.exists() and entry.suffix.lower() == ".cmd":
                entry.write_text(
                    '@echo off\r\nsetlocal\r\n"%~dp0..\\MusabAI Code.exe" %*\r\n',
                    encoding="utf-8",
                )
        (app / "README-Windows.txt").write_text(
            f"{APP_NAME} v{version} for Windows x64\n"
            f"Run \"{EXE_NAME}\" to start the editor.\n"
            "Use musabai-agent.cmd for the terminal AI agent.\n"
            "This is an unsigned development build; Windows SmartScreen may warn.\n"
            "Source: https://github.com/Musabgpt/m88\n",
            encoding="utf-8",
        )
        portable = out / f"MusabAI-Code-{version}-windows-x64.zip"
        with zipfile.ZipFile(portable, "w", zipfile.ZIP_DEFLATED, compresslevel=6, allowZip64=True) as archive:
            for path in app.rglob("*"):
                if path.is_file():
                    archive.write(path, Path(FOLDER_NAME) / path.relative_to(app))
        print(f"Portable ZIP: {portable} ({portable.stat().st_size // (1024 * 1024)} MiB)")
        return app, portable
    finally:
        shutil.rmtree(scratch, ignore_errors=True)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--vscodium", type=Path, required=True)
    parser.add_argument("--extension", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--sha256", help="Expected SHA-256 for the VSCodium Windows ZIP")
    args = parser.parse_args()
    if args.sha256 and sha256(args.vscodium) != args.sha256.lower():
        raise RuntimeError("VSCodium SHA-256 mismatch")
    package(args.vscodium, args.extension, args.out)
    return 0


if __name__ == "__main__":
    sys.exit(main())

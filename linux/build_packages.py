#!/usr/bin/env python3
"""Build a Debian package and a host-runtime AppImage from a patched NewAl Code tree."""

from __future__ import annotations

import argparse
import os
from pathlib import Path
import re
import shutil
import stat
import struct
import subprocess
import sys


PACKAGE_DEPENDS = (
    "python3 (>= 3.12), python3-gi, python3-gi-cairo, gir1.2-gtk-3.0, "
    "gir1.2-webkit2-4.1, libwebkit2gtk-4.1-0, libstdc++6, libgomp1"
)
MAINTAINER = "Musabgpt <mgpt6zu@gmail.com>"
HOMEPAGE = "https://github.com/Musabgpt/M88"


def debian_control(version: str, architecture: str) -> str:
    if not re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+", version):
        raise ValueError("version must be a stable three-part numeric version")
    if architecture != "amd64":
        raise ValueError("the Linux packages currently target amd64 only")
    return (
        "Package: musabai\n"
        f"Version: {version}\n"
        "Section: devel\n"
        "Priority: optional\n"
        f"Architecture: {architecture}\n"
        f"Maintainer: {MAINTAINER}\n"
        f"Depends: {PACKAGE_DEPENDS}\n"
        f"Homepage: {HOMEPAGE}\n"
        "Description: MusabAI native Linux desktop coding assistant\n"
        " A native GTK/WebKit desktop interface for the MusabAI coding agent.\n"
        " It uses the system Python, GTK 3, and WebKitGTK 4.1 runtime.\n"
    )


def linux_launcher(prefix: str) -> str:
    return f'''#!/bin/sh
set -eu
APP_PREFIX={prefix!r}
export PYTHONPATH="$APP_PREFIX/vendor:$APP_PREFIX/desktop${{PYTHONPATH:+:$PYTHONPATH}}"
export LD_LIBRARY_PATH="$APP_PREFIX/bin${{LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}}"
export NEWAL_LLAMA_SERVER="$APP_PREFIX/bin/llama-server"
export MUSABAI_REQUIRE_NATIVE_GUI=1
exec /usr/bin/python3 "$APP_PREFIX/desktop/NewAlCode.py" "$@"
'''


def cli_launcher(prefix: str) -> str:
    return f'''#!/bin/sh
set -eu
APP_PREFIX={prefix!r}
export PYTHONPATH="$APP_PREFIX/vendor:$APP_PREFIX/desktop${{PYTHONPATH:+:$PYTHONPATH}}"
export LD_LIBRARY_PATH="$APP_PREFIX/bin${{LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}}"
export NEWAL_LLAMA_SERVER="$APP_PREFIX/bin/llama-server"
exec /usr/bin/python3 "$APP_PREFIX/desktop/newal-code.py" "$@"
'''


def desktop_entry(name: str, executable: str) -> str:
    if name != "musabai" or executable not in ("/usr/bin/musabai", "AppRun"):
        raise ValueError("the desktop entry must use a MusabAI package launcher")
    return (
        "[Desktop Entry]\n"
        "Type=Application\n"
        "Name=MusabAI\n"
        "Comment=AI coding assistant for Linux\n"
        f"Exec={executable} %F\n"
        "Icon=musabai\n"
        "Terminal=false\n"
        "Categories=Development;IDE;\n"
        "StartupNotify=true\n"
        "StartupWMClass=MusabAI\n"
    )


def app_run_script() -> str:
    return '''#!/bin/sh
set -eu
APPDIR="${APPDIR:-$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)}"
PREFIX="$APPDIR/usr/share/musabai"
if ! /usr/bin/python3 -c "import gi; gi.require_version('Gtk', '3.0'); gi.require_version('WebKit2', '4.1')" >/dev/null 2>&1; then
  cat >&2 <<'EOF'
MusabAI needs the host GTK 3 and WebKitGTK 4.1 desktop runtime.
On Ubuntu 24.04 or Linux Mint 22 install it with:
  sudo apt install python3 python3-gi python3-gi-cairo gir1.2-gtk-3.0 gir1.2-webkit2-4.1 libwebkit2gtk-4.1-0
Then run this AppImage again.
EOF
  exit 1
fi
export PYTHONPATH="$PREFIX/vendor:$PREFIX/desktop${PYTHONPATH:+:$PYTHONPATH}"
export LD_LIBRARY_PATH="$PREFIX/bin${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
export NEWAL_LLAMA_SERVER="$PREFIX/bin/llama-server"
export MUSABAI_REQUIRE_NATIVE_GUI=1
exec /usr/bin/python3 "$PREFIX/desktop/NewAlCode.py" "$@"
'''


def extract_icon(ico_path: Path, png_path: Path) -> None:
    data = ico_path.read_bytes()
    if len(data) < 6:
        raise ValueError(f"invalid icon file: {ico_path}")
    reserved, kind, count = struct.unpack_from("<HHH", data)
    if reserved != 0 or kind != 1 or count == 0 or len(data) < 6 + 16 * count:
        raise ValueError(f"invalid ICO directory: {ico_path}")
    candidates = []
    for index in range(count):
        width, height, _, _, _, bpp, size, offset = struct.unpack_from(
            "<BBBBHHII", data, 6 + index * 16
        )
        width, height = width or 256, height or 256
        if size and offset + size <= len(data):
            candidates.append((width * height, bpp, data[offset:offset + size]))
    if not candidates:
        raise ValueError(f"ICO has no usable images: {ico_path}")
    candidates.sort(key=lambda row: (row[0], row[1]), reverse=True)
    png = next((item for _, _, item in candidates if item.startswith(b"\x89PNG\r\n\x1a\n")), None)
    if png is None:
        raise ValueError(f"ICO contains no PNG image: {ico_path}")
    png_path.parent.mkdir(parents=True, exist_ok=True)
    png_path.write_bytes(png)


def write_text(path: Path, content: str, mode: int = 0o644) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    path.chmod(mode)


def copy_runtime(engine: Path, vendor: Path, llama_bin: Path, app_root: Path) -> None:
    app_root.mkdir(parents=True, exist_ok=True)
    prefix = app_root / "usr/share/musabai"
    shutil.copytree(engine, prefix / "desktop")
    shutil.copytree(vendor, prefix / "vendor")
    (prefix / "bin").mkdir(parents=True)
    for item in llama_bin.iterdir():
        if item.is_file() and (item.name == "llama-server" or re.search(r"\.so(?:\.\d+)*$", item.name)):
            destination = prefix / "bin" / item.name
            shutil.copy2(item, destination)
            if item.name == "llama-server":
                destination.chmod(destination.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
    if not (prefix / "bin/llama-server").is_file():
        raise FileNotFoundError(f"llama-server not found in {llama_bin}")
    icon = prefix / "desktop/assets/newal.ico"
    app_icon = prefix / "desktop/assets/musabai.png"
    extract_icon(icon, app_icon)
    system_icon = app_root / "usr/share/icons/hicolor/256x256/apps/musabai.png"
    system_icon.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(app_icon, system_icon)


def populate_package(root: Path, version: str, launcher_prefix: str, appimage: bool) -> None:
    control = root / "DEBIAN/control"
    write_text(control, debian_control(version, "amd64"))
    write_text(root / "usr/bin/musabai", linux_launcher(launcher_prefix), 0o755)
    write_text(root / "usr/bin/newal-code", cli_launcher(launcher_prefix), 0o755)
    desktop_exec = "AppRun" if appimage else "/usr/bin/musabai"
    write_text(root / "usr/share/applications/musabai.desktop", desktop_entry("musabai", desktop_exec))
    if appimage:
        app_run = root / "AppRun"
        write_text(app_run, app_run_script(), 0o755)
        (root / "musabai.desktop").symlink_to("usr/share/applications/musabai.desktop")
        (root / "musabai.png").symlink_to("usr/share/icons/hicolor/256x256/apps/musabai.png")


def version_from_engine(engine: Path) -> str:
    source = (engine / "newal_code/__init__.py").read_text(encoding="utf-8")
    match = re.search(r"^__version__\s*=\s*['\"]([^'\"]+)['\"]", source, re.M)
    if not match:
        raise ValueError("unable to find the engine's package version")
    return match.group(1)


def build(engine: Path, vendor: Path, llama_bin: Path, out: Path) -> tuple[Path, Path]:
    version = version_from_engine(engine)
    out.mkdir(parents=True, exist_ok=True)
    deb_root, appdir = out / "deb-root", out / "MusabAI.AppDir"
    shutil.rmtree(deb_root, ignore_errors=True)
    shutil.rmtree(appdir, ignore_errors=True)
    for root in (deb_root, appdir):
        copy_runtime(engine, vendor, llama_bin, root)
    populate_package(deb_root, version, "/usr/share/musabai", appimage=False)
    populate_package(appdir, version, "/usr/share/musabai", appimage=True)
    deb = out / f"MusabAI-{version}-linux-x86_64.deb"
    subprocess.run(["dpkg-deb", "--root-owner-group", "--build", str(deb_root), str(deb)], check=True)
    return deb, out / f"MusabAI-{version}-linux-x86_64.AppImage"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--engine", type=Path, required=True)
    parser.add_argument("--vendor", type=Path, required=True)
    parser.add_argument("--llama-bin", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    deb, appimage = build(args.engine.resolve(), args.vendor.resolve(), args.llama_bin.resolve(), args.out.resolve())
    print(f"Built Debian package: {deb}")
    print(f"AppDir ready for appimagetool: {args.out.resolve() / 'MusabAI.AppDir'}")
    print(f"Expected AppImage: {appimage}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

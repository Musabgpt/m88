#!/usr/bin/env python3
"""Build MusabAI Code for Linux: VSCodium rebranded as a standalone editor with MusabAI built in.

The pinned VSCodium release is used as is apart from its branding: product.json (which the editor reads at
startup), the copies of the product configuration inlined into its bundles, the icons and the launchers. As in
VS Code's own build, product.json's checksums are then recomputed for the patched files, so the integrity check
does not report a corrupt installation. Two built-in extensions are added (the MusabAI extension and the
Cursor-style defaults). The editor keeps Open VSX as its extension gallery, the same marketplace Cursor uses,
so "the same extensions" install as in Cursor.

Outputs: MusabAI-Code-<version>-linux-x64.tar.gz (portable, user install) and musabai-code_<version>_amd64.deb.
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tarfile
from pathlib import Path

APP_ID = "musabai-code"
APP_NAME = "MusabAI Code"
# The terminal agent, like Cursor's cursor-agent (/usr/bin/musabai already starts the MusabAI desktop app).
AGENT_COMMAND = "musabai-agent"
INSTALL_DIR = f"/usr/share/{APP_ID}"
HOMEPAGE = "https://github.com/Musabgpt/m88"
MAINTAINER = "Musabgpt <mgpt6zu@gmail.com>"
HERE = Path(__file__).resolve().parent

# Inlined product fields: key -> (VSCodium value, MusabAI Code value). Each must occur exactly once per bundle.
PRODUCT_FIELDS: dict[str, tuple[str, str]] = {
    "nameShort": ("VSCodium", APP_NAME),
    "nameLong": ("VSCodium", APP_NAME),
    "applicationName": ("codium", APP_ID),
    "dataFolderName": (".vscode-oss", f".{APP_ID}"),
    "sharedDataFolderName": (".vscode-oss-shared", f".{APP_ID}-shared"),
    "urlProtocol": ("vscodium", APP_ID),
    "linuxIconName": ("vscodium", APP_ID),
    "linuxDesktopName": ("com.visualstudio.CodeOSS", APP_ID),
    "serverApplicationName": ("codium-server", f"{APP_ID}-server"),
    "tunnelApplicationName": ("codium-tunnel", f"{APP_ID}-tunnel"),
    "reportIssueUrl": ("https://github.com/VSCodium/vscodium/issues/new", f"{HOMEPAGE}/issues/new"),
}

# Cursor-style layout and behaviour for the MusabAI Code product only (installing the extension into
# another editor does not change its layout).
EDITOR_DEFAULTS = {
    "workbench.colorTheme": "MusabAI Dark",
    "workbench.activityBar.location": "top",
    "workbench.secondarySideBar.defaultVisibility": "visibleInWorkspace",
    "workbench.layoutControl.enabled": True,
    "window.commandCenter": True,
    "chat.disableAIFeatures": True,
    "editor.inlineSuggest.enabled": True,
    "editor.minimap.enabled": False,
    "editor.fontLigatures": True,
    "editor.smoothScrolling": True,
    "editor.cursorSmoothCaretAnimation": "on",
    "workbench.list.smoothScrolling": True,
    "terminal.integrated.smoothScrolling": True,
    "terminal.integrated.commandsToSkipShell": ["musabai.terminal.generateCommand"],
    "git.autofetch": True,
    "git.confirmSync": False,
    "telemetry.telemetryLevel": "off",
    "update.mode": "none",
    "extensions.autoCheckUpdates": True,
    "workbench.welcomePage.walkthroughs.openOnInstall": True,
}

DEB_DEPENDS = (
    "ca-certificates, libasound2t64 (>= 1.2.12) | libasound2 (>= 1.0.17), libatk-bridge2.0-0t64 | libatk-bridge2.0-0 (>= 2.5.3), "
    "libatk1.0-0t64 | libatk1.0-0 (>= 2.11.90), libatspi2.0-0t64 | libatspi2.0-0 (>= 2.9.90), libc6 (>= 2.29), libcairo2 (>= 1.6.0), "
    "libcups2t64 | libcups2 (>= 1.6.0), libcurl3t64-gnutls | libcurl3-gnutls | libcurl4, libdbus-1-3 (>= 1.9.14), libexpat1 (>= 2.1~beta3), "
    "libgbm1 (>= 17.1.0~rc2), libglib2.0-0t64 | libglib2.0-0 (>= 2.39.4), libgtk-3-0t64 | libgtk-3-0 (>= 3.9.10), libnspr4 (>= 2:4.9-2~), "
    "libnss3 (>= 3.26), libpango-1.0-0 (>= 1.14.0), libstdc++6 (>= 5.2), libudev1 (>= 183), libx11-6 (>= 2:1.4.99.1), libxcb1 (>= 1.9.2), "
    "libxcomposite1 (>= 1:0.4.4-1), libxdamage1 (>= 1:1.1), libxext6, libxfixes3, libxkbcommon0 (>= 0.5.0), libxkbfile1 (>= 1:1.1.0), "
    "libxrandr2, xdg-utils (>= 1.0.2)"
)
DEB_RECOMMENDS = "git, ripgrep, python3, libnotify-bin, xclip, xdotool, wmctrl, libvulkan1"
DEB_SUGGESTS = "gh"

EDITOR_LAUNCHER = f"""#!/usr/bin/env sh
# {APP_NAME} launcher (VSCodium inside, MusabAI built in).
if [ -n "$VSCODE_IPC_HOOK_CLI" ]; then
	REMOTE_CLI="$(which -a '{APP_ID}' | grep /remote-cli/)"
	if [ -n "$REMOTE_CLI" ]; then
		"$REMOTE_CLI" "$@"
		exit $?
	fi
fi

if [ "$(id -u)" = "0" ]; then
	for i in "$@"; do
		case "$i" in
			--user-data-dir | --user-data-dir=* | --file-write | tunnel | serve-web ) CAN_LAUNCH_AS_ROOT=1 ;;
		esac
	done
	if [ -z "$CAN_LAUNCH_AS_ROOT" ]; then
		echo "You are trying to start {APP_NAME} as a super user which isn't recommended. If this was intended, add --no-sandbox and --user-data-dir." 1>&2
		exit 1
	fi
fi

APP_PATH="$(dirname "$(readlink -f "$0")")/.."
ELECTRON="$APP_PATH/{APP_ID}"
CLI="$APP_PATH/resources/app/out/cli.js"

# A user install (no set-uid chrome-sandbox) on systems that restrict unprivileged user namespaces
# (Ubuntu 24.04, Linux Mint 22) cannot use Chromium's sandbox.
SANDBOX_ARG=""
if [ ! -u "$APP_PATH/chrome-sandbox" ] || [ "$(stat -c %u "$APP_PATH/chrome-sandbox" 2>/dev/null)" != "0" ]; then
	if [ "$(cat /proc/sys/kernel/apparmor_restrict_unprivileged_userns 2>/dev/null)" = "1" ] || [ "$(cat /proc/sys/kernel/unprivileged_userns_clone 2>/dev/null)" = "0" ]; then
		SANDBOX_ARG="--no-sandbox"
	fi
fi

if [ -n "$SANDBOX_ARG" ]; then
	ELECTRON_RUN_AS_NODE=1 "$ELECTRON" "$CLI" "$SANDBOX_ARG" "$@"
else
	ELECTRON_RUN_AS_NODE=1 "$ELECTRON" "$CLI" "$@"
fi
exit $?
"""

AGENT_LAUNCHER = f"""#!/usr/bin/env sh
# musabai-agent: the MusabAI terminal agent, run by the editor's bundled runtime (no Node.js install needed).
APP_PATH="$(dirname "$(readlink -f "$0")")/.."
ELECTRON_RUN_AS_NODE=1 exec "$APP_PATH/{APP_ID}" "$APP_PATH/resources/app/extensions/{APP_ID}/dist/cli.js" "$@"
"""

APPARMOR_PROFILE = f"""# This profile allows everything and only exists to give {APP_NAME} a name and the user namespaces
# Chromium's sandbox needs on systems that restrict them (Ubuntu 24.04 and later, Linux Mint 22).
abi <abi/4.0>,
include <tunables/global>

profile {APP_ID} {INSTALL_DIR}/{APP_ID} flags=(unconfined) {{
  userns,

  # Site-specific additions and overrides. See local/README for details.
  include if exists <local/{APP_ID}>
}}
"""


def desktop_entry(exec_path: str, icon: str) -> str:
    return f"""[Desktop Entry]
Name={APP_NAME}
Comment=Free AI code editor: chat, agent, inline edits and Tab with free models
Comment[ar]=محرر أكواد بالذكاء الاصطناعي مجانًا: محادثة ووكيل وتعديل مباشر وإكمال تلقائي بنماذج مجانية
GenericName=Text Editor
GenericName[ar]=محرر نصوص
Exec={exec_path} %F
Icon={icon}
Type=Application
StartupNotify=false
StartupWMClass={APP_ID}
Categories=TextEditor;Development;IDE;
MimeType=text/plain;inode/directory;application/x-{APP_ID}-workspace;
Actions=new-empty-window;
Keywords=musabai;cursor;vscode;vscodium;ai;agent;editor;code;

[Desktop Action new-empty-window]
Name=New Empty Window
Name[ar]=نافذة فارغة جديدة
Exec={exec_path} --new-window %F
Icon={icon}
"""


def url_handler_entry(exec_path: str, icon: str) -> str:
    return f"""[Desktop Entry]
Name={APP_NAME} - URL Handler
Comment=Opens {APP_ID}:// links (GitHub sign-in)
GenericName=Text Editor
Exec={exec_path} --open-url %U
Icon={icon}
Type=Application
NoDisplay=true
StartupNotify=true
Categories=Utility;TextEditor;Development;IDE;
MimeType=x-scheme-handler/{APP_ID};
Keywords={APP_ID};
"""


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def object_bounds(text: str, inside: int) -> tuple[int, int]:
    """Start and end (exclusive) of the object literal whose first key starts at `inside`, skipping strings."""
    start = text.rfind("{", 0, inside)
    if start < 0 or text[start + 1:inside].strip():
        raise ValueError("the product object does not start with nameShort")
    depth = 0
    quote = ""
    i = start
    while i < len(text):
        ch = text[i]
        if quote:
            if ch == "\\":
                i += 1
            elif ch == quote:
                quote = ""
        elif ch in "\"'`":
            quote = ch
        elif ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return start, i + 1
        i += 1
    raise ValueError("unterminated product object")


def patch_inlined_product(text: str, where: str) -> str:
    """Rebrands the product object VS Code inlines into a bundle; every field must match exactly once in it.

    Bundles also carry an inert development fallback ({nameShort:"Code - OSS Dev", ...}); it is left alone.
    """
    anchor = 'nameShort:"VSCodium"'
    if text.count(anchor) != 1:
        raise ValueError(f"{where}: expected the product object ({anchor}) once, found {text.count(anchor)}")
    start, end = object_bounds(text, text.index(anchor))
    region = text[start:end]
    for key, (old, new) in PRODUCT_FIELDS.items():
        needle = f'{key}:"{old}"'
        count = len(re.findall(rf'(?<![A-Za-z0-9_$]){re.escape(needle)}', region))
        if count != 1:
            raise ValueError(f"{where}: expected {needle!r} once in the product object, found {count} (VSCodium layout changed?)")
        region = re.sub(rf'(?<![A-Za-z0-9_$]){re.escape(needle)}', f'{key}:{json.dumps(new)}', region)
    return text[:start] + region + text[end:]


def patch_product_json(data: dict) -> dict:
    out = dict(data)
    for key, (old, new) in PRODUCT_FIELDS.items():
        if out.get(key) != old:
            raise ValueError(f"product.json: expected {key}={old!r}, found {out.get(key)!r}")
        out[key] = new
    for key in ("updateUrl", "downloadUrl"):
        out.pop(key, None)
    return out


def rebrand(app: Path, icon_png: Path) -> list[str]:
    resources = app / "resources" / "app"
    patched: list[str] = []
    for bundle in sorted((resources / "out").rglob("*.js")):
        text = bundle.read_text(encoding="utf-8")
        if 'nameShort:"VSCodium"' not in text:
            continue
        bundle.write_text(patch_inlined_product(text, str(bundle.relative_to(app))), encoding="utf-8")
        patched.append(str(bundle.relative_to(resources)))
    if "out/main.js" not in patched and "out/mainImpl.js" not in patched:
        raise ValueError("the main-process bundle with the product configuration was not found")
    product_file = resources / "product.json"
    product_file.write_text(json.dumps(patch_product_json(json.loads(product_file.read_text())), indent="\t") + "\n")
    package_file = resources / "package.json"
    package = json.loads(package_file.read_text())
    package["name"] = APP_ID
    package["desktopName"] = f"{APP_ID}.desktop"
    package_file.write_text(json.dumps(package, indent="\t") + "\n")

    (app / "codium").rename(app / APP_ID)
    for old in ("codium", "codium-tunnel"):
        target = app / "bin" / old
        if target.exists():
            target.unlink()
    write_exec(app / "bin" / APP_ID, EDITOR_LAUNCHER)
    write_exec(app / "bin" / AGENT_COMMAND, AGENT_LAUNCHER)
    linux_icon = resources / "resources" / "linux" / "code.png"
    shutil.copyfile(icon_png, linux_icon)
    return patched


def refresh_checksums(resources: Path) -> list[str]:
    """Recomputes product.json's checksums (base64 SHA-256 without padding) and returns the files that changed.

    The workbench compares them with the files on disk and reports "Your installation appears to be corrupt" on a
    mismatch, so this runs after every change to resources/app/out.
    """
    product_file = resources / "product.json"
    product = json.loads(product_file.read_text())
    checksums = product.get("checksums") or {}
    changed: list[str] = []
    for rel, old in checksums.items():
        target = resources / "out" / rel
        if not target.is_file():
            raise ValueError(f"product.json has a checksum for {rel}, which does not exist (VSCodium layout changed?)")
        new = base64.b64encode(hashlib.sha256(target.read_bytes()).digest()).decode().rstrip("=")
        if new != old:
            checksums[rel] = new
            changed.append(rel)
    product_file.write_text(json.dumps(product, indent="\t") + "\n")
    return changed


def write_exec(path: Path, text: str) -> None:
    path.write_text(text)
    path.chmod(0o755)


def inject_extensions(app: Path, extension: Path) -> None:
    builtin = app / "resources" / "app" / "extensions"
    target = builtin / APP_ID
    if target.exists():
        shutil.rmtree(target)
    target.mkdir(parents=True)
    manifest = json.loads((extension / "package.json").read_text())
    for key in ("scripts", "devDependencies", "dependencies", "private"):
        manifest.pop(key, None)
    (target / "package.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
    shutil.copytree(extension / "dist", target / "dist", ignore=shutil.ignore_patterns("*.map", "*.vsix"))
    for folder in ("media", "themes"):
        shutil.copytree(extension / folder, target / folder)
    for name in ("README.md", "CHANGELOG.md"):
        if (extension / name).exists():
            shutil.copyfile(extension / name, target / name)
    (target / "dist" / "cli.js").chmod(0o755)

    defaults = builtin / "musabai-defaults"
    if defaults.exists():
        shutil.rmtree(defaults)
    defaults.mkdir()
    (defaults / "package.json").write_text(json.dumps({
        "name": "musabai-defaults",
        "displayName": f"{APP_NAME} defaults",
        "description": "Cursor-style layout and defaults of the MusabAI Code editor.",
        "version": manifest["version"],
        "publisher": "musabai",
        "engines": {"vscode": manifest["engines"]["vscode"]},
        "categories": ["Other"],
        "contributes": {"configurationDefaults": EDITOR_DEFAULTS},
    }, indent=2) + "\n")


def stage_app(vscodium: Path, workdir: Path) -> Path:
    """Unpacks (or copies) VSCodium into workdir/<APP_ID> and returns that folder."""
    app = workdir / APP_ID
    if app.exists():
        shutil.rmtree(app)
    if vscodium.is_dir():
        shutil.copytree(vscodium, app, symlinks=True)
    else:
        app.mkdir(parents=True)
        with tarfile.open(vscodium) as archive:
            archive.extractall(app, filter="tar")
    if not (app / "codium").exists():
        raise ValueError(f"{vscodium} does not look like a VSCodium Linux build (no codium binary)")
    return app


def icons(icon_svg: Path, workdir: Path) -> dict[int, Path]:
    out: dict[int, Path] = {}
    for size in (16, 24, 32, 48, 64, 128, 256, 512):
        png = workdir / f"icon-{size}.png"
        subprocess.run(["rsvg-convert", "-w", str(size), "-h", str(size), str(icon_svg), "-o", str(png)], check=True)
        out[size] = png
    return out


def build_tarball(app: Path, out: Path, version: str, icon_svg: Path, icon_png: Path) -> Path:
    folder = f"MusabAI-Code-linux-x64"
    path = out / f"MusabAI-Code-{version}-linux-x64.tar.gz"
    shutil.copyfile(icon_png, app / "musabai-code.png")
    shutil.copyfile(icon_svg, app / "musabai-code.svg")
    write_exec(app / "install-user.sh", (HERE / "install-user.sh").read_text())
    with tarfile.open(path, "w:gz", compresslevel=6) as archive:
        archive.add(app, arcname=folder)
    for name in ("musabai-code.png", "musabai-code.svg", "install-user.sh"):
        (app / name).unlink()
    return path


def build_deb(app: Path, out: Path, version: str, icon_svg: Path, sized: dict[int, Path], workdir: Path) -> Path:
    root = workdir / "deb"
    if root.exists():
        shutil.rmtree(root)
    install = root / INSTALL_DIR.lstrip("/")
    install.parent.mkdir(parents=True)
    shutil.copytree(app, install, symlinks=True)
    (install / "chrome-sandbox").chmod(0o4755)
    bin_dir = root / "usr" / "bin"
    bin_dir.mkdir(parents=True)
    os.symlink(f"{INSTALL_DIR}/bin/{APP_ID}", bin_dir / APP_ID)
    os.symlink(f"{INSTALL_DIR}/bin/{AGENT_COMMAND}", bin_dir / AGENT_COMMAND)
    apps = root / "usr" / "share" / "applications"
    apps.mkdir(parents=True)
    (apps / f"{APP_ID}.desktop").write_text(desktop_entry(f"{INSTALL_DIR}/{APP_ID}", APP_ID))
    (apps / f"{APP_ID}-url-handler.desktop").write_text(url_handler_entry(f"{INSTALL_DIR}/{APP_ID}", APP_ID))
    for size, png in sized.items():
        target = root / "usr" / "share" / "icons" / "hicolor" / f"{size}x{size}" / "apps" / f"{APP_ID}.png"
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(png, target)
    scalable = root / "usr" / "share" / "icons" / "hicolor" / "scalable" / "apps" / f"{APP_ID}.svg"
    scalable.parent.mkdir(parents=True)
    shutil.copyfile(icon_svg, scalable)
    pixmaps = root / "usr" / "share" / "pixmaps"
    pixmaps.mkdir(parents=True)
    shutil.copyfile(sized[512], pixmaps / f"{APP_ID}.png")
    apparmor = install / "resources" / "apparmor"
    apparmor.mkdir(parents=True, exist_ok=True)
    (apparmor / APP_ID).write_text(APPARMOR_PROFILE)

    debian = root / "DEBIAN"
    debian.mkdir()
    size_kb = sum(p.stat().st_size for p in root.rglob("*") if p.is_file() and not p.is_symlink()) // 1024
    (debian / "control").write_text(
        f"Package: {APP_ID}\n"
        f"Version: {version}\n"
        "Section: devel\n"
        "Priority: optional\n"
        "Architecture: amd64\n"
        f"Maintainer: {MAINTAINER}\n"
        f"Installed-Size: {size_kb}\n"
        f"Depends: {DEB_DEPENDS}\n"
        f"Recommends: {DEB_RECOMMENDS}\n"
        f"Suggests: {DEB_SUGGESTS}\n"
        f"Homepage: {HOMEPAGE}\n"
        f"Description: {APP_NAME} - free Cursor-style AI code editor\n"
        " A VS Code compatible editor (VSCodium inside) with MusabAI built in: an Agent,\n"
        " Plan and Ask chat that edits files and runs commands, Ctrl+K inline edits, Tab\n"
        " autocomplete, terminal, Git and GitHub tools (pull requests, Bugbot reviews,\n"
        " background agents), MCP and project rules - all with free models (no account\n"
        " needed) or local models. Extensions install from Open VSX. Includes the\n"
        f" {AGENT_COMMAND} terminal agent.\n"
    )
    (debian / "postinst").write_text(f"""#!/bin/sh
set -e
chmod 4755 {INSTALL_DIR}/chrome-sandbox 2>/dev/null || true
if [ -e /etc/apparmor.d/abi/4.0 ] && command -v apparmor_parser >/dev/null 2>&1; then
	cp {INSTALL_DIR}/resources/apparmor/{APP_ID} /etc/apparmor.d/{APP_ID}
	if command -v aa-enabled >/dev/null 2>&1 && aa-enabled --quiet 2>/dev/null; then
		apparmor_parser --replace --write-cache --skip-read-cache /etc/apparmor.d/{APP_ID} 2>/dev/null || true
	fi
fi
update-alternatives --install /usr/bin/editor editor /usr/bin/{APP_ID} 0 >/dev/null 2>&1 || true
command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database -q /usr/share/applications || true
command -v gtk-update-icon-cache >/dev/null 2>&1 && gtk-update-icon-cache -q -t -f /usr/share/icons/hicolor || true
exit 0
""")
    (debian / "prerm").write_text(f"""#!/bin/sh
set -e
if [ "$1" = remove ] || [ "$1" = deconfigure ]; then
	update-alternatives --remove editor /usr/bin/{APP_ID} >/dev/null 2>&1 || true
fi
exit 0
""")
    (debian / "postrm").write_text(f"""#!/bin/sh
set -e
if [ "$1" = remove ] || [ "$1" = purge ]; then
	if [ -e /etc/apparmor.d/{APP_ID} ]; then
		command -v apparmor_parser >/dev/null 2>&1 && apparmor_parser --remove /etc/apparmor.d/{APP_ID} 2>/dev/null || true
		rm -f /etc/apparmor.d/{APP_ID}
	fi
	command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database -q /usr/share/applications || true
fi
exit 0
""")
    for script in ("postinst", "prerm", "postrm"):
        (debian / script).chmod(0o755)
    path = out / f"{APP_ID}_{version}_amd64.deb"
    subprocess.run(["dpkg-deb", "--root-owner-group", "-Zxz", "--build", str(root), str(path)], check=True, stdout=subprocess.DEVNULL)
    return path


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--vscodium", required=True, type=Path, help="VSCodium-linux-x64-*.tar.gz or an unpacked VSCodium folder")
    parser.add_argument("--sha256", help="expected SHA-256 of the VSCodium tarball")
    parser.add_argument("--extension", required=True, type=Path, help="the built musabai-code folder (npm run build)")
    parser.add_argument("--out", required=True, type=Path)
    parser.add_argument("--version", help="package version (default: <extension version>+<VSCodium version>)")
    parser.add_argument("--skip-deb", action="store_true")
    args = parser.parse_args(argv)

    if args.vscodium.is_file():
        actual = sha256(args.vscodium)
        if args.sha256 and actual != args.sha256.lower():
            raise SystemExit(f"VSCodium checksum mismatch: {actual} != {args.sha256}")
        print(f"VSCodium {args.vscodium.name} sha256 {actual}")
    if not (args.extension / "dist" / "extension.js").exists():
        raise SystemExit(f"{args.extension} is not built: run npm ci && npm run build there first")
    args.out.mkdir(parents=True, exist_ok=True)
    work = args.out / ".work"
    work.mkdir(exist_ok=True)
    icon_svg = args.extension / "media" / "icon.svg"
    sized = icons(icon_svg, work)
    app = stage_app(args.vscodium, work)
    vscodium_version = json.loads((app / "resources" / "app" / "product.json").read_text())["version"]
    ext_version = json.loads((args.extension / "package.json").read_text())["version"]
    version = args.version or f"{ext_version}+vscodium{vscodium_version}"
    patched = rebrand(app, sized[512])
    inject_extensions(app, args.extension)
    print(f"Rebranded {len(patched)} bundles: {', '.join(patched)}")
    refreshed = refresh_checksums(app / "resources" / "app")
    print(f"Updated the integrity checksums of {', '.join(refreshed) or 'no files'}")
    tarball = build_tarball(app, args.out, version.split("+")[0], icon_svg, sized[512])
    print(f"Built {tarball} ({tarball.stat().st_size // (1024 * 1024)} MB)")
    if not args.skip_deb:
        deb = build_deb(app, args.out, version, icon_svg, sized, work)
        print(f"Built {deb} ({deb.stat().st_size // (1024 * 1024)} MB)")
    shutil.rmtree(work)
    return 0


if __name__ == "__main__":
    sys.exit(main())

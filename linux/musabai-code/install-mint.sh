#!/usr/bin/env bash
# MusabAI Code for Linux Mint 22 / Ubuntu 24.04 (x86_64).
#
#   ./linux/musabai-code/install-mint.sh             build from this repository and install the .deb (asks for sudo)
#   ./linux/musabai-code/install-mint.sh --user      build and install for this user only (no sudo for the editor)
#   ./linux/musabai-code/install-mint.sh --deb FILE  install a ready .deb (for example from the GitHub Actions artifact)
#
# Without a checkout it clones https://github.com/Musabgpt/m88 (branch $MUSABAI_BRANCH, default main).
set -euo pipefail

VSCODIUM_VERSION="1.140.06880"
VSCODIUM_SHA256="61223b74f9e40834117311ec4177cb386d09b84c1aae4f9e674c96580569cef3"
VSCODIUM_URL="https://github.com/VSCodium/vscodium/releases/download/${VSCODIUM_VERSION}/VSCodium-linux-x64-${VSCODIUM_VERSION}.tar.gz"
CACHE="${XDG_CACHE_HOME:-$HOME/.cache}/musabai"
MODE="system"
DEB=""

say() { printf '\033[1;35m◆\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m✗\033[0m %s\n' "$*" >&2; exit 1; }

while [ $# -gt 0 ]; do
	case "$1" in
		--user) MODE="user" ;;
		--deb) DEB="${2:-}"; shift ;;
		-h|--help) sed -n '2,10p' "$0"; exit 0 ;;
		*) die "unknown option $1" ;;
	esac
	shift
done

[ "$(uname -m)" = "x86_64" ] || die "MusabAI Code is built for x86_64 laptops (this one is $(uname -m))."
if [ -r /etc/os-release ]; then
	. /etc/os-release
	case "${ID:-} ${ID_LIKE:-}" in
		*ubuntu*|*debian*|*linuxmint*) ;;
		*) say "This installer targets Linux Mint / Ubuntu; continuing on ${PRETTY_NAME:-this system}." ;;
	esac
fi

SUDO="sudo"
[ "$(id -u)" = "0" ] && SUDO=""

if [ -n "$DEB" ]; then
	[ -f "$DEB" ] || die "no such file: $DEB"
	say "Installing $DEB"
	$SUDO apt-get install -y "$(readlink -f "$DEB")"
	say "Done. Open \"MusabAI Code\" from the menu or run: musabai-code ."
	exit 0
fi

say "Installing build tools and the tools MusabAI uses (git, ripgrep, xdotool, xclip…)"
$SUDO apt-get update -qq
$SUDO apt-get install -y --no-install-recommends ca-certificates curl git python3 librsvg2-bin dpkg-dev \
	ripgrep xdotool xclip wmctrl libnotify-bin

node_major() { node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0; }
if ! command -v npm >/dev/null 2>&1 || [ "$(node_major)" -lt 18 ]; then
	say "Installing Node.js and npm (needed only to build)"
	$SUDO apt-get install -y nodejs npm
fi
[ "$(node_major)" -ge 18 ] || die "Node.js 18 or newer is needed to build (found $(node -v 2>/dev/null || echo none))."

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." 2>/dev/null && pwd || true)"
if [ ! -f "$ROOT/musabai-code/package.json" ]; then
	ROOT="$CACHE/src"
	say "Getting the MusabAI source into $ROOT"
	if [ -d "$ROOT/.git" ]; then
		git -C "$ROOT" fetch --depth 1 origin "${MUSABAI_BRANCH:-main}" && git -C "$ROOT" checkout -q FETCH_HEAD
	else
		git clone --depth 1 --branch "${MUSABAI_BRANCH:-main}" https://github.com/Musabgpt/m88 "$ROOT"
	fi
fi

say "Building the MusabAI extension and terminal agent"
(cd "$ROOT/musabai-code" && npm ci --no-audit --no-fund && npm run build)

mkdir -p "$CACHE"
TARBALL="$CACHE/VSCodium-linux-x64-${VSCODIUM_VERSION}.tar.gz"
if [ ! -f "$TARBALL" ] || ! echo "${VSCODIUM_SHA256}  ${TARBALL}" | sha256sum --check --status; then
	say "Downloading VSCodium ${VSCODIUM_VERSION} (the open-source VS Code build MusabAI Code is based on)"
	curl -fL --retry 3 -o "$TARBALL.part" "$VSCODIUM_URL"
	mv "$TARBALL.part" "$TARBALL"
fi
echo "${VSCODIUM_SHA256}  ${TARBALL}" | sha256sum --check --status || die "VSCodium checksum mismatch"

OUT="$CACHE/dist"
rm -rf "$OUT"
say "Assembling MusabAI Code"
python3 "$ROOT/linux/musabai-code/build_editor.py" --vscodium "$TARBALL" --sha256 "$VSCODIUM_SHA256" --extension "$ROOT/musabai-code" --out "$OUT" $([ "$MODE" = user ] && echo --skip-deb)

if [ "$MODE" = "user" ]; then
	UNPACK="$CACHE/unpack"
	rm -rf "$UNPACK" && mkdir -p "$UNPACK"
	tar -xzf "$OUT"/MusabAI-Code-*-linux-x64.tar.gz -C "$UNPACK"
	"$UNPACK/MusabAI-Code-linux-x64/install-user.sh"
	rm -rf "$UNPACK"
else
	say "Installing the package (sudo)"
	$SUDO apt-get install -y "$OUT"/musabai-code_*_amd64.deb
fi

cat <<'EOF'

  MusabAI Code is installed.
    • Open "MusabAI Code" from the menu, or run:  musabai-code ~/your-project
    • Terminal agent:                             musabai
    • Free models work without any account. Optional: add free keys (Groq, Gemini, OpenRouter…)
      in MusabAI Settings (Ctrl+Shift+J), or run local models with Ollama: https://ollama.com
    • Bring your VS Code / Cursor setup: Ctrl+Shift+P → "MusabAI: Import Settings and Extensions"

EOF

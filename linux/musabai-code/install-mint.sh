#!/usr/bin/env bash
# MusabAI Code for Linux Mint 22 / Ubuntu 24.04 (x86_64).
#
#   ./linux/musabai-code/install-mint.sh             build from this repository and install the .deb (asks for sudo)
#   ./linux/musabai-code/install-mint.sh --user      build and install for this user only (no sudo for the editor)
#   ./linux/musabai-code/install-mint.sh --deb FILE  install a ready .deb (for example from the GitHub Actions artifact)
#
# Without a checkout it clones https://github.com/Musabgpt/m88 (branch $MUSABAI_BRANCH, default main), so one command
# installs everything:
#   curl -fsSL https://raw.githubusercontent.com/Musabgpt/m88/main/linux/musabai-code/install-mint.sh | bash
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
	$SUDO apt-get install -y --reinstall --allow-downgrades "$(readlink -f "$DEB")"
	say "Done. Open \"MusabAI Code\" from the menu or run: musabai-code ."
	exit 0
fi

say "Installing build tools and the tools MusabAI uses (git, ripgrep, xdotool, xclip…)"
# A broken third-party repository (a missing signing key, say) must not stop the install: warn and use what apt has.
$SUDO apt-get update -qq || say "apt-get update reported errors (often a third-party repository with a missing key); continuing with the package lists apt already has."
$SUDO apt-get install -y --no-install-recommends ca-certificates curl git python3 librsvg2-bin dpkg-dev \
	ripgrep xdotool xclip wmctrl libnotify-bin
# A browser for the agent to test web pages (best effort: native on Linux Mint; skip quietly if the name differs).
$SUDO apt-get install -y chromium 2>/dev/null || $SUDO apt-get install -y chromium-browser 2>/dev/null || say "No chromium package found — install a Chromium-family browser to use the agent's browser."

node_major() { node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0; }
# The editor build needs Node >= 18; the REA MCP tool (npx rea-agents) needs Node >= 22, so install a current Node
# from NodeSource when the system one is older or missing.
if ! command -v npm >/dev/null 2>&1 || [ "$(node_major)" -lt 22 ]; then
	say "Installing Node.js 24 (the editor needs Node to build; the REA tool needs Node 22+)"
	setup="$(mktemp)"
	if curl -fsSL https://deb.nodesource.com/setup_24.x -o "$setup" 2>/dev/null; then
		if [ -n "$SUDO" ]; then $SUDO -E bash "$setup" >/dev/null 2>&1 || true; else bash "$setup" >/dev/null 2>&1 || true; fi
		$SUDO apt-get install -y nodejs || true
	fi
	rm -f "$setup"
	# NodeSource unavailable: the distro Node still builds the editor (REA then needs Node 22+ added separately).
	[ "$(node_major)" -ge 18 ] || $SUDO apt-get install -y nodejs npm
fi
[ "$(node_major)" -ge 18 ] || die "Node.js 18 or newer is needed to build (found $(node -v 2>/dev/null || echo none))."
[ "$(node_major)" -ge 22 ] || say "Node.js is $(node -v): the editor works, but the REA tool needs Node 22+ to run."

# Piped into bash (curl … | bash) there is no script file, so the source is cloned below.
SELF="${BASH_SOURCE[0]:-}"
ROOT=""
[ -n "$SELF" ] && ROOT="$(cd "$(dirname "$SELF")/../.." 2>/dev/null && pwd || true)"
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
say "Assembling MusabAI Code (a few minutes on a slower laptop)"
python3 "$ROOT/linux/musabai-code/build_editor.py" --vscodium "$TARBALL" --sha256 "$VSCODIUM_SHA256" --extension "$ROOT/musabai-code" --out "$OUT" $([ "$MODE" = user ] && echo --skip-deb || echo --skip-tarball)

if [ "$MODE" = "user" ]; then
	UNPACK="$CACHE/unpack"
	rm -rf "$UNPACK" && mkdir -p "$UNPACK"
	tar -xzf "$OUT"/MusabAI-Code-*-linux-x64.tar.gz -C "$UNPACK"
	"$UNPACK/MusabAI-Code-linux-x64/install-user.sh"
	rm -rf "$UNPACK"
else
	say "Installing the package (sudo)"
	# --reinstall: a rebuild of the same version (after git pull) still replaces the installed editor.
	$SUDO apt-get install -y --reinstall --allow-downgrades "$OUT"/musabai-code_*_amd64.deb
fi

cat <<'EOF'

  MusabAI Code is installed.
    • Open "MusabAI Code" from the menu, or run:  musabai-code ~/your-project
    • Terminal agent:                             musabai-agent
    • Free models work without any account. Optional: add free keys (Groq, Gemini, OpenRouter…)
      in MusabAI Settings (Ctrl+Shift+J), or run local models with Ollama: https://ollama.com
    • Bring your VS Code / Cursor setup: Ctrl+Shift+P → "MusabAI: Import Settings and Extensions"

EOF

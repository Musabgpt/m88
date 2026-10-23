#!/usr/bin/env bash
# Downloads the latest MusabAI Code release from GitHub, checks it against the release's SHA256SUMS and installs it
# with the tools the agent uses. Linux Mint 22 / Ubuntu 24.04 (x86_64). No build, no Node.js. One command:
#   curl -fsSL https://raw.githubusercontent.com/Musabgpt/m88/main/linux/musabai-code/install-release.sh | bash
# A given version:   … | bash -s -- v0.2.1        (or MUSABAI_VERSION=v0.2.1)
set -euo pipefail

REPO="Musabgpt/m88"
TAG="${1:-${MUSABAI_VERSION:-latest}}"

say() { printf '\033[1;35m◆\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m✗\033[0m %s\n' "$*" >&2; exit 1; }

[ "$(uname -m)" = "x86_64" ] || die "MusabAI Code is built for x86_64 laptops (this one is $(uname -m))."
command -v apt-get >/dev/null 2>&1 || die "This installs a .deb package, so it needs Linux Mint, Ubuntu or Debian (apt)."

SUDO="sudo"
[ "$(id -u)" = "0" ] && SUDO=""

if ! command -v curl >/dev/null 2>&1; then
	say "Installing curl"
	$SUDO apt-get update -qq
	$SUDO apt-get install -y curl
fi
fetch() { curl -fL --retry 3 --connect-timeout 20 "$@"; }

if [ "$TAG" = "latest" ]; then
	BASE="https://github.com/$REPO/releases/latest/download"
else
	BASE="https://github.com/$REPO/releases/download/$TAG"
fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
# apt reads a local package as its own _apt user: let it into the folder.
chmod 755 "$WORK"
cd "$WORK"

say "Looking up the MusabAI Code release ($TAG)"
fetch -sS -o SHA256SUMS "$BASE/SHA256SUMS" || die "Could not reach the release at $BASE (no internet, or no such version)."
DEB="$(awk '$2 ~ /_amd64\.deb$/ { sub(/^\.\//, "", $2); print $2; exit }' SHA256SUMS)"
[ -n "$DEB" ] || die "That release has no .deb package."

say "Downloading $DEB"
fetch --progress-bar -o "$DEB" "$BASE/${DEB//+/%2B}"
chmod 644 "$DEB"

say "Checking the download against SHA256SUMS"
sha256sum --check --ignore-missing --quiet SHA256SUMS || die "The download is damaged (its SHA-256 does not match). Run the command again."

say "Installing MusabAI Code (sudo asks for your password)"
$SUDO apt-get update -qq || say "Could not refresh the package lists; installing with the ones there are."
# Its recommended tools come next, one by one, so a tool that cannot install never stops the editor from installing.
$SUDO apt-get install -y --no-install-recommends --reinstall --allow-downgrades "./$DEB"

say "Installing the tools the agent uses (git, ripgrep, xdotool, xclip…)"
$SUDO apt-get install -y --no-install-recommends git ripgrep python3 libnotify-bin xclip xdotool wmctrl \
	|| say "Some of the tools could not be installed; MusabAI Code works without them."
if ! command -v chromium >/dev/null 2>&1 && ! command -v chromium-browser >/dev/null 2>&1 \
	&& ! command -v google-chrome >/dev/null 2>&1 && ! command -v google-chrome-stable >/dev/null 2>&1; then
	# A browser for the agent to test web pages (native on Linux Mint, a snap on Ubuntu): best effort.
	$SUDO apt-get install -y chromium 2>/dev/null || $SUDO apt-get install -y chromium-browser 2>/dev/null \
		|| say "No Chromium package found — install a Chromium-family browser to let the agent test web pages."
fi

say "Done: $(musabai-agent --version 2>/dev/null || echo "MusabAI Code is installed")."
say "Open \"MusabAI Code\" from the menu, or run: musabai-code ~/your-project"

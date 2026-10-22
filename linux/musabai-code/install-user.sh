#!/usr/bin/env sh
# Installs MusabAI Code for the current user only (no sudo): ~/.local/share/musabai-code,
# the commands musabai-code and musabai-agent in ~/.local/bin, and a menu entry.
# Run it from the unpacked MusabAI-Code-linux-x64 folder:  ./install-user.sh   (./install-user.sh --uninstall to remove)
set -eu

SRC="$(cd "$(dirname "$0")" && pwd)"
DATA="${XDG_DATA_HOME:-$HOME/.local/share}"
DEST="$DATA/musabai-code"
BIN="$HOME/.local/bin"
APPS="$DATA/applications"
ICONS="$DATA/icons/hicolor"

if [ "${1:-}" = "--uninstall" ]; then
	rm -rf "$DEST" "$BIN/musabai-code" "$BIN/musabai-agent" "$APPS/musabai-code.desktop" "$APPS/musabai-code-url-handler.desktop" \
		"$ICONS/512x512/apps/musabai-code.png" "$ICONS/scalable/apps/musabai-code.svg"
	command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database -q "$APPS" || true
	echo "MusabAI Code was removed. Your settings stay in ~/.config/MusabAI Code and ~/.musabai-code."
	exit 0
fi

if [ ! -x "$SRC/musabai-code" ]; then
	echo "Run this script from the unpacked MusabAI-Code-linux-x64 folder." >&2
	exit 1
fi

echo "Installing MusabAI Code into $DEST ..."
rm -rf "$DEST.new"
mkdir -p "$DEST.new"
cp -a "$SRC/." "$DEST.new/"
rm -f "$DEST.new/install-user.sh"
rm -rf "$DEST"
mv "$DEST.new" "$DEST"

mkdir -p "$BIN" "$APPS" "$ICONS/512x512/apps" "$ICONS/scalable/apps"
ln -sf "$DEST/bin/musabai-code" "$BIN/musabai-code"
ln -sf "$DEST/bin/musabai-agent" "$BIN/musabai-agent"
cp "$DEST/musabai-code.png" "$ICONS/512x512/apps/musabai-code.png"
cp "$DEST/musabai-code.svg" "$ICONS/scalable/apps/musabai-code.svg"

cat > "$APPS/musabai-code.desktop" <<EOF
[Desktop Entry]
Name=MusabAI Code
Comment=Free AI code editor: chat, agent, inline edits and Tab with free models
Comment[ar]=محرر أكواد بالذكاء الاصطناعي مجانًا
GenericName=Text Editor
Exec="$DEST/bin/musabai-code" %F
Icon=musabai-code
Type=Application
StartupNotify=false
StartupWMClass=musabai-code
Categories=TextEditor;Development;IDE;
MimeType=text/plain;inode/directory;
Actions=new-empty-window;
Keywords=musabai;cursor;vscode;ai;agent;editor;

[Desktop Action new-empty-window]
Name=New Empty Window
Exec="$DEST/bin/musabai-code" --new-window %F
Icon=musabai-code
EOF
cat > "$APPS/musabai-code-url-handler.desktop" <<EOF
[Desktop Entry]
Name=MusabAI Code - URL Handler
Exec="$DEST/bin/musabai-code" --open-url %U
Icon=musabai-code
Type=Application
NoDisplay=true
MimeType=x-scheme-handler/musabai-code;
EOF
command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database -q "$APPS" || true
command -v gtk-update-icon-cache >/dev/null 2>&1 && gtk-update-icon-cache -q -t "$ICONS" 2>/dev/null || true

echo "Done. Open \"MusabAI Code\" from the menu, or run: musabai-code ."
echo "The terminal agent: musabai-agent"
case ":$PATH:" in
	*":$BIN:"*) ;;
	*) echo "Add ~/.local/bin to your PATH (log out and in again on Linux Mint) to use the commands." ;;
esac

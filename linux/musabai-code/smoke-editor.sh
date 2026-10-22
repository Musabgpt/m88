#!/usr/bin/env bash
# Opens an installed MusabAI Code on a virtual display the way its menu entry does, waits for the window and for
# the built-in MusabAI extension to activate, then quits with Ctrl+Q and checks that the editor exits.
#
#   smoke-editor.sh [/usr/share/musabai-code/musabai-code [extra editor arguments...]]
set -euo pipefail

exe="${1:-/usr/share/musabai-code/musabai-code}"
[ $# -gt 0 ] && shift
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/project" "$work/state"
printf 'print("hi")\n' >"$work/project/hello.py"

xvfb-run -a --server-args="-screen 0 1440x1000x24" bash -c '
  set -euo pipefail
  exe="$1" work="$2"
  shift 2
  openbox >"$work/openbox.log" 2>&1 &
  wm=$!
  XDG_STATE_HOME="$work/state" "$exe" "$@" --disable-workspace-trust --skip-release-notes \
    --user-data-dir "$work/user-data" --extensions-dir "$work/extensions" "$work/project" >"$work/editor.log" 2>&1 &
  app=$!
  fail() {
    echo "$1" >&2
    cat "$work/editor.log" >&2 || true
    find "$work/state" -name exthost.log -exec cat {} + >&2 2>/dev/null || true
    kill "$app" "$wm" 2>/dev/null || true
    exit 1
  }

  window=""
  for _ in $(seq 1 60); do
    kill -0 "$app" 2>/dev/null || fail "MusabAI Code exited before opening a window"
    window="$(xdotool search --onlyvisible --class musabai-code 2>/dev/null | head -n 1 || true)"
    [ -n "$window" ] && break
    sleep 1
  done
  [ -n "$window" ] || fail "no MusabAI Code window appeared"

  title=""
  for _ in $(seq 1 30); do
    title="$(xdotool getwindowname "$window" 2>/dev/null || true)"
    case "$title" in *"MusabAI Code"*) break ;; esac
    sleep 1
  done
  case "$title" in *"MusabAI Code"*) ;; *) fail "unexpected window title: $title" ;; esac

  activated=""
  for _ in $(seq 1 60); do
    if grep -rqs --include=exthost.log "_doActivateExtension musabai.musabai-code" "$work/state"; then activated=1; break; fi
    sleep 1
  done
  [ -n "$activated" ] || fail "the built-in MusabAI extension did not activate"
  sleep 3
  if grep -rqs --include=exthost.log "Activating extension .musabai.musabai-code. failed" "$work/state"; then
    fail "the built-in MusabAI extension failed to activate"
  fi

  xdotool windowactivate --sync "$window" key --clearmodifiers ctrl+q
  for _ in $(seq 1 30); do
    kill -0 "$app" 2>/dev/null || break
    sleep 1
  done
  kill -0 "$app" 2>/dev/null && fail "MusabAI Code did not exit after Ctrl+Q"
  kill "$wm" 2>/dev/null || true
  echo "MusabAI Code opened \"$title\", activated MusabAI and exited cleanly"
' smoke-editor "$exe" "$work" "$@"

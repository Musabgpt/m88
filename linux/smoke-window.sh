#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "usage: smoke-window.sh WINDOW_TITLE executable [arguments...]" >&2
  exit 2
fi

window_title="$1"
shift

xvfb-run -a --server-args="-screen 0 1440x1000x24" sh -c '
  set -eu
  title="$1"
  shift
  work="$(mktemp -d)"
  openbox >"$work/openbox.log" 2>&1 &
  wm_pid=$!
  "$@" >"$work/application.log" 2>&1 &
  app_pid=$!
  finish() {
    if kill -0 "$app_pid" 2>/dev/null; then kill -TERM "$app_pid" 2>/dev/null || true; fi
    if kill -0 "$wm_pid" 2>/dev/null; then kill "$wm_pid" 2>/dev/null || true; fi
    wait "$app_pid" 2>/dev/null || true
    wait "$wm_pid" 2>/dev/null || true
  }
  trap finish EXIT

  window=""
  for _ in $(seq 1 45); do
    if ! kill -0 "$app_pid" 2>/dev/null; then
      cat "$work/application.log" >&2
      echo "application exited before creating its native window" >&2
      exit 1
    fi
    window="$(xdotool search --onlyvisible --name "^${title}$" 2>/dev/null | head -n 1 || true)"
    if [ -n "$window" ]; then break; fi
    sleep 1
  done
  if [ -z "$window" ]; then
    cat "$work/application.log" >&2
    echo "no visible native window titled $title appeared" >&2
    exit 1
  fi
  actual="$(xdotool getwindowname "$window")"
  [ "$actual" = "$title" ] || { echo "unexpected window title: $actual" >&2; exit 1; }
  xdotool windowclose "$window"
  for _ in $(seq 1 20); do
    if ! kill -0 "$app_pid" 2>/dev/null; then break; fi
    sleep 1
  done
  if kill -0 "$app_pid" 2>/dev/null; then
    cat "$work/application.log" >&2
    echo "native window closed but the application did not exit" >&2
    exit 1
  fi
  wait "$app_pid"
  echo "native GTK/WebKit window opened and exited cleanly: $actual"
' smoke-window "$window_title" "$@"

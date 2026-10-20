#!/usr/bin/env python3
"""Apply the MusabAI Linux window brand and fail-closed native-window requirement to upstream."""

from pathlib import Path
import sys


WINDOW_TITLE_BEFORE = "webview.create_window(NAME,"
WINDOW_TITLE_AFTER = 'webview.create_window("MusabAI",'
APP_FALLBACK = (
    '            except Exception as e:  # noqa: BLE001 - no WebView: the browser does it\n'
    '                print("pywebview unavailable:", e)\n'
)
APP_PATCHED = (
    '            except Exception as e:  # noqa: BLE001 - no WebView: the browser does it\n'
    '                print("pywebview unavailable:", e)\n'
    '                if os.environ.get("MUSABAI_REQUIRE_NATIVE_GUI") == "1":\n'
    '                    raise SystemExit("Native GTK/WebKit window unavailable: %s" % e) from e\n'
)
APP_START = '                webview.start(private_mode=False)\n'
APP_START_ICON = (
    '                webview.start(\n'
    '                    private_mode=False,\n'
    '                    icon=os.path.join(os.path.dirname(os.path.dirname(__file__)), "assets", "musabai.png"),\n'
    '                )\n'
)


def patch_app(source: str) -> str:
    if WINDOW_TITLE_AFTER not in source:
        if source.count(WINDOW_TITLE_BEFORE) != 1:
            raise ValueError("expected upstream window title anchor")
        source = source.replace(WINDOW_TITLE_BEFORE, WINDOW_TITLE_AFTER, 1)
    if 'MUSABAI_REQUIRE_NATIVE_GUI' not in source:
        if source.count(APP_FALLBACK) != 1:
            raise ValueError("expected upstream fallback anchor")
        source = source.replace(APP_FALLBACK, APP_PATCHED, 1)
    if 'icon=os.path.join' not in source:
        if source.count(APP_START) != 1:
            raise ValueError("expected upstream pywebview start anchor")
        source = source.replace(APP_START, APP_START_ICON, 1)
    return source


SETTINGS_MODEL_BEFORE = '    "model": "auto",              # a model id, or "auto": the best local model that fits this computer\'s RAM'
SETTINGS_MODEL_AFTER = '    "model": "kilo-auto/free",     # MusabAI default: keyless Kilo free gateway, like Android'
SETTINGS_MODELS_BEFORE = '    "models": {},                 # models the user added: id -> spec (see models.py)'
SETTINGS_MODELS_AFTER = '''    "models": {
        "kilo-auto/free": {
            "id": "kilo-auto/free",
            "name": "Kilo Auto Free",
            "provider": "openai",
            "base_url": "https://api.kilo.ai/api/gateway",
            "model": "kilo-auto/free",
            "api_key": "",
            "free": True,
            "capabilities": ["text", "tools", "streaming"],
        },
    },'''


TERMUX_MODEL_BEFORE = 'if not cfg.get("model") or cfg.get("model") == "auto":'
TERMUX_MODEL_AFTER = 'if not cfg.get("model") or cfg.get("model") in ("auto", "kilo-auto/free"):'


def patch_termux(source: str) -> str:
    """Keep the linked Android-phone model as Termux's model after changing Linux defaults."""
    if TERMUX_MODEL_AFTER not in source:
        if source.count(TERMUX_MODEL_BEFORE) != 1:
            raise ValueError("expected upstream Termux model selection anchor")
        source = source.replace(TERMUX_MODEL_BEFORE, TERMUX_MODEL_AFTER, 1)
    return source



def patch_settings(source: str) -> str:
    """Make a fresh Linux install start with the same keyless free model as Android."""
    if SETTINGS_MODEL_AFTER not in source:
        if source.count(SETTINGS_MODEL_BEFORE) != 1:
            raise ValueError("expected upstream default model setting anchor")
        source = source.replace(SETTINGS_MODEL_BEFORE, SETTINGS_MODEL_AFTER, 1)
    if '        "kilo-auto/free": {' not in source:
        if source.count(SETTINGS_MODELS_BEFORE) != 1:
            raise ValueError("expected upstream models setting anchor")
        source = source.replace(SETTINGS_MODELS_BEFORE, SETTINGS_MODELS_AFTER, 1)
    return source


def patch_engine(engine: Path) -> None:
    package = engine / "newal_code"
    app = package / "app.py"
    settings = package / "settings.py"
    termux = package / "termux.py"
    app.write_text(patch_app(app.read_text(encoding="utf-8")), encoding="utf-8")
    settings.write_text(patch_settings(settings.read_text(encoding="utf-8")), encoding="utf-8")
    termux.write_text(patch_termux(termux.read_text(encoding="utf-8")), encoding="utf-8")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("usage: patch_engine.py path/to/desktop/newal_code")
    patch_engine(Path(sys.argv[1]).resolve().parent)

#!/usr/bin/env python3
"""Apply the MusabAI Linux brand and fail-closed native-window requirement to upstream."""

from pathlib import Path
import sys


NAME_BEFORE = 'NAME = "NewAl Code"'
NAME_AFTER = 'NAME = "MusabAI"'
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


def patch_name(source: str) -> str:
    if NAME_AFTER in source:
        return source
    if source.count(NAME_BEFORE) != 1:
        raise ValueError("expected upstream application-name anchor")
    return source.replace(NAME_BEFORE, NAME_AFTER, 1)


def patch_app(source: str) -> str:
    if 'MUSABAI_REQUIRE_NATIVE_GUI' not in source:
        if source.count(APP_FALLBACK) != 1:
            raise ValueError("expected upstream fallback anchor")
        source = source.replace(APP_FALLBACK, APP_PATCHED, 1)
    if 'icon=os.path.join' not in source:
        if source.count(APP_START) != 1:
            raise ValueError("expected upstream pywebview start anchor")
        source = source.replace(APP_START, APP_START_ICON, 1)
    return source


def patch_engine(engine: Path) -> None:
    package = engine / "newal_code"
    init = package / "__init__.py"
    app = package / "app.py"
    init.write_text(patch_name(init.read_text(encoding="utf-8")), encoding="utf-8")
    app.write_text(patch_app(app.read_text(encoding="utf-8")), encoding="utf-8")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("usage: patch_engine.py path/to/desktop/newal_code")
    patch_engine(Path(sys.argv[1]).resolve().parent)

import tempfile
import unittest
from pathlib import Path

from patch_engine import patch_app, patch_engine, patch_settings, patch_termux


class DesktopBrandPatchTest(unittest.TestCase):
    def test_app_requires_native_gui_when_packaged(self):
        source = (
            '                webview.create_window(NAME, url, width=1360)\n'
            "            except Exception as e:  # noqa: BLE001 - no WebView: the browser does it\n"
            "                print(\"pywebview unavailable:\", e)\n"
            "                webview.start(private_mode=False)\n"
        )
        result = patch_app(source)
        self.assertIn('if os.environ.get("MUSABAI_REQUIRE_NATIVE_GUI") == "1":', result)
        self.assertIn("Native GTK/WebKit window unavailable", result)
        self.assertIn("icon=os.path.join", result)


    def test_linux_defaults_to_keyless_kilo_free_model(self):
        source = '''DEFAULTS = {
    "model": "auto",              # a model id, or "auto": the best local model that fits this computer's RAM
    "models": {},                 # models the user added: id -> spec (see models.py)
}
'''
        result = patch_settings(source)
        self.assertIn('"model": "kilo-auto/free"', result)
        self.assertIn('"id": "kilo-auto/free"', result)
        self.assertIn('"base_url": "https://api.kilo.ai/api/gateway"', result)
        self.assertIn('"api_key": ""', result)
        self.assertIn('"free": True', result)

    def test_termux_switches_to_phone_model_after_linux_default_changes(self):
        source = 'if not cfg.get("model") or cfg.get("model") == "auto":\n    values["model"] = "phone"\n'
        result = patch_termux(source)
        self.assertIn('in ("auto", "kilo-auto/free")', result)

    def test_patch_refuses_unrecognized_upstream_source(self):
        with self.assertRaisesRegex(ValueError, "expected upstream window title anchor"):
            patch_app("except Exception:\n    pass\n")

    def test_window_title_is_branded_without_changing_engine_identity(self):
        with tempfile.TemporaryDirectory() as tmp:
            engine = Path(tmp)
            package = engine / "newal_code"
            package.mkdir()
            init = package / "__init__.py"
            init.write_text('__version__ = "0.1.0"\nNAME = "NewAl Code"\n', encoding="utf-8")
            settings = package / "settings.py"
            settings.write_text(
                '''DEFAULTS = {
    "model": "auto",              # a model id, or "auto": the best local model that fits this computer's RAM
    "models": {},                 # models the user added: id -> spec (see models.py)
}
''',
                encoding="utf-8",
            )
            termux = package / "termux.py"
            termux.write_text(
                'if not cfg.get("model") or cfg.get("model") == "auto":\n'
                '    values["model"] = "phone"\n',
                encoding="utf-8",
            )
            app = package / "app.py"
            app.write_text(
                'webview.create_window(NAME, url, width=1360)\n'
                '            except Exception as e:  # noqa: BLE001 - no WebView: the browser does it\n'
                '                print("pywebview unavailable:", e)\n'
                '                webview.start(private_mode=False)\n',
                encoding="utf-8",
            )

            patch_engine(engine)

            self.assertEqual(init.read_text(encoding="utf-8"), '__version__ = "0.1.0"\nNAME = "NewAl Code"\n')
            patched_app = app.read_text(encoding="utf-8")
            self.assertIn('webview.create_window("MusabAI", url,', patched_app)
            self.assertIn("webview.start(", patched_app)
            patched_settings = settings.read_text(encoding="utf-8")
            self.assertIn('"model": "kilo-auto/free"', patched_settings)
            self.assertIn('"id": "kilo-auto/free"', patched_settings)
            self.assertIn('in ("auto", "kilo-auto/free")', termux.read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()

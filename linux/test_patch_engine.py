import unittest

from patch_engine import patch_app, patch_name


class DesktopBrandPatchTest(unittest.TestCase):
    def test_app_requires_native_gui_when_packaged(self):
        source = (
            "            except Exception as e:  # noqa: BLE001 - no WebView: the browser does it\n"
            "                print(\"pywebview unavailable:\", e)\n"
            "                webview.start(private_mode=False)\n"
        )
        result = patch_app(source)
        self.assertIn('if os.environ.get("MUSABAI_REQUIRE_NATIVE_GUI") == "1":', result)
        self.assertIn("Native GTK/WebKit window unavailable", result)
        self.assertIn("icon=os.path.join", result)

    def test_patch_refuses_unrecognized_upstream_source(self):
        with self.assertRaisesRegex(ValueError, "expected upstream fallback anchor"):
            patch_app("except Exception:\n    pass\n")

    def test_package_window_title_uses_musabai_brand(self):
        self.assertEqual(patch_name('__version__ = "0.1.0"\nNAME = "NewAl Code"\n'),
                         '__version__ = "0.1.0"\nNAME = "MusabAI"\n')


if __name__ == "__main__":
    unittest.main()

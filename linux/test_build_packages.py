import unittest

from build_packages import app_run_script, debian_control, linux_launcher, desktop_entry


class DebianPackageMetadataTest(unittest.TestCase):
    def test_control_declares_native_webkit_runtime_and_supported_architecture(self):
        control = debian_control("0.1.0", "amd64")
        self.assertIn("Package: musabai\n", control)
        self.assertIn("Architecture: amd64\n", control)
        self.assertIn("gir1.2-webkit2-4.1", control)
        self.assertIn("python3-gi", control)
        self.assertIn("libwebkit2gtk-4.1-0", control)

    def test_launcher_requires_native_gui_and_uses_packaged_engine(self):
        launcher = linux_launcher("/usr/share/musabai")
        self.assertIn("MUSABAI_REQUIRE_NATIVE_GUI=1", launcher)
        self.assertIn("desktop/NewAlCode.py", launcher)
        self.assertIn("$APP_PREFIX/vendor", launcher)

    def test_desktop_entry_registers_application_icon_and_file_open(self):
        entry = desktop_entry("musabai", "/usr/bin/musabai")
        self.assertIn("Name=MusabAI", entry)
        self.assertIn("Icon=musabai", entry)
        self.assertIn("Exec=/usr/bin/musabai %F", entry)
        self.assertIn("StartupWMClass=MusabAI", entry)

    def test_appimage_desktop_entry_launches_its_own_runtime(self):
        entry = desktop_entry("musabai", "AppRun")
        self.assertIn("Exec=AppRun %F", entry)

    def test_appimage_app_run_checks_host_gtk_webkit_before_launch(self):
        script = app_run_script()
        self.assertIn("gi.require_version('Gtk', '3.0')", script)
        self.assertIn("gi.require_version('WebKit2', '4.1')", script)
        self.assertIn("MUSABAI_REQUIRE_NATIVE_GUI=1", script)
        self.assertIn("NewAlCode.py", script)


if __name__ == "__main__":
    unittest.main()

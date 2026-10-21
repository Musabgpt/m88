import base64
import hashlib
import importlib.util
import json
import shutil
import subprocess
import sys
import tarfile
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("build_editor", HERE / "build_editor.py")
build_editor = importlib.util.module_from_spec(spec)
sys.modules["build_editor"] = build_editor
spec.loader.exec_module(build_editor)

INLINED = (
    'var p={nameShort:"VSCodium",nameLong:"VSCodium",applicationName:"codium",dataFolderName:".vscode-oss",'
    'sharedDataFolderName:".vscode-oss-shared",urlProtocol:"vscodium",linuxIconName:"vscodium",'
    'linuxDesktopName:"com.visualstudio.CodeOSS",serverApplicationName:"codium-server",tunnelApplicationName:"codium-tunnel",'
    'reportIssueUrl:"https://github.com/VSCodium/vscodium/issues/new",version:"1.140.06880"};'
)
SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="#4f8cff"/></svg>'


def checksum(path: Path) -> str:
    return base64.b64encode(hashlib.sha256(path.read_bytes()).digest()).decode().rstrip("=")


def fake_vscodium(root: Path) -> Path:
    app = root / "VSCodium"
    out = app / "resources" / "app" / "out"
    (out / "vs" / "workbench").mkdir(parents=True)
    (app / "bin").mkdir()
    (app / "resources" / "app" / "resources" / "linux").mkdir(parents=True)
    (app / "resources" / "app" / "extensions" / "git").mkdir(parents=True)
    (app / "codium").write_text("#!/bin/sh\necho electron\n")
    (app / "codium").chmod(0o755)
    (app / "chrome-sandbox").write_text("sandbox")
    (app / "bin" / "codium").write_text("#!/bin/sh\n")
    (out / "mainImpl.js").write_text(f"{INLINED}console.log(p);")
    (out / "cli.js").write_text(INLINED)
    (out / "vs" / "workbench" / "workbench.desktop.main.js").write_text(f"x;{INLINED}y;")
    (out / "other.js").write_text("no product here")
    product = {k: v[0] for k, v in build_editor.PRODUCT_FIELDS.items()}
    checksums = {rel: checksum(out / rel) for rel in ("vs/workbench/workbench.desktop.main.js", "other.js")}
    product.update(version="1.140.06880", extensionsGallery={"serviceUrl": "https://open-vsx.org/vscode/gallery"}, checksums=checksums)
    (app / "resources" / "app" / "product.json").write_text(json.dumps(product))
    (app / "resources" / "app" / "package.json").write_text(json.dumps({"name": "VSCodium", "version": "1.140.06880", "desktopName": "codium.desktop"}))
    (app / "resources" / "app" / "resources" / "linux" / "code.png").write_bytes(b"old")
    return app


def fake_extension(root: Path) -> Path:
    ext = root / "musabai-code"
    (ext / "dist" / "webview").mkdir(parents=True)
    (ext / "media").mkdir()
    (ext / "themes").mkdir()
    manifest = {
        "name": "musabai-code", "publisher": "musabai", "version": "0.1.0", "engines": {"vscode": "^1.105.0"}, "main": "./dist/extension.js",
        "scripts": {"build": "x"}, "devDependencies": {"typescript": "7"}, "dependencies": {"marked": "18"}, "private": True,
    }
    (ext / "package.json").write_text(json.dumps(manifest))
    (ext / "dist" / "extension.js").write_text("exports.activate=()=>{}")
    (ext / "dist" / "extension.js.map").write_text("{}")
    (ext / "dist" / "musabai-code.vsix").write_bytes(b"PK")
    (ext / "dist" / "cli.js").write_text("#!/usr/bin/env node\n")
    (ext / "dist" / "webview" / "chat.js").write_text("")
    (ext / "media" / "icon.svg").write_text(SVG)
    (ext / "themes" / "musabai-dark-color-theme.json").write_text("{}")
    return ext


@unittest.skipUnless(shutil.which("rsvg-convert") and shutil.which("dpkg-deb"), "needs rsvg-convert and dpkg-deb")
class BuildEditorTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = Path(tempfile.mkdtemp(prefix="musabai-build-"))
        vscodium = fake_vscodium(cls.tmp)
        cls.original_checksums = json.loads((vscodium / "resources" / "app" / "product.json").read_text())["checksums"]
        tar = cls.tmp / "VSCodium-linux-x64-1.140.06880.tar.gz"
        with tarfile.open(tar, "w:gz") as archive:
            for item in vscodium.iterdir():
                archive.add(item, arcname=item.name)
        cls.sha = build_editor.sha256(tar)
        cls.out = cls.tmp / "out"
        build_editor.main(["--vscodium", str(tar), "--sha256", cls.sha, "--extension", str(fake_extension(cls.tmp)), "--out", str(cls.out)])
        cls.unpacked = cls.tmp / "unpacked"
        with tarfile.open(cls.out / "MusabAI-Code-0.1.0-linux-x64.tar.gz") as archive:
            archive.extractall(cls.unpacked, filter="tar")
        cls.app = cls.unpacked / "MusabAI-Code-linux-x64"
        cls.deb = cls.out / "musabai-code_0.1.0+vscodium1.140.06880_amd64.deb"

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.tmp, ignore_errors=True)

    def test_rebrands_every_inlined_product_object_and_product_json(self):
        for bundle in ("out/mainImpl.js", "out/cli.js", "out/vs/workbench/workbench.desktop.main.js"):
            text = (self.app / "resources" / "app" / bundle).read_text()
            self.assertIn('nameShort:"MusabAI Code"', text)
            self.assertIn('dataFolderName:".musabai-code"', text)
            self.assertIn('linuxDesktopName:"musabai-code"', text)
            self.assertNotIn("VSCodium", text)
        product = json.loads((self.app / "resources" / "app" / "product.json").read_text())
        self.assertEqual(product["applicationName"], "musabai-code")
        self.assertEqual(product["urlProtocol"], "musabai-code")
        self.assertEqual(product["extensionsGallery"]["serviceUrl"], "https://open-vsx.org/vscode/gallery")
        package = json.loads((self.app / "resources" / "app" / "package.json").read_text())
        self.assertEqual((package["name"], package["desktopName"]), ("musabai-code", "musabai-code.desktop"))
        self.assertNotEqual((self.app / "resources" / "app" / "resources" / "linux" / "code.png").read_bytes(), b"old")

    def test_integrity_checksums_match_the_shipped_files(self):
        resources = self.app / "resources" / "app"
        checksums = json.loads((resources / "product.json").read_text())["checksums"]
        self.assertEqual(set(checksums), set(self.original_checksums))
        for rel, value in checksums.items():
            self.assertEqual(value, checksum(resources / "out" / rel), rel)
        self.assertNotEqual(checksums["vs/workbench/workbench.desktop.main.js"], self.original_checksums["vs/workbench/workbench.desktop.main.js"])
        self.assertEqual(checksums["other.js"], self.original_checksums["other.js"], "unpatched files keep their checksum")

    def test_launchers_replace_the_codium_ones(self):
        self.assertTrue((self.app / "musabai-code").exists())
        self.assertFalse((self.app / "codium").exists())
        self.assertFalse((self.app / "bin" / "codium").exists())
        for name in ("musabai-code", "musabai-agent"):
            launcher = self.app / "bin" / name
            self.assertTrue(launcher.stat().st_mode & 0o111, name)
            subprocess.run(["sh", "-n", str(launcher)], check=True)
        self.assertIn("extensions/musabai-code/dist/cli.js", (self.app / "bin" / "musabai-agent").read_text())
        self.assertIn("apparmor_restrict_unprivileged_userns", (self.app / "bin" / "musabai-code").read_text())

    def test_builds_in_the_extension_and_the_cursor_style_defaults(self):
        builtin = self.app / "resources" / "app" / "extensions"
        manifest = json.loads((builtin / "musabai-code" / "package.json").read_text())
        for key in ("scripts", "devDependencies", "dependencies", "private"):
            self.assertNotIn(key, manifest)
        self.assertTrue((builtin / "musabai-code" / "dist" / "extension.js").exists())
        self.assertFalse((builtin / "musabai-code" / "dist" / "extension.js.map").exists())
        self.assertFalse((builtin / "musabai-code" / "dist" / "musabai-code.vsix").exists())
        defaults = json.loads((builtin / "musabai-defaults" / "package.json").read_text())["contributes"]["configurationDefaults"]
        self.assertEqual(defaults["workbench.colorTheme"], "MusabAI Dark")
        self.assertTrue(defaults["chat.disableAIFeatures"])
        self.assertEqual(defaults["workbench.activityBar.location"], "top")
        self.assertTrue((builtin / "git").exists(), "VSCodium's own built-in extensions stay")

    def test_tarball_carries_a_user_installer(self):
        installer = self.app / "install-user.sh"
        self.assertTrue(installer.stat().st_mode & 0o111)
        subprocess.run(["sh", "-n", str(installer)], check=True)
        self.assertTrue((self.app / "musabai-code.png").exists())

    def test_deb_metadata_layout_and_setuid_sandbox(self):
        fields = subprocess.run(["dpkg-deb", "-f", str(self.deb), "Package", "Architecture", "Depends", "Recommends", "Maintainer"], check=True, capture_output=True, text=True).stdout
        self.assertIn("Package: musabai-code", fields)
        self.assertIn("Architecture: amd64", fields)
        self.assertIn("libgtk-3-0t64 | libgtk-3-0", fields)
        self.assertIn("libnss3", fields)
        self.assertIn("ripgrep", fields)
        self.assertIn("Musabgpt", fields)
        contents = subprocess.run(["dpkg-deb", "-c", str(self.deb)], check=True, capture_output=True, text=True).stdout
        self.assertRegex(contents, r"rwsr-xr-x root/root .* \./usr/share/musabai-code/chrome-sandbox")
        self.assertRegex(contents, r"\./usr/bin/musabai-code -> /usr/share/musabai-code/bin/musabai-code")
        self.assertRegex(contents, r"\./usr/bin/musabai-agent -> /usr/share/musabai-code/bin/musabai-agent")
        self.assertNotIn("./usr/bin/musabai ", contents, "/usr/bin/musabai belongs to the MusabAI desktop app")
        for path in ("usr/share/applications/musabai-code.desktop", "usr/share/applications/musabai-code-url-handler.desktop",
                     "usr/share/icons/hicolor/512x512/apps/musabai-code.png", "usr/share/icons/hicolor/scalable/apps/musabai-code.svg",
                     "usr/share/musabai-code/resources/apparmor/musabai-code"):
            self.assertIn(f"./{path}", contents)
        scripts = subprocess.run(["dpkg-deb", "--ctrl-tarfile", str(self.deb)], check=True, capture_output=True).stdout
        names = tarfile.open(fileobj=__import__("io").BytesIO(scripts)).getnames()
        for script in ("./postinst", "./prerm", "./postrm"):
            self.assertIn(script, names)

    @unittest.skipUnless(shutil.which("desktop-file-validate"), "needs desktop-file-validate")
    def test_desktop_entries_validate(self):
        tmp = self.tmp / "desktop"
        tmp.mkdir(exist_ok=True)
        for name, text in (("musabai-code.desktop", build_editor.desktop_entry("/usr/share/musabai-code/musabai-code", "musabai-code")),
                           ("musabai-code-url-handler.desktop", build_editor.url_handler_entry("/usr/share/musabai-code/musabai-code", "musabai-code"))):
            (tmp / name).write_text(text)
            result = subprocess.run(["desktop-file-validate", str(tmp / name)], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)


class PatchTest(unittest.TestCase):
    def test_patches_only_the_real_product_object(self):
        dev = 'Object.assign(Z,{version:"1.104.0-dev",nameShort:"Code - OSS Dev",applicationName:"code-oss",dataFolderName:".vscode-oss",urlProtocol:"code-oss"});'
        tricky = INLINED.replace('version:"1.140.06880"', 'version:"1.140.06880",note:"a } brace in a string"')
        out = build_editor.patch_inlined_product(tricky + dev, "x.js")
        self.assertIn('dataFolderName:".musabai-code"', out)
        self.assertTrue(out.endswith(dev), "the development fallback stays as it was")
        self.assertIn('note:"a } brace in a string"', out)

    def test_refuses_a_changed_vscodium_layout(self):
        with self.assertRaisesRegex(ValueError, "expected"):
            build_editor.patch_inlined_product('{nameShort:"VSCodium"}', "x.js")
        with self.assertRaisesRegex(ValueError, "found 2"):
            build_editor.patch_inlined_product(INLINED + INLINED, "x.js")
        with self.assertRaisesRegex(ValueError, "product.json"):
            build_editor.patch_product_json({"nameShort": "Code"})

    def test_refuses_a_checksum_for_a_missing_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            resources = Path(tmp)
            (resources / "out").mkdir()
            (resources / "product.json").write_text(json.dumps({"checksums": {"vs/gone.js": "x"}}))
            with self.assertRaisesRegex(ValueError, "does not exist"):
                build_editor.refresh_checksums(resources)

    def test_rejects_a_wrong_checksum(self):
        with tempfile.TemporaryDirectory() as tmp:
            tar = Path(tmp) / "v.tar.gz"
            tar.write_bytes(b"not vscodium")
            with self.assertRaises(SystemExit):
                build_editor.main(["--vscodium", str(tar), "--sha256", "0" * 64, "--extension", tmp, "--out", tmp])


if __name__ == "__main__":
    unittest.main()

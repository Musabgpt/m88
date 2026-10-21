# Linux feature compatibility

MusabAI Linux reuses the existing NewAl Code desktop agent rather than embedding the Android app in an emulator. The GUI is a pywebview window backed by GTK 3 and WebKitGTK 4.1. The Debian package declares the host libraries. The AppImage carries MusabAI's Python modules and local inference binary, and checks for the host GTK/WebKit runtime before starting.

The supported package target is x86_64 on Ubuntu 24.04 LTS and Linux Mint 22. Other distributions may work when they provide Python 3.12 or newer, GTK 3, WebKitGTK 4.1, PyGObject, GLib, and a compatible glibc. There is no ARM64 package in this migration because a tested ARM64 desktop build is not available yet.

| Existing feature | Android implementation | Linux implementation | Verification |
| --- | --- | --- | --- |
| Ask, Plan, and Agent coding workflows | Android service and WebView bridge | Native pywebview window using the same NewAl Code agent, provider router, tools, and session model | Agent, provider, tool protocol, and desktop regression suites in Linux CI |
| Project browsing and edits | Android app files and document bridge | User-selected local project folders, normal Linux paths, existing read/edit/write/patch tools | Connector and desktop regression suites |
| Git, branches, diffs, tests, and shell commands | Android/Termux bridge | Host Git and processes in the Linux desktop engine; existing sandbox and approval modes remain enabled | Git workspace and desktop regression suites |
| Local GGUF models | Imported Android model files and native runtime | Bundled x86_64 `llama-server` plus user-selected GGUF files | Pinned binary checksum, dynamic-library check, and packaged-app smoke test; model inference needs a model file |
| OpenAI-compatible and other configured providers | Android account setup and provider adapters | Existing provider settings and local configuration; no paid account is mandatory | Provider/router tests; live network credentials are not part of CI |
| MCP and browser integrations | Connector manager and Android-hosted services | Existing MCP configuration and desktop-compatible integrations | MCP configuration, bundle, registry, browser-router, and connector tests |
| Durable memory and autonomous continuity | Android app storage and engine patch | Existing local MusabAI data directory and autonomy layer | Memory and agent integration tests |
| Arabic, RTL, and mixed Arabic/English input | Arabic Android resources and connector UI | UTF-8 WebKit UI, `dir=auto` composer, RTL layout rules, system Arabic fonts, and unchanged connector localization | Arabic connector UI assertions and native WebKit startup; pixel-level shaping is not screenshot-verified in CI |
| Folder selection and system browser | Android document picker and intents | Native pywebview folder dialog; external links open in the system browser | Native-window smoke test and upstream dialog integration |
| Phone screen, accessibility service, Android notifications, APK installation, and Android intents | Android AccessibilityService, phone APIs, and notification service | Not available on a Linux desktop. The Linux package does not show a fake phone-control implementation; general browser, shell, and file tools remain available | Compatibility limitation documented; Android modules remain in the repository |
| Termux and Android share/shortcut actions | Termux bridge, Android share sheet, app shortcuts | Host shell and file manager are the desktop equivalents; Android-only share/shortcut flows are unavailable | Linux process and desktop smoke tests |

Provider accounts and API keys are configured in the user's local settings. The packages contain no credentials. Phone-control features that require an Android host report unavailable through the existing connector runtime instead of pretending that Linux has Android APIs.

## Runtime and installation

The `.deb` package installs the GUI launcher, CLI launcher, application-menu entry, icon, Python engine, pinned pywebview modules, and pinned x86_64 llama.cpp server. It depends on the Ubuntu 24.04 GTK 3 and WebKitGTK 4.1 runtime.

The `.AppImage` bundles the MusabAI application files and llama.cpp server but uses host Python, GTK 3, PyGObject, and WebKitGTK 4.1. On Ubuntu 24.04/Mint 22, install the packages below if the host does not already provide them:

```sh
sudo apt install python3 python3-gi python3-gi-cairo gir1.2-gtk-3.0 gir1.2-webkit2-4.1 libwebkit2gtk-4.1-0 libfuse2
```

The AppImage supports `APPIMAGE_EXTRACT_AND_RUN=1` for systems where FUSE mounting is unavailable. No package runs as root. The application binds its local UI server only to `127.0.0.1`.

## MusabAI Code

MusabAI Code is the Cursor-style editor described in [musabai-code/README.md](musabai-code/README.md). It is an
Electron app (VSCodium 1.140) for the same x86_64 Ubuntu 24.04 / Linux Mint 22 target, and does not need Python,
WebKitGTK or the NewAl engine.

Its agent brings the desktop counterpart of the phone-control row above, **laptop control**:
- opening apps and URLs, and notifications;
- volume (`pactl`) and media (`playerctl`);
- the clipboard (`xclip` or `xsel`);
- screenshots (`gnome-screenshot` on Linux Mint, or scrot, maim, ImageMagick, spectacle, xfce4-screenshooter or grim);
- window listing and focus (`wmctrl` or `xdotool`);
- typing, keys and clicks (`xdotool`);
- locking the screen (`cinnamon-screensaver-command`, `loginctl` or `xdg-screensaver`), and system information.

Every action that changes something asks first. A Wayland session loses window, typing and click control; the other
actions keep working.

The `.deb` installs to `/usr/share/musabai-code` with the commands `musabai-code` and `musabai-agent`. It has a
set-uid `chrome-sandbox` and an AppArmor profile, because Ubuntu 24.04 and Linux Mint 22 restrict unprivileged user
namespaces. The no-sudo tarball install falls back to `--no-sandbox` only on such systems. It installs alongside the
MusabAI desktop app: `/usr/bin/musabai` stays the desktop app.


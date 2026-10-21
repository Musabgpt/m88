# MusabAI Code — محرر بأسلوب Cursor لـ Linux Mint

<div dir="rtl">

**MusabAI Code** محرر أكواد كامل مبني على VS Code (نسخة VSCodium المفتوحة المصدر) وفيه MusabAI مدمج،
بنفس طريقة عمل Cursor وواجهته واختصاراته، لكن **بنماذج ومزودات مجانية** بدون حساب وبدون اشتراك.

## التثبيت على Linux Mint 22 (أو Ubuntu 24.04) — x86_64

**الطريقة الأسهل: أمر واحد يبني كل شيء ويثبّته، وهو نفسه للتحديث:**

```sh
curl -fsSL https://raw.githubusercontent.com/Musabgpt/m88/main/linux/musabai-code/install-mint.sh | bash
```

يثبّت السكربت الأدوات اللازمة (git وripgrep وxdotool وxclip وNode.js للبناء فقط)، ويجلب آخر نسخة من المشروع،
ويبني الإضافة، ويحمّل VSCodium المثبّت إصداره ويتحقق من بصمته SHA-256، ثم يجمّع MusabAI Code ويثبّت حزمة `.deb`.
شغّله مرة ثانية متى أردت التحديث. ومن نسخة المشروع على جهازك: `./linux/musabai-code/install-mint.sh`.

**من ملفات GitHub Actions الجاهزة:** نزّل `MusabAI-Code-linux-x64-…` من تبويب Actions (سير العمل **MusabAI Code**) ثم:

```sh
sudo apt install --reinstall ./musabai-code_*_amd64.deb
```

**بدون sudo (لمستخدمك فقط):** فكّ `MusabAI-Code-…-linux-x64.tar.gz` ثم شغّل `./install-user.sh` من داخل المجلد
(أو `./linux/musabai-code/install-mint.sh --user`).

بعد التثبيت: افتح **MusabAI Code** من القائمة، أو من الطرفية `musabai-code ~/مشروعي`.

تستخدم VS Code أو VSCodium (الإصدار 1.105 أو أحدث) وتريد MusabAI داخله؟ ثبّت ملف الإضافة من نفس ملفات GitHub Actions:
`code --install-extension musabai-code-0.1.0.vsix`.

## أول تشغيل

- المحادثة على اليمين مثل Cursor: **Ctrl+L**، ووكيل جديد: **Ctrl+I**.
- النموذج الافتراضي **Kilo Auto Free** يعمل فورًا بدون حساب. إذا انشغل مزود ينتقل MusabAI تلقائيًا للنموذج المجاني التالي ويكمل العمل.
- لسرعة وسعة أكبر أضف مفاتيح مجانية (Groq وGemini وOpenRouter وNVIDIA وZhipu وMistral وCodestral) من **إعدادات MusabAI** (Ctrl+Shift+J)،
  أو شغّل نماذج محلية على اللابتوب عبر Ollama أو LM Studio أو llama.cpp (خاصة وتعمل بلا إنترنت).
- انقل إعداداتك وإضافاتك من VS Code أو Cursor: Ctrl+Shift+P ← **MusabAI: Import Settings and Extensions**.
- الإضافات تأتي من Open VSX، وهو نفس متجر Cursor.
- **أداة REA للهندسة العكسية:** من **إعدادات MusabAI** ← **MCP servers** اضغط **Add** بجانب REA لتحليل الملفات التنفيذية
  والتطبيقات وسلوكها. سكربت التثبيت يجهّز Node.js اللازم لها. استعملها بسؤال الوكيل (مثلًا: «حلّل الملف `app`»)، على برامجك
  أو ما عندك إذن بفحصه.

## مثل Cursor

| في Cursor | في MusabAI Code |
| --- | --- |
| المحادثة والوكيل (Ctrl+L / Ctrl+I) والأوضاع Agent وPlan وAsk وManual والأوضاع المخصصة | نفس الشيء |
| Ctrl+K للتعديل داخل الملف مع فرق أحمر/أخضر، Ctrl+Enter للقبول وCtrl+Backspace للرفض | نفس الشيء |
| Ctrl+K داخل الطرفية لكتابة الأمر | نفس الشيء |
| الإكمال التلقائي بـ Tab | نفس الشيء (Codestral أو Ollama أو نموذج المحادثة المجاني) |
| مراجعة كل تغيير (قبول/رفض لكل جزء أو ملف أو الكل) ونقاط الاستعادة | نفس الشيء |
| الإشارات @: ملفات ومجلدات وكود وGit وبحث الويب وروابط والطرفية والمشكلات والقواعد والمشروع والصور والمحادثات السابقة | نفس الشيء |
| فهرسة المشروع والبحث الدلالي | فهرس محلي على جهازك (لا يُرفع الكود) |
| القواعد `.cursor/rules` و`.cursorrules` و`AGENTS.md` وقواعد المستخدم | نفس الملفات |
| خوادم MCP (stdio وHTTP وSSE) من `~/.cursor/mcp.json` | نفس الملفات وصيغها |
| Bugbot ورسالة الـ commit وطلبات الدمج (Pull Requests) | نفس الشيء عبر GitHub |
| الوكلاء في الخلفية | على نسخة git worktree على جهازك بدل السحابة |
| `cursor-agent` في الطرفية | `musabai-agent` |
| النماذج المدفوعة | نماذج ومزودات مجانية ونماذج محلية |

## الطرفية وGitHub وVS Code

- أوامر الوكيل تظهر في طرفية **MusabAI Agent** داخل المحرر، وتوقفها بـ Ctrl+C.
- وكيل الطرفية `musabai-agent` يعمل في أي طرفية: `musabai-agent` للجلسة التفاعلية، و`musabai-agent -p "…"` للسكربتات،
  و`musabai-agent review` و`commit` و`pr` و`models` و`keys` و`mcp` و`laptop`.
- GitHub: سجّل الدخول من قائمة الحسابات في المحرر، أو بـ `gh auth login`، أو بمتغير `GITHUB_TOKEN`.
  بعدها: إنشاء Pull Request بوصف مكتوب، ومراجعة Bugbot، وإصلاح Issue، وإصلاح GitHub Actions الفاشلة.
- كل إضافات وإعدادات واختصارات VS Code تعمل كما هي.

## استخدام اللابتوب

يستطيع MusabAI استخدام اللابتوب كما يستخدم MusabAI على Android الهاتف: فتح التطبيقات والروابط، والإشعارات، والصوت،
والتحكم بالوسائط، والحافظة، ولقطات الشاشة، وعرض النوافذ وتبديلها، والكتابة والضغط على المفاتيح (يحتاج `xdotool` وجلسة X11، وهي الافتراضية في Linux Mint).
كل إجراء يغيّر شيئًا يطلب موافقتك أولًا، ويمكن إيقاف الميزة من إعدادات MusabAI ← Agent.

## الأمان

- وضع تشغيل الأوامر: **اسأل دائمًا** أو **القائمة المسموحة** (الافتراضي) أو **تلقائي**. الأوامر الخطرة (sudo وrm -rf وforce-push و`curl | sh`…) تطلب الموافقة دائمًا.
- في المجلدات غير الموثوقة (Restricted Mode) يسأل الوكيل قبل كل أمر، ولا تعمل خوادم MCP الخاصة بالمشروع، ولا تعمل الوكلاء في الخلفية.
  تُظهر المحادثة تنبيهًا مع زر **Trust this folder**؛ اضغطه ثم **Trust** إذا كان المشروع لك، فيعمل الوكيل عاديًا.
- خوادم MCP التي يضعها المشروع لا تبدأ إلا بعد موافقتك.
- إعدادات الأوامر والنماذج على مستوى المستخدم فقط، فلا يستطيع مشروع مُنزَّل تغييرها من `.vscode/settings.json`.

## الإزالة

`sudo apt remove musabai-code` (أو `./install-user.sh --uninstall` للتثبيت بدون sudo). إعداداتك تبقى في `~/.config/MusabAI Code` و`~/.musabai-code`.

</div>

---

# MusabAI Code — a Cursor-style editor for Linux Mint

**MusabAI Code** is a full VS Code–based editor (VSCodium inside) with MusabAI built in. It works like Cursor, with the
same layout, workflow and shortcuts, but runs on **free models and free providers**: no account or subscription is needed.

## Install on Linux Mint 22 / Ubuntu 24.04 (x86_64)

One command builds everything and installs it. Run the same command again to update:

```sh
curl -fsSL https://raw.githubusercontent.com/Musabgpt/m88/main/linux/musabai-code/install-mint.sh | bash
```

The script installs the tools it needs (git, ripgrep, xdotool, xclip, and Node.js for the build only), fetches the
latest source and builds the extension. It then downloads the pinned VSCodium release, verifies its SHA-256,
assembles MusabAI Code and installs the `.deb`. From a checkout, run `./linux/musabai-code/install-mint.sh`.

- **Ready-made packages:** download `MusabAI-Code-linux-x64-…` from the **MusabAI Code** GitHub Actions workflow, then
  run `sudo apt install --reinstall ./musabai-code_*_amd64.deb`.
- **No sudo (this user only):** unpack `MusabAI-Code-…-linux-x64.tar.gz` and run `./install-user.sh` in it, or run
  `./linux/musabai-code/install-mint.sh --user`.

Then open **MusabAI Code** from the menu, or run `musabai-code ~/your-project`.

To use MusabAI inside an existing VS Code or VSCodium (1.105 or newer), install the extension from the same
artifact: `code --install-extension musabai-code-0.1.0.vsix`.

## First run

- The chat sits on the right, as in Cursor: press **Ctrl+L**; **Ctrl+I** starts a new agent.
- The default model, **Kilo Auto Free**, works without any account. When a provider is busy, MusabAI moves to the next
  free model on its own and carries on.
- For more speed and capacity, add free keys in **MusabAI Settings** (Ctrl+Shift+J): Groq, Gemini, OpenRouter, NVIDIA,
  Zhipu, Mistral and Codestral. Or run local models with Ollama, LM Studio or llama.cpp: private, and offline.
- Bring your VS Code or Cursor setup: Ctrl+Shift+P → **MusabAI: Import Settings and Extensions**.
- Extensions come from Open VSX, the same marketplace Cursor uses.
- **REA reverse-engineering tool:** in **MusabAI Settings → MCP servers**, click **Add** next to REA to analyze binaries,
  apps and their runtime behavior. The installer sets up the Node.js it needs. Use it by asking the agent (e.g. "analyze
  the binary `app`"), on software you own or are authorized to test.

## Cursor parity

| Cursor | MusabAI Code |
| --- | --- |
| Chat and agent (Ctrl+L / Ctrl+I); Agent, Plan, Ask, Manual and custom modes | Same |
| Ctrl+K inline edit with a red/green diff; Ctrl+Enter accepts, Ctrl+Backspace rejects | Same |
| Ctrl+K in the terminal writes the command | Same |
| Tab autocomplete | Same (Codestral, Ollama, or the free chat model) |
| Review every change (per hunk, file or all) and restore checkpoints | Same |
| @ files, folders, code, git, web, URLs, terminal, problems, rules, codebase, images, past chats | Same |
| Codebase indexing and search | Local index on your laptop; no code is uploaded |
| Rules: `.cursor/rules`, `.cursorrules`, `AGENTS.md`, user rules | Same files |
| MCP servers (stdio, HTTP, SSE) from `~/.cursor/mcp.json` | Same files and formats |
| Bugbot, commit messages, pull requests | Same, through GitHub |
| Background agents | On a local git worktree instead of the cloud |
| `cursor-agent` in the terminal | `musabai-agent` |
| Paid frontier models | Free models and providers, plus local models |

## Terminal, GitHub and VS Code

- The agent's commands run in the **MusabAI Agent** terminal inside the editor; Ctrl+C stops one.
- The terminal agent works in any terminal:
  - `musabai-agent` starts an interactive session;
  - `musabai-agent -p "…"` runs once, for scripts;
  - the subcommands are `review`, `commit`, `pr`, `models`, `keys`, `mcp` and `laptop`.
- GitHub: sign in from the Accounts menu, with `gh auth login`, or with `GITHUB_TOKEN`. Then you can:
  - create pull requests with a written description;
  - run a Bugbot review;
  - fix an issue;
  - fix failing GitHub Actions.
- Every VS Code extension, setting and keybinding works as usual.

## Use the laptop

MusabAI can use the laptop the way MusabAI on Android uses the phone:
- open apps and web pages, and show notifications;
- set the volume and control media;
- read or write the clipboard, and take screenshots;
- list and focus windows, type text and press keys. This needs `xdotool` and an X11 session, which is the Linux Mint default.

Every action that changes something asks first. Turn the feature off in MusabAI Settings → Agent.

## Safety

- **Run mode** decides when commands need your approval: *Ask every time*, *Allow-list* (the default) or *Auto-run*.
  Risky commands (sudo, `rm -rf`, force-push, `curl | sh`…) always ask.
- **Restricted Mode** (an untrusted folder):
  - the agent asks before every command;
  - the project's MCP servers stay off;
  - background agents do not run.

  The chat shows a notice with a **Trust this folder** button. For your own project, press it, then **Trust**, and the
  agent works normally.
- **Project MCP servers** start only after you trust them, both local commands and remote URLs.
- **User-level settings:** the run mode, the allow and deny lists, the model servers and laptop control can only be set
  in user settings, so a cloned repository's `.vscode/settings.json` cannot change them.

## Uninstall

Run `sudo apt remove musabai-code`, or `./install-user.sh --uninstall` for a no-sudo install. Settings stay in
`~/.config/MusabAI Code` and `~/.musabai-code`.

## Building and CI

`build_editor.py` turns the pinned VSCodium release into MusabAI Code:
- it rebrands the product, adds the launchers and icon, and builds in the MusabAI extension and the Cursor-style
  defaults;
- it recomputes the integrity checksums;
- it writes `musabai-code_<version>_amd64.deb` and `MusabAI-Code-<version>-linux-x64.tar.gz`.

The **MusabAI Code** workflow (`.github/workflows/musabai-code.yml`) does the following and uploads the packages:
1. type-checks and unit-tests the extension and the terminal agent;
2. runs the integration suite inside VSCodium under Xvfb;
3. tests `build_editor.py`, then builds both packages;
4. installs the `.deb` and checks its commands, menu entries and checksums;
5. opens the installed editor on a virtual display (`smoke-editor.sh`) and checks the no-sudo install.

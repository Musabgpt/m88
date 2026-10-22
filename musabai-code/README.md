# MusabAI — free AI for your code

Cursor-style AI inside VS Code, VSCodium and **MusabAI Code**, with free models and no account needed:
- chat and an agent that edits files and runs commands;
- inline edits and Tab autocomplete;
- terminal, Git and GitHub tools, MCP, and control of your laptop.

<div dir="rtl">

ذكاء اصطناعي مجاني لكودك بأسلوب Cursor، بدون حساب: محادثة، ووكيل يعدّل الملفات وينفذ الأوامر، وتعديل مباشر،
وإكمال تلقائي، وطرفية، وGit وGitHub، وMCP، واستخدام اللابتوب.

</div>

## Shortcuts

| Keys | What it does |
| --- | --- |
| **Ctrl+L** | Open the chat (Agent, Plan, Ask or Manual mode) |
| **Ctrl+I** | New agent chat |
| **Ctrl+Shift+L** | Add the selection to the chat |
| **Ctrl+K** | Edit the selection or the current line in place, shown as a red/green diff |
| **Ctrl+Enter / Ctrl+Backspace** | Accept or reject the changes in the editor |
| **Ctrl+K** in the terminal | Write a shell command from a description |
| **Tab** | Accept an autocomplete suggestion |
| **Ctrl+Shift+J** | MusabAI Settings |

## Free models

| Provider | Key |
| --- | --- |
| Kilo gateway: `kilo-auto/free` and other zero-price models (the default) | none |
| Groq, Google Gemini, OpenRouter, NVIDIA, Zhipu GLM, Mistral, Codestral (Tab) | free key |
| Ollama, LM Studio, llama.cpp on your machine | none |
| AI Horde, text only, as a last resort | none |

When a provider is busy or rate-limited, MusabAI moves to the next free model and keeps your progress. Add keys in
MusabAI Settings; they are kept in the system keyring.

## Features

- **Agent**:
  - reads, searches and edits your project, runs commands in the *MusabAI Agent* terminal, browses the web and uses MCP tools;
  - keeps a to-do list for long tasks;
  - in Plan mode, writes a plan before changing anything.
- **Review**:
  - every agent change stays pending until you accept or reject it, per change, per file or all at once;
  - **Restore checkpoint** puts files back as they were before a request.
- **@ mentions**: files, folders, code, `@git`, web search, URLs, the terminal, problems, rules, the codebase index,
  images and past chats.
- **Rules**: `.cursor/rules/*.mdc`, `.cursorrules`, `AGENTS.md` and your own user rules.
- **MCP**: servers from `~/.cursor/mcp.json`, `~/.config/musabai/mcp.json` and the project's `.cursor`, `.musabai` or
  `.vscode` `mcp.json`, over stdio, Streamable HTTP or SSE. MusabAI Settings → MCP servers also offers a one-click
  **REA** ([Reverse Engineer Anything](https://github.com/morluto/rea)) for analyzing binaries and runtime behavior of
  software you own or are authorized to test; it runs with `npx`, so Node.js must be installed.
- **Git and GitHub**: commit messages, pull requests with written descriptions, Bugbot reviews, fixing issues and
  failing GitHub Actions.
- **Background agents**: they work on their own git worktree while you keep coding; then review, apply or open a pull
  request.
- **Browser**: the agent drives a real browser to test a web app it builds — open a page (incl. `http://localhost`),
  read it, screenshot it (vision models see it), click and type. Each action that changes a page asks first; needs a
  Chromium-family browser installed.
- **Laptop**: open apps and pages, notifications, volume, media, clipboard, screenshots, windows, typing and keys.
  Actions that change something ask first.
- **Import**: settings, keybindings, snippets and extensions from VS Code, VSCodium or Cursor.

## Safety

- Commands follow the **run mode**: *Ask every time*, *Allow-list* (the default) or *Auto-run*. Risky commands always ask.
- In **Restricted Mode** (an untrusted folder):
  - every command asks;
  - the project's MCP servers stay off;
  - background agents do not run.
- **Project MCP servers**, local or remote, start only after you trust them.
- **User-level settings:** the run mode, the allow and deny lists, custom model endpoints, local model URLs, laptop
  control and user rules cannot be set by a repository's `.vscode/settings.json`.

## Terminal agent

The same agent runs in any terminal as `musabai-agent`:
- `musabai-agent` starts an interactive session;
- `musabai-agent -p "…"` runs once, for scripts;
- the subcommands are `review`, `commit`, `pr`, `models`, `keys`, `mcp` and `laptop`.

MusabAI Code installs the command; elsewhere run `node dist/cli.js` after `npm run build`.

## Development

```sh
npm ci
npm run typecheck
npm test                                   # unit tests
MUSABAI_VSCODE_BIN=/path/to/codium xvfb-run -a npm run test:integration
npm run build                              # dist/extension.js, dist/cli.js, dist/webview
```

The Linux editor build, the Linux Mint installer and the Cursor parity notes are in
[`linux/musabai-code`](https://github.com/Musabgpt/m88/tree/main/linux/musabai-code).

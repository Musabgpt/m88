import { h, icon, vscodeApi } from '../shared/dom';
import type { ModelOption } from '../shared/protocol';

const vscode = vscodeApi();
const post = (m: Record<string, unknown>) => vscode.postMessage(m);

interface SettingsState {
  version: string;
  language: 'ar' | 'en';
  languageSetting: string;
  chatModel: string;
  tabModel: string;
  inlineModel: string;
  models: ModelOption[];
  health: Record<string, { state: string; coolingDown: boolean; lastError: string }>;
  keys: { id: string; name: string; envs: string[]; url: string; set: boolean }[];
  agent: { runMode: string; allowList: string[]; denyList: string[]; maxSteps: number; autoContinue: boolean; laptop: boolean; browser: boolean; revealTerminal: boolean };
  tab: { enabled: boolean; debounceMs: number; chatFallback: boolean; fim: string[] };
  rules: { user: string[]; project: { name: string; path: string; kind: string; description: string }[] };
  mcp: { name: string; type: string; source: string; state: string; error: string; tools: string[] }[];
  index: { enabled: boolean; files: number; chunks: number; building: boolean };
  discover: { kilo: boolean; local: boolean };
  ollama: { running: boolean; models: string[] };
  hasWorkspace: boolean;
}

// One-click MCP servers (the host holds the actual command; this is only how they read in settings).
const SUGGESTED_MCP: { id: string; title: string; hint: string }[] = [
  { id: 'rea', title: 'REA — Reverse Engineer Anything', hint: 'Analyze binaries, apps and runtime behavior from the agent. Open-source MCP server; needs Node.js.' },
];

const SECTIONS: [string, string, string][] = [
  ['models', 'Models', 'sparkle'],
  ['keys', 'Free API keys', 'key'],
  ['local', 'Local models', 'device-desktop'],
  ['agent', 'Agent & terminal', 'terminal'],
  ['tab', 'Tab autocomplete', 'zap'],
  ['rules', 'Rules', 'law'],
  ['mcp', 'MCP servers', 'plug'],
  ['index', 'Codebase index', 'telescope'],
  ['github', 'GitHub', 'github'],
  ['general', 'General', 'settings-gear'],
];

const app = document.getElementById('app')!;
let state: SettingsState | undefined;
let active = app.dataset.section || 'models';

const set = (key: string, value: unknown) => post({ type: 'set', key, value });

function toggle(label: string, value: boolean, key: string, hint?: string): HTMLElement {
  const input = h('input', { type: 'checkbox', checked: value }) as HTMLInputElement;
  input.addEventListener('change', () => set(key, input.checked));
  return h('label', { class: 'row toggle' }, input, h('span', null, label), hint ? h('span', { class: 'hint' }, hint) : null);
}

function select(value: string, options: { value: string; label: string; disabled?: boolean }[], onChange: (v: string) => void): HTMLSelectElement {
  const el = h('select', null, ...options.map((o) => h('option', { value: o.value, selected: o.value === value, disabled: o.disabled }, o.label))) as HTMLSelectElement;
  el.addEventListener('change', () => onChange(el.value));
  return el;
}

function linesEditor(values: string[], key: string, placeholder: string): HTMLElement {
  const area = h('textarea', { rows: 5, placeholder, spellcheck: 'false' }, values.join('\n')) as HTMLTextAreaElement;
  area.addEventListener('change', () => set(key, area.value.split('\n').map((l) => l.trim()).filter(Boolean)));
  return area;
}

function modelOptions(models: ModelOption[], withSame: string | undefined): { value: string; label: string; disabled?: boolean }[] {
  return [
    ...(withSame ? [{ value: '', label: withSame }] : []),
    ...models.map((m) => ({ value: m.id, label: `${m.name}${m.ready ? '' : ' — needs a key'}`, disabled: !m.ready })),
  ];
}

function section(id: string, title: string, ...body: (Node | null)[]): HTMLElement {
  return h('section', { id, class: id === active ? 'active' : '' }, h('h2', null, title), ...body);
}

function render(): void {
  if (!state) return;
  const s = state;
  const nav = h(
    'nav',
    null,
    h('div', { class: 'brand' }, icon('sparkle'), ' MusabAI'),
    ...SECTIONS.map(([id, label, ic]) =>
      h('button', { class: id === active ? 'active' : '', onclick: () => { active = id; render(); } }, icon(ic), ` ${label}`),
    ),
  );
  const ready = s.models.filter((m) => m.ready && m.id !== 'auto');
  const content = h(
    'main',
    null,
    section(
      'models',
      'Models',
      h('p', { class: 'hint' }, 'Every model here is free. Kilo models need no account or key; add free keys for more speed and capacity. If one is busy, MusabAI moves to the next free model automatically.'),
      h('div', { class: 'field' }, h('label', null, 'Chat & agent model'), select(s.chatModel, modelOptions(s.models, undefined), (v) => set('model', v))),
      h('div', { class: 'field' }, h('label', null, 'Inline edit (Ctrl+K) model'), select(s.inlineModel, modelOptions(s.models, 'Same as chat'), (v) => set('inlineEdit.model', v))),
      h('div', { class: 'field' }, h('label', null, 'Tab model (when no FIM model is set up)'), select(s.tabModel, modelOptions(s.models, 'Same as chat'), (v) => set('tab.model', v))),
      toggle('Discover more free Kilo models (no key)', s.discover.kilo, 'models.discoverKilo'),
      toggle('Detect local models (Ollama, LM Studio, llama.cpp)', s.discover.local, 'models.discoverLocal'),
      h('div', { class: 'row' }, h('button', { class: 'secondary', onclick: () => post({ type: 'refreshModels' }) }, icon('refresh'), ' Refresh and reset busy models')),
      h(
        'table',
        null,
        h('thead', null, h('tr', null, h('th', null, 'Model'), h('th', null, 'Group'), h('th', null, 'Status'))),
        h(
          'tbody',
          null,
          ...s.models
            .filter((m) => m.id !== 'auto')
            .map((m) => {
              const health = s.health[m.id];
              const status = !m.ready ? 'needs a free key' : health?.coolingDown ? `busy (${health.lastError})` : 'ready';
              return h('tr', null, h('td', null, m.name, h('div', { class: 'hint' }, m.id)), h('td', null, m.group), h('td', { class: !m.ready ? 'muted' : health?.coolingDown ? 'warn' : 'ok' }, status));
            }),
        ),
      ),
      h('p', { class: 'hint' }, `${ready.length} models ready.`),
    ),
    section(
      'keys',
      'Free API keys',
      h('p', { class: 'hint' }, 'Optional. Each provider has a free tier; the key is stored in your system keyring (and, if you choose, in ~/.config/musabai/credentials.json for the terminal agent). Environment variables work too.'),
      ...s.keys.map((k) =>
        h(
          'div',
          { class: 'key-row' },
          h('div', { class: 'key-name' }, h('strong', null, k.name), h('div', { class: 'hint' }, k.envs.join(' or '))),
          h('span', { class: k.set ? 'ok' : 'muted' }, k.set ? '✓ configured' : 'not set'),
          h('span', { class: 'spacer' }),
          h('button', { class: 'link', onclick: () => post({ type: 'openUrl', url: k.url }) }, 'Get a free key ', icon('link-external')),
          h('button', { class: 'primary', onclick: () => post({ type: 'setKey', id: k.id }) }, k.set ? 'Change' : 'Add key'),
          k.set ? h('button', { class: 'secondary', onclick: () => post({ type: 'removeKey', id: k.id }) }, 'Remove') : null,
        ),
      ),
    ),
    section(
      'local',
      'Local models (this laptop)',
      h('p', { class: 'hint' }, 'Run open models on your own laptop: private, offline and free. MusabAI finds Ollama, LM Studio and llama.cpp servers automatically.'),
      h('div', { class: 'row' }, h('strong', null, 'Ollama: '), h('span', { class: s.ollama.running ? 'ok' : 'muted' }, s.ollama.running ? `running — ${s.ollama.models.length} model${s.ollama.models.length === 1 ? '' : 's'}` : 'not running')),
      s.ollama.models.length ? h('ul', null, ...s.ollama.models.map((m) => h('li', null, m))) : null,
      h(
        'div',
        { class: 'row wrap' },
        s.ollama.running ? null : h('button', { class: 'secondary', onclick: () => post({ type: 'runInTerminal', command: 'curl -fsSL https://ollama.com/install.sh | sh' }) }, icon('cloud-download'), ' Install Ollama'),
        h('button', { class: 'secondary', onclick: () => post({ type: 'runInTerminal', command: 'ollama pull qwen2.5-coder:7b' }) }, 'Get a coding model (qwen2.5-coder 7B)'),
        h('button', { class: 'secondary', onclick: () => post({ type: 'runInTerminal', command: 'ollama pull qwen2.5-coder:1.5b' }) }, 'Get a fast Tab model (1.5B)'),
      ),
      h('p', { class: 'hint' }, 'The commands open in a terminal for you to review and run. A 7B model needs about 8 GB of RAM.'),
    ),
    section(
      'agent',
      'Agent & terminal',
      h('div', { class: 'field' }, h('label', null, 'When the agent wants to run a command'),
        select(s.agent.runMode, [
          { value: 'ask', label: 'Ask me every time' },
          { value: 'allowlist', label: 'Run read-only and allow-listed commands; ask for the rest (recommended)' },
          { value: 'auto', label: 'Auto-run everything except risky commands (YOLO)' },
          { value: 'unattended', label: 'Work alone: never wait for me; skip what needs my approval and list it at the end' },
        ], (v) => set('agent.runMode', v))),
      h('p', { class: 'hint' }, 'Risky commands (sudo, rm -rf, force-push, pipes into a shell…) always ask, in every mode; working alone, they are skipped instead.'),
      h('div', { class: 'field' }, h('label', null, 'Allow list (command prefixes, one per line)'), linesEditor(s.agent.allowList, 'agent.allowList', 'npm test\npytest')),
      h('div', { class: 'field' }, h('label', null, 'Deny list (always ask)'), linesEditor(s.agent.denyList, 'agent.denyList', 'docker\nkubectl')),
      h('div', { class: 'field' }, h('label', null, 'Maximum steps per request'), (() => {
        const n = h('input', { type: 'number', min: 5, max: 300, value: s.agent.maxSteps }) as HTMLInputElement;
        n.addEventListener('change', () => set('agent.maxSteps', Number(n.value)));
        return n;
      })()),
      toggle('Keep working toward the goal without stopping to ask me to continue', s.agent.autoContinue, 'agent.autoContinue', 'When a request runs out of steps, MusabAI carries on by itself (up to a safety cap) instead of waiting.'),
      toggle('Show the MusabAI Agent terminal while commands run', s.agent.revealTerminal, 'agent.revealTerminal'),
      toggle('Let the agent use the laptop (apps, browser, notifications, clipboard, screenshots, keyboard/mouse)', s.agent.laptop, 'laptop.enabled', 'Each action that changes something asks first.'),
      toggle('Let the agent drive a browser to test web pages (open, click, type, screenshot)', s.agent.browser, 'browser.enabled', 'Needs a Chromium-family browser installed. Each action that changes a page asks first.'),
    ),
    section(
      'tab',
      'Tab autocomplete',
      toggle('Enable Tab autocomplete', s.tab.enabled, 'tab.enabled'),
      toggle('Use the free chat model when no FIM model is available', s.tab.chatFallback, 'tab.chatFallback'),
      h('p', { class: 'hint' }, s.tab.fim.length ? `Fast fill-in-the-middle models found: ${s.tab.fim.join(', ')}.` : 'For the fastest Tab, add a free Codestral key or pull a small coder model with Ollama (see Local models).'),
    ),
    section(
      'rules',
      'Rules',
      h('div', { class: 'field' }, h('label', null, 'Your rules for every project (one per line)'), linesEditor(s.rules.user, 'rules.user', 'Always answer in Arabic.\nUse TypeScript strict mode.')),
      h('h3', null, 'Project rules'),
      h('p', { class: 'hint' }, 'Read from .cursor/rules/*.mdc, .musabai/rules, .cursorrules and AGENTS.md — compatible with Cursor.'),
      s.rules.project.length
        ? h('table', null, h('tbody', null, ...s.rules.project.map((r) => h('tr', null, h('td', null, h('button', { class: 'link', onclick: () => post({ type: 'openFile', path: r.path }) }, r.name)), h('td', null, r.kind), h('td', { class: 'hint' }, r.description)))))
        : h('p', { class: 'muted' }, s.hasWorkspace ? 'No project rules yet.' : 'Open a folder to see its rules.'),
      h('button', { class: 'primary', onclick: () => post({ type: 'newRule' }) }, icon('add'), ' New rule'),
    ),
    section(
      'mcp',
      'MCP servers',
      h('p', { class: 'hint' }, 'Same format as Cursor: ~/.cursor/mcp.json, ~/.config/musabai/mcp.json, and per project .cursor/mcp.json, .musabai/mcp.json or .vscode/mcp.json.'),
      s.mcp.length
        ? h(
            'table',
            null,
            h('thead', null, h('tr', null, h('th', null, 'Server'), h('th', null, 'Status'), h('th', null, 'Tools'), h('th', null, ''))),
            h(
              'tbody',
              null,
              ...s.mcp.map((m) =>
                h(
                  'tr',
                  null,
                  h('td', null, m.name, h('div', { class: 'hint' }, `${m.type} · ${m.source}`)),
                  h('td', { class: m.state === 'ready' ? 'ok' : m.state === 'error' ? 'warn' : 'muted' }, m.state.replace('_', ' '), m.error ? h('div', { class: 'hint' }, m.error) : null),
                  h('td', { class: 'hint' }, m.tools.join(', ') || '—'),
                  h(
                    'td',
                    null,
                    h('button', { class: 'secondary', onclick: () => post({ type: 'mcpRestart', name: m.name }) }, 'Restart'),
                    h('button', { class: 'link', onclick: () => post({ type: 'mcpToggle', name: m.name, enabled: m.state === 'disabled' }) }, m.state === 'disabled' ? 'Enable' : 'Disable'),
                  ),
                ),
              ),
            ),
          )
        : h('p', { class: 'muted' }, 'No MCP servers configured.'),
      ...SUGGESTED_MCP.filter((sug) => !s.mcp.some((m) => m.name === sug.id)).map((sug) =>
        h('div', { class: 'field suggested' },
          h('div', null, h('strong', null, sug.title), h('div', { class: 'hint' }, sug.hint)),
          h('button', { class: 'secondary', onclick: () => post({ type: 'mcpAddSuggested', id: sug.id }) }, 'Add'),
        ),
      ),
      h(
        'div',
        { class: 'row wrap' },
        h('button', { class: 'secondary', onclick: () => post({ type: 'openMcpConfig', scope: 'global' }) }, 'Edit global mcp.json'),
        s.hasWorkspace ? h('button', { class: 'secondary', onclick: () => post({ type: 'openMcpConfig', scope: 'project' }) }, 'Edit project mcp.json') : null,
        h('button', { class: 'primary', onclick: () => post({ type: 'mcpStart' }) }, 'Start servers'),
      ),
    ),
    section(
      'index',
      'Codebase index',
      h('p', { class: 'hint' }, 'A private, local search index of this project for codebase_search and @Codebase. Nothing is uploaded.'),
      toggle('Index this project', s.index.enabled, 'index.enabled'),
      h('p', null, s.index.building ? 'Indexing…' : `${s.index.files} files, ${s.index.chunks} chunks indexed.`),
      h('button', { class: 'secondary', onclick: () => post({ type: 'rebuildIndex' }) }, icon('sync'), ' Rebuild'),
    ),
    section(
      'github',
      'GitHub',
      h('p', { class: 'hint' }, 'Sign in with your GitHub account for pull requests, Bugbot reviews, issues and Actions logs. The gh CLI and GITHUB_TOKEN work too.'),
      h('button', { class: 'primary', onclick: () => post({ type: 'command', id: 'musabai.github.signIn' }) }, icon('github'), ' Sign in to GitHub'),
    ),
    section(
      'general',
      'General',
      h('div', { class: 'field' }, h('label', null, 'Language of MusabAI'), select(s.languageSetting, [
        { value: 'auto', label: 'Same as the editor' },
        { value: 'ar', label: 'العربية' },
        { value: 'en', label: 'English' },
      ], (v) => set('language', v))),
      h('div', { class: 'row wrap' },
        h('button', { class: 'secondary', onclick: () => post({ type: 'command', id: 'musabai.import', args: ['Cursor'] }) }, 'Import from Cursor'),
        h('button', { class: 'secondary', onclick: () => post({ type: 'command', id: 'musabai.import', args: ['VS Code'] }) }, 'Import from VS Code'),
        h('button', { class: 'secondary', onclick: () => post({ type: 'command', id: 'musabai.walkthrough' }) }, 'Show the welcome tour'),
      ),
      h('p', { class: 'hint' }, `MusabAI Code ${s.version}. No telemetry: your code goes only to the model provider you use (or stays on this laptop with a local model).`),
    ),
  );
  app.replaceChildren(nav, content);
}

window.addEventListener('message', (e: MessageEvent<{ type: string; state?: SettingsState; section?: string }>) => {
  if (e.data.type === 'state' && e.data.state) {
    state = e.data.state;
    render();
  } else if (e.data.type === 'section' && e.data.section) {
    active = e.data.section;
    render();
  }
});
post({ type: 'ready' });

import { spawn } from 'node:child_process';
import { readFile, readdir, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { which } from './host';

export const LAPTOP_ACTIONS = [
  'system_info', 'battery', 'list_apps', 'list_windows', 'notify', 'volume', 'media',
  'open', 'launch_app', 'clipboard_read', 'clipboard_write', 'screenshot', 'focus_window',
  'type_text', 'press_keys', 'click', 'lock_screen',
] as const;

export type LaptopAction = (typeof LAPTOP_ACTIONS)[number];

/** Actions that only read harmless state or are trivially reversible run without asking. */
export const LAPTOP_SAFE = new Set<LaptopAction>(['system_info', 'battery', 'list_apps', 'list_windows', 'notify', 'volume', 'media']);

export interface LaptopParams {
  target?: string;
  text?: string;
  title?: string;
  keys?: string;
  x?: number;
  y?: number;
  button?: string;
  level?: string | number;
}

export interface LaptopResult {
  text: string;
  images?: string[];
  path?: string;
}

export interface LaptopDeps {
  run(command: string, args: string[], options?: { input?: string; timeoutMs?: number }): Promise<{ code: number | null; stdout: string; stderr: string }>;
  which(command: string): Promise<string | undefined>;
  readText(file: string): Promise<string | undefined>;
  listDir(dir: string): Promise<string[]>;
  detach(command: string, args: string[]): void;
  env: NodeJS.ProcessEnv;
  tmpdir: string;
}

export const nodeLaptopDeps: LaptopDeps = {
  run: (command, args, options = {}) =>
    new Promise((resolve) => {
      const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';
      const timer = setTimeout(() => child.kill('SIGKILL'), options.timeoutMs ?? 20_000);
      child.stdout.on('data', (d) => (stdout += d));
      child.stderr.on('data', (d) => (stderr += d));
      child.on('error', (e) => {
        clearTimeout(timer);
        resolve({ code: -1, stdout, stderr: String(e) });
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        resolve({ code, stdout, stderr });
      });
      if (options.input !== undefined) child.stdin.end(options.input);
      else child.stdin.end();
    }),
  which,
  readText: (file) => readFile(file, 'utf8').catch(() => undefined),
  listDir: (dir) => readdir(dir).catch(() => []),
  detach: (command, args) => {
    const child = spawn(command, args, { detached: true, stdio: 'ignore' });
    child.on('error', () => undefined);
    child.unref();
  },
  env: process.env,
  tmpdir: os.tmpdir(),
};

export class LaptopError extends Error {}

function hint(tool: string, pkg = tool): string {
  return `${tool} is not installed. Install it with: sudo apt install ${pkg}`;
}

async function first(deps: LaptopDeps, names: string[]): Promise<string | undefined> {
  for (const name of names) if (await deps.which(name)) return name;
  return undefined;
}

export interface DesktopApp {
  id: string;
  name: string;
  localName?: string;
  exec: string;
  file: string;
}

export function parseDesktopFile(text: string, file: string, lang = 'ar'): DesktopApp | undefined {
  const section = /\[Desktop Entry\]([\s\S]*?)(?:\n\[|$)/.exec(text)?.[1];
  if (!section) return undefined;
  const get = (key: string) => new RegExp(`^${key.replace(/[[\]]/g, '\\$&')}=(.*)$`, 'm').exec(section)?.[1]?.trim();
  if ((get('Type') || 'Application') !== 'Application') return undefined;
  if (/^true$/i.test(get('NoDisplay') || '') || /^true$/i.test(get('Hidden') || '')) return undefined;
  const name = get('Name');
  const exec = get('Exec');
  if (!name || !exec) return undefined;
  return { id: path.basename(file, '.desktop'), name, localName: get(`Name[${lang}]`), exec, file };
}

const APP_DIRS = (home: string) => [
  path.join(home, '.local/share/applications'),
  '/usr/share/applications',
  '/usr/local/share/applications',
  '/var/lib/flatpak/exports/share/applications',
  path.join(home, '.local/share/flatpak/exports/share/applications'),
  '/var/lib/snapd/desktop/applications',
];

export async function desktopApps(deps: LaptopDeps): Promise<DesktopApp[]> {
  const seen = new Set<string>();
  const apps: DesktopApp[] = [];
  for (const dir of APP_DIRS(deps.env.HOME || os.homedir())) {
    for (const name of await deps.listDir(dir)) {
      if (!name.endsWith('.desktop') || seen.has(name)) continue;
      seen.add(name);
      const file = path.join(dir, name);
      const text = await deps.readText(file);
      const app = text ? parseDesktopFile(text, file) : undefined;
      if (app) apps.push(app);
    }
  }
  return apps.sort((a, b) => a.name.localeCompare(b.name));
}

export function findApp(apps: DesktopApp[], query: string): DesktopApp | undefined {
  const q = query.trim().toLowerCase();
  if (!q) return undefined;
  const exact = apps.find((a) => a.name.toLowerCase() === q || a.localName?.toLowerCase() === q || a.id.toLowerCase() === q);
  if (exact) return exact;
  return apps.find((a) => a.name.toLowerCase().includes(q) || a.localName?.toLowerCase().includes(q) || a.id.toLowerCase().includes(q));
}

/** Splits a desktop-entry Exec line and drops its field codes (%U, %f ...). */
export function execArgs(exec: string): string[] {
  const out: string[] = [];
  let current = '';
  let quote = false;
  for (let i = 0; i < exec.length; i++) {
    const c = exec[i];
    if (c === '"') {
      quote = !quote;
      continue;
    }
    if (c === '\\' && quote && i + 1 < exec.length) {
      current += exec[++i];
      continue;
    }
    if (c === ' ' && !quote) {
      if (current) out.push(current);
      current = '';
      continue;
    }
    current += c;
  }
  if (current) out.push(current);
  return out.filter((a) => !/^%[a-zA-Z]$/.test(a)).map((a) => a.replace(/%%/g, '%'));
}

async function batteryText(deps: LaptopDeps): Promise<string> {
  const base = '/sys/class/power_supply';
  const rows: string[] = [];
  for (const name of await deps.listDir(base)) {
    if (!/^BAT/i.test(name)) continue;
    const capacity = (await deps.readText(path.join(base, name, 'capacity')))?.trim();
    const status = (await deps.readText(path.join(base, name, 'status')))?.trim();
    if (capacity) rows.push(`${name}: ${capacity}%${status ? ` (${status})` : ''}`);
  }
  for (const name of await deps.listDir(base)) {
    if (/^(AC|ADP)/i.test(name)) {
      const online = (await deps.readText(path.join(base, name, 'online')))?.trim();
      if (online) rows.push(`Charger: ${online === '1' ? 'connected' : 'not connected'}`);
    }
  }
  return rows.join('\n') || 'No battery found (a desktop computer, or the battery is not reported).';
}

async function screenshot(deps: LaptopDeps): Promise<LaptopResult> {
  const file = path.join(deps.tmpdir, `musabai-screenshot-${Date.now()}.png`);
  const tools: [string, string[]][] = [
    ['gnome-screenshot', ['-f', file]],
    ['import', ['-window', 'root', file]],
    ['scrot', ['-o', file]],
    ['maim', [file]],
    ['grim', [file]],
    ['spectacle', ['-b', '-n', '-o', file]],
    ['xfce4-screenshooter', ['-f', '-s', file]],
  ];
  let used = '';
  for (const [tool, args] of tools) {
    if (!(await deps.which(tool))) continue;
    const r = await deps.run(tool, args, { timeoutMs: 20_000 });
    const ok = await stat(file).then((s) => s.size > 0).catch(() => false);
    if (r.code === 0 && ok) {
      used = tool;
      break;
    }
  }
  if (!used) throw new LaptopError(`No screenshot tool worked. ${hint('gnome-screenshot')}`);
  const images: string[] = [];
  if (await deps.which('convert')) {
    const small = file.replace(/\.png$/, '.jpg');
    const r = await deps.run('convert', [file, '-resize', '1280x1280>', '-quality', '70', small], { timeoutMs: 20_000 });
    if (r.code === 0) {
      const data = await readFile(small).catch(() => undefined);
      if (data && data.length < 1_500_000) images.push(`data:image/jpeg;base64,${data.toString('base64')}`);
    }
  }
  return { text: `Screenshot saved to ${file} (taken with ${used}).`, images, path: file };
}

export async function laptopAction(action: LaptopAction, params: LaptopParams, deps: LaptopDeps = nodeLaptopDeps): Promise<LaptopResult> {
  if (process.platform !== 'linux' && deps === nodeLaptopDeps) throw new LaptopError('Laptop control is available on Linux only.');
  const target = String(params.target ?? '').trim();
  const text = String(params.text ?? '');
  switch (action) {
    case 'system_info': {
      const release = (await deps.readText('/etc/os-release')) || '';
      const pretty = /PRETTY_NAME="?([^"\n]+)"?/.exec(release)?.[1] || os.type();
      const cpu = os.cpus();
      const disk = await deps.run('df', ['-h', '--output=size,used,avail,pcent', deps.env.HOME || '/'], { timeoutMs: 5000 });
      const gpu = (await deps.which('lspci')) ? (await deps.run('lspci', [], { timeoutMs: 5000 })).stdout.split('\n').filter((l) => /VGA|3D|Display/.test(l)).map((l) => l.replace(/^\S+\s/, '')) : [];
      const gb = (n: number) => `${(n / 1024 ** 3).toFixed(1)} GB`;
      return {
        text: [
          `OS: ${pretty} (kernel ${os.release()}, ${os.arch()})`,
          `Desktop: ${deps.env.XDG_CURRENT_DESKTOP || 'unknown'} on ${deps.env.XDG_SESSION_TYPE || (deps.env.WAYLAND_DISPLAY ? 'wayland' : deps.env.DISPLAY ? 'x11' : 'no display')}`,
          `Host: ${os.hostname()}, user ${os.userInfo().username}`,
          `CPU: ${cpu[0]?.model?.trim() || 'unknown'} (${cpu.length} threads)`,
          `Memory: ${gb(os.totalmem() - os.freemem())} used of ${gb(os.totalmem())}`,
          disk.code === 0 ? `Home disk (size used free use%): ${disk.stdout.trim().split('\n').pop()?.trim()}` : '',
          gpu.length ? `GPU: ${gpu.join('; ')}` : '',
          `Uptime: ${(os.uptime() / 3600).toFixed(1)} h`,
          await batteryText(deps),
        ].filter(Boolean).join('\n'),
      };
    }
    case 'battery':
      return { text: await batteryText(deps) };
    case 'list_apps': {
      const apps = await desktopApps(deps);
      return { text: apps.length ? apps.slice(0, 250).map((a) => `${a.name}${a.localName ? ` / ${a.localName}` : ''} (${a.id})`).join('\n') : 'No applications found.' };
    }
    case 'list_windows': {
      if (await deps.which('wmctrl')) {
        const r = await deps.run('wmctrl', ['-l']);
        return { text: r.stdout.split('\n').filter(Boolean).map((l) => l.replace(/^(\S+)\s+\S+\s+\S+\s+/, '$1  ')).join('\n') || 'No windows.' };
      }
      if (await deps.which('xdotool')) {
        const r = await deps.run('xdotool', ['search', '--onlyvisible', '--name', '.', 'getwindowname', '%@']);
        return { text: r.stdout.trim() || 'No windows.' };
      }
      throw new LaptopError(hint('wmctrl'));
    }
    case 'notify': {
      if (!(await deps.which('notify-send'))) throw new LaptopError(hint('notify-send', 'libnotify-bin'));
      const r = await deps.run('notify-send', ['--app-name=MusabAI', params.title || 'MusabAI', text || target || '']);
      if (r.code !== 0) throw new LaptopError(`notify-send failed: ${r.stderr.trim()}`);
      return { text: 'Notification shown.' };
    }
    case 'volume': {
      const level = String(params.level ?? target ?? '').trim().toLowerCase();
      if (await deps.which('pactl')) {
        if (!level) return { text: (await deps.run('pactl', ['get-sink-volume', '@DEFAULT_SINK@'])).stdout.trim() };
        const args = level === 'mute' || level === 'unmute' || level === 'toggle'
          ? ['set-sink-mute', '@DEFAULT_SINK@', level === 'mute' ? '1' : level === 'unmute' ? '0' : 'toggle']
          : ['set-sink-volume', '@DEFAULT_SINK@', level === 'up' ? '+10%' : level === 'down' ? '-10%' : `${Math.max(0, Math.min(150, Number(level.replace('%', '')) || 0))}%`];
        const r = await deps.run('pactl', args);
        if (r.code !== 0) throw new LaptopError(`pactl failed: ${r.stderr.trim()}`);
        return { text: `Volume: ${level}.` };
      }
      throw new LaptopError(hint('pactl', 'pulseaudio-utils'));
    }
    case 'media': {
      if (!(await deps.which('playerctl'))) throw new LaptopError(hint('playerctl'));
      const command = ['play', 'pause', 'play-pause', 'next', 'previous', 'stop', 'status'].includes(target) ? target : 'play-pause';
      const r = await deps.run('playerctl', [command]);
      return { text: r.code === 0 ? `Media: ${command}${r.stdout.trim() ? ` (${r.stdout.trim()})` : ''}.` : `No media player answered: ${r.stderr.trim()}` };
    }
    case 'open': {
      if (!target) throw new LaptopError('target is required: a URL or a file/folder path.');
      if (!/^(https?|mailto|file):/i.test(target) && !target.startsWith('/') && !target.startsWith('~')) {
        throw new LaptopError('target must be an http(s) URL or an absolute path.');
      }
      const resolved = target.startsWith('~') ? path.join(deps.env.HOME || os.homedir(), target.slice(1)) : target;
      if (!(await deps.which('xdg-open'))) throw new LaptopError(hint('xdg-open', 'xdg-utils'));
      deps.detach('xdg-open', [resolved]);
      return { text: `Opened ${resolved}.` };
    }
    case 'launch_app': {
      const app = findApp(await desktopApps(deps), target);
      if (!app) throw new LaptopError(`No installed application matches "${target}". Use list_apps to see the names.`);
      if (await deps.which('gtk-launch')) deps.detach('gtk-launch', [app.id]);
      else if (await deps.which('gio')) deps.detach('gio', ['launch', app.file]);
      else {
        const [command, ...args] = execArgs(app.exec);
        deps.detach(command, args);
      }
      return { text: `Started ${app.name}.` };
    }
    case 'clipboard_read': {
      const tool = await first(deps, ['xclip', 'xsel', 'wl-paste']);
      if (!tool) throw new LaptopError(hint('xclip'));
      const args = tool === 'xclip' ? ['-selection', 'clipboard', '-o'] : tool === 'xsel' ? ['--clipboard', '--output'] : ['--no-newline'];
      const r = await deps.run(tool, args);
      return { text: r.code === 0 ? r.stdout.slice(0, 20_000) || '(the clipboard is empty)' : '(the clipboard is empty or holds no text)' };
    }
    case 'clipboard_write': {
      const tool = await first(deps, ['xclip', 'xsel', 'wl-copy']);
      if (!tool) throw new LaptopError(hint('xclip'));
      const args = tool === 'xclip' ? ['-selection', 'clipboard'] : tool === 'xsel' ? ['--clipboard', '--input'] : [];
      const r = await deps.run(tool, args, { input: text });
      if (r.code !== 0) throw new LaptopError(`${tool} failed: ${r.stderr.trim()}`);
      return { text: `Copied ${text.length} characters to the clipboard.` };
    }
    case 'screenshot':
      return screenshot(deps);
    case 'focus_window': {
      if (!target) throw new LaptopError('target (part of the window title) is required.');
      if (await deps.which('wmctrl')) {
        const r = await deps.run('wmctrl', ['-a', target]);
        if (r.code === 0) return { text: `Focused the window "${target}".` };
      }
      if (await deps.which('xdotool')) {
        const r = await deps.run('xdotool', ['search', '--onlyvisible', '--name', target, 'windowactivate']);
        if (r.code === 0) return { text: `Focused the window "${target}".` };
        throw new LaptopError(`No visible window matches "${target}".`);
      }
      throw new LaptopError(hint('wmctrl'));
    }
    case 'type_text': {
      if (!(await deps.which('xdotool'))) throw new LaptopError(hint('xdotool'));
      const r = await deps.run('xdotool', ['type', '--delay', '15', '--', text], { timeoutMs: 60_000 });
      if (r.code !== 0) throw new LaptopError(`xdotool failed: ${r.stderr.trim()}`);
      return { text: `Typed ${text.length} characters into the focused window.` };
    }
    case 'press_keys': {
      if (!(await deps.which('xdotool'))) throw new LaptopError(hint('xdotool'));
      const keys = String(params.keys || target).trim();
      if (!/^[A-Za-z0-9_+ ]+$/.test(keys)) throw new LaptopError('keys must look like "ctrl+s", "Return" or "alt+Tab super".');
      const r = await deps.run('xdotool', ['key', '--', ...keys.split(/\s+/)]);
      if (r.code !== 0) throw new LaptopError(`xdotool failed: ${r.stderr.trim()}`);
      return { text: `Pressed ${keys}.` };
    }
    case 'click': {
      if (!(await deps.which('xdotool'))) throw new LaptopError(hint('xdotool'));
      const x = Number(params.x);
      const y = Number(params.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) throw new LaptopError('x and y screen coordinates are required (take a screenshot first).');
      const button = params.button === 'right' ? '3' : params.button === 'middle' ? '2' : '1';
      const r = await deps.run('xdotool', ['mousemove', String(Math.round(x)), String(Math.round(y)), 'click', button]);
      if (r.code !== 0) throw new LaptopError(`xdotool failed: ${r.stderr.trim()}`);
      return { text: `Clicked at ${Math.round(x)},${Math.round(y)}.` };
    }
    case 'lock_screen': {
      for (const [tool, args] of [
        ['cinnamon-screensaver-command', ['--lock']],
        ['loginctl', ['lock-session']],
        ['xdg-screensaver', ['lock']],
      ] as [string, string[]][]) {
        if (await deps.which(tool)) {
          const r = await deps.run(tool, args);
          if (r.code === 0) return { text: 'Screen locked.' };
        }
      }
      throw new LaptopError('Could not lock the screen on this desktop.');
    }
    default:
      throw new LaptopError(`Unknown action ${String(action)}. Actions: ${LAPTOP_ACTIONS.join(', ')}`);
  }
}

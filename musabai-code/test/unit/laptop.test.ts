import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { type LaptopDeps, LaptopError, execArgs, findApp, laptopAction, parseDesktopFile } from '../../src/core/laptop';

function fakeDeps(installed: string[], files: Record<string, string> = {}, dirs: Record<string, string[]> = {}) {
  const calls: { command: string; args: string[]; input?: string }[] = [];
  const detached: { command: string; args: string[] }[] = [];
  const deps: LaptopDeps = {
    run: async (command, args, options) => {
      calls.push({ command, args, input: options?.input });
      if (command === 'xclip' && args.includes('-o')) return { code: 0, stdout: 'copied text', stderr: '' };
      if (command === 'wmctrl' && args[0] === '-l') return { code: 0, stdout: '0x01  0 host Firefox\n0x02  0 host Terminal\n', stderr: '' };
      return { code: 0, stdout: '', stderr: '' };
    },
    which: async (c) => (installed.includes(c) ? `/usr/bin/${c}` : undefined),
    readText: async (f) => files[f],
    listDir: async (d) => dirs[d] ?? [],
    detach: (command, args) => detached.push({ command, args }),
    env: { HOME: '/home/musab', XDG_CURRENT_DESKTOP: 'X-Cinnamon', XDG_SESSION_TYPE: 'x11' },
    tmpdir: '/tmp',
  };
  return { deps, calls, detached };
}

const FIREFOX = '[Desktop Entry]\nType=Application\nName=Firefox Web Browser\nName[ar]=متصفح فيرفكس\nExec=firefox %u\n\n[Desktop Action new-window]\nName=New Window\nExec=firefox --new-window %u\n';

describe('laptop control', () => {
  it('reads .desktop entries and finds apps by English or Arabic name', () => {
    const app = parseDesktopFile(FIREFOX, '/usr/share/applications/firefox.desktop')!;
    assert.deepEqual([app.id, app.name, app.localName, app.exec], ['firefox', 'Firefox Web Browser', 'متصفح فيرفكس', 'firefox %u']);
    assert.equal(parseDesktopFile('[Desktop Entry]\nName=X\nExec=x\nNoDisplay=true\n', 'x.desktop'), undefined);
    assert.equal(findApp([app], 'فيرفكس')?.id, 'firefox');
    assert.equal(findApp([app], 'firefox')?.id, 'firefox');
    assert.deepEqual(execArgs('"/opt/My App/app" --flag %F'), ['/opt/My App/app', '--flag']);
  });

  it('launches an installed app with gtk-launch', async () => {
    const { deps, detached } = fakeDeps(['gtk-launch'], { '/usr/share/applications/firefox.desktop': FIREFOX }, { '/usr/share/applications': ['firefox.desktop'] });
    const r = await laptopAction('launch_app', { target: 'Firefox' }, deps);
    assert.equal(r.text, 'Started Firefox Web Browser.');
    assert.deepEqual(detached, [{ command: 'gtk-launch', args: ['firefox'] }]);
    await assert.rejects(laptopAction('launch_app', { target: 'nonexistent' }, deps), LaptopError);
  });

  it('uses the clipboard, notifications, volume and windows without a shell', async () => {
    const { deps, calls } = fakeDeps(['xclip', 'notify-send', 'pactl', 'wmctrl', 'xdotool']);
    assert.equal((await laptopAction('clipboard_read', {}, deps)).text, 'copied text');
    await laptopAction('clipboard_write', { text: 'hello; rm -rf ~' }, deps);
    assert.deepEqual(calls.at(-1), { command: 'xclip', args: ['-selection', 'clipboard'], input: 'hello; rm -rf ~' });
    await laptopAction('notify', { title: 'Build', text: 'done' }, deps);
    assert.deepEqual(calls.at(-1)!.args, ['--app-name=MusabAI', 'Build', 'done']);
    await laptopAction('volume', { level: '40' }, deps);
    assert.deepEqual(calls.at(-1)!.args, ['set-sink-volume', '@DEFAULT_SINK@', '40%']);
    assert.match((await laptopAction('list_windows', {}, deps)).text, /Firefox/);
    await laptopAction('press_keys', { keys: 'ctrl+s' }, deps);
    assert.deepEqual(calls.at(-1)!.args, ['key', '--', 'ctrl+s']);
    await assert.rejects(laptopAction('press_keys', { keys: 'ctrl+s; reboot' }, deps), /keys must look like/);
    await laptopAction('click', { x: 10.4, y: 20 }, deps);
    assert.deepEqual(calls.at(-1)!.args, ['mousemove', '10', '20', 'click', '1']);
  });

  it('opens only URLs and absolute paths, and explains missing tools', async () => {
    const { deps, detached } = fakeDeps(['xdg-open']);
    await laptopAction('open', { target: 'https://github.com' }, deps);
    assert.deepEqual(detached.at(-1), { command: 'xdg-open', args: ['https://github.com'] });
    await assert.rejects(laptopAction('open', { target: 'rm -rf /' }, deps), /URL or an absolute path/);
    const bare = fakeDeps([]).deps;
    await assert.rejects(laptopAction('type_text', { text: 'x' }, bare), /sudo apt install xdotool/);
    await assert.rejects(laptopAction('clipboard_read', {}, bare), /sudo apt install xclip/);
  });

  it('reports battery state from sysfs', async () => {
    const { deps } = fakeDeps([], {
      '/sys/class/power_supply/BAT0/capacity': '87\n',
      '/sys/class/power_supply/BAT0/status': 'Discharging\n',
      '/sys/class/power_supply/AC/online': '0\n',
    }, { '/sys/class/power_supply': ['AC', 'BAT0'] });
    assert.equal((await laptopAction('battery', {}, deps)).text, 'BAT0: 87% (Discharging)\nCharger: not connected');
  });
});

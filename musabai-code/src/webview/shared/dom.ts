type Child = Node | string | false | null | undefined;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<Record<string, string | boolean | number | EventListener>> | null = null,
  ...children: (Child | Child[])[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value === undefined || value === false || value === null) continue;
    if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
    else if (key === 'class') el.className = String(value);
    else if (key === 'html') el.innerHTML = String(value);
    else if (value === true) el.setAttribute(key, '');
    else el.setAttribute(key, String(value));
  }
  for (const child of children.flat()) {
    if (child === false || child === null || child === undefined) continue;
    el.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return el;
}

export function icon(name: string, extra = ''): HTMLElement {
  return h('i', { class: `codicon codicon-${name}${extra ? ` ${extra}` : ''}`, 'aria-hidden': 'true' });
}

declare function acquireVsCodeApi(): { postMessage(message: unknown): void; getState(): any; setState(state: unknown): void };

let api: ReturnType<typeof acquireVsCodeApi> | undefined;

export function vscodeApi() {
  if (!api) {
    try {
      api = acquireVsCodeApi();
    } catch {
      // Outside VS Code (a browser preview): a no-op bridge.
      api = { postMessage: (m: unknown) => console.log('postMessage', m), getState: () => undefined, setState: () => undefined };
    }
  }
  return api;
}

export function timeAgo(ms: number): string {
  const s = Math.max(1, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const hr = Math.round(m / 60);
  if (hr < 48) return `${hr}h`;
  return `${Math.round(hr / 24)}d`;
}

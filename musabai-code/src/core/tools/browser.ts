import type { PageState } from '../browser';
import { type Tool, ToolError, bool, str } from './types';

const ACTIONS = ['open', 'screenshot', 'read', 'click', 'type', 'press', 'close'] as const;
type BrowserAction = (typeof ACTIONS)[number];
// These read the page without changing anything, so they don't ask the user.
const SAFE = new Set<BrowserAction>(['screenshot', 'read', 'close']);

function pageSummary(state: PageState): string {
  const errors = state.consoleErrors.length ? `\nConsole errors:\n- ${state.consoleErrors.slice(0, 10).join('\n- ')}` : '';
  return `URL: ${state.url}\nTitle: ${state.title}\n\n${state.text.slice(0, 6000)}${errors}`;
}

export const browserTool: Tool = {
  name: 'browser',
  category: 'browser',
  readOnly: false,
  description:
    'Drive a real browser to test and inspect web pages (your running web app, or any site). Actions: open (url — also http://localhost ports), ' +
    'read (the current page text, URL and console errors), screenshot (a PNG of the page; vision models can see it), click (target — a CSS selector or ' +
    'visible button/link text), type (text, and optional selector; set submit:true to press Enter), press (key — Enter, Tab, Escape…), close. ' +
    'Use it to verify a web app you built actually works. One tab; it stays open between calls.',
  parameters: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: [...ACTIONS] },
      url: { type: 'string', description: 'For open: the http(s) URL (localhost is allowed).' },
      target: { type: 'string', description: 'For click: a CSS selector or the visible text of a button/link.' },
      selector: { type: 'string', description: 'For type: the CSS selector of the input (optional; defaults to the focused element).' },
      text: { type: 'string', description: 'For type: the text to enter.' },
      submit: { type: 'boolean', description: 'For type: press Enter afterwards.' },
      key: { type: 'string', description: 'For press: Enter, Tab, Escape, ArrowDown…' },
    },
    required: ['action'],
  },
  title: (a) => `Browser: ${String(a.action)}${a.url ? ` ${a.url}` : a.target ? ` ${a.target}` : a.key ? ` ${a.key}` : ''}`,
  async execute(args, ctx) {
    const action = str(args, 'action') as BrowserAction;
    if (!ACTIONS.includes(action)) throw new ToolError(`Unknown browser action. Use one of: ${ACTIONS.join(', ')}`);
    if (!ctx.host.browser) throw new ToolError('The browser is not available on this host.');
    const session = ctx.host.browser();

    if (!SAFE.has(action)) {
      const detail = [args.url, args.target, args.selector, args.text, args.key].filter((v) => v !== undefined && v !== '').map(String).join(' · ').slice(0, 300);
      const answer = await ctx.approve({ kind: 'browser', action, detail }, `browser:${action}`);
      if (answer === 'deny') return { ok: false, content: `The user declined browser ${action}.`, summary: `Skipped browser ${action}` };
    }

    try {
      switch (action) {
        case 'open': {
          const state = await session.open(str(args, 'url'));
          return { ok: true, content: `Opened the page.\n${pageSummary(state)}`, summary: `Opened ${state.url || str(args, 'url')}` };
        }
        case 'read': {
          const state = await session.state();
          return { ok: true, content: pageSummary(state), summary: 'Read the page' };
        }
        case 'screenshot': {
          const dataUrl = await session.screenshot();
          return {
            ok: true,
            content: ctx.visionModel ? 'Screenshot of the current page.' : 'Took a screenshot (the current model cannot see images; use read for the text).',
            summary: 'Screenshot',
            images: ctx.visionModel ? [dataUrl] : undefined,
          };
        }
        case 'click': {
          const found = await session.click(str(args, 'target'));
          if (!found) return { ok: false, content: `Nothing matched "${str(args, 'target')}" to click.`, summary: 'Click: no match' };
          const state = await session.state();
          return { ok: true, content: `Clicked.\n${pageSummary(state)}`, summary: `Clicked ${str(args, 'target')}` };
        }
        case 'type': {
          const ok = await session.type(str(args, 'selector', false) || undefined, str(args, 'text'), bool(args, 'submit'));
          if (!ok) return { ok: false, content: 'No input element to type into.', summary: 'Type: no target' };
          const state = await session.state();
          return { ok: true, content: `Typed.\n${pageSummary(state)}`, summary: 'Typed into the page' };
        }
        case 'press': {
          await session.press(str(args, 'key'));
          const state = await session.state();
          return { ok: true, content: `Pressed ${str(args, 'key')}.\n${pageSummary(state)}`, summary: `Pressed ${str(args, 'key')}` };
        }
        case 'close': {
          await session.close();
          return { ok: true, content: 'Closed the browser.', summary: 'Closed the browser' };
        }
      }
    } catch (error) {
      throw new ToolError((error as Error).message);
    }
    throw new ToolError(`Unhandled browser action: ${action}`);
  },
};

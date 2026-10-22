/* The page served to the phone, and the pairing panel shown in the editor, in the editor's language (Arabic or English).
   The page script is the bundled src/webview/phone/main.ts (dist/webview/phone.js), inlined with a CSP nonce. */

const STRINGS = {
  ar: {
    connecting: 'يتصل…',
    connected: 'متصل',
    reconnecting: 'انقطع — يعيد المحاولة…',
    expired: 'انتهى الربط — امسح رمز QR جديدًا من اللابتوب.',
    empty: 'لا توجد رسائل بعد — اكتب أول طلب في الأسفل.',
    placeholder: 'اكتب طلبك…',
    send: 'إرسال',
    stop: 'إيقاف',
    working: 'يعمل…',
    tool: 'أداة',
    allow: 'سماح',
    skip: 'تخطي',
    allowed: 'تم السماح',
    skipped: 'تم التخطي',
    stopped: 'تم الإيقاف.',
    busy: 'MusabAI ما زال يعمل في هذه المحادثة — أوقفه أو انتظر حتى ينتهي.',
    invalid: 'رابط غير صالح أو منتهي. شغّل «MusabAI: Link a Phone» على اللابتوب وامسح الرمز الجديد.',
    pairTitle: '📱 اربط موبايلك',
    pairScan: 'امسح الرمز بكاميرا الموبايل — لازم الموبايل على نفس شبكة الواي فاي.',
    pairOpen: 'أو افتح هذا الرابط في متصفح الموبايل:',
    pairOnce: 'الرابط يعمل مرة واحدة لموبايل واحد خلال {0} دقائق. لربط موبايل آخر شغّل «MusabAI: Link a Phone» من جديد.',
    pairStop: 'يتوقف الربط تلقائيًا بعد {0} دقيقة بدون موبايل متصل، أو من لوحة الأوامر: «MusabAI: Stop Phone Link».',
    pairPlain: 'الاتصال غير مشفّر: استعمله على شبكتك المنزلية، لا على واي فاي عام.',
  },
  en: {
    connecting: 'Connecting…',
    connected: 'Connected',
    reconnecting: 'Disconnected — retrying…',
    expired: 'This link has ended — scan a new QR code on the laptop.',
    empty: 'No messages yet — type your first request below.',
    placeholder: 'Type your request…',
    send: 'Send',
    stop: 'Stop',
    working: 'Working…',
    tool: 'Tool',
    allow: 'Allow',
    skip: 'Skip',
    allowed: 'Allowed',
    skipped: 'Skipped',
    stopped: 'Stopped.',
    busy: 'MusabAI is still working in this chat — stop it or wait until it finishes.',
    invalid: 'This link is not valid or has expired. Run "MusabAI: Link a Phone" on the laptop and scan the new code.',
    pairTitle: '📱 Link your phone',
    pairScan: 'Scan the code with the phone camera — the phone must be on the same Wi-Fi.',
    pairOpen: 'Or open this link in the phone browser:',
    pairOnce: 'The link works once, for one phone, within {0} minutes. To link another phone, run "MusabAI: Link a Phone" again.',
    pairStop: 'The link stops by itself after {0} minutes without a phone connected, or from the Command Palette: "MusabAI: Stop Phone Link".',
    pairPlain: 'The connection is not encrypted: use it on your home network, not on public Wi-Fi.',
  },
};

export type PhoneLang = keyof typeof STRINGS;
export type PhoneStrings = (typeof STRINGS)['en'];

export function phoneStrings(lang: PhoneLang): PhoneStrings {
  return STRINGS[lang] ?? STRINGS.en;
}

export function fill(text: string, ...values: (string | number)[]): string {
  return values.reduce<string>((out, value, i) => out.replace(`{${i}}`, String(value)), text);
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** The page's Content-Security-Policy: only its own inline script and styles, and the WebSocket back to the laptop. */
export function phoneCsp(nonce: string): string {
  return `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; connect-src 'self' ws: wss:; img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`;
}

export function phonePage(lang: PhoneLang, nonce: string, script: string): string {
  const t = phoneStrings(lang);
  const client = Object.fromEntries(['connecting', 'connected', 'reconnecting', 'expired', 'empty', 'send', 'stop', 'working', 'tool', 'allow', 'skip', 'allowed', 'skipped', 'stopped'].map((k) => [k, t[k as keyof PhoneStrings]]));
  // JSON inside <script type="application/json">: only "</" could end the element early.
  const strings = JSON.stringify(client).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="${lang}" dir="${lang === 'ar' ? 'rtl' : 'ltr'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#181818">
<meta name="referrer" content="no-referrer">
<title>MusabAI</title>
<style>
  :root { color-scheme: dark; --bg:#181818; --panel:#1e1e1e; --line:#2b2b2b; --fg:#e6e6e6; --muted:#9a9a9a; --accent:#2f81f7; --user:#243b53; --danger:#d64545; }
  * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
  html, body { margin:0; height:100%; background:var(--bg); color:var(--fg); font:15px/1.5 -apple-system,"Segoe UI",system-ui,sans-serif; }
  body { display:flex; flex-direction:column; }
  header { display:flex; align-items:center; gap:8px; padding:10px 14px; padding-top:calc(10px + env(safe-area-inset-top)); background:var(--panel); border-bottom:1px solid var(--line); position:sticky; top:0; }
  header .logo { font-weight:700; }
  header .status { color:var(--muted); font-size:13px; }
  header .dot { width:9px; height:9px; border-radius:50%; background:#d64; margin-inline-start:auto; transition:background .3s; }
  header .dot.on { background:#3fb950; }
  #notice { display:none; margin:8px 14px 0; padding:8px 12px; border-radius:10px; background:#3a2f12; color:#f2d48a; font-size:13px; }
  #notice.show { display:block; }
  #log { flex:1; overflow-y:auto; padding:14px; display:flex; flex-direction:column; gap:12px; }
  .item { display:flex; flex-direction:column; gap:6px; }
  .msg { max-width:85%; padding:9px 12px; border-radius:14px; white-space:pre-wrap; overflow-wrap:anywhere; }
  .msg.user { align-self:flex-end; background:var(--user); border-end-end-radius:4px; }
  .msg.bot { align-self:flex-start; background:var(--panel); border:1px solid var(--line); border-end-start-radius:4px; }
  .tool { align-self:flex-start; max-width:85%; font-size:13px; color:var(--muted); padding:2px 12px; overflow-wrap:anywhere; }
  .tool b { color:var(--fg); font-weight:600; }
  .tool.error { color:#f08080; }
  .muted { color:var(--muted); font-size:13px; }
  .approval { align-self:stretch; border:1px solid #6b5a1e; background:#2a2414; border-radius:12px; padding:10px 12px; display:flex; flex-direction:column; gap:8px; }
  .approval-title { font-weight:600; }
  .approval-detail { margin:0; white-space:pre-wrap; overflow-wrap:anywhere; max-height:180px; overflow:auto; background:#141414; border-radius:8px; padding:8px; font:12px/1.4 ui-monospace,monospace; direction:ltr; text-align:start; }
  .approval-actions { display:flex; gap:8px; }
  .approval-actions button { flex:1; padding:10px; }
  .approval-done { align-self:flex-start; font-size:13px; color:var(--muted); padding:0 12px; }
  .empty { margin:auto; color:var(--muted); text-align:center; padding:0 24px; }
  footer { display:flex; gap:8px; padding:10px; padding-bottom:calc(10px + env(safe-area-inset-bottom)); background:var(--panel); border-top:1px solid var(--line); }
  textarea { flex:1; resize:none; background:#2b2b2b; color:var(--fg); border:1px solid var(--line); border-radius:12px; padding:10px 12px; font:inherit; max-height:120px; }
  button { background:var(--accent); color:#fff; border:0; border-radius:12px; padding:0 16px; font:inherit; font-weight:600; }
  button.secondary { background:#3a3a3a; }
  button.stop { background:var(--danger); }
  button:disabled { opacity:.5; }
</style>
</head>
<body>
<header><span class="logo">MusabAI</span><span class="status" id="st">${escapeHtml(t.connecting)}</span><span class="dot" id="dot"></span></header>
<div id="notice" role="status"></div>
<div id="log" role="log"></div>
<footer>
  <textarea id="in" rows="1" dir="auto" placeholder="${escapeHtml(t.placeholder)}"></textarea>
  <button id="send" disabled>${escapeHtml(t.send)}</button>
</footer>
<script type="application/json" id="strings">${strings}</script>
<script nonce="${nonce}">${script.replace(/<\/script/gi, '<\\/script')}</script>
</body>
</html>`;
}

/** The pairing panel in the editor: the QR code of the one-time link, the link itself and how the link ends. */
export function pairingPage(lang: PhoneLang, url: string, qr: string, pairMinutes: number, idleMinutes: number): string {
  const t = phoneStrings(lang);
  return `<!doctype html><html dir="${lang === 'ar' ? 'rtl' : 'ltr'}" lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font-family:var(--vscode-font-family),sans-serif;color:var(--vscode-foreground);text-align:center;padding:24px;line-height:1.7}
.qr{background:#fff;display:inline-block;padding:14px;border-radius:12px;margin:12px 0}.qr svg{display:block;width:240px;height:240px}
.url{direction:ltr;unicode-bidi:plaintext;background:var(--vscode-textCodeBlock-background,#1b1b1b);padding:8px 12px;border-radius:8px;display:inline-block;word-break:break-all;font-family:var(--vscode-editor-font-family),monospace;font-size:12px;margin-top:8px}
h2{margin:0 0 4px}.muted{opacity:.7;font-size:13px}.warn{color:var(--vscode-editorWarning-foreground,#cca700);font-size:13px}</style></head>
<body>
<h2>${escapeHtml(t.pairTitle)}</h2>
<p class="muted">${escapeHtml(t.pairScan)}</p>
<div class="qr">${qr}</div>
<p class="muted">${escapeHtml(t.pairOpen)}</p>
<div class="url">${escapeHtml(url)}</div>
<p class="muted">${escapeHtml(fill(t.pairOnce, pairMinutes))}</p>
<p class="muted">${escapeHtml(fill(t.pairStop, idleMinutes))}</p>
<p class="warn">${escapeHtml(t.pairPlain)}</p>
</body></html>`;
}

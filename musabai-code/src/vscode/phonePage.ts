/* The single-page app served to the phone. It mirrors the editor chat over a WebSocket and sends prompts back.
   The client script is written without backticks or ${} so it can live inside this TS template literal. */
export const PHONE_PAGE = `<!doctype html>
<html lang="ar">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#181818">
<title>MusabAI</title>
<style>
  :root { color-scheme: dark; --bg:#181818; --panel:#1e1e1e; --line:#2b2b2b; --fg:#e6e6e6; --muted:#9a9a9a; --accent:#2f81f7; --user:#243b53; }
  * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
  html, body { margin:0; height:100%; background:var(--bg); color:var(--fg); font:15px/1.5 -apple-system,"Segoe UI",system-ui,sans-serif; }
  body { display:flex; flex-direction:column; }
  header { display:flex; align-items:center; gap:8px; padding:10px 14px; padding-top:calc(10px + env(safe-area-inset-top)); background:var(--panel); border-bottom:1px solid var(--line); position:sticky; top:0; }
  header .logo { font-weight:700; }
  header .dot { width:9px; height:9px; border-radius:50%; background:#d64; margin-inline-start:auto; transition:background .3s; }
  header .dot.on { background:#3fb950; }
  #log { flex:1; overflow-y:auto; padding:14px; display:flex; flex-direction:column; gap:12px; }
  .msg { max-width:85%; padding:9px 12px; border-radius:14px; white-space:pre-wrap; overflow-wrap:anywhere; }
  .msg.user { align-self:flex-end; background:var(--user); border-bottom-right-radius:4px; }
  .msg.bot { align-self:flex-start; background:var(--panel); border:1px solid var(--line); border-bottom-left-radius:4px; }
  .tool { align-self:flex-start; max-width:85%; font-size:13px; color:var(--muted); padding:2px 12px; }
  .tool b { color:var(--fg); font-weight:600; }
  .empty { margin:auto; color:var(--muted); text-align:center; padding:0 24px; }
  footer { display:flex; gap:8px; padding:10px; padding-bottom:calc(10px + env(safe-area-inset-bottom)); background:var(--panel); border-top:1px solid var(--line); }
  textarea { flex:1; resize:none; background:#2b2b2b; color:var(--fg); border:1px solid var(--line); border-radius:12px; padding:10px 12px; font:inherit; max-height:120px; }
  button { background:var(--accent); color:#fff; border:0; border-radius:12px; padding:0 16px; font-weight:600; }
  button:disabled { opacity:.5; }
</style>
</head>
<body>
<header><span class="logo">MusabAI</span><span class="status" id="st">يتصل…</span><span class="dot" id="dot"></span></header>
<div id="log"><div class="empty" id="empty">لا توجد رسائل بعد — اكتب أول طلب في الأسفل.</div></div>
<footer>
  <textarea id="in" rows="1" dir="auto" placeholder="اكتب طلبك…"></textarea>
  <button id="send">إرسال</button>
</footer>
<script>
(function () {
  var params = new URLSearchParams(location.search);
  var token = params.get('t') || '';
  var wsUrl = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/?t=' + encodeURIComponent(token);
  var chat = { messages: [] };
  var ws, backoff = 1000;
  var log = document.getElementById('log');
  var empty = document.getElementById('empty');
  var input = document.getElementById('in');
  var sendBtn = document.getElementById('send');
  var dot = document.getElementById('dot');
  var st = document.getElementById('st');

  function setStatus(connected) {
    dot.className = 'dot' + (connected ? ' on' : '');
    st.textContent = connected ? 'متصل' : 'انقطع — يعيد المحاولة…';
    sendBtn.disabled = !connected;
  }

  function connect() {
    ws = new WebSocket(wsUrl);
    ws.onopen = function () { setStatus(true); backoff = 1000; };
    ws.onclose = function () { setStatus(false); setTimeout(connect, backoff); backoff = Math.min(backoff * 2, 15000); };
    ws.onerror = function () { try { ws.close(); } catch (e) {} };
    ws.onmessage = function (e) { try { handle(JSON.parse(e.data)); } catch (err) {} };
  }

  function handle(m) {
    if (m.type === 'init' || m.type === 'chat') { chat = m.chat || { messages: [] }; render(); }
    else if (m.type === 'chatEvent') { if (reduce(chat, m.event)) render(); }
  }

  function find(id) { for (var i = 0; i < chat.messages.length; i++) if (chat.messages[i].id === id) return chat.messages[i]; }

  // A compact port of the shared reduceChat: enough to show text, tool activity and status on the phone.
  function reduce(c, event) {
    if (event.type === 'user' || event.type === 'assistant') { c.messages.push(event.message); return true; }
    if (event.type === 'truncate') {
      for (var i = 0; i < c.messages.length; i++) if (c.messages[i].id === event.fromMessageId) { c.messages.length = i; return true; }
      return false;
    }
    if (event.type !== 'agent') return false;
    var msg = find(event.messageId); if (!msg) return false;
    msg.parts = msg.parts || [];
    var ev = event.event, last = msg.parts[msg.parts.length - 1];
    if (ev.type === 'text') { if (last && last.kind === 'text') last.text += ev.text; else msg.parts.push({ kind: 'text', text: ev.text }); }
    else if (ev.type === 'tool_start') { msg.parts.push({ kind: 'tool', callId: ev.callId, title: ev.title || ev.name, status: 'running' }); }
    else if (ev.type === 'tool_end') { var t = toolById(msg, ev.callId); if (t) { t.status = ev.ok ? 'done' : 'failed'; t.summary = ev.summary; } }
    else if (ev.type === 'done') { msg.status = ev.reason; msg.error = ev.error; }
    else return false;
    return true;
  }
  function toolById(msg, id) { for (var i = 0; i < msg.parts.length; i++) if (msg.parts[i].callId === id) return msg.parts[i]; }

  function el(cls, text) { var d = document.createElement('div'); d.className = cls; if (text != null) d.textContent = text; return d; }

  function render() {
    var atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 80;
    log.textContent = '';
    if (!chat.messages.length) { log.appendChild(empty); return; }
    for (var i = 0; i < chat.messages.length; i++) {
      var m = chat.messages[i];
      if (m.role === 'user') { var u = el('msg user', m.text || ''); u.dir = 'auto'; log.appendChild(u); continue; }
      var parts = m.parts || [];
      for (var j = 0; j < parts.length; j++) {
        var p = parts[j];
        if (p.kind === 'text' && p.text) { var b = el('msg bot', p.text); b.dir = 'auto'; log.appendChild(b); }
        else if (p.kind === 'tool') {
          var mark = p.status === 'running' ? '⏳' : p.status === 'failed' ? '⚠️' : '✓';
          var tl = el('tool'); tl.innerHTML = ''; var bold = document.createElement('b'); bold.textContent = mark + ' ' + (p.summary || p.title || 'أداة'); tl.appendChild(bold); log.appendChild(tl);
        }
      }
      if (m.status === 'streaming') log.appendChild(el('tool', '⏳ يعمل…'));
      if (m.error) log.appendChild(el('tool', '⚠️ ' + m.error));
    }
    if (atBottom) log.scrollTop = log.scrollHeight;
  }

  function send() {
    var text = input.value.trim();
    if (!text || !ws || ws.readyState !== 1) return;
    ws.send(JSON.stringify({ type: 'send', text: text }));
    input.value = ''; input.style.height = 'auto';
  }
  sendBtn.onclick = send;
  input.addEventListener('input', function () { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 120) + 'px'; });
  input.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
  connect();
})();
</script>
</body>
</html>`;

/* ===== Bright, the AI helper: what lives outside the 3D page =====
   Bright itself is in the book (book-bright.js). Here: the ✨ button in the top bar that calls Bright, voice typing,
   the grown-ups' AI settings behind a small maths gate, and the Android bridges (the phone's voice, the back button,
   saving files). */
Object.assign(ICON,{spark:'<svg viewBox="0 0 24 24"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/></svg>'});
const BrightBar={mount(){const toc=$('#bkToc');if(!toc||$('#bkAsk'))return;const b=document.createElement('button');b.className='ib ai-ib';b.type='button';b.id='bkAsk';b.title='Call Bright';b.setAttribute('aria-label','Call Bright, the star who helps in this book');b.innerHTML=ICON.spark;
  toc.parentNode.insertBefore(b,toc);b.onclick=()=>{Snd.init&&Snd.init();Bright.summon()}}};
/* speech in: the Android app's voice typing, or the browser's own speech recognition where it has one */
const AIVoiceIn={cb:null,
  can(){return !!((window.BookNative&&typeof BookNative.listen==='function')||window.SpeechRecognition||window.webkitSpeechRecognition)},
  /* the language Bright listens in: the last one the child chose (English first) */
  lang(){try{return localStorage.getItem('bs-ask-lang')==='ar'?'ar':'en'}catch(e){return 'en'}},
  /* Arabic: the phone's own Arabic if it has one the recognisers know, else Levantine (Jordan) */
  tag(l){if(l!=='ar')return 'en-GB';const L=[].concat(navigator.languages||[],navigator.language||[]).map(String),a=L.find(x=>/^ar[-_](AE|BH|DZ|EG|IQ|JO|KW|LB|MA|OM|PS|QA|SA|TN|YE)$/i.test(x));return a?a.replace('_','-'):'ar-JO'},
  listen(cb,l){l=l==='ar'||l==='en'?l:this.lang();try{localStorage.setItem('bs-ask-lang',l)}catch(e){}this.l=l;const tag=this.tag(l);this.cb=cb;const mic=$('#aiMic');mic&&mic.classList.add('on');
    if(window.BookNative&&typeof BookNative.listen==='function'){try{BookNative.listen(tag)}catch(e){this.done('')}return}
    const R=window.SpeechRecognition||window.webkitSpeechRecognition;try{const r=new R();r.lang=tag;r.interimResults=false;r.maxAlternatives=1;r.onresult=e=>this.done(e.results[0][0].transcript);r.onerror=()=>this.done('');r.onend=()=>{const m=$('#aiMic');m&&m.classList.remove('on');if(this.cb)this.done('')};r.start()}catch(e){this.done('')}},
  done(t){const mic=$('#aiMic');mic&&mic.classList.remove('on');const cb=this.cb;this.cb=null;if(!t)toast(this.l==='ar'?'لم أسمعك جيدًا. حاول مرة أخرى!':"I didn't hear that. Try again!");cb&&cb(String(t||'').trim())}};
window.__bookHeard=t=>AIVoiceIn.done(t);

/* grown-ups: AI settings behind a small maths gate */
const AISettings={el:null,
  gate(){const a=randi(6,9),b=randi(6,9);this.show(`<h3>For grown-ups</h3><p>Please answer to open the AI settings.</p><p class="ar-note" dir="rtl" lang="ar">للأهل: أجب لفتح إعدادات الذكاء الاصطناعي.</p>
      <form id="aiGate" class="ai-gate"><label><b>${a} × ${b} =</b> <input id="aiGateIn" inputmode="numeric" maxlength="3" autocomplete="off"></label><button class="btn sm hot" type="submit">Open</button></form>`);
    const f=$('#aiGate',this.el);f.onsubmit=e=>{e.preventDefault();if(+$('#aiGateIn',this.el).value===a*b)this.form();else{$('#aiGateIn',this.el).value='';toast('Not quite. Try again.')}};setTimeout(()=>{const i=$('#aiGateIn',this.el);i&&i.focus()},60)},
  show(html){if(!this.el||!document.body.contains(this.el)){const el=document.createElement('div');el.className='ai-set';el.id='aiSettings';el.lang='en';el.dir='ltr';el.setAttribute('role','dialog');(($('#stage'))||document.body).appendChild(el);this.el=el;
      el.addEventListener('pointerdown',e=>e.stopPropagation());el.addEventListener('wheel',e=>e.stopPropagation(),{passive:true});el.addEventListener('keydown',e=>e.stopPropagation())}
    this.el.hidden=false;this.el.innerHTML=`<div class="ai-set-in"><button class="btn sm ghost ai-set-x" type="button" data-x aria-label="Close">✕</button>${html}</div>`;$('[data-x]',this.el).onclick=()=>this.close()},
  close(){if(this.el)this.el.hidden=true},
  isOpen(){return !!(this.el&&!this.el.hidden&&document.body.contains(this.el))},
  form(){const c=BookAI.conf();const opt=s=>`<option value="${s.id}"${c.first===s.id?' selected':''}>${esc(s.name)}</option>`;
    this.show(`<h3>Bright, the AI helper</h3>
      <p class="note">Bright uses the free AI providers of the MusabAI app, in the same order. If one is busy it tries the next one. If none answer, the book answers from its own pages.</p>
      <p class="ar-note" dir="rtl" lang="ar">يستعمل الكتاب مزودات الذكاء الاصطناعي المجانية من تطبيق MusabAI بنفس الترتيب. إذا انشغل مزود ينتقل للتالي، وإذا لم يجب أحد يجيب الكتاب من صفحاته. المفاتيح تبقى على هذا الجهاز فقط.</p>
      <label class="ai-row"><input type="checkbox" id="aiOn"${c.on?' checked':''}> <span>AI helper on</span></label>
      <label class="ai-row"><input type="checkbox" id="aiVoice"${c.voice?' checked':''}> <span>Read answers aloud</span></label>
      <label class="ai-row"><input type="checkbox" id="aiTeach"${c.teach!==false?' checked':''}> <span>Bright teaches each new lesson by itself, on the glowing board</span></label>
      <label class="ai-row"><input type="checkbox" id="aiFast"${c.fast!==false?' checked':''}> <span>Fastest provider first (learns which one answers quickest here)</span></label>
      <label class="ai-row"><input type="checkbox" id="aiLite"${Perf.forced()?' checked':''}> <span>Simpler graphics: smoother on older phones</span></label>
      <label class="ai-field"><span>First choice</span><select id="aiFirst"><option value="auto"${c.first==='auto'?' selected':''}>Automatic (MusabAI order)</option>${AI_SPECS.filter(s=>!s.custom).map(opt).join('')}</select></label>
      <h4>Free keys (optional)</h4><p class="note">Kilo Auto Free and AI Horde need no key. A free key from another provider makes Bright faster and more reliable.</p>
      ${AI_KEYS.map(([k,n])=>{const s=AI_SPECS.find(x=>x.secret===k);return `<label class="ai-field"><span>${esc(n)}${s&&s.site?` <small>${esc(s.site)}</small>`:''}</span><input type="password" data-key="${k}" value="${esc(c.keys[k]||'')}" autocomplete="off" spellcheck="false" placeholder="paste key"></label>`}).join('')}
      <h4>Your own endpoint</h4><p class="note">Any OpenAI-compatible service (https only).</p>
      <label class="ai-field"><span>Base URL</span><input id="aiCB" value="${esc(c.custom.base||'')}" placeholder="https://…/v1" spellcheck="false"></label>
      <label class="ai-field"><span>Model</span><input id="aiCM" value="${esc(c.custom.model||'')}" spellcheck="false"></label>
      <label class="ai-field"><span>Key</span><input id="aiCK" type="password" value="${esc(c.custom.key||'')}" autocomplete="off" spellcheck="false"></label>
      <div class="row"><button class="btn hot" type="button" id="aiSave">Save</button><button class="btn ghost" type="button" id="aiTest">Test the AI</button><button class="btn ghost" type="button" id="aiReset">Reset</button></div>
      <p class="ai-test" id="aiTestOut" aria-live="polite"></p>
      <h4>Providers now</h4><ul class="ai-list" id="aiList"></ul>
      <p class="note">Privacy: Bright sends the text of the page and the question, never the child's name. Free services may keep what is typed. Free tiers have limits, so Bright cannot promise an answer every time.</p>
      <p class="ar-note" dir="rtl" lang="ar">الخصوصية: يرسل الكتاب نص الصفحة والسؤال فقط، ولا يرسل اسم الطفل. الخدمات المجانية قد تحتفظ بما يُكتب ولها حدود استخدام.</p>`);
    const el=this.el;const list=()=>{$('#aiList',el).innerHTML=BookAI.order().filter((s,i,a)=>a.findIndex(x=>x.id===s.id)===i).map(s=>{const st=BookAI.status(s);return `<li><span>${esc(s.name)}</span><i class="st ${st.c}">${esc(st.t)}</i></li>`}).join('')};list();
    const read=()=>{c.on=$('#aiOn',el).checked;c.voice=$('#aiVoice',el).checked;c.fast=$('#aiFast',el).checked;c.teach=$('#aiTeach',el).checked;c.first=$('#aiFirst',el).value;Perf.force($('#aiLite',el).checked);$$('[data-key]',el).forEach(i=>{c.keys[i.dataset.key]=i.value.trim()});c.custom={base:$('#aiCB',el).value.trim(),model:$('#aiCM',el).value.trim(),key:$('#aiCK',el).value.trim()};BookAI.save();list()};
    $('#aiSave',el).onclick=()=>{read();toast('Saved ✓');this.close()};
    $('#aiReset',el).onclick=()=>{BookAI.reset();list();$('#aiTestOut',el).textContent='Provider health cleared.'};
    $('#aiTest',el).onclick=async()=>{read();const out=$('#aiTestOut',el);out.textContent='Testing…';const t0=performance.now();
      try{const r=await BookAI.chat([{role:'system',content:AI_RULES},{role:'user',content:'Say hello to a Year 2 child in one short sentence.'}],{max:60});out.textContent=`✓ ${r.provider.name} answered in ${((performance.now()-t0)/1000).toFixed(1)} s: "${aiCleanOut(r.text).slice(0,120)}"`}
      catch(e){out.textContent='No AI answered right now. The book will answer from its pages. '+(e.errors&&e.errors.length?'('+e.errors.join(' | ').slice(0,300)+')':'')}list()}}
};
/* the Android back button: close what is open, then go back toward the cover, then leave */
window.BookBack=function(){try{if(AISettings.isOpen()){AISettings.close();return true}if(Bright.isOpen()){Bright.close();return true}if(Overlay.open){Overlay.read(false);return true}
  if(App.cur!=='home'){App.go('home');return true}const st=Book.st;if(st&&st.turned>1){st.go(1,'L');return true}if(st&&st.turned===1){st.go(0);return true}}catch(e){}return false};
/* the Android app speaks with the phone's own voice (WebView has no speechSynthesis), and saves files to Downloads */
if(window.BookNative&&typeof BookNative.speak==='function'){const say0=Voice.say.bind(Voice);let tid=0;const ends={};
  window.__bookTtsDone=id=>{const f=ends[id];delete ends[id];if(f)try{f()}catch(e){}};
  Voice.say=function(text,o={}){if(o.auto&&!Snd.on)return;if(!text)return;const id='u'+(++tid);if(o.end)ends[id]=o.end;
    try{BookNative.speak(String(text),o.lang==='ar'?'ar':'en-GB',Number(o.rate||.88),Number(o.pitch||1.05),id)}catch(e){delete ends[id];say0(text,o)}}}
if(window.BookNative&&typeof BookNative.saveFile==='function'){const save0=saveFile;
  saveFile=async function(name,blob){try{const b64=await new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(String(r.result).split(',')[1]||'');r.onerror=rej;r.readAsDataURL(blob)});BookNative.saveFile(String(name),blob.type||'application/octet-stream',b64)}catch(e){return save0(name,blob)}}}
window.__bookSaved=(ok,msg)=>toast(ok?'Saved to Downloads ✓':'Could not save'+(msg?': '+msg:''));
(()=>{const b0=App.book;App.book=function(){const r=b0.apply(this,arguments);AISettings.el=null;BrightBar.mount();BookAI.warm();return r};
  const r0=App.route;App.route=function(){AISettings.close();const ba=$('#brightAsk');if(ba)ba.remove();try{window.BookNative&&BookNative.stop&&BookNative.stop()}catch(e){}return r0.apply(this,arguments)}})();
BookAI.load();

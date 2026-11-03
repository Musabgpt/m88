/* ===== Bright, the AI helper inside the book (what the child and grown-ups see) =====
   "Ask Bright" opens from the ✨ button on every lesson page, the top bar, the "Ask why" button under each 3D model,
   and the quiz page makes endless new questions. A grown-up sets up the AI behind a small maths gate. */
Object.assign(ICON,{spark:'<svg viewBox="0 0 24 24"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/></svg>'});
const AskUI={sp:null,k:0,note:'',busy:false,turns:{},el:null,
  cur(){const st=Book.st;if(!st)return {k:0,sp:null};const k=st.turned;return {k,sp:k>=1&&k<=st.M+1?SPREADS[k-1]:null}},
  mountButton(){const toc=$('#bkToc');if(!toc||$('#bkAsk'))return;const b=document.createElement('button');b.className='ib ai-ib';b.type='button';b.id='bkAsk';b.title='Ask Bright';b.setAttribute('aria-label','Ask Bright, the book helper');b.innerHTML=ICON.spark;
    toc.parentNode.insertBefore(b,toc);b.onclick=()=>{Snd.init&&Snd.init();this.open({})}},
  build(){if(this.el&&document.body.contains(this.el))return this.el;const st=$('#stage')||document.body;const el=document.createElement('div');el.className='ai-panel';el.id='aiPanel';el.hidden=true;el.setAttribute('role','dialog');el.setAttribute('aria-label','Ask Bright');el.lang='en';el.dir='ltr';
    el.innerHTML=`<div class="ai-head"><span class="ai-bot" aria-hidden="true">✨</span><div class="ai-ttl"><b>Ask Bright</b><small id="aiWho">your book helper</small></div><span style="flex:1"></span><button class="btn sm ghost" type="button" id="aiSet" title="For grown-ups" aria-label="Settings for grown-ups">⚙<span class="t"> Grown-ups</span></button><button class="btn sm ghost" type="button" id="aiX" aria-label="Close">✕</button></div>
      <div class="ai-topic" id="aiTopic"></div><div class="ai-log" id="aiLog" aria-live="polite"></div><div class="ai-chips" id="aiChips"></div>
      <form class="ai-form" id="aiForm"><button type="button" class="btn sm ghost ai-mic" id="aiMic" aria-label="Say your question" hidden>🎤</button><input id="aiIn" maxlength="240" placeholder="Type a question…" autocomplete="off" enterkeyhint="send"><button class="btn sm hot" type="submit" id="aiGo">Ask</button></form>
      <p class="ai-note">Bright is an AI helper and can make mistakes. Never type names, addresses or phone numbers. <span dir="rtl" lang="ar">لا تكتب أسماء أو عناوين أو أرقام هواتف.</span></p>`;
    st.appendChild(el);this.el=el;$('#aiX',el).onclick=()=>this.close();$('#aiSet',el).onclick=()=>AISettings.gate();
    $('#aiForm',el).onsubmit=e=>{e.preventDefault();const v=$('#aiIn',el).value;$('#aiIn',el).value='';this.send(null,v)};
    const mic=$('#aiMic',el);mic.hidden=!AIVoiceIn.can();mic.onclick=()=>AIVoiceIn.listen(t=>{if(t)this.send(null,t)});
    el.addEventListener('pointerdown',e=>e.stopPropagation());el.addEventListener('wheel',e=>e.stopPropagation(),{passive:true});el.addEventListener('keydown',e=>e.stopPropagation());return el},
  open(o){const el=this.build();const c=this.cur();this.sp=o.sp||c.sp;this.k=o.sp?SPREADS.indexOf(o.sp)+1:c.k;this.note=o.note||'';Overlay.read&&Overlay.open&&Overlay.read(false);
    el.hidden=false;$('#bkAsk')&&$('#bkAsk').classList.add('on');this.render();if(o.task)this.send(o.task);else setTimeout(()=>{if(window.matchMedia&&matchMedia('(pointer:fine)').matches)$('#aiIn',el).focus()},50)},
  close(){if(this.el)this.el.hidden=true;$('#bkAsk')&&$('#bkAsk').classList.remove('on')},
  isOpen(){return !!(this.el&&!this.el.hidden&&document.body.contains(this.el))},
  render(){const el=this.el,sp=this.sp;const w=sp&&sp.w?WB[sp.w]:null;
    $('#aiTopic',el).innerHTML=w?`<span>${w.icon}</span> <b>${esc(w.en)}</b> <small>${esc(CH[w.d].enName)}</small>`:'<b>My 3D learning book</b> <small>open a topic and ask me about it</small>';
    const tasks=sp&&sp.w?['explain','example','fact','story','quiz',...(this.note?['why']:[]),'parents']:['fact','story'];
    $('#aiChips',el).innerHTML=tasks.map(t=>`<button class="chip${AI_TASKS[t].ar?' ar':''}" type="button" data-t="${t}"${AI_TASKS[t].ar?' dir="rtl" lang="ar"':''}>${esc(AI_TASKS[t].label)}</button>`).join('');
    $$('[data-t]',el).forEach(b=>b.onclick=()=>this.send(b.dataset.t));
    const log=$('#aiLog',el);log.innerHTML='';const hist=this.turns[this.k]||[];
    if(!hist.length)this.bubble('bot',w?`Hi! I'm Bright ✨ Ask me anything about ${w.en}, or tap a button below.`:"Hi! I'm Bright ✨ Ask me about the book!",{src:'',quiet:true});
    hist.forEach(t=>this.bubble(t.role==='user'?'me':'bot',t.show||t.content,{src:t.src,ar:t.ar,quiet:true}));this.who()},
  who(){const w=$('#aiWho',this.el);if(!w)return;const l=BookAI.last;w.textContent=!BookAI.enabled()?'AI is off: answers come from the book':l?'last answer: '+l.name:'free AI with a book back-up'},
  bubble(kind,text,o={}){const log=$('#aiLog',this.el);const d=document.createElement('div');d.className='ai-b '+kind+(o.thinking?' thinking':'');if(o.ar){d.dir='rtl';d.lang='ar'}
    const p=document.createElement('p');p.textContent=text;d.appendChild(p);
    if(kind==='bot'&&!o.thinking&&text){const f=document.createElement('div');f.className='ai-meta';if(o.src)f.append(o.src==='book'?'📖 from the book':'✨ '+o.src);const say=document.createElement('button');say.type='button';say.className='ai-say';say.textContent='🔊';say.setAttribute('aria-label','Read it aloud');say.onclick=()=>Voice.say(text,{lang:o.ar?'ar':'en'});f.appendChild(say);d.appendChild(f)}
    log.appendChild(d);log.scrollTop=log.scrollHeight;return d},
  fill(d,text,o){d.classList.remove('thinking');d.innerHTML='';const p=document.createElement('p');p.textContent=text;d.appendChild(p);if(o.ar){d.dir='rtl';d.lang='ar'}
    const f=document.createElement('div');f.className='ai-meta';f.append(o.src==='book'?'📖 from the book'+(o.off?' (AI is resting)':''):'✨ '+o.src);const say=document.createElement('button');say.type='button';say.className='ai-say';say.textContent='🔊';say.setAttribute('aria-label','Read it aloud');say.onclick=()=>Voice.say(text,{lang:o.ar?'ar':'en'});f.appendChild(say);d.appendChild(f);
    const log=$('#aiLog',this.el);log.scrollTop=log.scrollHeight},
  hist(){return (this.turns[this.k]||[]).slice(-6).map(t=>({role:t.role,content:t.content}))},
  remember(role,content,o={}){const h=this.turns[this.k]||(this.turns[this.k]=[]);h.push({role,content,show:o.show,src:o.src,ar:o.ar});if(h.length>12)h.splice(0,h.length-12)},
  async send(task,text){if(this.busy)return;const sp=this.sp,T=task?AI_TASKS[task]:null;const ask=T?T.ask:aiCleanIn(text);if(!ask)return;const ar=!!(T&&T.ar);
    this.bubble('me',ask,{ar});
    if(!T){const chk=AIOffline.check(ask);if(chk){this.remember('user',ask);this.bubble('bot',chk,{src:'book'});this.remember('assistant',chk,{src:'book'});return}
      if(AI_BAD.test(ask)){const m="That's a question for a grown-up. Shall we look at this page together instead? 😊";this.bubble('bot',m,{src:'book'});return}}
    const d=this.bubble('bot','Bright is thinking…',{thinking:true});this.busy=true;$('#aiGo',this.el).disabled=true;
    const extra=this.note&&(task==='why'||!T)?'What the child just saw in the 3D model: '+this.note:'';
    const msgs=[{role:'system',content:AI_RULES+'\n\nThis page:\n'+aiPageContext(sp,extra)},...this.hist(),{role:'user',content:T?T.p:`The child says: "${ask}". Reply to them.`}];
    let out,src,off=false;
    try{if(!BookAI.enabled())throw new AIError('off',0,'',null,'off');const r=await BookAI.chat(msgs,{max:T&&T.max||320});out=aiCleanOut(r.text,ar);src=r.provider.name}
    catch(e){out=AIOffline.answer(task||'free',sp,{note:this.note});src='book';off=BookAI.enabled()}
    finally{this.busy=false;const g=$('#aiGo',this.el);if(g)g.disabled=false}
    if(!this.isOpen())return;this.fill(d,out,{src,ar,off});this.remember('user',ask,{ar});this.remember('assistant',out,{src,ar});this.who();
    if(BookAI.conf().voice)Voice.say(out,{lang:ar?'ar':'en'})}
};
/* speech in: the Android app's voice typing, or the browser's own speech recognition where it has one */
const AIVoiceIn={cb:null,
  can(){return !!((window.BookNative&&typeof BookNative.listen==='function')||window.SpeechRecognition||window.webkitSpeechRecognition)},
  listen(cb){this.cb=cb;const mic=$('#aiMic');mic&&mic.classList.add('on');
    if(window.BookNative&&typeof BookNative.listen==='function'){try{BookNative.listen('en-GB')}catch(e){this.done('')}return}
    const R=window.SpeechRecognition||window.webkitSpeechRecognition;try{const r=new R();r.lang='en-GB';r.interimResults=false;r.maxAlternatives=1;r.onresult=e=>this.done(e.results[0][0].transcript);r.onerror=()=>this.done('');r.onend=()=>{const m=$('#aiMic');m&&m.classList.remove('on')};r.start()}catch(e){this.done('')}},
  done(t){const mic=$('#aiMic');mic&&mic.classList.remove('on');const cb=this.cb;this.cb=null;if(!t)toast("I didn't hear that. Try again!");cb&&cb(String(t||'').trim())}};
window.__bookHeard=t=>AIVoiceIn.done(t);

/* grown-ups: AI settings behind a small maths gate */
const AISettings={el:null,
  gate(){const a=randi(6,9),b=randi(6,9);this.show(`<h3>For grown-ups</h3><p>Please answer to open the AI settings.</p><p class="ar-note" dir="rtl" lang="ar">للأهل: أجب لفتح إعدادات الذكاء الاصطناعي.</p>
      <form id="aiGate" class="ai-gate"><label><b>${a} × ${b} =</b> <input id="aiGateIn" inputmode="numeric" maxlength="3" autocomplete="off"></label><button class="btn sm hot" type="submit">Open</button></form>`);
    const f=$('#aiGate',this.el);f.onsubmit=e=>{e.preventDefault();if(+$('#aiGateIn',this.el).value===a*b)this.form();else{$('#aiGateIn',this.el).value='';toast('Not quite. Try again.')}};setTimeout(()=>{const i=$('#aiGateIn',this.el);i&&i.focus()},60)},
  show(html){if(!this.el||!document.body.contains(this.el)){const el=document.createElement('div');el.className='ai-set';el.id='aiSettings';el.lang='en';el.dir='ltr';el.setAttribute('role','dialog');(($('#stage'))||document.body).appendChild(el);this.el=el;
      el.addEventListener('pointerdown',e=>e.stopPropagation());el.addEventListener('wheel',e=>e.stopPropagation(),{passive:true});el.addEventListener('keydown',e=>e.stopPropagation())}
    this.el.hidden=false;this.el.innerHTML=`<div class="ai-set-in"><button class="btn sm ghost ai-set-x" type="button" data-x aria-label="Close">✕</button>${html}</div>`;$('[data-x]',this.el).onclick=()=>this.close()},
  close(){if(this.el)this.el.hidden=true;AskUI.isOpen()&&AskUI.who()},
  isOpen(){return !!(this.el&&!this.el.hidden&&document.body.contains(this.el))},
  form(){const c=BookAI.conf();const opt=s=>`<option value="${s.id}"${c.first===s.id?' selected':''}>${esc(s.name)}</option>`;
    this.show(`<h3>Bright, the AI helper</h3>
      <p class="note">Bright uses the free AI providers of the MusabAI app, in the same order. If one is busy it tries the next one. If none answer, the book answers from its own pages.</p>
      <p class="ar-note" dir="rtl" lang="ar">يستعمل الكتاب مزودات الذكاء الاصطناعي المجانية من تطبيق MusabAI بنفس الترتيب. إذا انشغل مزود ينتقل للتالي، وإذا لم يجب أحد يجيب الكتاب من صفحاته. المفاتيح تبقى على هذا الجهاز فقط.</p>
      <label class="ai-row"><input type="checkbox" id="aiOn"${c.on?' checked':''}> <span>AI helper on</span></label>
      <label class="ai-row"><input type="checkbox" id="aiVoice"${c.voice?' checked':''}> <span>Read answers aloud</span></label>
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
    const read=()=>{c.on=$('#aiOn',el).checked;c.voice=$('#aiVoice',el).checked;c.first=$('#aiFirst',el).value;$$('[data-key]',el).forEach(i=>{c.keys[i.dataset.key]=i.value.trim()});c.custom={base:$('#aiCB',el).value.trim(),model:$('#aiCM',el).value.trim(),key:$('#aiCK',el).value.trim()};BookAI.save();list()};
    $('#aiSave',el).onclick=()=>{read();toast('Saved ✓');this.close()};
    $('#aiReset',el).onclick=()=>{BookAI.reset();list();$('#aiTestOut',el).textContent='Provider health cleared.'};
    $('#aiTest',el).onclick=async()=>{read();const out=$('#aiTestOut',el);out.textContent='Testing…';const t0=performance.now();
      try{const r=await BookAI.chat([{role:'system',content:AI_RULES},{role:'user',content:'Say hello to a Year 2 child in one short sentence.'}],{max:60});out.textContent=`✓ ${r.provider.name} answered in ${((performance.now()-t0)/1000).toFixed(1)} s: "${aiCleanOut(r.text).slice(0,120)}"`}
      catch(e){out.textContent='No AI answered right now. The book will answer from its pages. '+(e.errors&&e.errors.length?'('+e.errors.join(' | ').slice(0,300)+')':'')}list()}}
};
/* the Android back button: close what is open, then go back toward the cover, then leave */
window.BookBack=function(){try{if(AISettings.isOpen()){AISettings.close();return true}if(AskUI.isOpen()){AskUI.close();return true}if(Overlay.open){Overlay.read(false);return true}
  if(App.cur!=='home'){App.go('home');return true}const st=Book.st;if(st&&st.turned>1){st.go(1,'L');return true}if(st&&st.turned===1){st.go(0);return true}}catch(e){}return false};
/* the Android app speaks with the phone's own voice (WebView has no speechSynthesis), and saves files to Downloads */
if(window.BookNative&&typeof BookNative.speak==='function'){const say0=Voice.say.bind(Voice);let tid=0;const ends={};
  window.__bookTtsDone=id=>{const f=ends[id];delete ends[id];if(f)try{f()}catch(e){}};
  Voice.say=function(text,o={}){if(o.auto&&!Snd.on)return;if(!text)return;const id='u'+(++tid);if(o.end)ends[id]=o.end;
    try{BookNative.speak(String(text),o.lang==='ar'?'ar':'en-GB',Number(o.rate||.88),Number(o.pitch||1.05),id)}catch(e){delete ends[id];say0(text,o)}}}
if(window.BookNative&&typeof BookNative.saveFile==='function'){const save0=saveFile;
  saveFile=async function(name,blob){try{const b64=await new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(String(r.result).split(',')[1]||'');r.onerror=rej;r.readAsDataURL(blob)});BookNative.saveFile(String(name),blob.type||'application/octet-stream',b64)}catch(e){return save0(name,blob)}}}
window.__bookSaved=(ok,msg)=>toast(ok?'Saved to Downloads ✓':'Could not save'+(msg?': '+msg:''));
(()=>{const b0=App.book;App.book=function(){const r=b0.apply(this,arguments);AskUI.el=null;AISettings.el=null;AskUI.mountButton();return r};
  const r0=App.route;App.route=function(){AskUI.close();AISettings.close();try{window.BookNative&&BookNative.stop&&BookNative.stop()}catch(e){}return r0.apply(this,arguments)}})();
BookAI.load();

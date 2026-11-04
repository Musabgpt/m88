/* ---------- the book becomes the home view; the old island stays at #island ---------- */
Object.assign(ICON,{
  toc:'<svg viewBox="0 0 24 24"><path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/></svg>',
  text:'<svg viewBox="0 0 24 24"><path d="M5 3h10l4 4v14H5z"/><path d="M14 3v5h5M8 12h8M8 16h8"/></svg>',
  speak:'<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16 9a4 4 0 0 1 0 6"/></svg>',
  left:'<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
  right:'<svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>'
});
App.book=function(){
  const from=this.cur;this.cur='home';Hub.focused=null;bookSpreads();
  document.documentElement.dir='ltr';document.documentElement.lang='en';
  const v=$('#view');
  v.innerHTML=`<section class="bookview" lang="en" dir="ltr"><div class="stage" id="stage">
      <div class="ovl"><div class="ov-top"><div class="wtitle" id="bkTitle"><b>BrightSteps 3D</b><span>Year 2 · Autumn 2</span></div><span class="sp" style="flex:1"></span><span class="bk-pg num" id="bkPg"></span>
        <button class="ib" type="button" id="bkToc" aria-label="Contents" title="Contents">${ICON.toc}</button><button class="ib" type="button" id="bkRead" aria-label="Read this page as plain text" title="Text">${ICON.text}</button><button class="ib" type="button" id="bkSay" aria-label="Read the page aloud" title="Read aloud">${ICON.speak}</button><button class="ib" type="button" id="recenter" aria-label="Reset the view" title="Reset the view">${ICON.cam}</button></div>
      <div class="ov-free" id="ovfree"></div></div>
      <button class="bk-nav prev" id="bkPrev" type="button" aria-label="Previous page">${ICON.left}</button><button class="bk-nav next" id="bkNext" type="button" aria-label="Next page">${ICON.right}</button>
      <div class="bk-read" id="bkReadPanel" hidden></div><div class="sr-only" id="bkLive" aria-live="polite"></div></div></section>`;
  E.mount($('#stage'));
  if(!E.ok){App.bookFlat();return}
  const bd=BookData();let start=0,focus=null;if(WB[from]){start=spreadOf(from)||0;focus='R'}else if(from==='parent'||from==='island')start=bd.last||0;
  if(BOOK_WANT){const k=spreadOf(BOOK_WANT.w,BOOK_WANT.kind);if(k>0){start=k;focus='R'}BOOK_WANT=null}
  E.enter(Book,{start,focus});
  const st=()=>Book.st;
  $('#bkNext').onclick=()=>{Snd.init();st()&&st().next()};$('#bkPrev').onclick=()=>{Snd.init();st()&&st().prev()};
  $('#bkToc').onclick=()=>{const s=st();if(!s)return;Overlay.read(false);s.go(1,'L')};
  $('#bkRead').onclick=()=>Overlay.read(!Overlay.open);
  $('#bkSay').onclick=()=>{const s=st();if(!s)return;const k=s.turned;const sp=k>=1&&k<=s.M+1?SPREADS[k-1]:null;if(!sp){Voice.say('BrightSteps 3D. My Year 2 learning book. Tap the cover to open it.');return}
    if(sp.kind==='learn'){if(Bright.readAloud())return;const L=sp.c.learn||{};Voice.say(WB[sp.w].en+'. '+(L.body||[]).map(p=>p.replace(/^EX:/,'')).join(' '))}
    else if(sp.kind==='practise'){const g=sp.c.practise||{};Voice.say((g.title||'')+'. '+(g.how||''))}
    else if(sp.kind==='intro')Voice.say('How to use this book. '+BOOK_HOWTO.map(h=>h[0]).join(' '));else Voice.say("Parents' corner. "+BOOK_PARENTS().map(h=>h[0]).join(' '))};
  $('#recenter').onclick=()=>{const s=st();s&&s.aim(.8)};
  Overlay.sync();
};
/* no WebGL: the same book as a scroll of pages */
App.bookFlat=function(){bookSpreads();const v=$('#stage');v.style.height='auto';v.innerHTML=`<div class="wrap" dir="ltr" lang="en"><div class="bk-flat">${SPREADS.map(sp=>`<div class="card" style="background:#fbf4e2;color:#2d2219"><div class="bk-read" style="position:static;box-shadow:none;border-radius:14px;max-height:none">${Overlay.html(sp)}</div></div>`).join('')}</div></div>`;
  $$('[data-href]',v).forEach(b=>b.onclick=()=>App.go(b.dataset.href));$$('[data-reveal]',v).forEach(b=>b.onclick=()=>{const a=b.parentElement.querySelector('.ans');if(a)a.hidden=false;b.remove()});$$('[data-goto]',v).forEach(b=>b.remove());$$('[data-aiset]',v).forEach(b=>b.onclick=()=>AISettings.gate())};
if(document.fonts&&document.fonts.addEventListener)document.fonts.addEventListener('loadingdone',e=>{const s=Book.st;if(!s||!s.repaintAll)return;const ff=(e&&e.fontfaces)||[];s.repaintAll(ff.length>0&&ff.every(f=>/^\s*U\+0?6/i.test(String(f.unicodeRange||''))))});

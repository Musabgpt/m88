/* ---------- the book becomes the home view; the old island stays at #island ---------- */
Object.assign(ICON,{
  toc:'<svg viewBox="0 0 24 24"><path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/></svg>',
  text:'<svg viewBox="0 0 24 24"><path d="M5 3h10l4 4v14H5z"/><path d="M14 3v5h5M8 12h8M8 16h8"/></svg>',
  speak:'<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16 9a4 4 0 0 1 0 6"/></svg>',
  left:'<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
  right:'<svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>'
});
PAGES._intro={capAr:'اقرأ كيف تستعمل الكتاب، ثم اختر عالماً من الفهرس.',chips:()=>[{label:'▶ ابدأ بأول عالم',cls:'go',fn:()=>Book.st&&Book.st.go(2)},{label:'🏝️ الجزيرة ثلاثية الأبعاد',fn:()=>App.go('island')},{label:'👪 لوحة ولي الأمر',fn:()=>App.go('parent')}]};
App.book=function(){
  const from=this.cur;this.cur='home';Hub.focused=null;bookSpreads();
  const v=$('#view');
  v.innerHTML=`<section class="bookview"><div class="stage" id="stage">
      <div class="ovl"><div class="ov-top"><div class="wtitle" id="bkTitle"><b>BrightSteps 3D</b><span class="en">Year 2 · Autumn 2</span></div><span class="sp" style="flex:1"></span><span class="bk-pg num" id="bkPg"></span>
        <button class="ib" type="button" id="bkToc" aria-label="الفهرس" title="الفهرس">${ICON.toc}</button><button class="ib" type="button" id="bkRead" aria-label="اقرأ نص الصفحة" title="نص الصفحة">${ICON.text}</button><button class="ib" type="button" id="bkSay" aria-label="اقرأ الصفحة بصوت" title="اقرأ لي">${ICON.speak}</button><button class="ib" type="button" id="recenter" aria-label="إعادة ضبط الكاميرا" title="إعادة ضبط الكاميرا">${ICON.cam}</button></div>
      <div class="ov-free" id="ovfree"></div><div class="ov-cap"><div class="cap" id="cap"></div></div><div class="ov-bar" id="bar"></div></div>
      <button class="bk-nav next" id="bkNext" type="button" aria-label="الصفحة التالية">${ICON.left}</button><button class="bk-nav prev" id="bkPrev" type="button" aria-label="الصفحة السابقة">${ICON.right}</button>
      <div class="bk-read" id="bkReadPanel" hidden></div><div class="sr-only" id="bkLive" aria-live="polite"></div></div></section>`;
  E.mount($('#stage'));
  if(!E.ok){App.bookFlat();return}
  const bd=BookData();let start=0;if(WB[from])start=spreadOf(from)||0;else if(from==='parent'||from==='island')start=bd.last||0;
  E.enter(Book,{start});
  const st=()=>Book.st;
  $('#bkNext').onclick=()=>{Snd.init();st()&&st().next()};$('#bkPrev').onclick=()=>{Snd.init();st()&&st().prev()};
  $('#bkToc').onclick=()=>{const s=st();if(!s)return;Overlay.read(false);if(s.turned===1){s.focus='L';s.aim(.6);Overlay.sync()}else s.go(1).then(()=>{if(s.single()){s.focus='L';s.aim(.6);Overlay.sync()}})};
  $('#bkRead').onclick=()=>Overlay.read(!Overlay.open);
  $('#bkSay').onclick=()=>{const s=st();if(!s)return;const k=s.turned;const sp=k>=1&&k<=s.M+1?SPREADS[k-1]:null;if(!sp){Voice.say('BrightSteps 3D Book. Year 2, Autumn 2.');return}
    if(sp.w){const w=WB[sp.w];Voice.say(w.ar+'. '+bodyTxt(sp),{lang:'ar',rate:.95})}else Voice.say(sp.kind==='intro'?BOOK_HOWTO.join(' '):BOOK_PARENTS().join(' '),{lang:'ar',rate:.95})};
  $('#recenter').onclick=()=>{const s=st();s&&s.aim(.8)};
  Overlay.sync();
};
/* no WebGL: the same book as a scroll of pages */
App.bookFlat=function(){bookSpreads();const v=$('#stage');v.style.height='auto';v.innerHTML=`<div class="wrap"><div class="bk-flat">${SPREADS.map(sp=>`<div class="card" style="background:#fbf4e2;color:#2d2219"><div class="bk-read" style="position:static;box-shadow:none;border-radius:14px;max-height:none">${Overlay.html(sp).replace(/data-reveal/,'data-r')}</div></div>`).join('')}</div></div>`;
  $$('[data-href]',v).forEach(b=>b.onclick=()=>App.go(b.dataset.href));$$('.ans',v).forEach(a=>a.hidden=false);$$('[data-r],[data-goto]',v).forEach(b=>b.remove())};
if(document.fonts&&document.fonts.addEventListener)document.fonts.addEventListener('loadingdone',()=>{const s=Book.st;if(s&&s.repaintAll)s.repaintAll()});

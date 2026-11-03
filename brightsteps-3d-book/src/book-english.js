/* ===== English first: the 3D island and the extra 3D worlds =====
   These screens came from the Arabic version of the app. Everything a child reads or presses
   (buttons, messages, quizzes, tabs) is now English. Arabic stays as short notes, and the long
   Arabic guides for grown-ups are folded away under "للأهل". */
const EN_UI={
  // buttons under the 3D stages
  'أشعة X':'X-ray','أصدقاء العشرة':'Number bonds to 10','أضف قلباً 💗':'Add a heart 💗','ألعاب نارية':'Fireworks','أنماط':'Patterns',
  'أي نغمة أعلى؟':'Which note is higher?','اخفِ القائمة':'Hide the list','ادفع السيارة ▶':'Push the car ▶','استكشف':'Explore',
  'اصطد الكلمة':'Catch the word','اطوِ على خط خاطئ':'Fold on a wrong line','اطوِ ✓':'Fold ✓','افتح كشبكة':'Open into a net',
  'اقرأ لي':'Read to me','الأوجه':'Faces','البيت والشارع':'Home and street','التحدي البرونزي':'Bronze challenge',
  'الجزيرة كاملة':'Whole island','الحواف':'Edges','الرؤوس':'Vertices','الصف الأوسط (home row)':'Home row',
  'الصف العلوي (top row)':'Top row','العدد المفقود':'Missing number','العزف الحر':'Free play','العشرة التالية':'Next ten',
  'الفواصل ,':'Commas ,','القيم الثماني':'Our 8 values','المجرّة':'Galaxy','المستوى التالي':'Next level',
  'المستوى السابق':'Previous level','المكتبة':'Library','النبض الثابت':'Steady beat','اليوميات':'Diary',
  'انظر-قل-غطِّ-اكتب':'Look · Say · Cover · Write','بعد الحريق 🧱':'After the fire 🧱','تتدحرج أم تنزلق؟':'Roll or slide?',
  'جمباز: سلسلة':'Gym: sequence','جمع +':'Add +','حروف بصوتين':'Letters with two sounds','خطوط التناظر':'Lines of symmetry',
  'صنّف':'Sort','طرح −':'Subtract −','طريق بمطبّات':'Bumpy road','عائلة الأعداد':'Fact family','عدّ الأضلاع':'Count the sides',
  'عدّ الزوايا':'Count the corners','فكّك 💥':'Take it apart 💥','قارئ البرق':'Lightning reader','قطّاعة الكلمات':'Word chopper',
  'قلها 🔊':'Say it 🔊','كتابان':'Two books','لحّن 🎼':'Compose 🎼','لعبة التصويب 🎯':'Target game 🎯',
  'لماذا انتشرت؟':'Why did it spread?','محاور غير متوازية':'Axles not parallel','من البداية':'Start again','من الحياة':'Real things',
  'نرد الأسئلة':'Question dice','يد الأمان ✋':'Safety hand ✋','▶ شغّل الأيام الخمسة':'▶ Play the five days',
  '☂ تحدّي المظلّة':'☂ Umbrella challenge','🎲 ارمِ النرد':'🎲 Roll the dice','💧 الاختبار':'💧 The test',
  '🕵️ محقق الكتيّب':'🕵️ Booklet detective','🧀 يوميات بيبس':"🧀 Pepys's diary",
  // stars and messages
  'رائع!':'Great!','أضفت كتاباً':'Book added','أكملت الجمل':'Sentences finished','أنهيت التحدي':'Quiz finished','أول قلب':'First heart',
  'انظر-قل-غطِّ-اكتب-تحقق':'Look · Say · Cover · Write · Check','بطل الحساب':'Maths hero','بطل اللطف':'Kindness hero',
  'بطل المطبّات':'Bumpy road champion','جامع القيم':'Values collector','خبير الأسباب والنتائج':'Cause and effect expert',
  'خبير الأمان':'Safety expert','خوارزمية الشطيرة':'Sandwich algorithm','رامٍ دقيق':'Great aim','سائق القطار':'Train driver',
  'شاهدت التبديل':'You watched the exchange','شاهدت الحريق':'You watched the fire','صانع الأنماط':'Pattern maker',
  'صيّاد الكلمات':'Word catcher','صيّاد المواد':'Materials hunter','ضاغط الكلمات':'Word squasher','طاوي الأشكال':'Shape folder',
  'عالِم الماء':'Water scientist','عالِم المواد':'Materials scientist','عدّاد الأوجه':'Face counter','فاتح الشبكات':'Net opener',
  'قارئ معبّر':'Expressive reader','قرأت الشرح':'You read the lesson','قلب متعاطف':'Caring heart','قلب ممتنّ':'Thankful heart',
  'كاتب يوميات':'Diary writer','لاعب جمباز':'Gymnast','مؤرّخ صغير':'Young historian','مبرمج صغير':'Young coder',
  'محقق الأخطاء':'Mistake detective','محقق العدد المفقود':'Missing number detective','محقق النغمات':'Pitch detective',
  'مختبر التدحرج':'Rolling lab','مصمّم المظلّة':'Umbrella designer','مصنّف الأشكال':'Shape sorter','مطابقة الأصوات':'Sound matching',
  'ملحّن صغير':'Young composer','ملصق الأشكال':'Shapes poster','ملك النرد':'Dice champion','مهندس السيارات':'Car engineer',
  'نبض ثابت':'Steady beat','نجم الفواصل':'Comma star','نجوم العقعق':'Magpie stars','واصف ماهر':'Super describer','يد الأمان':'Safety hand',
  'بطل الصف الأوسط':'Home row hero','بطل الصف العلوي':'Top row hero',
  'أحسنت! 🎉':'Well done! 🎉','أمسكت الخطأ! 🕵️':'You caught the mistake! 🕵️','الخوارزمية نجحت! 🎉':'Your algorithm worked! 🎉',
  'صحيح!':'Correct!','كتبتها صحيحة! ✓':'You spelt it right! ✓','متوازن! ⚖️':'Balanced! ⚖️',
  '🏆 بطل اللطف! امتلأت الجرّة':'🏆 Kindness hero! The jar is full','🥉 أكملت التحدي البرونزي!':'🥉 Bronze challenge complete!',
  '10 أسطر كحد أقصى':'10 lines at most','اكتب اسم الكتاب أولاً':'Write the name of the book first','تم الحفظ ✓':'Saved ✓',
  'تم المسح':'Cleared','تم حفظ الاسم':'Name saved','حُفظت':'Saved','وضع الشرح: ارسم فوق أي شيء بإصبعك':'Pen on: draw on anything with your finger',
  // panels on the 3D stages
  'سرعة البرق! ⚡':'Lightning fast! ⚡','ممتاز، كرّرها لتصبح أسرع.':'Great! Do it again to get even faster.','صغيرة':'Small','وسط':'Medium',
  'كبيرة':'Big','ابنِ':'Build','ارمِ 🎯':'Throw 🎯','اضغطها! 🗜':'Squash it! 🗜','اقرأ':'Read','الأولى ⬆':'First ⬆','الثانية ⬆':'Second ⬆',
  'الخطوة التالية ▶':'Next step ▶','العب مجدداً':'Play again','بطيء':'Slow','بين المحورين':'Axle gap','حجم العجلة':'Wheel size',
  'سريع':'Fast','كلمة أخرى ←':'Another word →','ما الشكل التالي في النمط؟':'What shape comes next in the pattern?',
  'ماذا فعلت من لطف اليوم؟':'What kind thing did you do today?','متوسط':'Medium','مرة أخرى':'Again','مسح':'Clear','من جديد':'Start again',
  '↘ أمِل الطاولة':'↘ Tilt the table','↺ لم يقرأها':'↺ Not yet','▶ نفّذ السلسلة':'▶ Do the sequence','✂ قطّع':'✂ Chop','✓ قرأها':'✓ I read it',
  '🎲 ارمِ مرة أخرى':'🎲 Roll again','🔊 أعد الكلمة':'🔊 Hear it again','إغلاق':'Close','💧 اختبر':'💧 Test it','ممتاز':'Excellent',
  'تدرّب أكثر':'Keep practising','رامٍ ماهر 🎯':'Great aim 🎯','حاول أن تصل إلى 20.':'Try to get to 20.',
  'اضغط الحركات في الشريط بالأسفل لتبني سلسلتك (3–4 حركات)':'Tap the moves in the bar below to build your sequence (3–4 moves).',
  'برنامجك فارغ — أضف أسهماً':'Your program is empty. Add some arrows.','قلها بصوت عالٍ وتهجَّ حروفها.':'Say it out loud and spell it.',
  'غطّيناها! الآن اكتبها من ذاكرتك.':'Covered! Now write it from memory.','اختر صفتين…':'Choose two describing words…',
  'انظر جيداً إلى الكلمة:':'Look carefully at the word:','جرّب مرة أخرى، أو اضغط "أرني بالمكعبات".':'Try again, or press "Show me with cubes".',
  'يقرأ المساعد… Thinking…':'Thinking…'
};
Object.assign(EN_UI,{'يمتص':'Absorbs','مقاوم':'Waterproof'});
(()=>{try{MOVES.forEach(m=>EN_UI[m[1]]=m[2]);DISTRICTS.forEach(d=>EN_UI[d.ar]=d.en);ACTS.forEach(a=>EN_UI[a[1]]=a[2]);KIND.forEach(k=>EN_UI[k[1]]=k[0]);FIRE_DAYS.forEach(f=>EN_UI[f.ar]=f.d)}catch(e){console.warn(e)}})();
const EN_RX=[[/^(\d+) صحيحة من (\d+)$/,'$1 right out of $2'],[/^(\d+) نقاط · (\d+)\/(\d+)$/,'$1 points · $2/$3'],[/^سماكة القلم: (.*)$/,'Pen size: $1']];
/* translate one short UI string; anything unknown is returned unchanged */
function enT(s){
  if(typeof s!=='string'||!/[؀-ۿ]/.test(s))return s;const k=s.trim();
  if(EN_UI[k]!=null)return s.replace(k,EN_UI[k]);
  const st=k.match(/^(.*?)( \+\d+ ★)$/);if(st){const t=enT(st[1]);if(t!==st[1])return t+st[2]}
  for(const [rx,to] of EN_RX)if(rx.test(k))return s.replace(k,k.replace(rx,to));
  return s;
}
let BOOK_WANT=null;
const cap1=s=>s?s[0].toUpperCase()+s.slice(1):s;
const WorldEN={
  obs:null,
  /* swap known Arabic words to English as the 3D stages draw their panels */
  watch(root){this.stop();if(!root||!window.MutationObserver)return;
    const fixText=n=>{const p=n.parentElement;if(!p||p.closest('[data-keep-ar]'))return;const t=enT(n.nodeValue);if(t!==n.nodeValue)n.nodeValue=t};
    const fix=n=>{if(n.nodeType===3)fixText(n);else if(n.nodeType===1&&!n.closest('[data-keep-ar]')){const tw=document.createTreeWalker(n,NodeFilter.SHOW_TEXT);let x;while((x=tw.nextNode()))fixText(x)}};
    fix(root);this.obs=new MutationObserver(ms=>{for(const m of ms){if(m.type==='characterData')fix(m.target);else m.addedNodes.forEach(fix)}});
    this.obs.observe(root,{subtree:true,childList:true,characterData:true})},
  stop(){if(this.obs){this.obs.disconnect();this.obs=null}},
  has(wid,k){const c=WC[wid];if(!c)return false;return k==='learn'?!!c.learn:k==='quiz'?!!(c.quiz&&c.quiz.length):k==='home'?!!(c.home&&c.home.length):k==='play'},
  blurb(w){const L=WC[w.id]&&WC[w.id].learn;const p=L&&(L.body||[]).find(x=>!x.startsWith('EX:'));return p||w.en},
  toBook(wid,kind){BOOK_WANT={w:wid,kind};App.go('home')},
  /* the long Arabic guide from the old app, folded, for grown-ups */
  orig(body,f,ctx,label){if(typeof f!=='function')return;const d=document.createElement('details');d.className='card ar-orig';d.dir='rtl';d.lang='ar';d.setAttribute('data-keep-ar','');
    d.innerHTML=`<summary>${label}</summary><div class="ar-in"></div>`;body.appendChild(d);try{f(d.querySelector('.ar-in'),ctx,ctx.inst)}catch(e){console.warn(e)}},
  tab(k,body,w,ctx,f){
    const c=WC[w.id];if(!c||!this.has(w.id,k))return false;
    const arP=t=>t?`<p class="ar-note" dir="rtl" lang="ar">${esc(t)}</p>`:'';const ch=esc(CH_EN[w.d]||'');
    if(k==='learn'){const L=c.learn;
      const lines=(L.body||[]).map(p=>p.startsWith('EX:')?enLine(p.slice(3).trim().replace(/ {2,}/g,'  ·  ')):`<p>${esc(p)}</p>`).join('');
      body.innerHTML=`<div class="card glow en-card" dir="ltr" lang="en"><span class="kicker">LEARN · ${ch}</span><h3>${w.icon} ${esc(w.en)}</h3>${lines}${arP(L.ar)}</div>`+
        (L.words&&L.words.length?`<div class="card en-card" dir="ltr" lang="en"><h4>Key words</h4>${vocab(L.words)}</div>`:'')+
        (L.flap?`<div class="card en-card" dir="ltr" lang="en"><h4>Predict, then check</h4><p>${esc(L.flap.q)}</p><p class="ans" hidden>${esc(L.flap.a)}</p><div class="row"><button class="btn sm gold" type="button" data-rv>Show the answer</button></div></div>`:'')+
        `<div class="card en-card" dir="ltr" lang="en"><div class="row"><button class="btn hot" type="button" data-bk="learn">📖 Open this page in my book</button><button class="btn ghost" type="button" data-bk="practise">✏️ Practise and quiz in my book</button></div></div>`;
      this.orig(body,f,ctx,'للأهل: شرح أوسع بالعربي');
    }else if(k==='play'){
      body.innerHTML=`<div class="card glow en-card" dir="ltr" lang="en"><span class="kicker">PLAY IN 3D · ${ch}</span><h3>${w.icon} ${esc(w.en)}</h3><p>Play on the 3D stage. Use the buttons under the stage. The message at the bottom of the stage tells you what to do.</p>${arP('العب على المسرح ثلاثي الأبعاد بالأزرار تحته، والرسالة أسفل المسرح تقول ماذا تفعل.')}<div class="row"><button class="btn hot" type="button" data-bk="learn">📖 Try it in my book</button></div></div>`;
      this.orig(body,f,ctx,'للأهل: ألعاب إضافية وشرحها بالعربي');
    }else if(k==='quiz'){
      const qs=c.quiz.map(x=>({q:esc(x.q),say:x.q,o:x.o.map(String),en:true,why:x.why?esc(x.why):''}));
      const box=document.createElement('div');body.appendChild(box);quiz(box,qs,{id:w.id,n:qs.length});
    }else if(k==='home'){
      body.innerHTML=`<div class="card glow en-card" dir="ltr" lang="en"><span class="kicker">HOME LEARNING · ${ch}</span><h3>${w.icon} ${esc(w.en)}</h3><ul class="en-list">${c.home.map(([e,a])=>`<li>${esc(e)}${arP(a)}</li>`).join('')}</ul><div class="row"><button class="btn hot" type="button" data-bk="practise">✅ Tick them in my book</button></div></div>`;
      this.orig(body,f,ctx,'للأهل: واجب الكتيّب بالتفصيل');
    }
    $$('[data-bk]',body).forEach(b=>b.onclick=()=>this.toBook(w.id,b.dataset.bk));
    $$('[data-rv]',body).forEach(b=>b.onclick=()=>{const a=b.closest('.card').querySelector('.ans');if(a)a.hidden=false;b.remove()});
    return true;
  }
};
(()=>{
  const w0=App.world;App.world=function(id){w0.call(this,id);WorldEN.watch($('#stage'))};
  const i0=App.island;App.island=function(){i0.call(this);WorldEN.watch($('#stage'))};
  const r0=App.route;App.route=function(){WorldEN.stop();return r0.apply(this,arguments)};
})();

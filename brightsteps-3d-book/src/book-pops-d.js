/* ===== Computing · Music · PE ===== */
const BOT_LV=[{s:[2,4,0],g:[2,1],ob:[]},{s:[0,4,0],g:[3,2],ob:[[0,1],[1,3],[2,3]]},{s:[4,4,0],g:[0,0],ob:[[4,1],[2,2],[2,3],[1,1]]}];
PAGES.robot={
  body:['الخوارزمية (algorithm): تعليمات واضحة ومرتّبة لإنجاز مهمة.','الحاسوب يفعل بالضبط ما نكتبه — لا أكثر ولا أقل!','إذا أخطأ البرنامج نبحث عن الخطأ ونصلحه: هذا اسمه debug.'],
  words:[['algorithm','خوارزمية'],['instruction','تعليمة'],['debug','أصلح الخطأ'],['input','مُدخل'],['output','مُخرج']],
  flap:{q:'الروبوت ذهب يميناً بدل اليسار. ماذا نفعل؟',a:'نبحث عن التعليمة الخاطئة ونصلحها — هذا هو debug.'},
  home:'العبا «الروبوت البشري»: أعطِ تعليمات دقيقة ليصل الآخر إلى المطبخ.',
  hint:'أضف أسهماً لتكتب البرنامج، ثم اضغط «شغّل». أوصل الروبوت إلى النجمة.',
  mat(x,a){const c=.6;for(let r=0;r<5;r++)for(let q=0;q<5;q++){const [X,Y]=a.px(-1.5+q*c,-1.5+r*c);const s=c*a.s;x.fillStyle=(r+q)%2?'#ece5fb':'#fffaf0';x.fillRect(X,Y,s,s);x.strokeStyle='rgba(102,72,194,.45)';x.lineWidth=2;x.strokeRect(X,Y,s,s)}},
  pop(P){
    const c=.6,cell=(q,r)=>new THREE.Vector3(-1.2+q*c,0,-1.2+r*c);let lv=0,prog=[],pos=null,dir=0,busy=false,obs=[],star=null;
    const bot=Robot.model('#b29bff');bot.scale.setScalar(.38);P.root.add(bot);
    function level(i){lv=i%BOT_LV.length;const L=BOT_LV[lv];obs.forEach(o=>{P.root.remove(o)});obs=L.ob.map(([q,r])=>{const b=G.box(.46,.42,.46,'#c9a46b',{roughness:.9});b.position.copy(cell(q,r));b.position.y=.21;P.root.add(b);P.ink(b);b.castShadow=true;return b});
      if(star)P.root.remove(star);star=G.star(.2,.09,'#ffd166',.08,{emissive:'#b07a10',emissiveIntensity:.6});star.position.copy(cell(L.g[0],L.g[1]));star.position.y=.42;P.root.add(star);reset();prog=[];show()}
    function reset(){const L=BOT_LV[lv];pos=[L.s[0],L.s[1]];dir=L.s[2];bot.position.copy(cell(pos[0],pos[1]));bot.rotation.y=Math.PI-dir*Math.PI/2}
    const AR={F:'⬆',L:'↶',R:'↷'};function show(){P.cap(prog.length?prog.map(p=>AR[p]).join(' '):'Level '+(lv+1),prog.length?`البرنامج: ${prog.length} تعليمات`:'المستوى '+(lv+1)+': اكتب البرنامج بالأسهم')}
    const add=k=>{if(busy||prog.length>=14)return;prog.push(k);Snd.tick();show()};
    async function run(){if(busy||!prog.length)return;busy=true;reset();await E.wait(.2);const L=BOT_LV[lv];
      for(const k of prog){if(!P.alive())return;if(k==='L'||k==='R'){dir=(dir+(k==='R'?1:3))%4;await E.tw(bot.rotation,{y:Math.PI-dir*Math.PI/2+(k==='R'?0:0)},.3);continue}
        const dq=[0,1,0,-1][dir],dr=[-1,0,1,0][dir];const nq=pos[0]+dq,nr=pos[1]+dr;const bad=nq<0||nq>4||nr<0||nr>4||L.ob.some(([a,b])=>a===nq&&b===nr);
        if(bad){const p0=bot.position.clone();await E.tw(bot.position,{x:p0.x+dq*.22,z:p0.z+dr*.22},.15);Snd.bad();await E.tw(bot.position,{x:p0.x,z:p0.z},.2);P.cap('Bug! 🐞','اصطدم الروبوت! أصلح البرنامج (debug) وجرّب من جديد.');await E.wait(.6);reset();busy=false;return}
        pos=[nq,nr];const to=cell(nq,nr);Snd.tone(420,.08,{type:'square',vol:.05});await E.tw(bot.position,{x:to.x,z:to.z},.32,Ease.inOut)}
      if(pos[0]===L.g[0]&&pos[1]===L.g[1]){celebrate('',{at:P.world(star.position),n:2,spread:.6});P.cap('You did it! ⭐','وصل الروبوت! برنامجك صحيح.');P.done('برمجت الروبوت!');await E.wait(1.3);busy=false;if(P.alive())level(lv+1)}
      else{P.cap('Not there yet','لم يصل بعد — أضف تعليمات أو أصلحها.');busy=false}}
    level(0);P.tap(bot,()=>{Snd.pop();Voice.say('Beep boop! Give me instructions.')});
    return {chips:[{label:'⬆ تقدّم',fn:()=>add('F')},{label:'↶ يسار',fn:()=>add('L')},{label:'↷ يمين',fn:()=>add('R')},{label:'▶ شغّل',cls:'go',fn:run},{label:'⌫ امسح',fn:()=>{if(busy)return;prog.pop();show()}},{label:'⟲ من جديد',fn:()=>{if(busy)return;prog=[];reset();show()}}],
      update(dt,t){if(star)star.rotation.y=t*1.5;if(!busy)bot.position.y=Math.abs(Math.sin(t*3))*.03}};
  }
};
PAGES.keys={
  body:['نضع الأصابع على الصف الأوسط:','EN:left hand  A S D F      right hand  J K L ;','على حرفي F وJ نتوءان صغيران لنجد مكاننا دون أن ننظر!','لوحة المفاتيح مُدخل (input)، والشاشة مُخرج (output): نضغط حرفاً فيظهر على الشاشة.'],
  words:[['keyboard','لوحة المفاتيح'],['home row','الصف الأوسط'],['input','مُدخل'],['output','مُخرج']],
  flap:{q:'ما الحرفان اللذان عليهما نتوءات؟',a:'F وJ — نضع عليهما السبّابتين.'},
  home:'تدرّبا خمس دقائق: اكتبا sad dad lads بأصابع الصف الأوسط فقط.',
  hint:'المفتاح المضيء يرتفع: اضغطه، أو اكتبه بلوحة المفاتيح الحقيقية.',
  pop(P){
    const FC={q:'#ff8fb1',a:'#ff8fb1',w:'#c7a6ff',s:'#c7a6ff',e:'#8fc8ff',d:'#8fc8ff',r:'#7fe0c0',t:'#7fe0c0',f:'#7fe0c0',g:'#7fe0c0',y:'#ffd98a',u:'#ffd98a',h:'#ffd98a',j:'#ffd98a',i:'#8fc8ff',k:'#8fc8ff',o:'#c7a6ff',l:'#c7a6ff',p:'#ff8fb1',';':'#ff8fb1'};
    const FN={a:'الخنصر الأيسر',s:'البنصر الأيسر',d:'الوسطى اليسرى',f:'السبّابة اليسرى',g:'السبّابة اليسرى',h:'السبّابة اليمنى',j:'السبّابة اليمنى',k:'الوسطى اليمنى',l:'البنصر الأيمن',';':'الخنصر الأيمن',q:'الخنصر الأيسر',w:'البنصر الأيسر',e:'الوسطى اليسرى',r:'السبّابة اليسرى',t:'السبّابة اليسرى',y:'السبّابة اليمنى',u:'السبّابة اليمنى',i:'الوسطى اليمنى',o:'البنصر الأيمن',p:'الخنصر الأيمن'};
    const kb=G.box(3.5,.08,1,'#2a2d3a',{metalness:.3});kb.position.set(0,.04,.25);P.root.add(kb);const keys={};
    ['qwertyuiop','asdfghjkl;'].forEach((row,ri)=>[...row].forEach((ch,i)=>{const side=P.m('#e8ecf6');const top=new THREE.MeshStandardMaterial({map:G.glyph(ch.toUpperCase(),{bg:FC[ch],fg:'#1b1f3a',font:FONT_R}),roughness:.5});
      const k=new THREE.Mesh(new THREE.BoxGeometry(.28,.12,.28),[side,side,top,side,side,side]);k.position.set(-1.44+i*.32+ri*.08,.14,ri?.42:.08);P.root.add(k);keys[ch]=k;k.userData.y0=.14;P.tap(k,()=>press(ch));
      if(ch==='f'||ch==='j'){const b=G.box(.1,.012,.02,'#1b1f3a');b.position.set(0,.065,.07);k.add(b)}}));
    const scr=PK.card(2.6,1.05,null,{pw:640,bg:'#0f1638',edge:'#2a2d3a',back:'#2a2d3a',d:.08});scr.position.set(0,.85,-.75);scr.rotation.x=-.12;P.root.add(scr);const leg=G.box(.18,.4,.08,'#2a2d3a');leg.position.set(0,.2,-.8);P.root.add(leg);
    let typed='',seq=shuffle([...'asdfjkl']).concat(shuffle([...'qwertyuiop']).slice(0,5)),idx=0,ok=0;
    const paint=()=>scr.userData.redraw((x,W,H)=>{x.fillStyle='#0f1638';x.fillRect(0,0,W,H);x.fillStyle='#3ddbb0';PT.fnt(x,26,700,FONT_R);PT.ltr(x);x.fillText('OUTPUT  →  screen',24,40);PT.fnt(x,92,700,FONT_R);x.fillStyle='#ffffff';x.fillText(typed.slice(-10)+(Math.floor(performance.now()/500)%2?'|':''),28,180)});
    const tgt=()=>seq[idx%seq.length];
    function mark(){Object.entries(keys).forEach(([ch,k])=>{const on=ch===tgt();k.material[2].emissive.set(on?'#ffd166':'#000');k.material[2].emissiveIntensity=on?.55:0;E.tw(k.position,{y:on?.24:.14},.25,Ease.out)});P.cap(tgt().toUpperCase(),`اضغط <b class="en">${tgt().toUpperCase()}</b> — ${FN[tgt()]}`)}
    function press(ch){const k=keys[ch];if(!k)return;E.stopTweens(k.position);k.position.y=.09;E.tw(k.position,{y:ch===tgt()?.14:.14},.18);
      if(ch===tgt()){typed+=ch;ok++;idx++;Snd.tone(880,.08,{type:'triangle',vol:.1});if(ok===8)P.done('8 مفاتيح صحيحة!');paint();mark()}else{Snd.bad();P.cap(tgt().toUpperCase(),`هذا <b class="en">${ch.toUpperCase()}</b> — ابحث عن <b class="en">${tgt().toUpperCase()}</b>`)}}
    paint();mark();let blink=0;
    return {chips:[{label:'🔀 حروف جديدة',fn:()=>{seq=shuffle([...'asdfjkl;']).concat(shuffle([...'qwertyuiop']));idx=0;mark()}},{label:'🔊 اسمع الحرف',fn:()=>Voice.say(tgt()===';'?'semicolon':tgt())}],
      key(e){const ch=(e.key||'').toLowerCase();if(keys[ch]&&!e.metaKey&&!e.ctrlKey){e.preventDefault();press(ch);return true}return false},
      update(dt){blink+=dt;if(blink>.5){blink=0;paint()}}};
  }
};
PAGES.music={
  body:['Pitch: كم النغمة عالية أو منخفضة — الأعمدة القصيرة أعلى.','Tempo: سرعة الموسيقى، من بطيء 🐢 إلى سريع 🐆.','Dynamics: قوة الصوت، من هادئ 🐭 إلى عالٍ 🦁.','النبض الثابت (steady pulse) مثل دقات القلب: منتظم، لا يسرع ولا يبطئ فجأة.'],
  words:[['pitch','حدّة النغمة'],['tempo','السرعة'],['dynamics','قوة الصوت'],['pulse','النبض']],
  flap:{q:'العمود الأقصر في الإكسيليفون: نغمته عالية أم منخفضة؟',a:'عالية — كلما قصر العمود ارتفعت النغمة (pitch).'},
  home:'صفّقا مع أغنية تحبّانها وحافظا على نبض ثابت، ثم جرّبا التصفيق بسرعة وببطء.',
  hint:'اضغط الأعمدة لتعزف. شغّل الطبل لتسمع نبضاً ثابتاً، وغيّر سرعته وقوّته.',
  pop(P){
    const NOTES=[523.25,587.33,659.25,698.46,783.99,880,987.77,1046.5],COL=['#ff5d8f','#ff7b39','#ffd166','#9be36d','#3ddbb0','#6db4ff','#8f78e8','#ff8fb1'];
    [-.62,.32].forEach(z=>{const r=G.box(2.9,.08,.09,'#5a3a26');r.position.set(0,.12,z);P.root.add(r)});
    const bars=NOTES.map((f,i)=>{const len=1.3-i*.075;const b=G.box(.27,.07,len,COL[i],{roughness:.4,metalness:.1});b.position.set(-1.12+i*.32,.2,-.15);b.userData={f,i,k:0};P.root.add(b);P.tap(b,()=>hit(i));return b});
    let taps=0;const notes=[];
    function hit(i){const b=bars[i];Snd.note(b.userData.f,.9,.3);b.userData.k=1;taps++;const s=P.label('♪',{size:.34,bg:null,border:null,color:COL[i],px:70});s.position.set(b.position.x,.5,-.15);P.root.add(s);notes.push({s,t:0});if(taps===6)P.done('عزفت لحناً!');
      P.cap(i<3?'Low pitch':i>4?'High pitch':'Middle pitch',i<3?'عمود طويل = نغمة منخفضة':i>4?'عمود قصير = نغمة عالية':'نغمة متوسطة')}
    const drum=new THREE.Group();const shell=G.cyl(.36,.33,.38,'#c0336a',{},28);shell.position.y=.19;const skin=G.cyl(.35,.35,.03,'#fff7e6',{},28);skin.position.y=.395;skin.userData.noInk=true;const rim=G.mesh(new THREE.TorusGeometry(.355,.025,8,28),P.m('#ffd166',{metalness:.6}));rim.rotation.x=Math.PI/2;rim.position.y=.4;drum.add(shell,skin,rim);drum.position.set(1.05,0,.98);P.root.add(drum);
    let on=false,bpm=90,vol=.4,acc=0;P.tap(drum,()=>{Snd.drum(vol);skin.scale.y=3;if(!on)P.cap('Boom!','اضغط «نبض ثابت» ليعزف الطبل وحده.')});
    const TW=[0,0,4,4,5,5,4,3,3,2,2,1,1,0],DU=[1,1,1,1,1,1,2,1,1,1,1,1,1,2];
    async function tune(){let t=0;for(let i=0;i<TW.length;i++){setTimeout(()=>{if(P.alive())hit(TW[i])},t*380);t+=DU[i]}}
    return {chips:[{label:'🥁 نبض ثابت',toggle:true,fn:(v)=>{on=v;acc=0;P.cap(v?'Steady pulse':'',v?`النبض الثابت · ${bpm<100?'بطيء 🐢':'سريع 🐆'} · ${vol<.3?'هادئ 🐭':'عالٍ 🦁'}`:'')}},
      {id:'slow',label:'🐢 بطيء',group:'t',on:true,fn:()=>{bpm=80}},{id:'fast',label:'🐆 سريع',group:'t',fn:()=>{bpm=140}},{id:'q',label:'🐭 هادئ',group:'v',fn:()=>{vol=.15}},{id:'l',label:'🦁 عالٍ',group:'v',on:true,fn:()=>{vol=.55}},{label:'▶ Twinkle',cls:'gold',fn:tune}],
      update(dt){bars.forEach(b=>{const u=b.userData;if(u.k>0){u.k=Math.max(0,u.k-dt*3);b.position.y=.2-Math.sin(u.k*Math.PI)*.05;b.rotation.x=Math.sin(u.k*20)*.04*u.k}});
        for(let i=notes.length-1;i>=0;i--){const n=notes[i];n.t+=dt;n.s.position.y+=dt*.9;n.s.material.opacity=1-n.t;if(n.t>1){P.root.remove(n.s);n.s.material.map.dispose();n.s.material.dispose();notes.splice(i,1)}}
        skin.scale.y+=(1-skin.scale.y)*Math.min(1,dt*10);if(on){acc+=dt;if(acc>=60/bpm){acc-=60/bpm;Snd.drum(vol);skin.scale.y=1+vol*8;drum.scale.setScalar(1+vol*.08)}}drum.scale.lerp(new THREE.Vector3(1,1,1),Math.min(1,dt*8))}};
  }
};
PAGES.pe={
  body:['الرياضة يومَي الثلاثاء والجمعة: يأتي الطفل بزي الرياضة.','الجمباز: القفز والدحرجة والتوازن، وسلاسل حركة بأشكال مختلفة: star · tuck · pencil · straddle · pike.','ألعاب التصويب: دقة وتحكّم في الرمي والدحرجة، والعمل كفريق بقواعد آمنة.'],
  words:[['aim','صوِّب'],['throw','ارمِ'],['tuck','تكوّر'],['balance','توازن']],
  flap:{q:'شكل tuck في الجمباز: كيف يبدو الجسم؟',a:'مكوّراً: الركبتان إلى الصدر، والذراعان حولهما.'},
  home:'ضعا سلّة على الأرض، وارميا جوارب ملفوفة من خطوات مختلفة.',
  hint:'اسحب كيس الحبوب إلى الخلف (نحوك) ثم اتركه ليطير نحو الهدف!',
  pop(P){
    const T0=new THREE.Vector3(0,0,-1.05);[[.95,'#6db4ff',2],[.62,'#ff5d8f',5],[.3,'#ffd166',10]].forEach(([r,c],i)=>{const d=G.cyl(r,r,.02,c,{roughness:.8},40);d.position.set(T0.x,.01+i*.012,T0.z);d.userData.noInk=true;P.root.add(d)});
    const ptsL=[['2',.8],['5',.47],['10',0]].map(([t,o])=>{const l=P.label(t,{size:.2,px:48});l.position.set(o,.25,T0.z+.0);P.root.add(l);return l});
    const S0=new THREE.Vector3(0,.07,1.25);const bag=G.box(.26,.13,.26,'#ff7b39',{roughness:.95});bag.position.copy(S0);P.root.add(bag);
    const aim=[];for(let i=0;i<8;i++){const s=G.sph(.035,'#2d2219',{},8);s.visible=false;s.userData.noInk=true;P.root.add(s);aim.push(s)}
    let pull=null,fly=null,total=0,throws=0;const marks=[];
    P.drag(bag,{plane:'y',start(lp){if(fly)return;pull=new THREE.Vector3()},move(lp){if(fly||!pull)return;pull.set(clamp(lp.x-S0.x,-.8,.8),0,clamp(lp.z-S0.z,0,.95));bag.position.set(S0.x+pull.x*.5,.07,S0.z+pull.z*.5);
        const vx=-pull.x*4.2,vz=-pull.z*4.4,vy=3;aim.forEach((s,i)=>{const t=(i+1)*.07;s.visible=true;s.position.set(bag.position.x+vx*t,.07+vy*t-4.9*t*t,bag.position.z+vz*t)})},
      end(){aim.forEach(s=>s.visible=false);if(!pull||pull.z<.1){pull=null;bag.position.copy(S0);return}fly={v:new THREE.Vector3(-pull.x*4.2,3,-pull.z*4.4)};pull=null;Snd.whoosh()}});
    return {chips:[{label:'↺ صفّر النقاط',fn:()=>{total=0;throws=0;marks.forEach(m=>P.root.remove(m));marks.length=0;P.cap('Score: 0','اسحب الكيس نحوك ثم اتركه')}}],capEn:'Pull back and let go!',
      update(dt){if(!fly)return;fly.v.y-=9.8*dt;bag.position.addScaledVector(fly.v,dt);bag.rotation.x+=dt*6;if(bag.position.y<=.07){bag.position.y=.07;const d=Math.hypot(bag.position.x-T0.x,bag.position.z-T0.z);const pts=d<.3?10:d<.62?5:d<.95?2:0;total+=pts;throws++;fly=null;
          const m=G.cyl(.08,.08,.01,'#2d2219',{},12);m.position.set(bag.position.x,.045,bag.position.z);m.userData.noInk=true;P.root.add(m);marks.push(m);
          if(pts){Snd.good();FX.sparkle(P.world(bag.position),{n:20});P.done('أصبت الهدف!')}else Snd.bad();P.cap(`+${pts} · Score: ${total}`,pts?`رائع! ${pts} نقاط. المجموع ${total}`:'خارج الهدف — جرّب قوّة أقل أو أكثر');Voice.say(pts?pts+' points!':'Try again!');
          setTimeout(()=>{if(!P.alive())return;bag.rotation.set(0,0,0);bag.position.copy(S0)},900)}}};
  }
};
/* ===== RE · PSHE · Values ===== */
PAGES.kindness={
  body:['نتعلّم كيف يُظهر أتباع الأديان المختلفة الرحمة واللطف والاهتمام بالآخرين.','المشاركة والعطاء ومساعدة المحتاجين.','التعاطف: أن أتخيّل ما يشعر به غيري. والامتنان: أن أقول شكراً لما عندي.'],
  words:[['kind','لطيف'],['share','يشارك'],['empathy','تعاطف'],['grateful','ممتنّ']],
  flap:{q:'صديقك حزين لأنه يلعب وحده. ماذا تفعل؟',a:'تدعوه ليلعب معك — هذا لطف وتعاطف.'},
  home:'كل مساء: ضعا قلباً في جرّة حقيقية مقابل كل عمل لطيف.',
  hint:'اختر عملاً لطيفاً من الأزرار، وشاهد قلباً يسقط في الجرّة.',
  pop(P){
    const pts=[];for(let i=0;i<=16;i++){const t=i/16;pts.push(new THREE.Vector2(t<.06?.05+t*11:t>.85?.72-(t-.85)*2.4:.72,t*1.55))}
    const jar=G.mesh(new THREE.LatheGeometry(pts,32),new THREE.MeshStandardMaterial({color:new THREE.Color('#cfefff'),transparent:true,opacity:.28,roughness:.08,side:THREE.DoubleSide,depthWrite:false}));jar.userData.noInk=true;jar.renderOrder=5;P.root.add(jar);
    const lid=G.cyl(.4,.4,.1,'#ffd166',{metalness:.6,roughness:.3},28);lid.position.y=1.6;P.root.add(lid);
    const tag=PK.card(.9,.36,null,{pw:384,bg:'#fff5df'});tag.position.set(0,.75,.74);P.root.add(tag);
    const hearts=[];const slot=i=>{const L=Math.floor(i/7),a=(i%7)/7*Math.PI*2+L*.45,r=i%7===0&&L%2?0:.38;return new THREE.Vector3(Math.cos(a)*r,.13+L*.16,Math.sin(a)*r)};
    const heart=()=>{const h=G.heart(.11,'#ff5d8f',.08,{emissive:'#7a1033',emissiveIntensity:.25});h.userData.noInk=true;h.castShadow=true;return h};
    const draw=()=>tag.userData.redraw((x,W,H)=>{x.strokeStyle='#c0336a';x.lineWidth=6;x.strokeRect(4,4,W-8,H-8);x.fillStyle='#c0336a';PT.fnt(x,36,800,FONT_R);PT.ltr(x,'center');x.fillText('Kindness Jar',W/2,H*.45);PT.fnt(x,40,800,FONT_D);x.fillText('♥ '+Store.s.jar.length,W/2,H*.85)});
    for(let i=0;i<Math.min(Store.s.jar.length,40);i++){const h=heart();h.position.copy(slot(i));h.rotation.set(rand(-.4,.4),rand(0,6),rand(-.4,.4));P.root.add(h);hearts.push(h)}draw();
    function add([en,ar]){Store.s.jar.push({t:en,d:ymd(today())});Store.save();draw();const i=Store.s.jar.length-1;Snd.good();P.cap(en,`${ar} — قلب جديد في الجرّة ♥`);Voice.say(en);
      if(i<40){const h=heart();h.position.set(0,2.4,0);P.root.add(h);hearts.push(h);arc(h,slot(i),.8,.2,Ease.out).then(()=>{if(P.alive())FX.sparkle(P.world(new THREE.Vector3(0,1.7,0)),{colors:['#ff8fb1','#ffd166','#fff'],n:18})})}P.done('أضفت عملاً لطيفاً!')}
    return {chips:KIND.map(k=>({label:k[1],fn:()=>add(k)})),capEn:'Kindness Jar',update(dt,t){lid.rotation.y=Math.sin(t)*.05}};
  }
};
PAGES.safety={
  body:['نتعلّم المخاطر اليومية في البيت والخارج، وكيف نحمي أنفسنا.','الأمان مع الغرباء وعلى الإنترنت: الاسم والعنوان والمدرسة والصور معلومات خاصة.','الكبار الموثوقون: خمسة أشخاص على أصابع يدي أستطيع أن أخبرهم بأي شيء.'],
  words:[['safe','آمن'],['danger','خطر'],['trusted adult','شخص بالغ موثوق'],['private','خاص']],
  flap:{q:'شخص على الإنترنت يسأل عن عنوانك. ماذا تفعل؟',a:'لا أخبره، وأُري الرسالة لشخص بالغ موثوق.'},
  home:'ارسما يد الطفل، واكتبا على كل إصبع اسم شخص بالغ موثوق.',
  hint:'ابحث في الغرفة عن 5 أشياء خطرة واضغط عليها. وجرّب «شغّل الغلاية».',
  pop(P){
    const floor=G.box(3.2,.06,2.5,'#c9a46b',{roughness:.85});floor.position.y=.03;const wb=G.box(3.2,1.15,.06,'#f3e7cf');wb.position.set(0,.6,-1.22);const ws=G.box(.06,1.15,2.5,'#eadcbf');ws.position.set(-1.58,.6,0);P.root.add(floor,wb,ws);
    const found=new Set();const ring=(p)=>{const r=G.mesh(new THREE.TorusGeometry(.26,.03,8,28),P.m('#3ddbb0',{emissive:'#16866b',emissiveIntensity:.8}));r.position.copy(p);r.userData.noInk=true;P.root.add(r);return r};
    const H=(k)=>HAZ.find(h=>h.k===k);
    function found1(k,p,o){const h=H(k);Snd.pop();P.cap(h.en,`<b>${h.ar}</b> ${h.why}`);Voice.say(h.o[0]);if(!found.has(k)){found.add(k);const r=ring(p);r.rotation.x=o||0;E.tw(r.scale,{x:1.2,y:1.2,z:1.2},.3,Ease.back);if(found.size>=5)P.done('وجدت كل المخاطر!');else setTimeout(()=>P.alive()&&cap(h.en,`<b>${h.ar}</b> ${h.why} <span class="gold-t">(${found.size}/5)</span>`),10)}}
    const counter=G.box(1.05,.62,.5,'#e6eef6');counter.position.set(-.95,.37,-.92);P.root.add(counter);
    const kettle=new THREE.Group();const kb=G.cyl(.15,.19,.3,'#c9cfe0',{metalness:.4,roughness:.3},20);kb.position.y=.15;const sp=G.cyl(.03,.04,.22,'#c9cfe0',{metalness:.4});sp.position.set(.2,.18,0);sp.rotation.z=-.9;const hd=G.mesh(new THREE.TorusGeometry(.1,.02,8,16,Math.PI),P.m('#2d2219'));hd.position.set(-.04,.32,0);
    const led=G.sph(.025,'#333',{emissive:'#000'});led.position.set(-.1,.08,.16);kettle.add(kb,sp,hd,led);kettle.position.set(-.95,.68,-.92);P.root.add(kettle);let boil=0;
    P.tap(kettle,()=>found1('hob',new THREE.Vector3(-.95,.98,-.92),Math.PI/2));
    const sock=G.box(.3,.3,.03,'#ffffff');sock.position.set(.35,.32,-1.18);[-.06,.06].forEach(x=>{const h=G.box(.03,.07,.02,'#2d2219');h.position.set(x,0,.02);sock.add(h)});P.root.add(sock);P.tap(sock,()=>{found1('plug',new THREE.Vector3(.35,.32,-1.1));FX.sparkle(P.world(new THREE.Vector3(.35,.35,-1.1)),{colors:['#ffd166','#ffffff'],n:14})});
    const shelf=G.box(.85,.05,.28,'#8a5a36');shelf.position.set(1.05,.82,-1.05);const med=G.cyl(.07,.07,.2,'#ff7b39',{roughness:.3},16);med.position.set(1.05,.95,-1.05);const cp=G.cyl(.075,.075,.05,'#ffffff');cp.position.set(1.05,1.08,-1.05);P.root.add(shelf,med,cp);P.tap(med,()=>found1('med',new THREE.Vector3(1.05,1,-.9)));
    const steps=new THREE.Group();for(let i=0;i<3;i++){const s=G.box(.7,.18,.3,'#b07a4f');s.position.set(0,.09+i*.18,-i*.3);steps.add(s)}steps.position.set(1.1,.06,.25);P.root.add(steps);const toy=G.sph(.1,'#ff5d8f');toy.position.set(1.0,.34,.3);P.root.add(toy);P.tap(toy,()=>found1('stairs',new THREE.Vector3(1.0,.34,.3),Math.PI/2));
    const tab=G.box(.42,.03,.3,'#1b1f3a',{roughness:.3});tab.position.set(-.35,.075,.55);const glow=G.box(.36,.005,.24,'#6db4ff',{emissive:'#2f6fb3',emissiveIntensity:.9});glow.position.y=.018;tab.add(glow);P.root.add(tab);P.tap(tab,()=>found1('tablet',new THREE.Vector3(-.35,.1,.55),Math.PI/2));
    return {chips:[{label:'♨️ شغّل الغلاية',cls:'gold',fn:()=>{boil=3.5;led.material.emissive.set('#ff3b2f');led.material.emissiveIntensity=1.5;Snd.tone(900,1.6,{type:'sine',slide:1600,vol:.05});P.cap('The kettle is hot!','الغلاية تغلي والبخار ساخن جداً — نبتعد ونترك الكبار يستعملونها.')}}],capEn:'Find 5 dangers',
      update(dt){if(boil>0){boil-=dt;const w=P.world(new THREE.Vector3(-.72,.98,-.92));for(let k=0;k<2;k++)FX.sys.emit({x:w.x,y:w.y,z:w.z,vx:rand(.1,.4),vy:rand(.8,1.4),vz:rand(-.1,.1),life:1.1,s0:.12,s1:.5,c0:[1,1,1,.55],c1:[1,1,1,0],drag:.5});if(boil<=0){led.material.emissive.set('#000')}}}};
  }
};
PAGES.magpie={
  body:['العقعق المتحمّس (Motivated Magpie): مركّز، يشارك بنشاط، ولا يستسلم.','نهنّئ الأطفال على ما أحسنوا فعله ونحتفل معهم.','قيم المدرسة الثماني: الطموح، الاحترام، الإدماج، المسؤولية، التعاون، التميّز، النمو، النزاهة.'],
  words:[['focused','مركّز'],['engaged','مشارك'],['persevere','لا يستسلم'],['values','قيم']],
  flap:{q:'أخطأتُ في مسألة. ماذا يقول العقعق المتحمّس؟',a:'«لا أستسلم! الأخطاء تساعد عقلي على النمو» — Growth.'},
  home:'اسألا كل مساء: What did you do well today? ثم احتفلا معاً.',
  hint:'اضغط أي جوهرة لتطير إليها العقعقة وتسمع القيمة.',
  pop(P){
    const perch=G.cyl(.05,.07,.7,'#6b4428');perch.position.y=.35;const br=G.cyl(.035,.035,.7,'#6b4428');br.rotation.z=Math.PI/2;br.position.y=.7;P.root.add(perch,br);
    const mag=makeMagpie();mag.scale.setScalar(.42);mag.position.set(0,.92,0);P.root.add(mag);mag.traverse(o=>o.userData.noInk=true);mag.userData.fold();
    const GC=['#ff5d8f','#ffd166','#3ddbb0','#6db4ff','#b29bff','#ff7b39','#9be36d','#7fe0ff'];const gems=VALUES.map((v,i)=>{const a=i/VALUES.length*Math.PI*2+Math.PI/8;const p=new THREE.Vector3(Math.cos(a)*1.35,0,Math.sin(a)*1.2+.05);
      const ped=G.cyl(.12,.15,.22,'#e7d2b0');ped.position.set(p.x,.11,p.z);const gm=G.mesh(new THREE.OctahedronGeometry(.16),G.m(GC[i],{metalness:.2,roughness:.15,flatShading:true,emissive:GC[i],emissiveIntensity:.25}));gm.scale.y=1.4;gm.position.set(p.x,.42,p.z);P.root.add(ped,gm);P.tap(gm,()=>fly(i));P.tap(ped,()=>fly(i));return {gm,p}});
    let busy=false,flapT=0;const seen=new Set();
    async function fly(i){if(busy)return;busy=true;const v=VALUES[i],g=gems[i];P.cap(v[0],`<b>${v[1]}:</b> ${v[3]}`);Voice.say(v[0]+'. '+v[2]);flapT=1;const to=new THREE.Vector3(g.p.x,.78,g.p.z);mag.lookAt(P.world(to));
      await arc(mag,to,.9,.8);flapT=0;mag.userData.fold();E.tw(g.gm.scale,{x:1.5,y:2,z:1.5},.3,Ease.back).then(()=>E.tw(g.gm.scale,{x:1,y:1.4,z:1},.4));FX.sparkle(P.world(g.gm.position),{n:22});seen.add(i);if(seen.size>=4)P.done('جمعت 4 قيم!');busy=false}
    P.tap(mag,()=>{Snd.pop();Voice.say('I never give up!');P.cap('Motivated Magpie','مركّز، مشارك، ولا يستسلم!')});
    return {chips:[{label:'🏠 إلى الغصن',fn:async()=>{if(busy)return;busy=true;flapT=1;await arc(mag,new THREE.Vector3(0,.92,0),.8,.6);flapT=0;mag.userData.fold();busy=false}}],capEn:'8 values',
      update(dt,t){gems.forEach((g,i)=>g.gm.rotation.y=t*1.2+i);if(flapT)mag.userData.flap(t*22,.9);else mag.position.y+=Math.sin(t*3)*.0015}};
  }
};
/* ===== closing spread: a bonfire for Bonfire Night ===== */
PAGES._end={
  chips:()=>[{label:'👪 لوحة ولي الأمر',fn:()=>App.go('parent')},{label:'📖 إلى الفهرس',fn:()=>Book.st&&Book.st.go(1)}],
  hint:'اضغط نار المخيّم لتطلق الألعاب النارية فوق كتابك!',
  ink:false,
  pop(P){
    const g=new THREE.Group();P.root.add(g);for(let i=0;i<9;i++){const a=i/9*Math.PI*2;const s=G.mesh(new THREE.DodecahedronGeometry(.1),G.m('#6b6f86',{flatShading:true}));s.position.set(Math.cos(a)*.34,.06,Math.sin(a)*.24);g.add(s)}
    for(let i=0;i<4;i++){const l=G.cyl(.04,.05,.5,'#6a4128');l.rotation.z=Math.PI/2.6;l.rotation.y=i*Math.PI/2;l.position.y=.14;g.add(l)}
    const fl=new Particles(260,{tex:FX.soft});P.root.add(fl.points);
    const show=()=>{Snd.whoosh();for(let k=0;k<5;k++)setTimeout(()=>{if(!P.alive())return;const from=P.world(new THREE.Vector3(0,.3,0));FX.rocket(from,new THREE.Vector3(rand(-4,4),rand(4.5,7),rand(-2.5,1)),{sound:k%2===0,n:130})},k*240)};
    P.tap(g,show);
    return {chips:[{label:'🎆 ألعاب نارية',cls:'gold',fn:show},{label:'👪 لوحة ولي الأمر',fn:()=>App.go('parent')},{label:'📖 إلى الفهرس',fn:()=>Book.st&&Book.st.go(1)}],
      update(dt,t){for(let k=0;k<2;k++)fl.emit({x:rand(-.1,.1),y:.15,z:rand(-.1,.1),vx:rand(-.05,.05),vy:rand(.5,.9),vz:rand(-.05,.05),life:rand(.5,.9),s0:rand(.3,.45),s1:.03,c0:Math.random()<.5?[1,.62,.2,.9]:[1,.38,.12,.85],c1:[.9,.15,.05,0],drag:.6});fl.update(dt)}};
  }
};

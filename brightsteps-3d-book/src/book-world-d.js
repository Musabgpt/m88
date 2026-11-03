/* ===== Chapter 5 · Computing · Music · PE ===== */
const BOT_LV=[{s:[2,4,0],g:[2,1],ob:[]},{s:[0,4,0],g:[3,2],ob:[[0,1],[1,3],[2,3]]},{s:[4,4,0],g:[0,0],ob:[[4,1],[2,2],[2,3],[1,1]]}];
WC.robot={
  learn:{body:['An algorithm is a list of clear instructions in the right order.','A computer does exactly what we tell it: nothing more, nothing less!','If the program goes wrong, we find the mistake and fix it. That is called debugging.','Inputs give the computer instructions (keyboard, touchpad). Outputs show the result (screen).'],
    words:[['algorithm','خوارزمية'],['instruction','تعليمة'],['debug','إصلاح الخطأ'],['input','مُدخل'],['output','مُخرج']],
    flap:{q:'The robot went right instead of left. What do we do?',a:'Find the wrong instruction and fix it. That is debugging!'},
    ar:'الخوارزمية تعليمات مرتّبة ودقيقة. إذا أخطأ البرنامج نبحث عن الخطأ ونصلحه (debug).'},
  try:{hint:'Press the arrow buttons to write a program, then press Run. Get the robot to the star!',ar:'اكتب البرنامج بالأسهم ثم اضغط Run.',
    mat(x,a){const c=.6;for(let r=0;r<5;r++)for(let q=0;q<5;q++){const [X,Y]=a.px(-1.5+q*c,-1.5+r*c);const s=c*a.s;x.fillStyle=(r+q)%2?'#ece5fb':'#fffaf0';x.fillRect(X,Y,s,s);x.strokeStyle='rgba(102,72,194,.45)';x.lineWidth=2;x.strokeRect(X,Y,s,s)}},
    pop(P){
      const c=.6,cell=(q,r)=>new THREE.Vector3(-1.2+q*c,0,-1.2+r*c);let lv=0,prog=[],pos=null,dir=0,busy=false,obs=[],star=null;
      const bot=Robot.model('#b29bff');bot.scale.setScalar(.38);P.root.add(bot);
      function level(i){lv=i%BOT_LV.length;const L=BOT_LV[lv];obs.forEach(o=>{P.root.remove(o)});obs=L.ob.map(([q,r])=>{const b=G.box(.46,.42,.46,'#c9a46b',{roughness:.9});b.position.copy(cell(q,r));b.position.y=.21;P.root.add(b);P.ink(b);b.castShadow=true;return b});
        if(star)P.root.remove(star);star=G.star(.2,.09,'#ffd166',.08,{emissive:'#b07a10',emissiveIntensity:.6});star.position.copy(cell(L.g[0],L.g[1]));star.position.y=.42;P.root.add(star);reset();prog=[];show()}
      function reset(){const L=BOT_LV[lv];pos=[L.s[0],L.s[1]];dir=L.s[2];bot.position.copy(cell(pos[0],pos[1]));bot.rotation.y=Math.PI-dir*Math.PI/2}
      const AR={F:'⬆',L:'↶',R:'↷'};function show(){P.cap(prog.length?'Program: '+prog.map(p=>AR[p]).join(' '):'Level '+(lv+1)+': write a program to reach the star.',prog.length?'البرنامج بالأسهم':'المستوى '+(lv+1))}
      const add=k=>{if(busy||prog.length>=14)return;prog.push(k);Snd.tick();show()};
      async function run(){if(busy||!prog.length)return;busy=true;reset();await E.wait(.2);const L=BOT_LV[lv];
        for(const k of prog){if(!P.alive())return;if(k==='L'||k==='R'){dir=(dir+(k==='R'?1:3))%4;await E.tw(bot.rotation,{y:Math.PI-dir*Math.PI/2},.3);continue}
          const dq=[0,1,0,-1][dir],dr=[-1,0,1,0][dir];const nq=pos[0]+dq,nr=pos[1]+dr;const bad=nq<0||nq>4||nr<0||nr>4||L.ob.some(([a,b])=>a===nq&&b===nr);
          if(bad){const p0=bot.position.clone();await E.tw(bot.position,{x:p0.x+dq*.22,z:p0.z+dr*.22},.15);Snd.bad();await E.tw(bot.position,{x:p0.x,z:p0.z},.2);P.cap('Bump! There is a bug. Debug your program and try again.','اصطدم الروبوت! أصلح البرنامج.');await E.wait(.6);reset();busy=false;return}
          pos=[nq,nr];const to=cell(nq,nr);Snd.tone(420,.08,{type:'square',vol:.05});await E.tw(bot.position,{x:to.x,z:to.z},.32,Ease.inOut)}
        if(pos[0]===L.g[0]&&pos[1]===L.g[1]){celebrate('',{at:P.world(star.position),n:2,spread:.6});P.cap('You did it! Your algorithm works.','وصل الروبوت! برنامجك صحيح.');P.done('You programmed the robot!');await E.wait(1.3);busy=false;if(P.alive())level(lv+1)}
        else{P.cap('Not there yet. Add or fix some instructions.','لم يصل بعد.');busy=false}}
      level(0);P.tap(bot,()=>{Snd.pop();Voice.say('Beep boop! Give me instructions.')});P.tag(bot,'Program me ↓',{dy:.95});
      return {chips:[{label:'⬆ Forward',fn:()=>{P.untag(bot);add('F')}},{label:'↶ Turn left',fn:()=>add('L')},{label:'↷ Turn right',fn:()=>add('R')},{label:'▶ Run',cls:'go',fn:run},{label:'⌫ Delete',fn:()=>{if(busy)return;prog.pop();show()}},{label:'⟲ Clear',fn:()=>{if(busy)return;prog=[];reset();show()}}],
        update(dt,t){if(star)star.rotation.y=t*1.5;if(!busy)bot.position.y=Math.abs(Math.sin(t*3))*.03}};
    }},
  practise:{type:'order',title:'An algorithm for a jam sandwich',how:'Tap the instructions in the right order.',ar:'رتّب التعليمات لصنع شطيرة.',
    items:['Get two slices of bread.','Open the jam jar.','Spread jam on one slice with a knife.','Put the other slice on top.','Cut the sandwich in half.','Eat and enjoy!']},
  quiz:[{q:'What is an algorithm?',o:['clear steps in the right order','a robot toy','a kind of computer']},{q:'The robot bumps into a wall. What should we do?',o:['debug the program','give up','turn off the light']},{q:'A keyboard is an…',o:['input','output','algorithm']},{q:'Does the order of the instructions matter?',o:['Yes','No','Only on Fridays']}],
  home:[['Play "human robot": give exact instructions to reach the door.','العبا «الروبوت البشري»: تعليمات دقيقة للوصول إلى الباب.'],['Found a mistake? Debug it and try again!','إذا أخطأ، أصلحا وجرّبا من جديد.']]
};
WC.keys={
  learn:{body:['Your fingers start on the home row:','EX:left hand  A S D F      right hand  J K L ;','F and J have little bumps, so you can find them without looking!','Next we learn the top row: Q W E R T Y U I O P.','The keyboard is an input. The screen is an output.'],
    words:[['keyboard','لوحة المفاتيح'],['home row','الصف الأوسط'],['input','مُدخل'],['output','مُخرج']],
    flap:{q:'Which two keys have little bumps on them?',a:'F and J. Your two pointer fingers rest there.'},
    ar:'الكتابة باللمس: نبدأ بالصف الأوسط ثم العلوي. على F وJ نتوءان صغيران.'},
  try:{hint:'The glowing key pops up: press it, or type it on a real keyboard.',ar:'المفتاح المضيء يرتفع: اضغطه.',
    pop(P){
      const FC={q:'#ff8fb1',a:'#ff8fb1',w:'#c7a6ff',s:'#c7a6ff',e:'#8fc8ff',d:'#8fc8ff',r:'#7fe0c0',t:'#7fe0c0',f:'#7fe0c0',g:'#7fe0c0',y:'#ffd98a',u:'#ffd98a',h:'#ffd98a',j:'#ffd98a',i:'#8fc8ff',k:'#8fc8ff',o:'#c7a6ff',l:'#c7a6ff',p:'#ff8fb1',';':'#ff8fb1'};
      const FN={a:'left little finger',s:'left ring finger',d:'left middle finger',f:'left pointer finger',g:'left pointer finger',h:'right pointer finger',j:'right pointer finger',k:'right middle finger',l:'right ring finger',';':'right little finger',q:'left little finger',w:'left ring finger',e:'left middle finger',r:'left pointer finger',t:'left pointer finger',y:'right pointer finger',u:'right pointer finger',i:'right middle finger',o:'right ring finger',p:'right little finger'};
      const kb=G.box(3.5,.08,1,'#2a2d3a',{metalness:.2});kb.position.set(0,.04,.25);P.root.add(kb);const keys={};
      ['qwertyuiop','asdfghjkl;'].forEach((row,ri)=>[...row].forEach((ch,i)=>{const side=P.m('#e8ecf6');const top=new THREE.MeshStandardMaterial({map:G.glyph(ch.toUpperCase(),{bg:FC[ch],fg:'#1b1f3a',font:FONT_R}),roughness:.5});
        const k=new THREE.Mesh(new THREE.BoxGeometry(.28,.12,.28),[side,side,top,side,side,side]);k.position.set(-1.44+i*.32+ri*.08,.14,ri?.42:.08);P.root.add(k);keys[ch]=k;P.tap(k,()=>press(ch));
        if(ch==='f'||ch==='j'){const b=G.box(.1,.012,.02,'#1b1f3a');b.position.set(0,.065,.07);k.add(b)}}));
      const scr=PK.card(2.6,1.05,null,{pw:640,bg:'#0f1638',edge:'#2a2d3a',back:'#2a2d3a',d:.08});scr.position.set(0,.85,-.75);scr.rotation.x=-.12;P.root.add(scr);const leg=G.box(.18,.4,.08,'#2a2d3a');leg.position.set(0,.2,-.8);P.root.add(leg);
      let typed='',seq=shuffle([...'asdfjkl']).concat(shuffle([...'qwertyuiop']).slice(0,5)),idx=0,ok=0;
      const paint=()=>scr.userData.redraw((x,W,H)=>{x.fillStyle='#0f1638';x.fillRect(0,0,W,H);x.fillStyle='#3ddbb0';PT.fnt(x,26,700,FONT_R);PT.ltr(x);x.fillText('OUTPUT → the screen',24,40);PT.fnt(x,92,700,FONT_R);x.fillStyle='#ffffff';x.fillText(typed.slice(-10)+(Math.floor(performance.now()/500)%2?'|':''),28,180)});
      const tgt=()=>seq[idx%seq.length];
      function mark(){Object.entries(keys).forEach(([ch,k])=>{const on=ch===tgt();k.material[2].emissive.set(on?'#ffd166':'#000');k.material[2].emissiveIntensity=on?.55:0;E.tw(k.position,{y:on?.24:.14},.25,Ease.out)});P.cap(`Press ${tgt().toUpperCase()} with your ${FN[tgt()]}.`,'اضغط المفتاح المضيء.')}
      function press(ch){const k=keys[ch];if(!k)return;E.stopTweens(k.position);k.position.y=.09;E.tw(k.position,{y:.14},.18);
        if(ch===tgt()){typed+=ch;ok++;idx++;Snd.tone(880,.08,{type:'triangle',vol:.1});if(ok===8)P.done('8 keys right!');paint();mark()}else{Snd.bad();P.cap(`That is ${ch.toUpperCase()}. Look for ${tgt().toUpperCase()}.`,'ابحث عن المفتاح المضيء.')}}
      paint();mark();let blink=0;P.tag(keys.a,'👆 Press the glowing key',{dy:.5});
      return {chips:[{label:'🔀 New letters',fn:()=>{seq=shuffle([...'asdfjkl;']).concat(shuffle([...'qwertyuiop']));idx=0;mark()}},{label:'🔊 Hear the letter',fn:()=>Voice.say(tgt()===';'?'semicolon':tgt())}],
        key(e){const ch=(e.key||'').toLowerCase();if(keys[ch]&&!e.metaKey&&!e.ctrlKey){e.preventDefault();press(ch);return true}return false},
        update(dt){blink+=dt;if(blink>.5){blink=0;paint()}}};
    }},
  practise:{type:'pick',title:'Find the home row keys',how:'Tap every key on the home row.',ar:'اضغط مفاتيح الصف الأوسط.',say:false,no:'That key is not on the home row.',
    items:[['A',1],['Q',0],['S',1],['W',0],['D',1],['E',0],['F',1],['M',0],['J',1],['P',0],['K',1],['L',1]]},
  quiz:[{q:'Where do our fingers start?',o:['on the home row','on the top row','on the space bar']},{q:'Which keys have bumps?',o:['F and J','A and L','Q and P']},{q:'The screen is an…',o:['output','input','algorithm']},{q:'Which finger presses A?',o:['left little finger','right thumb','left pointer finger']}],
  home:[['Practise the home row for 5 minutes.','تدرّب على الصف الأوسط 5 دقائق.'],['Type: sad, dad, lads, flask.','اكتب: sad, dad, lads, flask.']]
};
WC.music={
  learn:{body:['Pitch: how high or low a note is. Short bars sound higher.','Tempo: how fast or slow the music is.','EX:🐢 slow  …  🐆 fast','Dynamics: how loud or quiet the music is.','EX:🐭 quiet  …  🦁 loud','A steady pulse is like a heartbeat. It does not suddenly speed up or slow down.'],
    words:[['pitch','حدّة النغمة'],['tempo','السرعة'],['dynamics','قوة الصوت'],['pulse','النبض']],
    flap:{q:'The shortest bar on the xylophone: is it high or low?',a:'High! The shorter the bar, the higher the pitch.'},
    ar:'نتعلّم النبض الثابت، والفرق بين الطبقة (pitch) والسرعة (tempo) وقوة الصوت (dynamics).'},
  try:{hint:'Tap the bars to play. Press Pulse to hear a steady beat, then change the tempo and the dynamics.',ar:'اضغط الأعمدة لتعزف، وشغّل النبض.',
    pop(P){
      const NOTES=[523.25,587.33,659.25,698.46,783.99,880,987.77,1046.5],COL=['#ff5d8f','#ff7b39','#ffd166','#9be36d','#3ddbb0','#6db4ff','#8f78e8','#ff8fb1'];
      [-.62,.32].forEach(z=>{const r=G.box(2.9,.08,.09,'#5a3a26');r.position.set(0,.12,z);P.root.add(r)});
      const bars=NOTES.map((f,i)=>{const len=1.3-i*.075;const b=G.box(.27,.07,len,COL[i],{roughness:.4,metalness:.1});b.position.set(-1.12+i*.32,.2,-.15);b.userData={f,i,k:0};P.root.add(b);P.tap(b,()=>hit(i));return b});
      let taps=0;const notes=[];
      function hit(i){const b=bars[i];Snd.note(b.userData.f,.9,.3);b.userData.k=1;taps++;const s=P.label('♪',{size:.34,bg:null,border:null,color:COL[i],px:70});s.position.set(b.position.x,.5,-.15);P.root.add(s);notes.push({s,t:0});if(taps===6)P.done('You played a tune!');
        P.cap(i<3?'Long bar: low pitch.':i>4?'Short bar: high pitch.':'Middle pitch.',i<3?'عمود طويل = نغمة منخفضة':i>4?'عمود قصير = نغمة عالية':'نغمة متوسطة')}
      const drum=new THREE.Group();const shell=G.cyl(.36,.33,.38,'#c0336a',{},28);shell.position.y=.19;const skin=G.cyl(.35,.35,.03,'#fff7e6',{},28);skin.position.y=.395;skin.userData.noInk=true;const rim=G.mesh(new THREE.TorusGeometry(.355,.025,8,28),P.m('#ffd166',{metalness:.4}));rim.rotation.x=Math.PI/2;rim.position.y=.4;drum.add(shell,skin,rim);drum.position.set(1.05,0,.98);P.root.add(drum);
      let on=false,bpm=80,vol=.55,acc=0;P.tap(drum,()=>{Snd.drum(vol);skin.scale.y=3;if(!on)P.cap('Boom! Press Pulse and the drum keeps a steady beat.','اضغط Pulse لنبض ثابت.')});
      P.tag(bars[0],'👆 Tap the bars',{dy:.4});
      const TW=[0,0,4,4,5,5,4,3,3,2,2,1,1,0],DU=[1,1,1,1,1,1,2,1,1,1,1,1,1,2];
      function tune(){let t=0;for(let i=0;i<TW.length;i++){setTimeout(()=>{if(P.alive())hit(TW[i])},t*380);t+=DU[i]}}
      const say=()=>P.cap(on?`Steady pulse: ${bpm<100?'slow tempo 🐢':'fast tempo 🐆'}, ${vol<.3?'quiet 🐭':'loud 🦁'}.`:'Pulse is off.',on?'نبض ثابت':'');
      return {chips:[{label:'🥁 Pulse',toggle:true,fn:(v)=>{on=v;acc=0;say()}},{id:'slow',label:'🐢 Slow',group:'t',on:true,fn:()=>{bpm=80;say()}},{id:'fast',label:'🐆 Fast',group:'t',fn:()=>{bpm=140;say()}},
        {id:'q',label:'🐭 Quiet',group:'v',fn:()=>{vol=.15;say()}},{id:'l',label:'🦁 Loud',group:'v',on:true,fn:()=>{vol=.55;say()}},{label:'▶ Twinkle',cls:'gold',fn:tune}],
        update(dt){bars.forEach(b=>{const u=b.userData;if(u.k>0){u.k=Math.max(0,u.k-dt*3);b.position.y=.2-Math.sin(u.k*Math.PI)*.05;b.rotation.x=Math.sin(u.k*20)*.04*u.k}});
          for(let i=notes.length-1;i>=0;i--){const n=notes[i];n.t+=dt;n.s.position.y+=dt*.9;n.s.material.opacity=1-n.t;if(n.t>1){P.root.remove(n.s);n.s.material.map.dispose();n.s.material.dispose();notes.splice(i,1)}}
          skin.scale.y+=(1-skin.scale.y)*Math.min(1,dt*10);if(on){acc+=dt;if(acc>=60/bpm){acc-=60/bpm;Snd.drum(vol);skin.scale.y=1+vol*8;drum.scale.setScalar(1+vol*.08)}}drum.scale.lerp(new THREE.Vector3(1,1,1),Math.min(1,dt*8))}};
    }},
  practise:{type:'sort',title:'Loud or quiet?',how:'Tap a sound, then tap Loud or Quiet.',ar:'اضغط الصوت ثم اختر عالٍ أو هادئ.',
    bins:[['Loud','عالٍ','🦁'],['Quiet','هادئ','🐭']],items:[['a lion’s roar','Loud'],['thunder','Loud'],['a big drum','Loud'],['fireworks','Loud'],['a whisper','Quiet'],['a mouse squeak','Quiet'],['tiptoeing','Quiet'],['a ticking clock','Quiet']]},
  quiz:[{q:'Tempo means…',o:['how fast or slow','how loud or quiet','how high or low']},{q:'Dynamics means…',o:['how loud or quiet','how fast or slow','how long']},{q:'Pitch means…',o:['how high or low','how fast or slow','how loud']},{q:'A steady pulse…',o:['stays the same speed','gets faster and faster','stops and starts']}],
  home:[['Clap along to a song and keep a steady pulse.','صفّقا مع أغنية بنبض ثابت.'],['Play it loud, then quiet. Fast, then slow.','عالٍ ثم هادئ، سريع ثم بطيء.']]
};
WC.pe={
  learn:{body:['PE is on Tuesday and Friday. Come to school in your PE kit.','Gymnastics: jumping, rolling, balancing and moving in sequences.','EX:shapes: star · tuck · pencil · straddle · pike','Target games: aim, throw and roll with accuracy and control.'],
    words:[['aim','صوِّب'],['throw','ارمِ'],['balance','توازن'],['tuck','تكوّر'],['accuracy','دقة']],
    flap:{q:'What does a tuck shape look like?',a:'Curled up small: knees to your chest, arms around them.'},
    ar:'الرياضة يومي الثلاثاء والجمعة بزي الرياضة: تيشيرت بلون البيت، شورت كحلي، حذاء رياضي.'},
  try:{hint:'Drag the beanbag back towards you, then let go to throw it at the target!',ar:'اسحب الكيس نحوك ثم اتركه.',
    pop(P){
      const T0=new THREE.Vector3(0,0,-1.05);[[.95,'#6db4ff'],[.62,'#ff5d8f'],[.3,'#ffd166']].forEach(([r,c],i)=>{const d=G.cyl(r,r,.02,c,{roughness:.8},40);d.position.set(T0.x,.01+i*.012,T0.z);d.userData.noInk=true;P.root.add(d)});
      [['2',.8],['5',.47],['10',0]].forEach(([t,o])=>{const l=P.label(t,{size:.2,px:48});l.position.set(o,.25,T0.z);P.root.add(l)});
      const S0=new THREE.Vector3(0,.07,1.25);const bag=G.box(.26,.13,.26,'#ff7b39',{roughness:.95});bag.position.copy(S0);P.root.add(bag);
      const aim=[];for(let i=0;i<8;i++){const s=G.sph(.035,'#2d2219',{},8);s.visible=false;s.userData.noInk=true;P.root.add(s);aim.push(s)}
      let pull=null,fly=null,total=0;const marks=[];
      P.drag(bag,{plane:'y',tagText:'✋ Pull back, let go',tagDy:.4,start(){if(fly)return;pull=new THREE.Vector3()},move(lp){if(fly||!pull)return;pull.set(clamp(lp.x-S0.x,-.8,.8),0,clamp(lp.z-S0.z,0,.95));bag.position.set(S0.x+pull.x*.5,.07,S0.z+pull.z*.5);
          const vx=-pull.x*4.2,vz=-pull.z*4.4,vy=3;aim.forEach((s,i)=>{const t=(i+1)*.07;s.visible=true;s.position.set(bag.position.x+vx*t,.07+vy*t-4.9*t*t,bag.position.z+vz*t)})},
        end(){aim.forEach(s=>s.visible=false);if(!pull||pull.z<.1){pull=null;bag.position.copy(S0);return}fly={v:new THREE.Vector3(-pull.x*4.2,3,-pull.z*4.4)};pull=null;Snd.whoosh()}});
      return {chips:[{label:'↺ Reset the score',fn:()=>{total=0;marks.forEach(m=>P.root.remove(m));marks.length=0;P.cap('Score: 0. Pull back and let go!','اسحب الكيس نحوك ثم اتركه.')}}],capEn:'Pull the beanbag back and let go!',capAr:'اسحب ثم اترك.',
        update(dt){if(!fly)return;fly.v.y-=9.8*dt;bag.position.addScaledVector(fly.v,dt);bag.rotation.x+=dt*6;if(bag.position.y<=.07){bag.position.y=.07;const d=Math.hypot(bag.position.x-T0.x,bag.position.z-T0.z);const pts=d<.3?10:d<.62?5:d<.95?2:0;total+=pts;fly=null;
            const m=G.cyl(.08,.08,.01,'#2d2219',{},12);m.position.set(bag.position.x,.045,bag.position.z);m.userData.noInk=true;P.root.add(m);marks.push(m);
            if(pts){Snd.good();FX.sparkle(P.world(bag.position),{n:20});P.done('You hit the target!')}else Snd.bad();P.cap(pts?`+${pts} points! Score: ${total}`:`Missed! Try a smaller or bigger pull. Score: ${total}`,pts?'أصبت الهدف!':'خارج الهدف');Voice.say(pts?pts+' points!':'Try again!');
            setTimeout(()=>{if(!P.alive())return;bag.rotation.set(0,0,0);bag.position.copy(S0)},900)}}};
    }},
  practise:{type:'pick',title:'Pack your PE bag',how:'Tap everything you wear on PE days.',ar:'اضغط ما نلبسه يوم الرياضة.',no:'Not for PE!',
    items:[['👕 house-colour T-shirt',1],['🩳 navy shorts',1],['👟 trainers',1],['🧥 school jumper',1],['👗 party dress',0],['🥾 wellies',0],['🕶️ sunglasses',0],['🩴 flip-flops',0]]},
  quiz:[{q:'When is PE?',o:['Tuesday and Friday','Monday only','every day']},{q:'A star shape is…',o:['arms and legs spread wide','curled up small','lying down flat']},{q:'"Accuracy" in throwing means…',o:['hitting the target','throwing far','throwing fast']},{q:'What colour is your PE T-shirt?',o:['your house colour','black','any colour']}],
  home:[['Pack the PE kit on Monday and Thursday evenings.','حضّرا حقيبة الرياضة مساء الاثنين والخميس.'],['Throw rolled-up socks into a basket from different steps.','ارمِ جوارب ملفوفة في سلّة من مسافات مختلفة.']]
};
/* ===== Chapter 6 · RE · PSHE · Values ===== */
WC.kindness={
  learn:{body:['We learn how people of different religions show kindness and care for others.','Sharing, giving and helping people who need it.','EX:Islam: Zakat · Christianity: the Good Samaritan · Sikhism: Langar','Empathy means imagining how someone else feels. Gratitude means saying thank you for what we have.'],
    words:[['kind','لطيف'],['share','يشارك'],['empathy','تعاطف'],['grateful','ممتنّ'],['generous','كريم']],
    flap:{q:'Your friend is sad because they are playing alone. What do you do?',a:'Ask them to play with you. That is kindness and empathy.'},
    ar:'نتعلّم المشاركة والعطاء ومساعدة المحتاجين، وكيف تعبّر الأديان المختلفة عن ذلك.'},
  try:{hint:'Press a kind act and watch a heart drop into the jar.',ar:'اختر عملاً لطيفاً وشاهد القلب يسقط في الجرّة.',
    pop(P){
      const pts=[];for(let i=0;i<=16;i++){const t=i/16;pts.push(new THREE.Vector2(t<.06?.05+t*11:t>.85?.72-(t-.85)*2.4:.72,t*1.55))}
      const jar=G.mesh(new THREE.LatheGeometry(pts,32),new THREE.MeshStandardMaterial({color:new THREE.Color('#cfefff'),transparent:true,opacity:.28,roughness:.08,side:THREE.DoubleSide,depthWrite:false}));jar.userData.noInk=true;jar.renderOrder=5;P.root.add(jar);
      const lid=G.cyl(.4,.4,.1,'#ffd166',{metalness:.4,roughness:.3},28);lid.position.y=1.6;P.root.add(lid);
      const tag=PK.card(.9,.36,null,{pw:384,bg:'#fff5df'});tag.position.set(0,.75,.74);P.root.add(tag);
      const slot=i=>{const L=Math.floor(i/7),a=(i%7)/7*Math.PI*2+L*.45,r=i%7===0&&L%2?0:.38;return new THREE.Vector3(Math.cos(a)*r,.13+L*.16,Math.sin(a)*r)};
      const heart=()=>{const h=G.heart(.11,'#ff5d8f',.08,{emissive:'#7a1033',emissiveIntensity:.25});h.userData.noInk=true;h.castShadow=true;return h};
      const draw=()=>tag.userData.redraw((x,W,H)=>{x.strokeStyle='#c0336a';x.lineWidth=6;x.strokeRect(4,4,W-8,H-8);x.fillStyle='#c0336a';PT.fnt(x,36,800,FONT_R);PT.ltr(x,'center');x.fillText('Kindness Jar',W/2,H*.45);PT.fnt(x,40,800,FONT_D);x.fillText('♥ '+Store.s.jar.length,W/2,H*.85)});
      for(let i=0;i<Math.min(Store.s.jar.length,40);i++){const h=heart();h.position.copy(slot(i));h.rotation.set(rand(-.4,.4),rand(0,6),rand(-.4,.4));P.root.add(h)}draw();
      function add([en,ar]){Store.s.jar.push({t:en,d:ymd(today())});Store.save();draw();const i=Store.s.jar.length-1;Snd.good();P.cap(en+'! A new heart in the jar.',ar);Voice.say(en);
        if(i<40){const h=heart();h.position.set(0,2.4,0);P.root.add(h);arc(h,slot(i),.8,.2,Ease.out).then(()=>{if(P.alive())FX.sparkle(P.world(new THREE.Vector3(0,1.7,0)),{colors:['#ff8fb1','#ffd166','#fff'],n:18})})}P.done('You added a kind act!')}
      return {chips:[...KIND.slice(0,5).map(k=>({label:k[0],fn:()=>add(k)})),{label:'🎲 Another kind act',cls:'gold',fn:()=>add(pick(KIND.slice(5)))}],capEn:'Every kind act puts a heart in the jar.',capAr:'كل عمل لطيف قلب في الجرّة.',update(dt,t){lid.rotation.y=Math.sin(t)*.05}};
    }},
  practise:{type:'pick',title:'Find the kind actions',how:'Tap every kind action.',ar:'اضغط كل عمل لطيف.',no:'Is that kind? Think again.',
    items:[['share my toys',1],['help at home',1],['push in the line',0],['say thank you',1],['shout at a friend',0],['invite someone to play',1],['take the biggest piece',0],['help a younger child',1]]},
  quiz:[{q:'"Generous" means…',o:['happy to share and give','always first','very fast']},{q:'In Sikhism, the Langar is…',o:['a free kitchen for everyone','a song','a holiday']},{q:'Empathy means…',o:['imagining how others feel','running fast','being loud']},{q:'The Good Samaritan…',o:['helped a hurt stranger','won a race','built a house']}],
  home:[['Talk: how can we help someone who is sad, ill or hungry?','تحدّثا: كيف نساعد حزيناً أو مريضاً أو جائعاً؟'],['Choose one thing to share this week.','اختارا شيئاً تشاركانه هذا الأسبوع.']]
};
WC.safety={
  learn:{body:['We learn about everyday dangers at home and outside, and how to keep safe.','Online, your name, address, school and photos are private.','If something worries you, tell a trusted adult.','Trusted adults: five people on your hand you can tell anything.','PANTS: your body belongs to you, no means no, and talk about secrets that upset you.'],
    words:[['safe','آمن'],['danger','خطر'],['trusted adult','شخص بالغ موثوق'],['private','خاص']],
    flap:{q:'Someone online asks for your address. What do you do?',a:'Do not tell them. Show a trusted adult.'},
    ar:'الأمان في البيت والشارع وعلى الإنترنت، والكبار الموثوقون. دليل NSPCC (PANTS) متاح بلغات عدة.'},
  try:{hint:'Find 5 dangers in the room and tap them. Press Kettle to switch the kettle on.',ar:'ابحث عن 5 مخاطر واضغطها.',
    pop(P){
      const floor=G.box(3.2,.06,2.5,'#c9a46b',{roughness:.85});floor.position.y=.03;const wb=G.box(3.2,.8,.06,'#f3e7cf');wb.position.set(0,.43,-1.22);const ws=G.box(.06,.8,2.5,'#eadcbf');ws.position.set(-1.58,.43,0);P.root.add(floor,wb,ws);
      const found=new Set();const ring=(p)=>{const r=G.mesh(new THREE.TorusGeometry(.26,.03,8,28),P.m('#3ddbb0',{emissive:'#16866b',emissiveIntensity:.8}));r.position.copy(p);r.userData.noInk=true;P.root.add(r);return r};
      const H=(k)=>HAZ.find(h=>h.k===k);
      function found1(k,p,o){const h=H(k);Snd.pop();Voice.say(h.o[0]);if(!found.has(k)){found.add(k);const r=ring(p);r.rotation.x=o||0;E.tw(r.scale,{x:1.2,y:1.2,z:1.2},.3,Ease.back)}
        P.cap(`${h.en} → ${h.o[0]}. (${found.size}/5)`,h.why);if(found.size>=5)P.done('You found all the dangers!')}
      const counter=G.box(1.05,.62,.5,'#e6eef6');counter.position.set(-.95,.37,-.92);P.root.add(counter);
      const kettle=new THREE.Group();const kb=G.cyl(.15,.19,.3,'#c9cfe0',{metalness:.4,roughness:.3},20);kb.position.y=.15;const sp=G.cyl(.03,.04,.22,'#c9cfe0',{metalness:.4});sp.position.set(.2,.18,0);sp.rotation.z=-.9;const hd=G.mesh(new THREE.TorusGeometry(.1,.02,8,16,Math.PI),P.m('#2d2219'));hd.position.set(-.04,.32,0);
      const led=G.sph(.025,'#333',{emissive:'#000'});led.position.set(-.1,.08,.16);kettle.add(kb,sp,hd,led);kettle.position.set(-.95,.68,-.92);P.root.add(kettle);let boil=0;
      P.tap(kettle,()=>found1('hob',new THREE.Vector3(-.95,.98,-.92),Math.PI/2));
      const sock=G.box(.3,.3,.03,'#ffffff');sock.position.set(.35,.32,-1.18);[-.06,.06].forEach(x=>{const h=G.box(.03,.07,.02,'#2d2219');h.position.set(x,0,.02);sock.add(h)});P.root.add(sock);P.tap(sock,()=>{found1('plug',new THREE.Vector3(.35,.32,-1.1));FX.sparkle(P.world(new THREE.Vector3(.35,.35,-1.1)),{colors:['#ffd166','#ffffff'],n:14})});
      const shelf=G.box(.85,.05,.28,'#8a5a36');shelf.position.set(1.05,.62,-1.05);const med=G.cyl(.07,.07,.2,'#ff7b39',{roughness:.3},16);med.position.set(1.05,.75,-1.05);const cp=G.cyl(.075,.075,.05,'#ffffff');cp.position.set(1.05,.88,-1.05);P.root.add(shelf,med,cp);P.tap(med,()=>found1('med',new THREE.Vector3(1.05,.8,-.9)));
      const steps=new THREE.Group();for(let i=0;i<3;i++){const s=G.box(.7,.18,.3,'#b07a4f');s.position.set(0,.09+i*.18,-i*.3);steps.add(s)}steps.position.set(1.1,.06,.25);P.root.add(steps);const toy=G.sph(.1,'#ff5d8f');toy.position.set(1.0,.34,.3);P.root.add(toy);P.tap(toy,()=>found1('stairs',new THREE.Vector3(1.0,.34,.3),Math.PI/2));
      const tab=G.box(.42,.03,.3,'#1b1f3a',{roughness:.3});tab.position.set(-.35,.075,.55);const glow=G.box(.36,.005,.24,'#6db4ff',{emissive:'#2f6fb3',emissiveIntensity:.9});glow.position.y=.018;tab.add(glow);P.root.add(tab);P.tap(tab,()=>found1('tablet',new THREE.Vector3(-.35,.1,.55),Math.PI/2));P.tag(kettle,'👆 Tap the dangers',{dy:.55});
      return {chips:[{label:'♨️ Kettle on',cls:'gold',fn:()=>{boil=3.5;led.material.emissive.set('#ff3b2f');led.material.emissiveIntensity=1.5;Snd.tone(900,1.6,{type:'sine',slide:1600,vol:.05});P.cap('The kettle is boiling. Steam is very hot: keep away!','البخار ساخن جداً.')}},{label:'🔍 How many?',fn:()=>P.cap(`You have found ${found.size} of 5 dangers.`,'كم وجدت؟')}],capEn:'Find 5 dangers in the room.',capAr:'ابحث عن 5 مخاطر.',
        update(dt){if(boil>0){boil-=dt;const w=P.world(new THREE.Vector3(-.72,.98,-.92));for(let k=0;k<2;k++)FX.sys.emit({x:w.x,y:w.y,z:w.z,vx:rand(.1,.4),vy:rand(.8,1.4),vz:rand(-.1,.1),life:1.1,s0:.12,s1:.5,c0:[1,1,1,.55],c1:[1,1,1,0],drag:.5});if(boil<=0){led.material.emissive.set('#000')}}}};
    }},
  practise:{type:'sort',title:'Safe or not safe?',how:'Tap an action, then tap Safe or Not safe.',ar:'اضغط التصرف ثم اختر: آمن أو غير آمن.',
    bins:[['Safe','آمن','✅'],['Not safe','غير آمن','⛔']],items:[['tell a trusted adult','Safe'],['hold hands to cross the road','Safe'],['ask before you click','Safe'],['touch a hot pan','Not safe'],['tell a stranger your address','Not safe'],['eat tablets that look like sweets','Not safe']]},
  quiz:[{q:'Who do we tell if something worries us?',o:['a trusted adult','nobody','a stranger']},{q:'Someone online asks for your school. What do you do?',o:['Do not tell. Show an adult.','Tell them','Send a photo']},{q:'"No means no" means…',o:['you can say no about your body','you must always say yes','nothing']},{q:'Before crossing the road…',o:['stop, look and listen','run quickly','close your eyes']}],
  home:[['Draw your safety hand with five trusted adults.','ارسما يد الأمان بخمسة كبار موثوقين.'],['Have a short, calm chat about keeping safe.','حديث قصير وهادئ عن الأمان.']]
};
WC.magpie={
  learn:{body:['Our Motivated Magpie is focused, joins in and never gives up.','We celebrate what we do well.','Our eight school values:','EX:Aspiration · Respect · Inclusion · Responsibility · Collaboration · Excellence · Growth · Integrity'],
    words:[['focused','مركّز'],['engaged','مشارك'],['persevere','لا يستسلم'],['values','قيم']],
    flap:{q:'I got a sum wrong. What does the Motivated Magpie say?',a:'"I will not give up! Mistakes help my brain grow." That is Growth.'},
    ar:'العقعق المتحمّس: مركّز، مشارك، لا يستسلم. وقيم المدرسة الثماني.'},
  try:{hint:'Tap a gem: the magpie flies to it and tells you the value.',ar:'اضغط جوهرة لتطير إليها العقعقة.',
    pop(P){
      const perch=G.cyl(.05,.07,.7,'#6b4428');perch.position.y=.35;const br=G.cyl(.035,.035,.7,'#6b4428');br.rotation.z=Math.PI/2;br.position.y=.7;P.root.add(perch,br);
      const mag=makeMagpie();mag.scale.setScalar(.42);mag.position.set(0,.92,0);P.root.add(mag);mag.traverse(o=>o.userData.noInk=true);mag.userData.fold();
      const GC=['#ff5d8f','#ffd166','#3ddbb0','#6db4ff','#b29bff','#ff7b39','#9be36d','#7fe0ff'];const gems=VALUES.map((v,i)=>{const a=i/VALUES.length*Math.PI*2+Math.PI/8;const p=new THREE.Vector3(Math.cos(a)*1.35,0,Math.sin(a)*1.2+.05);
        const ped=G.cyl(.12,.15,.22,'#e7d2b0');ped.position.set(p.x,.11,p.z);const gm=G.mesh(new THREE.OctahedronGeometry(.16),G.m(GC[i],{metalness:.2,roughness:.15,flatShading:true,emissive:GC[i],emissiveIntensity:.25}));gm.scale.y=1.4;gm.position.set(p.x,.42,p.z);P.root.add(ped,gm);P.tap(gm,()=>fly(i));P.tap(ped,()=>fly(i));return {gm,p}});
      let busy=false,flapT=0;const seen=new Set();
      async function fly(i){if(busy)return;busy=true;P.untag(gems[0].gm);const v=VALUES[i],g=gems[i];P.cap(`${v[0]}: ${v[2]}`,`${v[1]}: ${v[3]}`);Voice.say(v[0]+'. '+v[2]);flapT=1;const to=new THREE.Vector3(g.p.x,.78,g.p.z);mag.lookAt(P.world(to));
        await arc(mag,to,.9,.8);flapT=0;mag.userData.fold();E.tw(g.gm.scale,{x:1.5,y:2,z:1.5},.3,Ease.back).then(()=>E.tw(g.gm.scale,{x:1,y:1.4,z:1},.4));FX.sparkle(P.world(g.gm.position),{n:22});seen.add(i);if(seen.size>=4)P.done('You found 4 values!');busy=false}
      P.tap(mag,()=>{Snd.pop();Voice.say('I never give up!');P.cap('I am the Motivated Magpie: focused, I join in, and I never give up!','العقعق المتحمّس')});
      P.tag(gems[0].gm,'👆 Tap a gem',{dy:.42});
      return {chips:[{label:'🏠 Back to the branch',fn:async()=>{if(busy)return;busy=true;flapT=1;await arc(mag,new THREE.Vector3(0,.92,0),.8,.6);flapT=0;mag.userData.fold();busy=false}},{label:'🔊 All 8 values',fn:()=>Voice.say(VALUES.map(v=>v[0]).join(', '),{rate:.8})}],capEn:'Our 8 school values. Tap a gem!',capAr:'قيم المدرسة الثماني.',
        update(dt,t){gems.forEach((g,i)=>g.gm.rotation.y=t*1.2+i);if(flapT)mag.userData.flap(t*22,.9);else mag.position.y+=Math.sin(t*3)*.0015}};
    }},
  practise:{type:'match',title:'Match the value',how:'Tap a value on the left, then what it means on the right.',ar:'طابق القيمة مع معناها.',
    pairs:[['Respect','Be kind and polite'],['Collaboration','Work as a team'],['Integrity','Be honest'],['Growth','Mistakes help me grow'],['Inclusion','Everyone belongs']]},
  quiz:[{q:'The Motivated Magpie…',o:['is focused and never gives up','gives up quickly','does not listen']},{q:'Integrity means…',o:['being honest','running fast','drawing']},{q:'Collaboration means…',o:['working together','working alone','sleeping']},{q:'When I make a mistake…',o:['I learn and my brain grows','I stop trying','I hide it']}],
  home:[['Every evening ask: "What did you do well today?"','كل مساء اسألا: What did you do well today?'],['Pick one value to practise this week.','اختارا قيمة واحدة لهذا الأسبوع.']]
};
/* ===== closing spread: a bonfire for Bonfire Night ===== */
WC._end={
  ink:false,scale:1,
  pop(P){
    const g=new THREE.Group();P.root.add(g);for(let i=0;i<9;i++){const a=i/9*Math.PI*2;const s=G.mesh(new THREE.DodecahedronGeometry(.1),G.m('#6b6f86',{flatShading:true}));s.position.set(Math.cos(a)*.34,.06,Math.sin(a)*.24);g.add(s)}
    for(let i=0;i<4;i++){const l=G.cyl(.04,.05,.5,'#6a4128');l.rotation.z=Math.PI/2.6;l.rotation.y=i*Math.PI/2;l.position.y=.14;g.add(l)}
    const fl=new Particles(260,{tex:FX.soft});P.root.add(fl.points);
    const show=()=>{Snd.whoosh();for(let k=0;k<5;k++)setTimeout(()=>{if(!P.alive())return;const from=P.world(new THREE.Vector3(0,.3,0));FX.rocket(from,new THREE.Vector3(rand(-4,4),rand(4.5,7),rand(-2.5,1)),{sound:k%2===0,n:130})},k*240)};
    P.tap(g,show);P.tag(g,'👆 Tap the bonfire',{dy:.6});
    return {chips:[{label:'🎆 Fireworks',cls:'gold',fn:show},{label:'📖 Contents',fn:()=>Book.st&&Book.st.go(1,'L')},{label:"👪 Parents' page",fn:()=>App.go('parent')}],
      update(dt,t){for(let k=0;k<2;k++)fl.emit({x:rand(-.1,.1),y:.15,z:rand(-.1,.1),vx:rand(-.05,.05),vy:rand(.5,.9),vz:rand(-.05,.05),life:rand(.5,.9),s0:rand(.3,.45),s1:.03,c0:Math.random()<.5?[1,.62,.2,.9]:[1,.38,.12,.85],c1:[.9,.15,.05,0],drag:.6});fl.update(dt)}};
  }
};

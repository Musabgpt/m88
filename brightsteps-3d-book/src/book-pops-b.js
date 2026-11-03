/* ===== Maths ===== */
PAGES.blocks={
  body:['كل عصا = 10 (عشرة)، وكل مكعب صغير = 1 (آحاد).','عندما تتجمّع 10 مكعبات نبدّلها بعصا واحدة: هذا هو «التبديل» (exchange).','وفي الطرح: إذا لم تكفِ الآحاد نكسر عصا إلى 10 مكعبات.','مثال: 27 + 5 ← 7 + 5 = 12 آحاد = عشرة جديدة و2، فالجواب 32.'],
  words:[['tens','عشرات'],['ones','آحاد'],['exchange','تبديل'],['partition','تجزئة']],
  flap:{q:'معك 3 عشرات و12 آحاد. ما العدد؟',a:'42 — نبدّل 10 آحاد بعصا: 4 عشرات و2 آحاد.'},
  home:'استعملا أعواد المعكرونة كعشرات وحبّات الفاصولياء كآحاد، واصنعا أعداداً.',
  hint:'أضف مكعبات بزر +1. عندما تصل إلى 10 مكعبات تتحوّل إلى عصا!',
  mat(x,a){PT.fnt(x,30,800,FONT_D);x.fillStyle='rgba(163,105,11,.8)';PT.rtl(x);let [X,Y]=a.px(1.5,1.38);x.fillText('الآحاد · ones',X,Y);[X,Y]=a.px(.25,1.38);x.fillText('العشرات · tens',X,Y);
    x.strokeStyle='rgba(163,105,11,.45)';x.lineWidth=3;x.setLineDash([10,8]);const [x0,y0]=a.px(.45,-1.5),[x1,y1]=a.px(.45,1.15);x.beginPath();x.moveTo(x0,y0);x.lineTo(x1,y1);x.stroke();x.setLineDash([]);
    for(let r=0;r<2;r++)for(let j=0;j<5;j++){const [cx,cy]=a.px(.75+j*.2,.15+r*.2);x.strokeStyle='rgba(47,111,179,.35)';x.lineWidth=2;x.strokeRect(cx-22,cy-22,44,44)}},
  pop(P){
    const S=.16,PI=.168;const geo=new THREE.BoxGeometry(S,S,S);geo.userData={keep:true};const mT=P.m('#ffb84d'),mO=P.m('#7cc4ff');mT.userData.keep=mO.userData.keep=true;
    let n=27,rods=[],ones=[],busy=false;const lab=P.label('27',{size:.42,px:80});lab.position.set(1.15,.62,-.5);P.root.add(lab);
    const rodPos=i=>new THREE.Vector3(-1.4+i*.2,0,-.12),onePos=i=>new THREE.Vector3(.75+(i%5)*.2,S/2+(i>=10?S:0),.15+Math.floor((i%10)/5)*.2);
    const inRod=k=>new THREE.Vector3(0,S/2,-.76+k*PI);
    const cube=(m)=>{const c=new THREE.Mesh(geo,m);c.castShadow=true;P.ink(c);return c};
    const rod=()=>{const g=new THREE.Group();for(let k=0;k<10;k++){const c=cube(mT);c.position.copy(inRod(k));g.add(c)}return g};
    function sync(){const t=Math.floor(n/10),o=n%10;while(rods.length>t){P.root.remove(rods.pop())}while(rods.length<t){const r=rod();r.position.copy(rodPos(rods.length));P.root.add(r);rods.push(r)}
      while(ones.length>o){P.root.remove(ones.pop())}while(ones.length<o){const c=cube(mO);c.position.copy(onePos(ones.length));P.root.add(c);ones.push(c)}show()}
    function show(){const t=Math.floor(n/10),o=n%10;lab.userData.set(String(n));P.cap(`${n} = ${t} tens + ${o} ones`,`${n} = ${t} عشرات و${o} آحاد`)}
    async function add1(){if(busy)return;if(n>=99){Snd.bad();return}busy=true;const c=cube(mO);c.position.copy(onePos(ones.length));c.position.y+=1;P.root.add(c);ones.push(c);Snd.pop();await E.tw(c.position,{y:onePos(ones.length-1).y},.3,Ease.bounce);n++;
      if(ones.length>=10){P.cap('10 ones → 1 ten!','عشرة آحاد! نبدّلها بعصا واحدة…');await E.wait(.25);const to=rodPos(rods.length);Snd.whoosh();
        await Promise.all(ones.map((c,k)=>arc(c,inRod(k).add(to),.55+k*.03,.8)));ones.forEach(c=>P.root.remove(c));ones=[];const r=rod();r.position.copy(to);P.root.add(r);rods.push(r);
        FX.sparkle(P.world(new THREE.Vector3(to.x,.4,to.z)),{n:24});Snd.good();P.done('بدّلت 10 آحاد بعشرة!')}
      busy=false;show()}
    async function sub1(){if(busy)return;if(n<=0){Snd.bad();return}busy=true;if(!ones.length){const r=rods.pop();P.cap('Exchange: 1 ten → 10 ones','لا توجد آحاد: نكسر عصا إلى 10 مكعبات');const wp=r.position.clone();P.root.remove(r);
        for(let k=0;k<10;k++){const c=cube(mO);c.position.copy(inRod(k).add(wp));P.root.add(c);ones.push(c)}Snd.whoosh();await Promise.all(ones.map((c,k)=>arc(c,onePos(k),.5+k*.03,.6)))}
      const c=ones.pop();await E.tw(c.position,{y:c.position.y+.8},.22);P.root.remove(c);n--;Snd.tick();busy=false;show()}
    async function add10(){if(busy||n>89){if(n>89)Snd.bad();return}busy=true;const r=rod();const to=rodPos(rods.length);r.position.set(to.x,1.1,to.z);P.root.add(r);rods.push(r);await E.tw(r.position,{y:0},.35,Ease.bounce);n+=10;busy=false;show();Snd.pop()}
    async function sub10(){if(busy)return;if(n<10){Snd.bad();return}busy=true;const r=rods.pop();await E.tw(r.position,{y:1.2},.3);P.root.remove(r);n-=10;busy=false;show()}
    sync();P.tap(lab,()=>Voice.say(String(n)));
    return {chips:[{label:'+1',fn:add1},{label:'+10',fn:add10},{label:'−1',fn:sub1},{label:'−10',fn:sub10},{label:'🎲 عدد جديد',fn:()=>{if(busy)return;n=randi(11,68);sync()}}],update(dt,t){lab.position.y=.62+Math.sin(t*2)*.04}};
  }
};
PAGES.dice={
  body:['جمع ثلاثة أعداد بحيلة ذكية: كوّن 10 أولاً!','ابحث عن عددين مجموعهما 10، مثل 4 و6، ثم أضف الثالث.','أو ابحث عن ضِعف: 4 + 4 = 8.','أصدقاء العشرة: 1+9 · 2+8 · 3+7 · 4+6 · 5+5'],
  words:[['add','اجمع'],['total','المجموع'],['double','ضِعف'],['ten frame','إطار العشرة']],
  flap:{q:'كم يساوي 4 + 7 + 6؟ وأين صديقا العشرة؟',a:'4 و6 = 10، ثم 10 + 7 = 17.'},
  home:'ارميا ثلاثة نرود حقيقية وتسابقا: من يجد صديقَي العشرة أولاً؟',
  hint:'اضغط النرد لترميه. يمتلئ إطار العشرة بالعدّادات: صديقا العشرة أولاً.',
  mat(x,a){for(let f=0;f<2;f++)for(let r=0;r<2;r++)for(let c=0;c<5;c++){const [cx,cy]=a.px((f?.25:-1.55)+c*.3+.15,.42+r*.3);x.fillStyle='#fffaf0';x.fillRect(cx-34,cy-34,68,68);x.strokeStyle='#a3690b';x.lineWidth=4;x.strokeRect(cx-34,cy-34,68,68)}
    PT.fnt(x,26,700,FONT_R);PT.ltr(x,'center');x.fillStyle='rgba(163,105,11,.85)';let [X,Y]=a.px(-.8,1.25);x.fillText('ten frame 1',X,Y);[X,Y]=a.px(1,1.25);x.fillText('ten frame 2',X,Y)},
  pop(P){
    const dice=[0,1,2].map(i=>{const d=Dice.make(.55);d.position.set((i-1)*.95,.275,-.75);d.rotation.set(rand(0,3),rand(0,3),0);P.root.add(d);return d});let vals=[3,4,6],busy=false,counters=[];
    const cell=i=>{const f=i<10?0:1,k=i%10,r=Math.floor(k/5),c=k%5;return new THREE.Vector3((f?.25:-1.55)+c*.3+.15,.04,.42+r*.3)};const cols=['#ff7b39','#6db4ff','#3ddbb0'];const cg=new THREE.CylinderGeometry(.11,.11,.06,18);cg.userData={keep:true};
    async function roll(){if(busy)return;busy=true;counters.forEach(c=>P.root.remove(c));counters=[];
      if(Math.random()<.6){const a=randi(4,6);vals=shuffle([a,10-a,randi(1,6)]).map(v=>Math.min(6,v));}else vals=[randi(1,6),randi(1,6),randi(1,6)];
      await Promise.all(dice.map((d,i)=>Dice.roll(d,vals[i],{h:.275,lift:1.4})));
      let pair=null;for(let i=0;i<3&&!pair;i++)for(let j=i+1;j<3;j++)if(vals[i]+vals[j]===10){pair=[i,j];break}
      const order=pair?[pair[0],pair[1],3-pair[0]-pair[1]]:[0,1,2];let k=0;
      for(const di of order){for(let q=0;q<vals[di];q++){const c=new THREE.Mesh(cg,P.m(cols[di]));c.castShadow=true;c.position.copy(dice[di].position);P.root.add(c);counters.push(c);arc(c,cell(k),.35,.6);k++;Snd.tick();await E.wait(.06)}}
      const sum=vals[0]+vals[1]+vals[2];const dbl=vals[0]===vals[1]||vals[1]===vals[2]||vals[0]===vals[2];
      if(pair){const o=vals[order[2]];P.cap(`${vals[order[0]]} + ${vals[order[1]]} = 10 → 10 + ${o} = ${sum}`,'وجدنا صديقَي العشرة! الإطار الأول ممتلئ.');Snd.good();P.done('كوّنت 10 أولاً!')}
      else P.cap(`${vals.join(' + ')} = ${sum}`,dbl?'لا يوجد صديقا عشرة، لكن هناك ضِعف! ابدأ به.':'لا يوجد صديقا عشرة هذه المرة: ابدأ بالأكبر ثم أضف.');
      Voice.say(`${vals.join(' plus ')} equals ${sum}`);busy=false}
    dice.forEach(d=>P.tap(d,roll));
    return {chips:[{label:'🎲 ارمِ النرد',cls:'gold',fn:roll}],capEn:'Make 10 first!'};
  }
};
PAGES.balance={
  body:['علامة = تعني «متوازن»: ما على اليسار يساوي ما على اليمين.','لإيجاد العدد المفقود نستعمل العملية العكسية: الطرح يفكّ الجمع.','عائلة الأعداد من 12 و9 و21: 12 + 9 = 21 · 9 + 12 = 21 · 21 − 9 = 12 · 21 − 12 = 9','تنبيه: في واجب الكتيّب كُتب 12 + 9 = 23، والصحيح 21.'],
  words:[['equals','يساوي'],['missing number','العدد المفقود'],['fact family','عائلة الأعداد']],
  flap:{q:'□ + 9 = 21. ما العدد المفقود؟',a:'12 — لأن 21 − 9 = 12.'},
  home:'اكتبا عائلة أعداد على ورقة، وغطّيا عدداً واحداً ليخمّنه الآخر.',
  hint:'اختر العدد للكفّة اليمنى من الأزرار حتى يتوازن الميزان.',
  pop(P){
    const st=G.cyl(.5,.6,.1,'#6b7290',{metalness:.4},28);st.position.y=.05;const post=G.cyl(.06,.08,1.25,'#6b7290',{metalness:.5});post.position.y=.68;const knob=G.sph(.1,'#ffd166',{metalness:.6,roughness:.3});knob.position.y=1.32;P.root.add(st,post,knob);
    const beam=new THREE.Group();beam.position.y=1.3;const bar=G.box(2.9,.08,.12,'#8a5a36');beam.add(bar);P.root.add(beam);
    const pans=[-1,1].map(s=>{const p=new THREE.Group();p.position.set(s*1.3,0,0);[-.15,.15].forEach(z=>{const str=G.cyl(.008,.008,.62,'#2d2219');str.position.set(0,-.31,z);p.add(str)});const plate=G.cyl(.46,.4,.05,'#c9cfe0',{metalness:.6,roughness:.3},28);plate.position.y=-.64;p.add(plate);beam.add(p);return p});
    const left=txtCard(.82,.4,'12 + 9',{pw:448,bg:'#fff5df',d:.32});left.position.set(0,-.41,0);pans[0].add(left);
    const right=txtCard(.6,.4,'?',{pw:320,bg:'#e2f6ff',d:.32});right.position.set(0,-.41,0);pans[1].add(right);
    let val=0,ang=0,vel=0;const target=()=>val?clamp((21-val)*.06,-.28,.28):.28;
    function setV(v){val=v;right.userData.redraw((x,W,H)=>{x.fillStyle='#e2f6ff';x.fillRect(0,0,W,H);x.strokeStyle=PINK;x.lineWidth=6;x.strokeRect(4,4,W-8,H-8);PK.word(x,W,H,String(v),null)});Snd.pop();
      if(v===21){setTimeout(()=>{if(!P.alive())return;celebrate('',{at:P.world(new THREE.Vector3(0,1.6,0)),n:2,spread:1});P.cap('12 + 9 = 21 ✓','متوازن! وعائلة الأعداد: 9 + 12 = 21 · 21 − 9 = 12 · 21 − 12 = 9');Voice.say('Twelve plus nine equals twenty-one');P.done('وازنت الميزان!')},700)}
      else if(v===23)P.cap('12 + 9 = 23 ✗','هذا ما كُتب في الكتيّب — لكن الميزان لا يتوازن! الكفّة اليمنى أثقل.');else P.cap(`12 + 9 ${v<21?'>':'<'} ${v}`,v<21?'الكفّة اليمنى أخفّ: نحتاج عدداً أكبر.':'الكفّة اليمنى أثقل: نحتاج عدداً أصغر.')}
    return {chips:[19,20,21,22,23].map(v=>({id:'v'+v,label:String(v),group:'v',fn:()=>setV(v)})),capEn:'12 + 9 = ?',
      update(dt){const tg=target();vel+=(tg-ang)*26*dt-vel*3.2*dt;ang+=vel*dt;beam.rotation.z=ang;pans.forEach(p=>p.rotation.z=-ang)}};
  }
};
PAGES.shapes2d={
  body:['الأضلاع (sides): الخطوط المستقيمة حول الشكل.','الرؤوس (vertices أو corners): النقاط التي يلتقي فيها ضلعان.','خط التناظر: خط يقسم الشكل إلى نصفين متطابقين تماماً. إذا طوينا الشكل عليه انطبق النصفان.','المربع له 4 خطوط تناظر، والمستطيل 2 فقط: القطر ليس خط تناظر!'],
  words:[['sides','أضلاع'],['vertices','رؤوس'],['symmetry','تناظر'],['hexagon','سداسي']],
  flap:{q:'كم خط تناظر للمستطيل؟',a:'2 — خط بالطول وخط بالعرض. الطيّ على القطر لا ينطبق.'},
  home:'اطويا ورقة واقطعا نصف قلب أو نصف فراشة، ثم افتحاها: هذا هو التناظر!',
  hint:'اختر شكلاً واضغط «اطوِ» لتطويه على خط تناظر. جرّب الطيّ على القطر في المستطيل!',
  pop(P){
    const SH=[['square','مربع',{n:4,R:1.2,rot:Math.PI/4},4,4,4],['rectangle','مستطيل',{rect:[2.5,1.35]},4,4,2],['triangle','مثلث',{n:3,R:1.3,rot:Math.PI/2},3,3,3],['pentagon','خماسي',{n:5,R:1.2},5,5,5],['hexagon','سداسي',{n:6,R:1.2,rot:0},6,6,6],['circle','دائرة',{R:1.15},0,0,'∞']];
    let cur=0,axis=0,busy=false,folds=0;const holder=new THREE.Group();holder.position.set(0,.03,-.05);P.root.add(holder);let parts=null;
    const shp=pts=>{const s=new THREE.Shape();pts.forEach((p,i)=>i?s.lineTo(p[0],p[1]):s.moveTo(p[0],p[1]));s.closePath();return s};
    function make(a,wrong){if(parts){untap(parts.g);PK.disposeTree(parts.g);holder.remove(parts.g)}const sd=SH[cur][2];const base=polyPts(sd);const rot=Math.PI/2-a,c=Math.cos(rot),s=Math.sin(rot);const rp=base.map(([x,y])=>[x*c-y*s,x*s+y*c]);
      const g=new THREE.Group();g.rotation.x=-Math.PI/2;const inner=new THREE.Group();inner.rotation.z=-rot;g.add(inner);
      const A=new THREE.Mesh(new THREE.ShapeGeometry(shp(clipHalf(rp,-1))),new THREE.MeshStandardMaterial({color:new THREE.Color('#b29bff'),side:THREE.DoubleSide,roughness:.7}));
      const piv=new THREE.Group();const B=new THREE.Mesh(new THREE.ShapeGeometry(shp(clipHalf(rp,1))),new THREE.MeshStandardMaterial({color:new THREE.Color('#ffd166'),side:THREE.DoubleSide,roughness:.7,transparent:true,opacity:.88}));B.position.z=.004;piv.add(B);
      const line=G.box(.03,3.1,.012,'#e0336f');line.position.z=.012;line.userData.noInk=true;inner.add(A,piv,line);[A,B].forEach(m=>{m.castShadow=true;m.receiveShadow=true});P.ink(inner,10);holder.add(g);parts={g,piv,line};P.tap(g,fold)}
    function info(){const [en,ar,,sides,vtx,ax]=SH[cur];P.cap(`${en}: ${sides} sides · ${vtx} vertices`,`${ar}: ${sides} أضلاع، ${vtx} رؤوس، خطوط التناظر: ${ax}`)}
    async function fold(wrong){if(busy)return;busy=true;const sd=SH[cur][2];let a;if(wrong===true){a=sd.rect?Math.atan2(sd.rect[1],sd.rect[0]):Math.PI/4+.3}else{const ax=symAxes(sd);a=ax[axis%ax.length];axis++}
      make(a,wrong===true);Snd.whoosh();await E.anim(.7,k=>{parts.piv.rotation.y=Math.PI*Ease.inOut(k)});
      if(wrong===true){Snd.bad();P.cap('Not a line of symmetry ✗','النصفان لا ينطبقان: هذا ليس خط تناظر.')}else{Snd.good();folds++;P.cap('Line of symmetry ✓','انطبق النصفان تماماً: هذا خط تناظر!');if(folds>=3)P.done('وجدت 3 خطوط تناظر!')}
      await E.wait(.9);if(!P.alive())return;await E.anim(.5,k=>{parts.piv.rotation.y=Math.PI*(1-Ease.inOut(k))});busy=false;info()}
    make(Math.PI/2);info();
    return {chips:[...SH.map(([en,ar],i)=>({id:en,label:ar,group:'s',on:i===0,fn:()=>{if(busy)return;cur=i;axis=0;make(symAxes(SH[i][2])[0]);info()}})),{label:'📐 اطوِ',cls:'gold',fn:()=>fold()},{label:'↘ اطوِ على القطر',fn:()=>fold(true)}]};
  }
};
PAGES.shapes3d={
  body:['الأوجه (faces): الأسطح المستوية.','الحواف (edges): حيث يلتقي وجهان.','الرؤوس (vertices): الزوايا حيث تلتقي الحواف.','المكعب: 6 أوجه، 12 حافة، 8 رؤوس. افتحه فيصير شبكة من 6 مربعات.'],
  words:[['faces','أوجه'],['edges','حواف'],['vertices','رؤوس'],['cube','مكعب'],['pyramid','هرم']],
  flap:{q:'الهرم ذو القاعدة المربّعة: كم وجهاً له؟',a:'5 — مربّع واحد و4 مثلثات.'},
  home:'افتحا علبة كرتون فارغة بحذر، وانظرا إلى شبكتها مفرودة على الأرض.',
  hint:'اسحب المجسّم إلى الأسفل لتفتحه شبكةً، وإلى الأعلى لتغلقه. أو استعمل الأزرار.',
  pop(P){
    let kind='cube',f=0,goal=0,opened=new Set();const holder=new THREE.Group();holder.position.set(0,0,.1);P.root.add(holder);let joints=[];const s=1.05;const cols=['#ff7b39','#ffd166','#3ddbb0','#6db4ff','#ff5d8f','#b29bff'];
    const face=(w,d,c)=>{const m=G.box(w,.025,d,c,{roughness:.7});m.position.y=.0125;return m};
    function build(){PK.disposeTree(holder);holder.clear();joints=[];const base=face(s,s,cols[0]);holder.add(base);
      if(kind==='cube'){for(let i=0;i<4;i++){const arm=new THREE.Group();arm.rotation.y=i*Math.PI/2;holder.add(arm);const piv=new THREE.Group();piv.position.z=s/2;arm.add(piv);const fc=face(s,s,cols[i+1]);fc.position.z=s/2;piv.add(fc);joints.push({piv,max:Math.PI/2});
          if(i===2){const p2=new THREE.Group();p2.position.z=s;piv.add(p2);const top=face(s,s,cols[5]);top.position.z=s/2;p2.add(top);joints.push({piv:p2,max:Math.PI/2})}}}
      else{const hp=s*.75,L=Math.hypot(hp,s/2),beta=Math.PI-Math.atan2(hp,s/2);const tg=new THREE.Shape();tg.moveTo(-s/2,0);tg.lineTo(s/2,0);tg.lineTo(0,L);tg.closePath();
        for(let i=0;i<4;i++){const arm=new THREE.Group();arm.rotation.y=i*Math.PI/2;holder.add(arm);const piv=new THREE.Group();piv.position.set(0,.02,s/2);arm.add(piv);const m=new THREE.Mesh(new THREE.ShapeGeometry(tg),new THREE.MeshStandardMaterial({color:new THREE.Color(cols[i+1]),side:THREE.DoubleSide,roughness:.7}));m.rotation.x=Math.PI/2;piv.add(m);joints.push({piv,max:beta})}}
      P.ink(holder,20);holder.traverse(o=>{if(o.isMesh){o.castShadow=o.receiveShadow=true}});pose();info()}
    function pose(){joints.forEach(j=>{j.piv.rotation.x=-j.max*(1-f)});holder.position.y=0}
    function info(){const d=kind==='cube'?['Cube','مكعب',6,12,8]:['Square-based pyramid','هرم',5,8,5];P.cap(`${d[0]}: ${d[2]} faces · ${d[3]} edges · ${d[4]} vertices`,`${d[1]}: ${d[2]} أوجه، ${d[3]} حافة، ${d[4]} رؤوس`)}
    build();P.drag(holder,{plane:'z',start(lp){this.y0=lp.y;this.f0=f;goal=null},move(lp){f=clamp(this.f0+(this.y0-lp.y)*.9,0,1)},end(){goal=f>.5?1:0}});
    return {chips:[{id:'cube',label:'🧊 مكعب',group:'k',on:true,fn:()=>{kind='cube';f=0;goal=0;build()}},{id:'pyr',label:'🔺 هرم',group:'k',fn:()=>{kind='pyr';f=0;goal=0;build()}},{label:'📂 افتح الشبكة',cls:'gold',fn:()=>{goal=1;Snd.whoosh()}},{label:'📦 أغلق',fn:()=>{goal=0;Snd.whoosh()}}],
      update(dt,t){if(goal!=null)f+=(goal-f)*Math.min(1,dt*3);pose();if(f>.95&&!opened.has(kind)){opened.add(kind);Snd.good();P.cap(kind==='cube'?'Net of a cube: 6 squares':'Net of a pyramid: 1 square + 4 triangles',kind==='cube'?'شبكة المكعب: 6 مربعات':'شبكة الهرم: مربّع و4 مثلثات');if(opened.size>=2)P.done('فتحت شبكتَي المجسّمين!')}holder.rotation.y=Math.sin(t*.4)*.3*(1-f)}};
  }
};

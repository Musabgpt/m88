/* ===== Chapter 1 · English ===== */
WC.phonics={
  learn:{body:['One sound can be written in different ways.','The long a sound (it says its name, like the letter A) can be written:','EX:ay → play      a-e → shake      a → paper','We read the sounds quickly in our head and blend them. That is automatic reading.','Long word? Chop it into chunks:','EX:snow · man      u · ni · corn'],
    words:[['play','يلعب'],['shake','يهزّ'],['paper','ورقة'],['snowman','رجل الثلج'],['unicorn','وحيد القرن']],
    flap:{q:'Which spelling of the long a sound is in "cake"?',a:'a-e. The e at the end is silent and makes the a say its name.'},
    ar:'الصوت الواحد قد يُكتب بأكثر من طريقة. شجّع طفلك أن يقرأ الكلمة في رأسه بسرعة ثم بصوت عالٍ.'},
  try:{hint:'Tap the floating word to hear it. Then tap the box with the same spelling.',ar:'اضغط الكلمة لتسمعها، ثم اضغط الصندوق المناسب.',
    pop(P){
      let fam=SOUNDS[0],boxes=[],queue=[],cur=null,busy=false,right=0,boxTag=null;const holder=new THREE.Group();P.root.add(holder);
      const card=PK.card(1.5,.62,null,{pw:512,d:.05});card.position.set(0,1.15,-.45);P.root.add(card);
      const draw=(w,g)=>card.userData.redraw((x,W,H)=>{x.strokeStyle=P.col;x.lineWidth=10;x.strokeRect(6,6,W-12,H-12);PK.word(x,W,H,w,g?hiIdx(w,g):null)});
      function build(){boxes.forEach(b=>{untap(b);P.untag(b)});PK.disposeTree(holder);holder.clear();boxes=[];const sp=fam.sp,n=sp.length,gap=Math.min(1.12,3.1/n),bw=Math.min(.94,gap-.1),bh=.5,bd=.72;
        sp.forEach(([g],i)=>{const b=new THREE.Group(),m=P.m(fam.col);[[bw,.05,bd,0,.025,0],[bw,bh,.04,0,bh/2,bd/2],[bw,bh,.04,0,bh/2,-bd/2],[.04,bh,bd,bw/2,bh/2,0],[.04,bh,bd,-bw/2,bh/2,0]].forEach(([a,c,d,x,y,z])=>{const q=G.mesh(new THREE.BoxGeometry(a,c,d),m);q.position.set(x,y,z);b.add(q)});
          const lab=txtCard(bw*.86,.32,g.replace('-','–'),{pw:384,bw:5});lab.position.set(0,bh*.5,bd/2+.035);b.add(lab);b.position.set((i-(n-1)/2)*gap,0,.62);holder.add(b);P.tap(b,()=>choose(g,b));boxes.push(b)});
        P.ink(holder);holder.traverse(o=>{if(o.isMesh)o.castShadow=o.receiveShadow=true});if(!boxTag)boxTag=P.tag(boxes[0],'👆 Tap a box',{dy:.85});
        queue=shuffle(sp.flatMap(([g])=>(fam.words[g]||[]).map(w=>({w,g}))));right=0;nextWord()}
      function nextWord(){if(!queue.length)queue=shuffle(fam.sp.flatMap(([g])=>(fam.words[g]||[]).map(w=>({w,g}))));cur=queue.shift();draw(cur.w,null);card.position.set(0,1.15,-.45);card.scale.setScalar(1);
        P.cap(`"${cur.w}" — which box? Look at the letters.`,'في أي صندوق تذهب هذه الكلمة؟');setTimeout(()=>P.alive()&&Voice.say(cur.w,{auto:true}),350)}
      function choose(g,b){if(busy||!cur)return;if(g===cur.g){busy=true;draw(cur.w,cur.g);Snd.good();const to=b.position.clone();to.y=.42;
          arc(card,to,.6,.9).then(()=>{E.tw(card.scale,{x:.35,y:.35,z:.35},.2);FX.sparkle(P.world(to),{n:18});right++;P.cap(`Yes! "${cur.g}" is in "${cur.w}".`,'أحسنت!');if(right>=4)P.done();return E.wait(.8)}).then(()=>{busy=false;if(P.alive())nextWord()})}
        else{Snd.bad();const x0=b.position.x;E.anim(.4,k=>{b.position.x=x0+Math.sin(k*Math.PI*6)*.06*(1-k)}).then(()=>{b.position.x=x0});P.cap(`Not "${g}". Look at the letters in "${cur.w}" again.`,'انظر جيداً إلى الحروف.')}}
      P.tap(card,()=>cur&&Voice.say(cur.w));P.tag(card,'👆 Tap to hear',{dy:.55});build();
      return {chips:[...SOUNDS.slice(0,5).map((f,i)=>({id:'f'+i,label:f.sp.map(s=>s[0]).join(' · '),group:'fam',on:i===0,fn:()=>{if(busy)return;fam=f;build()}})),{label:'🔊 Hear it',fn:()=>cur&&Voice.say(cur.w)}],
        update(dt,t){if(!busy){card.rotation.y=Math.sin(t*1.2)*.22;card.position.y=1.15+Math.sin(t*2)*.06}}};
    }},
  practise:{type:'sort',title:'Sort the long a words',how:'Tap a word, then tap the box with its spelling.',ar:'اضغط كلمة ثم اضغط صندوقها.',
    bins:[['ay','',''],['a-e','',''],['a','','']],items:[['day','ay'],['cake','a-e'],['baby','a'],['tray','ay'],['snake','a-e'],['paper','a'],['play','ay'],['grape','a-e'],['acorn','a']]},
  quiz:[{q:'Which word has the "ay" spelling?',o:['day','cake','baby'],why:'d-ay: "ay" says the long a sound.'},{q:'Which word has a-e (the e is silent)?',o:['snake','play','paper'],why:'s-n-a-k-e: the a and the e work together.'},{q:'How do we chop "unicorn" into chunks?',o:['u · ni · corn','un · ic · orn','unic · orn'],why:'u · ni · corn. Say each chunk, then blend.'},{q:'In which word does "ea" say /e/, like in bed?',o:['bread','sea','team'],why:'br-ea-d: here "ea" says /e/.'}],
  home:[['Read your Reading Practice Book every day.','قراءة كتاب التدريب كل يوم.'],["Find words with today's sound in your book.",'ابحثا عن كلمات صوت اليوم في الكتاب.'],['Chop two long words into chunks.','قطّعا كلمتين طويلتين إلى أجزاء.']]
};
WC.tricky={
  learn:{body:['Tricky words are very common words with a tricky part.','We read most of the word with phonics and learn the tricky part by heart.','This half term:','EX:once · laugh · because · eye · thought · through · friend · work','Learn them like this:','EX:Look · Say · Cover · Write · Check'],
    words:TRICKY.map(t=>[t.w,t.ar]),
    flap:{q:'Which part of "friend" is tricky?',a:'"ie". It says /e/, like in bed: fr-ie-nd.'},
    ar:'كلمات شائعة فيها جزء غير منتظم. نحفظ الجزء الصعب بالتكرار: انظر، قل، غطِّ، اكتب، تحقّق.'},
  try:{hint:'Tap a card to hear the word and a sentence. The pink letters are the tricky part. Then press Cover and try to remember.',ar:'اضغط البطاقة لتسمع الكلمة. الحروف الوردية هي الجزء الصعب.',
    pop(P){
      const cards=[];let covered=false;const heard=new Set();
      TRICKY.forEach((t,i)=>{const hi=new Set();for(let k=t.h[0];k<t.h[1];k++)hi.add(k);const r=Math.floor(i/4),c=i%4;const g=new THREE.Group();
        const cd=PK.card2(.76,.5,(x,W,H)=>{x.strokeStyle='#e0336f';x.lineWidth=7;x.strokeRect(5,5,W-10,H-10);PK.word(x,W,H,t.w,hi,{hc:'#e0336f'})},(x,W,H)=>{x.fillStyle='#e0336f';PT.fnt(x,H*.55,800,FONT_D);x.textAlign='center';x.textBaseline='middle';x.fillText('?',W/2,H*.5);x.textBaseline='alphabetic'},{pw:384});
        cd.position.y=.3;const stand=G.box(.5,.04,.2,'#e7d2b0');stand.position.set(0,.02,-.05);const ht=G.heart(.07,'#ff5d8f',.05,{emissive:'#7a1033',emissiveIntensity:.3});ht.position.set(.32,.6,0);ht.userData.noInk=true;
        g.add(cd,stand,ht);g.position.set((c-1.5)*.84,0,r?.62:-.42);P.root.add(g);g.userData={t,cd,ht,hop:0};cards.push(g);
        P.tap(g,()=>{Snd.pop();if(covered&&g.rotation.y>1){E.tw(g.rotation,{y:0},.45,Ease.back);Voice.say(t.w);P.cap(`Check: did you write "${t.w}" right?`,'تحقّق: هل كتبتها صحيحاً؟');return}
          g.userData.hop=1;Voice.say(t.w,{end:()=>setTimeout(()=>P.alive()&&Voice.say(t.s,{rate:.85}),250)});P.cap(t.s,stripTags(t.tip));heard.add(t.w);if(heard.size>=5)P.done()})});
      P.tag(cards[0],'👆 Tap a card',{dy:.95});
      return {chips:[{label:'🙈 Cover',toggle:true,fn:(on)=>{covered=on;cards.forEach((g,i)=>setTimeout(()=>E.tw(g.rotation,{y:covered?Math.PI:0},.5,Ease.inOut),i*60));P.cap(covered?'Write a word on paper, then tap its card to check.':'Look · Say · Cover · Write · Check',covered?'اكتب الكلمة على ورقة ثم اضغط البطاقة لتتحقّق.':'')}},{label:'🔊 All the words',fn:()=>Voice.say(TRICKY.map(t=>t.w).join(', '),{rate:.75})}],
        update(dt,t){cards.forEach((g,i)=>{const u=g.userData;if(u.hop>0){u.hop=Math.max(0,u.hop-dt*1.6);const k=1-u.hop;g.position.y=Math.sin(k*Math.PI)*.35}u.ht.rotation.y=t*1.5+i;u.ht.scale.setScalar(1+Math.max(0,Math.sin(t*6+i))*.12)})}};
    }},
  practise:{type:'fill',title:'Finish the sentence',how:'Read the sentence. Tap the missing tricky word.',ar:'اقرأ الجملة واضغط الكلمة الناقصة.',
    rounds:[{q:'We ___ at funny jokes.',o:['laugh','eye','work']},{q:'I wear a coat ___ it is cold.',o:['because','through','once']},{q:'My ___ sits next to me.',o:['friend','thought','laugh']},{q:'The cat ran ___ the door.',o:['through','because','eye']},{q:'___ upon a time, a giant lived in a castle.',o:['Once','Work','Friend']}]},
  quiz:[{q:'Which one is spelt correctly?',o:['because','becos','becuz']},{q:'Which one is spelt correctly?',o:['friend','frend','freind']},{q:'Which one is spelt correctly?',o:['laugh','larf','laff']},{q:'"I see with my ___."',o:['eye','I','aye'],why:'"eye" sounds like the letter I.'}],
  home:[['Practise spelling the tricky words 3–4 times a week.','تهجئة الكلمات الصعبة 3–4 مرات أسبوعياً.'],['Pick two words a day: Look, Say, Cover, Write, Check.','كلمتان كل يوم بطريقة: انظر، قل، غطِّ، اكتب، تحقّق.'],['Draw a heart over the tricky letters.','ارسم قلباً فوق الحروف الصعبة.']]
};
WC.reading={
  learn:{body:['Every week your book bag has two books.','EX:Reading Practice Book: read it again and again.','It matches your phonics, so it may feel easy. That is the point: practice makes reading smooth and confident.','EX:Sharing Book: you chose it to enjoy with a grown-up.','Bronze Reading Challenge: read 5 more books by Wednesday 16 December.'],
    words:[['decoding','فكّ الرموز'],['prosody','القراءة بتعبير'],['comprehension','الفهم'],['fluent','طليق']],
    flap:{q:'You get stuck on a word. What can you do?',a:'Sound it out. If it is still too tricky, a grown-up reads it for you. Then keep going!'},
    ar:'كتاب التدريب يقرؤه الطفل بنفسه مرات عدة ليصبح طليقاً. كتاب المشاركة تقرؤه له أو معه للمتعة. إذا تعثّر بكلمة فاقرأها له.'},
  try:{hint:'Tap each book to open it and meet a reading power. Finished a book at home? Press "I read a book!".',ar:'اضغط كل كتاب ليفتح. وإذا أنهى طفلك كتاباً اضغط الزر لتسجيله.',
    pop(P){
      const POW=[['Decoding','Sound out the letters and blend them to read the word.','c · a · t → cat','#6db4ff'],['Prosody','Read with expression: happy, surprised, quiet…','Wow!  Who?  Shh…','#ff8fb1'],['Comprehension','Understand the story: who, where, why, what next?','Who? Where? Why?','#3ddbb0']];
      const opened=new Set();let first=null;
      POW.forEach(([en,tx,ins,col],i)=>{const g=new THREE.Group();const back=G.box(.64,.86,.04,col);back.position.set(0,.43,-.09);
        const inner=new THREE.Mesh(new THREE.BoxGeometry(.6,.82,.14),[P.m('#f3ead2'),P.m('#f3ead2'),P.m('#f3ead2'),P.m('#f3ead2'),new THREE.MeshStandardMaterial({map:G.tex(256,352,(x,W,H)=>{x.fillStyle='#fffaf0';x.fillRect(0,0,W,H);x.fillStyle='#2d2219';PT.fnt(x,30,700,FONT_R);x.textAlign='center';PT.wrap(x,ins,W-30).forEach((l,k)=>x.fillText(l,W/2,H*.42+k*40))}),roughness:.85}),P.m('#f3ead2')]);inner.position.y=.43;
        const hinge=new THREE.Group();hinge.position.set(-.32,0,.08);const cover=new THREE.Mesh(new THREE.BoxGeometry(.64,.86,.04),[P.m(col),P.m(col),P.m(col),P.m(col),new THREE.MeshStandardMaterial({map:G.tex(256,344,(x,W,H)=>{x.fillStyle=col;x.fillRect(0,0,W,H);x.fillStyle='rgba(255,255,255,.85)';PT.rr(x,18,60,W-36,110,14);x.fill();x.fillStyle='#2d2219';PT.fnt(x,en.length>9?28:36,800,FONT_R);x.textAlign='center';x.fillText(en,W/2,128);PT.icon(x,['🔤','🎭','💭'][i],W/2,250,70)}),roughness:.7}),P.m(col)]);
        cover.position.set(.32,.43,0);hinge.add(cover);g.add(back,inner,hinge);g.position.set((i-1)*1.05,0,-.45);g.rotation.y=(i-1)*-.12;P.root.add(g);if(!first)first=g;
        P.tap(g,()=>{const o=hinge.rotation.y<-.5;E.tw(hinge.rotation,{y:o?0:-2.1},.6,Ease.back);Snd.whoosh();if(!o){Voice.say(en+'. '+tx);P.cap(en+': '+tx,['فكّ الرموز','القراءة بتعبير','الفهم'][i]);opened.add(i);if(opened.size>=3)P.done('You opened all three reading powers!')}})});
      P.tag(first,'👆 Tap a book',{dy:1.15});
      const stack=new THREE.Group();stack.position.set(0,0,.85);P.root.add(stack);const bc=['#ff7b39','#ffd166','#3ddbb0','#6db4ff','#b29bff'];const minis=[];
      for(let i=0;i<5;i++){const b=G.box(.7-i*.04,.1,.46,bc[i]);b.position.set(rand(-.04,.04),.05+i*.105,0);b.rotation.y=rand(-.15,.15);stack.add(b);minis.push(b)}
      const medal=G.cyl(.2,.2,.05,'#cd7f32',{metalness:.5,roughness:.3,emissive:'#7a3d10',emissiveIntensity:0},32);medal.rotation.x=Math.PI/2;medal.position.set(0,.95,0);stack.add(medal);
      const lab=P.label('0 / 5',{size:.26});lab.position.set(.62,.7,0);stack.add(lab);
      function sync(){const n=Math.min(booksCount(),5);minis.forEach((b,i)=>{b.material.transparent=i>=n;b.material.opacity=i<n?1:.3});medal.material.emissiveIntensity=n>=5?.7:0;lab.userData.set(n+' / 5');return n}
      sync();P.tap(stack,()=>{Snd.pop();const n=sync();P.cap(`Bronze Reading Challenge: ${n} of 5 books.`,n>=5?'أكملت التحدّي البرونزي 🥉':'5 كتب قبل 16 ديسمبر.')});
      function readOne(){const before=booksCount();Store.s.books.push({t:'Book '+(Store.s.books.length+1),chapter:false,r:0,d:ymd(today())});Store.save();award('reading','log',1,'Book added!');const n=sync();Snd.good();
        const b=minis[Math.min(n,5)-1];if(b){const y0=b.position.y;b.position.y=y0+1;E.tw(b.position,{y:y0},.5,Ease.bounce)}
        if(before<5&&booksCount()>=5){award('reading','bronze',3,'Bronze Reading Challenge!');celebrate('',{at:P.world(new THREE.Vector3(0,1.2,.85)),n:2,spread:.6})}P.cap(`Well done! That is ${n} of 5 books.`,'أحسنت! سجّلنا كتاباً.')}
      return {chips:[{label:'📚 I read a book!',cls:'gold',fn:readOne},{label:'🏅 How many?',fn:()=>{const n=sync();P.cap(`You have read ${n} of 5 books for the Bronze Challenge.`,'عدد الكتب حتى الآن.')}}],update(dt,t){medal.rotation.z=t*1.4;medal.position.y=.95+Math.sin(t*2)*.05}};
    }},
  practise:{type:'order',title:'Put the story in order: The Snowman',how:'Tap the sentences in the order they happen.',ar:'اضغط الجمل بترتيب أحداث القصة.',
    items:['James builds a snowman in the garden.','At midnight, the snowman comes to life.','They fly together through the snowy sky.','In the morning, the snowman has melted.']},
  quiz:[{q:'Which question asks WHERE?',o:['Where does the story happen?','Who is in the story?','Why was he sad?']},{q:'Reading with expression is called…',o:['prosody','decoding','spelling']},{q:'How many books do you need for the Bronze Challenge?',o:['5','2','10']},{q:'"What do you think will happen next?" is a…',o:['prediction','rhyme','full stop']}],
  home:[['Read every day, and read for fun!','اقرأ كل يوم وللمتعة.'],['Bronze Challenge: 5 more books by Wednesday 16 December.','التحدّي البرونزي: 5 كتب قبل 16 ديسمبر.'],['After reading, ask: Who? Where? Why? What next?','بعد القراءة اسألا: من؟ أين؟ لماذا؟']]
};
WC.writing={
  learn:{body:['Use "because" to give a reason:','EX:I put on my coat because it was cold.','Use "and" to join two ideas:','EX:We went to Cannon Hill Park and we fed the ducks.','An apostrophe squashes two words into one:','EX:do not → don’t      can not → can’t','Use commas in a list:','EX:a hat, a scarf, gloves and a coat'],
    words:[['because','لأنّ'],['and','و'],['don’t','لا تفعل'],['can’t','لا أستطيع'],['comma','فاصلة'],['full stop','نقطة']],
    flap:{q:'How do we squash "can not" into one word?',a:'can’t. The apostrophe takes the place of the missing letters.'},
    ar:'نتعلّم ربط الأفكار بـ because و and، والاختصار بالفاصلة العلوية، والفواصل في القوائم.'},
  try:{hint:'Choose a joining word, then tap the yellow block to join the train. Tap the press to squash two words.',ar:'اختر كلمة الربط ثم اضغط القطعة الصفراء. واضغط المكبس للاختصار.',
    pop(P){
      const PAIRS={because:['I put on my coat','it was cold'],and:['I like apples','I like pears']},SQ={dont:['do','not','don’t'],cant:['can','not','can’t']};
      let join='because',sq='dont',joined=false,squashed=false,didJ=false,didS=false,busy=false;
      const mkCar=(col)=>{const g=new THREE.Group();const body=PK.card(1.22,.36,null,{pw:640,d:.46,edge:col,back:col});body.position.y=.34;g.add(body);[-.4,.4].forEach(x=>[-.2,.2].forEach(z=>{const w=G.cyl(.1,.1,.06,'#2d2219',{},16);w.rotation.x=Math.PI/2;w.position.set(x,.11,z);g.add(w)}));g.userData.body=body;return g};
      const A=mkCar('#9be36d'),B=mkCar('#6db4ff');const chim=G.cyl(.07,.09,.26,'#2d2219');chim.position.set(-.45,.66,0);A.add(chim);P.root.add(A,B);
      const cp=txtCard(.62,.26,'because',{pw:384,bg:'#ffd166',bw:5,d:.2});P.root.add(cp);
      const txt=(car,t)=>car.userData.body.userData.redraw((x,W,H)=>{x.fillStyle=car===A?'#d9f7c4':'#d6e9ff';x.fillRect(0,0,W,H);PK.word(x,W,H,t,null,{sz:H*.4})});
      function setJ(){joined=false;A.position.set(-.95,0,-.78);B.position.set(.95,0,-.78);cp.position.set(0,.95,-.78);txt(A,PAIRS[join][0]);txt(B,PAIRS[join][1]);cp.userData.redraw((x,W,H)=>{x.fillStyle='#ffd166';x.fillRect(0,0,W,H);PK.word(x,W,H,join,null)})}
      function doJoin(){if(busy)return;if(joined){setJ();return}busy=true;Snd.whoosh();E.tw(A.position,{x:-.68},.5,Ease.out);E.tw(B.position,{x:.68},.5,Ease.out);
        E.tw(cp.position,{y:.3},.55,Ease.bounce).then(()=>{joined=true;busy=false;Snd.good();const s=PAIRS[join][0]+' '+join+' '+PAIRS[join][1]+'.';Voice.say(s);P.cap(s,join==='because'?'because تشرح السبب.':'and تجمع فكرتين.');didJ=true;if(didS)P.done();
          for(let i=0;i<6;i++)setTimeout(()=>{if(!P.alive())return;const w=P.world(new THREE.Vector3(A.position.x-.45,.85,-.78));FX.sys.emit({x:w.x,y:w.y,z:w.z,vy:rand(.6,1.1),vx:rand(-.1,.1),life:1.2,s0:.18,s1:.45,c0:[.95,.95,.95,.7],c1:[.8,.8,.8,0]})},i*120)})}
      P.tap(cp,doJoin);
      const base=G.box(2.3,.06,.62,'#c9cfe0',{metalness:.3,roughness:.4});base.position.set(0,.03,.82);const posts=[-1.05,1.05].map(x=>{const p=G.box(.1,1.45,.1,'#6b7290',{metalness:.4});p.position.set(x,.75,.82);return p});const beam=G.box(2.3,.14,.18,'#6b7290',{metalness:.4});beam.position.set(0,1.48,.82);
      const head=new THREE.Group();const plate=G.box(1.6,.14,.5,'#ff7b39');head.add(plate);const rod=G.cyl(.05,.05,.32,'#c9cfe0',{metalness:.5});rod.position.y=.22;head.add(rod);head.position.set(0,1.18,.82);P.root.add(base,...posts,beam,head);
      const b1=txtCard(.62,.36,'do',{pw:320,bg:'#fffaf0',d:.3}),b2=txtCard(.62,.36,'not',{pw:320,bg:'#fffaf0',d:.3}),b3=txtCard(1.05,.36,'don’t',{pw:448,bg:'#ffe08f',d:.3});P.root.add(b1,b2,b3);
      function setS(){squashed=false;const q=SQ[sq];b1.userData.redraw((x,W,H)=>{x.strokeStyle=PINK;x.lineWidth=6;x.strokeRect(4,4,W-8,H-8);PK.word(x,W,H,q[0],null)});b2.userData.redraw((x,W,H)=>{x.strokeStyle=PINK;x.lineWidth=6;x.strokeRect(4,4,W-8,H-8);PK.word(x,W,H,q[1],null)});
        b3.userData.redraw((x,W,H)=>{x.fillStyle='#ffe08f';x.fillRect(0,0,W,H);x.strokeStyle=PINK;x.lineWidth=6;x.strokeRect(4,4,W-8,H-8);PK.word(x,W,H,q[2],new Set([q[2].indexOf('’')]))});
        [b1,b2].forEach((b,i)=>{b.visible=true;b.scale.set(1,1,1);b.position.set(i?.36:-.36,.24,.82)});b3.visible=false;b3.position.set(0,.24,.82)}
      function doSquash(){if(busy)return;if(squashed){setS();return}busy=true;E.tw(head.position,{y:.5},.35,Ease.in).then(()=>{Snd.boom();[b1,b2].forEach(b=>E.tw(b.scale,{y:.35,x:.8},.15));return E.wait(.15)}).then(()=>{b1.visible=b2.visible=false;b3.visible=true;b3.scale.set(.3,1,1);E.tw(b3.scale,{x:1},.35,Ease.back);FX.sparkle(P.world(new THREE.Vector3(.05,.6,.82)),{n:22});
          return E.tw(head.position,{y:1.18},.45,Ease.out)}).then(()=>{busy=false;squashed=true;const q=SQ[sq];Voice.say(q[0]+' not, '+q[2]);P.cap(`${q[0]} not → ${q[2]}. The apostrophe takes the place of the missing o.`,'الفاصلة العلوية مكان الحرف المحذوف.');didS=true;if(didJ)P.done()})}
      P.tap(head,doSquash);[b1,b2,b3].forEach(b=>P.tap(b,doSquash));setJ();setS();P.tag(cp,'👆 Tap to join',{dy:.4});P.tag(head,'👆 Tap the press',{dy:.4});
      return {chips:[{id:'because',label:'because',group:'j',on:true,fn:()=>{join='because';setJ()}},{id:'and',label:'and',group:'j',fn:()=>{join='and';setJ()}},{label:'🔗 Join',cls:'gold',fn:doJoin},
        {id:'dont',label:'do not',group:'s',on:true,fn:()=>{sq='dont';setS()}},{id:'cant',label:'can not',group:'s',fn:()=>{sq='cant';setS()}},{label:'🔨 Squash',cls:'gold',fn:doSquash}]};
    }},
  practise:{type:'fill',title:'Choose the best word',how:'Read the sentence. Tap the word or sentence that is right.',ar:'اقرأ الجملة واختر الصحيح.',
    rounds:[{q:'I wore my wellies ___ it was raining.',o:['because','and']},{q:'I like Bonfire Night ___ I like the fireworks.',o:['and','because']},{q:'do not → ___',o:['don’t','do’nt','dont']},{q:'can not → ___',o:['can’t','cann’t','ca’nt']},{q:'Which list is written correctly?',o:['a hat, a scarf and gloves','a hat a, scarf and gloves','a hat. a scarf. gloves']}]},
  quiz:[{q:'I am happy ___ it is my birthday.',o:['because','and','but'],why:'"because" gives the reason.'},{q:'I have a cat ___ a dog.',o:['and','because','but'],why:'"and" joins two things.'},{q:'"do not" squashed into one word is…',o:['don’t','dont','do’nt']},{q:'Which sentence is punctuated correctly?',o:['I went to the park.','i went to the park','I went to the park,'],why:'A capital letter at the start and a full stop at the end.'}],
  home:[['Write a short weekend diary (4–6 sentences).','اكتبا يوميات قصيرة لعطلة نهاية الأسبوع.'],['Use "because" once and "and" once.','استعملا because مرة و and مرة.'],['Take it to school on Friday as evidence.','خذها للمدرسة يوم الجمعة.']]
};
WC.oracy={
  learn:{body:['Talk about what you can see, hear, touch and feel.','Use two describing words (adjectives) to add detail:','EX:It is enormous and fluffy.','Useful sentence starters:','EX:I can see…   It feels…   It sounds…   I like it because…'],
    words:[['enormous','ضخم'],['tiny','صغير جداً'],['fluffy','منفوش'],['sparkly','لامع'],['gloomy','كئيب'],['fierce','شرس']],
    flap:{q:'Finish it with two adjectives: "The fireworks are ___ and ___."',a:'For example: bright and noisy. Any two good describing words are right!'},
    ar:'نشجّع الطفل على وصف الأشياء بصفتين أو أكثر بالإنجليزية عند الحديث.'},
  try:{hint:'Press two describing words and watch the monster change. Then listen to the sentence.',ar:'اختر صفتين وشاهد المخلوق يتغيّر.',
    pop(P){
      const pick2=[];const g=new THREE.Group();P.root.add(g);const stage=G.cyl(.95,1,.12,'#b07a4f',{roughness:.8},40);stage.position.y=.06;P.root.add(stage);g.scale.setScalar(1.25);
      const curtain=PK.card(2.4,1.0,(x,W,H)=>{const gr=x.createLinearGradient(0,0,W,0);for(let i=0;i<=10;i++)gr.addColorStop(i/10,i%2?'#a3203a':'#c8344f');x.fillStyle=gr;x.fillRect(0,0,W,H);x.fillStyle='#ffd166';x.fillRect(0,0,W,18)},{pw:512,back:'#8a1c32'});curtain.position.set(0,.5,-1.2);P.root.add(curtain);
      const bodyM=P.m('#b29bff',{roughness:.55});const body=G.mesh(new THREE.SphereGeometry(.5,28,20),bodyM);body.position.y=.62;g.add(body);body.userData.noInk=true;
      const eyes=[-1,1].map(s=>{const e=G.sph(.13,'#ffffff',{},16);e.position.set(s*.18,.78,.42);const p=G.sph(.06,'#1b1f3a',{},12);p.position.set(s*.18,.78,.54);g.add(e,p);e.userData.noInk=p.userData.noInk=true;return p});
      const mouth=G.mesh(new THREE.TorusGeometry(.13,.03,8,20,Math.PI),P.m('#4a1d3a'));mouth.position.set(0,.55,.47);mouth.rotation.z=Math.PI;g.add(mouth);
      [-1,1].forEach(s=>{const f=G.sph(.14,'#8f78e8',{},14);f.scale.set(1,.5,1.3);f.position.set(s*.25,.12,.08);g.add(f)});
      const fur=new THREE.Group();for(let i=0;i<70;i++){const u=Math.random()*2-1,a=Math.random()*Math.PI*2,r=Math.sqrt(1-u*u);if(u<-.6)continue;const b=G.sph(.07,'#d9ccff',{},8);b.position.set(r*Math.cos(a)*.5,.62+u*.5,r*Math.sin(a)*.5);fur.add(b)}fur.visible=false;g.add(fur);
      const spikes=new THREE.Group();for(let i=0;i<9;i++){const c=G.cone(.08,.26,'#ff5d8f',{},8);const a=-.9+i*.22;c.position.set(Math.sin(a)*.42,.62+Math.cos(a)*.42,-.18);c.rotation.z=-a;c.rotation.x=-.3;spikes.add(c)}spikes.visible=false;g.add(spikes);
      const brows=[-1,1].map(s=>{const b=G.box(.16,.035,.03,'#2d2219');b.position.set(s*.18,.95,.47);b.rotation.z=s*.35;b.visible=false;g.add(b);return b});
      const cloud=new THREE.Group();[[0,0,.3],[.25,.05,.22],[-.25,.03,.24],[.1,.15,.2]].forEach(([x,y,r])=>{const s=G.sph(r,'#8c93a8',{},14);s.position.set(x,y,0);s.userData.noInk=true;cloud.add(s)});cloud.position.set(0,1.75,0);cloud.visible=false;g.add(cloud);
      const ADJ6=[['enormous','ضخم'],['tiny','صغير جداً'],['fluffy','منفوش'],['sparkly','لامع'],['gloomy','كئيب'],['fierce','شرس']];let barApi=null;
      function apply(){const has=a=>pick2.includes(a);const s=(has('enormous')?1.4:has('tiny')?.55:1)*1.25;E.tw(g.scale,{x:s,y:s,z:s},.5,Ease.back);fur.visible=has('fluffy');spikes.visible=has('fierce');brows.forEach(b=>b.visible=has('fierce'));cloud.visible=has('gloomy');
        bodyM.color.set(has('gloomy')?'#7f86a8':has('sparkly')?'#c9b8ff':'#b29bff');bodyM.metalness=has('sparkly')?.6:0;bodyM.roughness=has('sparkly')?.2:.55;eyes.forEach(p=>p.position.y=has('gloomy')?.73:.78);
        if(barApi)ADJ6.forEach(([a])=>barApi.on(a,has(a)));
        if(pick2.length===2){const s2=`It is ${pick2[0]} and ${pick2[1]}.`;Voice.say(s2);P.cap(s2,`${ADJ6.find(a=>a[0]===pick2[0])[1]} و${ADJ6.find(a=>a[0]===pick2[1])[1]}`);P.done()}else if(pick2.length===1)P.cap(`It is ${pick2[0]} and … Choose one more word!`,'اختر صفة ثانية.')}
      function toggle(a){const i=pick2.indexOf(a);if(i>=0)pick2.splice(i,1);else{if(a==='enormous'){const j=pick2.indexOf('tiny');if(j>=0)pick2.splice(j,1)}if(a==='tiny'){const j=pick2.indexOf('enormous');if(j>=0)pick2.splice(j,1)}pick2.push(a);if(pick2.length>2)pick2.shift()}apply()}
      P.tap(g,()=>{Snd.pop();Voice.say(pick2.length?`It is ${pick2.join(' and ')}.`:'Describe me!')});P.tag(body,'👆 Tap me',{dy:1.05});
      return {chips:ADJ6.map(([a])=>({id:a,label:a,fn:()=>toggle(a)})),chipsRef:b=>barApi=b,
        update(dt,t){g.position.y=Math.abs(Math.sin(t*2.2))*.06;g.rotation.y=Math.sin(t*.8)*.25;if(cloud.visible&&Math.random()<.5){const w=P.world(new THREE.Vector3(rand(-.3,.3)*g.scale.x,1.6*g.scale.y,rand(-.15,.15)));FX.sys.emit({x:w.x,y:w.y,z:w.z,vy:-3,life:.35,s0:.06,s1:.05,c0:[.55,.7,1,.9],c1:[.55,.7,1,0]})}
          if(bodyM.metalness>.3&&Math.random()<.3){const w=P.world(new THREE.Vector3(rand(-.5,.5),rand(.3,1),rand(.1,.5)).multiplyScalar(g.scale.x));FX.sparkle(w,{n:2,size:.12,speed:.6})}}};
    }},
  practise:{type:'pick',title:'Find the describing words',how:'Tap every adjective (describing word).',ar:'اضغط كل صفة (كلمة تصف).',no:'That word is not a describing word.',
    items:[['fluffy',1],['run',0],['sparkly',1],['the',0],['gloomy',1],['jump',0],['enormous',1],['and',0],['cheerful',1],['sing',0]]},
  quiz:[{q:'Which sentence has two adjectives?',o:['It is big and red.','It is a car.','I can run.']},{q:'What does "enormous" mean?',o:['very big','very small','very wet']},{q:'Which word is about touch?',o:['smooth','noisy','sparkly']},{q:'Which word is the opposite of "gloomy"?',o:['cheerful','fierce','tiny']}],
  home:[['Play "Describe it": use two adjectives, the other person guesses.','العبا «صِفه»: صفتان والآخر يخمّن.'],['Use "It is… and…" when you talk on the way to school.','استعملا It is… and… في الطريق إلى المدرسة.']]
};

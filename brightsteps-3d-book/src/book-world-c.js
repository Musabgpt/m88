/* ===== Chapter 3 · Science ===== */
class HelixCurve extends THREE.Curve{constructor(len,r,turns){super();this.len=len;this.r=r;this.turns=turns}getPoint(t,o=new THREE.Vector3()){const a=t*Math.PI*2*this.turns;return o.set(t*this.len,Math.cos(a)*this.r,Math.sin(a)*this.r)}}
WC.materials={
  learn:{body:['Everything is made of a material: metal, wood, plastic, glass, fabric, paper, rubber…','We test materials. Can we squash, bend, twist or stretch them?','Some go back to their shape (rubber, sponge). Some stay changed (play dough, paper). Some are too strong to change with our hands (metal, wood).','We choose a material because of what it can do:','EX:spoon — metal — strong and does not break easily'],
    words:[['squash','اسحق'],['bend','اثنِ'],['twist','الوِ'],['stretch','مُدّ'],['material','مادة']],
    flap:{q:'You stretch an elastic band and let go. What happens?',a:'It goes back to its shape. Rubber is stretchy (elastic).'},
    ar:'نختبر المواد: هل تنسحق أو تنثني أو تلتوي أو تتمدّد؟ ولماذا نختار مادة معيّنة لصنع شيء ما.'},
  try:{hint:'Drag the orange ball to stretch the spring, then let go! Below: choose a material and press a test.',ar:'اسحب الكرة لتمدّ الزنبرك، ثم اختر مادة واضغط اختباراً.',
    pop(P){
      const post=G.box(.16,.9,.4,'#6b7290',{metalness:.3});post.position.set(-1.42,.45,-.8);P.root.add(post);
      const sg=new THREE.TubeGeometry(new HelixCurve(1,.14,9),180,.022,6,false);const spring=G.mesh(sg,P.m('#c9cfe0',{metalness:.5,roughness:.28}));spring.position.set(-1.34,.5,-.8);spring.userData.noInk=true;P.root.add(spring);
      const ball=G.sph(.13,'#ff7b39',{roughness:.4},20);ball.position.set(-.34,.5,-.8);P.root.add(ball);const hook=G.mesh(new THREE.TorusGeometry(.06,.018,8,16),P.m('#c9cfe0',{metalness:.5}));hook.rotation.y=Math.PI/2;hook.position.set(-.25,.5,-.8);P.root.add(hook);
      let L=1,v=0,held=false,maxL=1,stretched=false;
      P.drag(ball,{plane:'z',tagText:'✋ Drag me →',tagDy:.45,start(){held=true;Snd.tick()},move(lp){L=clamp(lp.x+1.34,.55,1.95);maxL=Math.max(maxL,L)},end(){held=false;if(maxL>1.5){P.cap('Boing! The spring goes back to its shape: it is elastic.','الزنبرك يعود إلى طوله: مرن.');Voice.say('It springs back!');stretched=true;Snd.tone(320,.4,{type:'triangle',slide:620,vol:.12})}maxL=1}});
      const bed=G.box(2.4,.12,.9,'#2a2d3a',{metalness:.2});bed.position.set(0,.06,.75);P.root.add(bed);const tagL=G.label('',{size:.26,bg:'rgba(255,250,236,.92)',color:PINK,border:P.col,px:52,depth:true,fixed:true});tagL.position.set(0,1.05,.75);P.root.add(tagL);
      const USE=[0,1,2,5];let mi=0,mesh=null,base=null,busy=false;const tried=new Set();
      function setM(i){mi=i;if(mesh){P.root.remove(mesh);mesh.geometry.dispose()}const m=MATS[i];const g=new THREE.BoxGeometry(1.15,m.k==='paper'?.04:.3,m.k==='paper'?.6:.42,24,4,4);base=g.attributes.position.array.slice();
        mesh=G.mesh(g,P.m(m.col,m.mat==='metal'?{metalness:.45,roughness:.3,emissive:'#3a3f52',emissiveIntensity:.25}:m.mat==='wood'?{roughness:.8}:{}));mesh.position.set(0,.12+(m.k==='paper'?.02:.15),.75);mesh.castShadow=true;mesh.userData.noInk=true;P.root.add(mesh);P.tap(mesh,()=>Voice.say(m.name));
        tagL.userData.set(m.name);P.cap(`${m.name}: press a test button.`,m.ar)}
      async function test(act){if(busy)return;busy=true;const m=MATS[mi],amp=m[act]||0,arr=mesh.geometry.attributes.position.array;const go=a=>{deformPts(base,arr,act,a,1.15);mesh.geometry.attributes.position.needsUpdate=true;mesh.geometry.computeVertexNormals()};
        const A=ACTS.find(a=>a[0]===act),verb=A[2].toLowerCase();Snd.noise(.3,{vol:.08,f:700});
        if(amp<.05){await E.anim(.45,k=>{mesh.position.x=Math.sin(k*Math.PI*8)*.03*(1-k)});P.cap(`${m.name}: you cannot ${verb} it with your hands. It is strong.`,'مادة قوية لا تتغيّر بأيدينا.')}
        else{await E.anim(.55,k=>go(amp*Ease.out(k)));await E.wait(.35);if(m.back){await E.anim(.5,k=>go(amp*(1-Ease.back(k))));go(0);P.cap(`${m.name}: it changes shape, then goes back!`,'تغيّر شكلها ثم عادت كما كانت.')}
          else P.cap(`${m.name}: it changes shape and stays changed.`,'تغيّر شكلها وبقي متغيّراً.')}
        Voice.say(m.name+', '+verb);tried.add(m.k);if(tried.size>=3&&stretched)P.done('You tested 3 materials and stretched the spring!');else if(tried.size>=3&&!stretched)P.cap('Now stretch the spring at the top!','بقي أن تمدّ الزنبرك في الأعلى.');busy=false}
      setM(0);
      return {chips:[...USE.map((i,k)=>({id:MATS[i].k,label:MATS[i].name.replace('Elastic band','Elastic').replace('Play dough','Dough').replace('Metal spoon','Spoon'),group:'m',on:k===0,fn:()=>{if(!busy)setM(i)}})),...ACTS.map(([k,ar,en])=>({label:'✋ '+en,cls:'gold',fn:()=>test(k)}))],
        update(dt){if(!held){v+=(-(L-1)*70-v*3.2)*dt;L+=v*dt}spring.scale.x=L;ball.position.x=-1.34+L;hook.position.x=-1.34+L-.09}};
    }},
  practise:{type:'sort',title:'What is it made of?',how:'Tap a thing, then tap the material it is made of.',ar:'اضغط الشيء ثم المادة المصنوع منها.',
    bins:[['Metal','معدن','🔩'],['Wood','خشب','🪵'],['Fabric','قماش','🧵']],items:[['🥄 spoon','Metal'],['🔑 key','Metal'],['🪙 coin','Metal'],['🪑 chair','Wood'],['✏️ pencil','Wood'],['🌳 log','Wood'],['🧥 coat','Fabric'],['🧦 sock','Fabric'],['🧣 scarf','Fabric']]},
  quiz:[{q:'Why is a spoon made of metal?',o:['It is strong','It is see-through','It is soft']},{q:'Which one stretches and then goes back?',o:['an elastic band','paper','a wooden block']},{q:'Why are wellies made of rubber?',o:['They are waterproof','They are see-through','They are heavy']},{q:'What happens if you stretch paper?',o:['It tears','It goes back','It gets longer and longer']}],
  home:[['Materials hunt: find 10 things at home. What is each one made of?','صيد المواد: 10 أشياء ومادة كل منها.'],['Test 5 safe things: do they bend, twist or stretch?','اختبرا 5 أشياء آمنة: تنثني؟ تلتوي؟ تتمدّد؟']]
};
WC.water={
  learn:{body:['Absorbent materials soak up water: a towel, fabric, paper.','Waterproof materials do not let water through: plastic, foil, rubber.','A fair test: predict first, cut pieces the same size and use the same amount of water.','We choose materials for the job. A raincoat must be waterproof. A towel must be absorbent.'],
    words:[['absorbent','ماصّ'],['waterproof','مقاوم للماء'],['predict','توقّع'],['fair test','اختبار عادل']],
    flap:{q:'Which material is best for a raincoat?',a:'A waterproof one, like plastic. A towel needs to be absorbent.'},
    ar:'المادة الماصّة تشرب الماء، والمقاومة للماء لا تسمح له بالمرور.'},
  try:{hint:'Predict first! Then tap the cloud (or press Rain) to rain on the four materials.',ar:'توقّع أولاً، ثم اضغط الغيمة لتمطر.',
    pop(P){
      const SW=[['towel','#ff8fb1',true,.08],['plastic','#6db4ff',false,.04],['foil','#c9cfe0',false,.03],['paper','#f4efe0',true,.03]];
      const sw=SW.map(([en,col,abs,h],i)=>{const m=P.m(col,en==='foil'?{metalness:.4,roughness:.35,emissive:'#3a3f52',emissiveIntensity:.3}:en==='plastic'?{roughness:.18}:{roughness:.95});const b=G.mesh(new THREE.BoxGeometry(.66,h,.66),m);b.position.set(-1.2+i*.8,h/2,.45);P.root.add(b);
        const lab=P.label(en+'\n?',{size:.36,px:44,lh:1.1});lab.position.set(-1.2+i*.8,.55,1.08);P.root.add(lab);return {b,m,abs,h,wet:0,c0:new THREE.Color(col),en,lab}});
      const cloud=new THREE.Group();[[0,0,.38],[.42,.05,.3],[-.45,.02,.32],[.15,.22,.3],[-.2,.2,.26],[.8,0,.22],[-.85,0,.22]].forEach(([x,y,r])=>{const s=G.sph(r,'#f4f6ff',{roughness:.9},16);s.position.set(x,y,0);s.userData.noInk=true;cloud.add(s)});cloud.scale.set(1.05,.75,.75);cloud.position.set(0,1.45,.05);P.root.add(cloud);
      const dg=new THREE.SphereGeometry(.045,8,6);dg.userData={keep:true};const dm=P.m('#4aa3ff',{roughness:.1,transparent:true,opacity:.85});dm.userData.keep=true;const drops=[];let raining=0,done=false;
      const rain=()=>{P.untag(cloud);raining=2.6;done=false;Snd.splash();P.cap('It is raining! Which materials drink the water?','راقب: أي مادة تشرب الماء؟')};
      P.tap(cloud,rain);P.tag(cloud,'👆 Tap the cloud',{dy:.42});
      function reset(){sw.forEach(s=>{s.wet=0;s.m.color.copy(s.c0);s.lab.userData.set(s.en+'\n?')});drops.forEach(d=>P.root.remove(d.m));drops.length=0;done=false;P.cap('All dry again. Predict, then make it rain.','جفّت المواد.')}
      return {chips:[{label:'🌧 Rain',cls:'gold',fn:rain},{label:'☀️ Dry',fn:reset},{label:'🧥 Raincoat?',fn:()=>P.cap('A raincoat needs a waterproof material, like plastic.','نحتاج مادة مقاومة للماء.')}],
        update(dt,t){cloud.position.x=Math.sin(t*.5)*.12;
          if(raining>0){raining-=dt;for(let k=0;k<3;k++){const s=pick(sw);const m=new THREE.Mesh(dg,dm);m.scale.y=1.6;m.position.set(s.b.position.x+rand(-.28,.28),1.25,s.b.position.z+rand(-.28,.28));P.root.add(m);drops.push({m,s,v:0})}
            if(raining<=0&&!done){done=true;setTimeout(()=>{if(!P.alive())return;sw.forEach(s=>s.lab.userData.set(s.en+'\n'+(s.abs?'absorbent':'waterproof')));P.cap('The towel and paper are absorbent. Plastic and foil are waterproof.','المنشفة والورق ماصّان، والبلاستيك والألمنيوم مقاومان للماء.');P.done('You finished the water test!')},900)}}
          for(let i=drops.length-1;i>=0;i--){const d=drops[i];if(d.rest){d.rest-=dt;if(d.rest<=0){P.root.remove(d.m);drops.splice(i,1)}continue}d.v-=9*dt;d.m.position.y+=d.v*dt;const top=d.s.h+.03;
            if(d.m.position.y<=top){if(d.s.abs){d.s.wet=Math.min(1,d.s.wet+.035);d.s.m.color.copy(d.s.c0).multiplyScalar(1-.5*d.s.wet);P.root.remove(d.m);drops.splice(i,1)}else{d.m.position.y=top;d.m.scale.set(1.3,.6,1.3);d.rest=rand(2,4)}}}}};
    }},
  practise:{type:'sort',title:'Absorbent or waterproof?',how:'Tap a thing, then tap the right box.',ar:'اضغط الشيء ثم الصندوق المناسب.',
    bins:[['Absorbent','ماصّ','🧽'],['Waterproof','مقاوم للماء','☂️']],items:[['towel','Absorbent'],['sponge','Absorbent'],['kitchen roll','Absorbent'],['cotton T-shirt','Absorbent'],['raincoat','Waterproof'],['umbrella','Waterproof'],['wellies','Waterproof'],['plastic bag','Waterproof']]},
  quiz:[{q:'Which material is waterproof?',o:['plastic','paper','cotton']},{q:'A towel should be…',o:['absorbent','waterproof','see-through']},{q:'"Waterproof" means…',o:['water cannot get through','it soaks up water','it is made of water']},{q:'To make it a fair test we use…',o:['the same amount of water','lots of water on one','no water at all']}],
  home:[['Test 4 materials with drops of water from a teaspoon.','اختبرا 4 مواد بقطرات ماء من ملعقة صغيرة.'],['Put a towel underneath! Record what happens.','ضعا منشفة تحتها وسجّلا النتيجة.']]
};
/* ===== Chapter 4 · History · Design & Technology ===== */
WC.fire={
  learn:{body:['The Great Fire of London started on Sunday 2 September 1666, in a bakery on Pudding Lane.','Why did it spread? Wooden houses were close together, the streets were narrow, the summer was hot and dry, and a strong east wind was blowing.','It burned for four days: about 13,200 houses and 87 churches.','Afterwards, London was rebuilt with bricks and stone, with wider streets. Fire brigades began.'],
    words:[['bakery','مخبز'],['Pudding Lane','شارع بودينغ'],['River Thames','نهر التايمز'],['cause','سبب'],['effect','نتيجة']],
    flap:{q:'Why did the fire spread so fast?',a:'The wooden houses were close together, it was dry, and a strong wind blew. There were no fire engines.'},
    ar:'حريق لندن العظيم عام 1666: نتعلّم أسبابه ونتائجه.'},
  try:{hint:'Press the days in order and watch the fire spread from the bakery with the wind.',ar:'اضغط الأيام بالترتيب وشاهد النار تنتشر.',
    mat(x,a){const [x0,y0]=a.px(-1.62,1.05),[x1,y1]=a.px(1.62,1.62);const g=x.createLinearGradient(0,y0,0,y1);g.addColorStop(0,'#9cc9ef');g.addColorStop(1,'#5f9ed8');x.fillStyle=g;PT.rr(x,x0,y0,x1-x0,y1-y0,18);x.fill();
      x.strokeStyle='rgba(255,255,255,.6)';x.lineWidth=3;for(let i=0;i<5;i++){const yy=y0+18+i*20;x.beginPath();for(let X=x0+10;X<x1-10;X+=8)x.lineTo(X,yy+Math.sin(X*.05+i)*4);x.stroke()}
      PT.fnt(x,26,700,FONT_R);PT.ltr(x,'center');x.fillStyle='#16406b';x.fillText('River Thames',(x0+x1)/2,y1-12);
      PT.fnt(x,24,700,FONT_R);x.fillStyle='#8a3a12';const [px,py]=a.px(1.25,.72);x.fillText('Pudding Lane',px,py)},
    pop(P){
      const H=[];const xs=[1.3,.72,.14,-.44,-1.02];[-.5,.25].forEach((z,r)=>xs.forEach((x,i)=>{const g=new THREE.Group();const h=rand(.5,.72),w=.48;const wall=new THREE.Mesh(new THREE.BoxGeometry(w,h,.44),new THREE.MeshStandardMaterial({map:Fire1666.timberTex(),roughness:.85}));wall.position.y=h/2;
        const roof=G.mesh(new THREE.ConeGeometry(.42,.36,4),P.m('#5a2f22',{flatShading:true}));roof.rotation.y=Math.PI/4;roof.scale.set(.85,1,.75);roof.position.y=h+.18;g.add(wall,roof);g.position.set(x,0,z+rand(-.04,.04));P.root.add(g);
        const day=r===1&&i===0?1:Math.min(5,1+Math.floor(i*.9+(r?0:.4)));H.push({g,wall,roof,h,x,day,brk:i===4&&r===0,rc:roof.material.color.clone()})}));
      const church=new THREE.Group();const cw=G.box(.5,.6,.5,'#d9d2c0');cw.position.y=.3;const dome=G.mesh(new THREE.SphereGeometry(.25,16,10,0,Math.PI*2,0,Math.PI/2),P.m('#a9b2c6',{metalness:.2}));dome.position.y=.6;const sp=G.cone(.05,.3,'#ffd166');sp.position.y=.98;church.add(cw,dome,sp);church.position.set(-1.45,0,.22);P.root.add(church);H.push({g:church,wall:cw,roof:dome,h:.85,x:-1.45,day:3,rc:dome.material.color.clone(),wc:cw.material.color.clone()});
      const sign=txtCard(.5,.2,'Bakery',{pw:256,bg:'#ffd166',bw:4});sign.position.set(1.3,.82,.5);P.root.add(sign);
      const wind=new THREE.Group();const sh=G.cyl(.03,.03,1.1,'#6db4ff');sh.rotation.z=Math.PI/2;const hd=G.cone(.08,.22,'#6db4ff');hd.rotation.z=Math.PI/2;hd.position.x=-.66;wind.add(sh,hd);wind.position.set(.25,.85,.78);P.root.add(wind);const wl=P.label('East wind ←',{size:.24,px:44});wl.position.set(.25,1.05,.78);P.root.add(wl);
      const boat=new THREE.Group();const hull=G.box(.4,.08,.16,'#8a5a36');const sail=G.cone(.12,.3,'#fff7e6',{},3);sail.position.y=.2;boat.add(hull,sail);boat.position.set(1.4,.05,1.35);P.root.add(boat);
      let day=0;const ash=new THREE.Color('#3a302c');
      function setDay(d){day=d;const F=FIRE_DAYS[d-1];H.forEach(h=>{const st=h.brk&&d>=4?'break':d>=5?(h.day<=4?'ash':'ok'):h.day<=d?(d-h.day>=2?'ash':'burn'):'ok';h.st=st;
          const wm=h.wall.material,base=h.wc||new THREE.Color(1,1,1);h.roof.material.color.copy(st==='ash'?ash:h.rc);if(st==='ash'){wm.color.copy(ash);wm.emissive.set('#000')}else if(st==='burn'){wm.color.copy(base);wm.emissive.set('#5a1800');wm.emissiveIntensity=.6}else{wm.color.copy(base);wm.emissive.set('#000')}
          E.tw(h.g.scale,{y:st==='break'?.15:st==='ash'?.7:1},.5)});
        wind.visible=wl.visible=d<=3;P.cap(F.d+': '+F.en,F.ar);Voice.say(F.en);if(d>=5)P.done('You watched the fire until it went out!')}
      P.tag(sign,'🔥 It starts here',{dy:.3});
      const DN=['Sun','Mon','Tue','Wed','Thu'];
      return {chips:DN.map((n,i)=>({id:'d'+i,label:`Day ${i+1} · ${n}`,group:'d',fn:()=>{P.untag(sign);setDay(i+1)}})),capEn:'London, 1666. Press Day 1.',capAr:'اضغط اليوم الأول.',
        update(dt,t){if(day>=2&&day<=3)boat.position.x=1.4-((t*.25)%3);H.forEach(h=>{if(h.st==='burn'){for(let k=0;k<2;k++){const w=P.world(new THREE.Vector3(h.x+rand(-.2,.2),h.h+rand(0,.2),h.g.position.z+rand(-.15,.15)));FX.sys.emit({x:w.x,y:w.y,z:w.z,vx:-.4,vy:rand(.8,1.6),life:rand(.4,.8),s0:rand(.25,.4),s1:.04,c0:Math.random()<.5?[1,.6,.15,.95]:[1,.35,.08,.9],c1:[.8,.15,.05,0]})}}
          else if(h.st==='ash'&&Math.random()<.08){const w=P.world(new THREE.Vector3(h.x,h.h*.7,h.g.position.z));FX.sys.emit({x:w.x,y:w.y,z:w.z,vy:.5,vx:-.2,life:2,s0:.2,s1:.55,c0:[.45,.42,.4,.5],c1:[.4,.4,.4,0]})}})}};
    }},
  practise:{type:'order',title:'Put the days in order',how:'Tap the days of the Great Fire in the order they happened.',ar:'رتّب أيام الحريق.',
    items:['Sunday: the fire starts in a bakery on Pudding Lane.','Monday: a strong wind blows the fire west.','Tuesday: St Paul’s Cathedral burns.','Wednesday: houses are pulled down to stop the fire.','Thursday: the fire is out.']},
  quiz:[{q:'When was the Great Fire of London?',o:['1666','1966','2006']},{q:'Where did the fire start?',o:['in a bakery','in a school','in a castle']},{q:'How did they stop the fire?',o:['they pulled houses down','they used fire engines','it snowed']},{q:'What did Samuel Pepys bury in his garden?',o:['cheese and wine','his books','his cat'],why:'He wrote about it in his diary!'}],
  home:[['Write a diary as if you were in London in 1666.','اكتب يوميات كأنك في لندن عام 1666.'],['Read "Vlad and the Great Fire of London" together.','اقرآ قصة Vlad and the Great Fire of London.']]
};
WC.wheels={
  learn:{body:['Wheels and axles work together. The axle is the rod that the wheel turns on.','The two axles must be parallel, so the car goes straight.','Big wheels roll over bumps more easily, and go further with every turn.','The wheels must not rub against the chassis (the body of the car).'],
    words:[['wheel','عجلة'],['axle','محور'],['chassis','هيكل'],['ramp','منحدر'],['parallel','متوازي']],
    flap:{q:'Big wheels or small wheels: which go over a bump more easily?',a:'Big wheels. They climb over bumps and go further with each turn.'},
    ar:'العجلات والمحاور تعمل معاً. المحوران متوازيان لتسير السيارة مستقيمة.'},
  try:{hint:'Drag the car up the ramp and let it go! Change the wheels and try the bump.',ar:'اسحب السيارة إلى أعلى المنحدر ثم اتركها.',
    mat(x,a){const [x0,y0]=a.px(-1.62,-.38),[x1,y1]=a.px(.4,.38);x.fillStyle='#d9cdb4';x.fillRect(x0,y0,x1-x0,y1-y0);x.strokeStyle='#fffaf0';x.lineWidth=5;x.setLineDash([22,16]);x.beginPath();x.moveTo(x0,(y0+y1)/2);x.lineTo(x1,(y0+y1)/2);x.stroke();x.setLineDash([]);
      for(let i=0;i<=5;i++){const [X,Y]=a.px(.35-i*.4,.55);x.fillStyle='#a3690b';x.fillRect(X-2,Y-30,4,22);PT.fnt(x,24,700,FONT_D);PT.ltr(x,'center');x.fillText(String(i),X,Y+10)}
      PT.fnt(x,22,700,FONT_R);PT.ltr(x);x.fillStyle=PINK2;const [X,Y]=a.px(-1.6,.92);x.fillText('← distance in squares',X,Y)},
    pop(P){
      const R0=.35,RT=1.55,RH=.85,slope=Math.atan2(RH,RT-R0),bx=-.55,bw=.18,bh=.11;let bump=true;
      const ramp=new THREE.Shape();ramp.moveTo(R0,0);ramp.lineTo(RT,0);ramp.lineTo(RT,RH);ramp.closePath();const rg=new THREE.ExtrudeGeometry(ramp,{depth:.72,bevelEnabled:false});rg.translate(0,0,-.36);const rm=G.mesh(rg,P.m('#c08a50'));P.root.add(rm);
      const bm=G.mesh(new THREE.CylinderGeometry(bw,bw,.7,20,1,false,0,Math.PI),P.m('#8a5a36'));bm.rotation.order='ZYX';bm.rotation.set(Math.PI/2,0,Math.PI/2);bm.scale.set(bh/bw,1,1);bm.position.set(bx,0,0);P.root.add(bm);
      const ground=X=>{if(X>R0)return Math.min(RH,(X-R0)*Math.tan(slope));if(bump&&Math.abs(X-bx)<bw){const u=(X-bx)/bw;return bh*Math.sqrt(Math.max(0,1-u*u))}return 0};
      const car=new THREE.Group();P.root.add(car);let r=.17,X=RT-.2,v=0,held=false,run=false;const sizes=new Set();const wheels=[];
      function build(){PK.disposeTree(car);car.clear();wheels.length=0;const ch=G.box(.56,.12,.3,'#ff5d8f');ch.position.y=r+.02;const cab=G.box(.26,.14,.26,'#fff7e6');cab.position.set(-.04,r+.15,0);car.add(ch,cab);
        [-.19,.19].forEach(x=>{const ax=G.cyl(.018,.018,.42,'#2d2219');ax.rotation.x=Math.PI/2;ax.position.set(x,r,0);car.add(ax);[-.19,.19].forEach(z=>{const w=Wheels.wheel(r,'#ffd166');w.position.set(x,r,z);car.add(w);wheels.push(w)})});P.ink(car);car.traverse(o=>{if(o.isMesh)o.castShadow=true})}
      build();
      const place=(dt)=>{const g=ground(X),ang=X>R0&&X<RT?slope:0;car.position.set(X,g,0);car.rotation.z=ang;wheels.forEach(w=>w.rotation.z-=v*dt/r)};place(0);
      P.drag(car,{plane:'z',tagText:'✋ Drag the car',tagDy:.55,start(){held=true;run=false;v=0},move(lp){X=clamp(lp.x,R0-.2,RT-.15)},end(){held=false;if(X>R0+.1){run=true;Snd.whoosh()}}});
      const reset=()=>{X=RT-.2;v=0;run=false};
      return {chips:[{id:'big',label:'⚪ Big wheels',group:'w',on:true,fn:()=>{r=.17;build();reset()}},{id:'small',label:'• Small wheels',group:'w',fn:()=>{r=.08;build();reset()}},{label:'⛰ Bump',toggle:true,on:true,fn:(on)=>{bump=on;bm.visible=on}},{label:'↺ Reset the car',fn:reset}],
        update(dt){if(run&&!held){const onR=X>R0;const a=onR?-6.5*Math.sin(slope):0;const fr=(r>.12?.45:.75);v+=a*dt;v+=(v<0?fr:-fr)*dt*(Math.abs(v)>.02?1:0);
            if(bump&&r<.12&&X>bx+bw&&X+v*dt<=bx+bw+.06){X=bx+bw+.06;v=Math.abs(v)*.25;Snd.tone(160,.15,{vol:.12})}
            X+=v*dt;if(X<-1.6){X=-1.6;v=0}if(!onR&&Math.abs(v)<.03){v=0;run=false;const d=Math.max(0,(R0-X)/.4);sizes.add(r>.12?'big':'small');const stuck=bump&&r<.12&&X>bx;
              P.cap(`${r>.12?'Big':'Small'} wheels: ${d.toFixed(1)} squares.${stuck?' Stuck at the bump!':''}`,stuck?'العجلات الصغيرة علقت عند المطبّ.':'المسافة بالمربعات.');if(sizes.size>=2)P.done('You tried big and small wheels!')}}
          place(dt)}};
    }},
  practise:{type:'pick',title:'Wheels and axles',how:'Tap everything that moves on wheels and axles.',ar:'اضغط كل شيء له عجلات ومحاور.',no:'That one has no wheels!',
    items:[['🚗 car',1],['🚲 bike',1],['🛏️ bed',0],['🚂 train',1],['📚 book',0],['🛒 trolley',1],['🥄 spoon',0],['🪁 kite',0],['🛴 scooter',1]]},
  quiz:[{q:'What is an axle?',o:['the rod a wheel turns on','the car seat','a big bump']},{q:'Why did the car turn to one side?',o:['the axles were not parallel','the wheels were round','it was red']},{q:'Which wheels go over bumps better?',o:['big wheels','small wheels','no wheels']},{q:'In one turn, a big wheel goes…',o:['further','less far','nowhere']}],
  home:[['Build a little car from things at home.','ابنيا سيارة صغيرة من مواد البيت.'],['Roll it down a ramp (a tilted book) with different wheels.','جرّباها على منحدر بعجلات مختلفة.']]
};

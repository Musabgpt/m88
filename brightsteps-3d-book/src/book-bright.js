/* ===== Bright lives in the book =====
   A little star floats over the open book and lights the page with its glow. Tap it and its thought bubbles open;
   tap a sentence or a key word and it flies there and explains just that; "Ask why" under a 3D model, "Hint" in a quiz.
   Every answer is written in ink on a paper note that pops out of the page, right next to what the child asked about,
   while the words stream in from the AI. The AI is part of the page, not a window beside it. */
const Bright={on:false,st:null,scene:null,g:null,parts:null,pos:null,goal:null,home:null,away:false,state:'idle',stateT:0,
  menu:[],card:null,marks:[],req:0,reading:null,jump:0,trailT:0,blinkT:2.5,homeT:0,qq:{},qBusy:false,greeted:false,tagS:null,
  attach({scene,st}){this.detach();this.on=true;this.st=st;this.scene=scene;this.pos=new THREE.Vector3();this.goal=new THREE.Vector3();this.home=new THREE.Vector3();
    this.build();this.dust();this.homeAt(true)},
  detach(){if(!this.on)return;this.closeMenu();this.closeCard(true);this.stopRead();this.clearMarks();this.untagMe();const b=$('#brightAsk');if(b)b.remove();
    if(this.parts){E.untap(this.parts.hit)}[this.g,this.motes&&this.motes.pts].forEach(o=>{if(o){this.scene.remove(o);PK.disposeTree(o)}});
    this.g=null;this.parts=null;this.motes=null;this.on=false;this.st=null;this.scene=null},
  /* ---------- the star ---------- */
  build(){const g=new THREE.Group();
    const sh=new THREE.Shape();for(let i=0;i<10;i++){const r=i%2?.105:.235,a=Math.PI/2+i*Math.PI/5;const x=Math.cos(a)*r,y=Math.sin(a)*r;if(i)sh.lineTo(x,y);else sh.moveTo(x,y)}sh.closePath();
    const geo=new THREE.ExtrudeGeometry(sh,{depth:.07,bevelEnabled:true,bevelThickness:.035,bevelSize:.028,bevelSegments:3,curveSegments:1});geo.center();
    const body=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({color:'#ffd35a',emissive:'#ffad1f',emissiveIntensity:.62,roughness:.32,metalness:.12}));body.castShadow=true;
    const ink=new THREE.MeshBasicMaterial({color:'#3a2208'}),white=new THREE.MeshBasicMaterial({color:'#ffffff'});
    const eyes=[-1,1].map(s=>{const e=new THREE.Mesh(new THREE.SphereGeometry(.027,14,10),ink);e.position.set(s*.052,.03,.073);e.scale.z=.5;const hl=new THREE.Mesh(new THREE.SphereGeometry(.009,8,6),white);hl.position.set(.01,.011,.02);e.add(hl);return e});
    const mouth=new THREE.Mesh(new THREE.TorusGeometry(.032,.0075,6,18,Math.PI),ink);mouth.position.set(0,-.024,.075);mouth.rotation.z=Math.PI;
    const blush=new THREE.MeshBasicMaterial({color:'#ff8fa3',transparent:true,opacity:.75});const cheeks=[-1,1].map(s=>{const c=new THREE.Mesh(new THREE.CircleGeometry(.018,12),blush);c.position.set(s*.09,-.014,.077);return c});
    const face=new THREE.Group();face.add(...eyes,mouth,...cheeks);body.add(face);
    const glow=new THREE.Sprite(new THREE.SpriteMaterial({map:FX.soft,color:0xffc95a,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,opacity:.85}));glow.scale.set(1.05,1.05,1);glow.renderOrder=59;
    const hit=new THREE.Mesh(new THREE.SphereGeometry(.34,12,8),new THREE.MeshBasicMaterial({visible:false}));
    const spin=new THREE.Group();spin.add(body);g.add(glow,spin,hit);this.scene.add(g);
    this.g=g;this.parts={body,spin,eyes,mouth,glow,hit};
    E.tap(hit,()=>{this.buzz(12);Snd.pop();this.untagMe();this.toggleMenu()})},
  /* specks of dust drifting in the lamp light */
  dust(){const n=innerWidth<700?32:70,pos=new Float32Array(n*3),seed=[];for(let i=0;i<n;i++){pos[i*3]=rand(-7,7);pos[i*3+1]=rand(.4,3.4);pos[i*3+2]=rand(-4.5,4.5);seed.push(Math.random()*6.283)}
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(pos,3));
    const pts=new THREE.Points(geo,new THREE.PointsMaterial({map:FX.soft,color:0xffd9a0,size:.07,transparent:true,opacity:.5,depthWrite:false,blending:THREE.AdditiveBlending,sizeAttenuation:true}));
    pts.renderOrder=5;pts.raycast=()=>{};this.scene.add(pts);this.motes={pts,seed}},
  /* where Bright waits: above the top corner of the page you are looking at */
  homeAt(snap){const st=this.st;if(!st)return;const k=st.turned,M=st.M;let p;
    if(k<1||k>M+1){const top=BK.BD*2+M*BK.T,tx=(k===0?-BK.W/2-BK.OV/2:BK.W/2+BK.OV/2)*BK.MIR;p=new THREE.Vector3(tx+BK.W*.4,top+.8,-BK.H/2+.6)}
    else{const side=st.single()?st.focus:'L';const w=st.p2w(k,side,BK.PW-130,160);p=new THREE.Vector3(w.x,w.y+.82,w.z)}
    this.home.copy(p);if(!this.away)this.goal.copy(p);if(snap){this.pos.copy(p);if(this.g)this.g.position.copy(p)}},
  flyTo(p){if(!p){this.away=false;this.goal.copy(this.home);return}this.away=true;this.goal.copy(p);if(this.state==='idle')this.setState('fly',.9)},
  setState(s,dur){this.state=s;this.stateT=dur||0},
  buzz(ms){try{if(window.BookNative&&typeof BookNative.vibrate==='function')BookNative.vibrate(Array.isArray(ms)?ms.reduce((a,b)=>a+b,0):ms);else if(navigator.vibrate)navigator.vibrate(ms)}catch(e){}},
  react(kind,o={}){if(!this.on)return;
    if(kind==='cheer'){this.setState('cheer',1.1);this.buzz([16,40,16]);FX.burst(this.g.position.clone(),{n:36,speed:2.1,size:.15,colors:['#ffd166','#ffffff','#ff7b39'],sound:false});
      E.anim(RM?.2:.9,k=>{this.parts.spin.rotation.z=k*Math.PI*4;this.jump=Math.sin(Math.PI*k)*.45},Ease.out).then(()=>{this.jump=0})}
    else if(kind==='oops'){this.setState('oops',1.5);this.buzz(55)}
    else if(kind==='think')this.setState('think',o.dur||40);
    else this.setState('idle')},
  tagMe(text){this.untagMe();if(!this.g)return;const t=Book.tagSprite(text||'👆 Tap me!',.2);this.scene.add(t);this.tagS=t;clearTimeout(this.tagT);this.tagT=setTimeout(()=>{if(this.tagS===t)this.untagMe()},7000)},
  untagMe(){if(this.tagS){this.scene.remove(this.tagS);PK.disposeTree(this.tagS);this.tagS=null}},
  /* ---------- every frame ---------- */
  update(dt,t){if(!this.on||!this.g)return;const P=this.parts;
    if((this.homeT-=dt)<=0){this.homeT=.35;this.homeAt(false)}
    const d=this.goal.clone().sub(this.pos),dist=d.length();this.pos.addScaledVector(d,Math.min(1,dt*(this.away?4:2.6)));
    if(dist>.06&&(this.trailT-=dt)<=0){this.trailT=.05;FX.sparkle(this.g.position.clone(),{n:2,size:.11,speed:.35,colors:['#ffd166','#fff6d8']})}
    const bob=Math.sin(t*2.1)*.05+this.jump;this.g.position.set(this.pos.x,this.pos.y+bob,this.pos.z);this.g.lookAt(E.camera.position);
    if(this.state!=='idle'&&this.state!=='think'&&this.stateT>0&&(this.stateT-=dt)<=0)this.state='idle';
    const s=this.state;
    if(s==='think')P.spin.rotation.z+=dt*6.5;else if(s!=='cheer'){P.spin.rotation.z+=(Math.sin(t*1.3)*.14-P.spin.rotation.z)*Math.min(1,dt*4)}
    if(s==='oops')P.spin.position.x=Math.sin(t*38)*.025*Math.min(1,this.stateT);else P.spin.position.x=0;
    P.mouth.rotation.z=s==='oops'?0:Math.PI;P.mouth.scale.y=s==='talk'?.55+Math.abs(Math.sin(t*11))*.9:1;
    if((this.blinkT-=dt)<0){const e=this.blinkT>-.12?.12:1;P.eyes.forEach(x=>x.scale.y=e);if(this.blinkT<=-.12)this.blinkT=rand(2.4,5.5)}
    const pulse=s==='think'?.25*Math.sin(t*9):.1*Math.sin(t*2.6);P.glow.material.opacity=.72+pulse;P.glow.scale.setScalar(1.05+pulse*.4);
    if(this.motes){const a=this.motes.pts.geometry.attributes.position,sd=this.motes.seed;for(let i=0;i<sd.length;i++){a.array[i*3+1]+=Math.sin(t*.4+sd[i])*.0009;a.array[i*3]+=Math.cos(t*.25+sd[i]*1.7)*.0007}a.needsUpdate=true}
    if(this.tagS){this.tagS.position.copy(this.g.position);this.tagS.position.y+=.42}
    this.placeMenu();this.placeBox();
    const C=this.card;if(C){C.tick-=dt;const now=performance.now(),el=Math.min(.25,(now-(C.lt||now))/1000);C.lt=now;const writing=C.shown<C.text.length;if(writing)C.shown=Math.min(C.text.length,C.shown+el*(C.cps+(C.text.length-C.shown)*3));
      if((writing||C.status==='think')&&C.tick<=0){C.tick=C.big?.08:.05;this.drawCard()}
      if(!writing&&C.final&&C.status!=='done')this.finishCard()}},
  /* ---------- thought bubbles ---------- */
  spread(){const st=this.st;return st&&st.turned>=1&&st.turned<=st.M+1?SPREADS[st.turned-1]:null},
  items(){const st=this.st,k=st.turned,sp=this.spread();const T=AI_TASKS;const I=(t,fn)=>({icon:T[t].icon,label:T[t].label,fn:fn||(()=>this.ask({task:t,sp}))});
    if(Board.on)return [{icon:'▶️',label:'Carry on',fn:()=>{Board.paused=false;Board.dirty=true}},{icon:'❓',label:'Ask a question · اسأل',fn:()=>this.listen()},{icon:'💡',label:'Another way',fn:()=>Board.another()},{icon:'🌙',label:'In Arabic · بالعربي',fn:()=>Board.arabic()},{icon:'✕',label:'Stop the lesson',fn:()=>Board.stop()}];
    if(!sp){const bd=BookData();return [{icon:'👋',label:"Hi, I'm Bright!",fn:()=>this.hello()},{icon:'📖',label:k===0?'Open the book':'Open it again',fn:()=>st.go(k===0?1:bd.last>1?bd.last:1)}]}
    if(sp.kind==='intro')return [{icon:'👋',label:'Who are you?',fn:()=>this.hello()},{icon:'🗺️',label:'Where do I start?',fn:()=>this.ask({task:'ask',sp,text:'Which topic in this book should I start with today, and why?'})},I('ask',()=>this.listen())];
    if(sp.kind==='learn')return [{icon:'🎓',label:'Teach me',fn:()=>Board.start(sp)},I('explain'),I('example'),I('fact'),I('story'),I('quiz'),{icon:'🔊',label:'Read it to me',fn:()=>this.readAloud()},I('ask',()=>this.listen()),I('parents')];
    if(sp.kind==='practise')return [{icon:'💡',label:'Hint for this question',fn:()=>this.quizHint()},I('quiz'),I('fact'),I('ask',()=>this.listen()),I('parents')];
    return [{icon:'🌟',label:'My progress',fn:()=>this.progress()},I('ask',()=>this.listen()),{icon:'⚙️',label:'For grown-ups',fn:()=>AISettings.gate()}]},
  summon(){if(!this.on)return;this.untagMe();this.buzz(10);if(!this.menu.length)this.openMenu()},
  toggleMenu(){if(this.menu.length)this.closeMenu();else this.openMenu()},
  openMenu(){this.closeMenu();this.stopRead();if(Board.on){Board.paused=true;Board.dirty=true}const its=this.items();
    its.forEach((it,i)=>{const s=G.label(it.icon+'  '+it.label,{color:'#3a2600',bg:'rgba(255,251,238,.97)',border:'#f0b93a',px:46,size:this.st.single()?.27:.2,fixed:true,depth:false,order:90});
      const full=s.scale.clone();s.scale.set(.001,.001,1);s.userData.full=full;this.scene.add(s);this.menu.push(s);
      E.wait(RM?0:i*.045).then(()=>{if(this.menu.includes(s))E.tw(s.scale,{x:full.x,y:full.y},RM?.01:.3,Ease.back)});
      E.tap(s,()=>{this.buzz(10);Snd.tick();this.closeMenu();it.fn()})});
    this.placeMenu();Snd.pop()},
  closeMenu(){if(!this.menu.length)return;this.menu.forEach(s=>{E.untap(s);E.stopTweens(s.scale);this.scene.remove(s);PK.disposeTree(s)});this.menu=[]},
  /* a trail of bubbles beside Bright, on the side of the screen with more room */
  placeMenu(){if(!this.menu.length||!this.g)return;const cam=E.camera;cam.updateMatrixWorld();const right=new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld,0),up=new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld,1);
    const c=this.g.position,n=this.menu.length,dir=c.clone().project(cam).x>0?-1:1;
    this.menu.forEach((s,i)=>{const w=(s.userData.full||s.scale).x;const gap=this.st&&this.st.single()?.34:.27;const xx=dir*(.5+Math.sin((i+.5)/n*Math.PI)*.16+w/2),yy=.1-i*gap;s.position.copy(c).addScaledVector(right,xx).addScaledVector(up,yy)})},
  /* a tap anywhere else closes what Bright has open */
  dismiss(){if(this.menu.length){this.closeMenu();if(Board.on){Board.paused=false;Board.dirty=true}return true}if(this.card){this.closeCard();return true}if(this.reading){this.stopRead();return true}return false},
  isOpen(){return !!(this.menu.length||this.card||this.reading||$('#brightAsk')||Board.on)},
  close(){const b=$('#brightAsk');if(b)b.remove();if(this.dismiss())return true;if(b){if(Board.on&&Board.paused&&!Board.thinking){Board.paused=false;Board.dirty=true}return true}if(Board.on){Board.stop();return true}return false},
  /* the book calls these when a spread is built or starts to fold away */
  spreadReady(keep){const k=this.st?this.st.turned:-1,moved=k!==this.lastK;this.lastK=k;if(!moved&&(Board.on||keep))return;this.closeMenu();this.closeCard(true);this.stopRead();this.clearMarks();this.away=false;this.homeAt(false);
    const sp=this.spread();if(sp&&sp.kind==='learn'&&BookAI.conf().teach!==false&&!Board.auto[sp.w]){Board.maybeAuto(sp);return}if(!this.greeted&&sp&&sp.kind==='learn'){this.greeted=true;setTimeout(()=>{if(this.on&&!this.isOpen()){this.tagMe();this.react('cheer')}},1400)}},
  redraw(){if(this.card)this.drawCard();if(Board.on)Board.dirty=true},
  fold(){this.closeMenu();this.closeCard(true);this.stopRead();this.clearMarks();Board.stop();const b=$('#brightAsk');if(b)b.remove()},
  /* ---------- the yellow marker on the page ---------- */
  mark(k,side,rects){this.clearMarks();const st=this.st;(rects||[]).forEach((r,i)=>{const L=st.p2w(k,side,r.x,r.y+r.h/2),R=st.p2w(k,side,r.x+r.w,r.y+r.h/2);const w=Math.max(.01,R.x-L.x),d=r.h*L.sz;
      const geo=new THREE.PlaneGeometry(1,1);geo.translate(.5,0,0);const m=new THREE.Mesh(geo,new THREE.MeshBasicMaterial({color:0xffcc26,transparent:true,opacity:.55,depthWrite:false}));
      m.rotation.x=-Math.PI/2;m.position.set(L.x,Math.max(L.y,R.y)+.007,L.z);m.scale.set(.001,d,1);m.renderOrder=3;m.raycast=()=>{};this.scene.add(m);this.marks.push(m);
      E.wait(RM?0:i*.12).then(()=>E.anim(RM?.01:.32,e=>{m.scale.x=Math.max(.001,w*e)},Ease.out))})},
  clearMarks(){this.marks.forEach(m=>{E.stopTweens(m.scale);this.scene.remove(m);m.geometry.dispose();m.material.dispose()});this.marks=[]},
  /* ---------- the paper note that pops out of the page ---------- */
  openCard(o){this.closeCard(true);const st=this.st,k=st.turned,sg=st.single();
    const sp=this.spread();const side=o.anchor?o.anchor.side:sg?st.focus:sp&&sp.kind==='practise'?'L':'R';
    const pw=BK.PW-150,ph=o.kind==='quiz'?(sg?820:700):o.size==='l'?(sg?800:640):o.size==='s'?(sg?480:390):(sg?640:500);
    let cy;if(o.anchor){const ay=o.anchor.py,ah=o.anchor.h||0;if(ay+ah+ph+40<BK.PH-50)cy=ay+ah+24+ph/2;else if(ay-ph-24>50)cy=ay-24-ph/2;else cy=BK.PH-50-ph/2}else cy=Math.min(BK.PH-60-ph/2,Math.max(70+ph/2,BK.PH*.52));
    const kk=k>=1&&k<=st.M+1?k:1;const c=st.p2w(kk,side,BK.PW/2,cy);const w=pw*c.sx,d=ph*c.sz,tilt=o.lift?.62:.3,lift=o.lift||0;
    /* drawn in 1024-wide units; on a phone the canvas itself is smaller, so each redraw sends fewer pixels */
    const cq=sg?.66:1,cw=1024,chh=Math.round(1024*ph/pw);const cv=document.createElement('canvas');cv.width=Math.round(cw*cq);cv.height=Math.round(chh*cq);const tex=new THREE.CanvasTexture(cv);tex.encoding=THREE.sRGBEncoding;tex.anisotropy=8;
    const mesh=new THREE.Mesh(new THREE.PlaneGeometry(w,d),new THREE.MeshStandardMaterial({map:tex,roughness:.88,transparent:true,alphaTest:.5}));mesh.castShadow=true;mesh.rotation.x=-Math.PI/2+tilt;mesh.renderOrder=20;
    const g=new THREE.Group();g.position.set(c.x,c.y+.07+lift+Math.sin(tilt)*d/2,c.z+lift*.35);g.add(mesh);g.scale.set(.05,.05,.05);this.scene.add(g);
    const C={g,mesh,cv,W:cw,H:chh,q:cq,x:cv.getContext('2d'),tex,pw,ph,k:kk,side,title:o.title||'Bright',icon:o.icon||'✨',ar:!!o.ar,auto:!!o.auto,kind:o.kind||'text',text:'',shown:0,cps:RM?999:70,status:'think',final:false,src:'',btns:[],tick:0,big:sg,o};
    this.card=C;this.drawCard();E.tw(g.scale,{x:1,y:1,z:1},RM?.01:.42,Ease.back);Snd.noise(.22,{vol:.08,f:2600,type:'bandpass'});this.buzz(8);
    E.tap(mesh,h=>this.cardTap(h));
    const corner=st.p2w(kk,side,Math.min(BK.PW-60,BK.PW/2+pw/2-10),cy-ph/2);this.flyTo(new THREE.Vector3(corner.x,corner.y+.75,corner.z));
    return C},
  closeCard(fast){const C=this.card;if(!C)return;this.card=null;this.req++;E.untap(C.mesh);this.clearMarks();try{if('speechSynthesis' in window)speechSynthesis.cancel();if(window.BookNative&&BookNative.stop)BookNative.stop()}catch(e){}
    const gone=()=>{this.scene&&this.scene.remove(C.g);C.mesh.geometry.dispose();C.mesh.material.dispose();C.tex.dispose()};
    if(fast||RM)gone();else E.tw(C.g.scale,{x:.05,y:.05,z:.05},.22,Ease.in).then(gone);
    if(!this.reading){this.flyTo(null);if(this.state==='think'||this.state==='talk')this.setState('idle')}},
  cardText(text,o={}){const C=this.card;if(!C)return;if(text!=null){if(text.length<C.shown||!text.startsWith(C.text.slice(0,Math.floor(C.shown))))C.shown=0;C.text=text;if(C.auto&&text)C.ar=aiIsAr(text)}
    if(o.src)C.src=o.src;if(C.text)C.status=C.status==='done'?'done':'write';if(o.final){C.final=true;if(this.state==='think')this.setState('idle')}this.drawCard()},
  finishCard(){const C=this.card;if(!C)return;C.status='done';C.shown=C.text.length;this.drawCard();if(this.state==='think')this.setState('idle');
    if(C.kind!=='quiz'&&C.text&&BookAI.conf().voice!==false){const words=C.text.split(/\s+/).length;this.setState('talk',Math.min(14,words*.38));Voice.say(C.text,{lang:C.ar?'ar':'en',auto:true,rate:1,end:()=>{if(this.state==='talk')this.setState('idle')}})}},
  drawCard(){const C=this.card;if(!C)return;const x=C.x,W=C.W,H=C.H;x.setTransform(1,0,0,1,0,0);x.clearRect(0,0,C.cv.width,C.cv.height);x.setTransform(C.q,0,0,C.q,0,0);C.btns=[];
    x.save();x.shadowColor='rgba(80,50,10,.28)';x.shadowBlur=16*C.q;PT.box(x,14,14,W-28,H-28,42,'#fffdf3');x.restore();PT.box(x,14,14,W-28,H-28,42,null,'#f2c14e',6);PT.box(x,30,30,W-60,H-60,32,null,'rgba(242,193,78,.5)',2,[10,10]);
    PT.icon(x,C.icon,78,82,48);PT.fnt(x,40,800,FONT_D);PT.ltr(x);x.fillStyle='#8a5310';x.fillText(C.title,124,96);
    if(C.src){PT.fnt(x,22,700,FONT_R);PT.ltr(x,'right');x.fillStyle='#a08668';x.fillText(C.src==='book'?'📖 from the book':'✨ '+C.src,W-52,92)}
    const btn=(bx,by,bw,bh,label,act,fill)=>{PT.box(x,bx,by,bw,bh,bh/2,fill||'#fff3c4','#d9a32b',3);const fs=PT.fitFont(x,label,bw-30,32,800,FONT_D,18);PT.fnt(x,fs,800,FONT_D);PT.ltr(x,'center');x.fillStyle='#3a2600';x.textBaseline='middle';x.fillText(label,bx+bw/2,by+bh/2+2);x.textBaseline='alphabetic';C.btns.push({x:bx,y:by,w:bw,h:bh,act})};
    const bh=84,by=H-bh-44,top=136;
    if(C.kind==='quiz'&&C.quiz){const Z=C.quiz,q=Z.q;let sz=C.big?46:42;PT.fnt(x,sz,700,FONT_R);let ls=PT.wrap(x,q.q,W-140);while(ls.length>3&&sz>28){sz-=2;PT.fnt(x,sz,700,FONT_R);ls=PT.wrap(x,q.q,W-140)}
      x.fillStyle=PINK;PT.ltr(x);ls.forEach((l,i)=>x.fillText(l,64,top+sz+i*sz*1.3));let oy=top+20+ls.length*sz*1.3+16;const oh=C.big?96:84;
      Z.opts.forEach((t,i)=>{const r={x:60,y:oy+i*(oh+14),w:W-120,h:oh};const right=t===q.o[0];const st=Z.picked<0?'':right?'ok':i===Z.picked?'bad':'off';
        PT.box(x,r.x,r.y,r.w,r.h,22,{ok:'#d6f3e6',bad:'#fbd3de',off:'#f3ecde'}[st]||'#ffffff',{ok:'#16866b',bad:'#c0336a'}[st]||'#d9a32b',3);
        x.fillStyle=st==='off'?'#a89a88':'#d9a32b';x.beginPath();x.arc(r.x+44,r.y+oh/2,24,0,7);x.fill();PT.fnt(x,26,800,FONT_D);PT.ltr(x,'center');x.fillStyle='#fff';x.fillText('ABC'[i],r.x+44,r.y+oh/2+9);
        const fs=PT.fitFont(x,t,r.w-120,C.big?38:34,700,FONT_R,20);PT.fnt(x,fs,700,FONT_R);PT.ltr(x);x.fillStyle=st==='off'?'#a89a88':PINK;x.fillText(t,r.x+88,r.y+oh/2+fs*.36);
        if(Z.picked<0)C.btns.push({x:r.x,y:r.y,w:r.w,h:r.h,act:()=>this.pickOption(i)})});
      oy+=3*(oh+14);if(Z.picked>=0){const ok=Z.opts[Z.picked]===q.o[0];PT.fnt(x,32,800,FONT_D);PT.ltr(x);x.fillStyle=ok?'#16866b':'#c0336a';x.fillText(ok?'Yes! ✓':'Good try!',64,oy+38);
        PT.fnt(x,28,400,FONT_R);x.fillStyle=PINK2;const why=(ok?'':'The answer is '+q.o[0]+'. ')+(q.why||'');PT.wrap(x,why,W-140).slice(0,2).forEach((l,i)=>x.fillText(l,64,oy+80+i*36))}
      const bw=(W-60*2-24)/2;btn(60,by,bw,bh,'✨ Next question',()=>this.ask({task:'quiz',sp:this.spread()}),'#ffd166');btn(60+bw+24,by,bw,bh,'✕ Close',()=>this.closeCard());C.tex.needsUpdate=true;return}
    const area=by-24-top;const shown=C.text.slice(0,Math.floor(C.shown));
    if(!C.text){PT.fnt(x,C.big?44:40,700,FONT_R);PT.ltr(x);x.fillStyle='#a08668';const dots='.'.repeat(1+Math.floor(performance.now()/300)%3);x.fillText('Bright is thinking'+dots,64,top+60);this.sparkleAt(x,64+x.measureText('Bright is thinking...').width+30,top+46)}
    else{const fam=C.ar?FONT_B:FONT_R;let sz=C.big?48:42;PT.fnt(x,sz,400,fam);let ls=PT.wrap(x,C.text,W-128);const lh=()=>sz*(C.ar?1.6:1.42);while(ls.length*lh()>area&&sz>24){sz-=2;PT.fnt(x,sz,400,fam);ls=PT.wrap(x,C.text,W-128)}
      x.fillStyle=PINK;if(C.ar){PT.rtl(x)}else PT.ltr(x);let left=shown.length,lx=64,ly=top+sz;
      for(let i=0;i<ls.length&&left>0;i++){const l=ls[i];const part=l.slice(0,left);left-=l.length+1;const yy=top+sz+i*lh();if(C.ar)x.fillText(part,W-64,yy);else x.fillText(part,64,yy);lx=C.ar?W-64-x.measureText(part).width:64+x.measureText(part).width;ly=yy}
      if(C.shown<C.text.length||!C.final)this.sparkleAt(x,C.ar?lx-22:lx+22,ly-sz*.32)}
    if(C.status==='done'||C.text){const more=!!(C.o&&C.o.q),n=more?3:2,bw=(W-120-(n-1)*20)/n;let bx=60;btn(bx,by,bw,bh,'🔊 Listen',()=>{Voice.say(C.text,{lang:C.ar?'ar':'en'});this.setState('talk',Math.min(14,C.text.split(/\s+/).length*.38))});bx+=bw+20;
      if(more){btn(bx,by,bw,bh,'✨ Another',()=>this.ask(Object.assign({},C.o.q,{another:C.text})),'#ffd166');bx+=bw+20}btn(bx,by,bw,bh,'✕ Close',()=>this.closeCard())}
    C.tex.needsUpdate=true},
  sparkleAt(x,cx,cy){const t=performance.now()/1000;x.save();x.globalAlpha=.6+.4*Math.sin(t*9);PT.icon(x,'✨',cx,cy,30);x.restore()},
  cardTap(h){const C=this.card;if(!C||!h||!h.uv)return;const X=h.uv.x*C.W,Y=(1-h.uv.y)*C.H;const b=C.btns.find(r=>X>=r.x&&X<=r.x+r.w&&Y>=r.y&&Y<=r.y+r.h);
    if(b){this.buzz(10);Snd.tick();b.act()}else if(C.status==='done'&&C.text&&C.kind!=='quiz')Voice.say(C.text,{lang:C.ar?'ar':'en'})},
  /* ---------- asking ---------- */
  async ask(o){if(!this.on)return;const st=this.st,sp=o.sp||this.spread();if(o.task==='quiz')return this.quizCard(sp);
    const arQ=o.task==='ask'&&aiIsAr(o.text),T=arQ?AI_TASKS.askAr:AI_TASKS[o.task]||AI_TASKS.ask;this.closeMenu();this.stopRead(false);
    const C=this.openCard({title:T.title,icon:T.icon,ar:!!T.ar,auto:o.task==='ask',anchor:o.anchor,size:o.task==='story'?'l':o.task==='hint'||o.task==='word'?'s':'m',lift:o.task==='why'?1.15:0});C.o.q=Object.assign({},o,{another:undefined});
    if(o.marks&&o.anchor)this.mark(C.k,o.anchor.side,o.marks);this.react('think');
    const text=aiCleanIn(o.text||''),user=T.p.replace('{text}',text).replace('{opts}',(o.opts||[]).map(String).join(' / '))+(o.another?`\nGive a different answer from this one: «${String(o.another).slice(0,300)}»`:'');
    const ctxText=aiPageContext(sp,o.note?'What the child just saw in the 3D model: '+o.note:'');const key=AICache.key(o.task,sp&&sp.w||sp&&sp.kind||'',T.p.replace('{text}',text).replace('{opts}',''),T.ar?'ar':'en');
    const offline=()=>AIOffline.answer(o.task==='ask'?'free':o.task,sp,{note:o.note,text:o.text,ar:arQ});
    if(o.task==='ask'&&AI_BAD.test(text)){this.cardText("That's a question for a grown-up. Shall we look at this page together instead? 😊",{src:'book',final:true});return}
    const hit=o.another?AICache.take(key+'#next'):AICache.get(key);
    if(hit){this.cardText(hit.x,{src:hit.p||'book',final:true});this.prefetch(o,key,user,ctxText,T,hit.x);return}
    if(!BookAI.enabled()){this.cardText(offline(),{src:'book',final:true});return}
    const id=this.req;const msgs=[{role:'system',content:AI_RULES+'\n\nThis page:\n'+ctxText},{role:'user',content:user}];
    try{const r=await BookAI.chat(msgs,{max:T.max||160,onText:(t,spec)=>{if(id===this.req&&this.card===C)this.cardText(aiCleanOut(t,T.ar),{src:spec.name})},onReset:()=>{if(id===this.req&&this.card===C)this.cardText('',{})}});
      if(id!==this.req||this.card!==C)return;const out=aiCleanOut(r.text,T.ar);this.cardText(out,{src:r.provider.name,final:true});if(!o.another)AICache.put(key,out,r.provider.name);this.prefetch(o,key,user,ctxText,T,out)}
    catch(e){if(id!==this.req||this.card!==C)return;this.cardText(offline(),{src:'book',final:true})}},
  /* while the child reads, the next "Another" answer is fetched quietly, so it shows at once */
  prefetch(o,key,user,ctxText,T,prev){if(!['explain','example','fact','story','why','line','word'].includes(o.task)||!BookAI.enabled()||AICache.get(key+'#next'))return;
    setTimeout(()=>{if(BookAI.busy>0)return;const u=user.replace(/\nGive a different answer[\s\S]*$/,'')+`\nGive a different answer from this one: «${String(prev).slice(0,300)}»`;
      BookAI.chat([{role:'system',content:AI_RULES+'\n\nThis page:\n'+ctxText},{role:'user',content:u}],{max:T.max||160}).then(r=>AICache.put(key+'#next',aiCleanOut(r.text,T.ar),r.provider.name)).catch(()=>{})},1800)},
  quizCard(sp){const wid=sp&&sp.w;this.closeMenu();this.stopRead(false);const C=this.openCard({title:'Quiz time',icon:'❓',kind:'quiz'});if(!wid){this.cardText('Open a topic first, then I can quiz you!',{src:'book',final:true});C.kind='text';return}
    const q=(this.qq[wid]&&this.qq[wid].length)?this.qq[wid].shift():Object.assign({src:'book'},QuizGen.make(wid,1)[0]||{});
    if(!q.q){C.kind='text';this.cardText('Turn to the quiz page for questions!',{src:'book',final:true});return}
    C.quiz={q,opts:shuffle(q.o.slice(0,3)),picked:-1};C.src=q.src==='ai'?(q.prov||'AI'):'book';C.status='done';C.final=true;this.drawCard();this.react('idle');
    Voice.say(q.q+' '+C.quiz.opts.join(', or ')+'?',{auto:true});
    if(BookAI.enabled()&&!(this.qq[wid]||[]).length&&!this.qBusy){this.qBusy=true;QuizGen.fresh(wid,3).then(r=>{if(r.src==='ai')(this.qq[wid]=this.qq[wid]||[]).push(...r.qs.map(x=>Object.assign({},x,{src:'ai',prov:r.provider?r.provider.name:''})))}).catch(()=>{}).finally(()=>{this.qBusy=false})}},
  pickOption(i){const C=this.card,Z=C&&C.quiz;if(!Z||Z.picked>=0)return;Z.picked=i;const ok=Z.opts[i]===Z.q.o[0];if(ok){Snd.good();this.react('cheer')}else{Snd.bad();this.react('oops')}this.drawCard();
    Voice.say(ok?'Yes! '+(Z.q.why||''):'Good try! The answer is '+Z.q.o[0]+'. '+(Z.q.why||''),{auto:true})},
  /* a gentle hint for the question on the quiz page, written just under it */
  quizHint(){const sp=this.spread();if(!sp||sp.kind!=='practise')return;const wid=sp.w,QX=GQX[wid],Q=(QX&&QX.qs)||sp.c.quiz||[],s=GQ[wid];
    if(!s||s.done||!Q.length)return this.ask({task:'quiz',sp});const qi=s.order[s.i],q=Q[qi];
    const pg=this.st.page('L'+this.st.turned),qe=(pg.meta&&pg.meta.qend)||760;this.ask({task:'hint',sp,text:q.q,opts:s.opts[qi].map(j=>q.o[j]),anchor:{side:'L',px:BK.PW/2,py:qe,h:0}})},
  hello(){this.closeMenu();this.openCard({title:"Hi, I'm Bright!",icon:'👋'});this.cardText("I'm Bright, the star who lives in this book. Tap me for ideas. Tap any sentence or key word and I'll explain it. And you can ask me anything! ✨",{src:'book',final:true});this.react('cheer')},
  progress(){const bd=BookData(),n=WORLDS.length,c=o=>Object.keys(o||{}).length;this.openCard({title:'My progress',icon:'🌟'});
    this.cardText(`You have ${c(bd.stamps)} stamps and ${c(bd.stickers)} stickers. You finished ${c(bd.games)} practice games and passed ${c(bd.quiz)} quizzes, out of ${n} topics. ${c(bd.quiz)>=n/2?'Amazing work!':'Keep going, you are doing brilliantly!'} ⭐`,{src:'book',final:true});this.react('cheer')},
  /* ---------- "Read it to me": Bright reads the lesson line by line and the marker follows ---------- */
  readAloud(){const st=this.st,k=st.turned,sp=this.spread();if(!sp||sp.kind!=='learn')return false;const pg=st.page('R'+k),lines=(pg.meta&&pg.meta.lines)||[];if(!lines.length)return false;
    this.closeMenu();this.closeCard(true);this.stopRead();if(st.single()&&st.focus!=='R'){st.focus='R';st.aim(.6)}
    const run={i:0,dead:false,t:0};this.reading=run;const voiced=!!((window.BookNative&&BookNative.speak)||('speechSynthesis' in window&&speechSynthesis.getVoices().length));
    const step=()=>{if(run.dead||this.reading!==run)return;if(run.i>=lines.length){this.reading=null;this.clearMarks();this.flyTo(null);this.react('cheer');return}
      const L=lines[run.i++];this.mark(k,'R',L.rects);const w=st.p2w(k,'R',Math.min(BK.PW-70,L.x1+50),L.y0+20);this.flyTo(new THREE.Vector3(w.x,w.y+.5,w.z));this.setState('talk',60);
      let once=false;const next=()=>{if(once||run.dead)return;once=true;clearTimeout(run.t);run.t=setTimeout(step,260)};const words=L.say.split(/\s+/).length;
      Voice.say(L.say,{rate:.86,end:next});run.t=setTimeout(next,voiced?words*900+4000:words*420+900)};
    step();return true},
  stopRead(back=true){const r=this.reading;if(!r)return;r.dead=true;clearTimeout(r.t);this.reading=null;this.clearMarks();this.setState('idle');try{if('speechSynthesis' in window)speechSynthesis.cancel();if(window.BookNative&&BookNative.stop)BookNative.stop()}catch(e){}if(back)this.flyTo(null)},
  /* ---------- asking with your voice, or a little speech bubble to type in ---------- */
  listen(){const go=t=>{t=aiCleanIn(t);if(!t)return;if(Board.on)Board.question(t);else this.ask({task:'ask',text:t})};this.typeBox(go)},
  typeBox(cb){let el=$('#brightAsk');if(el)el.remove();const host=$('#stage');if(!host)return;el=document.createElement('form');el.id='brightAsk';el.className='bright-ask';el.dir='ltr';el.lang='en';
    const lg=AIVoiceIn.lang(),mic=(l,t,a)=>`<button class="btn sm ghost${lg===l?' hot':''}" type="button" data-mic="${l}" lang="${l}" aria-label="${a}">🎤 ${t}</button>`;
    el.innerHTML='<span class="ba-star" aria-hidden="true">✨</span><input maxlength="200" dir="auto" placeholder="Ask Bright… · اسأل…" autocomplete="off" enterkeyhint="send" aria-label="Your question"><button class="btn sm hot" type="submit">Ask</button><button class="btn sm ghost" type="button" data-x aria-label="Close">✕</button>'+
      (AIVoiceIn.can()?'<div class="ba-mics">'+mic('en','English','Say it in English')+mic('ar','عربي','قلها بالعربي')+'</div>':'');
    host.appendChild(el);this.placeBox();const inp=el.querySelector('input'),touch=!(window.matchMedia&&matchMedia('(pointer:fine)').matches);if(!(touch&&AIVoiceIn.can()))setTimeout(()=>inp.focus(),40);
    el.onsubmit=e=>{e.preventDefault();const v=inp.value;el.remove();cb(v)};el.querySelector('[data-x]').onclick=()=>{el.remove();if(Board.on&&Board.paused&&!Board.thinking){Board.paused=false;Board.dirty=true}};
    el.querySelectorAll('[data-mic]').forEach(m=>m.onclick=()=>{el.remove();AIVoiceIn.listen(t=>{if(t)cb(t);else this.typeBox(cb)},m.dataset.mic)});
    ['pointerdown','keydown'].forEach(ev=>el.addEventListener(ev,e=>e.stopPropagation()));el.addEventListener('wheel',e=>e.stopPropagation(),{passive:true})},
  placeBox(){const el=$('#brightAsk');if(!el||!this.g)return;const host=$('#stage');if(!host)return;const r=host.getBoundingClientRect(),v=this.g.position.clone().project(E.camera);
    const sx=(v.x+1)/2*r.width,sy=(1-v.y)/2*r.height,w=Math.min(r.width-24,440);
    /* the bubble keeps still while Bright bobs, so it is easy to tap; it moves only when Bright really goes somewhere or the screen changes */
    const at=el._at;if(at&&Math.abs(at[0]-sx)<48&&Math.abs(at[1]-sy)<48&&at[2]===r.width&&at[3]===r.height)return;el._at=[sx,sy,r.width,r.height];el.style.width=w+'px';el.style.left=Math.max(12,Math.min(r.width-w-12,sx-w*.75))+'px';el.style.top=Math.max(64,Math.min(r.height-(el.offsetHeight||90)-12,sy+36))+'px'}
};

/* ===== Bright teaches on a lightboard =====
   On a lesson page Bright teaches like a teacher at a glowing lightboard: a dark glass board rises out of the book and
   Bright writes on it in neon, step by step, saying each idea as it writes and draws it, then asks the child questions
   and waits for an answer, praising or helping. The lesson is built from the book itself, so it starts at once; the AI
   explains any step "another way" and answers the child's own questions right on the board. */
const BOARD_EMOJI={phonics:['🪐','🔤','👂','📖'],tricky:['❤️','🔤','✍️','👀'],reading:['📚','🥉','📖','🤔'],writing:['✏️','🔗','💬','📓'],oracy:['🗣️','👂','🎤','😊'],
  materials:['🧱','🪵','🥛','🧽','🪨','📄'],water:['☂️','💧','🧥','📄','🧴'],fire:['🏠','🔥','💨','🍞','⛪'],wheels:['🚗','⚙️','🛞','🛣️'],robot:['🤖','⬆️','➡️','⬇️','🔥'],
  keys:['⌨️','🖐️','🔤','⭐'],music:['🎵','🥁','🎶','⬆️'],pe:['🤸','⭐','🏃','🎯'],kindness:['💗','🤝','😊','🌟'],safety:['🚦','🧯','☎️','✋'],magpie:['🐦','💎','✨','🎯']};
const Board={on:false,st:null,scene:null,g:null,mesh:null,cv:null,x:null,tex:null,bake:null,bx:null,W:0,H:0,bw:0,bh:0,
  sp:null,steps:[],i:-1,queue:[],cur:null,y:0,paused:false,ask:null,spoken:true,doneAt:0,sub:'',btns:[],auto:{},dirty:true,lastDraw:0,thinking:false,
  attach({scene,st}){this.scene=scene;this.st=st},
  detach(){this.stop(true);this.scene=null;this.st=null},
  /* the first time a lesson page opens, Bright starts teaching by itself (a grown-up can switch this off) */
  maybeAuto(sp){if(!sp||sp.kind!=='learn'||this.auto[sp.w]||BookAI.conf().teach===false)return;this.auto[sp.w]=1;
    setTimeout(()=>{const cur=Bright.spread();if(this.st&&!this.on&&cur===sp&&!Bright.isOpen()&&!BookInk.active())this.start(sp)},1500)},
  /* ---------- the lesson, from the book ---------- */
  build(sp){const w=WB[sp.w],c=sp.c||WC[sp.w]||{},L=c.learn||{},name=childName(),S=[];const say=t=>String(t).replace(/→/g,' becomes ').replace(/ +· +/g,', ').replace(/=/g,' equals ').replace(/\s+/g,' ');
    S.push({say:`${name?'Hi '+name+'!':'Hi!'} Today we are learning about ${w.en}. Watch the board!`,items:[{t:'title',text:w.en,icon:w.icon},{t:'art',wid:sp.w}],wipe:true});
    let n=0;(L.body||[]).forEach(p=>{if(p.startsWith('EX:')){const ex=p.slice(3).trim().replace(/ {2,}/g,'    ');S.push({say:'Look at this example. '+say(ex),items:[{t:'ex',text:ex}]})}
      else{S.push({say:p,items:[{t:'line',text:p}],wipe:n>0&&n%2===0});n++}});
    if(L.words&&L.words.length)S.push({say:'Our key words are: '+L.words.map(x=>x[0]).join(', ')+'.',items:[{t:'words',words:L.words.slice(0,6)}],wipe:true});
    if(L.flap){S.push({say:'Now you think! '+L.flap.q,items:[{t:'line',text:'🤔 '+L.flap.q,col:'#ffffff'}],wipe:true});S.push({items:[{t:'count'}]});S.push({say:'The answer is: '+L.flap.a,items:[{t:'line',text:'✓ '+L.flap.a,col:'#7dff9a'}]})}
    const qs=(c.quiz||[]).filter(q=>q&&q.q&&q.o&&q.o.length>=2).slice(0,2);qs.forEach((q,i)=>S.push({say:(i?'One more! ':'Your turn! ')+q.q,ask:{q:q.q,o:q.o.slice(0,3).map(String),why:q.why||''},wipe:true}));
    S.push({say:`Brilliant work${name?', '+name:''}! Now try the 3D model on the next page.`,items:[{t:'stars'}],wipe:true,end:true});return S},
  start(sp){if(!this.scene||!sp||!sp.w)return;this.stop(true);Bright.closeMenu();Bright.closeCard(true);Bright.stopRead();
    this.sp=sp;this.steps=this.build(sp);this.i=-1;this.queue=[];this.cur=null;this.ask=null;this.paused=false;this.on=true;this.thinking=false;this.open();
    Bright.react('cheer');setTimeout(()=>{if(this.on)this.next()},RM?50:850)},
  stop(fast){if(!this.on&&!this.g)return;this.on=false;this.cur=null;this.queue=[];this.ask=null;try{if('speechSynthesis' in window)speechSynthesis.cancel();if(window.BookNative&&BookNative.stop)BookNative.stop()}catch(e){}
    const g=this.g,mesh=this.mesh,tex=this.tex;this.g=null;this.mesh=null;if(mesh)E.untap(mesh);
    const gone=()=>{if(g&&this.scene)this.scene.remove(g);if(g)PK.disposeTree(g);if(tex)tex.dispose()};
    if(g&&!fast&&!RM){const from=g.position.clone(),to=this.from||from;E.anim(.45,k=>{g.position.lerpVectors(from,to,k);g.scale.setScalar(Math.max(.02,1-k))},Ease.in).then(gone)}else gone();
    if(Bright.on){Bright.flyTo(null);Bright.setState('idle')}},
  /* ---------- the board itself ---------- */
  haloTex(){if(this._halo)return this._halo;this._halo=G.tex(256,160,x=>{const g=x.createRadialGradient(128,80,20,128,80,130);g.addColorStop(0,'rgba(90,220,255,.55)');g.addColorStop(.6,'rgba(90,170,255,.18)');g.addColorStop(1,'rgba(90,170,255,0)');x.fillStyle=g;x.fillRect(0,0,256,160)},true);return this._halo},
  open(){const st=this.st,cam=E.camera,orbit=E.orbit,sg=st.single();const W=sg?1080:1600,H=sg?1320:1000;this.W=W;this.H=H;
    cam.updateMatrixWorld();const tgt=orbit.target.clone(),P=this.pose();const d=E.camera.position.distanceTo(P),vh=2*d*Math.tan(cam.fov*Math.PI/360),vw=vh*cam.aspect,asp=W/H;
    const bw=Math.min(vw*.86,vh*.8*asp),bh=bw/asp;this.bw=bw;this.bh=bh;this.d0=d;this.rise=0;
    /* the board is drawn in its own units (W×H) on a canvas no bigger than it shows on the screen, so a phone sends far fewer pixels to the GPU;
       it is redrawn many times a second, so it has no mipmaps to rebuild each time */
    const el=E.renderer.domElement,px=bw/vw*(el.clientWidth||innerWidth)*E.renderer.getPixelRatio()*1.15;this.q=clamp(px/W,.55,1);
    this.cv=document.createElement('canvas');this.cv.width=Math.round(W*this.q);this.cv.height=Math.round(H*this.q);this.x=this.cv.getContext('2d');this.bake=document.createElement('canvas');this.bake.width=this.cv.width;this.bake.height=this.cv.height;this.bx=this.bake.getContext('2d');
    this.tex=new THREE.CanvasTexture(this.cv);this.tex.encoding=THREE.sRGBEncoding;this.tex.generateMipmaps=false;this.tex.minFilter=THREE.LinearFilter;
    const g=new THREE.Group();const glass=new THREE.Mesh(new THREE.PlaneGeometry(bw,bh),new THREE.MeshBasicMaterial({map:this.tex,transparent:true,depthWrite:false}));glass.renderOrder=82;
    const halo=new THREE.Mesh(new THREE.PlaneGeometry(bw*1.16,bh*1.22),new THREE.MeshBasicMaterial({map:this.haloTex(),transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,opacity:.85}));halo.position.z=-.03;halo.renderOrder=80;halo.raycast=()=>{};
    const fm=new THREE.MeshBasicMaterial({color:0x8ff8ff,transparent:true,opacity:.95,depthWrite:false}),th=Math.max(.012,bw*.005);
    [[bw+th*2,th,0,bh/2],[bw+th*2,th,0,-bh/2],[th,bh,-bw/2,0],[th,bh,bw/2,0]].forEach(([w,h,x,y])=>{const b=new THREE.Mesh(new THREE.PlaneGeometry(w,h),fm);b.position.set(x,y,.003);b.renderOrder=83;b.raycast=()=>{};g.add(b)});
    g.add(halo,glass);this.scene.add(g);this.g=g;this.mesh=glass;this.at=P;this.from=tgt.clone();E.tap(glass,h=>this.tap(h));
    this.y=0;this.wipe(true);this.render(true);
    g.position.copy(tgt);g.scale.setScalar(.05);g.quaternion.copy(cam.quaternion);
    for(let i=0;i<16;i++)setTimeout(()=>{if(this.g===g)FX.sparkle(tgt.clone().lerp(P,Math.random()),{n:5,size:.13,speed:.7,colors:['#8ff8ff','#ffffff','#ff7ae0']})},i*45);
    Snd.whoosh&&Snd.whoosh()},
  /* where the board floats: a little in front of the book, on the line to the camera */
  pose(){const cam=E.camera,o=E.orbit;cam.updateMatrixWorld();const P=o.target.clone().lerp(cam.position,.36);P.addScaledVector(new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld,1),.12);return P},
  toWorld(cx,cy){if(!this.g)return null;return this.g.localToWorld(new THREE.Vector3((cx/this.W-.5)*this.bw,(.5-cy/this.H)*this.bh,.16))},
  /* ---------- neon drawing ---------- */
  /* o.rtl: Arabic, written from X (the right edge) to the left */
  neon(x,txt,X,Y,col,sz,o={}){x.save();PT.fnt(x,sz,o.wt||700,o.fam||FONT_R);x.textBaseline='alphabetic';x.direction=o.rtl?'rtl':'ltr';x.textAlign=o.rtl?'right':'left';
    if(o.clip!=null){x.beginPath();if(o.rtl)x.rect(X-o.clip,Y-sz*1.25,o.clip+14,sz*1.7);else x.rect(X-14,Y-sz*1.25,o.clip+14,sz*1.7);x.clip()}
    x.shadowColor=col;x.shadowBlur=sz*.5*(this.q||1);x.fillStyle=col;x.fillText(txt,X,Y);x.shadowBlur=sz*.14*(this.q||1);x.globalAlpha=.5;x.fillStyle='#ffffff';x.fillText(txt,X,Y);x.restore()},
  path(x,pts,col,w,t=1){let L=0;const seg=[];for(let i=1;i<pts.length;i++){const d=Math.hypot(pts[i][0]-pts[i-1][0],pts[i][1]-pts[i-1][1]);seg.push(d);L+=d}let left=L*t,tip=pts[0];
    x.save();x.lineCap='round';x.lineJoin='round';x.strokeStyle=col;x.shadowColor=col;x.shadowBlur=w*2.4*(this.q||1);x.lineWidth=w;x.beginPath();x.moveTo(pts[0][0],pts[0][1]);
    for(let i=1;i<pts.length&&left>0;i++){const d=seg[i-1]||1e-6,k=Math.min(1,left/d);const px=pts[i-1][0]+(pts[i][0]-pts[i-1][0])*k,py=pts[i-1][1]+(pts[i][1]-pts[i-1][1])*k;x.lineTo(px,py);tip=[px,py];left-=d}
    x.stroke();x.restore();return tip},
  rectPts(X,Y,w,h){return [[X,Y],[X+w,Y],[X+w,Y+h],[X,Y+h],[X,Y]]},
  base(x){const W=this.W,H=this.H,q=this.q||1;x.setTransform(1,0,0,1,0,0);x.clearRect(0,0,x.canvas.width,x.canvas.height);x.setTransform(q,0,0,q,0,0);const g=x.createLinearGradient(0,0,0,H);g.addColorStop(0,'rgba(10,20,44,.95)');g.addColorStop(1,'rgba(5,9,24,.97)');
    x.fillStyle=g;PT.rr(x,4,4,W-8,H-8,34);x.fill();x.fillStyle='rgba(143,248,255,.07)';for(let yy=56;yy<H-40;yy+=46)for(let xx=56;xx<W-40;xx+=46)x.fillRect(xx,yy,2.5,2.5);
    const r=x.createLinearGradient(0,0,W*.8,H);r.addColorStop(0,'rgba(255,255,255,.08)');r.addColorStop(.4,'rgba(255,255,255,0)');x.fillStyle=r;PT.rr(x,4,4,W-8,H-8,34);x.fill();
    if(this.sp){const w=WB[this.sp.w];this.neon(x,'✦ '+w.en,46,66,'#ffe45f',this.sg()?40:36,{fam:FONT_D,wt:800})}},
  sg(){return !!(this.st&&this.W<1200)},
  fs(){return this.sg()?50:46},
  top(){return 110},bottom(){return this.H-(this.sg()?250:200)},
  wipe(quiet){this.base(this.bx);this.y=this.top();if(!quiet&&this.g){this.sweep=1;Snd.noise&&Snd.noise(.25,{vol:.05,f:4200,type:'bandpass'})}},
  /* ---------- items: each one knows its height and draws itself up to a point t (0..1), returning where the pen is ---------- */
  make(it){const x=this.x,W=this.W,X0=56,CW=W-112,fs=this.fs();const o=Object.assign({},it);
    if(o.t==='title'){o.h=96;o.dur=.5+o.text.length/40;const rtl=aiIsAr(o.text);o.rtl=rtl;o.draw=(x,t,y)=>{PT.fnt(x,72,800,FONT_D);const tw=x.measureText(o.text).width;
      if(rtl){const XR=X0+CW;this.neon(x,o.text,XR,y+70,'#ffe45f',72,{fam:FONT_D,wt:800,clip:tw*t,rtl:true});if(o.icon&&t>.6)PT.icon(x,o.icon,Math.max(90,XR-tw-70),y+44,64);return [XR-tw*t,y+60]}
      this.neon(x,o.text,X0,y+70,'#ffe45f',72,{fam:FONT_D,wt:800,clip:tw*t});if(o.icon&&t>.6)PT.icon(x,o.icon,Math.min(W-90,X0+tw+70),y+44,64);return [X0+tw*t,y+60]}}
    else if(o.t==='line'||o.t==='stream'){const ar=()=>o.ar!=null?o.ar:aiIsAr(o.text),a0=ar();PT.fnt(x,fs,700,a0?FONT_B:FONT_R);o.lines=PT.wrap(x,o.text||'',CW);o.h=Math.max(1,o.lines.length)*fs*(a0?1.5:1.38)+20;o.dur=.25+(o.text||'').length/56;
      o.draw=(x,t,y)=>{const rtl=ar(),f=rtl?FONT_B:FONT_R,L=fs*(rtl?1.5:1.38);PT.fnt(x,fs,700,f);const ls=o.t==='stream'?PT.wrap(x,o.text||'',CW):o.lines;o.rtl=rtl;if(o.t==='stream')o.h=Math.max(1,ls.length)*L+20;const total=ls.reduce((a,l)=>a+x.measureText(l).width,0);let left=total*t,tip=[rtl?X0+CW:X0,y+fs];
        ls.forEach((l,i)=>{if(left<=0)return;const lw=x.measureText(l).width,yy=y+fs+i*L,c=Math.min(lw,left);this.neon(x,l,rtl?X0+CW:X0,yy,o.col||'#8ff8ff',fs,{clip:c,fam:f,rtl});tip=[rtl?X0+CW-c:X0+c,yy-fs*.3];left-=lw});return tip}}
    else if(o.t==='ex'){PT.fnt(x,fs,700,FONT_R);o.lines=PT.wrap(x,o.text,CW-60);o.h=o.lines.length*fs*1.38+56;o.dur=.5+o.text.length/56;
      o.draw=(x,t,y)=>{const bh=o.h-16;const tip=this.path(x,this.rectPts(X0,y,CW,bh),'#ff7ae0',4,Math.min(1,t/.3));if(t<=.3)return tip;const k=(t-.3)/.7;PT.fnt(x,fs,700,FONT_R);const total=o.lines.reduce((a,l)=>a+x.measureText(l).width,0);let left=total*k,tp=tip;
        o.lines.forEach((l,i)=>{if(left<=0)return;const lw=x.measureText(l).width,yy=y+24+fs+i*fs*1.38;this.neon(x,l,X0+30,yy,'#ffb8f0',fs,{clip:Math.min(lw,left)});tp=[X0+30+Math.min(lw,left),yy-fs*.3];left-=lw});return tp}}
    else if(o.t==='words'){const n=o.words.length;o.h=150;o.dur=.35*n;o.draw=(x,t,y)=>{let X=X0,tip=[X0,y];o.words.forEach(([e,a],i)=>{const k=clamp(t*n-i,0,1);if(k<=0)return;PT.fnt(x,44,800,FONT_R);const w=Math.max(x.measureText(e).width,90)+48;if(X+w>W-56){return}
        x.save();x.globalAlpha=k;this.path(x,this.rectPts(X,y+8,w,118),'#ffe45f',3,k);this.neon(x,e,X+24,y+66,'#ffe45f',44,{wt:800});if(a){PT.fnt(x,26,400,FONT_B);x.fillStyle='rgba(255,255,255,.75)';x.direction='rtl';x.textAlign='center';x.fillText(a,X+w/2,y+108)}x.restore();tip=[X+w,y+60];X+=w+22});return tip}}
    else if(o.t==='count'){o.h=120;o.dur=2.7;o.draw=(x,t,y)=>{const n=3-Math.min(2,Math.floor(t*3));this.neon(x,'Think… '+n,X0,y+80,'#ffe45f',72,{fam:FONT_D,wt:800});return [X0+380,y+60]}}
    else if(o.t==='stars'){o.h=260;o.dur=1.4;o.draw=(x,t,y)=>{let tip=[W/2,y];[-1,0,1].forEach((s,i)=>{const k=clamp(t*3-i,0,1);if(k<=0)return;const cx=W/2+s*200,cy=y+120,R=s?70:95,r=R*.45;const pts=[];for(let j=0;j<=10;j++){const a=-Math.PI/2+j*Math.PI/5,rr=j%2?r:R;pts.push([cx+Math.cos(a)*rr,cy+Math.sin(a)*rr])}tip=this.path(x,pts,'#ffe45f',6,k)});
        if(t>.85){PT.fnt(x,52,800,FONT_D);const lw=x.measureText('Lesson complete!').width;this.neon(x,'Lesson complete!',W/2-lw/2,y+248,'#7dff9a',52,{fam:FONT_D,wt:800})}return tip}}
    else if(o.t==='art'){o.h=Math.min(330,this.bottom()-this.y-10);o.dur=1.5;o.draw=(x,t,y)=>this.art(x,o.wid,X0,y,CW,o.h,t)}
    else if(o.t==='qa'){o.h=this.bottom()-this.y;o.dur=.35;o.draw=(x,t,y)=>this.drawAsk(x,y,t)}
    return o},
  /* a little drawing of the idea */
  art(x,wid,X,Y,w,h,t){const cx=X+w/2,cy=Y+h/2,P=(pts,c,lw,k)=>this.path(x,pts,c,lw,k);
    if(wid==='blocks'){const s=Math.min(26,(h-60)/10);let tip=[cx,cy];for(let i=0;i<10;i++){const k=clamp(t*12-i,0,1);if(k>0)tip=P(this.rectPts(cx-200,Y+20+i*s,s,s),'#ffe45f',3,k)}
      for(let j=0;j<3;j++){const k=clamp(t*12-10-j*.6,0,1);if(k>0)tip=P(this.rectPts(cx+40+j*(s+14),Y+20+9*s,s,s),'#8ff8ff',3,k)}if(t>.8){this.neon(x,'10',cx-206,Y+h-6,'#ffe45f',40,{wt:800});this.neon(x,'1 + 1 + 1',cx+30,Y+h-6,'#8ff8ff',40,{wt:800})}return tip}
    if(wid==='dice'){let tip=[cx,cy];[4,6,3].forEach((v,i)=>{const k=clamp(t*3-i,0,1);if(k<=0)return;const s=120,dx=cx-220+i*160,dy=cy-60;tip=P(this.rectPts(dx,dy,s,s),'#8ff8ff',4,k);if(k>=1){const pp={3:[[.25,.25],[.5,.5],[.75,.75]],4:[[.28,.28],[.72,.28],[.28,.72],[.72,.72]],6:[[.28,.22],[.72,.22],[.28,.5],[.72,.5],[.28,.78],[.72,.78]]}[v];x.save();x.fillStyle='#ffffff';x.shadowColor='#8ff8ff';x.shadowBlur=10*(this.q||1);pp.forEach(([a,b])=>{x.beginPath();x.arc(dx+a*s,dy+b*s,10,0,7);x.fill()});x.restore()}});
      if(t>.9)this.neon(x,'4 + 6 = 10,  10 + 3 = 13',cx-260,cy+120,'#ffe45f',44,{wt:800});return tip}
    if(wid==='balance'){const k1=clamp(t*2,0,1),k2=clamp(t*2-1,0,1);let tip=P([[cx,cy+110],[cx,cy-40]],'#8ff8ff',5,k1);tip=P([[cx-230,cy-40],[cx+230,cy-40]],'#8ff8ff',5,k1);
      if(k2>0){tip=P([[cx-280,cy+10],[cx-180,cy+10],[cx-230,cy-40],[cx-280,cy+10]],'#ffe45f',4,k2);P([[cx+180,cy+10],[cx+280,cy+10],[cx+230,cy-40],[cx+180,cy+10]],'#ffe45f',4,k2)}
      if(t>.9){this.neon(x,'12',cx-262,cy+70,'#ffe45f',46,{wt:800});this.neon(x,'7 + 5',cx+176,cy+70,'#ffe45f',46,{wt:800})}return tip}
    if(wid==='shapes2d'){const sh=[3,4,6];let tip=[cx,cy];sh.forEach((n,i)=>{const k=clamp(t*3-i,0,1);if(k<=0)return;const ox=cx-240+i*240,R=80,pts=[];for(let j=0;j<=n;j++){const a=-Math.PI/2+j*2*Math.PI/n+(n===4?Math.PI/4:0);pts.push([ox+Math.cos(a)*R,cy+Math.sin(a)*R])}tip=P(pts,['#8ff8ff','#ffe45f','#ff7ae0'][i],5,k);
        if(k>=1){x.save();x.fillStyle='#fff';x.shadowColor='#fff';x.shadowBlur=8*(this.q||1);pts.slice(0,n).forEach(([a,b])=>{x.beginPath();x.arc(a,b,7,0,7);x.fill()});x.restore();this.neon(x,n+' sides',ox-62,cy+136,'#ffffff',32,{})}});return tip}
    if(wid==='shapes3d'){const s=110,ox=cx-60,oy=cy-30,d=50;const f=[[ox,oy],[ox+s,oy],[ox+s,oy+s],[ox,oy+s],[ox,oy]],b=f.map(([a,c])=>[a+d,c-d]);let tip=P(f,'#8ff8ff',4,clamp(t*2,0,1));if(t>.5){tip=P(b,'#ffe45f',4,clamp(t*2-1,0,1));if(t>.9)[[0,0],[1,1],[2,2],[3,3]].forEach(([i,j])=>P([f[i],b[j]],'#ffe45f',3,1))}
      if(t>.95)this.neon(x,'6 faces · 12 edges · 8 vertices',cx-330,cy+150,'#ffffff',36,{});return tip}
    if(wid==='phonics'||wid==='tricky'){const pairs=wid==='phonics'?SOUNDS[0].sp.map(([g,word])=>[word,g]):TRICKY.slice(0,3).map(tw=>[tw.w,tw.w.slice(tw.h[0],tw.h[1]+1)]);let tip=[cx,cy];
      pairs.slice(0,3).forEach(([word,g],i)=>{const k=clamp(t*3-i,0,1);if(k<=0)return;const yy=Y+70+i*Math.min(96,(h-40)/3);PT.fnt(x,70,800,FONT_R);const idx=word.indexOf(g.replace('-','').slice(0,1))>=0&&!g.includes('-')?word.indexOf(g):word.indexOf(g[0]);
        let X1=X+40;for(let j=0;j<word.length;j++){const ch=word[j],hot=g.includes('-')?(j===idx||(j===word.length-1&&word.endsWith(g.split('-')[1]))):(j>=idx&&j<idx+g.length);const cw=x.measureText(ch).width;if((j+1)/word.length<=k+.01)this.neon(x,ch,X1,yy,hot?'#ff7ae0':'#8ff8ff',70,{wt:800});X1+=cw}tip=[X1,yy-30];
        if(k>=1)this.neon(x,'← '+g,X1+30,yy,'#ffe45f',46,{wt:800})});return tip}
    const em=BOARD_EMOJI[wid]||['✨','📖','⭐'];let tip=[cx,cy];em.forEach((e,i)=>{const k=clamp(t*em.length-i,0,1);if(k<=0)return;const ex=X+w*(i+.5)/em.length;x.save();x.globalAlpha=k;PT.icon(x,e,ex,cy-10,70+30*Math.sin(k*Math.PI)*.2);x.restore();tip=[ex,cy+40]});
    this.path(x,[[X+40,cy+70],[X+w-40,cy+70]],'#8ff8ff',4,t);return tip},
  /* a question with three glowing answers */
  drawAsk(x,y,t){const A=this.ask;if(!A)return [this.W/2,y];const W=this.W,X0=56,CW=W-112,fs=this.fs();PT.fnt(x,fs,700,FONT_R);const ls=PT.wrap(x,A.q,CW);
    ls.forEach((l,i)=>this.neon(x,l,X0,y+fs+i*fs*1.35,'#ffffff',fs,{}));let oy=y+ls.length*fs*1.35+34;const oh=this.sg()?104:88;this.btns=this.btns.filter(b=>!b.opt);
    A.opts.forEach((o,i)=>{const r={x:X0,y:oy+i*(oh+16),w:CW,h:oh};const ok=o===A.right,st=A.done?(ok?'ok':i===A.picked?'bad':'off'):A.tried.includes(i)?'bad':'';const col={ok:'#7dff9a',bad:'#ff6b8a',off:'rgba(143,248,255,.35)'}[st]||'#8ff8ff';
      x.save();x.globalAlpha=t;this.path(x,this.rectPts(r.x,r.y,r.w,r.h),col,4,1);this.neon(x,'ABC'[i],r.x+26,r.y+oh/2+16,col,44,{fam:FONT_D,wt:800});const f2=PT.fitFont(x,o,r.w-130,this.sg()?46:42,700,FONT_R,22);this.neon(x,o,r.x+90,r.y+oh/2+f2*.36,st==='off'?'rgba(255,255,255,.4)':'#ffffff',f2,{});x.restore();
      if(!A.done&&!A.tried.includes(i))this.btns.push({x:r.x,y:r.y,w:r.w,h:r.h,opt:true,act:()=>this.answer(i)})});
    oy+=A.opts.length*(oh+16)+10;if(A.msg)this.neon(x,A.msg,X0,oy+44,A.done&&A.opts[A.picked]===A.right?'#7dff9a':'#ffe45f',40,{fam:FONT_D,wt:800});
    if(A.done&&A.why){PT.fnt(x,32,700,FONT_R);PT.wrap(x,A.why,CW).slice(0,2).forEach((l,i)=>this.neon(x,l,X0,oy+92+i*42,'#ffffff',32,{}))}return [X0+CW,oy]},
  answer(i){const A=this.ask;if(!A||A.done)return;const ok=A.opts[i]===A.right,name=childName();Bright.buzz(ok?[16,40,16]:50);
    if(ok){A.done=true;A.picked=i;A.msg=pick(['Brilliant','Yes, well done','Super','Amazing'])+(name?', '+name:'')+'! ✓';Snd.good();Bright.react('cheer');this.speak(A.msg.replace('✓','')+' '+(A.why||''));const c=this.toWorld(this.W/2,this.H*.4);if(c)FX.burst(c,{n:50,speed:2.6,size:.18,colors:['#7dff9a','#ffe45f','#8ff8ff'],sound:false})}
    else{A.tried.push(i);Snd.bad();Bright.react('oops');if(A.tried.length>=2){A.done=true;A.picked=i;A.msg='The answer is '+A.right+'.';this.speak('Good try! The answer is '+A.right+'. '+(A.why||''))}else{A.msg='Nearly! Look again and try once more.';this.speak('Nearly! Look again and try once more.')}}
    this.redrawAsk();if(A.done){this.doneAt=performance.now();this.ask.after=true}},
  redrawAsk(){this.dirty=true},
  /* ---------- running the lesson ---------- */
  speak(text){this.spoken=false;this.sub=text;this.dirty=true;const words=String(text).split(/\s+/).length,ar=aiIsAr(text);this.sayAt=performance.now();this.sayWords=words;Bright.setState('talk',Math.min(16,words*.36));const voiced=!!((window.BookNative&&BookNative.speak)||('speechSynthesis' in window&&speechSynthesis.getVoices().length));
    let once=false;const done=()=>{if(once)return;once=true;clearTimeout(this.sayT);this.spoken=true;this.doneAt=performance.now()};
    if(!Snd.on){this.sayT=setTimeout(done,words*260+400);return}Voice.say(text,{rate:1,lang:ar?'ar':'en',end:done});this.sayT=setTimeout(done,voiced?words*700+3500:words*300+500)},
  next(){if(!this.on)return;this.i++;const s=this.steps[this.i];if(!s){this.finish();return}this.stepRef=s;
    if(s.wipe)this.wipe();this.queue=(s.items||[]).slice();this.ask=null;this.btns=[];
    if(s.ask){this.ask={q:s.ask.q,opts:shuffle(s.ask.o.slice()),right:s.ask.o[0],why:s.ask.why,tried:[],done:false,msg:''};this.queue.push({t:'qa'})}
    if(s.say)this.speak(s.say);else{this.spoken=true;this.sub='';this.doneAt=performance.now()}this.dirty=true},
  finish(){const sp=this.sp,st=this.st;this.stop();if(!st||!sp)return;
    setTimeout(()=>{if(!Bright.on||Bright.spread()!==sp)return;if(st.single()){st.focus='L';st.aim(.7)}const w=st.p2w(st.turned,'L',BK.PW/2,620);Bright.flyTo(new THREE.Vector3(w.x,w.y+.9,w.z));Bright.tagMe('✋ Your turn!');setTimeout(()=>Bright.flyTo(null),3200)},500)},
  togglePause(){this.paused=!this.paused;if(this.paused){try{if('speechSynthesis' in window)speechSynthesis.cancel();if(window.BookNative&&BookNative.stop)BookNative.stop()}catch(e){}this.spoken=true}this.dirty=true},
  skip(){if(!this.on)return;try{if('speechSynthesis' in window)speechSynthesis.cancel();if(window.BookNative&&BookNative.stop)BookNative.stop()}catch(e){}
    while(this.cur||this.queue.length){const it=this.cur||this.make(this.queue.shift());if(it.t!=='qa'){this.cur=null;it.draw(this.bx,1,this.y);this.y+=it.h}else{this.cur=null;break}}this.paused=false;this.next()},
  again(){if(!this.on)return;this.i=Math.max(-1,this.i-1);this.paused=false;this.next()},
  /* the AI explains the current idea another way, written on the board */
  async another(){if(!this.on||this.thinking)return;const s=this.stepRef||{},idea=(s.items||[]).map(it=>it.text||'').join(' ')||(s.say||'');this.thinking=true;this.paused=true;this.sub='Bright is thinking of another way…';this.dirty=true;Bright.react('think');
    let lines=null,say='';if(BookAI.enabled()){try{const r=await BookAI.chat([{role:'system',content:AI_RULES+'\n\nThis page:\n'+aiPageContext(this.sp)},{role:'user',content:`Explain this idea another way for a 6 year old, for a glowing board: «${aiCleanIn(idea)||WB[this.sp.w].en}». Reply with JSON only: {"lines":["short line","short line","short line"],"say":"what you say while writing, 1 or 2 sentences"}. At most 3 lines, each under 9 words.`}],{max:200});
        const raw=r.text.replace(/```(?:json)?/gi,'');const j=JSON.parse(raw.slice(raw.indexOf('{'),raw.lastIndexOf('}')+1));lines=(j.lines||[]).map(l=>aiCleanOut(String(l))).filter(Boolean).slice(0,3);say=aiCleanOut(String(j.say||''))}catch(e){}}
    if(!this.on)return;this.thinking=false;
    if(!lines||!lines.length){const L=(this.sp.c.learn||{}),ex=(L.body||[]).filter(p=>p.startsWith('EX:')).map(p=>p.slice(3).trim().replace(/ {2,}/g,'   '));lines=[ex.length?pick(ex):(L.words||[]).map(x=>x[0]).join(' · ')];say='Here is another way to see it.'}
    this.steps.splice(this.i+1,0,{say:say||lines.join(' '),items:[{t:'title',text:'Another way',icon:'💡'},...lines.map(l=>({t:'line',text:l,col:'#7dff9a'}))],wipe:true});this.paused=false;this.cur=null;this.queue=[];this.next()},
  /* the same idea in simple Arabic, for a child who learns in English at school: from the AI, else the page's own Arabic note */
  async arabic(){if(!this.on||this.thinking)return;const s=this.stepRef||{},idea=(s.items||[]).map(it=>it.text||'').join(' ')||(s.ask&&s.ask.q)||(s.end?'':s.say||'');
    this.thinking=true;this.paused=true;this.sub='Bright يفكّر بالعربي…';this.dirty=true;Bright.react('think');let text='';
    if(BookAI.enabled()){try{const r=await BookAI.chat([{role:'system',content:AI_RULES+'\n\nThis page:\n'+aiPageContext(this.sp)},{role:'user',content:`Explain this idea in simple Arabic to a 6 year old who learns in English at school: «${aiCleanIn(idea)||WB[this.sp.w].en}». 2 or 3 short sentences, like a kind teacher. Keep the English school words in English, so the child can find them in the lesson.`}],{max:280});text=aiCleanOut(r.text,true)}catch(e){}}
    if(!this.on)return;this.thinking=false;if(!text||!aiIsAr(text))text=((this.sp.c||WC[this.sp.w]||{}).learn||{}).ar||'';
    if(!text){this.paused=false;this.sub='';this.dirty=true;return}
    this.steps.splice(this.i+1,0,{say:text,items:[{t:'title',text:'بالعربي',icon:'🌙'},{t:'line',text,col:'#ffe9a8',ar:true}],wipe:true,hold:true});this.paused=false;this.cur=null;this.queue=[];this.next()},
  /* the child's own question, answered on the board as the words stream in */
  async question(text){if(!this.on)return;const q=aiCleanIn(text);if(!q)return;this.paused=false;const ar=aiIsAr(q),T=AI_TASKS[ar?'askAr':'ask'];
    const item={t:'stream',text:'',col:'#ffffff'};this.steps.splice(this.i+1,0,{say:'',items:[{t:'line',text:(ar?'سألت: ':'You asked: ')+q,col:'#ffe45f',ar},item],wipe:true,live:item});this.cur=null;this.queue=[];this.next();
    const sp=this.sp;let out='';const mk=()=>{if(this.cur&&this.cur.t==='stream'){this.cur.text=item.text;this.cur.final=item.final}};
    if(BookAI.enabled()&&!AI_BAD.test(q)){try{const r=await BookAI.chat([{role:'system',content:AI_RULES+'\n\nThis page:\n'+aiPageContext(sp)},{role:'user',content:T.p.replace('{text}',q)}],{max:T.max,onText:t=>{item.text=aiCleanOut(t,ar);mk()}});out=aiCleanOut(r.text,ar)}catch(e){}}
    if(!out)out=AI_BAD.test(q)?"That's a question for a grown-up. Let's keep learning together! 😊":AIOffline.answer('free',sp,{text:q,ar});item.text=out;item.final=true;mk();if(this.on&&this.stepRef&&this.stepRef.live===item)this.speak(out)},
  tap(h){if(!h||!h.uv)return;const X=h.uv.x*this.W,Y=(1-h.uv.y)*this.H;const b=this.btns.find(r=>X>=r.x&&X<=r.x+r.w&&Y>=r.y&&Y<=r.y+r.h);if(b){Snd.tick();Bright.buzz(10);b.act()}},
  /* ---------- every frame ---------- */
  update(dt){if(!this.g)return;const cam=E.camera,now=performance.now();dt=Math.min(.25,(now-(this.lt||now))/1000);this.lt=now;
    if(this.on){const P=this.pose(),g=this.g;this.rise=Math.min(1,this.rise+dt*(RM?99:1.5));const e=Ease.back(this.rise),d=cam.position.distanceTo(P)/(this.d0||1);
      if(this.rise<1)g.position.lerpVectors(this.from,P,Math.min(1,e));else g.position.lerp(P,Math.min(1,dt*6));g.scale.setScalar(Math.max(.05,(.05+.95*e))*d);
      g.quaternion.copy(cam.quaternion);g.rotateY(Math.sin(now/1700)*.035);g.rotateX(Math.sin(now/2300)*.02)}
    if(!this.on)return;
    if(!this.paused&&!this.cur&&this.queue.length){this.cur=this.make(this.queue.shift());this.cur.p=0;if(this.y+this.cur.h>this.bottom()&&this.cur.t!=='qa'&&this.y>this.top()+5){this.wipe();}if(this.cur.t==='qa')this.qaY=this.y}
    const it=this.cur;if(it&&it.t==='stream'&&this.y+it.h>this.bottom()&&this.y>this.top()+5)this.wipe(true);if(it&&!this.paused&&!(it.t==='qa'&&it.p>=1)){const speed=it.t==='stream'?1:1.15;if(it.t==='stream'){const L=(it.text||'').length;it.dur=.25+L/56;if(!it.final&&it.p>=.97)it.p=.97}
      it.p=Math.min(1,it.p+dt*speed/Math.max(.2,it.dur));this.dirty=true;if(it.p>=1&&(it.t!=='stream'||it.final)){if(it.t!=='qa'){it.draw(this.bx,1,this.y);this.y+=it.h+14;this.cur=null}}}
    if(this.sweep>0){this.sweep=Math.max(0,this.sweep-dt*2.6);this.dirty=true}
    if(this.dirty&&now-this.lastDraw>(this.sg()?50:33)){this.lastDraw=now;this.render()}
    /* Bright writes: it follows the pen; otherwise it floats by the board */
    if(it&&it.tip&&!this.paused&&it.t!=='qa'&&it.p<1){const w=this.toWorld(Math.max(60,Math.min(this.W-60,it.tip[0]+(it.rtl?-46:46))),Math.min(this.H-60,it.tip[1]+52));if(w){Bright.away=true;Bright.goal.copy(w)}}else{const w=this.toWorld(this.W-70,this.H-(this.sg()?300:250));if(w){Bright.away=true;Bright.goal.copy(w)}}
    const s=this.stepRef;const waiting=this.ask&&!this.ask.done;if(!this.paused&&!this.thinking&&!this.cur&&!this.queue.length&&s&&!waiting&&!(s.live&&!s.live.final)&&this.spoken&&now-this.doneAt>(s.live||s.hold?Math.max(2500,(this.sayWords||0)*420-(this.doneAt-(this.sayAt||this.doneAt))):this.ask&&this.ask.after?1800:650))this.next();
    if(this.cur&&this.cur.t==='qa'&&this.ask&&this.ask.done&&this.spoken&&now-this.doneAt>1800){this.cur=null;this.next()}},
  render(){if(!this.x)return;const x=this.x,W=this.W,H=this.H,q=this.q||1;this.dirty=false;x.setTransform(1,0,0,1,0,0);x.clearRect(0,0,this.cv.width,this.cv.height);x.drawImage(this.bake,0,0);x.setTransform(q,0,0,q,0,0);
    const it=this.cur;if(it){it.tip=it.draw(x,it.p,it.t==='qa'?(this.qaY||this.y):this.y);if(it.tip&&!this.paused&&it.p<1&&it.t!=='qa'){x.save();x.fillStyle='#ffffff';x.shadowColor='#8ff8ff';x.shadowBlur=26*q;x.beginPath();x.arc(it.tip[0]+6,it.tip[1]+4,9,0,7);x.fill();x.restore()}}
    if(this.sweep>0){const yy=(1-this.sweep)*H;const g=x.createLinearGradient(0,yy-60,0,yy+60);g.addColorStop(0,'rgba(143,248,255,0)');g.addColorStop(.5,'rgba(143,248,255,.45)');g.addColorStop(1,'rgba(143,248,255,0)');x.fillStyle=g;x.fillRect(0,yy-60,W,120)}
    /* progress dots */
    const n=this.steps.length;for(let k=0;k<n;k++){x.fillStyle=k<this.i?'#7dff9a':k===this.i?'#ffe45f':'rgba(255,255,255,.22)';x.beginPath();x.arc(W-50-(n-1-k)*24,56,7,0,7);x.fill()}
    /* what Bright is saying, and the buttons */
    const fy=H-(this.sg()?232:186);x.fillStyle='rgba(143,248,255,.12)';x.fillRect(40,fy-8,W-80,2);const sub=this.thinking?'Bright is thinking…':this.sub;
    if(sub){const ar=aiIsAr(sub);PT.fnt(x,this.sg()?32:28,700,ar?FONT_B:FONT_R);x.fillStyle='rgba(255,255,255,.88)';if(ar)PT.rtl(x);else PT.ltr(x);PT.wrap(x,sub,W-120).slice(0,2).forEach((l,i)=>x.fillText(l,ar?W-60:60,fy+38+i*(this.sg()?40:36)))}
    this.btns=this.btns.filter(b=>b.opt);const bh=this.sg()?92:70,by=H-bh-24,labels=[[this.paused?'▶ Play':'⏸ Pause',()=>this.togglePause()],['⏭ Next',()=>this.skip()],[this.sg()?'💡 Another':'💡 Another way',()=>this.another()],['🌙 عربي',()=>this.arabic()],['✕ Close',()=>this.stop()]];
    const gap=16,bw=(W-80-gap*(labels.length-1))/labels.length;labels.forEach(([l,act],i)=>{const r={x:40+i*(bw+gap),y:by,w:bw,h:bh};this.path(x,this.rectPts(r.x,r.y,r.w,r.h),i===2?'#7dff9a':i===3?'#ffe45f':'#8ff8ff',3,1);const f=PT.fitFont(x,l,bw-24,this.sg()?36:30,800,FONT_D,16);this.neon(x,l,r.x+(bw-x.measureText(l).width)/2,r.y+bh/2+f*.36,'#ffffff',f,{fam:FONT_D,wt:800});this.btns.push({x:r.x,y:r.y,w:r.w,h:r.h,act})});
    this.tex.needsUpdate=true}
};

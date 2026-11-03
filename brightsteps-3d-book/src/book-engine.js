/* =====================================================================
   THE 3D BOOK
   The home view is now a real hardcover book on a desk. It opens right to left (an Arabic book):
   the right page of every spread is the printed lesson (read it first), the left page holds a
   pop-up model you can drag and tap. Pages bend as they turn, flaps lift to show answers and
   earn an ink stamp, and every pop-up earns a sticker. Each spread links to its full world.
   ===================================================================== */
const BK={W:4.2,H:5.6,T:.012,GUT:.28,BD:.07,OV:.12,PW:1024,PH:1366,N:30};
const PINK='#2d2219',PINK2='#6b5847',PAPER='#fbf4e2';
const BMATH=/(?:[□?؟]|\d+)(?:\s*[+\-−×÷=<>]\s*(?:[□?؟]|\d+))+/g;
const bodyTxt=sp=>(sp.body||[]).map(p=>p.replace(/^EN:/,'')).join(' ');
const CH_INK={english:'#2f6fb3',maths:'#a3690b',science:'#16866b',past:'#c04c17',tech:'#6648c2',heart:'#c0336a'};
const CH_TINT={english:'#e2edfa',maths:'#faeccc',science:'#d8f2e8',past:'#fce0cf',tech:'#e9e3fb',heart:'#fadfe9'};
const AR_ORD=['الأول','الثاني','الثالث','الرابع','الخامس','السادس'];
const CH={};DISTRICTS.forEach((d,i)=>CH[d.id]=Object.assign({n:i+1,ink:CH_INK[d.id],tint:CH_TINT[d.id]},d));
const BookData=()=>{const s=Store.s;if(!s.book||typeof s.book!=='object')s.book={};const b=s.book;b.stamps=b.stamps||{};b.stickers=b.stickers||{};b.at=b.at||0;return b};

/* ---------- canvas print helpers (pages are drawn like a printed book) ---------- */
const PT={
  fnt(x,sz,wt,fam){x.font=(wt||400)+' '+sz+'px '+(fam||FONT_B)},
  rtl(x){x.direction='rtl';x.textAlign='right'},
  ltr(x,al){x.direction='ltr';x.textAlign=al||'left'},
  bx(s){return String(s).replace(BMATH,m=>'\u2066'+m.replace(/ /g,'\u00A0')+'\u2069')},
  wrap(x,s,max){const out=[];PT.bx(s).split('\n').forEach(par=>{const ws=par.split(/[ \t]+/).filter(Boolean);let line='';ws.forEach(w=>{const t=line?line+' '+w:w;if(x.measureText(t).width>max&&line){out.push(line);line=w}else line=t});out.push(line)});return out},
  para(x,s,X,y,max,o={}){const sz=o.sz||32,lh=o.lh||1.62;PT.fnt(x,sz,o.wt,o.fam);x.fillStyle=o.col||PINK;if(o.ltr)PT.ltr(x,o.al);else PT.rtl(x);const ls=PT.wrap(x,s,max);if(!o.dry)ls.forEach((l,i)=>x.fillText(l,X,y+i*sz*lh));return {y:y+ls.length*sz*lh,n:ls.length}},
  rr(x,X,Y,W,H,R){G.rr(x,X,Y,W,H,R)},
  noise:null,
  base(x,side,o={}){
    x.fillStyle=o.bg||PAPER;x.fillRect(0,0,BK.PW,BK.PH);
    if(!PT.noise)PT.noise=G.canvas(256,256,n=>{const d=n.createImageData(256,256);for(let i=0;i<d.data.length;i+=4){const v=Math.random()<.5?60:250;d.data[i]=d.data[i+1]=d.data[i+2]=v;d.data[i+3]=Math.random()<.45?9:0}n.putImageData(d,0,0)});
    x.save();x.fillStyle=x.createPattern(PT.noise,'repeat');x.fillRect(0,0,BK.PW,BK.PH);x.restore();
    if(side){const gx=side==='R'?0:BK.PW,dir=side==='R'?1:-1;const g=x.createLinearGradient(gx,0,gx+dir*170,0);g.addColorStop(0,'rgba(84,58,30,.34)');g.addColorStop(.3,'rgba(84,58,30,.09)');g.addColorStop(1,'rgba(84,58,30,0)');x.fillStyle=g;x.fillRect(side==='R'?0:BK.PW-170,0,170,BK.PH);
      const ox=side==='R'?BK.PW:0;const g2=x.createLinearGradient(ox,0,ox-dir*36,0);g2.addColorStop(0,'rgba(84,58,30,.14)');g2.addColorStop(1,'rgba(84,58,30,0)');x.fillStyle=g2;x.fillRect(side==='R'?BK.PW-36:0,0,36,BK.PH)}
  },
  squiggle(x,X0,X1,y,col,w=4){x.save();x.strokeStyle=col;x.lineWidth=w;x.lineCap='round';x.beginPath();for(let X=X0;X<=X1;X+=6){const yy=y+Math.sin(X*.09)*4;X===X0?x.moveTo(X,yy):x.lineTo(X,yy)}x.stroke();x.restore()},
  dashCircle(x,cx,cy,r,col){x.save();x.setLineDash([10,9]);x.lineWidth=3;x.strokeStyle=col;x.beginPath();x.arc(cx,cy,r,0,Math.PI*2);x.stroke();x.restore()},
  pageNo(x,n,side){if(!n)return;PT.fnt(x,26,600,FONT_D);x.fillStyle=PINK2;PT.ltr(x,side==='R'?'right':'left');x.fillText(String(n),side==='R'?BK.PW-70:70,BK.PH-52)},
  icon(x,ch,cx,cy,sz){PT.fnt(x,sz,400,'"Noto Color Emoji","Apple Color Emoji","Segoe UI Emoji",sans-serif');x.textAlign='center';x.textBaseline='middle';x.fillText(ch,cx,cy+sz*.04);x.textBaseline='alphabetic'},
  stampMark(x,cx,cy,r,col,ico){x.save();x.translate(cx,cy);x.rotate(-.22);x.globalAlpha=.86;x.strokeStyle=col;x.fillStyle=col;x.lineWidth=7;x.beginPath();x.arc(0,0,r,0,Math.PI*2);x.stroke();x.lineWidth=3;x.beginPath();x.arc(0,0,r-11,0,Math.PI*2);x.stroke();
    PT.fnt(x,r*.36,800,FONT_D);x.textAlign='center';x.direction='rtl';x.fillText('أحسنت',0,r*.5);PT.fnt(x,r*.22,700,FONT_R);x.direction='ltr';x.fillText('★ WELL DONE ★',0,-r*.48);
    x.globalAlpha=1;PT.icon(x,ico,0,-r*.02,r*.62);
    x.globalCompositeOperation='destination-out';for(let i=0;i<70;i++){x.beginPath();x.arc(rand(-r,r),rand(-r,r),rand(.6,2.6),0,7);x.fill()}x.restore()},
  sticker(x,cx,cy,r){x.save();x.translate(cx,cy);x.rotate(.18);x.shadowColor='rgba(60,40,10,.35)';x.shadowBlur=10;x.shadowOffsetY=4;const g=x.createRadialGradient(-r*.3,-r*.3,r*.1,0,0,r*1.1);g.addColorStop(0,'#fff3b0');g.addColorStop(.55,'#ffcf4a');g.addColorStop(1,'#e59a12');x.fillStyle=g;x.beginPath();for(let k=0;k<10;k++){const a=-Math.PI/2+k*Math.PI/5,rr=k%2?r*.5:r;x.lineTo(Math.cos(a)*rr,Math.sin(a)*rr)}x.closePath();x.fill();x.shadowColor='transparent';x.strokeStyle='#fff';x.lineWidth=5;x.stroke();x.restore()}
};

/* ---------- page geometry: a strip of quads that bends around the spine ---------- */
function leafGeo(w,h,N){
  const n=(N+1)*2;const pos=new THREE.BufferAttribute(new Float32Array(n*3),3);pos.setUsage(THREE.DynamicDrawUsage);
  const nrm=new THREE.BufferAttribute(new Float32Array(n*3),3);const uf=new Float32Array(n*2),ub=new Float32Array(n*2);const idx=[];
  for(let i=0;i<=N;i++){const u=i/N;for(let j=0;j<2;j++){const k=i*2+j;uf[k*2]=1-u;uf[k*2+1]=1-j;ub[k*2]=u;ub[k*2+1]=1-j}}
  for(let i=0;i<N;i++){const a=i*2,b=a+1,c=a+2,d=a+3;idx.push(a,c,b,c,d,b)}
  const mk=uv=>{const g=new THREE.BufferGeometry();g.setAttribute('position',pos);g.setAttribute('normal',nrm);g.setAttribute('uv',new THREE.BufferAttribute(uv,2));g.setIndex(idx);return g};
  return {gf:mk(uf),gb:mk(ub),pos,nrm,N,w,h};
}
/* theta 0 = lying on the left, PI = lying on the right. curl bends the outer edge ahead of the spine. */
function shapeLeaf(L,theta,curl,hA,hB,lift){
  const p=L.pos.array,N=L.N,w=L.w,h=L.h,dd=w/N;const hc=lerp(hA,hB,theta/Math.PI);let X=0,Y=0;
  for(let i=0;i<=N;i++){const d=i*dd;if(i>0){const ph=clamp(theta+curl*Math.pow((d-dd/2)/w,1.6),0,Math.PI);X-=Math.cos(ph)*dd;Y+=Math.sin(ph)*dd}
    const yy=BK.BD+Y+hc*(1-Math.exp(-d/BK.GUT))+lift;for(let j=0;j<2;j++){const q=(i*2+j)*3;p[q]=X;p[q+1]=yy;p[q+2]=j?h/2:-h/2}}
  L.pos.needsUpdate=true;L.gf.computeVertexNormals();L.gf.computeBoundingSphere();L.gb.boundingSphere=L.gf.boundingSphere;L.gf.computeBoundingBox();L.gb.boundingBox=L.gf.boundingBox;
}
const surfY=(h,d)=>BK.BD+h*(1-Math.exp(-Math.abs(d)/BK.GUT));

/* ---------- spreads: one per world, plus an opening and a closing spread ---------- */
const SPREADS=[];
function bookSpreads(){if(SPREADS.length)return;SPREADS.push(Object.assign({kind:'intro'},PAGES._intro||{}));DISTRICTS.forEach(d=>WORLDS.filter(w=>w.d===d.id).forEach(w=>SPREADS.push(Object.assign({kind:'world',w:w.id},PAGES[w.id]||{}))));SPREADS.push(Object.assign({kind:'end'},PAGES._end))}
const spreadOf=wid=>SPREADS.findIndex(s=>s.w===wid)+1;
const pageNo=(s,side)=>s<=1&&side==='R'||s>=SPREADS.length&&side==='L'?0:2*(s-1)+(side==='L'?1:0);

/* ---------- pop-up toolkit: paper-and-ink models that stand up off the page ---------- */
const PK={
  inkMat:null,
  ink(root,th=30){if(!PK.inkMat){PK.inkMat=new THREE.LineBasicMaterial({color:0x2d2219,transparent:true,opacity:.5});PK.inkMat.userData={keep:true}}
    const list=[];root.traverse(o=>{if(o.isMesh&&!o.userData.noInk&&!o.userData.inked)list.push(o)});
    list.forEach(o=>{o.userData.inked=1;const eg=new THREE.EdgesGeometry(o.geometry,th);if(eg.attributes.position.count){const l=new THREE.LineSegments(eg,PK.inkMat);l.raycast=()=>{};l.userData.noInk=true;o.add(l)}else eg.dispose()})},
  m(c,ex){return G.m(c,Object.assign({roughness:.78},ex||{}))},
  textTex(w,h,draw){return G.tex(w,h,draw)},
  /* a standing paper card: front drawn on canvas, plain back */
  card(w,h,draw,o={}){const t=G.tex(o.pw||512,Math.round((o.pw||512)*h/w),(x,W,H)=>{x.fillStyle=o.bg||'#fffaf0';x.fillRect(0,0,W,H);draw&&draw(x,W,H)});
    const edge=PK.m(o.edge||'#e8dcc2');const back=PK.m(o.back||'#efe3c8');const front=new THREE.MeshStandardMaterial({map:t,roughness:.8});
    const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,o.d||.03),[edge,edge,edge,edge,front,back]);m.userData.redraw=fn=>{const c=t.image;const x=c.getContext('2d');x.fillStyle=o.bg||'#fffaf0';x.fillRect(0,0,c.width,c.height);fn(x,c.width,c.height);t.needsUpdate=true};return m},
  word(x,W,H,word,hi,o={}){/* draw an English word, with highlighted letters (Set of indices) */
    let sz=o.sz||H*.58;PT.fnt(x,sz,700,FONT_R);while(x.measureText(word).width>W*.88&&sz>20){sz-=4;PT.fnt(x,sz,700,FONT_R)}
    const tw=x.measureText(word).width;let X=(W-tw)/2;x.textAlign='left';x.direction='ltr';x.textBaseline='middle';
    [...word].forEach((ch,i)=>{const on=hi&&hi.has(i);x.fillStyle=on?(o.hc||'#e5531a'):(o.c||PINK);x.fillText(ch,X,H*.54);if(on){x.fillRect(X,H*.54+sz*.42,x.measureText(ch).width,Math.max(3,sz*.06))}X+=x.measureText(ch).width});x.textBaseline='alphabetic'},
  disposeTree(root){root.traverse(o=>{if(o.geometry&&!(o.geometry.userData&&o.geometry.userData.keep))o.geometry.dispose();const m=o.material;if(m)(Array.isArray(m)?m:[m]).forEach(mm=>{if(mm.userData&&mm.userData.keep)return;if(mm.map&&!(mm.map.userData&&mm.map.userData.keep))mm.map.dispose();mm.dispose()})})}
};
function hiIdx(word,g){const s=new Set();if(g.includes('-')){const [a,b]=g.split('-');const m=word.match(new RegExp(a+'([^aeiou])'+b));if(m){s.add(m.index);s.add(m.index+2)}return s}const i=word.indexOf(g);if(i>=0)for(let k=0;k<g.length;k++)s.add(i+k);return s}

/* ---------- the book scene ---------- */
const Book={
  id:'book',st:null,
  build(ctx){
    bookSpreads();
    const {scene,orbit}=ctx,cam=E.camera,R=E.renderer;const W=BK.W,H=BK.H,T=BK.T,BD=BK.BD,OV=BK.OV,PW=BK.PW,PH=BK.PH;
    const S=SPREADS.length,M=S-1,bd=BookData();
    const st={turned:0,S,M,focus:'R',flip:null,ex:null,drag:null,pdrag:null,busy:false,ctx};Book.st=st;
    R.shadowMap.enabled=true;R.shadowMap.type=THREE.PCFSoftShadowMap;cam.fov=34;cam.updateProjectionMatrix();
    scene.background=new THREE.Color('#0d0b14');scene.fog=new THREE.FogExp2('#0d0b14',.034);
    const hemi=new THREE.HemisphereLight(0xfff1de,0x2c2019,.78);scene.add(hemi);
    const sun=new THREE.DirectionalLight(0xffebd2,1.32);sun.position.set(4.5,13,8);sun.castShadow=true;const sc=sun.shadow.camera;sc.left=-9;sc.right=9;sc.top=9;sc.bottom=-9;sc.near=2;sc.far=40;
    const sm=innerWidth<700?1024:2048;sun.shadow.mapSize.set(sm,sm);sun.shadow.bias=-.0006;sun.shadow.normalBias=.025;scene.add(sun,sun.target);
    const fill=new THREE.DirectionalLight(0xa9bcff,.2);fill.position.set(-7,6,-6);scene.add(fill);
    const lamp=new THREE.PointLight(0xffb070,.5,30,1.6);lamp.position.set(-7,6,-5);scene.add(lamp);
    /* desk */
    const wood=G.tex(512,512,(x,w,h)=>{x.fillStyle='#4a2f1f';x.fillRect(0,0,w,h);for(let i=0;i<140;i++){const y=Math.random()*h;x.strokeStyle=`rgba(${Math.random()<.5?'30,16,8':'120,80,50'},${rand(.08,.22)})`;x.lineWidth=rand(1,4);x.beginPath();x.moveTo(0,y);for(let X=0;X<=w;X+=32)x.lineTo(X,y+Math.sin(X*.01+i)*rand(2,7));x.stroke()}
      for(let i=0;i<5;i++){const cx=rand(0,w),cy=rand(0,h);x.strokeStyle='rgba(25,12,6,.25)';for(let r=4;r<30;r+=5){x.lineWidth=1.5;x.beginPath();x.ellipse(cx,cy,r*2.6,r,0,0,7);x.stroke()}}});
    wood.wrapS=wood.wrapT=THREE.RepeatWrapping;wood.repeat.set(5,5);
    const desk=new THREE.Mesh(new THREE.PlaneGeometry(70,70),new THREE.MeshStandardMaterial({map:wood,roughness:.72,metalness:.02}));desk.rotation.x=-Math.PI/2;desk.receiveShadow=true;scene.add(desk);
    const props=Book.props(scene);
    /* paper edges of the page block */
    const edgeTex=(rot)=>{const t=G.tex(8,8,(x)=>{x.fillStyle='#f1e7cf';x.fillRect(0,0,8,8);x.fillStyle='#d6c7a6';if(rot)x.fillRect(0,0,2,8);else x.fillRect(0,0,8,2)});t.wrapS=t.wrapT=THREE.RepeatWrapping;t.minFilter=THREE.LinearFilter;t.generateMipmaps=false;if(rot)t.repeat.set(1/(T*2),1);else t.repeat.set(1,1/(T*2));return t};
    const capMat=new THREE.MeshStandardMaterial({map:edgeTex(false),roughness:.95}),sideMat=new THREE.MeshStandardMaterial({map:edgeTex(true),roughness:.95});
    const stacks={L:null,R:null};
    function stack(side,n){const sd=side==='L'?-1:1;if(stacks[side]){scene.remove(stacks[side]);stacks[side].geometry.dispose();stacks[side]=null}if(n<=0)return;
      const h=Math.max(0,n*T-T*.7),w=W-.015,sh=new THREE.Shape();sh.moveTo(0,BD);for(let i=1;i<=18;i++){const d=w*i/18;sh.lineTo(sd*d,surfY(h,d))}sh.lineTo(sd*w,BD-.004);sh.lineTo(0,BD-.004);
      const g=new THREE.ExtrudeGeometry(sh,{depth:H-.02,bevelEnabled:false,curveSegments:1});g.translate(0,0,-(H-.02)/2);const m=new THREE.Mesh(g,[capMat,sideMat]);m.castShadow=m.receiveShadow=true;scene.add(m);stacks[side]=m}
    /* leaves: the page on top of each pile, and the one that turns */
    function leaf(){const L=leafGeo(W,H,BK.N);const mf=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.9,metalness:0});mf.shadowSide=THREE.DoubleSide;const mb=mf.clone();mb.side=THREE.BackSide;
      const f=new THREE.Mesh(L.gf,mf),b=new THREE.Mesh(L.gb,mb);f.castShadow=true;f.receiveShadow=b.receiveShadow=true;f.frustumCulled=b.frustumCulled=false;const g=new THREE.Group();g.add(f,b);scene.add(g);return Object.assign(L,{g,mf,mb,f,b,ids:['','']})}
    const LT=leaf(),RT=leaf(),TN=leaf();
    /* hardcover boards */
    function board(){const wb=W+OV,hb=H+OV*2;const L=leafGeo(wb,hb,1);const p=L.pos.array;for(let i=0;i<=1;i++)for(let j=0;j<2;j++){const q=(i*2+j)*3;p[q]=-i*wb;p[q+1]=0;p[q+2]=j?hb/2:-hb/2}L.gf.computeVertexNormals();
      const mf=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.62,metalness:.02}),mb=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.85,side:THREE.BackSide});
      const g=new THREE.Group(),f=new THREE.Mesh(L.gf,mf),b=new THREE.Mesh(L.gb,mb);f.position.y=BD/2;b.position.y=-BD/2;f.receiveShadow=b.receiveShadow=true;
      const edge=new THREE.Mesh(new THREE.BoxGeometry(wb,BD*.94,hb),G.m('#141c49',{roughness:.7}));edge.position.x=-wb/2;edge.castShadow=true;edge.receiveShadow=true;g.add(f,b,edge);scene.add(g);return Object.assign(L,{g,mf,mb,f,b,edge,ids:['','']})}
    const BF=board(),BB=board();
    const spine=G.mesh(new THREE.CylinderGeometry(1,1,H+OV*2,24,1,true,0,Math.PI),G.m('#141c49',{roughness:.6,side:THREE.DoubleSide}));spine.rotation.x=Math.PI/2;spine.castShadow=true;scene.add(spine);
    const blob=G.shadow(1,.55);blob.scale.set(W*1.5,H*1.25,1);blob.position.y=.003;scene.add(blob);
    /* page textures: drawn on demand, the few not on screen are recycled */
    const pages=new Map();let ANI=R.capabilities.getMaxAnisotropy?Math.min(8,R.capabilities.getMaxAnisotropy()):4;
    function page(id){let p=pages.get(id);if(!p){const c=document.createElement('canvas');c.width=PW;c.height=PH;const x=c.getContext('2d');const tex=new THREE.CanvasTexture(c);tex.encoding=THREE.sRGBEncoding;tex.anisotropy=ANI;p={id,c,x,tex,meta:{}};pages.set(id,p);paint(p)}p.used=performance.now();return p}
    function paint(p){const x=p.x;x.save();x.setTransform(1,0,0,1,0,0);x.globalAlpha=1;x.globalCompositeOperation='source-over';x.textBaseline='alphabetic';try{p.meta=BookPaint(p.id,x,st)||{}}catch(e){console.error(e);p.meta={}}x.restore();p.tex.needsUpdate=true}
    function repaint(id){const p=pages.get(id);if(p)paint(p)}
    const live=()=>new Set([LT,RT,TN,BF,BB].flatMap(l=>l.g.visible?l.ids:[]));
    function trim(){if(pages.size<=10)return;const keep=live();[...pages.values()].filter(p=>!keep.has(p.id)).sort((a,b)=>a.used-b.used).slice(0,pages.size-10).forEach(p=>{p.tex.dispose();pages.delete(p.id)})}
    function setTex(L,fid,bid){if(fid!=null&&L.ids[0]!==fid){L.mf.map=page(fid).tex;L.mf.needsUpdate=true;L.ids[0]=fid}if(bid!=null&&L.ids[1]!==bid){L.mb.map=page(bid).tex;L.mb.needsUpdate=true;L.ids[1]=bid}}
    setTex(BF,'C','R1');setTex(BB,'L'+S,'K');
    const hL=k=>(k===0?M:clamp(M-k+1,0,M))*T,hR=k=>clamp(k-1,0,M)*T;
    function boardAt(B,isF,theta){B.g.rotation.z=-theta;const u=theta/Math.PI;B.g.position.y=isF?lerp(BD+M*T+BD/2,BD/2,u):lerp(BD/2,BD+M*T+BD/2,u)}
    /* rest pose for "k leaves turned" */
    function layout(k){
      st.turned=k;const l=k===0?M:clamp(M-k+1,0,M),r=clamp(k-1,0,M);
      boardAt(BF,true,k>=1?Math.PI:0);boardAt(BB,false,k>=M+2?Math.PI:0);
      stack('L',l);stack('R',r);
      LT.g.visible=k>=1&&k<=M;if(LT.g.visible){setTex(LT,'L'+k,null);shapeLeaf(LT,0,0,l*T,l*T,0)}
      RT.g.visible=k>=2&&k<=M+1;if(RT.g.visible){setTex(RT,null,'R'+k);shapeLeaf(RT,Math.PI,0,r*T,r*T,0)}
      TN.g.visible=false;
      const closed=k===0||k===M+2;spine.visible=closed;if(closed){const hh=M*T+BD*2;spine.scale.set(k===0?.4:-.4,1,hh/2);spine.position.set(0,hh/2,0)}
      blob.position.x=k===0?-W/2:k===M+2?W/2:0;blob.scale.x=closed?W*.85:W*1.55;
      trim();
    }
    /* ---------- camera ---------- */
    const single=()=> (cam.aspect||1)<.95;
    function view(){const k=st.turned;let tx,wf;const sg=single();
      if(k===0){tx=-W/2-OV/2;wf=W+OV+.7}else if(k===M+2){tx=W/2+OV/2;wf=W+OV+.7}else if(sg){tx=st.focus==='L'?-W/2+.05:W/2-.05;wf=W+.25}else{tx=0;wf=2*W+.7}
      const fov=cam.fov*Math.PI/180,ph=sg?.42:.55;const r=Math.max(E.fitR(wf),(H*Math.cos(ph)*1.08+(sg?.5:1.2))/(2*Math.tan(fov/2)));
      return {target:new THREE.Vector3(tx,.2,.3),r,theta:0,phi:ph}}
    function aim(dur=.9){const v=view();orbit.home=v;orbit.minR=v.r*.42;orbit.maxR=v.r*1.9;if(dur<=0){orbit.target.copy(v.target);orbit.r=v.r;orbit.theta=v.theta;orbit.phi=v.phi}else orbit.flyTo(v,dur)}
    orbit.minTheta=-.55;orbit.maxTheta=.55;orbit.minPhi=.16;orbit.maxPhi=1.02;orbit.auto=0;
    /* ---------- flips ---------- */
    const dur=(t)=>RM?Math.min(.25,t):t;
    function begin(dir){
      if(st.flip||st.busy)return null;const k=st.turned;let j;if(dir>0){if(k>=M+2)return null;j=k}else{if(k<=0)return null;j=k-1}
      const kind=j===0?'F':j===M+1?'B':'P';const f={dir,j,kind,k,p:0};foldExtras();
      if(kind==='P'){
        if(dir>0){setTex(TN,'L'+k,'R'+(k+1));f.hA=(M-k+1)*T;f.hB=k*T;LT.g.visible=k+1<=M;if(LT.g.visible){setTex(LT,'L'+(k+1),null);shapeLeaf(LT,0,0,(M-k)*T,(M-k)*T,0)}stack('L',M-k);f.t0=0;f.t1=Math.PI}
        else{setTex(TN,'L'+(k-1),'R'+k);f.hA=(M-k+2)*T;f.hB=(k-1)*T;RT.g.visible=k-2>=1;if(RT.g.visible){setTex(RT,null,'R'+(k-1));shapeLeaf(RT,Math.PI,0,(k-2)*T,(k-2)*T,0)}stack('R',k-2);f.t0=Math.PI;f.t1=0}
        TN.g.visible=true;
      }else{f.t0=dir>0?0:Math.PI;f.t1=dir>0?Math.PI:0;spine.visible=false;
        if(kind==='F'&&dir>0){LT.g.visible=true;setTex(LT,'L1',null);shapeLeaf(LT,0,0,M*T,M*T,0);blob.position.x=0;blob.scale.x=W*1.55}
        if(kind==='B'&&dir<0){RT.g.visible=true;setTex(RT,null,'R'+(M+1));shapeLeaf(RT,Math.PI,0,M*T,M*T,0)}}
      st.flip=f;set(f,0);Snd.noise(kind==='P'?.42:.3,{vol:kind==='P'?.11:.08,f:kind==='P'?3200:900,type:'bandpass'});return f}
    function set(f,p){f.p=p;const th=lerp(f.t0,f.t1,Ease.inOut(p));
      if(f.kind==='P')shapeLeaf(TN,th,f.dir*1.05*Math.sin(th),f.hA,f.hB,.0035);
      else if(f.kind==='F')boardAt(BF,true,th);else boardAt(BB,false,th)}
    function finish(f,commit){return new Promise(res=>{const p0=f.p,p1=commit?1:0;const d=dur(Math.max(.18,Math.abs(p1-p0)*(f.kind==='P'?.85:1.1)));
      E.anim(d,k=>set(f,lerp(p0,p1,k))).then(()=>{st.flip=null;const nk=commit?f.k+f.dir:f.k;if(commit){Snd.tick();if(f.kind!=='P')Snd.tone(110,.18,{vol:.18,slide:70})}
        if(commit){if(single())st.focus=f.dir>0?'R':'L';if(nk===0||nk===M+2)st.focus='R'}
        layout(nk);aim(.7);bd.at=nk;try{localStorage.setItem(Store.key,JSON.stringify(Store.s))}catch(e){}buildExtras(nk);res(commit)})})}
    async function turn(dir){const f=begin(dir);if(!f)return false;if(single()&&f.kind==='P'){st.focus=dir>0?'R':'L';aim(dur(.9))}return finish(f,true)}
    async function next(){if(st.flip||st.busy)return;const k=st.turned;if(single()&&k>=1&&k<=M+1&&st.focus==='R'){st.focus='L';aim(.6);Snd.whoosh();Overlay.sync();return}return turn(1)}
    async function prev(){if(st.flip||st.busy)return;const k=st.turned;if(single()&&k>=1&&k<=M+1&&st.focus==='L'){st.focus='R';aim(.6);Snd.whoosh();Overlay.sync();return}return turn(-1)}
    async function go(s){s=clamp(s,0,M+2);if(st.flip||st.busy||s===st.turned)return;
      if(st.turned===0){await turn(1);if(s===1)return}
      if(st.turned===M+2){await turn(-1);if(s===M+1)return}
      if(s===0&&st.turned>1){await riffle(1);return turn(-1)}
      if(s===M+2&&st.turned<M+1){await riffle(M+1);return turn(1)}
      const k=st.turned;if(s===k)return;if(Math.abs(s-k)===1||s===0||s===M+2)return turn(s>k?1:-1);return riffle(s)}
    /* riffle: one page flies across, the piles change under it */
    function riffle(s){const k=st.turned,dir=s>k?1:-1;foldExtras();
      if(dir>0){setTex(TN,'L'+k,'R'+s);LT.g.visible=s<=M;if(LT.g.visible){setTex(LT,'L'+s,null);shapeLeaf(LT,0,0,(M-s+1)*T,(M-s+1)*T,0)}stack('L',M-s+1)}
      else{setTex(TN,'L'+s,'R'+k);RT.g.visible=s>=2;if(RT.g.visible){setTex(RT,null,'R'+s);shapeLeaf(RT,Math.PI,0,(s-1)*T,(s-1)*T,0)}stack('R',s-1)}
      TN.g.visible=true;const f={dir,kind:'P',k:s-dir,p:0,hA:dir>0?(M-k+1)*T:(M-s+1)*T,hB:dir>0?(s-1)*T:(k-1)*T,t0:dir>0?0:Math.PI,t1:dir>0?Math.PI:0};st.flip=f;
      for(let i=0;i<Math.min(4,Math.abs(s-k));i++)setTimeout(()=>Snd.noise(.18,{vol:.06,f:3400,type:'bandpass'}),i*70);
      if(single())st.focus=dir>0?'R':'L';return finish(f,true)}
    /* ---------- extras: flap, hit areas and the pop-up for the spread on screen ---------- */
    function p2w(s,side,px,py){const brd=(side==='R'&&s===1)||(side==='L'&&s===S);const w=brd?W+OV:W,h=brd?H+OV*2:H;const x=side==='R'?px/PW*w:-(1-px/PW)*w;const z=-h/2+py/PH*h;const hh=side==='R'?hR(s):hL(s);return {x,z,y:surfY(brd?0:hh,x),sx:w/PW,sz:h/PH}}
    function foldExtras(){const ex=st.ex;if(!ex)return;st.ex=null;Overlay.chips([]);cap('','');ex.dead=true;if(ex.pop&&ex.pop.stop)try{ex.pop.stop()}catch(e){}
      const kids=ex.g.children.slice();E.anim(dur(.24),k=>{kids.forEach(c=>{if(c.userData.fold!==false)c.scale.y=Math.max(.02,1-k)})}).then(()=>{scene.remove(ex.g);ex.picks.forEach(o=>E.untap(o));PK.disposeTree(ex.g)})}
    function buildExtras(k){if(st.ex)foldExtras();Overlay.sync();if(k<1||k>M+1){Overlay.chips(k===0?[{label:'افتح الكتاب',cls:'hot',fn:()=>next()},...(bd.last>1?[{label:'تابع من حيث توقفت ←',cls:'go',fn:()=>go(bd.last)}]:[])]:[{label:'افتح الكتاب من جديد',cls:'hot',fn:()=>go(1)}]);cap(k===0?'BrightSteps':'',k===0?'اضغط الغلاف أو اسحبه لتفتح الكتاب':'');return}
      if(k===1)repaint('R1');if(k===S)repaint('L'+S);bd.last=k;
      const sp=SPREADS[k-1],g=new THREE.Group();scene.add(g);const ex={g,s:k,sp,picks:[],drags:[],ups:[],pop:null,root:null};st.ex=ex;
      const pr=page('R'+k),pl=page('L'+k);
      const tap=(o,fn)=>{E.tap(o,(h,oo,e)=>{if(st.flip||ex.dead)return;fn(h,oo,e)});ex.picks.push(o);return o};
      [['R',pr],['L',pl]].forEach(([side,p])=>(p.meta.hits||[]).forEach(hh=>{const c=p2w(k,side,hh.x+hh.w/2,hh.y+hh.h/2);const pl2=new THREE.Mesh(new THREE.PlaneGeometry(hh.w*c.sx,hh.h*c.sz),new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false}));pl2.rotation.x=-Math.PI/2;pl2.position.set(c.x,c.y+.006,c.z);pl2.userData.fold=false;g.add(pl2);tap(pl2,()=>{Snd.pop();hh.fn()})}));
      if(pr.meta.flap&&sp.flap)ex.flap=Book.flap(ex,k,sp,pr.meta,p2w,tap,props,()=>repaint('R'+k));
      const side=sp.popSide||'L',meta=side==='L'?pl.meta:pr.meta;
      if(sp.pop&&meta.area){const a=meta.area,c=p2w(k,side,a.cx,a.cy);const root=new THREE.Group();root.position.set(c.x,c.y,c.z);g.add(root);ex.root=root;
        const P=Book.kit(ex,root,sp,{tap,a,side,k,c,repaintL:()=>repaint('L'+k),stickerAt:()=>{const m=pl.meta.sticker;if(!m)return root.position;const w=p2w(k,'L',m.cx,m.cy);return new THREE.Vector3(w.x,w.y+.2,w.z)}});
        try{ex.pop=sp.pop(P)||{}}catch(e){console.error(e);ex.pop={}}
        root.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true}});if(sp.ink!==false)PK.ink(root);
        root.scale.set(1,.02,1);E.tw(root.scale,{y:1},RM?.01:.62,Ease.back);
        Overlay.chips([...(ex.pop.chips||[]),...(sp.w?[{label:'ادخل العالم الكامل ←',cls:'go',fn:()=>App.go('w-'+sp.w)}]:[])],ex.pop.chipsRef);
        cap(ex.pop.capEn||'',sp.hint?esc(sp.hint):'');
      }else{Overlay.chips(sp.chips?sp.chips(st):[]);cap('',sp.capAr||'')}
      if(ex.flap)g.add(ex.flap.g);
      Overlay.live(sp);
    }
    st.repaintAll=()=>{pages.forEach(p=>paint(p));if(!st.flip&&st.turned>=1&&st.turned<=M+1)buildExtras(st.turned)};
    st.next=next;st.prev=prev;st.go=go;st.repaint=repaint;st.page=page;st.p2w=p2w;st.single=single;st.aim=aim;
    /* ---------- pointer: drag pop-up parts, drag a page corner to turn ---------- */
    const ray=new THREE.Raycaster(),ndc=new THREE.Vector2(),plane=new THREE.Plane(),hit=new THREE.Vector3();
    const castFrom=e=>{const rc=R.domElement.getBoundingClientRect();ndc.set((e.clientX-rc.left)/rc.width*2-1,-(e.clientY-rc.top)/rc.height*2+1);ray.setFromCamera(ndc,cam);return ray};
    const owner=o=>{while(o&&!(o.userData&&o.userData.drag))o=o.parent;return o};
    orbit.onDown=e=>{if(orbit.ptrs.size>1){st.drag=null;const pd=st.pdrag;st.pdrag=null;if(pd&&pd.f)finish(pd.f,false);return}if(st.flip||st.busy)return;castFrom(e);
      const ex=st.ex;if(ex&&ex.drags.length){const hs=ray.intersectObjects(ex.drags,true).filter(h=>E.visibleChain(h.object));if(hs.length){const o=owner(hs[0].object);const hd=o.userData.drag;const n=hd.plane==='z'?new THREE.Vector3(0,0,1):new THREE.Vector3(0,1,0);plane.setFromNormalAndCoplanarPoint(n,hs[0].point);st.drag={o,hd,root:ex.root||o.parent};const lp=st.drag.root.worldToLocal(hs[0].point.clone());hd.start&&hd.start(lp,e);return}}
      const targets=[LT.f,RT.b,BF.f,BF.b,BB.f,BB.b].filter(m=>E.visibleChain(m));const hp=ray.intersectObjects(targets,false)[0];
      if(hp&&Math.abs(hp.point.x)>W*.4)st.pdrag={side:hp.point.x<0?'L':'R',x0:e.clientX,f:null};};
    orbit.dragHandler=(e)=>{
      if(st.drag){castFrom(e);if(ray.ray.intersectPlane(plane,hit)){const lp=st.drag.root.worldToLocal(hit.clone());st.drag.hd.move&&st.drag.hd.move(lp,e)}return true}
      const pd=st.pdrag;if(pd){const dx=e.clientX-pd.x0;const want=pd.side==='L'?1:-1;const wpx=R.domElement.clientWidth*(single()?.75:.5);
        if(!pd.f){if(Math.abs(dx)>12&&Math.sign(dx)===want){pd.f=begin(want);if(!pd.f){st.pdrag=null;return false}}else return Math.abs(dx)>12?false:true}
        set(pd.f,clamp(dx*want/wpx,0,1));return true}
      return false};
    orbit.onUp=e=>{if(st.drag){const d=st.drag;st.drag=null;d.hd.end&&d.hd.end(e)}const pd=st.pdrag;st.pdrag=null;if(pd&&pd.f){const f=pd.f;const commit=f.p>.3;if(single()&&commit&&f.kind==='P')st.focus=f.dir>0?'R':'L';finish(f,commit)}};
    E.tap(BF.f,()=>{if(!st.flip&&st.turned===0)next()});E.tap(BB.b,()=>{if(!st.flip&&st.turned===M+2)go(bd.last>1?bd.last:1)});
    const onKey=e=>{if(App.cur!=='home'||e.target&&/INPUT|TEXTAREA|SELECT/.test(e.target.tagName))return;if(st.ex&&st.ex.pop&&st.ex.pop.key&&st.ex.pop.key(e))return;
      if(e.key==='ArrowLeft'){e.preventDefault();next()}else if(e.key==='ArrowRight'){e.preventDefault();prev()}else if(e.key==='Escape')Overlay.read(false)};
    document.addEventListener('keydown',onKey);
    /* start: closed on first open, otherwise at the spread asked for */
    const start=ctx.start||0;layout(start);aim(0);buildExtras(start);
    let lastAsp=cam.aspect;
    return {
      update(dt,t){const ex=st.ex;if(ex&&!ex.dead){if(ex.pop&&ex.pop.update)try{ex.pop.update(dt,t)}catch(e){console.error(e);ex.pop.update=null}ex.ups.forEach(f=>f(dt,t))}props.update(dt,t)},
      resize(w,h){const a=w/h;if((a<.95)!==(lastAsp<.95)){lastAsp=a}if(!orbit.fly)aim(0)},
      tapNone(e){if(st.flip)return;castFrom(e);const hp=ray.intersectObjects([LT.f,RT.b,BF.f,BB.b].filter(m=>E.visibleChain(m)),false)[0];if(hp&&Math.abs(hp.point.x)>W*.82){hp.point.x<0?next():prev()}},
      dispose(){document.removeEventListener('keydown',onKey);R.shadowMap.enabled=false;if(sun.shadow.map){sun.shadow.map.dispose();sun.shadow.map=null}pages.forEach(p=>p.tex.dispose());pages.clear();Book.st=null;Overlay.read(false)}
    };
  },
  /* desk props: a pencil, and the stamp that lands on the page when a flap is lifted */
  props(scene){
    const g=new THREE.Group();scene.add(g);
    const pen=new THREE.Group();const body=G.mesh(new THREE.CylinderGeometry(.09,.09,2.6,6),G.m('#f2b632',{roughness:.5,flatShading:true}));const tip=G.mesh(new THREE.ConeGeometry(.09,.32,6),G.m('#e9c99a',{flatShading:true}));tip.position.y=1.46;
    const lead=G.mesh(new THREE.ConeGeometry(.032,.1,6),G.m('#2b2b30'));lead.position.y=1.6;const band=G.cyl(.095,.095,.14,'#c9cfe0',{metalness:.7,roughness:.3},10);band.position.y=-1.32;const rub=G.cyl(.09,.09,.18,'#ff8fb1',{roughness:.8},10);rub.position.y=-1.47;
    pen.add(body,tip,lead,band,rub);pen.rotation.set(0,.08,Math.PI/2);pen.position.set(-2.4,.09,3.45);pen.traverse(o=>{if(o.isMesh)o.castShadow=true});g.add(pen);
    const pad=new THREE.Group();const tin=G.box(1.1,.12,.8,'#20264e',{metalness:.5,roughness:.35});tin.position.y=.06;const ink=G.box(.92,.02,.62,'#c8402a',{roughness:.95});ink.position.y=.125;pad.add(tin,ink);pad.position.set(3.4,0,3.5);pad.rotation.y=-.12;pad.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true}});g.add(pad);
    const stamp=new THREE.Group();const base=G.box(.62,.1,.62,'#c8402a',{roughness:.9});base.position.y=.05;const blk=G.box(.66,.16,.66,'#8a5a36',{roughness:.6});blk.position.y=.18;const neck=G.cyl(.09,.12,.42,'#6b4428',{},12);neck.position.y=.47;const knob=G.sph(.2,'#ffd166',{roughness:.4},18);knob.position.y=.78;
    stamp.add(base,blk,neck,knob);stamp.traverse(o=>{if(o.isMesh)o.castShadow=true});const home=new THREE.Vector3(3.4,.14,3.5);stamp.position.copy(home);stamp.rotation.y=-.12;g.add(stamp);
    return {g,stamp,home,
      press(to,onInk){const s=stamp,a=s.position.clone();const up=to.clone();up.y+=1.5;return E.anim(RM?.2:.7,k=>{s.position.lerpVectors(a,up,k);s.position.y+=Math.sin(Math.PI*k)*.6},Ease.inOut).then(()=>E.anim(.16,k=>{s.position.lerpVectors(up,to,k)},Ease.in)).then(()=>{Snd.drum(.45);onInk&&onInk();return E.wait(.22)}).then(()=>E.anim(.25,k=>{s.position.lerpVectors(to,up,k)},Ease.out)).then(()=>E.anim(RM?.2:.65,k=>{s.position.lerpVectors(up,home,k);s.position.y+=Math.sin(Math.PI*k)*.4},Ease.inOut))},
      update(){}}
  },
  /* the lift-the-flap answer on every lesson page */
  flap(ex,k,sp,meta,p2w,tap,props,repaint){
    const f=meta.flap,c=p2w(k,'R',f.x+f.w/2,f.y),w=f.w*c.sx,h=f.h*c.sz;const g=new THREE.Group();g.position.set(c.x,c.y+.012,c.z);g.userData.fold=true;
    const ch=CH[WB[sp.w].d];
    const front=G.tex(512,Math.round(512*h/w),(x,W2,H2)=>{x.fillStyle='#e9cf9c';x.fillRect(0,0,W2,H2);x.fillStyle='rgba(120,80,30,.08)';for(let i=0;i<W2;i+=7)x.fillRect(i,0,2,H2);x.strokeStyle=ch.ink;x.setLineDash([12,9]);x.lineWidth=5;x.strokeRect(10,10,W2-20,H2-20);
      x.fillStyle='#5a3a16';PT.fnt(x,Math.min(40,H2*.3),800,FONT_D);x.textAlign='center';x.direction='rtl';x.fillText('ارفع اللسان لترى الجواب',W2/2,H2*.5);PT.fnt(x,Math.min(26,H2*.2),700,FONT_R);x.direction='ltr';x.fillText('Lift the flap ↑',W2/2,H2*.82)});
    const back=G.tex(1024,Math.round(1024*h/w),(x,W2,H2)=>{x.fillStyle='#f3e2bd';x.fillRect(0,0,W2,H2);x.translate(0,H2);x.scale(1,-1);x.fillStyle='#5a3a16';PT.fnt(x,30,700);const ls=PT.wrap(x,sp.flap.q,W2-80);const sz=ls.length>2?26:30;PT.fnt(x,sz,700);PT.rtl(x);ls.slice(0,3).forEach((l,i)=>x.fillText(l,W2-40,H2/2-(ls.length-1)*sz*.75+i*sz*1.5+sz*.35))});
    const geo=new THREE.PlaneGeometry(w,h);geo.rotateX(-Math.PI/2);geo.translate(0,0,h/2);
    const mf=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({map:front,roughness:.95})),mb=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({map:back,roughness:.95,side:THREE.BackSide}));mf.castShadow=true;mb.receiveShadow=true;g.add(mf,mb);
    const tab=G.box(.36,.012,.16,'#e9cf9c');tab.position.set(0,.003,h+.06);g.add(tab);
    let open=false;const bd=BookData();
    const toggle=()=>{open=!open;Snd.noise(.2,{vol:.08,f:2600,type:'bandpass'});E.stopTweens(g.rotation);E.tw(g.rotation,{x:open?-1.95:0},RM?.05:.55,open?Ease.back:Ease.out);
      if(open){cap('',`<b>الجواب:</b> ${esc(sp.flap.a)}`);if(!bd.stamps[sp.w]){const s=meta.stamp;const t=p2w(k,'R',s.cx,s.cy);props.press(new THREE.Vector3(t.x,t.y+.01,t.z),()=>{bd.stamps[sp.w]=1;Store.save();repaint();award(sp.w,'stamp',1,'ختم جديد في كتابك!');FX.sparkle(new THREE.Vector3(t.x,t.y+.1,t.z),{n:26,colors:['#ff7b39','#ffd166','#ffffff']})})}}};
    [mf,mb,tab].forEach(o=>tap(o,toggle));
    return {g,toggle,isOpen:()=>open};
  },
  /* what every pop-up gets: its root on the page, tap/drag registration and the sticker */
  kit(ex,root,sp,o){
    const ch=sp.w?CH[WB[sp.w].d]:CH.heart,bd=BookData();
    const P={root,ch,col:ch.ink,a:o.a,
      at:(px,py)=>new THREE.Vector3((px-o.a.cx)*o.c.sx,0,(py-o.a.cy)*o.c.sz),
      w:o.a.w*o.c.sx,d:o.a.h*o.c.sz,
      tap:(obj,fn)=>o.tap(obj,fn),
      drag:(obj,hd)=>{obj.userData.drag=hd;ex.drags.push(obj);o.tap(obj,hd.tap||(()=>{}));return obj},
      up:fn=>ex.ups.push(fn),
      say:(t,oo)=>Voice.say(t,oo),
      cap:(en,ar)=>cap(en,ar),
      m:PK.m,ink:PK.ink,label:(t,oo)=>G.label(t,Object.assign({color:PINK,bg:'rgba(255,250,236,.92)',border:ch.ink,px:56,size:.32,depth:true,fixed:true},oo||{})),
      alive:()=>!ex.dead,
      done(msg){if(!sp.w||bd.stickers[sp.w])return false;bd.stickers[sp.w]=1;Store.save();o.repaintL();award(sp.w,'pop',1,msg||'ملصق جديد في كتابك!');const at=o.stickerAt();FX.burst(at,{n:70,speed:3,size:.22,colors:['#ffd166','#ffffff','#ff7b39'],sound:false});Snd.good();return true},
      world:p=>root.localToWorld(p.clone())};
    return P;
  }
};
function W_(k){return BK.W*k}

/* ---------- overlay: title, page count, chips, read-aloud and the HTML reading panel ---------- */
const Overlay={
  barRef:null,
  sync(){const st=Book.st;if(!st)return;const k=st.turned,S=st.S,M=st.M;const sp=k>=1&&k<=M+1?SPREADS[k-1]:null;
    const t=$('#bkTitle');if(t){let ar='BrightSteps 3D',en='Year 2 · Autumn 2';if(sp){if(sp.w){ar=WB[sp.w].ar;en=WB[sp.w].en}else if(sp.kind==='intro'){ar='كيف تقرأ هذا الكتاب';en='How to use this book'}else{ar='ركن الأهالي والأختام';en='Parents · Stamps'}}else if(k===M+2){ar='النهاية';en='The end'}t.innerHTML=`<b>${esc(ar)}</b><span class="en">${esc(en)}</span>`}
    const pg=$('#bkPg');if(pg){const a=sp?pageNo(k,'R'):0,b=sp?pageNo(k,'L'):0;pg.textContent=!sp?(k===0?'الغلاف':'الغلاف الخلفي'):st.single()?('ص '+(st.focus==='R'?(a||b):(b||a))):('ص '+[a,b].filter(Boolean).join('–'))}
    const nx=$('#bkNext'),pv=$('#bkPrev');if(nx)nx.disabled=k>=M+2;if(pv)pv.disabled=k<=0;
    const rd=$('#bkRead');if(rd){rd.disabled=!sp}if(this.open)this.read(true)},
  chips(items,ref){this.barRef=bar($('#bar')||document.createElement('div'),items);if(ref)ref(this.barRef);requestAnimationFrame(()=>E.offset())},
  live(sp){const l=$('#bkLive');if(!l)return;l.textContent=sp.w?(WB[sp.w].ar+'. '+bodyTxt(sp)):(sp.kind==='intro'?'كيف تقرأ هذا الكتاب':'ركن الأهالي')},
  open:false,
  read(on){const el=$('#bkReadPanel');if(!el)return;this.open=!!on;const btn=$('#bkRead');btn&&btn.classList.toggle('on',this.open);if(!on){el.hidden=true;el.innerHTML='';return}
    const st=Book.st;const k=st?st.turned:0;const sp=k>=1&&k<=st.M+1?SPREADS[k-1]:null;if(!sp){el.hidden=true;this.open=false;return}
    el.hidden=false;el.innerHTML=`<div class="rd"><button class="btn sm ghost x" type="button" data-x aria-label="إغلاق">✕</button>${Overlay.html(sp)}</div>`;
    $('[data-x]',el).onclick=()=>this.read(false);const rv=$('[data-reveal]',el);rv&&(rv.onclick=()=>{$('.ans',el).hidden=false;rv.remove();const ex=Book.st&&Book.st.ex;if(ex&&ex.flap&&!ex.flap.isOpen())ex.flap.toggle()});
    $$('[data-goto]',el).forEach(b=>b.onclick=()=>{this.read(false);Book.st.go(+b.dataset.goto)});$$('[data-href]',el).forEach(b=>b.onclick=()=>App.go(b.dataset.href));el.scrollTop=0},
  html(sp){
    if(sp.kind==='intro')return `<h2>كيف تقرأ هذا الكتاب</h2><ol>${BOOK_HOWTO.map(s=>`<li>${esc(s)}</li>`).join('')}</ol><h4>الفهرس</h4><div class="kw">${SPREADS.map((s,i)=>s.w?`<button class="btn sm ghost" type="button" data-goto="${i+1}">${WB[s.w].icon} ${esc(WB[s.w].ar)}</button>`:'').join('')}</div><div class="row"><button class="btn sm ghost" type="button" data-href="island">الجزيرة ثلاثية الأبعاد</button><button class="btn sm ghost" type="button" data-href="parent">لوحة ولي الأمر</button></div>`;
    if(sp.kind==='end')return `<h2>ركن الأهالي</h2><ul>${BOOK_PARENTS().map(s=>`<li>${esc(s)}</li>`).join('')}</ul><p>جمعتَ ${Object.keys(BookData().stamps).length} ختماً و${Object.keys(BookData().stickers).length} ملصقاً من ${SPREADS.length-2} عالماً.</p><button class="btn sm hot" type="button" data-href="parent">افتح لوحة ولي الأمر</button>`;
    const w=WB[sp.w];return `<h2>${esc(w.ar)}</h2><div class="sub en">${esc(w.en)}</div>${(sp.body||[]).map(p=>p.startsWith('EN:')?`<p class="en" dir="ltr" style="font-family:var(--f-read);font-size:18px;text-align:left;background:#fff3d6;border-radius:10px;padding:4px 10px">${esc(p.slice(3))}</p>`:`<p>${esc(p)}</p>`).join('')}
      ${sp.words&&sp.words.length?`<div class="kw">${sp.words.map(([e,a])=>`<span><b>${esc(e)}</b> ${esc(a)}</span>`).join('')}</div>`:''}
      ${sp.flap?`<div class="box"><h4>توقّع ثم اكشف</h4><p>${esc(sp.flap.q)}</p><p class="ans" hidden>${esc(sp.flap.a)}</p><button class="btn sm gold" type="button" data-reveal>اكشف الجواب</button></div>`:''}
      ${sp.home?`<p><b>في البيت:</b> ${esc(sp.home)}</p>`:''}${sp.hint?`<p class="note" style="color:#6b5847"><b>على الصفحة اليسرى:</b> ${esc(sp.hint)}</p>`:''}
      <div class="row"><button class="btn sm hot" type="button" data-href="w-${w.id}">ادخل العالم الكامل ←</button></div>`}
};
const BOOK_HOWTO=['اقلب الصفحة: اسحب طرف الصفحة اليسرى نحو اليمين، أو اضغط السهم، أو استعمل مفاتيح الأسهم.','اقرأ الصفحة اليمنى أولاً: فيها الدرس والكلمات المهمة.','توقّع الجواب ثم ارفع اللسان الورقي لتتأكد — وتحصل على ختم.','جرّب النموذج المجسّم على الصفحة اليسرى: اسحبه واضغط عليه، وأكمل التجربة لتأخذ ملصقاً.','زر «ادخل العالم الكامل» يأخذك إلى كل الألعاب والتحديات في ذلك العالم.'];
const BOOK_PARENTS=()=>{const pe=nextDow([2,5]);return [`الرياضة PE كل ثلاثاء وجمعة — القادمة ${inDays(pe.n)} (${arDate(pe.d)}).`,`ورشة الرياضيات للأهالي: الخميس 19 نوفمبر، 2:15–3:15 م — ${inDays(daysTo(KEY_DATES.workshop))}.`,`تحدّي القراءة البرونزي: 5 كتب قبل الأربعاء 16 ديسمبر — لديكم ${Math.min(booksCount(),5)} من 5.`,'كل جمعة: يأخذ الطفل دليل الواجب إلى المدرسة.','قراءة كل يوم، ونشاط أو نشاطان من الإنجليزي والرياضيات والعلوم كل أسبوع.']};

/* ---------- the book scene ---------- */
const Book={
  id:'book',st:null,
  build(ctx){
    bookSpreads();
    const {scene,orbit}=ctx,cam=E.camera,R=E.renderer;const W=BK.W,H=BK.H,T=BK.T,BD=BK.BD,OV=BK.OV,PW=BK.PW,PH=BK.PH,MIR=BK.MIR;
    const S=SPREADS.length,M=S-1,bd=BookData();
    const st={turned:0,S,M,focus:'R',flip:null,ex:null,drag:null,pdrag:null,busy:false,ctx};Book.st=st;
    R.shadowMap.enabled=true;R.shadowMap.type=THREE.PCFSoftShadowMap;cam.fov=34;cam.updateProjectionMatrix();
    scene.background=new THREE.Color('#0d0b14');scene.fog=new THREE.FogExp2('#0d0b14',.034);
    scene.add(new THREE.HemisphereLight(0xfff1de,0x2c2019,.78));
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
    /* the whole book is built in "page space" and mirrored, so it opens left to right */
    const BG=new THREE.Group();BG.scale.x=MIR;scene.add(BG);
    const edgeTex=(rot)=>{const t=G.tex(8,8,(x)=>{x.fillStyle='#f1e7cf';x.fillRect(0,0,8,8);x.fillStyle='#d6c7a6';if(rot)x.fillRect(0,0,2,8);else x.fillRect(0,0,8,2)});t.wrapS=t.wrapT=THREE.RepeatWrapping;t.minFilter=THREE.LinearFilter;t.generateMipmaps=false;if(rot)t.repeat.set(1/(T*2),1);else t.repeat.set(1,1/(T*2));return t};
    const capMat=new THREE.MeshStandardMaterial({map:edgeTex(false),roughness:.95}),sideMat=new THREE.MeshStandardMaterial({map:edgeTex(true),roughness:.95});
    const stacks={L:null,R:null};
    function stack(side,n){const sd=side==='L'?-1:1;if(stacks[side]){BG.remove(stacks[side]);stacks[side].geometry.dispose();stacks[side]=null}if(n<=0)return;
      const h=Math.max(0,n*T-T*.7),w=W-.015,sh=new THREE.Shape();sh.moveTo(0,BD);for(let i=1;i<=18;i++){const d=w*i/18;sh.lineTo(sd*d,surfY(h,d))}sh.lineTo(sd*w,BD-.004);sh.lineTo(0,BD-.004);
      const g=new THREE.ExtrudeGeometry(sh,{depth:H-.02,bevelEnabled:false,curveSegments:1});g.translate(0,0,-(H-.02)/2);const m=new THREE.Mesh(g,[capMat,sideMat]);m.castShadow=m.receiveShadow=true;BG.add(m);stacks[side]=m}
    function leaf(){const L=leafGeo(W,H,BK.N);const mf=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.9,metalness:0});mf.shadowSide=THREE.DoubleSide;const mb=mf.clone();mb.side=THREE.BackSide;
      const f=new THREE.Mesh(L.gf,mf),b=new THREE.Mesh(L.gb,mb);f.castShadow=true;f.receiveShadow=b.receiveShadow=true;f.frustumCulled=b.frustumCulled=false;const g=new THREE.Group();g.add(f,b);BG.add(g);return Object.assign(L,{g,mf,mb,f,b,ids:['','']})}
    const LT=leaf(),RT=leaf(),TN=leaf();
    function board(){const wb=W+OV,hb=H+OV*2;const L=leafGeo(wb,hb,1);const p=L.pos.array;for(let i=0;i<=1;i++)for(let j=0;j<2;j++){const q=(i*2+j)*3;p[q]=-i*wb;p[q+1]=0;p[q+2]=j?hb/2:-hb/2}L.gf.computeVertexNormals();
      const mf=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.62,metalness:.02}),mb=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.85,side:THREE.BackSide});
      const g=new THREE.Group(),f=new THREE.Mesh(L.gf,mf),b=new THREE.Mesh(L.gb,mb);f.position.y=BD/2;b.position.y=-BD/2;f.receiveShadow=b.receiveShadow=true;
      const edge=new THREE.Mesh(new THREE.BoxGeometry(wb,BD*.94,hb),G.m('#141c49',{roughness:.7}));edge.position.x=-wb/2;edge.castShadow=true;edge.receiveShadow=true;g.add(f,b,edge);BG.add(g);return Object.assign(L,{g,mf,mb,f,b,edge,ids:['','']})}
    const BF=board(),BB=board();
    const spine=G.mesh(new THREE.CylinderGeometry(1,1,H+OV*2,24,1,true,0,Math.PI),G.m('#141c49',{roughness:.6,side:THREE.DoubleSide}));spine.rotation.x=Math.PI/2;spine.castShadow=true;BG.add(spine);
    const blob=G.shadow(1,.55);blob.scale.set(W*1.5,H*1.25,1);blob.position.y=.003;BG.add(blob);
    /* a silk ribbon bookmark hanging out of the bottom of the open book */
    const ribbon=Book.ribbon();scene.add(ribbon);
    /* page textures */
    const pages=new Map();const ANI=R.capabilities.getMaxAnisotropy?Math.min(8,R.capabilities.getMaxAnisotropy()):4;
    function page(id){let p=pages.get(id);if(!p){const c=document.createElement('canvas');c.width=PW;c.height=PH;const x=c.getContext('2d');const tex=new THREE.CanvasTexture(c);tex.encoding=THREE.sRGBEncoding;tex.anisotropy=ANI;p={id,c,x,tex,meta:{}};pages.set(id,p);paint(p)}p.used=performance.now();return p}
    function paint(p){const x=p.x;x.save();x.setTransform(1,0,0,1,0,0);x.globalAlpha=1;x.globalCompositeOperation='source-over';x.textBaseline='alphabetic';x.setLineDash([]);try{p.meta=BookPaint(p.id,x,st)||{}}catch(e){console.error(e);p.meta={}}x.restore();p.tex.needsUpdate=true}
    function repaint(id){const p=pages.get(id);if(p)paint(p)}
    const live=()=>new Set([LT,RT,TN,BF,BB].flatMap(l=>l.g.visible?l.ids:[]));
    function trim(){if(pages.size<=10)return;const keep=live();[...pages.values()].filter(p=>!keep.has(p.id)).sort((a,b)=>a.used-b.used).slice(0,pages.size-10).forEach(p=>{p.tex.dispose();pages.delete(p.id)})}
    function setTex(L,fid,bid){if(fid!=null&&L.ids[0]!==fid){L.mf.map=page(fid).tex;L.mf.needsUpdate=true;L.ids[0]=fid}if(bid!=null&&L.ids[1]!==bid){L.mb.map=page(bid).tex;L.mb.needsUpdate=true;L.ids[1]=bid}}
    setTex(BF,'C','R1');setTex(BB,'L'+S,'K');
    const hL=k=>(k===0?M:clamp(M-k+1,0,M))*T,hR=k=>clamp(k-1,0,M)*T;
    function boardAt(B,isF,theta){B.g.rotation.z=-theta;const u=theta/Math.PI;B.g.position.y=isF?lerp(BD+M*T+BD/2,BD/2,u):lerp(BD/2,BD+M*T+BD/2,u)}
    function layout(k){
      st.turned=k;const l=k===0?M:clamp(M-k+1,0,M),r=clamp(k-1,0,M);
      boardAt(BF,true,k>=1?Math.PI:0);boardAt(BB,false,k>=M+2?Math.PI:0);
      stack('L',l);stack('R',r);
      LT.g.visible=k>=1&&k<=M;if(LT.g.visible){setTex(LT,'L'+k,null);shapeLeaf(LT,0,0,l*T,l*T,0)}
      RT.g.visible=k>=2&&k<=M+1;if(RT.g.visible){setTex(RT,null,'R'+k);shapeLeaf(RT,Math.PI,0,r*T,r*T,0)}
      TN.g.visible=false;
      const closed=k===0||k===M+2;spine.visible=closed;if(closed){const hh=M*T+BD*2;spine.scale.set(k===0?.4:-.4,1,hh/2);spine.position.set(0,hh/2,0)}
      blob.position.x=k===0?-W/2:k===M+2?W/2:0;blob.scale.x=closed?W*.85:W*1.55;ribbon.visible=!closed;
      trim();
    }
    /* ---------- camera ---------- */
    const single=()=> (cam.aspect||1)<.95;
    function view(){const k=st.turned;let tx,wf;const sg=single();
      if(k===0){tx=-W/2-OV/2;wf=W+OV+.7}else if(k===M+2){tx=W/2+OV/2;wf=W+OV+.7}else if(sg){tx=st.focus==='L'?-W/2+.05:W/2-.05;wf=W+.25}else{tx=0;wf=2*W+.7}
      const fov=cam.fov*Math.PI/180,ph=sg?.42:.55;const r=Math.max(E.fitR(wf),(H*Math.cos(ph)*1.08+(sg?.5:1.2))/(2*Math.tan(fov/2)));
      return {target:new THREE.Vector3(tx*MIR,.2,.3),r,theta:0,phi:ph}}
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
    async function go(s,focus){s=clamp(s,0,M+2);if(st.flip||st.busy)return;if(s===st.turned){if(focus&&single()){st.focus=focus;aim(.6);Overlay.sync()}return}
      if(st.turned===0){await turn(1);if(s===1)return fin()}
      if(st.turned===M+2){await turn(-1);if(s===M+1)return fin()}
      if(s===0&&st.turned>1){await riffle(1);return turn(-1)}
      if(s===M+2&&st.turned<M+1){await riffle(M+1);return turn(1)}
      const k=st.turned;if(s===k)return fin();if(Math.abs(s-k)===1||s===0||s===M+2){await turn(s>k?1:-1);return fin()}await riffle(s);return fin();
      function fin(){if(focus&&single()){st.focus=focus;aim(.6);Overlay.sync()}}}
    function riffle(s){const k=st.turned,dir=s>k?1:-1;foldExtras();
      if(dir>0){setTex(TN,'L'+k,'R'+s);LT.g.visible=s<=M;if(LT.g.visible){setTex(LT,'L'+s,null);shapeLeaf(LT,0,0,(M-s+1)*T,(M-s+1)*T,0)}stack('L',M-s+1)}
      else{setTex(TN,'L'+s,'R'+k);RT.g.visible=s>=2;if(RT.g.visible){setTex(RT,null,'R'+s);shapeLeaf(RT,Math.PI,0,(s-1)*T,(s-1)*T,0)}stack('R',s-1)}
      TN.g.visible=true;const f={dir,kind:'P',k:s-dir,p:0,hA:dir>0?(M-k+1)*T:(M-s+1)*T,hB:dir>0?(s-1)*T:(k-1)*T,t0:dir>0?0:Math.PI,t1:dir>0?Math.PI:0};st.flip=f;
      for(let i=0;i<Math.min(4,Math.abs(s-k));i++)setTimeout(()=>Snd.noise(.18,{vol:.06,f:3400,type:'bandpass'}),i*70);
      if(single())st.focus=dir>0?'R':'L';return finish(f,true)}
    /* ---------- page → world ---------- */
    function p2w(s,side,px,py){const brd=(side==='R'&&s===1)||(side==='L'&&s===S);const w=brd?W+OV:W,h=brd?H+OV*2:H;const ps=phys(side);const x=ps==='R'?px/PW*w:-(1-px/PW)*w;const z=-h/2+py/PH*h;const hh=side==='R'?hR(s):hL(s);return {x,z,y:surfY(brd?0:hh,x),sx:w/PW,sz:h/PH}}
    /* ---------- extras: everything that stands on, or is tapped on, the open spread ---------- */
    function foldExtras(){const ex=st.ex;if(!ex)return;st.ex=null;ex.dead=true;if(ex.pop&&ex.pop.stop)try{ex.pop.stop()}catch(e){}
      const kids=ex.g.children.slice();const s0=kids.map(c=>c.scale.y);E.anim(dur(.24),k=>{kids.forEach((c,i)=>{if(c.userData.fold!==false)c.scale.y=Math.max(.02,s0[i]*(1-k))})}).then(()=>{scene.remove(ex.g);ex.picks.forEach(o=>E.untap(o));PK.disposeTree(ex.g)})}
    function makeHits(ex,k,side){(ex.hits[side]||[]).forEach(m=>{ex.g.remove(m);E.untap(m);m.geometry.dispose();m.material.dispose()});ex.hits[side]=[];const p=page(side+k);
      (p.meta.hits||[]).forEach(hh=>{const c=p2w(k,side,hh.x+hh.w/2,hh.y+hh.h/2);const pl=new THREE.Mesh(new THREE.PlaneGeometry(hh.w*c.sx,hh.h*c.sz),new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false}));pl.rotation.x=-Math.PI/2;pl.position.set(c.x,c.y+.006,c.z);pl.userData.fold=false;ex.g.add(pl);ex.hits[side].push(pl);ex.tap(pl,()=>{if(hh.sound!==false)Snd.tick();hh.fn()})})}
    function buildExtras(k){if(st.ex)foldExtras();Overlay.sync();
      const g=new THREE.Group();scene.add(g);const ex={g,s:k,sp:null,picks:[],drags:[],ups:[],pop:null,root:null,hits:{L:[],R:[]}};st.ex=ex;
      ex.tap=(o,fn)=>{E.tap(o,(h,oo,e)=>{if(st.flip||ex.dead)return;fn(h,oo,e)});ex.picks.push(o);return o};
      if(k<1||k>M+1){Book.coverExtras(ex,k,st);return}
      if(k===1)repaint('R1');if(k===S)repaint('L'+S);bd.last=k;
      const sp=SPREADS[k-1];ex.sp=sp;
      makeHits(ex,k,'R');makeHits(ex,k,'L');
      const pr=page('R'+k),pl=page('L'+k);
      if(sp.kind==='learn'&&pr.meta.flap&&sp.c.learn&&sp.c.learn.flap){ex.flap=Book.flap(ex,k,sp,pr.meta,p2w,props,()=>repaint('R'+k));g.add(ex.flap.g)}
      const def=sp.kind==='learn'?sp.c.try:sp.kind==='end'?sp.c:null;
      if(def&&def.pop&&pl.meta.area){const a=pl.meta.area,c=p2w(k,'L',a.cx,a.cy),kS=def.scale||.86;const root=new THREE.Group();root.position.set(c.x,c.y,c.z);root.scale.setScalar(kS);g.add(root);ex.root=root;
        const tray=new THREE.Group();g.add(tray);
        const P=Book.kit(ex,root,tray,sp,{a,k,c,kS,meta:pl.meta,p2w,repaintL:()=>repaint('L'+k)});ex.P=P;
        try{ex.pop=def.pop(P)||{}}catch(e){console.error(e);ex.pop={}}
        root.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true}});if(def.ink!==false)PK.ink(root);
        P.controls(ex.pop.chips||[],ex.pop.chipsRef);
        if(pl.meta.note)P.note(ex.pop.capEn||'Your turn! Tap, drag and press the buttons.',ex.pop.capAr||'دورك! اضغط واسحب وجرّب الأزرار.');
        root.scale.y=.02*kS;E.tw(root.scale,{y:kS},RM?.01:.62,Ease.back);
      }
      Overlay.live(sp);
    }
    st.refresh=id=>{repaint(id);const ex=st.ex;if(!ex||ex.dead)return;const side=id[0],k=+id.slice(1);if(k===ex.s)makeHits(ex,k,side)};
    st.repaintAll=()=>{pages.forEach(p=>paint(p));if(!st.flip&&st.turned>=1&&st.turned<=M+1)buildExtras(st.turned)};
    st.next=next;st.prev=prev;st.go=go;st.repaint=repaint;st.page=page;st.p2w=p2w;st.single=single;st.aim=aim;
    st.burst=(id,px,py,o)=>{const k=+id.slice(1),w=p2w(k,id[0],px,py);FX.burst(new THREE.Vector3(w.x,w.y+.25,w.z),Object.assign({n:60,speed:2.6,size:.2,colors:['#ffd166','#ffffff','#ff7b39'],sound:false},o||{}))};
    /* ---------- pointer: drag pop-up parts, drag a page edge to turn ---------- */
    const ray=new THREE.Raycaster(),ndc=new THREE.Vector2(),plane=new THREE.Plane(),hit=new THREE.Vector3();
    const castFrom=e=>{const rc=R.domElement.getBoundingClientRect();ndc.set((e.clientX-rc.left)/rc.width*2-1,-(e.clientY-rc.top)/rc.height*2+1);ray.setFromCamera(ndc,cam);return ray};
    const owner=o=>{while(o&&!(o.userData&&o.userData.drag))o=o.parent;return o};
    orbit.onDown=e=>{if(orbit.ptrs.size>1){st.drag=null;const pd=st.pdrag;st.pdrag=null;if(pd&&pd.f)finish(pd.f,false);return}if(st.flip||st.busy)return;castFrom(e);
      const ex=st.ex;if(ex&&ex.drags.length){const hs=ray.intersectObjects(ex.drags,true).filter(h=>E.visibleChain(h.object));if(hs.length){const o=owner(hs[0].object);const hd=o.userData.drag;const n=hd.plane==='z'?new THREE.Vector3(0,0,1):new THREE.Vector3(0,1,0);plane.setFromNormalAndCoplanarPoint(n,hs[0].point);st.drag={o,hd,root:ex.root||o.parent};const lp=st.drag.root.worldToLocal(hs[0].point.clone());hd.start&&hd.start(lp,e);return}}
      const targets=[LT.f,RT.b,BF.f,BF.b,BB.f,BB.b].filter(m=>E.visibleChain(m));const hp=ray.intersectObjects(targets,false)[0];
      if(hp&&Math.abs(hp.point.x)>W*.4){const es=phys(hp.point.x<0?'L':'R');st.pdrag={side:es,x0:e.clientX,f:null}}};
    orbit.dragHandler=(e)=>{
      if(st.drag){castFrom(e);if(ray.ray.intersectPlane(plane,hit)){const lp=st.drag.root.worldToLocal(hit.clone());st.drag.hd.move&&st.drag.hd.move(lp,e)}return true}
      const pd=st.pdrag;if(pd){const dx=e.clientX-pd.x0;const dir=pd.side==='L'?1:-1,want=dir*MIR;const wpx=R.domElement.clientWidth*(single()?.75:.5);
        if(!pd.f){if(Math.abs(dx)>12&&Math.sign(dx)===want){pd.f=begin(dir);if(!pd.f){st.pdrag=null;return false}}else return Math.abs(dx)>12?false:true}
        set(pd.f,clamp(dx*want/wpx,0,1));return true}
      return false};
    orbit.onUp=e=>{if(st.drag){const d=st.drag;st.drag=null;d.hd.end&&d.hd.end(e)}const pd=st.pdrag;st.pdrag=null;if(pd&&pd.f){const f=pd.f;const commit=f.p>.3;if(single()&&commit&&f.kind==='P')st.focus=f.dir>0?'R':'L';finish(f,commit)}};
    E.tap(BF.f,()=>{if(!st.flip&&st.turned===0)next()});E.tap(BB.b,()=>{if(!st.flip&&st.turned===M+2)go(bd.last>1?bd.last:1)});
    const onKey=e=>{if(App.cur!=='home'||e.target&&/INPUT|TEXTAREA|SELECT/.test(e.target.tagName))return;if(st.ex&&st.ex.pop&&st.ex.pop.key&&st.ex.pop.key(e))return;
      const fwd=MIR<0?'ArrowRight':'ArrowLeft',back=MIR<0?'ArrowLeft':'ArrowRight';if(e.key===fwd){e.preventDefault();next()}else if(e.key===back){e.preventDefault();prev()}else if(e.key==='Escape')Overlay.read(false)};
    document.addEventListener('keydown',onKey);
    const start=ctx.start||0;layout(start);if(ctx.focus)st.focus=ctx.focus;aim(0);buildExtras(start);
    return {
      update(dt,t){const ex=st.ex;if(ex&&!ex.dead){if(ex.pop&&ex.pop.update)try{ex.pop.update(dt,t)}catch(e){console.error(e);ex.pop.update=null}ex.ups.forEach(f=>f(dt,t))}},
      resize(){if(!orbit.fly)aim(0)},
      tapNone(e){if(st.flip)return;castFrom(e);const hp=ray.intersectObjects([LT.f,RT.b,BF.f,BB.b].filter(m=>E.visibleChain(m)),false)[0];if(hp&&Math.abs(hp.point.x)>W*.84){((hp.point.x<0)===(MIR>0))?next():prev()}},
      dispose(){document.removeEventListener('keydown',onKey);R.shadowMap.enabled=false;if(sun.shadow.map){sun.shadow.map.dispose();sun.shadow.map=null}pages.forEach(p=>p.tex.dispose());pages.clear();Book.st=null;Overlay.read(false)}
    };
  },
  ribbon(){const pts=[[.1,BK.BD+.02,2.45],[.12,BK.BD+.02,2.72],[.16,BK.BD-.02,2.98],[.24,.02,3.32],[.36,.012,3.8]].map(p=>new THREE.Vector3(...p));const cv=new THREE.CatmullRomCurve3(pts);const n=40,pos=[],idx=[];
    for(let i=0;i<=n;i++){const p=cv.getPoint(i/n);pos.push(p.x-.055,p.y,p.z,p.x+.055,p.y,p.z);if(i<n){const a=i*2;idx.push(a,a+2,a+1,a+1,a+2,a+3)}}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setIndex(idx);g.computeVertexNormals();
    const m=new THREE.Mesh(g,G.m('#b3123f',{roughness:.35,metalness:.15,side:THREE.DoubleSide}));m.castShadow=true;m.receiveShadow=true;return m},
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
      press(to,onInk){const s=stamp,a=s.position.clone();const up=to.clone();up.y+=1.5;return E.anim(RM?.2:.7,k=>{s.position.lerpVectors(a,up,k);s.position.y+=Math.sin(Math.PI*k)*.6},Ease.inOut).then(()=>E.anim(.16,k=>{s.position.lerpVectors(up,to,k)},Ease.in)).then(()=>{Snd.drum(.45);onInk&&onInk();return E.wait(.22)}).then(()=>E.anim(.25,k=>{s.position.lerpVectors(to,up,k)},Ease.out)).then(()=>E.anim(RM?.2:.65,k=>{s.position.lerpVectors(up,home,k);s.position.y+=Math.sin(Math.PI*k)*.4},Ease.inOut))}}
  },
  /* the closed book: a tag on the cover, and a "continue reading" card on the desk */
  coverExtras(ex,k,st){const M=st.M,bd=BookData();const top=BK.BD*2+M*BK.T;
    if(k===0){const t=Book.tagSprite('👆 Tap the cover to open');t.position.set(BK.MIR*-BK.W/2,top+.35,-BK.H/2-.15);ex.g.add(t);const y0=t.position.y;ex.ups.push((dt,tt)=>{t.position.y=y0+Math.sin(tt*3)*.06});
      if(bd.last>1){const sp=SPREADS[bd.last-1];const ttl=sp&&sp.w?WB[sp.w].en:sp&&sp.kind==='end'?"Parents' corner":'Contents';
        const c=PK.card(1.9,1.05,(x,W,H)=>{x.fillStyle='#fff3c4';x.fillRect(0,0,W,H);x.fillStyle='#c0336a';x.fillRect(0,0,W,16);PT.fnt(x,34,800,FONT_D);x.fillStyle=PINK;PT.ltr(x);x.fillText('Continue reading ▶',28,74);PT.fnt(x,PT.fitFont(x,ttl,W-56,40,700,FONT_R),700,FONT_R);x.fillStyle='#2f6fb3';x.fillText(ttl,28,140);PT.fnt(x,24,400,FONT_R);x.fillStyle=PINK2;x.fillText('page '+pageNo(bd.last,'R'),28,190);PT.fnt(x,20,400);x.fillStyle=PINK2;PT.rtl(x);x.fillText('تابع القراءة من حيث توقفت',W-28,240)},{pw:512,d:.02,bg:'#fff3c4'});
        c.rotation.x=-Math.PI/2;c.rotation.z=.08;c.position.set(BK.MIR*1.55,.03,1.2);ex.g.add(c);ex.tap(c,()=>{Snd.pop();st.go(bd.last)});const t2=Book.tagSprite('👆 Tap');t2.position.set(BK.MIR*1.55,.45,1.2);ex.g.add(t2);const y2=t2.position.y;ex.ups.push((dt,tt)=>{t2.position.y=y2+Math.sin(tt*3+1)*.05})}}
    else{const t=Book.tagSprite('👆 Tap to open again');t.position.set(BK.MIR*BK.W/2,top+.35,-BK.H/2-.15);ex.g.add(t)}},
  tagSprite(text,size=.24){const s=G.label(text,{color:'#fffaf0',bg:'rgba(45,34,25,.9)',border:'#ffd166',px:48,size,fixed:true,depth:false,order:70});s.userData.fold=false;return s},
  /* the lift-the-flap answer on every lesson page */
  flap(ex,k,sp,meta,p2w,props,repaint){
    const f=meta.flap,c=p2w(k,'R',f.x+f.w/2,f.y),w=f.w*c.sx,h=f.h*c.sz;const g=new THREE.Group();g.position.set(c.x,c.y+.012,c.z);g.userData.fold=true;
    const ch=CH[WB[sp.w].d],L=sp.c.learn;
    const front=G.tex(1024,Math.round(1024*h/w),(x,W2,H2)=>{x.fillStyle='#e9cf9c';x.fillRect(0,0,W2,H2);x.fillStyle='rgba(120,80,30,.08)';for(let i=0;i<W2;i+=9)x.fillRect(i,0,3,H2);x.strokeStyle=ch.ink;x.setLineDash([18,12]);x.lineWidth=8;x.strokeRect(14,14,W2-28,H2-28);x.setLineDash([]);
      x.fillStyle='#5a3a16';PT.fnt(x,Math.min(62,H2*.36),800,FONT_D);x.textAlign='center';x.direction='ltr';x.fillText('Lift the flap ↑',W2/2,H2*.52);PT.fnt(x,Math.min(30,H2*.2),400);x.direction='rtl';x.fillText('ارفع اللسان لترى الجواب',W2/2,H2*.84)});
    const back=G.tex(1024,Math.round(1024*h/w),(x,W2,H2)=>{x.fillStyle='#f3e2bd';x.fillRect(0,0,W2,H2);x.translate(0,H2);x.scale(1,-1);x.fillStyle='#5a3a16';PT.fnt(x,36,700,FONT_R);let ls=PT.wrap(x,L.flap.q,W2-90);const sz=ls.length>2?30:36;PT.fnt(x,sz,700,FONT_R);ls=PT.wrap(x,L.flap.q,W2-90);PT.ltr(x);ls.slice(0,3).forEach((l,i)=>x.fillText(l,45,H2/2-(Math.min(3,ls.length)-1)*sz*.75+i*sz*1.5+sz*.35))});
    const geo=new THREE.PlaneGeometry(w,h);geo.rotateX(-Math.PI/2);geo.translate(0,0,h/2);
    const mf=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({map:front,roughness:.95})),mb=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({map:back,roughness:.95,side:THREE.BackSide}));mf.castShadow=true;mb.receiveShadow=true;g.add(mf,mb);
    const tab=G.box(.42,.012,.16,'#e9cf9c');tab.position.set(0,.003,h+.06);g.add(tab);
    const tg=Book.tagSprite('👆 Lift',.2);tg.position.set(w*.36,.25,h*.5);g.add(tg);const ty=tg.position.y;ex.ups.push((dt,t)=>{tg.position.y=ty+Math.sin(t*3)*.04});
    let open=false;const bd=BookData();
    const toggle=()=>{open=!open;tg.visible=false;Snd.noise(.2,{vol:.08,f:2600,type:'bandpass'});E.stopTweens(g.rotation);E.tw(g.rotation,{x:open?-1.95:0},RM?.05:.55,open?Ease.back:Ease.out);
      if(open){Voice.say(L.flap.a,{auto:true});if(!bd.stamps[sp.w]){const s=meta.stamp;const t=p2w(k,'R',s.cx,s.cy);props.press(new THREE.Vector3(t.x,t.y+.01,t.z),()=>{bd.stamps[sp.w]=1;Store.save();repaint();award(sp.w,'stamp',1,'New stamp in your book!');FX.sparkle(new THREE.Vector3(t.x,t.y+.1,t.z),{n:26,colors:['#ff7b39','#ffd166','#ffffff']})})}}};
    [mf,mb,tab].forEach(o=>ex.tap(o,toggle));
    return {g,toggle,isOpen:()=>open};
  },
  /* a 3D button that sits on the page */
  button(it,w,d,ch){const h=.06;const cv=document.createElement('canvas');cv.width=512;cv.height=Math.max(96,Math.round(512*d/w));const tex=new THREE.CanvasTexture(cv);tex.encoding=THREE.sRGBEncoding;tex.anisotropy=4;
    const top=new THREE.MeshStandardMaterial({map:tex,roughness:.55}),side=G.m(it.cls==='gold'?'#c9962a':it.cls==='go'?'#1f8f74':'#cdbb94',{roughness:.6});
    const b=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),[side,side,top,side,side,side]);b.castShadow=true;b.receiveShadow=true;b.userData.on=!!it.on;
    b.userData.redraw=()=>{const x=cv.getContext('2d'),W=cv.width,H=cv.height,on=b.userData.on;x.clearRect(0,0,W,H);
      const fill=on?ch.ink:it.cls==='gold'?'#ffd166':it.cls==='go'?'#5ee0bd':'#fffaf0';x.fillStyle=fill;x.fillRect(0,0,W,H);x.strokeStyle=on?'#fffaf0':ch.ink;x.lineWidth=10;x.strokeRect(5,5,W-10,H-10);
      const lab=stripTags(it.label);x.fillStyle=on?'#fffaf0':PINK;const sz=PT.fitFont(x,lab,W*.86,Math.min(64,H*.5),800,FONT_D,18);x.textAlign='center';x.direction='ltr';x.textBaseline='middle';x.fillText(lab,W/2,H*.53);x.textBaseline='alphabetic';tex.needsUpdate=true};
    b.userData.redraw();return b},
  /* what every pop-up gets: its root on the page, its own buttons, a note that answers back, tags, the sticker */
  kit(ex,root,tray,sp,o){
    const wid=sp.w,ch=wid?CH[WB[wid].d]:CH.heart,bd=BookData(),kS=o.kS;const tags=new Map();let note=null,noteTxt=['',''];
    const P={root,tray,ch,col:ch.ink,a:o.a,kS,
      at:(px,py)=>new THREE.Vector3((px-o.a.cx)*o.c.sx/kS,0,(py-o.a.cy)*o.c.sz/kS),
      w:o.a.w*o.c.sx/kS,d:o.a.h*o.c.sz/kS,
      tap:(obj,fn)=>ex.tap(obj,(h,oo,e)=>{P.untag(obj);fn(h,oo,e)}),
      drag:(obj,hd)=>{obj.userData.drag=hd;ex.drags.push(obj);ex.tap(obj,hd.tap||(()=>{}));if(!hd.noTag)P.tag(obj,hd.tagText||'✋ Drag me',{dy:hd.tagDy});const s0=hd.start;hd.start=(lp,e)=>{P.untag(obj);s0&&s0.call(hd,lp,e)};return obj},
      up:fn=>ex.ups.push(fn),
      say:(t,oo)=>Voice.say(t,oo),
      m:PK.m,ink:PK.ink,
      label:(t,oo)=>G.label(t,Object.assign({color:PINK,bg:'rgba(255,250,236,.92)',border:ch.ink,px:56,size:.32,depth:true,fixed:true},oo||{})),
      alive:()=>!ex.dead,
      world:p=>root.localToWorld(p.clone()),
      tag(obj,text,op={}){root.updateMatrixWorld(true);const s=Book.tagSprite(text||'👆 Tap',op.size||.21);const wp=new THREE.Vector3();obj.getWorldPosition(wp);const lp=root.worldToLocal(wp);s.position.copy(lp);s.position.y+=op.dy!=null?op.dy:.6;s.scale.multiplyScalar(1/kS);root.add(s);
        const y0=s.position.y,ph=Math.random()*6;ex.ups.push((dt,t)=>{s.position.y=y0+Math.sin(t*3+ph)*.05});tags.set(obj,s);return s},
      untag(obj){const s=tags.get(obj);if(s){s.visible=false;tags.delete(obj)}},
      note(en,ar){const m=o.meta.note;if(!m)return;if(!note){const c=o.p2w(o.k,'L',(m.x0+m.x1)/2,(m.y0+m.y1)/2);const w=(m.x1-m.x0)*c.sx,d=(m.y1-m.y0)*c.sz;const cv=document.createElement('canvas');cv.width=1024;cv.height=Math.round(1024*d/w);const tex=new THREE.CanvasTexture(cv);tex.encoding=THREE.sRGBEncoding;tex.anisotropy=8;
          note=new THREE.Mesh(new THREE.PlaneGeometry(w,d),new THREE.MeshStandardMaterial({map:tex,roughness:.9}));note.rotation.x=-Math.PI/2;note.position.set(c.x,c.y+.004,c.z);note.receiveShadow=true;note.userData.fold=false;note.userData.cv=cv;note.userData.tex=tex;tray.add(note);ex.tap(note,()=>{if(noteTxt[0])Voice.say(noteTxt[0])})}
        noteTxt=[stripTags(en),stripTags(ar)];const cv=note.userData.cv,x=cv.getContext('2d'),W=cv.width,H=cv.height;x.setTransform(1,0,0,1,0,0);x.fillStyle='#fff3c4';x.fillRect(0,0,W,H);x.fillStyle=ch.ink;x.fillRect(0,0,14,H);
        PT.icon(x,'💬',54,H*.34,40);const e=noteTxt[0]||'…';let sz=40;PT.fnt(x,sz,700,FONT_R);let ls=PT.wrap(x,e,W-130);while(ls.length>2&&sz>24){sz-=2;PT.fnt(x,sz,700,FONT_R);ls=PT.wrap(x,e,W-130)}while(ls.length===1&&sz<44&&x.measureText(ls[0]).width<W-200){sz+=2;PT.fnt(x,sz,700,FONT_R)}PT.fnt(x,sz,700,FONT_R);x.fillStyle=PINK;PT.ltr(x);
        const two=ls.length>1;const lh=sz*1.18,showAr=noteTxt[1]&&!two;const blockH=(two?2:1)*lh+(showAr?30:0);let y0=(H-blockH)/2+sz*.82;ls.slice(0,2).forEach((l,i)=>x.fillText(l,96,y0+i*lh));
        if(showAr){PT.fnt(x,24,400);x.fillStyle=PINK2;PT.rtl(x);x.fillText(PT.wrap(x,noteTxt[1],W-140)[0],W-28,y0+lh+12)}note.userData.tex.needsUpdate=true},
      cap(en,ar){P.note(en,ar)},
      controls(items,ref){const tr=o.meta.tray;if(!tr||!items||!items.length)return null;const n=items.length;const per=n<=4?n:n<=8?Math.ceil(n/2):Math.ceil(n/3);const rows=Math.ceil(n/per);const gap=14;
        const bwPx=(tr.x1-tr.x0-(per-1)*gap)/per,bhPx=Math.min(88,(tr.y1-tr.y0-(rows-1)*gap)/rows);const btns={};const list=[];
        items.forEach((it,i)=>{const r=Math.floor(i/per),ci=i%per,nr=Math.min(per,n-r*per);const rowW=nr*bwPx+(nr-1)*gap;const cx=(tr.x0+tr.x1)/2-rowW/2+ci*(bwPx+gap)+bwPx/2,cy=tr.y0+r*(bhPx+gap)+bhPx/2;
          const c=o.p2w(o.k,'L',cx,cy);const b=Book.button(it,bwPx*c.sx,bhPx*c.sz,ch);b.position.set(c.x,c.y+.03-(it.on?.018:0),c.z);b.userData.y0=c.y+.03;b.userData.it=it;b.userData.fold=false;tray.add(b);btns[it.id||('b'+i)]=b;list.push(b);
          ex.tap(b,()=>press(b))});
        const setOn=(b,v)=>{if(b.userData.on===v)return;b.userData.on=v;b.userData.redraw();E.stopTweens(b.position);E.tw(b.position,{y:b.userData.y0-(v?.018:0)},.15)};
        function press(b){const it=b.userData.it;if(it.group)list.forEach(x=>{if(x.userData.it.group===it.group)setOn(x,x===b)});else if(it.toggle)setOn(b,!b.userData.on);else{E.stopTweens(b.position);b.position.y=b.userData.y0-.028;E.tw(b.position,{y:b.userData.y0},.22,Ease.out)}
          try{it.fn&&it.fn(b.userData.on,b)}catch(e){console.error(e)}}
        const api={on(id,v=true){btns[id]&&setOn(btns[id],v)},radio(g,id){list.forEach(x=>{if(x.userData.it.group===g)setOn(x,x.userData.it.id===id)})},el:btns};ref&&ref(api);return api},
      done(msg){if(!wid||bd.stickers[wid])return false;bd.stickers[wid]=1;Store.save();o.repaintL();award(wid,'pop',1,msg||'New sticker in your book!');const m=o.meta.sticker;if(m){const w=o.p2w(o.k,'L',m.cx,m.cy);FX.burst(new THREE.Vector3(w.x,w.y+.2,w.z),{n:70,speed:3,size:.22,colors:['#ffd166','#ffffff','#ff7b39'],sound:false})}Snd.good();return true}};
    return P;
  }
};

/* ---------- overlay: title, page count, read-aloud and the plain-text reading panel ---------- */
const Overlay={
  sync(){const st=Book.st;if(!st)return;const k=st.turned,M=st.M;const sp=k>=1&&k<=M+1?SPREADS[k-1]:null;
    const t=$('#bkTitle');if(t){let en='BrightSteps 3D',ar='Year 2 · Autumn 2';if(sp){if(sp.w){en=WB[sp.w].en+(sp.kind==='practise'?' · Practise & Quiz':'');ar=WB[sp.w].ar}else if(sp.kind==='intro'){en='How to use this book';ar='كيف تستعمل الكتاب'}else{en="Parents' corner · My stamps";ar='ركن الأهالي'}}else if(k===M+2){en='The end';ar='النهاية'}t.innerHTML=`<b>${esc(en)}</b><span>${esc(ar)}</span>`}
    const pg=$('#bkPg');if(pg){const a=sp?pageNo(k,'R'):0,b=sp?pageNo(k,'L'):0;pg.textContent=!sp?(k===0?'Cover':'Back cover'):st.single()?('p. '+(st.focus==='R'?(a||b):(b||a))):('p. '+[a,b].filter(Boolean).join('–'))}
    const nx=$('#bkNext'),pv=$('#bkPrev');if(nx)nx.disabled=k>=M+2;if(pv)pv.disabled=k<=0;
    const rd=$('#bkRead');if(rd){rd.disabled=!sp}if(this.open)this.read(true)},
  live(sp){const l=$('#bkLive');if(!l)return;l.textContent=sp.w?(WB[sp.w].en+'. '+(sp.kind==='learn'?(sp.c.learn&&sp.c.learn.body||[]).map(p=>p.replace(/^EX:/,'')).join(' '):'Practise and quiz')):(sp.kind==='intro'?'How to use this book':"Parents' corner")},
  open:false,
  read(on){const el=$('#bkReadPanel');if(!el)return;this.open=!!on;const btn=$('#bkRead');btn&&btn.classList.toggle('on',this.open);if(!on){el.hidden=true;el.innerHTML='';return}
    const st=Book.st;const k=st?st.turned:0;const sp=k>=1&&k<=st.M+1?SPREADS[k-1]:null;if(!sp){el.hidden=true;this.open=false;return}
    el.hidden=false;el.innerHTML=`<div class="rd"><button class="btn sm ghost x" type="button" data-x aria-label="Close">✕</button>${Overlay.html(sp)}</div>`;
    $('[data-x]',el).onclick=()=>this.read(false);$$('[data-reveal]',el).forEach(rv=>rv.onclick=()=>{const a=rv.parentElement.querySelector('.ans');if(a)a.hidden=false;rv.remove();const ex=Book.st&&Book.st.ex;if(sp.kind==='learn'&&ex&&ex.flap&&!ex.flap.isOpen())ex.flap.toggle()});
    $$('[data-goto]',el).forEach(b=>b.onclick=()=>{this.read(false);Book.st.go(+b.dataset.goto)});$$('[data-href]',el).forEach(b=>b.onclick=()=>App.go(b.dataset.href));$$('[data-say]',el).forEach(b=>b.addEventListener('click',e=>e.stopPropagation()));el.scrollTop=0},
  html(sp){
    const arP=t=>t?`<p class="arn" dir="rtl" lang="ar">${esc(t)}</p>`:'';
    if(sp.kind==='intro')return `<h2>How to use this book</h2><ol>${BOOK_HOWTO.map(([e,a])=>`<li>${esc(e)}${arP(a)}</li>`).join('')}</ol><h4>Contents</h4><div class="kw">${SPREADS.map((s,i)=>s.w&&s.kind==='learn'?`<button class="btn sm ghost" type="button" data-goto="${i+1}">${WB[s.w].icon} ${esc(WB[s.w].en)}</button>`:'').join('')}</div><div class="row"><button class="btn sm ghost" type="button" data-href="island">3D island</button><button class="btn sm ghost" type="button" data-href="parent">Parents' page (Arabic)</button></div>`;
    if(sp.kind==='end')return `<h2>Parents' corner</h2>${arP('ركن الأهالي: مواعيد ونصائح')}<ul>${BOOK_PARENTS().map(([e,a])=>`<li>${esc(e)}${arP(a)}</li>`).join('')}</ul><button class="btn sm hot" type="button" data-href="parent">Open the parents' page</button>`;
    const w=WB[sp.w],c=sp.c;
    if(sp.kind==='practise'){const g=c.practise||{},q=c.quiz||[];return `<h2>${esc(w.en)}: practise</h2><h4>${esc(g.title||'')}</h4><p>${esc(g.how||'')}</p>${arP(g.ar)}<p class="note">Play it on the left page of the book.</p>
      <h4>Home learning</h4><ul>${(c.home||[]).map(([e,a])=>`<li>${esc(e)}${arP(a)}</li>`).join('')}</ul>
      <h4>Quiz</h4><ol>${q.map(x=>`<li><div class="box">${esc(x.q)}<p class="ans" hidden>${esc(x.o[0])}${x.why?' — '+esc(x.why):''}</p><button class="btn sm gold" type="button" data-reveal>Show the answer</button></div></li>`).join('')}</ol>`}
    const L=c.learn||{},Tr=c.try||{};
    return `<h2>${esc(w.en)}</h2><div class="sub" dir="rtl" lang="ar">${esc(w.ar)}</div>${(L.body||[]).map(p=>p.startsWith('EX:')?`<p class="ex">${esc(p.slice(3))}</p>`:`<p>${esc(p)}</p>`).join('')}
      ${L.words&&L.words.length?`<div class="kw">${L.words.map(([e,a])=>`<span><b>${esc(e)}</b> <i dir="rtl" lang="ar">${esc(a)}</i></span>`).join('')}</div>`:''}
      ${L.flap?`<div class="box"><h4>Predict, then lift the flap</h4><p>${esc(L.flap.q)}</p><p class="ans" hidden>${esc(L.flap.a)}</p><button class="btn sm gold" type="button" data-reveal>Show the answer</button></div>`:''}
      ${arP(L.ar)}${Tr.hint?`<h4>Try it (right page)</h4><p>${esc(Tr.hint)}</p>${arP(Tr.ar)}`:''}`}
};
const BOOK_HOWTO=[['Turn a page: drag the right page to the left, press the arrow, or use the arrow keys.','قلّب الصفحة بسحب الصفحة اليمنى نحو اليسار أو بالأسهم.'],['Read the left page first. Then lift the flap to check your answer and get a stamp.','اقرأ الصفحة اليسرى أولاً، ثم ارفع اللسان لترى الجواب.'],['Play with the pop-up on the right page. Press the buttons under it.','جرّب النموذج المجسّم والأزرار تحته.'],['Turn over to practise, quiz and home learning for the same topic.','في الصفحتين التاليتين: تدريب واختبار وواجب البيت.'],['Collect stamps, stickers and stars. They are kept in this book.','اجمع الأختام والملصقات والنجوم.']];
const BOOK_PARENTS=()=>{const pe=nextDow([2,5]);return [[`PE: every Tuesday and Friday — next one ${inDaysEn(pe.n)} (${enDate(pe.d)}).`,'الرياضة كل ثلاثاء وجمعة بزي الرياضة.'],[`Parents' maths workshop "Learning Together": Thursday 19 November, 2:15–3:15 pm (${inDaysEn(daysTo(KEY_DATES.workshop))}).`,'ورشة الرياضيات للأهالي: الخميس 19 نوفمبر.'],[`Bronze Reading Challenge: 5 books by Wednesday 16 December — ${Math.min(booksCount(),5)} of 5 so far.`,'تحدّي القراءة البرونزي: 5 كتب قبل 16 ديسمبر.'],['Every Friday: homework evidence goes to school.','كل جمعة: يأخذ الطفل دليل الواجب إلى المدرسة.'],['Little and often: read every day, plus a little English, maths and science each week.','قليل ومتكرر: قراءة يومية ونشاط قصير كل أسبوع.']]};

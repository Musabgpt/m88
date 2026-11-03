/* =====================================================================
   THE 3D BOOK · v2
   An English picture book on a desk (it opens left to right, like the books at school).
   Every world has two spreads:
     1. Learn | Try it   — the lesson with a lift-the-flap question, and a pop-up model.
     2. Practise | Quiz  — a game printed on the page with the booklet's home learning, and a quiz.
   Everything you press lives on the page: 3D buttons under each model, a sticky note that answers
   back, and little "Tap" / "Drag" tags sitting on the things to touch. Arabic is kept to short notes.
   ===================================================================== */
const BK={W:4.2,H:5.6,T:.008,GUT:.28,BD:.07,OV:.12,PW:1024,PH:1366,N:30,MIR:-1};
const PINK='#2d2219',PINK2='#6b5847',PAPER='#fbf4e2';
const BMATH=/(?:[□?؟]|\d+)(?:\s*[+\-−×÷=<>]\s*(?:[□?؟]|\d+))+/g;
const CH_INK={english:'#2f6fb3',maths:'#a3690b',science:'#16866b',past:'#c04c17',tech:'#6648c2',heart:'#c0336a'};
const CH_TINT={english:'#e2edfa',maths:'#faeccc',science:'#d8f2e8',past:'#fce0cf',tech:'#e9e3fb',heart:'#fadfe9'};
const CH_EN={english:'English',maths:'Maths',science:'Science',past:'History · Design & Technology',tech:'Computing · Music · PE',heart:'RE · PSHE · Values'};
const CH_AR={english:'الإنجليزي',maths:'الرياضيات',science:'العلوم',past:'التاريخ والتصميم',tech:'الحاسوب والموسيقى والرياضة',heart:'القيم والتربية الدينية'};
const CH={};DISTRICTS.forEach((d,i)=>CH[d.id]=Object.assign({},d,{n:i+1,ink:CH_INK[d.id],tint:CH_TINT[d.id],enName:CH_EN[d.id],arName:CH_AR[d.id]}));
const phys=s=>BK.MIR<0?(s==='R'?'L':'R'):s;
const stripTags=s=>String(s==null?'':s).replace(/<[^>]+>/g,'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").trim();
const BookData=()=>{const s=Store.s;if(!s.book||typeof s.book!=='object')s.book={};const b=s.book;['stamps','stickers','quiz','games','home'].forEach(k=>{if(!b[k]||typeof b[k]!=='object')b[k]={}});b.at=b.at||0;return b};
const EN_DAYS=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'],EN_MON=['January','February','March','April','May','June','July','August','September','October','November','December'];
const enDate=d=>EN_DAYS[d.getDay()]+' '+d.getDate()+' '+EN_MON[d.getMonth()];
const inDaysEn=n=>n<0?'finished':n===0?'today':n===1?'tomorrow':`in ${n} days`;
const childName=()=>String(Store.s.name||'').trim();

/* ---------- canvas print helpers ---------- */
const PT={
  fnt(x,sz,wt,fam){x.font=(wt||400)+' '+sz+'px '+(fam||FONT_B)},
  rtl(x){x.direction='rtl';x.textAlign='right'},
  ltr(x,al){x.direction='ltr';x.textAlign=al||'left'},
  bx(s){return String(s).replace(BMATH,m=>'⁦'+m.replace(/ /g,' ')+'⁩')},
  wrap(x,s,max){const out=[];PT.bx(s).split('\n').forEach(par=>{const ws=par.split(/[ \t]+/).filter(Boolean);let line='';ws.forEach(w=>{const t=line?line+' '+w:w;if(x.measureText(t).width>max&&line){out.push(line);line=w}else line=t});out.push(line)});return out},
  /* English paragraph (left to right) */
  en(x,s,X,y,max,o={}){const sz=o.sz||30,lh=o.lh||1.5;PT.fnt(x,sz,o.wt||400,o.fam||FONT_R);x.fillStyle=o.col||PINK;PT.ltr(x,o.al);const ls=PT.wrap(x,s,max);if(!o.dry)ls.forEach((l,i)=>x.fillText(l,X,y+i*sz*lh));return {y:y+ls.length*sz*lh,n:ls.length,h:ls.length*sz*lh}},
  /* short Arabic note (right to left, right-aligned inside [X0,X1]) */
  ar(x,s,X0,X1,y,o={}){if(!s)return {y,n:0,h:0};const sz=o.sz||20,lh=o.lh||1.5;PT.fnt(x,sz,o.wt||400,FONT_B);x.fillStyle=o.col||PINK2;PT.rtl(x);const ls=PT.wrap(x,s,X1-X0);if(!o.dry)ls.forEach((l,i)=>x.fillText(l,X1,y+i*sz*lh));return {y:y+ls.length*sz*lh,n:ls.length,h:ls.length*sz*lh}},
  rr(x,X,Y,W,H,R){G.rr(x,X,Y,W,H,R)},
  box(x,X,Y,W,H,R,fill,stroke,lw,dash){x.save();if(fill){x.fillStyle=fill;PT.rr(x,X,Y,W,H,R);x.fill()}if(stroke){x.strokeStyle=stroke;x.lineWidth=lw||3;if(dash)x.setLineDash(dash);PT.rr(x,X,Y,W,H,R);x.stroke()}x.restore()},
  noise:null,
  base(x,ps,o={}){
    x.fillStyle=o.bg||PAPER;x.fillRect(0,0,BK.PW,BK.PH);
    if(!PT.noise)PT.noise=G.canvas(256,256,n=>{const d=n.createImageData(256,256);for(let i=0;i<d.data.length;i+=4){const v=Math.random()<.5?60:250;d.data[i]=d.data[i+1]=d.data[i+2]=v;d.data[i+3]=Math.random()<.45?9:0}n.putImageData(d,0,0)});
    x.save();x.fillStyle=x.createPattern(PT.noise,'repeat');x.fillRect(0,0,BK.PW,BK.PH);x.restore();
    if(ps){const gx=ps==='R'?0:BK.PW,dir=ps==='R'?1:-1;const g=x.createLinearGradient(gx,0,gx+dir*170,0);g.addColorStop(0,'rgba(84,58,30,.34)');g.addColorStop(.3,'rgba(84,58,30,.09)');g.addColorStop(1,'rgba(84,58,30,0)');x.fillStyle=g;x.fillRect(ps==='R'?0:BK.PW-170,0,170,BK.PH);
      const ox=ps==='R'?BK.PW:0;const g2=x.createLinearGradient(ox,0,ox-dir*36,0);g2.addColorStop(0,'rgba(84,58,30,.14)');g2.addColorStop(1,'rgba(84,58,30,0)');x.fillStyle=g2;x.fillRect(ps==='R'?BK.PW-36:0,0,36,BK.PH)}
  },
  /* margins: the outer edge gets 84px, the spine side 140px */
  lay(ps){return ps==='L'?{X0:84,X1:BK.PW-140}:{X0:140,X1:BK.PW-84}},
  squiggle(x,X0,X1,y,col,w=4){x.save();x.strokeStyle=col;x.lineWidth=w;x.lineCap='round';x.beginPath();for(let X=X0;X<=X1;X+=6){const yy=y+Math.sin(X*.09)*4;X===X0?x.moveTo(X,yy):x.lineTo(X,yy)}x.stroke();x.restore()},
  dashCircle(x,cx,cy,r,col){x.save();x.setLineDash([10,9]);x.lineWidth=3;x.strokeStyle=col;x.beginPath();x.arc(cx,cy,r,0,Math.PI*2);x.stroke();x.restore()},
  pageNo(x,n,ps){if(!n)return;PT.fnt(x,26,700,FONT_D);x.fillStyle=PINK2;PT.ltr(x,ps==='R'?'right':'left');x.fillText(String(n),ps==='R'?BK.PW-60:60,BK.PH-34)},
  icon(x,ch,cx,cy,sz){x.fillStyle='#000000';PT.fnt(x,sz,400,'"Noto Color Emoji","Apple Color Emoji","Segoe UI Emoji",sans-serif');x.textAlign='center';x.direction='ltr';x.textBaseline='middle';x.fillText(ch,cx,cy+sz*.04);x.textBaseline='alphabetic'},
  fitFont(x,txt,max,sz,wt,fam,min=14){PT.fnt(x,sz,wt,fam);while(x.measureText(txt).width>max&&sz>min){sz-=2;PT.fnt(x,sz,wt,fam)}return sz},
  stampMark(x,cx,cy,r,col,ico){x.save();x.translate(cx,cy);x.rotate(-.22);x.globalAlpha=.86;x.strokeStyle=col;x.fillStyle=col;x.lineWidth=r*.12;x.beginPath();x.arc(0,0,r,0,Math.PI*2);x.stroke();x.lineWidth=r*.05;x.beginPath();x.arc(0,0,r*.8,0,Math.PI*2);x.stroke();
    PT.fnt(x,r*.2,800,FONT_D);x.textAlign='center';x.direction='ltr';x.fillText('WELL DONE',0,-r*.46);x.fillText('★ ★ ★',0,r*.62);x.globalAlpha=1;PT.icon(x,ico,0,r*.02,r*.6);
    x.globalCompositeOperation='destination-out';for(let i=0;i<70;i++){x.beginPath();x.arc(rand(-r,r),rand(-r,r),rand(.6,2.6),0,7);x.fill()}x.restore()},
  sticker(x,cx,cy,r){x.save();x.translate(cx,cy);x.rotate(.18);x.shadowColor='rgba(60,40,10,.35)';x.shadowBlur=10;x.shadowOffsetY=4;const g=x.createRadialGradient(-r*.3,-r*.3,r*.1,0,0,r*1.1);g.addColorStop(0,'#fff3b0');g.addColorStop(.55,'#ffcf4a');g.addColorStop(1,'#e59a12');x.fillStyle=g;x.beginPath();for(let k=0;k<10;k++){const a=-Math.PI/2+k*Math.PI/5,rr=k%2?r*.5:r;x.lineTo(Math.cos(a)*rr,Math.sin(a)*rr)}x.closePath();x.fill();x.shadowColor='transparent';x.strokeStyle='#fff';x.lineWidth=5;x.stroke();x.restore()},
  tick(x,cx,cy,s,col){x.save();x.strokeStyle=col||'#16866b';x.lineWidth=s*.18;x.lineCap='round';x.lineJoin='round';x.beginPath();x.moveTo(cx-s*.35,cy);x.lineTo(cx-s*.08,cy+s*.28);x.lineTo(cx+s*.4,cy-s*.3);x.stroke();x.restore()},
  cross(x,cx,cy,s,col){x.save();x.strokeStyle=col||'#c0336a';x.lineWidth=s*.16;x.lineCap='round';x.beginPath();x.moveTo(cx-s*.3,cy-s*.3);x.lineTo(cx+s*.3,cy+s*.3);x.moveTo(cx+s*.3,cy-s*.3);x.lineTo(cx-s*.3,cy+s*.3);x.stroke();x.restore()}
};

/* ---------- page geometry: a strip of quads that bends around the spine ---------- */
function leafGeo(w,h,N){
  const n=(N+1)*2;const pos=new THREE.BufferAttribute(new Float32Array(n*3),3);pos.setUsage(THREE.DynamicDrawUsage);
  const nrm=new THREE.BufferAttribute(new Float32Array(n*3),3);const uf=new Float32Array(n*2),ub=new Float32Array(n*2);const idx=[];const m=BK.MIR<0;
  for(let i=0;i<=N;i++){const u=i/N;for(let j=0;j<2;j++){const k=i*2+j;uf[k*2]=m?u:1-u;uf[k*2+1]=1-j;ub[k*2]=m?1-u:u;ub[k*2+1]=1-j}}
  for(let i=0;i<N;i++){const a=i*2,b=a+1,c=a+2,d=a+3;idx.push(a,c,b,c,d,b)}
  const mk=uv=>{const g=new THREE.BufferGeometry();g.setAttribute('position',pos);g.setAttribute('normal',nrm);g.setAttribute('uv',new THREE.BufferAttribute(uv,2));g.setIndex(idx);return g};
  return {gf:mk(uf),gb:mk(ub),pos,nrm,N,w,h};
}
/* theta 0 = lying on the first pile, PI = on the second. curl bends the outer edge ahead of the spine. */
function shapeLeaf(L,theta,curl,hA,hB,lift){
  const p=L.pos.array,N=L.N,w=L.w,h=L.h,dd=w/N;const hc=lerp(hA,hB,theta/Math.PI);let X=0,Y=0;
  for(let i=0;i<=N;i++){const d=i*dd;if(i>0){const ph=clamp(theta+curl*Math.pow((d-dd/2)/w,1.6),0,Math.PI);X-=Math.cos(ph)*dd;Y+=Math.sin(ph)*dd}
    const yy=BK.BD+Y+hc*(1-Math.exp(-d/BK.GUT))+lift;for(let j=0;j<2;j++){const q=(i*2+j)*3;p[q]=X;p[q+1]=yy;p[q+2]=j?h/2:-h/2}}
  L.pos.needsUpdate=true;L.gf.computeVertexNormals();L.gf.computeBoundingSphere();L.gb.boundingSphere=L.gf.boundingSphere;L.gf.computeBoundingBox();L.gb.boundingBox=L.gf.boundingBox;
}
const surfY=(h,d)=>BK.BD+h*(1-Math.exp(-Math.abs(d)/BK.GUT));

/* ---------- spreads ---------- */
const WC={};
const SPREADS=[];
function bookSpreads(){if(SPREADS.length)return;SPREADS.push({kind:'intro'});DISTRICTS.forEach(d=>WORLDS.filter(w=>w.d===d.id).forEach(w=>{const c=WC[w.id]||{};SPREADS.push({kind:'learn',w:w.id,c});SPREADS.push({kind:'practise',w:w.id,c})}));SPREADS.push({kind:'end',c:WC._end||{}})}
const spreadOf=(wid,kind)=>SPREADS.findIndex(s=>s.w===wid&&s.kind===(kind||'learn'))+1;
const pageNo=(s,side)=>s<=1&&side==='R'||s>=SPREADS.length&&side==='L'?0:2*(s-1)+(side==='L'?1:0);
const worldDone=wid=>{const b=BookData();return [b.stamps[wid],b.stickers[wid],b.games[wid],b.quiz[wid]].filter(Boolean).length};

/* ---------- pop-up toolkit: paper-and-ink models that stand up off the page ---------- */
const PK={
  inkMat:null,
  ink(root,th=30){if(!PK.inkMat){PK.inkMat=new THREE.LineBasicMaterial({color:0x2d2219,transparent:true,opacity:.5});PK.inkMat.userData={keep:true}}
    const list=[];root.traverse(o=>{if(o.isMesh&&!o.userData.noInk&&!o.userData.inked)list.push(o)});
    list.forEach(o=>{o.userData.inked=1;const eg=new THREE.EdgesGeometry(o.geometry,th);if(eg.attributes.position.count){const l=new THREE.LineSegments(eg,PK.inkMat);l.raycast=()=>{};l.userData.noInk=true;o.add(l)}else eg.dispose()})},
  m(c,ex){return G.m(c,Object.assign({roughness:.78},ex||{}))},
  card(w,h,draw,o={}){const t=G.tex(o.pw||512,Math.round((o.pw||512)*h/w),(x,W,H)=>{x.fillStyle=o.bg||'#fffaf0';x.fillRect(0,0,W,H);draw&&draw(x,W,H)});
    const edge=PK.m(o.edge||'#e8dcc2');const back=PK.m(o.back||'#efe3c8');const front=new THREE.MeshStandardMaterial({map:t,roughness:.8});
    const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,o.d||.03),[edge,edge,edge,edge,front,back]);m.userData.redraw=fn=>{const c=t.image;const x=c.getContext('2d');x.setTransform(1,0,0,1,0,0);x.fillStyle=o.bg||'#fffaf0';x.fillRect(0,0,c.width,c.height);fn(x,c.width,c.height);t.needsUpdate=true};return m},
  card2(w,h,front,back,o={}){const m=PK.card(w,h,front,o);if(back){const t=G.tex(o.pw||512,Math.round((o.pw||512)*h/w),(x,W,H)=>{x.fillStyle=o.bb||'#f6d7e3';x.fillRect(0,0,W,H);back(x,W,H)});m.material[5]=new THREE.MeshStandardMaterial({map:t,roughness:.8})}return m},
  word(x,W,H,word,hi,o={}){let sz=o.sz||H*.58;PT.fnt(x,sz,700,FONT_R);while(x.measureText(word).width>W*.88&&sz>20){sz-=4;PT.fnt(x,sz,700,FONT_R)}
    const tw=x.measureText(word).width;let X=(W-tw)/2;x.textAlign='left';x.direction='ltr';x.textBaseline='middle';
    [...word].forEach((ch,i)=>{const on=hi&&hi.has(i);x.fillStyle=on?(o.hc||'#e5531a'):(o.c||PINK);x.fillText(ch,X,H*.54);if(on){x.fillRect(X,H*.54+sz*.42,x.measureText(ch).width,Math.max(3,sz*.06))}X+=x.measureText(ch).width});x.textBaseline='alphabetic'},
  disposeTree(root){root.traverse(o=>{if(o.geometry&&!(o.geometry.userData&&o.geometry.userData.keep))o.geometry.dispose();const m=o.material;if(m)(Array.isArray(m)?m:[m]).forEach(mm=>{if(mm.userData&&mm.userData.keep)return;if(mm.map&&!(mm.map.userData&&mm.map.userData.keep))mm.map.dispose();mm.dispose()})})}
};
const txtCard=(w,h,txt,o={})=>PK.card(w,h,(x,W,H)=>{if(o.border!==false){x.strokeStyle=o.bc||'#2d2219';x.lineWidth=o.bw||6;x.strokeRect(4,4,W-8,H-8)}PK.word(x,W,H,txt,o.hi,{c:o.c,hc:o.hc,sz:o.sz})},{pw:o.pw||512,bg:o.bg,d:o.d});
const untap=o=>o.traverse(c=>E.untap(c));
function hiIdx(word,g){const s=new Set();if(g.includes('-')){const [a,b]=g.split('-');const m=word.match(new RegExp(a+'([^aeiou])'+b));if(m){s.add(m.index);s.add(m.index+2)}return s}const i=word.indexOf(g);if(i>=0)for(let k=0;k<g.length;k++)s.add(i+k);return s}

/* ---------- page printer: every page of the book is drawn here ---------- */
function BookPaint(id,x,st){
  if(id==='C')return paintCover(x);
  if(id==='K')return paintBack(x);
  const side=id[0],s=+id.slice(1),sp=SPREADS[s-1],ps=phys(side);
  if(!sp){PT.base(x,ps);return {}}
  const ctx={id,side,ps,s,sp,st,refresh:()=>st.refresh(id),burst:(px,py,o)=>st.burst(id,px,py,o)};
  if(sp.kind==='intro')return side==='R'?paintHowTo(x,ctx):paintContents(x,ctx);
  if(sp.kind==='learn')return side==='R'?paintLearn(x,ctx):paintTry(x,ctx);
  if(sp.kind==='practise')return side==='R'?Games.paintPractise(x,ctx):Games.paintQuiz(x,ctx);
  return side==='R'?paintParents(x,ctx):paintStamps(x,ctx);
}
function clothBg(x,c0,c1){const PW=BK.PW,PH=BK.PH;const g=x.createLinearGradient(0,0,PW,PH);g.addColorStop(0,c0);g.addColorStop(1,c1);x.fillStyle=g;x.fillRect(0,0,PW,PH);
  x.save();x.globalAlpha=.07;x.strokeStyle='#ffffff';x.lineWidth=1;for(let i=-PH;i<PW;i+=6){x.beginPath();x.moveTo(i,0);x.lineTo(i+PH,PH);x.stroke()}x.globalAlpha=.05;for(let i=0;i<PW+PH;i+=6){x.beginPath();x.moveTo(i,0);x.lineTo(i-PH,PH);x.stroke()}x.restore()}
function foil(x,y0,y1){const g=x.createLinearGradient(0,y0,0,y1);g.addColorStop(0,'#fff1b8');g.addColorStop(.45,'#ffd166');g.addColorStop(.55,'#e2a93b');g.addColorStop(1,'#ffe39a');return g}
function burst(x,cx,cy,r,col,n=16){x.save();x.strokeStyle=col;x.lineCap='round';for(let i=0;i<n;i++){const a=i/n*Math.PI*2;x.lineWidth=5;x.beginPath();x.moveTo(cx+Math.cos(a)*r*.25,cy+Math.sin(a)*r*.25);x.lineTo(cx+Math.cos(a)*r,cy+Math.sin(a)*r);x.stroke();x.beginPath();x.arc(cx+Math.cos(a)*r*1.12,cy+Math.sin(a)*r*1.12,4,0,7);x.fillStyle=col;x.fill()}x.restore()}
/* the spine edge of the front cover is on the left (an English book), the back cover's on the right */
function paintCover(x){
  const PW=BK.PW,PH=BK.PH,sl=BK.MIR<0;clothBg(x,'#22306f','#111845');
  x.fillStyle='rgba(0,0,0,.22)';x.fillRect(sl?0:PW-70,0,70,PH);x.fillStyle=foil(x,0,PH);x.fillRect(sl?70:PW-74,0,4,PH);x.fillRect(sl?60:PW-62,0,2,PH);
  const L=sl?130:56;x.strokeStyle=foil(x,0,PH);x.lineWidth=5;x.strokeRect(L,56,PW-186,PH-112);x.lineWidth=2;x.strokeRect(L+16,72,PW-218,PH-144);
  const cx=sl?(74+PW)/2:(PW-74)/2;
  burst(x,cx-230,230,110,'#ff7b39');burst(x,cx+220,190,86,'#ffd166',14);burst(x,cx,300,58,'#ff5d8f',12);burst(x,cx-300,450,50,'#3ddbb0',12);burst(x,cx+280,430,64,'#b29bff',14);
  for(let i=0;i<60;i++){x.fillStyle=`rgba(255,240,200,${rand(.25,.8)})`;x.beginPath();x.arc(rand(L+30,L+PW-210),rand(90,520),rand(1,3),0,7);x.fill()}
  x.textAlign='center';x.direction='ltr';PT.fnt(x,124,800,FONT_D);x.fillStyle=foil(x,520,660);x.shadowColor='rgba(0,0,0,.45)';x.shadowBlur=14;x.fillText('BrightSteps',cx,640);x.shadowBlur=0;
  PT.fnt(x,52,800,FONT_D);x.fillStyle='#ff9150';x.fillText('MY 3D LEARNING BOOK',cx,718);
  PT.fnt(x,46,700,FONT_R);x.fillStyle='#ffd166';x.fillText('Year 2 · Autumn 2',cx,800);
  x.strokeStyle='rgba(255,209,102,.55)';x.lineWidth=2;x.beginPath();x.moveTo(cx-230,840);x.lineTo(cx+230,840);x.stroke();
  PT.fnt(x,32,400,FONT_R);x.fillStyle='#c9d0f3';x.fillText('This book belongs to',cx,912);
  const nm=childName();if(nm){PT.fnt(x,PT.fitFont(x,nm,PW-320,70,800,FONT_D),800,FONT_D);x.fillStyle='#fff7e6';x.fillText(nm,cx,995)}else{x.setLineDash([6,10]);x.strokeStyle='rgba(255,247,230,.7)';x.lineWidth=3;x.beginPath();x.moveTo(cx-220,990);x.lineTo(cx+220,990);x.stroke();x.setLineDash([])}
  PT.fnt(x,30,400,FONT_R);x.fillStyle='#c9d0f3';x.fillText('21 topics · read · predict · try · practise · quiz',cx,1080);
  PT.fnt(x,36,800,FONT_D);x.fillStyle='#ffb04d';x.fillText('Tap the cover to open the book',cx,1188);
  PT.fnt(x,24,400);x.direction='rtl';x.fillStyle='#c9d0f3';x.fillText('اضغط الغلاف لفتح الكتاب',cx,1240);
  return {};
}
function paintBack(x){
  const PW=BK.PW,PH=BK.PH,sr=BK.MIR<0;clothBg(x,'#1a2560','#0f1640');x.fillStyle='rgba(0,0,0,.22)';x.fillRect(sr?PW-70:0,0,70,PH);x.fillStyle=foil(x,0,PH);x.fillRect(sr?PW-74:70,0,4,PH);
  x.strokeStyle=foil(x,0,PH);x.lineWidth=4;x.strokeRect(sr?56:130,56,PW-186,PH-112);
  const cx=sr?(PW-74)/2:(PW+74)/2;x.textAlign='center';x.direction='ltr';PT.fnt(x,56,800,FONT_D);x.fillStyle='#fff7e6';x.fillText('A book you can read…',cx,300);x.fillText('…and touch!',cx,370);
  PT.fnt(x,32,400,FONT_R);x.fillStyle='#c9d0f3';['Every topic from the Year 2 booklet','has two spreads: learn and try,','then practise, quiz and home learning.','Lift the flaps, press the buttons,','and collect stamps and stickers.'].forEach((l,i)=>x.fillText(l,cx,460+i*50));
  burst(x,cx,820,100,'#ffd166',18);burst(x,cx-230,760,46,'#ff7b39',12);burst(x,cx+230,780,56,'#3ddbb0',12);
  PT.fnt(x,36,700,FONT_R);x.fillStyle='#ffd166';x.fillText('BrightSteps 3D · Year 2 · Autumn 2',cx,1000);
  PT.fnt(x,26,400,FONT_R);x.fillStyle='#c9d0f3';x.fillText('Made for a Year 2 learner in Birmingham, UK',cx,1048);
  const bx=sr?120:PW-440,by=PH-290;x.fillStyle='#fffaf0';x.fillRect(bx,by,300,190);x.fillStyle='#111';let X=bx+20;for(let i=0;i<46;i++){const w=[2,2,3,4,2,5][i%6];if(i%2===0)x.fillRect(X,by+20,w,120);X+=w+2;if(X>bx+270)break}
  PT.fnt(x,22,700,FONT_R);x.fillText('978-2-0026-Y2-AUT2',bx+150,by+170);
  return {};
}
function endpaper(x){const PW=BK.PW,PH=BK.PH;x.fillStyle='#efe3c6';x.fillRect(0,0,PW,PH);const cols=Object.values(CH_INK);
  for(let yy=40,r=0;yy<PH;yy+=86,r++)for(let xx=(r%2)*48+30;xx<PW;xx+=96){x.save();x.translate(xx,yy);x.rotate((r*7+xx)%5*.3);x.globalAlpha=.16;x.fillStyle=cols[(r+Math.floor(xx/96))%cols.length];x.beginPath();for(let k=0;k<10;k++){const a=-Math.PI/2+k*Math.PI/5,rr=k%2?7:16;x.lineTo(Math.cos(a)*rr,Math.sin(a)*rr)}x.closePath();x.fill();x.restore()}}
function panel(x,X,Y,W,H){x.save();x.shadowColor='rgba(70,45,15,.25)';x.shadowBlur=18;x.shadowOffsetY=6;x.fillStyle=PAPER;PT.rr(x,X,Y,W,H,26);x.fill();x.restore();x.strokeStyle='rgba(150,110,50,.35)';x.lineWidth=2;PT.rr(x,X+10,Y+10,W-20,H-20,20);x.stroke()}
function bookplate(x,X0,X1,y){const cw=X1-X0;PT.box(x,X0,y,cw,150,24,'#fff7e6','#c0336a',4);PT.box(x,X0+12,y+12,cw-24,126,18,null,'rgba(192,51,106,.4)',2,[8,8]);
  PT.fnt(x,28,700,FONT_R);x.fillStyle='#c0336a';PT.ltr(x,'center');x.fillText('This book belongs to',(X0+X1)/2,y+54);const nm=childName();
  if(nm){PT.fnt(x,PT.fitFont(x,nm,cw-80,54,800,FONT_D),800,FONT_D);x.fillStyle=PINK;x.fillText(nm,(X0+X1)/2,y+118)}else{x.setLineDash([5,9]);x.strokeStyle=PINK2;x.lineWidth=3;x.beginPath();x.moveTo(X0+90,y+116);x.lineTo(X1-90,y+116);x.stroke();x.setLineDash([]);PT.fnt(x,17,400);x.fillStyle=PINK2;PT.rtl(x);x.fillText('اكتب اسم الطفل في لوحة ولي الأمر',X1-40,y+140)}}
function paintHowTo(x,ctx){
  const PW=BK.PW,PH=BK.PH,ps=ctx.ps;endpaper(x);const PX=ps==='L'?60:110;panel(x,PX,50,PW-170,PH-100);const X0=PX+50,X1=PX+PW-170-50,CW=X1-X0;
  bookplate(x,X0,X1,90);
  PT.fnt(x,48,800,FONT_D);PT.ltr(x);x.fillStyle=PINK;x.fillText('How to use this book',X0,318);PT.ar(x,'كيف تستعمل الكتاب',X0,X1,312,{sz:22});PT.squiggle(x,X0,X0+330,338,'#e5531a',4);
  const items=BOOK_WEEK(),bh=78+items.length*48;
  /* the steps shrink a little until they and "This week" fit on the page */
  let sz=26;const steps=z=>BOOK_HOWTO.reduce((yy,[e,a])=>{const r=PT.en(x,e,X0+60,yy,CW-60,{sz:z,lh:1.38,dry:true});return PT.ar(x,a,X0+60,X1,r.y+2,{sz:Math.round(z*.7),lh:1.3,dry:true}).y+14},392);
  while(sz>20&&steps(sz)+4+bh>PH-62)sz--;
  let y=392;BOOK_HOWTO.forEach(([e,a],i)=>{x.fillStyle='#ffd166';x.beginPath();x.arc(X0+22,y-10,22,0,7);x.fill();PT.fnt(x,26,800,FONT_D);x.fillStyle='#3a2600';PT.ltr(x,'center');x.fillText(String(i+1),X0+22,y-1);
    const r=PT.en(x,e,X0+60,y,CW-60,{sz,lh:1.38});const r2=PT.ar(x,a,X0+60,X1,r.y+2,{sz:Math.round(sz*.7),lh:1.3});y=r2.y+14});
  y+=4;PT.box(x,X0,y,CW,bh,20,'#fff5df','#e5a93b',3,[10,8]);
  PT.fnt(x,32,800,FONT_D);PT.ltr(x);x.fillStyle='#a3690b';x.fillText('This week',X0+24,y+50);PT.fnt(x,22,400,FONT_R);x.fillStyle=PINK2;PT.ltr(x,'right');x.fillText(enDate(today()),X1-24,y+48);
  items.forEach(([ic,t,v],i)=>{const yy=y+96+i*48;PT.icon(x,ic,X0+40,yy-9,30);PT.fnt(x,24,400,FONT_R);PT.ltr(x);x.fillStyle=PINK;x.fillText(t,X0+72,yy);PT.fnt(x,25,800,FONT_D);x.fillStyle='#c04c17';PT.ltr(x,'right');x.fillText(v,X1-24,yy)});
  return {};
}
const BOOK_WEEK=()=>{const pe=nextDow([2,5]),fri=nextDow([5]),ws=daysTo(KEY_DATES.workshop);return [['🏃','PE kit (Tuesday & Friday)',inDaysEn(pe.n)],['📁','Homework to school (Friday)',inDaysEn(fri.n)],['🧮',"Parents' maths workshop",inDaysEn(ws)],['📚','Bronze Reading Challenge',Math.min(booksCount(),5)+' / 5 books']]};
function paintContents(x,ctx){
  const PW=BK.PW,PH=BK.PH,ps=ctx.ps;PT.base(x,ps);const meta={hits:[]};const {X0,X1}=PT.lay(ps);
  PT.fnt(x,62,800,FONT_D);PT.ltr(x);x.fillStyle=PINK;x.fillText('Contents',X0,140);PT.ar(x,'المحتويات',X0,X1,134,{sz:24});x.fillStyle=PINK;x.fillRect(X0,160,X1-X0,3);
  const mid=(X0+X1)/2,cols=[[X0,mid-14],[mid+14,X1]];
  [[0,1,2],[3,4,5]].forEach((grp,col)=>{const [L,R]=cols[col];let y=222;grp.forEach(di=>{const d=DISTRICTS[di],ch=CH[d.id];
    x.fillStyle=ch.ink;x.beginPath();x.arc(L+10,y-9,10,0,7);x.fill();PT.fnt(x,20,700,FONT_R);PT.ltr(x);x.fillStyle=ch.ink;x.fillText('Chapter '+(di+1),L+28,y-2);
    PT.fnt(x,PT.fitFont(x,ch.enName,R-L-10,28,800,FONT_D),800,FONT_D);x.fillStyle=PINK;x.fillText(ch.enName,L,y+34);y+=74;
    SPREADS.forEach((sp,i)=>{if(sp.kind!=='learn'||WB[sp.w].d!==d.id)return;const w=WB[sp.w];const sn=i+1;PT.icon(x,w.icon,L+16,y-9,28);
      const pn=String(pageNo(sn,'R'));PT.fnt(x,22,700,FONT_D);const pnw=x.measureText(pn).width;
      PT.fnt(x,23,400,FONT_R);let t=w.en;while(x.measureText(t).width>R-L-pnw-70&&t.length>4)t=t.slice(0,-2)+'…';PT.ltr(x);x.fillStyle=PINK;x.fillText(t,L+40,y);const tw=x.measureText(t).width;
      PT.fnt(x,22,700,FONT_D);x.fillStyle=ch.ink;PT.ltr(x,'right');x.fillText(pn,R,y);x.fillStyle='rgba(107,88,71,.5)';for(let X=L+48+tw+6;X<R-pnw-8;X+=11)x.fillRect(X,y-6,3,3);
      const dn=worldDone(sp.w);for(let k=0;k<4;k++){x.fillStyle=k<dn?'#ffb43a':'rgba(107,88,71,.18)';x.beginPath();x.arc(L+40+k*12,y+12,4,0,7);x.fill()}
      meta.hits.push({x:L-6,y:y-34,w:R-L+12,h:52,fn:()=>Book.st&&Book.st.go(sn,'R')});y+=54});y+=16})});
  const btn=(X,Y,W2,txt,ic,fn,col)=>{PT.box(x,X,Y,W2,72,20,col);PT.icon(x,ic,X+40,Y+36,30);PT.fnt(x,PT.fitFont(x,txt,W2-90,26,800,FONT_D),800,FONT_D);PT.ltr(x);x.fillStyle='#fffaf0';x.fillText(txt,X+70,Y+46);meta.hits.push({x:X,y:Y,w:W2,h:72,fn})};
  btn(X0,1180,(X1-X0)/2-10,'3D island','🏝️',()=>App.go('island'),'#2f6fb3');btn((X0+X1)/2+10,1180,(X1-X0)/2-10,"Parents' page",'👪',()=>App.go('parent'),'#6648c2');
  PT.fnt(x,19,400,FONT_R);x.fillStyle=PINK2;PT.ltr(x);x.fillText('Dots: stamp · sticker · practice · quiz',X0,1290);
  PT.pageNo(x,pageNo(ctx.s,'L'),ps);return meta;
}
function paintLearn(x,ctx){
  const {sp,ps}=ctx,w=WB[sp.w],ch=CH[w.d],L=sp.c.learn||{},PW=BK.PW,PH=BK.PH;PT.base(x,ps);const {X0,X1}=PT.lay(ps),CW=X1-X0;const meta={hits:[]};const bd=BookData();
  PT.fnt(x,24,700,FONT_D);PT.ltr(x);x.fillStyle=ch.ink;x.fillText('Chapter '+ch.n+' · '+ch.enName,X0,92);PT.ar(x,ch.arName,X0,X1,90,{sz:18,col:ch.ink});
  x.globalAlpha=.85;x.fillStyle=ch.ink;x.fillRect(X0,106,CW,3);x.globalAlpha=1;
  x.fillStyle=ch.tint;x.beginPath();x.arc(X1-48,176,46,0,7);x.fill();PT.icon(x,w.icon,X1-48,176,54);
  {const ab={x:X1-160,y:236,w:160,h:58};PT.box(x,ab.x,ab.y,ab.w,ab.h,29,'#6648c2','#4a2f9e',2);PT.icon(x,'✨',ab.x+30,ab.y+29,30);PT.fnt(x,27,800,FONT_D);PT.ltr(x);x.fillStyle='#ffffff';x.fillText('Ask me',ab.x+54,ab.y+39);meta.hits.push({x:ab.x-8,y:ab.y-8,w:ab.w+16,h:ab.h+16,fn:()=>AskUI.open({sp})});meta.ask=ab}
  let y=192;PT.fnt(x,58,800,FONT_D);PT.ltr(x);x.fillStyle=PINK;const tl=PT.wrap(x,w.en,CW-170);tl.forEach((l,i)=>x.fillText(l,X0,y+i*64));y+=(tl.length-1)*64;
  PT.squiggle(x,X0,X0+Math.min(330,CW-140),y+20,ch.ink,4);PT.ar(x,w.ar,X0,X1-176,y+56,{sz:24,col:ch.ink});const top=y+86;
  let bot=PH-82;
  if(L.ar){PT.fnt(x,21,400);const al=PT.wrap(x,L.ar,CW-40);const hh=56+al.length*32;const hy=bot-hh;PT.box(x,X0,hy,CW,hh,16,ch.tint);
    PT.fnt(x,20,700,FONT_R);PT.ltr(x);x.fillStyle=ch.ink;x.fillText('For grown-ups',X0+18,hy+34);PT.ar(x,'للأهل',X0,X1-18,hy+34,{sz:20,wt:700,col:ch.ink});PT.ar(x,L.ar,X0+18,X1-18,hy+66,{sz:21,lh:1.5,col:PINK});bot=hy-18}
  if(L.flap){PT.fnt(x,28,700,FONT_R);const ql=PT.wrap(x,L.flap.q,CW-40);PT.fnt(x,26,700,FONT_R);const al=PT.wrap(x,L.flap.a,CW-200);const ah=Math.max(130,36+al.length*38);
    const fh=66+ql.length*40+14+ah+18;const fy=bot-fh;PT.box(x,X0,fy,CW,fh,20,'#fff6e2',ch.ink,3,[12,9]);
    PT.icon(x,'👀',X0+30,fy+38,28);PT.fnt(x,27,800,FONT_D);PT.ltr(x);x.fillStyle=ch.ink;x.fillText('Predict, then lift the flap',X0+56,fy+48);PT.ar(x,'توقّع ثم اكشف',X0,X1-18,fy+46,{sz:18,col:ch.ink});
    PT.fnt(x,28,700,FONT_R);PT.ltr(x);x.fillStyle=PINK;ql.forEach((l,i)=>x.fillText(l,X0+22,fy+92+i*40));
    const ay=fy+66+ql.length*40+14;PT.box(x,X0+16,ay,CW-32,ah,14,'#e6f5ee');PT.fnt(x,26,700,FONT_R);PT.ltr(x);x.fillStyle='#14614f';al.forEach((l,i)=>x.fillText(l,X0+34,ay+(ah-al.length*38)/2+28+i*38));
    meta.flap={x:X0+16,y:ay,w:CW-32,h:ah};const sc={cx:X1-100,cy:ay+ah/2,r:52};meta.stamp=sc;if(bd.stamps[sp.w])PT.stampMark(x,sc.cx,sc.cy,sc.r,'#c8402a',w.icon);
    bot=fy-18}
  if(L.words&&L.words.length){const tiles=L.words.map(([e,a])=>{PT.fnt(x,28,700,FONT_R);const w1=x.measureText(e).width;PT.fnt(x,18,400);const w2=x.measureText(a).width;return {e,a,w:Math.max(w1,w2)+32}});
    const rows=[[]];let rw=0;tiles.forEach(t=>{if(rw+t.w>CW&&rows[rows.length-1].length){rows.push([]);rw=0}rows[rows.length-1].push(t);rw+=t.w+10});
    const th=74,wy=bot-rows.length*(th+10)-30;PT.fnt(x,21,700,FONT_R);PT.ltr(x);x.fillStyle=PINK2;x.fillText('Key words',X0,wy+18);
    rows.forEach((r,ri)=>{let X=X0;r.forEach(t=>{const ty=wy+30+ri*(th+10);PT.box(x,X,ty,t.w,th,14,'#fffaf0',ch.ink,2);PT.fnt(x,28,700,FONT_R);x.fillStyle=PINK;PT.ltr(x,'center');x.fillText(t.e,X+t.w/2,ty+34);PT.fnt(x,18,400);x.fillStyle=ch.ink;x.direction='rtl';x.textAlign='center';x.fillText(t.a,X+t.w/2,ty+62);X+=t.w+10})});bot=wy-12}
  const body=(L.body||[]).map(p=>({ex:p.startsWith('EX:'),t:p.replace(/^EX:/,'').replace(/ {2,}/g,'  ·  ')}));let sz=31;
  const fit=z=>body.reduce((a,p)=>{PT.fnt(x,z,p.ex?700:400,FONT_R);return a+PT.wrap(x,p.t,CW-(p.ex?64:30)).length*z*(p.ex?1.4:1.5)+(p.ex?24:10)},0);while(sz>21&&fit(sz)>bot-top)sz--;
  let yy=top+sz;body.forEach(p=>{if(p.ex){PT.fnt(x,sz,700,FONT_R);const ls=PT.wrap(x,p.t,CW-64);const bh=ls.length*sz*1.4+sz*.5;PT.box(x,X0+8,yy-sz*1.05,CW-16,bh,14,ch.tint);x.fillStyle=ch.ink;x.fillRect(X0+8,yy-sz*1.05+10,5,bh-20);PT.ltr(x);x.fillStyle=PINK;ls.forEach((l,i)=>x.fillText(l,X0+32,yy+i*sz*1.4));yy+=ls.length*sz*1.4+24;return}
    x.fillStyle=ch.ink;x.save();x.translate(X0+7,yy-sz*.33);x.rotate(Math.PI/4);x.fillRect(-5,-5,10,10);x.restore();const r=PT.en(x,p.t,X0+26,yy,CW-30,{sz,lh:1.5});yy=r.y+10});
  PT.pageNo(x,pageNo(ctx.s,'R'),ps);return meta;
}
function paintTry(x,ctx){
  const {sp,ps}=ctx,w=WB[sp.w],ch=CH[w.d],T=sp.c.try||{},PW=BK.PW,PH=BK.PH;PT.base(x,ps);const {X0,X1}=PT.lay(ps),CW=X1-X0;const meta={hits:[]};const bd=BookData();
  PT.fnt(x,52,800,FONT_D);PT.ltr(x);x.fillStyle=ch.ink;x.fillText('Try it!',X0,110);PT.fnt(x,24,700,FONT_R);x.fillStyle=PINK2;x.fillText(w.en,X0+190,104);
  const sc={cx:X1-50,cy:84,r:46};meta.sticker=sc;if(bd.stickers[sp.w])PT.sticker(x,sc.cx,sc.cy,sc.r);else{PT.dashCircle(x,sc.cx,sc.cy,sc.r,'rgba(163,105,11,.6)');PT.fnt(x,17,700,FONT_R);x.fillStyle='rgba(163,105,11,.9)';PT.ltr(x,'center');x.fillText('sticker',sc.cx,sc.cy+6)}
  x.globalAlpha=.85;x.fillStyle=ch.ink;x.fillRect(X0,132,CW-110,3);x.globalAlpha=1;
  let y=178;if(T.hint){const r=PT.en(x,T.hint,X0,y,CW,{sz:26,lh:1.38,col:PINK});y=r.y-6}if(T.ar){const r=PT.ar(x,T.ar,X0,X1,y+6,{sz:19});y=r.y}
  const kS=T.scale||.86,A0=Math.max(272,Math.round(y+6)),A1=988;
  PT.box(x,X0,A0,CW,A1-A0,26,ch.tint);x.globalAlpha=.7;PT.box(x,X0,A0,CW,A1-A0,26,null,ch.ink,3,[14,10]);x.globalAlpha=1;
  x.strokeStyle=PINK2;x.lineWidth=2;[[X0-14,A0],[X1+14,A0],[X0-14,A1],[X1+14,A1]].forEach(([cx,cy],i)=>{const sx=i%2?-1:1,sy=i>1?-1:1;x.beginPath();x.moveTo(cx,cy+sy*30);x.lineTo(cx,cy);x.lineTo(cx+sx*30,cy);x.stroke()});
  const a={cx:(X0+X1)/2,cy:(A0+A1)/2,w:CW,h:A1-A0,x0:X0,x1:X1,y0:A0,y1:A1};const ppu=PW/BK.W;a.s=ppu*kS;a.px=(lx,lz)=>[a.cx+lx*a.s,a.cy+lz*a.s];
  if(T.mat){x.save();try{T.mat(x,a,ch)}catch(e){console.error(e)}x.restore()}
  meta.area=a;
  meta.note={x0:X0,x1:X1,y0:998,y1:1100};PT.box(x,X0,998,CW,102,12,null,'rgba(107,88,71,.35)',2,[6,6]);
  meta.tray={x0:X0+16,x1:X1-16,y0:1126,y1:1310};PT.box(x,X0,1112,CW,212,22,'rgba(45,34,25,.08)','rgba(45,34,25,.25)',2);
  PT.pageNo(x,pageNo(ctx.s,'L'),ps);return meta;
}
function paintParents(x,ctx){
  const ps=ctx.ps,PW=BK.PW,PH=BK.PH;PT.base(x,ps);const {X0,X1}=PT.lay(ps),CW=X1-X0;const meta={hits:[]};
  PT.fnt(x,56,800,FONT_D);PT.ltr(x);x.fillStyle=PINK;x.fillText("Parents' corner",X0,150);PT.ar(x,'ركن الأهالي',X0,X1,146,{sz:26,col:'#c0336a'});PT.squiggle(x,X0,X0+330,172,'#c0336a',4);
  let y=236;const sec=(t,a)=>{PT.fnt(x,30,800,FONT_D);PT.ltr(x);x.fillStyle='#a3690b';x.fillText(t,X0,y);PT.ar(x,a,X0,X1,y,{sz:19,col:'#a3690b'});y+=42};
  const li=([e,a])=>{x.fillStyle='#c0336a';x.beginPath();x.arc(X0+8,y-9,6,0,7);x.fill();const r=PT.en(x,e,X0+26,y,CW-30,{sz:23,lh:1.4});const r2=PT.ar(x,a,X0+26,X1,r.y,{sz:18,lh:1.35});y=r2.y+10};
  sec('Key dates','مواعيد مهمة');BOOK_PARENTS().slice(0,4).forEach(li);y+=8;
  sec('PE kit (Tuesday & Friday)','زي الرياضة');[['Plain T-shirt in your house colour','تيشيرت بلون البيت'],['Plain navy shorts or joggers, school jumper, trainers','شورت كحلي وكنزة المدرسة وحذاء رياضي']].forEach(li);y+=8;
  sec('Reading at home','القراءة في البيت');[['Practice Book: listen and celebrate. If a word is too hard, read it for them.','كتاب التدريب: استمع واحتفل، واقرأ الكلمة الصعبة له.'],['Sharing Book: read it to them or together, talk about the pictures.','كتاب المشاركة: اقرأه له أو معه.']].forEach(li);
  const bw=(CW-20)/2,bh=96,by=PH-190;[[X0,'#6648c2','#fffaf0',"Parents' page →",'لوحة ولي الأمر',()=>App.go('parent')],[X0+bw+20,'#ffd166','#3a2600','✨ AI helper settings','إعدادات المساعد الذكي',()=>AISettings.gate()]].forEach(([bx,bg,fg,en,ar,fn])=>{PT.box(x,bx,by,bw,bh,22,bg,bg==='#ffd166'?'#a3690b':null,2);const fs=PT.fitFont(x,en,bw-36,27,800,FONT_D,18);PT.fnt(x,fs,800,FONT_D);PT.ltr(x,'center');x.fillStyle=fg;x.fillText(en,bx+bw/2,by+42);PT.ar(x,ar,bx+14,bx+bw-14,by+76,{sz:18,col:fg,align:'center'});meta.hits.push({x:bx,y:by,w:bw,h:bh,fn})});
  PT.pageNo(x,pageNo(ctx.s,'R'),ps);return meta;
}
function paintStamps(x,ctx){
  const PW=BK.PW,PH=BK.PH,ps=ctx.ps;endpaper(x);const PX=ps==='L'?60:110;panel(x,PX,50,PW-170,PH-100);const X0=PX+40,X1=PX+PW-170-40,CW=X1-X0;const bd=BookData();const meta={hits:[]};
  const nm=childName();PT.fnt(x,46,800,FONT_D);PT.ltr(x);x.fillStyle=PINK;x.fillText(nm?nm+"'s stamps":'My stamps & stickers',X0,130);
  const ws=SPREADS.filter(q=>q.w&&q.kind==='learn');const cnt=k=>ws.filter(q=>bd[k][q.w]).length;
  PT.fnt(x,22,400,FONT_R);x.fillStyle=PINK2;x.fillText(`${cnt('stamps')} stamps · ${cnt('stickers')} stickers · ${cnt('games')} practices · ${cnt('quiz')} quizzes · ${Store.s.stars} ★`,X0,170);
  const cw=CW/3,chh=94;ws.forEach((q,i)=>{const c=i%3,r=Math.floor(i/3);const X=X0+c*cw,Y=196+r*chh;const w=WB[q.w];const dn=worldDone(q.w);
    PT.box(x,X+6,Y,cw-12,chh-10,14,dn>=4?'#e2f5ea':dn?'#fff1dc':'rgba(255,255,255,.55)');PT.icon(x,w.icon,X+34,Y+32,30);PT.fnt(x,19,700,FONT_R);PT.ltr(x);x.fillStyle=PINK;let t=w.en;while(x.measureText(t).width>cw-70&&t.length>4)t=t.slice(0,-2)+'…';x.fillText(t,X+56,Y+38);
    const marks=[['stamps','🔖'],['stickers','⭐'],['games','✏️'],['quiz','🏆']];marks.forEach(([k,ic],j)=>{const mx=X+30+j*36,my=Y+66;if(bd[k][q.w])PT.icon(x,ic,mx,my,24);else{x.strokeStyle='rgba(107,88,71,.35)';x.lineWidth=2;x.beginPath();x.arc(mx,my,11,0,7);x.stroke()}});
    meta.hits.push({x:X+6,y:Y,w:cw-12,h:chh-10,fn:()=>Book.st&&Book.st.go(spreadOf(q.w),'R')})});
  const A0=196+7*chh+6,A1=1150;meta.area={cx:(X0+X1)/2,cy:(A0+A1)/2,w:CW,h:A1-A0};
  PT.fnt(x,22,700,FONT_R);PT.ltr(x);x.fillStyle=PINK2;x.fillText('Bonfire Night! Tap the bonfire for fireworks.',X0,A1-6);
  meta.tray={x0:X0+10,x1:X1-10,y0:1176,y1:1250};
  return meta;
}

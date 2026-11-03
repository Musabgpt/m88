/* ---------- page printer: every page of the book is drawn here ---------- */
function BookPaint(id,x,st){
  if(id==='C')return paintCover(x);
  if(id==='K')return paintBack(x);
  const side=id[0],s=+id.slice(1),sp=SPREADS[s-1];
  if(!sp){PT.base(x,side);return {}}
  if(sp.kind==='intro')return side==='R'?paintHowTo(x,s):paintContents(x,s,st);
  if(sp.kind==='end')return side==='R'?paintParents(x,s):paintStamps(x,s,sp);
  return side==='R'?paintLesson(x,s,sp):paintTry(x,s,sp);
}
function clothBg(x,c0,c1){const PW=BK.PW,PH=BK.PH;const g=x.createLinearGradient(0,0,PW,PH);g.addColorStop(0,c0);g.addColorStop(1,c1);x.fillStyle=g;x.fillRect(0,0,PW,PH);
  x.save();x.globalAlpha=.07;x.strokeStyle='#ffffff';x.lineWidth=1;for(let i=-PH;i<PW;i+=6){x.beginPath();x.moveTo(i,0);x.lineTo(i+PH,PH);x.stroke()}x.globalAlpha=.05;for(let i=0;i<PW+PH;i+=6){x.beginPath();x.moveTo(i,0);x.lineTo(i-PH,PH);x.stroke()}x.restore()}
function foil(x,y0,y1){const g=x.createLinearGradient(0,y0,0,y1);g.addColorStop(0,'#fff1b8');g.addColorStop(.45,'#ffd166');g.addColorStop(.55,'#e2a93b');g.addColorStop(1,'#ffe39a');return g}
function burst(x,cx,cy,r,col,n=16){x.save();x.strokeStyle=col;x.lineCap='round';for(let i=0;i<n;i++){const a=i/n*Math.PI*2;x.lineWidth=5;x.beginPath();x.moveTo(cx+Math.cos(a)*r*.25,cy+Math.sin(a)*r*.25);x.lineTo(cx+Math.cos(a)*r,cy+Math.sin(a)*r);x.stroke();x.beginPath();x.arc(cx+Math.cos(a)*r*1.12,cy+Math.sin(a)*r*1.12,4,0,7);x.fillStyle=col;x.fill()}x.restore()}
function paintCover(x){
  const PW=BK.PW,PH=BK.PH;clothBg(x,'#22306f','#111845');
  x.fillStyle='rgba(0,0,0,.22)';x.fillRect(PW-70,0,70,PH);x.fillStyle=foil(x,0,PH);x.fillRect(PW-74,0,4,PH);x.fillRect(PW-62,0,2,PH);
  x.strokeStyle=foil(x,0,PH);x.lineWidth=5;x.strokeRect(56,56,PW-200,PH-112);x.lineWidth=2;x.strokeRect(72,72,PW-232,PH-144);
  burst(x,250,250,120,'#ff7b39');burst(x,700,200,90,'#ffd166',14);burst(x,520,330,60,'#ff5d8f',12);burst(x,170,520,55,'#3ddbb0',12);burst(x,780,480,70,'#b29bff',14);
  for(let i=0;i<60;i++){x.fillStyle=`rgba(255,240,200,${rand(.25,.8)})`;x.beginPath();x.arc(rand(90,PW-170),rand(90,700),rand(1,3),0,7);x.fill()}
  const cx=(PW-74)/2;x.textAlign='center';x.direction='ltr';PT.fnt(x,124,800,FONT_D);x.fillStyle=foil(x,640,780);x.shadowColor='rgba(0,0,0,.45)';x.shadowBlur=14;x.fillText('BrightSteps',cx,770);x.shadowBlur=0;
  PT.fnt(x,60,800,FONT_D);x.fillStyle='#ff9150';x.fillText('3D BOOK',cx,850);
  x.direction='rtl';PT.fnt(x,64,800,FONT_D);x.fillStyle='#fff7e6';x.fillText('كتاب الفصل التفاعلي',cx,975);
  PT.fnt(x,42,700,FONT_R);x.direction='ltr';x.fillStyle='#ffd166';x.fillText('Year 2 · Autumn 2',cx,1052);
  x.strokeStyle='rgba(255,209,102,.55)';x.lineWidth=2;x.beginPath();x.moveTo(cx-220,1100);x.lineTo(cx+220,1100);x.stroke();
  x.direction='rtl';PT.fnt(x,30,400);x.fillStyle='#c9d0f3';x.fillText('21 عالماً · اقرأ · توقّع · جرّب',cx,1160);
  PT.fnt(x,28,600);x.fillStyle='#ffb04d';x.fillText('اضغط الغلاف أو اسحبه نحو اليمين لتفتح الكتاب',cx,1250);
  return {};
}
function paintBack(x){
  const PW=BK.PW,PH=BK.PH;clothBg(x,'#1a2560','#0f1640');x.fillStyle='rgba(0,0,0,.22)';x.fillRect(0,0,70,PH);x.fillStyle=foil(x,0,PH);x.fillRect(70,0,4,PH);
  x.strokeStyle=foil(x,0,PH);x.lineWidth=4;x.strokeRect(130,56,PW-186,PH-112);
  const cx=(PW+74)/2;x.textAlign='center';x.direction='rtl';PT.fnt(x,56,800,FONT_D);x.fillStyle='#fff7e6';x.fillText('كتاب تقرؤه… وتلمسه',cx,330);
  PT.fnt(x,32,400);x.fillStyle='#c9d0f3';['كل درس من كتيّب الفصل صار صفحتين:','صفحة تقرؤها، وصفحة يقفز منها نموذج','تسحبه وتضغطه وتجرّبه بيدك.'].forEach((l,i)=>x.fillText(l,cx,430+i*56));
  burst(x,cx,720,110,'#ffd166',18);burst(x,cx-230,640,50,'#ff7b39',12);burst(x,cx+230,660,60,'#3ddbb0',12);
  x.direction='ltr';PT.fnt(x,36,700,FONT_R);x.fillStyle='#ffd166';x.fillText('BrightSteps 3D · Year 2 · Autumn 2',cx,930);
  /* barcode, like every real book */
  x.fillStyle='#fffaf0';x.fillRect(PW-440,PH-330,300,190);x.fillStyle='#111';let X=PW-420;for(let i=0;i<46;i++){const w=[2,2,3,4,2,5][i%6];if(i%2===0)x.fillRect(X,PH-310,w,120);X+=w+2;if(X>PW-170)break}
  PT.fnt(x,22,700,FONT_R);x.fillText('978-2-0026-Y2-AUT2',PW-290,PH-160);
  return {};
}
function endpaper(x){const PW=BK.PW,PH=BK.PH;x.fillStyle='#efe3c6';x.fillRect(0,0,PW,PH);const cols=Object.values(CH_INK);
  for(let yy=40,r=0;yy<PH;yy+=86,r++)for(let xx=(r%2)*48+30;xx<PW;xx+=96){x.save();x.translate(xx,yy);x.rotate((r*7+xx)%5*.3);x.globalAlpha=.16;x.fillStyle=cols[(r+Math.floor(xx/96))%cols.length];x.beginPath();for(let k=0;k<10;k++){const a=-Math.PI/2+k*Math.PI/5,rr=k%2?7:16;x.lineTo(Math.cos(a)*rr,Math.sin(a)*rr)}x.closePath();x.fill();x.restore()}}
function panel(x,X,Y,W,H){x.save();x.shadowColor='rgba(70,45,15,.25)';x.shadowBlur=18;x.shadowOffsetY=6;x.fillStyle=PAPER;PT.rr(x,X,Y,W,H,26);x.fill();x.restore();x.strokeStyle='rgba(150,110,50,.35)';x.lineWidth=2;PT.rr(x,X+10,Y+10,W-20,H-20,20);x.stroke()}
function paintHowTo(x,s){
  const PW=BK.PW,PH=BK.PH;endpaper(x);panel(x,110,70,PW-180,PH-140);const X0=160,X1=PW-120,CW=X1-X0;
  PT.fnt(x,54,800,FONT_D);PT.rtl(x);x.fillStyle=PINK;x.fillText('كيف تقرأ هذا الكتاب',X1,170);PT.fnt(x,30,700,FONT_R);x.direction='ltr';x.fillStyle='#a3690b';x.fillText('How to use this book',X1,218);
  PT.squiggle(x,X1-300,X1,240,'#e5531a',4);
  let y=310;BOOK_HOWTO.forEach((t,i)=>{x.fillStyle='#ffd166';x.beginPath();x.arc(X1-24,y-11,24,0,7);x.fill();PT.fnt(x,28,800,FONT_D);x.fillStyle='#3a2600';x.textAlign='center';x.direction='ltr';x.fillText(String(i+1),X1-24,y-1);
    const r=PT.para(x,t,X1-62,y,CW-62,{sz:27,lh:1.5,col:PINK});y=r.y+20});
  y+=6;const bx=X0,bw=CW,by=y;const items=BOOK_WEEK();const bh=90+items.length*58;x.fillStyle='#fff5df';PT.rr(x,bx,by,bw,bh,20);x.fill();x.strokeStyle='#e5a93b';x.lineWidth=3;x.setLineDash([10,8]);PT.rr(x,bx,by,bw,bh,20);x.stroke();x.setLineDash([]);
  PT.fnt(x,34,800,FONT_D);PT.rtl(x);x.fillStyle='#a3690b';x.fillText('هذا الأسبوع',X1-24,by+56);PT.fnt(x,24,400);x.fillStyle=PINK2;PT.ltr(x);x.fillText(arDate(today()),bx+24,by+54);
  items.forEach(([ic,t,v],i)=>{const yy=by+110+i*58;PT.icon(x,ic,X1-44,yy-10,34);PT.fnt(x,26,400);PT.rtl(x);x.fillStyle=PINK;x.fillText(t,X1-80,yy);PT.fnt(x,27,800,FONT_D);x.fillStyle='#c04c17';x.direction=/[\u0600-\u06FF]/.test(v)?'rtl':'ltr';x.textAlign='left';x.fillText(v,bx+24,yy)});
  return {};
}
const BOOK_WEEK=()=>{const pe=nextDow([2,5]),fri=nextDow([5]),ws=daysTo(KEY_DATES.workshop),br=daysTo(KEY_DATES.bronze);return [['🏃','الرياضة PE — زي الرياضة',inDays(pe.n)],['📁','دليل الواجب إلى المدرسة (الجمعة)',inDays(fri.n)],['🧮','ورشة الرياضيات للأهالي',inDays(ws)],['📚','تحدّي القراءة البرونزي',Math.min(booksCount(),5)+' / 5']]};
function paintContents(x,s,st){
  const PW=BK.PW,PH=BK.PH;PT.base(x,'L');const meta={hits:[]};const X0=84,X1=PW-140;
  PT.fnt(x,62,800,FONT_D);PT.rtl(x);x.fillStyle=PINK;x.fillText('الفهرس',X1,140);PT.fnt(x,32,700,FONT_R);PT.ltr(x);x.fillStyle=PINK2;x.fillText('Contents',X0,136);x.fillStyle=PINK;x.fillRect(X0,160,X1-X0,3);
  const cols=[[X1,(X0+X1)/2+12],[(X0+X1)/2-12,X0]];const bd=BookData();
  DISTRICTS.forEach((d,ci)=>{});
  [[0,1,2],[3,4,5]].forEach((grp,col)=>{const [R,L]=cols[col];let y=228;grp.forEach(di=>{const d=DISTRICTS[di],ch=CH[d.id];
    x.fillStyle=ch.ink;x.beginPath();x.arc(R-12,y-10,10,0,7);x.fill();PT.fnt(x,22,600);PT.rtl(x);x.fillStyle=ch.ink;x.fillText('الفصل '+AR_ORD[di],R-32,y-2);PT.fnt(x,30,800,FONT_D);x.fillStyle=PINK;x.fillText(d.ar,R-32,y+34);y+=78;
    SPREADS.forEach((sp,i)=>{if(!sp.w||WB[sp.w].d!==d.id)return;const w=WB[sp.w];const sn=i+1;PT.icon(x,w.icon,R-20,y-9,30);PT.fnt(x,26,400);PT.rtl(x);x.fillStyle=PINK;let t=w.ar;while(x.measureText(t).width>(R-L)-120&&t.length>4)t=t.slice(0,-2)+'…';x.fillText(t,R-46,y);const tw=x.measureText(t).width;
      PT.fnt(x,24,700,FONT_D);PT.ltr(x);x.fillStyle=ch.ink;const pn=String(pageNo(sn,'R'));x.fillText(pn,L,y);const pnw=x.measureText(pn).width;x.fillStyle='rgba(107,88,71,.55)';for(let X=L+pnw+10;X<R-50-tw-8;X+=12)x.fillRect(X,y-6,3,3);
      if(bd.stamps[sp.w]){x.fillStyle='#c8402a';x.beginPath();x.arc(L+pnw+20,y-24,5,0,7);x.fill()}
      meta.hits.push({x:L-6,y:y-38,w:R-L+12,h:50,fn:()=>Book.st&&Book.st.go(sn)});y+=52});y+=18})});
  const btn=(X,Y,W2,txt,ic,fn,col)=>{x.fillStyle=col;PT.rr(x,X,Y,W2,76,20);x.fill();PT.icon(x,ic,X+W2-42,Y+38,32);PT.fnt(x,27,800,FONT_D);PT.rtl(x);x.fillStyle='#fffaf0';x.fillText(txt,X+W2-72,Y+48);meta.hits.push({x:X,y:Y,w:W2,h:76,fn})};
  btn((X0+X1)/2+10,1176,(X1-X0)/2-10,'الجزيرة ثلاثية الأبعاد','🏝️',()=>App.go('island'),'#2f6fb3');btn(X0,1176,(X1-X0)/2-10,'لوحة ولي الأمر','👪',()=>App.go('parent'),'#6648c2');
  PT.pageNo(x,pageNo(s,'L'),'L');return meta;
}
function paintLesson(x,s,sp){
  const w=WB[sp.w],ch=CH[w.d],PW=BK.PW,PH=BK.PH;PT.base(x,'R');const X0=140,X1=PW-84,CW=X1-X0;const meta={hits:[]};const bd=BookData();
  PT.fnt(x,25,600);PT.rtl(x);x.fillStyle=ch.ink;x.fillText('الفصل '+AR_ORD[ch.n-1]+' · '+ch.ar,X1,92);PT.fnt(x,23,700,FONT_R);PT.ltr(x);x.fillText(ch.en.toUpperCase(),X0,92);
  x.globalAlpha=.85;x.fillRect(X0,108,CW,3);x.globalAlpha=1;
  x.fillStyle=ch.tint;x.beginPath();x.arc(X0+52,182,48,0,7);x.fill();PT.icon(x,w.icon,X0+52,182,58);
  let y=196;PT.fnt(x,60,800,FONT_D);PT.rtl(x);x.fillStyle=PINK;const tl=PT.wrap(x,w.ar,CW-130);tl.forEach((l,i)=>x.fillText(l,X1,y+i*70));y+=(tl.length-1)*70;
  y+=50;PT.fnt(x,34,700,FONT_R);x.fillStyle=ch.ink;x.direction='ltr';x.textAlign='right';x.fillText(w.en,X1,y);y+=22;PT.squiggle(x,X1-230,X1,y,ch.ink,4);const top=y+30;
  /* bottom-up: home tip, flap box, key words */
  let bot=PH-100;
  if(sp.home){PT.fnt(x,24,400);const hl=PT.wrap(x,sp.home,CW-48);const hh=64+hl.length*36;const hy=bot-hh;x.fillStyle=ch.tint;PT.rr(x,X0,hy,CW,hh,18);x.fill();
    PT.icon(x,'🏠',X1-34,hy+32,28);PT.fnt(x,25,800,FONT_D);PT.rtl(x);x.fillStyle=ch.ink;x.fillText('في البيت',X1-60,hy+42);PT.fnt(x,24,400);x.fillStyle=PINK;hl.forEach((l,i)=>x.fillText(l,X1-24,hy+80+i*36));bot=hy-22}
  if(sp.flap){PT.fnt(x,28,400);const ql=PT.wrap(x,sp.flap.q,CW-170);PT.fnt(x,26,600);const al=PT.wrap(x,sp.flap.a,CW-200);const ah=Math.max(128,34+al.length*40);
    const fh=72+ql.length*42+16+ah+18;const fy=bot-fh;x.fillStyle='#fff6e2';PT.rr(x,X0,fy,CW,fh,20);x.fill();x.strokeStyle=ch.ink;x.lineWidth=3;x.setLineDash([12,9]);PT.rr(x,X0,fy,CW,fh,20);x.stroke();x.setLineDash([]);
    PT.icon(x,'👀',X1-34,fy+40,30);PT.fnt(x,28,800,FONT_D);PT.rtl(x);x.fillStyle=ch.ink;x.fillText('توقّع ثم اكشف',X1-62,fy+50);
    PT.fnt(x,28,400);x.fillStyle=PINK;ql.forEach((l,i)=>x.fillText(l,X1-24,fy+96+i*42));
    const ay=fy+72+ql.length*42+16;x.fillStyle='#e6f5ee';PT.rr(x,X0+16,ay,CW-32,ah,14);x.fill();PT.fnt(x,26,600);x.fillStyle='#14614f';al.forEach((l,i)=>x.fillText(l,X1-30,ay+(ah-al.length*40)/2+30+i*40));
    meta.flap={x:X0+16,y:ay,w:CW-32,h:ah};const sc={cx:X0+90,cy:ay+ah/2,r:52};meta.stamp=sc;
    if(bd.stamps[sp.w])PT.stampMark(x,sc.cx,sc.cy,sc.r,'#c8402a',w.icon);else{PT.dashCircle(x,sc.cx,sc.cy,sc.r,'rgba(200,64,42,.55)');PT.fnt(x,20,700);x.fillStyle='rgba(200,64,42,.7)';x.textAlign='center';x.direction='rtl';x.fillText('مكان الختم',sc.cx,sc.cy+7)}
    bot=fy-22}
  if(sp.words&&sp.words.length){const tiles=sp.words.map(([e,a])=>{PT.fnt(x,30,700,FONT_R);const w1=x.measureText(e).width;PT.fnt(x,21,400);const w2=x.measureText(a).width;return {e,a,w:Math.max(w1,w2)+34}});
    const rows=[[]];let rw=0;tiles.forEach(t=>{if(rw+t.w>CW&&rows[rows.length-1].length){rows.push([]);rw=0}rows[rows.length-1].push(t);rw+=t.w+12});
    const th=82,wy=bot-rows.length*(th+12)-36;PT.fnt(x,23,700);PT.rtl(x);x.fillStyle=PINK2;x.fillText('كلمات مهمة · Key words',X1,wy+20);
    rows.forEach((r,ri)=>{let X=X1;r.forEach(t=>{const ty=wy+36+ri*(th+12);x.fillStyle='#fffaf0';PT.rr(x,X-t.w,ty,t.w,th,14);x.fill();x.strokeStyle=ch.ink;x.lineWidth=2;PT.rr(x,X-t.w,ty,t.w,th,14);x.stroke();
      PT.fnt(x,30,700,FONT_R);x.fillStyle=PINK;x.textAlign='center';x.direction='ltr';x.fillText(t.e,X-t.w/2,ty+38);PT.fnt(x,21,400);x.fillStyle=ch.ink;x.direction='rtl';x.fillText(t.a,X-t.w/2,ty+68);X-=t.w+12})});bot=wy-14}
  /* body text: the largest size that fits between the title and the boxes */
  const body=(sp.body||[]).map(p=>({en:p.startsWith('EN:'),t:p.replace(/^EN:/,'')}));let sz=31;
  const fit=z=>body.reduce((a,p)=>{PT.fnt(x,z,p.en?700:400,p.en?FONT_R:FONT_B);return a+PT.wrap(x,p.t,CW-(p.en?70:30)).length*z*(p.en?1.45:1.58)+(p.en?26:12)},0);while(sz>22&&fit(sz)>bot-top)sz--;
  let yy=top+sz;body.forEach(p=>{if(p.en){PT.fnt(x,sz,700,FONT_R);const ls=PT.wrap(x,p.t,CW-70);const bh=ls.length*sz*1.45+sz*.5;x.fillStyle=ch.tint;PT.rr(x,X0+10,yy-sz*1.05,CW-38,bh,14);x.fill();x.fillStyle=ch.ink;x.fillRect(X0+10,yy-sz*1.05+10,5,bh-20);PT.ltr(x);x.fillStyle=PINK;ls.forEach((l,i)=>x.fillText(l,X0+34,yy+i*sz*1.45));yy+=ls.length*sz*1.45+26;return}
    x.fillStyle=ch.ink;x.save();x.translate(X1-8,yy-sz*.33);x.rotate(Math.PI/4);x.fillRect(-5,-5,10,10);x.restore();const r=PT.para(x,p.t,X1-28,yy,CW-30,{sz,lh:1.58,col:PINK});yy=r.y+12});
  PT.pageNo(x,pageNo(s,'R'),'R');return meta;
}
function paintTry(x,s,sp){
  const w=WB[sp.w],ch=CH[w.d],PW=BK.PW,PH=BK.PH;PT.base(x,'L');const X0=84,X1=PW-140,CW=X1-X0;const meta={hits:[]};const bd=BookData();
  PT.fnt(x,50,800,FONT_D);PT.rtl(x);x.fillStyle=ch.ink;x.fillText('جرّب بنفسك',X1,112);PT.fnt(x,28,700,FONT_R);PT.ltr(x);x.fillText('Try it yourself',X0,106);x.globalAlpha=.85;x.fillRect(X0,132,CW,3);x.globalAlpha=1;
  if(sp.hint)PT.para(x,sp.hint,X1,186,CW,{sz:28,col:PINK2,lh:1.48});
  const A0=sp.areaTop||300,A1=1150;x.fillStyle=ch.tint;x.globalAlpha=.7;PT.rr(x,X0,A0,CW,A1-A0,26);x.fill();x.globalAlpha=1;x.strokeStyle=ch.ink;x.globalAlpha=.35;x.lineWidth=3;x.setLineDash([14,10]);PT.rr(x,X0,A0,CW,A1-A0,26);x.stroke();x.setLineDash([]);x.globalAlpha=1;
  x.strokeStyle=PINK2;x.lineWidth=2;[[X0-14,A0],[X1+14,A0],[X0-14,A1],[X1+14,A1]].forEach(([cx,cy],i)=>{const sx=i%2?-1:1,sy=i>1?-1:1;x.beginPath();x.moveTo(cx,cy+sy*30);x.lineTo(cx,cy);x.lineTo(cx+sx*30,cy);x.stroke()});
  const a={cx:(X0+X1)/2,cy:(A0+A1)/2,w:CW,h:A1-A0,x0:X0,x1:X1,y0:A0,y1:A1};const ppu=PW/BK.W;a.s=ppu;a.px=(lx,lz)=>[a.cx+lx*ppu,a.cy+lz*ppu];
  if(sp.mat){x.save();try{sp.mat(x,a,ch)}catch(e){console.error(e)}x.restore()}
  meta.area=a;
  const bw=470,bh=84,bx=X1-bw,by=1188;x.fillStyle=ch.ink;PT.rr(x,bx,by,bw,bh,22);x.fill();PT.fnt(x,32,800,FONT_D);PT.rtl(x);x.fillStyle='#fffaf0';x.fillText('ادخل العالم الكامل ←',X1-30,by+54);meta.hits.push({x:bx,y:by,w:bw,h:bh,fn:()=>App.go('w-'+w.id)});
  const sc={cx:X0+74,cy:by+42,r:56};meta.sticker=sc;if(bd.stickers[sp.w]){PT.sticker(x,sc.cx,sc.cy,sc.r);PT.fnt(x,22,700);PT.ltr(x);x.fillStyle=PINK2;x.fillText('تجربة مكتملة',sc.cx+70,sc.cy+8)}else{PT.dashCircle(x,sc.cx,sc.cy,sc.r,'rgba(163,105,11,.6)');PT.fnt(x,19,700);x.fillStyle='rgba(163,105,11,.85)';x.textAlign='center';x.direction='rtl';x.fillText('ملصق',sc.cx,sc.cy+7)}
  PT.pageNo(x,pageNo(s,'L'),'L');return meta;
}
function paintParents(x,s){
  const PW=BK.PW,PH=BK.PH;PT.base(x,'R');const X0=140,X1=PW-84,CW=X1-X0;const meta={hits:[]};
  PT.fnt(x,58,800,FONT_D);PT.rtl(x);x.fillStyle=PINK;x.fillText('ركن الأهالي',X1,150);PT.fnt(x,32,700,FONT_R);x.direction='ltr';x.textAlign='right';x.fillStyle='#c0336a';x.fillText("Parents' corner",X1,200);PT.squiggle(x,X1-240,X1,222,'#c0336a',4);
  let y=290;const sec=(t)=>{PT.fnt(x,32,800,FONT_D);PT.rtl(x);x.fillStyle='#a3690b';x.fillText(t,X1,y);y+=48};
  const li=(t)=>{x.fillStyle='#c0336a';x.beginPath();x.arc(X1-8,y-9,6,0,7);x.fill();const r=PT.para(x,t,X1-26,y,CW-30,{sz:25,lh:1.5,col:PINK});y=r.y+8};
  sec('مواعيد مهمة');BOOK_PARENTS().slice(0,4).forEach(li);y+=14;
  sec('زي الرياضة (الثلاثاء والجمعة)');['تيشيرت سادة بلون "البيت" (house colour)','شورت أو بنطال رياضي كحلي سادة، وكنزة الزي المدرسي، وحذاء رياضي'].forEach(li);y+=14;
  sec('القراءة في البيت');['كتاب التدريب: استمع واحتفل. إن تعثّر في كلمة فاقرأها له.','كتاب المشاركة: اقرأه له أو معه، وناقشا الصور وتوقّعا الأحداث.','بعد القراءة تحدّثا عن الكتاب: من؟ أين؟ لماذا؟'].forEach(li);
  const bw=520,bh=84,bx=X1-bw,by=1190;x.fillStyle='#6648c2';PT.rr(x,bx,by,bw,bh,22);x.fill();PT.fnt(x,31,800,FONT_D);PT.rtl(x);x.fillStyle='#fffaf0';x.fillText('افتح لوحة ولي الأمر ←',X1-30,by+54);meta.hits.push({x:bx,y:by,w:bw,h:bh,fn:()=>App.go('parent')});
  PT.pageNo(x,pageNo(s,'R'),'R');return meta;
}
function paintStamps(x,s,sp){
  const PW=BK.PW,PH=BK.PH;endpaper(x);panel(x,70,60,PW-170,PH-120);const X0=110,X1=PW-140,CW=X1-X0;const bd=BookData();const meta={hits:[]};
  PT.fnt(x,52,800,FONT_D);PT.rtl(x);x.fillStyle=PINK;x.fillText('أختامي وملصقاتي',X1,150);
  const ns=Object.keys(bd.stamps).filter(k=>WB[k]).length,nk=Object.keys(bd.stickers).filter(k=>WB[k]).length;PT.fnt(x,28,400);x.fillStyle=PINK2;x.fillText(`${ns} ختماً · ${nk} ملصقاً · ${Store.s.stars} نجمة`,X1,200);
  const ws=SPREADS.filter(q=>q.w);const cw=CW/3,chh=104;ws.forEach((q,i)=>{const c=i%3,r=Math.floor(i/3);const X=X1-c*cw,Y=240+r*chh;const w=WB[q.w],ch=CH[w.d];
    x.fillStyle=bd.stamps[q.w]?'#fff1dc':'rgba(255,255,255,.55)';PT.rr(x,X-cw+8,Y,cw-16,chh-12,16);x.fill();PT.icon(x,w.icon,X-36,Y+38,34);PT.fnt(x,20,600);PT.rtl(x);x.fillStyle=PINK;let t=w.ar;while(x.measureText(t).width>cw-90&&t.length>4)t=t.slice(0,-2)+'…';x.fillText(t,X-62,Y+46);
    if(bd.stamps[q.w])PT.stampMark(x,X-cw+50,Y+46,30,'#c8402a',w.icon);else PT.dashCircle(x,X-cw+50,Y+46,26,'rgba(200,64,42,.4)');
    if(bd.stickers[q.w])PT.sticker(x,X-cw+104,Y+46,20);
    meta.hits.push({x:X-cw+8,y:Y,w:cw-16,h:chh-12,fn:()=>Book.st&&Book.st.go(i+2)})});
  const A0=240+7*chh+10,A1=PH-110;const a={cx:(X0+X1)/2,cy:(A0+A1)/2,w:CW,h:A1-A0};meta.area=a;
  PT.fnt(x,24,600);PT.rtl(x);x.fillStyle=PINK2;x.fillText('نار المخيّم — اضغطها لألعاب نارية',X1,A1-8);
  return meta;
}

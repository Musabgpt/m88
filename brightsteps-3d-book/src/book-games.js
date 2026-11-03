/* ---------- games printed on the page: sort · pick · order · fill · match, a quiz and home learning ---------- */
const GS={},GQ={};
const Games={
  init(g){const t=g.type;
    if(t==='sort')return {placed:{},sel:null,bad:null,msg:''};
    if(t==='pick')return {got:new Set(),bad:null,msg:''};
    if(t==='order')return {n:0,seq:shuffle(g.items.map((_,i)=>i)),bad:null,msg:''};
    if(t==='fill'){const rounds=(g.gen?g.gen():g.rounds.slice()).map(q=>Object.assign({},q,{opts:shuffle(q.o.map((t2,j)=>({t:t2,ok:j===0})))}));return {r:0,rounds,bad:null,ok:false,msg:''}}
    if(t==='match')return {sel:null,done:new Set(),right:shuffle(g.pairs.map((_,i)=>i)),bad:null,msg:''};
    return {}},
  /* a printed tile; state: '' | 'sel' | 'ok' | 'bad' | 'off' */
  tile(x,r,txt,ch,state,o={}){const fill={sel:'#ffe39a',ok:'#d6f3e6',bad:'#fbd3de',off:'#efe7d6'}[state]||'#fffaf0',bord={sel:'#c98a00',ok:'#16866b',bad:'#c0336a',off:'rgba(107,88,71,.3)'}[state]||ch.ink;
    x.save();x.shadowColor='rgba(70,45,15,.18)';x.shadowBlur=state==='off'?0:8;x.shadowOffsetY=3;PT.box(x,r.x,r.y,r.w,r.h,16,fill);x.restore();PT.box(x,r.x,r.y,r.w,r.h,16,null,bord,state==='sel'?5:3);
    let ty=r.y+r.h/2;if(o.icon){PT.icon(x,o.icon,r.x+r.w/2,r.y+r.h*.38,Math.min(r.h*.42,64));ty=r.y+r.h*.8}else if(o.draw){o.draw(x,r.x+r.w/2,r.y+r.h*.4,Math.min(r.w,r.h)*.55);ty=r.y+r.h*.84}
    x.fillStyle=state==='off'?'rgba(45,34,25,.45)':PINK;const sz=PT.fitFont(x,txt,r.w-24,o.sz||30,700,FONT_R,15);const ls=(o.icon||o.draw)?[txt]:PT.wrap(x,txt,r.w-28);
    PT.ltr(x,'center');x.textBaseline='middle';ls.slice(0,3).forEach((l,i)=>x.fillText(l,r.x+r.w/2,ty+(i-(Math.min(3,ls.length)-1)/2)*sz*1.2));x.textBaseline='alphabetic';
    if(state==='ok')PT.tick(x,r.x+r.w-22,r.y+20,26);if(state==='bad')PT.cross(x,r.x+r.w-22,r.y+20,24)},
  /* lay tiles out in centred rows */
  flow(x,items,X0,X1,y0,o={}){const h=o.h||76,gap=o.gap||14,pad=o.pad||28;const rows=[[]];let rw=0;
    items.forEach((it,i)=>{PT.fnt(x,o.sz||30,700,FONT_R);const w=o.w||Math.min(X1-X0,Math.max(o.minW||0,x.measureText(it).width+pad*2));if(rw+w>X1-X0&&rows[rows.length-1].length){rows.push([]);rw=0}rows[rows.length-1].push({i,w});rw+=w+gap});
    const rects=[];rows.forEach((r,ri)=>{const tw=r.reduce((a,c)=>a+c.w,0)+(r.length-1)*gap;let X=(X0+X1)/2-tw/2;r.forEach(c=>{rects[c.i]={x:X,y:y0+ri*(h+gap),w:c.w,h};X+=c.w+gap})});return {rects,bottom:y0+rows.length*(h+gap)-gap}},
  flash(s,key,v,ctx,ms=650){s[key]=v;ctx.refresh();setTimeout(()=>{if(s[key]===v){s[key]=null;ctx.refresh()}},ms)},
  win(wid,ctx,cx,cy){const bd=BookData();Snd.good();ctx.burst(cx,cy);if(!bd.games[wid]){bd.games[wid]=1;Store.save();award(wid,'practise',2,'Practice complete!')}},
  banner(x,X0,X1,y,txt,col){if(!txt)return;PT.fnt(x,26,800,FONT_D);PT.ltr(x,'center');x.fillStyle=col||'#16866b';x.fillText(txt,(X0+X1)/2,y)},
  again(x,meta,X0,X1,y,ctx,reset){const w=300,h=70,X=(X0+X1)/2-w/2;PT.box(x,X,y,w,h,20,'#ffd166','#a3690b',3);PT.fnt(x,28,800,FONT_D);PT.ltr(x,'center');x.fillStyle='#3a2600';x.fillText('Play again ↺',X+w/2,y+46);meta.hits.push({x:X,y,w,h,fn:()=>{reset();ctx.refresh()}})},
  draw(x,A,g,s,meta,ctx,ch){const {X0,X1,Y0,Y1}=A,wid=ctx.sp.w,reset=()=>{GS[wid]=Games.init(g)};const T=g.type;
    if(T==='sort'){const bins=g.bins,nb=bins.length,gap=16,bw=(X1-X0-(nb-1)*gap)/nb,bh=Math.min(250,(Y1-Y0)*.45),by=Y1-bh;const items=g.items;
      const left=items.map((it,i)=>i).filter(i=>s.placed[i]==null);const done=!left.length;
      Games.banner(x,X0,X1,Y0+24,s.msg,s.bad!=null?'#c0336a':'#16866b');
      if(!done){const L=Games.flow(x,left.map(i=>items[i][0]),X0,X1,Y0+44,{h:70,sz:28});left.forEach((i,k)=>{const r=L.rects[k];Games.tile(x,r,items[i][0],ch,s.sel===i?'sel':s.bad===i?'bad':'',{sz:28});
        meta.hits.push({x:r.x,y:r.y,w:r.w,h:r.h,fn:()=>{s.sel=i;s.msg='Now tap its box ↓';if(g.say!==false)Voice.say(items[i][0]);ctx.refresh()}})})}
      else{Games.banner(x,X0,X1,Y0+90,'All sorted! ✓','#16866b');Games.again(x,meta,X0,X1,Y0+120,ctx,reset)}
      bins.forEach((b,j)=>{const X=X0+j*(bw+gap);PT.box(x,X,by,bw,bh,20,ch.tint,ch.ink,3,[12,8]);if(b[2])PT.icon(x,b[2],X+34,by+36,30);PT.fnt(x,PT.fitFont(x,b[0],bw-(b[2]?80:30),30,800,FONT_D),800,FONT_D);PT.ltr(x,b[2]?'left':'center');x.fillStyle=ch.ink;x.fillText(b[0],b[2]?X+62:X+bw/2,by+46);
        if(b[1])PT.ar(x,b[1],X+10,X+bw-12,by+74,{sz:17,col:ch.ink});
        const inn=items.map((it,i)=>i).filter(i=>s.placed[i]===j);let yy=by+(b[1]?106:84),xx=X+14;PT.fnt(x,22,700,FONT_R);inn.forEach(i=>{const t=items[i][0];const tw=x.measureText(t).width+24;if(xx+tw>X+bw-10){xx=X+14;yy+=40}PT.box(x,xx,yy-26,tw,34,10,'#ffffff','#16866b',2);x.fillStyle=PINK;PT.ltr(x);x.fillText(t,xx+12,yy-2);xx+=tw+8});
        meta.hits.push({x:X,y:by,w:bw,h:bh,fn:()=>{if(s.sel==null){s.msg='First tap a word, then its box.';ctx.refresh();return}const i=s.sel;const want=items[i][1];const key=typeof want==='number'?j:bins[j][0];
          if(want===key||want===j){s.placed[i]=j;s.sel=null;s.msg=pick(['Yes! ✓','Great sorting! ✓','Correct! ✓']);Snd.tone(880,.12,{type:'triangle',vol:.12});if(items.every((it,q)=>s.placed[q]!=null))Games.win(wid,ctx,(X0+X1)/2,by);ctx.refresh()}
          else{Snd.bad();s.msg='Not that box. Try another one!';Games.flash(s,'bad',i,ctx)}}})});return}
    if(T==='pick'){const items=g.items,need=items.filter(it=>it[1]).length;const got=s.got.size;
      PT.fnt(x,24,700,FONT_R);PT.ltr(x);x.fillStyle=PINK2;x.fillText(`Found ${got} of ${need}`,X0,Y0+26);Games.banner(x,X0,X1,Y0+26,s.msg,s.bad!=null?'#c0336a':'#16866b');
      const big=!!g.big;const L=big?Games.grid(items.length,X0,X1,Y0+50,Y1-(got===need?100:0),g.cols||4):Games.flow(x,items.map(it=>it[0]),X0,X1,Y0+50,{h:76,sz:28});
      items.forEach((it,i)=>{const r=L.rects[i];const st2=s.got.has(i)?'ok':s.bad===i?'bad':'';Games.tile(x,r,it[0],ch,st2,{sz:big?24:28,icon:it[2],draw:it[3]});
        if(!s.got.has(i)&&got<need)meta.hits.push({x:r.x,y:r.y,w:r.w,h:r.h,fn:()=>{if(it[1]){s.got.add(i);s.msg=pick(['Yes! ✓','Well spotted! ✓','Correct! ✓']);Snd.tone(880,.12,{type:'triangle',vol:.12});if(g.say!==false)Voice.say(stripTags(it[0]));if(s.got.size===need)Games.win(wid,ctx,(X0+X1)/2,(Y0+Y1)/2);ctx.refresh()}else{Snd.bad();s.msg=g.no||'Not that one. Look again!';Games.flash(s,'bad',i,ctx)}}})});
      if(got===need){Games.banner(x,X0,X1,Y1-58,'All found! ✓','#16866b');Games.again(x,meta,X0,X1,Y1-40,ctx,reset)}return}
    if(T==='order'){const items=g.items,n=items.length;const done=s.n>=n;Games.banner(x,X0,X1,Y0+26,done?'In order! ✓':s.msg||`Tap step ${s.n+1}`,s.bad!=null?'#c0336a':done?'#16866b':ch.ink);
      const avail=Y1-(Y0+50)-(done?92:0),th=Math.min(96,(avail-(n-1)*12)/n);
      s.seq.forEach((i,k)=>{const r={x:X0+70,y:Y0+50+k*(th+12),w:X1-X0-70,h:th};const pos=i<s.n?i+1:0;Games.tile(x,r,items[i],ch,pos?'ok':s.bad===i?'bad':'',{sz:Math.min(27,th*.34)});
        x.fillStyle=pos?'#16866b':'rgba(107,88,71,.25)';x.beginPath();x.arc(X0+30,r.y+r.h/2,26,0,7);x.fill();if(pos){PT.fnt(x,28,800,FONT_D);PT.ltr(x,'center');x.fillStyle='#fff';x.fillText(String(pos),X0+30,r.y+r.h/2+10)}
        if(!pos&&!done)meta.hits.push({x:r.x,y:r.y,w:r.w,h:r.h,fn:()=>{if(i===s.n){s.n++;s.msg='';Snd.tone(660+s.n*60,.14,{type:'triangle',vol:.12});if(s.n>=n)Games.win(wid,ctx,(X0+X1)/2,(Y0+Y1)/2);ctx.refresh()}else{Snd.bad();s.msg='Not yet. Which comes next?';Games.flash(s,'bad',i,ctx)}}})});
      if(done)Games.again(x,meta,X0,X1,Y1-76,ctx,reset);return}
    if(T==='fill'){const R=s.rounds.length;if(s.r>=R){Games.banner(x,X0,X1,Y0+120,'All done! ✓','#16866b');PT.fnt(x,26,400,FONT_R);PT.ltr(x,'center');x.fillStyle=PINK2;x.fillText(`${R} out of ${R}`,(X0+X1)/2,Y0+170);Games.again(x,meta,X0,X1,Y0+210,ctx,reset);return}
      const q=s.rounds[s.r];PT.fnt(x,22,700,FONT_R);PT.ltr(x);x.fillStyle=PINK2;x.fillText(`Question ${s.r+1} of ${R}`,X0,Y0+24);Games.banner(x,X0,X1,Y0+24,s.msg,s.bad!=null?'#c0336a':'#16866b');
      const ph=Math.min(250,(Y1-Y0)*.5);const pr={x:X0,y:Y0+44,w:X1-X0,h:ph};PT.box(x,pr.x,pr.y,pr.w,pr.h,22,'#fff6e2',ch.ink,3);
      if(q.draw)q.draw(x,pr);else{PT.fnt(x,40,700,FONT_R);let sz=40;let ls=PT.wrap(x,q.q,pr.w-60);while(ls.length>3&&sz>26){sz-=2;PT.fnt(x,sz,700,FONT_R);ls=PT.wrap(x,q.q,pr.w-60)}PT.ltr(x,'center');x.fillStyle=PINK;ls.forEach((l,i)=>x.fillText(l,pr.x+pr.w/2,pr.y+pr.h/2+(i-(ls.length-1)/2)*sz*1.3+sz*.35))}
      if(q.ar)PT.ar(x,q.ar,X0,X1-14,pr.y+pr.h-14,{sz:17});
      const n=q.opts.length,gap=16,ow=(X1-X0-(n-1)*gap)/n,oy=pr.y+pr.h+28,oh=104;
      q.opts.forEach((op,j)=>{const r={x:X0+j*(ow+gap),y:oy,w:ow,h:oh};const st2=s.ok&&op.ok?'ok':s.bad===j?'bad':s.ok?'off':'';Games.tile(x,r,op.t,ch,st2,{sz:34});
        if(!s.ok)meta.hits.push({x:r.x,y:r.y,w:r.w,h:r.h,fn:()=>{if(op.ok){s.ok=true;s.msg=pick(['Yes! ✓','Correct! ✓','Brilliant! ✓']);Snd.good();ctx.refresh();setTimeout(()=>{s.r++;s.ok=false;s.msg='';if(s.r>=R)Games.win(wid,ctx,(X0+X1)/2,(Y0+Y1)/2);ctx.refresh()},900)}else{Snd.bad();s.msg='Try again!';Games.flash(s,'bad',j,ctx)}}})});return}
    if(T==='match'){const P=g.pairs,n=P.length,colW=(X1-X0-40)/2,th=Math.min(92,(Y1-Y0-60-(n-1)*12)/n);const done=s.done.size>=n;const cols=['#d6f3e6','#e2edfa','#fbefd2','#fadfe9','#e9e3fb','#fce0cf'];
      Games.banner(x,X0,X1,Y0+26,done?'All matched! ✓':s.msg||'Tap a word on the left, then its partner',s.bad!=null?'#c0336a':done?'#16866b':ch.ink);
      P.forEach((p,i)=>{const r={x:X0,y:Y0+50+i*(th+12),w:colW,h:th};const ok=s.done.has(i);Games.tile(x,r,String(p[0]),ch,ok?'ok':s.sel===i?'sel':'',{sz:28});
        if(!ok&&!done)meta.hits.push({x:r.x,y:r.y,w:r.w,h:r.h,fn:()=>{s.sel=i;s.msg='Now tap its partner →';if(g.say!==false)Voice.say(String(p[0]));ctx.refresh()}})});
      s.right.forEach((i,k)=>{const r={x:X0+colW+40,y:Y0+50+k*(th+12),w:colW,h:th};const ok=s.done.has(i);Games.tile(x,r,String(P[i][1]),ch,ok?'ok':s.bad===i?'bad':'',{sz:26});
        if(ok){x.strokeStyle='rgba(22,134,107,.5)';x.lineWidth=4;x.setLineDash([8,8]);x.beginPath();x.moveTo(X0+colW,Y0+50+i*(th+12)+th/2);x.lineTo(r.x,r.y+th/2);x.stroke();x.setLineDash([])}
        if(!ok&&!done)meta.hits.push({x:r.x,y:r.y,w:r.w,h:r.h,fn:()=>{if(s.sel==null){s.msg='First tap a word on the left.';ctx.refresh();return}if(s.sel===i){s.done.add(i);s.sel=null;s.msg=pick(['A match! ✓','Yes! ✓']);Snd.tone(880,.12,{type:'triangle',vol:.12});if(s.done.size>=n)Games.win(wid,ctx,(X0+X1)/2,(Y0+Y1)/2);ctx.refresh()}else{Snd.bad();s.msg='Not a pair. Try again!';Games.flash(s,'bad',i,ctx)}}})});
      if(done)Games.again(x,meta,X0,X1,Y1-76,ctx,reset);return}},
  grid(n,X0,X1,Y0,Y1,cols){const rows=Math.ceil(n/cols),gap=14,w=(X1-X0-(cols-1)*gap)/cols,h=Math.min(w*.92,(Y1-Y0-(rows-1)*gap)/rows);const rects=[];for(let i=0;i<n;i++){const r=Math.floor(i/cols),c=i%cols;rects.push({x:X0+c*(w+gap),y:Y0+r*(h+gap),w,h})}return {rects}},
  /* ---------- the practise page ---------- */
  paintPractise(x,ctx){const {sp,ps}=ctx,wid=sp.w,w=WB[wid],ch=CH[w.d],g=sp.c.practise||{},PH=BK.PH;PT.base(x,ps);const {X0,X1}=PT.lay(ps),CW=X1-X0;const meta={hits:[]};const bd=BookData();
    PT.fnt(x,48,800,FONT_D);PT.ltr(x);x.fillStyle=ch.ink;x.fillText('Practise',X0,104);if(bd.games[wid]){PT.icon(x,'✅',X0+230,90,34)}PT.ar(x,'تدريب',X0,X1,98,{sz:20,col:ch.ink});
    x.globalAlpha=.85;x.fillStyle=ch.ink;x.fillRect(X0,124,CW,3);x.globalAlpha=1;
    PT.fnt(x,34,800,FONT_D);PT.ltr(x);x.fillStyle=PINK;x.fillText(g.title||w.en,X0,176);let y=214;if(g.how){const r=PT.en(x,g.how,X0,y,CW,{sz:25,lh:1.35,col:PINK2});y=r.y-4}if(g.ar){const r=PT.ar(x,g.ar,X0,X1,y+4,{sz:19});y=r.y}
    const home=sp.c.home||[];const HB=home.length?PH-96-(70+home.length*86):PH-110;
    const A={X0,X1,Y0:Math.max(250,y+10),Y1:HB-26};if(g.type){const s=GS[wid]||(GS[wid]=Games.init(g));Games.draw(x,A,g,s,meta,ctx,ch)}
    if(home.length){const hb=HB,hh=70+home.length*86;PT.box(x,X0,hb,CW,hh,20,'#fff6e2',ch.ink,3);PT.icon(x,'🏠',X0+34,hb+38,30);PT.fnt(x,30,800,FONT_D);PT.ltr(x);x.fillStyle=ch.ink;x.fillText('Home learning',X0+62,hb+48);PT.fnt(x,19,400,FONT_R);x.fillStyle=PINK2;x.fillText('from the booklet',X0+300,hb+46);PT.ar(x,'واجب البيت',X0,X1-20,hb+46,{sz:19,col:ch.ink});
      const ticks=bd.home[wid]||(bd.home[wid]=[]);home.forEach(([e,a],i)=>{const ry=hb+70+i*86;const on=!!ticks[i];PT.box(x,X0+18,ry+6,46,46,10,on?'#16866b':'#fffaf0','#16866b',3);if(on)PT.tick(x,X0+41,ry+29,40,'#ffffff');
        PT.fnt(x,24,700,FONT_R);const ls=PT.wrap(x,e,CW-110);PT.ltr(x);x.fillStyle=on?'rgba(45,34,25,.55)':PINK;ls.slice(0,2).forEach((l,k)=>x.fillText(l,X0+80,ry+28+k*28));PT.ar(x,a,X0+80,X1-18,ry+28+Math.min(2,ls.length)*28,{sz:17});
        meta.hits.push({x:X0+8,y:ry,w:CW-16,h:84,fn:()=>{ticks[i]=ticks[i]?0:1;Store.save();Snd.tick();if(home.every((_,k)=>ticks[k])&&award(wid,'home',1,'Home learning done!'))ctx.burst(X0+60,ry+30);ctx.refresh()}})})}
    PT.fnt(x,19,700,FONT_R);PT.ltr(x,'right');x.fillStyle='#2f6fb3';x.fillText('Extra: open the 3D world →',X1,PH-34);meta.hits.push({x:X1-300,y:PH-64,w:300,h:44,fn:()=>App.go('w-'+wid)});
    PT.pageNo(x,pageNo(ctx.s,'R'),ps);return meta},
  /* ---------- the quiz page ---------- */
  qinit(Q){return {order:shuffle(Q.map((_,i)=>i)),opts:Q.map(q=>shuffle(q.o.map((_,j)=>j))),i:0,picked:null,score:0,res:[],done:false}},
  paintQuiz(x,ctx){const {sp,ps}=ctx,wid=sp.w,w=WB[wid],ch=CH[w.d],QX=GQX[wid],Q=(QX&&QX.qs)||sp.c.quiz||[],PH=BK.PH;PT.base(x,ps);const {X0,X1}=PT.lay(ps),CW=X1-X0;const meta={hits:[]};const bd=BookData();
    const s=GQ[wid]||(GQ[wid]=Games.qinit(Q));const n=Q.length;
    PT.fnt(x,48,800,FONT_D);PT.ltr(x);x.fillStyle=ch.ink;x.fillText('Quiz time!',X0,104);if(bd.quiz[wid])PT.icon(x,'🏆',X0+260,90,36);PT.ar(x,'اختبار قصير',X0,X1,98,{sz:20,col:ch.ink});
    for(let k=0;k<n;k++){const cx=X1-20-(n-1-k)*34,cy=150;x.fillStyle=s.res[k]===true?'#16866b':s.res[k]===false?'#c0336a':k===s.i&&!s.done?'#ffd166':'rgba(107,88,71,.2)';x.beginPath();x.arc(cx,cy,12,0,7);x.fill()}
    x.globalAlpha=.85;x.fillStyle=ch.ink;x.fillRect(X0,124,CW-n*34-10,3);x.globalAlpha=1;
    if(!n){PT.en(x,'Coming soon.',X0,260,CW);PT.pageNo(x,pageNo(ctx.s,'L'),ps);return meta}
    const newQs=()=>{if(GQX[wid]&&GQX[wid].loading)return;GQX[wid]=Object.assign({},GQX[wid]||{},{loading:true});ctx.refresh();
      QuizGen.fresh(wid,4).then(r=>{GQX[wid]={qs:r.qs,src:r.src,prov:r.provider?r.provider.name:''};GQ[wid]=Games.qinit(r.qs);ctx.refresh();const q0=r.qs[GQ[wid].order[0]];if(q0)Voice.say(q0.q,{auto:true})})
        .catch(()=>{GQX[wid]=Object.assign({},GQX[wid],{loading:false});ctx.refresh()})};
    const newBtn=(bx,by,bw,bh)=>{PT.box(x,bx,by,bw,bh,22,'#6648c2','#4a2f9e',2);PT.icon(x,'✨',bx+34,by+bh/2,28);const fs=PT.fitFont(x,'New questions',bw-80,27,800,FONT_D,18);PT.fnt(x,fs,800,FONT_D);PT.ltr(x);x.fillStyle='#ffffff';x.fillText('New questions',bx+60,by+bh/2+fs*.36);meta.hits.push({x:bx,y:by,w:bw,h:bh,fn:newQs})};
    const srcLine=()=>{if(!QX||!QX.src)return;PT.fnt(x,19,700,FONT_R);PT.ltr(x,'right');x.fillStyle=PINK2;x.fillText(QX.src==='ai'?'✨ New questions by Bright'+(QX.prov?' · '+QX.prov:''):'✨ New questions from the book',X1,PH-118)};
    if(QX&&QX.loading){PT.box(x,X0,220,CW,260,26,'#fff6e2',ch.ink,3,[12,9]);PT.icon(x,'✨',(X0+X1)/2,300,64);PT.fnt(x,34,800,FONT_D);PT.ltr(x,'center');x.fillStyle=PINK;x.fillText('Bright is thinking of new questions…',(X0+X1)/2,390);PT.ar(x,'يجهّز المساعد أسئلة جديدة…',X0,X1,440,{sz:20,align:'center'});PT.pageNo(x,pageNo(ctx.s,'L'),ps);return meta}
    const reset=()=>{GQ[wid]=Games.qinit(Q);ctx.refresh();const q0=Q[GQ[wid].order[0]];Voice.say(q0.q,{auto:true})};
    if(s.done){const pass=s.score>=Math.max(1,n-1);PT.fnt(x,128,800,FONT_D);PT.ltr(x,'center');x.fillStyle=pass?'#16866b':ch.ink;x.fillText(`${s.score} / ${n}`,(X0+X1)/2,420);
      for(let k=0;k<n;k++)PT.icon(x,k<s.score?'⭐':'☆',(X0+X1)/2+(k-(n-1)/2)*80,520,58);
      PT.fnt(x,36,800,FONT_D);x.fillStyle=PINK;PT.ltr(x,'center');x.fillText(pass?'Brilliant! You passed the quiz.':'Good try! Have another go.',(X0+X1)/2,640);PT.ar(x,pass?'ممتاز! نجحت في الاختبار.':'محاولة جميلة! جرّب مرة أخرى.',X0,X1-(CW-560)/2,690,{sz:22});
      if(pass)PT.icon(x,'🏆',(X0+X1)/2,820,120);
      const bw=320,bh=80,bx=(X0+X1)/2-bw/2,by=960;PT.box(x,bx,by,bw,bh,22,'#ffd166','#a3690b',3);PT.fnt(x,30,800,FONT_D);PT.ltr(x,'center');x.fillStyle='#3a2600';x.fillText('Try again ↺',bx+bw/2,by+52);meta.hits.push({x:bx,y:by,w:bw,h:bh,fn:reset});
      newBtn((X0+X1)/2-200,by+104,400,80);srcLine();PT.pageNo(x,pageNo(ctx.s,'L'),ps);return meta}
    const qi=s.order[s.i],q=Q[qi];
    PT.fnt(x,22,700,FONT_R);PT.ltr(x);x.fillStyle=PINK2;x.fillText(`Question ${s.i+1} of ${n}`,X0,178);
    PT.fnt(x,38,700,FONT_R);let qsz=38,ql=PT.wrap(x,q.q,CW-140);while(ql.length>3&&qsz>26){qsz-=2;PT.fnt(x,qsz,700,FONT_R);ql=PT.wrap(x,q.q,CW-140)}
    const qh=Math.max(150,50+ql.length*qsz*1.3+(q.ar?34:0));PT.box(x,X0,200,CW,qh,22,'#fff6e2',ch.ink,3);x.fillStyle=PINK;PT.ltr(x);ql.forEach((l,k)=>x.fillText(l,X0+28,200+30+qsz+k*qsz*1.3));if(q.ar)PT.ar(x,q.ar,X0+20,X1-110,200+qh-20,{sz:18});
    const lx=X1-58,ly=200+44;x.fillStyle=ch.ink;x.beginPath();x.arc(lx,ly,32,0,7);x.fill();PT.icon(x,'🔊',lx,ly,30);meta.hits.push({x:lx-40,y:ly-40,w:80,h:80,sound:false,fn:()=>Voice.say(q.q+' '+s.opts[qi].map(j=>q.o[j]).join(', or ')+'?')});
    let oy=200+qh+26;const oh=92;s.opts[qi].forEach((j,k)=>{const r={x:X0,y:oy+k*(oh+16),w:CW,h:oh};const picked=s.picked!=null;const st2=picked?(j===0?'ok':k===s.picked?'bad':'off'):'';
      Games.tile(x,{x:r.x+70,y:r.y,w:r.w-70,h:r.h},q.o[j],ch,st2,{sz:31});x.fillStyle=picked&&j===0?'#16866b':ch.ink;x.beginPath();x.arc(X0+30,r.y+oh/2,26,0,7);x.fill();PT.fnt(x,28,800,FONT_D);PT.ltr(x,'center');x.fillStyle='#fff';x.fillText('ABC'[k],X0+30,r.y+oh/2+10);
      if(!picked)meta.hits.push({x:r.x,y:r.y,w:r.w,h:r.h,sound:false,fn:()=>{s.picked=k;const ok=j===0;s.res[s.i]=ok;if(ok){s.score++;Snd.good()}else Snd.bad();ctx.refresh()}})});
    oy+=3*(oh+16)+6;
    if(s.picked!=null){const ok=s.opts[qi][s.picked]===0;PT.icon(x,ok?'✅':'💡',X0+24,oy+30,34);PT.fnt(x,32,800,FONT_D);PT.ltr(x);x.fillStyle=ok?'#16866b':'#c0336a';x.fillText(ok?'Correct!':'Not quite.',X0+56,oy+42);
      const why=q.why||(ok?'':'The answer is: '+q.o[0]+'.');let yy=oy+84;if(!ok&&q.why){const r=PT.en(x,'The answer is: '+q.o[0]+'.',X0,yy,CW,{sz:25,wt:700,col:'#16866b'});yy=r.y}if(why){const r=PT.en(x,why,X0,yy,CW,{sz:25,lh:1.4,col:PINK});yy=r.y}
      const last=s.i>=n-1,bw=360,bh=78,bx=X1-bw,by=Math.min(PH-140,Math.max(yy+10,oy+150));PT.box(x,bx,by,bw,bh,22,ch.ink);PT.fnt(x,30,800,FONT_D);PT.ltr(x,'center');x.fillStyle='#fffaf0';x.fillText(last?'See my score →':'Next question →',bx+bw/2,by+50);
      meta.hits.push({x:bx,y:by,w:bw,h:bh,fn:()=>{s.i++;s.picked=null;if(s.i>=n){s.done=true;const pass=s.score>=Math.max(1,n-1);if(pass){ctx.burst((X0+X1)/2,420,{n:90});Snd.good();if(!bd.quiz[wid]){bd.quiz[wid]=1;Store.save();award(wid,'quiz',2,'Quiz passed!')}}}else Voice.say(Q[s.order[s.i]].q,{auto:true});ctx.refresh()}})}
    newBtn(X0,PH-168,330,70);srcLine();PT.pageNo(x,pageNo(ctx.s,'L'),ps);return meta}
};

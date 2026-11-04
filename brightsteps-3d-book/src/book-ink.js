/* ===== The drawing pen writes on the page itself =====
   In the book, the pen (✎ in the header) no longer draws on a sheet of glass in front of the screen: every stroke is
   written into the page's own paper, so it stays on that page, turns with it and is kept on this device. The colour,
   thickness, undo and clear buttons of the pen bar work on the page you are looking at. */
const BookInk={k:'bs-ink-v1',m:null,cur:null,undoStack:[],dirty:new Set(),saveT:0,flushT:0,
  load(){if(!this.m){try{this.m=JSON.parse(localStorage.getItem(this.k)||'{}')||{}}catch(e){this.m={}}}return this.m},
  save(){clearTimeout(this.saveT);this.saveT=setTimeout(()=>{const m=this.load();let n=0;Object.values(m).forEach(l=>l.forEach(s=>n+=s.p.length));
      /* keep it light: drop the oldest strokes beyond about 60,000 numbers */
      while(n>60000){const ids=Object.keys(m);if(!ids.length)break;const l=m[ids[0]];const s=l.shift();n-=s?s.p.length:0;if(!l.length)delete m[ids[0]]}
      try{localStorage.setItem(this.k,JSON.stringify(m))}catch(e){}},400)},
  active(){return !!(Pen.on&&Pen.page&&App.cur==='home'&&Book.st)},
  style(x,s){x.lineCap='round';x.lineJoin='round';x.strokeStyle=s.c;x.lineWidth=s.s;x.shadowColor=s.c;x.shadowBlur=2},
  /* called by the page printer after each repaint, so the ink is always on top of the page */
  paint(id,x){const list=this.load()[id];if(!list||!list.length)return;x.save();x.setTransform(1,0,0,1,0,0);
    list.forEach(s=>{this.style(x,s);const p=s.p;x.beginPath();x.moveTo(p[0],p[1]);for(let i=2;i<p.length;i+=2)x.lineTo(p[i],p[i+1]);if(p.length===2)x.lineTo(p[0]+.1,p[1]);x.stroke()});x.restore()},
  start(hit){const m=this.load(),s={c:Pen.color,s:Math.round(Pen.size*1.7),p:[Math.round(hit.px),Math.round(hit.py)]};(m[hit.id]=m[hit.id]||[]).push(s);this.cur={id:hit.id,s};this.undoStack.push(hit.id);this.seg(hit.id,s,0);Bright.buzz&&Bright.buzz(6)},
  move(hit){const c=this.cur;if(!c||hit.id!==c.id)return;const p=c.s.p,lx=p[p.length-2],ly=p[p.length-1];if(Math.hypot(hit.px-lx,hit.py-ly)<2.5)return;p.push(Math.round(hit.px),Math.round(hit.py));this.seg(c.id,c.s,p.length-4)},
  seg(id,s,i){const st=Book.st,pg=st&&st.pageObj&&st.pageObj(id);if(!pg)return;const x=pg.x,p=s.p;x.save();x.setTransform(1,0,0,1,0,0);this.style(x,s);x.beginPath();x.moveTo(p[i],p[i+1]);
    if(p.length>i+2)x.lineTo(p[i+2],p[i+3]);else x.lineTo(p[i]+.1,p[i+1]);x.stroke();x.restore();this.dirty.add(pg);
    const now=performance.now();if(now-this.flushT>60){this.flushT=now;this.flush()}},
  flush(){this.dirty.forEach(pg=>pg.tex.needsUpdate=true);this.dirty.clear()},
  end(){if(!this.cur)return;this.cur=null;this.flush();this.save()},
  visible(){const st=Book.st;if(!st)return [];const k=st.turned;return k===0?['C']:k===st.M+2?['K']:k===1?['L1','R1']:['L'+k,'R'+k]},
  undo(){const vis=this.visible();for(let i=this.undoStack.length-1;i>=0;i--){const id=this.undoStack[i];if(!vis.includes(id))continue;this.undoStack.splice(i,1);const l=this.load()[id];if(l&&l.length){l.pop();if(!l.length)delete this.m[id]}this.save();Book.st.repaint(id);return}
    /* nothing drawn in this visit: take back the last stroke on these pages */
    for(const id of vis){const l=this.load()[id];if(l&&l.length){l.pop();if(!l.length)delete this.m[id];this.save();Book.st.repaint(id);return}}},
  clear(){const m=this.load();this.visible().forEach(id=>{if(m[id]){delete m[id];Book.st.repaint(id)}});this.save();toast('Cleared')}
};
/* the pen button keeps its bar; in the book it writes on the page, elsewhere it still draws over the screen */
(()=>{const toggle0=Pen.toggle.bind(Pen),init0=Pen.init.bind(Pen);
  Pen.init=function(){init0();const click0=this.bar.onclick;
    this.bar.onclick=e=>{const b=e.target.closest('button');if(this.page&&b&&b.dataset.a==='undo'){BookInk.undo();return}if(this.page&&b&&b.dataset.a==='clear'){BookInk.clear();return}
      if(b&&b.dataset.a==='thick'){this.size=this.size===6?12:this.size===12?3:6;toast('Pen size: '+this.size);return}return click0(e)};
    const names={thick:'Thickness',undo:'Undo',clear:'Clear',close:'Close'};$$('button',this.bar).forEach(b=>{if(b.dataset.c)b.setAttribute('aria-label','Colour');else if(names[b.dataset.a])b.setAttribute('aria-label',names[b.dataset.a])})};
  Pen.toggle=function(v){const on=v==null?!this.on:v;
    if(App.cur==='home'&&Book.st){this.on=on;this.page=on;this.c.classList.remove('on');this.bar.classList.toggle('on',on);const b=$('#penBtn');b&&b.classList.toggle('on',on);
      if(on){Bright.close&&Bright.close();toast('Pen on: write on the page with your finger ✎')}return}
    this.page=false;return toggle0(v)};
  const pick0=E.pick.bind(E);E.pick=function(e){if(BookInk.active())return;return pick0(e)};
  const route0=App.route;App.route=function(){if(Pen.page)Pen.toggle(false);return route0.apply(this,arguments)}})();

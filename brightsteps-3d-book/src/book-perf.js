/* ===== Smooth on every phone =====
   The book watches how fast it draws. When a phone struggles, it draws a little less: fewer pixels first, then a
   smaller shadow, then no shadows. The level it settles on is kept on this device and tried one step higher again
   after a week. A grown-up can also choose "Simpler graphics" in the AI settings, and the Android app asks for it
   after the phone ran out of memory. */
const Perf={k:'bs-perf-v1',lvl:0,forcedLvl:0,on:false,iv:[],last:0,until:0,next:0,slow:0,
  levels:[{pr:2},{pr:1.25},{pr:1,sm:512},{pr:.85,sm:0}],
  load(){let o={};try{o=JSON.parse(localStorage.getItem(this.k)||'{}')||{}}catch(e){}
    let l=Math.max(0,Math.min(3,Math.floor(+o.lvl||0)));if(l&&o.at&&Date.now()-o.at>7*864e5)l--;this.lvl=l;this.forcedLvl=o.force?2:0;
    if(/[?&]lite=1(&|$)/.test(location.search))this.lvl=Math.max(this.lvl,2)},
  save(){try{localStorage.setItem(this.k,JSON.stringify({lvl:this.lvl,at:Date.now(),force:!!this.forcedLvl}))}catch(e){}},
  forced(){return this.forcedLvl>0},
  force(v){this.forcedLvl=v?2:0;this.save();this.apply()},
  level(){return Math.max(this.lvl,this.forcedLvl)},
  /* the level, applied to the renderer and to the book's sun */
  apply(){const r=E.renderer;if(!r)return;const L=this.levels[this.level()],base=Math.min(window.devicePixelRatio||1,innerWidth<700?1.5:2),pr=Math.min(base,L.pr);
    if(Math.abs(r.getPixelRatio()-pr)>.01){r.setPixelRatio(pr);E.resize&&E.resize()}
    const sun=Book.st&&Book.st.sun;if(!sun)return;
    if(L.sm===0){if(sun.castShadow){sun.castShadow=false;r.shadowMap.enabled=false}return}
    if(!sun.castShadow){sun.castShadow=true;r.shadowMap.enabled=true}
    const sm=Math.min(L.sm||4096,innerWidth<700?1024:2048);if(sun.shadow.mapSize.x!==sm){sun.shadow.mapSize.set(sm,sm);if(sun.shadow.map){sun.shadow.map.dispose();sun.shadow.map=null}}},
  /* every frame: how long it took (a very slow frame counts as 0.4 s); every 2.5 s: was it slow (under about 43 frames a second)? twice in a row: one level down */
  tick(now){requestAnimationFrame(t=>this.tick(t));if(document.hidden||!E.scene||!E.visible){this.last=0;return}
    if(this.last){const d=now-this.last;if(d<2000)this.iv.push(Math.min(d,400))}this.last=now;if(now<this.until){this.iv=[];return}
    if(now<this.next)return;this.next=now+2500;const n=this.iv.length;if(n<3){this.iv=[];return}
    const s=this.iv.slice().sort((a,b)=>a-b),med=s[n>>1];this.iv=[];
    if(med>23&&this.lvl<3){if(++this.slow>=2){this.slow=0;this.lvl++;this.save();this.apply();this.until=now+4000}}else this.slow=0},
  start(){this.load();this.apply();if(this.on)return;this.on=true;this.until=performance.now()+5000;requestAnimationFrame(t=>this.tick(t))}
};
(()=>{const b0=App.book;App.book=function(){const r=b0.apply(this,arguments);try{Perf.start()}catch(e){}return r}})();

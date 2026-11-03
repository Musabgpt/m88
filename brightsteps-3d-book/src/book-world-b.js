/* ===== Chapter 2 · Maths ===== */
function drawTO(x,r,t,o){const cs=Math.min(20,(r.h-50)/10);const top=r.y+(r.h-cs*10)/2-8;const tw=t*(cs+14)+(o?24+5*(cs+8):0);let X=r.x+r.w/2-tw/2;
  for(let i=0;i<t;i++){for(let k=0;k<10;k++){x.fillStyle='#ffb84d';x.fillRect(X,top+k*cs,cs,cs);x.strokeStyle='#8a5a10';x.lineWidth=1.5;x.strokeRect(X,top+k*cs,cs,cs)}X+=cs+14}
  X+=24;for(let i=0;i<o;i++){const c=i%5,rr=Math.floor(i/5);const cx=X+c*(cs+8),cy=top+cs*6+rr*(cs+8);x.fillStyle='#7cc4ff';x.fillRect(cx,cy,cs,cs);x.strokeStyle='#1d4f9e';x.lineWidth=1.5;x.strokeRect(cx,cy,cs,cs)}
  PT.fnt(x,20,700,FONT_R);PT.ltr(x,'center');x.fillStyle=PINK2;x.fillText('tens = sticks · ones = cubes',r.x+r.w/2,r.y+r.h-14)}
function drawShape2(x,cx,cy,s,type){const R=s*.42;x.save();x.fillStyle='#c9b8ff';x.strokeStyle=PINK;x.lineWidth=4;x.lineJoin='round';x.beginPath();
  const poly=(n,rot)=>{for(let i=0;i<n;i++){const a=rot+i*2*Math.PI/n;const px=cx+Math.cos(a)*R,py=cy+Math.sin(a)*R;i?x.lineTo(px,py):x.moveTo(px,py)}x.closePath()};
  if(type==='square')poly(4,Math.PI/4);else if(type==='rectangle')x.rect(cx-R*1.2,cy-R*.62,R*2.4,R*1.24);else if(type==='triangle')poly(3,-Math.PI/2);else if(type==='pentagon')poly(5,-Math.PI/2);else if(type==='hexagon')poly(6,0);else if(type==='circle')x.arc(cx,cy,R,0,7);
  else if(type==='kite'){x.moveTo(cx,cy-R);x.lineTo(cx+R*.62,cy-R*.18);x.lineTo(cx,cy+R);x.lineTo(cx-R*.62,cy-R*.18);x.closePath()}else if(type==='rhombus'){x.moveTo(cx,cy-R);x.lineTo(cx+R*.72,cy);x.lineTo(cx,cy+R);x.lineTo(cx-R*.72,cy);x.closePath()}
  x.fill();x.stroke();x.restore()}
function drawSolid(x,cx,cy,s,type){const R=s*.36;x.save();x.lineWidth=3;x.strokeStyle=PINK;x.lineJoin='round';const col={sphere:'#ff8fb1',cylinder:'#6db4ff',cone:'#ffd166',cube:'#ff7b39',cuboid:'#3ddbb0',pyramid:'#b29bff'}[type]||'#ccc';
  const shade=(c,k)=>{const C=new THREE.Color(c);C.multiplyScalar(k);return '#'+C.getHexString()};
  if(type==='sphere'){const g=x.createRadialGradient(cx-R*.35,cy-R*.35,R*.1,cx,cy,R);g.addColorStop(0,'#ffe3ee');g.addColorStop(1,col);x.fillStyle=g;x.beginPath();x.arc(cx,cy,R,0,7);x.fill();x.stroke()}
  else if(type==='cylinder'){const w=R*.9,h=R*1.4,e=R*.32;x.fillStyle=col;x.beginPath();x.moveTo(cx-w,cy-h/2);x.lineTo(cx-w,cy+h/2);x.ellipse(cx,cy+h/2,w,e,0,Math.PI,0,true);x.lineTo(cx+w,cy-h/2);x.closePath();x.fill();x.stroke();x.fillStyle=shade(col,1.15);x.beginPath();x.ellipse(cx,cy-h/2,w,e,0,0,7);x.fill();x.stroke()}
  else if(type==='cone'){const w=R*.9,h=R*1.6,e=R*.3;x.fillStyle=col;x.beginPath();x.moveTo(cx,cy-h/2);x.lineTo(cx-w,cy+h/2);x.ellipse(cx,cy+h/2,w,e,0,Math.PI,0,true);x.closePath();x.fill();x.stroke()}
  else if(type==='cube'||type==='cuboid'){const w=type==='cube'?R*1.1:R*1.5,h=R*1.1,d=R*.5;const X0=cx-w/2-d/2,Y0=cy-h/2+d/2;x.fillStyle=col;x.fillRect(X0,Y0,w,h);x.strokeRect(X0,Y0,w,h);x.fillStyle=shade(col,1.2);x.beginPath();x.moveTo(X0,Y0);x.lineTo(X0+d,Y0-d);x.lineTo(X0+d+w,Y0-d);x.lineTo(X0+w,Y0);x.closePath();x.fill();x.stroke();
    x.fillStyle=shade(col,.75);x.beginPath();x.moveTo(X0+w,Y0);x.lineTo(X0+w+d,Y0-d);x.lineTo(X0+w+d,Y0-d+h);x.lineTo(X0+w,Y0+h);x.closePath();x.fill();x.stroke()}
  else if(type==='pyramid'){const w=R*1.5,h=R*1.4;const A=[cx,cy-h*.6],B=[cx-w/2,cy+h*.45],C=[cx+w*.2,cy+h*.6],D=[cx+w/2,cy+h*.3];x.fillStyle=col;x.beginPath();x.moveTo(...A);x.lineTo(...B);x.lineTo(...C);x.closePath();x.fill();x.stroke();x.fillStyle=shade(col,.75);x.beginPath();x.moveTo(...A);x.lineTo(...C);x.lineTo(...D);x.closePath();x.fill();x.stroke()}
  x.restore()}
WC.blocks={
  learn:{body:['A stick is 10 (one ten). A small cube is 1 (one one).','When we have 10 ones, we exchange them for 1 ten.','EX:27 + 5 → 7 + 5 = 12 ones → 1 ten and 2 ones → 32','When we take away and there are not enough ones, we exchange 1 ten for 10 ones.','We can also partition a number:','EX:34 = 30 + 4'],
    words:[['tens','عشرات'],['ones','آحاد'],['exchange','تبديل'],['partition','تجزئة']],
    flap:{q:'You have 3 tens and 12 ones. What is the number?',a:'42. Exchange 10 ones for 1 ten: 4 tens and 2 ones.'},
    ar:'كل عشرة آحاد تتحوّل إلى عشرة واحدة. ساعد طفلك أن يرى ذلك بأشياء من البيت مثل المعكرونة والفاصولياء.'},
  try:{hint:'Press +1 to add a cube. When there are 10 cubes, they become a ten stick!',ar:'اضغط +1 لإضافة مكعب. عند 10 مكعبات تتحوّل إلى عصا.',
    mat(x,a){PT.fnt(x,30,800,FONT_D);x.fillStyle='rgba(163,105,11,.8)';PT.ltr(x);let [X,Y]=a.px(-1.5,1.38);x.fillText('tens',X,Y);[X,Y]=a.px(.7,1.38);x.fillText('ones',X,Y);
      x.strokeStyle='rgba(163,105,11,.45)';x.lineWidth=3;x.setLineDash([10,8]);const [x0,y0]=a.px(.45,-1.5),[x1,y1]=a.px(.45,1.15);x.beginPath();x.moveTo(x0,y0);x.lineTo(x1,y1);x.stroke();x.setLineDash([]);
      for(let r=0;r<2;r++)for(let j=0;j<5;j++){const [cx,cy]=a.px(.75+j*.2,.15+r*.2);const h=a.s*.09;x.strokeStyle='rgba(47,111,179,.35)';x.lineWidth=2;x.strokeRect(cx-h,cy-h,h*2,h*2)}},
    pop(P){
      const S=.16,PI=.168;const geo=new THREE.BoxGeometry(S,S,S);geo.userData={keep:true};const mT=P.m('#ffb84d'),mO=P.m('#7cc4ff');mT.userData.keep=mO.userData.keep=true;
      let n=27,rods=[],ones=[],busy=false;const lab=P.label('27',{size:.42,px:80});lab.position.set(1.15,.62,-.5);P.root.add(lab);
      const rodPos=i=>new THREE.Vector3(-1.4+i*.2,0,-.12),onePos=i=>new THREE.Vector3(.75+(i%5)*.2,S/2+(i>=10?S:0),.15+Math.floor((i%10)/5)*.2);const inRod=k=>new THREE.Vector3(0,S/2,-.76+k*PI);
      const cube=(m)=>{const c=new THREE.Mesh(geo,m);c.castShadow=true;P.ink(c);return c};
      const rod=()=>{const g=new THREE.Group();for(let k=0;k<10;k++){const c=cube(mT);c.position.copy(inRod(k));g.add(c)}return g};
      function sync(){const t=Math.floor(n/10),o=n%10;while(rods.length>t){P.root.remove(rods.pop())}while(rods.length<t){const r=rod();r.position.copy(rodPos(rods.length));P.root.add(r);rods.push(r)}
        while(ones.length>o){P.root.remove(ones.pop())}while(ones.length<o){const c=cube(mO);c.position.copy(onePos(ones.length));P.root.add(c);ones.push(c)}show()}
      function show(){const t=Math.floor(n/10),o=n%10;lab.userData.set(String(n));P.cap(`${n} = ${t} tens and ${o} ones`,`${t} عشرات و${o} آحاد`)}
      async function add1(){if(busy)return;if(n>=99){Snd.bad();return}busy=true;const c=cube(mO);c.position.copy(onePos(ones.length));c.position.y+=1;P.root.add(c);ones.push(c);Snd.pop();await E.tw(c.position,{y:onePos(ones.length-1).y},.3,Ease.bounce);n++;
        if(ones.length>=10){P.cap('10 ones → 1 ten! Exchange!','عشرة آحاد تصبح عشرة واحدة.');await E.wait(.25);const to=rodPos(rods.length);Snd.whoosh();
          await Promise.all(ones.map((c,k)=>arc(c,inRod(k).add(to),.55+k*.03,.8)));ones.forEach(c=>P.root.remove(c));ones=[];const r=rod();r.position.copy(to);P.root.add(r);rods.push(r);
          FX.sparkle(P.world(new THREE.Vector3(to.x,.4,to.z)),{n:24});Snd.good();P.done('You exchanged 10 ones for a ten!')}
        busy=false;show()}
      async function sub1(){if(busy)return;if(n<=0){Snd.bad();return}busy=true;if(!ones.length){const r=rods.pop();P.cap('No ones left: exchange 1 ten for 10 ones.','نكسر عصا إلى 10 مكعبات.');const wp=r.position.clone();P.root.remove(r);
          for(let k=0;k<10;k++){const c=cube(mO);c.position.copy(inRod(k).add(wp));P.root.add(c);ones.push(c)}Snd.whoosh();await Promise.all(ones.map((c,k)=>arc(c,onePos(k),.5+k*.03,.6)))}
        const c=ones.pop();await E.tw(c.position,{y:c.position.y+.8},.22);P.root.remove(c);n--;Snd.tick();busy=false;show()}
      async function add10(){if(busy||n>89){if(n>89)Snd.bad();return}busy=true;const r=rod();const to=rodPos(rods.length);r.position.set(to.x,1.1,to.z);P.root.add(r);rods.push(r);await E.tw(r.position,{y:0},.35,Ease.bounce);n+=10;busy=false;show();Snd.pop()}
      async function sub10(){if(busy)return;if(n<10){Snd.bad();return}busy=true;const r=rods.pop();await E.tw(r.position,{y:1.2},.3);P.root.remove(r);n-=10;busy=false;show()}
      sync();P.tap(lab,()=>Voice.say(String(n)));
      return {chips:[{label:'+1',cls:'gold',fn:add1},{label:'+10',fn:add10},{label:'−1',fn:sub1},{label:'−10',fn:sub10},{label:'🎲 New number',fn:()=>{if(busy)return;n=randi(11,68);sync();Voice.say(String(n))}}],update(dt,t){lab.position.y=.62+Math.sin(t*2)*.04}};
    }},
  practise:{type:'fill',title:'What number is it?',how:'Count the tens (sticks) and the ones (cubes). Tap the number.',ar:'عدّ العشرات والآحاد ثم اضغط العدد.',
    gen(){return [0,1,2,3].map(()=>{const n=randi(13,58),t=Math.floor(n/10),o=n%10;const sw=o*10+t;const opts=[String(n)];[sw>9&&sw!==n?sw:n+10,n+(Math.random()<.5?1:-1),n-10].forEach(v=>{if(opts.length<3&&v>0&&!opts.includes(String(v)))opts.push(String(v))});return {q:'',o:opts,draw:(x,r)=>drawTO(x,r,t,o)}})}},
  quiz:[{q:'Sam has 34 stickers. He gets 18 more. How many now?',o:['52','42','62'],why:'34 + 18: 4 + 8 = 12, exchange! 30 + 10 + 10 + 2 = 52.'},{q:'How many tens are in 67?',o:['6','7','67']},{q:'48 + 5 = ?',o:['53','43','58'],why:'8 + 5 = 13: one more ten. 40 + 10 + 3 = 53.'},{q:'23 − 9 = ?',o:['14','16','12'],why:'Exchange a ten: 13 − 9 = 4, so 23 − 9 = 14.'}],
  home:[['Maths practice 3–4 times a week (about 10 minutes).','تدريب رياضيات 3–4 مرات أسبوعياً.'],["Parents' maths workshop: Thursday 19 November, 2:15–3:15 pm.",'ورشة الرياضيات للأهالي: الخميس 19 نوفمبر.']]
};
WC.dice={
  learn:{body:['Adding three numbers? Look for a number bond to 10 first!','EX:4 + 7 + 6 → 4 + 6 = 10 → 10 + 7 = 17','Or look for a double: 4 + 4 = 8.','Number bonds to 10:','EX:1 + 9    2 + 8    3 + 7    4 + 6    5 + 5'],
    words:[['add','اجمع'],['total','المجموع'],['double','ضِعف'],['number bond','صديقا العشرة']],
    flap:{q:'6 + 5 + 4 = ? Which two numbers make 10?',a:'6 + 4 = 10, then 10 + 5 = 15.'},
    ar:'عند جمع ثلاثة أعداد نبحث أولاً عن عددين مجموعهما 10، ثم نضيف الثالث.'},
  try:{hint:'Tap a dice (or press Roll) to roll all three. The counters fill the ten frames: the bond to 10 goes first.',ar:'اضغط النرد لترميه. صديقا العشرة يملآن الإطار الأول.',
    mat(x,a){const h=a.s*.15;for(let f=0;f<2;f++)for(let r=0;r<2;r++)for(let c=0;c<5;c++){const [cx,cy]=a.px((f?.25:-1.55)+c*.3+.15,.42+r*.3);x.fillStyle='#fffaf0';x.fillRect(cx-h,cy-h,h*2,h*2);x.strokeStyle='#a3690b';x.lineWidth=4;x.strokeRect(cx-h,cy-h,h*2,h*2)}
      PT.fnt(x,26,700,FONT_R);PT.ltr(x,'center');x.fillStyle='rgba(163,105,11,.85)';let [X,Y]=a.px(-.8,1.25);x.fillText('ten frame 1',X,Y);[X,Y]=a.px(1,1.25);x.fillText('ten frame 2',X,Y)},
    pop(P){
      const dice=[0,1,2].map(i=>{const d=Dice.make(.55);d.position.set((i-1)*.95,.275,-.75);d.rotation.set(rand(0,3),rand(0,3),0);P.root.add(d);return d});let vals=[3,4,6],busy=false,counters=[];
      const cell=i=>{const f=i<10?0:1,k=i%10,r=Math.floor(k/5),c=k%5;return new THREE.Vector3((f?.25:-1.55)+c*.3+.15,.04,.42+r*.3)};const cols=['#ff7b39','#6db4ff','#3ddbb0'];const cg=new THREE.CylinderGeometry(.11,.11,.06,18);cg.userData={keep:true};
      async function roll(){if(busy)return;busy=true;counters.forEach(c=>P.root.remove(c));counters=[];
        if(Math.random()<.6){const a=randi(4,6);vals=shuffle([a,10-a,randi(1,6)]).map(v=>Math.min(6,v))}else vals=[randi(1,6),randi(1,6),randi(1,6)];
        await Promise.all(dice.map((d,i)=>Dice.roll(d,vals[i],{h:.275,lift:1.4})));
        let pair=null;for(let i=0;i<3&&!pair;i++)for(let j=i+1;j<3;j++)if(vals[i]+vals[j]===10){pair=[i,j];break}
        const order=pair?[pair[0],pair[1],3-pair[0]-pair[1]]:[0,1,2];let k=0;
        for(const di of order){for(let q=0;q<vals[di];q++){const c=new THREE.Mesh(cg,P.m(cols[di]));c.castShadow=true;c.position.copy(dice[di].position);P.root.add(c);counters.push(c);arc(c,cell(k),.35,.6);k++;Snd.tick();await E.wait(.06)}}
        const sum=vals[0]+vals[1]+vals[2];const dbl=vals[0]===vals[1]||vals[1]===vals[2]||vals[0]===vals[2];
        if(pair){const o=vals[order[2]];P.cap(`${vals[order[0]]} + ${vals[order[1]]} = 10, then 10 + ${o} = ${sum}`,'وجدنا صديقَي العشرة!');Snd.good();P.done('You made 10 first!')}
        else P.cap(`${vals.join(' + ')} = ${sum}`,dbl?'لا يوجد صديقا عشرة، لكن يوجد ضِعف: ابدأ به.':'ابدأ بالعدد الأكبر ثم أضف.');
        Voice.say(`${vals.join(' plus ')} equals ${sum}`);busy=false}
      dice.forEach(d=>P.tap(d,roll));P.tag(dice[1],'👆 Tap to roll',{dy:.75});
      return {chips:[{label:'🎲 Roll the dice',cls:'gold',fn:roll}],capEn:'Make 10 first!',capAr:'كوّن 10 أولاً'};
    }},
  practise:{type:'match',title:'Number bonds to 10',how:'Tap a number on the left, then the number that makes 10 with it.',ar:'اضغط عدداً ثم العدد الذي يكمله إلى 10.',say:false,
    pairs:[['1','9'],['2','8'],['3','7'],['4','6'],['5','5']]},
  quiz:[{q:'7 + 3 + 5 = ?',o:['15','14','16'],why:'7 + 3 = 10, then 10 + 5 = 15.'},{q:'Which two numbers make 10?',o:['6 and 4','6 and 3','5 and 4']},{q:'8 + 5 = ?',o:['13','12','14'],why:'8 + 2 = 10, then 3 more: 13.'},{q:'5 + 5 + 6 = ?',o:['16','15','17'],why:'Double 5 is 10, then 10 + 6 = 16.'}],
  home:[['Play with 3 dice for 5 minutes a day.','العبا بثلاثة نرود 5 دقائق يومياً.'],['Say how you did it: "I found ten first!"','قولا الطريقة بصوت عالٍ: I found ten first!']]
};
WC.balance={
  learn:{body:['The = sign means "is the same as". Both sides balance.','To find a missing number, use the inverse: take away undoes add.','A fact family uses three numbers to make four number sentences:','EX:12 + 9 = 21    9 + 12 = 21    21 − 9 = 12    21 − 12 = 9','Spot the mistake: the booklet says 12 + 9 = 23. It should be 21!'],
    words:[['equals','يساوي'],['missing number','العدد المفقود'],['fact family','عائلة الأعداد'],['inverse','العملية العكسية']],
    flap:{q:'□ + 9 = 21. What is the missing number?',a:'12, because 21 − 9 = 12.'},
    ar:'علامة = تعني «متوازن». في واجب الكتيّب خطأ مطبعي: 12 + 9 = 21 وليس 23.'},
  try:{hint:'Press a number for the right-hand pan. Make the scales balance with 12 + 9.',ar:'اختر العدد حتى يتوازن الميزان.',
    pop(P){
      const st=G.cyl(.5,.6,.1,'#6b7290',{metalness:.3},28);st.position.y=.05;const post=G.cyl(.06,.08,1.25,'#6b7290',{metalness:.4});post.position.y=.68;const knob=G.sph(.1,'#ffd166',{metalness:.5,roughness:.3});knob.position.y=1.32;P.root.add(st,post,knob);
      const beam=new THREE.Group();beam.position.y=1.3;const bar=G.box(2.9,.08,.12,'#8a5a36');beam.add(bar);P.root.add(beam);
      const pans=[-1,1].map(s=>{const p=new THREE.Group();p.position.set(s*1.3,0,0);[-.15,.15].forEach(z=>{const str=G.cyl(.008,.008,.62,'#2d2219');str.position.set(0,-.31,z);p.add(str)});const plate=G.cyl(.46,.4,.05,'#c9cfe0',{metalness:.4,roughness:.3},28);plate.position.y=-.64;p.add(plate);beam.add(p);return p});
      const left=txtCard(.82,.4,'12 + 9',{pw:448,bg:'#fff5df',d:.32});left.position.set(0,-.41,0);pans[0].add(left);
      const right=txtCard(.6,.4,'?',{pw:320,bg:'#e2f6ff',d:.32});right.position.set(0,-.41,0);pans[1].add(right);
      let val=0,ang=0,vel=0;const target=()=>val?clamp((21-val)*.06,-.28,.28):.28;
      function setV(v){val=v;right.userData.redraw((x,W,H)=>{x.fillStyle='#e2f6ff';x.fillRect(0,0,W,H);x.strokeStyle=PINK;x.lineWidth=6;x.strokeRect(4,4,W-8,H-8);PK.word(x,W,H,String(v),null)});Snd.pop();
        if(v===21){setTimeout(()=>{if(!P.alive())return;celebrate('',{at:P.world(new THREE.Vector3(0,1.6,0)),n:2,spread:1});P.cap('12 + 9 = 21. It balances! Fact family: 21 − 9 = 12, 21 − 12 = 9.','متوازن!');Voice.say('Twelve plus nine equals twenty-one');P.done('You balanced the scales!')},700)}
        else if(v===23)P.cap('12 + 9 = 23? No! The right side is heavier. (That is the booklet typo.)','هذا الخطأ المطبعي في الكتيّب.');else P.cap(v<21?`${v} is too small: the right side goes up.`:`${v} is too big: the right side goes down.`,v<21?'نحتاج عدداً أكبر.':'نحتاج عدداً أصغر.')}
      P.tag(right,'Choose a number ↓',{dy:.95});
      return {chips:[19,20,21,22,23].map(v=>({id:'v'+v,label:String(v),group:'v',fn:()=>{P.untag(right);setV(v)}})),capEn:'12 + 9 = ? Make it balance.',capAr:'اجعل الميزان يتوازن.',
        update(dt){const tg=target();vel+=(tg-ang)*26*dt-vel*3.2*dt;ang+=vel*dt;beam.rotation.z=ang;pans.forEach(p=>p.rotation.z=-ang)}};
    }},
  practise:{type:'fill',title:'Find the missing number',how:'Use the inverse. Tap the number that goes in the box.',ar:'استعمل العملية العكسية واختر العدد المفقود.',
    rounds:[{q:'□ + 6 = 14',o:['8','6','20']},{q:'20 − □ = 13',o:['7','33','6']},{q:'□ − 5 = 9',o:['14','4','9']},{q:'12 + □ = 21',o:['9','8','33']},{q:'□ + 9 = 23',o:['14','12','32']}]},
  quiz:[{q:'Which number sentence is in the fact family of 12, 9 and 21?',o:['21 − 9 = 12','12 − 9 = 21','9 + 21 = 12']},{q:'12 + 9 = ?',o:['21','23','19'],why:'The booklet printed 23 by mistake. 12 + 9 = 21.'},{q:'If 35 + 10 = 45, then 45 − 10 = ?',o:['35','55','45']},{q:'□ + 4 = 10',o:['6','14','4']}],
  home:[['Show a fact family three ways: part-whole, a bar model and four number sentences.','اعرض عائلة الأعداد بثلاث طرق.'],['Use 12, 9 and 21 (the booklet has a typo).','استعملا 12 و9 و21.']]
};
WC.shapes2d={
  learn:{body:['2D shapes are flat shapes.','Sides are the straight lines. Vertices (corners) are where two sides meet.','A line of symmetry cuts a shape into two halves that match exactly. Fold on the line and the halves fit on top of each other.','A square has 4 lines of symmetry. A rectangle has only 2: the diagonal does not work!'],
    words:[['sides','أضلاع'],['vertices','رؤوس'],['symmetry','تناظر'],['pentagon','خماسي'],['hexagon','سداسي']],
    flap:{q:'How many lines of symmetry does a rectangle have?',a:'2: one across and one down. Folding on the diagonal does not match.'},
    ar:'الأشكال المسطّحة لها أضلاع ورؤوس. خط التناظر يقسم الشكل إلى نصفين متطابقين.'},
  try:{hint:'Choose a shape, then press Fold to fold it on a line of symmetry. Try the wrong fold on the rectangle!',ar:'اختر شكلاً واضغط Fold لتطويه.',
    pop(P){
      const SH=[['square',{n:4,R:1.2,rot:Math.PI/4},4,4,4],['rectangle',{rect:[2.5,1.35]},4,4,2],['triangle',{n:3,R:1.3,rot:Math.PI/2},3,3,3],['pentagon',{n:5,R:1.2},5,5,5],['hexagon',{n:6,R:1.2,rot:0},6,6,6],['circle',{R:1.15},0,0,'lots']];
      let cur=0,axis=0,busy=false,folds=0;const holder=new THREE.Group();holder.position.set(0,.03,-.05);P.root.add(holder);let parts=null,tagged=false;
      const shp=pts=>{const s=new THREE.Shape();pts.forEach((p,i)=>i?s.lineTo(p[0],p[1]):s.moveTo(p[0],p[1]));s.closePath();return s};
      function make(a){if(parts){untap(parts.g);P.untag(parts.g);PK.disposeTree(parts.g);holder.remove(parts.g)}const sd=SH[cur][1];const base=polyPts(sd);const rot=Math.PI/2-a,c=Math.cos(rot),s=Math.sin(rot);const rp=base.map(([x,y])=>[x*c-y*s,x*s+y*c]);
        const g=new THREE.Group();g.rotation.x=-Math.PI/2;const inner=new THREE.Group();inner.rotation.z=-rot;g.add(inner);
        const A=new THREE.Mesh(new THREE.ShapeGeometry(shp(clipHalf(rp,-1))),new THREE.MeshStandardMaterial({color:new THREE.Color('#b29bff'),side:THREE.DoubleSide,roughness:.7}));
        const piv=new THREE.Group();const B=new THREE.Mesh(new THREE.ShapeGeometry(shp(clipHalf(rp,1))),new THREE.MeshStandardMaterial({color:new THREE.Color('#ffd166'),side:THREE.DoubleSide,roughness:.7,transparent:true,opacity:.88}));B.position.z=.004;piv.add(B);
        const line=G.box(.03,3.1,.012,'#e0336f');line.position.z=.012;line.userData.noInk=true;inner.add(A,piv,line);[A,B].forEach(m=>{m.castShadow=true;m.receiveShadow=true});P.ink(inner,10);holder.add(g);parts={g,piv,line};P.tap(g,()=>fold());if(!tagged){tagged=true;P.tag(g,'👆 Tap to fold',{dy:.5})}}
      function info(){const [en,,sides,vtx,ax]=SH[cur];P.cap(`A ${en} has ${sides} sides and ${vtx} vertices. Lines of symmetry: ${ax}.`,'عدد الأضلاع والرؤوس وخطوط التناظر.')}
      async function fold(wrong){if(busy)return;busy=true;const sd=SH[cur][1];let a;if(wrong===true){a=sd.rect?Math.atan2(sd.rect[1],sd.rect[0]):Math.PI/4+.3}else{const ax=symAxes(sd);a=ax[axis%ax.length];axis++}
        make(a);Snd.whoosh();await E.anim(.7,k=>{parts.piv.rotation.y=Math.PI*Ease.inOut(k)});
        if(wrong===true){Snd.bad();P.cap('The halves do not match. That is NOT a line of symmetry.','النصفان لا ينطبقان.')}else{Snd.good();folds++;P.cap('The halves match exactly: a line of symmetry!','انطبق النصفان: خط تناظر.');if(folds>=3)P.done('You found 3 lines of symmetry!')}
        await E.wait(.9);if(!P.alive())return;await E.anim(.5,k=>{parts.piv.rotation.y=Math.PI*(1-Ease.inOut(k))});busy=false;info()}
      make(Math.PI/2);info();
      return {chips:[...SH.map(([en],i)=>({id:en,label:en,group:'s',on:i===0,fn:()=>{if(busy)return;cur=i;axis=0;make(symAxes(SH[i][1])[0]);info()}})),{label:'📐 Fold',cls:'gold',fn:()=>fold()},{label:'↘ Wrong fold',fn:()=>fold(true)}]};
    }},
  practise:{type:'pick',big:true,cols:4,title:'Find the shapes with 4 sides',how:'Tap every shape that has 4 sides.',ar:'اضغط كل شكل له 4 أضلاع.',say:false,no:'Count the sides again!',
    items:['square','triangle','rectangle','pentagon','kite','circle','rhombus','hexagon'].map(t=>[t,['square','rectangle','kite','rhombus'].includes(t)?1:0,null,(x,cx,cy,s)=>drawShape2(x,cx,cy,s,t)])},
  quiz:[{q:'How many sides does a pentagon have?',o:['5','6','4']},{q:'How many vertices does a hexagon have?',o:['6','5','8']},{q:'Which shape has 0 corners?',o:['circle','square','triangle']},{q:'A line of symmetry cuts a shape into…',o:['two matching halves','three parts','two different halves']}],
  home:[['Cut a square and a rectangle out of paper and fold them.','قصّا مربعاً ومستطيلاً من الورق واطوياهما.'],['How many folds give two matching halves?','كم طيّة تعطي نصفين متطابقين؟']]
};
WC.shapes3d={
  learn:{body:['3D shapes are solid: we can hold them.','Faces are the flat surfaces. Edges are where two faces meet. Vertices are the corners.','A cube has 6 faces, 12 edges and 8 vertices.','Open a cube out flat and you get its net: 6 squares.','Shapes with curved surfaces (sphere, cylinder, cone) can roll.'],
    words:[['faces','أوجه'],['edges','حواف'],['vertices','رؤوس'],['cube','مكعب'],['pyramid','هرم'],['net','شبكة']],
    flap:{q:'How many faces does a square-based pyramid have?',a:'5: one square and four triangles.'},
    ar:'المجسّمات لها أوجه وحواف ورؤوس. ابحثا عن الأشكال حولكما في البيت.'},
  try:{hint:'Drag the shape down to open it out into its net, and up to close it. Or press the buttons.',ar:'اسحب المجسّم للأسفل لتفتحه شبكةً.',
    pop(P){
      let kind='cube',f=0,goal=0;const opened=new Set();const holder=new THREE.Group();holder.position.set(0,0,.1);P.root.add(holder);let joints=[];const s=1.05;const cols=['#ff7b39','#ffd166','#3ddbb0','#6db4ff','#ff5d8f','#b29bff'];
      const face=(w,d,c)=>{const m=G.box(w,.025,d,c,{roughness:.7});m.position.y=.0125;return m};
      function build(){PK.disposeTree(holder);holder.clear();joints=[];const base=face(s,s,cols[0]);holder.add(base);
        if(kind==='cube'){for(let i=0;i<4;i++){const arm=new THREE.Group();arm.rotation.y=i*Math.PI/2;holder.add(arm);const piv=new THREE.Group();piv.position.z=s/2;arm.add(piv);const fc=face(s,s,cols[i+1]);fc.position.z=s/2;piv.add(fc);joints.push({piv,max:Math.PI/2});
            if(i===2){const p2=new THREE.Group();p2.position.z=s;piv.add(p2);const top=face(s,s,cols[5]);top.position.z=s/2;p2.add(top);joints.push({piv:p2,max:Math.PI/2})}}}
        else{const hp=s*.75,L=Math.hypot(hp,s/2),beta=Math.PI-Math.atan2(hp,s/2);const tg=new THREE.Shape();tg.moveTo(-s/2,0);tg.lineTo(s/2,0);tg.lineTo(0,L);tg.closePath();
          for(let i=0;i<4;i++){const arm=new THREE.Group();arm.rotation.y=i*Math.PI/2;holder.add(arm);const piv=new THREE.Group();piv.position.set(0,.02,s/2);arm.add(piv);const m=new THREE.Mesh(new THREE.ShapeGeometry(tg),new THREE.MeshStandardMaterial({color:new THREE.Color(cols[i+1]),side:THREE.DoubleSide,roughness:.7}));m.rotation.x=Math.PI/2;piv.add(m);joints.push({piv,max:beta})}}
        P.ink(holder,20);holder.traverse(o=>{if(o.isMesh){o.castShadow=o.receiveShadow=true}});pose();info()}
      function pose(){joints.forEach(j=>{j.piv.rotation.x=-j.max*(1-f)})}
      function info(){const d=kind==='cube'?['cube',6,12,8]:['square-based pyramid',5,8,5];P.cap(`A ${d[0]} has ${d[1]} faces, ${d[2]} edges and ${d[3]} vertices.`,'أوجه، حواف، رؤوس.')}
      build();P.drag(holder,{plane:'z',tagText:'✋ Drag down',tagDy:1.4,start(lp){this.y0=lp.y;this.f0=f;goal=null},move(lp){f=clamp(this.f0+(this.y0-lp.y)*.9,0,1)},end(){goal=f>.5?1:0}});
      return {chips:[{id:'cube',label:'🧊 Cube',group:'k',on:true,fn:()=>{kind='cube';f=0;goal=0;build()}},{id:'pyr',label:'🔺 Pyramid',group:'k',fn:()=>{kind='pyr';f=0;goal=0;build()}},{label:'📂 Open the net',cls:'gold',fn:()=>{goal=1;Snd.whoosh()}},{label:'📦 Close it',fn:()=>{goal=0;Snd.whoosh()}}],
        update(dt,t){if(goal!=null)f+=(goal-f)*Math.min(1,dt*3);pose();if(f>.95&&!opened.has(kind)){opened.add(kind);Snd.good();P.cap(kind==='cube'?'The net of a cube: 6 squares.':'The net of a pyramid: 1 square and 4 triangles.',kind==='cube'?'شبكة المكعب: 6 مربعات':'شبكة الهرم: مربّع و4 مثلثات');if(opened.size>=2)P.done('You opened both nets!')}holder.rotation.y=Math.sin(t*.4)*.3*(1-f)}};
    }},
  practise:{type:'pick',big:true,cols:3,title:'Which shapes can roll?',how:'Tap every 3D shape that can roll.',ar:'اضغط كل مجسّم يتدحرج.',say:true,no:'That one has only flat faces. It slides!',
    items:[['sphere',1,null,(x,cx,cy,s)=>drawSolid(x,cx,cy,s,'sphere')],['cube',0,null,(x,cx,cy,s)=>drawSolid(x,cx,cy,s,'cube')],['cylinder',1,null,(x,cx,cy,s)=>drawSolid(x,cx,cy,s,'cylinder')],['pyramid',0,null,(x,cx,cy,s)=>drawSolid(x,cx,cy,s,'pyramid')],['cone',1,null,(x,cx,cy,s)=>drawSolid(x,cx,cy,s,'cone')],['cuboid',0,null,(x,cx,cy,s)=>drawSolid(x,cx,cy,s,'cuboid')]]},
  quiz:[{q:'How many faces does a cube have?',o:['6','8','12']},{q:'How many edges does a cube have?',o:['12','6','8']},{q:'Which shape can roll?',o:['cylinder','cube','pyramid']},{q:'A cereal box is a…',o:['cuboid','sphere','cone']}],
  home:[['Look for 3D shapes around your home.','ابحثا عن المجسّمات في البيت.'],['Count the faces, edges and vertices of a box together.','عدّا أوجه علبة وحوافها ورؤوسها.']]
};

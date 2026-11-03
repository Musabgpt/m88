/* ===== Bright, the AI helper inside the book (engine) =====
   The AI providers of the MusabAI app (Musabgpt/C66: connectors/provider_pool.py, free_provider_adapters.py and
   phone_live/models.py), ported to the page. It is the same free-only pool in the same order, with the same health
   circuit breaker: cooldowns by error type, Retry-After, one short retry, then the next provider, and the Kilo
   gateway limit shared by its routes. For speed every reply is streamed, the fastest provider goes first, a second
   one starts if the first is slow to begin, and answers are kept on the device. Inside claude.ai the page can also ask Claude. When no provider answers, the
   book's own offline helper answers from the book, so the child never waits for nothing. */
const AI_KILO='https://api.kilo.ai/api/gateway';
const AI_SPECS=[
  {id:'claude/artifact',name:'Claude (inside claude.ai)',kind:'sample',note:'Only when the book is opened as a claude.ai page.'},
  {id:'kilo/auto-free',name:'Kilo Auto Free',base:AI_KILO,model:'kilo-auto/free',gw:'kilo',note:'No key needed. Public free tier, rate limited.'},
  {id:'groq/gpt-oss-120b-free',name:'Groq Free',base:'https://api.groq.com/openai/v1',model:'openai/gpt-oss-120b',secret:'groq',site:'console.groq.com'},
  {id:'gemini/3.7-flash-free',name:'Google Gemini Free',base:'https://generativelanguage.googleapis.com/v1beta/openai',model:'gemini-3.7-flash',secret:'gemini',site:'aistudio.google.com'},
  {id:'openrouter/free',name:'OpenRouter Free',base:'https://openrouter.ai/api/v1',model:'openrouter/free',secret:'openrouter',site:'openrouter.ai'},
  {id:'nvidia/nemotron-3-ultra-free',name:'NVIDIA Free Endpoint',base:'https://integrate.api.nvidia.com/v1',model:'nvidia/nemotron-3-ultra-550b-a55b',secret:'nvidia',nim:true,site:'build.nvidia.com'},
  {id:'nvidia/nemotron-3.5-lightning-free',name:'NVIDIA Nemotron 3.5 Lightning',base:'https://integrate.api.nvidia.com/v1',model:'nvidia/nemotron-3.5-lightning-30b-a3b',secret:'nvidia',site:'build.nvidia.com'},
  {id:'zhipu/glm-4.7-flash-free',name:'Zhipu GLM-4.7-Flash Free',base:'https://open.bigmodel.cn/api/paas/v4',model:'glm-4.7-flash',secret:'zhipu',site:'open.bigmodel.cn'},
  {id:'mistral/small-free',name:'Mistral (Experiment plan)',base:'https://api.mistral.ai/v1',model:'mistral-small-latest',secret:'mistral',site:'console.mistral.ai'},
  {id:'cerebras/free',name:'Cerebras Free',base:'https://api.cerebras.ai/v1',model:'auto',secret:'cerebras',site:'cloud.cerebras.ai'},
  {id:'custom/free',name:'Your own endpoint (OpenAI-compatible)',custom:true,secret:'custom'},
  {id:'aihorde/anonymous-free',name:'AI Horde Free',base:'https://oai.aihorde.net/v1',model:'auto',secret:'aihorde',anon:'0000000000',stream:true,lastResort:true,note:'No key needed. Volunteer computers: slow and sometimes busy.'}
];
const AI_KEYS=[['groq','Groq'],['gemini','Google Gemini'],['openrouter','OpenRouter'],['nvidia','NVIDIA'],['zhipu','Zhipu GLM'],['mistral','Mistral'],['cerebras','Cerebras'],['aihorde','AI Horde (optional)']];

class AIError extends Error{constructor(msg,status=0,body='',retryAfter=null,kind=''){super(msg);this.status=status;this.body=body||'';this.retryAfter=retryAfter;this.kind=kind}}
const aiSleep=ms=>new Promise(r=>setTimeout(r,ms));
const AI_RETRYABLE=new Set([404,408,429,500,502,503,504]);
function aiTimeoutErr(e){return e.kind==='timeout'||e.status===408||e.status===504||/timeout|timed out|stalled/i.test(e.message)}
function aiRetryable(e){if(e.kind==='timeout'||e.kind==='network')return true;if(AI_RETRYABLE.has(e.status))return true;
  return /overload|temporarily unavailable|service unavailable|timeout|timed out|stalled|rate limit|too many requests|connection reset|cannot reach|connection refused/i.test(e.message)}
/* Retry-After from the header, the JSON body or the message; never trust more than 30 minutes */
function aiRetryAfter(e){const vals=[e.retryAfter];try{const find=v=>{if(v&&typeof v==='object'){for(const k of ['retry_after','retry_after_seconds','retryAfter'])if(k in v)return v[k];for(const n of Object.values(v)){const f=find(n);if(f!=null)return f}}return null};vals.push(find(JSON.parse(e.body||'null')))}catch(_){}
  const m=String(e.message).match(/retry(?:-|\s*)after[^0-9]{0,12}(\d+(?:\.\d+)?)/i);if(m)vals.push(m[1]);
  for(const raw of vals){if(raw==null||raw==='')continue;let s=Number(raw);if(!isFinite(s)){const t=Date.parse(String(raw));if(isNaN(t))continue;s=(t-Date.now())/1000}if(isFinite(s)&&s>=0)return Math.max(1,Math.min(Math.ceil(s),1800))}return null}
function aiCooldown(e,failures){const st=e.status;let base=20;
  if(st===404)base=90;else if(st===429||/rate limit/i.test(e.message))base=30;else if([502,503,504].includes(st)||/overload/i.test(e.message))base=60;else if(st===401||st===403)base=300;else if(st===400)base=180;
  if(failures>=3)base=Math.max(base,120);return Math.max(base,aiRetryAfter(e)||0)}
function aiSafeError(e){const st=e.status,t=String(e.message).toLowerCase();
  if(st===401||st===403)return 'authentication failed';if(st===404)return 'capability unavailable';if(aiTimeoutErr(e))return 'timed out';
  if(st===429||t.includes('rate limit')||t.includes('too many requests'))return 'rate limited';if([500,502,503,504].includes(st)||t.includes('overload')||t.includes('temporarily unavailable'))return 'temporarily unavailable';
  if(e.kind==='network'||t.includes('cannot reach'))return 'connection failed';if(st===400)return 'request rejected';if(e.kind==='off')return 'turned off';return 'request failed'}
function aiStateName(e){const st=e.status;if(st===401||st===403)return 'auth_error';if(st===404)return 'capability_mismatch';if(aiTimeoutErr(e))return 'timeout';if(st===429)return 'rate_limited';if([500,502,503,504].includes(st)||/overload/i.test(e.message))return 'overloaded';return 'cooldown'}
/* the health circuit breaker shared by the pool (ProviderHealthManager in C66) */
const AIHealth={d:{},now:()=>performance.now()/1000,
  state(id){return this.d[id]||{}},
  available(id){return (this.state(id).until||0)<=this.now()},
  left(id){return Math.max(0,(this.state(id).until||0)-this.now())},
  success(id,lat){this.d[id]={state:'available',failures:0,until:0,lat:Math.round(lat*1000),at:Date.now()}},
  failure(id,e){const old=this.d[id]||{};const f=(old.failures||0)+1;this.d[id]={state:aiStateName(e),failures:f,until:this.now()+aiCooldown(e,f),err:aiSafeError(e),status:e.status||0,lat:old.lat,at:Date.now()}},
  clear(){this.d={}}};

/* transport: the Android app's native bridge (no CORS; it streams the reply in chunks), else fetch (streamed with a reader) */
const AINet={seq:0,pending:{},
  native(){return !!(window.BookNative&&typeof window.BookNative.http==='function')},
  /* one request: o.onChunk(text) gets the reply as it arrives, o.signal stops it */
  http(url,{method='POST',headers={},body='',timeout=45000,onChunk=null,signal=null}={}){
    if(this.native())return new Promise((res,rej)=>{const id=++this.seq;let got='';
      const cancel=()=>{try{window.BookNative.cancel&&window.BookNative.cancel(id)}catch(e){}};
      const fin=()=>{clearTimeout(t);delete this.pending[id];if(signal)signal.removeEventListener('abort',ab)};
      const ab=()=>{fin();cancel();rej(new AIError('cancelled',0,'',null,'cancelled'))};
      const t=setTimeout(()=>{fin();cancel();rej(new AIError('timed out',0,'',null,'timeout'))},timeout+5000);
      if(signal){if(signal.aborted){ab();return}signal.addEventListener('abort',ab)}
      this.pending[id]={chunk:c=>{got+=c;if(onChunk)try{onChunk(c)}catch(e){fin();cancel();rej(e)}},res:v=>{fin();if(!v.body&&got)v.body=got;res(v)},rej:e=>{fin();rej(e)}};
      try{if(onChunk&&typeof window.BookNative.stream==='function')window.BookNative.stream(id,method,url,JSON.stringify(headers),body||'',timeout);
        else window.BookNative.http(id,method,url,JSON.stringify(headers),body||'',timeout)}
      catch(e){fin();rej(new AIError('cannot reach the AI service',0,'',null,'network'))}});
    const ctl=new AbortController();let why='timeout';const t=setTimeout(()=>ctl.abort(),timeout);
    const ab=()=>{why='cancelled';ctl.abort()};if(signal){if(signal.aborted)ab();else signal.addEventListener('abort',ab)}
    return fetch(url,{method,headers,body:method==='GET'?undefined:body,signal:ctl.signal,credentials:'omit'})
      .then(async r=>{const h={'retry-after':r.headers.get('retry-after')||'','content-type':r.headers.get('content-type')||''};let text='';
        if(onChunk&&r.ok&&r.body&&r.body.getReader){const rd=r.body.getReader(),dec=new TextDecoder();for(;;){const {done,value}=await rd.read();if(done)break;const c=dec.decode(value,{stream:true});text+=c;onChunk(c)}}
        else text=await r.text();
        return {status:r.status,headers:h,body:text}})
      .catch(e=>{if(e instanceof AIError)throw e;const ab2=e&&e.name==='AbortError';throw new AIError(ab2?(why==='cancelled'?'cancelled':'timed out'):'cannot reach the AI service',0,'',null,ab2?why:'network')})
      .finally(()=>{clearTimeout(t);if(signal)signal.removeEventListener('abort',ab)})},
  chunk(id,text){const p=this.pending[id];if(p)p.chunk(String(text||''))},
  done(id,json){const p=this.pending[id];if(!p)return;let o;try{o=typeof json==='string'?JSON.parse(json):json}catch(e){o={status:0,error:'bad reply'}}
    if(!o.status){p.rej(new AIError(o.error==='timeout'?'timed out':o.error==='cancelled'?'cancelled':'cannot reach the AI service',0,'',null,o.error==='timeout'?'timeout':o.error==='cancelled'?'cancelled':'network'));return}
    const h={};Object.keys(o.headers||{}).forEach(k=>h[k.toLowerCase()]=o.headers[k]);p.res({status:o.status,headers:h,body:o.body||''})}
};
window.__bookHttpDone=(id,json)=>AINet.done(id,json);
window.__bookHttpChunk=(id,text)=>AINet.chunk(id,text);

/* what may be shown of a reply so far: never a model's private "thinking" */
const aiVisible=s=>String(s||'').replace(/<think>[\s\S]*?(<\/think>|$)/gi,'').replace(/^[\s\S]*?<\/think>/i,'');
/* a server-sent event stream read as it arrives; plain JSON replies are read at the end */
function aiSSE(onText){let buf='',out='',sse=null;
  return {push(c){buf+=c;if(sse===null){const s=buf.replace(/^\s+/,'');if(s)sse=/^(data:|event:|:)/.test(s)}if(!sse)return;
      let i;while((i=buf.indexOf('\n'))>=0){const line=buf.slice(0,i).trim();buf=buf.slice(i+1);if(!line.startsWith('data:'))continue;const d=line.slice(5).trim();if(!d||d==='[DONE]')continue;let ev;try{ev=JSON.parse(d)}catch(_){continue}
        if(ev.error)throw new AIError('generation failed',502,d);let add='';(ev.choices||[]).forEach(ch=>{const t=(ch.delta||ch.message||{}).content;if(typeof t==='string')add+=t});
        if(add){out+=add;if(onText){const v=aiVisible(out);if(v.trim())onText(v)}}}},
    text(){return out},isSSE(){return !!sse}}}
function aiParseCompletion(body){const raw=String(body||'');
  if(/^\s*(data:|event:)/.test(raw)){const s=aiSSE(null);s.push(raw+'\n');return aiVisible(s.text()).trim()}
  let j;try{j=JSON.parse(raw)}catch(_){throw new AIError('unreadable reply',502,raw.slice(0,400))}if(j.error)throw new AIError('provider error: '+String(j.error.message||j.error).slice(0,160),Number(j.error.code)||502,raw.slice(0,800));
  const m=((j.choices||[])[0]||{}).message||{};return aiVisible(Array.isArray(m.content)?m.content.map(p=>p&&(p.text||'')).join(''):String(m.content||'')).trim()}
const AIModels={};
async function aiResolveModel(spec,key){const c=AIModels[spec.id];if(c&&c.at>Date.now()-300000)return c.id;
  const r=await AINet.http(spec.base+'/models',{method:'GET',headers:key?{Authorization:'Bearer '+key}:{},timeout:15000});if(r.status>=400)throw new AIError(spec.name+' models HTTP '+r.status,r.status,r.body);
  let ids=[];try{ids=(JSON.parse(r.body).data||[]).map(m=>String(m&&m.id||'')).filter(Boolean)}catch(_){}
  ids=ids.filter(i=>!/embed|whisper|tts|guard|audio|image|vision-only|moderation|rerank/i.test(i));const pref=ids.find(i=>/instruct|chat|llama|qwen|gpt|mistral|gemma/i.test(i))||ids[0];
  if(!pref)throw new AIError(spec.name+' has no text model online',503);AIModels[spec.id]={id:pref,at:Date.now()};return pref}
/* one OpenAI-compatible chat call, always streamed so the first words show at once */
async function aiOpenAI(spec,key,messages,o){
  const model=!spec.model||spec.model==='auto'?await aiResolveModel(spec,key):spec.model;
  const stream=!spec.noStream;const body={model,messages:messages.map(m=>({role:m.role,content:m.content})),max_tokens:o.max||300,temperature:o.temp==null?.7:o.temp,stream};
  if(/gpt-oss/.test(model))body.reasoning_effort='low';
  if(spec.nim&&/^nvidia\/nemotron-3-ultra-/.test(model))body.reasoning_effort='none';
  const h={'Content-Type':'application/json',Accept:stream?'text/event-stream':'application/json'};if(key)h.Authorization='Bearer '+key;if(/openrouter\.ai/.test(spec.base))h['X-Title']='BrightSteps 3D Book';
  const sse=aiSSE(o.onText);
  const r=await AINet.http(spec.base.replace(/\/+$/,'')+'/chat/completions',{headers:h,body:JSON.stringify(body),timeout:o.timeout||40000,signal:o.signal,onChunk:stream?c=>sse.push(c):null});
  if(r.status===400&&stream&&/stream/i.test(r.body||'')){spec.noStream=true;return aiOpenAI(spec,key,messages,o)}
  if(r.status>=400)throw new AIError(spec.name+' HTTP '+r.status,r.status,r.body,r.headers['retry-after']||null);
  const text=sse.isSSE()?aiVisible(sse.text()).trim():aiParseCompletion(r.body);if(!text)throw new AIError('empty reply',502);
  if(!sse.isSSE()&&o.onText)o.onText(text);return text}
/* Claude, through the claude.ai page's own "sample" capability (no system role: the rules go in the first user turn) */
async function aiClaude(messages,o){const s=typeof Cap!=='undefined'&&Cap.sample;if(!s)throw new AIError('Claude is not available here',404);
  const sys=messages.filter(m=>m.role==='system').map(m=>m.content).join('\n\n');const rest=messages.filter(m=>m.role!=='system');
  const turns=rest.map((m,i)=>({role:m.role==='assistant'?'assistant':'user',content:i===0&&sys?sys+'\n\n'+m.content:m.content}));
  try{const r=await s(turns,{modelTier:'quick',cache:false,signal:o.signal,onText:o.onText?({text})=>o.onText(text):undefined});return String(r.text||'').trim()}
  catch(e){const c=e&&e.code||'upstream_error';if(c==='cancelled')throw new AIError('cancelled',0,'',null,'cancelled');const st=c==='rate_limited'?429:['not_granted','sampling_disabled','not_declared','capability_disabled','capability_removed','session_expired'].includes(c)?403:c==='refused'?400:c==='empty_completion'?502:503;throw new AIError('Claude: '+c,st,'',null,c)}}

/* how fast each provider starts answering (time to first words), remembered on this device */
const AISpeed={k:'bs-ai-speed-v1',m:null,
  load(){if(!this.m){try{this.m=JSON.parse(localStorage.getItem(this.k)||'{}')||{}}catch(e){this.m={}}}return this.m},
  get(id){return this.load()[id]},
  put(id,ms){const m=this.load();m[id]=m[id]?Math.round(m[id]*.6+ms*.4):Math.round(ms);try{localStorage.setItem(this.k,JSON.stringify(m))}catch(e){}}};
/* answers kept on this device for a week, so asking again is instant */
const AICache={k:'bs-ai-cache-v1',m:null,
  load(){if(!this.m){try{this.m=JSON.parse(localStorage.getItem(this.k)||'{}')||{}}catch(e){this.m={}}}return this.m},
  key(...parts){let h=5381;const s=parts.join('␟');for(let i=0;i<s.length;i++)h=((h<<5)+h+s.charCodeAt(i))|0;return 'a'+(h>>>0).toString(36)+'.'+s.length},
  get(key){const m=this.load(),e=m[key];if(!e)return null;if(Date.now()-e.t>7*864e5){delete m[key];return null}return e},
  put(key,text,prov){const m=this.load();m[key]={x:text,p:prov||'',t:Date.now()};const ks=Object.keys(m);if(ks.length>160)ks.sort((a,b)=>m[a].t-m[b].t).slice(0,ks.length-160).forEach(k=>delete m[k]);try{localStorage.setItem(this.k,JSON.stringify(m))}catch(e){}},
  take(key){const e=this.get(key);if(e){delete this.m[key];try{localStorage.setItem(this.k,JSON.stringify(this.m))}catch(_){}}return e}};

const BookAI={cfg:null,last:null,claudeOff:false,kilo:{at:0,list:[]},busy:0,
  load(){let c={};try{c=JSON.parse(localStorage.getItem('bs-ai-v1')||'{}')||{}}catch(e){}
    this.cfg=Object.assign({on:true,keys:{},custom:{base:'',model:'',key:''},first:'auto',voice:true,fast:true},c);this.cfg.keys=this.cfg.keys||{};this.cfg.custom=this.cfg.custom||{base:'',model:'',key:''};return this.cfg},
  save(){try{localStorage.setItem('bs-ai-v1',JSON.stringify(this.cfg))}catch(e){}},
  conf(){return this.cfg||this.load()},
  enabled(){return !!this.conf().on},
  key(spec){const c=this.conf();if(spec.custom)return c.custom.key||'';if(!spec.secret)return '';return (c.keys[spec.secret]||'').trim()||spec.anon||''},
  ready(spec){if(spec.kind==='sample')return !!(typeof Cap!=='undefined'&&Cap.sample)&&!this.claudeOff;const c=this.conf();
    if(spec.custom)return /^https:\/\//i.test(c.custom.base||'')&&!!c.custom.model;if(spec.secret&&!spec.anon&&!this.key(spec))return false;return true},
  available(spec){return AIHealth.available(spec.id)&&(!spec.gw||AIHealth.available('gateway:'+spec.gw))},
  /* C66 order: the chosen model first, then the free pool, Kilo's other zero-price routes, the user's own endpoint, AI Horde last */
  order(){const c=this.conf();let main=AI_SPECS.filter(s=>!s.lastResort&&!s.custom);
    if(c.first&&c.first!=='auto'){const f=AI_SPECS.find(s=>s.id===c.first);if(f)main=[f,...main.filter(s=>s!==f)]}
    return [...main,...this.kilo.list,AI_SPECS.find(s=>s.custom),AI_SPECS.find(s=>s.lastResort)].filter(Boolean)},
  candidates(includeCooling){const seen=new Set();return this.order().filter(s=>{if(seen.has(s.id))return false;seen.add(s.id);return this.ready(s)&&(includeCooling||this.available(s))})},
  /* for speed: providers that answered fast here go first (a grown-up's first choice stays first; AI Horde stays last) */
  ranked(){const list=this.candidates(),c=this.conf();if(!c.fast)return list;const pin=c.first&&c.first!=='auto'?c.first:null;
    const score=(s,i)=>s.id===pin?-1:s.lastResort?1e9:(AISpeed.get(s.id)||4000+i*50);return list.map((s,i)=>[s,score(s,i)]).sort((a,b)=>a[1]-b[1]).map(x=>x[0])},
  /* Kilo's real catalog: zero-price routes only, never inferred from a name; cached 5 minutes (30 s after a failure). Runs in the background. */
  async discoverKilo(){if(this.kilo.at>Date.now())return;this.kilo.at=Date.now()+30000;const ks=AI_SPECS.find(x=>x.gw==='kilo');
    try{const r=await AINet.http(ks.base+'/models',{method:'GET',headers:{},timeout:10000});if(r.status>=400)return;const data=JSON.parse(r.body||'{}');const rows=[];
      (data.data||[]).forEach(it=>{const p=it.pricing||{};if(['prompt','completion'].some(k=>Number(p[k]==null?-1:p[k])!==0))return;
        if(['request','image','internal_reasoning','web_search','input_cache_read','input_cache_write'].some(k=>Number(p[k]||0)!==0))return;const id=String(it.id||'');if(!id||id==='kilo-auto/free')return;
        rows.push({id:'kilo/'+id,name:'Kilo · '+id,base:ks.base,model:id,gw:'kilo'})});
      this.kilo={at:Date.now()+300000,list:rows.slice(0,16)}}catch(e){}},
  /* warm up: read Kilo's catalog (which also opens the connection) without making anyone wait */
  warm(){if(this.enabled()&&(this.conf().first==='auto'||String(this.conf().first).startsWith('kilo')))this.discoverKilo()},
  once(spec,messages,o){if(spec.kind==='sample')return aiClaude(messages,o);const c=this.conf();const s=spec.custom?Object.assign({},spec,{base:String(c.custom.base||'').replace(/\/+$/,''),model:c.custom.model}):spec;return aiOpenAI(s,this.key(spec),messages,o)},
  fail(spec,e){AIHealth.failure(spec.id,e);if(spec.kind==='sample'&&e.status===403)this.claudeOff=true;
    if(spec.gw&&[401,403,429].includes(e.status)){let meta={};try{meta=((JSON.parse(e.body||'{}')||{}).error||{}).metadata||{}}catch(_){}if(!String(meta.limit_source||'').startsWith('upstream_'))AIHealth.failure('gateway:'+spec.gw,e)}},
  async attempt(spec,messages,o){for(let a=0;a<2;a++){const t0=performance.now();let shown=false;const oo=Object.assign({},o,{onText:o.onText?t=>{shown=true;o.onText(t)}:null});
      try{const text=await this.once(spec,messages,oo);AIHealth.success(spec.id,(performance.now()-t0)/1000);return text}
      catch(e){const err=e instanceof AIError?e:new AIError(String(e&&e.message||e),0,'',null,'network');if(err.kind==='cancelled')throw err;err.shown=shown;
        if(shown||spec.kind==='sample'||!aiRetryable(err)||aiTimeoutErr(err)||err.status===404||err.status===429||a===1){this.fail(spec,err);throw err}
        await aiSleep(Math.min(1500,250*2**a+Math.random()*150))}}},
  /* the pool, raced: the fastest provider starts; if it has not started writing after a moment, the next one starts too,
     and the first to write wins (the others are stopped). A provider that fails before writing hands over to the next one. */
  chat(messages,o={}){if(!this.enabled())return Promise.reject(new AIError('the AI helper is turned off',0,'',null,'off'));
    this.warm();const cands=this.ranked();const hedgeMs=o.hedge||2600;
    return new Promise((resolve,reject)=>{let i=0,live=0,winner=null,done=false,hedgeT=0;const errors=[],ctls=new Map(),t0=performance.now();this.busy++;
      const finish=(err,res)=>{if(done)return;done=true;this.busy--;clearTimeout(hedgeT);ctls.forEach((c,id)=>{if(!res||id!==res.provider.id)c.abort()});err?reject(err):resolve(res)};
      const giveUp=()=>{const e=new AIError('Free AI providers are temporarily unavailable'+(errors.length?' ('+errors.join(' | ').slice(0,700)+')':''),503,'',null,'unavailable');e.errors=errors;e.retryAfter=this.nextRetry();finish(e)};
      const launch=()=>{while(i<cands.length&&!this.available(cands[i]))i++;if(i>=cands.length){if(!live)giveUp();return false}
        const spec=cands[i++];live++;const ctl=new AbortController();ctls.set(spec.id,ctl);let first=false;const ts=performance.now();
        const oo=Object.assign({},o,{signal:ctl.signal,onText:txt=>{if(done&&winner!==spec)return;if(!first){first=true;if(!winner){winner=spec;AISpeed.put(spec.id,performance.now()-ts);clearTimeout(hedgeT);ctls.forEach((c,id)=>{if(id!==spec.id)c.abort()})}}if(winner===spec&&o.onText)o.onText(txt,spec)}});
        this.attempt(spec,messages,oo).then(text=>{live--;if(done||(winner&&winner!==spec))return;if(!winner)AISpeed.put(spec.id,performance.now()-ts);winner=spec;this.last={id:spec.id,name:spec.name,at:Date.now()};finish(null,{text,provider:spec})})
          .catch(e=>{live--;if(done)return;if(e.kind==='cancelled'&&winner&&winner!==spec)return;if(e.kind!=='cancelled')errors.push(spec.name+': '+aiSafeError(e));
            if(winner===spec){winner=null;if(o.onReset)o.onReset()}if(!winner&&!live&&!launch()&&!live)giveUp()});
        clearTimeout(hedgeT);hedgeT=setTimeout(()=>{if(!done&&!winner&&live<2)launch()},hedgeMs);return true};
      if(!launch()&&!live)giveUp()})},
  nextRetry(){const w=this.candidates(true).filter(s=>{const st=AIHealth.state(s.id);return st.state!=='auth_error'&&st.state!=='capability_mismatch'&&st.status!==400}).map(s=>Math.max(AIHealth.left(s.id),s.gw?AIHealth.left('gateway:'+s.gw):0)).filter(x=>x>0);return w.length?Math.ceil(Math.min(...w)):null},
  status(spec){if(!this.ready(spec))return spec.kind==='sample'?{t:'Not here',c:'off'}:spec.custom?{t:'Not set',c:'off'}:{t:'Needs a key',c:'off'};
    const st=AIHealth.state(spec.id);if(!this.available(spec))return {t:'Resting '+Math.ceil(Math.max(AIHealth.left(spec.id),spec.gw?AIHealth.left('gateway:'+spec.gw):0))+' s',c:'warn'};
    const sp=AISpeed.get(spec.id);if(st.state==='available'||sp)return {t:'Fast ✓ '+((sp||st.lat||0)/1000).toFixed(1)+' s',c:'ok'};return {t:'Ready',c:'ok'}},
  reset(){AIHealth.clear();this.kilo={at:0,list:[]};this.claudeOff=false}
};

/* ---------- what Bright knows about the page, and the rules it follows ---------- */
const AI_RULES=`You are "Bright", the friendly helper who lives inside a 3D learning book for a Year 2 child (age 6 to 7) at a primary school in Birmingham, England.
Write for a 6 to 7 year old: simple UK English, short sentences, everyday words, UK spelling (colour, maths, favourite, mum).
Keep it short: 2 to 4 sentences, under 70 words, unless you are asked for a story (under 120 words).
Be warm and encouraging. Use at most one emoji.
Stay on safe school topics. If the child asks about anything scary, rude, violent, private or grown-up, say kindly that it is a question for a grown-up, and suggest something from this page instead.
Never ask for or repeat personal details (names, addresses, school, phone numbers, photos).
No links, no web addresses, no markdown symbols like * or #.
If you are not sure, say so simply. Follow the National Curriculum for England, Year 2.`;
function aiPageContext(sp,extra){if(!sp||!sp.w)return 'Page: the start of the book (how to use it and the contents).';const w=WB[sp.w],c=sp.c||WC[sp.w]||{},L=c.learn||{},ch=CH[w.d]||{};
  const lines=[`Topic: ${w.en} (Chapter ${ch.n||''}: ${ch.enName||''}).`];if(L.body)lines.push('The lesson says: '+L.body.map(p=>p.replace(/^EX:/,'Example: ').replace(/ {2,}/g,'; ')).join(' '));
  if(L.words)lines.push('Key words: '+L.words.map(x=>x[0]).join(', ')+'.');if(L.flap)lines.push(`Question in the book: ${L.flap.q} Answer: ${L.flap.a}`);
  if(c.try&&c.try.hint)lines.push('The 3D model on the page: '+c.try.hint);if(c.practise&&c.practise.title)lines.push('Practice game: '+c.practise.title+'.');
  if(extra)lines.push(extra);return lines.join('\n')}
const AI_TASKS={
  explain:{icon:'🔁',label:'Explain again',title:'Bright explains',p:'Explain the main idea of this page again in a new way, in 2 or 3 short sentences. Use one everyday example from home or school in England.',max:160},
  example:{icon:'🧩',label:'Another example',title:'Another example',p:'Give ONE new example for this page, like the examples in the lesson, and say in one sentence what it shows.',max:130},
  fact:{icon:'🤩',label:'Fun fact',title:'Did you know?',p:'Tell ONE amazing, true fact linked to this page that a 6 year old will love, in 1 or 2 sentences. Start with "Did you know".',max:110},
  story:{icon:'📖',label:'A story',title:'A tiny story',p:'Make up a very short story (under 90 words) that uses this page\'s key words. Set it in Birmingham. End with one question for the child.',max:260},
  quiz:{icon:'❓',label:'Quiz me',title:'Quiz time'},
  why:{icon:'🤔',label:'Why?',title:'Why did that happen?',p:'Explain why the thing in the 3D model happened, in 2 short sentences, as if you saw it too.',max:130},
  line:{icon:'🔍',label:'This sentence',title:'This sentence',p:'The child tapped this sentence in the book: «{text}». Explain just this sentence in a new, simple way, in 2 short sentences, with one tiny example.',max:130},
  word:{icon:'🔤',label:'This word',title:'Word magic',p:'The child tapped the key word «{text}». Say what it means in very simple words, then use it in one short sentence. Under 35 words.',max:90},
  hint:{icon:'💡',label:'Hint',title:'A little hint',p:'The child is answering this quiz question: «{text}». The choices are: {opts}. Give ONE gentle hint that helps them think. Do NOT say the answer or which letter. Under 30 words.',max:80},
  ask:{icon:'🎤',label:'Ask me',title:'You asked',p:'The child asks: «{text}». Answer them in 2 or 3 short sentences.',max:170},
  parents:{icon:'👪',label:'عربي للأهل',title:'للأهل',ar:true,p:'Reply in simple Modern Standard Arabic for a parent (not for the child): in 3 short sentences, say what the child is learning on this page and one easy way to help at home. Keep English school words in English.',max:220}
};
const AI_BAD=/\b(sex\w*|porn\w*|nude|naked|fuck\w*|shit\w*|bitch\w*|cunt|dick|bastard|wank\w*|rape\w*|suicid\w*|cocaine|heroin|weed|vodka|nigg\w*|slut|whore)\b/i;
function aiCleanIn(t){return String(t||'').replace(/[\w.+-]+@[\w-]+\.[\w.]+/g,'[email]').replace(/https?:\/\/\S+|www\.\S+/gi,'[link]').replace(/(\+?\d[\d\s-]{7,}\d)/g,'[number]').replace(/\s+/g,' ').trim().slice(0,240)}
function aiCleanOut(t,ar){let s=String(t||'').replace(/```[\s\S]*?```/g,'').replace(/\[([^\]]*)\]\([^)]*\)/g,'$1').replace(/\s*\b(?:see|visit|go to|check out|read more at)\b[:\s]*(?:https?:\/\/\S+|www\.\S+)/gi,'').replace(/https?:\/\/\S+|www\.\S+/gi,'').replace(/[*_#`>]+/g,'').replace(/[ \t]+/g,' ').replace(/ +([.,!?])/g,'$1').replace(/\n{3,}/g,'\n\n').trim();
  if(s.length>900){const cut=s.slice(0,900);const k=Math.max(cut.lastIndexOf('. '),cut.lastIndexOf('! '),cut.lastIndexOf('? '),cut.lastIndexOf('。'));s=(k>300?cut.slice(0,k+1):cut)+' …'}
  if(AI_BAD.test(s))return ar?'هذا سؤال للكبار. لنعد إلى صفحة الكتاب.':"That's a question for a grown-up. Shall we look at this page together instead? 😊";return s}

/* ---------- the offline helper: answers from the book itself ---------- */
const AI_NAMES=['Ava','Sam','Leo','Mia','Zain','Amira','Noah','Isla','Yusuf','Ruby'];
const AIOffline={
  answer(task,sp,o={}){if(!sp||!sp.w)return task==='ask'?"I can't think of new answers right now. Open a topic and I'll tell you about it! 📖":"Hi! I'm Bright ✨ Open a topic from the contents and tap me there.";const w=WB[sp.w],c=sp.c||WC[sp.w]||{},L=c.learn||{};
    const body=(L.body||[]).filter(p=>!p.startsWith('EX:')),ex=(L.body||[]).filter(p=>p.startsWith('EX:')).map(p=>p.slice(3).trim().replace(/ {2,}/g,' · ')),words=(L.words||[]).map(x=>x[0]);
    const near=t=>{const ws=String(t||'').toLowerCase().match(/[a-z]{3,}/g)||[];let best=null,bs=0;body.forEach(l=>{const sc=ws.filter(x=>l.toLowerCase().includes(x)).length;if(sc>bs){bs=sc;best=l}});return best};
    if(task==='explain')return 'Here is the big idea: '+body.slice(0,2).join(' ')+(words.length?' Key words: '+words.slice(0,4).join(', ')+'.':'');
    if(task==='example')return ex.length?'Look: '+pick(ex)+'. Can you make one of your own?':'Try the 3D model on the next page to see an example!';
    if(task==='fact')return L.flap?'Did you know? '+L.flap.a:'Did you know? '+(body[0]||w.en);
    if(task==='story'){const n=pick(AI_NAMES),k=shuffle(words).slice(0,3);return `One rainy day in Birmingham, ${n} opened a magic book about ${w.en}. Out jumped the word "${k[0]||w.en}"! ${k[1]?`Then came "${k[1]}"`:'It wanted to play'}${k[2]?` and "${k[2]}"`:''}. ${n} read every word, and the book glowed gold. ✨ What would you learn next, if you were ${n}?`}
    if(task==='why')return (o.note?'You saw: '+o.note+' ':'')+(body[0]?'That is because: '+body[0]:'');
    if(task==='line')return 'Let\'s read it slowly: '+(o.text||'')+(words.length?' Look for the key words: '+words.slice(0,3).join(', ')+'.':'');
    if(task==='word'){const t=String(o.text||'');const hit=(L.words||[]).find(x=>x[0].toLowerCase()===t.toLowerCase());const use=body.find(l=>l.toLowerCase().includes(t.toLowerCase()));return `"${t}"${hit&&hit[1]?' ('+hit[1]+')':''}. `+(use?'In the book: '+use:'Say it, then use it in a sentence of your own!')}
    if(task==='hint'){const l=near(o.text);return 'Here is a clue. Read the question again slowly. '+(l?'The lesson says: '+l:'Look back at the lesson page.')}
    if(task==='parents')return [L.ar,(c.home||[]).map(h=>h[1]).join(' · ')].filter(Boolean).join('\n');
    return "I can't think of new answers right now, but here is what the book says: "+body.slice(0,2).join(' ')+' You can ask a grown-up too! 😊'},
  /* the child answers an offline "Quiz me" with A, B or C */
  check(text){const p=this.pending;if(!p)return null;const m=String(text).trim().match(/^\(?([abc])\)?[.)]?\s*$/i)||null;let k=m?'abc'.indexOf(m[1].toLowerCase()):p.opts.findIndex(o=>o.toLowerCase()===String(text).trim().toLowerCase());if(k<0)return null;this.pending=null;
    return p.opts[k]===p.q.o[0]?'Yes! '+p.q.o[0]+' is right. ✓ '+(p.q.why||''):'Good try! The answer is '+p.q.o[0]+'. '+(p.q.why||'')}
};

/* ---------- endless questions: new quiz questions from the AI, or made by the book itself ---------- */
const QuizGen={seen:{},
  three(right,pool){const r=String(right);const others=shuffle([...new Set(pool.map(String))].filter(x=>x!==r));return others.length>=2?[r,others[0],others[1]]:null},
  near(n,lo=0){const s=new Set([n]);const c=shuffle([n+1,n-1,n+10,n-10,n+2,n-2]).filter(x=>x>=lo);for(const x of c){if(s.size>=3)break;s.add(x)}return [...s].map(String)},
  gens:{
    blocks(){const t=randi(1,9),o=randi(0,9),n=t*10+o;return pick([
      ()=>({q:`What number is ${t} tens and ${o} ones?`,o:[String(n),String(o*10+t),String(t+o)],why:`${t} tens is ${t*10}, and ${o} more makes ${n}.`}),
      ()=>({q:`How many tens are in ${n}?`,o:[String(t),String(o),String(n)],why:`${n} is ${t} tens and ${o} ones.`}),
      ()=>({q:`What is ${n} + 10?`,o:QuizGen.near(n+10),why:'Adding 10 makes the tens digit one bigger.'}),
      ()=>{const b=randi(2,9);return {q:`What is ${n} + ${b}?`,o:QuizGen.near(n+b),why:`${n} + ${b} = ${n+b}.`}},
      ()=>({q:`Partition ${n}: ${t*10} + ? = ${n}`,o:[String(o),String(t),String(n-o)],why:`${t*10} + ${o} = ${n}.`})])()},
    dice(){const a=randi(1,9),b=10-a,c=randi(1,6);return pick([
      ()=>({q:`What is ${a} + ${c} + ${b}?`,o:QuizGen.near(10+c),why:`Make 10 first: ${a} + ${b} = 10, then 10 + ${c} = ${10+c}.`}),
      ()=>({q:`Which two numbers make 10: ${a}, ${c===b?c+1:c} or ${b}?`,o:[`${a} and ${b}`,`${a} and ${c===b?c+1:c}`,`${c===b?c+1:c} and ${b}`],why:`${a} + ${b} = 10.`}),
      ()=>{const d=randi(2,6);return {q:`What is double ${d}?`,o:QuizGen.near(2*d),why:`${d} + ${d} = ${2*d}.`}}])()},
    balance(){const a=randi(3,12),b=randi(2,9),c=a+b;return pick([
      ()=>({q:`? + ${b} = ${c}. What is the missing number?`,o:QuizGen.near(a,0),why:`${c} − ${b} = ${a}.`}),
      ()=>({q:`If ${a} + ${b} = ${c}, what is ${c} − ${b}?`,o:QuizGen.near(a,0),why:'Subtraction undoes addition.'}),
      ()=>({q:`${c} − ? = ${a}. What is the missing number?`,o:QuizGen.near(b,0),why:`${c} − ${b} = ${a}.`})])()},
    shapes2d(){const S=[['triangle',3],['square',4],['rectangle',4],['pentagon',5],['hexagon',6],['octagon',8]];const [n,k]=pick(S);return pick([
      ()=>({q:`How many sides does a ${n} have?`,o:QuizGen.three(k,[3,4,5,6,8]),why:`A ${n} has ${k} straight sides.`}),
      ()=>({q:`How many corners (vertices) does a ${n} have?`,o:QuizGen.three(k,[3,4,5,6,8]),why:`A ${n} has ${k} corners.`}),
      ()=>({q:'Which shape has no straight sides?',o:['circle',...shuffle(['square','triangle','hexagon']).slice(0,2)],why:'A circle has one curved edge.'}),
      ()=>({q:`Which shape has ${k} sides?`,o:QuizGen.three(n,S.filter(s=>s[1]!==k).map(s=>s[0])),why:`A ${n} has ${k} sides.`})])()},
    shapes3d(){const S=[['cube',6,12,8],['cuboid',6,12,8],['square-based pyramid',5,8,5],['triangular prism',5,9,6],['cylinder',3,2,0],['cone',2,1,1],['sphere',1,0,0]];const [n,f,e,v]=pick(S);return pick([
      ()=>({q:`How many faces does a ${n} have?`,o:QuizGen.three(f,[1,2,3,4,5,6,8]),why:`A ${n} has ${f} face${f>1?'s':''}.`}),
      ()=>({q:`How many vertices (corners) does a ${n} have?`,o:QuizGen.three(v,[0,1,4,5,6,8,12]),why:`A ${n} has ${v} vertices.`}),
      ()=>({q:`How many edges does a ${n} have?`,o:QuizGen.three(e,[0,1,2,6,8,9,12]),why:`A ${n} has ${e} edges.`}),
      ()=>({q:'Which shape can roll?',o:[pick(['sphere','cylinder','cone']),...shuffle(['cube','cuboid','pyramid']).slice(0,2)],why:'A curved surface lets a shape roll.'})])()},
    phonics(){const fam=pick(SOUNDS.filter(s=>s.sp.length>1));const [a,b]=shuffle(fam.sp);const target=pick(fam.words[a[0]]||[a[1]]);const right=pick(fam.words[b[0]]||[b[1]]);
      const wrong=shuffle(ALLW.filter(x=>x.f!==fam.k)).slice(0,2).map(x=>x.w);return {q:`Which word has the same sound as "${target}"?`,o:[right,...wrong],why:`"${a[0]}" and "${b[0]}" can make the same sound.`}},
    tricky(){const t=pick(TRICKY),w=t.w;const mis=[...new Set([w.replace(/(.)(.)/,'$2$1'),w.replace(/[aeiou]/,'u'),w.replace(/gh|ough|au|ey|ou/,'o'),w.slice(0,-1),w+'e'])].filter(x=>x!==w&&x.length>1);
      return mis.length>=2?{q:'Which spelling is right?',o:[w,...shuffle(mis).slice(0,2)],why:`"${w}" is a tricky word. Look, say, cover, write, check!`}:null}
  },
  fromPractise(g){const out=[];if(!g||!g.type)return out;const T=g.type,st=x=>stripTags(String(x));
    if(T==='sort'){const bins=g.bins.map(b=>b[0]);g.items.forEach(([t,k])=>{const lab=typeof k==='number'?bins[k]:k;const o=QuizGen.three(lab,bins);if(o)out.push({q:`Where does "${st(t)}" go?`,o,why:`"${st(t)}" goes in "${lab}".`})})}
    if(T==='pick'){const yes=g.items.filter(i=>i[1]).map(i=>st(i[0])),no=g.items.filter(i=>!i[1]).map(i=>st(i[0]));if(no.length>=2)yes.forEach(y=>out.push({q:(g.title||'Which one?').replace(/[.!]$/,'')+': which one?',o:[y,...shuffle(no).slice(0,2)],why:`"${y}" is the right one.`}))}
    if(T==='order'){const it=g.items.map(st);for(let i=0;i<it.length-1;i++){const o=QuizGen.three(it[i+1],it.filter((_,j)=>j!==i));if(o)out.push({q:`What comes after "${it[i]}"?`,o,why:`After "${it[i]}" comes "${it[i+1]}".`})}}
    if(T==='fill'){let rs=[];try{rs=g.gen?g.gen():g.rounds||[]}catch(e){}rs.filter(r=>r&&!r.draw&&r.q&&r.o&&r.o.length>=2).forEach(r=>out.push({q:st(r.q),o:r.o.slice(0,3).map(st),why:''}))}
    if(T==='match'){const rights=g.pairs.map(p=>String(p[1]));const lead=g.title&&g.title.length<34?g.title.replace(/[.!]$/,'')+': ':'';g.pairs.forEach(([a,b])=>{const o=QuizGen.three(b,rights);if(o)out.push({q:lead+`what goes with "${st(a)}"?`,o,why:`"${st(a)}" goes with "${st(b)}".`})})}
    return out},
  valid(q){if(!q||typeof q.q!=='string'||!Array.isArray(q.o))return false;const o=q.o.map(x=>String(x).trim());return q.q.trim().length>3&&q.q.length<=160&&o.length===3&&o.every(x=>x&&x.length<=48)&&new Set(o.map(x=>x.toLowerCase())).size===3&&!AI_BAD.test(q.q+' '+o.join(' '))},
  make(wid,n=4){const c=WC[wid]||{};let pool=[];const g=this.gens[wid];if(g)for(let i=0;i<12;i++){try{const q=g();if(q)pool.push(q)}catch(e){}}
    pool=pool.concat(this.fromPractise(c.practise),(c.quiz||[]).map(q=>({q:q.q,o:q.o.slice(0,3),why:q.why||''}))).map(q=>Object.assign({},q,{o:(q.o||[]).map(x=>String(x))})).filter(q=>this.valid(q));
    const seen=this.seen[wid]||(this.seen[wid]=[]);let fresh=shuffle(pool).filter(q=>!seen.includes(q.q));if(fresh.length<n){seen.length=0;fresh=shuffle(pool)}
    const out=[];for(const q of fresh){if(out.some(x=>x.q===q.q))continue;out.push(q);if(out.length>=n)break}out.forEach(q=>seen.push(q.q));if(seen.length>48)seen.splice(0,seen.length-48);return out},
  /* ask the AI for new questions; anything that fails the checks is filled from the book's own maker */
  async fresh(wid,n=4){const sp=SPREADS.find(s=>s.w===wid&&s.kind==='learn')||{w:wid,c:WC[wid]};const old=((GQX[wid]&&GQX[wid].qs)||WC[wid].quiz||[]).map(q=>q.q);let qs=[],src='book',prov=null;
    if(BookAI.enabled()){try{const p=`Write ${n} NEW multiple-choice questions for a Year 2 child (age 6 to 7) in England about this page.\n${aiPageContext(sp)}\nRules: each question under 16 words; exactly 3 short answer options (under 5 words each); the FIRST option is the correct one; only one correct answer; UK spelling; no trick questions; a "why" under 15 words.\nDo not repeat these questions: ${old.join(' | ')}\nReply with JSON only, like: {"questions":[{"q":"...","o":["correct","wrong","wrong"],"why":"..."}]}`;
        const r=await BookAI.chat([{role:'system',content:AI_RULES},{role:'user',content:p}],{max:700,temp:.8});prov=r.provider;
        const raw=r.text.replace(/```(?:json)?/gi,'');const j=JSON.parse(raw.slice(raw.indexOf('{'),raw.lastIndexOf('}')+1));
        qs=(j.questions||[]).map(q=>({q:aiCleanOut(q.q).replace(/\s+/g,' '),o:(q.o||q.options||[]).slice(0,3).map(x=>aiCleanOut(String(x))),why:aiCleanOut(q.why||'')})).filter(q=>this.valid(q)&&!old.includes(q.q)).slice(0,n);if(qs.length)src='ai'}catch(e){}}
    if(qs.length<n)qs=qs.concat(this.make(wid,n).filter(q=>!qs.some(x=>x.q===q.q))).slice(0,n);return {qs,src,provider:prov}}
};
const GQX={};

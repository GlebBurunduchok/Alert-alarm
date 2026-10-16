import {AlarmDevice,publicPushKey,deliverPush} from './push.mjs';
export {AlarmDevice};
const REGION_IDS=new Set(['3','4','5','8','9','10','11','12','13','14','15','16','17','18','19','20','21','22','23','24','25','26','27','28','29','30','31']);
const UPSTREAM='https://api.alerts.in.ua/v1/alerts/active.json';
const INTERVAL=60000,MAX_AGE=90000;
function json(data,status=200,extra={}){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',...extra}})}
export function normalizeAlerts(data){
 if(!data||!Array.isArray(data.alerts)||data.alerts.length>30000)throw new Error('format:alerts');
 return data.alerts.map(a=>{
  if(!a||typeof a.alert_type!=='string'||!/^\d+$/.test(String(a.location_uid??'')))throw new Error('format:location');
  if(a.alert_type==='air_raid'&&!REGION_IDS.has(String(a.location_uid))&&!/^\d+$/.test(String(a.location_oblast_uid??'')))throw new Error('format:oblast');
  if(a.threats!==undefined&&!Array.isArray(a.threats))throw new Error('format:threats');
  return {uid:String(a.location_uid),oblast:String(a.location_oblast_uid??''),type:a.alert_type,finished:!!a.finished_at,level:a.alert_level,levels:(a.threats||[]).map(t=>t?.level)};
 });
}
export function regionStatus(alerts,uid){
 const relevant=alerts.filter(a=>!a.finished&&a.type==='air_raid'&&(a.uid===uid||a.oblast===uid));
 if(!relevant.length)return {status:'N',reason:'API не повідомляє активної повітряної тривоги в області та її районах.'};
 const levels=new Set();let ambiguous=false;
 for(const a of relevant){const known=[a.level,...a.levels].filter(l=>l==='red'||l==='yellow');if(!known.length)ambiguous=true;for(const l of known)levels.add(l)}
 if(ambiguous)return {status:'P',reason:'API повідомляє активну тривогу, але не уточнює рівень частини записів.'};
 return {status:levels.has('red')&&levels.has('yellow')?'B':levels.has('red')?'R':'Y',reason:'Офіційний API alerts.in.ua · враховано область та її райони.'};
}
// One globally named coordinator prevents one upstream request per visitor/region.
// Only public alert data and timing are stored; the token is read from a secret.
export class AlertsCoordinator{
 constructor(ctx,env){this.ctx=ctx;this.env=env;this.pending=null;this.state={nextFetchAt:0,snapshot:null,failure:null};this.ready=ctx.blockConcurrencyWhile(async()=>{this.state=await ctx.storage.get('state')||this.state;this.vapid=await ctx.storage.get('vapid')||null})}
 async refresh(){
  const now=Date.now();this.state.nextFetchAt=now+INTERVAL;
  await this.ctx.storage.put('state',this.state);
  try{
   const headers={Authorization:'Bearer '+this.env.ALERTS_TOKEN,Accept:'application/json'};
   if(this.state.snapshot?.lastModified)headers['If-Modified-Since']=this.state.snapshot.lastModified;
   const r=await fetch(UPSTREAM,{headers,redirect:'manual',signal:AbortSignal.timeout(10000)});
   if(r.status===304&&this.state.snapshot){this.state.snapshot.checkedAt=Date.now();this.state.failure=null}
   else if(!r.ok){
    const messages={401:'Токен API недійсний або відкликаний. Перевірте секрет ALERTS_TOKEN на сервері.',403:'API відхилив запит сервера. Перевірте доступ у підтримки alerts.in.ua.',429:'API обмежив частоту запитів. Сервер зачекає перед повтором.'};
    const retry=Number(r.headers.get('retry-after'));this.state.nextFetchAt=Date.now()+(r.status===401||r.status===403?300000:r.status===429?Math.min(3600000,Math.max(120000,Number.isFinite(retry)?retry*1000:120000)):INTERVAL);
    this.state.failure={code:r.status,reason:messages[r.status]||'Джерело тимчасово недоступне.'};
   }else{
    const text=await r.text();if(text.length>5000000)throw new Error('format');
    const alerts=normalizeAlerts(JSON.parse(text));this.state.snapshot={alerts,checkedAt:Date.now(),lastModified:r.headers.get('last-modified')||''};this.state.failure=null;
   }
  }catch(error){const safeMessage=String(error?.message||'').split(String(this.env.ALERTS_TOKEN)).join('[redacted]').slice(0,220);console.error('alerts-upstream: '+safeMessage);const code=/^format:(alerts|location|oblast|threats)$/.test(error?.message)?error.message:error?.name==='SyntaxError'?'format:json':error?.name==='TimeoutError'?'network:timeout':'network:fetch';this.state.failure={code:502,reason:'Не вдалося отримати коректні дані API ['+code+']. Дзвінок буде за часом.'}}
  await this.ctx.storage.put('state',this.state);
 }
 async fetch(request){
  await this.ready;
  const route=new URL(request.url).pathname;if(route==='/push-key')return json({publicKey:await publicPushKey(this)});if(route==='/send-push')return deliverPush(this,request);
  const uid=new URL(request.url).searchParams.get('uid');
  if(!REGION_IDS.has(uid))return json({reason:'Оберіть область або місто зі списку.'},400);
  if(!this.env.ALERTS_TOKEN)return json({reason:'На сервері ще не додано секрет ALERTS_TOKEN.'},503);
  if(Date.now()>=this.state.nextFetchAt){if(!this.pending)this.pending=this.refresh().finally(()=>{this.pending=null});await this.pending}else if(this.pending)await this.pending;
  const now=Date.now(),snapshot=this.state.snapshot,retryAfter=Math.max(1,Math.ceil((this.state.nextFetchAt-now)/1000));
  if(this.state.failure)return json({status:'?',reason:this.state.failure.reason,source:'official-api',retryAfter},503,{'retry-after':String(retryAfter)});
  if(!snapshot||now-snapshot.checkedAt>MAX_AGE)return json({status:'?',reason:'Дані API застаріли. Дзвінок буде за часом.',retryAfter},503);
  return json({...regionStatus(snapshot.alerts,uid),source:'official-api',checkedAt:snapshot.checkedAt,serverTime:now,ageMs:Math.max(0,now-snapshot.checkedAt),validForMs:MAX_AGE,pollAfter:INTERVAL});
 }
}
export default{
 async fetch(request,env){
  const url=new URL(request.url);
  if(!url.pathname.startsWith('/api/'))return env.ASSETS?env.ASSETS.fetch(request):new Response('Not found',{status:404});
  const allowed=env.ALLOWED_ORIGIN||'https://glebburunduchok.github.io',origin=request.headers.get('Origin');
  if(origin&&origin!==allowed&&origin!==url.origin)return json({reason:'Цей сайт не має дозволу на доступ.'},403);
  const cors=origin?{'access-control-allow-origin':origin,'vary':'Origin'}:{};
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{...cors,'access-control-allow-methods':'GET, POST, DELETE, OPTIONS','access-control-allow-headers':'Content-Type, Authorization','access-control-max-age':'86400'}});
  if(url.pathname==='/api/push-key'&&request.method==='GET'){const stub=env.ALERTS_COORDINATOR.get(env.ALERTS_COORDINATOR.idFromName('all-alerts-v1'));const r=await stub.fetch('https://coordinator/push-key');return new Response(r.body,{status:r.status,headers:{...cors,'content-type':'application/json','cache-control':'no-store'}})}
  const device=url.pathname.match(/^\/api\/device\/([a-f0-9-]{36})$/);
  if(device){
   if(!env.ALARM_DEVICES)return json({reason:'Сервер сповіщень ще не оновлено.'},503,cors);
   const stub=env.ALARM_DEVICES.get(env.ALARM_DEVICES.idFromName(device[1]));
   try{const response=await stub.fetch(new Request('https://device/manage',{method:request.method,headers:{Authorization:request.headers.get('Authorization')||''},body:['POST','PUT'].includes(request.method)?request.body:undefined}));return new Response(response.body,{status:response.status,headers:{...cors,'content-type':'application/json','cache-control':'no-store'}})}catch{return json({reason:'Не вдалося зберегти сповіщення.'},503,cors)}
  }
  if(request.method!=='GET')return json({reason:'Method not allowed'},405,cors);
  if(url.pathname==='/api/health')return json({configured:!!env.ALERTS_TOKEN,coordinator:!!env.ALERTS_COORDINATOR,intervalSeconds:60},200,cors);
  if(url.pathname!=='/api/status')return json({reason:'Not found'},404,cors);
  const uid=url.searchParams.get('uid');if(!REGION_IDS.has(uid))return json({reason:'Оберіть область або місто зі списку.'},400,cors);
  if(!env.ALERTS_COORDINATOR)return json({reason:'Не налаштовано AlertsCoordinator. Розгорніть проєкт із wrangler.jsonc.'},503,cors);
  try{
   const stub=env.ALERTS_COORDINATOR.get(env.ALERTS_COORDINATOR.idFromName('all-alerts-v1'));
   const response=await stub.fetch('https://coordinator/api/status?uid='+uid);
   const headers=new Headers(response.headers);for(const [key,value]of Object.entries(cors))headers.set(key,value);
   return new Response(response.body,{status:response.status,headers});
  }catch{return json({status:'?',reason:'Сервер тимчасово недоступний. Дзвінок буде за часом.'},503,cors)}
 }
};

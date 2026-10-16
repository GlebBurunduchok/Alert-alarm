import {buildPushPayload} from '@block65/webcrypto-web-push';
import {finishOccurrence} from './alarm-engine.mjs';
import {delayNotice} from './delay-notice.mjs';
const allowedIds=new Set(['3','4','5','8','9','10','11','12','13','14','15','16','17','18','19','20','21','22','23','24','25','26','27','28','29','30','31']);
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const b64=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
export function validSubscription(sub){
 if(!sub||typeof sub.endpoint!=='string'||sub.endpoint.length>2048)return false;
 let url;try{url=new URL(sub.endpoint)}catch{return false}
 const host=url.hostname;
 const allowed=host==='fcm.googleapis.com'||host==='updates.push.services.mozilla.com'||host.endsWith('.push.services.mozilla.com')||host==='web.push.apple.com'||host.endsWith('.push.apple.com')||host.endsWith('.notify.windows.com');
 return url.protocol==='https:'&&!url.port&&!url.username&&!url.password&&!url.hash&&allowed&&/^[A-Za-z0-9_-]{86,88}$/.test(sub.keys?.p256dh||'')&&/^[A-Za-z0-9_-]{22,24}$/.test(sub.keys?.auth||'');
}
export async function publicPushKey(coordinator){
 if(coordinator.vapid)return coordinator.vapid.publicKey;
 if(!coordinator.vapidPending)coordinator.vapidPending=(async()=>{
  const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
  const publicKey=b64(await crypto.subtle.exportKey('raw',pair.publicKey));
  const privateKey=(await crypto.subtle.exportKey('jwk',pair.privateKey)).d;
  coordinator.vapid={subject:'https://tykhyi-ranok-api.glebkrupnik.workers.dev',publicKey,privateKey};
  await coordinator.ctx.storage.put('vapid',coordinator.vapid);return publicKey;
 })().finally(()=>{coordinator.vapidPending=null});
 return coordinator.vapidPending;
}
export async function deliverPush(coordinator,request){
 const data=await request.json();if(!validSubscription(data.subscription)||!data.notice||typeof data.notice.title!=='string'||data.notice.title.length>200||typeof data.notice.body!=='string'||data.notice.body.length>500)return json({reason:'Invalid push'},400);
 await publicPushKey(coordinator);
 try{
  const payload=await buildPushPayload({data:JSON.stringify(data.notice),options:{ttl:120}},data.subscription,coordinator.vapid);
  const response=await fetch(data.subscription.endpoint,{...payload,redirect:'manual',signal:AbortSignal.timeout(10000)});
  return json({delivered:response.ok,expired:response.status===404||response.status===410,status:response.status},response.ok?200:502);
 }catch{return json({delivered:false,status:0},502)}
}
export class AlarmDevice{
 constructor(ctx,env){this.ctx=ctx;this.env=env;this.state=null;this.ready=ctx.blockConcurrencyWhile(async()=>{this.state=await ctx.storage.get('device')||null})}
 coordinator(){return this.env.ALERTS_COORDINATOR.get(this.env.ALERTS_COORDINATOR.idFromName('all-alerts-v1'))}
 async save(){await this.ctx.storage.put('device',this.state)}
 async reschedule(){
  if(!this.state?.subscription||!this.state.alarms.length||Date.now()>this.state.expiresAt){await this.ctx.storage.deleteAlarm();return}
  const next=Math.min(...this.state.alarms.map(a=>a.due>Date.now()?a.due:Date.now()+60000));
  await this.ctx.storage.setAlarm(Math.min(next,this.state.expiresAt));
 }
 async send(notice){
  const response=await this.coordinator().fetch(new Request('https://coordinator/send-push',{method:'POST',body:JSON.stringify({subscription:this.state.subscription,notice})}));
  const result=await response.json();if(result.expired){this.state.subscription=null;this.state.alarms=[];await this.save();await this.reschedule()}
  return result.delivered===true;
 }
 async fetch(request){
  await this.ready;
  const auth=request.headers.get('Authorization')||'';if(!/^Bearer [A-Za-z0-9_-]{43}$/.test(auth))return json({reason:'Device authorization required'},401);
  const token=auth.slice(7);if(this.state&&this.state.token!==token)return json({reason:'Invalid device authorization'},403);
  if(request.method==='DELETE'){this.state=null;await this.ctx.storage.deleteAll();await this.ctx.storage.deleteAlarm();return json({ok:true})}
  if(request.method!=='POST')return json({reason:'Method not allowed'},405);
  const text=await request.text();if(text.length>32768)return json({reason:'Device data too large'},413);
  let data;try{data=JSON.parse(text)}catch{return json({reason:'Invalid JSON'},400)}
  if(data.test){if(!this.state?.subscription)return json({reason:'Notifications are not enabled'},400);return json({delivered:await this.send({title:'🔔 Сповіщення працюють',body:'Коли будильник чекатиме відбою, тут з’явиться повідомлення з рівнем небезпеки.',tag:'test-notification'})})}
  if(!validSubscription(data.subscription)||!allowedIds.has(String(data.region))||!Array.isArray(data.alarms)||data.alarms.length>50||!Number.isSafeInteger(data.revision))return json({reason:'Invalid device settings'},400);
  if(this.state&&data.revision<=this.state.revision)return json({ok:true,unchanged:true});
  const now=Date.now(),alarms=[];
  for(const a of data.alarms){
   if(!a||typeof a.id!=='string'||a.id.length>80||!Number.isFinite(a.due)||a.due<now-86400000||a.due>now+10*86400000||!/^([01]\d|2[0-3]):[0-5]\d$/.test(a.time)||!Array.isArray(a.days)||a.days.some(d=>!Number.isInteger(d)||d<0||d>6)||typeof a.yellow!=='boolean'||typeof a.red!=='boolean')return json({reason:'Invalid alarm'},400);
   try{new Intl.DateTimeFormat('uk-UA',{timeZone:a.zone}).format()}catch{return json({reason:'Invalid timezone'},400)}
   const old=this.state?.alarms.find(x=>x.id===a.id&&x.due===a.due);
   alarms.push({id:a.id,due:a.due,time:a.time,days:a.days,zone:a.zone,yellow:a.yellow,red:a.red,enabled:true,notified:old?.notified||''});
  }
  this.state={token,region:String(data.region),subscription:data.subscription,revision:data.revision,expiresAt:now+14*86400000,alarms};
  await this.save();await this.reschedule();return json({ok:true,watching:alarms.length});
 }
 async alarm(){
  await this.ready;if(!this.state?.subscription)return;
  const now=Date.now();if(now>=this.state.expiresAt){this.state=null;await this.ctx.storage.deleteAll();await this.ctx.storage.deleteAlarm();return}
  const revision=this.state.revision,due=this.state.alarms.filter(a=>a.due<=now);
  if(due.length){
   let status=null;try{const response=await this.coordinator().fetch('https://coordinator/api/status?uid='+this.state.region);if(response.ok)status=(await response.json()).status}catch{}
   if(!this.state||this.state.revision!==revision){await this.reschedule();return}
   for(const a of due){
    if(!this.state?.subscription||this.state.revision!==revision)break;
    const waiting=(a.yellow&&['Y','B'].includes(status))||(a.red&&['R','B'].includes(status));
    if(waiting){const notice=delayNotice(a,status);if(a.notified!==notice.level){const sent=await this.send(notice);if(sent)a.notified=notice.level}}
    else if(status!=='P'){
     try{finishOccurrence(a,now);a.notified=''}catch{a.enabled=false}
    }
   }
   if(this.state){this.state.alarms=this.state.alarms.filter(a=>a.enabled);await this.save()}
  }
  await this.reschedule();
 }
}

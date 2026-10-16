const CACHE='quiet-morning-shell-v4';
self.addEventListener('install',event=>{event.waitUntil((async()=>{try{const cache=await caches.open(CACHE);await cache.add(new URL('./',self.registration.scope).href)}catch{}await self.skipWaiting()})())});
self.addEventListener('activate',event=>{event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith('quiet-morning-shell-')&&key!==CACHE)await caches.delete(key);await self.clients.claim()})())});
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);if(event.request.mode!=='navigate'||url.origin!==self.location.origin)return;
 event.respondWith((async()=>{try{const r=await fetch(event.request);if(r.ok){const cache=await caches.open(CACHE);await cache.put(new URL('./',self.registration.scope).href,r.clone())}return r}catch{const cached=await caches.match(new URL('./',self.registration.scope).href);return cached||Response.error()}})());
});
self.addEventListener('push',event=>{event.waitUntil((async()=>{
 let data={};try{data=event.data?.json()||{}}catch{}
 const title=typeof data.title==='string'?data.title.slice(0,200):'Тихий ранок';
 await self.registration.showNotification(title,{body:typeof data.body==='string'?data.body.slice(0,500):'Відкрийте додаток, щоб переглянути стан будильника.',tag:typeof data.tag==='string'?data.tag:'quiet-morning',icon:new URL('icon.svg',self.registration.scope).href,data:{url:self.registration.scope}});
})())});
self.addEventListener('notificationclick',event=>{event.notification.close();event.waitUntil((async()=>{const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});const client=windows.find(c=>c.url.startsWith(self.registration.scope));if(client)return client.focus();return self.clients.openWindow(self.registration.scope)})())});

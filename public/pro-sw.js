// ContrataCR Pro web app (row 73, PWA only). The ONLY thing cached is a static offline page; no API response, account data or
// document is ever stored, so switching accounts cannot leak anything. Navigations to the Pro space fall back to that page offline.
const CACHE='ccr-pro-shell-v1',OFFLINE='/pro-offline.html';
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.add(OFFLINE)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('ccr-pro-shell-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{
 const request=event.request;
 if(request.mode!=='navigate'||request.method!=='GET')return;
 const path=new URL(request.url).pathname;
 if(!/^\/(?:en\/)?dashboard\/pro(?:\/|$)/.test(path)&&!/^\/(?:en\/)?dashboard\/profesional(?:\/|$)/.test(path))return;
 event.respondWith(fetch(request).catch(()=>caches.open(CACHE).then(cache=>cache.match(OFFLINE)).then(response=>response||Response.error())));
});

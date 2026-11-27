// Run: node --test scripts/directory/place-request-notice.test.mjs
// «Agregar mi empresa» decision notice (2026-11-27): fake database, mock e-mail outbox, no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';

const src=new URL('../../src/',import.meta.url).href;
const pushes=[];globalThis.__pushes=pushes;
registerHooks({resolve(spec,ctx,next){
 if(spec==='server-only')return {url:'data:text/javascript,export{}',shortCircuit:true};
 if(spec==='@/lib/push/notify')return {url:'data:text/javascript,'+encodeURIComponent('export async function sendNotificationPush(x){globalThis.__pushes.push(x)}'),shortCircuit:true};
 if(spec==='@/lib/rate-limit')return {url:'data:text/javascript,'+encodeURIComponent('export async function enforceRateLimitKey(){return null}'),shortCircuit:true};
 if(spec.startsWith('@/'))return next(src+spec.slice(2)+(/\.[a-z]+$/i.test(spec)?'':'.ts'),ctx);
 if(ctx.parentURL?.startsWith(src)&&spec.startsWith('.')&&!/\.[a-z]+$/i.test(spec))return next(spec+'.ts',ctx);
 return next(spec,ctx);
}});
const N=await import('../../src/lib/directory/place-request-notice.ts');
const P=await import('../../src/lib/email/provider.ts');
const C=await import('../../src/lib/localized-notification.ts');

function fakeDb(){
 const notifications=new Map();
 const tables={dir_place_actions:[{actor_id:'u1',placeId:'p1'}],dir_places:[{id:'p1',slug:'soda-dona-ana-abc123',name:'Soda Doña Ana'}],profiles:[{id:'u1',email:'ana@example.com'}]};
 return {notifications,from(t){
  const q={filters:{},eq(k,v){this.filters[k]=v;return this;},limit(){return this;},select(){return this;},
   async maybeSingle(){
    if(t==='dir_place_actions')return {data:tables[t].find(r=>r.placeId===this.filters['input->>placeId'])??null,error:null};
    return {data:tables[t].find(r=>r.id===this.filters.id)??null,error:null};},
   upsert(row){const dup=notifications.has(row.id);if(!dup)notifications.set(row.id,row);return {select:async()=>({data:dup?[]:[{id:row.id}],error:null})};}};
  return q;}};
}

test('publish: in-app notice with the claim link, push and e-mail once; a replay notifies nobody',async()=>{
 const db=fakeDb(),box=P.providerMockOutbox();box.length=0;pushes.length=0;
 const r=await N.notifyPlaceRequestDecision(db,{placeId:'p1',decision:'publish'});
 assert.equal(r.notified,true);
 const [row]=[...db.notifications.values()];
 assert.equal(row.type,'place_request_published');assert.equal(row.user_id,'u1');
 assert.equal(row.data.link,'/lugar/soda-dona-ana-abc123/reclamar');
 assert.equal(row.message,'"Soda Doña Ana" ya está publicado en ContrataCR. Reclámelo para administrar su ficha.');
 assert.equal(pushes.length,1);
 assert.equal(box.length,1);assert.equal(box[0].to,'ana@example.com');assert.match(box[0].subject,/Soda Doña Ana ya está en ContrataCR/);
 assert.match(box[0].text,/\/lugar\/soda-dona-ana-abc123\/reclamar/);
 const again=await N.notifyPlaceRequestDecision(db,{placeId:'p1',decision:'publish'});
 assert.equal(again.notified,false);assert.equal(db.notifications.size,1);assert.equal(pushes.length,1);assert.equal(box.length,1);
});

test('reject: short notice without a link; unknown place: nothing',async()=>{
 const db=fakeDb(),box=P.providerMockOutbox();box.length=0;
 await N.notifyPlaceRequestDecision(db,{placeId:'p1',decision:'reject'});
 const [row]=[...db.notifications.values()];
 assert.equal(row.type,'place_request_rejected');assert.equal(row.data.link,undefined);
 assert.match(row.message,/no fue aprobada/);assert.equal(box.length,1);assert.match(box[0].subject,/no fue aprobada/);
 assert.equal((await N.notifyPlaceRequestDecision(fakeDb(),{placeId:'zz',decision:'publish'})).notified,false);
});

test('the notification list renders both types in English too',()=>{
 const en=C.localizedNotificationCopy({type:'place_request_published',title:'x',message:'y',data:{place_name:'Soda Ana'}},'en');
 assert.equal(en.title,'Your business is on ContrataCR');assert.match(en.message,/"Soda Ana" is now published/);
});

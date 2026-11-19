// LOCAL PRO ONLY (place features round, 2026-11-17): in-memory PGlite verification of directory-events-local.sql.
// Claimed places only (no banks), team role listing.publish, field rules (no links, dates, price text), CAS +
// idempotency, cancel final, caps, public list (order by start then id, province filter, hidden/cancelled out), staff
// queue + moderation (approve/hide/restore with reason, CAS, no self-moderation, log), immutable history, RLS/anon denial.
import assert from 'node:assert/strict';
import {setup,uuid,id,code,hint} from './directory-features-db-harness.mjs';

const {q,call,call3,mk,claim,team,denied,db}=await setup(['directory-events-local.sql']);
const owner=id(0xd1),manager=id(0xe1),member=id(0xe2),admin=id(0xad),stranger=id(0xf1);
await mk(1);await mk(2,'banking',{attributes:{kind:'bank'}});await mk(3,'cafe_bar',{attributes:{kind:'bar'},adminArea1:'Heredia'});await mk(4);
await claim(1,owner);await claim(2,owner);await claim(3,owner);
await team(manager,owner,'manager');await team(member,owner,'member');
const at=(days,h=20)=>{const d=new Date(Date.now()+days*86400000);d.setUTCHours(h,0,0,0);return d.toISOString();};
const ev=(over={})=>({title:'Noche de música en vivo',startsAt:at(3),priceText:'Entrada ₡3 000',description:'Banda local, cupo limitado.',...over});
const create=(actor,memberId,placeN,over={},evOver={})=>call3('dir_event_mutate',actor,memberId,{actionId:uuid(),action:'create',eventId:uuid(),placeId:id(placeN),event:ev(evOver),...over});

await assert.rejects(()=>create(stranger,null,1),hint('dir_tool_not_manager','42501'));
await assert.rejects(()=>create(owner,null,4),hint('dir_tool_not_manager'),'unclaimed place');
await assert.rejects(()=>create(owner,null,2),hint('dir_event_section_off'),'no events at banks');
await assert.rejects(()=>create(owner,member,1),hint('dir_tool_role'),'member role cannot publish public events');
for(const bad of [{title:'Ok'},{title:'Visite https://x.cr'},{priceText:'x'.repeat(61)},{description:'www.promo.cr'},{endsAt:at(2)},{endsAt:at(30)},{startsAt:'mañana'},{startsAt:at(400)},{startsAt:at(-3)},{link:'x'}])
 await assert.rejects(()=>create(owner,null,1,{},bad),code('22023'),JSON.stringify(bad));
const e1in={actionId:uuid(),action:'create',eventId:uuid(),placeId:id(1),event:ev({title:'  Noche   de   trova '})};
const e1=await call3('dir_event_mutate',owner,manager,e1in);assert.deepEqual([e1.title,e1.revision,e1.status,e1.moderationStatus],['Noche de trova',1,'published','published']);
assert.deepEqual(await call3('dir_event_mutate',owner,manager,e1in),e1,'idempotent');
await assert.rejects(()=>call3('dir_event_mutate',owner,manager,{...e1in,event:ev({title:'Otro título'})}),code('22023'),'actionId reused');
const e2=await create(owner,null,3,{},{title:'Feria de cervezas',startsAt:at(1),priceText:'Gratis'});
const e3=await create(owner,null,1,{},{title:'Taller de café',startsAt:at(5),priceText:undefined,description:undefined});assert.equal(e3.priceText,null);
const upd=(revision,over={})=>call3('dir_event_mutate',owner,null,{actionId:uuid(),action:'update',eventId:e1in.eventId,revision,event:ev(over)});
await assert.rejects(()=>upd(5),code('40001'),'CAS');
assert.equal((await upd(1,{title:'Noche de trova y bolero'})).revision,2);

// public list: by start time then id, province filter
const list=async(args='')=>(await q(`select dir_events_public(${args||'null,null,null,30,0'}) x`))[0].x;
let pub=await list();assert.deepEqual(pub.items.map(i=>i.title),['Feria de cervezas','Noche de trova y bolero','Taller de café']);assert.equal(pub.total,3);
assert.deepEqual(pub.provinces.sort(),['Heredia','San José']);
pub=await list("null,'Heredia',null,30,0");assert.deepEqual(pub.items.map(i=>i.place.slug),['lugar-3']);
pub=await list("null,null,'restaurant',30,0");assert.equal(pub.total,2);
assert.deepEqual((await q("select dir_place_events_public('lugar-1') x"))[0].x.map(e=>e.title),['Noche de trova y bolero','Taller de café']);
assert.ok(!JSON.stringify(await list()).includes(owner),'no actor ids');

// staff queue + moderation
let queue=(await q("select dir_admin_event_queue('new',50) x"))[0].x;assert.equal(queue.length,3,'new and edited events enter the queue');
const modIn=(over={})=>({actionId:uuid(),eventId:e1in.eventId,decision:'hide',reason:'Contenido engañoso',expectedRevision:2,...over});
await assert.rejects(()=>call('dir_admin_event_moderate',admin,modIn({reason:''})),code('22023'),'reason to hide');
await assert.rejects(()=>call('dir_admin_event_moderate',admin,modIn({expectedRevision:1})),code('40001'),'CAS');
await assert.rejects(()=>call('dir_admin_event_moderate',owner,modIn()),hint('dir_review_self_moderation'));
const hIn=modIn();const h=await call('dir_admin_event_moderate',admin,hIn);assert.equal(h.moderationStatus,'hidden');
assert.deepEqual(await call('dir_admin_event_moderate',admin,hIn),h,'idempotent');
assert.equal((await list()).items.some(i=>i.id===e1in.eventId),false,'hidden event not public');
assert.equal((await upd(2,{title:'Noche de trova (nuevo horario)'})).moderationStatus,'hidden','an owner edit does not unhide');
assert.equal((await call('dir_admin_event_moderate',admin,modIn({decision:'restore',reason:'Corregido por el negocio',expectedRevision:3}))).moderationStatus,'published');
assert.equal((await call('dir_admin_event_moderate',admin,{actionId:uuid(),eventId:e2.id,decision:'approve',expectedRevision:1})).reviewed,true,'approve without reason');
queue=(await q("select dir_admin_event_queue('new',50) x"))[0].x;assert.equal(queue.some(e=>e.id===e2.id),false,'approved leaves the queue');
assert.deepEqual((await q("select decision from dir_moderation_log where kind='event' order by id")).map(r=>r.decision),['hide','restore','approve']);
// cancel is final
const cancel=await call3('dir_event_mutate',owner,null,{actionId:uuid(),action:'cancel',eventId:e3.id,revision:1});assert.equal(cancel.status,'cancelled');
await assert.rejects(()=>call3('dir_event_mutate',owner,null,{actionId:uuid(),action:'update',eventId:e3.id,revision:2,event:ev()}),hint('dir_event_cancelled'));
assert.equal((await list()).items.some(i=>i.id===e3.id),false,'cancelled event not public');
const owned=await call3('dir_events_owner_list',owner,member,id(1));assert.equal(owned.items.length,2,'owner list keeps cancelled ones (read role)');
// caps: 10 new events per place a day
for(let i=0;i<8;i++)await create(owner,null,1,{},{title:'Evento extra '+i});
await assert.rejects(()=>create(owner,null,1),hint('dir_event_cap','54000'));
assert.ok((await q('select count(*)::int n from dir_event_history where event_id=$1',[e1in.eventId]))[0].n>=5,'history of every version');
await db.exec('reset role');
await assert.rejects(()=>db.query("update dir_events set moderation_status='hidden',moderation_reason='abc'"),code('42501'),'moderation only via staff function');
await assert.rejects(()=>db.query("delete from dir_events"),code('23514'));await assert.rejects(()=>db.query("update dir_event_history set action='hide'"),code('23514'));
await db.exec('set role service_role');
await denied(['dir_events','dir_event_history'],["dir_events_public()","dir_event_mutate(null,null,'{}'::jsonb)","dir_admin_event_moderate(null,'{}'::jsonb)"]);
console.log('PASS: events (claimed places, no banks, team role, fields, CAS + idempotency, caps, public order/filters, staff queue + moderation log, RLS/anon denial)');

// LOCAL PRO ONLY (place features round, 2026-11-17): in-memory PGlite verification of directory-place-tools-local.sql:
// dir_tool_authorize (claimed place, active manager, team roles) and the «Pedir» link-out (own channel only: wa.me built
// from digits, https order page, phone; allowed sections only; CAS + idempotency; immutable history; public reader only
// for published claimed places; RLS/anon denial), plus the extended moderation-log kinds.
import assert from 'node:assert/strict';
import {setup,uuid,id,code,hint} from './directory-features-db-harness.mjs';

const {q,call3,mk,claim,team,denied,db}=await setup([]);
const owner=id(0xd1),manager=id(0xe1),member=id(0xe2),stranger=id(0xf1);
await mk(1);await mk(2,'health',{attributes:{kind:'clinic'}});await mk(3,'grocery');await mk(4);
await claim(1,owner);await claim(2,owner);await claim(3,owner);
await team(manager,owner,'manager');await team(member,owner,'member');
const set=(actor,memberId,over={})=>call3('dir_order_link_mutate',actor,memberId,{actionId:uuid(),placeId:id(1),revision:0,channel:'whatsapp',value:'8888-1234',...over});
await assert.rejects(()=>set(stranger,null),hint('dir_tool_not_manager','42501'));
await assert.rejects(()=>set(owner,null,{placeId:id(4)}),hint('dir_tool_not_manager'),'unclaimed place');
await assert.rejects(()=>set(owner,null,{placeId:id(2)}),hint('dir_order_section_off'),'no «Pedir» at health places');
await assert.rejects(()=>set(owner,member,{}),hint('dir_tool_role'),'member role cannot change a public button');
for(const bad of [{channel:'whatsapp',value:'12'},{channel:'web',value:'http://pedidos.test'},{channel:'web',value:'https://wa.me/50688881234'},{channel:'phone',value:'llamar'},{channel:'rappi',value:'x'}])
 await assert.rejects(()=>set(owner,null,bad),code('22023'),JSON.stringify(bad));
const inp={actionId:uuid(),placeId:id(1),revision:0,channel:'whatsapp',value:'8888-1234'};
const r1=await call3('dir_order_link_mutate',owner,manager,inp);assert.deepEqual([r1.revision,r1.channel,r1.value],[1,'whatsapp','https://wa.me/50688881234'],'wa.me link from digits; 8 digits get 506');
assert.deepEqual(await call3('dir_order_link_mutate',owner,manager,inp),r1,'idempotent');
await assert.rejects(()=>set(owner,null,{revision:0,value:'8888-9999'}),code('40001'),'CAS');
await assert.rejects(()=>set(owner,null,{revision:1,value:'50688881234'}),code('22023'),'nothing to change');
assert.deepEqual((await q("select dir_order_link_public('lugar-1') x"))[0].x,{channel:'whatsapp',value:'https://wa.me/50688881234'});
const r2=await set(owner,null,{revision:1,channel:'web',value:'https://soda-uno.example.test/pedidos'});assert.equal(r2.revision,2);
const r3=await set(owner,null,{revision:2,channel:'phone',value:'+506 2222 3333'});assert.equal(r3.channel,'phone');
const r4=await set(owner,null,{revision:3,channel:null,value:null});assert.equal(r4.channel,null,'owner can remove the button');
assert.equal((await q("select dir_order_link_public('lugar-1') x"))[0].x,null);
await set(owner,null,{placeId:id(3),channel:'web',value:'https://super.example.test/pedido'});
assert.equal((await q("select dir_order_link_public('lugar-3') x"))[0].x.channel,'web');
const read=await call3('dir_order_link_read',owner,member,id(3));assert.deepEqual([read.allowed,read.revision],[true,1],'members can read');
assert.deepEqual((await q('select revision,channel from dir_place_order_link_history where place_id=$1 order by revision',[id(1)])).map(h=>h.revision+':'+h.channel),['1:whatsapp','2:web','3:phone','4:null']);
await db.exec('reset role');
await assert.rejects(()=>db.query("update dir_place_order_link_history set channel='web'"),code('23514'));
// moderation log accepts the new kinds and still refuses unknown ones
await db.query("insert into dir_moderation_log(actor_id,action_id,kind,target_id,decision,after) values($1,$2,'brand_claim',$3,'approve','{}')",[owner,uuid(),uuid()]);
await assert.rejects(()=>db.query("insert into dir_moderation_log(actor_id,action_id,kind,target_id,decision,after) values($1,$2,'payment',$3,'approve','{}')",[owner,uuid(),uuid()]),code('23514'));
await db.exec('set role service_role');
await denied(['dir_place_order_links','dir_place_order_link_history'],["dir_order_link_public('lugar-1')","dir_order_link_mutate(null,null,'{}'::jsonb)","dir_tool_authorize(null,null,null,'read')"]);
console.log('PASS: place tools + «Pedir» link-out (own channels only, allowed sections, team roles, CAS + idempotency, immutable history, RLS/anon denial)');

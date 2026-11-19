// LOCAL ONLY (launch without Pro, 2026-11-18): in-memory PGlite verification of dir-business-roles-local.sql and
// directory-owner-profile-local.sql. Part 1 runs on a database WITHOUT the Pro team module (no pro_role_of /
// pro_role_allows, no pro_* object at all): the owner and managers of a claimed place use every owner tool as
// themselves, a member identity is always refused, and the contact/hours editor works with CAS + idempotency +
// provenance. Part 2 installs the team stand-in: the Pro matrix stays authoritative (member cannot publish).
import assert from 'node:assert/strict';
import {setup,uuid,id,code,hint} from './directory-features-db-harness.mjs';

const MODS=['directory-owner-profile-local.sql','directory-reservations-local.sql','directory-questions-local.sql','directory-events-local.sql'];
{
 const {q,call,call3,mk,claim,denied,db}=await setup(MODS,{teamStandIn:false});
 const pro=(await q(`select count(*)::int n from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'pro\\_%' and p.proname not like 'pro\\_menu%'`))[0].n;
 assert.equal(pro,0,'no pro_* function besides the directory menu (not loaded here)');
 assert.equal((await q(`select count(*)::int n from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname like 'pro\\_%'`))[0].n,0,'no pro_* table');
 const owner=id(0xd1),manager=id(0xe1),member=id(0xe2),stranger=id(0xf1);
 await mk(1);await mk(2);await claim(1,owner);
 // add a place manager (directory-native business member)
 await call('dir_place_manager_mutate',owner,{actionId:uuid(),placeId:id(1),action:'add',userId:manager});
 // helpers
 assert.equal((await q('select dir_business_role_of($1,$1) r',[owner]))[0].r,'admin');
 assert.equal((await q('select dir_business_role_of($1,$2) r',[member,owner]))[0].r,null,'no Pro team: no member role');
 assert.deepEqual((await q(`select c,dir_business_allows('member',c) a from unnest(array['read','menu.write','price.write','listing.publish']) c`)).map(r=>r.c+':'+r.a),
  ['read:true','menu.write:true','price.write:false','listing.publish:false'],'built-in matrix: members never publish prices');
 assert.equal((await q(`select dir_business_allows('manager','price.write') a`))[0].a,true);
 // dir_tool_authorize without Pro
 await q('select dir_tool_authorize($1,null,$2,$3)',[owner,id(1),'listing.publish']);
 await q('select dir_tool_authorize($1,null,$2,$3)',[manager,id(1),'listing.publish']);
 await assert.rejects(()=>q('select dir_tool_authorize($1,$2,$3,$4)',[owner,member,id(1),'read']),hint('dir_tool_role','42501'),'member identity refused without Pro');
 await assert.rejects(()=>q('select dir_tool_authorize($1,null,$2,$3)',[stranger,id(1),'read']),hint('dir_tool_not_manager'));
 await assert.rejects(()=>q('select dir_tool_authorize($1,null,$2,$3)',[owner,id(2),'read']),hint('dir_tool_not_manager'),'unclaimed');
 // reservations settings by the owner, no Pro
 const read0=await call3('dir_owner_place_read',owner,null,id(1));
 assert.deepEqual([read0.slug,read0.revision>0,read0.phone],['lugar-1',true,'+506 2200 1001']);
 const up=(member_,over={})=>call3('dir_owner_place_update',owner,member_,{actionId:uuid(),placeId:id(1),revision:read0.revision,action:'contact',place:{website:'https://soda.example.test',email:'Hola@Soda.Example.test'},...over});
 await assert.rejects(()=>call3('dir_owner_place_update',stranger,null,{actionId:uuid(),placeId:id(1),revision:read0.revision,action:'contact',place:{phone:'2222-3333'}}),hint('dir_tool_not_manager'));
 await assert.rejects(()=>up(member),hint('dir_tool_role'),'member refused without Pro');
 for(const bad of [{place:{name:'Otro'}},{place:{}},{place:{phone:5}},{extra:1},{action:'status'}])await assert.rejects(()=>up(null,bad),code('22023'),JSON.stringify(bad));
 await assert.rejects(()=>up(null,{place:{website:'ftp://x'}}),code('23514'),'table check on website');
 const input={actionId:uuid(),placeId:id(1),revision:read0.revision,action:'contact',place:{website:'https://soda.example.test',email:'Hola@Soda.Example.test',phone:' '}};
 const r1=await call3('dir_owner_place_update',owner,null,input);assert.equal(r1.revision,read0.revision+1);
 assert.deepEqual(await call3('dir_owner_place_update',owner,null,input),r1,'idempotent actionId');
 await assert.rejects(()=>up(null),code('40001'),'CAS');
 const read1=await call3('dir_owner_place_read',owner,null,id(1));
 assert.deepEqual([read1.website,read1.email,read1.phone],['https://soda.example.test','hola@soda.example.test',null],'trim, lower-case, empty clears');
 assert.deepEqual((await q(`select distinct source_id from dir_field_provenance where place_id=$1 and action_id=$2`,[id(1),input.actionId])).map(r=>r.source_id),['owner']);
 assert.equal((await q(`select dir_email_change_trusted($1,'owner',$2,clock_timestamp()) t`,[id(1),input.actionId]))[0].t,true,'owner e-mail is trusted');
 // hours by a manager
 await assert.rejects(()=>call3('dir_owner_place_update',manager,null,{actionId:uuid(),placeId:id(1),revision:read1.revision,action:'hours',hours:[{weekday:7,opens:'08:00',closes:'17:00'}]}),code('22023'));
 await assert.rejects(()=>call3('dir_owner_place_update',manager,null,{actionId:uuid(),placeId:id(1),revision:read1.revision,action:'hours',hours:[{weekday:1,opens:'8:00',closes:'17:00'}]}),code('22023'));
 const h=await call3('dir_owner_place_update',manager,null,{actionId:uuid(),placeId:id(1),revision:read1.revision,action:'hours',hours:[{weekday:1,opens:'08:00',closes:'12:00'},{weekday:1,opens:'13:00',closes:'17:00'}]});
 assert.equal(h.revision,read1.revision+1);
 assert.deepEqual((await call3('dir_owner_place_read',manager,null,id(1))).hours.map(x=>x.opens+'-'+x.closes),['08:00-12:00','13:00-17:00']);
 assert.equal((await q("select dir_place_public('lugar-1')->'hours' h"))[0].h.length,2,'public page shows the new hours');
 // other owner tools without Pro: reservation settings + review reply path is covered by their own verifiers; here the order link
 const o=await call3('dir_order_link_mutate',owner,null,{actionId:uuid(),placeId:id(1),revision:0,channel:'phone',value:'+506 2222 3333'});assert.equal(o.revision,1);
 await assert.rejects(()=>call3('dir_order_link_mutate',owner,member,{actionId:uuid(),placeId:id(1),revision:1,channel:null,value:null}),hint('dir_tool_role'));
 await denied([],["dir_owner_place_update(null,null,'{}'::jsonb)","dir_owner_place_read(null,null,null)","dir_business_role_of(null,null)","dir_business_allows(null,null)"]);
 void db;
}
{
 const {call3,mk,claim,team}=await setup(['directory-owner-profile-local.sql']);
 const owner=id(0xd1),manager=id(0xe1),member=id(0xe2);await mk(1);await claim(1,owner);
 await team(manager,owner,'manager');await team(member,owner,'member');
 const rd=await call3('dir_owner_place_read',owner,member,id(1));assert.equal(rd.slug,'lugar-1','members read');
 await assert.rejects(()=>call3('dir_owner_place_update',owner,member,{actionId:uuid(),placeId:id(1),revision:rd.revision,action:'contact',place:{phone:'2222-4444'}}),hint('dir_tool_role'),'Pro member cannot change public data');
 const r=await call3('dir_owner_place_update',owner,manager,{actionId:uuid(),placeId:id(1),revision:rd.revision,action:'contact',place:{phone:'2222-4444'}});assert.equal(r.revision,rd.revision+1,'Pro manager can');
}
console.log('PASS: directory without Pro — neutral business roles (owner/managers act as themselves, member identities refused without the team module, Pro matrix authoritative when installed) + owner contact/hours editor (claimed only, strict keys, CAS, idempotent, owner provenance, trusted owner e-mail, RLS/anon denial)');

// LOCAL PRO ONLY (multivertical F2 extras): in-memory PGlite verification of docs/pro/sql/directory-import-extras-local.sql
// (OSM opening hours + website, promoted only to unclaimed places whose field was never set by another source) together
// with scripts/directory/stage-osm-extras.mjs. Never touches a shared database and never fetches third-party data.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {buildPayloads} from '../directory/stage-import.mjs';
import {buildExtrasPayloads,parseExtras} from '../directory/stage-osm-extras.mjs';

// ---- offline payload (synthetic Overpass elements; values copied from real-world syntax samples)
const el=(id,tags)=>({type:'node',id,lat:9.93+id/10000,lon:-84.08,tags:{amenity:'restaurant',name:'Soda Extra '+id,...tags}});
const dump=JSON.stringify({elements:[
 el(1,{opening_hours:'Mo-Sa 10:30-21:00; Su 11:00-20:00',website:'http://www.fischel.cr/'}),// unclaimed → applied
 el(2,{opening_hours:'Lun - Dom 07:00 - 20:00',website:'no'}),// unparseable / rejected
 el(3,{opening_hours:'24/7'}),// claimed later → claimed
 el(4,{opening_hours:'Th-Sa 11:00-02:00',website:'www.vanzuco.com'}),// owner already set hours/website → owner_data
 el(5,{opening_hours:'Mo-Fr 08:00-17:00'}),// removed place → removed
 el(6,{name:'Soda',opening_hours:'Mo-Su 09:00-21:00'}),// generic name: never imported → no place
 el(7,{name:'Soda Sin Extras 7'}),// nothing to stage
 el(8,{opening_hours:'Mo-Su 11:00-22:00',website:'https://example.org/a'}),// manager without claim_status → claimed
]});
const {rows,stats}=parseExtras(dump);
assert.equal(rows.length,7);assert.deepEqual([stats.withHours,stats.hoursParsed,stats.hoursUnparseable,stats.withWebsite,stats.websiteValid,stats.websiteRejected],[7,6,1,4,3,1]);
assert.deepEqual(Object.keys(rows[0]).sort(),['hours','hoursRaw','ref','website','websiteRaw']);
assert.equal(rows[0].website,'http://www.fischel.cr');assert.equal(rows[1].hours,undefined);assert.equal(rows[1].website,undefined);
assert.equal(JSON.stringify(rows).includes('Soda'),false,'names are never part of the extras payload');

// ---- database
const {PGlite}=await import(process.env.PRO_PGLITE_MODULE||'@electric-sql/pglite'),db=new PGlite();
const staff='00000000-0000-4000-8000-0000000000aa';
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;`);
const read=f=>readFile('docs/pro/sql/'+f,'utf8');
const [core,imp,claims,extras]=await Promise.all(['directory-core-local.sql','directory-import-local.sql','directory-claims-local.sql','directory-import-extras-local.sql'].map(read));
await db.exec(core);await db.exec(imp);await db.exec(claims);await db.exec(extras);await db.exec(extras);// idempotent
await db.exec('set role service_role');
const q=async(t,p=[])=>(await db.query(t,p)).rows,code=c=>e=>{assert.equal(e.code,c,e.message);return true;};
const call=async(fn,input,actor=staff)=>(await q(`select ${fn}($1,$2) r`,[actor,input]))[0].r;
const asOwner=async sql=>{await db.exec('reset role');try{await db.exec(sql);}finally{await db.exec('set role service_role');}};

// hours validator
for(const good of [[{weekday:0,opens:'00:00',closes:'24:00'}],[{weekday:4,opens:'11:00',closes:'02:00'}]])assert.equal((await q('select dir_import_hours_ok($1) ok',[JSON.stringify(good)]))[0].ok,true);
for(const bad of [[],[{weekday:7,opens:'08:00',closes:'09:00'}],[{weekday:1,opens:'24:00',closes:'09:00'}],[{weekday:1,opens:'08:00',closes:'08:00'}],[{weekday:1,opens:'8:00',closes:'09:00'}],
 [{weekday:1,opens:'08:00',closes:'09:00',x:1}],[{weekday:'1',opens:'08:00',closes:'09:00'}],['x'],Array.from({length:5},(_,i)=>({weekday:1,opens:`0${i}:00`,closes:`0${i}:30`}))])
 assert.equal((await q('select dir_import_hours_ok($1) ok',[JSON.stringify(bad)]))[0].ok,false,JSON.stringify(bad));

// seed import of the same dump (creates places 1..8 with OSM provenance), publish
const seed=buildPayloads(dump,'osm','dump.json').payloads[0];
await call('dir_import_stage',seed);await call('dir_import_commit',{actionId:crypto.randomUUID(),batchId:seed.batchId,publish:true});
const place=async ref=>(await q("select p.* from dir_places p join dir_field_provenance f on f.place_id=p.id and f.field='name' and f.source_ref=$1",[ref]))[0];
const m=async(input)=>call('dir_place_mutate',{actionId:crypto.randomUUID(),...input});
// place 3: claimed; place 4: owner already edited hours and website; place 5: removed; place 6: never imported; place 8: active manager only
await asOwner(`update dir_places set claim_status='claimed' where id='${(await place('node/3')).id}'`);
{const p4=await place('node/4');let r=await m({action:'hours',placeId:p4.id,revision:p4.revision,source:{id:'owner'},hours:[{weekday:1,opens:'09:00',closes:'18:00'}]});
 await m({action:'update',placeId:p4.id,revision:r.revision,source:{id:'owner'},place:{website:'https://owner.example.com'}});}
{const p5=await place('node/5');await m({action:'status',placeId:p5.id,revision:p5.revision,status:'removed'});}
assert.equal(await place('node/6'),undefined);
{const p8=await place('node/8');await asOwner(`insert into dir_place_managers(id,place_id,user_id,role,granted_by) values(gen_random_uuid(),'${p8.id}',gen_random_uuid(),'manager','${staff}')`);}

const {payloads}=buildExtrasPayloads(dump,'osm','dump.json'),payload=payloads[0];
assert.equal(payloads.length,1);
const staged=await call('dir_import_extras_stage',payload);
assert.deepEqual(staged.hours,{staged:6,unparseable:1});assert.deepEqual(staged.website,{none:3,staged:3,rejected:1});
assert.deepEqual(await call('dir_import_extras_stage',payload),staged,'same actionId → same answer');
await assert.rejects(()=>call('dir_import_extras_stage',{...payload,fileName:'x.json'}),code('22023'));
await assert.rejects(()=>call('dir_import_extras_stage',{...payload,actionId:crypto.randomUUID(),batchId:crypto.randomUUID()}),code('23505'),'same file part twice');
for(const bad of [{sourceId:'owner'},{sourceId:'contratacr'},{rows:[]},{rows:[{ref:'node/1'}]},{rows:[{ref:'node 1;',hoursRaw:'x'}]},{rows:[{ref:'node/1',hoursRaw:'x'},{ref:'node/1',hoursRaw:'y'}]}])
 await assert.rejects(()=>call('dir_import_extras_stage',{...payload,...bad,actionId:crypto.randomUUID(),batchId:crypto.randomUUID(),fileSha256:'c'.repeat(64)}),code('22023'),JSON.stringify(bad));
// tampered payload: invalid slots / URL are kept as unparseable / rejected, never promoted
{const t=await call('dir_import_extras_stage',{actionId:crypto.randomUUID(),batchId:crypto.randomUUID(),sourceId:'osm',fileName:'t.json',fileSha256:'d'.repeat(64),
  rows:[{ref:'node/1',hoursRaw:'Mo 08:00-09:00',hours:[{weekday:9,opens:'08:00',closes:'09:00'}],websiteRaw:'x',website:'javascript:alert(1)'}]});
 assert.deepEqual([t.hours,t.website],[{unparseable:1},{rejected:1}]);}

const commit={actionId:crypto.randomUUID(),batchId:payload.batchId},done=await call('dir_import_extras_commit',commit);
assert.equal(done.status,'committed');
assert.deepEqual(done.hours,{applied:1,unparseable:1,claimed:2,owner_data:1,removed:1,no_place:1});
assert.deepEqual(done.website,{applied:1,rejected:1,owner_data:1,claimed:1,none:3});
assert.deepEqual(await call('dir_import_extras_commit',commit),done,'idempotent');
await assert.rejects(()=>call('dir_import_extras_commit',{...commit,actionId:crypto.randomUUID()}),code('40001'));
await assert.rejects(()=>call('dir_import_extras_commit',{actionId:crypto.randomUUID(),batchId:crypto.randomUUID()}),code('P0002'));

// place 1: hours + website from OSM with provenance; public page attribution; hours source = osm
const p1=await place('node/1'),pub1=(await q('select dir_place_public($1) p',[p1.slug]))[0].p;
assert.equal(pub1.website,'http://www.fischel.cr');
assert.deepEqual(pub1.hours.map(h=>`${h.weekday} ${h.opens}-${h.closes}`),['0 11:00-20:00','1 10:30-21:00','2 10:30-21:00','3 10:30-21:00','4 10:30-21:00','5 10:30-21:00','6 10:30-21:00']);
assert.equal((await q('select dir_place_hours_source($1) s',[p1.slug]))[0].s,'osm');
assert.deepEqual((await q("select field,source_id,source_ref from dir_field_provenance where place_id=$1 and field in('hours','website') order by id",[p1.id])).map(r=>[r.field,r.source_id,r.source_ref]),[['hours','osm','node/1'],['website','osm','node/1']]);
assert.equal((await q("select count(*)::int n from dir_place_history where place_id=$1 and action in('hours','update')",[p1.id]))[0].n,2);
// owner data untouched; claimed / managed / removed untouched
const p4=await place('node/4');assert.equal(p4.website,'https://owner.example.com');
assert.deepEqual((await q('select weekday,to_char(opens,$2) o from dir_place_hours where place_id=$1',[p4.id,'HH24:MI'])).map(r=>`${r.weekday} ${r.o}`),['1 09:00']);
assert.equal((await q('select dir_place_hours_source($1) s',[p4.slug]))[0].s,'owner');
for(const ref of ['node/3','node/5','node/8'])assert.equal((await q('select count(*)::int n from dir_place_hours h join dir_places p on p.id=h.place_id join dir_field_provenance f on f.place_id=p.id and f.field=$2 and f.source_ref=$1',[ref,'name']))[0].n,0,ref);
assert.equal((await place('node/8')).website,null);

// a later OSM refresh may update OSM-backed values; once the place is claimed it is frozen
{const d2=JSON.stringify({elements:[el(1,{opening_hours:'24/7',website:'https://www.fischel.cr/'})]});
 const p=buildExtrasPayloads(d2,'osm','d2.json').payloads[0];await call('dir_import_extras_stage',p);
 const r=await call('dir_import_extras_commit',{actionId:crypto.randomUUID(),batchId:p.batchId});assert.deepEqual([r.hours,r.website],[{applied:1},{applied:1}]);
 assert.equal((await q('select count(*)::int n from dir_place_hours where place_id=$1 and opens=$2 and closes=$3',[p1.id,'00:00','24:00']))[0].n,7);
 const again=await call('dir_import_extras_stage',{...p,actionId:crypto.randomUUID(),batchId:crypto.randomUUID(),fileSha256:'e'.repeat(64)});assert.deepEqual(again.hours,{staged:1});
 const same=await call('dir_import_extras_commit',{actionId:crypto.randomUUID(),batchId:again.batchId});assert.deepEqual([same.hours,same.website],[{unchanged:1},{unchanged:1}]);
 await asOwner(`update dir_places set claim_status='claimed' where id='${p1.id}'`);
 const d3=JSON.stringify({elements:[el(1,{opening_hours:'Mo-Fr 08:00-17:00',website:'https://changed.example.com'})]}),p3=buildExtrasPayloads(d3,'osm','d3.json').payloads[0];
 await call('dir_import_extras_stage',p3);const r3=await call('dir_import_extras_commit',{actionId:crypto.randomUUID(),batchId:p3.batchId});
 assert.deepEqual([r3.hours,r3.website],[{claimed:1},{claimed:1}]);assert.equal((await place('node/1')).website,'https://www.fischel.cr');}

// 2026-11-17: dir_import_reclassify (cafés out of restaurants) — by source reference, only unclaimed places, slug/id
// kept, vertical + kind with provenance and before/after history, idempotent receipt, nothing deleted.
{const p2=await place('node/2'),hist=(await q('select count(*)::int n from dir_place_history where place_id=$1',[p2.id]))[0].n;
 const input={actionId:crypto.randomUUID(),sourceId:'osm',from:'restaurant',to:'cafe_bar',rows:['node/1','node/2','node/3','node/5','node/6','node/8'].map(ref=>({ref,attributes:{kind:'cafe'}}))};
 const r=await call('dir_import_reclassify',input);
 assert.deepEqual([r.moved,r.skipped],[1,{claimed_kept:3,removed:1,not_found:1}]);
 assert.deepEqual(await call('dir_import_reclassify',input),r,'same actionId → same answer');
 const after=await place('node/2');
 assert.deepEqual([after.id,after.slug,after.vertical_id,after.attributes,after.revision],[p2.id,p2.slug,'cafe_bar',{kind:'cafe'},p2.revision+1]);
 const h=await q('select before->>\'vertical\' b,after->>\'vertical\' a from dir_place_history where place_id=$1 order by id desc limit 1',[p2.id]);
 assert.deepEqual(h[0],{b:'restaurant',a:'cafe_bar'});assert.equal((await q('select count(*)::int n from dir_place_history where place_id=$1',[p2.id]))[0].n,hist+1);
 assert.deepEqual((await q("select field,source_id,source_ref from dir_field_provenance where place_id=$1 and field in('vertical','attributes') order by field,id desc",[p2.id])).filter((x,i,a)=>a.findIndex(y=>y.field===x.field)===i),
  [{field:'attributes',source_id:'osm',source_ref:'node/2'},{field:'vertical',source_id:'osm',source_ref:'node/2'}]);
 assert.equal((await place('node/3')).vertical_id,'restaurant','claimed place untouched');
 assert.equal((await place('node/8')).vertical_id,'restaurant','managed place untouched');
 const again=await call('dir_import_reclassify',{...input,actionId:crypto.randomUUID(),rows:[{ref:'node/2'}]});assert.deepEqual(again.skipped,{already_moved:1});
 for(const bad of [{...input,to:'restaurant'},{...input,to:'nope'},{...input,rows:[]},{...input,rows:[{ref:'node/2',attributes:{stars:5}}]},{...input,rows:[{ref:'bad ref'}]},{...input,extra:1}])
  await assert.rejects(()=>call('dir_import_reclassify',{...bad,actionId:crypto.randomUUID()}),code('22023'),JSON.stringify(bad).slice(0,80));}

// security: RLS, no DELETE, TRUNCATE blocked, anon/authenticated cannot execute
for(const t of ['dir_import_extra_batches','dir_import_extra_rows']){
 assert.equal((await q('select relrowsecurity r from pg_class where relname=$1',[t]))[0].r,true);
 assert.equal((await q("select has_table_privilege('service_role',$1,'DELETE') d",['public.'+t]))[0].d,false);
 assert.equal((await q("select has_table_privilege('anon',$1,'SELECT') d",['public.'+t]))[0].d,false);
 await assert.rejects(()=>q(`truncate ${t} cascade`),e=>['23514','42501'].includes(e.code));
}
for(const f of ['dir_import_extras_stage(uuid,jsonb)','dir_import_extras_commit(uuid,jsonb)','dir_place_hours_source(text)','dir_import_reclassify(uuid,jsonb)'])
 for(const role of ['anon','authenticated'])assert.equal((await q('select has_function_privilege($1,$2,$3) x',[role,f,'EXECUTE']))[0].x,false,role+' '+f);
console.log('PASS directory import extras: reclassify by reference (unclaimed only, slug/id kept, provenance + history, idempotent, 22023 negatives), parser payload, validator, stage/commit idempotency and CAS, applied only to unclaimed places with OSM-or-empty fields (owner/claimed/managed/removed untouched), refresh, provenance/history, hours source, RLS/grants.');

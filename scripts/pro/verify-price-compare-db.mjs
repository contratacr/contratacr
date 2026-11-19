// LOCAL PRO ONLY (multivertical P3): in-memory PGlite verification of price-compare-local.sql on top of
// directory-core-local.sql + price-observations-local.sql. SQL directory: process.env.DIR_SQL_DIR (default docs/pro/sql).
// Checks the catalogue (GTIN check digit, OTC only), the official import with provenance (synthetic fixture only),
// idempotency, the prescription HARD RULE (no price ever stored for an Rx row), unit normalization, neutral order,
// staleness, per-province summary, append-only storage and grants. Never touches a shared database.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
const {buildMeicPayloads}=await import('../directory/import-meic-prices.mjs');
const uuid=()=>crypto.randomUUID();
const fx='scripts/directory/fixtures/meic-sample/';
const meta=JSON.parse(await readFile(fx+'meta.json','utf8')),catalog=JSON.parse(await readFile(fx+'catalog.json','utf8')),places=JSON.parse(await readFile(fx+'places.json','utf8'));
const csvText=await readFile(fx+meta.file,'utf8');
const built=buildMeicPayloads({meta,catalog,places,csvText,fileName:meta.file});

const {PGlite}=await import(process.env.PRO_PGLITE_MODULE||'@electric-sql/pglite'),db=new PGlite();
const dir=process.env.DIR_SQL_DIR||'docs/pro/sql';
const staff='00000000-0000-4000-8000-0000000000aa',userA='00000000-0000-4000-8000-0000000000a1',userB='00000000-0000-4000-8000-0000000000b1';
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;`);
for(const f of ['directory-core-local.sql','price-observations-local.sql','price-compare-local.sql'])await db.exec(await readFile(join(dir,f),'utf8'));
await db.exec(await readFile(join(dir,'price-compare-local.sql'),'utf8'));// idempotent re-run
await db.exec('set role service_role');
const q=async(text,params=[])=>(await db.query(text,params)).rows;
const rpc=async(fn,input,actor=staff)=>(await q(`select ${fn}($1,$2) r`,[actor,input]))[0].r;
const code=(c,hint)=>e=>{assert.equal(e.code,c,e.message);if(hint)assert.equal(e.hint,hint);return true;};
const ago=d=>new Date(Date.now()-d*864e5).toISOString();
const place=async(slug,vertical,area1,{license=false,level=null}={})=>{const id=uuid();
 let r=await rpc('dir_place_mutate',{action:'create',actionId:uuid(),placeId:id,revision:0,place:{slug,vertical,name:'Lugar '+slug,lat:9.93,lng:-84.08,adminArea1:area1,adminArea2:area1}});
 r=await rpc('dir_place_mutate',{action:'status',actionId:uuid(),placeId:id,revision:r.revision,status:'published'});
 if(license||level)r=await rpc('dir_place_mutate',{action:'verify',actionId:uuid(),placeId:id,revision:r.revision,verificationLevel:license?'license_verified':level});return {id,revision:r.revision};};
const compare=async(item,prov=null,vert=null,sort='unit_price')=>(await q('select public_price_compare($1,$2,$3,$4) r',[item,prov,vert,sort]))[0].r;
const search=async(text,vert=null)=>(await q('select public_price_search($1,$2) r',[text,vert]))[0].r;

// ---- places of the synthetic fixture (+ a pharmacy whose licence ContrataCR has not verified: shown since 2026-11-17)
const centro=await place('fixture-super-ejemplo-centro','grocery','San José');
await place('fixture-mercado-prueba-norte','grocery','Heredia');
await place('fixture-farmacia-ejemplo','pharmacy','San José',{license:true});
const unlicensed=await place('fixture-farmacia-sin-permiso','pharmacy','San José');

// ---- catalogue: OTC only, GTIN check digit, Rx refused before anything is stored
assert.equal(built.catalog.length,5,'the Rx item never becomes a catalogue payload');
assert.ok(!built.catalog.some(c=>c.slug==='fixture-antibiotico-rx'));
for(const c of built.catalog)await rpc('price_catalog_upsert',c);
assert.deepEqual(await rpc('price_catalog_upsert',built.catalog[0]),(await q("select result r from price_actions where action_id=$1",[built.catalog[0].actionId]))[0].r,'idempotent');
await assert.rejects(rpc('price_catalog_upsert',{actionId:uuid(),slug:'rx-direct',kind:'medicine',name:'Rx directo',category:'rx',unitBase:'unit',unitQty:1}),code('22023','price_rx_not_public'));
await assert.rejects(rpc('price_catalog_upsert',{actionId:uuid(),slug:'rx-direct-2',kind:'medicine',rxRequired:true,name:'Rx directo',category:'rx',unitBase:'unit',unitQty:1}),code('22023','price_rx_not_public'));
assert.equal((await q("select count(*)::int n from price_items where slug like 'rx-direct%'"))[0].n,0,'nothing stored for Rx');
await assert.rejects(rpc('price_catalog_upsert',{actionId:uuid(),slug:'bad-gtin',kind:'grocery',name:'Mal GTIN',category:'x1',gtin:'2000000000016',unitBase:'kg',unitQty:1}),code('22023'));
// An Rx item that exists (created elsewhere) for the import test.
await rpc('price_item_upsert',{actionId:uuid(),slug:'fixture-antibiotico-rx',kind:'medicine',name:'Antibiótico sintético con receta',gtin:'2000000000046',unitBase:'unit',unitQty:12});

// ---- import with provenance
const imp=await rpc('price_official_import_record',built.import);
assert.deepEqual(imp.counts,{recorded:5,unmatched_place:1,duplicate:1,rx_refused:1,invalid:2},JSON.stringify(imp.counts));
assert.equal(imp.fileSha256,built.fileSha256);
assert.deepEqual(await rpc('price_official_import_record',built.import),imp,'same actionId + same input → same receipt');
await assert.rejects(rpc('price_official_import_record',{...built.import,actionId:uuid()}),code('23505','price_import_duplicate'));
await assert.rejects(rpc('price_official_import_record',{...built.import,actionId:uuid(),fileSha256:'f'.repeat(64),publicationDate:'2099-01-01'}),code('22023'));
await assert.rejects(rpc('price_official_import_record',{...built.import,actionId:uuid(),fileSha256:'e'.repeat(64),sourceId:'aresep'}),code('22023'));
await assert.rejects(rpc('price_official_import_record',{...built.import,actionId:uuid(),fileSha256:'d'.repeat(64),sourceUrl:'http://insecure'}),code('22023'));
await assert.rejects(rpc('price_official_import_record',{...built.import,actionId:uuid(),fileSha256:'c'.repeat(64),rows:[{rowNo:1,status:'recorded'}]}),code('22023'));
const summary=(await q('select price_import_summary($1) r',[imp.batchId]))[0].r;
assert.equal(summary.sourceUrl,meta.sourceUrl);assert.equal(summary.publicationDate,meta.publicationDate);assert.equal(summary.fileSha256,built.fileSha256);
assert.deepEqual(summary.counts,imp.counts);
// HARD RULE: the Rx row keeps no price and no item price is ever observed for it.
const rxRow=(await q("select price,observation_id from price_import_rows where status='rx_refused'"))[0];
assert.deepEqual([rxRow.price,rxRow.observation_id],[null,null]);
assert.equal((await q("select count(*)::int n from price_observations o join price_items i on i.id=o.item_id where i.rx_required"))[0].n,0);
const rxOnly=await rpc('price_official_import_record',{...built.import,actionId:uuid(),fileSha256:'b'.repeat(64),rows:[{rowNo:1,status:'rx_refused',itemSlug:'fixture-antibiotico-rx',price:5}]});
assert.deepEqual(rxOnly.counts,{rx_refused:1});
assert.equal((await q('select price from price_import_rows where batch_id=$1',[rxOnly.batchId]))[0].price,null,'a price sent with an Rx row is dropped');
assert.equal((await q("select count(*)::int n from price_import_rows where status in('rx_refused','unknown_item','invalid') and price is not null"))[0].n,0);
// Append-only.
await assert.rejects(q("update price_import_batches set survey_ref='x'"),code('42501'),'no UPDATE grant');
await db.exec('reset role');
await assert.rejects(q("update price_import_batches set survey_ref='x'"),code('23514'),'trigger even for the owner');
await assert.rejects(q("delete from price_import_rows"),code('23514'));
await db.exec('set role service_role');

// ---- search: accent-insensitive, aliases, GTIN, never Rx
const s1=await search('acetaminofen');assert.deepEqual(s1.items.map(i=>i.slug),['fixture-acetaminofen-10']);
assert.equal((await search('paracetamol')).items[0].slug,'fixture-acetaminofen-10','alias');
assert.deepEqual((await search('2000000000015')).items.map(i=>i.slug),['fixture-arroz-1kg'],'GTIN');
assert.deepEqual((await search('2000000000046')).items,[],'Rx by GTIN: nothing');
assert.deepEqual((await search('antibiotico')).items,[],'Rx by name: nothing');
assert.deepEqual((await search('arroz','pharmacy')).items,[],'groceries are not listed under pharmacies');
assert.equal((await search('arroz')).items[0].offers,2);
assert.equal(await search('x','bank'),null);

// ---- compare: unit normalization, neutral order, provenance, region summary
const rice=await compare('fixture-arroz-1kg');
assert.deepEqual(rice.offers.map(o=>[o.place.slug,o.unitPrice]),[['fixture-mercado-prueba-norte',1190],['fixture-super-ejemplo-centro',1250]]);
assert.equal(rice.offers[0].observation.sourceKind,'official_meic');assert.equal(rice.offers[0].observation.sourceRef,'SINTETICO-MEIC-0001');
assert.equal(rice.offers[0].observation.stale,false);
assert.deepEqual(rice.offers[0].provenance,{sourceUrl:meta.sourceUrl,publicationDate:meta.publicationDate,surveyRef:'SINTETICO-MEIC-0001',fileSha256:built.fileSha256});
assert.deepEqual(rice.regions.map(r=>[r.province,r.offers]),[['Heredia',1],['San José',1]]);
const beans=await compare('fixture-frijol-900g');
assert.equal(beans.item.normalizedUnit,'kg');assert.equal(Number(beans.offers[0].unitPrice),1645,'1480.50 / 0.9 kg');assert.equal(beans.offers[0].observation.price,1480.5,'first row of a duplicate wins');
assert.equal((await compare('fixture-arroz-1kg','heredia')).offers.length,1,'province filter, accent/case-insensitive');
assert.equal((await compare('fixture-arroz-1kg','San Jose')).offers[0].place.slug,'fixture-super-ejemplo-centro');
assert.equal(await compare('fixture-antibiotico-rx'),null,'Rx: no comparison');
// Price range (2026-11-17): inclusive, on the offer's price; offers, total and regions follow it; invalid → 22023.
const ranged=async(min,max)=>(await q('select public_price_compare($1,null,null,$2,60,$3,$4) r',['fixture-arroz-1kg','unit_price',min,max]))[0].r;
let rg=await ranged(1200,null);assert.deepEqual([rg.total,rg.offers.map(o=>o.place.slug),rg.regions.map(x=>x.province),rg.priceMin],[1,['fixture-super-ejemplo-centro'],['San José'],1200]);
rg=await ranged(null,1190);assert.deepEqual(rg.offers.map(o=>o.place.slug),['fixture-mercado-prueba-norte'],'max inclusive');
rg=await ranged(1190,1250);assert.equal(rg.total,2);rg=await ranged(2000,3000);assert.deepEqual([rg.total,rg.offers,rg.regions],[0,[],[]]);
for(const [a,b] of [[5,1],[-1,null],[null,-5],[100000000,null]])await assert.rejects(ranged(a,b),code('22023','price_compare_range'));
assert.equal(await compare('fixture-arroz-1kg',null,null,'paid'),null);
// Neutrality: verification level / claims never change the order.
await rpc('dir_place_mutate',{action:'verify',actionId:uuid(),placeId:centro.id,revision:centro.revision,verificationLevel:'verified'});
assert.deepEqual((await compare('fixture-arroz-1kg')).offers.map(o=>o.place.slug),['fixture-mercado-prueba-norte','fixture-super-ejemplo-centro']);
assert.deepEqual((await compare('fixture-arroz-1kg',null,null,'place')).offers.map(o=>o.place.slug),['fixture-mercado-prueba-norte','fixture-super-ejemplo-centro'],'by name: Lugar fixture-m… < Lugar fixture-s…');
// Pharmacy without a verified licence (owner decision 2026-11-17): its OTC price is shown like any other store's; the
// per-vertical requires_license gate is kept and still hides it when switched on.
await rpc('price_observation_record',{actionId:uuid(),sourceKind:'official_meic',sourceRef:'SINTETICO-2',itemSlug:'fixture-acetaminofen-10',placeId:unlicensed.id,price:700,observedAt:ago(1)});
assert.deepEqual((await compare('fixture-acetaminofen-10')).offers.map(o=>o.place.slug).sort(),['fixture-farmacia-ejemplo','fixture-farmacia-sin-permiso']);
await db.exec("reset role;update dir_verticals set requires_license=true where id='pharmacy';set role service_role");
assert.deepEqual((await compare('fixture-acetaminofen-10')).offers.map(o=>o.place.slug),['fixture-farmacia-ejemplo'],'gate kept');
await db.exec("reset role;update dir_verticals set requires_license=false where id='pharmacy';set role service_role");
assert.equal((await compare('fixture-acetaminofen-10',null,'grocery')).offers.length,0);
// Staleness: an old official price is shown after current ones, flagged; a newer community report wins at that place.
const old=await place('fixture-super-viejo','grocery','Cartago');
await rpc('price_observation_record',{actionId:uuid(),sourceKind:'official_meic',sourceRef:'SINTETICO-OLD',itemSlug:'fixture-arroz-1kg',placeId:old.id,price:900,observedAt:ago(200)});
let r=await compare('fixture-arroz-1kg');
assert.deepEqual(r.offers.map(o=>[o.place.slug,o.observation.stale]),[['fixture-mercado-prueba-norte',false],['fixture-super-ejemplo-centro',false],['fixture-super-viejo',true]],'stale last even if cheaper');
assert.equal(r.offers[2].observation.staleReason,'stale');assert.equal(r.regions.length,2,'stale offers are not in the summary');
for(const u of [userA,userB])await rpc('price_observation_record',{actionId:uuid(),sourceKind:'user_report',itemSlug:'fixture-arroz-1kg',placeSlug:'fixture-super-viejo',price:1100,observedAt:ago(0.1)},u);
r=await compare('fixture-arroz-1kg');
assert.deepEqual(r.offers.map(o=>[o.place.slug,o.observation.confidence]),[['fixture-super-viejo','community_verified'],['fixture-mercado-prueba-norte','official'],['fixture-super-ejemplo-centro','official']]);
assert.equal(r.offers[0].provenance,null,'community price has no import provenance');
assert.equal(r.regions.find(x=>x.province==='San José').medianUnitPrice,1250);

// ---- grants
await db.exec('reset role');
for(const role of ['anon','authenticated']){
 await db.exec(`set role ${role}`);
 await assert.rejects(q("select public_price_compare('fixture-arroz-1kg')"),code('42501'));
 await assert.rejects(q("select public_price_search('arroz')"),code('42501'));
 await assert.rejects(q('select * from price_catalog'),code('42501'));
 await db.exec('reset role');
}
console.log('PASS price-compare: catalogue (GTIN, OTC only), MEIC import with provenance (synthetic fixture), idempotency, Rx never stored, unit normalization, neutral order, staleness, regions, append-only, grants');

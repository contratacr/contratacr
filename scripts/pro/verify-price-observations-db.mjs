// LOCAL PRO ONLY (multivertical P1): in-memory PGlite verification of price-observations-local.sql (on top of
// directory-core-local.sql). SQL directory: process.env.DIR_SQL_DIR (default docs/pro/sql). Checks zod mirrors, the
// offline ARESEP importer, items, national regulated sets with supersede, staleness rules, reader priority, user reports
// with moderation and auto-promotion, the prescription HARD RULE (Decreto 36868-S), append-only storage, idempotency,
// caps and RLS/grants. Never touches a shared database.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {registerHooks} from 'node:module';
const libRoot=new URL('../../src/lib/',import.meta.url).href;
registerHooks({resolve(specifier,context,next){return next(context.parentURL?.startsWith(libRoot)&&specifier.startsWith('.')&&!/\.[a-z]+$/i.test(specifier)?specifier+'.ts':specifier,context);}});
const Z=await import('../../src/lib/directory/price-schemas.ts');
const {buildAresepPayloads}=await import('../directory/import-aresep-fuel.mjs');
const uuid=()=>crypto.randomUUID();
const withCheck=d=>{for(let c=0;c<10;c++)if(Z.gtinIsValid(d+c))return d+c;throw new Error('gtin');};
const GTIN_RICE=withCheck('744100000001'),GTIN_OTC=withCheck('744100000002'),GTIN_RX=withCheck('744100000003');

// ---- zod mirrors + importer (offline)
{
 assert.equal(GTIN_RICE.length,13);
 assert.equal(Z.gtinIsValid('4006381333931'),true,'known EAN-13');assert.equal(Z.gtinIsValid('4006381333932'),false);
 const ok=v=>Z.priceObservationSchema.safeParse(v).success,now=new Date().toISOString();
 assert.equal(ok({sourceKind:'user_report',actionId:uuid(),itemSlug:'arroz-1kg',placeSlug:'super-prueba',price:1250.5,observedAt:now}),true);
 for(const bad of [{sourceKind:'user_report',actionId:uuid(),itemSlug:'arroz-1kg',price:1250,observedAt:now},
  {sourceKind:'official_aresep',actionId:uuid(),itemSlug:'fuel-regular',price:100,observedAt:now},
  {sourceKind:'official_aresep',actionId:uuid(),itemSlug:'fuel-regular',price:100,observedAt:now,sourceRef:'RE-1',placeSlug:'x-y-z'},
  {sourceKind:'business',actionId:uuid(),itemSlug:'arroz-1kg',placeSlug:'super-prueba',price:-1,observedAt:now},
  {sourceKind:'business',actionId:uuid(),itemSlug:'arroz-1kg',placeSlug:'super-prueba',price:1.005,observedAt:now},
  {sourceKind:'business',actionId:uuid(),itemSlug:'arroz-1kg',placeSlug:'super-prueba',price:10,observedAt:new Date(Date.now()+3600e3).toISOString()},
  {sourceKind:'sponsored',actionId:uuid(),itemSlug:'arroz-1kg',placeSlug:'super-prueba',price:10,observedAt:now}])assert.equal(ok(bad),false,JSON.stringify(bad).slice(0,80));
 assert.equal(Z.priceItemSchema.safeParse({actionId:uuid(),slug:'arroz-1kg',kind:'grocery',gtin:'7441000000019',rxRequired:true}).success,false);
 assert.equal(Z.priceItemSchema.safeParse({actionId:uuid(),slug:'arroz-1kg',kind:'grocery',gtin:GTIN_RICE.slice(0,-1)+((Number(GTIN_RICE.at(-1))+1)%10)}).success,false,'bad check digit');
 const raw=await readFile('scripts/directory/fixtures/aresep-fuel-sample.json','utf8'),file=JSON.parse(raw);
 assert.equal(Z.aresepFuelFileSchema.safeParse((({_note,...r})=>r)(file)).success,true);
 const built=buildAresepPayloads(file,raw);assert.equal(built.items.length,4);assert.equal(built.set.sourceRef,'RE-0000-IE-2099');
 assert.deepEqual(buildAresepPayloads(file,raw),built,'deterministic (idempotent re-import)');
 assert.equal(Z.officialPriceSetSchema.safeParse(built.set).success,true);
 for(const b of [{...file,source:'recope'},{...file,resolution:'abc'},{...file,prices:[{product:'kerosene',pricePerLiter:1}]},{...file,prices:[{product:'super',pricePerLiter:-3}]},
  {...file,prices:[file.prices[0],file.prices[0]]},{...file,validTo:'2020-01-01T00:00:00Z'},{...file,extra:1}])assert.throws(()=>buildAresepPayloads(b));
}

// ---- database
const {PGlite}=await import(process.env.PRO_PGLITE_MODULE||'@electric-sql/pglite'),db=new PGlite();
const dir=process.env.DIR_SQL_DIR||'docs/pro/sql';
const staff='00000000-0000-4000-8000-0000000000aa',userA='00000000-0000-4000-8000-0000000000a1',userB='00000000-0000-4000-8000-0000000000b1',userC='00000000-0000-4000-8000-0000000000c1';
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;`);
const core=await readFile(join(dir,'directory-core-local.sql'),'utf8'),sql=await readFile(join(dir,'price-observations-local.sql'),'utf8');
await db.exec(core);await db.exec(sql);await db.exec(sql);
assert.equal((await db.query('select count(*)::int n from price_staleness_rules')).rows[0].n,6);
assert.equal((await db.query("select count(*)::int n from dir_data_sources where id in('aresep','meic','community')")).rows[0].n,3);
await db.exec('set role service_role');
const q=async(text,params=[])=>(await db.query(text,params)).rows;
const rpc=async(fn,input,actor=staff)=>(await q(`select ${fn}($1,$2) r`,[actor,input]))[0].r;
const code=(c,hint)=>e=>{assert.equal(e.code,c,e.message);if(hint)assert.equal(e.hint,hint);return true;};
const pub=async(place,item=null)=>(await q('select public_price_current($1,$2) r',[place,item]))[0].r;
const ago=d=>new Date(Date.now()-d*864e5).toISOString(),ahead=d=>new Date(Date.now()+d*864e5).toISOString();
const place=async(slug,vertical,{publish=true,license=false}={})=>{const id=uuid();
 let r=await rpc('dir_place_mutate',{action:'create',actionId:uuid(),placeId:id,revision:0,place:{slug,vertical,name:'Lugar '+slug,lat:9.93,lng:-84.08}});
 if(publish)r=await rpc('dir_place_mutate',{action:'status',actionId:uuid(),placeId:id,revision:r.revision,status:'published'});
 if(license)r=await rpc('dir_place_mutate',{action:'verify',actionId:uuid(),placeId:id,revision:r.revision,verificationLevel:'license_verified'});return id;};
const bomba=await place('bomba-prueba','fuel'),superP=await place('super-prueba','grocery'),farm=await place('farmacia-prueba','pharmacy',{license:true});
await place('farmacia-sin-permiso','pharmacy');await place('super-borrador','grocery',{publish:false});

// items
const item=input=>rpc('price_item_upsert',{actionId:uuid(),...input});
const itemIn={actionId:uuid(),slug:'arroz-1kg',kind:'grocery',gtin:GTIN_RICE,name:'Arroz 1 kg',presentation:'Bolsa 1 kg',unitBase:'kg',unitQty:1};
const it1=await rpc('price_item_upsert',itemIn);assert.equal(it1.rxRequired,false);assert.deepEqual(await rpc('price_item_upsert',itemIn),it1);
await assert.rejects(()=>rpc('price_item_upsert',{...itemIn,name:'Otro'}),code('22023'));
await item({slug:'acetaminofen-500',kind:'medicine',gtin:GTIN_OTC,name:'Acetaminofén 500 mg (venta libre)',unitBase:'unit',unitQty:10,rxRequired:false});
const rx=await item({slug:'antibiotico-rx',kind:'medicine',gtin:GTIN_RX,name:'Antibiótico (receta)',unitBase:'unit',unitQty:12});
assert.equal(rx.rxRequired,true,'medicine defaults to prescription-only');
for(const bad of [{slug:'malo-1',kind:'grocery',gtin:GTIN_RICE.slice(0,-1)+((Number(GTIN_RICE.at(-1))+1)%10),name:'X malo',unitBase:'kg',unitQty:1},
 {slug:'malo-2',kind:'grocery',name:'Rx malo',unitBase:'kg',unitQty:1,rxRequired:true},{slug:'malo-3',kind:'grocery',name:'Cero',unitBase:'kg',unitQty:0},
 {slug:'malo-4',kind:'casino',name:'Tipo',unitBase:'kg',unitQty:1},{slug:'malo-5',kind:'grocery',name:'Unidad',unitBase:'barril',unitQty:1},{slug:'arroz-1kg',kind:'medicine'}])
 await assert.rejects(()=>item(bad),code('22023'),JSON.stringify(bad));

// ARESEP national set from the importer (dates shifted relative to now; the fixture prices are fake)
const raw=await readFile('scripts/directory/fixtures/aresep-fuel-sample.json','utf8'),fx=JSON.parse(raw);
const built=buildAresepPayloads({...fx,publishedAt:ago(3),validFrom:ago(2),validTo:ahead(20)});
for(const i of built.items)await rpc('price_item_upsert',i);
const set1=await rpc('price_official_set_record',built.set);assert.equal(set1.count,4);
assert.deepEqual(await rpc('price_official_set_record',built.set),set1,'idempotent set');
assert.equal((await q("select count(*)::int n from price_observations where source_kind='official_aresep'"))[0].n,4);
let nat=await pub(null);assert.equal(nat.national,true);assert.equal(nat.items.length,4);
const reg=nat.items.find(x=>x.item.slug==='fuel-regular');
assert.equal(reg.current.price,111.11);assert.equal(reg.current.sourceRef,'RE-0000-IE-2099');assert.equal(reg.current.regulated,true);assert.equal(reg.current.confidence,'official');
assert.equal(reg.current.stale,false);assert.equal(reg.lastKnown,null);assert.match(reg.current.source.attribution,/ARESEP/);
assert.equal(new Date(reg.current.staleAfter).getTime(),new Date(built.set.validTo).getTime(),'ARESEP stale at valid_to');
assert.equal((await pub('bomba-prueba')).items.length,4,'fuel station shows national prices');
assert.equal((await pub('super-prueba')).items.length,0,'grocery does not');
// negatives on official/fuel rules
const obs=(extra,actor=staff)=>rpc('price_observation_record',{actionId:uuid(),observedAt:ago(0.01),...extra},actor);
await assert.rejects(()=>obs({sourceKind:'business',itemSlug:'fuel-regular',placeSlug:'bomba-prueba',price:100}),code('22023','price_fuel_national'));
await assert.rejects(()=>obs({sourceKind:'user_report',itemSlug:'fuel-regular',placeSlug:'bomba-prueba',price:100},userA),code('22023','price_fuel_national'));
await assert.rejects(()=>obs({sourceKind:'official_aresep',itemSlug:'fuel-regular',placeSlug:'bomba-prueba',price:100,sourceRef:'RE-1-IE-2099'}),code('22023'));
await assert.rejects(()=>obs({sourceKind:'official_aresep',itemSlug:'fuel-regular',price:100}),code('22023'),'resolution required');
await assert.rejects(()=>obs({sourceKind:'official_aresep',itemSlug:'arroz-1kg',price:100,sourceRef:'RE-1-IE-2099'}),code('22023'));
await assert.rejects(()=>obs({sourceKind:'official_aresep',sourceId:'osm',itemSlug:'fuel-regular',price:100,sourceRef:'RE-1-IE-2099'}),code('22023'),'source kind mismatch');
// newer effective resolution supersedes; a future one waits; an older one never supersedes a newer one
const set2=await rpc('price_official_set_record',{...built.set,actionId:uuid(),sourceRef:'RE-0001-IE-2099',observedAt:ago(1),validFrom:ago(1),validTo:ahead(25),prices:[{itemSlug:'fuel-regular',price:121.21}]});
assert.equal((await q("select moderation_status s,superseded_by is not null x from price_observations where source_ref='RE-0000-IE-2099' and item_id=(select id from price_items where slug='fuel-regular')"))[0].s,'superseded');
await rpc('price_official_set_record',{...built.set,actionId:uuid(),sourceRef:'RE-0002-IE-2099',observedAt:ago(0.5),validFrom:ahead(3),validTo:ahead(30),prices:[{itemSlug:'fuel-regular',price:131.31}]});
await rpc('price_official_set_record',{...built.set,actionId:uuid(),sourceRef:'RE-9999-IE-2098',observedAt:ago(40),validFrom:ago(40),validTo:ago(30),prices:[{itemSlug:'fuel-regular',price:99.99}]});
nat=await pub(null,'fuel-regular');assert.equal(nat.items.length,1);assert.equal(nat.items[0].current.price,121.21);assert.equal(nat.items[0].current.sourceRef,'RE-0001-IE-2099');
assert.equal(set2.observations[0].moderationStatus,'published');

// staleness + priority at a supermarket
await obs({sourceKind:'business',itemSlug:'arroz-1kg',placeSlug:'super-prueba',price:1300,observedAt:ago(40)});
let page=await pub('super-prueba','arroz-1kg');
assert.equal(page.items[0].current,null,'stale business price never current');assert.equal(page.items[0].lastKnown.stale,true);assert.equal(page.items[0].lastKnown.staleReason,'stale');
const rA=await obs({sourceKind:'user_report',itemSlug:'arroz-1kg',placeSlug:'super-prueba',price:1200,evidence:{sha256:'a'.repeat(64)}},userA);
assert.equal(rA.moderationStatus,'pending');assert.equal(rA.confidence,'community');
assert.equal((await pub('super-prueba','arroz-1kg')).items[0].current,null,'pending never public');
const queue=(await q('select price_moderation_queue($1,10) r',[staff]))[0].r;assert.equal(queue.length,1);assert.equal(queue[0].hasEvidence,true);
// same reporter twice is not independent
const rA2=await obs({sourceKind:'user_report',itemSlug:'arroz-1kg',placeSlug:'super-prueba',price:1201},userA);assert.equal(rA2.promoted,0);
const mod={actionId:uuid(),observationId:rA.observationId,decision:'publish'};
const m1=await rpc('price_observation_moderate',mod);assert.deepEqual(m1,{observationId:rA.observationId,moderationStatus:'published',confidence:'community',promoted:0});
assert.deepEqual(await rpc('price_observation_moderate',mod),m1);await assert.rejects(()=>rpc('price_observation_moderate',{...mod,actionId:uuid()}),code('40001'));
page=await pub('super-prueba','arroz-1kg');assert.equal(page.items[0].current.confidence,'community');assert.equal(page.items[0].current.price,1200);assert.equal(page.items[0].current.hasEvidence,true);
// out of tolerance → stays pending; independent match within 2 % → community_verified (both, plus userA's 2nd)
const rC=await obs({sourceKind:'user_report',itemSlug:'arroz-1kg',placeSlug:'super-prueba',price:1500},userC);assert.equal(rC.moderationStatus,'pending');assert.equal(rC.promoted,0);
const rB=await obs({sourceKind:'user_report',itemSlug:'arroz-1kg',placeSlug:'super-prueba',price:1210},userB);
assert.equal(rB.moderationStatus,'published');assert.equal(rB.confidence,'community_verified');assert.equal(rB.promoted,3);
assert.equal((await q("select confidence from price_observations where id=$1",[rC.observationId]))[0].confidence,'community');
page=await pub('super-prueba','arroz-1kg');assert.equal(page.items[0].current.confidence,'community_verified');assert.equal(page.items[0].current.price,1210);
const s=JSON.stringify(page);for(const id of [userA,userB,staff,rA.observationId,superP])assert.equal(s.includes(id),false,'no internal ids');
// a fresh business price outranks community_verified; an official MEIC price outranks business
await obs({sourceKind:'business',itemSlug:'arroz-1kg',placeSlug:'super-prueba',price:1250});
assert.equal((await pub('super-prueba','arroz-1kg')).items[0].current.confidence,'business');
assert.equal((await q("select count(*)::int n from price_observations where source_kind='business' and moderation_status='superseded'"))[0].n,1,'old business superseded');
const meicAt=ago(1),meic=await obs({sourceKind:'official_meic',itemSlug:'arroz-1kg',placeSlug:'super-prueba',price:1240,sourceRef:'MEIC-2099-01',observedAt:meicAt,validTo:ahead(500)});
assert.equal(new Date(meic.staleAfter).getTime(),new Date(meicAt).getTime()+120*864e5,'MEIC capped at 120 d');
page=await pub('super-prueba','arroz-1kg');assert.equal(page.items[0].current.sourceKind,'official_meic');assert.equal(page.items[0].current.sourceRef,'MEIC-2099-01');
// official LPG beats business LPG at the fuel station
await obs({sourceKind:'business',itemSlug:'lpg-bulk',placeSlug:'bomba-prueba',price:50});
assert.equal((await pub('bomba-prueba','lpg-bulk')).items[0].current.confidence,'official');
// user report rules
await assert.rejects(()=>obs({sourceKind:'user_report',itemSlug:'arroz-1kg',placeSlug:'super-prueba',price:1200,observedAt:ago(8)},userA),code('22023','price_stale'),'grocery report older than 7 d');
await assert.rejects(()=>obs({sourceKind:'user_report',itemSlug:'arroz-1kg',placeSlug:'super-borrador',price:1200},userA),code('P0002'));
await assert.rejects(()=>obs({sourceKind:'user_report',itemSlug:'no-existe',placeSlug:'super-prueba',price:1200},userA),code('P0002'));
await assert.rejects(()=>obs({sourceKind:'user_report',itemSlug:'arroz-1kg',placeSlug:'super-prueba',price:1200,observedAt:ahead(1)},userA),code('22023'));
await assert.rejects(()=>obs({sourceKind:'user_report',itemSlug:'arroz-1kg',placeSlug:'super-prueba',price:-5},userA),code('22023'));
await assert.rejects(()=>obs({sourceKind:'user_report',itemSlug:'arroz-1kg',placeSlug:'super-prueba',price:5,evidence:{sha256:'xyz'}},userA),code('22023'));
// Owner decision 2026-11-17: every pharmacy is public (requires_license=false). The per-vertical gate is kept: switched on,
// reports for a pharmacy without license_verified are refused and its prices hidden.
assert.deepEqual((await pub('farmacia-sin-permiso')).items,[],'unverified pharmacy is public (no prices yet)');
await db.exec("reset role;update dir_verticals set requires_license=true where id='pharmacy';set role service_role");
await assert.rejects(()=>obs({sourceKind:'user_report',itemSlug:'acetaminofen-500',placeSlug:'farmacia-sin-permiso',price:900},userA),code('P0002'),'gate on: unlicensed pharmacy');
assert.equal(await pub('farmacia-sin-permiso'),null,'gate on: hidden');
await db.exec("reset role;update dir_verticals set requires_license=false where id='pharmacy';set role service_role");
await assert.rejects(()=>obs({sourceKind:'business',itemSlug:'acetaminofen-500',placeSlug:'bomba-prueba',price:900}),code('22023'),'medicine only at pharmacies');
const otcAt=ago(10),otc=await obs({sourceKind:'user_report',itemSlug:'acetaminofen-500',placeSlug:'farmacia-prueba',price:900,observedAt:otcAt},userA);
assert.equal(new Date(otc.staleAfter).getTime(),new Date(otcAt).getTime()+14*864e5,'pharmacy report: 14 d');
await obs({sourceKind:'business',itemSlug:'acetaminofen-500',placeSlug:'farmacia-prueba',price:950});
assert.equal((await pub('farmacia-prueba')).items.length,1,'OTC medicine at licensed pharmacy is public');
assert.equal(await pub('super-borrador'),null);assert.equal(await pub('no-existe'),null);assert.equal(await pub('MAL slug'),null);

// HARD RULE: prescription medicine (Decreto 36868-S)
for(const sk of ['business','user_report'])await assert.rejects(()=>obs({sourceKind:sk,itemSlug:'antibiotico-rx',placeSlug:'farmacia-prueba',price:5000},sk==='user_report'?userB:staff),code('22023','price_rx_not_public'));
await db.exec('reset role');
for(const status of ['published','pending'])await assert.rejects(()=>db.query(`insert into price_observations(id,item_id,place_id,price,source_kind,source_id,observed_at,valid_from,stale_after,action_id,actor_id,moderation_status,confidence)
 select gen_random_uuid(),i.id,$1,5000,'business','owner',now(),now(),now(),gen_random_uuid(),$2,$3,'business' from price_items i where i.slug='antibiotico-rx'`,[farm,staff,status]),code('23514','price_rx_not_public'),'direct insert '+status);
await db.exec('set role service_role');
await item({slug:'acetaminofen-500',rxRequired:true});
assert.deepEqual((await pub('farmacia-prueba')).items,[],'flipping to rx hides past prices at once');
await assert.rejects(()=>obs({sourceKind:'user_report',itemSlug:'acetaminofen-500',placeSlug:'farmacia-prueba',price:900},userB),code('22023','price_rx_not_public'));
await db.exec('reset role');
await assert.rejects(()=>db.query("update price_observations set moderation_status='published' where id=$1",[otc.observationId]),code('23514','price_rx_not_public'),'pending rx row can never be published');
await assert.rejects(()=>db.exec("update price_items set rx_required=true where slug='arroz-1kg'"),code('23514'),'rx only for medicine');
await db.exec('set role service_role');
await assert.rejects(()=>rpc('price_observation_moderate',{actionId:uuid(),observationId:otc.observationId,decision:'publish'}),code('23514'));

// append-only, transitions, idempotency, caps
await assert.rejects(()=>db.exec('delete from price_observations'),code('42501'));
await assert.rejects(()=>db.exec('truncate price_observations'),code('42501'));
await db.exec('reset role');
await assert.rejects(()=>db.exec('delete from price_observations'),code('23514'));
await assert.rejects(()=>db.exec('truncate price_observations cascade'),code('23514'));
await assert.rejects(()=>db.query('update price_observations set price=1 where id=$1',[rB.observationId]),code('23514'));
await assert.rejects(()=>db.query("update price_observations set stale_after='infinity' where id=$1",[rB.observationId]),code('23514'));
await assert.rejects(()=>db.query("update price_observations set moderation_status='pending' where id=$1",[rB.observationId]),code('23514'));
await assert.rejects(()=>db.query("update price_observations set confidence='community' where id=$1",[rB.observationId]),code('23514'));
const rej=await (async()=>{await db.exec('set role service_role');return rpc('price_observation_moderate',{actionId:uuid(),observationId:rC.observationId,decision:'reject',note:'Precio no coincide.'});})();
assert.equal(rej.moderationStatus,'rejected');
await db.exec('reset role');
await assert.rejects(()=>db.query("update price_observations set moderation_status='published' where id=$1",[rC.observationId]),code('23514'),'rejected is terminal');
for(const [t,col] of [['price_actions','input'],['price_moderation_events','note']]){await assert.rejects(()=>db.exec(`update ${t} set ${col}=${col}`),code('23514'));
 await assert.rejects(()=>db.exec(`delete from ${t}`),code('23514'));await assert.rejects(()=>db.exec(`truncate ${t}`),code('23514'));}
await db.exec('set role service_role');
const recIn={actionId:uuid(),sourceKind:'business',itemSlug:'arroz-1kg',placeSlug:'super-prueba',price:1255,observedAt:ago(0.01)};
const rec=await rpc('price_observation_record',recIn);assert.deepEqual(await rpc('price_observation_record',recIn),rec);
await assert.rejects(()=>rpc('price_observation_record',{...recIn,price:1256}),code('22023'),'actionId reused');
await rpc('price_item_upsert',{actionId:uuid(),slug:'frijol-1kg',kind:'grocery',name:'Frijoles 1 kg',unitBase:'kg',unitQty:1});
const before=(await q('select count(*)::int n from price_observations where reporter_id=$1',[userC]))[0].n;
for(let i=before;i<30;i++)await obs({sourceKind:'user_report',itemSlug:'frijol-1kg',placeSlug:'super-prueba',price:1000+i*100},userC);
await assert.rejects(()=>obs({sourceKind:'user_report',itemSlug:'frijol-1kg',placeSlug:'super-prueba',price:999},userC),code('54000','price_report_cap'));
const events=await q("select reason,count(*)::int n from price_moderation_events group by reason order by reason");
assert.deepEqual(events.map(e=>e.reason),['auto_promote','moderation','superseded']);

// RLS / grants
for(const role of ['anon','authenticated']){
 await db.exec(`reset role;set role ${role}`);
 for(const t of ['price_items','price_observations','price_staleness_rules','price_actions'])await assert.rejects(()=>db.exec(`select * from ${t}`),code('42501'),role+' '+t);
 await assert.rejects(()=>pub(null),code('42501'));
 await assert.rejects(()=>obs({sourceKind:'user_report',itemSlug:'arroz-1kg',placeSlug:'super-prueba',price:1200},userA),code('42501'));
}
await db.exec('reset role');
assert.equal((await q("select count(*)::int n from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname like 'price\\_%' or p.proname='public_price_current') and (p.prosecdef or not exists(select 1 from unnest(coalesce(p.proconfig,'{}')) c where c like 'search_path=%'))"))[0].n,0);
assert.equal((await q("select count(*)::int n from pg_class where relname like 'price\\_%' and relkind='r' and not relrowsecurity"))[0].n,0);

// reinstall keeps data
const snap=await q('select id,moderation_status,confidence from price_observations order by id');await db.exec(sql);assert.deepEqual(await q('select id,moderation_status,confidence from price_observations order by id'),snap);
await db.close();
console.log('PASS price observations: zod mirrors + GTIN check digit, offline ARESEP importer (deterministic, 7 invalid files), module applied 3× (idempotent), items (rx default for medicine, 6 invalid), national ARESEP set idempotent + supersede by newer effective resolution (future waits, older never wins), staleness rules (ARESEP valid_to, business 30 d, MEIC ≤120 d, user 7/14 d), reader priority official → business → community_verified → community with stale rows only as lastKnown, pending never public, auto-promotion with ≥2 independent reporters within 2 %, Rx HARD RULE (RPC refuses, direct insert blocked, flip hides, publish blocked), append-only observations/receipts/events, terminal transitions, idempotent actionId, 30/day report cap (54000), RLS/grants, security invoker + pinned search_path.');

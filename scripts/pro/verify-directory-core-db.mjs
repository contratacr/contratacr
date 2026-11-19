// LOCAL PRO ONLY (multivertical F1): in-memory PGlite verification of docs/pro/sql/directory-core-local.sql.
// Applies the module twice, then checks CAS, idempotency, validation, public visibility, provenance, reports,
// removal, immutability and RLS/grants for anon/authenticated/service_role. Never touches a shared database.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {registerHooks} from 'node:module';
const libRoot=new URL('../../src/lib/',import.meta.url).href;
registerHooks({resolve(specifier,context,next){return next(context.parentURL?.startsWith(libRoot)&&specifier.startsWith('.')&&!/\.[a-z]+$/i.test(specifier)?specifier+'.ts':specifier,context);}});
const {placeMutationSchema,placeReportSchema,verticalAttributeSchemas}=await import('../../src/lib/directory/schemas.ts');
{const uuid=()=>crypto.randomUUID(),ok=v=>placeMutationSchema.safeParse(v).success,mk=(place,extra={})=>({action:'create',actionId:uuid(),placeId:uuid(),revision:0,place:{slug:'soda-uno',vertical:'restaurant',name:'Soda Uno',...place},...extra});
 assert.equal(ok(mk({lat:9.93,lng:-84.08,attributes:{serviceCharge:true,priceLevel:2}})),true);
 for(const bad of [mk({slug:'A'}),mk({vertical:'casino'}),mk({lat:40,lng:-3}),mk({lat:9.9}),mk({attributes:{sponsored:true}}),mk({attributes:{priceLevel:9}}),mk({website:'javascript:x'}),mk({},{revision:1}),mk({},{verificationLevel:'verified'}),mk({},{extra:1})])assert.equal(ok(bad),false,JSON.stringify(bad).slice(0,90));
 assert.equal(ok({action:'hours',actionId:uuid(),placeId:uuid(),revision:3,hours:[{weekday:1,opens:'08:00',closes:'08:00'}]}),false);
 assert.equal(ok({action:'update',actionId:uuid(),placeId:uuid(),revision:3,place:{vertical:'fuel'}}),false);
 assert.equal(verticalAttributeSchemas.pharmacy.safeParse({price:100}).success,false,'no medicine prices');
 assert.equal(placeReportSchema.safeParse({reportId:uuid(),kind:'removal_request',message:'Retiren mi ficha por favor.',email:''}).success,true);
 assert.equal(placeReportSchema.safeParse({reportId:uuid(),kind:'spam',message:'xxxxxx'}).success,false);}
const {PGlite}=await import(process.env.PRO_PGLITE_MODULE||'@electric-sql/pglite'),db=new PGlite();
const staff='00000000-0000-4000-8000-0000000000aa',other='00000000-0000-4000-8000-0000000000bb',id=i=>'00000000-0000-4000-8000-'+String(i).padStart(12,'0');
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;`);
const sql=await readFile('docs/pro/sql/directory-core-local.sql','utf8');await db.exec(sql);await db.exec(sql);
// Owner approval 2026-11-17: six original + eleven new place sections, same ids/paths/keys as place-verticals.ts.
assert.equal((await db.query('select count(*)::int n from dir_verticals')).rows[0].n,17);
{const {PLACE_SECTIONS}=await import('../../src/lib/directory/place-verticals.ts');
 const rows=(await db.query('select id,name_es,name_en,path_es,path_en,attribute_keys,requires_license from dir_verticals')).rows;
 for(const s of PLACE_SECTIONS.filter(x=>x.added)){const r=rows.find(x=>x.id===s.id);assert.ok(r,s.id);
  assert.deepEqual([r.name_es,r.name_en,r.path_es,r.path_en,r.requires_license],[s.nameEs,s.nameEn,s.section,s.pathEn,false],s.id);
  assert.ok(r.attribute_keys.includes('kind'),s.id+' kind');
  assert.deepEqual([...r.attribute_keys].sort(),Object.keys(verticalAttributeSchemas[s.id].shape).sort(),s.id+' keys = zod');}
 // No official-status or commercial attribute anywhere (no stars, ICT declaratoria, rates, sponsorship).
 for(const r of rows)for(const k of r.attribute_keys)assert.ok(!/star|ict|declarat|rate|tasa|sponsor|featured|paid|price$/i.test(k),r.id+':'+k);
 assert.equal(verticalAttributeSchemas.health.safeParse({kind:'clinic',publicService:true}).success,true);
 assert.equal(verticalAttributeSchemas.health.safeParse({kind:'pharmacy'}).success,false,'pharmacy is not a health kind');
 assert.equal(verticalAttributeSchemas.health.safeParse({consultationPrice:20000}).success,false,'no consultation prices');
 assert.equal(verticalAttributeSchemas.banking.safeParse({kind:'atm',interestRate:5}).success,false,'no rates at banks');
 assert.equal(verticalAttributeSchemas.lodging.safeParse({kind:'hotel',stars:5}).success,false,'no official stars');}
assert.equal((await db.query('select count(*)::int n from dir_data_sources')).rows[0].n,3);
await db.exec('set role service_role');
const q=async(text,params=[])=>(await db.query(text,params)).rows;
const mutate=async(input,actor=staff)=>(await q('select dir_place_mutate($1,$2) r',[actor,input]))[0].r;
const pub=async slug=>(await q('select dir_place_public($1) p',[slug]))[0].p;
const act=(action,placeId,revision,extra={})=>({action,placeId,revision,actionId:crypto.randomUUID(),...extra});
const code=c=>e=>{assert.equal(e.code,c,e.message);return true;};
const place={slug:'soda-la-prueba',vertical:'restaurant',name:'Soda La Prueba',adminArea1:'San José',adminArea2:'San José',adminArea3:'Carmen',locality:'San José',addressLine:'Avenida Central 10',lat:9.933,lng:-84.08,phone:'+506 2200 0001',website:'https://example.com',attributes:{cuisines:['típica'],serviceCharge:true}};

// create + idempotency + CAS
const create=act('create',id(1),0,{place}),c1=await mutate(create);
assert.deepEqual(c1,{action:'create',placeId:id(1),slug:'soda-la-prueba',revision:1,status:'draft',verificationLevel:'unverified'});
assert.deepEqual(await mutate(create),c1);
await assert.rejects(()=>mutate({...create,place:{...place,name:'Otro'}}),code('22023'));
await assert.rejects(()=>mutate(act('create',id(1),0,{place})),code('40001'));
assert.equal((await q("select location_precision from dir_places where id=$1",[id(1)]))[0].location_precision,'exact');
assert.equal(await pub('soda-la-prueba'),null,'draft is not public');
let rev=(await mutate(act('status',id(1),1,{status:'published'}))).revision;assert.equal(rev,2);
await assert.rejects(()=>mutate(act('update',id(1),1,{place:{name:'Viejo'}})),code('40001'));
rev=(await mutate(act('update',id(1),rev,{place:{name:'Soda La Prueba Central',website:null}}))).revision;
rev=(await mutate(act('hours',id(1),rev,{hours:[{weekday:1,opens:'08:00',closes:'14:00'},{weekday:1,opens:'16:00',closes:'22:00'},{weekday:5,opens:'18:00',closes:'02:00'}]}))).revision;
let page=await pub('soda-la-prueba');
assert.equal(page.name,'Soda La Prueba Central');assert.equal(page.website,null);assert.equal(page.hours.length,3);assert.equal(page.address.adminArea3,'Carmen');
assert.equal(page.countryCode,'CR');assert.equal(page.currency,'CRC');assert.deepEqual(page.rating,{average:null,count:0});assert.deepEqual(page.sources,[]);
for(const key of ['id','placeId','revision','actorId'])assert.equal(key in page,false,'no internal '+key);
assert.equal(JSON.stringify(page).includes(staff),false);
assert.equal((await q("select count(*)::int n from dir_places where search_tsv @@ to_tsquery('simple','soda & central')"))[0].n,1);

// negative validation
const bad=[[{...place,slug:'Mayúsculas'}],[{...place,slug:'otro-1',vertical:'casino'}],[{...place,slug:'otro-2',name:'X'}],[{...place,slug:'otro-3',lat:40,lng:-3}],[{...place,slug:'otro-4',lat:9.9,lng:null}],
 [{...place,slug:'otro-5',phone:'llame ya'}],[{...place,slug:'otro-6',website:'javascript:alert(1)'}],[{...place,slug:'otro-7',attributes:{sponsored:true}}],[{...place,slug:'otro-8',attributes:[]}],[{...place,slug:'soda-la-prueba'}],
 [{...place,slug:'otro-9',lat:'9.9'}],[{...place,slug:'otro-10',locationPrecision:'galaxy'}]];
for(const [p] of bad)await assert.rejects(()=>mutate(act('create',crypto.randomUUID(),0,{place:p})),undefined,JSON.stringify(p).slice(0,80));
await assert.rejects(()=>mutate(act('create',id(2),0,{place:{...place,slug:'imp'},verificationLevel:'license_verified'})),code('22023'));
await assert.rejects(()=>mutate(act('create',id(2),0,{place:{...place,slug:'imp'},verificationLevel:'imported'})),code('22023'),'imported needs an import source');
await assert.rejects(()=>mutate(act('update',id(1),rev,{place:{vertical:'fuel'}})),code('22023'));
await assert.rejects(()=>mutate(act('update',id(99),0,{place:{name:'Nada'}})),code('P0002'));
await assert.rejects(()=>mutate(act('hours',id(1),rev,{hours:[{weekday:9,opens:'08:00',closes:'09:00'}]})),code('22023'));
await assert.rejects(()=>mutate(act('hours',id(1),rev,{hours:[{weekday:1,opens:'08:00',closes:'08:00'}]})),code('22023'));
await assert.rejects(()=>mutate(act('status',id(1),rev,{status:'featured'})),code('22023'));
await assert.rejects(()=>mutate(act('verify',id(1),rev,{verificationLevel:'verified',source:{id:'owner'}})),code('22023'),'only staff verifies');
await assert.rejects(()=>mutate({...act('update',id(1),rev,{place:{name:'Sin actor'}})},null),code('22023'));
await assert.rejects(()=>mutate({action:'update',placeId:id(1),revision:rev,place:{name:'Sin id'}}),code('22023'));
await assert.rejects(()=>mutate(act('update',id(1),rev,{place:{name:'Fuente rara'},source:{id:'desconocida'}})),code('22023'));
assert.equal((await pub('soda-la-prueba')).name,'Soda La Prueba Central');assert.equal((await q('select revision from dir_places where id=$1',[id(1)]))[0].revision,rev);

// provenance from a licensed source → public attribution
rev=(await mutate(act('update',id(1),rev,{place:{phone:'+506 2200 0009'},source:{id:'osm',ref:'node/1',observedAt:'2026-11-16T00:00:00Z'}}))).revision;
page=await pub('soda-la-prueba');assert.equal(page.phone,'+506 2200 0009');assert.equal(page.sources.length,1);assert.match(page.sources[0].attribution,/OpenStreetMap/);
rev=(await mutate(act('update',id(1),rev,{place:{phone:'+506 2200 0010'}}))).revision;assert.deepEqual((await pub('soda-la-prueba')).sources,[],'latest provenance wins');
await db.exec("reset role;update dir_data_sources set allows_phone=false where id='osm';set role service_role");
await assert.rejects(()=>mutate(act('update',id(1),rev,{place:{phone:'+506 2200 0011'},source:{id:'osm',ref:'node/1'}})),code('22023'));
await db.exec("reset role;update dir_data_sources set allows_phone=true where id='osm';set role service_role");

// Owner decision 2026-11-17: every published pharmacy is public (seed requires_license=false, also after a re-apply
// of a database seeded with true); the per-vertical requires_license gate itself is kept and still works.
assert.equal((await q("select requires_license r from dir_verticals where id='pharmacy'"))[0].r,false,'pharmacies shown without a verified licence');
const ph=await mutate(act('create',id(3),0,{place:{slug:'farmacia-prueba',vertical:'pharmacy',name:'Farmacia Prueba',lat:9.93,lng:-84.05,attributes:{onDuty:true}}}));
let prev=(await mutate(act('status',id(3),ph.revision,{status:'published'}))).revision;assert.equal((await pub('farmacia-prueba')).verificationLevel,'unverified','unverified pharmacy is public');
await db.exec("reset role;update dir_verticals set requires_license=true where id='pharmacy';set role service_role");
assert.equal(await pub('farmacia-prueba'),null,'gate kept: a vertical with requires_license needs license_verified');
prev=(await mutate(act('verify',id(3),prev,{verificationLevel:'license_verified'}))).revision;assert.equal((await pub('farmacia-prueba')).verificationLevel,'license_verified');
await db.exec("reset role");await db.exec(sql);await db.exec('set role service_role');
assert.equal((await q("select requires_license r from dir_verticals where id='pharmacy'"))[0].r,false,'re-apply restores the 2026-11-17 decision');

// reports: idempotent, validated, capped; removal request accepted → removed (terminal)
const report={reportId:crypto.randomUUID(),kind:'removal_request',message:'Soy el dueño y pido retirar la ficha.',email:'Dueno@Example.com'};
assert.deepEqual((await q('select dir_report_create(null,$1,$2) r',['soda-la-prueba',report]))[0].r,{ok:true});
assert.deepEqual((await q('select dir_report_create(null,$1,$2) r',['soda-la-prueba',report]))[0].r,{ok:true});
assert.equal((await q('select count(*)::int n from dir_reports'))[0].n,1);
await assert.rejects(()=>q('select dir_report_create(null,$1,$2)',['soda-la-prueba',{...report,message:'Otro texto distinto'}]),code('22023'));
for(const r of [{...report,reportId:crypto.randomUUID(),kind:'spam'},{...report,reportId:crypto.randomUUID(),message:'abc'},{...report,reportId:crypto.randomUUID(),email:'no-email'},{...report,reportId:'x'}])
 await assert.rejects(()=>q('select dir_report_create(null,$1,$2)',['soda-la-prueba',r]),code('22023'));
await assert.rejects(()=>q('select dir_report_create(null,$1,$2)',['no-existe',{...report,reportId:crypto.randomUUID()}]),code('P0002'));
for(let i=0;i<4;i++)await q('select dir_report_create(null,$1,$2)',['soda-la-prueba',{...report,reportId:crypto.randomUUID(),kind:'wrong_info'}]);
await assert.rejects(()=>q('select dir_report_create(null,$1,$2)',['soda-la-prueba',{...report,reportId:crypto.randomUUID(),kind:'wrong_info'}]),code('54000'));
const resolve={actionId:crypto.randomUUID(),reportId:report.reportId,decision:'accept',revision:rev,note:'Solicitud verificada.'};
await assert.rejects(()=>q('select dir_report_resolve($1,$2)',[staff,{...resolve,actionId:crypto.randomUUID(),revision:rev-1}]),code('40001'));
const resolved=(await q('select dir_report_resolve($1,$2) r',[staff,resolve]))[0].r;assert.equal(resolved.status,'accepted');assert.equal(resolved.place.status,'removed');
assert.deepEqual((await q('select dir_report_resolve($1,$2) r',[staff,resolve]))[0].r,resolved);
await assert.rejects(()=>q('select dir_report_resolve($1,$2)',[staff,{...resolve,actionId:crypto.randomUUID()}]),code('40001'));
rev=resolved.place.revision;assert.equal(await pub('soda-la-prueba'),null);
await assert.rejects(()=>mutate(act('status',id(1),rev,{status:'published'})),code('22023'));
rev=(await mutate(act('status',id(1),rev,{status:'hidden'}))).revision;
await assert.rejects(()=>q('select dir_report_create(null,$1,$2)',['soda-la-prueba',{...report,reportId:crypto.randomUUID()}]),code('P0002'));

// history and receipts are complete and immutable
const hist=await q('select action,revision,before is null as first from dir_place_history where place_id=$1 order by id',[id(1)]);
assert.equal(hist.length,rev);assert.equal(hist[0].first,true);assert.deepEqual(hist.map(h=>h.revision),Array.from({length:rev},(_,i)=>i+1));
await db.exec('reset role');
for(const t of ['dir_place_history','dir_place_actions','dir_field_provenance']){
 await assert.rejects(()=>db.exec(`update ${t} set action_id=action_id`),code('23514'));
 await assert.rejects(()=>db.exec(`delete from ${t}`),code('23514'));
 await assert.rejects(()=>db.exec(`truncate ${t}`),code('23514'));
}
await assert.rejects(()=>db.exec('truncate dir_places cascade'),code('23514'));
await db.exec('set role service_role');
for(const t of ['dir_place_history','dir_place_actions','dir_field_provenance','dir_places','dir_reports'])await assert.rejects(()=>db.exec(`delete from ${t}`),code('42501'),t+' delete');
await assert.rejects(()=>db.exec('truncate dir_place_history'),code('42501'));

// RLS / grants
for(const role of ['anon','authenticated']){
 await db.exec(`reset role;set role ${role}`);
 for(const t of ['dir_places','dir_place_history','dir_reports','dir_verticals'])await assert.rejects(()=>db.exec(`select * from ${t}`),code('42501'),role+' '+t);
 await assert.rejects(()=>q('select dir_place_public($1)',['farmacia-prueba']),code('42501'));
 await assert.rejects(()=>mutate(act('status',id(3),prev,{status:'hidden'}),other),code('42501'));
 await assert.rejects(()=>q('select dir_report_create(null,$1,$2)',['farmacia-prueba',{...report,reportId:crypto.randomUUID()}]),code('42501'));
}
await db.exec('reset role');
const secdef=await q("select count(*)::int n from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'dir\\_%' and (p.prosecdef or not exists(select 1 from unnest(coalesce(p.proconfig,'{}')) c where c like 'search_path=%'))");
assert.equal(secdef[0].n,0,'all dir_ functions: security invoker + pinned search_path');
assert.equal((await q("select count(*)::int n from pg_class where relname like 'dir\\_%' and relkind='r' and not relrowsecurity"))[0].n,0,'RLS on every table');

// reinstall keeps data
const before=await q('select id,revision,status from dir_places order by id');await db.exec(sql);assert.deepEqual(await q('select id,revision,status from dir_places order by id'),before);
await db.close();
console.log('PASS directory core: 17 verticals (2026-11-17 sections = place-verticals.ts ids/paths/keys, kind on each, no stars/ICT/rates/commercial keys), zod mirrors (create/update/hours/report, per-vertical attributes), module applied 3× (idempotent), create/update/status/hours/verify with CAS 40001 and idempotent actionId, 12 invalid inputs + vertical/verification/source negatives, public reader hides drafts/removed (unlicensed only where requires_license; every pharmacy public since 2026-11-17) pharmacies and internal ids, per-field provenance with OSM attribution, reports idempotent+capped (54000), removal request → removed (terminal), immutable history/receipts/provenance (UPDATE/DELETE/TRUNCATE), no DELETE grants, RLS/grants for anon/authenticated/service_role, security invoker + pinned search_path.');

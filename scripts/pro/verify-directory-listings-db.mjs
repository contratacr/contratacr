// LOCAL PRO ONLY (multivertical V1 + R1 data + UI gaps V2/V3/V7/R2): in-memory PGlite verification of
// directory-listings-local.sql. Applies directory-core + vehicles-catalog + directory-claims + team-roles (with a
// minimal profiles stub) + listings (listings twice), then checks zod mirrors, create/update/status/renew with CAS
// 40001 and idempotent actionId, transitions (SQL = TS table), seller limits, FX normalisation, expiry, moderation,
// public readers (published + reserved with status, no private fields, fuzzed 300–500 m, photos, declared financing),
// V3 photos (min 4 to publish, ≤30, sha256 duplicates across sellers → review, price outlier → review, reports via
// dir_reports), place management on place_id, R2 agent assignment against the Pro team, the Pro owner reader
// (filters, keyset cursor, private fields only for the seller), immutable history/flags and RLS/grants.
// SQL directory: process.env.DIR_SQL_DIR (default docs/pro/sql); team-roles-local.sql always from docs/pro/sql.
// Never touches a shared database.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {registerHooks} from 'node:module';
const libRoot=new URL('../../src/lib/',import.meta.url).href;
registerHooks({resolve(specifier,context,next){return next(context.parentURL?.startsWith(libRoot)&&specifier.startsWith('.')&&!/\.[a-z]+$/i.test(specifier)?specifier+'.ts':specifier,context);}});
const Z=await import('../../src/lib/directory/listing-schemas.ts');
const Inv=await import('../../src/lib/directory/listing-inventory.ts');
const Pub=await import('../../src/lib/directory/listing-public.ts');
const uuid=()=>crypto.randomUUID();

// ---------------------------------------------------------------- zod mirrors
{const ok=v=>Z.listingMutationSchema.safeParse(v).success;
 const veh={makeId:1,modelId:1,year:2020,condition:'used',mileageKm:50000,platePrivate:'bkz123'};
 const mk=(listing={},extra={})=>({action:'create',actionId:uuid(),listingId:uuid(),revision:0,listing:{vertical:'vehiculos',sellerKind:'private',title:'Toyota Hilux 2020',priceMinor:1500000000,currency:'CRC',...listing},vehicle:veh,...extra});
 assert.equal(ok(mk()),true);
 assert.equal(Z.listingMutationSchema.parse(mk()).vehicle.platePrivate,'BKZ123');
 for(const bad of [mk({vertical:'barcos'}),mk({currency:'EUR'}),mk({priceMinor:0}),mk({title:'abc'}),mk({lat:40,lng:-3}),mk({lat:9.9}),mk({placeId:uuid()}),mk({},{vehicle:undefined}),
  mk({},{revision:1}),mk({},{extra:1}),mk({},{vehicle:{...veh,vinPrivate:'IOQ'}}),mk({},{vehicle:{...veh,year:2099}}),mk({vertical:'inmuebles'},{vehicle:undefined,property:{operation:'sale',propertyType:'house',minLeaseMonths:12}}),
  mk({vertical:'inmuebles'},{vehicle:undefined,property:{operation:'sale',propertyType:'castle'}}),mk({vertical:'inmuebles'},{vehicle:undefined,property:{operation:'rent',propertyType:'house',amenities:['pool','pool']}})])
  assert.equal(ok(bad),false,JSON.stringify(bad).slice(0,120));
 assert.equal(ok(mk({vertical:'inmuebles'},{vehicle:undefined,property:{operation:'rent',propertyType:'apartment',minLeaseMonths:12,amenities:['pool'],folioRealPrivate:'1-123456-000'}})),true);
 assert.equal(ok({action:'update',actionId:uuid(),listingId:uuid(),revision:2}),false,'empty update');
 assert.equal(ok({action:'update',actionId:uuid(),listingId:uuid(),revision:2,listing:{vertical:'inmuebles'}}),false);
 assert.equal(ok({action:'update',actionId:uuid(),listingId:uuid(),revision:2,property:{operation:'rent'}}),false,'operation fixed');
 assert.equal(ok({action:'status',actionId:uuid(),listingId:uuid(),revision:2,status:'suspended'}),false,'owner cannot suspend');
 assert.equal(ok({action:'renew',actionId:uuid(),listingId:uuid(),revision:2}),true);
 assert.equal(Z.listingModerationSchema.safeParse({action:'seller',actionId:uuid(),profileId:uuid(),businessVerified:true}).success,true);
 assert.equal(Z.fxRateSchema.safeParse({date:'2026-11-16',usdCrc:-1,source:'bccr'}).success,false);
 assert.equal(Z.listingCodeSchema.safeParse('ab0cde').success,false);
 // UI-gap contracts
 const mid=uuid(),ph={id:mid,sha256:'a'.repeat(64),width:1600,height:1067,path1600:`dir-listings/${mid}/1600.webp`,path800:`dir-listings/${mid}/800.webp`,path320:`dir-listings/${mid}/320.webp`,exifStripped:true};
 const okM=v=>Inv.listingMediaMutationSchema.safeParse(v).success,mb={action:'add',actionId:uuid(),listingId:uuid()};
 assert.equal(okM({...mb,media:ph}),true);
 for(const bad of [{...ph,exifStripped:false},{...ph,sha256:'xyz'},{...ph,width:100},{...ph,width:500,height:500},{...ph,path800:`dir-listings/${uuid()}/800.webp`},{...ph,path320:`dir-listings/${mid}/320.png`},{...ph,extra:1}])
  assert.equal(okM({...mb,media:bad}),false,JSON.stringify(bad).slice(0,80));
 assert.equal(okM({action:'reorder',actionId:uuid(),listingId:uuid(),order:[mid,mid]}),false,'repeated ids');
 assert.equal(okM({action:'remove',actionId:uuid(),listingId:uuid(),mediaId:mid}),true);
 const okF=f=>Inv.listingFinancingSchema.safeParse({actionId:uuid(),placeId:uuid(),revision:0,financing:f}).success;
 assert.equal(okF({annualRatePct:12.5,maxTermMonths:72,minDownPaymentPct:20}),true);assert.equal(okF(null),true);
 for(const f of [{annualRatePct:61,maxTermMonths:72,minDownPaymentPct:20},{annualRatePct:12.345,maxTermMonths:72,minDownPaymentPct:20},{annualRatePct:12,maxTermMonths:121,minDownPaymentPct:20},
  {annualRatePct:12,maxTermMonths:12.5,minDownPaymentPct:20},{annualRatePct:12,maxTermMonths:12,minDownPaymentPct:95},{annualRatePct:12,maxTermMonths:12}])assert.equal(okF(f),false,JSON.stringify(f));
 assert.equal(Inv.listingAssignAgentSchema.safeParse({action:'assign_agent',actionId:uuid(),listingId:uuid(),revision:3,agentId:null}).success,true);
 assert.equal(Inv.inventoryQuerySchema.safeParse({vertical:'inmuebles',filter:'closed',cursor:'123_'+uuid()}).success,true);
 assert.equal(Inv.inventoryQuerySchema.safeParse({vertical:'inmuebles',cursor:'abc'}).success,false);
 assert.equal(Z.listingReportSchema.safeParse({reportId:uuid(),kind:'abuse',message:'Pide depósito antes de ver el carro'}).success,true);
 assert.equal(Z.listingReportSchema.safeParse({reportId:uuid(),kind:'removal_request',message:'Quiten esto por favor'}).success,false,'place-only kind');
 assert.equal(Pub.mapDeclaredFinancing({annualRatePct:'12.50',maxTermMonths:72,minDownPaymentPct:20,declaredAt:'2026-11-16T00:00:00Z'}),null,'flag required');
 assert.match(Inv.inventoryErrorText('listing_agent_not_member','es'),/miembro activo/);assert.match(Inv.inventoryErrorText('photos_missing','es'),/4 fotos/);}
// Every hint raised by the listings SQL has a stable API code.
{const text=await readFile(join(process.env.DIR_SQL_DIR||'docs/pro/sql','directory-listings-local.sql'),'utf8');
 for(const [,h] of text.matchAll(/hint='(dir_listing_[a-z_]+)'/g))assert.ok(h in Z.LISTING_ERROR_HINTS,'hint without API code: '+h);}

// ---------------------------------------------------------------- database
const dir=process.env.DIR_SQL_DIR||'docs/pro/sql';
const {PGlite}=await import(process.env.PRO_PGLITE_MODULE||'@electric-sql/pglite'),db=new PGlite();
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create table public.profiles(id uuid primary key,is_disabled boolean not null default false);grant select on public.profiles to service_role;`);
const core=await readFile(join(dir,'directory-core-local.sql'),'utf8'),cat=await readFile(join(dir,'vehicles-catalog-local.sql'),'utf8'),sql=await readFile(join(dir,'directory-listings-local.sql'),'utf8');
const claimsSql=await readFile(join(dir,'directory-claims-local.sql'),'utf8'),teamSql=await readFile('docs/pro/sql/team-roles-local.sql','utf8');
await db.exec(core);await db.exec(cat);await db.exec(claimsSql);await db.exec(teamSql);await db.exec(sql);await db.exec(sql);
const q=async(text,params=[])=>(await db.query(text,params)).rows;
assert.deepEqual((await q('select key,value from dir_listing_limits order by key')).map(r=>[r.key,r.value]),[['business_unverified_published',5],['financing_max_age_days',180],['min_photos_publish',4],
 ['price_outlier_min_samples',5],['price_outlier_pct',50],['private_active_per_vertical',2],['reports_to_review',3]]);
const staff='00000000-0000-4000-8000-0000000000aa',alice='00000000-0000-4000-8000-00000000a11c',bob='00000000-0000-4000-8000-000000000b0b',biz='00000000-0000-4000-8000-0000000000b1';
const hilux=(await q(`select o.id model,o.make_id make from ref_vehicle_models o join ref_vehicle_makes m on m.id=o.make_id where m.slug='toyota' and o.slug='hilux'`))[0];
const versa=(await q(`select o.id model from ref_vehicle_models o join ref_vehicle_makes m on m.id=o.make_id where m.slug='nissan' and o.slug='versa'`))[0];
await db.exec('set role service_role');
const code=c=>e=>{assert.equal(e.code,c,e.message);return true;};
const hint=(c,h)=>e=>{assert.equal(e.code,c,e.message);assert.equal(e.hint,h,e.message);return true;};
const mutate=async(input,actor=alice)=>(await q('select dir_listing_mutate($1,$2) r',[actor,input]))[0].r;
const moderate=async(input,actor=staff)=>(await q('select dir_listing_moderate($1,$2) r',[actor,input]))[0].r;
const pub=async c=>(await q('select dir_listing_public($1) p',[c]))[0].p;
const act=(action,listingId,revision,extra={})=>({action,listingId,revision,actionId:uuid(),...extra});
const call=async(fn,actor,input)=>(await q(`select ${fn}($1,$2) r`,[actor,input]))[0].r;
const hex64=()=>(uuid()+uuid()).replace(/-/g,'');
const photo=(id=uuid(),sha=hex64())=>({id,sha256:sha,width:1600,height:1067,path1600:`dir-listings/${id}/1600.webp`,path800:`dir-listings/${id}/800.webp`,path320:`dir-listings/${id}/320.webp`,exifStripped:true});
const media=(input,actor=alice)=>call('dir_listing_media_mutate',actor,{actionId:uuid(),...input});
const addPhotos=async(listingId,actor=alice,n=4)=>{const out=[];for(let i=0;i<n;i++){const p=photo();out.push(p);await media({action:'add',listingId,media:p},actor);}return out;};
const revOf=async id=>(await q('select revision from dir_listings where id=$1',[id]))[0].revision;
// Make `user` the owner of a published place through a staff-reviewed claim (directory-claims-local.sql).
const claimPlace=async(slug,user)=>{const cid=uuid();
 await call('dir_claim_open',user,{actionId:uuid(),claimId:cid,slug,method:'document_review',evidence:{documents:[{kind:'municipal_license',path:`dir-claims/${cid}/patente.pdf`}]}});
 await call('dir_claim_review',staff,{actionId:uuid(),claimId:cid,decision:'approve'});};
const desc='Único dueño, mantenimiento al día en agencia, llantas nuevas.';
const vehicle={makeId:Number(hilux.make),modelId:Number(hilux.model),version:'SR 4x4',year:2020,condition:'used',mileageKm:85000,transmission:'manual',fuel:'diesel',drivetrain:'4x4',
 acceptsTradeIn:true,marchamoCurrentDeclared:true,platePrivate:'bkz-123',vinPrivate:'jtfss22p0b0123456'};
const vListing={vertical:'vehiculos',sellerKind:'private',title:'Toyota Hilux SR 2020',description:desc,priceMinor:1850000000,currency:'CRC',adminArea1:'San José',adminArea2:'Escazú',lat:9.918,lng:-84.14};
// FX rate for USD normalisation.
assert.deepEqual((await q('select dir_fx_rate_set($1,$2) r',[staff,{date:'2026-11-01',usdCrc:505.5,source:'bccr'}]))[0].r.usdCrc,505.5);
await assert.rejects(()=>q('select dir_fx_rate_set($1,$2)',[staff,{date:'2026-11-01',usdCrc:-5,source:'bccr'}]),code('22023'));

// create + idempotency + CAS + public code
const L1=uuid(),create={action:'create',actionId:uuid(),listingId:L1,revision:0,listing:vListing,vehicle};
const c1=await mutate(create);
assert.equal(c1.revision,1);assert.equal(c1.status,'draft');assert.match(c1.code,/^[2-9a-hjkmnp-z]{6}$/);
assert.deepEqual(await mutate(create),c1);
await assert.rejects(()=>mutate({...create,listing:{...vListing,title:'Otro título'}}),code('22023'));
await assert.rejects(()=>mutate({...create,actionId:uuid()}),code('40001'));
assert.equal((await q('select dir_listing_code($1) c',[L1]))[0].c===c1.code,false,'code generator skips taken codes');
const row=(await q('select * from dir_listings l join dir_listing_vehicle v on v.listing_id=l.id where l.id=$1',[L1]))[0];
assert.equal(String(row.price_crc_norm),'1850000000');assert.equal(row.vehicle_type,'pickup');assert.equal(row.plate_private,'BKZ-123');assert.equal(row.vin_private,'JTFSS22P0B0123456');
assert.equal(await pub(c1.code),null,'draft is not public');

// negatives on create
const badCreates=[[{...vListing,vertical:'barcos'},vehicle],[{...vListing,sellerKind:'robot'},vehicle],[{...vListing,currency:'EUR'},vehicle],[{...vListing,priceMinor:0},vehicle],
 [{...vListing,title:'  ab  '},vehicle],[{...vListing,lat:40,lng:-3},vehicle],[{...vListing,lat:9.9,lng:null},vehicle],[{...vListing,placeId:uuid()},vehicle],[{...vListing,featured:true},vehicle],
 [vListing,{...vehicle,modelId:Number(versa.model)}],[vListing,{...vehicle,year:2099}],[vListing,{...vehicle,condition:'broken'}],[vListing,{...vehicle,vinPrivate:'IOQ'}],[vListing,{...vehicle,sponsored:true}],[vListing,null]];
for(const [l,v] of badCreates)await assert.rejects(()=>mutate({action:'create',actionId:uuid(),listingId:uuid(),revision:0,listing:l,...(v?{vehicle:v}:{})},bob),undefined,JSON.stringify({l,v}).slice(0,120));
await assert.rejects(()=>mutate({action:'create',actionId:uuid(),listingId:uuid(),revision:0,listing:vListing,vehicle,property:{operation:'sale',propertyType:'house'}},bob),code('22023'));
await assert.rejects(()=>mutate({...create,actionId:uuid(),listingId:uuid()},null),code('22023'));
assert.equal((await q('select count(*)::int n from dir_listings where seller_profile_id=$1',[bob]))[0].n,0);

// owner checks, publish, transitions
await assert.rejects(()=>mutate(act('status',L1,1,{status:'published'}),bob),code('P0002'),'other seller');
await assert.rejects(()=>mutate(act('status',L1,0,{status:'published'})),code('40001'));
await assert.rejects(()=>mutate(act('status',L1,1,{status:'sold'})),hint('22023','dir_listing_transition'));
await assert.rejects(()=>mutate(act('status',L1,1,{status:'suspended'})),hint('22023','dir_listing_transition'));
await assert.rejects(()=>mutate(act('status',L1,1,{status:'published'})),hint('22023','dir_listing_photos_missing'),'publish needs 4 photos');
const l1Photos=await addPhotos(L1,alice,3);
await assert.rejects(()=>mutate(act('status',L1,1,{status:'published'})),hint('22023','dir_listing_photos_missing'),'3 photos are not enough');
l1Photos.push(...await addPhotos(L1,alice,1));assert.equal(await revOf(L1),1,'photos do not bump the revision');
let r=await mutate(act('status',L1,1,{status:'published'}));assert.equal(r.status,'published');assert.equal(r.revision,2);
const exp=new Date(r.expiresAt)-new Date(r.publishedAt);assert.ok(Math.abs(exp-60*864e5)<5000,'expires 60 days after publish');
let page=await pub(c1.code);
assert.equal(page.vertical,'vehiculos');assert.equal(page.make_slug,'toyota');assert.equal(page.model_slug,'hilux');assert.equal(page.vehicle_type,'pickup');assert.equal(page.accepts_trade_in,true);
const leak=JSON.stringify(page);
for(const s of ['BKZ','JTFSS',alice,L1,'plate','vin','seller_profile','revision','sha256','uploaded','agent'])assert.equal(leak.toLowerCase().includes(s.toLowerCase()),false,'public leak: '+s);
assert.equal(page.status,'published');assert.equal(page.photo_count,4);assert.equal(page.cover_path_800,l1Photos[0].path800);
assert.deepEqual(page.photos.map(p=>p.path1600),l1Photos.map(p=>p.path1600),'photos in upload order');assert.equal(page.financing,null,'private seller: no financing');
assert.equal(Pub.mapPublicPhotos(page.photos,p=>'https://cdn.test/'+p)[0].url320,'https://cdn.test/'+l1Photos[0].path320);
assert.notEqual(Number(page.approx_lat),9.918);assert.equal(page.location_radius_m,500);
// incomplete listing cannot be published; published listing must stay complete
const L2=uuid();await mutate({action:'create',actionId:uuid(),listingId:L2,revision:0,listing:{...vListing,title:'Nissan Versa 2018',description:null,adminArea2:null},vehicle:{makeId:vehicle.makeId,modelId:Number(hilux.model),year:2018,condition:'used'}});
await assert.rejects(()=>mutate(act('status',L2,1,{status:'published'})),hint('22023','dir_listing_incomplete'));
await assert.rejects(()=>mutate(act('update',L1,2,{listing:{description:null}})),hint('22023','dir_listing_incomplete'));
r=await mutate(act('update',L1,2,{listing:{priceMinor:1790000000},vehicle:{mileageKm:86000,platePrivate:null}}));assert.equal(r.revision,3);
assert.equal(String((await q('select price_crc_norm from dir_listings where id=$1',[L1]))[0].price_crc_norm),'1790000000');
assert.equal((await q('select plate_private from dir_listing_vehicle where listing_id=$1',[L1]))[0].plate_private,null);
await assert.rejects(()=>mutate(act('update',L1,3,{listing:{vertical:'inmuebles'}})),code('22023'));
await assert.rejects(()=>mutate(act('update',L1,3,{property:{bedrooms:2}})),code('22023'));
await assert.rejects(()=>mutate(act('update',L1,3,{})),code('22023'));
r=await mutate(act('status',L1,3,{status:'reserved'}));
{const res=await pub(c1.code);assert.equal(res.status,'reserved','reserved stays public with its status');assert.equal(Pub.mapPublicListing(res).status,'reserved');
 assert.equal((await q("select count(*)::int n from public_vehicle_listings where code=$1 and status='reserved'",[c1.code]))[0].n,1);}
r=await mutate(act('status',L1,4,{status:'published'}));assert.equal(new Date(r.expiresAt).getTime(),new Date(exp+new Date(r.publishedAt).getTime()).getTime(),'reserved→published keeps expires_at');
await assert.rejects(()=>mutate(act('status',L1,5,{status:'rented'})),hint('22023','dir_listing_transition'),'vehicles are sold, not rented');

// private limit: 2 active per vertical (L1 published + L2 draft)
const L3=uuid(),c3={action:'create',actionId:uuid(),listingId:L3,revision:0,listing:{...vListing,title:'Tercer carro'},vehicle};
await assert.rejects(()=>mutate(c3),hint('54000','dir_listing_limit_private'));
r=await mutate(act('status',L2,1,{status:'archived'}));
await mutate(c3);
await assert.rejects(()=>mutate(act('status',L2,2,{status:'draft'})),hint('54000','dir_listing_limit_private'),'archived→draft re-enters the limit');
await db.exec("reset role;update dir_listing_limits set value=3 where key='private_active_per_vertical';set role service_role");
r=await mutate(act('status',L2,2,{status:'draft'}));assert.equal(r.status,'draft');
await db.exec("reset role;update dir_listing_limits set value=2 where key='private_active_per_vertical';set role service_role");

// sold → archived; sold listing locked
const L3rev=await revOf(L3);await addPhotos(L3);
r=await mutate(act('status',L3,L3rev,{status:'published'}));r=await mutate(act('status',L3,r.revision,{status:'sold'}));assert.equal(r.status,'sold');
await assert.rejects(()=>mutate(act('update',L3,r.revision,{listing:{title:'Cambio tarde'}})),hint('22023','dir_listing_locked'));
await assert.rejects(()=>mutate(act('status',L3,r.revision,{status:'published'})),hint('22023','dir_listing_transition'));
r=await mutate(act('status',L3,r.revision,{status:'archived'}));assert.equal(r.status,'archived');

// business seller: unverified ≤5 published; verified unlimited; place must be a public-ish dealer place
const place=(await q('select dir_place_mutate($1,$2) r',[staff,{action:'create',actionId:uuid(),placeId:uuid(),revision:0,place:{slug:'autos-prueba',vertical:'vehicle_dealer',name:'Autos Prueba'}}]))[0].r;
await q('select dir_place_mutate($1,$2)',[staff,{action:'status',actionId:uuid(),placeId:place.placeId,revision:1,status:'published'}]);
await claimPlace('autos-prueba',biz);
const restaurant=(await q('select dir_place_mutate($1,$2) r',[staff,{action:'create',actionId:uuid(),placeId:uuid(),revision:0,place:{slug:'soda-x',vertical:'restaurant',name:'Soda X'}}]))[0].r;
await assert.rejects(()=>mutate({action:'create',actionId:uuid(),listingId:uuid(),revision:0,listing:{...vListing,sellerKind:'business',placeId:restaurant.placeId},vehicle},biz),code('22023'));
const bizIds=[];
await assert.rejects(()=>mutate({action:'create',actionId:uuid(),listingId:uuid(),revision:0,listing:{...vListing,sellerKind:'business',placeId:place.placeId},vehicle},bob),hint('42501','dir_listing_place_not_managed'),'only managers link a place');
const bizPhotos={};
for(let i=0;i<7;i++){const id=uuid();bizIds.push(id);await mutate({action:'create',actionId:uuid(),listingId:id,revision:0,listing:{...vListing,sellerKind:'business',placeId:place.placeId,title:'Carro de agencia '+i,currency:'USD',priceMinor:2500000},vehicle},biz);bizPhotos[id]=await addPhotos(id,biz);}
assert.equal(String((await q('select price_crc_norm from dir_listings where id=$1',[bizIds[0]]))[0].price_crc_norm),String(Math.round(2500000*505.5)),'USD cents × CRC/USD = CRC céntimos');
for(let i=0;i<5;i++)await mutate(act('status',bizIds[i],1,{status:'published'}),biz);
await assert.rejects(()=>mutate(act('status',bizIds[5],1,{status:'published'}),biz),hint('54000','dir_listing_limit_business_unverified'));
const sv={action:'seller',actionId:uuid(),profileId:biz,businessVerified:true,note:'Personería revisada'};
assert.deepEqual(await moderate(sv),{action:'seller',profileId:biz,businessVerified:true});assert.deepEqual(await moderate(sv),{action:'seller',profileId:biz,businessVerified:true});
await mutate(act('status',bizIds[5],1,{status:'published'}),biz);
const bizCode=(await q('select public_code from dir_listings where id=$1',[bizIds[0]]))[0].public_code;
page=await pub(bizCode);assert.equal(page.place_slug,'autos-prueba');assert.equal(page.seller_business_verified,true);assert.equal(page.currency,'USD');
assert.equal((await q('select count(*)::int n from public_vehicle_listings where place_slug=$1',['autos-prueba']))[0].n,6);
// FX refresh re-normalises live USD listings without touching revision
await q('select dir_fx_rate_set($1,$2)',[staff,{date:'2026-11-10',usdCrc:510,source:'manual'}]);
const revBefore=(await q('select revision from dir_listings where id=$1',[bizIds[0]]))[0].revision;
assert.equal((await q('select dir_listing_fx_refresh($1) n',[staff]))[0].n,7);
const fxRow=(await q('select price_crc_norm,revision,fx_rate_date from dir_listings where id=$1',[bizIds[0]]))[0];
assert.equal(String(fxRow.price_crc_norm),String(2500000*510));assert.equal(fxRow.revision,revBefore);
// USD without any rate on file cannot be published
await db.exec("reset role;alter table dir_fx_rates disable trigger dir_fx_rates_no_truncate;delete from dir_fx_rates;alter table dir_fx_rates enable trigger dir_fx_rates_no_truncate;set role service_role");
await assert.rejects(()=>mutate(act('status',bizIds[6],1,{status:'published'}),biz),hint('22023','dir_listing_fx_missing'));
await q('select dir_fx_rate_set($1,$2)',[staff,{date:'2026-11-10',usdCrc:510,source:'manual'}]);

// moderation: review hides; suspend/reinstate by staff only
let rv=(await q('select revision from dir_listings where id=$1',[bizIds[1]]))[0].revision;
const bc1=(await q('select public_code from dir_listings where id=$1',[bizIds[1]]))[0].public_code;
r=await moderate({action:'moderation',actionId:uuid(),listingId:bizIds[1],revision:rv,moderationStatus:'review'});assert.equal(await pub(bc1),null,'under review is hidden');
r=await moderate({action:'moderation',actionId:uuid(),listingId:bizIds[1],revision:r.revision,moderationStatus:'approved'});assert.notEqual(await pub(bc1),null);
await assert.rejects(()=>moderate({action:'suspend',actionId:uuid(),listingId:bizIds[1],revision:r.revision-1}),code('40001'));
r=await moderate({action:'suspend',actionId:uuid(),listingId:bizIds[1],revision:r.revision,note:'Denuncia de estafa'});assert.equal(r.status,'suspended');assert.equal(await pub(bc1),null);
await assert.rejects(()=>mutate(act('update',bizIds[1],r.revision,{listing:{title:'Intento de editar'}}),biz),hint('22023','dir_listing_locked'));
await assert.rejects(()=>mutate(act('status',bizIds[1],r.revision,{status:'published'}),biz),hint('22023','dir_listing_transition'));
await assert.rejects(()=>moderate({action:'suspend',actionId:uuid(),listingId:bizIds[1],revision:r.revision}),hint('22023','dir_listing_transition'));
r=await moderate({action:'reinstate',actionId:uuid(),listingId:bizIds[1],revision:r.revision});assert.equal(r.status,'draft');
await assert.rejects(()=>moderate({action:'moderation',actionId:uuid(),listingId:bizIds[1],revision:r.revision,moderationStatus:'featured'}),code('22023'));

// expiry: readers hide past expires_at immediately; expire_due marks; renew (+60 d, published_at unchanged)
const pubAt=(await q('select published_at from dir_listings where id=$1',[L1]))[0].published_at;
await db.exec(`reset role;update dir_listings set expires_at=now()-interval '1 minute' where id='${L1}';set role service_role`);
assert.equal(await pub(c1.code),null,'expired by date is hidden even before marking');
assert.equal((await q('select dir_listing_expire_due($1,50) n',[staff]))[0].n,1);
assert.equal((await q('select dir_listing_expire_due($1,50) n',[staff]))[0].n,0);
let l1=(await q('select status,revision from dir_listings where id=$1',[L1]))[0];assert.equal(l1.status,'expired');
await assert.rejects(()=>mutate(act('status',L1,l1.revision,{status:'published'})),hint('22023','dir_listing_transition'),'expired → renew only');
r=await mutate(act('renew',L1,l1.revision));assert.equal(r.status,'published');assert.equal(new Date(r.publishedAt).getTime(),pubAt.getTime(),'renew never bumps published_at');
assert.ok(new Date(r.expiresAt)-Date.now()>59*864e5);assert.notEqual(await pub(c1.code),null);
const l2rev=(await q('select revision from dir_listings where id=$1',[L2]))[0].revision;
await assert.rejects(()=>mutate(act('renew',L2,l2rev)),hint('22023','dir_listing_transition'),'drafts are not renewed');

// real estate: rent, rented, private registry fields, fuzz 300–500 m deterministic
const P1=uuid(),prop={operation:'rent',propertyType:'apartment',bedrooms:2,bathrooms:1.5,parkingSpaces:1,builtM2:85,minLeaseMonths:12,amenities:['pool','security'],inCondominium:true,hoaFeeMinor:6000000,
 cadastralPlanPrivate:'sj-1234567-2015',folioRealPrivate:'1-123456-f-000'};
const pListing={vertical:'inmuebles',sellerKind:'private',title:'Apartamento en Sabana Norte',description:'Dos habitaciones, piscina, seguridad 24 horas y parqueo techado.',priceMinor:65000000,currency:'CRC',adminArea1:'San José',adminArea2:'San José',adminArea3:'Mata Redonda',lat:9.9381,lng:-84.1012};
await assert.rejects(()=>mutate({action:'create',actionId:uuid(),listingId:uuid(),revision:0,listing:pListing,property:{...prop,operation:'sale'}},bob),code('22023'),'lease only for rent');
await assert.rejects(()=>mutate({action:'create',actionId:uuid(),listingId:uuid(),revision:0,listing:pListing,property:{...prop,amenities:['helipad']}},bob));
const p1=await mutate({action:'create',actionId:uuid(),listingId:P1,revision:0,listing:pListing,property:prop},bob);await addPhotos(P1,bob);
r=await mutate(act('status',P1,1,{status:'published'}),bob);
page=await pub(p1.code);assert.equal(page.vertical,'inmuebles');assert.equal(page.operation,'rent');assert.deepEqual(page.amenities,['pool','security']);
for(const s of ['SJ-1234567','1-123456-F','cadastral','folio',bob,P1])assert.equal(JSON.stringify(page).toLowerCase().includes(s.toLowerCase()),false,'public leak: '+s);
const hav=(a,b,c,d)=>{const R=6371008.8,t=x=>x*Math.PI/180,dl=t(c-a),dg=t(d-b),h=Math.sin(dl/2)**2+Math.cos(t(a))*Math.cos(t(c))*Math.sin(dg/2)**2;return 2*R*Math.asin(Math.sqrt(h));};
const dist=hav(pListing.lat,pListing.lng,Number(page.approx_lat),Number(page.approx_lng));assert.ok(dist>=300&&dist<=500,'fuzz distance '+dist);
assert.deepEqual([(await pub(p1.code)).approx_lat,(await pub(p1.code)).approx_lng],[page.approx_lat,page.approx_lng],'deterministic');
const spread=await q("select dir_listing_fuzz(gen_random_uuid(),9.9381,-84.1012) f from generate_series(1,200)");
for(const {f} of spread){const m=/\(([-0-9.]+),([-0-9.]+)\)/.exec(f);const dd=hav(9.9381,-84.1012,Number(m[1]),Number(m[2]));assert.ok(dd>=300&&dd<=500,'fuzz '+dd);}
await assert.rejects(()=>mutate(act('update',P1,2,{property:{operation:'sale'}}),bob),code('22023'));
await assert.rejects(()=>mutate(act('status',P1,2,{status:'sold'}),bob),hint('22023','dir_listing_transition'),'rentals are rented, not sold');
r=await mutate(act('status',P1,2,{status:'rented'}),bob);assert.equal(await pub(p1.code),null);
r=await mutate(act('status',P1,r.revision,{status:'published'}),bob);assert.equal(r.status,'published','rental back on the market');
assert.equal((await q('select count(*)::int n from public_property_listings'))[0].n,1);
// private limit is per vertical: bob has 1 property; vehicles separate
await mutate({action:'create',actionId:uuid(),listingId:uuid(),revision:0,listing:{...vListing,title:'Carro de Bob'},vehicle},bob);

// ---------------------------------------------------------------- V3 photos
const carl='00000000-0000-4000-8000-00000000c0c0',dan='00000000-0000-4000-8000-00000000d0d0',eve='00000000-0000-4000-8000-00000000e0e0';
{// idempotency, owner isolation, validation
 const p=photo(),input={action:'add',actionId:uuid(),listingId:L2,media:p};
 const a1=await call('dir_listing_media_mutate',alice,input);assert.equal(a1.photoCount,1);assert.deepEqual(await call('dir_listing_media_mutate',alice,input),a1,'same actionId → same answer');
 await assert.rejects(()=>call('dir_listing_media_mutate',alice,{...input,media:photo()}),code('22023'),'actionId reused with other input');
 await assert.rejects(()=>media({action:'add',listingId:L2,media:photo()},bob),code('P0002'),'other seller');
 await assert.rejects(()=>media({action:'add',listingId:L2,media:{...photo(),sha256:p.sha256}}),hint('23505','dir_listing_media_duplicate'));
 await assert.rejects(()=>media({action:'add',listingId:L2,media:{...photo(),exifStripped:false}}),hint('22023','dir_listing_media_exif'));
 const q2=photo();for(const bad of [{...q2,path800:`dir-listings/${L2}/800.webp`},{...q2,width:300,height:300},{...q2,width:2000},{...q2,sha256:'abc'},{...q2,id:'nope'},{...q2,width:'800'},{...q2,gps:'9.9,-84'}])
  await assert.rejects(()=>media({action:'add',listingId:L2,media:bad}),code('22023'),JSON.stringify(bad).slice(0,90));
 await assert.rejects(()=>media({action:'add',listingId:L2,media:{...photo(),id:p.id}}),code('23505'),'media id reused');
 assert.equal((await q("select count(*)::int n from dir_listing_media where listing_id=$1",[L2]))[0].n,1);
 // remove / reorder / compaction
 const extra=await addPhotos(L2,alice,3);const ids=[p.id,...extra.map(x=>x.id)];
 let m=await media({action:'reorder',listingId:L2,order:[...ids].reverse()});assert.deepEqual(m.photos.map(x=>x.id),[...ids].reverse());
 await assert.rejects(()=>media({action:'reorder',listingId:L2,order:ids.slice(1)}),code('22023'),'order must list every photo');
 await assert.rejects(()=>media({action:'reorder',listingId:L2,order:[...ids.slice(1),uuid()]}),code('22023'));
 m=await media({action:'remove',listingId:L2,mediaId:ids[2]});assert.equal(m.photoCount,3);assert.deepEqual(m.photos.map(x=>x.sort),[0,1,2],'sort compacted');
 await assert.rejects(()=>media({action:'remove',listingId:L2,mediaId:ids[2]}),code('P0002'),'already removed');
 assert.equal((await q("select status,sort from dir_listing_media where id=$1",[ids[2]]))[0].status,'removed');
 // a public listing never drops below 4
 await assert.rejects(()=>media({action:'remove',listingId:L1,mediaId:l1Photos[0].id}),hint('22023','dir_listing_photos_missing'));
 const l1extra=await addPhotos(L1,alice,1);m=await media({action:'remove',listingId:L1,mediaId:l1Photos[0].id});assert.equal(m.photoCount,4);
 assert.equal((await pub(c1.code)).cover_path_800,l1Photos[1].path800,'cover follows the new first photo');
 assert.equal((await pub(c1.code)).photos.at(-1).path1600,l1extra[0].path1600);
 // cap 30
 for(let i=m.photoCount;i<30;i++)await media({action:'add',listingId:L1,media:photo()});
 await assert.rejects(()=>media({action:'add',listingId:L1,media:photo()}),hint('54000','dir_listing_media_cap'));
 assert.equal((await pub(c1.code)).photo_count,30);
 // locked statuses (sold) refuse photos
 await db.exec(`reset role;update dir_listings set status='sold' where id='${bizIds[6]}';set role service_role`);
 await assert.rejects(()=>media({action:'add',listingId:bizIds[6],media:photo()},biz),hint('22023','dir_listing_locked'));
 await db.exec(`reset role;update dir_listings set status='draft' where id='${bizIds[6]}';set role service_role`);}

// duplicate photo across sellers → review (+revision, history 'flag'); same seller reusing a photo → no flag
{const E1=uuid();await mutate({action:'create',actionId:uuid(),listingId:E1,revision:0,listing:{...vListing,title:'Hilux copiada'},vehicle},eve);
 await addPhotos(E1,eve,3);assert.equal(await revOf(E1),1);
 const m=await media({action:'add',listingId:E1,media:photo(uuid(),l1Photos[1].sha256)},eve);
 assert.equal(m.moderationStatus,'review');assert.equal(m.revision,2,'flag bumps the revision');
 const f=(await q("select kind,key,detail from dir_listing_flags where listing_id=$1",[E1]))[0];assert.deepEqual([f.kind,f.key,f.detail.otherCode],['duplicate_photo',l1Photos[1].sha256,c1.code]);
 assert.equal((await q("select action from dir_listing_history where listing_id=$1 order by id desc limit 1",[E1]))[0].action,'flag');
 assert.equal((await q("select moderation_status from dir_listings where id=$1",[L1]))[0].moderation_status,'clear','the original listing is not flagged');
 await assert.rejects(()=>mutate(act('status',E1,2,{status:'published'}),eve),hint('22023','dir_listing_moderation'),'cannot publish under review');
 // the same seller reusing its own photo on another listing is not flagged
 assert.equal((await media({action:'add',listingId:bizIds[6],media:photo(uuid(),bizPhotos[bizIds[0]][0].sha256)},biz)).moderationStatus,'clear','same seller reuse is fine');
 // staff approves → no re-flag for the same signal; the photos limit still holds
 let rv=await revOf(E1);await moderate({action:'moderation',actionId:uuid(),listingId:E1,revision:rv,moderationStatus:'approved'});
 const r2=await mutate(act('status',E1,rv+1,{status:'published'}),eve);assert.equal(r2.moderationStatus,'approved');assert.notEqual(await pub(r2.code),null);}

// price outlier: < 50 % of the median of ≥5 other sellers' listings for the same model+year → review
{const samples=(await q(`select count(*)::int n from dir_listings l join dir_listing_vehicle v on v.listing_id=l.id where v.model_id=$1 and v.year=2020 and l.seller_profile_id<>$2
  and l.status in('published','reserved','sold') and l.moderation_status in('clear','approved')`,[hilux.model,carl]))[0].n;assert.ok(samples>=5,'samples '+samples);
 const C1=uuid();await mutate({action:'create',actionId:uuid(),listingId:C1,revision:0,listing:{...vListing,title:'Hilux regalada',priceMinor:500000000},vehicle},carl);await addPhotos(C1,carl);
 r=await mutate(act('status',C1,1,{status:'published'}),carl);assert.equal(r.status,'published');assert.equal(r.moderationStatus,'review','outlier goes to review');
 assert.equal(await pub(r.code),null,'hidden while under review');
 const f=(await q("select kind,detail from dir_listing_flags where listing_id=$1",[C1]))[0];assert.equal(f.kind,'price_outlier');assert.ok(f.detail.samples>=5&&f.detail.medianCrcNorm>1000000000);
 const ri=(await q("select dir_listing_review_queue(50) j"))[0].j.find(x=>x.listingId===C1);assert.equal(ri.flags[0].kind,'price_outlier');
 r=await moderate({action:'moderation',actionId:uuid(),listingId:C1,revision:r.revision,moderationStatus:'approved'});
 r=await mutate(act('renew',C1,r.revision),carl);assert.equal(r.moderationStatus,'approved','same price is not re-flagged after approval');
 // a normal price is fine; dropping it to an outlier while public re-flags (update path)
 const D1=uuid();await mutate({action:'create',actionId:uuid(),listingId:D1,revision:0,listing:{...vListing,title:'Hilux precio normal',priceMinor:1000000000},vehicle},dan);await addPhotos(D1,dan);
 r=await mutate(act('status',D1,1,{status:'published'}),dan);assert.equal(r.moderationStatus,'clear');
 r=await mutate(act('update',D1,r.revision,{listing:{priceMinor:400000000}}),dan);assert.equal(r.moderationStatus,'review');
 // too few samples (other model) → never flagged
 const V1=uuid();await mutate({action:'create',actionId:uuid(),listingId:V1,revision:0,listing:{...vListing,title:'Versa barato',priceMinor:100000000},vehicle:{...vehicle,modelId:Number(versa.model),makeId:Number((await q('select make_id from ref_vehicle_models where id=$1',[versa.model]))[0].make_id)}},dan);
 await addPhotos(V1,dan);assert.equal((await mutate(act('status',V1,1,{status:'published'}),dan)).moderationStatus,'clear');}

// public reports reuse dir_reports; 3 distinct identified abuse reporters → review
{const code3=(await q('select public_code from dir_listings where id=$1',[bizIds[2]]))[0].public_code;
 const report=(input,actor=null,c=code3)=>q('select dir_listing_report_create($1,$2,$3) r',[actor,c,input]).then(x=>x[0].r);
 const r1={reportId:uuid(),kind:'abuse',message:'Me pidieron depósito por adelantado.',email:'uno@example.com'};
 assert.deepEqual(await report(r1),{ok:true});assert.deepEqual(await report(r1),{ok:true},'idempotent');
 await assert.rejects(()=>report({...r1,message:'Otro texto distinto aquí'}),code('22023'),'reportId reused');
 await assert.rejects(()=>report({reportId:uuid(),kind:'removal_request',message:'Bórrenlo ya por favor'}),code('22023'),'place-only kind');
 await assert.rejects(()=>report({reportId:uuid(),kind:'abuse',message:'Estafa evidente aquí'},null,'zzzzzz'),code('P0002'));
 await report({reportId:uuid(),kind:'abuse',message:'Pide transferencia antes de verlo.'},carl);
 await report({reportId:uuid(),kind:'abuse',message:'Anónimo sin correo.'});
 assert.notEqual(await pub(code3),null,'two identified reporters + anonymous do not hide it');
 await report({reportId:uuid(),kind:'wrong_info',message:'El kilometraje no coincide.',email:'tres@example.com'});
 assert.notEqual(await pub(code3),null,'other kinds do not count');
 await report({reportId:uuid(),kind:'abuse',message:'Número de WhatsApp extranjero.',email:'TRES@example.com'});
 assert.equal(await pub(code3),null,'third distinct reporter → review');
 assert.equal((await q("select kind from dir_listing_flags where listing_id=$1",[bizIds[2]]))[0].kind,'reports');
 const rows=await q("select place_id,listing_id,kind from dir_reports where listing_id=$1 order by created_at",[bizIds[2]]);assert.equal(rows.length,5);assert.ok(rows.every(x=>x.place_id===null));
 await assert.rejects(()=>report({reportId:uuid(),kind:'other',message:'Ya está oculto este anuncio'}),code('P0002'),'listings under review cannot be reported');
 for(let i=0;i<3;i++)await report({reportId:uuid(),kind:'other',message:'Reporte número '+i,email:'tres@example.com'},null,c1.code);
 await assert.rejects(()=>report({reportId:uuid(),kind:'other',message:'Uno más del mismo correo',email:'tres@example.com'},null,c1.code),hint('54000','dir_listing_report_cap'));
 const rid=(await q("select id from dir_reports where listing_id=$1 and kind='wrong_info'",[bizIds[2]]))[0].id;
 assert.equal((await call('dir_report_resolve',staff,{actionId:uuid(),reportId:rid,decision:'reject',note:'Dato correcto'})).status,'rejected','core resolver handles listing reports');
 await db.exec('reset role');await assert.rejects(()=>db.exec(`insert into dir_reports(id,place_id,listing_id,kind,message,input_hash) values('${uuid()}','${place.placeId}','${bizIds[2]}','other','ambos destinos','${'0'.repeat(64)}')`),code('23514'),'one target only');
 await db.exec('set role service_role');}

// declared financing per dealer place (shown only with declaredBySeller)
{const fin=(input,actor=biz)=>call('dir_listing_financing_set',actor,{actionId:uuid(),...input});
 const terms={annualRatePct:12.5,maxTermMonths:72,minDownPaymentPct:20};
 await assert.rejects(()=>fin({placeId:place.placeId,revision:0,financing:terms},bob),code('P0002'),'not a manager');
 await assert.rejects(()=>fin({placeId:restaurant.placeId,revision:0,financing:terms},staff),code('P0002'),'not a dealer place');
 for(const bad of [{...terms,annualRatePct:61},{...terms,annualRatePct:12.345},{...terms,maxTermMonths:121},{...terms,maxTermMonths:12.5},{...terms,minDownPaymentPct:95},{...terms,annualRatePct:-1}])
  await assert.rejects(()=>fin({placeId:place.placeId,revision:0,financing:bad}),hint('22023','dir_listing_financing_range'),JSON.stringify(bad));
 await assert.rejects(()=>fin({placeId:place.placeId,revision:0,financing:{...terms,balloon:true}}),code('22023'));
 const f1=await fin({placeId:place.placeId,revision:0,financing:terms});assert.deepEqual([f1.revision,f1.status,f1.declaredBySeller,Number(f1.annualRatePct)],[1,'active',true,12.5]);
 await assert.rejects(()=>fin({placeId:place.placeId,revision:0,financing:terms}),code('40001'));
 const code0=(await q('select public_code from dir_listings where id=$1',[bizIds[0]]))[0].public_code;
 assert.equal((await pub(code0)).financing,null,'listing did not opt in (seller_financing=false)');
 const rv=await revOf(bizIds[0]);await mutate(act('update',bizIds[0],rv,{vehicle:{sellerFinancing:true}}),biz);
 const pf=(await pub(code0)).financing;assert.equal(pf.declaredBySeller,true);assert.match(pf.labelEs,/Declarada por el vendedor/);
 const mf=Pub.mapDeclaredFinancing(pf);assert.deepEqual([mf.annualRatePct,mf.maxTermMonths,mf.minDownPaymentPct,mf.declaredBySeller],[12.5,72,20,true]);
 await db.exec(`reset role;update dir_listing_financing set declared_at=now()-interval '181 days' where place_id='${place.placeId}';set role service_role`);
 assert.equal((await pub(code0)).financing,null,'stale declaration hidden');
 const f2=await fin({placeId:place.placeId,revision:1,financing:{...terms,annualRatePct:11}});assert.equal(f2.revision,2);assert.equal(Number((await pub(code0)).financing.annualRatePct),11,'re-declared');
 assert.equal((await fin({placeId:place.placeId,revision:2,financing:null})).status,'withdrawn');assert.equal((await pub(code0)).financing,null,'withdrawn');
 await assert.rejects(()=>fin({placeId:place.placeId,revision:3,financing:null}),code('22023'),'nothing to withdraw');
 await fin({placeId:place.placeId,revision:3,financing:terms});}

// R2: agent assignment (owner/manager of the place; agent = admin/manager/member of the place owner's Pro team)
const inmo='00000000-0000-4000-8000-0000000001a0',mgr='00000000-0000-4000-8000-0000000001a1',agentA='00000000-0000-4000-8000-0000000001a2',
 agentB='00000000-0000-4000-8000-0000000001a3',agentC='00000000-0000-4000-8000-0000000001a4',outsider='00000000-0000-4000-8000-0000000001a5';
const inmoPlace=(await q('select dir_place_mutate($1,$2) r',[staff,{action:'create',actionId:uuid(),placeId:uuid(),revision:0,place:{slug:'inmo-prueba',vertical:'real_estate',name:'Inmobiliaria Prueba'}}]))[0].r;
await q('select dir_place_mutate($1,$2)',[staff,{action:'status',actionId:uuid(),placeId:inmoPlace.placeId,revision:1,status:'published'}]);
await claimPlace('inmo-prueba',inmo);
await call('dir_place_manager_mutate',inmo,{actionId:uuid(),placeId:inmoPlace.placeId,action:'add',userId:mgr});
await db.exec(`reset role;insert into profiles(id) values('${inmo}'),('${agentA}'),('${agentB}'),('${agentC}'),('${outsider}');
 insert into pro_company_members(owner_id,member_user_id,member_name,role,active) values('${inmo}','${agentA}','Ana Agente','member',true),('${inmo}','${agentB}','Beto Lector','read_only',true),('${inmo}','${agentC}','Caro Ex','manager',false);
 set role service_role`);
const PA=uuid();
await mutate({action:'create',actionId:uuid(),listingId:PA,revision:0,listing:{...pListing,sellerKind:'business',placeId:inmoPlace.placeId,title:'Casa en Escazú'},property:{operation:'sale',propertyType:'house',bedrooms:3,folioRealPrivate:'1-555555-000'}},inmo);
{const assign=(rev,agentId,actor=mgr,listingId=PA)=>call('dir_listing_assign_agent',actor,{action:'assign_agent',actionId:uuid(),listingId,revision:rev,agentId});
 await assert.rejects(()=>assign(1,agentA,bob),code('P0002'),'not a manager of the place');
 await assert.rejects(()=>assign(1,agentA,agentA),code('P0002'),'team members cannot assign themselves');
 const input={action:'assign_agent',actionId:uuid(),listingId:PA,revision:1,agentId:agentA};
 let a=await call('dir_listing_assign_agent',mgr,input);assert.deepEqual([a.revision,a.agentId],[2,agentA]);assert.deepEqual(await call('dir_listing_assign_agent',mgr,input),a,'idempotent');
 await assert.rejects(()=>assign(1,agentA),code('40001'));
 await assert.rejects(()=>assign(2,agentA),code('22023'),'nothing to change');
 for(const who of [agentB,agentC,outsider,bob])await assert.rejects(()=>assign(2,who),hint('22023','dir_listing_agent_not_member'),who);
 a=await assign(2,inmo,inmo);assert.equal(a.agentId,inmo,'the owner is admin of their own team');
 a=await assign(3,null,inmo);assert.equal(a.agentId,null);
 const rv3=await revOf(bizIds[3]),rvP1=await revOf(P1);
 await assert.rejects(()=>assign(rv3,agentA,biz,bizIds[3]),hint('22023','dir_listing_agent_vertical'));
 await assert.rejects(()=>assign(rvP1,agentA,bob,P1),code('P0002'),'private property: no place');
 await assert.rejects(()=>call('dir_listing_assign_agent',mgr,{action:'assign_agent',actionId:uuid(),listingId:PA,revision:4,agentId:'not-a-uuid'}),code('22023'));
 // without the team module: assigning answers 55000, unassigning still works
 await db.exec('reset role;alter function pro_role_of(uuid,uuid) rename to pro_role_of_off;set role service_role');
 await assert.rejects(()=>assign(4,agentA),hint('55000','dir_listing_team_unavailable'));
 await db.exec('reset role;alter function pro_role_of_off(uuid,uuid) rename to pro_role_of;set role service_role');
 a=await assign(4,agentA);assert.equal(a.agentId,agentA);
 assert.equal((await q("select action from dir_listing_history where listing_id=$1 order by id desc limit 1",[PA]))[0].action,'assign_agent');
 assert.equal(JSON.stringify(await q('select * from public_property_listings')).includes(agentA),false,'agent not public');
 // unlinking the place drops the agent
 const P2=uuid();await mutate({action:'create',actionId:uuid(),listingId:P2,revision:0,listing:{...pListing,sellerKind:'business',placeId:inmoPlace.placeId,title:'Lote en Atenas'},property:{operation:'sale',propertyType:'lot'}},inmo);
 await assign(1,agentA,inmo,P2);await mutate(act('update',P2,2,{listing:{placeId:null}}),inmo);
 assert.equal((await q('select agent_profile_id from dir_listings where id=$1',[P2]))[0].agent_profile_id,null);
 await assert.rejects(()=>mutate(act('update',P2,3,{listing:{placeId:place.placeId}}),inmo),code('22023'),'dealer place is not a real-estate place');
 await assert.rejects(()=>mutate(act('update',P2,3,{listing:{placeId:inmoPlace.placeId}}),bob),code('P0002'));}

// Pro owner reader
{const list=(actor,vertical,filter='active',cursor=null,limit=50)=>q('select dir_listing_owner_list($1,$2,$3,$4,$5) j',[actor,vertical,filter,cursor,limit]).then(x=>x[0].j);
 let pg=await list(alice,'vehiculos');Inv.inventoryPageSchema.parse(pg);
 assert.deepEqual([pg.sellerKind,pg.counts.active,pg.limits.minPhotosToPublish,pg.limits.maxPhotos,pg.agents.length,pg.places.length],['private',2,4,30,0,0]);
 assert.ok(pg.catalog.makes.length>10&&pg.catalog.models.some(m=>m.id===Number(hilux.model)));
 const l1=pg.items.find(i=>i.id===L1);assert.equal(l1.vehicle.vinPrivate,'JTFSS22P0B0123456','seller sees private fields');assert.equal(Number(l1.lat),9.918);assert.equal(l1.mine,true);assert.equal(l1.photoCount,30);
 assert.ok(pg.items.every(i=>['draft','published','reserved'].includes(i.status)));assert.equal(pg.nextCursor,null);
 const closed=await list(alice,'vehiculos','closed');assert.deepEqual(closed.items.map(i=>[i.id,i.status]),[[L3,'archived']]);
 assert.equal((await list(bob,'vehiculos')).items.some(i=>i.id===L1),false,'owner isolation');
 assert.equal((await list(alice,'inmuebles')).catalog,null);
 // business: places, financing, pagination with a keyset cursor
 const all=(await list(biz,'vehiculos','active',null,100)).items.map(i=>i.id);assert.ok(all.length>=5);
 let seen=[],cur=null,pages=0;
 do{const pgx=await list(biz,'vehiculos','active',cur,2);Inv.inventoryPageSchema.parse(pgx);assert.ok(pgx.items.length<=2);seen.push(...pgx.items.map(i=>i.id));cur=pgx.nextCursor;pages++;}while(cur&&pages<20);
 assert.deepEqual(seen,all,'cursor pages = full list, same order, no duplicates');assert.equal(new Set(seen).size,seen.length);
 pg=await list(biz,'vehiculos');assert.deepEqual([pg.sellerKind,pg.businessVerified,pg.places[0].slug,pg.places[0].role,pg.financing[0].status,pg.financing[0].stale],['business',true,'autos-prueba','owner','active',false]);
 // expired by date is reported as expired (closed), not active
 await db.exec(`reset role;update dir_listings set expires_at=now()-interval '1 minute' where id='${bizIds[4]}';set role service_role`);
 assert.equal((await list(biz,'vehiculos')).items.some(i=>i.id===bizIds[4]),false);
 assert.equal((await list(biz,'vehiculos','closed')).items.find(i=>i.id===bizIds[4]).status,'expired');
 // co-manager sees the place's listings read-only, without private fields; agents = active non-read-only team members
 pg=await list(mgr,'inmuebles');Inv.inventoryPageSchema.parse(pg);
 const pa=pg.items.find(i=>i.id===PA);assert.deepEqual([pa.mine,pa.canEdit,pa.property.folioRealPrivate,pa.lat,pa.agentId],[false,false,null,null,agentA]);
 assert.deepEqual(pg.agents.map(a=>[a.id,a.name]),[[agentA,'Ana Agente']]);assert.equal(pg.places[0].role,'manager');
 assert.equal((await list(inmo,'inmuebles')).items.find(i=>i.id===PA).property.folioRealPrivate,'1-555555-000','seller sees the folio');
 await assert.rejects(()=>list(alice,'vehiculos','todo'),code('22023'));await assert.rejects(()=>list(alice,'barcos'),code('22023'));
 await assert.rejects(()=>list(alice,'vehiculos','active','123'),hint('22023','dir_listing_cursor'));await assert.rejects(()=>list(alice,'vehiculos','active',null,500),code('22023'));}

// SQL transition table == TypeScript mirror
const ST=Z.LISTING_STATUSES;let pairs=0;
for(const by of ['owner','staff','system'])for(const [vert,op] of [['vehiculos',null],['inmuebles','sale'],['inmuebles','rent']])for(const a of ST)for(const b of ST){
 const s=(await q('select dir_listing_transition_ok($1,$2,$3,$4,$5) ok',[a,b,vert,op,by]))[0].ok;
 assert.equal(s,Z.canTransition(a,b,vert,op,by),`${by} ${vert}/${op} ${a}→${b}`);pairs++;}

// public views expose no private or internal columns
for(const v of ['public_vehicle_listings','public_property_listings']){
 const cols=(await q(`select column_name c from information_schema.columns where table_name=$1`,[v])).map(r=>r.c);
 for(const bad of cols)assert.equal(/private|plate|vin|folio|cadastr|seller_profile|^id$|revision|^lat$|^lng$|featured|sponsor|^(is_)?paid|tier|boost/.test(bad),false,v+'.'+bad);}

// history and receipts complete and immutable
const hist=await q('select action,revision,before is null as first from dir_listing_history where listing_id=$1 order by id',[L1]);
assert.equal(hist[0].first,true);assert.deepEqual(hist.map(h=>h.revision),Array.from({length:hist.length},(_,i)=>i+1));assert.ok(hist.some(h=>h.action==='expire')&&hist.some(h=>h.action==='renew'));
await db.exec('reset role');
for(const t of ['dir_listing_history','dir_listing_actions','dir_listing_flags']){
 await assert.rejects(()=>db.exec(`update ${t} set ${t==='dir_listing_flags'?'key=key':'action_id=action_id'}`),code('23514'));
 await assert.rejects(()=>db.exec(`delete from ${t}`),code('23514'));
 await assert.rejects(()=>db.exec(`truncate ${t}`),code('23514'));}
for(const t of ['dir_listings','dir_listing_vehicle','dir_listing_property','dir_listing_sellers','dir_fx_rates','dir_listing_limits','dir_listing_media','dir_listing_financing'])await assert.rejects(()=>db.exec(`truncate ${t} cascade`),code('23514'),t);
await db.exec('set role service_role');
for(const t of ['dir_listing_history','dir_listing_actions','dir_listings','dir_listing_vehicle','dir_listing_property','dir_listing_sellers','dir_fx_rates','dir_listing_media','dir_listing_flags','dir_listing_financing'])await assert.rejects(()=>db.exec(`delete from ${t}`),code('42501'),t+' delete');

// RLS / grants
for(const role of ['anon','authenticated']){
 await db.exec(`reset role;set role ${role}`);
 for(const t of ['dir_listings','dir_listing_vehicle','dir_listing_property','dir_listing_history','dir_fx_rates','public_vehicle_listings','public_property_listings','dir_listing_media','dir_listing_flags','dir_listing_financing'])await assert.rejects(()=>db.exec(`select * from ${t}`),code('42501'),role+' '+t);
 await assert.rejects(()=>q('select dir_listing_public($1)',[c1.code]),code('42501'));
 await assert.rejects(()=>q("select dir_listing_owner_list($1,'vehiculos')",[alice]),code('42501'));
 await assert.rejects(()=>q('select dir_listing_report_create(null,$1,$2)',[c1.code,{reportId:uuid(),kind:'other',message:'hola hola'}]),code('42501'));
 await assert.rejects(()=>media({action:'add',listingId:L1,media:photo()}),code('42501'));
 await assert.rejects(()=>call('dir_listing_assign_agent',mgr,{action:'assign_agent',actionId:uuid(),listingId:PA,revision:5,agentId:null}),code('42501'));
 await assert.rejects(()=>call('dir_listing_financing_set',biz,{actionId:uuid(),placeId:place.placeId,revision:4,financing:null}),code('42501'));
 await assert.rejects(()=>mutate(act('renew',L1,1),alice),code('42501'));
 await assert.rejects(()=>moderate({action:'seller',actionId:uuid(),profileId:alice,businessVerified:true}),code('42501'));
}
await db.exec('reset role');
assert.equal((await q("select count(*)::int n from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname like 'dir\\_listing\\_%' or p.proname like 'dir\\_fx\\_%') and (p.prosecdef or not exists(select 1 from unnest(coalesce(p.proconfig,'{}')) c where c like 'search_path=%'))"))[0].n,0,'security invoker + pinned search_path');
assert.equal((await q("select count(*)::int n from pg_class where (relname like 'dir\\_listing%' or relname='dir_fx_rates') and relkind='r' and not relrowsecurity"))[0].n,0,'RLS on every table');
assert.equal((await q("select count(*)::int n from pg_class where relname in('dir_listing_media','dir_listing_flags','dir_listing_financing') and relrowsecurity"))[0].n,3);
assert.equal((await q("select count(*)::int n from pg_class where relname in('public_vehicle_listings','public_property_listings') and 'security_invoker=true'=any(reloptions)"))[0].n,2,'views are security_invoker');

// reinstall keeps data
const before=await q('select id,revision,status,moderation_status,agent_profile_id,public_code from dir_listings order by id'),mBefore=await q('select count(*)::int n from dir_listing_media');
await db.exec(sql);assert.deepEqual(await q('select id,revision,status,moderation_status,agent_profile_id,public_code from dir_listings order by id'),before);assert.deepEqual(await q('select count(*)::int n from dir_listing_media'),mBefore);
await db.close();
console.log(`PASS directory listings: zod mirrors (create/update/status/renew/moderation/fx), module applied 3× on core+catalog (idempotent), create/update/status/renew with CAS 40001 + idempotent actionId + owner isolation, ${badCreates.length+3} invalid creates, make/model FK + model-belongs-to-make, publish completeness, private limit 2/vertical, unverified business limit 5 (verified unlimited), USD→CRC normalisation + refresh + missing-rate block, moderation/suspend/reinstate, expiry by date + expire_due + renew without bump, rent/rented/sold rules, ${pairs} transition pairs SQL = TS, public readers without private/internal columns, fuzz 300–500 m deterministic (201 samples), immutable history/receipts/flags, TRUNCATE/DELETE blocked, RLS/grants anon/authenticated/service_role, security invoker + pinned search_path; UI gaps: public readers published+reserved with status/photos/cover, V3 photos (min 4 to publish and to stay public, cap 30, exif_stripped, sha256 once per listing, reorder/remove compaction, idempotent, no revision bump), duplicate photo across sellers → review (same seller ok), price outlier <50 % of median (≥5 samples, other sellers) → review on publish/update, no re-flag after approval, listing reports via dir_reports (caps, 3 distinct abuse reporters → review, core resolver), declared financing per dealer place (ranges, CAS, opt-in, 180-day staleness, withdraw, declaredBySeller), place_id only for managers, R2 agent assignment (manager/owner only, team member admin/manager/member, read-only/inactive/outsider refused, 55000 without team module, CAS, idempotent, cleared on unlink), owner reader (active/closed, expired by date, keyset cursor, private fields only for the seller, co-manager read-only, agents, catalog, financing), every SQL hint mapped in LISTING_ERROR_HINTS.`);

// LOCAL PRO ONLY (multivertical F6): in-memory PGlite verification of directory-search-local.sql.
// Applies directory-core + import + vehicles-catalog + listings + search (search twice), seeds places and listings
// directly, then checks visibility rules (draft/hidden/removed/suspended/expired/unlicensed pharmacies excluded,
// reserved listings shown with status), private fields, accent-insensitive text (tsvector + LIKE fallback),
// filters per vertical, open now in America/Costa_Rica, bounding box + radius, every sort against ranking.ts
// (rankDirectory parity), keyset pagination, ranking_reason codes, disjunctive facets, errors and grants.
// SQL directory: process.env.DIR_SQL_DIR (default docs/pro/sql). Never touches a shared database.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {registerHooks} from 'node:module';
const libRoot=new URL('../../src/lib/',import.meta.url).href;
registerHooks({resolve(specifier,context,next){return next(context.parentURL?.startsWith(libRoot)&&specifier.startsWith('.')&&!/\.[a-z]+$/i.test(specifier)?specifier+'.ts':specifier,context);}});
const R=await import('../../src/lib/directory/ranking.ts');
const S=await import('../../src/lib/directory/search-schemas.ts');
let checks=0;const ok=(v,m)=>{assert.ok(v,m);checks++;};const eq=(a,b,m)=>{assert.deepEqual(a,b,m);checks++;};

// ---------------------------------------------------------------- zod / text preparation
{const P=s=>S.parseSearchParams(new URLSearchParams(s));
 let r=P('q=farmacia en escazú');eq([r.ok,r.vertical,r.q],[true,'farmacias','escazu'],'vertical detected, generic word and connector removed');
 r=P('q=pizza&vertical=restaurantes');eq([r.vertical,r.q],['restaurantes','pizza'],'cuisine words are kept');
 r=P('q=carros usados&type=pickup,suv&yearMin=2015&priceMax=20000000');eq([r.vertical,r.q,r.filters.type,r.filters.yearMin],['vehiculos','usados',['pickup','suv'],2015]);
 // 2026-11-17: price filters/sorts wherever prices apply; never fuel stations (national ARESEP price).
 eq(P('vertical=gasolineras&sort=price_asc').reason,'sort','fuel stations have no price sort');
 eq(P('vertical=agencias&sort=price_desc').reason,'sort');eq(P('vertical=lugares&sort=price_asc').reason,'sort');
 eq(P('vertical=gasolineras&priceMin=1').ok,false,'no price filter at fuel stations');
 r=P('vertical=restaurantes&sort=price_asc&priceMin=3000&priceMax=8000');eq([r.ok,r.sort,r.filters.priceMin,r.filters.priceMax],[true,'price_asc',3000,8000],'restaurants: menu price');
 eq(P('vertical=restaurantes&priceMin=9000&priceMax=1000').ok,false,'min > max');eq(P('vertical=restaurantes&priceMin=-1').ok,false);
 eq(P('vertical=restaurantes&product=arroz').ok,false,'product only for pharmacies/supermarkets');
 eq(P('vertical=farmacias&sort=price_asc').reason,'product','pharmacy price sort needs a product');
 eq(P('vertical=supermercados&priceMax=2000').reason,'product');
 r=P('vertical=supermercados&product=arroz 1 kg&priceMax=2000&sort=price_asc');eq([r.ok,r.filters.product,r.filters.priceMax],[true,'arroz 1 kg',2000]);
 eq(P('vertical=farmacias&product=a').ok,false,'product: 2..80 characters');
 eq(P('vertical=restaurantes&sort=distance').reason,'location');
 eq(P('vertical=restaurantes&lat=9.9').reason,'location');
 eq(P('vertical=restaurantes&featured=1').ok,false,'unknown filter rejected');
 eq(P('vertical=vehiculos&yearMin=2020&yearMax=2010').ok,false);
 eq(P('vertical=vehiculos&type=barco').ok,false);
 eq(P('q=hola').reason,'vertical','no vertical, none detected');
 eq(P('vertical=restaurantes&q=a&q=b').ok,false,'repeated param');
 const c={sort:'relevance',s:[-3,0,-4.25],k:'p:soda-tapia'};eq(S.decodeCursor(S.encodeCursor(c)),c);
 eq(S.decodeCursor('eyJzb3J0IjoieCJ9'),null);eq(P('vertical=restaurantes&sort=newest&cursor='+S.encodeCursor(c)).reason,'cursor','cursor of another sort');
 eq(S.SORT_TO_RANKING.best_rated,'rating');}

// ---------------------------------------------------------------- database
const dir=process.env.DIR_SQL_DIR||'docs/pro/sql';
const {PGlite}=await import(process.env.PRO_PGLITE_MODULE||'@electric-sql/pglite'),db=new PGlite();
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;`);
for(const f of ['directory-core-local.sql','directory-import-local.sql','vehicles-catalog-local.sql','directory-listings-local.sql','directory-search-local.sql','directory-search-local.sql'])
 await db.exec(await readFile(join(dir,f),'utf8'));
const q=async(text,params=[])=>(await db.query(text,params)).rows;
const code=c=>e=>{assert.equal(e.code,c,e.message);checks++;return true;};

// Seed (superuser, direct inserts with controlled dates and ratings).
let n=0;const pid=()=>`00000000-0000-4000-8000-${String(++n).padStart(12,'0')}`;
const SJ={a1:'San José',a2:'San José',a3:'Carmen',lat:9.933,lng:-84.08},ESC={a1:'San José',a2:'Escazú',a3:'San Rafael',lat:9.918,lng:-84.14},HER={a1:'Heredia',a2:'Heredia',a3:'Mercedes',lat:9.998,lng:-84.117};
const place=async(slug,vertical,name,loc,o={})=>{const id=pid();
 await q(`insert into dir_places(id,slug,vertical_id,name,admin_area_1,admin_area_2,admin_area_3,locality,address_line,lat,lng,location_precision,phone,website,attributes,status,verification_level,rating_avg,rating_count,created_at)
  values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,coalesce($20::timestamptz,clock_timestamp()))`,
  [id,slug,vertical,name,loc.a1,loc.a2,loc.a3,o.locality??null,o.address??null,o.lat??loc.lat,o.lng??loc.lng,o.precision??'exact',o.phone??null,o.website??null,o.attributes??{},o.status??'published',o.level??'imported',o.avg??null,o.count??0,o.createdAt??null]);
 return id;};
const hours=async(id,rows)=>{for(const [i,[d,a,b]] of rows.entries())await q('insert into dir_place_hours(place_id,weekday,seq,opens,closes) values($1,$2,$3,$4,$5)',[id,d,Math.floor(i/7)%4,a,b]);};
const crNow=(await q(`select extract(dow from now() at time zone 'America/Costa_Rica')::int d,extract(hour from now() at time zone 'America/Costa_Rica')::int h`))[0];
const tapia=await place('soda-tapia','restaurant','Soda Tapia',SJ,{avg:4.5,count:10,phone:'+506 2222 2222',address:'Calle 1',website:'https://example.com',createdAt:'2026-01-01T10:00:00Z'});
await hours(tapia,[0,1,2,3,4,5,6].map(d=>[d,'00:00','23:59']));
const ana=await place('soda-dona-ana','restaurant','Soda Doña Ana',ESC,{avg:4.8,count:3,createdAt:'2026-02-01T10:00:00Z'});
// A slot that is certainly closed now: 1 hour long, starting 6 hours from the current Costa Rica hour.
await hours(ana,[[crNow.d,`${String((crNow.h+6)%24).padStart(2,'0')}:00`,`${String((crNow.h+7)%24).padStart(2,'0')}:00`]]);
await place('pizzeria-sol','restaurant','Pizzería Sol',ESC,{avg:5,count:1,createdAt:'2026-03-01T10:00:00Z'});
await place('cafe-nandu','restaurant','Café Ñandú',HER,{createdAt:'2026-04-01T10:00:00Z',attributes:{cuisines:['típica','café']}});
await place('restaurante-borrador','restaurant','Restaurante Borrador',SJ,{status:'draft'});
await place('restaurante-oculto','restaurant','Restaurante Oculto',SJ,{status:'hidden'});
await place('restaurante-retirado','restaurant','Restaurante Retirado',SJ,{status:'removed'});
await place('restaurante-cerrado','restaurant','Restaurante Cerrado',SJ,{status:'closed_permanently'});
await place('farmacia-licenciada','pharmacy','Farmacia Licenciada',SJ,{level:'license_verified',attributes:{licenseNumber:'ABC-123',onDuty:true}});
await place('farmacia-sin-permiso','pharmacy','Farmacia Sin Permiso',SJ,{level:'verified'});
await place('bomba-24','fuel','Bomba 24 Horas',SJ,{attributes:{open24h:true,brand:'Uno'}});
const noche=await place('bomba-noche','fuel','Bomba Noche',ESC,{attributes:{brand:'Delta'}});
await hours(noche,[[5,'18:00','02:00']]); // Friday 18:00 → Saturday 02:00
await place('agencia-autos','vehicle_dealer','Agencia Autos Escazú',ESC,{level:'verified'});
for(let i=1;i<=25;i++)await place(`super-${String(i).padStart(2,'0')}`,'grocery',`Super Barrio ${i}`,i%2?SJ:HER,{avg:i%5?3+(i%5)/2:null,count:i%5?i:0,createdAt:`2026-05-${String(i).padStart(2,'0')}T10:00:00Z`});

const seller='00000000-0000-4000-8000-0000000000e1',dealer='00000000-0000-4000-8000-0000000000e2';
await q(`insert into dir_listing_sellers(profile_id) values($1)`,[seller]);
await q(`insert into dir_listing_sellers(profile_id,business_verified,verified_by,verified_at) values($1,true,$1,now())`,[dealer]);
const model=async(make,m)=>(await q(`select o.id model,o.make_id make from ref_vehicle_models o join ref_vehicle_makes k on k.id=o.make_id where k.slug=$1 and o.slug=$2`,[make,m]))[0];
const listing=async(vertical,title,loc,o={})=>{const id=pid(),c=(await q('select dir_listing_code($1) c',[id]))[0].c;
 const usd=o.currency==='USD';
 await q(`insert into dir_listings(id,public_code,vertical,seller_kind,seller_profile_id,status,moderation_status,title,description,price_minor,currency,price_crc_norm,fx_rate_date,fx_usd_crc,
   admin_area_1,admin_area_2,admin_area_3,lat,lng,published_at,expires_at,created_at,updated_at)
  values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20::timestamptz,$21::timestamptz,$20::timestamptz,coalesce($22::timestamptz,$20::timestamptz))`,
  [id,c,vertical,o.dealer?'business':'private',o.dealer?dealer:seller,o.status??'published',o.moderation??'clear',title,'Descripción suficientemente larga del anuncio.',o.price,o.currency??'CRC',
   usd?o.price*500:o.price,usd?'2026-11-01':null,usd?500:null,loc.a1,loc.a2,loc.a3,loc.lat,loc.lng,o.published??'2026-11-10T10:00:00Z',o.expires??'2099-01-01T00:00:00Z',o.updated??null]);
 if(vertical==='vehiculos'){const m=await model(o.make,o.model);
  await q(`insert into dir_listing_vehicle(listing_id,make_id,model_id,vehicle_type,version,year,condition,mileage_km,transmission,fuel,drivetrain,plate_private,vin_private)
   select $1,$2,$3,o.vehicle_type,$4,$5,$6,$7,$8,$9,$10,'BKZ123','JTFSS22P0B0123456' from ref_vehicle_models o where o.id=$3`,[id,m.make,m.model,o.version??null,o.year,o.condition??'used',o.km??null,o.transmission??null,o.fuel??null,o.drivetrain??null]);}
 else await q(`insert into dir_listing_property(listing_id,operation,property_type,bedrooms,bathrooms,built_m2,lot_m2,amenities,cadastral_plan_private,folio_real_private) values($1,$2,$3,$4,$5,$6,$7,$8,'SJ-123456-2020','1-123456-000')`,
  [id,o.operation,o.type,o.bedrooms??null,o.bathrooms??null,o.built??null,o.lot??null,o.amenities??[]]);
 return c;};
const hilux=await listing('vehiculos','Toyota Hilux SR 2020',ESC,{make:'toyota',model:'hilux',year:2020,km:85000,transmission:'manual',fuel:'diesel',drivetrain:'4x4',version:'SR',price:1850000000,published:'2026-11-12T10:00:00Z'});
const versa=await listing('vehiculos','Nissan Versa automático',SJ,{make:'nissan',model:'versa',year:2018,km:60000,transmission:'automatic',fuel:'gasoline',price:750000000,status:'reserved',published:'2026-11-11T10:00:00Z'});
const rav=await listing('vehiculos','Toyota RAV4 híbrida',HER,{make:'toyota',model:'rav4',year:2023,km:12000,transmission:'automatic',fuel:'hybrid',price:3000000,currency:'USD',dealer:true,published:'2026-11-13T10:00:00Z'});
const draftCar=await listing('vehiculos','Toyota Corolla borrador',SJ,{make:'toyota',model:'corolla',year:2015,price:500000000,status:'draft',published:null,expires:null});
const susp=await listing('vehiculos','Toyota Yaris suspendido',SJ,{make:'toyota',model:'yaris',year:2016,price:500000000,status:'suspended'});
const expd=await listing('vehiculos','Toyota Hiace vencida',SJ,{make:'toyota',model:'hiace',year:2014,price:500000000,expires:'2026-01-01T00:00:00Z'});
const modr=await listing('vehiculos','Toyota Prado en revisión',SJ,{make:'toyota',model:'land-cruiser',year:2019,price:500000000,moderation:'review'});
const house=await listing('inmuebles','Casa en Escazú con jardín',ESC,{operation:'sale',type:'house',bedrooms:3,bathrooms:2,built:180,lot:300,amenities:['garden'],price:25000000000});
const apt=await listing('inmuebles','Apartamento amueblado en Heredia',HER,{operation:'rent',type:'apartment',bedrooms:1,bathrooms:1,built:55,price:35000000});
const lot=await listing('inmuebles','Lote en San José centro',SJ,{operation:'sale',type:'lot',lot:400,price:9000000000});
const soldHouse=await listing('inmuebles','Casa vendida',SJ,{operation:'sale',type:'house',bedrooms:2,price:9000000000,status:'sold'});
await db.exec('set role service_role');

const search=async(v,o={})=>(await q('select dir_search($1,$2,$3,$4,$5,$6,$7,$8,$9) r',[v,o.q??null,o.filters??{},o.lat??null,o.lng??null,o.radius??null,o.sort??'relevance',o.cursor??null,o.limit??20]))[0].r;
const facets=async(v,o={})=>(await q('select dir_facets($1,$2,$3,$4,$5,$6) r',[v,o.q??null,o.filters??{},o.lat??null,o.lng??null,o.radius??null]))[0].r;
const all=async(v,o={})=>{const out=[];let cursor=null,pages=0;do{const r=await search(v,{...o,cursor});out.push(...r.items);cursor=r.nextCursor;pages++;assert.ok(pages<20);}while(cursor);return out;};
const keys=items=>items.map(i=>i.key);
// Parity with ranking.ts: the SQL order must equal rankDirectory over the same items.
const parity=async(v,o={})=>{const items=await all(v,o);
 const query={text:o.q??null,adminArea1:o.filters?.province??null,adminArea2:o.filters?.canton??null,adminArea3:o.filters?.district??null,sort:S.SORT_TO_RANKING[o.sort??'relevance'],now:new Date()};
 const ts=R.rankDirectory(items.map(S.toRankingItem),query);
 eq(keys(items),ts.map(t=>t.item.id),`parity ${v} ${JSON.stringify(o)}`);
 for(const [i,t] of ts.entries())eq([...items[i].ranking_reason].sort(),[...t.ranking_reason].sort(),`reasons ${items[i].key}`);
 return items;};

// visibility
let r=await all('restaurantes');
eq(keys(r).sort(),['p:cafe-nandu','p:pizzeria-sol','p:soda-dona-ana','p:soda-tapia'],'draft/hidden/removed/closed excluded');
// Owner decision 2026-11-17: every pharmacy is shown (requires_license=false); the per-vertical gate still works.
eq(keys(await all('farmacias')).sort(),['p:farmacia-licenciada','p:farmacia-sin-permiso'],'every pharmacy shown');
eq((await all('farmacias')).find(i=>i.slug==='farmacia-sin-permiso').verificationLevel,'verified','card carries the level (permit badge)');
await db.exec("reset role;update dir_verticals set requires_license=true where id='pharmacy';set role service_role");
eq(keys(await all('farmacias')),['p:farmacia-licenciada'],'gate kept: unlicensed pharmacy excluded when the vertical requires it');
eq((await facets('farmacias')).total,1,'facets follow the gate');
await db.exec("reset role;update dir_verticals set requires_license=false where id='pharmacy';set role service_role");
eq((await facets('farmacias')).total,2);
eq((await all('farmacias'))[0].attributes.licenseNumber,undefined,'licence number not in cards');
eq(keys(await all('agencias')),['p:agencia-autos']);
eq((await all('lugares')).length,4+2+2+1+25);
r=await all('vehiculos');
eq(keys(r).sort(),['l:'+hilux,'l:'+rav,'l:'+versa].sort(),'draft/suspended/expired/moderated excluded');
eq(r.find(i=>i.code===versa).status,'reserved','reserved shown with status');
eq(keys(await all('inmuebles')).sort(),['l:'+apt,'l:'+house,'l:'+lot].sort(),'sold excluded');
for(const c of [draftCar,susp,expd,modr,soldHouse])ok(!JSON.stringify(r).includes(c));
const text=JSON.stringify(await all('vehiculos'))+JSON.stringify(await all('inmuebles'))+JSON.stringify(await all('lugares'));
for(const secret of ['BKZ123','JTFSS22P0B0123456','SJ-123456-2020','1-123456-000',seller,dealer,'00000000-0000-4000-8000-','revision','seller_profile_id','plate','vin','cadastral','folio'])
 ok(!text.includes(secret),'private field leaked: '+secret);
const hx=(await all('vehiculos')).find(i=>i.code===hilux);
ok(Math.abs(hx.approxLocation.lat-ESC.lat)+Math.abs(hx.approxLocation.lng-ESC.lng)>0.002,'listing location is fuzzed');
eq(hx.vehicle.makeSlug,'toyota');eq((await all('vehiculos')).find(i=>i.code===rav).sellerBusinessVerified,true);
eq((await all('vehiculos')).find(i=>i.code===rav).price,{minor:3000000,currency:'USD',crcNorm:1500000000,fxRateDate:'2026-11-01'});

// text: accents, tsvector across fields, LIKE fallback
eq(keys(await search('restaurantes',{q:'nandu'}).then(x=>x.items)),['p:cafe-nandu'],'accent-insensitive');
eq(keys(await search('restaurantes',{q:'CAFÉ ÑANDÚ'}).then(x=>x.items)),['p:cafe-nandu']);
eq((await search('restaurantes',{q:'cafe nandu'})).items[0].ranking_reason.includes('text_exact'),true);
eq(keys(await search('restaurantes',{q:'soda escazu'}).then(x=>x.items)),['p:soda-dona-ana'],'tsvector name + canton');
eq(keys(await search('restaurantes',{q:'scazu'}).then(x=>x.items)).sort(),['p:pizzeria-sol','p:soda-dona-ana'],'LIKE fallback (mid-word)');
eq(keys(await search('restaurantes',{q:'tipica'}).then(x=>x.items)),['p:cafe-nandu'],'cuisine keyword');
eq(keys(await search('vehiculos',{q:'toyota'}).then(x=>x.items)).sort(),['l:'+hilux,'l:'+rav].sort());
eq(keys(await search('vehiculos',{q:'hibrida'}).then(x=>x.items)),['l:'+rav]);
eq((await search('restaurantes',{q:'%_%'})).items.length,4,'only punctuation = no text filter (wildcards never reach LIKE)');
eq((await search('restaurantes',{q:"'; drop table dir_places; --"})).items.length,0);
await parity('restaurantes',{q:'soda'});
await parity('restaurantes',{q:'so'});

// filters
const vk=async f=>keys((await search('vehiculos',{filters:f})).items).sort();
eq(await vk({type:'pickup'}),['l:'+hilux]);eq(await vk({make:['toyota']}),['l:'+hilux,'l:'+rav].sort());eq(await vk({make:'toyota',model:'rav4'}),['l:'+rav]);
eq(await vk({yearMin:2019,yearMax:2021}),['l:'+hilux]);eq(await vk({priceMax:8000000}),['l:'+versa],'price in colones');
eq(await vk({priceMin:15000000}),['l:'+hilux,'l:'+rav].sort(),'USD normalised');eq(await vk({kmMax:20000}),['l:'+rav]);
eq(await vk({fuel:['diesel','hybrid']}),['l:'+hilux,'l:'+rav].sort());eq(await vk({transmission:'automatic'}),['l:'+rav,'l:'+versa].sort());
eq(await vk({province:'san jose'}),['l:'+hilux,'l:'+versa].sort(),'province accent-insensitive');eq(await vk({condition:'new'}),[]);
const pk=async f=>keys((await search('inmuebles',{filters:f})).items).sort();
eq(await pk({operation:'rent'}),['l:'+apt]);eq(await pk({type:['house','lot']}),['l:'+house,'l:'+lot].sort());eq(await pk({bedroomsMin:2}),['l:'+house]);
eq(await pk({m2Min:300}),['l:'+lot],'m2 uses built area first');eq(await pk({m2Min:100,m2Max:200}),['l:'+house]);eq(await pk({canton:'Escazu'}),['l:'+house]);
eq(await pk({priceMax:500000}),['l:'+apt]);
const rk=async(v,f)=>keys((await search(v,{filters:f})).items).sort();
eq(await rk('restaurantes',{canton:'escazú'}),['p:pizzeria-sol','p:soda-dona-ana']);
eq(await rk('restaurantes',{province:'Heredia'}),['p:cafe-nandu']);
eq(await rk('lugares',{vertical:['fuel','pharmacy']}),['p:bomba-24','p:bomba-noche','p:farmacia-licenciada','p:farmacia-sin-permiso']);
eq(await rk('restaurantes',{openNow:true}),['p:soda-tapia'],'open now (always-open hours); closed slot and no hours excluded');
eq(await rk('gasolineras',{open24h:true}),['p:bomba-24']);
eq(await rk('gasolineras',{openNow:true}),['p:bomba-24']);
ok((await search('restaurantes',{q:'tapia'})).items[0].open24h===true,'00:00–23:59 on 7 days = 24 h');
eq((await search('restaurantes',{q:'ana'})).items[0].openNow,false);eq((await search('restaurantes',{q:'nandu'})).items[0].openNow,null,'no hours = unknown');
const openAt=async t=>(await q('select dir_search_open_at($1,$2) o',[noche,t]))[0].o;
eq(await openAt('2026-11-21T01:00:00Z'),true,'Friday 19:00 CR');eq(await openAt('2026-11-21T07:30:00Z'),true,'Saturday 01:30 CR (crosses midnight)');
eq(await openAt('2026-11-21T08:30:00Z'),false,'Saturday 02:30 CR');eq(await openAt('2026-11-20T23:00:00Z'),false,'Friday 17:00 CR');
eq(await openAt('2026-11-22T07:30:00Z'),false,'Sunday 01:30 CR');

// geography
let g=await search('restaurantes',{lat:SJ.lat,lng:SJ.lng,radius:3});
eq(keys(g.items),['p:soda-tapia'],'radius 3 km');
g=await search('lugares',{lat:SJ.lat,lng:SJ.lng,radius:5,limit:50});ok(g.items.every(i=>i.distanceKm<=5));
ok(g.items.length>0&&!g.items.some(i=>i.address.adminArea2==='Escazú'),'Escazú (6.6 km) outside');
await parity('restaurantes',{lat:SJ.lat,lng:SJ.lng,sort:'distance'});
const d=await parity('vehiculos',{lat:SJ.lat,lng:SJ.lng,sort:'distance'});eq(d[0].code,versa);ok(d.every(i=>i.ranking_reason.includes('distance')));
const vr=await search('vehiculos',{lat:ESC.lat,lng:ESC.lng,radius:1});eq(keys(vr.items),['l:'+hilux],'listing radius uses the fuzzed point');ok(vr.items[0].distanceKm>=0.3&&vr.items[0].distanceKm<=0.5);

// sorts: parity with ranking.ts on every sort
for(const sort of ['relevance','best_rated','newest'])for(const v of ['restaurantes','lugares','vehiculos','inmuebles'])await parity(v,{sort});
for(const sort of ['price_asc','price_desc'])for(const v of ['vehiculos','inmuebles','restaurantes'])await parity(v,{sort});
// Without the price module (stubs) no place has a price: price sorts keep every place, last-with-reason price_missing,
// and a price range keeps none (a place without a price is only dropped when a range is set).
ok((await all('restaurantes',{sort:'price_asc'})).every(i=>i.ranking_reason.includes('price_missing')&&i.price==null));
eq((await all('restaurantes',{filters:{priceMax:100000}})).length,0);eq((await all('supermercados',{filters:{product:'arroz'}})).length,25,'a product alone never drops stores');
eq((await search('supermercados',{filters:{product:'arroz'},sort:'price_asc'})).priceProduct,null,'stub: no catalogue');
await parity('lugares',{sort:'distance',lat:HER.lat,lng:HER.lng});
await parity('restaurantes',{q:'soda',filters:{canton:'Escazú',province:'San José'}});
await parity('supermercados',{filters:{province:'Heredia'}});
eq(keys(await all('restaurantes',{sort:'best_rated'})).slice(0,3),['p:soda-dona-ana','p:soda-tapia','p:pizzeria-sol'],'credible rating: 4.8×3 (4.40) > 4.5×10 (4.38) > 5×1 (4.25)');
eq((await search('vehiculos',{sort:'price_asc'})).items.map(i=>i.code),[versa,rav,hilux]);
eq((await search('vehiculos',{sort:'newest'})).items.map(i=>i.code),[rav,hilux,versa]);
r=(await search('restaurantes',{sort:'best_rated'})).items[0];ok(r.ranking_reason.includes('sort_rating')&&r.ranking_reason.includes('rating_credible'));

// pagination
const p1=await search('supermercados',{sort:'best_rated'});eq(p1.items.length,20);ok(p1.nextCursor);
const p2=await search('supermercados',{sort:'best_rated',cursor:p1.nextCursor});eq(p2.items.length,5);eq(p2.nextCursor,null);
eq([...keys(p1.items),...keys(p2.items)],keys((await search('supermercados',{sort:'best_rated',limit:50})).items),'pages = one big page');
eq(new Set([...keys(p1.items),...keys(p2.items)]).size,25);
for(const sort of ['relevance','newest']){const a=await all('supermercados',{sort,limit:7});eq(keys(a),keys((await search('supermercados',{sort,limit:50})).items),'pages '+sort);}
ok(!JSON.stringify(p1.nextCursor).includes('0000-4000'),'cursor carries no internal id');
await assert.rejects(()=>search('supermercados',{sort:'newest',cursor:p1.nextCursor}),code('22023'));
await assert.rejects(()=>search('supermercados',{sort:'best_rated',cursor:{sort:'best_rated',s:'x',k:'p:a'}}),code('22023'));

// errors
for(const [v,o] of [['barcos',{}],[null,{}],['restaurantes',{filters:{featured:true}}],['restaurantes',{filters:{make:'toyota'}}],['vehiculos',{filters:{yearMin:'2020'}}],
 ['vehiculos',{filters:{type:{a:1}}}],['gasolineras',{sort:'price_asc'}],['farmacias',{sort:'price_desc'}],['lugares',{sort:'price_asc'}],
 ['gasolineras',{filters:{priceMin:1}}],['farmacias',{filters:{priceMax:1}}],['restaurantes',{filters:{priceMin:5,priceMax:1}}],['restaurantes',{filters:{priceMin:'5'}}],
 ['restaurantes',{filters:{product:'arroz'}}],['farmacias',{filters:{product:'a'}}],['agencias',{filters:{priceMin:1}}],['restaurantes',{sort:'distance'}],['restaurantes',{sort:'sponsored'}],['restaurantes',{limit:0}],
 ['restaurantes',{limit:51}],['restaurantes',{lat:9.9}],['restaurantes',{radius:5}],['restaurantes',{lat:9.9,lng:-84,radius:500}],['restaurantes',{q:'x'.repeat(101)}],
 ['lugares',{filters:{vertical:'casino'}}],['restaurantes',{filters:{vertical:'fuel'}}],['restaurantes',{filters:{openNow:'yes'}}]])
 await assert.rejects(()=>search(v,o),code('22023'));

// facets (disjunctive)
let fv=await facets('vehiculos',{filters:{make:'toyota'}});
eq(fv.total,2);eq(fv.facets.make.map(x=>[x.value,x.count]),[['toyota',2],['nissan',1]],'own filter ignored');
eq(fv.facets.type.map(x=>x.value).sort(),['pickup','suv']);eq(fv.facets.year,{min:2020,max:2023});
eq(fv.facets.price,{min:15000000,max:18500000});
fv=await facets('restaurantes');eq(fv.total,4);eq(fv.facets.openNow,1);eq(fv.facets.canton.map(x=>[x.value,x.count]),[['Escazú',2],['Heredia',1],['San José',1]]);
fv=await facets('restaurantes',{filters:{canton:'Heredia'}});eq(fv.total,1);eq(fv.facets.canton.length,3,'canton facet ignores canton filter');
fv=await facets('inmuebles',{filters:{operation:'sale'}});eq(fv.facets.operation.map(x=>[x.value,x.count]),[['sale',2],['rent',1]]);eq(fv.total,2);
eq(fv.facets.bedrooms.map(x=>x.value),[3]);
fv=await facets('lugares',{filters:{vertical:'fuel'}});eq(fv.total,2);eq(fv.facets.vertical.map(x=>x.value).sort(),['fuel','grocery','pharmacy','restaurant','vehicle_dealer'],'vertical facet ignores own filter');eq(fv.facets.open24h,1);
await assert.rejects(()=>facets('barcos'),code('22023'));
await assert.rejects(()=>facets('gasolineras',{filters:{priceMin:1}}),code('22023'));await assert.rejects(()=>facets('farmacias',{filters:{priceMin:1}}),code('22023'));
fv=await facets('restaurantes');eq([fv.facets.price,fv.facets.withPrice],[{min:null,max:null},0],'price facet on priced sections');
ok(!('price' in (await facets('gasolineras')).facets),'no price facet at fuel stations');

// 2026-11-17 sections: one section per vertical, `kind` filter + facet, price modes (cafes menu, pulperias/ferreterias/
// veterinarias product, none for bancos/salud/hospedaje/tours/talleres/belleza/gimnasios), zod parity.
{const cafe=await place('cafe-ensayo','cafe_bar','Café Ensayo',SJ,{attributes:{kind:'cafe'}});
 await place('panaderia-ensayo','cafe_bar','Panadería Ensayo',ESC,{attributes:{kind:'bakery'}});
 await place('banco-ensayo','banking','Banco Ensayo',SJ,{attributes:{kind:'bank',atm:true}});
 await place('cajero-ensayo','banking','Cajero automático Ensayo',HER,{attributes:{kind:'atm'}});
 await place('clinica-ensayo','health','Clínica Ensayo',HER,{attributes:{kind:'clinic',publicService:true}});
 await place('clinica-borrador','health','Clínica Borrador',HER,{attributes:{kind:'clinic'},status:'draft'});
 let r=await search('cafes');eq(r.items.map(i=>i.slug).sort(),['cafe-ensayo','panaderia-ensayo'],'cafes = cafe_bar only');ok(cafe);
 eq(r.items.find(i=>i.slug==='cafe-ensayo').attributes.kind,'cafe','kind on the card');
 r=await search('cafes',{filters:{kind:['bakery']}});eq(r.items.map(i=>i.slug),['panaderia-ensayo'],'kind filter');
 r=await search('bancos',{filters:{kind:'atm'}});eq(r.items.map(i=>i.slug),['cajero-ensayo']);
 eq((await search('salud')).items.map(i=>i.slug),['clinica-ensayo'],'drafts never shown');
 ok(!(await search('restaurantes')).items.some(i=>i.vertical.id==='cafe_bar'),'cafés no longer in restaurantes');
 ok((await search('lugares',{filters:{vertical:['banking','health']}})).items.length===3,'lugares covers the new verticals');
 let fv=await facets('cafes');eq(fv.facets.kind,[{value:'bakery',count:1},{value:'cafe',count:1}],'kind facet');
 fv=await facets('cafes',{filters:{kind:'cafe'}});eq([fv.total,fv.facets.kind.length],[1,2],'kind facet ignores its own filter');
 eq((await facets('bancos',{filters:{kind:'atm',district:'Mercedes'}})).facets.kind,[{value:'atm',count:1}],'generic facet path');
 for(const v of ['bancos','salud','hospedaje','tours','talleres','belleza','gimnasios']){
  await assert.rejects(()=>search(v,{sort:'price_asc'}),code('22023'),v+' price sort');await assert.rejects(()=>search(v,{filters:{priceMin:1}}),code('22023'),v+' price filter');
  await assert.rejects(()=>search(v,{filters:{product:'arroz'}}),code('22023'),v+' product');ok(!('price' in (await facets(v)).facets),v+' no price facet');}
 eq((await search('cafes',{sort:'price_asc'})).sort,'price_asc','cafes: menu price order');
 for(const v of ['pulperias','ferreterias','veterinarias']){await assert.rejects(()=>search(v,{sort:'price_asc'}),code('22023'),v+' needs a product');
  eq((await search(v,{filters:{product:'arroz'}})).vertical,v);}
 await assert.rejects(()=>search('restaurantes',{filters:{kind:'cafe'}}),code('22023'),'no kind filter on older sections');
 await assert.rejects(()=>search('cafes',{filters:{kind:'Bad Kind'}}),code('22023'));
 // zod mirror (search-schemas.ts)
 const P=x=>S.parseSearchParams(new URLSearchParams(x));
 eq([P('vertical=cafes&kind=bakery,bar').ok,P('vertical=cafes&kind=clinic').ok,P('vertical=restaurantes&kind=cafe').ok],[true,false,false],'kind validated per section');
 eq([P('vertical=bancos&sort=price_asc').reason,P('vertical=salud&priceMin=1').ok,P('vertical=ferreterias&sort=price_asc').reason,P('vertical=cafes&sort=price_asc').ok],['sort',false,'product',true]);
 eq([S.placePriceMode('cafes'),S.placePriceMode('pulperias'),S.placePriceMode('bancos'),S.placePriceMode('salud')],['menu','product',null,null]);
 eq(P('q=cajero automático en Heredia').vertical,'bancos','vertical detected from text');}

// grants and neutrality of the SQL bodies
await db.exec('reset role');
for(const role of ['anon','authenticated']){await db.exec(`set role ${role}`);await assert.rejects(()=>search('restaurantes'),code('42501'));await db.exec('reset role');}
const src=(await q(`select string_agg(prosrc,' ') s from pg_proc where proname like 'dir\\_search%' or proname='dir_facets'`))[0].s;
ok(!/pro_memberships|pro_workspace|membership|edition|paywall|is_featured|featured|sponsor|payment|\btiers?\b/i.test(src),'no commercial signal in dir_search*/dir_facets');
console.log(`PASS directory search (${checks} checks): 2026-11-17 sections (kind filter + facet, price modes per section, zod parity), visibility, private fields, text, filters, open now, geography, sorts = ranking.ts, pagination, facets, grants.`);

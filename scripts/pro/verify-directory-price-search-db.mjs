// LOCAL PRO ONLY (owner decision 2026-11-17: «farmacias quiero mostrar todo y en todo donde aplique filtrar precios, solo
// gasolineras no»): in-memory PGlite verification of directory-price-search-local.sql on top of the modules it needs
// (core, import, claims, vehicles-catalog, listings, search, price-observations, price-compare, pro-menu). Checks:
// restaurant menu median (final price with IVA/service, published + available dishes of claimed places only), price
// range and price sorts with keyset pagination, product resolution (slug or text, never Rx), current price per store
// (best tier, stale never counts), places without price kept unless a range is set, pharmacies without a verified
// licence shown with their prices, no price at fuel stations, facets (price range, withPrice), errors and grants.
// SQL directory: process.env.DIR_SQL_DIR (default docs/pro/sql). Never touches a shared database.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';

const dir=process.env.DIR_SQL_DIR||'docs/pro/sql';
const {PGlite}=await import(process.env.PRO_PGLITE_MODULE||'@electric-sql/pglite'),db=new PGlite();
await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');
const modules=['directory-core-local.sql','directory-import-local.sql','directory-claims-local.sql','dir-business-roles-local.sql','vehicles-catalog-local.sql','directory-listings-local.sql',
 'directory-search-local.sql','price-observations-local.sql','price-compare-local.sql','pro-menu-local.sql','directory-price-search-local.sql'];
for(const f of modules)await db.exec(await readFile(join(dir,f),'utf8'));
await db.exec(await readFile(join(dir,'directory-price-search-local.sql'),'utf8'));// idempotent re-run
// Re-applying the search module alone keeps the real readers (its no-price stubs are only created when missing).
await db.exec(await readFile(join(dir,'directory-search-local.sql'),'utf8'));
let checks=0;const eq=(a,b,m)=>{assert.deepEqual(a,b,m);checks++;};const ok=(v,m)=>{assert.ok(v,m);checks++;};
const q=async(text,params=[])=>(await db.query(text,params)).rows;
const code=(c,hint)=>e=>{assert.equal(e.code,c,e.message);if(hint)assert.equal(e.hint,hint);checks++;return true;};
const uuid=()=>crypto.randomUUID(),staff='00000000-0000-4000-8000-0000000000aa',userA='00000000-0000-4000-8000-0000000000a1',userB='00000000-0000-4000-8000-0000000000b1';
const ago=d=>new Date(Date.now()-d*864e5).toISOString();
const place=async(slug,vertical,o={})=>{const id=uuid();
 await q(`insert into dir_places(id,slug,vertical_id,name,admin_area_1,admin_area_2,locality,lat,lng,location_precision,status,verification_level,claim_status)
  values($1,$2,$3,$4,'San José','San José','San José',9.933,-84.08,'exact','published',$5,$6)`,[id,slug,vertical,'Lugar '+slug,o.level??'imported',o.claim??'unclaimed']);return id;};

// ---------------------------------------------------------------- restaurants: menu median
const menu=async(pid,items,settings={})=>{
 await q(`insert into pro_menu_settings(place_id,prices_include_iva,prices_include_service,service_charge,service_bps) values($1,$2,$3,$4,$5)`,
  [pid,settings.iva??true,settings.svcIncluded??false,settings.service??true,settings.service===false?0:1000]);
 const sec=uuid();await q(`insert into pro_menu_sections(id,place_id,name_es,sort,status) values($1,$2,'Platos',0,$3)`,[sec,pid,settings.section??'active']);
 for(const [i,it] of items.entries())await q(`insert into pro_menu_items(id,place_id,section_id,name_es,price_minor,sort,status,availability) values($1,$2,$3,$4,$5,$6,$7,$8)`,
  [uuid(),pid,sec,'Plato '+i,it.minor,i,it.status??'published',it.availability??'available']);};
const total=async(minor,iva=true,svcIncluded=false,svcBps=1000)=>Number((await q('select (pro_menu_price($1,$2,$3,1300,$4)->>\'total\')::bigint t',[minor,iva,svcIncluded,svcBps]))[0].t);
const r1=await place('soda-mediana','restaurant',{claim:'claimed'});
await menu(r1,[{minor:300000},{minor:500000},{minor:900000},{minor:100000,status:'draft'},{minor:50000,availability:'unavailable'},{minor:5000000,status:'archived'},{minor:450000,availability:'sold_out'}]);
const r2=await place('soda-barata','restaurant',{claim:'disputed'});await menu(r2,[{minor:200000},{minor:250000}],{service:false});
const r3=await place('soda-sin-reclamar','restaurant');await menu(r3,[{minor:100}]);// unclaimed: menu not public → no price
const r4=await place('soda-sin-menu','restaurant',{claim:'claimed'});
const r5=await place('soda-seccion-archivada','restaurant',{claim:'claimed'});await menu(r5,[{minor:100}],{section:'archived'});
void r3;void r4;void r5;
const search=async(v,o={})=>(await q('select dir_search($1,$2,$3,null,null,null,$4,$5,$6) r',[v,o.q??null,o.filters??{},o.sort??'relevance',o.cursor??null,o.limit??20]))[0].r;
const facets=async(v,f={})=>(await q('select dir_facets($1,null,$2) r',[v,f]))[0].r;
const all=async(v,o={})=>{const out=[];let cursor=null,pages=0;do{const r=await search(v,{...o,cursor});out.push(...r.items);cursor=r.nextCursor;ok(++pages<30);}while(cursor);return out;};
const slugs=items=>items.map(i=>i.slug);
// Median of the 4 counted dishes (300, 450 sold out but listed, 500, 900): (450+500)/2 on final prices, rounded to colones.
const med=Math.round(((await total(450000))+(await total(500000)))/2/100);
const cheap=Math.round(((await total(200000,true,false,0))+(await total(250000,true,false,0)))/2/100);
let items=await all('restaurantes',{sort:'price_asc'});
eq(slugs(items).slice(0,2),['soda-barata','soda-mediana'],'cheapest median first');
eq(items[1].price,{...items[1].price,kind:'menu',amount:med,currency:'CRC',dishes:4},'menu median with IVA + service, draft/unavailable/archived excluded');
eq(items[0].price.amount,cheap,'no service charge');
ok(items.slice(2).every(i=>i.price===null&&i.ranking_reason.includes('price_missing')),'places without a published menu last, kept');
eq(items.length,5,'no price filter → nobody dropped');
eq(slugs(await all('restaurantes',{sort:'price_desc'})).slice(0,2),['soda-mediana','soda-barata']);
eq(slugs(await all('restaurantes',{filters:{priceMin:cheap+1}})),['soda-mediana'],'price range drops places without price');
eq(slugs(await all('restaurantes',{filters:{priceMax:cheap}})),['soda-barata'],'max inclusive (whole colones)');
eq(slugs(await all('restaurantes',{filters:{priceMin:med,priceMax:med}})),['soda-mediana'],'min inclusive');
eq((await all('restaurantes',{filters:{priceMin:med+1}})).length,0);
// keyset pagination on price sorts = one big page
for(const sort of ['price_asc','price_desc'])eq(slugs(await all('restaurantes',{sort,limit:1})),slugs((await search('restaurantes',{sort,limit:50})).items),'pages '+sort);
let fc=await facets('restaurantes');eq([fc.total,fc.facets.price,fc.facets.withPrice],[5,{min:cheap,max:med},2]);
fc=await facets('restaurantes',{priceMin:cheap+1});eq([fc.total,fc.facets.price,fc.facets.withPrice],[1,{min:cheap,max:med},2],'price facet ignores its own filter');
eq(fc.facets.canton,[{value:'San José',count:1}],'other facets follow the price filter');

// ---------------------------------------------------------------- supermarkets and pharmacies: one product
const rpc=async(fn,input,actor=staff)=>(await q(`select ${fn}($1,$2) r`,[actor,input]))[0].r;
await rpc('price_catalog_upsert',{actionId:uuid(),slug:'arroz-prueba-1kg',kind:'grocery',name:'Arroz Prueba',category:'granos',presentation:'1 kg',unitBase:'kg',unitQty:1,aliases:['arroz']});
await rpc('price_catalog_upsert',{actionId:uuid(),slug:'aceta-prueba-10',kind:'medicine',rxRequired:false,name:'Acetaminofén Prueba 500 mg',category:'analgesicos',presentation:'10 tabletas',unitBase:'unit',unitQty:10,aliases:['paracetamol']});
await rpc('price_item_upsert',{actionId:uuid(),slug:'antibiotico-prueba',kind:'medicine',name:'Antibiótico Prueba',unitBase:'unit',unitQty:12});// Rx by default
const s1=await place('super-uno','grocery'),s2=await place('super-dos','grocery'),s3=await place('super-viejo','grocery');await place('super-sin-precio','grocery');
const obs=(itemSlug,placeId,price,o={})=>rpc('price_observation_record',{actionId:uuid(),sourceKind:o.kind??'business',itemSlug,placeId,price,observedAt:o.at??ago(1),...(o.ref?{sourceRef:o.ref}:{})},o.actor??staff);
await obs('arroz-prueba-1kg',s1,1200);await obs('arroz-prueba-1kg',s2,1100,{kind:'official_meic',ref:'SINT-1'});
await obs('arroz-prueba-1kg',s3,900,{at:ago(60)});// stale business price (30 days)
// community reports at super-uno: lower tier than the business price, so the business price stays.
for(const u of [userA,userB])await obs('arroz-prueba-1kg',s1,1000,{kind:'user_report',actor:u,at:ago(0.1)});
let r=await search('supermercados',{filters:{product:'arroz'},sort:'price_asc'});
eq(r.priceProduct,{slug:'arroz-prueba-1kg',name:'Arroz Prueba',presentation:'1 kg',brand:null,unitBase:'kg',unitQty:1},'text resolved to one catalogue item');
eq(slugs(r.items).slice(0,2),['super-dos','super-uno'],'current price ascending; best tier per store');
eq([r.items[0].price.kind,r.items[0].price.observation.price,r.items[0].price.observation.sourceKind,r.items[0].price.item.slug],['product',1100,'official_meic','arroz-prueba-1kg']);
eq(r.items[1].price.observation.confidence,'business','business beats community_verified at the same store');
ok(r.items[0].price.observation.observedAt&&r.items[0].price.observation.source.name,'source and date travel to the card');
ok(r.items.slice(2).every(i=>i.price===null),'stale price and no price: no price, kept');eq(r.items.length,4);
eq(slugs((await search('supermercados',{filters:{product:'arroz-prueba-1kg',priceMax:1150}})).items),['super-dos'],'slug works; range drops the rest');
eq(slugs((await search('supermercados',{filters:{product:'arroz',priceMin:1100,priceMax:1200},sort:'price_desc'})).items),['super-uno','super-dos']);
eq((await search('supermercados',{filters:{product:'arroz',priceMax:950}})).items,[],'stale 900 never matches');
r=await search('supermercados',{filters:{product:'producto inexistente'}});eq([r.priceProduct,r.items.length],[null,4],'unknown product: all stores, no price');
eq((await search('supermercados',{filters:{product:'producto inexistente',priceMax:5000}})).items,[]);
eq(slugs(await all('supermercados',{filters:{product:'arroz'},sort:'price_asc',limit:1})),slugs((await search('supermercados',{filters:{product:'arroz'},sort:'price_asc',limit:50})).items),'pagination');
fc=await facets('supermercados',{product:'arroz',priceMax:1150});eq([fc.total,fc.facets.price,fc.facets.withPrice],[1,{min:1100,max:1200},2]);
fc=await facets('supermercados');eq([fc.facets.price,fc.facets.withPrice],[{min:null,max:null},0],'no product: no price');
// pharmacies: shown without a verified licence, with their OTC price; Rx never resolvable
const ph1=await place('farmacia-sin-verificar','pharmacy'),ph2=await place('farmacia-verificada','pharmacy',{level:'license_verified'});
await obs('aceta-prueba-10',ph1,800);await obs('aceta-prueba-10',ph2,950);
r=await search('farmacias',{filters:{product:'paracetamol'},sort:'price_asc'});
eq([r.priceProduct.slug,slugs(r.items),r.items.map(i=>i.verificationLevel)],['aceta-prueba-10',['farmacia-sin-verificar','farmacia-verificada'],['imported','license_verified']]);
eq((await search('supermercados',{filters:{product:'paracetamol'}})).priceProduct,null,'medicine is not a supermarket product');
for(const p of ['antibiotico','antibiotico-prueba'])eq((await search('farmacias',{filters:{product:p}})).priceProduct,null,'Rx never resolvable: '+p);
await assert.rejects(rpc('price_observation_record',{actionId:uuid(),sourceKind:'business',itemSlug:'antibiotico-prueba',placeId:ph1,price:5000,observedAt:ago(1)}),code('22023','price_rx_not_public'));

// ---------------------------------------------------------------- fuel stations and other sections: never a price
const fuel=await place('bomba-prueba','fuel');void fuel;
eq((await search('gasolineras')).items[0].price,null);eq('price' in (await facets('gasolineras')).facets,false);
for(const [v,o] of [['gasolineras',{sort:'price_asc'}],['gasolineras',{filters:{priceMin:1}}],['gasolineras',{filters:{product:'arroz'}}],['lugares',{sort:'price_asc'}],
 ['agencias',{filters:{priceMax:1}}],['farmacias',{sort:'price_asc'}],['supermercados',{filters:{priceMin:1}}],['restaurantes',{filters:{priceMin:9,priceMax:1}}],
 ['restaurantes',{filters:{priceMin:2e9}}],['restaurantes',{filters:{product:'arroz'}}],['farmacias',{filters:{product:'x'}}]])
 await assert.rejects(search(v,o),code('22023'),JSON.stringify([v,o]));
await assert.rejects(facets('gasolineras',{priceMin:1}),code('22023'));
// lugares never carries a price even though it includes restaurants
ok((await all('lugares')).every(i=>i.price===null),'generic section: no price');

// ---------------------------------------------------------------- 2026-11-17 sections
// cafes: menu median like restaurants (claimed cafe_bar with a published menu); pulperias/ferreterias/veterinarias:
// product price (grocery/generic, never medicine); banks and health places: no price can even be recorded.
{const c1=await place('cafe-con-menu','cafe_bar',{claim:'claimed'});await menu(c1,[{minor:150000},{minor:250000}],{service:false});
 const c2=await place('cafe-sin-menu','cafe_bar');void c2;
 let rr=await search('cafes',{sort:'price_asc'});
 eq([slugs(rr.items),rr.items[0].price.kind,rr.items[0].price.dishes,rr.items[1].price],[['cafe-con-menu','cafe-sin-menu'],'menu',2,null],'cafe menu median');
 ok(!(await all('restaurantes')).some(i=>i.slug==='cafe-con-menu'),'a café menu never counts as a restaurant');
 const pu=await place('pulperia-precio','convenience');await place('ferreteria-precio','hardware');const ve=await place('tienda-mascotas-precio','vet_pets');
 await obs('arroz-prueba-1kg',pu,1150);
 rr=await search('pulperias',{filters:{product:'arroz'},sort:'price_asc'});eq([rr.priceProduct.slug,rr.items[0].slug,rr.items[0].price.observation.price],['arroz-prueba-1kg','pulperia-precio',1150]);
 ok(!(await search('supermercados',{filters:{product:'arroz'}})).items.some(i=>i.slug==='pulperia-precio'),'corner store prices stay in their section');
 eq((await search('pulperias',{filters:{product:'paracetamol'}})).priceProduct,null,'no medicine at corner stores');
 eq((await search('veterinarias',{filters:{product:'paracetamol'}})).priceProduct,null,'no medicine at vets');
 eq((await search('ferreterias',{filters:{product:'arroz'}})).items.map(i=>i.slug),['ferreteria-precio']);void ve;
 const bank=await place('banco-precio','banking'),clinic=await place('clinica-precio','health');
 for(const pid of [bank,clinic])await assert.rejects(rpc('price_observation_record',{actionId:uuid(),sourceKind:'business',itemSlug:'arroz-prueba-1kg',placeId:pid,price:1000,observedAt:ago(1)}),code('22023','price_section_off'));
 for(const v of ['bancos','salud','hospedaje','tours'])await assert.rejects(search(v,{sort:'price_asc'}),code('22023'),v);}

// ---------------------------------------------------------------- grants and neutrality
for(const role of ['anon','authenticated']){await db.exec(`set role ${role}`);
 await assert.rejects(q("select * from dir_search_place_prices('restaurantes',null)"),code('42501'));await assert.rejects(q("select dir_search_price_product('farmacias','x')"),code('42501'));
 await db.exec('reset role');}
const src=(await q(`select string_agg(prosrc,' ') s from pg_proc where proname in('dir_search_place_prices','dir_search_price_product')`))[0].s;
ok(!/pro_memberships|pro_workspace|membership|edition|paywall|featured|sponsor|payment|verification_level/i.test(src),'no commercial or verification signal in the price readers');
console.log(`PASS directory price search (${checks} checks): 2026-11-17 sections (cafes menu median, corner store/hardware/pet product prices without medicine, no price recordable at banks/health), restaurant menu median (final price, published/available, claimed only), price range + price sorts + keyset pagination, product by text or slug (never Rx), current best-tier store price (stale never counts), places without price kept unless a range is set, unverified pharmacies with OTC prices, no price at fuel stations/agencias/lugares, disjunctive price facet, 22023 errors, grants.`);

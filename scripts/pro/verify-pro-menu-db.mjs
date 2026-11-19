// LOCAL PRO ONLY (multivertical P2): in-memory PGlite verification of pro-menu-local.sql (+ directory core and
// claims it depends on). SQL is read from DIR_SQL_DIR (default docs/pro/sql). Checks the TS price mirror against
// pro_menu_price, zod mirrors, menu-from-photo normalisation (mock adapter only), manager/claim/role authorization,
// CAS 40001, idempotent actionId, reorder, archive, immutable history, import drafts (never published), the public
// reader, grants and that menus never touch price_observations. No shared database, no network.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {registerHooks} from 'node:module';
const libRoot=new URL('../../src/lib/',import.meta.url).href;
registerHooks({resolve(specifier,context,next){return next(context.parentURL?.startsWith(libRoot)&&specifier.startsWith('.')&&!/\.[a-z]+$/i.test(specifier)?specifier+'.ts':specifier,context);}});
const dir=process.env.DIR_SQL_DIR||'docs/pro/sql';
const PRICE=await import('../../src/lib/directory/menu-price.ts');
const Z=await import('../../src/lib/directory/menu-schemas.ts');
const IMP=await import('../../src/lib/directory/menu-import.ts');
const uuid=()=>crypto.randomUUID(),code=c=>e=>{assert.equal(e.code,c,`${c} expected, got ${e.code}: ${e.message}`);return true;};
const hint=h=>e=>{assert.equal(e.hint,h,`${h} expected, got ${e.hint} (${e.code}): ${e.message}`);return true;};

// ---------------------------------------------------------------- TS: price, zod, import contract
{const b=(p,iva,svc,charge=true)=>PRICE.menuPriceBreakdown(p,{pricesIncludeIva:iva,pricesIncludeService:svc,ivaRateBps:1300,serviceRateBps:charge?1000:0});
 assert.deepEqual(b(1000000,false,false),{base:1000000,iva:130000,service:100000,total:1230000});
 assert.deepEqual(b(1230000,true,true),{base:1000000,iva:130000,service:100000,total:1230000});
 assert.deepEqual(b(1130000,true,false),{base:1000000,iva:130000,service:100000,total:1230000});
 assert.deepEqual(b(1100000,false,true),{base:1000000,iva:130000,service:100000,total:1230000});
 assert.deepEqual(b(1130000,true,false,false),{base:1000000,iva:130000,service:0,total:1130000});
 assert.deepEqual(b(1130000,true,true,false),{base:1000000,iva:130000,service:0,total:1130000},'no service charge ignores includeService');
 assert.equal(PRICE.parseMenuMoney('₡4 500'),450000);assert.equal(PRICE.parseMenuMoney('4.500,50'),450050);assert.equal(PRICE.parseMenuMoney('12.5'),1250);
 assert.equal(PRICE.parseMenuMoney('1,250.00'),125000);assert.equal(PRICE.parseMenuMoney('abc'),null);
 assert.match(PRICE.formatMenuMoney(450000,'CRC','es'),/^₡4\.500$/);assert.match(PRICE.formatMenuMoney(1250,'USD','en'),/\$12\.50/);
 const item={nameEs:'Casado',priceMinor:520000};
 assert.equal(Z.menuItemFieldsSchema.safeParse(item).success,true);
 assert.deepEqual(Z.menuItemFieldsSchema.parse({...item,dietary:['vegano']}).dietary,['vegetariano','vegano'],'vegano implies vegetariano');
 assert.equal(Z.menuItemFieldsSchema.safeParse({...item,dietary:['keto']}).success,false);
 assert.equal(Z.menuItemFieldsSchema.safeParse({...item,priceMinor:1.5}).success,false);
 assert.equal(Z.menuItemFieldsSchema.safeParse({...item,availableFrom:'06:00'}).success,false,'both hours');
 assert.equal(Z.menuItemFieldsSchema.safeParse({...item,photoUrl:'http://x.cr/a.jpg'}).success,false,'https only');
 assert.equal(Z.menuItemFieldsSchema.safeParse({...item,photoAltEs:'foto'}).success,false,'alt needs photo');
 assert.equal(Z.menuMutationSchema.safeParse({action:'settings',actionId:uuid(),placeId:uuid(),revision:0,pricesIncludeIva:true,pricesIncludeService:true,serviceCharge:false}).success,false);
 assert.equal(Z.menuImportReviewSchema.safeParse({action:undefined,actionId:uuid(),placeId:uuid(),draftId:uuid(),decision:'apply',sections:[{sectionId:uuid(),section:{nameEs:'A'},items:[{itemId:uuid(),item:{...item,status:'published'}}]}]}).success,false,'import never publishes');
 // normalisation: links stripped, tags mapped, string prices, unreadable price → null + low confidence; junk discarded
 const mock=new IMP.MockMenuExtractor(),jpeg=new Uint8Array([0xff,0xd8,0xff,1,2,3]);
 const raw=await mock.extract({bytes:jpeg,mime:'image/jpeg',language:'es'});assert.equal(raw.ok,true);
 const ex=IMP.normalizeMenuExtraction(raw.output);assert.ok(ex);
 assert.deepEqual(ex.sections[0].items[0].dietary,['vegetariano']);assert.deepEqual(ex.sections[0].items[1].dietary,['vegetariano','vegano']);
 assert.equal(ex.sections[0].items[1].priceMinor,380000);assert.equal(ex.sections[1].items[1].priceMinor,null);assert.equal(ex.sections[1].items[1].confidence,'low');
 assert.doesNotMatch(JSON.stringify(ex),/www\./,'links removed');
 assert.equal(IMP.normalizeMenuExtraction({hello:'world'}),null);assert.equal(IMP.normalizeMenuExtraction({...raw.output,extra:1}),null);
 assert.deepEqual(await mock.extract({bytes:jpeg,mime:'application/pdf',language:'es'}),{ok:false,reason:'unsupported_file'});
 const rows=IMP.extractionToReview(ex,uuid);assert.equal(rows[1].rows[1].needsPrice,true);
 assert.deepEqual(IMP.reviewToApply({actionId:uuid(),placeId:uuid(),draftId:uuid(),sections:rows}),{error:'needs_price'});
 rows[1].rows[1].include=false;const body=IMP.reviewToApply({actionId:uuid(),placeId:uuid(),draftId:uuid(),sections:rows});
 assert.equal(Z.menuImportReviewSchema.safeParse(body).success,true);assert.ok(body.sections.flatMap(s=>s.items).every(i=>i.item.status==='draft'));
 for(const f of ['menu-schemas.ts','menu-import.ts','menu-price.ts'])assert.doesNotMatch((await readFile('src/lib/directory/'+f,'utf8')).replace(/\/\/.*$/gm,''),/price_observation|fetch\(|anthropic/i,f);}

// ---------------------------------------------------------------- database
const {PGlite}=await import(process.env.PRO_PGLITE_MODULE||'@electric-sql/pglite'),db=new PGlite();
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;`);
const core=await readFile(join(dir,'directory-core-local.sql'),'utf8'),claims=await readFile(join(dir,'directory-claims-local.sql'),'utf8'),menu=await readFile(join(dir,'pro-menu-local.sql'),'utf8');
assert.doesNotMatch(menu.replace(/--.*$/gm,''),/price_observation|price_items/i,'menus never write the price comparator');
assert.doesNotMatch(menu.replace(/--.*$/gm,''),/featured|sponsor|premium|is_paid|billing/i,'no commercial column');
await db.exec(core);await db.exec(claims);await db.exec(await readFile(join(dir,'dir-business-roles-local.sql'),'utf8'));await db.exec(menu);await db.exec(menu);
await db.exec('update dir_claim_settings set sms_enabled=true'); // phone_listed (SMS) is OFF by default since 2026-11-17; these checks still claim by phone
await db.exec('set role service_role');
const q=async(text,params=[])=>(await db.query(text,params)).rows;
const staff='00000000-0000-4000-8000-0000000000aa',ana='00000000-0000-4000-8000-00000000a001',beto='00000000-0000-4000-8000-00000000b001',memb='00000000-0000-4000-8000-00000000c001';
const id=i=>'00000000-0000-4000-8000-'+String(i).padStart(12,'0');
const call=async(fn,...args)=>(await q(`select ${fn}(${args.map((_,i)=>'$'+(i+1)).join(',')}) r`,args))[0].r;
const mutate=(input,actor=ana,member=null)=>call('pro_menu_mutate',actor,member,{actionId:uuid(),placeId:id(1),...input});
const placeMut=input=>call('dir_place_mutate',staff,{actionId:uuid(),...input});
const place=async(n,vertical='restaurant')=>{const r=await placeMut({action:'create',placeId:id(n),revision:0,place:{slug:'lugar-'+n,vertical,name:'Lugar '+n,lat:9.93,lng:-84.08,phone:'+506 2200 00'+String(n).padStart(2,'0')},source:{id:'osm',ref:'node/'+n}});
 return (await placeMut({action:'status',placeId:id(n),revision:r.revision,status:'published'})).revision;};
const claim=async(n,actor)=>{const o=await call('dir_claim_open',actor,{actionId:uuid(),claimId:uuid(),slug:'lugar-'+n,method:'phone_listed'});
 await call('dir_claim_finish',o.claimId,'approved',staff,uuid(),null,null);};

// price parity SQL ↔ TS (all four configurations, with/without service, 0..3000 + large values)
let parity=0;
{const cases=[];for(let p=0;p<=3000;p+=7)cases.push(p);cases.push(99999,123456789,1000000000);
 for(const [iva,svc,charge] of [[false,false,true],[true,true,true],[true,false,true],[false,true,true],[true,false,false],[false,false,false]]){
  const rows=await q('select p,pro_menu_price(p,$2,$3,1300,$4) r from unnest($1::bigint[]) p',[cases,iva,svc,charge?1000:0]);
  for(const {p,r} of rows){const ts=PRICE.menuPriceBreakdown(Number(p),{pricesIncludeIva:iva,pricesIncludeService:svc,ivaRateBps:1300,serviceRateBps:charge?1000:0});
   assert.deepEqual({base:Number(r.base),iva:Number(r.iva),service:Number(r.service),total:Number(r.total)},ts,`parity ${p} ${iva} ${svc} ${charge}`);
   assert.ok(ts.base>=0&&ts.iva>=0&&ts.service>=0&&ts.base+ts.iva+ts.service===ts.total,`parts ${p}`);parity++;}}}

await place(1);await place(2);await place(3,'grocery');
const sec=uuid(),sec2=uuid(),it1=uuid(),it2=uuid(),it3=uuid();
const item={nameEs:'Casado con pollo',nameEn:'Chicken casado',priceMinor:520000,dietary:[],availability:'available',status:'published'};
// unclaimed place: nobody edits; claimed: only active managers
await assert.rejects(()=>mutate({action:'section_create',sectionId:sec,section:{nameEs:'Platos fuertes'}}),hint('menu_not_manager'));
await claim(1,ana);await claim(3,ana);
await assert.rejects(()=>mutate({action:'section_create',sectionId:sec,section:{nameEs:'Platos'}},beto),hint('menu_not_manager'));
await assert.rejects(()=>call('pro_menu_mutate',ana,null,{actionId:uuid(),placeId:id(3),action:'section_create',sectionId:uuid(),section:{nameEs:'X'}}),hint('menu_vertical'));
assert.equal(await call('dir_place_menu_public','lugar-1'),null,'no menu yet');
const s1in={actionId:uuid(),placeId:id(1),action:'section_create',sectionId:sec,section:{nameEs:'Platos fuertes',nameEn:'Mains'}};
const s1=await call('pro_menu_mutate',ana,null,s1in);assert.equal(s1.revision,1);
assert.equal((await call('pro_menu_mutate',ana,null,s1in)).replayed,true,'same actionId → same answer');
await assert.rejects(()=>call('pro_menu_mutate',ana,null,{...s1in,section:{nameEs:'Otro'}}),hint('menu_action_reused'));
await assert.rejects(()=>mutate({action:'section_create',sectionId:sec,section:{nameEs:'Dup'}}),code('23505'));
await assert.rejects(()=>mutate({action:'section_create',sectionId:uuid(),section:{nameEs:'X'},extra:1}),code('22023'),'exact keys');
await mutate({action:'section_create',sectionId:sec2,section:{nameEs:'Bebidas'}});
// items: validation mirrors zod
for(const bad of [{...item,priceMinor:-1},{...item,priceMinor:1.5},{...item,dietary:['vegano']},{...item,dietary:['keto']},{...item,availableFrom:'06:00'},
 {...item,photoUrl:'http://a.cr/x.jpg'},{...item,photoAltEs:'x'},{...item,nameEs:''},{...item,status:'archived'},{...item,unknown:1}])
 await assert.rejects(()=>mutate({action:'item_create',itemId:uuid(),sectionId:sec,item:bad}),code('22023'),JSON.stringify(bad));
const c1=await mutate({action:'item_create',itemId:it1,sectionId:sec,item});
await mutate({action:'item_create',itemId:it2,sectionId:sec,item:{nameEs:'Pinto vegano',priceMinor:380000,dietary:['vegetariano','vegano'],status:'draft',availableFrom:'06:00',availableUntil:'11:00'}});
await mutate({action:'item_create',itemId:it3,sectionId:sec2,item:{nameEs:'Fresco natural',priceMinor:150000,availability:'sold_out',status:'published',photoUrl:'https://cdn.example.cr/fresco.jpg',photoAltEs:'Vaso de fresco'}});
// CAS
await assert.rejects(()=>mutate({action:'item_update',itemId:it1,revision:c1.revision+1,sectionId:sec,item}),code('40001'));
const u1=await mutate({action:'item_update',itemId:it1,revision:c1.revision,sectionId:sec,item:{...item,priceMinor:550000}});assert.equal(u1.revision,2);
await assert.rejects(()=>mutate({action:'item_update',itemId:it1,revision:c1.revision,sectionId:sec,item}),code('40001'),'stale revision');
// settings CAS (revision 0 while the row has none set explicitly → row exists lazily with revision 1)
const read1=await call('pro_menu_read',ana,null,id(1));assert.equal(read1.settings.revision,1);assert.equal(read1.sections.length,2);
await assert.rejects(()=>mutate({action:'settings',revision:0,pricesIncludeIva:false,pricesIncludeService:false,serviceCharge:true}),code('40001'));
await assert.rejects(()=>mutate({action:'settings',revision:1,pricesIncludeIva:true,pricesIncludeService:true,serviceCharge:false}),code('22023'));
const st=await mutate({action:'settings',revision:1,pricesIncludeIva:false,pricesIncludeService:false,serviceCharge:true});assert.equal(st.settingsRevision,2);
await assert.rejects(()=>call('pro_menu_read',beto,null,id(1)),hint('menu_not_manager'));
// public reader: published items only, final price with IVA + service, sold_out shown, drafts/unavailable hidden, no ids
let pub=await call('dir_place_menu_public','lugar-1');
assert.equal(pub.sections.length,2);assert.deepEqual(pub.sections[0].items.map(i=>i.nameEs),['Casado con pollo'],'draft hidden');
assert.deepEqual(pub.sections[0].items[0].price,{base:550000,iva:71500,service:55000,total:676500});
assert.equal(pub.sections[1].items[0].availability,'sold_out');assert.doesNotMatch(JSON.stringify(pub),/"id"|revision|origin|actor|[0-9a-f]{8}-[0-9a-f]{4}-/,'no internal ids');
await mutate({action:'item_update',itemId:it3,revision:1,sectionId:sec2,item:{nameEs:'Fresco natural',priceMinor:150000,availability:'unavailable',status:'published'}});
pub=await call('dir_place_menu_public','lugar-1');assert.equal(pub.sections.length,1,'section without visible items omitted');
// publish drafts; reorder with full list; stale list → 40001
await mutate({action:'items_publish',itemIds:[it2]});
pub=await call('dir_place_menu_public','lugar-1');assert.deepEqual(pub.sections[0].items.map(i=>i.nameEs),['Casado con pollo','Pinto vegano']);
assert.deepEqual(pub.sections[0].items[1].dietary,['vegetariano','vegano']);assert.equal(pub.sections[0].items[1].availableFrom,'06:00');
await assert.rejects(()=>mutate({action:'items_reorder',sectionId:sec,itemIds:[it2]}),hint('menu_order_stale'));
await mutate({action:'items_reorder',sectionId:sec,itemIds:[it2,it1]});
await mutate({action:'sections_reorder',sectionIds:[sec2,sec]});
const read2=await call('pro_menu_read',ana,null,id(1));assert.deepEqual(read2.sections.map(s=>s.id),[sec2,sec]);assert.deepEqual(read2.sections[1].items.map(i=>i.id),[it2,it1]);
// archive: section with items refused; archive item then section; archived item never public, sort reused
await assert.rejects(()=>mutate({action:'section_archive',sectionId:sec2,revision:read2.sections[0].revision}),hint('menu_section_not_empty'));
const it3row=read2.sections[0].items[0];await mutate({action:'item_archive',itemId:it3,revision:it3row.revision});
await mutate({action:'section_archive',sectionId:sec2,revision:read2.sections[0].revision});
await assert.rejects(()=>mutate({action:'item_create',itemId:uuid(),sectionId:sec2,item}),hint('menu_section_missing'));
// non-published / unclaimed place → no public menu
const rev1=(await q('select revision from dir_places where id=$1',[id(1)]))[0].revision;
await placeMut({action:'status',placeId:id(1),revision:rev1,status:'hidden'});assert.equal(await call('dir_place_menu_public','lugar-1'),null);
await placeMut({action:'status',placeId:id(1),revision:rev1+1,status:'published'});assert.ok(await call('dir_place_menu_public','lugar-1'));
assert.equal(await call('dir_place_menu_public','lugar-2'),null,'unclaimed');assert.equal(await call('dir_place_menu_public','../x'),null);

// company member (team module optional): without pro_role_of a member write is refused; with it, role must allow menu.write
await assert.rejects(()=>mutate({action:'section_create',sectionId:uuid(),section:{nameEs:'M'}},ana,memb),hint('menu_role'));
await db.exec(`reset role;create table team_stub(owner uuid,member uuid,role text);
 create function public.pro_role_of(p_actor uuid,p_owner uuid) returns text language sql stable as $$ select case when p_actor=p_owner then 'admin' else (select role from team_stub where owner=p_owner and member=p_actor) end $$;
 create function public.pro_role_allows(p_role text,p_capability text) returns boolean language sql immutable as $$ select case p_role when 'admin' then true when 'manager' then p_capability in('read','menu.write') when 'member' then p_capability in('read','menu.write') when 'read_only' then p_capability='read' else false end $$;
 grant select on team_stub to service_role;grant execute on function pro_role_of(uuid,uuid),pro_role_allows(text,text) to service_role;
 insert into team_stub values('${ana}','${memb}','read_only');set role service_role;`);
await assert.rejects(()=>mutate({action:'section_create',sectionId:uuid(),section:{nameEs:'M'}},ana,memb),hint('menu_role'));
assert.ok(await call('pro_menu_read',ana,memb,id(1)),'read_only may read');
await db.exec(`reset role;update team_stub set role='member';set role service_role;`);
const ms=uuid(),mres=await mutate({action:'section_create',sectionId:ms,section:{nameEs:'Postres'}},ana,memb);assert.equal(mres.revision,1);
assert.equal((await q("select member_id from pro_menu_history where entity_id=$1",[ms]))[0].member_id,memb,'history keeps the member');
await assert.rejects(()=>mutate({action:'section_create',sectionId:uuid(),section:{nameEs:'M'}},memb,null),hint('menu_not_manager'),'member acting alone is not a manager');

// menu from photo: record creates nothing; apply → drafts only; review once; failed draft cannot apply
const countItems=async()=>(await q("select count(*)::int n from pro_menu_items where place_id=$1",[id(1)]))[0].n;
const before=await countItems();
const raw=await new IMP.MockMenuExtractor().extract({bytes:new Uint8Array([0xff,0xd8,0xff,9]),mime:'image/jpeg',language:'es'});
const extraction=IMP.normalizeMenuExtraction(raw.output),src={sha256:'a'.repeat(64),bytes:4,mime:'image/jpeg'};
const recIn={actionId:uuid(),draftId:uuid(),placeId:id(1),mode:'mock',model:IMP.MENU_IMPORT_MOCK_MODEL,source:src,ok:true,extraction};
const d1=await call('pro_menu_import_record',ana,null,recIn);assert.equal(d1.status,'ready');assert.equal(d1.replayed,false);
assert.equal((await call('pro_menu_import_record',ana,null,recIn)).replayed,true);
await assert.rejects(()=>call('pro_menu_import_record',ana,null,{...recIn,source:{...src,bytes:5}}),hint('menu_action_reused'));
assert.equal(await countItems(),before,'record creates nothing');
await assert.rejects(()=>call('pro_menu_import_record',beto,null,{...recIn,actionId:uuid(),draftId:uuid()}),hint('menu_not_manager'));
const bad=await call('pro_menu_import_record',ana,null,{...recIn,actionId:uuid(),draftId:uuid(),extraction:{junk:true}});assert.equal(bad.status,'failed');assert.equal(bad.error,'invalid_output');
const fail=await call('pro_menu_import_record',ana,null,{...recIn,actionId:uuid(),draftId:uuid(),ok:false,extraction:null,error:'provider_failed'});assert.equal(fail.error,'provider_failed');
assert.equal((await call('pro_menu_read',ana,null,id(1))).imports.length,3);
const review=IMP.extractionToReview(d1.extraction,uuid);review[1].rows[1].item.priceMinor=450000;review[1].rows[1].needsPrice=false;
review[0].key=sec;review[0].nameEs='ignored';// first section merged into an existing one
const applyBody=IMP.reviewToApply({actionId:uuid(),placeId:id(1),draftId:d1.id,sections:review});
await assert.rejects(()=>call('pro_menu_import_review',ana,null,applyBody),code('22023'),'existing section takes no names');
applyBody.sections[0]={sectionId:sec,items:applyBody.sections[0].items};
const forced=structuredClone(applyBody);forced.actionId=uuid();forced.sections[0].items[0].item.status='published';
await assert.rejects(()=>call('pro_menu_import_review',ana,null,forced),hint('menu_import_never_publishes'));
const ap=await call('pro_menu_import_review',ana,null,applyBody);assert.equal(ap.createdItems.length,4);assert.equal(ap.published,0);
assert.equal((await call('pro_menu_import_review',ana,null,applyBody)).replayed,true);
await assert.rejects(()=>call('pro_menu_import_review',ana,null,{actionId:uuid(),placeId:id(1),draftId:d1.id,decision:'discard'}),hint('menu_import_reviewed'));
await assert.rejects(()=>call('pro_menu_import_review',ana,null,{actionId:uuid(),placeId:id(1),draftId:fail.id,decision:'apply',sections:applyBody.sections}),hint('menu_import_failed'));
assert.equal((await call('pro_menu_import_review',ana,null,{actionId:uuid(),placeId:id(1),draftId:fail.id,decision:'discard'})).review,'discarded');
assert.equal((await q("select count(*)::int n from pro_menu_items where import_id=$1 and status='draft' and origin='photo_import'",[d1.id]))[0].n,4,'imported items are drafts');
pub=await call('dir_place_menu_public','lugar-1');assert.doesNotMatch(JSON.stringify(pub),/Chifrijo|Gallo pinto/,'imported drafts never public');
await mutate({action:'items_publish',itemIds:ap.createdItems});
pub=await call('dir_place_menu_public','lugar-1');assert.match(JSON.stringify(pub),/Chifrijo/);
// draft immutability
await assert.rejects(()=>q("update pro_menu_import_drafts set extraction='{}' where id=$1",[d1.id]),code('23514'));
await assert.rejects(()=>q("update pro_menu_import_drafts set review=null,reviewed_at=null,reviewed_by=null,applied_items=null where id=$1",[d1.id]),code('23514'));

// immutability, no delete, truncate blocked, grants
for(const t of ['pro_menu_history','pro_menu_actions']){
 await assert.rejects(()=>q(`update ${t} set actor_id=actor_id`),code('42501'));
 await assert.rejects(()=>q(`delete from ${t}`));await assert.rejects(()=>q(`truncate ${t}`));}
await db.exec('reset role');
for(const t of ['pro_menu_history','pro_menu_actions']){await assert.rejects(()=>q(`update ${t} set actor_id=actor_id`),code('23514'));await assert.rejects(()=>q(`delete from ${t}`),code('23514'));}
for(const t of ['pro_menu_items','pro_menu_sections','pro_menu_settings']){await assert.rejects(()=>q(`delete from ${t}`),code('23514'));await assert.rejects(()=>q(`truncate ${t} cascade`),code('23514'));}
const grants=await q(`select table_name,privilege_type from information_schema.role_table_grants where table_name like 'pro_menu%' and grantee in('anon','authenticated','PUBLIC') union all
 select table_name,privilege_type from information_schema.role_table_grants where table_name like 'pro_menu%' and grantee='service_role' and privilege_type in('DELETE','TRUNCATE')`);
assert.deepEqual(grants,[],'service_role only, no DELETE');
assert.deepEqual(await q(`select relname from pg_class where relname like 'pro_menu%' and relkind='r' and not relrowsecurity`),[],'RLS on');
await db.exec('set role anon');await assert.rejects(()=>q(`select dir_place_menu_public('lugar-1')`),code('42501'));
await db.exec('reset role;set role authenticated');await assert.rejects(()=>q(`select pro_menu_mutate($1,null,'{}')`,[ana]),code('42501'));
await db.exec('reset role');
const history=(await q('select count(*)::int n from pro_menu_history where place_id=$1',[id(1)]))[0].n;assert.ok(history>=20);
await db.close();
console.log(`PASS pro menu: price SQL=TS on ${parity} cases (IVA 13 % + service 10 %, included or not, no service), zod mirrors, mock-only menu-from-photo normalisation (links stripped, tags mapped, unreadable price flagged), module applied 2×, only active managers of claimed restaurants edit, member role must allow menu.write (team module optional), CAS 40001, idempotent actionId (+ reuse 22023), exact keys, reorder full-list/stale 40001, archive rules, settings CAS, public reader (published only, drafts/unavailable/archived hidden, sold_out shown, final price breakdown, no ids), import record creates nothing, apply → drafts only (publish refused), review once, failed import cannot apply, immutable history/receipts/drafts (${history} history rows), no DELETE/TRUNCATE, RLS + service_role-only grants, no price_observations.`);

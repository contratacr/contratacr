// LOCAL PRO ONLY (place features round, 2026-11-17): in-memory PGlite verification of directory-brands-local.sql.
// Import from OSM brand/brand:wikidata (by source ref), name matching in the brand's section, staff assignments kept,
// public page (branches, weighted rating, merged redirect), staff merge/split (CAS, reason, log), brand claim with the
// claimant's own documents (no self-approval), brand owner info (CAS), idempotency, RLS/anon denial.
import assert from 'node:assert/strict';
import {setup,uuid,id,code,hint} from './directory-features-db-harness.mjs';

const {q,call,mk,denied,db}=await setup(['directory-brands-local.sql']);
const imp=id(0x99),admin=id(0xad),boss=id(0xb0),ana=id(0xa1);
await mk(1,'grocery',{name:'Palí Desamparados'});await mk(2,'grocery',{name:'Palí Heredia Centro',adminArea1:'Heredia'});await mk(3,'grocery',{name:'Pali Cartago',adminArea1:'Cartago'});
await mk(4,'restaurant',{name:'Palí Comidas'});await mk(5,'grocery',{name:'Maxi Palí Curridabat'});await mk(6,'cafe_bar',{name:'Musmanni San Pedro',attributes:{kind:'bakery'}});
await mk(7,'cafe_bar',{name:'Musmanni Tibás',attributes:{kind:'bakery'}});await mk(8,'grocery',{name:'Palí Escondido',publish:false});
const rows=[{ref:'node/1',brand:'Palí',wikidata:'Q1064887'},{ref:'node/2',brand:'Palí',wikidata:'Q1064887'},{ref:'node/5',brand:'Maxi Palí',wikidata:'Q3365858'},
 {ref:'node/6',brand:'Musmanni',wikidata:'Q19382082'},{ref:'node/7',brand:'Musmanni'},{ref:'node/404',brand:'Fantasma'}];
const iIn={actionId:uuid(),sourceId:'osm',rows};
const r=await call('dir_brand_import',imp,iIn);assert.deepEqual(r,{created:3,assigned:5,skipped:1});
assert.deepEqual(await call('dir_brand_import',imp,iIn),r,'idempotent import');
await assert.rejects(()=>call('dir_brand_import',imp,{actionId:uuid(),sourceId:'osm',rows:[{ref:'node/1',brand:'X',wikidata:'Q-1'}]}),code('22023'));
const m=await call('dir_brand_match_names',imp,{actionId:uuid()});assert.equal(m.assigned,2,'Pali Cartago + Palí Escondido (grocery); restaurant «Palí Comidas» untouched');
assert.equal((await q("select count(*)::int n from dir_place_brands where place_id=$1",[id(4)]))[0].n,0,'other section never matched');
const brand=async slug=>(await q('select dir_brand_public($1) b',[slug]))[0].b;
const pali=(await q("select * from dir_brands where wikidata='Q1064887'"))[0];assert.equal(pali.slug,'pali');
let page=await brand('pali');assert.equal(page.branchCount,3,'only published branches');assert.deepEqual(page.provinces.sort(),['Cartago','Heredia','San José']);
assert.deepEqual(page.branches.map(b=>b.province),['Cartago','Heredia','San José'],'ordered by province, then name');
assert.ok(!JSON.stringify(page).includes(pali.id),'no internal ids on the public page');
// weighted rating
await db.exec('reset role');await db.query("update dir_places set rating_avg=4,rating_count=3 where id=$1",[id(1)]);await db.query("update dir_places set rating_avg=2,rating_count=1 where id=$1",[id(2)]);await db.exec('set role service_role');
page=await brand('pali');assert.deepEqual(page.rating,{average:3.5,count:4});
assert.equal((await q("select dir_place_brand_public('lugar-1') b"))[0].b.slug,'pali');
assert.equal((await q("select dir_place_brand_public('lugar-4') b"))[0].b,null);

// split (staff) and importer never moves staff assignments back
const sIn={actionId:uuid(),brandId:pali.id,newBrandId:uuid(),name:'Palí Express',placeSlugs:['lugar-3'],reason:'Formato distinto',expectedRevision:pali.revision};
await assert.rejects(()=>call('dir_admin_brand_split',admin,{...sIn,expectedRevision:99}),code('40001'));
await assert.rejects(()=>call('dir_admin_brand_split',admin,{...sIn,reason:''}),code('22023'));
await assert.rejects(()=>call('dir_admin_brand_split',admin,{...sIn,placeSlugs:['lugar-6']}),hint('dir_brand_not_branch'));
const sp=await call('dir_admin_brand_split',admin,sIn);assert.equal(sp.moved,1);assert.deepEqual(await call('dir_admin_brand_split',admin,sIn),sp,'idempotent');
await call('dir_brand_import',imp,{actionId:uuid(),sourceId:'osm',rows:[{ref:'node/3',brand:'Palí',wikidata:'Q1064887'}]});
assert.equal((await q("select b.slug from dir_place_brands pb join dir_brands b on b.id=pb.brand_id where pb.place_id=$1",[id(3)]))[0].slug,sp.slug,'staff assignment kept');
// merge
const maxi=(await q("select * from dir_brands where wikidata='Q3365858'"))[0];
const mg=await call('dir_admin_brand_merge',admin,{actionId:uuid(),brandId:maxi.id,intoBrandId:pali.id,reason:'Misma cadena',expectedRevision:maxi.revision});assert.equal(mg.moved,1);
assert.deepEqual(await brand(maxi.slug),{mergedInto:'pali'},'merged brand points to the target');
await assert.rejects(()=>call('dir_admin_brand_merge',admin,{actionId:uuid(),brandId:maxi.id,intoBrandId:pali.id,reason:'Otra vez',expectedRevision:maxi.revision+1}),code('P0002'),'merged is final');
assert.deepEqual((await q("select kind,decision from dir_moderation_log order by id")).map(x=>x.kind+':'+x.decision),['brand:split','brand:merge']);

// brand claim with documents (dir_claim_uploads of the claimant for that claim id)
const cid=uuid(),path=`dir-claims/${cid}/legal_personhood-aaaa.pdf`;
await call('dir_claim_upload_record',boss,{claimId:cid,path,kind:'legal_personhood',mime:'application/pdf',size:1000,sha256:'a'.repeat(64)});
const open=(actor,over={})=>call('dir_brand_claim_open',actor,{actionId:uuid(),claimId:cid,brandSlug:'pali',documents:[{kind:'legal_personhood',path}],...over});
await assert.rejects(()=>open(ana),hint('dir_claim_evidence'),'someone else\'s document');
await assert.rejects(()=>open(null),hint('dir_qa_login'));
assert.equal((await open(boss)).status,'open');
await assert.rejects(()=>open(ana,{claimId:uuid(),documents:[{kind:'legal_personhood',path}]}),hint('dir_claim_evidence'));
assert.equal((await brand('pali')).claimPending,true);
await assert.rejects(()=>call('dir_admin_brand_claim_decide',boss,{actionId:uuid(),claimId:cid,decision:'approve'}),hint('dir_claim_self_review'),'no self-approval');
await assert.rejects(()=>call('dir_admin_brand_claim_decide',admin,{actionId:uuid(),claimId:cid,decision:'reject'}),code('22023'),'reason to reject');
assert.equal((await call('dir_admin_brand_claim_decide',admin,{actionId:uuid(),claimId:cid,decision:'approve'})).status,'approved');
await assert.rejects(()=>call('dir_admin_brand_claim_decide',admin,{actionId:uuid(),claimId:cid,decision:'approve'}),hint('dir_claim_closed'));
const mine=(await q('select dir_brand_manager_read($1) x',[boss]))[0].x;assert.equal(mine[0].slug,'pali');
const info=(over={})=>call('dir_brand_info_mutate',boss,{actionId:uuid(),brandId:pali.id,revision:mine[0].revision,website:'https://pali.example.test',descriptionEs:'Supermercados de descuento.',descriptionEn:'Discount supermarkets.',...over});
await assert.rejects(()=>call('dir_brand_info_mutate',ana,{actionId:uuid(),brandId:pali.id,revision:mine[0].revision,website:null}),hint('dir_tool_not_manager'));
await assert.rejects(()=>info({website:'http://inseguro.test'}),code('22023'));await assert.rejects(()=>info({descriptionEs:'ver www.x.cr'}),code('22023'));
await assert.rejects(()=>info({revision:1}),code('40001'));
assert.equal((await info()).website,'https://pali.example.test');
page=await brand('pali');assert.deepEqual([page.claimed,page.descriptionEn,page.branchCount],[true,'Discount supermarkets.',3]);
const paliRev=(await q('select revision from dir_brands where id=$1',[pali.id]))[0].revision;
await assert.rejects(()=>call('dir_admin_brand_merge',admin,{actionId:uuid(),brandId:pali.id,intoBrandId:sp.newBrandId,reason:'Prueba',expectedRevision:paliRev}),hint('dir_brand_claimed'));
// hide a generic «brand» (not a chain): no page, no branch link, importer and name matching skip it
await mk(9,'fuel',{name:'Servicentro Uno'});await mk(10,'fuel',{name:'Servicentro Dos'});
await call('dir_brand_import',imp,{actionId:uuid(),sourceId:'osm',rows:[{ref:'node/9',brand:'Servicentro'},{ref:'node/10',brand:'Servicentro'}]});
const gen=(await q("select * from dir_brands where slug='servicentro'"))[0];assert.equal((await brand('servicentro')).branchCount,2);
await assert.rejects(()=>call('dir_admin_brand_hide',admin,{actionId:uuid(),brandId:gen.id,reason:'',expectedRevision:gen.revision}),code('22023'));
await assert.rejects(()=>call('dir_admin_brand_hide',admin,{actionId:uuid(),brandId:pali.id,reason:'Prueba',expectedRevision:paliRev}),hint('dir_brand_claimed'),'claimed brands stay');
assert.equal((await call('dir_admin_brand_hide',admin,{actionId:uuid(),brandId:gen.id,reason:'Palabra genérica, no es una cadena',expectedRevision:gen.revision})).status,'hidden');
assert.equal(await brand('servicentro'),null,'no page');assert.equal((await q("select dir_place_brand_public('lugar-9') b"))[0].b,null,'no branch link');
assert.equal((await call('dir_brand_import',imp,{actionId:uuid(),sourceId:'osm',rows:[{ref:'node/9',brand:'Servicentro'}]})).skipped,1,'importer skips hidden brands');
// 2026-11-17 name groupings (via 'name' + section, chains without OSM brand tags): source 'name', same section only,
// never over 'osm'/'staff' assignments, never into a hidden brand or a brand of another section.
await mk(11,'pharmacy',{name:'Farmacia Fischel Nicoya'});await mk(12,'pharmacy',{name:'Fischel'});await mk(13,'pharmacy',{name:'Farmacias Fischel Cartago'});
await mk(14,'restaurant',{name:'Fischel Comidas'});await mk(15,'grocery',{name:'Musmanni Súper'});
const fRows=[11,12,13,14].map(n=>({ref:`node/${n}`,brand:'Farmacia Fischel',via:'name',vertical:'pharmacy'}));
await assert.rejects(()=>call('dir_brand_import',imp,{actionId:uuid(),sourceId:'osm',rows:[{ref:'node/11',brand:'Farmacia Fischel',via:'name'}]}),code('22023'),'name rows need a section');
await assert.rejects(()=>call('dir_brand_import',imp,{actionId:uuid(),sourceId:'osm',rows:[{ref:'node/11',brand:'Farmacia Fischel',via:'guess',vertical:'pharmacy'}]}),code('22023'));
await assert.rejects(()=>call('dir_brand_import',imp,{actionId:uuid(),sourceId:'osm',rows:[{ref:'node/11',brand:'Farmacia Fischel',vertical:'pharmacy'}]}),code('22023'),'osm rows carry no section');
assert.deepEqual(await call('dir_brand_import',imp,{actionId:uuid(),sourceId:'osm',rows:fRows}),{created:1,assigned:3,skipped:1},'restaurant «Fischel Comidas» is not in the section');
const srcOf=async n=>(await q("select b.slug,pb.source from dir_place_brands pb join dir_brands b on b.id=pb.brand_id where pb.place_id=$1",[id(n)]))[0];
assert.deepEqual(await srcOf(11),{slug:'farmacia-fischel',source:'name'});assert.equal(await srcOf(14),undefined);
assert.equal((await brand('farmacia-fischel')).branchCount,3);
// staff override kept: a split branch (source staff) and an OSM-tagged branch are never moved by a name rerun
const fis=(await q("select * from dir_brands where slug='farmacia-fischel'"))[0];
const fsp=await call('dir_admin_brand_split',admin,{actionId:uuid(),brandId:fis.id,newBrandId:uuid(),name:'Fischel Express',placeSlugs:['lugar-13'],reason:'Formato distinto',expectedRevision:fis.revision});
assert.equal((await call('dir_brand_import',imp,{actionId:uuid(),sourceId:'osm',rows:fRows})).assigned,0,'rerun: nothing moves');
assert.deepEqual(await srcOf(13),{slug:fsp.slug,source:'staff'},'staff assignment kept');
await call('dir_brand_import',imp,{actionId:uuid(),sourceId:'osm',rows:[{ref:'node/1',brand:'Otra Cadena',via:'name',vertical:'grocery'}]});
assert.deepEqual(await srcOf(1),{slug:'pali',source:'osm'},'OSM tag beats a name grouping');
assert.equal((await call('dir_brand_import',imp,{actionId:uuid(),sourceId:'osm',rows:[{ref:'node/15',brand:'Musmanni',via:'name',vertical:'grocery'}]})).skipped,1,'never into a brand of another section');
assert.equal(await srcOf(15),undefined);
assert.deepEqual(await call('dir_brand_import',imp,{actionId:uuid(),sourceId:'osm',rows:[{ref:'node/8',brand:'Cadena Nueva',via:'name',vertical:'grocery'}]}),{created:0,assigned:0,skipped:1});
assert.deepEqual(await srcOf(8),{slug:'pali',source:'name'},'a name grouping never moves an existing name assignment');
await mk(16,'fuel',{name:'Servicentro Tres'});
assert.equal((await call('dir_brand_import',imp,{actionId:uuid(),sourceId:'osm',rows:[{ref:'node/16',brand:'Servicentro',via:'name',vertical:'fuel'}]})).skipped,1,'never into a hidden brand');assert.equal(await srcOf(16),undefined);
await db.exec('reset role');
await assert.rejects(()=>db.query('delete from dir_brands'),code('23514'));await assert.rejects(()=>db.query('delete from dir_place_brands'),code('23514'));
await assert.rejects(()=>db.query("update dir_brand_history set action='info'"),code('23514'));
await db.exec('set role service_role');
await denied(['dir_brands','dir_place_brands','dir_brand_history','dir_brand_claims','dir_brand_managers'],["dir_brand_public('pali')","dir_brand_import(null,'{}'::jsonb)","dir_admin_brand_merge(null,'{}'::jsonb)"]);
console.log('PASS: brands (OSM import + name matching, name groupings by section (staff/OSM kept), staff split/merge with CAS + log, public page + weighted rating, staff-reviewed claim with own documents, owner info, RLS/anon denial)');

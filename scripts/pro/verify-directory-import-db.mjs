// LOCAL PRO ONLY (multivertical F2): in-memory PGlite verification of docs/pro/sql/directory-import-local.sql
// together with scripts/directory/stage-import.mjs (offline parser) and the synthetic fixture. Never touches a
// shared database and never fetches third-party data.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {buildPayloads,fillAdminAreas,loadAdminAreas,parseImport,verticalFromTags} from '../directory/stage-import.mjs';
const fixture='scripts/directory/fixtures/osm-sample.geojson',text=await readFile(fixture,'utf8');

// ---- offline parser
const parsed=parseImport(text);assert.equal(parsed.rows.length,9);assert.equal(parsed.skipped,1,'bench has no vertical');
const first=parsed.rows[0];
assert.deepEqual(Object.keys(first).sort(),['addressLine','adminArea1','lat','lng','locality','locationPrecision','name','phone','ref','vertical']);
assert.equal(first.addressLine,'Avenida Central 10');assert.equal(first.phone,'+506 2200 0001');
assert.equal(JSON.stringify(parsed).includes('no-copiar@example.com'),false);assert.equal(JSON.stringify(parsed).includes('Persona Privada'),false);assert.equal(JSON.stringify(parsed).includes('Mo-Fr'),false);
assert.equal(parsed.rows.find(r=>r.ref==='way/9000000004').locationPrecision,'street');assert.equal(parsed.rows.find(r=>r.ref==='node/9000000005').phone,undefined,'invalid phone dropped');
assert.equal(parseImport(text,{allowPhone:false}).rows.some(r=>'phone' in r),false);
const overpass=parseImport(JSON.stringify({elements:[{type:'node',id:1,lat:9.9,lon:-84,tags:{amenity:'fuel',name:'Bomba La Prueba'}},{type:'way',id:2,center:{lat:9.91,lon:-84.01},tags:{office:'estate_agent',name:'Casas'}},{type:'node',id:3,lat:9.9,lon:-84,tags:{amenity:'school',name:'Escuela'}}]}));
assert.deepEqual(overpass.rows.map(r=>[r.ref,r.vertical,r.locationPrecision]),[['node/1','fuel','exact'],['way/2','real_estate','street']]);assert.equal(overpass.skipped,1);
// --admin-areas: province/canton by point-in-polygon over OSM boundary relations (synthetic squares, holes via inner).
{const sq=(a,b,c,d)=>[{lat:a,lon:b},{lat:a,lon:d},{lat:c,lon:d},{lat:c,lon:b},{lat:a,lon:b}];
 const areas=loadAdminAreas(JSON.stringify({elements:[{type:'relation',id:1,tags:{admin_level:'4',name:'Provincia de Prueba'},members:[{type:'way',role:'outer',geometry:sq(9,-85,10,-84)}]},
  {type:'relation',id:2,tags:{admin_level:'6',name:'Cantón Uno','name:es':'Ciudad de Uno'},members:[{type:'way',role:'outer',geometry:sq(9,-85,9.5,-84.5)},{type:'way',role:'inner',geometry:sq(9.1,-84.9,9.2,-84.8)}]}]}));
 const rows=[{lat:9.3,lng:-84.7,adminArea1:'Prueba sin tilde'},{lat:9.15,lng:-84.85},{lat:11,lng:-84.5,adminArea1:'Etiqueta'}];
 assert.equal(fillAdminAreas(rows,areas),2);
 assert.deepEqual(rows.map(r=>[r.adminArea1,r.adminArea2]),[['Prueba','Cantón Uno'],['Prueba',undefined],['Etiqueta',undefined]]);}
// Generic names that only repeat the category are treated as unnamed (real OSM data has many «Farmacia», «Soda»).
assert.equal(parseImport(JSON.stringify({elements:[{type:'node',id:7,lat:9.9,lon:-84,tags:{amenity:'pharmacy',name:'FARMACIA'}},{type:'node',id:8,lat:9.9,lon:-84,tags:{amenity:'restaurant',name:'Soda'}}]})).skipped,2);
assert.equal(verticalFromTags({shop:'car'}),'vehicle_dealer');assert.equal(verticalFromTags({healthcare:'pharmacy'}),'pharmacy');
assert.throws(()=>parseImport('{"foo":1}'));assert.throws(()=>buildPayloads(text,'OSM!',fixture));
const big=JSON.stringify({elements:Array.from({length:5001},(_,i)=>({type:'node',id:i+1,lat:9.9,lon:-84,tags:{amenity:'cafe',name:'Café '+i}}))});
assert.deepEqual(buildPayloads(big,'osm','big.json').payloads.map(p=>[p.part,p.rows.length]),[[1,5000],[2,1]]);
const cli=JSON.parse(execFileSync(process.execPath,['scripts/directory/stage-import.mjs',fixture,'osm','--no-phone'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}));
assert.equal(cli.length,1);assert.equal(cli[0].rows.length,9);assert.equal(cli[0].rows.some(r=>r.phone),false);assert.match(cli[0].fileSha256,/^[a-f0-9]{64}$/);
assert.throws(()=>execFileSync(process.execPath,['scripts/directory/stage-import.mjs','https://overpass-api.de/api/interpreter','osm'],{stdio:'ignore'}));

// ---- database
const {PGlite}=await import(process.env.PRO_PGLITE_MODULE||'@electric-sql/pglite'),db=new PGlite();
const staff='00000000-0000-4000-8000-0000000000aa';
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;`);
const core=await readFile('docs/pro/sql/directory-core-local.sql','utf8'),sql=await readFile('docs/pro/sql/directory-import-local.sql','utf8');
await db.exec(core);await db.exec(sql);await db.exec(core);await db.exec(sql);
await db.exec('set role service_role');
const q=async(t,p=[])=>(await db.query(t,p)).rows,code=c=>e=>{assert.equal(e.code,c,e.message);return true;};
const call=async(fn,input,actor=staff)=>(await q(`select ${fn}($1,$2) r`,[actor,input]))[0].r;
const km=(await q('select dir_haversine_km(9.933,-84.08,9.9332,-84.0803) d'))[0].d;assert.ok(km>0.035&&km<0.04,String(km));
assert.ok(Math.abs((await q('select dir_haversine_km(9.9281,-84.0907,10.0163,-84.2116) d'))[0].d-16.4)<0.5,'San José–Alajuela ≈16 km');

// an existing place near row 9 (same name, 40 m) created by staff before the import
await call('dir_place_mutate',{action:'create',actionId:crypto.randomUUID(),placeId:crypto.randomUUID(),revision:0,place:{slug:'soda-la-prueba-oeste',vertical:'restaurant',name:'SODA LA PRUEBA',lat:9.9333,lng:-84.0903}});

const {payloads}=buildPayloads(text,'osm','osm-sample.geojson'),payload=payloads[0];
const staged=await call('dir_import_stage',payload);
assert.deepEqual(staged.counts,{staged:4,accepted:0,rejected:2,duplicate:3});
assert.deepEqual(staged.reasons,{invalid_name:1,outside_country:1,near_same_name:2,same_ref_in_batch:1});
assert.deepEqual(await call('dir_import_stage',payload),staged,'same actionId → same answer');
await assert.rejects(()=>call('dir_import_stage',{...payload,fileName:'otro.geojson'}),code('22023'));
await assert.rejects(()=>call('dir_import_stage',{...payload,actionId:crypto.randomUUID(),batchId:crypto.randomUUID()}),code('23505'),'same file part twice');
for(const bad of [{...payload,sourceId:'contratacr'},{...payload,sourceId:'nope'},{...payload,rows:[]},{...payload,fileSha256:'xyz'},{...payload,rows:[{...payload.rows[0],ref:'node 1; drop'}]},{...payload,rows:[{...payload.rows[0],locationPrecision:'mars'}]},{...payload,rows:['texto']}])
 await assert.rejects(()=>call('dir_import_stage',{...bad,actionId:crypto.randomUUID(),batchId:crypto.randomUUID(),fileSha256:bad.fileSha256==='xyz'?'xyz':'b'.repeat(64)}),e=>['22023','23514'].includes(e.code),JSON.stringify(bad).slice(0,60));
const rows=await q('select row_no,source_ref,status,reason,phone,duplicate_of_row,duplicate_of_place is not null as dp from dir_import_rows order by row_no');
assert.deepEqual(rows.map(r=>[r.row_no,r.status,r.reason]),[[1,'staged',null],[2,'duplicate','near_same_name'],[3,'staged',null],[4,'staged',null],[5,'staged',null],[6,'rejected','outside_country'],[7,'rejected','invalid_name'],[8,'duplicate','same_ref_in_batch'],[9,'duplicate','near_same_name']]);
assert.equal(rows[1].duplicate_of_row,1);assert.equal(rows[7].duplicate_of_row,1);assert.equal(rows[8].dp,true);assert.equal(rows[0].phone,'+506 2200 0001');
const cols=(await q("select column_name from information_schema.columns where table_name='dir_import_rows'")).map(r=>r.column_name);assert.equal(cols.some(c=>/tag|email|raw|hours/.test(c)),false,'no raw tags stored');

// manual review + commit (published) + idempotency + CAS on batch state
const rej=await call('dir_import_reject',{actionId:crypto.randomUUID(),batchId:payload.batchId,rowNo:3});assert.equal(rej.counts.rejected,3);
await assert.rejects(()=>call('dir_import_reject',{actionId:crypto.randomUUID(),batchId:payload.batchId,rowNo:3}),code('40001'));
const commit={actionId:crypto.randomUUID(),batchId:payload.batchId,publish:true},done=await call('dir_import_commit',commit);
assert.deepEqual(done.counts,{staged:0,accepted:3,rejected:3,duplicate:3});assert.equal(done.status,'committed');
assert.deepEqual(await call('dir_import_commit',commit),done);
await assert.rejects(()=>call('dir_import_commit',{...commit,actionId:crypto.randomUUID()}),code('40001'));
await assert.rejects(()=>call('dir_import_commit',{actionId:crypto.randomUUID(),batchId:crypto.randomUUID()}),code('P0002'));
const places=await q("select p.slug,p.vertical_id,p.status,p.verification_level,p.phone,p.location_precision from dir_places p join dir_import_rows r on r.place_id=p.id order by r.row_no");
assert.equal(places.length,3);assert.ok(places.every(p=>p.status==='published'&&p.verification_level==='imported'));assert.match(places[0].slug,/^soda-la-prueba-[a-f0-9]{6}$/);
assert.equal(places[1].location_precision,'street');
const restaurant=(await q('select dir_place_public($1) p',[places[0].slug]))[0].p;
assert.equal(restaurant.phone,'+506 2200 0001');assert.equal(restaurant.sources.length,1);assert.equal(restaurant.sources[0].license,'ODbL 1.0');assert.match(restaurant.sources[0].attribution,/OpenStreetMap/);
assert.equal((await q('select dir_place_public($1) p',[places[2].slug]))[0].p.verificationLevel,'imported','imported pharmacy is public (owner decision 2026-11-17)');
assert.equal((await q("select count(distinct field)::int n from dir_field_provenance f join dir_import_rows r on r.place_id=f.place_id where r.row_no=1 and f.source_id='osm' and f.source_ref='node/9000000001'"))[0].n,7,'name, vertical, address, admin areas, location, phone, status');
assert.equal((await q('select count(*)::int n from dir_place_history h join dir_import_rows r on r.place_id=h.place_id'))[0].n,6,'create + publish per place');

// re-import of the same data (new file) → already imported; a removal request blocks it forever
const again=buildPayloads(text.replace('Synthetic','Synthetic v2'),'osm','osm-sample-2.geojson').payloads[0];
const st2=await call('dir_import_stage',again);assert.equal(st2.counts.staged,1,'only row 3, manually rejected before, is new');assert.equal(st2.reasons.already_imported,4);assert.equal(st2.reasons.near_same_name,2);
const report={reportId:crypto.randomUUID(),kind:'removal_request',message:'Pido retirar esta ficha importada.'};
await q('select dir_report_create(null,$1,$2)',[places[0].slug,report]);
const rev=(await q('select revision from dir_places where slug=$1',[places[0].slug]))[0].revision;
assert.equal((await call('dir_report_resolve',{actionId:crypto.randomUUID(),reportId:report.reportId,decision:'accept',revision:rev})).place.status,'removed');
assert.equal((await q('select dir_place_public($1) p',[places[0].slug]))[0].p,null);
const third=buildPayloads(text.replace('Synthetic','Synthetic v3'),'osm','osm-sample-3.geojson').payloads[0],st3=await call('dir_import_stage',third);
assert.equal(st3.reasons.removed_by_request,3,'same ref (rows 1 and 8) and same name <75 m of the removed place (row 2)');assert.equal(st3.reasons.already_imported,2);
// a place created between stage and commit is caught by the commit re-check
const commit2=await call('dir_import_commit',{actionId:crypto.randomUUID(),batchId:again.batchId});assert.equal(commit2.counts.accepted,1);
const c3=await call('dir_import_commit',{actionId:crypto.randomUUID(),batchId:third.batchId});assert.equal(c3.counts.accepted,0);assert.equal(c3.reasons.already_imported,3);assert.equal(c3.reasons.removed_by_request,3);

// 2026-11-17 sections: rows carry `attributes` ({kind, …}); valid ones reach the place (provenance 'attributes'),
// invalid ones (unknown key/kind, wrong vertical) are staged without attributes, never rejected.
{const ov=JSON.stringify({elements:[
  {type:'node',id:9001,lat:9.95,lon:-84.12,tags:{amenity:'cafe',name:'Café de Ensayo'}},
  {type:'node',id:9002,lat:9.96,lon:-84.12,tags:{amenity:'bank',atm:'yes',name:'Banco de Ensayo',operator:'Banco de Ensayo'}},
  {type:'node',id:9003,lat:9.97,lon:-84.12,tags:{amenity:'doctors',name:'Dr. Persona Privada'}},
  {type:'node',id:9004,lat:9.98,lon:-84.12,tags:{amenity:'nightclub',name:'Club Nocturno'}}]});
 const pp=buildPayloads(ov,'osm','new-sections.json').payloads[0];
 assert.deepEqual(pp.rows.map(r=>[r.vertical,r.attributes]),[['cafe_bar',{kind:'cafe'}],['banking',{kind:'bank',atm:true,operator:'Banco de Ensayo'}]],'person name and adult venue skipped');
 pp.rows.push({ref:'node/9005',vertical:'lodging',name:'Hotel con estrellas',lat:9.99,lng:-84.12,attributes:{kind:'hotel',stars:5}});
 const st=await call('dir_import_stage',pp);assert.equal(st.counts.staged,3);
 assert.deepEqual((await q("select source_ref,attributes from dir_import_rows where batch_id=$1 order by row_no",[pp.batchId])).map(r=>r.attributes),
  [{kind:'cafe'},{kind:'bank',atm:true,operator:'Banco de Ensayo'},null],'invalid attributes (stars) dropped');
 await call('dir_import_commit',{actionId:crypto.randomUUID(),batchId:pp.batchId,publish:true});
 const got=await q("select vertical_id,attributes,(select count(*)::int from dir_field_provenance f where f.place_id=p.id and f.field='attributes') prov from dir_places p where name in('Café de Ensayo','Banco de Ensayo','Hotel con estrellas') order by name");
 assert.deepEqual(got.map(r=>[r.vertical_id,r.attributes,r.prov]),[['banking',{kind:'bank',atm:true,operator:'Banco de Ensayo'},1],['cafe_bar',{kind:'cafe'},1],['lodging',{},0]]);}

// immutability, grants and RLS
await assert.rejects(()=>db.exec('delete from dir_import_rows'),code('42501'));await assert.rejects(()=>db.exec('delete from dir_import_batches'),code('42501'));
await db.exec('reset role');await assert.rejects(()=>db.exec('truncate dir_import_rows'),code('23514'));
for(const role of ['anon','authenticated']){
 await db.exec(`set role ${role}`);
 for(const t of ['dir_import_rows','dir_import_batches'])await assert.rejects(()=>db.exec(`select * from ${t}`),code('42501'));
 await assert.rejects(()=>call('dir_import_stage',{...payload,actionId:crypto.randomUUID()}),code('42501'));
 await assert.rejects(()=>call('dir_import_commit',commit),code('42501'));
 await assert.rejects(()=>q('select dir_haversine_km(1,1,1,1)'),code('42501'));
 await db.exec('reset role');
}
assert.equal((await q("select count(*)::int n from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'dir\\_%' and (p.prosecdef or not exists(select 1 from unnest(coalesce(p.proconfig,'{}')) c where c like 'search_path=%'))"))[0].n,0);
const snap=await q('select batch_id,row_no,status,reason,place_id from dir_import_rows order by batch_id,row_no');await db.exec(core);await db.exec(sql);assert.deepEqual(await q('select batch_id,row_no,status,reason,place_id from dir_import_rows order by batch_id,row_no'),snap);
await db.close();
console.log('PASS directory import: 2026-11-17 sections (kind attributes staged+committed with provenance, invalid attributes dropped, person names/adult venues skipped), offline parser (GeoJSON+Overpass, only name/vertical/address/coords/phone, --no-phone, 5000-row parts, URLs refused), modules applied twice + reinstall, haversine, staged/accepted/rejected/duplicate (invalid name, outside country, same ref, same name <75 m vs batch and vs places), idempotent stage/reject/commit, batch CAS 40001, imported places with OSM ODbL attribution and per-field provenance, re-import → already_imported, removal request → removed_by_request forever, no DELETE grants, TRUNCATE blocked, RLS/grants for anon/authenticated/service_role.');

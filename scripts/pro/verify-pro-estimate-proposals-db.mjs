// LOCAL PRO ONLY (Ronda F2-B, 2026-11-19): disposable in-memory PGlite verification of estimate-proposals-local.sql
// (row 39). Installs the whole ordered local manifest (same foundation stubs as verify-pro-cost-codes-db.mjs), then
// checks the proposal design (CAS, receipts, text validation, eligible photos from company files only, limits, order),
// the explicit snapshot per open shared version, the customer read without storage paths, the photo audience, frozen
// closed versions, immutability, RLS/grants and an idempotent reapply. Reads are parsed with src/lib/pro/estimate-proposals.ts.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {localSqlManifest,localSqlDependencies} from './local-sql-manifest.mjs';
import {registerHooks} from 'node:module';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const libRoot=new URL('../../src/lib/',import.meta.url).href;
registerHooks({resolve(s,c,n){return n(c.parentURL?.startsWith(libRoot)&&s.startsWith('.')&&!/\.[a-z]+$/i.test(s)?s+'.ts':s,c);},load(u,c,n){return u.startsWith(libRoot)&&u.endsWith('.ts')?{format:'module',source:ts.transpileModule(readFileSync(new URL(u),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText,shortCircuit:true}:n(u,c);}});
const schemas=await import('../../src/lib/pro/estimate-proposals.ts');
const root=new URL('../../',import.meta.url),db=new PGlite();
const owner='00000000-0000-4000-8000-000000000001',rival='00000000-0000-4000-8000-000000000002',customer='00000000-0000-4000-8000-000000000003',stranger='00000000-0000-4000-8000-000000000004';
const code=c=>e=>{assert.equal(e.code,c,`${c} expected, got ${e.code}: ${e.message}`);return true;};
const foundation=await readFile(new URL('scripts/pro/verify-direct-project-quotes-db.mjs',root),'utf8');
const begin=foundation.indexOf('await db.exec(`')+'await db.exec(`'.length,end=foundation.indexOf('`);',begin);
assert.ok(begin>14&&end>begin);const ddl=foundation.slice(begin,end);assert.ok(!ddl.includes('${'));
let checks=0;const pass=name=>{checks++;console.log('PASS '+name);};
try{
 await db.exec(ddl);
 await db.exec(`create table auth.users(id uuid primary key);create function public.uuid_generate_v4() returns uuid language sql as $$select gen_random_uuid()$$;
 create function auth.role() returns text language sql as $$select current_user::text$$;
 create table projects(id uuid primary key,client_id uuid,title text,status text,allow_direct_contact boolean);
 create schema cron;create table cron.job(jobname text primary key,schedule text,command text);
 create function cron.schedule(p_name text,p_schedule text,p_command text) returns bigint language plpgsql as $$begin insert into cron.job values(p_name,p_schedule,p_command) on conflict(jobname) do update set schedule=excluded.schedule,command=excluded.command;return 1;end$$;
 create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text);alter table storage.objects enable row level security;
 insert into profiles(id,full_name,role,is_disabled,is_provider) values('${owner}','Dueña Propuesta','professional',false,true),('${rival}','Otra Empresa','professional',false,true),('${customer}','Cliente Cuenta','client',false,false),('${stranger}','Cuenta Ajena','client',false,false);`);
 const notifications=await readFile(new URL('supabase/migrations/002_sprint2.sql',root),'utf8');
 await db.exec(notifications.slice(notifications.indexOf('CREATE TABLE IF NOT EXISTS public.notifications'),notifications.indexOf('-- SAVED PROFESSIONALS')));
 const emptyDoc=clientId=>({version:1,clients:[{id:clientId,name:'Cliente embudo',email:'',phone:'',notes:'',archived:false}],products:[],movements:[],work:[],availability:[],quotes:[],quoteLinks:[],social:[]});
 let moduleSql='';
 const needed=new Set(['estimate-proposals-local.sql']);for(let grew=true;grew;){grew=false;for(const [from,to] of localSqlDependencies)if(needed.has(to)&&!needed.has(from)){needed.add(from);grew=true;}}
 for(const step of localSqlManifest){
  if(step.ifMissing&&(await db.query('select to_regclass($1) is not null present',[step.ifMissing])).rows[0].present)continue;
  let text=await readFile(new URL('docs/pro/sql/'+step.file,root),'utf8');
  if(step.file==='identity-lookup-maintenance-local.sql')text=text.replace('create extension if not exists pg_cron;','');
  if(step.file==='estimate-proposals-local.sql')moduleSql=text;
  try{await db.exec(text);}catch(error){if(needed.has(step.file))throw new Error('Manifest SQL failed: '+step.file,{cause:error});await db.exec('rollback');console.log('SKIP unrelated module that does not install here: '+step.file);}
  if(step.file==='memberships-draft.sql')for(const id of [owner,rival])await db.query('select pro_save_workspace($1,$2,0)',[id,emptyDoc('pipe-client')]);
 }
 assert.ok(moduleSql,'sales-pipeline-forecast-local.sql must be in the manifest');
 for(const [id,profile] of [[owner,'30000000-0000-4000-8000-000000000001'],[rival,'30000000-0000-4000-8000-000000000002']]){
  await db.query('insert into professionals(id,profile_id,business_name,slug,is_banned) values($1,$2,$3,$4,false)',[profile,id,'Empresa '+id.slice(-1),'pipe-'+id.slice(-1)]);
  await db.query("insert into pro_memberships(user_id,status) values($1,'active')",[id]);
 }
 const one=async(sql,args)=>(await db.query(sql,args)).rows[0];
 const design=async(eid,actor=owner)=>schemas.proposalDesignSchema.parse((await one('select pro_estimate_proposal_read($1,$2) v',[actor,{view:'design',estimateId:eid}])).v);
 const files=async(eid,query='',actor=owner)=>schemas.proposalFilesSchema.parse((await one('select pro_estimate_proposal_read($1,$2) v',[actor,{view:'files',estimateId:eid,query}])).v);
 const write=async(input,actor=owner)=>{const v=(await one('select pro_estimate_proposal_mutate($1,$2) v',[actor,input])).v;schemas.proposalResultSchema.parse(v);return v;};
 const pubRead=async(pid,actor)=>schemas.proposalPublicationSchema.parse((await one('select pro_estimate_proposal_publication_read($1,$2) v',[actor,pid])).v);
 const image=async(pid,img,actor)=>{const v=(await one('select pro_estimate_proposal_image($1,$2,$3) v',[actor,pid,img])).v;if(v)schemas.proposalFileRefSchema.parse(v);return v;};
 // Fixture: an estimate with three lines (two in a section), a shared version to the customer and photos in the files.
 const eid=crypto.randomUUID(),l1=crypto.randomUUID(),l2=crypto.randomUUID(),l3=crypto.randomUUID(),pid=crypto.randomUUID(),pid2=crypto.randomUUID();
 await db.query("insert into pro_private_estimates(owner_id,id,client_id,client_snapshot,source,issuer,title,notes,currency,subtotal_cents,discount_cents,tax_cents,total_cents,revision) values($1,$2,'pipe-client','{}',null,'{}','Cocina','', 'CRC',0,0,0,0,1)",[owner,eid]);
 for(const [id,pos,group,description] of [[l1,1,'Muebles','Gabinetes'],[l2,2,'Muebles','Sobre de cuarzo'],[l3,3,null,'Instalación']])
  await db.query('insert into pro_private_estimate_items(owner_id,estimate_id,id,position,content) values($1,$2,$3,$4,$5)',[owner,eid,id,pos,{description,group,qtyMilli:1000,unitPriceCents:100000}]);
 const pubContent={title:'Cocina',currency:'CRC',totalCents:300000,lines:[{id:l1,group:'Muebles',description:'Gabinetes'},{id:l2,group:'Muebles',description:'Sobre de cuarzo'},{id:l3,description:'Instalación'}]};
 for(const [id,version,status] of [[pid,1,'shared'],[pid2,2,'accepted']]){
  await db.query("insert into pro_private_estimate_publications(owner_id,id,estimate_id,client_id,version,estimate_revision,content,content_hash) values($1,$2,$3,'pipe-client',$4,1,$5,$6)",[owner,id,eid,version,pubContent,'a'.repeat(64)]);
  await db.query('insert into pro_private_estimate_publication_states(publication_id,revision,status,recipient_id) values($1,1,$2,$3)',[id,status,customer]);
 }
 const photo=async(actor,name,mime='image/jpeg',ready=true,archived=false)=>{const id=crypto.randomUUID();await db.query('insert into pro_company_files(owner_id,id,name,mime_type,size_bytes,sha256,object_path,ready,archived) values($1,$2,$3,$4,1234,$5,$6,$7,$8)',[actor,id,name,mime,'b'.repeat(64),actor+'/'+id+(mime==='image/jpeg'?'.jpg':'.pdf'),ready,archived]);return id;};
 const cover=await photo(owner,'portada.jpg'),cabinet=await photo(owner,'gabinete.jpg'),pdf=await photo(owner,'plano.pdf','application/pdf'),hidden=await photo(owner,'vieja.jpg','image/jpeg',true,true),notReady=await photo(owner,'subiendo.jpg','image/jpeg',false),foreign=await photo(rival,'ajena.jpg');

 // ---- Design: CAS, receipts, validation ----
 let d=await design(eid);assert.equal(d.revision,0);assert.deepEqual(d.lines.map(x=>x.group),['Muebles','Muebles',null]);assert.deepEqual(d.publications.map(p=>[p.version,p.open,p.appliedSeq]),[[2,false,null],[1,true,null]]);
 assert.deepEqual((await files(eid)).items.map(x=>x.fileId).sort(),[cover,cabinet].sort(),'only ready, active JPEG files of the owner');
 assert.deepEqual((await files(eid,'GABI')).items.map(x=>x.fileId),[cabinet]);
 const save={action:'save',actionId:crypto.randomUUID(),estimateId:eid,revision:0,coverTitle:' Su nueva cocina ',intro:'Le presentamos la propuesta.\nCon dos secciones.',closing:'Gracias por su confianza.'};
 const s1=await write(save);assert.equal(s1.revision,1);assert.equal(s1.proposal.coverTitle,'Su nueva cocina');
 assert.deepEqual(await write(save),{...s1,replayed:true});await assert.rejects(()=>write({...save,intro:'x'}),code('22023'),'reused action id');
 await assert.rejects(()=>write({...save,actionId:crypto.randomUUID()}),code('40001'),'stale revision');
 for(const patch of [{coverTitle:'x'.repeat(121)},{intro:'x'.repeat(4001)},{closing:'x\u0001'},{coverTitle:'a\u0007'},{extra:1}])await assert.rejects(()=>write({...save,actionId:crypto.randomUUID(),revision:1,...patch}),code('22023'),JSON.stringify(patch).slice(0,40));
 const add=(rev,target,targetKey,fileId,extra={})=>write({action:'add_image',actionId:crypto.randomUUID(),estimateId:eid,revision:rev,imageId:crypto.randomUUID(),target,targetKey,source:'company',fileId,caption:'',...extra});
 const c1=await add(1,'cover','',cover,{caption:'Vista final'});assert.equal(c1.revision,2);
 await assert.rejects(()=>add(2,'cover','',cabinet),code('22023'),'one cover photo');
 for(const f of [pdf,hidden,notReady,foreign,crypto.randomUUID()])await assert.rejects(()=>add(2,'line',l1,f),code('P0002'),'ineligible photo');
 await assert.rejects(()=>add(2,'line',crypto.randomUUID(),cabinet),code('P0002'),'unknown line');await assert.rejects(()=>add(2,'section','Baños',cabinet),code('P0002'),'unknown section');
 await assert.rejects(()=>add(2,'cover','x',cabinet),code('22023'));await assert.rejects(()=>add(2,'line',l1,cabinet,{source:'cloud'}),code('22023'));
 const a1=await add(2,'line',l1,cabinet),a2=await add(3,'line',l1,cover),a3=await add(4,'section','Muebles',cabinet,{caption:'Muebles a la medida'});
 let rev=a3.revision;for(let i=0;i<4;i++)rev=(await add(rev,'line',l1,cabinet)).revision;
 await assert.rejects(()=>add(rev,'line',l1,cabinet),e=>e.code==='22023'&&e.hint==='pro_proposal_photo_limit','six photos per line');
 const lineImgs=()=>design(eid).then(x=>x.images.filter(i=>i.target==='line').map(i=>i.id));
 const firstTwo=(await lineImgs()).slice(0,2);assert.deepEqual(firstTwo,[a1.proposal.images.find(i=>i.target==='line').id,a2.proposal.images.filter(i=>i.target==='line')[1].id]);
 rev=(await write({action:'move_image',actionId:crypto.randomUUID(),estimateId:eid,revision:rev,imageId:firstTwo[1],direction:-1})).revision;
 assert.deepEqual((await lineImgs()).slice(0,2),[firstTwo[1],firstTwo[0]],'moved up');
 await assert.rejects(()=>write({action:'move_image',actionId:crypto.randomUUID(),estimateId:eid,revision:rev,imageId:firstTwo[1],direction:-1}),code('22023'),'already first');
 const extra=(await lineImgs()).at(-1);rev=(await write({action:'remove_image',actionId:crypto.randomUUID(),estimateId:eid,revision:rev,imageId:extra})).revision;assert.equal((await lineImgs()).length,5);
 await assert.rejects(()=>design(eid,rival),code('P0002'),'other company');await assert.rejects(()=>design(eid,customer),code('42501'),'customer is not an owner');
 pass('design: CAS, receipts, text validation, eligible photos only (JPEG, ready, active, own), limits, order, removal and isolation');

 // ---- Publish a snapshot on the open version; the customer sees it; closed versions are frozen ----
 assert.equal((await pubRead(pid,customer)).proposal,null,'nothing until it is applied');
 await assert.rejects(()=>write({action:'publish',actionId:crypto.randomUUID(),estimateId:eid,revision:rev,publicationId:pid2}),code('40001'),'accepted version is frozen');
 await assert.rejects(()=>write({action:'publish',actionId:crypto.randomUUID(),estimateId:eid,revision:rev,publicationId:crypto.randomUUID()}),code('P0002'));
 const p1=await write({action:'publish',actionId:crypto.randomUUID(),estimateId:eid,revision:rev,publicationId:pid});assert.equal(p1.seq,1);assert.equal(p1.revision,rev,'publishing does not change the design revision');
 const seen=await pubRead(pid,customer);assert.equal(seen.side,'client');assert.equal(seen.proposal.coverTitle,'Su nueva cocina');assert.equal(seen.proposal.images.length,7);
 assert.ok(!JSON.stringify(seen).includes('objectPath')&&!JSON.stringify(seen).includes('sha256'),'no storage path or hash to the browser');
 const coverId=seen.proposal.images.find(i=>i.target==='cover').imageId;assert.deepEqual(await image(pid,coverId,customer),{bucket:'pro-company-files',objectPath:owner+'/'+cover+'.jpg',sha256:'b'.repeat(64),sizeBytes:1234});
 assert.equal(await image(pid,crypto.randomUUID(),customer),null);await assert.rejects(()=>image(pid,coverId,stranger),code('42501'));await assert.rejects(()=>pubRead(pid,stranger),code('42501'));
 assert.equal((await pubRead(pid,owner)).side,'owner');
 // Later edits do not touch what the customer sees until applied again.
 rev=(await write({...save,actionId:crypto.randomUUID(),revision:rev,coverTitle:'Otra portada'})).revision;assert.equal((await pubRead(pid,customer)).proposal.coverTitle,'Su nueva cocina');
 d=await design(eid);assert.equal(d.publications.find(p=>p.publicationId===pid).appliedRevision,p1.revision);assert.ok(d.revision>p1.revision,'owner can see the snapshot is older');
 const p2=await write({action:'publish',actionId:crypto.randomUUID(),estimateId:eid,revision:rev,publicationId:pid});assert.equal(p2.seq,2);assert.equal((await pubRead(pid,customer)).proposal.coverTitle,'Otra portada');
 // An archived file disappears from new snapshots but the old snapshot keeps its reference.
 await db.exec('alter table pro_company_files disable trigger user');await db.query('update pro_company_files set archived=true where owner_id=$1 and id=$2',[owner,cover]);await db.exec('alter table pro_company_files enable trigger user');assert.equal((await design(eid)).images.find(i=>i.target==='cover').available,false);
 pass('publish: explicit snapshot per open version, customer read without paths, photo audience, frozen closed versions, re-apply after edits');

 // ---- Immutability, RLS, grants, reapply ----
 await assert.rejects(()=>db.query("update pro_estimate_proposal_snapshots set content='{}' where publication_id=$1",[pid]),code('23514'));
 await assert.rejects(()=>db.query('delete from pro_estimate_proposal_history where owner_id=$1',[owner]),code('23514'));
 await assert.rejects(()=>db.query('delete from pro_estimate_proposal_actions where owner_id=$1',[owner]),code('23514'));
 for(const t of ['pro_estimate_proposals','pro_estimate_proposal_images','pro_estimate_proposal_snapshots','pro_estimate_proposal_history','pro_estimate_proposal_actions'])assert.equal((await one('select relrowsecurity v from pg_class where oid=$1::regclass',['public.'+t])).v,true,t);
 for(const fn of ['pro_estimate_proposal_read(uuid,jsonb)','pro_estimate_proposal_mutate(uuid,jsonb)','pro_estimate_proposal_publication_read(uuid,uuid)','pro_estimate_proposal_image(uuid,uuid,uuid)','pro_estimate_proposal_draft_image(uuid,uuid,text,uuid)'])
  for(const [role,yes] of [['anon',false],['authenticated',false],['service_role',true]])assert.equal((await one('select has_function_privilege($1,$2,$3) v',[role,'public.'+fn,'EXECUTE'])).v,yes,role+' '+fn);
 const before=JSON.stringify([await design(eid),await pubRead(pid,customer)]);await db.exec(moduleSql);assert.equal(JSON.stringify([await design(eid),await pubRead(pid,customer)]),before,'idempotent reapply keeps data');
 pass('immutability, RLS/grants service_role only, idempotent reapply');
 console.log(`${checks} estimate-proposal contract groups passed; in-memory PGlite only.`);
}finally{await db.close();}

// LOCAL PRO ONLY (Ronda F2-D, 2026-11-19): disposable in-memory PGlite verification of file-formats-library-local.sql
// (rows 28/29/31/33).
// Installs the whole ordered local manifest (same foundation as verify-pro-cost-codes-db.mjs), then checks document formats,
// quota, permanent delete from the trash, shared folders for the customer, library tags and copy of new formats into a job.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {localSqlManifest,localSqlDependencies} from './local-sql-manifest.mjs';
import {registerHooks} from 'node:module';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const libRoot=new URL('../../src/lib/',import.meta.url).href;
registerHooks({resolve(s,c,n){return n(c.parentURL?.startsWith(libRoot)&&s.startsWith('.')&&!/\.[a-z]+$/i.test(s)?s+'.ts':s,c);},load(u,c,n){return u.startsWith(libRoot)&&u.endsWith('.ts')?{format:'module',source:ts.transpileModule(readFileSync(new URL(u),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText,shortCircuit:true}:n(u,c);}});
const formats=await import('../../src/lib/pro/file-formats.ts');
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
 insert into profiles(id,full_name,role,is_disabled,is_provider) values('${owner}','Dueña Presupuesto','professional',false,true),('${rival}','Otra Empresa','professional',false,true),('${customer}','Cliente Cuenta','client',false,false),('${stranger}','Cuenta Ajena','client',false,false);`);
 const notifications=await readFile(new URL('supabase/migrations/002_sprint2.sql',root),'utf8');
 await db.exec(notifications.slice(notifications.indexOf('CREATE TABLE IF NOT EXISTS public.notifications'),notifications.indexOf('-- SAVED PROFESSIONALS')));
 const emptyDoc=clientId=>({version:1,clients:[{id:clientId,name:'Cliente presupuesto',email:'',phone:'',notes:'',archived:false}],products:[],movements:[],work:[],availability:[],quotes:[],quoteLinks:[],social:[]});
 let moduleSql='';
 // The whole manifest is installed; a module that is NOT a declared ancestor of this one may be work in progress of
 // another round: its failure is rolled back and reported, never hidden for an ancestor or for this module.
 const needed=new Set(['file-formats-library-local.sql']);for(let grew=true;grew;){grew=false;for(const [from,to] of localSqlDependencies)if(needed.has(to)&&!needed.has(from)){needed.add(from);grew=true;}}
 for(const step of localSqlManifest){
  if(step.ifMissing&&(await db.query('select to_regclass($1) is not null present',[step.ifMissing])).rows[0].present)continue;
  let text=await readFile(new URL('docs/pro/sql/'+step.file,root),'utf8');
  if(step.file==='identity-lookup-maintenance-local.sql')text=text.replace('create extension if not exists pg_cron;','');
  if(step.file==='file-formats-library-local.sql')moduleSql=text;
  try{await db.exec(text);}catch(error){if(needed.has(step.file))throw new Error('Manifest SQL failed: '+step.file,{cause:error});await db.exec('rollback');console.log('SKIP unrelated module that does not install here: '+step.file);}
  if(step.file==='memberships-draft.sql')for(const id of [owner,rival])await db.query('select pro_save_workspace($1,$2,0)',[id,emptyDoc('budget-client')]);
 }
 assert.ok(moduleSql,'file-formats-library-local.sql must be in the manifest');
 for(const [id,profile] of [[owner,'30000000-0000-4000-8000-000000000001'],[rival,'30000000-0000-4000-8000-000000000002']]){
  await db.query('insert into professionals(id,profile_id,business_name,slug,is_banned) values($1,$2,$3,$4,false)',[profile,id,'Empresa '+id.slice(-1),'budget-'+id.slice(-1)]);
  await db.query("insert into pro_memberships(user_id,status) values($1,'active')",[id]);
 }
 const work='budget-work',work2='budget-work-2';
 for(const [user,id,title] of [[owner,work,'Remodelación de cocina'],[owner,work2,'Baño principal'],[rival,'rival-work','Trabajo ajeno']])
  await db.query('insert into pro_work(user_id,id,client,service,stage,start,"end","clientId",cancelled) values($1,$2,$3,$4,$5,$6,$7,$8,false)',[user,id,'Cliente presupuesto',title,'scheduled','','','budget-client']);
 const request=crypto.randomUUID();
 await db.query("insert into pro_appointment_requests(id,professional_id,owner_id,client_user_id,client_name,professional_name,service,duration_minutes,location_kind,status,work_id) values($1,$2,$3,$4,'Cliente Cuenta','Empresa 1','Remodelación de cocina',60,'agree','confirmed',$5)",[request,'30000000-0000-4000-8000-000000000001',owner,customer,work]);
 const one=async(sql,args)=>(await db.query(sql,args)).rows[0]; const hex=n=>n.toString(16).padStart(64,'0');let seq=1;
 const DOCX='application/vnd.openxmlformats-officedocument.wordprocessingml.document',XLSX='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
 const upload=async(name,mime,size=1000,w=work,actor=owner)=>{const id=crypto.randomUUID(),h=hex(seq++);
  const r=(await one('select pro_work_file_reserve($1,$2) v',[actor,{fileId:id,workId:w,sourceName:name,name,mimeType:mime,rawSha256:h,sha256:h,sizeBytes:size}])).v;
  await one('select pro_work_file_ready($1,$2,$3) v',[actor,id,h]);return {id,path:r.objectPath,sha:h};};
 const org=async(input,actor=owner)=>(await one('select pro_work_file_organizer_mutate($1,$2) v',[actor,{workId:work,actionId:crypto.randomUUID(),...input}])).v;
 const view=async(v='folder',folderId=null)=>(await one('select pro_work_file_organizer_read($1,$2,$3,$4) v',[owner,work,v,folderId])).v;
 const meta=async id=>(await view('search')).files.find(f=>f.id===id)??(await view('trash')).files.find(f=>f.id===id)??null;

 // ---- 1. formats: SQL list = TS list ----
 for(const mime of formats.PRO_DOC_MIMES)assert.equal((await one('select pro_file_doc_ext($1) v',[mime])).v,formats.PRO_DOC_FORMATS[mime].ext,mime);
 assert.equal((await one("select pro_file_doc_ext('application/zip') v")).v,null);
 const docx=await upload('Contrato de obra.docx',DOCX);assert.equal(docx.path,owner+'/'+docx.id+'.docx');
 const video=await upload('Avance.mp4','video/mp4',19*1024*1024);assert.ok(video.path.endsWith('.mp4'));
 const jpg=await upload('Foto.jpg','image/jpeg');const dwg=await upload('Plano.dwg','image/vnd.dwg');
 await assert.rejects(()=>upload('Contrato.pdf',DOCX),code('22023'),'name must carry the stored extension');
 await assert.rejects(()=>upload('x.zip','application/zip'),code('22023'),'unknown format');
 await assert.rejects(()=>upload('grande.mp4','video/mp4',21*1024*1024),code('22023'),'20 MiB cap');
 await assert.rejects(()=>db.query("update pro_work_files set mime_type='application/zip' where id=$1",[docx.id]),e=>/23514|immutable/.test(e.code+e.message));
 const bucket=(await one("select allowed_mime_types v from storage.buckets where id='pro-work-files'")).v;assert.equal(bucket.length,12);assert.ok(!(await one("select public v from storage.buckets where id='pro-work-files'")).v);
 pass('office, CAD, video and photo formats stored with their extension; unknown formats, wrong names and > 20 MiB refused; bucket private with 12 formats');

 // ---- 2. quota ----
 const quota=(await one('select pro_file_quota_read($1) v',[owner])).v;assert.equal(quota.limitBytes,2147483648);assert.equal(quota.usedBytes,1000*3+19*1024*1024);
 await assert.rejects(()=>one('select pro_file_quota_check($1,$2)',[owner,2147483647]),code('54000'));
 await assert.rejects(()=>one('select pro_file_quota_read($1) v',[customer]),code('42501'));
 pass('per-account quota (2 GiB over job files + library), read only by the Pro owner');

 // ---- 3. organizer: rename keeps the 4/5-letter extension, permanent delete ----
 let m=await meta(docx.id);
 let r=await org({action:'rename_file',subjectId:docx.id,revision:m.metaRevision,name:'Contrato firmado.DOCX'});assert.equal(r.file.name,'Contrato firmado.docx');
 await assert.rejects(()=>org({action:'rename_file',subjectId:docx.id,revision:r.file.metaRevision,name:'Contrato.pdf'}),code('22023'));
 await assert.rejects(()=>org({action:'purge_file',subjectId:jpg.id,revision:0}),code('40001'),'only from the trash');
 r=await org({action:'trash_file',subjectId:jpg.id,revision:0});
 r=await org({action:'purge_file',subjectId:jpg.id,revision:r.file.metaRevision});assert.deepEqual(r.objectPaths,[jpg.path]);assert.equal(r.file.purged,true);
 assert.equal((await one('select count(*)::int v from pro_work_files where id=$1',[jpg.id])).v,0);
 assert.equal((await one("select count(*)::int v from pro_work_file_organizer_history where subject_id=$1 and action='purge_file'",[jpg.id])).v,1,'history kept');
 // A file with a team comment (any foreign key besides the organizer) is kept.
 await db.query("insert into pro_work_file_comments(owner_id,work_id,family_id,id,thread,author_kind,author_id,author_name,body) values($1,$2,$3,gen_random_uuid(),'team','owner',$1,'Dueña','Revisar')",[owner,work,dwg.id]);
 r=await org({action:'trash_file',subjectId:dwg.id,revision:0});
 await assert.rejects(()=>org({action:'purge_file',subjectId:dwg.id,revision:r.file.metaRevision}),e=>e.code==='22023'&&e.hint==='pro_file_in_use');
 assert.equal((await one('select count(*)::int v from pro_work_files where id=$1',[dwg.id])).v,1);
 // Folder purge: everything inside goes; a shared or used file blocks it.
 const fA=crypto.randomUUID(),fB=crypto.randomUUID();await org({action:'create_folder',folderId:fA,parentId:null,name:'Permisos'});await org({action:'create_folder',folderId:fB,parentId:fA,name:'Municipalidad'});
 const inA=await upload('Permiso.pdf','application/pdf'),inB=await upload('Uso de suelo.xlsx',XLSX);
 await org({action:'move_file',subjectId:inA.id,revision:0,targetId:fA});await org({action:'move_file',subjectId:inB.id,revision:0,targetId:fB});
 let folder=(await view()).folders.find(f=>f.id===fA);await org({action:'trash_folder',subjectId:fA,revision:folder.revision});
 folder=(await view('trash')).folders.find(f=>f.id===fA);
 r=await org({action:'purge_folder',subjectId:fA,revision:folder.revision});assert.equal(r.objectPaths.length,2);
 assert.equal((await one('select count(*)::int v from pro_work_file_folders where id=any($1)',[[fA,fB]])).v,0);assert.equal((await one('select count(*)::int v from pro_work_files where id=any($1)',[[inA.id,inB.id]])).v,0);
 pass('rename keeps docx/xlsx extensions; permanent delete only from the trash, returns the paths to remove, keeps history, refuses files in use; folder purge removes the subtree');

 // ---- 4. shared folder for the customer ----
 const fS=crypto.randomUUID();await org({action:'create_folder',folderId:fS,parentId:null,name:'Para el cliente'});
 const shared=await upload('Cronograma.xlsx',XLSX),hidden=await upload('Costos internos.xlsx',XLSX);
 await org({action:'move_file',subjectId:shared.id,revision:0,targetId:fS});
 const clientRead=async(actor=customer)=>(await one('select pro_work_file_folders_client_read($1,$2) v',[actor,request])).v;
 const clientGet=async(file,actor=customer)=>(await one('select pro_work_file_folder_client_download($1,$2,$3) v',[actor,request,file])).v;
 assert.deepEqual((await clientRead()).folders,[],'not shared by default');assert.equal(await clientGet(shared.id),null);
 folder=(await view()).folders.find(f=>f.id===fS);assert.equal(folder.clientVisible,false);
 r=await org({action:'share_folder',subjectId:fS,revision:folder.revision,on:true});assert.equal(r.folder.clientVisible,true);
 let cv=await clientRead();assert.equal(cv.folders.length,1);assert.deepEqual(cv.folders[0].files.map(f=>f.id),[shared.id]);
 assert.equal((await clientGet(shared.id)).objectPath,shared.path);assert.equal(await clientGet(hidden.id),null,'files outside the folder stay private');
 assert.equal(await clientRead(stranger),null);assert.equal(await clientGet(shared.id,stranger),null);
 const fm=(await meta(shared.id));await org({action:'trash_file',subjectId:shared.id,revision:fm.metaRevision});assert.equal(await clientGet(shared.id),null,'trashed file disappears');
 const back=(await view('trash')).files.find(f=>f.id===shared.id);await org({action:'restore_file',subjectId:shared.id,revision:back.metaRevision});
 await db.query('insert into pro_client_dashboards(owner_id,work_id,show_files) values($1,$2,false) on conflict(owner_id,work_id) do update set show_files=false',[owner,work]);
 assert.deepEqual((await clientRead()).folders,[],'"Archivos y fotos" off hides shared folders');assert.equal(await clientGet(shared.id),null);
 await db.query('update pro_client_dashboards set show_files=true where owner_id=$1 and work_id=$2',[owner,work]);assert.equal((await clientRead()).folders.length,1);
 folder=(await view()).folders.find(f=>f.id===fS);await org({action:'trash_folder',subjectId:fS,revision:folder.revision});assert.deepEqual((await clientRead()).folders,[]);
 pass('shared folder: off by default, only its ready non-trashed files, gated by show_files, hidden from strangers and when trashed');

 // ---- 5. company library: new formats, tags, copy into a job ----
 const company=async(input,actor=owner)=>(await one('select pro_company_files_mutate($1,$2,$3) v',[actor,input,hex(seq++)])).v;
 const libUp=async(name,mime)=>{const fileId=crypto.randomUUID(),actionId=crypto.randomUUID(),h=hex(seq++);
  const s=await company({action:'upload',actionId,fileId,folderId:null,sourceName:name,name,mimeType:mime,rawSha256:h,sha256:h,sizeBytes:2048});assert.ok(s.upload.objectPath.endsWith('.'+formats.PRO_DOC_FORMATS[mime].ext));
  return (await one('select pro_company_file_ready($1,$2) v',[owner,actionId])).v.file;};
 const manual=await libUp('Manual de seguridad.docx',DOCX),plantilla=await libUp('Plantilla presupuesto.xlsx',XLSX);
 await assert.rejects(()=>company({action:'upload',actionId:crypto.randomUUID(),fileId:crypto.randomUUID(),folderId:null,sourceName:'a.docx',name:'a.pdf',mimeType:DOCX,rawSha256:hex(1),sha256:hex(1),sizeBytes:10}),code('22023'));
 const tags=async(input,actor=owner)=>(await one('select pro_company_file_tags_mutate($1,$2) v',[actor,input])).v;
 const set={action:'set_tags',actionId:crypto.randomUUID(),fileId:manual.id,tags:['manual','Seguridad ',' manual']};
 r=await tags(set);assert.deepEqual(r.tags,['manual','seguridad']);assert.equal((await tags(set)).replayed,true);
 await assert.rejects(()=>tags({...set,tags:['otro']}),code('22023'),'reused action id');
 await tags({action:'set_tags',actionId:crypto.randomUUID(),fileId:plantilla.id,tags:['template']});
 await assert.rejects(()=>tags({action:'set_tags',actionId:crypto.randomUUID(),fileId:manual.id,tags:['a','b','c','d','e','f','g']}),code('22023'));
 await assert.rejects(()=>tags({action:'set_tags',actionId:crypto.randomUUID(),fileId:manual.id,tags:['a/b']}),code('22023'));
 await assert.rejects(()=>tags({action:'set_tags',actionId:crypto.randomUUID(),fileId:manual.id,tags:['x']},rival),code('40001'));
 let tr=(await one('select pro_company_file_tags_read($1,$2) v',[owner,'manual'])).v;
 assert.deepEqual(tr.tags,[{tag:'manual',count:1},{tag:'seguridad',count:1},{tag:'template',count:1}]);assert.deepEqual(tr.files.map(f=>f.id),[manual.id]);assert.deepEqual(tr.fileTags[plantilla.id],['template']);
 assert.deepEqual((await one('select pro_company_file_tags_read($1,null) v',[rival])).v.tags,[]);
 const target=crypto.randomUUID(),copyId=crypto.randomUUID();
 const cs=await company({action:'copy',actionId:copyId,fileId:plantilla.id,revision:plantilla.revision,targetFileId:target,workId:work2});assert.equal(cs.copy.target.objectPath,owner+'/'+target+'.xlsx');
 const copied=(await one('select pro_company_file_ready($1,$2) v',[owner,copyId])).v;assert.equal(copied.copy.file.mimeType,XLSX);assert.equal(copied.copy.file.name,'Plantilla presupuesto.xlsx');
 pass('library: docx/xlsx uploads, tags (normalized, max 6, idempotent receipts, per owner), filter by tag, copy of an xlsx into a job');

 // ---- 6. security and reapply ----
 await assert.rejects(()=>db.query('update pro_company_file_tag_actions set result=$1',[{}]),code('23514'));
 await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${owner}',false);`);
 for(const t of ['pro_company_file_tags','pro_company_file_tag_actions'])await assert.rejects(()=>db.query(`select * from ${t}`),code('42501'));
 await db.exec('reset role');
 for(const fn of ['pro_file_quota_read(uuid)','pro_work_file_folders_client_read(uuid,uuid)','pro_work_file_folder_client_download(uuid,uuid,uuid)','pro_company_file_tags_read(uuid,text)','pro_company_file_tags_mutate(uuid,jsonb)','pro_work_file_organizer_mutate(uuid,jsonb)','pro_work_file_reserve(uuid,jsonb)','pro_company_files_mutate(uuid,jsonb,text)'])
  for(const [role,yes] of [['anon',false],['authenticated',false],['service_role',true]])assert.equal((await one('select has_function_privilege($1,$2,$3) v',[role,'public.'+fn,'EXECUTE'])).v,yes,role+' '+fn);
 const before=JSON.stringify([(await view('search')).files.length,(await one('select pro_company_file_tags_read($1,null) v',[owner])).v]);
 for(const file of ['work-files-local.sql','company-files-local.sql','work-file-organizer-local.sql'])await db.exec(await readFile(new URL('docs/pro/sql/'+file,root),'utf8'));
 await db.exec(moduleSql);
 assert.equal(JSON.stringify([(await view('search')).files.length,(await one('select pro_company_file_tags_read($1,null) v',[owner])).v]),before,'idempotent reapply keeps data');
 assert.equal((await one("select count(*)::int v from pg_constraint where conrelid='public.pro_work_files'::regclass and conname like 'pro_work_files_doc_%'")).v,3);
 await upload('Después de reaplicar.pptx','application/vnd.openxmlformats-officedocument.presentationml.presentation');
 pass('RLS/grants service_role only, immutable tag receipts, idempotent reapply of the writers and this module');
 console.log(`${checks} file-format/library contract groups passed; in-memory PGlite only.`);
}finally{await db.close();}

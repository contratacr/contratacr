// LOCAL PRO ONLY (Ronda F2-E, 2026-11-23): in-memory PGlite verification of migrations 414-417 (rows 28-31): bulk file operations,
// permanent delete and receipts, annotations, folder permissions and imports. Installs the local manifest first (same foundation as verify-pro-file-formats-db.mjs).
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
 const needed=new Set(['file-formats-library-local.sql','file-versions-local.sql','company-file-versions-local.sql','company-file-trash-local.sql','estimate-proposals-local.sql','company-daily-log-files-local.sql']);for(let grew=true;grew;){grew=false;for(const [from,to] of localSqlDependencies)if(needed.has(to)&&!needed.has(from)){needed.add(from);grew=true;}}
 for(const step of localSqlManifest){
  if(step.ifMissing&&(await db.query('select to_regclass($1) is not null present',[step.ifMissing])).rows[0].present)continue;
  let text=await readFile(new URL('docs/pro/sql/'+step.file,root),'utf8');
  if(step.file==='identity-lookup-maintenance-local.sql')text=text.replace('create extension if not exists pg_cron;','');
  if(step.file==='file-formats-library-local.sql')moduleSql=text;
  try{await db.exec(text);}catch(error){if(needed.has(step.file))throw new Error('Manifest SQL failed: '+step.file,{cause:error});await db.exec('rollback');console.log('SKIP unrelated module that does not install here: '+step.file);}
  if(step.file==='memberships-draft.sql')for(const id of [owner,rival])await db.query('select pro_save_workspace($1,$2,0)',[id,emptyDoc('budget-client')]);
 }
 assert.ok(moduleSql,'file-formats-library-local.sql must be in the manifest');
 for(const name of ['414_pro_27_file_bulk_and_purge.sql','415_pro_27_file_annotations.sql','416_pro_27_company_folder_access.sql','417_pro_27_file_transfers.sql']){let text;try{text=await readFile(new URL('supabase/migrations/'+name,root),'utf8');}catch(error){if(error.code==='ENOENT')continue;throw error;}try{await db.exec(text);}catch(error){throw new Error('Migration failed: '+name,{cause:error});}}
 for(const name of ['414_pro_27_file_bulk_and_purge.sql','415_pro_27_file_annotations.sql','416_pro_27_company_folder_access.sql','417_pro_27_file_transfers.sql']){try{await db.exec(await readFile(new URL('supabase/migrations/'+name,root),'utf8'));}catch(error){if(error.code==='ENOENT')continue;throw new Error('Migration failed: '+name,{cause:error});}}
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

 // ---- shared helpers for the groups below ----
 const company=async(input,actor=owner)=>(await one('select pro_company_files_mutate($1,$2,$3) v',[actor,input,hex(seq++)])).v;
 const PDF='application/pdf';
 const libUp=async(name,mime=PDF)=>{const fileId=crypto.randomUUID(),actionId=crypto.randomUUID(),h=hex(seq++);
  await company({action:'upload',actionId,fileId,folderId:null,sourceName:name,name,mimeType:mime,rawSha256:h,sha256:h,sizeBytes:2048});
  return (await one('select pro_company_file_ready($1,$2) v',[owner,actionId])).v.file;};
 const crev=async id=>(await one('select revision v from pro_company_files where id=$1',[id])).v;
 const cfolder=async(name,parentId=null)=>{const folderId=crypto.randomUUID();await company({action:'folder_save',actionId:crypto.randomUUID(),folderId,revision:0,parentId,name,favorite:false});return folderId;};
 const cbulk=async(input,actor=owner)=>(await one('select pro_company_files_bulk($1,$2) v',[actor,{batchId:crypto.randomUUID(),...input}])).v;
 const wbulk=async(input,actor=owner)=>(await one('select pro_work_files_bulk($1,$2) v',[actor,{batchId:crypto.randomUUID(),workId:work,...input}])).v;
 const wrev=async id=>(await one('select coalesce((select revision from pro_work_file_meta where file_id=$1),0) v',[id])).v;
 const errs=r=>r.items.filter(i=>!i.ok).map(i=>i.error).sort();
 const citems=async ids=>Promise.all(ids.map(async id=>({fileId:id,revision:await crev(id)})));

 // ---- 414.1 job files: bulk move, favorite, trash, restore, permanent delete ----
 const w1=await upload('uno.pdf',PDF),w2=await upload('dos.docx',DOCX),w3=await upload('tres.xlsx',XLSX);
 const dest=crypto.randomUUID();await org({action:'create_folder',folderId:dest,parentId:null,name:'Lote'});
 const items=async ids=>Promise.all(ids.map(async id=>({fileId:id,revision:await wrev(id)})));
 let r=await wbulk({action:'move',folderId:dest,items:await items([w1.id,w2.id,w3.id])});assert.deepEqual([r.ok,r.failed],[3,0]);
 assert.equal((await view('folder',dest)).files.length,3);
 const batch=crypto.randomUUID();let it=await items([w1.id,w2.id]);
 r=await wbulk({batchId:batch,action:'favorite',on:true,items:it});assert.equal(r.ok,2);
 r=await wbulk({batchId:batch,action:'favorite',on:true,items:it});assert.equal(r.ok,2);assert.ok(r.items.every(i=>i.replayed),'same batch replays the stored receipts');
 assert.equal((await view('favorites')).files.length,2);
 r=await wbulk({action:'trash',items:[{fileId:w3.id,revision:0}]});assert.deepEqual(errs(r),['conflict'],'a stale revision fails alone');
 r=await wbulk({action:'trash',items:await items([w1.id,w2.id,w3.id])});assert.equal(r.ok,3);assert.equal((await view('trash')).files.length,3);
 r=await wbulk({action:'restore',items:await items([w3.id])});assert.equal(r.ok,1);
 await db.query("insert into pro_work_file_comments(owner_id,work_id,family_id,id,thread,author_kind,author_id,author_name,body) values($1,$2,$3,gen_random_uuid(),'team','owner',$1,'Dueña','Revisar')",[owner,work,w2.id]);
 r=await wbulk({action:'purge',items:await items([w1.id,w2.id])});assert.deepEqual([r.ok,r.failed],[1,1]);assert.deepEqual(errs(r),['in_use']);assert.deepEqual(r.objectPaths,[w1.path]);
 assert.equal((await one('select count(*)::int v from pro_work_files where id=$1',[w1.id])).v,0);assert.equal((await one('select count(*)::int v from pro_work_files where id=$1',[w2.id])).v,1);
 await assert.rejects(()=>wbulk({action:'trash',items:[]}),code('22023'));
 await assert.rejects(()=>wbulk({action:'trash',items:[{fileId:w3.id,revision:1},{fileId:w3.id,revision:1}]}),code('22023'),'duplicates refused');
 await assert.rejects(()=>wbulk({action:'trash',items:[{fileId:w3.id,revision:1}]},rival),code('42501'),'another account cannot use the job');
 pass('414 job files: bulk move/favorite/trash/restore/purge, per-item errors, idempotent replay, used files kept');

 // ---- 414.2 library: bulk move, favorite, archive, restore, tags, permanent delete ----
 const l1=await libUp('a.pdf'),l2=await libUp('b.docx',DOCX),l3=await libUp('c.xlsx',XLSX),l4=await libUp('d.pdf');
 const cf=await cfolder('Contratos');
 r=await cbulk({action:'move',folderId:cf,items:await citems([l1.id,l2.id])});assert.deepEqual([r.ok,r.failed],[2,0]);
 assert.equal((await one('select count(*)::int v from pro_company_files where folder_id=$1',[cf])).v,2);
 r=await cbulk({action:'favorite',on:true,items:await citems([l1.id,l2.id,l3.id])});assert.equal(r.ok,3);assert.equal((await one('select count(*)::int v from pro_company_files where favorite and owner_id=$1',[owner])).v,3);
 r=await cbulk({action:'tags_add',tags:['Manual','permit'],items:await citems([l1.id,l2.id])});assert.equal(r.ok,2);
 assert.deepEqual((await one('select pro_company_file_tags_of($1,$2) v',[owner,l1.id])).v,['manual','permit']);
 r=await cbulk({action:'tags_remove',tags:['permit'],items:await citems([l1.id])});assert.equal(r.ok,1);assert.deepEqual((await one('select pro_company_file_tags_of($1,$2) v',[owner,l1.id])).v,['manual']);
 await assert.rejects(async()=>cbulk({action:'tags_add',tags:['a','b','c','d','e','f','g'],items:await citems([l1.id])}),code('22023'));
 r=await cbulk({action:'move',folderId:cf,items:[{fileId:l4.id,revision:99}]});assert.deepEqual(errs(r),['conflict']);
 r=await cbulk({action:'archive',items:await citems([l1.id,l2.id,l4.id])});assert.equal(r.ok,3);
 r=await cbulk({action:'restore',items:await citems([l2.id])});assert.equal(r.ok,1);
 // l1 becomes used: copied into a job. l4 was never used. l2 is active so it cannot be purged.
 await company({action:'copy',actionId:crypto.randomUUID(),fileId:l3.id,revision:await crev(l3.id),targetFileId:crypto.randomUUID(),workId:work2});
 assert.equal((await one('select pro_company_file_in_use($1,$2) v',[owner,l3.id])).v,true,'a copied file counts as used');
 await cbulk({action:'archive',items:await citems([l3.id])});
 r=await cbulk({action:'purge',items:await citems([l2.id,l3.id,l4.id])});
 assert.equal((await one('select count(*)::int v from pro_company_files where id=$1',[l4.id])).v,0,'unused archived file deleted');
 assert.equal((await one('select count(*)::int v from pro_company_files where id=any($1)',[[l2.id,l3.id]])).v,2,'active and used files kept');
 assert.deepEqual(r.objectPaths,[owner+'/'+l4.id+'.pdf']);assert.deepEqual([r.ok,r.failed],[1,2]);
 assert.equal((await one("select count(*)::int v from pro_file_purge_receipts where owner_id=$1 and scope='company'",[owner])).v,1,'one receipt per batch');
 await assert.rejects(()=>db.query("update pro_file_purge_receipts set kept_files=9"),code('23514'));
 assert.deepEqual(errs(await cbulk({action:'archive',items:await citems([l1.id])},rival)),['forbidden'],'another account cannot touch the files');
 pass('414 library: bulk move/favorite/archive/restore/tags, only archived+unused files are purged, one immutable receipt per batch');

 // ---- 414.3 explicit purge of what expired (library and job) ----
 const g1=await libUp('vence1.pdf'),g2=await libUp('vence2.docx',DOCX);
 const ft=await cfolder('Vieja'),fsub=await cfolder('Vieja interior',ft);
 await cbulk({action:'move',folderId:ft,items:await citems([g1.id])});await cbulk({action:'move',folderId:fsub,items:await citems([g2.id])});
 const fv=(await one('select revision v from pro_company_folders where id=$1',[ft])).v;
 const tr=(await one('select pro_company_trash_mutate($1,$2) v',[owner,{action:'trash',actionId:crypto.randomUUID(),folderId:ft,revision:fv}])).v;
 const entry=tr.trash.id;
 let pv=(await one("select pro_file_purge_preview($1,'company',null) v",[owner])).v;assert.equal(pv.expiredFiles,0,'nothing expired yet');
 await assert.rejects(()=>one('select pro_company_purge($1,$2)',[owner,{action:'purge_expired',actionId:crypto.randomUUID(),confirm:false}]),code('22023'));
 await assert.rejects(()=>one('select pro_company_purge($1,$2)',[owner,{action:'purge_expired',actionId:crypto.randomUUID()}]),code('22023'));
 const none=(await one('select pro_company_purge($1,$2) v',[owner,{action:'purge_expired',actionId:crypto.randomUUID(),confirm:true}])).v;assert.equal(none.receipt.purgedFiles,0);
 await db.exec('alter table pro_company_trash disable trigger pro_company_trash_guard');
 await db.query("update pro_company_trash set restore_until=(clock_timestamp() at time zone 'America/Costa_Rica')::date-1 where id=$1",[entry]);
 await db.exec('alter table pro_company_trash enable trigger pro_company_trash_guard');
 pv=(await one("select pro_file_purge_preview($1,'company',null) v",[owner])).v;assert.deepEqual([pv.expiredFiles,pv.deletableFiles,pv.keptFiles,pv.expiredFolders],[2,2,0,1]);
 const pid=crypto.randomUUID();const pr=(await one('select pro_company_purge($1,$2) v',[owner,{action:'purge_expired',actionId:pid,confirm:true}])).v;
 assert.equal(pr.receipt.purgedFiles,2);assert.equal(pr.receipt.purgedFolders,2);assert.ok(pr.objectPaths.includes(owner+'/'+g1.id+'.pdf'));assert.equal((await one('select count(*)::int v from pro_company_files where id=any($1)',[[g1.id,g2.id]])).v,0);
 const again=(await one('select pro_company_purge($1,$2) v',[owner,{action:'purge_expired',actionId:pid,confirm:true}])).v;assert.equal(again.replayed,true);assert.equal(again.receipt.id,pid);
 await assert.rejects(()=>one('select pro_company_purge($1,$2)',[owner,{action:'purge_expired',actionId:pid,confirm:true,extra:1}]),code('22023'));
 assert.equal((await one('select pro_company_trash_read($1) v',[owner])).v.items.find(x=>x.id===entry),undefined,'purged entry leaves the trash');
 assert.equal((await one('select jsonb_array_length(pro_file_purge_receipts_read($1,$2)->$3) v',[owner,'company','items'])).v>=1,true);
 // a used file inside an expired entry survives and its folder stays in the trash
 const u1=await libUp('usado.pdf'),fu=await cfolder('Con uso');await cbulk({action:'move',folderId:fu,items:await citems([u1.id])});
 await company({action:'copy',actionId:crypto.randomUUID(),fileId:u1.id,revision:await crev(u1.id),targetFileId:crypto.randomUUID(),workId:work2});
 const fuv=(await one('select revision v from pro_company_folders where id=$1',[fu])).v;const tu=(await one('select pro_company_trash_mutate($1,$2) v',[owner,{action:'trash',actionId:crypto.randomUUID(),folderId:fu,revision:fuv}])).v;
 const pe=(await one('select pro_company_purge($1,$2) v',[owner,{action:'purge_entry',actionId:crypto.randomUUID(),trashId:tu.trash.id}])).v;
 assert.equal(pe.receipt.purgedFiles,0);assert.equal(pe.receipt.keptFiles,1);assert.equal((await one('select count(*)::int v from pro_company_files where id=$1',[u1.id])).v,1);
 // a loose archived file older than 30 days (its archive receipt backdated)
 const old=await libUp('archivo-viejo.pdf');await cbulk({action:'archive',items:await citems([old.id])});
 await db.exec('alter table pro_company_file_actions disable trigger pro_company_file_action_immutable');
 await db.query("update pro_company_file_actions set at=clock_timestamp()-interval '40 days' where input->>'fileId'=$1 and input->>'action'='file_archive'",[old.id]);
 await db.exec('alter table pro_company_file_actions enable trigger pro_company_file_action_immutable');
 await one('select pro_company_purge($1,$2)',[owner,{action:'purge_expired',actionId:crypto.randomUUID(),confirm:true}]);assert.equal((await one('select count(*)::int v from pro_company_files where id=$1',[old.id])).v,0);
 // job: trashed file and folder older than 30 days
 const e1=await upload('vencido.pdf',PDF),e2=await upload('reciente.pdf',PDF),e3=await upload('en-carpeta.xlsx',XLSX);
 const ef=crypto.randomUUID();await org({action:'create_folder',folderId:ef,parentId:null,name:'Papelera vieja'});await org({action:'move_file',subjectId:e3.id,revision:0,targetId:ef});
 await org({action:'trash_file',subjectId:e1.id,revision:0});await org({action:'trash_file',subjectId:e2.id,revision:0});
 const efr=(await view()).folders.find(f=>f.id===ef).revision;await org({action:'trash_folder',subjectId:ef,revision:efr});
 await db.query("update pro_work_file_meta set trashed_at=clock_timestamp()-interval '31 days' where file_id=$1",[e1.id]);
 await db.query("update pro_work_file_folders set trashed_at=clock_timestamp()-interval '45 days' where id=$1",[ef]);
 pv=(await one('select pro_file_purge_preview($1,$2,$3) v',[owner,'work',work])).v;assert.deepEqual([pv.expiredFiles,pv.deletableFiles],[2,2]);assert.equal(pv.expiredFolders,1);
 const wid=crypto.randomUUID();
 await assert.rejects(()=>one('select pro_work_files_purge_expired($1,$2)',[owner,{action:'purge_expired',actionId:wid,workId:work,confirm:false}]),code('22023'));
 const wp=(await one('select pro_work_files_purge_expired($1,$2) v',[owner,{action:'purge_expired',actionId:wid,workId:work,confirm:true}])).v;
 assert.equal(wp.receipt.purgedFiles,2);assert.equal(wp.receipt.purgedFolders,1);assert.equal(wp.objectPaths.length,2);
 assert.equal((await one('select count(*)::int v from pro_work_files where id=any($1)',[[e1.id,e3.id]])).v,0);assert.equal((await one('select count(*)::int v from pro_work_files where id=$1',[e2.id])).v,1,'a file trashed today stays');
 assert.equal((await one('select (pro_work_files_purge_expired($1,$2)->>$3)::boolean v',[owner,{action:'purge_expired',actionId:wid,workId:work,confirm:true},'replayed'])).v,true);
 await assert.rejects(()=>one('select pro_file_purge_preview($1,$2,$3)',[customer,'work',work]),code('42501'));
 pass('414 explicit purge: preview, confirmation required, expired trash entries and loose archives (30 days, Costa Rica), used files kept, receipt, replay, job purge');

 // ---- 414.4 grants ----
 for(const fn of ['pro_company_files_bulk(uuid,jsonb)','pro_work_files_bulk(uuid,jsonb)','pro_company_purge(uuid,jsonb)','pro_work_files_purge_expired(uuid,jsonb)','pro_file_purge_preview(uuid,text,text)','pro_company_file_in_use(uuid,uuid)'])
  for(const [role,yes] of [['anon',false],['authenticated',false],['service_role',true]])assert.equal((await one('select has_function_privilege($1,$2,$3) v',[role,'public.'+fn,'EXECUTE'])).v,yes,role+' '+fn);
 pass('414 grants: service_role only');
 // ---- 415 annotations: pin and notes as private team comments, immutable, idempotent ----
 const ann=async(input,actor=owner,member=null)=>(await one('select pro_file_annotation_create($1,$2,$3) v',[actor,member,{action:'create',actionId:crypto.randomUUID(),...input}])).v;
 const aread=async(scope,file,w=null,actor=owner)=>(await one('select pro_file_annotations_read($1,$2,$3,$4) v',[actor,scope,file,w])).v;
 const ap=await upload('plano.pdf',PDF),aj=await upload('foto.jpg','image/jpeg');
 const pinId=crypto.randomUUID();
 let an=await ann({actionId:pinId,scope:'work',workId:work,fileId:ap.id,kind:'pin',page:3,x:0.25,y:0.75,body:'  Revisar el desagüe aquí '});
 assert.equal(an.replayed,false);assert.deepEqual([an.annotation.kind,an.annotation.page,an.annotation.x,an.annotation.y,an.annotation.body],['pin',3,0.25,0.75,'Revisar el desagüe aquí']);
 const replay=await ann({actionId:pinId,scope:'work',workId:work,fileId:ap.id,kind:'pin',page:3,x:0.25,y:0.75,body:'  Revisar el desagüe aquí '});
 assert.equal(replay.replayed,true);assert.equal(replay.annotation.id,an.annotation.id);
 await assert.rejects(()=>ann({actionId:pinId,scope:'work',workId:work,fileId:ap.id,kind:'pin',page:3,x:0.5,y:0.75,body:'otro'}),code('22023'),'same action id with another body is refused');
 await ann({scope:'work',workId:work,fileId:aj.id,kind:'pin',page:1,x:0,y:1,body:'Esquina'});
 await assert.rejects(()=>ann({scope:'work',workId:work,fileId:aj.id,kind:'pin',page:2,x:0.5,y:0.5,body:'x'}),code('22023'),'a photo has one page');
 for(const bad of [{x:1.1,y:0.5},{x:-0.1,y:0.5},{x:0.5,y:2}])await assert.rejects(()=>ann({scope:'work',workId:work,fileId:ap.id,kind:'pin',page:1,...bad,body:'x'}),code('22023'));
 await assert.rejects(()=>ann({scope:'work',workId:work,fileId:ap.id,kind:'pin',page:0,x:0.5,y:0.5,body:'x'}),code('22023'));
 await assert.rejects(()=>ann({scope:'work',workId:work,fileId:ap.id,kind:'pin',x:0.5,y:0.5,body:'x'}),code('22023'),'a pin needs a page');
 await assert.rejects(()=>ann({scope:'work',workId:work,fileId:ap.id,kind:'note',body:'   '}),code('22023'));
 await assert.rejects(()=>ann({scope:'work',workId:work,fileId:ap.id,kind:'note',body:'x'.repeat(1001)}),code('22023'));
 await assert.rejects(()=>ann({scope:'work',workId:work,fileId:ap.id,kind:'note',body:'x',extra:1}),code('22023'),'unknown fields refused');
 await assert.rejects(()=>ann({scope:'work',workId:work,fileId:crypto.randomUUID(),kind:'note',body:'x'}),code('42501'),'unknown file');
 await assert.rejects(()=>ann({scope:'work',workId:work,fileId:ap.id,kind:'note',body:'x'},rival),code('42501'),'another account cannot annotate');
 const dw=await upload('contrato.docx',DOCX);
 await assert.rejects(()=>ann({scope:'work',workId:work,fileId:dw.id,kind:'pin',page:1,x:0.5,y:0.5,body:'x'}),code('22023'),'no pin on Word');
 await ann({scope:'work',workId:work,fileId:dw.id,kind:'note',body:'Nota sobre el contrato'});
 let ar=await aread('work',ap.id,work);assert.equal(ar.items.length,1);assert.equal(ar.pinnable,true);assert.equal((await aread('work',dw.id,work)).pinnable,false);
 assert.equal(await aread('work',ap.id,work,rival),null,'another account reads nothing');
 await assert.rejects(()=>db.query("update pro_file_annotations set body='cambio'"),code('23514'),'immutable: no update');
 await assert.rejects(()=>db.query('delete from pro_file_annotations'),code('23514'),'immutable: no delete');
 // an annotated job file is "in use": it cannot be deleted permanently
 await org({action:'trash_file',subjectId:ap.id,revision:0});
 const apRev=(await meta(ap.id)).metaRevision;
 await assert.rejects(()=>org({action:'purge_file',subjectId:ap.id,revision:apRev}),code('22023'),'annotated job file is kept');
 // library: notes and pins
 const lf=await libUp('contrato-empresa.pdf'),li=await libUp('foto.jpg','image/jpeg');
 const cn=await ann({scope:'company',fileId:lf.id,kind:'note',body:'Plantilla vigente 2026'});assert.equal(cn.annotation.scope,'company');
 await ann({scope:'company',fileId:lf.id,kind:'pin',page:2,x:0.1,y:0.9,body:'Firma aquí'});
 assert.equal((await aread('company',lf.id)).items.length,2);
 assert.equal((await one('select pro_company_file_in_use($1,$2) v',[owner,lf.id])).v,true,'annotated library file counts as used');
 await cbulk({action:'archive',items:await citems([lf.id,li.id])});
 const rr=await cbulk({action:'purge',items:await citems([lf.id,li.id])});assert.deepEqual([rr.ok,rr.failed],[1,1]);assert.deepEqual(errs(rr),['in_use']);
 await assert.rejects(()=>ann({scope:'company',workId:work,fileId:lf.id,kind:'note',body:'x'}),code('22023'),'company annotations carry no job');
 // a member acting as the owner: the author is the member
 const memberName=(await one("select full_name v from profiles where id=$1",[customer])).v;
 const byMember=await ann({scope:'company',fileId:lf.id,kind:'note',body:'Del integrante'},owner,customer);assert.equal(byMember.annotation.authorName,memberName);
 for(const fn of ['pro_file_annotation_create(uuid,uuid,jsonb)','pro_file_annotations_read(uuid,text,uuid,text)','pro_file_annotation_target(uuid,text,uuid,text)'])
  for(const [role,yes] of [['anon',false],['authenticated',false],['service_role',true]])assert.equal((await one('select has_function_privilege($1,$2,$3) v',[role,'public.'+fn,'EXECUTE'])).v,yes,role+' '+fn);
 assert.equal((await one("select has_table_privilege('authenticated','public.pro_file_annotations','SELECT') v")).v,false);
 pass('415 annotations: pins (normalized coordinates, page), notes, private, idempotent, immutable, used files kept, grants');
 // ---- 416 folder permissions for current team members (default: only the owner) ----
 const hasMembers=(await one("select to_regclass('public.pro_company_members') is not null v")).v;
 assert.ok(hasMembers,'pro_company_members must exist (migration 307 / team roles)');
 for(const id of [customer])await db.query("insert into pro_company_members(owner_id,member_user_id,member_name,member_email,role,active) values($1,$2,'Ana Integrante','ana@example.com','member',true) on conflict do nothing",[owner,id]);
 const acc=async(input,actor=owner)=>(await one('select pro_company_folder_access_mutate($1,$2) v',[actor,{actionId:crypto.randomUUID(),...input}])).v;
 const gate=async(folders,files,level,member=customer)=>(await one('select pro_company_folder_gate($1,$2,$3,$4,$5) v',[owner,member,folders,files,level])).v;
 const top=await cfolder('Proyectos'),sub=await cfolder('Planos',top),other=await cfolder('Finanzas'),subsub=await cfolder('Detalle',sub);
 const rf=await libUp('plano-1.pdf'),of2=await libUp('balance.pdf');
 await cbulk({action:'move',folderId:sub,items:await citems([rf.id])});await cbulk({action:'move',folderId:other,items:await citems([of2.id])});
 assert.equal(await gate([top],[],'view'),false,'default: the member sees nothing');assert.equal(await gate([],[rf.id],'view'),false);
 let g=await acc({action:'grant',folderId:top,memberUserId:customer,level:'view'});assert.equal(g.replayed,false);
 assert.equal(await gate([top],[],'view'),true);assert.equal(await gate([sub,subsub],[rf.id],'view'),true,'a grant covers subfolders and files');
 assert.equal(await gate([top],[],'edit'),false,'view is not edit');assert.equal(await gate([other],[],'view'),false,'other folders stay closed');assert.equal(await gate([],[of2.id],'view'),false);
 assert.equal(await gate([],[],'view'),false,'nothing requested is denied');assert.equal(await gate([crypto.randomUUID()],[],'view'),false,'unknown folder');
 const aid=crypto.randomUUID();await acc({actionId:aid,action:'grant',folderId:sub,memberUserId:customer,level:'edit'});
 assert.equal((await one('select (pro_company_folder_access_mutate($1,$2)->>$3)::boolean v',[owner,{action:'grant',actionId:aid,folderId:sub,memberUserId:customer,level:'edit'},'replayed'])).v,true,'idempotent replay');
 await assert.rejects(()=>acc({actionId:aid,action:'grant',folderId:sub,memberUserId:customer,level:'view'}),code('22023'),'action id reused');
 assert.equal(await gate([sub,subsub],[rf.id],'edit'),true);assert.equal(await gate([top],[],'edit'),false,'the child grant does not open the parent');
 const rd=(await one('select pro_company_folder_access_read($1,$2) v',[owner,sub])).v;assert.equal(rd.members.length,1);assert.deepEqual([rd.members[0].level,rd.members[0].effective],['edit','edit']);
 const rsub=(await one('select pro_company_folder_access_read($1,$2) v',[owner,subsub])).v;assert.deepEqual([rsub.members[0].level,rsub.members[0].effective],[null,'edit'],'inherited');
 const mine=(await one('select pro_company_folder_access_mine($1,$2) v',[owner,customer])).v;assert.deepEqual(mine.folders.map(f=>f.name).sort(),['Planos','Proyectos']);
 await assert.rejects(()=>acc({action:'grant',folderId:sub,memberUserId:stranger,level:'view'}),code('42501'),'only members of the company');
 await assert.rejects(()=>acc({action:'grant',folderId:crypto.randomUUID(),memberUserId:customer,level:'view'}),code('42501'),'unknown folder');
 await assert.rejects(()=>acc({action:'grant',folderId:sub,memberUserId:customer,level:'admin'}),code('22023'));
 await assert.rejects(()=>acc({action:'grant',folderId:sub,memberUserId:customer,level:'view',extra:1}),code('22023'));
 assert.equal((await one('select pro_company_folder_access_read($1,$2) v',[rival,sub])).v,null,'another account sees nothing');
 await assert.rejects(()=>acc({action:'revoke',folderId:sub,memberUserId:customer},rival),code('42501'));
 await acc({action:'revoke',folderId:sub,memberUserId:customer});assert.equal(await gate([sub],[],'edit'),false);assert.equal(await gate([sub],[rf.id],'view'),true,'the parent grant still applies');
 // a deactivated member loses access at once, grants are kept
 await db.query("update pro_company_members set active=false where owner_id=$1 and member_user_id=$2",[owner,customer]);
 assert.equal(await gate([top],[],'view'),false,'inactive member');assert.deepEqual((await one('select pro_company_folder_access_mine($1,$2) v',[owner,customer])).v.folders,[]);
 await db.query("update pro_company_members set active=true where owner_id=$1 and member_user_id=$2",[owner,customer]);assert.equal(await gate([top],[],'view'),true,'reactivated member keeps the grant');
 assert.equal(await gate([top],[],'view',owner),false,'the owner is not a member here');
 await assert.rejects(()=>db.query("update pro_company_folder_access_actions set level='view'"),code('23514'));
 assert.equal((await one('select count(*)::int v from pro_company_folder_access_actions where owner_id=$1',[owner])).v,3,'audit trail');
 for(const fn of ['pro_company_folder_gate(uuid,uuid,uuid[],uuid[],text)','pro_company_folder_access_mutate(uuid,jsonb)','pro_company_folder_access_read(uuid,uuid)','pro_company_folder_access_mine(uuid,uuid)','pro_company_folder_level(uuid,uuid,uuid)'])
  for(const [role,yes] of [['anon',false],['authenticated',false],['service_role',true]])assert.equal((await one('select has_function_privilege($1,$2,$3) v',[role,'public.'+fn,'EXECUTE'])).v,yes,role+' '+fn);
 assert.equal((await one("select has_table_privilege('authenticated','public.pro_company_folder_access','SELECT') v")).v,false);
 pass('416 folder permissions: default owner only, view/edit, inheritance, active members only, idempotent grant/revoke with audit, grants');
 // ---- 417 receipts of the import and conversion adapters ----
 const rec=async(input,actor=owner)=>(await one('select pro_file_transfer_record($1,$2) v',[actor,{actionId:crypto.randomUUID(),itemKey:'x',kind:'import',mode:'sandbox',name:'a.pdf',provider:'drive',reason:null,scope:'company',sha256:'ab'.repeat(6),sizeBytes:10,sourceFileId:null,status:'done',targetFileId:l1.id,workId:null,...input}])).v;
 const tid=crypto.randomUUID();
 let tr1=await rec({actionId:tid,itemKey:'sandbox-plano'});assert.equal(tr1.replayed,false);assert.equal(tr1.receipt.mode,'sandbox');
 tr1=await rec({actionId:tid,itemKey:'sandbox-plano',name:'otro.pdf'});assert.equal(tr1.replayed,true);assert.equal(tr1.receipt.name,'a.pdf','first receipt wins on retry');
 await rec({actionId:tid,itemKey:'sandbox-foto',name:'foto.jpg'});
 await rec({kind:'import',status:'failed',reason:'type',targetFileId:null,itemKey:'sandbox-virus',name:'virus.exe'});
 await rec({kind:'convert',provider:'office',mode:'simulated',scope:'work',workId:work,sourceFileId:w2.id,targetFileId:w2.id,itemKey:w2.id,name:'dos.pdf'});
 await assert.rejects(()=>rec({kind:'import',provider:'office'}),code('23514'),'import is always from the drive');
 await assert.rejects(()=>rec({kind:'convert',provider:'office',mode:'sandbox'}),code('23514'),'convert has its own modes');
 await assert.rejects(()=>rec({status:'failed',reason:null,targetFileId:null}),code('23514'),'a failure needs a reason');
 await assert.rejects(()=>rec({status:'done',targetFileId:null}),code('23514'),'a success needs the target file');
 await assert.rejects(()=>rec({scope:'work',workId:null}),code('22023'),'a job receipt needs the job');
 await assert.rejects(()=>rec({extra:1}),code('22023'),'unknown fields');
 await assert.rejects(()=>rec({targetFileId:crypto.randomUUID()}),code('42501'),'unknown target');
 await assert.rejects(()=>rec({},rival),code('42501'),'another account cannot record on these files');
 const ti=(await one("select pro_file_transfers_read($1,'import',10) v",[owner])).v.items;assert.equal(ti.length,3);assert.equal((await one("select jsonb_array_length(pro_file_transfers_read($1,'convert',10)->'items') v",[owner])).v,1);
 assert.equal((await one("select jsonb_array_length(pro_file_transfers_read($1,'import',10)->'items') v",[rival])).v,0);
 await assert.rejects(()=>db.query("update pro_file_transfers set status='done'"),code('23514'));await assert.rejects(()=>db.query('delete from pro_file_transfers'),code('23514'));
 for(const fn of ['pro_file_transfer_record(uuid,jsonb)','pro_file_transfers_read(uuid,text,integer)'])
  for(const [role,yes] of [['anon',false],['authenticated',false],['service_role',true]])assert.equal((await one('select has_function_privilege($1,$2,$3) v',[role,'public.'+fn,'EXECUTE'])).v,yes,role+' '+fn);
 pass('417 receipts: idempotent import/convert receipts, valid modes only, append only, owner scoped, grants');
 // @@GROUPS@@

 console.log(`${checks} file-ops contract groups passed; in-memory PGlite only.`);
}finally{await db.close();}

// LOCAL PRO ONLY (2026-11-17): disposable in-memory PGlite verification of pro-work-activity-local.sql.
// Installs the whole ordered local manifest (same foundation stubs as verify-local-preparation-db.mjs), seeds one job
// through the real module writers (tasks, customer ledger, change orders) plus minimal fixture rows for files and a
// customer invitation, then checks: authorization (owner, read_only / member company roles, outsider, removed member,
// another owner's job → 42501), newest-first ordering, keyset pagination over equal timestamps, invalid queries,
// that reading writes nothing (fingerprints of every source table), that the immutable triggers still refuse
// updates, and direct-role grants. No Supabase, network or shared database.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {localSqlManifest} from './local-sql-manifest.mjs';
const root=new URL('../../',import.meta.url),db=new PGlite();
const owner='00000000-0000-4000-8000-000000000001',member='00000000-0000-4000-8000-000000000002',reader='00000000-0000-4000-8000-000000000003',outsider='00000000-0000-4000-8000-000000000004',customer='00000000-0000-4000-8000-000000000005',otherOwner='00000000-0000-4000-8000-000000000006';
const code=c=>e=>{assert.equal(e.code,c,`${c} expected, got ${e.code}: ${e.message}`);return true;};
const foundation=await readFile(new URL('scripts/pro/verify-direct-project-quotes-db.mjs',root),'utf8');
const begin=foundation.indexOf('await db.exec(`')+'await db.exec(`'.length,end=foundation.indexOf('`);',begin);
assert.ok(begin>14&&end>begin);const ddl=foundation.slice(begin,end);assert.ok(!ddl.includes('${'));
try{
 await db.exec(ddl);
 await db.exec(`create table auth.users(id uuid primary key);create function public.uuid_generate_v4() returns uuid language sql as $$select gen_random_uuid()$$;
 create function auth.role() returns text language sql as $$select current_user::text$$;
 create table projects(id uuid primary key,client_id uuid,title text,status text,allow_direct_contact boolean);
 create schema cron;create table cron.job(jobname text primary key,schedule text,command text);
 create function cron.schedule(p_name text,p_schedule text,p_command text) returns bigint language plpgsql as $$begin insert into cron.job values(p_name,p_schedule,p_command) on conflict(jobname) do update set schedule=excluded.schedule,command=excluded.command;return 1;end$$;
 create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text);alter table storage.objects enable row level security;
 insert into profiles(id,full_name,role,is_disabled,is_provider) values('${owner}','Dueña Activa','professional',false,true),('${member}','Miembro Equipo','professional',false,false),('${reader}','Lectora Equipo','professional',false,false),('${outsider}','Cuenta Ajena','professional',false,true),('${customer}','Cliente Cuenta','client',false,false),('${otherOwner}','Otro Dueño','professional',false,true);`);
 const notifications=await readFile(new URL('supabase/migrations/002_sprint2.sql',root),'utf8');
 await db.exec(notifications.slice(notifications.indexOf('CREATE TABLE IF NOT EXISTS public.notifications'),notifications.indexOf('-- SAVED PROFESSIONALS')));
 const emptyDoc=clientId=>({version:1,clients:[{id:clientId,name:'Cliente actividad',email:'',phone:'',notes:'',archived:false}],products:[],movements:[],work:[],availability:[],quotes:[],quoteLinks:[],social:[]});
 let activitySql='';
 for(const step of localSqlManifest){
  if(step.ifMissing&&(await db.query('select to_regclass($1) is not null present',[step.ifMissing])).rows[0].present)continue;
  let text=await readFile(new URL('docs/pro/sql/'+step.file,root),'utf8');
  if(step.file==='identity-lookup-maintenance-local.sql')text=text.replace('create extension if not exists pg_cron;','');
  if(step.file==='pro-work-activity-local.sql')activitySql=text;
  try{await db.exec(text);}catch(error){throw new Error('Manifest SQL failed: '+step.file,{cause:error});}
  if(step.file==='memberships-draft.sql')for(const id of [owner,otherOwner])await db.query('select pro_save_workspace($1,$2,0)',[id,emptyDoc('activity-client')]);
 }
 assert.ok(activitySql,'pro-work-activity-local.sql must be in the manifest');
 for(const [id,profile] of [[owner,'30000000-0000-4000-8000-000000000001'],[outsider,'30000000-0000-4000-8000-000000000002'],[otherOwner,'30000000-0000-4000-8000-000000000003']]){
  await db.query('insert into professionals(id,profile_id,business_name,slug,is_banned) values($1,$2,$3,$4,false)',[profile,id,'Empresa '+id.slice(-1),'activity-'+id.slice(-1)]);
  await db.query("insert into pro_memberships(user_id,status) values($1,'active')",[id]);
 }
 const work='activity-work',otherWork='activity-other-work';
 await db.query('insert into pro_work(user_id,id,client,service,stage,start,"end","clientId",cancelled) values($1,$2,$3,$4,$5,$6,$7,$8,false)',[owner,work,'Cliente actividad','Remodelación actividad','scheduled','','','activity-client']);
 await db.query('insert into pro_work(user_id,id,client,service,stage,start,"end","clientId",cancelled) values($1,$2,$3,$4,$5,$6,$7,$8,false)',[otherOwner,otherWork,'Cliente actividad','Trabajo ajeno','scheduled','','','activity-client']);
 await db.query("insert into pro_company_members(owner_id,member_user_id,member_name,role) values($1,$2,'Miembro Equipo','member'),($1,$3,'Lectora Equipo','read_only')",[owner,member,reader]);
 const read=async(actor,o=owner,w=work,before=null,beforeId=null,limit=20)=>(await db.query('select pro_work_activity_read($1,$2,$3,$4,$5,$6) value',[actor,o,w,before,beforeId,limit])).rows[0].value;
 assert.deepEqual((await read(owner)).items,[]);assert.equal((await read(owner)).nextCursor,null);
 // Real writers: two tasks (one completed), agreement + payment, change order proposed then withdrawn.
 const tasks=[crypto.randomUUID(),crypto.randomUUID()];
 for(const [i,taskId] of tasks.entries())await db.query('select pro_work_tasks_mutate($1,$2)',[owner,{action:'create',workId:work,taskId,actionId:crypto.randomUUID(),revision:0,title:'Tarea '+(i+1),details:'Detalle privado',dueDate:null,assignee:''}]);
 await db.query('select pro_work_tasks_mutate($1,$2)',[owner,{action:'complete',workId:work,taskId:tasks[0],actionId:crypto.randomUUID(),revision:1}]);
 const core=async()=>(await db.query('select revision from pro_workspace_core where user_id=$1',[owner])).rows[0].revision;
 await db.query('select pro_record_client_operation($1,$2,$3)',[owner,{actionId:crypto.randomUUID(),clientId:'activity-client',workId:work,kind:'agreement',amountCents:100000,note:'Acuerdo'},await core()]);
 await db.query('select pro_record_client_operation($1,$2,$3)',[owner,{actionId:crypto.randomUUID(),clientId:'activity-client',workId:work,kind:'payment',amountCents:25000,note:'Adelanto'},await core()]);
 const changeId=crypto.randomUUID();
 await db.query('select pro_work_changes_mutate($1,$2)',[owner,{action:'propose',id:changeId,actionId:crypto.randomUUID(),workId:work,baseCents:100000,reason:'Más enchufes',lines:[{description:'Enchufe',amountCents:5000}]}]);
 await db.query('select pro_work_changes_mutate($1,$2)',[owner,{action:'withdraw',id:changeId,actionId:crypto.randomUUID(),revision:1}]);
 // Fixture rows for modules that need Storage: two confirmed uploads with the SAME receipt time (tie on «at»),
 // one unconfirmed upload (must not appear) and an accepted customer invitation.
 const tie=new Date(Date.now()+60000).toISOString(),files=[crypto.randomUUID(),crypto.randomUUID(),crypto.randomUUID()],hash='a'.repeat(64);
 for(const [i,id] of files.entries()){
  await db.query('insert into pro_work_files(id,owner_id,work_id,source_name,name,mime_type,raw_sha256,sha256,size_bytes,object_path,ready) values($1,$2,$3,$4,$4,$5,$6,$6,10,$7,$8)',[id,owner,work,`plano-${i}.pdf`,'application/pdf',hash,owner+'/'+id+'.pdf',i<2]);
  await db.query('insert into pro_work_file_upload_actions(actor_id,file_id,input,result,at) values($1,$2,$3,$4,$5)',[owner,id,{},i<2?{ok:true}:null,tie]);
 }
 const invitation=crypto.randomUUID();
 await db.query("insert into pro_work_client_invitations(id,owner_id,work_id,token_hash,expires_at,accepted_by,accepted_at) values($1,$2,$3,$4,clock_timestamp()+interval '3 days',$5,clock_timestamp()+interval '2 minutes')",[invitation,owner,work,'b'.repeat(64),customer]);
 const sources=['pro_work_task_history','pro_work_task_actions','pro_client_entries','pro_work_changes','pro_work_change_actions','pro_work_files','pro_work_file_upload_actions','pro_work_client_invitations','pro_private_estimate_publication_events','pro_invoice_payment_applications','pro_daily_log_history','pro_work_update_history','pro_work','pro_company_members'];
 const fingerprint=async()=>{const out={};for(const t of sources)out[t]=(await db.query(`select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text)::text,'[]')) h from ${t} r`)).rows[0].h;return out;};
 const before=await fingerprint();
 const full=await read(owner,owner,work,null,null,50);
 const kinds=full.items.map(i=>i.kind);
 assert.deepEqual(kinds,['client_invitation_accepted','file_added','file_added','client_invited','change_withdraw','change_propose','payment_recorded','task_completed','task_created','task_created'],JSON.stringify(kinds));
 for(let i=1;i<full.items.length;i++){const a=full.items[i-1],b=full.items[i];assert.ok(a.at>b.at||a.at===b.at&&a.id>b.id,'newest first with id tie-break');}
 assert.equal(new Set(full.items.map(i=>i.id)).size,full.items.length);
 assert.ok(full.items.every(i=>/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/.test(i.at)));
 const byKind=k=>full.items.find(i=>i.kind===k);
 assert.equal(byKind('client_invitation_accepted').actorName,'Cliente Cuenta');assert.equal(byKind('client_invitation_accepted').actorRole,'client');assert.equal(byKind('client_invitation_accepted').section,'client');
 assert.equal(byKind('task_completed').data.title,'Tarea 1');assert.equal(byKind('task_completed').actorName,'Dueña Activa');assert.equal(byKind('task_completed').ref.taskId,tasks[0]);
 assert.equal(byKind('payment_recorded').data.amountCents,25000);assert.equal(byKind('change_propose').data.amountCents,5000);assert.equal(byKind('change_propose').data.title,'Más enchufes');
 assert.ok(!JSON.stringify(full).includes('Detalle privado'),'task details are never projected');
 assert.ok(!full.items.some(i=>i.ref.fileId===files[2]),'unconfirmed upload hidden');
 // Keyset pagination (page size 2, including the tie on the two uploads) returns exactly the full list.
 const walked=[];let cursor=null,pages=0;
 do{const page=await read(owner,owner,work,cursor?.before??null,cursor?.beforeId??null,2);assert.ok(page.items.length<=2);walked.push(...page.items);cursor=page.nextCursor;pages++;}while(cursor&&pages<20);
 assert.deepEqual(walked.map(i=>i.id),full.items.map(i=>i.id));assert.equal(pages,5);
 const exact=await read(owner,owner,work,null,null,full.items.length);assert.equal(exact.nextCursor,null);
 // Authorization.
 assert.equal((await read(reader)).items.length,full.items.length>20?20:full.items.length,'read_only member can read');
 assert.deepEqual((await read(member)).items.map(i=>i.id),(await read(owner)).items.map(i=>i.id),'member reads the same history');
 await assert.rejects(()=>read(outsider),code('42501'));
 await assert.rejects(()=>read(customer),code('42501'));
 await assert.rejects(()=>read(owner,owner,otherWork),code('42501'),'another owner\'s job id');
 await assert.rejects(()=>read(otherOwner,otherOwner,work),code('42501'));
 await assert.rejects(()=>read(reader,otherOwner,otherWork),code('42501'),'member of another company');
 await assert.rejects(()=>read(owner,owner,'missing-job'),code('42501'));
 await assert.rejects(()=>read(owner,owner,work,null,null,0),code('22023'));
 await assert.rejects(()=>read(owner,owner,work,null,null,51),code('22023'));
 await assert.rejects(()=>read(owner,owner,work,tie,null,5),code('22023'));
 await db.query('update pro_company_members set active=false where owner_id=$1 and member_user_id=$2',[owner,reader]);
 await assert.rejects(()=>read(reader),code('42501'),'removed member');
 await db.query('update pro_company_members set active=true where owner_id=$1 and member_user_id=$2',[owner,reader]);
 await db.query("update pro_memberships set expires_at=now()-interval '1 day' where user_id=$1",[owner]);
 await assert.rejects(()=>read(owner),code('42501'),'owner without Pro');
 await assert.rejects(()=>read(reader),code('42501'),'member of a company without Pro');
 await db.query('update pro_memberships set expires_at=null where user_id=$1',[owner]);
 // Reading wrote nothing; the source history stays immutable.
 const after=await fingerprint();
 assert.deepEqual(after,before);
 await assert.rejects(()=>db.query("update pro_work_task_history set action='update' where owner_id=$1",[owner]),code('23514'));
 await assert.rejects(()=>db.query("update pro_work_file_upload_actions set result='{}' where file_id=$1",[files[0]]),code('23514'));
 await assert.rejects(()=>db.query("update pro_work_client_invitations set accepted_at=now() where id=$1",[invitation]),code('23514'));
 assert.equal((await db.query("select count(*)::int n from pg_proc where proname='pro_work_activity_read' and provolatile='s'")).rows[0].n,1,'stable (read-only) function');
 assert.equal((await db.query("select count(*)::int n from pg_trigger t join pg_proc p on p.oid=t.tgfoid where p.proname like 'pro_work_activity%'")).rows[0].n,0);
 for(const role of ['anon','authenticated'])assert.equal((await db.query("select has_function_privilege($1,'public.pro_work_activity_read(uuid,uuid,text,timestamptz,text,integer)','EXECUTE') yes",[role])).rows[0].yes,false);
 assert.equal((await db.query("select has_function_privilege('service_role','public.pro_work_activity_read(uuid,uuid,text,timestamptz,text,integer)','EXECUTE') yes")).rows[0].yes,true);
 await db.exec(activitySql);assert.deepEqual((await read(owner,owner,work,null,null,50)).items.map(i=>i.id),full.items.map(i=>i.id),'idempotent reapply');
 console.log(`PASS work activity: ${full.items.length} events from immutable history/receipt tables, newest first, keyset pages over equal timestamps (${pages} pages of 2), owner/member/read_only allowed, outsider/customer/other company/removed member/no Pro 42501, invalid queries 22023, no writes (source fingerprints unchanged), immutable triggers intact, service_role only, idempotent reapply.`);
}finally{await db.close();}

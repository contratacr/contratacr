// LOCAL PRO ONLY (Ronda F2, 2026-11-19): disposable in-memory PGlite verification of work-file-mentions-local.sql (row 30).
// Installs the whole ordered local manifest (same foundation stubs as verify-pro-cost-codes-db.mjs), then checks the
// @mention picker targets (active members of THAT job only), the atomic comment + mentions writer (through the
// established pro_work_file_versions_mutate), validation (body must contain "@"+name, <= 10, no duplicates, no author,
// team thread only), idempotent receipts, target changes (revoked/regenerated/foreign/disabled -> 40001), the member's
// isolated inbox (no file ids/URLs, hidden on revoke/archive/no Pro, mark-read receipts), immutability, RLS/grants and
// an idempotent reapply. No notifications/outbox rows are written. No Supabase, network or shared database.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {localSqlManifest,localSqlDependencies} from './local-sql-manifest.mjs';
import {registerHooks} from 'node:module';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
// The API route parses reads with the strict schemas of src/lib/pro/file-mentions.ts: check the SQL against them here.
const libRoot=new URL('../../src/lib/',import.meta.url).href;
registerHooks({resolve(s,c,n){return n(c.parentURL?.startsWith(libRoot)&&s.startsWith('.')&&!/\.[a-z]+$/i.test(s)?s+'.ts':s,c);},load(u,c,n){return u.startsWith(libRoot)&&u.endsWith('.ts')?{format:'module',source:ts.transpileModule(readFileSync(new URL(u),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText,shortCircuit:true}:n(u,c);}});
const schemas=await import('../../src/lib/pro/file-mentions.ts');
const root=new URL('../../',import.meta.url),db=new PGlite();
const owner='00000000-0000-4000-8000-000000000001',rival='00000000-0000-4000-8000-000000000002',ana='00000000-0000-4000-8000-000000000003',beto='00000000-0000-4000-8000-000000000004',carla='00000000-0000-4000-8000-000000000005',stranger='00000000-0000-4000-8000-000000000006';
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
 insert into profiles(id,full_name,role,is_disabled,is_provider) values('${owner}','Dueña Archivos','professional',false,true),('${rival}','Otra Empresa','professional',false,true),
  ('${ana}','Ana Perfil','client',false,false),('${beto}','Beto Perfil','client',false,false),('${carla}','Carla Perfil','client',false,false),('${stranger}','Cuenta Ajena','client',false,false);`);
 const notifications=await readFile(new URL('supabase/migrations/002_sprint2.sql',root),'utf8');
 await db.exec(notifications.slice(notifications.indexOf('CREATE TABLE IF NOT EXISTS public.notifications'),notifications.indexOf('-- SAVED PROFESSIONALS')));
 const emptyDoc=clientId=>({version:1,clients:[{id:clientId,name:'Cliente archivos',email:'',phone:'',notes:'',archived:false}],products:[],movements:[],work:[],availability:[],quotes:[],quoteLinks:[],social:[]});
 let moduleSql='';
 const needed=new Set(['work-file-mentions-local.sql']);for(let grew=true;grew;){grew=false;for(const [from,to] of localSqlDependencies)if(needed.has(to)&&!needed.has(from)){needed.add(from);grew=true;}}
 for(const step of localSqlManifest){
  if(step.ifMissing&&(await db.query('select to_regclass($1) is not null present',[step.ifMissing])).rows[0].present)continue;
  let text=await readFile(new URL('docs/pro/sql/'+step.file,root),'utf8');
  if(step.file==='identity-lookup-maintenance-local.sql')text=text.replace('create extension if not exists pg_cron;','');
  if(step.file==='work-file-mentions-local.sql')moduleSql=text;
  try{await db.exec(text);}catch(error){if(needed.has(step.file))throw new Error('Manifest SQL failed: '+step.file,{cause:error});await db.exec('rollback');console.log('SKIP unrelated module that does not install here: '+step.file);}
  if(step.file==='memberships-draft.sql')for(const id of [owner,rival])await db.query('select pro_save_workspace($1,$2,0)',[id,emptyDoc('files-client')]);
 }
 assert.ok(moduleSql,'work-file-mentions-local.sql must be in the manifest');
 for(const id of [owner,rival])await db.query("insert into pro_memberships(user_id,status) values($1,'active')",[id]);
 const work='files-work',work2='files-work-2';
 for(const [user,id,title] of [[owner,work,'Remodelación de cocina'],[owner,work2,'Baño principal'],[rival,'rival-work','Trabajo ajeno']])
  await db.query('insert into pro_work(user_id,id,client,service,stage,start,"end","clientId",cancelled) values($1,$2,$3,$4,$5,$6,$7,$8,false)',[user,id,'Cliente archivos',title,'scheduled','','','files-client']);
 const one=async(sql,args)=>(await db.query(sql,args)).rows[0];
 const fileRow=async(user,w,name)=>{const id=crypto.randomUUID();await db.query("insert into pro_work_files(id,owner_id,work_id,source_name,name,mime_type,raw_sha256,sha256,size_bytes,object_path,ready) values($1,$2,$3,$4,$4,'application/pdf',$5,$5,100,$6,true)",[id,user,w,name,'a'.repeat(64),user+'/'+id+'.pdf']);return id;};
 const grantRow=async(member,name,w=work,ownerId=owner)=>{const id=crypto.randomUUID(),source=crypto.randomUUID();await db.query("insert into pro_team_grants(id,owner_id,work_id,member_user_id,member_name,role,source_invite_id) values($1,$2,$3,$4,$5,'viewer',$6)",[id,ownerId,w,member,name,source]);return{id,source};};
 const plan=await fileRow(owner,work,'plano cocina.pdf'),planV2=await fileRow(owner,work,'plano cocina v2.pdf'),otherFile=await fileRow(owner,work2,'baño.pdf');
 const gAna=await grantRow(ana,'Ana Rojas'),gBeto=await grantRow(beto,''),gCarlaOther=await grantRow(carla,'Carla Mora',work2);
 const targets=async(actor=owner,w=work)=>{const v=(await one('select pro_work_file_mention_targets($1,$2) v',[actor,w])).v;schemas.fileMentionTargetsSchema.parse(v);return v;};
 const write=async(input,actor=owner)=>{const v=(await one('select pro_work_file_comment_with_mentions($1,$2) v',[actor,input])).v;schemas.fileMentionCommentResultSchema.parse(v);return v;};
 const inbox=async(actor,status='unread',after=null)=>{const v=(await one('select pro_work_file_mention_inbox($1,$2,$3) v',[actor,status,after])).v;schemas.fileMentionNoticesPageSchema.parse(v);return v;};
 const markRead=async(actor,input)=>{const v=(await one('select pro_work_file_mention_notice_mark_read($1,$2) v',[actor,input])).v;schemas.fileMentionNoticeResultSchema.parse(v);return v;};
 const mentionsRead=async(ids,actor=owner,w=work)=>{const v=(await one('select pro_work_file_comment_mentions_read($1,$2,$3) v',[actor,w,ids])).v;schemas.fileCommentMentionsSchema.parse(v);return v;};
 const counts=async()=>(await one('select (select count(*) from notifications)::int n,(select count(*) from pro_work_file_comments)::int c,(select count(*) from pro_work_file_comment_mentions)::int m,(select count(*) from pro_work_file_mention_notices)::int x'));
 const baseNotifications=(await counts()).n;
 const comment=(body,extra={})=>({action:'comment_create',actionId:crypto.randomUUID(),workId:work,fileId:plan,commentId:crypto.randomUUID(),thread:'team',versionNo:null,body,...extra});
 const mention=(user,g)=>({userId:user,grantId:g.id,sourceInviteId:g.source});

 // ---- Targets ----
 let t=await targets();
 assert.deepEqual(t.items.map(i=>[i.userId,i.name]),[[ana,'Ana Rojas'],[beto,'Beto Perfil']],'active members of THAT job; empty captured name falls back to the profile name');
 assert.equal(t.items[0].grantId,gAna.id);assert.equal(t.items[0].sourceInviteId,gAna.source);
 assert.deepEqual((await targets(owner,work2)).items.map(i=>i.userId),[carla]);
 await assert.rejects(()=>targets(rival),code('42501'),'other owner');await assert.rejects(()=>targets(ana),code('42501'),'member cannot list');
 await db.query('update profiles set is_disabled=true where id=$1',[beto]);assert.deepEqual((await targets()).items.map(i=>i.userId),[ana],'disabled accounts are not offered');
 await db.query('update profiles set is_disabled=false where id=$1',[beto]);
 pass('targets: active, enabled members of this job only, owner-only, name fallback');

 // ---- Validation ----
 const ok=comment('Revisar la cota @Ana Rojas por favor',{mentions:[mention(ana,gAna)]});
 for(const bad of [{...ok,mentions:[]},{...ok,mentions:Array.from({length:11},()=>mention(ana,gAna))},{...ok,thread:'client',versionNo:1},{...ok,extra:1},{...ok,mentions:[{...mention(ana,gAna),name:'x'}]},
  {...ok,mentions:[mention(ana,gAna),mention(ana,gAna)]},{...ok,mentions:[mention(owner,gAna)]},{...ok,body:'sin arroba Ana Rojas'},{...ok,body:''},{...ok,actionId:'x'}])
  await assert.rejects(()=>write({...bad,actionId:bad.actionId==='x'?'x':crypto.randomUUID(),commentId:crypto.randomUUID()}),code('22023'),JSON.stringify(bad).slice(0,120));
 for(const bad of [{...ok,mentions:[mention(carla,gCarlaOther)]},{...ok,mentions:[{...mention(ana,gAna),sourceInviteId:crypto.randomUUID()}]},{...ok,mentions:[{...mention(ana,gAna),userId:beto}]},{...ok,body:'@Beto Perfil',mentions:[mention(beto,gAna)]}])
  await assert.rejects(()=>write({...bad,actionId:crypto.randomUUID(),commentId:crypto.randomUUID()}),code('40001'),'member of another job / old generation / mismatched user');
 await assert.rejects(()=>write({...ok,actionId:crypto.randomUUID(),commentId:crypto.randomUUID(),workId:'rival-work'}),code('42501'));
 await assert.rejects(()=>write({...ok,actionId:crypto.randomUUID(),commentId:crypto.randomUUID()},rival),code('42501'));
 await assert.rejects(()=>write({...ok,actionId:crypto.randomUUID(),commentId:crypto.randomUUID(),fileId:otherFile}),code('42501'),'file of another job');
 assert.deepEqual(await counts(),{n:baseNotifications,c:0,m:0,x:0},'rejected writes leave no comment, mention or notice');
 pass('validation: body names each recipient, 1..10, unique, not the author, team thread, same job, current generation');

 // ---- Write, receipts, chips ----
 const first=await write(ok);
 assert.equal(first.comment.thread,'team');assert.equal(first.comment.body,ok.body);assert.deepEqual(first.mentions,[{userId:ana,name:'Ana Rojas'}]);
 assert.deepEqual(await write(ok),first,'idempotent receipt');
 await assert.rejects(()=>write({...ok,body:ok.body+' x'}),code('22023'),'same actionId, other payload');
 await assert.rejects(()=>write({...ok,actionId:crypto.randomUUID()}),code('22023'),'comment id reused');
 // A comment created WITHOUT mentions (plain writer) can never get mentions with the same actionId.
 const plain=comment('Comentario sin menciones @Ana Rojas');await one('select pro_work_file_versions_mutate($1,$2) v',[owner,plain]);
 await assert.rejects(()=>write({...plain,mentions:[mention(ana,gAna)]}),code('22023'));
 // Two recipients, case-insensitive, on version 2 of a family.
 await one('select pro_work_file_versions_mutate($1,$2) v',[owner,{action:'add_version',actionId:crypto.randomUUID(),workId:work,fileId:plan,newFileId:planV2,note:null,revision:0}]);
 const long='x'.repeat(400);
 const two=comment('@ana rojas y @BETO PERFIL revisen la v2 '+long,{versionNo:2,mentions:[mention(beto,gBeto),mention(ana,gAna)]});
 const second=await write(two);assert.deepEqual(second.mentions.map(m=>m.name),['Ana Rojas','Beto Perfil']);
 const chips=await mentionsRead([first.comment.id,second.comment.id,plain.commentId]);
 assert.deepEqual(chips.items.map(i=>[i.commentId,i.mentions.length]).sort(),[[first.comment.id,1],[second.comment.id,2]].sort(),'comments without mentions are omitted');
 await assert.rejects(()=>mentionsRead([first.comment.id],rival,work),code('42501'));await assert.rejects(()=>mentionsRead([]),code('22023'));
 assert.deepEqual((await mentionsRead([first.comment.id],owner,work2)).items,[],'other job of the same owner does not leak');
 pass('atomic comment + mentions through the established writer, idempotent receipt, legacy identity guard, chips read');

 // ---- Member inbox ----
 let a=await inbox(ana);assert.equal(a.unreadCount,2);assert.equal(a.items.length,2);
 const latest=a.items[0];assert.equal(latest.service,'Remodelación de cocina');assert.equal(latest.fileName,'plano cocina v2.pdf');assert.equal(latest.versionNo,2);assert.equal(latest.authorName,'Dueña Archivos');
 assert.equal(latest.excerpt.length,280);assert.ok(latest.excerpt.endsWith('…'));assert.match(latest.dayCr,/^\d{4}-\d{2}-\d{2}$/);
 assert.equal(a.items[1].fileName,'plano cocina.pdf','comment on the file in general -> current file name at that moment');
 const raw=JSON.stringify(a);for(const secret of [plan,planV2,owner,work,'object','path','url'])assert.ok(!raw.includes(secret),'inbox never exposes '+secret);
 assert.equal((await inbox(beto)).unreadCount,1);assert.equal((await inbox(carla)).unreadCount,0);assert.equal((await inbox(stranger)).unreadCount,0);assert.equal((await inbox(owner)).unreadCount,0);
 await assert.rejects(()=>inbox(ana,'bad'),code('22023'));await assert.rejects(()=>inbox(ana,'unread',crypto.randomUUID()),code('22023'));
 const read={action:'mark_read',actionId:crypto.randomUUID(),noticeId:latest.id};
 const marked=await markRead(ana,read);assert.equal(marked.noticeId,latest.id);assert.deepEqual(await markRead(ana,read),marked,'mark-read receipt');
 await assert.rejects(()=>markRead(ana,{...read,noticeId:a.items[1].id}),code('22023'),'reused notice action');
 await assert.rejects(()=>markRead(beto,{...read,actionId:crypto.randomUUID()}),code('42501'),'another member');
 const again=await markRead(ana,{...read,actionId:crypto.randomUUID()});assert.equal(again.readAt,marked.readAt,'already read keeps its date');
 a=await inbox(ana);assert.equal(a.unreadCount,1);assert.equal((await inbox(ana,'all')).items.length,2);
 // Archive hides, restore shows again; revoke hides; a new generation does not resurrect old notices.
 const c1=(await one('select revision from pro_work_file_comments where id=$1',[first.comment.id])).revision;
 await one('select pro_work_file_versions_mutate($1,$2) v',[owner,{action:'comment_archive',actionId:crypto.randomUUID(),workId:work,commentId:first.comment.id,revision:c1}]);
 assert.equal((await inbox(ana)).unreadCount,0,'archived comment hides its notice');
 await one('select pro_work_file_versions_mutate($1,$2) v',[owner,{action:'comment_restore',actionId:crypto.randomUUID(),workId:work,commentId:first.comment.id,revision:c1+1}]);
 assert.equal((await inbox(ana)).unreadCount,1);
 await db.query("update pro_memberships set expires_at=now()-interval '1 day' where user_id=$1",[owner]);assert.equal((await inbox(ana,'all')).items.length,0,'owner without Pro tools');
 await db.query('update pro_memberships set expires_at=null where user_id=$1',[owner]);
 await db.query('update pro_team_grants set active=false where id=$1',[gBeto.id]);assert.equal((await inbox(beto,'all')).items.length,0,'revoked member');
 await assert.rejects(()=>write(comment('@Beto Perfil',{mentions:[mention(beto,gBeto)]})),code('40001'),'revoked member cannot be mentioned');
 await db.query('update pro_team_grants set active=true,source_invite_id=$2 where id=$1',[gBeto.id,crypto.randomUUID()]);assert.equal((await inbox(beto,'all')).items.length,0,'new access generation');
 // Paging.
 for(let i=0;i<21;i++)await write(comment('@Ana Rojas nota '+i,{mentions:[mention(ana,gAna)]}));
 const p1=await inbox(ana,'all');assert.equal(p1.items.length,20);assert.ok(p1.nextCursor);const p2=await inbox(ana,'all',p1.nextCursor);assert.equal(p2.items.length,3);assert.equal(p2.nextCursor,null);
 assert.equal((await counts()).n,baseNotifications,'no notifications rows (no sends/outbox)');
 pass('member inbox: snapshot without file identifiers, unread count, mark-read receipts, hidden on archive/revoke/new generation/no Pro, paging');

 // ---- Security and integrity ----
 await assert.rejects(()=>db.query('update pro_work_file_comment_mentions set name=$1',['x']),code('23514'));
 await assert.rejects(()=>db.query("update pro_work_file_mention_actions set result='{}'"),code('23514'));
 await assert.rejects(()=>db.query("update pro_work_file_mention_notice_actions set result='{}'"),code('23514'));
 await assert.rejects(()=>db.query("update pro_work_file_mention_notices set excerpt='x' where id=$1",[latest.id]),code('23514'));
 await assert.rejects(()=>db.query('update pro_work_file_mention_notices set read_at=null where id=$1',[latest.id]),code('23514'));
 await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${owner}',false);`);
 for(const tab of ['pro_work_file_comment_mentions','pro_work_file_mention_actions','pro_work_file_mention_notices','pro_work_file_mention_notice_actions'])await assert.rejects(()=>db.query(`select * from ${tab}`),code('42501'));
 await assert.rejects(()=>targets(),code('42501'));await assert.rejects(()=>inbox(ana),code('42501'));
 await db.exec('reset role');
 for(const tab of ['pro_work_file_comment_mentions','pro_work_file_mention_actions','pro_work_file_mention_notices','pro_work_file_mention_notice_actions'])assert.equal((await one('select relrowsecurity v from pg_class where oid=$1::regclass',['public.'+tab])).v,true,tab+' RLS');
 for(const fn of ['pro_work_file_mention_targets(uuid,text)','pro_work_file_comment_with_mentions(uuid,jsonb)','pro_work_file_comment_mentions_read(uuid,text,uuid[])','pro_work_file_mention_inbox(uuid,text,uuid)','pro_work_file_mention_notice_mark_read(uuid,jsonb)'])
  for(const [role,yes] of [['anon',false],['authenticated',false],['service_role',true]])assert.equal((await one('select has_function_privilege($1,$2,$3) v',[role,'public.'+fn,'EXECUTE'])).v,yes,role+' '+fn);
 for(const fn of (await db.query("select p.oid::regprocedure::text f,p.prosecdef d from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname like 'pro_wfm_%' or p.proname like 'pro_work_file_mention%' or p.proname like 'pro_work_file_comment_%mentions%')")).rows)assert.equal(fn.d,false,fn.f+' is security invoker');
 // Deleting the file removes its comments, mentions and notices (cascade).
 const before=JSON.stringify(await inbox(ana,'all'));await db.exec(moduleSql);assert.equal(JSON.stringify(await inbox(ana,'all')),before,'idempotent reapply keeps data');
 await db.query('delete from pro_work_file_family_members where owner_id=$1',[owner]).catch(()=>{});
 await db.query('delete from pro_work_files where owner_id=$1 and work_id=$2',[owner,work]);
 assert.equal((await counts()).x,0,'file deletion cascades to notices');
 pass('immutability, RLS on, service_role-only execute, security invoker, idempotent reapply, cascade with the file');
 console.log(`${checks} file-mention contract groups passed; in-memory PGlite only.`);
}finally{await db.close();}

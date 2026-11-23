// LOCAL PRO ONLY (rows 35 and 39, 2026-11-23): disposable in-memory PGlite verification of migrations 343, 392 and 393 on top of the ordered local manifest:
// formal partial response of a shared version (idempotent, frozen decisions, customer-only), direct conversion of the approved lines into the agreement of a job,
// and the acceptance recorded by the professional outside the platform. Checks the agreement ledger row, receipts, immutability, CRC-only and ACLs.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {localSqlManifest} from './local-sql-manifest.mjs';
const root=new URL('../../',import.meta.url),db=new PGlite();
const owner='00000000-0000-4000-8000-000000000001',customer='00000000-0000-4000-8000-000000000002',stranger='00000000-0000-4000-8000-000000000003';
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
 insert into profiles(id,full_name,role,is_disabled,is_provider) values('${owner}','Empresa Acuerdos','professional',false,true),('${customer}','Cliente Ana Mora','client',false,false),('${stranger}','Otra Persona','client',false,false);`);
 const notifications=await readFile(new URL('supabase/migrations/002_sprint2.sql',root),'utf8');
 await db.exec(notifications.slice(notifications.indexOf('CREATE TABLE IF NOT EXISTS public.notifications'),notifications.indexOf('-- SAVED PROFESSIONALS')));
 for(const step of localSqlManifest){
  if(step.ifMissing&&(await db.query('select to_regclass($1) is not null present',[step.ifMissing])).rows[0].present)continue;
  let text=await readFile(new URL('docs/pro/sql/'+step.file,root),'utf8');
  if(step.file==='identity-lookup-maintenance-local.sql')text=text.replace('create extension if not exists pg_cron;','');
  try{await db.exec(text);}catch(error){throw new Error('Manifest SQL failed: '+step.file,{cause:error});}
 }
 const migrations=['343_pro_26_quote_convert_approved_lines.sql','392_pro_27_quote_line_response.sql','393_pro_27_quote_recorded_acceptance.sql'];
 for(const file of migrations){const text=await readFile(new URL('supabase/migrations/'+file,root),'utf8');try{await db.exec(text);}catch(error){throw new Error('Migration failed: '+file,{cause:error});}}
 for(const file of migrations.slice(1)){await db.exec(await readFile(new URL('supabase/migrations/'+file,root),'utf8'));}
 pass('migrations 343, 392 and 393 install and reapply idempotently');

 await db.query("insert into pro_memberships(user_id,status) values($1,'active')",[owner]);
 await db.query("insert into pro_workspace_core(user_id,document,revision) values($1,'{\"version\":1,\"social\":[]}',1)",[owner]);
 await db.query("insert into pro_clients(user_id,id,name,email,phone,notes,archived) values($1,'cli-1','Ana Mora','','','',false)",[owner]);
 for(const id of ['work-a','work-b','work-c'])await db.query('insert into pro_work(user_id,id,client,service,stage,start,"end","clientId",cancelled) values($1,$2,$3,$4,$5,$6,$7,$8,false)',[owner,id,'Ana Mora','Cocina '+id,'scheduled','2028-02-27T08:00:00-06:00','2028-02-27T09:00:00-06:00','cli-1']);
 const one=async(sql,args)=>(await db.query(sql,args)).rows[0];
 const issuer={issuerName:'Empresa Acuerdos',issuerIdType:'',issuerId:'',issuerEmail:'',issuerPhone:'',issuerAddress:'',issuerActivity:''};
 const mkLine=(description,price)=>({id:crypto.randomUUID(),description,unit:'u',qtyMilli:1000,unitPriceCents:price,discountBps:0,taxBps:0,catalogProductId:null});
 async function makeEstimate(workId,currency='CRC',lines=[mkLine('Gabinetes',100000),mkLine('Sobre de cuarzo',250000),mkLine('Instalacion',50000)]){
  const ctx=(await one('select pro_private_estimate_context($1,$2,$3,$4) v',[owner,null,'work',workId])).v,id=crypto.randomUUID();
  const input={action:'save',actionId:crypto.randomUUID(),estimateId:id,revision:0,clientId:ctx.client.id,clientFingerprint:ctx.clientFingerprint,refreshClient:false,source:ctx.source,issuer,title:'Cocina '+workId,notes:'',currency,validUntil:null,lines};
  await one('select pro_private_estimate_mutate($1,$2) v',[owner,input]);return {id,lines};
 }
 async function share(estimateId,revision=1){
  const publicationId=crypto.randomUUID(),email='ana@example.test',hash='c'.repeat(64);
  await db.query('select pro_private_estimate_publication_mutate($1,$2,$3)',[owner,{action:'publish',actionId:crypto.randomUUID(),publicationId,estimateId,estimateRevision:revision,recipient:{kind:'claim',email,codeHash:'1'.repeat(64)}},hash]);
  await db.query('select pro_private_estimate_publication_mutate($1,$2,$3,$4)',[customer,{action:'claim',actionId:crypto.randomUUID(),codeHash:'1'.repeat(64)},hash,email]);
  return publicationId;
 }
 const decide=(pid,line,decision,rev=0,actor=customer)=>one('select pro_quote_line_decide($1,$2) v',[actor,{actionId:crypto.randomUUID(),publicationId:pid,lineId:line,decision,note:'',revision:rev}]);

 // ---- Row 39: formal partial response ----
 const est=await makeEstimate('work-a');const pid=await share(est.id);const [l1,l2,l3]=est.lines.map(l=>l.id);
 const respond=(input,actor=customer)=>one('select pro_quote_line_respond($1,$2) v',[actor,input]).then(r=>r.v);
 const base={actionId:crypto.randomUUID(),publicationId:pid,note:'Solo gabinetes e instalacion'};
 await assert.rejects(()=>respond(base),code('22023'),'nothing decided yet');
 await decide(pid,l1,'approved');await decide(pid,l2,'declined');
 await assert.rejects(()=>respond({...base,actionId:crypto.randomUUID()}),code('22023'),'one line still pending');
 await decide(pid,l3,'approved');
 await assert.rejects(()=>respond(base,owner),code('42501'),'the owner cannot answer as the customer');
 await assert.rejects(()=>respond(base,stranger),code('42501'),'a stranger cannot answer');
 await assert.rejects(()=>respond({...base,note:'x'.repeat(301)}),code('22023'));
 await assert.rejects(()=>respond({...base,extra:1}),code('22023'));
 const r1=await respond(base);
 assert.deepEqual([r1.approvedCount,r1.declinedCount,r1.approvedCents,r1.declinedCents,r1.currency,r1.respondedByName,r1.note],[2,1,150000,250000,'CRC','Cliente Ana Mora','Solo gabinetes e instalacion']);
 assert.deepEqual(r1.approvedLineIds,[l1,l3]);assert.deepEqual(await respond(base),r1,'idempotent replay');
 await assert.rejects(()=>respond({...base,note:'otra'}),code('22023'),'reused action id');
 await assert.rejects(()=>respond({...base,actionId:crypto.randomUUID()}),code('40001'),'second response');
 await assert.rejects(()=>decide(pid,l2,'approved',1),code('22023'),'decisions are frozen after the formal response');
 assert.deepEqual((await one('select pro_quote_line_response_read($1,$2) v',[owner,pid])).v,r1,'the owner reads it');
 assert.deepEqual((await one('select pro_quote_line_response_read($1,$2) v',[customer,pid])).v,r1,'the customer reads it');
 await assert.rejects(()=>one('select pro_quote_line_response_read($1,$2) v',[stranger,pid]),code('42501'));
 await assert.rejects(()=>db.query('update pro_quote_line_responses set note=$1 where publication_id=$2',['x',pid]),code('23514'),'immutable');
 pass('formal partial response: both sides of the lines required, customer only, idempotent, CAS-free single response, frozen decisions, immutable');

 // ---- Row 39: direct conversion to the agreement ----
 const acceptIn=(extra={})=>({action:'partial_response',actionId:crypto.randomUUID(),publicationId:pid,workId:'work-a',...extra});
 const record=(input,actor=owner)=>one('select pro_quote_record_acceptance($1,$2) v',[actor,input]).then(r=>r.v);
 await assert.rejects(()=>record(acceptIn(),customer),code('42501'),'only the owner converts');
 await assert.rejects(()=>record(acceptIn({workId:null})),code('22023'),'a job is required when none is linked');
 await assert.rejects(()=>record(acceptIn({extra:1})),code('22023'));
 const conv=acceptIn(),c1=await record(conv);
 assert.deepEqual([c1.kind??c1.action,c1.totalCents,c1.lineCount,c1.workId,c1.method,c1.acceptedByName],['partial_response',150000,2,'work-a','partial_response','Cliente Ana Mora']);
 assert.deepEqual(await record(conv),c1,'idempotent replay');
 await assert.rejects(()=>record({...conv,workId:'work-b'}),code('22023'),'reused action id');
 await assert.rejects(()=>record(acceptIn({actionId:crypto.randomUUID()})),code('40001'),'already converted');
 const agreement=await one('select * from pro_private_estimate_work_agreements where owner_id=$1 and work_id=$2',[owner,'work-a']);
 assert.equal(Number(agreement.total_cents),150000);assert.equal(agreement.currency,'CRC');assert.equal(agreement.accepted_actor_id,customer);assert.equal(agreement.publication_id,c1.publicationId);
 assert.equal((await one('select status from pro_private_estimate_publication_states where publication_id=$1',[c1.publicationId])).status,'accepted');
 assert.equal((await one('select jsonb_array_length(content->\'lines\') n from pro_private_estimate_publications where id=$1',[c1.publicationId])).n,2);
 assert.equal((await one('select status from pro_private_estimate_publication_states where publication_id=$1',[pid])).status,'shared','the shared version and its decisions are unchanged');
 const mapping=(await one('select pro_private_estimate_work_mapping($1,$2,null) v',[owner,c1.publicationId])).v;assert.equal(mapping.agreement.totalCents,150000);
 const view=(await one('select pro_quote_recorded_acceptance_read($1,$2) v',[owner,{publicationId:pid}])).v;
 assert.equal(view.conversion.totalCents,150000);assert.equal(view.response.approvedCount,2);assert.equal(view.works.length,2);
 await assert.rejects(()=>db.query('update pro_quote_recorded_acceptances set evidence_note=$1 where publication_id=$2',['x',c1.publicationId]),code('23514'));
 await assert.rejects(()=>db.query("update pro_private_estimates set revision=revision+1 where owner_id=$1 and id=$2",[owner,c1.estimateId]),code('40001'),'the agreed draft cannot be edited afterwards');
 pass('direct conversion: approved lines only, linked as the job agreement, evidence kept, shared version untouched, replay and guards');

 // ---- Row 35: acceptance recorded outside the platform ----
 const ext=await makeEstimate('work-b');
 const today=(await one("select (now() at time zone 'America/Costa_Rica')::date::text d")).d;
 const ei=(extra={})=>({action:'external',actionId:crypto.randomUUID(),estimateId:ext.id,estimateRevision:1,workId:'work-b',method:'signed_paper',acceptedOn:today,acceptedByName:'Ana Mora Solis',evidenceNote:'Firmo la proforma impresa en la visita.',...extra});
 for(const patch of [{method:'carrier_pigeon'},{acceptedByName:'A'},{evidenceNote:'corto'},{acceptedOn:'2099-01-01'},{acceptedOn:'2001-01-01'},{acceptedOn:'no-fecha'},{workId:null},{estimateRevision:'1'},{extra:1}])
  await assert.rejects(()=>record({...ei(),...patch}),code('22023'),JSON.stringify(patch));
 await assert.rejects(()=>record(ei({estimateRevision:7})),code('40001'),'stale draft');
 await assert.rejects(()=>record(ei({workId:'work-a'})),code('40001'),'the quote belongs to another job (source) or the job already has an agreement');
 await assert.rejects(()=>record(ei(),customer),code('42501'));
 const e1=ei(),x1=await record(e1);
 assert.deepEqual([x1.action,x1.totalCents,x1.workId,x1.method,x1.acceptedByName],['external',400000,'work-b','signed_paper','Ana Mora Solis']);assert.deepEqual(await record(e1),x1);
 await assert.rejects(()=>record({...e1,evidenceNote:'Otra nota distinta de la anterior.'}),code('22023'));
 const ag2=await one('select * from pro_private_estimate_work_agreements where owner_id=$1 and work_id=$2',[owner,'work-b']);
 assert.equal(Number(ag2.total_cents),400000);assert.equal(ag2.accepted_actor_id,owner,'the recorder is stored as the actor, never the customer');
 const rec=await one('select * from pro_quote_recorded_acceptances where publication_id=$1',[x1.publicationId]);assert.equal(rec.kind,'external');assert.equal(rec.evidence_note,'Firmo la proforma impresa en la visita.');assert.equal(rec.source_publication_id,null);
 await assert.rejects(()=>record(ei({actionId:crypto.randomUUID(),estimateRevision:1})),code('40001'),'already agreed');
 const ev=(await one('select pro_quote_recorded_acceptance_read($1,$2) v',[owner,{estimateId:ext.id}])).v;assert.equal(ev.recorded.kind,'external');assert.equal(ev.recorded.acceptedByName,'Ana Mora Solis');
 pass('external acceptance: explicit who/when/how/evidence, job rules, agreement ledger row with the recorder as actor, replay, immutable');

 // ---- CRC only, source rules ----
 const usd=await makeEstimate('work-c','USD');
 await assert.rejects(()=>record({...ei({estimateId:usd.id,workId:'work-c'})}),code('22023'),'USD is refused instead of an agreed amount of zero');
 await assert.rejects(()=>record({...ei({estimateId:usd.id,workId:'work-a'})}),code('22023'));
 pass('CRC only: a USD quote is refused with a clear error');

 for(const signature of ['public.pro_quote_line_respond(uuid,jsonb)','public.pro_quote_line_response_read(uuid,uuid)','public.pro_quote_record_acceptance(uuid,jsonb)','public.pro_quote_recorded_acceptance_read(uuid,jsonb)'])
  for(const role of ['anon','authenticated'])assert.equal((await one("select has_function_privilege($1,$2,'execute') ok",[role,signature])).ok,false,role+' '+signature);
 for(const table of ['pro_quote_line_responses','pro_quote_line_response_actions','pro_quote_recorded_acceptances'])
  for(const role of ['anon','authenticated'])assert.equal((await one("select has_table_privilege($1,$2,'select') ok",[role,'public.'+table])).ok,false);
 pass('service-role-only ACL on the new functions and tables');
 console.log(`${checks} checks passed in a disposable PGlite database.`);
}catch(error){console.error(error);process.exitCode=1;}finally{await db.close();}

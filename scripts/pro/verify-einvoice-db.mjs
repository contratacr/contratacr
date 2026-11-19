// LOCAL PRO ONLY (Ronda F2-A, 2026-11-19): disposable in-memory PGlite verification of einvoice-pipeline-local.sql (row 58)
// on top of einvoice-local.sql. Installs the whole ordered local manifest (same foundation stubs as
// verify-pro-cost-codes-db.mjs), then checks: emisor settings with provider (CAS, defaults), gapless consecutivo per
// emisor/branch/terminal/type (a refused reservation consumes nothing), clave layout, mode ⇔ provider consistency,
// the asynchronous state machine (recibido → procesando → aceptado | rechazado, error with backoff, duplicate as
// received), immutability once signed and once final, provider responses (append-only), credit note cap, debit note
// rules, receiver messages (05/06/07 sequences, supplier/clave match, one live answer), due retries, idempotent
// receipts, draft lock, authorization, RLS/grants and an idempotent reapply. Every JSON read is parsed with the strict
// API schemas of src/lib/pro/integrations/hacienda/api.ts. No Supabase, network or shared database.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {localSqlManifest,localSqlDependencies} from './local-sql-manifest.mjs';
import {registerHooks} from 'node:module';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const libRoot=new URL('../../src/lib/',import.meta.url).href;
registerHooks({resolve(s,c,n){return n(c.parentURL?.startsWith(libRoot)&&s.startsWith('.')&&!/\.[a-z]+$/i.test(s)?s+'.ts':s,c);},load(u,c,n){return u.startsWith(libRoot)&&u.endsWith('.ts')?{format:'module',source:ts.transpileModule(readFileSync(new URL(u),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText,shortCircuit:true}:n(u,c);}});
const api=await import('../../src/lib/pro/integrations/hacienda/api.ts');
const root=new URL('../../',import.meta.url),db=new PGlite();
const owner='00000000-0000-4000-8000-000000000001',rival='00000000-0000-4000-8000-000000000002',stranger='00000000-0000-4000-8000-000000000004';
const code=c=>e=>{assert.equal(e.code,c,`${c} expected, got ${e.code}: ${e.message}`);return true;};
const hint=h=>e=>{assert.equal(e.hint,h,`hint ${h} expected, got ${e.hint}: ${e.message}`);return true;};
const sha=text=>createHash('sha256').update(text,'utf8').digest('hex');
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
 insert into profiles(id,full_name,role,is_disabled,is_provider) values('${owner}','Dueña Factura','professional',false,true),('${rival}','Otra Empresa','professional',false,true),('${stranger}','Cuenta Ajena','client',false,false);`);
 const notifications=await readFile(new URL('supabase/migrations/002_sprint2.sql',root),'utf8');
 await db.exec(notifications.slice(notifications.indexOf('CREATE TABLE IF NOT EXISTS public.notifications'),notifications.indexOf('-- SAVED PROFESSIONALS')));
 const emptyDoc=clientId=>({version:1,clients:[{id:clientId,name:'Cliente factura',email:'',phone:'',notes:'',archived:false}],products:[],movements:[],work:[],availability:[],quotes:[],quoteLinks:[],social:[]});
 let moduleSql='';
 const needed=new Set(['einvoice-pipeline-local.sql']);for(let grew=true;grew;){grew=false;for(const [from,to] of localSqlDependencies)if(needed.has(to)&&!needed.has(from)){needed.add(from);grew=true;}}
 for(const step of localSqlManifest){
  if(step.ifMissing&&(await db.query('select to_regclass($1) is not null present',[step.ifMissing])).rows[0].present)continue;
  let text=await readFile(new URL('docs/pro/sql/'+step.file,root),'utf8');
  if(step.file==='identity-lookup-maintenance-local.sql')text=text.replace('create extension if not exists pg_cron;','');
  if(step.file==='einvoice-pipeline-local.sql')moduleSql=text;
  try{await db.exec(text);}catch(error){if(needed.has(step.file))throw new Error('Manifest SQL failed: '+step.file,{cause:error});await db.exec('rollback');console.log('SKIP unrelated module that does not install here: '+step.file);}
  if(step.file==='memberships-draft.sql')for(const id of [owner,rival])await db.query('select pro_save_workspace($1,$2,0)',[id,emptyDoc('fiscal-client')]);
 }
 assert.ok(moduleSql,'einvoice-pipeline-local.sql must be in the manifest');
 for(const [id,profile] of [[owner,'30000000-0000-4000-8000-000000000001'],[rival,'30000000-0000-4000-8000-000000000002']]){
  await db.query('insert into professionals(id,profile_id,business_name,slug,is_banned) values($1,$2,$3,$4,false)',[profile,id,'Empresa '+id.slice(-1),'fiscal-'+id.slice(-1)]);
  await db.query("insert into pro_memberships(user_id,status) values($1,'active')",[id]);
 }
 const one=async(sql,args)=>(await db.query(sql,args)).rows[0];
 const work='fiscal-work';
 await db.query('insert into pro_work(user_id,id,client,service,stage,start,"end","clientId",cancelled) values($1,$2,$3,$4,$5,$6,$7,$8,false)',[owner,work,'Cliente factura','Remodelación','scheduled','','','fiscal-client']);
 const draft=async(total=113000,tax=13000)=>{const id=crypto.randomUUID();await db.query("insert into pro_invoice_drafts(user_id,id,client_id,source_kind,source_id,work_id,title,receiver_name,receiver_identification,receiver_email,receiver_phone,receiver_address,total_cents,tax_cents,material_count,material_cost,basis,source_fingerprint) values($1,$2,'fiscal-client','quote',$6,$3,'Factura','Carla Cliente','112340567','','','',$4,$5,0,0,'manual',repeat('a',32))",[owner,id,work,total,tax,id]);return id;};
 const mutate=async(input,actor=owner)=>(await one('select pro_einvoice_mutate($1,$2) v',[actor,input])).v;
 const receiver=async(input,actor=owner)=>(await one('select pro_einvoice_receiver_mutate($1,$2) v',[actor,input])).v;
 const docRead=async(id,actor=owner)=>{const v=(await one('select pro_einvoice_document_read($1,$2) v',[actor,id])).v;if(v)api.einvoiceDocumentSchema.parse(v);return v;};
 const draftRead=async(id,actor=owner)=>(await one('select pro_einvoice_read($1,$2) v',[actor,id])).v;
 const settings={idType:'02',idNumber:'3101123456',name:'Remodelaciones Prueba S.A.',commercialName:'',activityCode:'410001',province:'1',canton:'01',district:'08',barrio:'',otherSigns:'Cien metros norte del parque',phone:'',email:'facturas@example.test',branch:'001',terminal:'00001',providerSystems:'3101123456'};

 // ---- 1. Settings: provider defaults to mock, CAS, invalid provider ----
 const saved=await mutate({action:'save_settings',actionId:crypto.randomUUID(),revision:0,settings});
 assert.equal(saved.settings.provider,'mock');assert.equal(saved.settingsRevision,1);api.einvoiceSettingsReadSchema.parse({...saved,defaults:{}});
 await assert.rejects(()=>mutate({action:'save_settings',actionId:crypto.randomUUID(),revision:1,settings:{...settings,provider:'otro'}}),code('22023'));
 await assert.rejects(()=>mutate({action:'save_settings',actionId:crypto.randomUUID(),revision:0,settings}),code('40001'));
 const gti=await mutate({action:'save_settings',actionId:crypto.randomUUID(),revision:1,settings:{...settings,provider:'gti'}});assert.equal(gti.settings.provider,'gti');
 const kept=await mutate({action:'save_settings',actionId:crypto.randomUUID(),revision:2,settings});assert.equal(kept.settings.provider,'gti','an absent provider keeps the saved one');
 await mutate({action:'save_settings',actionId:crypto.randomUUID(),revision:3,settings:{...settings,provider:'mock'}});
 pass('settings: provider default mock, kept when absent, invalid 22023, CAS 40001');

 // ---- 2. Reservation: gapless consecutivo, clave layout, mode ⇔ provider ----
 const reserve=(draftId,patch={})=>({action:'reserve',actionId:crypto.randomUUID(),draftId,draftRevision:1,settingsRevision:4,docType:'01',mode:'mock',provider:'mock',securityCode:'12345678',snapshot:{lines:[]},totalCents:113000,taxCents:13000,receiverName:'Carla Cliente',receiverIdType:'01',receiverId:'112340567',...patch});
 const d1=await draft(),d2=await draft(),d3=await draft(50000,0);
 await assert.rejects(()=>mutate(reserve(d1,{totalCents:1})),hint('pro_einvoice_totals'));
 await assert.rejects(()=>mutate(reserve(d1,{provider:'gti'})),code('22023'),'mock mode needs the mock provider');
 await assert.rejects(()=>mutate(reserve(d1,{mode:'sandbox'})),code('22023'),'sandbox needs a real provider');
 await assert.rejects(()=>mutate(reserve(d1,{docType:'05'})),code('22023'));
 const f1=await mutate(reserve(d1));
 assert.equal(f1.consecutivo,'00100001010000000001','a refused reservation consumes no number');
 assert.equal(f1.clave.length,50);assert.match(f1.clave,/^506\d{6}00310112345600100001010000000001112345678$/);
 assert.equal(f1.clave.slice(9,21),'003101123456');assert.equal(f1.clave.slice(21,41),f1.consecutivo);assert.equal(f1.clave[41],'1');assert.equal(f1.clave.slice(42),'12345678');
 const crDate=new Intl.DateTimeFormat('en-GB',{timeZone:'America/Costa_Rica',day:'2-digit',month:'2-digit',year:'2-digit'}).formatToParts(new Date(f1.issuedAt)).reduce((acc,p)=>({...acc,[p.type]:p.value}),{});
 assert.equal(f1.clave.slice(3,9),crDate.day+crDate.month+crDate.year);
 assert.equal(f1.provider,'mock');assert.equal(f1.status,'borrador');
 const t1=await mutate(reserve(d2,{docType:'04',receiverIdType:'',receiverId:''}));assert.equal(t1.consecutivo,'00100001040000000001','own sequence per type');
 const f2=await mutate(reserve(d3,{totalCents:50000,taxCents:0}));assert.equal(f2.consecutivo,'00100001010000000002');
 await assert.rejects(()=>mutate(reserve(d1)),hint('pro_einvoice_emitted'),'one live FE/TE per draft');
 assert.deepEqual((await db.query('select doc_type,last_number from pro_einvoice_sequences where owner_id=$1 order by doc_type',[owner])).rows.map(r=>[r.doc_type,Number(r.last_number)]),[['01',2],['04',1]]);
 pass('reservation: gapless per type, refused reservation consumes nothing, clave 50 (506 + CR date + emisor 12 + consecutivo + situación + security), mode ⇔ provider');

 // ---- 3. State machine: sign, error with backoff, duplicate, recibido → procesando → aceptado ----
 const xmlOf=doc=>`<FacturaElectronica><Clave>${doc.clave}</Clave><NumeroConsecutivo>${doc.consecutivo}</NumeroConsecutivo></FacturaElectronica>`;
 const sign=async(doc,signer='mock')=>{const xml=xmlOf(doc),signedXml=xml.replace('</FacturaElectronica>','<ds:Signature/></FacturaElectronica>');return mutate({action:'sign',actionId:crypto.randomUUID(),documentId:doc.id,xml,xmlSha256:sha(xml),signedXml,signedSha256:sha(signedXml),signer});};
 await assert.rejects(()=>sign(f1,'p12'),code('22023'),'mock documents are signed by the mock signer');
 await assert.rejects(()=>mutate({action:'sign',actionId:crypto.randomUUID(),documentId:f1.id,xml:'<x/>',xmlSha256:sha('<x/>'),signedXml:'<x/>',signedSha256:sha('<x/>'),signer:'mock'}),hint('pro_einvoice_xml_mismatch'));
 assert.equal((await sign(f1)).status,'firmado');
 const response=(operation,attempt,outcome,extra={})=>({provider:'mock',mode:'mock',operation,attempt,httpStatus:outcome==='timeout'?0:outcome==='error'?503:outcome==='state'?200:202,outcome,message:'Simulación',bodySha256:sha(operation+attempt),...extra});
 const failed=await mutate({action:'submitted',actionId:crypto.randomUUID(),documentId:f1.id,outcome:'error',message:'503',response:response('issue',1,'timeout')});
 assert.equal(failed.status,'error');assert.equal(failed.attempts,1);
 const delay=(new Date(failed.nextAttemptAt)-Date.now())/1000;assert.ok(delay>20&&delay<=31,'first backoff 30 s, got '+delay);
 const dup=await mutate({action:'submitted',actionId:crypto.randomUUID(),documentId:f1.id,outcome:'duplicate',message:'ya fue recibido',response:response('issue',2,'duplicate')});
 assert.equal(dup.status,'enviado');assert.equal(dup.attempts,2);assert.equal(dup.nextAttemptAt,null);
 await assert.rejects(()=>mutate({action:'status',actionId:crypto.randomUUID(),documentId:f1.id,state:'aceptado',message:'x'}),code('22023'),'final state needs the response');
 for(const state of ['recibido','procesando'])assert.equal((await mutate({action:'status',actionId:crypto.randomUUID(),documentId:f1.id,state,message:state,response:response('status',2,'state',{state})})).status,state);
 const accepted=await mutate({action:'status',actionId:crypto.randomUUID(),documentId:f1.id,state:'aceptado',responseXml:'<MensajeHacienda/>',responseCode:1,message:'Aceptado',response:response('status',2,'state',{state:'aceptado'})});
 assert.equal(accepted.status,'aceptado');
 const full=await docRead(f1.id);
 assert.deepEqual(full.events.map(e=>e.to),['borrador','firmado','error','enviado','recibido','procesando','aceptado']);
 assert.deepEqual(full.responses.map(r=>r.outcome),['timeout','duplicate','state','state','state']);
 await assert.rejects(()=>mutate({action:'status',actionId:crypto.randomUUID(),documentId:f1.id,state:'rechazado',responseXml:'<x/>',responseCode:3,message:'x'}),code('40001'),'final is final');
 await assert.rejects(()=>db.query("update pro_einvoice_documents set response_message='x' where id=$1",[f1.id]),code('23514'));
 await sign(f2);
 await assert.rejects(()=>db.query("update pro_einvoice_documents set status='aceptado',response_code=1 where id=$1",[f2.id]),code('23514'),'firmado → aceptado skips the provider');
 await assert.rejects(()=>db.query("update pro_einvoice_documents set signed_xml='<y/>' where id=$1",[f2.id]),code('23514'),'signed XML is frozen');
 await assert.rejects(()=>db.query("update pro_einvoice_documents set provider='gti' where id=$1",[f2.id]),code('23514'),'provider is frozen');
 await assert.rejects(()=>db.query('update pro_einvoice_provider_responses set message=$2 where owner_id=$1',[owner,'x']),code('23514'),'responses are append-only');
 await assert.rejects(()=>mutate({action:'submitted',actionId:crypto.randomUUID(),documentId:f2.id,outcome:'sent',message:'ok',response:{...response('issue',1,'received'),attempt:'x'}}),code('22023'),'malformed response');
 await assert.rejects(()=>db.query('update pro_invoice_drafts set title=$3 where user_id=$1 and id=$2',[owner,d1,'Otro']),hint('pro_einvoice_emitted'),'emitted draft is locked');
 pass('state machine: mock signer only, digest check, error + 30 s backoff, duplicate as received, recibido → procesando → aceptado, final/frozen/append-only, draft lock');

 // ---- 4. Rejection frees the draft; processing error then final ----
 const r1=await mutate({action:'submitted',actionId:crypto.randomUUID(),documentId:f2.id,outcome:'sent',message:'ok',response:response('issue',1,'received')});
 for(const state of ['recibido','procesando','error'])await mutate({action:'status',actionId:crypto.randomUUID(),documentId:r1.id,state,message:state,response:response('status',1,'state',{state})});
 const rej=await mutate({action:'status',actionId:crypto.randomUUID(),documentId:r1.id,state:'rechazado',responseXml:'<MensajeHacienda/>',responseCode:3,message:'Receptor no inscrito',response:response('status',2,'state',{state:'rechazado'})});
 assert.equal(rej.status,'rechazado');assert.equal(rej.attempts,2,'the processing error counted as an attempt');
 const again=await mutate(reserve(d3,{totalCents:50000,taxCents:0}));assert.equal(again.consecutivo,'00100001010000000003','a rejected document frees the draft; the new one takes the next number');
 pass('rejection: error during processing then rechazado, draft freed, next consecutivo');

 // ---- 5. Credit and debit notes ----
 const note=(type,patch={})=>reserve(d1,{docType:type,referenceDocumentId:f1.id,referenceCode:'02',referenceReason:'Ajuste de precio',totalCents:11300,taxCents:1300,...patch});
 await assert.rejects(()=>mutate(note('02',{referenceDocumentId:t1.id,draftId:d2})),hint('pro_einvoice_reference_state'),'original must be accepted');
 await assert.rejects(()=>mutate(note('02',{referenceCode:'01'})),code('22023'),'debit note uses code 02');
 await assert.rejects(()=>mutate(note('02',{totalCents:0})),hint('pro_einvoice_debit_amount'));
 const nd=await mutate(note('02',{totalCents:500000,taxCents:57522}));assert.equal(nd.consecutivo,'00100001020000000001');assert.equal(nd.referenceDocumentId,f1.id);
 await assert.rejects(()=>mutate(note('03',{totalCents:113001})),hint('pro_einvoice_credit_exceeds'),'debit notes do not raise the credit cap');
 const nc=await mutate(note('03',{referenceCode:'01',referenceReason:'Anula por datos equivocados',totalCents:113000,taxCents:13000}));assert.equal(nc.consecutivo,'00100001030000000001');
 await assert.rejects(()=>mutate(note('02')),hint('pro_einvoice_reference_cancelled'),'no debit note on a cancelled original');
 await assert.rejects(()=>mutate(note('03',{totalCents:1})),hint('pro_einvoice_credit_exceeds'));
 await assert.rejects(()=>db.query("update pro_einvoice_documents set reference_document_id=null where id=$1",[nd.id]),code('23514'));
 const read=await draftRead(d1);assert.equal(read.credited[f1.id],113000);assert.equal(read.documents.length,3);
 for(const doc of read.documents)api.einvoiceDocumentSchema.parse(doc);
 pass('notes: ND 02 (accepted original, code 02, > 0, own sequence, never capped, refused after full cancellation), NC cap unchanged');

 // ---- 6. Receiver messages ----
 const supplierClave='50619112600310199999900100001010000000123199999999';
 const msg=(patch={})=>({action:'reserve',actionId:crypto.randomUUID(),mode:'mock',provider:'mock',receivedClave:supplierClave,emisorIdType:'02',emisorId:'3101999999',emisorName:'Ferretería Proveedora',
  receivedIssuedAt:new Date(Date.now()-86400000).toISOString(),receivedTotalCents:56500,receivedTaxCents:6500,messageCode:'1',detail:'',taxCondition:'01',creditTaxCents:6500,expenseCents:56500,activityCode:'',...patch});
 await assert.rejects(()=>receiver(msg({emisorId:'3101888888'})),hint('pro_einvoice_receiver_clave'));
 await assert.rejects(()=>receiver(msg({receivedClave:'50619112600310112345600100001010000000123199999999',emisorId:'3101123456'})),hint('pro_einvoice_receiver_own'));
 await assert.rejects(()=>receiver(msg({messageCode:'3'})),code('22023'),'a rejection needs the reason');
 await assert.rejects(()=>receiver(msg({messageCode:'2',creditTaxCents:9999})),code('22023'),'partial credit ≤ document tax');
 await assert.rejects(()=>receiver(msg({mode:'mock',provider:'gti'})),code('22023'));
 const m1=await receiver(msg({messageCode:'3',detail:'Mercadería no recibida'}));
 api.einvoiceReceiverSchema.parse(m1);assert.equal(m1.consecutivo,'00100001070000000001');assert.equal(m1.docType,'07');assert.equal(m1.activityCode,'410001','activity defaults to the emisor');
 await assert.rejects(()=>receiver(msg()),hint('pro_einvoice_receiver_answered'),'one live answer');
 const mxml=`<MensajeReceptor><Clave>${supplierClave}</Clave><NumeroConsecutivoReceptor>${m1.consecutivo}</NumeroConsecutivoReceptor></MensajeReceptor>`,msigned=mxml.replace('</MensajeReceptor>','<ds:Signature/></MensajeReceptor>');
 await receiver({action:'sign',actionId:crypto.randomUUID(),messageId:m1.id,xml:mxml,xmlSha256:sha(mxml),signedXml:msigned,signedSha256:sha(msigned),signer:'mock'});
 await receiver({action:'submitted',actionId:crypto.randomUUID(),messageId:m1.id,outcome:'sent',message:'ok',response:{...response('receiver_message',1,'received')}});
 for(const state of ['recibido','procesando'])await receiver({action:'status',actionId:crypto.randomUUID(),messageId:m1.id,state,message:state,response:response('receiver_status',1,'state',{state})});
 const m1r=await receiver({action:'status',actionId:crypto.randomUUID(),messageId:m1.id,state:'rechazado',responseXml:'<MensajeHacienda/>',responseCode:3,message:'No existe',response:response('receiver_status',1,'state',{state:'rechazado'})});
 assert.equal(m1r.status,'rechazado');assert.deepEqual(m1r.events.map(e=>e.to),['borrador','firmado','enviado','recibido','procesando','rechazado']);assert.equal(m1r.responses.length,4);
 await assert.rejects(()=>db.query("update pro_einvoice_receiver_messages set detail='Otra razón distinta' where id=$1",[m1.id]),code('23514'));
 const m2=await receiver(msg({messageCode:'2',detail:'Solo parte del IVA',creditTaxCents:3000}));assert.equal(m2.consecutivo,'00100001060000000001','a rejected answer frees the received document; 06 has its own sequence');
 await assert.rejects(()=>receiver({action:'status',actionId:crypto.randomUUID(),messageId:m2.id,state:'aceptado',message:'x'}),code('40001'),'not sent yet');
 const list=(await one('select pro_einvoice_receiver_read($1,null) v',[owner])).v;assert.equal(list.messages.length,2);list.messages.forEach(m=>api.einvoiceReceiverSchema.parse(m));
 assert.equal((await one('select pro_einvoice_receiver_read($1,$2) v',[rival,m2.id])).v,null);
 pass('receiver messages: supplier/clave match, own document refused, reason and partial-credit rules, 05/06/07 sequences, one live answer, state machine, frozen identity');

 // ---- 7. Due retries, receipts, authorization, grants, reapply ----
 const f3=again;await sign(f3);await mutate({action:'submitted',actionId:crypto.randomUUID(),documentId:f3.id,outcome:'error',message:'503',response:response('issue',1,'error')});
 assert.equal((await one('select jsonb_array_length(pro_einvoice_due_retries($1,20)) n',[owner])).n,0,'not due yet');
 await db.query("update pro_einvoice_documents set next_attempt_at=now()-interval '1 second' where id=$1",[f3.id]);
 const due=(await one('select pro_einvoice_due_retries($1,20) v',[owner])).v;assert.deepEqual(due.map(r=>[r.kind,r.id]),[['document',f3.id]]);
 const receiptInput=reserve(await draft());const first=await mutate(receiptInput);assert.deepEqual(await mutate(receiptInput),first,'idempotent receipt');
 await assert.rejects(()=>mutate({...receiptInput,securityCode:'87654321'}),code('22023'),'action id reused with another payload');
 assert.equal(await docRead(f1.id,rival),null,'another company sees nothing');
 await assert.rejects(()=>mutate(reserve(d1),stranger),code('42501'));await assert.rejects(()=>receiver(msg(),stranger),code('42501'));
 await assert.rejects(()=>db.query('select pro_einvoice_due_retries($1,5)',[stranger]),code('42501'));
 await db.query("update pro_memberships set expires_at=now()-interval '1 day' where user_id=$1",[owner]);
 await assert.rejects(()=>docRead(f1.id),code('42501'));
 await db.query('update pro_memberships set expires_at=null where user_id=$1',[owner]);
 await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${owner}',false);`);
 for(const t of ['pro_einvoice_receiver_messages','pro_einvoice_receiver_events','pro_einvoice_provider_responses','pro_einvoice_documents','pro_einvoice_sequences'])await assert.rejects(()=>db.query(`select * from ${t}`),code('42501'));
 await db.exec('reset role');
 for(const t of ['pro_einvoice_receiver_messages','pro_einvoice_receiver_events','pro_einvoice_provider_responses'])assert.equal((await one('select relrowsecurity v from pg_class where oid=$1::regclass',['public.'+t])).v,true,t+' RLS');
 assert.equal((await one("select has_table_privilege('service_role','public.pro_einvoice_provider_responses','UPDATE') v")).v,false,'responses are insert-only');
 for(const fn of ['pro_einvoice_mutate(uuid,jsonb)','pro_einvoice_receiver_mutate(uuid,jsonb)','pro_einvoice_receiver_read(uuid,uuid)','pro_einvoice_due_retries(uuid,integer)','pro_einvoice_document_read(uuid,uuid)'])
  for(const [role,yes] of [['anon',false],['authenticated',false],['service_role',true]])assert.equal((await one('select has_function_privilege($1,$2,$3) v',[role,'public.'+fn,'EXECUTE'])).v,yes,role+' '+fn);
 for(const fn of ['pro_einvoice_receiver_guard()','pro_einvoice_receiver_event()','pro_einvoice_document_guard()'])assert.equal((await one("select has_function_privilege('service_role',$1,'EXECUTE') v",['public.'+fn])).v,false,'trigger '+fn);
 const before=JSON.stringify(await docRead(f1.id));
 await db.exec(await readFile(new URL('docs/pro/sql/einvoice-local.sql',root),'utf8'));await db.exec(moduleSql);await db.exec(moduleSql);
 assert.equal(JSON.stringify(await docRead(f1.id)),before,'idempotent reapply keeps data');
 assert.equal((await one("select count(*)::int n from pg_constraint where conrelid='public.pro_einvoice_documents'::regclass and conname like 'pro_einvoice_f2a_%'")).n,5,'named checks are not duplicated');
 const r2=await mutate(reserve(await draft()));assert.match(r2.consecutivo,/^0010000101\d{10}$/,'still works after reapply');
 pass('due retries, receipts, other company / no Pro 42501, RLS + service_role only, trigger functions not callable, idempotent reapply');
 console.log(`${checks} e-invoice pipeline contract groups passed; in-memory PGlite only.`);
}finally{await db.close();}

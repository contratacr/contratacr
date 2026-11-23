// Isolated PostgreSQL; never connects to the running application database.
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite(),a='00000000-0000-4000-8000-000000000001',b='00000000-0000-4000-8000-000000000002';
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;create table profiles(id uuid primary key,role text,is_disabled boolean);insert into profiles values('${a}','professional',false),('${b}','professional',false);create table professionals(id uuid primary key,profile_id uuid);create table quotes(id uuid primary key,professional_id uuid,client_id uuid,title text,client_name text,client_phone text,client_email text,client_cedula text,items jsonb,tax_amount numeric,total numeric,status text,created_at timestamptz,deleted_at timestamptz);`);
await db.exec(await readFile('docs/pro/sql/memberships-draft.sql','utf8'));
const client={id:'c',name:'Cliente original',email:'',phone:'',notes:'Conservar',archived:false},product={id:'p',sku:'PRODUCT',name:'Material sin cambios',stock:20,minimum:1,cost:10,price:20,archived:false};
const work={id:'w',clientId:'c',client:client.name,service:'Trabajo con acuerdo',stage:'completed',start:'2026-10-27T10:00:00-06:00',end:'2026-10-27T11:00:00-06:00',cancelled:false};
const document={version:1,clients:[client,{...client,id:'c2',name:'Otro cliente'}],products:[product],movements:[],work:[work,{...work,id:'w2',service:'Otro trabajo mismo cliente'},{...work,id:'w3',clientId:'c2',client:'Otro cliente'},{...work,id:'unpriced',service:'Trabajo sin acuerdo'}],availability:[],quotes:[],quoteLinks:[],social:[]};for(const owner of [a,b])await db.query('select pro_save_workspace($1,$2,0)',[owner,document]);
const files=['catalog-storage-draft.sql','catalog-item-types-local.sql','catalog-mutations-draft.sql','catalog-pages-draft.sql','panel-storage-draft.sql','panel-queries-draft.sql','client-operations-draft.sql','invoice-drafts-local.sql','invoice-list-local.sql','invoice-preparation-local.sql','invoice-detail-local.sql','invoice-direct-local.sql','invoice-issuer-local.sql','client-fiscal-local.sql','invoice-tax-local.sql','invoice-extras-local.sql','invoice-special-expanded-local.sql','invoice-management-local.sql','catalog-item-types-local.sql','invoice-payments-local.sql','payment-overview-local.sql'];for(const file of files)await db.exec(await readFile('docs/pro/sql/'+file,'utf8'));
const core=async(owner=a)=>(await db.query('select document,revision from pro_workspace_core where user_id=$1',[owner])).rows[0];
const full=async(owner=a)=>(await db.query('select document,revision from pro_workspaces where user_id=$1',[owner])).rows[0];
const invoice=async(id,owner=a)=>(await db.query('select pro_invoice_extras_read($1,$2,null) draft',[owner,id])).rows[0].draft;
const read=async(id,after=null,candidatesAfter=null,owner=a)=>(await db.query('select pro_invoice_payments_read($1,$2,$3,$4) result',[owner,id,after,candidatesAfter])).rows[0].result;
const mutate=async(input,owner=a)=>(await db.query('select pro_invoice_payment_mutate($1,$2) result',[owner,input])).rows[0].result;
const entries=async(owner=a)=>(await db.query('select to_jsonb(e) row from pro_client_entries e where user_id=$1 order by position',[owner])).rows;
const operations=async(kind,fields={},workId='w',clientId='c',owner=a)=>{const input={actionId:crypto.randomUUID(),workId,clientId,kind,...fields};await db.query('select pro_record_client_operation($1,$2,$3)',[owner,input,(await core(owner)).revision]);return input.actionId;};
const newDraft=async({owner=a,clientId='c',total='1000',kind='direct',sourceId='w'}={})=>{if(kind==='direct'){const id=crypto.randomUUID();await db.query('select pro_invoice_extras_save($1,$2)',[owner,{action:'create_direct',requestId:id,clientId,title:'Directa interna',notes:'Sin modificar',lines:[{kind:'service',productId:null,sku:'',description:'Servicio',unit:'Sp',cabys:'',quantity:'1',unitPrice:total,discountType:'percent',discount:'0',discountReason:'',taxTreatment:'pending',taxRate:'0',tax:null,specialTaxes:[]}],charges:[]}]);return id;}const source=(await db.query('select pro_invoice_source($1,\'work\',$2) source',[owner,sourceId])).rows[0].source;return (await db.query('select pro_invoice_extras_save($1,$2) id',[owner,{action:'create',kind:'work',sourceId,fingerprint:source.fingerprint,clientId,title:'Trabajo interno',notes:'Origen',receiver:source.receiver}])).rows[0].id;};
const input=async(draftId,fields={})=>{const r=await read(draftId);return {action:'apply',requestId:crypto.randomUUID(),draftId,draftRevision:r.draft.revision,revision:r.revision,source:'new',amountCents:1000,receivedOn:'2026-01-01',method:'sinpe',reference:'REF-ORIGINAL',...fields};};
const overview=async(q='',status='all',client='',after=null,owner=a,from=null,through=null)=>(await db.query('select pro_payment_overview_page($1,$2,$3,$4,$5,$6,$7) result',[owner,q,status,client,after,from,through])).rows[0].result;
const detail=async(id,client='',after=null,owner=a)=>(await db.query('select pro_payment_overview_read($1,$2,$3,$4) result',[owner,id,client,after])).rows[0].result;
const tableNames=['profiles','pro_workspace_core','pro_clients','pro_products','pro_movements','pro_work','pro_client_entries','pro_invoice_drafts','pro_invoice_lines','pro_invoice_materials','pro_invoice_preparation','pro_invoice_edited_detail','pro_invoice_edited_lines','pro_invoice_line_tax','pro_invoice_line_special_tax','pro_invoice_draft_charges','pro_invoice_receiver_fiscal','pro_invoice_draft_management','pro_invoice_draft_copies','pro_invoice_payments','pro_invoice_payment_applications','pro_invoice_payment_voids','pro_invoice_payment_state','pro_invoice_payment_requests'];
const snapshot=async()=>{const result={};for(const table of tableNames)result[table]=(await db.query(`select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]') rows from ${table} t`)).rows[0].rows;return result;};
const readOnly=async(run)=>{const before=await snapshot();await run();assert.deepEqual(await snapshot(),before);};
await operations('agreement',{amountCents:100000});const historical=await operations('payment',{amountCents:40000,note:'Histórico %_ \\ Ñandú'});await operations('agreement',{amountCents:50000},'w3','c2');const otherClient=await operations('payment',{amountCents:5000,note:'Histórico otro cliente'},'w3','c2');
const workDraft=await newDraft({kind:'work'}),direct1=await newDraft({total:'100'}),direct2=await newDraft({total:'100'});

await db.exec("create or replace function public.pro_private_work_tools_enabled(p_actor uuid) returns boolean language sql stable as $$select true$$");
for(const file of ['credits-retainers-local.sql','credits-retainers-guard-local.sql','credit-notes-statement-local.sql'])await db.exec(await readFile('docs/pro/sql/'+file,'utf8'));
const migration=await readFile('supabase/migrations/381_pro_28_credit_ledger.sql','utf8');await db.exec(migration);
const credit=async(input,owner=a)=>(await db.query('select pro_credits_mutate($1,$2) result',[owner,input])).rows[0].result;
const ledger=async(q,owner=a)=>(await db.query('select pro_credit_ledger_read($1,$2) result',[owner,q])).rows[0].result;
const crToday=(await db.query("select (now() at time zone 'America/Costa_Rica')::date::text d")).rows[0].d;
const code=c=>e=>{assert.equal(e.code,c,`${c} expected, got ${e.code}: ${e.message}`);return true;};
const events=l=>l.entries.map(x=>x.event+':'+x.deltaCents+':'+x.balanceCents).reverse();

const empty=await ledger({workId:'w'});assert.equal(empty.balanceCents,0);assert.deepEqual(empty.entries,[]);assert.equal(empty.reconciled,true);
// Credit note: issued, applied to a draft, reverted.
const noteId=crypto.randomUUID();let note=(await credit({action:'create_credit_note',actionId:crypto.randomUUID(),id:noteId,workId:'w',title:'Bonificación',reason:'Atraso',note:null,amountCents:2500})).credit;
assert.deepEqual(events(await ledger({workId:'w'})),['received:2500:2500']);
const apply=crypto.randomUUID();note=(await credit({action:'apply',actionId:apply,id:noteId,workId:'w',draftId:workDraft,amountCents:2000,revision:note.revision})).credit;
assert.deepEqual(events(await ledger({workId:'w'})),['received:2500:2500','apply:-2000:500']);
note=(await credit({action:'unapply',actionId:crypto.randomUUID(),id:noteId,workId:'w',applicationId:note.applications[0].id,reason:'Revertida',revision:note.revision})).credit;
let l=await ledger({workId:'w'});assert.deepEqual(events(l),['received:2500:2500','apply:-2000:500','unapply:2000:2500']);
assert.equal(l.balanceCents,2500);assert.equal(l.appliedCents,0);assert.equal(l.reconciled,true);assert.equal(l.entries.length,3);assert.equal(l.client.id,'c');
// Retainer: received (manual payment), partly refunded, refund voided, then cancelled by an inverse entry.
const antId=crypto.randomUUID();let ant=(await credit({action:'create_retainer',actionId:crypto.randomUUID(),id:antId,workId:'w',title:'Anticipo',amountCents:5000,requestedOn:crToday,note:null})).credit;
assert.equal((await ledger({workId:'w'})).balanceCents,2500,'a requested retainer holds no money');
ant=(await credit({action:'receive_retainer',actionId:crypto.randomUUID(),id:antId,workId:'w',revision:ant.revision,source:'manual',entryId:null,amountCents:5000,receivedOn:crToday,method:'transfer',reference:'T-1'})).credit;
assert.equal((await ledger({workId:'w'})).balanceCents,7500);
ant=(await credit({action:'refund',actionId:crypto.randomUUID(),id:antId,workId:'w',revision:ant.revision,amountCents:1000,refundedOn:crToday,method:'cash',reference:null,note:null})).credit;
l=await ledger({workId:'w'});assert.equal(l.balanceCents,6500);assert.equal(l.refundedCents,1000);assert.equal(l.reconciled,true);
ant=(await credit({action:'void_refund',actionId:crypto.randomUUID(),id:antId,workId:'w',revision:ant.revision,refundId:ant.refunds[0].id,reason:'Error de registro'})).credit;
l=await ledger({workId:'w'});assert.equal(l.balanceCents,7500);assert.equal(l.refundedCents,0,'a voided refund nets to zero, the entries stay');
assert.ok(l.entries.some(e=>e.event==='refund')&&l.entries.some(e=>e.event==='void_refund'),'nothing is deleted');
ant=(await credit({action:'cancel',actionId:crypto.randomUUID(),id:antId,workId:'w',revision:ant.revision,reason:'Se canceló la obra'})).credit;
l=await ledger({workId:'w'});assert.equal(l.balanceCents,2500);assert.equal(l.closedCents,5000);assert.equal(l.entries.find(e=>e.event==='cancel').deltaCents,-5000);assert.equal(l.reconciled,true);
assert.deepEqual(l.credits.map(x=>x.reconciled),[true,true]);
// Customer scope: every project of the customer, per-project balances.
const otherNote=(await credit({action:'create_credit_note',actionId:crypto.randomUUID(),id:crypto.randomUUID(),workId:'w2',title:'Otro trabajo',reason:'Cortesía',note:null,amountCents:700})).credit;
const cl=await ledger({clientId:'c'});assert.equal(cl.scope,'client');assert.equal(cl.balanceCents,3200);assert.deepEqual(cl.byWork.map(x=>[x.workId,x.balanceCents]),[['w',2500],['w2',700]]);assert.equal(cl.reconciled,true);
assert.equal((await ledger({workId:'w2'})).balanceCents,700);
// Isolation and strict input.
for(const q of [{workId:'w'},{clientId:'c'}]){const r=await ledger(q,b);assert.ok(r===null||(r.entryCount===0&&r.balanceCents===0),'another owner sees nothing');}assert.equal(await ledger({workId:'nope'}),null);
for(const q of [{},{workId:'w',clientId:'c'},{workId:1},{workId:''},{workId:'w',extra:'x'},[],null])await assert.rejects(()=>ledger(q),code('22023'),JSON.stringify(q));
// Read only, grants, reapply.
const before=JSON.stringify((await db.query('select count(*) n from pro_credits')).rows)+JSON.stringify((await db.query('select count(*) n from pro_credit_history')).rows);await ledger({clientId:'c'});assert.equal(JSON.stringify((await db.query('select count(*) n from pro_credits')).rows)+JSON.stringify((await db.query('select count(*) n from pro_credit_history')).rows),before);
for(const [role,yes] of [['anon',false],['authenticated',false],['service_role',true]])assert.equal((await db.query('select has_function_privilege($1,$2,$3) v',[role,'public.pro_credit_ledger_read(uuid,jsonb)','EXECUTE'])).rows[0].v,yes,role);
const snap=JSON.stringify(await ledger({clientId:'c'}));await db.exec(migration);assert.equal(JSON.stringify(await ledger({clientId:'c'})),snap);
await db.close();console.log('PASS credit ledger: signed append-only entries, running balance, reversals as inverse entries, cancellation closing entry, per-credit reconciliation, customer and project scope, isolation, strict input, grants and reapply.');

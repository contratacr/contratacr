import {installRequestQuoteAccountOverride} from './request-quote-account-test-helper.mjs';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const {PGlite}=await import(process.env.PRO_PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite(),a='00000000-0000-4000-8000-000000000001',b='00000000-0000-4000-8000-000000000002';
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth to authenticated;create table profiles(id uuid primary key,role text,is_disabled boolean);insert into profiles values('${a}','professional',false),('${b}','professional',false);create table professionals(id uuid primary key,profile_id uuid);create table quotes(id uuid primary key,professional_id uuid,client_id uuid,title text,client_name text,total numeric,status text,created_at timestamptz,deleted_at timestamptz);`);
await db.exec(await readFile('docs/pro/sql/memberships-draft.sql','utf8'));
const client={id:'c',name:'Original',email:'',phone:'',notes:'Conservar',archived:false};
const product={id:'p',sku:'MAT',name:'Material original',stock:5,minimum:1,cost:125.25,price:200,archived:false};
const quote={id:'q',clientId:'c',title:'Cotización',lines:[{description:'Trabajo y materiales',quantity:1,price:1000,tax:0}],status:'accepted',validUntil:'2027-12-01'};
const work={id:'w',client:'Original',clientId:'c',service:'Trabajo',stage:'completed',start:'2026-11-15T12:00:00-06:00',end:'2026-11-15T13:00:00-06:00',cancelled:false,quoteId:'q'};
const document={version:1,clients:[client,{...client,id:'c2'}],products:[product],movements:[],work:[work,{...work,id:'w2'}],availability:[],quotes:[quote],quoteLinks:[],social:[]};
for(const owner of [a,b])await db.query('select pro_save_workspace($1,$2,0)',[owner,document]);
for(const file of ['catalog-storage-draft.sql','catalog-item-types-local.sql','catalog-mutations-draft.sql','catalog-pages-draft.sql','panel-storage-draft.sql','panel-queries-draft.sql','client-operations-draft.sql'])await db.exec(await readFile('docs/pro/sql/'+file,'utf8'));
// Reapplying the additive schema must also preserve original records and revisions.
await db.exec(await readFile('docs/pro/sql/client-operations-draft.sql','utf8'));
await installRequestQuoteAccountOverride(db);
const state=async()=>(await db.query('select document,revision from pro_workspaces where user_id=$1',[a])).rows[0];
assert.deepEqual(await state(),{document,revision:1});
const page=async(owner=a,clientId='c',workId='w',after=null,entriesAfter=null)=>(await db.query('select pro_client_operations_page($1,$2,$3,$4,$5) as page',[owner,clientId,workId,after,entriesAfter])).rows[0].page;
const first=await page();assert.deepEqual(first.summary,{agreedCents:0,paidCents:0,balanceCents:0,unpriced:2});assert.equal(first.work.agreedCents,null);
let revision=1;
const input=(kind,extra={})=>({clientId:'c',workId:'w',actionId:crypto.randomUUID(),kind,...extra});
const mutate=async(data,rev=revision,owner=a)=>(await db.query('select pro_record_client_operation($1,$2,$3) as revision',[owner,data,rev])).rows[0].revision;
async function fails(data,rev=revision,owner=a){const before=await state();await assert.rejects(()=>mutate(data,rev,owner));assert.deepEqual(await state(),before);}
await fails(input('payment',{amountCents:1}));
// A catalog service cannot enter stock consumption, including a forged direct RPC.
const service={...product,id:'service',sku:'SERVICE',name:'Servicio sin existencias',stock:0,minimum:0,itemType:'service'};
await db.query('select pro_upsert_catalog($1,$2)',[a,{products:[service]}]);
await fails(input('material',{productId:service.id,quantity:1}));
const charge=input('agreement',{amountCents:100001});revision=await mutate(charge);assert.equal(revision,2);
assert.equal((await page()).summary.agreedCents,100001);assert.equal((await page()).items.find(r=>r.id==='w2').agreedCents,null); // Same quote never creates another automatic charge.
assert.equal(await mutate(charge,1),2);await fails({...charge,amountCents:100000});
await fails(input('agreement',{amountCents:-1}));await fails(input('payment',{amountCents:0}));await fails(input('payment',{amountCents:100002}));await fails(input('payment',{amountCents:1.5}));
await fails(input('payment',{amountCents:100}),1);
await fails(input('material',{productId:'foreign',quantity:1}));await fails(input('material',{productId:'p',quantity:6}));await fails(input('material',{productId:'p',quantity:0.0001}));
await fails({...input('payment',{amountCents:100}),clientId:'c2'});
const material=input('material',{productId:'p',quantity:1.5});revision=await mutate(material);
assert.equal(await mutate(material,1),revision);await fails({...material,quantity:2});
const stored=await state();assert.equal(stored.document.products[0].stock,3.5);assert.equal(stored.document.movements.length,1);assert.deepEqual(stored.document.work,document.work);assert.deepEqual(stored.document.quotes,document.quotes);assert.equal((await page()).work.materialCost,187.88);
const payment=input('payment',{amountCents:40001,note:'Transferencia registrada'});revision=await mutate(payment);assert.equal(await mutate(payment,1),revision);assert.equal((await page()).work.balanceCents,60000);
await fails(input('agreement',{amountCents:40000}));
// Both compatibility and scoped writers must reject reassignments after activity.
await assert.rejects(()=>db.query('select pro_patch_core($1,\'work\',$2,$3)',[a,{...work,clientId:'c2',quoteId:undefined},revision]));
const changed={...(await state()).document,work:[{...work,clientId:'c2',quoteId:undefined},document.work[1]]};await assert.rejects(()=>db.query('select pro_save_workspace($1,$2,$3)',[a,changed,revision]));
// Cancellation preserves the balance and stock; only explicit reversal changes them.
revision=(await db.query('select pro_patch_core($1,\'work\',$2,$3) as revision',[a,{...work,cancelled:true},revision])).rows[0].revision;
assert.equal((await page()).work.balanceCents,60000);assert.equal((await state()).document.products[0].stock,3.5);await fails(input('payment',{amountCents:1}));
const returned=input('material_return',{entryId:material.actionId,note:'No utilizado'});revision=await mutate(returned);assert.equal((await state()).document.products[0].stock,5);assert.equal((await page()).work.materialCount,0);assert.equal((await page()).work.materialCost,0);
await fails(input('material_return',{entryId:material.actionId,note:'Duplicado'}));assert.equal(await mutate(returned,1),revision);
const voided=input('payment_void',{entryId:payment.actionId,note:'Error de registro'});revision=await mutate(voided);assert.equal((await page()).work.paidCents,0);assert.equal((await page()).work.balanceCents,100001);await fails(input('payment_void',{entryId:payment.actionId,note:'Duplicado'}));
assert.equal((await page(b)).summary.balanceCents,0);assert.equal(await page(a,'absent'),null);assert.equal(await page(a,'c2','w'),null);
// More than one page, preserving order and exact summary across pages.
revision=(await db.query('select pro_patch_core($1,\'work\',$2,$3) as revision',[a,work,revision])).rows[0].revision;
for(let n=0;n<22;n++)revision=await mutate(input('agreement',{amountCents:100001+n}));
const p1=await page(),p2=await page(a,'c','w',null,p1.nextEntryCursor);assert.equal(p1.entries.length,20);assert.ok(p2.entries.length>0);assert.equal(new Set([...p1.entries,...p2.entries].map(e=>e.id)).size,p1.entries.length+p2.entries.length);
// Work pages are bounded and chronological, including ties and unscheduled jobs.
for(let n=0;n<23;n++)revision=(await db.query('select pro_patch_core($1,\'work\',$2,$3) as revision',[a,{...work,id:'extra-'+String(n).padStart(2,'0'),start:'2026-12-01T12:00:00-06:00',end:'2026-12-01T13:00:00-06:00'},revision])).rows[0].revision;
const workPage1=await page(),workPage2=await page(a,'c','w',workPage1.nextCursor);
assert.equal(workPage1.items.length,20);assert.equal(workPage2.items.length,5);assert.equal(workPage2.nextCursor,null);
assert.equal(workPage1.items[0].id,'extra-00');assert.equal(new Set([...workPage1.items,...workPage2.items].map(r=>r.id)).size,25);
assert.deepEqual(workPage1.summary,workPage2.summary);
// RLS read isolation and RPC/mutation denial using the real authenticated role.
await db.exec(`set role authenticated;set request.jwt.claim.sub='${b}'`);
assert.equal((await db.query('select count(*)::int as n from pro_client_entries')).rows[0].n,0);
await assert.rejects(()=>db.query('select pro_client_operations_page($1,$2)',[a,'c']));
await assert.rejects(()=>db.query('select pro_record_client_operation($1,$2,$3)',[a,input('payment',{amountCents:1}),revision]));
await assert.rejects(()=>db.query('delete from pro_client_entries where user_id=$1',[a]));
await db.exec('reset role');
await db.query('delete from profiles where id=$1',[a]);
assert.equal((await db.query('select count(*)::int as n from pro_client_entries where user_id=$1',[a])).rows[0].n,0);
assert.deepEqual((await db.query('select document from pro_workspaces where user_id=$1',[b])).rows[0].document,document);
console.log('PASS additive preservation, explicit balances, exact cents, atomic stock, idempotency, reversals, cancellation, immutable relations, paging and RLS.');
await db.close();

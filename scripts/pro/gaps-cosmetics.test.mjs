// Run: node --test scripts/pro/gaps-cosmetics.test.mjs
// LOCAL PRO ONLY (walkthrough 3 cosmetic gaps, 2026-11-17). Pure unit tests, no DB/network:
//  a) suspension notice on /dashboard/profesional: ES/EN copy + it is rendered OUTSIDE the home card that is `lg:hidden`.
//  b) e-invoice: the receiver e-mail outcome returned by POST /api/pro/einvoice is shown (PDF hand-off wording).
//  c) «Agregar cliente» inside «Agregar solicitud»: inline create through the Clientes write contract, then preselect.
//  d) Spanish placeholders use «nombre@correo.com» / «nombre_usuario» (no «tu»); English unchanged.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {registerHooks} from 'node:module';

const root=new URL('../../',import.meta.url),src=new URL('src/',root).href;
registerHooks({resolve(spec,ctx,next){
 if(spec.startsWith('@/'))return next(src+spec.slice(2)+(/\.[a-z]+$/i.test(spec)?'':'.ts'),ctx);
 if(ctx.parentURL?.startsWith(src)&&spec.startsWith('.')&&!/\.[a-z]+$/i.test(spec))return next(spec+'.ts',ctx);
 return next(spec,ctx);
}});
const read=path=>readFileSync(new URL(path,root),'utf8');

// ---------------------------------------------------------------- a) suspension notice
const {suspensionNoticeCopy}=await import('../../src/lib/pro/suspension-notice.ts');
test('suspension notice: ES uses «usted», EN is English, the reason is appended only when present',()=>{
 const es=suspensionNoticeCopy('es','Documentos falsos'),en=suspensionNoticeCopy('en','Fake documents'),bare=suspensionNoticeCopy('es',null);
 assert.equal(es.title,'Su perfil está suspendido');assert.match(es.body,/Motivo: Documentos falsos$/);assert.match(es.cta,/escríbanos/);
 assert.ok(!/\b(tu|tú|tienes|escríbenos)\b/i.test(es.title+es.body+es.cta),'no «tú» in Spanish');
 assert.equal(en.title,'Your profile is suspended');assert.match(en.body,/Reason: Fake documents$/);
 assert.ok(!bare.body.includes('Motivo'));assert.ok(!suspensionNoticeCopy('es','   ').body.includes('Motivo'));
});
test('suspension notice is outside the section card (that card is lg:hidden on the home tab)',()=>{
 const page=read('src/app/[locale]/dashboard/profesional/page.tsx');
 const notice=page.indexOf('data-pro-suspended-notice'),row=page.indexOf('<div className="flex flex-col gap-5 lg:flex-row lg:items-stretch">'),card=page.indexOf('<SaveStatusProvider>');
 assert.ok(notice>0&&row>0&&card>0,'markers found');assert.ok(notice<row&&notice<card,'rendered before the content row/card');
 const block=page.slice(page.lastIndexOf('{pro?.is_banned === true',notice),page.indexOf('})()}',notice));
 assert.ok(!/\b(lg|md|sm|xl):hidden\b/.test(block)&&!/className="[^"]*\bhidden\b/.test(block),'no breakpoint hides it');
 assert.equal((page.match(/pro\?\.is_banned === true/g)??[]).length,1,'rendered once');
 assert.ok(!page.includes('>Su perfil está suspendido<'),'no hard-coded Spanish copy (EN uses the helper)');
});

// ---------------------------------------------------------------- b) e-invoice e-mail outcome
const {transactionalEmailNotice,parseTransactionalEmailView}=await import('../../src/lib/pro/transactional-email-copy.ts');
test('e-invoice e-mail notice: PDF hand-off wording for mock/no recipient/failed; «sent» only when queued',()=>{
 const mock=parseTransactionalEmailView({mode:'mock',status:'recorded',to:'c***@x.com'});
 assert.match(transactionalEmailNotice(mock,false,'customer','pdf'),/no se entregó ningún correo a c\*\*\*@x\.com\. Use «Imprimir o PDF» y envíeselo usted a su cliente\./);
 assert.match(transactionalEmailNotice(mock,true,'customer','pdf'),/no e-mail was delivered to c\*\*\*@x\.com\. Use «Print or PDF»/);
 assert.match(transactionalEmailNotice({mode:'mock',status:'no_recipient',to:null},false,'customer','pdf'),/no tiene correo del receptor/);
 assert.match(transactionalEmailNotice({mode:'mock',status:'no_recipient',to:null},true,'customer','pdf'),/no recipient e-mail/);
 assert.match(transactionalEmailNotice({mode:'sandbox',status:'failed',to:null},false,'customer','pdf'),/Imprimir o PDF/);
 assert.equal(transactionalEmailNotice({mode:'sandbox',status:'queued',to:'a@b.co'},false,'customer','pdf'),'Se envió un correo a a@b.co.');
 // Default (link) wording is unchanged for the other callers.
 assert.match(transactionalEmailNotice(mock,false),/Copie el enlace/);
});
test('invoice-einvoice reads `email` from the POST answer and renders it ES/EN',()=>{
 const ui=read('src/components/pro/invoice-einvoice.tsx'),route=read('src/app/api/pro/einvoice/route.ts');
 assert.match(route,/\.\.\.\(email\?\{email\}:\{\}\)/,'route still returns `email` after emit');
 assert.match(ui,/setMail\(parseTransactionalEmailView\(body\.email\)\)/);
 assert.match(ui,/data-transactional-email=\{mail\.mode\+':'\+mail\.status\}/);
 assert.match(ui,/transactionalEmailNotice\(mail,en,'customer','pdf'\)/);
});

// ---------------------------------------------------------------- c) inline customer
const {createCustomerInline,inlineCustomerRow}=await import('../../src/lib/pro/inline-customer.ts');
const actor='0b0d8a3c-6f5e-4c43-9a59-2d7c0b2f1a11',newId='4f0c7c9e-5d1b-4a8e-9f61-0d2a8c6b3e27';
function store(){const m=new Map();return {getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k),_m:m};}
function server({revision=7,conflicts=0}={}){
 const calls=[];let rev=revision,saved=null,left=conflicts;
 const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
 const request=async(url,init={})=>{calls.push({url,method:init.method??'GET',body:init.body});
  if(init.method==='PATCH'){const body=JSON.parse(init.body);if(left>0){left--;rev++;return json({error:'changed'},409);}assert.equal(body.revision,rev);assert.equal(body.clientWriteMode,'create');saved=body.rows[0];rev++;return json({id:saved.id,revision:rev});}
  const q=new URL(url,'http://x').searchParams;
  if(q.get('id'))return json({userId:actor,revision:rev,document:{clients:[saved]}});
  return json({userId:actor,revision:rev,items:[]});};
 return {request,calls};
}
test('inline customer: validates name/e-mail before any request',async()=>{
 const s=server();
 assert.deepEqual(await createCustomerInline({actor,fields:{name:'  ',email:'',phone:''},request:s.request,store:store(),newId:()=>newId}),{status:'invalid',field:'name'});
 assert.deepEqual(await createCustomerInline({actor,fields:{name:'Ana',email:'no-mail',phone:''},request:s.request,store:store(),newId:()=>newId}),{status:'invalid',field:'email'});
 assert.equal(s.calls.length,0);assert.equal(inlineCustomerRow({name:' Ana ',email:'',phone:''},newId).row.name,'Ana');
});
test('inline customer: creates through the single-customer write (PATCH /api/pro/catalog) and returns the canonical row',async()=>{
 const s=server(),st=store();
 const result=await createCustomerInline({actor,fields:{name:'María Pérez',email:'maria@correo.com',phone:'8888 0000'},request:s.request,store:st,newId:()=>newId});
 assert.equal(result.status,'created');assert.equal(result.client.id,newId);assert.equal(result.client.name,'María Pérez');
 assert.deepEqual(s.calls.map(c=>c.method),['GET','PATCH','GET']);
 const patch=JSON.parse(s.calls[1].body);assert.equal(patch.kind,'clients');assert.equal(patch.rows.length,1);assert.equal(patch.importing,false);
 assert.equal(st._m.size,0,'the recovery record is cleared after the canonical read');
});
test('inline customer: one automatic retry after a rejected revision conflict (nothing was written)',async()=>{
 const s=server({conflicts:1});
 const result=await createCustomerInline({actor,fields:{name:'Luis',email:'',phone:''},request:s.request,store:store(),newId:()=>newId});
 assert.equal(result.status,'created');assert.deepEqual(s.calls.map(c=>c.method),['GET','PATCH','GET','PATCH','GET']);
 const twice=server({conflicts:2});
 assert.deepEqual(await createCustomerInline({actor,fields:{name:'Luis',email:'',phone:''},request:twice.request,store:store(),newId:()=>newId}),{status:'rejected'});
});
test('inline customer: an unresolved Clientes save blocks a new one; a network failure keeps the recovery record',async()=>{
 const st=store(),s=server();
 st.setItem('ccr:pro:client-write:v1:'+actor,'{"broken":true}');
 assert.deepEqual(await createCustomerInline({actor,fields:{name:'Ana',email:'',phone:''},request:s.request,store:st,newId:()=>newId}),{status:'pending'});
 assert.equal(s.calls.length,0);
 const st2=store();
 const flaky=async(url,init={})=>{if(init.method==='PATCH')throw new TypeError('offline');return new Response(JSON.stringify({userId:actor,revision:3,items:[]}));};
 assert.deepEqual(await createCustomerInline({actor,fields:{name:'Ana',email:'',phone:''},request:flaky,store:st2,newId:()=>newId}),{status:'uncertain'});
 assert.equal(JSON.parse(st2.getItem('ccr:pro:client-write:v1:'+actor)).phase,'uncertain','Clientes can check this save later');
});
test('lead form: «Agregar cliente» is inline (no tab switch) and preselects the new customer',()=>{
 const ui=read('src/components/pro/manual-lead-editor.tsx');
 assert.ok(!/onAddCustomer\(\)/.test(ui)&&!ui.includes('awaitCreatedCustomer('),'no navigation to Clientes');
 assert.match(ui,/<InlineCustomerCreate actor=\{actor\}/);
 assert.match(ui,/retain\(\{\.\.\.memory\.current\?\?edit,clientId:client\.id\}\)/,'the draft keeps every field and gets the new client id');
 assert.match(ui,/selected=\{createdClient&&createdClient\.id===edit\.clientId\?createdClient:undefined\}/);
 const inline=read('src/components/pro/inline-customer-create.tsx');
 assert.ok(!/<form\s/.test(inline),'no nested <form> inside the lead form');assert.match(inline,/event\.key==='Enter'\)\{event\.preventDefault\(\)/);
});

// ---------------------------------------------------------------- d) placeholders
test('Spanish placeholders never use «tu»; English placeholders unchanged',()=>{
 const es=read('messages/es.json'),en=read('messages/en.json'),modal=read('src/components/auth/client-registration-modal.tsx');
 assert.ok(!es.includes('tu@email.com')&&!es.includes('"tu_usuario"'));
 assert.equal((es.match(/"emailPlaceholder": "nombre@correo\.com"/g)??[]).length,5);assert.match(es,/"socialUserPlaceholder": "nombre_usuario"/);
 assert.equal((en.match(/"emailPlaceholder": "you@email\.com"/g)??[]).length,5);assert.match(en,/"socialUserPlaceholder": "your_username"/);
 assert.ok(!modal.includes('"tu@email.com"'));assert.equal((modal.match(/placeholder=\{locale === "en" \? "you@email\.com" : "nombre@correo\.com"\}/g)??[]).length,2);
});

import {test,expect,type Page} from 'playwright/test';
import {createHash} from 'node:crypto';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {collectPageErrors,gotoOK,expectNoHorizontalOverflow} from './helpers';
import {ownerFixture,local,headersFor,origin} from './pro-round2-fixture';
import {MOCK_ESIGN_SECRET,mockEvent} from '../../src/lib/pro/integrations/esign/events';
import {signWebhook} from '../../src/lib/pro/integrations/webhook';

// Round 6B (2026-11-13): electronic signature with the MOCK provider (row 41). Disposable accounts, loopback
// only; nothing reaches DocuSign or any third party. Contract → request → signer page (viewed, signed) →
// signed PDF + audit certificate; webhook replay idempotent and forged signature refused; change order
// declined; quote cancelled; production refused without the server flag.
const shots=process.env.ROUND6B_SHOTS_DIR;
async function shot(page:Page,name:string,project:string,fullPage=false){if(!shots)return;mkdirSync(shots,{recursive:true});await page.screenshot({path:join(shots,`${name}-${project}.png`),fullPage});}
const sha=(data:Buffer)=>createHash('sha256').update(data).digest('hex');
type Req={id:string;status:string;envelopeId:string|null;revision:number;signerUrl:string|null;declineReason:string|null;artifacts:{kind:string;sha256:string}[];events:{status:string}[]};
for(const language of ['es','en'] as const)test(`Round 6B: electronic signature of a contract, a change order and a quote in mock mode [${language}]`,async({page},info)=>{
 test.setTimeout(480000);local(info.project.use.baseURL);const en=language==='en',project=info.project.name,label=language+crypto.randomUUID().slice(0,6);
 const tomorrow=new Date(Date.now()+86400000).toISOString().slice(0,10);
 const f=await ownerFixture(page.context(),label,(document,{workId})=>{document.work[0]={...document.work[0]!,stage:'scheduled',start:tomorrow+'T09:00:00-06:00',end:tomorrow+'T11:00:00-06:00'};void workId;});
 try{
  const errors=collectPageErrors(page),h=headersFor(f.owner),contractId=crypto.randomUUID(),changeId=crypto.randomUUID(),estimateId=crypto.randomUUID(),publicationId=crypto.randomUUID();
  const content={code:'CTR-0001',title:en?'Bathroom remodel contract':'Contrato de remodelación de baño',language,sharedOn:tomorrow,company:{name:'Remodelaciones '+label,identification:'3101123456'},client:{name:'Cliente ronda '+label,identification:'112340567'},project:{name:'Remodelación de cocina '+label,address:'San José'},estimate:null,depositPercent:30,
   clauses:[{position:1,title:en?'Scope':'Objeto',body:en?'Full bathroom remodel.':'Remodelación completa del baño.'},{position:2,title:en?'Payment':'Pago',body:en?'30% deposit, balance on delivery.':'30 % de anticipo y el saldo a la entrega.'}]};
  await f.db.from('pro_contracts').insert({owner_id:f.owner.id,id:contractId,work_id:f.workId,number:1,title:content.title,language,status:'shared',latest_version:1,clauses:content.clauses.map(c=>({id:crypto.randomUUID(),title:c.title,body:c.body,sourceClauseId:null}))}).throwOnError();
  await f.db.from('pro_contract_versions').insert({owner_id:f.owner.id,contract_id:contractId,version:1,id:crypto.randomUUID(),recipient_id:f.owner.id,recipient_name:'Cliente ronda '+label,content,content_hash:sha(Buffer.from(JSON.stringify(content)))}).throwOnError();
  const esign=async(kind:string,id:string)=>{const r=await page.request.get(origin+'/api/pro/esign?'+new URLSearchParams({kind,id}));expect(r.status(),await r.text()).toBe(200);return await r.json() as {requests:Req[];mode:string;blocked:string|null;document:{clientEmail:string}|null};};
  const post=(data:Record<string,unknown>)=>page.request.post(origin+'/api/pro/esign',{headers:h,data});

  // (1) Contract editor → «Firma electrónica» panel in local simulation; signer prefilled from the customer.
  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_agenda',cita:f.workId,vistaTrabajo:'contracts'}));
  await page.locator('[data-contract-card="CTR-0001"]').getByRole('button',{name:en?'Open':'Abrir',exact:true}).click({timeout:90000});
  const panel=page.locator('[data-esign="contract"]');await expect(panel).toBeVisible({timeout:60000});await expect(panel).toHaveAttribute('data-esign-mode','mock');
  await panel.locator('[data-esign-start]').click();
  await expect(panel.locator('[data-esign-field="name"]')).toHaveValue('Cliente ronda '+label);
  await expect(panel.locator('[data-esign-field="email"]')).toHaveValue('cliente.'+label+'@example.test');
  await panel.locator('[data-esign-field="days"]').fill('10');
  await panel.locator('[data-esign-send]').click();
  const dialog=page.getByRole('dialog',{name:en?'Send for signature?':'¿Enviar a firmar?'});await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(en?'Simulation mode: no email is sent':'Modo simulación: no se envía ningún correo');
  await dialog.getByRole('button',{name:en?'Send for signature':'Enviar a firmar',exact:true}).click();
  const row=panel.locator('[data-esign-request]').first();
  await expect(row.locator('[data-esign-status]')).toHaveAttribute('data-esign-status','sent',{timeout:60000});
  await expect(row.locator('[data-esign-events] li')).toHaveCount(2);
  await expect(panel.locator('[data-esign-start]')).toHaveCount(0); // one open request per document
  await expectNoHorizontalOverflow(page);await panel.scrollIntoViewIfNeeded();await shot(page,`r6b-esign-sent-${language}`,project);
  let current=(await esign('contract',contractId)).requests[0]!;
  expect(current.envelopeId).toMatch(/^env_[a-p]{24}$/);expect(current.signerUrl).toContain('/api/pro/esign/mock-sign?t=');
  const dup=await post({action:'create',actionId:crypto.randomUUID(),documentKind:'contract',documentId:contractId,signerName:'Otra',signerEmail:'otra@example.test',language});
  expect(dup.status()).toBe(409);expect((await dup.json()).reason).toBe('pro_esign_open');

  // (2) The signer opens the link (viewed) and signs with typed name + consent.
  const signer=await page.context().newPage();
  await gotoOK(signer,current.signerUrl!);
  await expect(signer.locator('[data-mock-signer]')).toHaveAttribute('data-mock-signer-status','viewed');
  await expectNoHorizontalOverflow(signer);await shot(signer,`r6b-esign-signer-${language}`,project,true);
  await signer.locator('[data-mock-sign-submit]').click();
  await expect(signer.locator('[data-mock-signer]')).toHaveAttribute('data-mock-signer-status','viewed'); // HTML validation keeps it open
  await signer.locator('[data-mock-sign-name]').fill('Cliente ronda '+label);await signer.locator('[data-mock-sign-consent]').check();
  await signer.locator('[data-mock-sign-submit]').click();
  await expect(signer.locator('[data-mock-signer]')).toHaveAttribute('data-mock-signer-status','signed',{timeout:60000});
  await expect(signer.locator('[data-mock-signer-notice]')).toContainText(en?'Signed.':'Firmado.');
  await signer.close();
  await panel.locator('[data-esign-refresh]').first().click();
  await expect(row.locator('[data-esign-status]')).toHaveAttribute('data-esign-status','signed',{timeout:60000});
  await expect(row.locator('[data-esign-events] li')).toHaveText(en?[/Created/,/Sent, waiting/,/Opened by the signer/,/Signed/]:[/Creada/,/Enviada, esperando/,/Abierta por quien firma/,/Firmada/]);
  await expect(row.locator('[data-esign-download="signed_pdf"]')).toBeVisible();await expect(row.locator('[data-esign-download="certificate"]')).toBeVisible();
  await expect(row.locator('[data-esign-signer-link]')).toHaveCount(0);
  await expectNoHorizontalOverflow(page);await row.scrollIntoViewIfNeeded();await shot(page,`r6b-esign-signed-${language}`,project);
  current=(await esign('contract',contractId)).requests[0]!;
  // (3) Stored evidence: signed PDF and certificate, served byte-identical with their SHA-256.
  for(const kind of ['signed_pdf','certificate'] as const){
   const file=await page.request.get(origin+'/api/pro/esign-file?'+new URLSearchParams({id:current.id,kind}));expect(file.status()).toBe(200);
   expect(file.headers()['content-type']).toBe('application/pdf');const body=Buffer.from(await file.body());
   expect(body.subarray(0,8).toString('latin1')).toBe('%PDF-1.4');expect(sha(body)).toBe(file.headers()['x-content-sha256']);expect(sha(body)).toBe(current.artifacts.find(a=>a.kind===kind)!.sha256);
   if(kind==='certificate'){const text=body.toString('latin1');expect(text).toContain(current.envelopeId!);expect(text).toContain('8454');}
   else expect(body.toString('latin1')).toContain(en?'Electronically signed':'Firmado electr');
  }
  const original=await page.request.get(origin+'/api/pro/esign-file?'+new URLSearchParams({id:current.id,kind:'original'}));expect(original.status()).toBe(200);
  expect(Buffer.from(await original.body()).toString('latin1')).toContain('/firma1/');
  // (4) Webhook: replay of the provider's «delivered» is a duplicate; a forged signature is refused; state stays signed.
  const send=(event:{body:string;signature:string})=>page.request.post(origin+'/api/pro/integrations/webhooks/esign',{headers:{'Content-Type':'application/json','X-CCR-Signature':event.signature},data:event.body});
  // Same event id («delivered» of this envelope) with a different body: refused, never re-applied.
  const reused=await send(mockEvent(current.envelopeId!,'delivered'));expect(reused.status()).toBe(409);expect((await reused.json()).reason).toBe('event_id_conflict');
  // A redelivery of the SAME body is a duplicate (the first delivery is ignored: it arrives after «signed»).
  const stale=mockEvent(current.envelopeId!,'sent');
  expect(await (await send(stale)).json()).toMatchObject({status:'ignored',review:'out_of_order'});
  expect(await (await send(stale)).json()).toMatchObject({status:'ignored',duplicate:true});
  const forgedBody=mockEvent(current.envelopeId!,'declined',{reason:'Falso'}).body;
  const forged=await page.request.post(origin+'/api/pro/integrations/webhooks/esign',{headers:{'Content-Type':'application/json','X-CCR-Signature':signWebhook('otra-llave',forgedBody)},data:forgedBody});
  expect(forged.status()).toBe(401);
  const unsigned=await page.request.post(origin+'/api/pro/integrations/webhooks/esign',{headers:{'Content-Type':'application/json'},data:forgedBody});expect(unsigned.status()).toBe(401);
  const lateDecline=mockEvent(current.envelopeId!,'declined',{reason:'Tarde'});
  const late=await page.request.post(origin+'/api/pro/integrations/webhooks/esign',{headers:{'Content-Type':'application/json','X-CCR-Signature':signWebhook(MOCK_ESIGN_SECRET,lateDecline.body)},data:lateDecline.body});
  expect(await late.json()).toMatchObject({status:'ignored',review:'out_of_order'});
  expect((await esign('contract',contractId)).requests[0]!.status).toBe('signed');

  // (5) Change order: request by API, the signer declines with a reason.
  await f.db.from('pro_work_changes').insert({owner_id:f.owner.id,id:changeId,work_id:f.workId,reason:en?'Premium tiles':'Azulejo premium',lines:[{description:en?'Premium tiles':'Azulejo premium',amountCents:2500000}],base_cents:100000000,base_position:0,delta_cents:2500000,total_cents:102500000,status:'proposed'}).throwOnError();
  const created=await post({action:'create',actionId:crypto.randomUUID(),documentKind:'work_change',documentId:changeId,signerName:'Cliente ronda '+label,signerEmail:'cliente.'+label+'@example.test',language});
  expect(created.status(),await created.text()).toBe(200);
  const change=(await esign('work_change',changeId)).requests[0]!;expect(change.status).toBe('sent');
  const token=new URL(change.signerUrl!).searchParams.get('t')!;
  const declined=await page.request.post(origin+'/api/pro/esign/mock-sign',{headers:{Origin:origin},form:{t:token,action:'decline',reason:en?'The amount is not what we agreed':'El monto no es el acordado'}});
  expect(declined.status()).toBe(200);
  const after=(await esign('work_change',changeId)).requests[0]!;
  expect(after.status).toBe('declined');expect(after.declineReason).toBe(en?'The amount is not what we agreed':'El monto no es el acordado');
  expect(after.artifacts).toEqual([]);
  // (6) Quote publication: created then cancelled (CAS revision; stale revision 409).
  await f.db.from('pro_private_estimates').insert({owner_id:f.owner.id,id:estimateId,client_id:f.clientId,client_snapshot:{name:'Cliente ronda '+label},issuer:{},title:'Cotización '+label,notes:'',currency:'CRC',subtotal_cents:10000000,discount_cents:0,tax_cents:1300000,total_cents:11300000,revision:1}).throwOnError();
  await f.db.from('pro_private_estimate_publications').insert({owner_id:f.owner.id,id:publicationId,estimate_id:estimateId,client_id:f.clientId,version:1,estimate_revision:1,content:{title:'Cotización '+label,currency:'CRC',totalCents:11300000,subtotalCents:10000000,discountCents:0,taxCents:1300000,lines:[{description:'Mano de obra',quantity:1,totalCents:10000000}]},content_hash:'f'.repeat(64)}).throwOnError();
  await f.db.from('pro_private_estimate_publication_states').insert({publication_id:publicationId,status:'awaiting_claim'}).throwOnError();
  expect((await post({action:'create',actionId:crypto.randomUUID(),documentKind:'quote',documentId:publicationId,signerName:'Cliente ronda '+label,signerEmail:'cliente.'+label+'@example.test',language})).status()).toBe(200);
  const quote=(await esign('quote',publicationId)).requests[0]!;
  expect((await post({action:'cancel',actionId:crypto.randomUUID(),id:quote.id,revision:quote.revision-1})).status()).toBe(409);
  const cancelled=await post({action:'cancel',actionId:crypto.randomUUID(),id:quote.id,revision:quote.revision});expect(cancelled.status()).toBe(200);
  expect((await esign('quote',publicationId)).requests[0]!.status).toBe('cancelled');
  const closed=await page.request.get(origin+'/api/pro/esign/mock-sign?t='+new URL(quote.signerUrl!).searchParams.get('t'));
  expect(await closed.text()).toContain('data-mock-signer-status="cancelled"');
  // (7) Production is refused without the server flag; sandbox without keys blocks new requests.
  const state=async()=>(await (await page.request.get(origin+'/api/pro/integrations')).json()) as {providers:{id:string;connection:{revision:number}}[]};
  const rev=async()=>(await state()).providers.find(p=>p.id==='esign')!.connection.revision;
  const refused=await page.request.post(origin+'/api/pro/integrations',{headers:h,data:{action:'set_mode',actionId:crypto.randomUUID(),provider:'esign',revision:await rev(),mode:'production',confirm:'ACTIVAR PRODUCCION'}});
  expect(refused.status()).toBe(403);expect((await refused.json()).reason).toBe('production_refused');
  expect((await page.request.post(origin+'/api/pro/integrations',{headers:h,data:{action:'set_mode',actionId:crypto.randomUUID(),provider:'esign',revision:await rev(),mode:'sandbox'}})).status()).toBe(200);
  const blocked=await post({action:'create',actionId:crypto.randomUUID(),documentKind:'quote',documentId:publicationId,signerName:'Cliente',signerEmail:'c@example.test',language});
  expect(blocked.status()).toBe(409);expect((await blocked.json()).reason).toBe('missing_keys');
  expect((await page.request.post(origin+'/api/pro/integrations',{headers:h,data:{action:'set_mode',actionId:crypto.randomUUID(),provider:'esign',revision:await rev(),mode:'mock'}})).status()).toBe(200);
  // The integrations page shows the new providers in local simulation, DocuSign variables not set.
  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_company',empresa:'integraciones'}));
  const root=page.locator('[data-company-integrations]');await expect(root).toBeVisible({timeout:90000});
  for(const provider of ['esign','google','microsoft','quickbooks'])await expect(root.locator(`[data-integration="${provider}"]`)).toHaveAttribute('data-integration-status','ready');
  await expect(root.locator('[data-integration="esign"] [data-integration-env="PRO_DOCUSIGN_SANDBOX_CONNECT_HMAC"]')).toHaveAttribute('data-present','false');
  await root.locator('[data-integration="esign"] [data-integration-test]').click();
  await expect(root.locator('[data-integration="esign"] [data-integration-test-result="ok"]')).toBeVisible({timeout:60000});
  await expectNoHorizontalOverflow(page);await root.locator('[data-integration="esign"]').scrollIntoViewIfNeeded();await shot(page,`r6b-integrations-esign-${language}`,project);
  expect(errors()).toEqual([]);
 }finally{await f.cleanup();}
});

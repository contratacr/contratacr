import {test,expect,type Page} from 'playwright/test';
import {createHash} from 'node:crypto';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {collectPageErrors,gotoOK,expectNoHorizontalOverflow} from './helpers';
import {ownerFixture,local,headersFor,origin,type Owner} from './pro-round2-fixture';
import {blankInvoiceLine} from '../../src/lib/pro/invoice-detail';
import {emptyInvoicePreparation} from '../../src/lib/pro/invoice-preparation';
import {MOCK_WEBHOOK_SECRET,signWebhook} from '../../src/lib/pro/integrations/webhook';

// Round 6A (2026-11-13): integrations framework + Hacienda e-invoice (mock ATV) + online payments (mock
// processor). Disposable accounts, loopback only; nothing reaches Hacienda or any processor, nothing is
// e-mailed. Card numbers are the public test fixtures of the local mock.
const shots=process.env.ROUND6A_SHOTS_DIR;
async function shot(page:Page,name:string,project:string,fullPage=false){if(!shots)return;mkdirSync(shots,{recursive:true});await page.screenshot({path:join(shots,`${name}-${project}.png`),fullPage});}
const entry=(f:Owner,kind:string,amount:number,text:string,reversal:string|null=null)=>({user_id:f.owner.id,id:crypto.randomUUID(),client_id:f.clientId,work_id:f.workId,kind,amount_cents:amount,label:text,reversal_id:reversal,request_hash:createHash('md5').update(crypto.randomUUID()).digest('hex')});
const line=(patch:Record<string,unknown>={})=>({...blankInvoiceLine(),kind:'service',description:'Remodelación de baño completa',cabys:'4329000000100',unit:'Sp',quantity:'1',unitPrice:'1000000',taxTreatment:'vat',taxRate:'13',tax:{vatCode:'08',exemption:null},...patch});
async function draft(page:Page,f:Owner,{receiverId='112340567',lines=[line()],linkWork=true,title='Factura remodelación'}:{receiverId?:string;lines?:Record<string,unknown>[];linkWork?:boolean;title?:string}={}){
 const h=headersFor(f.owner),requestId=crypto.randomUUID();
 const created=await page.request.post(origin+'/api/pro/invoice-drafts',{headers:h,data:{action:'create_direct',requestId,clientId:f.clientId,title,notes:'Gracias por su confianza',lines}});
 expect(created.status(),await created.text()).toBe(200);
 const read=async()=>(await (await page.request.get(origin+'/api/pro/invoice-drafts?id='+requestId)).json()).draft;
 const current=await read();
 const updated=await page.request.post(origin+'/api/pro/invoice-drafts',{headers:h,data:{action:'update',id:requestId,revision:current.revision,title,notes:'Gracias por su confianza',
  receiver:{name:'Carla Cliente',identification:receiverId,email:'carla@example.test',phone:'8888-1111',address:'San José',identificationType:'individual',activity:'',province:'',canton:'',district:'',neighborhood:''},
  preparation:{...emptyInvoicePreparation(),issuerName:'Remodelaciones Prueba',saleCondition:'cash',paymentMethod:'sinpe'}}});
 expect(updated.status(),await updated.text()).toBe(200);
 if(linkWork)await f.db.from('pro_invoice_drafts').update({work_id:f.workId}).eq('user_id',f.owner.id).eq('id',requestId).throwOnError();
 return {id:requestId,read};
}
const integrations=(page:Page,f:Owner,data:Record<string,unknown>)=>page.request.post(origin+'/api/pro/integrations',{headers:headersFor(f.owner),data:{actionId:crypto.randomUUID(),...data}});
const confirmDialog=async(page:Page,name:RegExp|string,button:string,input?:string)=>{const dialog=page.getByRole('dialog',{name});await expect(dialog).toBeVisible();if(input!==undefined)await dialog.getByRole('textbox').fill(input);await dialog.getByRole('button',{name:button,exact:true}).click();await expect(dialog).toBeHidden();};

for(const language of ['es','en'] as const)test(`Round 6A: integrations page and Hacienda e-invoice v4.4 in mock mode [${language}]`,async({page},info)=>{
 test.setTimeout(600000);local(info.project.use.baseURL);const en=language==='en',project=info.project.name,id=language+crypto.randomUUID().slice(0,6);
 const f=await ownerFixture(page.context(),id);
 try{
  const errors=collectPageErrors(page);
  await f.db.from('pro_client_entries').insert(entry(f,'agreement',113000000,'Acuerdo R6A')).throwOnError();
  // (1) Company › Integraciones: both providers in local simulation, production locked on this server.
  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_company',empresa:'integraciones'}));
  const root=page.locator('[data-company-integrations]');await expect(root).toBeVisible({timeout:90000});
  for(const provider of ['hacienda','tilopay']){const card=root.locator(`[data-integration="${provider}"]`);await expect(card).toHaveAttribute('data-integration-mode','mock');await expect(card).toHaveAttribute('data-integration-status','ready');await expect(card.locator('[data-integration-set-mode="production"]')).toBeDisabled();}
  await expect(root.locator('[data-integration="hacienda"] [data-integration-env="PRO_HACIENDA_SANDBOX_P12_PATH"]')).toHaveAttribute('data-present','false');
  await root.locator('[data-integration="hacienda"] [data-integration-test]').click();
  await expect(root.locator('[data-integration="hacienda"] [data-integration-test-result="ok"]')).toBeVisible({timeout:60000});
  await root.locator('[data-integration="tilopay"] [data-integration-test]').click();
  await expect(root.locator('[data-integration="tilopay"] [data-integration-test-result="ok"]')).toBeVisible({timeout:60000});
  await expect(root.locator('[data-integration-requests] li').first()).toBeVisible();
  const raw=await (await page.request.get(origin+'/api/pro/integrations')).text();
  expect(raw).not.toMatch(/sk_|password"\s*:\s*"[^[]/i);
  // Issuer details form (suggested from the issuer settings, saved by the owner).
  const form=root.locator('[data-emisor-settings]');
  await form.locator('[data-emisor-field="idNumber"]').fill('3101123456');await form.locator('[data-emisor-field="name"]').fill('Remodelaciones Prueba S.A.');
  await form.locator('[data-emisor-field="activityCode"]').fill('410001');await form.locator('[data-emisor-field="providerSystems"]').fill('3101123456');
  await form.locator('[data-emisor-field="canton"]').fill('01');await form.locator('[data-emisor-field="district"]').fill('08');
  await form.locator('[data-emisor-field="otherSigns"]').fill('Cien metros norte del parque');await form.locator('[data-emisor-field="email"]').fill('facturas@example.test');
  await form.locator('[data-emisor-save]').click();await expect(form.locator('[data-emisor-saved]')).toBeVisible({timeout:30000});
  await expectNoHorizontalOverflow(page);await root.locator('[data-integration="hacienda"]').scrollIntoViewIfNeeded();await shot(page,`r6a-integrations-${language}`,project);

  // (2) Mode rules: production refused without the server flag; sandbox without keys stops issuing.
  const state=async()=>(await (await page.request.get(origin+'/api/pro/integrations')).json()) as {providers:{id:string;connection:{revision:number;mode:string}}[]};
  const rev=async(p:string)=>(await state()).providers.find(row=>row.id===p)!.connection.revision;
  const refused=await integrations(page,f,{action:'set_mode',provider:'hacienda',revision:await rev('hacienda'),mode:'production',confirm:'ACTIVAR PRODUCCION'});
  expect(refused.status()).toBe(403);expect((await refused.json()).reason).toBe('production_refused');
  expect((await integrations(page,f,{action:'save_config',provider:'tilopay',revision:await rev('tilopay'),config:{apiKey:'sk_test_123'}})).status()).toBe(400);
  expect((await integrations(page,f,{action:'set_mode',provider:'hacienda',revision:await rev('hacienda'),mode:'sandbox'})).status()).toBe(200);

  const d=await draft(page,f);
  const sandboxRead=await (await page.request.get(origin+'/api/pro/einvoice?draftId='+d.id)).json();
  expect(sandboxRead.mode).toBe('sandbox');expect(sandboxRead.modeStatus).toBe('missing_keys');
  const blocked=await page.request.post(origin+'/api/pro/einvoice',{headers:headersFor(f.owner),data:{action:'emit',actionId:crypto.randomUUID(),draftId:d.id,docType:'01'}});
  expect(blocked.status()).toBe(409);expect((await blocked.json()).reason).toBe('missing_keys');
  expect((await integrations(page,f,{action:'set_mode',provider:'hacienda',revision:await rev('hacienda'),mode:'mock'})).status()).toBe(200);

  // (3) Emit a Factura Electrónica from the draft (UI), then ask for the final state.
  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_billing',factura:d.id,fiscalFactura:d.id}));
  const panel=page.locator('[data-einvoice]');await expect(panel).toBeVisible({timeout:90000});
  await expect(panel.locator('[data-einvoice-mode="mock"]')).toBeVisible();
  await expect(panel.locator('[data-einvoice-ready="01"]')).toBeVisible();
  await shot(page,`r6a-einvoice-ready-${language}`,project);
  await panel.locator('[data-einvoice-emit="01"]').click();
  await confirmDialog(page,en?'Issue electronic invoice?':'¿Emitir factura electrónica?',en?'Issue invoice':'Emitir factura');
  const doc=panel.locator('[data-einvoice-doc="00100001010000000001"]');
  await expect(doc.locator('[data-einvoice-status]')).toHaveAttribute('data-einvoice-status','recibido',{timeout:60000});
  await expect(panel.locator('[data-einvoice-locked]')).toBeVisible();
  // Gaps 2026-11-17: the receiver e-mail outcome the route returns is shown (mock: nothing delivered, PDF hand-off).
  const mail=panel.locator('[data-einvoice-email]');await expect(mail).toHaveAttribute('data-transactional-email',/^mock:(recorded|no_recipient)$/);
  await expect(mail).toContainText(en?'Print or PDF':'Imprimir o PDF');
  await doc.locator('[data-einvoice-poll]').click();
  await expect(doc.locator('[data-einvoice-status]')).toHaveAttribute('data-einvoice-status','aceptado',{timeout:60000});
  const clave=(await doc.locator('[data-einvoice-clave]').textContent())!.trim();
  expect(clave).toMatch(/^506\d{6}003101123456001000010100000000011\d{8}$/);
  await expect(doc.locator('[data-einvoice-events] li')).toHaveText(en?['Reserved (unsigned)','Signed','Sent to Hacienda','Received by Hacienda','Accepted']:['Reservado (sin firmar)','Firmado','Enviado a Hacienda','Recibido por Hacienda','Aceptado']);
  await expectNoHorizontalOverflow(page);await doc.scrollIntoViewIfNeeded();await shot(page,`r6a-einvoice-accepted-${language}`,project);
  const docs=(await (await page.request.get(origin+'/api/pro/einvoice?draftId='+d.id)).json()).documents as {id:string;clave:string;totalCents:number}[];
  expect(docs[0]!.clave).toBe(clave);expect(docs[0]!.totalCents).toBe(113000000);
  const xml=await page.request.get(origin+'/api/pro/einvoice-file?'+new URLSearchParams({id:docs[0]!.id,kind:'xml'}));
  expect(xml.status()).toBe(200);expect(xml.headers()['content-disposition']).toContain(clave+'.xml');
  const text=await xml.text();
  expect(text).toContain('<FacturaElectronica xmlns="https://cdn.comprobanteselectronicos.go.cr/xml-schemas/v4.4/facturaElectronica">');
  expect(text).toContain(`<Clave>${clave}</Clave>`);expect(text).toContain('<CodigoCABYS>4329000000100</CodigoCABYS>');expect(text).toContain('<TotalComprobante>1130000.00000</TotalComprobante>');expect(text).toContain('<TipoMedioPago>06</TipoMedioPago>');
  expect(text).toContain('<ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#"');
  const answer=await (await page.request.get(origin+'/api/pro/einvoice-file?'+new URLSearchParams({id:docs[0]!.id,kind:'response'}))).text();
  expect(answer).toContain('<Mensaje>1</Mensaje>');expect(answer).toContain('SIMULACIÓN');
  const printPage=await page.context().newPage();await gotoOK(printPage,origin+'/api/pro/einvoice-file?'+new URLSearchParams({id:docs[0]!.id,kind:'print',lang:language}));
  await expect(printPage.locator('[data-print-clave]')).toHaveText(clave);await expect(printPage.locator('[data-print-mode="mock"]')).toBeVisible();await expectNoHorizontalOverflow(printPage);await shot(printPage,`r6a-einvoice-print-${language}`,project,true);await printPage.close();
  // The draft is locked once emitted.
  const current=await d.read();
  const locked=await page.request.post(origin+'/api/pro/invoice-drafts',{headers:headersFor(f.owner),data:{action:'update',id:d.id,revision:current.revision,title:'Otro título',notes:current.notes,receiver:current.receiver,preparation:current.preparation}});
  expect(locked.status()).toBe(400);expect((await locked.json()).reason).toBe('emitted');
  // (4) Credit note cancelling the whole accepted invoice (UI).
  await doc.locator('[data-einvoice-credit]').click();
  const credit=doc.locator('[data-einvoice-credit-form]');await credit.getByLabel(en?'Cancel the whole document':'Anular el comprobante completo').check();
  await credit.locator('[data-einvoice-credit-reason]').fill(en?'Wrong customer details':'Datos del cliente equivocados');
  await credit.locator('[data-einvoice-credit-submit]').click();
  const note=panel.locator('[data-einvoice-doc="00100001030000000001"]');
  await expect(note.locator('[data-einvoice-status]')).toHaveAttribute('data-einvoice-status','recibido',{timeout:60000});
  await note.locator('[data-einvoice-poll]').click();await expect(note.locator('[data-einvoice-status]')).toHaveAttribute('data-einvoice-status','aceptado',{timeout:60000});
  const noteId=((await (await page.request.get(origin+'/api/pro/einvoice?draftId='+d.id)).json()).documents as {id:string;docType:string}[]).find(row=>row.docType==='03')!.id;
  const noteXml=await (await page.request.get(origin+'/api/pro/einvoice-file?'+new URLSearchParams({id:noteId,kind:'xml'}))).text();
  expect(noteXml).toContain(`<InformacionReferencia><TipoDocIR>01</TipoDocIR><Numero>${clave}</Numero>`);expect(noteXml).toContain('<Codigo>01</Codigo>');
  await note.scrollIntoViewIfNeeded();await shot(page,`r6a-einvoice-credit-${language}`,project);

  // (5) Validation before submit: no CAByS / no tax → nothing reserved.
  const bad=await draft(page,f,{lines:[line({cabys:'',taxTreatment:'pending',taxRate:'0',tax:null,description:'Trabajo sin clasificar'})],linkWork:false,title:'Sin clasificar'});
  const badRead=await (await page.request.get(origin+'/api/pro/einvoice?draftId='+bad.id)).json();
  expect(badRead.issues['01'].map((row:{field:string})=>row.field)).toEqual(expect.arrayContaining(['lines.1.cabys','lines.1.tax']));
  const refusedEmit=await page.request.post(origin+'/api/pro/einvoice',{headers:headersFor(f.owner),data:{action:'emit',actionId:crypto.randomUUID(),draftId:bad.id,docType:'01'}});
  expect(refusedEmit.status()).toBe(400);expect((await refusedEmit.json()).issues.length).toBeGreaterThan(0);
  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_billing',factura:bad.id,fiscalFactura:bad.id}));
  await expect(page.locator('[data-einvoice-issues="01"]')).toContainText('CAByS',{timeout:90000});await expect(page.locator('[data-einvoice-emit="01"]')).toBeDisabled();
  await shot(page,`r6a-einvoice-issues-${language}`,project);
  // (6) Mock ATV rejection fixture (receiver 999999999): rejected, the draft is free again, new consecutivo next time.
  const rejected=await draft(page,f,{receiverId:'999999999',linkWork:false,title:'Receptor no inscrito'});
  const emitted=await page.request.post(origin+'/api/pro/einvoice',{headers:headersFor(f.owner),data:{action:'emit',actionId:crypto.randomUUID(),draftId:rejected.id,docType:'01'}});
  expect(emitted.status(),await emitted.text()).toBe(200);const rejectedDoc=(await emitted.json()).document;expect(rejectedDoc.consecutivo).toBe('00100001010000000002');expect(rejectedDoc).not.toHaveProperty('signedXml');
  const polled=await page.request.post(origin+'/api/pro/einvoice',{headers:headersFor(f.owner),data:{action:'poll',actionId:crypto.randomUUID(),documentId:rejectedDoc.id}});
  expect((await polled.json()).document.status).toBe('rechazado');
  const freed=await rejected.read();
  expect((await page.request.post(origin+'/api/pro/invoice-drafts',{headers:headersFor(f.owner),data:{action:'update',id:rejected.id,revision:freed.revision,title:'Receptor corregido',notes:freed.notes,receiver:freed.receiver,preparation:freed.preparation}})).status()).toBe(200);
  // Other owners never see these documents.
  expect((await page.request.get(origin+'/api/pro/einvoice-file?'+new URLSearchParams({id:crypto.randomUUID(),kind:'xml'}))).status()).toBe(404);
  expect(errors()).toEqual([]);
 }finally{await f.cleanup();}
});

for(const language of ['es','en'] as const)test(`Round 6A: online payment link — card, 3-D Secure, SINPE, exactly-once webhook, refund, reconciliation [${language}]`,async({page,browser},info)=>{
 test.setTimeout(600000);local(info.project.use.baseURL);const en=language==='en',project=info.project.name,id=language+crypto.randomUUID().slice(0,6);
 const m=(colones:string)=>en?colones.replaceAll('.',','):colones;
 const f=await ownerFixture(page.context(),id);
 try{
  const errors=collectPageErrors(page),h=headersFor(f.owner);
  await f.db.from('pro_client_entries').insert(entry(f,'agreement',113000000,'Acuerdo R6A')).throwOnError();
  const state=async()=>(await (await page.request.get(origin+'/api/pro/integrations')).json()) as {providers:{id:string;connection:{revision:number}}[]};
  expect((await integrations(page,f,{action:'save_config',provider:'tilopay',revision:(await state()).providers.find(row=>row.id==='tilopay')!.connection.revision,config:{cardEnabled:true,sinpeEnabled:true,sinpePhone:'88887777',linkDays:7}})).status()).toBe(200);
  const d=await draft(page,f);
  // (1) Owner creates the link from the draft (UI). The URL is shown once.
  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_billing',factura:d.id,cobroFactura:d.id}));
  const panel=page.locator('[data-payment-link-panel]');await expect(panel.locator('[data-payment-link-due]')).toHaveText(m('₡1.130.000'),{timeout:90000});
  await expect(panel.locator('[data-payment-link-mode="mock"]')).toBeVisible();
  await panel.locator('[data-payment-link-create]').click();
  const url=await panel.locator('[data-payment-link-url]').inputValue();
  expect(url).toMatch(new RegExp(`^${origin}${en?'/en':''}/pagar#enlace=[A-Za-z0-9_-]{43}$`));
  await expect(panel.locator('[data-payment-link="active"]')).toBeVisible();
  await expectNoHorizontalOverflow(page);await shot(page,`r6a-payment-link-owner-${language}`,project);
  const stored=await f.db.from('pro_payment_links').select('token_hash').eq('owner_id',f.owner.id).single().throwOnError();
  expect(stored.data!.token_hash).not.toContain(url.split('#enlace=')[1]!);
  // (2) The customer (no account) opens the hosted page.
  const customer=await browser.newContext({baseURL:origin});const pay=await customer.newPage();const payErrors=collectPageErrors(pay);
  await gotoOK(pay,url);
  const portal=pay.locator('[data-payment-portal]');await expect(portal).toHaveAttribute('data-payment-portal','active',{timeout:90000});
  expect(new URL(pay.url()).hash).toBe('');
  await expect(pay.locator('[data-payment-portal-mock]')).toBeVisible();await expect(pay.locator('[data-payment-portal-amount]')).toHaveText(m('₡1.130.000'));
  await expectNoHorizontalOverflow(pay);await shot(pay,`r6a-payment-portal-${language}`,project);
  const fillCard=async(number:string)=>{const form=pay.locator('[data-payment-portal-card]');await form.getByLabel(en?'Card number':'Número de tarjeta').fill(number);await form.getByLabel(en?'Expiry (MM/YY)':'Vence (MM/AA)').fill('12/30');await form.getByLabel('CVC').fill('123');await form.getByLabel(en?'Name on card':'Nombre en la tarjeta').fill('Carla Cliente');await form.locator('[data-payment-portal-pay]').click();};
  await fillCard('4000 0000 0000 0002');await expect(pay.locator('[data-payment-portal-error]')).toContainText(en?'declined':'rechazó',{timeout:60000});
  await fillCard('4000 0000 0000 3220');await expect(pay.locator('[data-payment-portal-3ds]')).toBeVisible({timeout:60000});await shot(pay,`r6a-payment-portal-3ds-${language}`,project);
  await pay.locator('[data-payment-portal-reject]').click();await expect(pay.locator('[data-payment-portal-error]')).toContainText(en?'verification':'verificación',{timeout:60000});
  await fillCard('4242 4242 4242 4242');await expect(pay.locator('[data-payment-portal-paid]')).toBeVisible({timeout:60000});
  await expect(portal).toHaveAttribute('data-payment-portal','paid');await shot(pay,`r6a-payment-portal-paid-${language}`,project);
  // (3) Exactly one ledger payment, applied to the draft; never a card number stored.
  const payments=async()=>(await f.db.from('pro_client_entries').select('id,kind,amount_cents,label').eq('user_id',f.owner.id).eq('work_id',f.workId).in('kind',['payment','payment_void'])).data!;
  expect((await payments()).filter(row=>row.kind==='payment')).toHaveLength(1);expect((await payments())[0]).toMatchObject({kind:'payment',amount_cents:113000000});
  const attempts=(await f.db.from('pro_payment_attempts').select('status,card_last4,failure_code').eq('owner_id',f.owner.id)).data!;
  expect(attempts.map(row=>row.status).sort()).toEqual(['failed','failed','succeeded']);expect(JSON.stringify(attempts)).not.toContain('4242424242424242');
  const inbox=(await f.db.from('pro_integration_webhooks').select('payload,event_id,status').eq('owner_id',f.owner.id).eq('event_type','payment.succeeded')).data!;
  expect(inbox).toHaveLength(1);expect(JSON.stringify(inbox)).not.toMatch(/4242424242424242|4000000000003220/);
  const logs=(await f.db.from('pro_integration_requests').select('summary,target').eq('owner_id',f.owner.id)).data!;expect(JSON.stringify(logs)).not.toMatch(/424242424242|cvc/i);
  // (4) Replays of the processor event are duplicates; bad or missing signatures are refused.
  const body=JSON.stringify(inbox[0]!.payload);
  const replay=await page.request.post(origin+'/api/pro/integrations/webhooks/tilopay',{headers:{'Content-Type':'application/json','X-CCR-Signature':signWebhook(MOCK_WEBHOOK_SECRET,body)},data:body});
  expect(replay.status()).toBe(200);expect(await replay.json()).toMatchObject({duplicate:true});
  expect((await page.request.post(origin+'/api/pro/integrations/webhooks/tilopay',{headers:{'Content-Type':'application/json','X-CCR-Signature':signWebhook('wrong-secret',body)},data:body})).status()).toBe(401);
  expect((await page.request.post(origin+'/api/pro/integrations/webhooks/tilopay',{headers:{'Content-Type':'application/json'},data:body})).status()).toBe(503);
  expect((await payments()).filter(row=>row.kind==='payment')).toHaveLength(1);
  // (5) Refund from the owner panel: the ledger reversal is booked once and the balance comes back.
  await page.reload();await expect(panel.locator('[data-payment-link="paid"]')).toBeVisible({timeout:90000});
  await panel.locator('[data-payment-refund]').click();
  await confirmDialog(page,en?'Refund this payment?':'¿Reembolsar este pago?',en?'Refund':'Reembolsar',en?'Customer paid twice':'El cliente pagó dos veces');
  await expect(panel.locator('[data-payment-attempt="refunded"]')).toBeVisible({timeout:60000});
  const after=await payments();expect(after.filter(row=>row.kind==='payment_void')).toHaveLength(1);expect(after.find(row=>row.kind==='payment_void')!.label).toContain(en?'Customer paid twice':'El cliente pagó dos veces');
  const balance=await (await page.request.get(origin+'/api/pro/client-operations?'+new URLSearchParams({workId:f.workId,clientId:f.clientId}))).json();
  expect(balance.work.customerBalanceCents).toBe(113000000);
  await shot(page,`r6a-payment-link-refunded-${language}`,project);
  // (6) Installment link paid by SINPE Móvil: booked in the job ledger and applied by the plan.
  const planId=crypto.randomUUID(),planApi=origin+'/api/pro/payment-plan';
  const plan=await page.request.post(planApi,{headers:h,data:{action:'create',actionId:crypto.randomUUID(),workId:f.workId,planId,totalCents:113000000,downPaymentCents:0,downPaymentDate:null,schedule:{mode:'auto',frequency:'monthly',count:2,firstDue:new Intl.DateTimeFormat('en-CA',{timeZone:'America/Costa_Rica'}).format(new Date())},feeCents:0,lateFeeCents:0,terms:''}});
  expect(plan.status(),await plan.text()).toBe(200);
  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_agenda',cita:f.workId,vistaTrabajo:'costs'}));
  const section=page.locator('[data-work-payment-plan]');await expect(section.locator('[data-payment-plan-item="1"]')).toBeVisible({timeout:90000});
  await section.locator('[data-payment-plan-link="1"]').click();
  const linkDialog=page.getByRole('dialog',{name:en?'Payment link':'Enlace de pago'});await expect(linkDialog.locator('[data-payment-link-due]')).toHaveText(m('₡565.000'),{timeout:60000});
  await linkDialog.getByLabel(en?'Card':'Tarjeta').uncheck();await linkDialog.locator('[data-payment-link-create]').click();
  const installmentUrl=await linkDialog.locator('[data-payment-link-url]').inputValue();await shot(page,`r6a-payment-link-installment-${language}`,project);
  await pay.goto('about:blank');await gotoOK(pay,installmentUrl);await expect(pay.locator('[data-payment-portal-sinpe]')).toBeVisible({timeout:90000});
  await expect(pay.locator('[data-payment-portal-sinpe-phone]')).toHaveText('8888-7777');await expect(pay.locator('[data-payment-portal-sinpe-code]')).toHaveText(/^CCR-[0-9A-F]{6}$/);
  await expectNoHorizontalOverflow(pay);await shot(pay,`r6a-payment-portal-sinpe-${language}`,project);
  const sinpe=pay.locator('[data-payment-portal-sinpe]');
  await sinpe.getByLabel(en?'SINPE confirmation number':'Número de comprobante SINPE').fill('00012345678');await sinpe.locator('[data-payment-portal-sinpe-confirm]').click();
  await expect(pay.locator('[data-payment-portal-error]')).toContainText('SINPE',{timeout:60000});
  await sinpe.getByLabel(en?'SINPE confirmation number':'Número de comprobante SINPE').fill('2026111312345678');await sinpe.locator('[data-payment-portal-sinpe-confirm]').click();
  await expect(pay.locator('[data-payment-portal-paid]')).toBeVisible({timeout:60000});
  const planState=await (await page.request.get(planApi+'?'+new URLSearchParams({workId:f.workId}),{headers:{'X-Pro-Expected-Actor':f.owner.id}})).json();
  expect(planState.plan.appliedCents).toBe(56500000);expect(planState.plan.items.find((item:{seq:number})=>item.seq===1).status).toBe('paid');
  // (7) Reconciliation (Company › Cobros en línea).
  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_company',empresa:'cobros'}));
  const recon=page.locator('[data-payment-reconciliation]');await expect(recon.locator('[data-reconciliation-row="refunded"]')).toHaveCount(1,{timeout:90000});
  await expect(recon.locator('[data-reconciliation-row="matched"]')).toHaveCount(1);await expect(recon.locator('[data-reconciliation-row="failed"]')).toHaveCount(3);
  await expect(recon.locator('[data-reconciliation-exceptions]')).toHaveText('0');await expect(recon.locator('[data-reconciliation-booked]')).toHaveText(m('₡565.000'));
  await expectNoHorizontalOverflow(page);await shot(page,`r6a-reconciliation-${language}`,project);
  expect(payErrors()).toEqual([]);expect(errors()).toEqual([]);
  await customer.close();
 }finally{await f.cleanup();}
});

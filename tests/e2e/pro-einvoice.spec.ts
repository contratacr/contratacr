import {test,expect,type Page} from 'playwright/test';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {collectPageErrors,gotoOK,expectNoHorizontalOverflow} from './helpers';
import {ownerFixture,local,headersFor,origin,type Owner} from './pro-round2-fixture';
import {blankInvoiceLine} from '../../src/lib/pro/invoice-detail';
import {emptyInvoicePreparation} from '../../src/lib/pro/invoice-preparation';

// Ronda F2-A (2026-11-19): "Factura electrónica" pipeline behind the provider adapter, MOCK mode only. Disposable
// accounts, loopback Supabase; nothing reaches Hacienda, GTI or any provider and nothing is e-mailed for real.
// Covers: Empresa › Facturación electrónica (mode read-only Prueba, provider, emisor with branch/terminal/activity),
// emission with the "Modo de prueba" confirmation, recibido → procesando → aceptado timeline with provider responses,
// XML and branded print with clave/consecutivo, debit and credit notes, timeout → duplicate retry, rejection reasons,
// a receiver message (aceptación) and the route contract (401, 400, origin, other company).
const shots=process.env.EINVOICE_SHOTS_DIR;
async function shot(page:Page,name:string,project:string,fullPage=false){if(!shots)return;mkdirSync(shots,{recursive:true});await page.screenshot({path:join(shots,`${name}-${project}.png`),fullPage});}
const api=origin+'/api/pro/invoice-einvoice';
const line=(patch:Record<string,unknown>={})=>({...blankInvoiceLine(),kind:'service',description:'Remodelación de cocina completa',cabys:'4329000000100',unit:'Sp',quantity:'1',unitPrice:'1000000',taxTreatment:'vat',taxRate:'13',tax:{vatCode:'08',exemption:null},...patch});
async function draft(page:Page,f:Owner,{receiverId='112340567',title='Factura cocina'}:{receiverId?:string;title?:string}={}){
 const h=headersFor(f.owner),requestId=crypto.randomUUID();
 const created=await page.request.post(origin+'/api/pro/invoice-drafts',{headers:h,data:{action:'create_direct',requestId,clientId:f.clientId,title,notes:'Gracias por su confianza',lines:[line()]}});
 expect(created.status(),await created.text()).toBe(200);
 const current=(await (await page.request.get(origin+'/api/pro/invoice-drafts?id='+requestId)).json()).draft;
 const updated=await page.request.post(origin+'/api/pro/invoice-drafts',{headers:h,data:{action:'update',id:requestId,revision:current.revision,title,notes:'Gracias por su confianza',
  receiver:{name:'Carla Cliente',identification:receiverId,email:'carla@example.test',phone:'8888-1111',address:'San José',identificationType:'individual',activity:'',province:'',canton:'',district:'',neighborhood:''},
  preparation:{...emptyInvoicePreparation(),issuerName:'Remodelaciones Prueba',saleCondition:'cash',paymentMethod:'transfer'}}});
 expect(updated.status(),await updated.text()).toBe(200);
 return requestId;
}
type Doc={id:string;docType:string;status:string;consecutivo:string;clave:string;responseMessage:string|null;responses:{outcome:string;state:string|null}[];events:{to:string}[]};
const post=async(page:Page,f:Owner,data:Record<string,unknown>)=>page.request.post(api,{headers:headersFor(f.owner),data:{actionId:crypto.randomUUID(),...data}});

for(const language of ['es','en'] as const)test(`F2-A: electronic invoice pipeline in mock mode [${language}]`,async({page,browser},info)=>{
 test.setTimeout(900000);local(info.project.use.baseURL);const en=language==='en',project=info.project.name,label=language+crypto.randomUUID().slice(0,6);
 const f=await ownerFixture(page.context(),'f2a'+label);
 const others:Owner[]=[];
 try{
  const errors=collectPageErrors(page);
  // (1) Route contract before any data.
  const anonymous=await browser.newContext();
  expect((await anonymous.request.get(api+'?draftId='+crypto.randomUUID())).status()).toBe(401);await anonymous.close();
  expect((await page.request.get(api+'?draftId=x')).status()).toBe(400);
  expect((await page.request.get(api+'?view=received&view=received')).status()).toBe(400);
  expect((await page.request.post(api,{headers:{...headersFor(f.owner),Origin:'https://evil.example'},data:{action:'emit',actionId:crypto.randomUUID(),draftId:crypto.randomUUID(),docType:'01'}})).status()).toBe(403);
  expect((await post(page,f,{action:'emit',draftId:crypto.randomUUID(),docType:'02'})).status()).toBe(400);

  // (2) Empresa › Facturación electrónica: mode read-only Prueba, provider list, emisor with branch/terminal/activity.
  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_company',empresa:'facturacion'}));
  const settings=page.locator('[data-company-einvoice]');await expect(settings).toBeVisible({timeout:90000});
  await expect(settings.locator('[data-einvoice-settings-mode="test"]')).toHaveText(en?'Test':'Prueba');
  for(const id of ['mock','hacienda-sandbox','gti'])await expect(settings.locator(`[data-einvoice-provider-option="${id}"]`)).toBeVisible();
  await expect(settings.locator('[data-einvoice-provider-option="mock"]')).toContainText(en?'In use':'En uso');
  await expect(settings.locator('[data-einvoice-server-env]')).toBeVisible();
  const form=settings.locator('[data-emisor-settings]');
  await form.locator('[data-emisor-field="idNumber"]').fill('3101123456');await form.locator('[data-emisor-field="name"]').fill('Remodelaciones Prueba S.A.');
  await form.locator('[data-emisor-field="activityCode"]').fill('410001');await form.locator('[data-emisor-field="providerSystems"]').fill('3101123456');
  await form.locator('[data-emisor-field="canton"]').fill('01');await form.locator('[data-emisor-field="district"]').fill('08');
  await form.locator('[data-emisor-field="otherSigns"]').fill('Cien metros norte del parque');await form.locator('[data-emisor-field="email"]').fill('facturas@example.test');
  await expect(form.locator('[data-emisor-field="provider"]')).toHaveValue('mock');
  await expect(form.locator('[data-emisor-field="branch"]')).toHaveValue('001');await expect(form.locator('[data-emisor-field="terminal"]')).toHaveValue('00001');
  await form.locator('[data-emisor-save]').click();await expect(form.locator('[data-emisor-saved]')).toBeVisible({timeout:30000});
  await expectNoHorizontalOverflow(page);await shot(page,`einvoice-settings-form-${language}`,project);
  await expect(settings.locator('[data-einvoice-received-form]')).toBeVisible({timeout:30000});
  await page.evaluate(()=>window.scrollTo(0,0));await shot(page,`einvoice-settings-${language}`,project);

  // (3) Emit a Factura Electrónica from a ready draft: confirmation says test mode, nothing goes to Hacienda.
  const d=await draft(page,f);
  const read=await (await page.request.get(api+'?draftId='+d)).json();
  expect(read.pipeline).toMatchObject({provider:'mock',mode:'mock',test:true});expect(read.issues['01']).toEqual([]);
  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_billing',factura:d,fiscalFactura:d}));
  const panel=page.locator('[data-einvoice]');await expect(panel).toBeVisible({timeout:90000});
  await expect(panel.locator('[data-einvoice-test="true"]')).toContainText(en?'Test mode: nothing is sent to Hacienda':'Modo de prueba: no se envía a Hacienda');
  await expect(panel.locator('[data-einvoice-ready="01"]')).toBeVisible();
  await shot(page,`einvoice-ready-${language}`,project);
  await panel.locator('[data-einvoice-emit="01"]').click();
  const dialog=page.getByRole('dialog',{name:en?'Issue electronic invoice?':'¿Emitir factura electrónica?'});await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(en?'Test mode: nothing is sent to Hacienda':'Modo de prueba: no se envía a Hacienda');
  await shot(page,`einvoice-confirm-${language}`,project);
  await dialog.getByRole('button',{name:en?'Issue invoice':'Emitir factura',exact:true}).click();await expect(dialog).toBeHidden();
  const fe=panel.locator('[data-einvoice-doc="00100001010000000001"]'),status=fe.locator('[data-einvoice-status]');
  await expect(status).toHaveAttribute('data-einvoice-status','recibido',{timeout:60000});
  await expect(panel.locator('[data-einvoice-locked]')).toBeVisible();
  await fe.locator('[data-einvoice-poll]').click();await expect(status).toHaveAttribute('data-einvoice-status','procesando',{timeout:60000});
  await fe.locator('[data-einvoice-poll]').click();await expect(status).toHaveAttribute('data-einvoice-status','aceptado',{timeout:60000});
  await expect(fe.locator('[data-einvoice-events] [data-event-label]')).toHaveText(en?['Reserved (unsigned)','Signed','Sent to Hacienda','Received by Hacienda','Processing at Hacienda','Accepted']:['Reservado (sin firmar)','Firmado','Enviado a Hacienda','Recibido por Hacienda','En proceso en Hacienda','Aceptado']);
  const clave=(await fe.locator('[data-einvoice-clave]').textContent())!.trim();
  expect(clave).toMatch(/^506\d{6}003101123456001000010100000000011\d{8}$/);
  await fe.locator('[data-einvoice-responses] summary').click();
  await expect(fe.locator('[data-einvoice-responses] li')).toHaveCount(3);
  await expectNoHorizontalOverflow(page);await fe.scrollIntoViewIfNeeded();await shot(page,`einvoice-accepted-${language}`,project);
  const docs=async()=>(await (await page.request.get(api+'?draftId='+d)).json()).documents as Doc[];
  const feDoc=(await docs()).find(row=>row.docType==='01')!;
  expect(feDoc.responses.map(r=>r.outcome)).toEqual(['received','state','state']);
  const xml=await page.request.get(origin+'/api/pro/einvoice-file?'+new URLSearchParams({id:feDoc.id,kind:'xml'}));
  expect(xml.status()).toBe(200);expect(xml.headers()['content-disposition']).toContain(clave+'.xml');
  const text=await xml.text();
  for(const piece of ['<FacturaElectronica xmlns="https://cdn.comprobanteselectronicos.go.cr/xml-schemas/v4.4/facturaElectronica">',`<Clave>${clave}</Clave>`,'<NumeroConsecutivo>00100001010000000001</NumeroConsecutivo>','<CodigoActividadEmisor>410001</CodigoActividadEmisor>',
   '<TotalServGravados>1000000.00000</TotalServGravados>','<TotalImpuesto>130000.00000</TotalImpuesto>','<TotalComprobante>1130000.00000</TotalComprobante>','<TipoMedioPago>04</TipoMedioPago>','<CondicionVenta>01</CondicionVenta>','<ds:Signature'])expect(text).toContain(piece);
  const printPage=await page.context().newPage();await gotoOK(printPage,origin+'/api/pro/einvoice-file?'+new URLSearchParams({id:feDoc.id,kind:'print',lang:language}));
  await expect(printPage.locator('[data-print-clave]')).toHaveText(clave);await expect(printPage.locator('[data-print-consecutivo]')).toHaveText('00100001010000000001');await expect(printPage.locator('[data-print-mode="mock"]')).toBeVisible();
  await expectNoHorizontalOverflow(printPage);await shot(printPage,`einvoice-print-${language}`,project,true);await printPage.close();

  // (4) Debit note (UI): extra charge on the accepted invoice, own sequence 02, same async flow.
  await fe.locator('[data-einvoice-debit]').click();
  const debit=fe.locator('[data-einvoice-debit-form]');await debit.locator('[data-einvoice-debit-amount]').fill('50000');
  await debit.locator('[data-einvoice-debit-reason]').fill(en?'Extra electrical outlet':'Tomacorriente adicional');
  await shot(page,`einvoice-debit-form-${language}`,project);
  await debit.locator('[data-einvoice-debit-submit]').click();
  const nd=panel.locator('[data-einvoice-doc="00100001020000000001"]');
  await expect(nd.locator('[data-einvoice-status]')).toHaveAttribute('data-einvoice-status','recibido',{timeout:60000});
  for(const next of ['procesando','aceptado']){await nd.locator('[data-einvoice-poll]').click();await expect(nd.locator('[data-einvoice-status]')).toHaveAttribute('data-einvoice-status',next,{timeout:60000});}
  const ndDoc=(await docs()).find(row=>row.docType==='02')!;
  const ndXml=await (await page.request.get(origin+'/api/pro/einvoice-file?'+new URLSearchParams({id:ndDoc.id,kind:'xml'}))).text();
  expect(ndXml).toContain('<NotaDebitoElectronica xmlns="https://cdn.comprobanteselectronicos.go.cr/xml-schemas/v4.4/notaDebitoElectronica">');
  expect(ndXml).toContain(`<InformacionReferencia><TipoDocIR>01</TipoDocIR><Numero>${clave}</Numero>`);expect(ndXml).toContain('<TotalComprobante>56500.00000</TotalComprobante>');

  // (5) Credit note (UI) on the selected line.
  await fe.locator('[data-einvoice-credit]').click();
  const credit=fe.locator('[data-einvoice-credit-form]');await credit.getByRole('checkbox').first().check();
  await credit.locator('[data-einvoice-credit-reason]').fill(en?'Customer returned the work':'Trabajo devuelto por el cliente');
  await credit.locator('[data-einvoice-credit-submit]').click();
  const nc=panel.locator('[data-einvoice-doc="00100001030000000001"]');
  await expect(nc.locator('[data-einvoice-status]')).toHaveAttribute('data-einvoice-status','recibido',{timeout:60000});
  await nc.scrollIntoViewIfNeeded();await shot(page,`einvoice-notes-${language}`,project);

  // (6) Timeout fixture: the first submission times out although Hacienda got it; the retry is a duplicate → recibido.
  const late=await draft(page,f,{receiverId:'777777777',title:'Envío lento'});
  const lateEmit=await post(page,f,{action:'emit',draftId:late,docType:'01'});expect(lateEmit.status(),await lateEmit.text()).toBe(200);
  const lateDoc=(await lateEmit.json()).document;expect(lateDoc.status).toBe('error');expect(lateDoc.consecutivo).toBe('00100001010000000002');expect(lateDoc.nextAttemptAt).not.toBeNull();
  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_billing',factura:late,fiscalFactura:late}));
  const lateCard=page.locator('[data-einvoice-doc="00100001010000000002"]');await expect(lateCard.locator('[data-einvoice-retry]')).toBeVisible({timeout:90000});
  await shot(page,`einvoice-retry-${language}`,project);
  // «Reintentar envío» resubmits (Hacienda answers "ya recibido": no second document) and asks for the state at once.
  await lateCard.locator('[data-einvoice-poll]').click();await expect(lateCard.locator('[data-einvoice-status]')).toHaveAttribute('data-einvoice-status','procesando',{timeout:60000});
  const lateRead=(await (await page.request.get(api+'?draftId='+late)).json()).documents as Doc[];
  expect(lateRead[0]!.responses.map(r=>r.outcome)).toEqual(['timeout','duplicate','state']);
  expect(lateRead[0]!.events.map(e=>e.to)).toEqual(['borrador','firmado','error','enviado','recibido','procesando']);

  // (7) Rejection fixture (receptor 999999999): procesando, then rechazado with the reason; the draft is free again.
  const bad=await draft(page,f,{receiverId:'999999999',title:'Receptor no inscrito'});
  const badDoc=(await (await post(page,f,{action:'emit',draftId:bad,docType:'01'})).json()).document;expect(badDoc.status).toBe('recibido');
  expect((await (await post(page,f,{action:'poll',documentId:badDoc.id})).json()).document.status).toBe('procesando');
  const rejected=(await (await post(page,f,{action:'poll',documentId:badDoc.id})).json()).document;
  expect(rejected.status).toBe('rechazado');expect(rejected.responseMessage).toContain('padrón');
  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_billing',factura:bad,fiscalFactura:bad}));
  const badCard=page.locator('[data-einvoice-doc="00100001010000000003"]');await expect(badCard.locator('[data-einvoice-status]')).toHaveAttribute('data-einvoice-status','rechazado',{timeout:90000});
  await expect(page.locator('[data-einvoice-emit-panel]')).toBeVisible();
  await badCard.scrollIntoViewIfNeeded();await shot(page,`einvoice-rejected-${language}`,project);

  // (8) Receiver message: accept a document received from a supplier (Empresa › Facturación electrónica).
  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_company',empresa:'facturacion'}));
  const received=page.locator('[data-einvoice-received]');await expect(received.locator('[data-einvoice-received-form]')).toBeVisible({timeout:90000});
  const supplierClave='506181126003101999999001000010100000001231'+'99999999';expect(supplierClave).toHaveLength(50);
  await received.locator('[data-received-field="receivedClave"]').fill(supplierClave);
  await received.locator('[data-received-field="emisorId"]').fill('3101999999');await received.locator('[data-received-field="emisorName"]').fill('Ferretería Proveedora');
  await received.locator('[data-received-field="receivedIssuedOn"]').fill('2026-11-18');
  await received.locator('[data-received-field="total"]').fill('565');await received.locator('[data-received-field="tax"]').fill('65');
  await received.locator('[data-einvoice-received-send]').click();
  const row=received.locator('[data-einvoice-received-row="00100001050000000001"]');
  await expect(row.locator('[data-einvoice-received-status]')).toHaveAttribute('data-einvoice-received-status','recibido',{timeout:60000});
  for(const next of ['procesando','aceptado']){await row.locator('[data-einvoice-received-poll]').click();await expect(row.locator('[data-einvoice-received-status]')).toHaveAttribute('data-einvoice-received-status',next,{timeout:60000});}
  await expectNoHorizontalOverflow(page);await row.scrollIntoViewIfNeeded();await shot(page,`einvoice-received-${language}`,project);
  const list=await (await page.request.get(api+'?view=received')).json();
  expect(list.messages[0]).toMatchObject({docType:'05',status:'aceptado',mode:'mock',provider:'mock'});
  const mxml=await (await page.request.get(origin+'/api/pro/einvoice-file?'+new URLSearchParams({id:list.messages[0].id,kind:'receiver_xml'}))).text();
  expect(mxml).toContain('<MensajeReceptor xmlns="https://cdn.comprobanteselectronicos.go.cr/xml-schemas/v4.4/mensajeReceptor">');expect(mxml).toContain('<NumeroConsecutivoReceptor>00100001050000000001</NumeroConsecutivoReceptor>');
  // Answering the same received document again is refused while the answer is live.
  const again=await post(page,f,{action:'receiver_message',receivedClave:supplierClave,emisorIdType:'02',emisorId:'3101999999',emisorName:'Ferretería Proveedora',receivedIssuedAt:'2026-11-18T12:00:00-06:00',receivedTotalCents:56500,receivedTaxCents:6500,messageCode:'1',detail:'',taxCondition:'01',creditTaxCents:6500,expenseCents:56500});
  expect(again.status()).toBe(409);expect((await again.json()).reason).toBe('pro_einvoice_receiver_answered');

  // (9) Another company never sees these documents.
  const otherContext=await browser.newContext();const otherPage=await otherContext.newPage();
  const other=await ownerFixture(otherContext,'f2b'+label);others.push(other);
  expect((await otherPage.request.get(api+'?draftId='+d)).status()).toBe(404);
  expect((await otherPage.request.get(origin+'/api/pro/einvoice-file?'+new URLSearchParams({id:feDoc.id,kind:'xml'}))).status()).toBe(404);
  expect(((await (await otherPage.request.get(api+'?view=received')).json()).messages as unknown[]).length).toBe(0);
  await otherContext.close();
  expect(errors()).toEqual([]);
 }finally{for(const other of others)await other.cleanup();await f.cleanup();}
});

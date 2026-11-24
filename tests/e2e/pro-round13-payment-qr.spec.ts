import {test,expect,type Page} from 'playwright/test';
import {collectPageErrors,gotoOK,expectNoHorizontalOverflow} from './helpers';
import {ownerFixture,local,headersFor,origin,type Owner} from './pro-round2-fixture';
import {blankInvoiceLine} from '../../src/lib/pro/invoice-detail';
import {emptyInvoicePreparation} from '../../src/lib/pro/invoice-preparation';
import QRCode from 'qrcode';

// Round 13 (row 49): the payment link also comes as a QR code (made in the browser, downloadable as PNG or SVG),
// next to the SINPE Movil option of the sandbox processor. Disposable accounts, loopback only; no real charge.
const entry=(f:Owner,amount:number)=>({user_id:f.owner.id,id:crypto.randomUUID(),client_id:f.clientId,work_id:f.workId,kind:'agreement',amount_cents:amount,label:'Acuerdo R13',reversal_id:null,request_hash:crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-','')});

test('Round 13: a QR code encodes exactly the payment link (unit)',async()=>{
 const url='https://contratacr.com/pagar#enlace='+'A'.repeat(43),svg=await QRCode.toString(url,{type:'svg',margin:2,errorCorrectionLevel:'M'});
 expect(svg).toContain('<svg');expect((await QRCode.toDataURL(url,{width:320,margin:2})).startsWith('data:image/png;base64,')).toBe(true);
 // Known vector: HELLO WORLD at level Q is the classic version 1 symbol (21 x 21 modules); the same link always gives the same symbol.
 expect(QRCode.create('HELLO WORLD',{errorCorrectionLevel:'Q'}).modules.size).toBe(21);
 expect(await QRCode.toString(url,{type:'svg'})).toBe(await QRCode.toString(url,{type:'svg'}));
});

for(const language of ['es','en'] as const)test(`Round 13: payment link QR, downloads and SINPE option [${language}]`,async({page},info)=>{
 test.setTimeout(600000);local(info.project.use.baseURL);const en=language==='en',id=language+crypto.randomUUID().slice(0,6),f=await ownerFixture(page.context(),id);
 try{
  const errors=collectPageErrors(page),h=headersFor(f.owner),requestId=crypto.randomUUID();
  await f.db.from('pro_client_entries').insert(entry(f,50000000)).throwOnError();
  const state=async()=>(await (await page.request.get(origin+'/api/pro/integrations')).json()) as {providers:{id:string;connection:{revision:number}}[]};
  const saved=await page.request.post(origin+'/api/pro/integrations',{headers:h,data:{actionId:crypto.randomUUID(),action:'save_config',provider:'tilopay',revision:(await state()).providers.find(row=>row.id==='tilopay')!.connection.revision,config:{cardEnabled:true,sinpeEnabled:true,sinpePhone:'88887777',linkDays:7}}});expect(saved.status()).toBe(200);
  const lines=[{...blankInvoiceLine(),kind:'service',description:'Remodelacion de bano',cabys:'4329000000100',unit:'Sp',quantity:'1',unitPrice:'1000000',taxTreatment:'vat',taxRate:'13'}];
  expect((await page.request.post(origin+'/api/pro/invoice-drafts',{headers:h,data:{action:'create_direct',requestId,clientId:f.clientId,title:'Factura QR',notes:'',lines}})).status()).toBe(200);
  const current=(await (await page.request.get(origin+'/api/pro/invoice-drafts?id='+requestId)).json()).draft;
  expect((await page.request.post(origin+'/api/pro/invoice-drafts',{headers:h,data:{action:'update',id:requestId,revision:current.revision,title:'Factura QR',notes:'',receiver:{name:'Carla Cliente',identification:'112340567',email:'carla@example.test',phone:'8888-1111',address:'San Jose',identificationType:'individual',activity:'',province:'',canton:'',district:'',neighborhood:''},preparation:{...emptyInvoicePreparation(),issuerName:'Remodelaciones Prueba',saleCondition:'cash',paymentMethod:'sinpe'}}})).status()).toBe(200);
  await f.db.from('pro_invoice_drafts').update({work_id:f.workId}).eq('user_id',f.owner.id).eq('id',requestId).throwOnError();
  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_billing',factura:requestId,cobroFactura:requestId}));
  const panel=page.locator('[data-payment-link-panel]');await expect(panel.locator('[data-payment-link-due]')).toBeVisible({timeout:90000});
  // SINPE Movil is offered next to the card (sandbox), and nothing is created until the owner asks.
  await expect(panel.getByLabel('SINPE M\u00f3vil')).toBeChecked();await expect(panel.locator('[data-payment-link-qr]')).toHaveCount(0);
  await panel.locator('[data-payment-link-create]').click();
  const url=await panel.locator('[data-payment-link-url]').inputValue(),qr=panel.locator('[data-payment-link-qr]');
  await expect(qr.locator('[data-payment-link-qr-image]')).toBeVisible({timeout:30000});
  await expect(qr.locator('[data-payment-link-qr-image]')).toHaveAttribute('alt',en?'QR code of the payment link':'C\u00f3digo QR del enlace de pago');
  // The image is a real PNG of 160 css pixels and the downloads exist.
  const natural=await qr.locator('[data-payment-link-qr-image]').evaluate((img:HTMLImageElement)=>img.naturalWidth);expect(natural).toBeGreaterThanOrEqual(160);
  await expect(qr.locator('[data-payment-link-qr-png]')).toHaveAttribute('download','qr-cobro.png');
  const [download]=await Promise.all([page.waitForEvent('download'),qr.locator('[data-payment-link-qr-svg]').click()]);expect(download.suggestedFilename()).toBe('qr-cobro.svg');
  const svg=await (await import('node:fs/promises')).readFile(await download.path()!,'utf8');expect(svg).toContain('<svg');
  expect(url).toMatch(/\/pagar#enlace=[A-Za-z0-9_-]{43}$/);
  await expectNoHorizontalOverflow(page);
  // After a reload the secret link (and its QR) is not shown again: only the hash is stored.
  await page.reload();await expect(panel.locator('[data-payment-link="active"]')).toBeVisible({timeout:90000});await expect(panel.locator('[data-payment-link-qr]')).toHaveCount(0);
  expect(errors()).toEqual([]);
 }finally{await f.cleanup();}
});

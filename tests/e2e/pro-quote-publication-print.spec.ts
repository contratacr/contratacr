import {test,expect,type Page,type BrowserContext} from 'playwright/test';
import {randomBytes,createHash} from 'node:crypto';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import sharp from 'sharp';
import {gotoOK,expectNoHorizontalOverflow,warmLocalRoutes,onAppPageError} from './helpers';
import {ownerFixture,local,origin,login} from './pro-round2-fixture';
import {createDisposableAccount,cleanupDisposableAccount,type DisposableAccount} from './disposable-account';

// Ronda F2-D (2026-11-19), parity register row 45: the customer's copy of a shared quote prints (or saves as PDF)
// with the company document branding of the professional (theme, company line, logo from the private bucket,
// footer, template options) through the private server print, re-authorized for the customer. The print carries
// only the immutable shared content: never the internal cost, margins or the customer's contact data of the pro.
// Disposable accounts, loopback only; nothing is sent, charged or issued.
const shots=process.env.F2D_SHOTS_DIR;
async function shot(page:Page,name:string,project:string,fullPage=false){if(!shots)return;mkdirSync(shots,{recursive:true});await page.screenshot({path:join(shots,`${name}-${project}.png`),fullPage});}
const newContext=(browser:import('playwright/test').Browser,info:import('playwright/test').TestInfo)=>browser.newContext({baseURL:origin,viewport:info.project.use.viewport??undefined,isMobile:info.project.use.isMobile,hasTouch:info.project.use.hasTouch,userAgent:info.project.use.userAgent});
const COSTS=['unitCostCents','432100','4.321','4,321','77.778','77,778'];
const noCost=(text:string,where:string)=>{for(const value of COSTS)expect(text,where+' must not contain '+value).not.toContain(value);};

for(const language of ['es','en'] as const)test(`F2-D: the customer prints the shared quote with the company branding [${language}]`,async({page,browser},info)=>{
 test.setTimeout(600000);local(info.project.use.baseURL);const en=language==='en',id=language+randomBytes(3).toString('hex'),project=info.project.name,tr=(es:string,english:string)=>en?english:es,prefix=en?'/en':'/es';
 const f=await ownerFixture(page.context(),id);const accounts:DisposableAccount[]=[];const contexts:BrowserContext[]=[];
 try{
  const owner=f.owner.id,headers={Origin:origin};
  const customerContext=await newContext(browser,info);contexts.push(customerContext);const customer=await createDisposableAccount({prefix:'f2d-cust'});accounts.push(customer);await login(customerContext,customer);
  const token='f2d-'+id,hash=createHash('sha256').update('ccr-work-invite:v1:'+token).digest('hex');
  expect((await f.db.rpc('pro_work_client_invitations_mutate',{p_actor:owner,p_input:{action:'create',actionId:crypto.randomUUID(),workId:f.workId,invitationId:crypto.randomUUID(),tokenHash:hash,expiresInDays:7}})).error).toBeNull();
  expect((await f.db.rpc('pro_work_client_invitation_accept',{p_actor:customer.id,p_input:{action:'accept',actionId:crypto.randomUUID(),tokenHash:hash}})).error).toBeNull();
  const requestId=(await f.db.from('pro_appointment_requests').select('id').eq('owner_id',owner).eq('client_user_id',customer.id).single()).data!.id as string;
  // Company branding with logo, footer and a non-default template (saved by the owner).
  const logo=(await sharp({create:{width:96,height:64,channels:3,background:'#0f7a3d'}}).png().toBuffer()).toString('base64');
  const company='Constructora '+id,footer=tr('Gracias por su confianza.','Thank you for your trust.'),terms=tr('50 % de adelanto y 50 % al entregar.','50% upfront and 50% on delivery.');
  await warmLocalRoutes(page,['/api/pro/document-branding']);
  const branding=await page.request.post('/api/pro/document-branding',{headers,data:{actionId:crypto.randomUUID(),revision:0,theme:'bosque',displayName:company,tagline:tr('Calidad en cada detalle','Quality in every detail'),footer,logo:{base64:logo},template:{layout:'modern',logoPosition:'left',accent:'bosque',paper:'letter',show:{signature:false},texts:{quote:{terms}}}}});
  expect(branding.status(),await branding.text()).toBe(200);
  // A quote with an internal cost, shared with the linked customer.
  const ctx=(await f.db.rpc('pro_private_estimate_context',{p_actor:owner,p_client:null,p_kind:'work',p_id:f.workId})).data as {client:{id:string};clientFingerprint:string;source:unknown;issuer:Record<string,unknown>};
  const estimateId=crypto.randomUUID(),publicationId=crypto.randomUUID(),title=tr('Cocina integral ','Full kitchen ')+id,section=tr('Muebles','Cabinets');
  expect((await f.db.rpc('pro_private_estimate_mutate',{p_actor:owner,p_input:{action:'save',actionId:crypto.randomUUID(),estimateId,revision:0,clientId:ctx.client.id,refreshClient:false,clientFingerprint:ctx.clientFingerprint,source:ctx.source,issuer:{...ctx.issuer,issuerName:company},title,notes:tr('Incluye instalación.','Installation included.'),currency:'CRC',validUntil:null,
   lines:[{id:crypto.randomUUID(),description:tr('Mueble bajo','Base cabinet'),unit:'m',qtyMilli:18000,unitPriceCents:850000,discountBps:0,taxBps:1300,catalogProductId:null,unitCostCents:432100,group:section},
    {id:crypto.randomUUID(),description:tr('Sobre de cuarzo','Quartz countertop'),unit:'m',qtyMilli:4000,unitPriceCents:9000000,discountBps:0,taxBps:1300,catalogProductId:null,group:section}]}})).error).toBeNull();
  const publish={action:'publish',actionId:crypto.randomUUID(),estimateId,estimateRevision:1,publicationId,recipient:{kind:'linked',requestId,recipientId:customer.id}};
  expect((await f.db.rpc('pro_private_estimate_publication_mutate',{p_actor:owner,p_input:publish,p_input_hash:createHash('sha256').update(JSON.stringify(publish)).digest('hex'),p_verified_email:null})).error).toBeNull();
  const printUrl='/api/pro/quote-print?'+new URLSearchParams({publicationId,lang:language});
  // Server checks: the customer and the owner get the branded shared version; nobody else does.
  const checkHtml=(html:string,who:string)=>{
   expect(html,who).toContain(`data-quote-publication-print="${publicationId}"`);expect(html,who).toContain('data-document-branding="bosque"');expect(html,who).toContain(company);
   expect(html,who).toContain(footer);expect(html,who).toContain('data:image/jpeg;base64,');expect(html,who).toContain('data-document-template="modern"');expect(html,who).toContain(terms);
   expect(html,who).toContain(title);expect(html,who).toContain(section);expect(html,who).toContain('data-quote-print-section-subtotal');expect(html,who).toContain(tr('Versión 1','Version 1'));
   noCost(html,who);expect(html,who).not.toContain('cliente.'+id+'@example.test');expect(html,who).not.toContain(estimateId);};
  const asCustomer=await customerContext.request.get(origin+printUrl,{timeout:120000});expect(asCustomer.status()).toBe(200);
  expect(asCustomer.headers()['cache-control']).toContain('no-store');expect(asCustomer.headers()['content-security-policy']).toContain("connect-src 'none'");checkHtml(await asCustomer.text(),'customer print');
  const asOwner=await page.request.get(printUrl);expect(asOwner.status()).toBe(200);checkHtml(await asOwner.text(),'owner print');
  const outsiderContext=await newContext(browser,info);contexts.push(outsiderContext);const outsider=await createDisposableAccount({prefix:'f2d-other'});accounts.push(outsider);await login(outsiderContext,outsider);
  expect((await outsiderContext.request.get(origin+printUrl)).status()).toBe(404);
  const anonymous=await newContext(browser,info);contexts.push(anonymous);expect((await anonymous.request.get(origin+printUrl)).status()).toBe(401);
  expect((await customerContext.request.get(origin+'/api/pro/quote-print?'+new URLSearchParams({estimateId,lang:language}))).status()).not.toBe(200);
  expect((await page.request.get('/api/pro/quote-print?'+new URLSearchParams({estimateId,publicationId}))).status()).toBe(400);
  expect((await page.request.get('/api/pro/quote-print?'+new URLSearchParams({publicationId:crypto.randomUUID()}))).status()).toBe(404);
  // The customer's quotes page offers the branded print next to the plain PDF; it opens the private print.
  const cust=await customerContext.newPage();const errors:string[]=[];onAppPageError(cust,m=>errors.push(m));
  await warmLocalRoutes(cust,['/api/pro/private-estimate-publications?'+new URLSearchParams({view:'detail',publicationId}),`${prefix}/dashboard/cotizaciones`]);
  await gotoOK(cust,`${prefix}/dashboard/cotizaciones#publicacion=${publicationId}`);
  const doc=cust.locator(`[data-estimate-publication-document="${publicationId}"]`);await expect(doc).toBeVisible({timeout:90000});
  const link=cust.locator('[data-quote-publication-print-link="client"]');await expect(link).toBeVisible({timeout:60000});
  await expect(link).toHaveText(tr('Imprimir o guardar en PDF','Print or save as PDF'));
  expect(await link.getAttribute('href')).toBe(printUrl);expect(await link.getAttribute('target')).toBe('_blank');
  await expect(cust.getByText(tr('Incluye la marca de la empresa que le envió la cotización.','Includes the brand of the company that sent you the quote.'),{exact:false})).toBeVisible();
  await expect(cust.getByRole('button',{name:tr('Descargar PDF','Download PDF'),exact:true})).toBeVisible();
  await expectNoHorizontalOverflow(cust);await link.scrollIntoViewIfNeeded();await shot(cust,`45-client-quote-print-link-${language}`,project);
  const [popup]=await Promise.all([cust.waitForEvent('popup',{timeout:60000}),link.click()]);
  await popup.waitForLoadState('domcontentloaded');
  const main=popup.locator(`main[data-quote-publication-print="${publicationId}"]`);await expect(main).toBeVisible({timeout:90000});
  await expect(main).toHaveAttribute('data-document-template','modern');await expect(popup.locator('.ccr-company')).toHaveAttribute('data-document-branding','bosque');await expect(popup.locator('.ccr-company')).toContainText(company);
  await expect(popup.locator('.ccr-company img')).toBeVisible();await expect(popup.locator('.ccr-company-footer')).toContainText(footer);
  await expect(popup.locator('[data-document-terms]')).toContainText(terms);await expect(popup.locator('[data-doc-field="signature"]')).toBeHidden();
  await expect(popup.getByRole('button',{name:tr('Imprimir cotización','Print quote'),exact:true})).toBeVisible();
  await expect(popup.getByText(tr('elija "Guardar como PDF"','choose "Save as PDF"'),{exact:false})).toBeVisible();
  noCost(await popup.locator('main').innerText(),'customer print page');
  await expectNoHorizontalOverflow(popup);await shot(popup,`45-client-branded-print-${language}`,project,true);
  await popup.close();
  expect(errors).toEqual([]);
 }finally{for(const c of contexts)await c.close();for(const a of accounts)await cleanupDisposableAccount(a);await f.cleanup();}
});

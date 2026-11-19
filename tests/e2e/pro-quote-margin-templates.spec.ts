import {test,expect,type Page,type BrowserContext} from 'playwright/test';
import {randomBytes,createHash} from 'node:crypto';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {gotoOK,expectNoHorizontalOverflow,warmLocalRoutes,onAppPageError} from './helpers';
import {ownerFixture,local,origin,login} from './pro-round2-fixture';
import {createDisposableAccount,cleanupDisposableAccount,type DisposableAccount} from './disposable-account';
import {newCompanyInviteCode} from '../../src/lib/pro/team-roles';
import {blankInvoiceLine} from '../../src/lib/pro/invoice-detail';
import {applyDocumentBranding,defaultDocumentTemplate,documentTemplateSchema,type PrintBranding} from '../../src/lib/pro/document-branding';
import {sampleInvoicePrintHtml,sampleQuotePrintHtml} from '../../src/lib/pro/document-template-preview';

// Round F1-C (2026-11-19), parity register rows 43 and 45:
//  (1) internal cost, profit, margin and markup per line / section / total in the quote editor, only for roles
//      allowed to see finances; never in the shared version, the customer's views, the print or customer APIs;
//  (2) the shared quote (customer) shows sections with subtotals and keeps per-item approval;
//  (3) document templates for every branded print (layout, logo position, accent, paper, shown fields,
//      default terms/notes per type) with a preview before saving; the default template prints exactly as before.
// Disposable accounts, loopback only; nothing is sent, charged or issued.
const shots=process.env.F1C_SHOTS_DIR;
async function shot(page:Page,name:string,project:string,fullPage=false){if(!shots)return;mkdirSync(shots,{recursive:true});await page.screenshot({path:join(shots,`${name}-${project}.png`),fullPage});}
const label=(language:string)=>language+randomBytes(3).toString('hex');
const newContext=(browser:import('playwright/test').Browser,info:import('playwright/test').TestInfo)=>browser.newContext({baseURL:origin,viewport:info.project.use.viewport??undefined,isMobile:info.project.use.isMobile,hasTouch:info.project.use.hasTouch,userAgent:info.project.use.userAgent});
async function openPro(page:Page,path:string,en:boolean){
 await gotoOK(page,path);
 const failed=page.getByText(en?'Could not verify Pro access. Your data is preserved.':'No se pudo comprobar el acceso a Pro. Sus datos se conservan.');
 const ready=page.locator('[data-independent-pro]');
 await expect(failed.or(ready).first()).toBeVisible({timeout:90000});
 if(await failed.isVisible())await page.getByRole('button',{name:en?'Retry':'Reintentar',exact:true}).click();
 await expect(ready.first()).toBeVisible({timeout:90000});
}
/** Internal cost values used below (unit costs ₡4.321 and ₡9.876; line costs ₡77.778 and ₡177.768). */
const COSTS=['unitCostCents','432100','987600','4.321','4,321','9.876','9,876','77.778','77,778','177.768','177,768'];
const noCost=(text:string,where:string)=>{for(const value of COSTS)expect(text,where+' must not contain '+value).not.toContain(value);};
const stripNonce=(html:string)=>html.replace(/nonce="[^"]*"/g,'nonce=""');

test('F1-C: the default template prints exactly as before; options only add CSS, markers and escaped texts',async()=>{
 const base:PrintBranding={theme:'bosque',displayName:'Constructora <b>F1C</b>',tagline:'Calidad',footer:'Gracias',logoDataUri:null};
 for(const html of [sampleQuotePrintHtml(false),sampleQuotePrintHtml(true),sampleInvoicePrintHtml()]){
  expect(applyDocumentBranding(html,{...base,template:defaultDocumentTemplate()})).toBe(applyDocumentBranding(html,base));
  expect(applyDocumentBranding(html,{...base,template:documentTemplateSchema.parse({texts:{receipt:{terms:'Otro tipo'}}})},'quote')).toBe(applyDocumentBranding(html,base,'quote'));
 }
 const quote=sampleQuotePrintHtml(false);
 const modern=applyDocumentBranding(quote,{...base,template:documentTemplateSchema.parse({layout:'modern',logoPosition:'right',accent:'terracota',paper:'a4',show:{unitPrices:false,signature:false},texts:{quote:{terms:'50 % <script>x</script>',notes:'Nota'}}})},'quote');
 expect(modern).toContain('data-document-template="modern"');expect(modern).toContain('@page{size:A4}');expect(modern).toContain('#a34919');
 expect(modern).toContain('[data-doc-field="unitPrices"],[data-doc-field="signature"]{display:none!important}');expect(modern).toContain('flex-direction:row-reverse');
 expect(modern).toContain('data-document-texts="quote"');expect(modern).toContain('50 % &lt;script&gt;x&lt;/script&gt;');expect(modern).not.toContain('<script>x</script>');
 expect(modern.indexOf('data-document-texts')).toBeLessThan(modern.lastIndexOf('<div class="sign"'));expect(modern.indexOf('data-document-texts')).toBeLessThan(modern.lastIndexOf('<footer'));
 const hiddenTerms=applyDocumentBranding(quote,{...base,template:documentTemplateSchema.parse({show:{terms:false,notes:false},texts:{quote:{terms:'T',notes:'N'}}})},'quote');
 expect(hiddenTerms).not.toContain('data-document-terms');expect(hiddenTerms).not.toContain('data-document-notes');expect(hiddenTerms).toContain('[data-doc-field="terms"],[data-doc-field="notes"]{display:none!important}');
 expect(documentTemplateSchema.safeParse({layout:'fancy'}).success).toBe(false);expect(documentTemplateSchema.safeParse({accent:'#ff0000'}).success).toBe(false);expect(documentTemplateSchema.safeParse({font:'x'}).success).toBe(false);
});

for(const language of ['es','en'] as const)test(`F1-C: quote margins for allowed roles, sections in the shared quote, never the cost for the customer [${language}]`,async({page,browser},info)=>{
 test.setTimeout(900000);local(info.project.use.baseURL);const en=language==='en',id=label(language),project=info.project.name,tr=(es:string,english:string)=>en?english:es,prefix=en?'/en':'/es';
 const money=(colones:string)=>'₡'+(en?colones.replaceAll('.',','):colones);
 const f=await ownerFixture(page.context(),id);const accounts:DisposableAccount[]=[];const contexts:BrowserContext[]=[];
 try{
  const owner=f.owner.id,errors:string[]=[];onAppPageError(page,m=>errors.push(m));
  // Customer linked to the job by invitation.
  const customerContext=await newContext(browser,info);contexts.push(customerContext);const customer=await createDisposableAccount({prefix:'f1c-cust'});accounts.push(customer);await login(customerContext,customer);
  const token='f1c-'+id,hash=createHash('sha256').update('ccr-work-invite:v1:'+token).digest('hex');
  expect((await f.db.rpc('pro_work_client_invitations_mutate',{p_actor:owner,p_input:{action:'create',actionId:crypto.randomUUID(),workId:f.workId,invitationId:crypto.randomUUID(),tokenHash:hash,expiresInDays:7}})).error).toBeNull();
  expect((await f.db.rpc('pro_work_client_invitation_accept',{p_actor:customer.id,p_input:{action:'accept',actionId:crypto.randomUUID(),tokenHash:hash}})).error).toBeNull();
  const requestId=(await f.db.from('pro_appointment_requests').select('id').eq('owner_id',owner).eq('client_user_id',customer.id).single()).data!.id as string;
  // A quote with two sections and internal costs on two of its three lines.
  const ctx=(await f.db.rpc('pro_private_estimate_context',{p_actor:owner,p_client:null,p_kind:'work',p_id:f.workId})).data as {client:{id:string};clientFingerprint:string;source:unknown;issuer:Record<string,unknown>};
  const estimateId=crypto.randomUUID(),l1=crypto.randomUUID(),l2=crypto.randomUUID(),l3=crypto.randomUUID(),publicationId=crypto.randomUUID();
  const demolition=tr('Demolición','Demolition'),finishes=tr('Acabados','Finishes');
  const saved=await f.db.rpc('pro_private_estimate_mutate',{p_actor:owner,p_input:{action:'save',actionId:crypto.randomUUID(),estimateId,revision:0,clientId:ctx.client.id,refreshClient:false,clientFingerprint:ctx.clientFingerprint,source:ctx.source,issuer:{...ctx.issuer,issuerName:'Constructora F1C'},title:tr('Baño por secciones ','Bathroom by sections ')+id,notes:'',currency:'CRC',validUntil:null,
   lines:[{id:l1,description:tr('Demolición de enchape','Tile removal'),unit:'m²',qtyMilli:18000,unitPriceCents:850000,discountBps:0,taxBps:1300,catalogProductId:null,unitCostCents:432100,group:demolition},
    {id:l2,description:tr('Enchape de pared','Wall tiling'),unit:'m²',qtyMilli:18000,unitPriceCents:1500000,discountBps:500,taxBps:1300,catalogProductId:null,unitCostCents:987600,group:finishes},
    {id:l3,description:tr('Mueble de lavatorio','Vanity cabinet'),unit:tr('unid.','ea'),qtyMilli:1000,unitPriceCents:25000000,discountBps:0,taxBps:1300,catalogProductId:null,group:finishes}]}});expect(saved.error).toBeNull();
  await warmLocalRoutes(page,['/api/pro/private-estimates?view=detail&estimateId='+estimateId,'/api/pro/team-roles?view=me',`${prefix}/dashboard/pro?tab=quotes`]);
  // (1) Editor (owner): cost, profit, margin and markup per line; per section; total.
  const openEditor=async(p:Page,required=true)=>{await openPro(p,`${prefix}/dashboard/pro?tab=quotes`,en);const row=p.locator(`[data-sales-estimate="private_estimate:${estimateId}"]`);await expect(row).toBeVisible({timeout:90000});
   const edit=row.getByRole('button',{name:tr('Editar','Edit'),exact:true});if(!await edit.isVisible())return null;await edit.click();const e=p.locator('[data-private-estimate-editor]');
   if(!required){try{await e.waitFor({state:'visible',timeout:20000});}catch{return null;}}else await expect(e).toBeVisible({timeout:90000});return e;};
  const editor=(await openEditor(page))!;expect(editor).not.toBeNull();
  const line=(lineId:string)=>editor.locator(`[data-private-estimate-line="${lineId}"]`);
  await expect(line(l1).locator('[data-private-estimate-line-margin]')).toContainText(money('77.778'),{timeout:60000});// 18 × 4.321
  await expect(line(l1).locator('[data-private-estimate-line-margin]')).toContainText(money('75.222')+(en?' (49.2%)':' (49,2 %)'));// 153.000 − 77.778
  await expect(line(l1).locator('[data-private-estimate-line-markup]')).toContainText(en?'96.7%':'96,7 %');
  await expect(line(l2).locator('[data-private-estimate-line-margin]')).toContainText(money('78.732')+(en?' (30.7%)':' (30,7 %)'));// 256.500 − 177.768
  await expect(line(l3).locator('[data-private-estimate-line-margin]')).toHaveCount(0);
  await expect(editor.locator(`[data-private-estimate-group-subtotal="${finishes}"] [data-private-estimate-group-margin]`)).toContainText(money('78.732'));
  await expect(editor.locator('[data-private-estimate-internal]')).toContainText(tr('1 línea sin costo no se incluye','1 item without a cost is not included'));
  // Markup helper: cost ₡180.000 + 40 % → unit price ₡252.000.
  await line(l3).getByText(tr('Opciones de la línea','Item options')).click();
  await line(l3).locator('[data-private-estimate-line-cost]').fill('180000');
  await line(l3).locator('[data-private-estimate-line-markup-input]').fill('40');
  await expect(line(l3).locator('[data-private-estimate-line-markup-helper]')).toContainText(money('252.000'));
  await line(l3).locator('[data-private-estimate-line-markup-apply]').click();
  await expect(line(l3).getByLabel(tr('Precio unitario','Unit price'),{exact:true})).toHaveValue('252000');
  await expect(line(l3).locator('[data-private-estimate-line-total]')).toContainText(money('284.760'));// 252.000 + 13 %
  await expect(line(l3).locator('[data-private-estimate-line-margin]')).toContainText(money('72.000')+(en?' (28.6%)':' (28,6 %)'));
  await expect(editor.locator(`[data-private-estimate-group-subtotal="${finishes}"] [data-private-estimate-group-margin]`)).toContainText(money('150.732')+(en?' (29.6%)':' (29,6 %)'));
  await expect(editor.locator('[data-private-estimate-internal-margin]')).toContainText(money('225.954')+(en?' (34.2%)':' (34,2 %)'));
  await expect(editor.locator('[data-private-estimate-internal-cost]')).toContainText(money('435.546'));
  await line(l3).locator('[data-private-estimate-line-markup-helper]').scrollIntoViewIfNeeded();await shot(page,`f1c-editor-markup-${language}`,project);
  await expectNoHorizontalOverflow(page);await line(l1).scrollIntoViewIfNeeded();await shot(page,`f1c-editor-margins-${language}`,project);
  await editor.locator('[data-private-estimate-totals]').scrollIntoViewIfNeeded();await shot(page,`f1c-editor-totals-${language}`,project);
  const post=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/pro/private-estimates'&&r.request().method()==='POST');
  await page.getByRole('button',{name:tr('Guardar borrador','Save draft'),exact:true}).click();expect((await post).status()).toBe(200);
  await expect(editor).toHaveCount(0,{timeout:60000});
  const stored=(await f.db.from('pro_private_estimate_items').select('id,content').eq('owner_id',owner).eq('estimate_id',estimateId).throwOnError()).data!;
  const byId=Object.fromEntries(stored.map(row=>[row.id,row.content]));
  expect(byId[l3].unitCostCents).toBe(18000000);expect(byId[l3].unitPriceCents).toBe(25200000);expect(byId[l1].unitCostCents).toBe(432100);expect(byId[l2].group).toBe(finishes);
  // (1b) Roles: Member and Read-only never receive the cost (API) and the editor shows no cost fields; they cannot save.
  const team=(c:BrowserContext,data:Record<string,unknown>)=>c.request.post(origin+'/api/pro/team-roles',{headers:{Origin:origin},data,timeout:120000});
  const join_=async(role:'read_only'|'member')=>{const c=await newContext(browser,info);contexts.push(c);const account=await createDisposableAccount({prefix:'f1c-'+role.replace('_','')});accounts.push(account);await login(c,account);const code=newCompanyInviteCode();
   expect((await team(page.context(),{action:'invite',actionId:crypto.randomUUID(),email:account.email,role,code,locale:language})).status()).toBe(200);
   expect((await team(c,{action:'accept',actionId:crypto.randomUUID(),code})).status()).toBe(200);expect((await team(c,{action:'enter',ownerId:owner})).status()).toBe(200);return c;};
  const member=await join_('member'),readOnly=await join_('read_only');
  for(const [name,c] of [['member',member],['read_only',readOnly]] as const){
   const detail=await c.request.get(origin+'/api/pro/private-estimates?'+new URLSearchParams({view:'detail',estimateId}),{timeout:120000});expect(detail.status(),name).toBe(200);
   const text=await detail.text();expect(text,name).not.toContain('unitCostCents');expect(text,name).not.toContain('18000000');
   const body=JSON.parse(text);const write=await c.request.post(origin+'/api/pro/private-estimates',{headers:{Origin:origin,'X-Pro-Expected-Actor':owner},data:{action:'save',actionId:crypto.randomUUID(),estimateId,revision:body.estimate.revision,clientId:body.estimate.clientId,refreshClient:false,clientFingerprint:body.estimate.clientFingerprint,source:body.estimate.source,issuer:body.estimate.issuer,title:'x',notes:'',currency:'CRC',validUntil:null,lines:body.estimate.lines},timeout:120000});
   expect(write.status(),name).toBe(403);
  }
  // A Member may still open the quote (read): if the editor opens, it shows prices and totals but no internal cost.
  const memberPage=await member.newPage();const memberEditor=await openEditor(memberPage,false);
  if(memberEditor){await expect(memberEditor.locator('[data-private-estimate-line-total]').first()).toBeVisible({timeout:60000});
   await memberPage.waitForTimeout(1500);// the role check answers before the cost would show
   await expect(memberEditor.locator('[data-private-estimate-line-margin],[data-private-estimate-line-cost],[data-private-estimate-internal],[data-private-estimate-group-margin]')).toHaveCount(0);
   expect(await memberEditor.innerText()).not.toContain(tr('Costo interno','Internal cost'));}
  else noCost(await memberPage.locator('main').innerText(),'member quotes list');
  await shot(memberPage,`f1c-editor-member-${language}`,project);await memberPage.close();
  // (2) Share the saved version with the customer.
  const publish={action:'publish',actionId:crypto.randomUUID(),estimateId,estimateRevision:2,publicationId,recipient:{kind:'linked',requestId,recipientId:customer.id}};
  const published=await f.db.rpc('pro_private_estimate_publication_mutate',{p_actor:owner,p_input:publish,p_input_hash:createHash('sha256').update(JSON.stringify(publish)).digest('hex'),p_verified_email:null});expect(published.error).toBeNull();
  const content=(await f.db.from('pro_private_estimate_publications').select('content').eq('id',publicationId).single().throwOnError()).data!.content;
  noCost(JSON.stringify(content),'stored shared version');expect(JSON.stringify(content)).not.toContain('18000000');expect(content.lines[1].group).toBe(finishes);
  // The customer's views: every API answer the page reads has no cost; sections with subtotals; per-item approval.
  const cust=await customerContext.newPage();const custErrors:string[]=[];onAppPageError(cust,m=>custErrors.push(m));const bodies:Promise<string>[]=[];
  cust.on('response',response=>{if(new URL(response.url()).pathname.startsWith('/api/')&&(response.headers()['content-type']??'').includes('json'))bodies.push(response.text().catch(()=>''));});
  await warmLocalRoutes(cust,['/api/pro/quote-line-decisions?'+new URLSearchParams({publicationId}),`${prefix}/dashboard/cotizaciones`]);
  await gotoOK(cust,`${prefix}/dashboard/cotizaciones#publicacion=${publicationId}`);
  const doc=cust.locator(`[data-estimate-publication-document="${publicationId}"]`);await expect(doc).toBeVisible({timeout:90000});
  await expect(doc.locator('[data-estimate-publication-section]')).toHaveText([demolition,finishes]);
  await expect(doc.locator(`[data-estimate-publication-section-subtotal="${demolition}"]`)).toContainText(money('172.890'));// 153.000 + 13 %
  await expect(doc.locator(`[data-estimate-publication-section-subtotal="${finishes}"]`)).toContainText(money('574.605'));// 289.845 + 284.760
  await expect(doc.locator('[data-estimate-publication-line-total]')).toHaveCount(3);
  const proposal=cust.locator(`[data-quote-line-decisions="${publicationId}"]`);await expect(proposal).toBeVisible({timeout:90000});
  await expect(proposal.locator(`[data-quote-line-section="${finishes}"] [data-quote-line]`)).toHaveCount(2);
  await expect(proposal.locator(`[data-quote-line-section-subtotal="${finishes}"]`)).toContainText(money('574.605'));
  await proposal.locator(`[data-quote-line="${l2}"] [data-quote-line-approve]`).click();
  await expect(proposal.locator(`[data-quote-line="${l2}"]`)).toHaveAttribute('data-decision','approved',{timeout:60000});
  await expect(proposal.locator(`[data-quote-line-section-subtotal="${finishes}"]`)).toContainText(tr('aprobado ','approved ')+money('289.845'));
  const customerText=await cust.locator('main').innerText();noCost(customerText,'customer page');
  for(const word of [tr('Costo interno','Internal cost'),tr('Ganancia','Profit'),tr('Recargo','Markup'),'180.000','180,000'])expect(customerText).not.toContain(word);
  await expectNoHorizontalOverflow(cust);await doc.scrollIntoViewIfNeeded();await shot(cust,`f1c-client-shared-sections-${language}`,project);
  await proposal.scrollIntoViewIfNeeded();await shot(cust,`f1c-client-proposal-sections-${language}`,project);
  const answers=await Promise.all(bodies);expect(answers.length).toBeGreaterThan(0);for(const answer of answers){noCost(answer,'customer API');expect(answer).not.toContain('18000000');}
  for(const path of ['/api/pro/quote-line-decisions?'+new URLSearchParams({publicationId}),'/api/pro/private-estimate-publications?'+new URLSearchParams({view:'detail',publicationId})]){const r=await customerContext.request.get(origin+path);const text=await r.text();noCost(text,'customer '+path);}
  // The customer cannot print the owner's draft; the owner's print has sections and no cost.
  expect([403,404]).toContain((await customerContext.request.get(origin+'/api/pro/quote-print?'+new URLSearchParams({estimateId,lang:language}))).status());
  const print=await page.request.get('/api/pro/quote-print?'+new URLSearchParams({estimateId,lang:language}));expect(print.status()).toBe(200);const printHtml=await print.text();
  noCost(printHtml,'quote print');expect(printHtml).not.toContain('18000000');expect(printHtml).toContain('data-quote-print-section-subtotal');expect(printHtml).toContain(finishes);
  expect(custErrors).toEqual([]);expect(errors).toEqual([]);
 }finally{for(const c of contexts)await c.close();for(const a of accounts)await cleanupDisposableAccount(a);await f.cleanup();}
});

for(const language of ['es','en'] as const)test(`F1-C: document templates with preview, applied to quote and invoice prints [${language}]`,async({page},info)=>{
 test.setTimeout(900000);local(info.project.use.baseURL);const en=language==='en',id=label(language),project=info.project.name,tr=(es:string,english:string)=>en?english:es,prefix=en?'/en':'/es';
 const f=await ownerFixture(page.context(),id);
 try{
  const owner=f.owner.id,errors:string[]=[];onAppPageError(page,m=>errors.push(m));const headers={Origin:origin};
  // A quote (with an internal cost) and an invoice draft to print.
  const ctx=(await f.db.rpc('pro_private_estimate_context',{p_actor:owner,p_client:f.clientId,p_kind:null,p_id:null})).data as {client:{id:string};clientFingerprint:string;source:unknown;issuer:Record<string,unknown>};
  const estimateId=crypto.randomUUID();
  expect((await f.db.rpc('pro_private_estimate_mutate',{p_actor:owner,p_input:{action:'save',actionId:crypto.randomUUID(),estimateId,revision:0,clientId:ctx.client.id,refreshClient:false,clientFingerprint:ctx.clientFingerprint,source:ctx.source,issuer:{...ctx.issuer,issuerName:'Constructora F1C'},title:tr('Pintura interior ','Interior painting ')+id,notes:tr('Incluye materiales.','Materials included.'),currency:'CRC',validUntil:null,
   lines:[{id:crypto.randomUUID(),description:tr('Pintura de paredes','Wall painting'),unit:'m²',qtyMilli:40000,unitPriceCents:350000,discountBps:0,taxBps:1300,catalogProductId:null,unitCostCents:432100,group:tr('Sala','Living room')},{id:crypto.randomUUID(),description:tr('Pintura de cielos','Ceiling painting'),unit:'m²',qtyMilli:20000,unitPriceCents:400000,discountBps:0,taxBps:1300,catalogProductId:null,group:tr('Sala','Living room')}]}})).error).toBeNull();
  const invoiceLine={...blankInvoiceLine(),description:tr('Pintura de paredes','Wall painting'),cabys:'4321000000000',sku:'PNT-01',quantity:'40',unitPrice:'3500',taxTreatment:'vat',taxRate:'13',tax:{vatCode:'08',exemption:null},specialTaxes:[]};
  const created=await page.request.post('/api/pro/invoice-drafts',{headers,data:{action:'create_direct',requestId:crypto.randomUUID(),clientId:f.clientId,title:tr('Factura pintura ','Painting invoice ')+id,notes:tr('Gracias por su compra.','Thank you.'),lines:[invoiceLine],charges:[]}});expect(created.status(),await created.text()).toBe(200);const invoiceId=(await created.json()).id as string;
  const quoteUrl='/api/pro/quote-print?'+new URLSearchParams({estimateId,lang:language,preview:'1'}),invoiceUrl='/api/pro/invoice-print?id='+invoiceId;
  await warmLocalRoutes(page,[quoteUrl,invoiceUrl,'/api/pro/document-branding']);
  // Prints before any branding was saved (today's output) — compared below with the saved default template.
  const beforeQuote=stripNonce(await (await page.request.get(quoteUrl)).text()),beforeInvoice=stripNonce(await (await page.request.get(invoiceUrl)).text());
  // (3) Settings: options and live preview before saving.
  await openPro(page,`${prefix}/dashboard/pro?tab=pro_company&empresa=documentos`,en);const brand=page.locator('[data-document-branding-settings]');await expect(brand).toBeVisible({timeout:90000});
  const settings=brand.locator('[data-document-template-settings]');await expect(settings).toBeVisible();
  await brand.getByLabel(tr('Nombre de la empresa en el encabezado','Company name in the header'),{exact:true}).fill('Remodelaciones '+id);
  const frame=page.frameLocator('[data-document-preview-frame]');
  await expect(frame.locator('main[data-quote-print]')).toBeVisible({timeout:30000});await expect(frame.locator('main')).not.toHaveAttribute('data-document-template',/./);
  await expectNoHorizontalOverflow(page);await brand.locator('[data-document-branding-preview]').scrollIntoViewIfNeeded();await shot(page,`f1c-settings-preview-classic-${language}`,project);
  await settings.getByRole('radio',{name:tr('Moderna','Modern'),exact:true}).check();
  await settings.getByRole('radio',{name:tr('Derecha','Right'),exact:true}).check();
  await settings.locator('[data-document-template-option="accent"] select').selectOption('terracota');
  await settings.getByRole('radio',{name:'A4',exact:true}).check();
  await settings.locator('[data-document-template-show="unitPrices"]').uncheck();await settings.locator('[data-document-template-show="signature"]').uncheck();
  const terms=tr('50 % de adelanto y 50 % al entregar.','50% upfront and 50% on delivery.');await settings.locator('[data-document-template-terms]').fill(terms);
  await expect(frame.locator('main')).toHaveAttribute('data-document-template','modern');
  await expect(frame.locator('[data-document-terms]')).toContainText(terms);
  await expect(frame.locator('th[data-doc-field="unitPrices"]')).toBeHidden();await expect(frame.locator('[data-doc-field="signature"]')).toBeHidden();
  await brand.locator('[data-document-branding-preview]').scrollIntoViewIfNeeded();await shot(page,`f1c-settings-preview-modern-${language}`,project);
  await brand.locator('[data-document-preview-doc="invoice"]').click();await expect(frame.locator('main[data-invoice-print]')).toBeVisible({timeout:30000});
  await expect(frame.locator('td[data-doc-field="unitPrices"]').first()).toBeHidden();await shot(page,`f1c-settings-preview-invoice-${language}`,project);
  // Nothing is stored until "Save": the print still has no template.
  expect(stripNonce(await (await page.request.get(quoteUrl)).text())).not.toContain('data-document-template');
  await brand.getByRole('button',{name:tr('Guardar marca','Save branding'),exact:true}).click();await expect(brand.getByRole('status')).toContainText(tr('Marca guardada.','Branding saved.'),{timeout:60000});
  const savedBranding=await (await page.request.get('/api/pro/document-branding')).json();
  expect(savedBranding.template).toMatchObject({layout:'modern',logoPosition:'right',accent:'terracota',paper:'a4',show:{unitPrices:false,signature:false,codes:true,taxes:true,terms:true,notes:true}});expect(savedBranding.template.texts.quote.terms).toBe(terms);
  // Invalid options are refused by the server.
  const bad=await page.request.post('/api/pro/document-branding',{headers,data:{actionId:crypto.randomUUID(),revision:savedBranding.revision,theme:'celeste',displayName:'x',tagline:'',footer:'',logo:'keep',template:{layout:'fancy'}}});expect(bad.status()).toBe(400);
  // Each layout on a real quote and invoice print (screenshots of every variant).
  let revision=savedBranding.revision as number;
  const variants=[['classic',{}],['modern',{layout:'modern',logoPosition:'right',accent:'terracota',paper:'a4',show:{unitPrices:false,signature:false},texts:{quote:{terms},invoice:{terms,notes:tr('Cuenta IBAN en su estado de cuenta.','IBAN on your account statement.')}}}],['compact',{layout:'compact',logoPosition:'center',accent:'marino',paper:'letter',show:{codes:false,taxes:false},texts:{quote:{terms}}}]] as const;
  for(const [variant,template] of variants){
   const r=await page.request.post('/api/pro/document-branding',{headers,data:{actionId:crypto.randomUUID(),revision,theme:'bosque',displayName:'Remodelaciones '+id,tagline:tr('Calidad en cada detalle','Quality in every detail'),footer:tr('Gracias por su confianza.','Thank you for your trust.'),logo:'keep',template}});expect(r.status(),await r.text()).toBe(200);revision=(await r.json()).branding.revision;
   const quoteHtml=await (await page.request.get(quoteUrl)).text(),invoiceHtml=await (await page.request.get(invoiceUrl)).text();
   noCost(quoteHtml,'quote print '+variant);
   if(variant==='classic'){expect(quoteHtml).not.toContain('data-document-template');expect(invoiceHtml).not.toContain('data-document-template');}
   else{expect(quoteHtml).toContain(`data-document-template="${variant}"`);expect(invoiceHtml).toContain(`data-document-template="${variant}"`);expect(quoteHtml).toContain('data-document-terms');}
   if(variant==='modern'){expect(quoteHtml).toContain('@page{size:A4}');expect(invoiceHtml).toContain('data-document-notes');expect(quoteHtml).toContain('#a34919');}
   if(variant==='compact'){expect(invoiceHtml).toContain('[data-doc-field="codes"],[data-doc-field="taxes"]{display:none!important}');expect(quoteHtml).toContain('@page{size:letter}');}
   for(const [kind,url] of [['quote',quoteUrl],['invoice',invoiceUrl]] as const){
    await gotoOK(page,url);await expect(page.locator('main')).toBeVisible();
    if(variant==='modern'&&kind==='quote'){await expect(page.locator('th[data-doc-field="unitPrices"]')).toBeHidden();await expect(page.locator('[data-document-terms]')).toBeVisible();}
    if(variant==='compact'&&kind==='invoice')await expect(page.locator('small[data-doc-field="codes"]').first()).toBeHidden();
    if(variant==='classic'&&kind==='invoice')await expect(page.locator('small[data-doc-field="codes"]').first()).toContainText('CABYS 4321000000000');
    await expectNoHorizontalOverflow(page);await shot(page,`f1c-print-${kind}-${variant}-${language}`,project,true);
   }
  }
  // The default template prints exactly as today (same HTML except the random nonce).
  const reset=await page.request.post('/api/pro/document-branding',{headers,data:{actionId:crypto.randomUUID(),revision,theme:'celeste',displayName:'',tagline:'',footer:'',logo:'keep',template:defaultDocumentTemplate()}});expect(reset.status()).toBe(200);
  expect(stripNonce(await (await page.request.get(quoteUrl)).text())).toBe(beforeQuote);expect(stripNonce(await (await page.request.get(invoiceUrl)).text())).toBe(beforeInvoice);
  expect(errors).toEqual([]);
 }finally{await f.cleanup();}
});

import {test,expect,type Page,type BrowserContext} from 'playwright/test';
import {createHash,randomBytes} from 'node:crypto';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import sharp from 'sharp';
import {gotoOK,expectNoHorizontalOverflow,warmLocalRoutes,onAppPageError} from './helpers';
import {ownerFixture,local,origin,login} from './pro-round2-fixture';
import {createDisposableAccount,cleanupDisposableAccount,type DisposableAccount} from './disposable-account';
import {proposalDesignSchema,proposalPublicationSchema} from '../../src/lib/pro/estimate-proposals';

// Ronda F2-B (row 39): visual proposal. The owner designs cover, introduction, closing and photos from the existing
// company files, applies it to the shared version, and the linked customer sees a polished proposal around the
// existing per-line approval. Disposable accounts, loopback only; nothing is sent.
const shots=process.env.F2B_SHOTS_DIR;
async function shot(page:Page,name:string,project:string,fullPage=false){if(!shots)return;mkdirSync(shots,{recursive:true});await page.screenshot({path:join(shots,`${name}-${project}.png`),fullPage});}
const newContext=(browser:import('playwright/test').Browser,info:import('playwright/test').TestInfo)=>browser.newContext({baseURL:origin,viewport:info.project.use.viewport??undefined,isMobile:info.project.use.isMobile,hasTouch:info.project.use.hasTouch,userAgent:info.project.use.userAgent});
const api='/api/pro/quote-proposals';
// Photo-like JPEGs (soft gradients and shapes) generated locally.
async function photo(colors:[string,string],accent:string){const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${colors[0]}"/><stop offset="1" stop-color="${colors[1]}"/></linearGradient></defs><rect width="1200" height="800" fill="url(#g)"/><rect x="120" y="420" width="960" height="260" rx="18" fill="${accent}" opacity="0.85"/><rect x="160" y="460" width="260" height="180" rx="10" fill="#ffffff" opacity="0.35"/><rect x="470" y="460" width="260" height="180" rx="10" fill="#ffffff" opacity="0.35"/><rect x="780" y="460" width="260" height="180" rx="10" fill="#ffffff" opacity="0.35"/><circle cx="980" cy="180" r="90" fill="#ffffff" opacity="0.25"/></svg>`;
 return sharp(Buffer.from(svg)).jpeg({quality:82}).toBuffer();}

for(const language of ['es','en'] as const)test(`Visual proposal: cover, photos from files, applied version and customer view [${language}]`,async({page,browser},info)=>{
 test.setTimeout(900000);local(info.project.use.baseURL);const en=language==='en',id=language+randomBytes(3).toString('hex'),project=info.project.name,tr=(es:string,english:string)=>en?english:es,prefix=en?'/en':'/es';
 const f=await ownerFixture(page.context(),id);const accounts:DisposableAccount[]=[],contexts:BrowserContext[]=[];
 try{
  const owner=f.owner.id,headers={Origin:origin,'X-Pro-Expected-Actor':owner};const ownerErrors:string[]=[];onAppPageError(page,m=>ownerErrors.push(m));
  const customerContext=await newContext(browser,info);contexts.push(customerContext);const customer=await createDisposableAccount({prefix:'f2b-cust'});accounts.push(customer);await login(customerContext,customer);
  const token='f2b-'+id,hash=createHash('sha256').update('ccr-work-invite:v1:'+token).digest('hex');
  expect((await f.db.rpc('pro_work_client_invitations_mutate',{p_actor:owner,p_input:{action:'create',actionId:crypto.randomUUID(),workId:f.workId,invitationId:crypto.randomUUID(),tokenHash:hash,expiresInDays:7}})).error).toBeNull();
  expect((await f.db.rpc('pro_work_client_invitation_accept',{p_actor:customer.id,p_input:{action:'accept',actionId:crypto.randomUUID(),tokenHash:hash}})).error).toBeNull();
  const requestId=(await f.db.from('pro_appointment_requests').select('id').eq('owner_id',owner).eq('client_user_id',customer.id).single()).data!.id as string;
  const ctx=(await f.db.rpc('pro_private_estimate_context',{p_actor:owner,p_client:null,p_kind:'work',p_id:f.workId})).data as {client:{id:string};clientFingerprint:string;source:unknown;issuer:Record<string,unknown>};
  const estimateId=crypto.randomUUID(),l1=crypto.randomUUID(),l2=crypto.randomUUID(),l3=crypto.randomUUID(),publicationId=crypto.randomUUID(),section=tr('Muebles de cocina','Kitchen cabinets');
  const line=(lid:string,description:string,group:string|null,cents:number)=>({id:lid,description,unit:tr('unid.','ea'),qtyMilli:1000,unitPriceCents:cents,discountBps:0,taxBps:1300,catalogProductId:null,unitCostCents:Math.round(cents*0.6),...group?{group}:{}});
  const saved=await f.db.rpc('pro_private_estimate_mutate',{p_actor:owner,p_input:{action:'save',actionId:crypto.randomUUID(),estimateId,revision:0,clientId:ctx.client.id,refreshClient:false,clientFingerprint:ctx.clientFingerprint,source:ctx.source,issuer:{...ctx.issuer,issuerName:'Cocinas F2B'},title:tr('Cocina integral','Full kitchen'),notes:'',currency:'CRC',validUntil:null,
   lines:[line(l1,tr('Gabinetes inferiores','Base cabinets'),section,180000000),line(l2,tr('Sobre de cuarzo','Quartz countertop'),section,95000000),line(l3,tr('Instalación y limpieza','Installation and cleaning'),null,30000000)]}});expect(saved.error).toBeNull();
  const publish={action:'publish',actionId:crypto.randomUUID(),estimateId,estimateRevision:1,publicationId,recipient:{kind:'linked',requestId,recipientId:customer.id}};
  expect((await f.db.rpc('pro_private_estimate_publication_mutate',{p_actor:owner,p_input:publish,p_input_hash:createHash('sha256').update(JSON.stringify(publish)).digest('hex'),p_verified_email:null})).error).toBeNull();
  // Three photos in the company files (real JPEG bytes in the private bucket).
  const files:string[]=[];
  for(const [name,colors,accent] of [[tr('cocina-terminada.jpg','finished-kitchen.jpg'),['#e8d9c4','#b9946b'],'#6b4f3a'],[tr('gabinetes.jpg','cabinets.jpg'),['#dfe7ec','#9fb3c2'],'#2f4858'],[tr('cuarzo.jpg','quartz.jpg'),['#f4f4f2','#cfcfc9'],'#8d8d86']] as [string,[string,string],string][]){
   const fid=crypto.randomUUID(),bytes=await photo(colors,accent),path=`${owner}/${fid}.jpg`;
   expect((await f.db.storage.from('pro-company-files').upload(path,bytes,{contentType:'image/jpeg'})).error).toBeNull();
   await f.db.from('pro_company_files').insert({owner_id:owner,id:fid,name,mime_type:'image/jpeg',size_bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),object_path:path,ready:true}).throwOnError();files.push(fid);
  }
  await warmLocalRoutes(page,[api+'?'+new URLSearchParams({view:'design',estimateId}),api+'?'+new URLSearchParams({view:'publication',publicationId}),'/api/pro/quote-line-decisions?'+new URLSearchParams({publicationId})]);
  // ---- Contract ----
  const d0=proposalDesignSchema.parse(await (await page.request.get(api+'?'+new URLSearchParams({view:'design',estimateId}))).json());
  expect(d0.revision).toBe(0);expect(d0.lines.map(l=>l.group)).toEqual([section,section,null]);expect(d0.publications).toEqual([{publicationId,version:1,status:'shared',appliedSeq:null,appliedRevision:null,open:true}]);
  expect((await page.request.get(api+'?view=design')).status()).toBe(400);
  expect((await page.request.post(api,{headers:{'X-Pro-Expected-Actor':owner},data:{}})).status()).toBe(403);
  expect((await page.request.post(api,{headers,data:{action:'save',actionId:crypto.randomUUID(),estimateId,revision:0,coverTitle:'a\nb',intro:'',closing:''}})).status()).toBe(400);
  expect((await page.request.post(api,{headers,data:{action:'save',actionId:crypto.randomUUID(),estimateId,revision:5,coverTitle:'x',intro:'',closing:''}})).status()).toBe(409);
  expect((await customerContext.request.get(origin+api+'?'+new URLSearchParams({view:'design',estimateId}))).status()).not.toBe(200);
  expect(proposalPublicationSchema.parse(await (await customerContext.request.get(origin+api+'?'+new URLSearchParams({view:'publication',publicationId}))).json()).proposal).toBeNull();

  // ---- Owner designs the proposal ----
  await gotoOK(page,`${prefix}/dashboard/pro?tab=quotes`);
  await page.getByRole('button',{name:/^(Revisar versión compartida|Review shared version)$/}).first().click({timeout:90000});
  const pubs=page.locator('[data-estimate-publication-detail]');await expect(pubs).toBeVisible({timeout:90000});
  await pubs.locator('[data-proposal-design-open]').click({timeout:90000});const designer=page.locator('[data-proposal-designer]');await expect(designer).toBeVisible();
  await designer.locator('[data-proposal-cover-title]').fill(tr('Su nueva cocina integral','Your new kitchen'));
  await designer.locator('[data-proposal-intro-input]').fill(tr('Gracias por recibirnos. Esta propuesta reúne los muebles, el sobre y la instalación que conversamos.\n\nPuede aprobar cada partida por separado.','Thank you for having us. This proposal brings together the cabinets, the countertop and the installation we discussed.\n\nYou can approve each item separately.'));
  await designer.locator('[data-proposal-closing-input]').fill(tr('Quedamos atentos a sus comentarios.','We look forward to your comments.'));
  await designer.locator('[data-proposal-save]').click();await expect(designer.locator('[data-proposal-notice]')).toBeVisible({timeout:60000});
  const pick=async(slot:string,file:string,caption=''):Promise<void>=>{
   await designer.locator(`[data-proposal-add="${slot}"]`).click();const picker=page.locator('[data-proposal-picker]');await expect(picker.locator(`[data-proposal-file="${file}"]`)).toBeVisible({timeout:60000});
   await picker.locator(`[data-proposal-file="${file}"]`).click();if(caption)await picker.locator('[data-proposal-caption]').fill(caption);await picker.locator('[data-proposal-pick-confirm]').click();
   await expect(picker).toBeHidden();await expect(designer.locator(`[data-proposal-slot="${slot}"] [data-proposal-design-image]`).last()).toBeVisible({timeout:60000});
  };
  await pick('cover:',files[0],tr('Vista de referencia','Reference view'));
  await expect(designer.locator('[data-proposal-add="cover:"]')).toHaveCount(0);
  await pick('section:'+section,files[1],tr('Gabinetes a la medida','Custom cabinets'));
  await pick('line:'+l1,files[1]);await pick('line:'+l1,files[2]);await pick('line:'+l2,files[2],tr('Cuarzo blanco','White quartz'));
  await expect(designer.locator(`[data-proposal-slot="line:${l1}"] [data-proposal-design-image]`)).toHaveCount(2);
  await expectNoHorizontalOverflow(page);await shot(page,`f2b-proposal-designer-${language}`,project);
  await designer.locator(`[data-proposal-apply="${publicationId}"]`).click();
  await expect(designer.locator('[data-proposal-notice]')).toContainText(tr('versión 1','version 1'),{timeout:60000});
  await expect(designer.locator(`[data-proposal-apply="${publicationId}"]`)).toBeDisabled();
  await page.keyboard.press('Escape');await expect(designer).toBeHidden();
  await expect(pubs.locator('[data-proposal-cover]')).toContainText(tr('Su nueva cocina integral','Your new kitchen'),{timeout:60000});

  // ---- Customer sees the polished proposal and approves per line ----
  const cust=await customerContext.newPage();const custErrors:string[]=[];onAppPageError(cust,m=>custErrors.push(m));
  await gotoOK(cust,`${prefix}/dashboard/cotizaciones#publicacion=${publicationId}`);
  const cover=cust.locator('[data-proposal-cover]');await expect(cover).toContainText(tr('Su nueva cocina integral','Your new kitchen'),{timeout:90000});
  await expect(cover.locator('[data-proposal-intro] p')).toHaveCount(2);
  await expect(cover.locator('img[data-proposal-photo]')).toHaveJSProperty('complete',true,{timeout:60000});expect(await cover.locator('img[data-proposal-photo]').evaluate((img:HTMLImageElement)=>img.naturalWidth)).toBeGreaterThan(100);
  const decisions=cust.locator(`[data-quote-line-decisions="${publicationId}"]`);
  await expect(decisions.locator(`[data-proposal-section-photos="${section}"] img[data-proposal-photo]`)).toHaveCount(1);
  await expect(decisions.locator(`[data-proposal-line-photos="${l1}"] [data-proposal-gallery] button`)).toHaveCount(2);
  await expect(decisions.locator('[data-proposal-closing]')).toContainText(tr('Quedamos atentos','We look forward'));
  await expectNoHorizontalOverflow(cust);await shot(cust,`f2b-proposal-client-${language}`,project);
  await decisions.locator(`[data-quote-line="${l1}"]`).scrollIntoViewIfNeeded();await shot(cust,`f2b-proposal-client-lines-${language}`,project);
  await decisions.locator(`[data-quote-line="${l1}"] [data-quote-line-approve]`).click();
  await expect(decisions.locator(`[data-quote-line="${l1}"]`)).toHaveAttribute('data-decision','approved',{timeout:60000});
  // Photo audience: the customer gets the verified JPEG; another account does not; no storage path leaks.
  const seen=proposalPublicationSchema.parse(await (await customerContext.request.get(origin+api+'?'+new URLSearchParams({view:'publication',publicationId}))).json());
  expect(seen.proposal!.images).toHaveLength(5);expect(JSON.stringify(seen)).not.toContain(owner+'/');
  const imgRes=await customerContext.request.get(origin+api+'?'+new URLSearchParams({view:'image',publicationId,imageId:seen.proposal!.images[0].imageId}));expect(imgRes.status()).toBe(200);expect(imgRes.headers()['content-type']).toBe('image/jpeg');
  const otherContext=await newContext(browser,info);contexts.push(otherContext);const stranger=await createDisposableAccount({prefix:'f2b-other'});accounts.push(stranger);await login(otherContext,stranger);
  expect((await otherContext.request.get(origin+api+'?'+new URLSearchParams({view:'image',publicationId,imageId:seen.proposal!.images[0].imageId}))).status()).toBe(403);
  expect((await otherContext.request.get(origin+api+'?'+new URLSearchParams({view:'publication',publicationId}))).status()).toBe(403);
  // Later edits stay private until applied again.
  const d1=proposalDesignSchema.parse(await (await page.request.get(api+'?'+new URLSearchParams({view:'design',estimateId}))).json());
  expect((await page.request.post(api,{headers,data:{action:'save',actionId:crypto.randomUUID(),estimateId,revision:d1.revision,coverTitle:'Otra',intro:'',closing:''}})).status()).toBe(200);
  expect(proposalPublicationSchema.parse(await (await customerContext.request.get(origin+api+'?'+new URLSearchParams({view:'publication',publicationId}))).json()).proposal!.coverTitle).toBe(tr('Su nueva cocina integral','Your new kitchen'));
  expect(ownerErrors).toEqual([]);expect(custErrors).toEqual([]);
 }finally{for(const c of contexts)await c.close().catch(()=>{});for(const a of accounts)await cleanupDisposableAccount(a).catch(()=>{});await f.cleanup();}
});

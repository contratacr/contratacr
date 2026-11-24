import {test,expect,type BrowserContext,type Page} from 'playwright/test';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {createDisposableAccount,cleanupDisposableAccount,type DisposableAccount} from './disposable-account';
import {crTodayISO} from '../../src/lib/time-cr';
import {proMoney} from '../../src/lib/pro/money';
import {gotoOK,expectNoHorizontalOverflow,collectPageErrors} from './helpers';
import {stabilizeLocalProRuntime} from './pro-local-stable-runtime';
import {ownerFixture,local,headersFor,origin,type Owner} from './pro-round2-fixture';

// Round 4B (2026-11-13), item 5: vendor attachments on portal offers and the vendor's award notice.
// Only the owner of the bid and that vendor can read a file (other vendor, other owner and
// anonymous are denied). Nothing is e-mailed or sent. Disposable accounts, loopback only.
const shots=process.env.ROUND4B_SHOTS_DIR;
async function shot(page:Page,name:string,project:string,fullPage=true){if(!shots)return;mkdirSync(shots,{recursive:true});await page.screenshot({path:join(shots,`portal-${name}-${project}.png`),fullPage});}
const api='/api/pro/bids',links='/api/pro/bid-portal-links',portal='/api/pro/bid-portal',files='/api/pro/bid-portal/files';
const shiftDay=(iso:string,days:number)=>{const d=new Date(iso+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);};
// Minimal valid PDF (header + %%EOF) and a 1×1 PNG: the server keeps the PDF and re-encodes the PNG as JPG.
const PDF=Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n','latin1');
const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64');
type Extras={canAttach:boolean;files:Array<{id:string;name:string;mimeType:string}>;outcome:null|{status:string;lineCount:number;totalLineCount:number;wonCents:number|null;lines:unknown[]}};

for(const language of ['es','en'] as const)test(`Round 4B portal: vendor attachments (owner + that vendor only) and award notice [${language}]`,async({page,browser},info)=>{
 test.setTimeout(480000);local(info.project.use.baseURL);const en=language==='en',project=info.project.name,label=language+crypto.randomUUID().slice(0,6);
 const f:Owner=await ownerFixture(page.context(),label);
 let v1Context:BrowserContext|undefined,v2Context:BrowserContext|undefined,stranger:DisposableAccount|undefined,strangerContext:BrowserContext|undefined,anon:BrowserContext|undefined;
 try{
  const errors=collectPageErrors(page),headers=headersFor(f.owner),today=crTodayISO();
  const bid=async(data:Record<string,unknown>)=>{const r=await page.request.post(origin+api,{headers,data});expect(r.status(),JSON.stringify(data).slice(0,160)).toBe(200);return (await r.json()).package as {id:string;revision:number};};
  const vendor=async(name:string)=>{const id=crypto.randomUUID();expect((await page.request.post(origin+'/api/pro/company-vendors',{headers,data:{action:'create',actionId:crypto.randomUUID(),id,name,kind:'supplier',trade:null,contactName:null,email:'',phone:'',identification:'',notes:null}})).status()).toBe(200);return id;};
  const v1=await vendor('Ferretería Adjuntos'),v2=await vendor('Maderas Ajenas');
  const packageId=crypto.randomUUID(),l1=crypto.randomUUID(),l2=crypto.randomUUID();
  let pkg=await bid({action:'create',actionId:crypto.randomUUID(),workId:f.workId,id:packageId,title:'Enchape de baño',scope:'Suministro e instalación.',dueDate:shiftDay(today,7),lines:[{id:l1,description:'Cerámica de pared',quantity:10,unit:'m²',budgetCodeId:null},{id:l2,description:'Mano de obra',quantity:1,unit:'global',budgetCodeId:null}]});
  pkg=await bid({action:'invite',actionId:crypto.randomUUID(),workId:f.workId,id:packageId,revision:pkg.revision,supplierIds:[v1,v2]});
  pkg=await bid({action:'open',actionId:crypto.randomUUID(),workId:f.workId,id:packageId,revision:pkg.revision});
  const link=async(supplierId:string)=>{const r=await page.request.post(origin+links,{headers,data:{action:'create_link',actionId:crypto.randomUUID(),id:crypto.randomUUID(),workId:f.workId,packageId,supplierId,replacesLinkId:null,expiresInDays:7}});expect(r.status(),await r.text()).toBe(200);const body=await r.json();return {id:body.link.id as string,token:body.token as string};};
  const k1=await link(v1),k2=await link(v2);
  const vendorContext=async(token:string)=>{const context=await browser.newContext({viewport:page.viewportSize()??undefined,locale:en?'en-US':'es-CR'});await stabilizeLocalProRuntime(context,origin);const claimed=await context.request.post(origin+portal,{headers:{Origin:origin},data:{action:'claim',token}});expect(claimed.status(),await claimed.text()).toBe(200);return context;};
  v1Context=await vendorContext(k1.token);v2Context=await vendorContext(k2.token);
  const vendorPage=await v1Context.newPage(),vendorErrors=collectPageErrors(vendorPage);
  await vendorPage.goto(`${origin}${en?'/en':''}/licitacion-proveedor?invitacion=${k1.id}`);
  const root=vendorPage.locator('[data-bid-portal]');await expect(root.getByRole('heading',{level:1})).toHaveText('Enchape de baño',{timeout:90000});
  const section=root.locator('[data-bid-portal-files]');
  await expect(section.getByRole('heading',{name:en?'Attachments (optional)':'Adjuntos (opcional)'})).toBeVisible();
  await expect(section).toContainText(en?'No attachments yet.':'Todavía no hay adjuntos.');
  await expect(section).toContainText(en?'Only the professional who invited you sees them.':'Solo los ve el profesional que lo invitó.');
  // Nothing about awards in the vendor view before a decision.
  const before=await (await v1Context.request.get(origin+portal)).json() as {attachments:Extras};
  expect(before.attachments).toEqual({canAttach:true,canAsk:true,questions:[],files:[],outcome:null});expect(JSON.stringify(before)).not.toMatch(/award|Maderas/);
  // Upload through the real control: a PDF and a PNG photo (saved as JPG).
  const input=section.getByLabel(en?'Add attachment':'Agregar adjunto');
  await input.setInputFiles({name:'cotización-ferretería.pdf',mimeType:'application/pdf',buffer:PDF});
  await expect(section.locator('[data-bid-portal-file-notice]')).toHaveText(en?'Attachment added.':'Adjunto agregado.',{timeout:60000});
  await expect(section.locator('[data-bid-portal-file="cotización-ferretería.pdf"]')).toBeVisible();
  await section.getByLabel(en?'Add attachment':'Agregar adjunto').setInputFiles({name:'foto-muestra.png',mimeType:'image/png',buffer:PNG});
  await expect(section.locator('[data-bid-portal-file="foto-muestra.jpg"]')).toBeVisible({timeout:60000});
  await expect(section.locator('[data-bid-portal-file]')).toHaveCount(2);
  for(const control of await section.locator('a,button').all())if(await control.isVisible())expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await expectNoHorizontalOverflow(vendorPage);await section.scrollIntoViewIfNeeded();await shot(vendorPage,'vendor-files-'+language,project);
  // Too large and wrong type are refused before storing anything.
  const tooBig=await v1Context.request.post(origin+files,{headers:{Origin:origin},data:{action:'upload',fileId:crypto.randomUUID(),name:'grande.pdf',data:Buffer.alloc(20*1024*1024+10,65).toString('base64')}});expect([400,413]).toContain(tooBig.status());
  const wrongType=await v1Context.request.post(origin+files,{headers:{Origin:origin},data:{action:'upload',fileId:crypto.randomUUID(),name:'texto.txt',data:Buffer.from('hola').toString('base64')}});expect(wrongType.status()).toBe(400);
  expect((await v1Context.request.post(origin+files,{headers:{Origin:'http://evil.example'},data:{action:'remove',fileId:crypto.randomUUID()}})).status()).toBe(403);
  const extras=(await (await v1Context.request.get(origin+portal)).json() as {attachments:Extras}).attachments;
  const pdf=extras.files.find(file=>file.name==='cotización-ferretería.pdf')!,jpg=extras.files.find(file=>file.name==='foto-muestra.jpg')!;expect(pdf.mimeType).toBe('application/pdf');expect(jpg.mimeType).toBe('image/jpeg');
  const stored=(await f.db.from('pro_bid_portal_files').select('id,owner_id,supplier_id,ready,object_path').eq('owner_id',f.owner.id).order('created_at').throwOnError()).data!;
  expect(stored.map(row=>[row.supplier_id,row.ready,row.object_path])).toEqual([[v1,true,`${f.owner.id}/${pdf.id}.pdf`],[v1,true,`${f.owner.id}/${jpg.id}.jpg`]]);
  // ---- Access control ----
  const vendorDownload=await v1Context.request.get(origin+files+'?'+new URLSearchParams({fileId:pdf.id}));expect(vendorDownload.status()).toBe(200);expect(Buffer.from(await vendorDownload.body()).equals(PDF)).toBe(true);
  expect(vendorDownload.headers()['content-disposition']).toContain('attachment');expect(vendorDownload.headers()['cache-control']).toContain('no-store');
  expect((await v2Context.request.get(origin+files+'?'+new URLSearchParams({fileId:pdf.id}))).status()).toBe(404);// other vendor of the same bid
  expect((await (await v2Context.request.get(origin+portal)).json() as {attachments:Extras}).attachments.files).toEqual([]);
  anon=await browser.newContext();expect((await anon.request.get(origin+files+'?'+new URLSearchParams({fileId:pdf.id}))).status()).toBe(401);// no session
  const ownerDownload=await page.request.get(origin+links+'?'+new URLSearchParams({fileId:pdf.id}),{headers:{'X-Pro-Expected-Actor':f.owner.id}});expect(ownerDownload.status()).toBe(200);expect(Buffer.from(await ownerDownload.body()).equals(PDF)).toBe(true);
  stranger=await createDisposableAccount({prefix:'r4b-portal-other'});const db=f.db;
  const strangerUser=await db.auth.admin.getUserById(stranger.id);await db.auth.admin.updateUserById(stranger.id,{user_metadata:{...strangerUser.data.user!.user_metadata,is_provider:true,role:'professional'}});
  await db.from('profiles').update({is_provider:true,role:'professional'}).eq('id',stranger.id).throwOnError();await db.from('pro_memberships').insert({user_id:stranger.id,status:'active'}).throwOnError();
  strangerContext=await browser.newContext();const {login}=await import('./pro-round2-fixture');await login(strangerContext,stranger);
  expect((await strangerContext.request.get(origin+links+'?'+new URLSearchParams({fileId:pdf.id}),{headers:{'X-Pro-Expected-Actor':stranger.id}})).status()).toBe(404);// other owner
  expect((await strangerContext.request.get(origin+links+'?'+new URLSearchParams({view:'files',workId:f.workId,id:packageId}),{headers:{'X-Pro-Expected-Actor':stranger.id}})).status()).toBe(404);
  // ---- Offer from the portal, then the owner sees the attachments next to the comparison ----
  const view=await (await v1Context.request.get(origin+portal)).json() as {revision:number};
  expect((await v1Context.request.post(origin+portal,{headers:{Origin:origin},data:{action:'submit',actionId:crypto.randomUUID(),revision:view.revision,leadDays:5,validUntil:null,notes:'Ver cotización adjunta',prices:[{lineId:l1,unitCents:1500000},{lineId:l2,unitCents:20000000}]}})).status()).toBe(200);
  const v2view=await (await v2Context.request.get(origin+portal)).json() as {revision:number};
  expect((await v2Context.request.post(origin+portal,{headers:{Origin:origin},data:{action:'submit',actionId:crypto.randomUUID(),revision:v2view.revision,leadDays:null,validUntil:null,notes:null,prices:[{lineId:l1,unitCents:1800000},{lineId:l2,unitCents:15000000}]}})).status()).toBe(200);
  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_agenda',cita:f.workId,vistaTrabajo:'bids'}));
  await page.locator('[data-bid-item="LIC-0001"]').getByRole('button').click({timeout:90000});
  const card=page.locator('[data-bid-detail="LIC-0001"] [data-bid-portal-links] [data-bid-portal-vendor="Ferretería Adjuntos"]');
  const ownerFiles=card.locator('[data-bid-portal-owner-files]');await expect(ownerFiles).toHaveAttribute('data-bid-portal-owner-files','2',{timeout:60000});
  await expect(ownerFiles).toContainText(en?'Attachments from the vendor':'Adjuntos del proveedor');await expect(ownerFiles).toContainText('cotización-ferretería.pdf');
  await expect(page.locator('[data-bid-detail="LIC-0001"] [data-bid-portal-vendor="Maderas Ajenas"] [data-bid-portal-owner-files]')).toHaveCount(0);
  const download=page.waitForEvent('download');await ownerFiles.getByRole('link',{name:(en?'Download':'Descargar')+': cotización-ferretería.pdf'}).click();expect((await download).suggestedFilename().normalize('NFC')).toBe('cotización-ferretería.pdf');// WebKit reports it in NFD
  await expect(page.locator('[data-bid-comparison]')).toBeVisible();await expectNoHorizontalOverflow(page);await card.scrollIntoViewIfNeeded();await shot(page,'owner-files-'+language,project,false);
  // ---- Vendor removes one file; the owner no longer lists or downloads it ----
  await vendorPage.reload();await expect(root.getByRole('heading',{level:1})).toHaveText('Enchape de baño',{timeout:90000});
  await section.getByRole('button',{name:(en?'Remove':'Quitar')+': foto-muestra.jpg'}).click();
  await expect(section.locator('[data-bid-portal-file-notice]')).toHaveText(en?'Attachment removed.':'Adjunto quitado.',{timeout:60000});await expect(section.locator('[data-bid-portal-file]')).toHaveCount(1);
  expect((await page.request.get(origin+links+'?'+new URLSearchParams({fileId:jpg.id}),{headers:{'X-Pro-Expected-Actor':f.owner.id}})).status()).toBe(404);
  // Current package revision before awarding.
  pkg=(await (await page.request.get(origin+api+'?'+new URLSearchParams({view:'detail',workId:f.workId,id:packageId}),{headers:{'X-Pro-Expected-Actor':f.owner.id}})).json()).package;
  // ---- Award notice: line 1 to the vendor; the other vendor is not selected ----
  await bid({action:'award',actionId:crypto.randomUUID(),workId:f.workId,id:packageId,revision:pkg.revision,awards:[{lineId:l1,supplierId:v1},{lineId:l2,supplierId:v2}]});
  await vendorPage.reload();await expect(root.getByRole('heading',{level:1})).toHaveText('Enchape de baño',{timeout:90000});
  const notice=root.locator('[data-bid-portal-outcome]');await expect(notice).toHaveAttribute('data-bid-portal-outcome','partial');
  await expect(notice).toContainText(en?'You were awarded 1 of 2 items.':'Se le adjudicaron 1 de 2 partidas.');await expect(notice).toContainText('Cerámica de pared');
  await expect(notice.locator('[data-bid-portal-outcome-total]')).toHaveText(proMoney(150000,en));await expect(notice).not.toContainText('Mano de obra');
  await expect(notice).toContainText(en?'ContrataCR sends no e-mail or payment.':'ContrataCR no envía correos ni procesa pagos.');
  await expect(section).toContainText(en?'The bid no longer accepts attachments. Your files are kept.':'La licitación ya no recibe adjuntos. Sus archivos se conservan.');
  await expect(section.getByLabel(en?'Add attachment':'Agregar adjunto')).toHaveCount(0);await expect(section.getByRole('button',{name:(en?'Remove':'Quitar')+': cotización-ferretería.pdf'})).toHaveCount(0);
  expect((await v1Context.request.post(origin+files,{headers:{Origin:origin},data:{action:'upload',fileId:crypto.randomUUID(),name:'tarde.pdf',data:PDF.toString('base64')}})).status()).toBe(409);
  await expectNoHorizontalOverflow(vendorPage);await shot(vendorPage,'vendor-award-'+language,project);
  const other=(await (await v2Context.request.get(origin+portal)).json() as {attachments:Extras}).attachments.outcome!;
  expect(other.status).toBe('partial');expect(other.lines).toHaveLength(1);expect(JSON.stringify(other)).not.toContain('Cerámica');
  // Nothing sent: no notification or outbox rows for the owner.
  expect((await f.db.from('notifications').select('id').eq('user_id',f.owner.id).throwOnError()).data).toEqual([]);
  expect(errors()).toEqual([]);expect(vendorErrors()).toEqual([]);
 }finally{
  await Promise.all([v1Context?.close(),v2Context?.close(),strangerContext?.close(),anon?.close()].map(p=>p?.catch(()=>undefined)));
  await cleanupDisposableAccount(stranger);await f.cleanup();
 }
});

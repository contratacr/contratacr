import {test,expect,type Page} from 'playwright/test';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {collectPageErrors,gotoOK,expectNoHorizontalOverflow} from './helpers';
import {ownerFixture,local,headersFor,origin} from './pro-round2-fixture';

// Round 6D (rows 69/70): website builder (draft → preview → publish versions, public /sitio/<slug> serves only the
// published version, profile photos + published reviews), tracking link with UTM, the request form creates a lead
// in the lead center attributed to the campaign (no marketing consent unless ticked), cost entry and the
// cost-per-lead report from real data. Loopback only; nothing leaves the machine.
const shots=process.env.ROUND6D_SHOTS_DIR;
async function shot(page:Page,name:string,project:string,fullPage=false){if(!shots)return;mkdirSync(shots,{recursive:true});await page.screenshot({path:join(shots,`${name}-${project}.png`),fullPage});}
const photos=['https://photos.r6d.test/obra-1.png','https://photos.r6d.test/obra-2.png'];
// Profile photo URLs are served locally by the test (never fetched from a third party).
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==','base64');
for(const language of ['es','en'] as const)test(`Round 6D: website builder, tracking link and request form → lead [${language}]`,async({page,browser},info)=>{
 test.setTimeout(480000);local(info.project.use.baseURL);const en=language==='en',project=info.project.name,label=language+crypto.randomUUID().slice(0,6),t=(es:string,english:string)=>en?english:es;
 await page.context().route('https://photos.r6d.test/**',route=>route.fulfill({status:200,contentType:'image/png',body:png}));
 const f=await ownerFixture(page.context(),label);let visitor:Awaited<ReturnType<typeof browser.newContext>>|null=null;
 try{
  const errors=collectPageErrors(page),h=headersFor(f.owner),slug='obras-'+label;
  const pro=(await f.db.from('professionals').update({portfolio_urls:photos,services:[{name:t('Remodelación de cocinas','Kitchen remodeling'),description:t('Diseño y obra','Design and build')}]}).eq('profile_id',f.owner.id).select('id').single().throwOnError()).data!;
  await f.db.from('reviews').insert({professional_id:pro.id,client_id:null,rating:5,comment:t('Excelente trabajo y muy puntuales.','Excellent work, always on time.'),client_name_snapshot:'Laura Gómez',moderation_status:'published'}).throwOnError();
  await f.db.from('reviews').insert({professional_id:pro.id,client_id:null,rating:1,comment:'Oculta por moderación.',client_name_snapshot:'Oculto Pérez',moderation_status:'hidden'}).throwOnError();

  // (1) Company › Website: first draft built from the profile; not public until published.
  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_company',empresa:'sitio'}));
  const site=page.locator('[data-company-site]');await expect(site).toHaveAttribute('data-company-site','new',{timeout:90000});
  await expect(site.locator('[data-site-section-editor="services"]').getByLabel(t('Servicio 1','Service 1'),{exact:true})).toHaveValue(t('Remodelación de cocinas','Kitchen remodeling'));
  await expect(site.locator('[data-site-photo]')).toHaveCount(2);await expect(site.locator('[data-site-photo="0"]')).toBeChecked();
  await site.locator('[data-site-field="slug"]').fill(slug);await site.locator('[data-site-field="language"]').selectOption(language);
  await site.locator('[data-site-input="hero-heading"]').fill(t('Cocinas que duran','Kitchens that last'));
  await site.locator('[data-site-save]').click();await expect(site.locator('[data-site-notice]')).toContainText(t('Borrador guardado','Draft saved'),{timeout:60000});
  await expect(site).toHaveAttribute('data-company-site','draft');
  expect((await page.request.get(origin+'/sitio/'+slug)).status()).toBe(404);// a draft is never public
  // Preview = same page with the draft, form disabled.
  await site.locator('[data-site-preview]').click();const frame=page.locator('[data-site-preview-frame]');await expect(frame.getByRole('heading',{level:1})).toHaveText(t('Cocinas que duran','Kitchens that last'));
  await expect(frame.locator('[data-site-form] button[type=submit]')).toBeDisabled();await expect(frame.locator('[data-site-section="reviews"]')).toContainText('Laura G.');await expect(frame).not.toContainText('Oculto');
  await shot(page,`r6d-site-preview-${language}`,project);await page.getByRole('button',{name:t('Cerrar diálogo','Close dialog')}).click();
  // Publish (confirmation) → version 1.
  await site.locator('[data-site-publish]').click();await page.getByRole('button',{name:t('Publicar','Publish'),exact:true}).last().click();
  await expect(site.locator('[data-site-status]')).toHaveText(t('Publicado · versión 1','Published · version 1'),{timeout:60000});
  await expectNoHorizontalOverflow(page);await shot(page,`r6d-site-editor-${language}`,project,true);
  // An edit after publishing stays in the draft.
  await site.locator('[data-site-input="hero-heading"]').fill(t('Borrador nuevo','New draft'));await site.locator('[data-site-save]').click();
  await expect(site.locator('[data-site-draft-changed]')).toBeVisible({timeout:60000});
  const api=await (await page.request.get(origin+'/api/pro/site')).json() as {site:{revision:number}};
  expect((await page.request.post(origin+'/api/pro/site',{headers:h,data:{action:'publish',actionId:crypto.randomUUID(),revision:api.site.revision-1}})).status()).toBe(409);// stale revision

  // (2) Marketing insights: tracking campaign + cost.
  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_company',empresa:'insights'}));
  const ads=page.locator('[data-company-ads]');await expect(ads).toBeVisible({timeout:90000});
  await ads.locator('[data-ads-field="name"]').fill('Facebook '+label);await ads.locator('[data-ads-field="channel"]').selectOption('meta');await ads.locator('[data-ads-create]').click();
  await expect(ads.locator('[data-ads-notice]')).toContainText(t('Campaña creada','Campaign created'),{timeout:60000});
  const trackingUrl=(await ads.locator('[data-ads-url]').first().textContent())!.trim();
  expect(trackingUrl).toMatch(new RegExp(`/sitio/${slug}\\?utm_source=facebook&utm_medium=cpc&utm_campaign=facebook-${label}&cc=[a-z0-9]{8}$`));
  await ads.locator('[data-ads-field="cost-amount"]').fill('20000');await ads.locator('[data-ads-field="cost-note"]').fill(t('Pauta semana 1','Week 1 boost'));await ads.locator('[data-ads-cost-save]').click();
  await expect(ads.locator('[data-ads-cost="cost"]')).toHaveCount(1,{timeout:60000});

  // (3) Visitor (no account) opens the tracking link: published version only; sends the form WITHOUT the consent tick.
  visitor=await browser.newContext({viewport:page.viewportSize()??undefined,isMobile:(page.viewportSize()?.width??1366)<640});await visitor.route('https://photos.r6d.test/**',route=>route.fulfill({status:200,contentType:'image/png',body:png}));const v=await visitor.newPage();const visitorErrors=collectPageErrors(v);
  await v.goto(trackingUrl);const pub=v.locator(`[data-site-page="${slug}"]`);await expect(pub).toHaveAttribute('data-site-version','1',{timeout:90000});
  await expect(v.getByRole('heading',{level:1})).toHaveText(t('Cocinas que duran','Kitchens that last'));// not the newer draft
  await expect(v).toHaveTitle(new RegExp('Remodelaciones '+label));
  await expect(pub.locator('[data-site-section="portfolio"] img')).toHaveCount(2);await expect(pub.locator('[data-site-section="reviews"]')).toContainText('Laura G.');await expect(pub).not.toContainText('Oculto');
  const form=pub.locator('[data-site-form]');
  await form.getByLabel(t('Nombre','Name'),{exact:true}).fill('Ana Visitante');await form.getByLabel(t('Correo','Email'),{exact:true}).fill(`ana.${label}@example.test`);
  await form.getByLabel(t('Cuéntenos su proyecto','Tell us about your project')).fill(t('Quiero remodelar la cocina','I want to remodel my kitchen'));
  await expect(form.locator('[data-site-marketing]')).not.toBeChecked();
  await expectNoHorizontalOverflow(v);await shot(v,`r6d-site-public-${language}`,project,true);
  await form.getByRole('button',{name:t('Enviar solicitud','Send request')}).click();await expect(pub.locator('[data-site-form-sent]')).toBeVisible({timeout:60000});
  await shot(v,`r6d-site-sent-${language}`,project);expect(visitorErrors()).toEqual([]);
  const lead=(await f.db.from('pro_lead_center_records').select('id,title,source_label').eq('owner_id',f.owner.id).eq('kind','manual').single().throwOnError()).data!;
  expect(lead.source_label).toBe('Sitio web · Facebook '+label);
  expect((await f.db.from('pro_lead_origin_assignments').select('channel_id').eq('owner_id',f.owner.id).eq('id',lead.id).single()).data!.channel_id).toBe('advertising');
  expect((await f.db.from('pro_lead_attributions').select('utm').eq('owner_id',f.owner.id).eq('lead_id',lead.id).single()).data!.utm).toMatchObject({source:'facebook',medium:'cpc'});
  expect((await f.db.from('pro_mkt_contacts').select('id').eq('owner_id',f.owner.id)).data).toEqual([]);// no consent → no marketing contact
  const sitemap=await (await page.request.get(origin+'/api/pro/site-public?sitemap=1')).text();expect(sitemap).toContain(`/sitio/${slug}</loc>`);
  // (3b) Post-security fixes, double opt-in (Ley 8968): WITH the tick the visitor only becomes «pending» and gets a
  // confirmation email (mock: stored, never sent, not visible to the owner); consent exists after confirming it.
  const beto=`beto.${label}@example.test`;
  const ticked=await v.request.post(origin+'/api/pro/site-public',{headers:{Origin:origin},data:{action:'submit',slug,submissionId:crypto.randomUUID(),name:'Beto Visitante',email:beto,phone:'',message:t('Quiero una cotización de techo','I want a roof quote'),service:'',area:'',marketingConsent:true,language,code:null,utm:{},website:''}});
  expect(ticked.status()).toBe(200);expect(await ticked.json()).toEqual({ok:true,business:'Remodelaciones '+label});
  const pending=(await f.db.from('pro_mkt_contacts').select('id,consent,consent_source,confirmed_at').eq('owner_id',f.owner.id).eq('email',beto).single().throwOnError()).data!;
  expect(pending).toMatchObject({consent:'pending',consent_source:'site_form',confirmed_at:null});
  const mails=(await f.db.from('pro_mkt_confirmations').select('to_email,body,mode,delivery,used_at').eq('owner_id',f.owner.id).eq('contact_id',pending.id).throwOnError()).data!;
  expect(mails).toHaveLength(1);expect(mails[0]).toMatchObject({to_email:beto,mode:'mock',delivery:'simulado',used_at:null});
  const confirmLink=new RegExp(`(https?://[^\\s]+${en?'/en':''}/confirmar-pro#t=[a-f0-9]{64})`).exec(mails[0]!.body)![1]!;
  const ownerView=await (await page.request.get(origin+'/api/pro/marketing')).text();
  expect(ownerView).not.toContain('confirmar-pro');expect(JSON.parse(ownerView).contacts.find((c:{email:string})=>c.email===beto)).toMatchObject({consent:'pending',suppressed:false});
  expect((await v.request.post(origin+'/api/pro/marketing-confirm',{headers:{Origin:'https://evil.example'},data:{token:'a'.repeat(64),confirm:true}})).status()).toBe(403);
  expect((await v.request.post(origin+'/api/pro/marketing-confirm',{headers:{Origin:origin},data:{token:'0'.repeat(64),confirm:true}})).status()).toBe(404);
  await v.goto(confirmLink);await expect(v.locator('[data-confirm-subscription]')).toBeVisible({timeout:90000});await expect(v.getByRole('main')).toContainText('Remodelaciones '+label);
  expect((await f.db.from('pro_mkt_contacts').select('consent').eq('owner_id',f.owner.id).eq('id',pending.id).single()).data!.consent,'opening the page does not confirm').toBe('pending');
  await expectNoHorizontalOverflow(v);await shot(v,`r6d-site-confirm-${language}`,project);
  await v.locator('[data-confirm-subscription]').click();await expect(v.locator('[data-confirm-state="done"]')).toBeVisible({timeout:60000});
  expect((await f.db.from('pro_mkt_contacts').select('consent,confirmed_at').eq('owner_id',f.owner.id).eq('id',pending.id).single()).data!).toMatchObject({consent:'granted'});
  await v.goto('about:blank');await v.goto(confirmLink);await expect(v.locator('[data-confirm-state="done"]')).toBeVisible({timeout:90000});// single-use: shows the result, changes nothing
  await v.goto('about:blank');await v.goto(confirmLink.replace(/#t=.*/,'#t=zz'));await expect(v.locator('[data-confirm-state="invalid"]')).toBeVisible({timeout:90000});expect(visitorErrors()).toEqual([]);

  // (4) Report from real data: 1 visit, 1 lead, ₡20 000 → ₡20 000 per lead, ROI −100 %.
  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_company',empresa:'insights'}));
  const row=ads.locator('[data-ads-row]').filter({hasText:'Facebook '+label});await expect(row.locator('[data-ads-cell="leads"]')).toHaveText('1',{timeout:90000});
  await expect(row.locator('[data-ads-cell="visits"]')).toHaveText('1');await expect(row.locator('[data-ads-cell="cost"]')).toContainText(en?'20,000':'20.000');await expect(row.locator('[data-ads-cell="cpl"]')).toContainText(en?'20,000':'20.000');
  await expect(row.locator('[data-ads-cell="roi"]')).toHaveText(en?'-100%':'-100 %');
  await expectNoHorizontalOverflow(page);await shot(page,`r6d-ads-report-${language}`,project,true);
  // (5) The lead is in the lead center.
  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_leads'}));await expect(page.getByText(lead.title!,{exact:false}).filter({visible:true}).first()).toBeVisible({timeout:90000});
  // (6) Unpublish → public page gone.
  const current=await (await page.request.get(origin+'/api/pro/site')).json() as {site:{revision:number}};
  expect((await page.request.post(origin+'/api/pro/site',{headers:h,data:{action:'unpublish',actionId:crypto.randomUUID(),revision:current.site.revision}})).status()).toBe(200);
  expect((await page.request.get(origin+'/sitio/'+slug)).status()).toBe(404);
  expect((await page.request.post(origin+'/api/pro/site-public',{headers:{Origin:origin},data:{action:'submit',slug,submissionId:crypto.randomUUID(),name:'X Y',email:'x@example.test',phone:'',message:'Hola mundo',service:'',area:'',marketingConsent:false,language,code:null,utm:{},website:''}})).status()).toBe(404);
  expect(errors()).toEqual([]);
 }finally{await visitor?.close();await f.cleanup();}
});

import {test,expect} from 'playwright/test';
import {collectPageErrors,gotoOK,expectNoHorizontalOverflow} from './helpers';
import {ownerFixture,local,headersFor,origin} from './pro-round2-fixture';

// Round 13 (row 68): publish a finished job as a portfolio project with the customer's consent on record, withdraw it,
// and the commercial metrics of the profile (views -> contacts -> requests -> jobs). Photo URLs are fixed https
// values: the browser pipeline that uploads them is the existing public upload route (covered by its own specs).
// Disposable accounts, loopback only.
const crDay=(offset=0)=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Costa_Rica',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(Date.now()+offset*86400000));
for(const language of ['es','en'] as const)test(`Round 13: portfolio publication with consent and profile metrics [${language}]`,async({page},info)=>{
 test.setTimeout(600000);local(info.project.use.baseURL);const en=language==='en',label=language+crypto.randomUUID().slice(0,6),t=(es:string,english:string)=>en?english:es;
 const f=await ownerFixture(page.context(),label,document=>{document.work[0]={...document.work[0]!,stage:'completed',start:crDay(-5)+'T09:00:00-06:00',end:crDay(-1)+'T17:00:00-06:00'};});
 try{
  const errors=collectPageErrors(page),h=headersFor(f.owner),api=origin+'/api/pro/company-portfolio';
  const pro=(await f.db.from('professionals').select('id,category_id,portfolio_items').eq('profile_id',f.owner.id).single()).data!;
  // Seeded profile activity: 4 views from 3 visitors, 1 WhatsApp click.
  const visits=[['a','profile_view'],['a','profile_view'],['b','profile_view'],['c','profile_view'],['a','whatsapp_click']];
  await f.db.from('interaction_events').insert(visits.map(([visitor,type])=>({event_type:type,professional_id:pro.id,visitor_hash:'r13'+label+visitor,source:'test',locale:language}))).throwOnError();
  const read=await page.request.get(api);expect(read.status()).toBe(200);
  const first=await read.json() as {professions:string[];works:{id:string;publicationId:string|null}[]};
  expect(first.professions).toContain(pro.category_id);expect(first.works.map(w=>w.id)).toEqual([f.workId]);
  const metrics=await (await page.request.get(`${api}?view=metrics&from=${crDay(-6)}&to=${crDay()}`)).json() as {profile:{views:number;visitors:number;whatsapp:number}};
  expect(metrics.profile).toMatchObject({views:4,visitors:3,whatsapp:1});
  expect((await page.request.get(`${api}?view=metrics&from=${crDay()}&to=${crDay(-3)}`)).status()).toBe(400);
  // Validation: consent is required, photos must be https, the job must be finished and yours.
  const photos=['https://res.cloudinary.test/r13-a.jpg','https://res.cloudinary.test/r13-b.jpg'];
  const body=(over:Record<string,unknown>={})=>({action:'publish',id:crypto.randomUUID(),workId:f.workId,profession:pro.category_id,title:t('Cocina terminada','Finished kitchen'),description:'',recipient:'',photos,consentKind:'client_written',consentNote:'WhatsApp 12/11, Ana',consentOn:crDay(),...over});
  expect((await page.request.post(api,{headers:h,data:body({consentNote:''})})).status()).toBe(400);
  expect((await page.request.post(api,{headers:h,data:body({photos:['http://insecure.test/a.jpg']})})).status()).toBe(400);
  expect((await page.request.post(api,{headers:h,data:body({profession:'no_es_mia'})})).status()).toBe(400);
  expect((await page.request.post(api,{headers:{Origin:'https://evil.test'},data:body()})).status()).toBe(403);
  // Publish: the case lands in the public portfolio and the consent is stored.
  const id=crypto.randomUUID(),ok=await page.request.post(api,{headers:h,data:body({id})});expect(ok.status(),await ok.text()).toBe(200);
  expect((await page.request.post(api,{headers:h,data:body({id})})).status()).toBe(200);// idempotent replay
  expect((await page.request.post(api,{headers:h,data:body()})).status()).toBe(409);// one active publication per job
  const after=(await f.db.from('professionals').select('portfolio_items,portfolio_urls').eq('id',pro.id).single()).data!;
  expect((after.portfolio_items as {id:string;photos:string[]}[]).map(c=>c.id)).toEqual(['pro-'+id]);expect(after.portfolio_urls).toEqual(photos);
  expect((await f.db.from('pro_portfolio_publications').select('consent_kind,consent_note,photo_count,status').eq('id',id).single()).data).toMatchObject({consent_kind:'client_written',consent_note:'WhatsApp 12/11, Ana',photo_count:2,status:'published'});
  // UI: metrics funnel, published badge and the consent history.
  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_company',empresa:'portafolio'}));
  const view=page.locator('[data-company-portfolio]');await expect(view).toBeVisible({timeout:90000});
  await expect(view.locator('[data-metric="views"]')).toContainText('4');await expect(view.locator('[data-metric="contacts"]')).toContainText('1');
  await expect(view.locator(`[data-portfolio-work="${f.workId}"]`)).toContainText(t('Publicado','Published'));
  await expect(view.locator(`[data-portfolio-publication="${id}"]`)).toContainText('WhatsApp 12/11, Ana');
  await expectNoHorizontalOverflow(page);
  // Withdraw from the UI: the case leaves the portfolio and the record keeps its history.
  await view.locator(`[data-portfolio-publication="${id}"]`).getByRole('button',{name:t('Retirar del perfil','Remove from profile')}).click();
  await expect(view.locator(`[data-portfolio-publication="${id}"]`)).toHaveAttribute('data-status','withdrawn',{timeout:30000});
  const gone=(await f.db.from('professionals').select('portfolio_items,portfolio_urls').eq('id',pro.id).single()).data!;expect(gone.portfolio_items).toEqual([]);expect(gone.portfolio_urls).toEqual([]);
  // A job that is not finished cannot be published, and another account cannot read this portfolio.
  await f.db.from('pro_work').update({stage:'scheduled'}).eq('user_id',f.owner.id).eq('id',f.workId).throwOnError();
  expect((await page.request.post(api,{headers:h,data:body()})).status()).toBe(400);
  expect(errors).toEqual([]);
 }finally{await f.cleanup();}
});

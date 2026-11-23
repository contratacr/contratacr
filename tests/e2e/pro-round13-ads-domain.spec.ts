import {test,expect,type Page} from 'playwright/test';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {collectPageErrors,gotoOK,expectNoHorizontalOverflow} from './helpers';
import {ownerFixture,local,headersFor,origin} from './pro-round2-fixture';
import {simulateMetrics} from '../../src/lib/pro/ad-builder';

// Pro 29 (rows 69/70): ad campaign builder (draft -> review -> published in SANDBOX -> paused -> ended) with SIMULATED metrics kept
// apart from the real tracking tables, and the custom-domain block of the website (mock DNS instructions, simulated check, revoke).
// Loopback only: no ad platform and no DNS provider is ever called.
const shots=process.env.ROUND13_SHOTS_DIR;
async function shot(page:Page,name:string,project:string,fullPage=false){if(!shots)return;mkdirSync(shots,{recursive:true});await page.screenshot({path:join(shots,`${name}-${project}.png`),fullPage});}
const crDay=(offset=0)=>new Date(Date.now()-6*3600000+offset*86400000).toISOString().slice(0,10);
test('simulateMetrics is deterministic and stays inside the plan',()=>{
 const build={id:'11111111-1111-4111-8111-111111111111',startOn:'2026-01-01',endOn:'2026-01-10',dailyBudgetCents:500000,totalBudgetCents:1200000};
 const a=simulateMetrics(build,'2026-01-31'),b=simulateMetrics(build,'2026-01-31');
 expect(a).toEqual(b);expect(a.length).toBeGreaterThan(0);expect(a.length).toBeLessThanOrEqual(10);
 expect(a.reduce((n,r)=>n+r.spendCents,0)).toBeLessThanOrEqual(1200000);
 for(const r of a){expect(r.day>='2026-01-01'&&r.day<='2026-01-10').toBe(true);expect(r.spendCents).toBeLessThanOrEqual(500000);expect(r.clicks).toBeLessThanOrEqual(r.impressions);}
 expect(simulateMetrics(build,'2025-12-01')).toEqual([]);
});
for(const language of ['es','en'] as const)test(`Pro 29: ad builder in sandbox with simulated metrics, and custom domain with mock DNS [${language}]`,async({page},info)=>{
 test.setTimeout(480000);local(info.project.use.baseURL);const en=language==='en',project=info.project.name,label=language+crypto.randomUUID().slice(0,6),t=(es:string,english:string)=>en?english:es;
 const f=await ownerFixture(page.context(),label);
 try{
  const errors=collectPageErrors(page),h=headersFor(f.owner);
  // A tracking link to attach (the real tracking tables stay untouched by the builder).
  expect((await page.request.post(origin+'/api/pro/ads-tracking',{headers:h,data:{action:'campaign_save',actionId:crypto.randomUUID(),id:crypto.randomUUID(),revision:0,name:'Meta '+label,channel:'meta',landing:'profile',utmSource:'',utmMedium:'',utmCampaign:'',utmContent:''}})).status()).toBe(200);

  // (1) Builder: draft, incomplete submit refused, then review -> sandbox.
  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_company',empresa:'anuncios'}));
  const adb=page.locator('[data-company-ad-builder]');await expect(adb).toBeVisible({timeout:90000});
  await expect(adb.locator('[data-ad-builder-mode]')).toContainText(t('No se envía nada a Meta ni a Google','Nothing is sent to Meta or Google'));
  await adb.locator('[data-adb-field="name"]').fill('Cocinas '+label);await adb.locator('[data-adb-field="province"]').selectOption('Heredia');await adb.locator('[data-adb-field="canton"]').fill('Barva');
  await adb.locator('[data-adb-field="service"]').fill(t('Remodelación de cocinas','Kitchen remodeling'));await adb.locator('[data-adb-field="daily"]').fill('5000');await adb.locator('[data-adb-field="total"]').fill('50000');
  await adb.locator('[data-adb-field="start"]').fill(crDay(-3));await adb.locator('[data-adb-field="end"]').fill(crDay(20));
  await adb.locator('[data-adb-field="headline"]').fill(t('Su cocina nueva','Your new kitchen'));await adb.locator('[data-adb-field="body"]').fill(t('Cotice sin compromiso.','Get a free quote.'));
  await adb.locator('[data-adb-save]').click();await expect(adb.locator('[data-adb-notice]')).toContainText(t('Borrador guardado','Draft saved'),{timeout:60000});
  const build=adb.locator(`[data-adb-build="Cocinas ${label}"]`);await expect(build).toHaveAttribute('data-adb-status','draft');
  await build.locator('[data-adb-submit]').click();await expect(adb.locator('[data-adb-error]')).toBeVisible({timeout:60000});// no tracking link yet
  await expect(build).toHaveAttribute('data-adb-status','draft');
  await build.getByRole('button',{name:t('Editar','Edit')}).click();await adb.locator('[data-adb-field="tracking"]').selectOption({index:1});await adb.locator('[data-adb-save]').click();
  await expect(adb.locator('[data-adb-notice]')).toContainText(t('Borrador guardado','Draft saved'),{timeout:60000});
  await build.locator('[data-adb-submit]').click();await expect(build).toHaveAttribute('data-adb-status','review',{timeout:60000});
  await build.locator('[data-adb-publish]').click();await page.getByRole('button',{name:t('Publicar en sandbox','Publish in sandbox'),exact:true}).last().click();
  await expect(build).toHaveAttribute('data-adb-status','sandbox_published',{timeout:60000});
  await expect(build.locator('[data-adb-ref]')).toHaveText(/^sbx_meta_[a-z0-9]{16}$/);
  await build.locator('[data-adb-simulate]').click();await expect(build.locator('[data-adb-sim]')).toContainText(t('Simulado','Simulated'),{timeout:60000});
  await expect(build.locator('[data-adb-sim]')).not.toContainText(t('impresiones 0 ','impressions 0 '));
  await expectNoHorizontalOverflow(page);await shot(page,`r13-ad-builder-${language}`,project,true);
  // Simulated numbers are stored apart and flagged; the real tracking tables and report stay empty.
  const sim=(await f.db.from('pro_ad_sim_metrics').select('simulated,spend_cents').eq('owner_id',f.owner.id).throwOnError()).data!;
  expect(sim.length).toBeGreaterThan(0);expect(sim.every(r=>r.simulated===true&&r.spend_cents<=500000)).toBe(true);
  expect(sim.reduce((n,r)=>n+Number(r.spend_cents),0)).toBeLessThanOrEqual(5000000);
  expect((await f.db.from('pro_ad_costs').select('id').eq('owner_id',f.owner.id)).data).toEqual([]);expect((await f.db.from('pro_ad_visits').select('day').eq('owner_id',f.owner.id)).data).toEqual([]);
  // Pause, resume, end.
  await build.getByRole('button',{name:t('Pausar','Pause'),exact:true}).click();await expect(build).toHaveAttribute('data-adb-status','paused',{timeout:60000});
  await build.getByRole('button',{name:t('Reanudar','Resume'),exact:true}).click();await expect(build).toHaveAttribute('data-adb-status','sandbox_published',{timeout:60000});
  await build.getByRole('button',{name:t('Finalizar','End'),exact:true}).click();await page.getByRole('button',{name:t('Finalizar','End'),exact:true}).last().click();
  await expect(build).toHaveAttribute('data-adb-status','ended',{timeout:60000});
  // API guards: stale revision, plain http image, publishing a campaign that is not in review.
  const row=(await f.db.from('pro_ad_builds').select('id,revision').eq('owner_id',f.owner.id).single().throwOnError()).data!;
  expect((await page.request.post(origin+'/api/pro/company-ad-builder',{headers:h,data:{action:'pause',id:row.id,revision:row.revision-1}})).status()).toBe(409);
  expect((await page.request.post(origin+'/api/pro/company-ad-builder',{headers:h,data:{action:'publish_sandbox',id:row.id,revision:row.revision}})).status()).toBe(409);
  const bad={action:'save',id:crypto.randomUUID(),revision:0,name:'x',platform:'google',objective:'leads',province:'',canton:'',service:'',dailyBudgetCents:100000,totalBudgetCents:100000,startOn:crDay(1),endOn:crDay(5),headline:'',body:'',imageUrl:'http://example.test/a.png',trackingCampaignId:''};
  expect((await page.request.post(origin+'/api/pro/company-ad-builder',{headers:h,data:bad})).status()).toBe(400);
  expect((await page.request.post(origin+'/api/pro/company-ad-builder',{headers:h,data:{...bad,imageUrl:'',dailyBudgetCents:200000}})).status()).toBe(400);// daily above total
  expect((await page.request.get(origin+'/api/pro/company-ad-builder')).status()).toBe(200);

  // (2) Website first, then the domain block.
  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_company',empresa:'sitio'}));
  const site=page.locator('[data-company-site]');await expect(site).toHaveAttribute('data-company-site','new',{timeout:90000});
  const domain=page.locator('[data-site-domain]');await expect(domain).toHaveAttribute('data-site-domain','none');await expect(domain.locator('[data-site-domain-nosite]')).toBeVisible();
  await site.locator('[data-site-field="slug"]').fill('dom-'+label);await site.locator('[data-site-save]').click();await expect(site).toHaveAttribute('data-company-site','draft',{timeout:60000});
  const host=`www.${label}.example.cr`;await expect(domain.locator('[data-site-domain-nosite]')).toHaveCount(0);
  await domain.locator('[data-site-domain-input]').fill(host);await domain.locator('[data-site-domain-register]').click();
  await expect(domain).toHaveAttribute('data-site-domain','pending',{timeout:60000});await expect(domain.locator('[data-site-domain-host]')).toHaveText(host);
  await expect(domain.locator('[data-site-dns="cname"]')).toContainText(/sitios\.[a-z.]+/);await expect(domain.locator('[data-site-dns="txt"]')).toContainText('_contratacr-verify.'+host);
  await expect(domain.locator('[data-site-dns="txt"]')).toContainText('contratacr-verify=');
  expect((await page.request.get(origin+'/sitio/dom-'+label)).status()).toBe(404);// still a draft; the domain serves nothing
  await expectNoHorizontalOverflow(page);await shot(page,`r13-site-domain-${language}`,project,true);
  await domain.locator('[data-site-domain-verify]').click();await expect(domain).toHaveAttribute('data-site-domain','verified',{timeout:60000});
  await expect(domain.locator('[data-site-domain-status]')).toContainText(t('simulado','simulated'));
  // Invalid or reserved names are refused; a second domain needs the first one disconnected.
  for(const hostname of ['localhost','contratacr.com','api.contratacr.com','192.168.0.1','bad_name.cr'])expect((await page.request.post(origin+'/api/pro/company-site-domain',{headers:h,data:{action:'register',hostname}})).status(),hostname).toBe(400);
  expect((await page.request.post(origin+'/api/pro/company-site-domain',{headers:h,data:{action:'register',hostname:'otro.'+label+'.example.cr'}})).status()).toBe(409);
  await domain.locator('[data-site-domain-revoke]').click();await page.getByRole('button',{name:t('Desconectar','Disconnect'),exact:true}).last().click();
  await expect(domain).toHaveAttribute('data-site-domain','none',{timeout:60000});
  expect((await f.db.from('pro_site_domains').select('status').eq('owner_id',f.owner.id).throwOnError()).data).toEqual([{status:'revoked'}]);
  expect(errors()).toEqual([]);
 }finally{await f.cleanup();}
});

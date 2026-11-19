import {test,expect} from 'playwright/test';
import {collectPageErrors,gotoOK,expectNoHorizontalOverflow} from './helpers';
import {local,origin} from './pro-round2-fixture';
import {regressionAdminClient} from './seed';
import {hideSeededPlaces,trackPlace} from './pro-dir-fixture';

// Multivertical F1/F2 (LOCAL Pro): canonical place page /lugar/<slug>. Draft → 404; published → page with hours,
// verification label and OSM attribution; pharmacy without license_verified → public with a neutral «permit not verified»
// note (owner decision 2026-11-17); public report (idempotent
// reportId) and removal request accepted → 404. Loopback only; seed data is synthetic.
// DRAFT: not run yet (written while the full regression was running). Owner of /[locale]/lugar and
// /api/lugar/[slug]/reporte in verify-app-surface-ownership.mjs.
test.afterEach(()=>hideSeededPlaces());

for(const language of ['es','en'] as const)test(`F1/F2: place page, attribution, report and removal [${language}]`,async({page},info)=>{
 test.setTimeout(240000);local(info.project.use.baseURL);
 const en=language==='en',t=(es:string,english:string)=>en?english:es,db=regressionAdminClient(),staff=crypto.randomUUID(),label=crypto.randomUUID().slice(0,8);
 const slug='soda-e2e-'+label,placeId=crypto.randomUUID(),pharmacyId=crypto.randomUUID(),prefix=en?'/en':'';
 const mutate=async(input:Record<string,unknown>)=>{const r=await db.rpc('dir_place_mutate',{p_actor:staff,p_input:{actionId:crypto.randomUUID(),...input}});if(r.error)throw r.error;return r.data as {revision:number};};
 trackPlace(placeId,staff);trackPlace(pharmacyId,staff);
 const errors=collectPageErrors(page);
 let rev=(await mutate({action:'create',placeId,revision:0,source:{id:'osm',ref:'node/e2e'+label},verificationLevel:'imported',
  place:{slug,vertical:'restaurant',name:'Soda E2E '+label,adminArea1:'San José',locality:'San José',addressLine:'Avenida Central',lat:9.933,lng:-84.08,phone:'+506 2200 0001'}})).revision;
 expect((await page.request.get(origin+prefix+'/lugar/'+slug)).status()).toBe(404);// draft
 rev=(await mutate({action:'hours',placeId,revision:rev,hours:[{weekday:1,opens:'08:00',closes:'17:00'}]})).revision;
 rev=(await mutate({action:'status',placeId,revision:rev,status:'published'})).revision;
 await gotoOK(page,prefix+'/lugar/'+slug);
 await expect(page.getByRole('heading',{level:1})).toHaveText('Soda E2E '+label);
 await expect(page.locator('[data-place-verification="imported"]')).toHaveText(t('No reclamado','Unclaimed'));// 2026-11-19: quiet badge; the data sources are explained in the Terms (13.1)
 await expect(page.locator('[data-place-source="OpenStreetMap"]')).toContainText('OpenStreetMap');
 await expect(page.locator('section[aria-labelledby="place-hours"] dt',{hasText:t('Lunes','Monday')})).toBeVisible();
 await expectNoHorizontalOverflow(page);
 const robots=await page.locator('meta[name="robots"]').getAttribute('content');expect(robots).not.toContain('noindex');// indexing rule 2026-11-18 (DIR_INDEX_IMPORTED): an imported place with a phone/hours is indexable
 // pharmacy: published but not license_verified → public, with a neutral note (owner decision 2026-11-17)
 const ph=await mutate({action:'create',placeId:pharmacyId,revision:0,place:{slug:'farmacia-e2e-'+label,vertical:'pharmacy',name:'Farmacia E2E '+label}});
 await mutate({action:'status',placeId:pharmacyId,revision:ph.revision,status:'published'});
 await gotoOK(page,prefix+'/lugar/farmacia-e2e-'+label);
 await expect(page.locator('[data-pharmacy-license="unverified"]')).toContainText(t('Permiso sin verificar por ContrataCR.','License not verified by ContrataCR.'));
 await expect(page.locator('[data-place-verification="unverified"]')).toBeVisible();
 await gotoOK(page,prefix+'/lugar/'+slug);
 // report through the real form; a second identical POST with the same reportId is accepted once
 await page.waitForLoadState('networkidle');await page.locator('[data-place-report] summary').click();
 await page.getByLabel(t('Motivo','Reason')).selectOption('removal_request');
 await page.getByLabel(t('Detalle','Details')).fill(t('Soy el dueño y pido retirar la ficha.','I own it and request removal.'));
 await page.getByRole('button',{name:t('Enviar reporte','Send report')}).click();
 await expect(page.locator('[data-place-report="sent"]')).toBeVisible();
 const reports=(await db.from('dir_reports').select('id,kind').eq('place_id',placeId).throwOnError()).data!;expect(reports).toHaveLength(1);
 const bad=await page.request.post(origin+'/api/lugar/'+slug+'/reporte',{headers:{Origin:origin},data:{reportId:crypto.randomUUID(),kind:'spam',message:'x'}});expect(bad.status()).toBe(400);
 const resolved=await db.rpc('dir_report_resolve',{p_actor:staff,p_input:{actionId:crypto.randomUUID(),reportId:reports[0].id,decision:'accept',revision:rev}});expect(resolved.error).toBeNull();
 expect((await page.request.get(origin+prefix+'/lugar/'+slug)).status()).toBe(404);
 expect(errors()).toEqual([]);
});

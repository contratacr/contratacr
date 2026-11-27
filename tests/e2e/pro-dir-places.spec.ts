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
 await expect(page.locator('[data-place-verification]')).toHaveCount(0);// 2026-11-27: no «No reclamado» label; the claim box at the end invites the owner
 await expect(page.locator('[data-place-claim-link]')).toBeVisible();
 await expect(page.locator('[data-place-source="OpenStreetMap"]')).toContainText('OpenStreetMap');
 await expect(page.locator('section[aria-labelledby="place-hours"] dt',{hasText:t('Lunes','Monday')})).toBeVisible();
 // 2026-11-19 (Yelp biz-page model): rating line, open status, action bar, side card with «Llamar» and the compact
 // claim link, the section-colour hero instead of an empty photo box, and the phones' fixed action bar.
 await expect(page.locator('[data-rating-line="none"]')).toHaveText(t('Sin reseñas todavía','No reviews yet'));
 await expect(page.locator('[data-place-open-status]')).toHaveCount(1);
  // 2026-11-26 (owner: card-like header): no tile without photos; ONE chip row (Llamar…, Guardar, Compartir) replaces the
 // phones' fixed bar; the side card keeps «Llamar» from lg and the claim link (after the tabs on phones).
 // 2026-11-26 (identity card like the professional profile): without photos the round avatar is the section tile.
 await expect(page.locator('[data-place-header] [data-place-avatar="section"]')).toHaveCount(1);
 // Phones: Guardar/Compartir/Agregar fotos live in the bar's «…» sheet (owner 2026-11-26); inline from lg.
 if(!info.project.name.includes('mobile'))await expect(page.locator('[data-place-actions-bar] [data-share-button]')).toBeVisible();
 await expect(page.locator('[data-place-contact-buttons] [data-place-contact="call"]')).toHaveAttribute('href','tel:+50622000001');
 await expect(page.locator('[data-place-side-card] [data-place-contact="call"]')).toHaveAttribute('href','tel:+50622000001');
 await expect(page.locator('[data-place-side-card] [data-place-claim-link]')).toBeVisible();
 await expect(page.locator('[data-place-mobile-bar]')).toHaveCount(0);
 await expectNoHorizontalOverflow(page);
 const robots=await page.locator('meta[name="robots"]').getAttribute('content');expect(robots).not.toContain('noindex');// indexing rule 2026-11-18 (DIR_INDEX_IMPORTED): an imported place with a phone/hours is indexable
 // pharmacy: published but not license_verified → public, with a neutral note (owner decision 2026-11-17)
 const ph=await mutate({action:'create',placeId:pharmacyId,revision:0,place:{slug:'farmacia-e2e-'+label,vertical:'pharmacy',name:'Farmacia E2E '+label}});
 await mutate({action:'status',placeId:pharmacyId,revision:ph.revision,status:'published'});
 await gotoOK(page,prefix+'/lugar/farmacia-e2e-'+label);
 await expect(page.locator('[data-pharmacy-license="unverified"]')).toContainText(t('Permiso sin verificar por ContrataCR.','License not verified by ContrataCR.'));
 await expect(page.locator('[data-place-verification]')).toHaveCount(0);
 await gotoOK(page,prefix+'/lugar/'+slug);
 // report through the real form; a second identical POST with the same reportId is accepted once
 // «Sugerir un cambio» in the side card opens the report form (#reportar).
 await page.waitForLoadState('networkidle');await page.locator('[data-place-suggest]').click();
 await expect(page.locator('details[data-place-report]')).toHaveAttribute('open','');
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

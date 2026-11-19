import {test,expect} from 'playwright/test';
import sharp from 'sharp';
import {collectPageErrors,expectNoHorizontalOverflow,gotoOK} from './helpers';
import {local,login,origin} from './pro-round2-fixture';
import {createDisposableAccount,cleanupDisposableAccount,type DisposableAccount} from './disposable-account';
import {dirDb,hideSeededPlaces,label,postJson,seedPlace,uid,visibleHtml} from './pro-dir-fixture';
import {adminSession,opsShot,removeClaimDocuments,retireItems,seedItem} from './pro-dir-ops-fixture';

// Multivertical M1 (LOCAL Pro): staff queue of the directory in the admin area (/admin/directorio), admin + MFA only.
// Claims by documents (private upload, EXIF stripped) and by cédula jurídica (mock Hacienda adapter, name must match),
// flagged reviews, user price reports, place reports and pharmacy permits; every decision with a reason, idempotent,
// CAS 409 on stale state, and visible in the history. Owner of /[locale]/admin/directorio, /api/admin/directorio(/documento)
// and /api/lugar/[slug]/reclamo/documentos.
test.afterEach(()=>hideSeededPlaces());

for(const language of ['es','en'] as const)test(`M1: admin directory queue end to end [${language}]`,async({page,context,browser},info)=>{
 test.setTimeout(420000);local(info.project.use.baseURL);
 const en=language==='en',t=(es:string,english:string)=>en?english:es,prefix=en?'/en':'',db=dirDb(),tag=label();
 const docs=await seedPlace(db,{slug:`soda-docs-${tag}`,vertical:'restaurant',name:`Soda Documentos ${tag}`});
 await seedPlace(db,{slug:`prueba-cedula-${tag}`,vertical:'restaurant',name:`La Prueba ${tag}`});
 await seedPlace(db,{slug:`soda-flag-${tag}`,vertical:'restaurant',name:`Soda Reportada ${tag}`});
 await seedPlace(db,{slug:`super-precio-${tag}`,vertical:'grocery',name:`Súper Precio ${tag}`});
 const reported=await seedPlace(db,{slug:`soda-error-${tag}`,vertical:'restaurant',name:`Soda Erorr ${tag}`});
 const pharmacy=await seedPlace(db,{slug:`farmacia-permiso-${tag}`,vertical:'pharmacy',name:`Farmacia Permiso ${tag}`},{publish:false});
 const item=`arroz-ops-${tag}`;await seedItem(db,docs.staff,item,`Arroz ${tag}`,'grocery');
 const errors=collectPageErrors(page);
 let claimant:DisposableAccount|undefined,admin:DisposableAccount|undefined;const claimIds:string[]=[];let reviewId='',reportId='';
 try{
  claimant=await createDisposableAccount({prefix:'dir-ops-claim'});admin=await createDisposableAccount({prefix:'dir-ops-admin',admin:true});
  const cc=await browser.newContext({baseURL:origin});await login(cc,claimant);
  // ---- claimant: documents (one JPEG with EXIF → stripped, one PDF) and cédula jurídica (mock Hacienda)
  const docClaim=uid();claimIds.push(docClaim);
  const jpeg=await sharp({create:{width:40,height:30,channels:3,background:'#009fd9'}}).jpeg().withExif({IFD0:{Artist:'PRIVATE_EXIF_CLAIM'}}).toBuffer();
  const up=async(kind:string,name:string,mimeType:string,buffer:Buffer)=>cc.request.post(`/api/lugar/soda-docs-${tag}/reclamo/documentos`,{headers:{Origin:origin},multipart:{claimId:docClaim,kind,file:{name,mimeType,buffer}}});
  const u1=await up('municipal_license','patente.jpg','image/jpeg',jpeg);expect(u1.status()).toBe(200);const p1=(await u1.json()).path as string;
  const u2=await up('health_permit','permiso.pdf','application/pdf',Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n'));expect(u2.status()).toBe(200);const p2=(await u2.json()).path as string;
  expect((await up('other','nota.txt','text/plain',Buffer.from('hola'))).status()).toBe(400);
  const stored=await db.storage.from('dir-claim-documents').download(p1);expect(stored.error).toBeNull();
  expect((await sharp(Buffer.from(await stored.data!.arrayBuffer())).metadata()).exif).toBeUndefined();
  // Another person cannot attach those files.
  const intruder=await createDisposableAccount({prefix:'dir-ops-intruder'});
  try{const ic=await browser.newContext({baseURL:origin});await login(ic,intruder);
   const steal=await postJson(ic,`/api/lugar/soda-docs-${tag}/reclamo`,{actionId:uid(),claimId:docClaim,method:'document_review',documents:[{kind:'municipal_license',path:p1}]});
   expect(steal.status).toBe(400);expect((await postJson(ic,'/api/admin/directorio',{kind:'claim',actionId:uid(),claimId:docClaim,decision:'approve'})).status).toBe(403);
   expect((await ic.request.get('/api/admin/directorio?queue=claims')).status()).toBe(403);
   expect((await ic.request.get(`/api/admin/directorio/documento?path=${encodeURIComponent(p1)}`)).status()).toBe(403);
   await ic.close();}finally{await cleanupDisposableAccount(intruder);}
  const opened=await postJson(cc,`/api/lugar/soda-docs-${tag}/reclamo`,{actionId:uid(),claimId:docClaim,method:'document_review',documents:[{kind:'municipal_license',path:p1},{kind:'health_permit',path:p2}]});
  expect(opened.status,JSON.stringify(opened.body)).toBe(200);expect(opened.body?.status).toBe('open');
  const hz=uid();claimIds.push(hz);
  const mismatch=await postJson(cc,`/api/lugar/prueba-cedula-${tag}/reclamo`,{actionId:uid(),claimId:hz,method:'hacienda_juridica',cedula:'3-101-000001',legalName:'Otra Empresa Distinta'});
  expect([mismatch.status,mismatch.body?.reason]).toEqual([400,'hacienda_mismatch']);
  if(language==='es'){ // language independent; the Hacienda lookup is rate limited per IP (5/min)
   expect((await postJson(cc,`/api/lugar/prueba-cedula-${tag}/reclamo`,{actionId:uid(),claimId:hz,method:'hacienda_juridica',cedula:'3-101-000077',legalName:'X Sociedad'})).body?.reason).toBe('hacienda_not_found');
   expect((await postJson(cc,`/api/lugar/prueba-cedula-${tag}/reclamo`,{actionId:uid(),claimId:hz,method:'hacienda_juridica',cedula:'1-1234-0567',legalName:'X'})).body?.reason).toBe('cedula_invalid');
  }
  const hzOk=await postJson(cc,`/api/lugar/prueba-cedula-${tag}/reclamo`,{actionId:uid(),claimId:hz,method:'hacienda_juridica',cedula:'3-101-000001',legalName:'Comercializadora La Prueba S.A.'});
  expect(hzOk.status,JSON.stringify(hzOk.body)).toBe(200);expect(hzOk.body?.officialName).toBe('Comercializadora La Prueba Sociedad Anónima');
  // ---- public: review flagged by a guest device, price report by the claimant, place report
  const rv=await db.rpc('dir_review_submit',{p_actor:uid(),p_input:{actionId:uid(),reviewId:uid(),slug:`soda-flag-${tag}`,revision:0,rating:1,comment:'Comentario grosero de prueba',authorName:'Autor Prueba'}});
  expect(rv.error).toBeNull();reviewId=(rv.data as {reviewId:string}).reviewId;
  const guest=await browser.newContext({baseURL:origin});
  expect((await postJson(guest,`/api/lugar/soda-flag-${tag}/resenas/reporte`,{flagId:uid(),reviewId,reason:'offensive',message:'Insulta'})).status).toBe(200);await guest.close();
  const price=await postJson(cc,`/api/lugar/super-precio-${tag}/precios/reporte`,{actionId:uid(),itemSlug:item,price:1450,observedOn:new Date(Date.now()-6*3600e3).toLocaleDateString('en-CA',{timeZone:'America/Costa_Rica'})});
  expect(price.status,JSON.stringify(price.body)).toBe(200);expect(price.body).toEqual({status:'pending',confidence:'community'});
  reportId=uid();expect((await postJson(cc,`/api/lugar/soda-error-${tag}/reporte`,{reportId,kind:'wrong_info',message:'El nombre tiene un error: es Soda Error'})).status).toBe(200);
  await cc.close();

  // ---- staff: admin + MFA
  await adminSession(page,context,admin);
  await gotoOK(page,`${prefix}/admin/directorio`);
  const queue=page.locator('[data-admin-directory][data-ready]');await expect(queue).toBeVisible({timeout:60000});
  await expect(page.getByRole('heading',{name:t('Directorio: cola de revisión','Directory: review queue')})).toBeVisible();
  const docCard=page.locator(`[data-admin-dir-item="${docClaim}"]`);await expect(docCard).toBeVisible();
  await expect(docCard.locator('[data-admin-claim-documents] a')).toHaveCount(2);
  const href=await docCard.locator('[data-admin-claim-documents] a').first().getAttribute('href');
  const file=await page.request.get(href!);expect(file.status()).toBe(200);expect(file.headers()['content-type']).toBe('image/jpeg');expect(file.headers()['cache-control']).toContain('no-store');
  const hzCard=page.locator(`[data-admin-dir-item="${hz}"]`);await expect(hzCard.locator('[data-admin-claim-hacienda]')).toContainText('Comercializadora La Prueba Sociedad Anónima');
  await expectNoHorizontalOverflow(page);
  await opsShot(page,`admin-queue-claims-${language}`,info,false);
  // Reject without a reason is refused; with a reason it is recorded.
  await hzCard.getByRole('button',{name:t('Rechazar reclamo','Reject claim')}).click();
  await expect(page.locator('[data-admin-dir-notice="error"]')).toBeVisible();
  await hzCard.getByLabel(t('Motivo (opcional al aprobar)','Reason (optional when approving)')).fill(t('El nombre legal no corresponde al local','The legal name does not match the place'));
  await hzCard.getByRole('button',{name:t('Rechazar reclamo','Reject claim')}).click();
  await expect(page.locator('[data-admin-dir-notice="ok"]')).toBeVisible();await expect(hzCard).toHaveCount(0);
  await docCard.getByRole('button',{name:t('Aprobar reclamo','Approve claim')}).click();
  await expect(page.locator('[data-admin-dir-notice="ok"]')).toBeVisible();await expect(docCard).toHaveCount(0);
  expect((await db.from('dir_places').select('claim_status,verification_level').eq('id',docs.placeId).single()).data).toEqual({claim_status:'claimed',verification_level:'verified'});
  expect((await db.from('dir_place_claims').select('status,decision_reason').eq('id',hz).single()).data?.status).toBe('rejected');
  // Repeating a decision with the same actionId gives the same answer; a decision on a closed claim is a 409.
  const again={kind:'claim',actionId:uid(),claimId:docClaim,decision:'reject',reason:'Duplicado de prueba'};
  expect((await postJson(page,'/api/admin/directorio',again)).status).toBe(409);

  // reviews
  await page.locator('[data-admin-dir-tab="reviews"]').click();
  const rCard=page.locator(`[data-admin-dir-item="${reviewId}"]`);await expect(rCard).toBeVisible({timeout:30000});
  await expect(rCard.locator('[data-admin-review-flags]')).toHaveAttribute('data-admin-review-flags','1');
  await opsShot(page,`admin-queue-reviews-${language}`,info,false);
  await rCard.getByLabel(t('Motivo (obligatorio)','Reason (required)')).fill(t('Lenguaje ofensivo','Offensive language'));
  await rCard.getByRole('button',{name:t('Ocultar reseña','Hide review')}).click();
  await expect(page.locator('[data-admin-dir-notice="ok"]')).toBeVisible();
  const stale=await postJson(page,'/api/admin/directorio',{kind:'review',actionId:uid(),reviewId,target:'review',decision:'hide',reason:'Otra vez',expectedStatus:'published'});
  expect([stale.status,stale.body?.reason]).toEqual([409,'reload']);
  const pub=await page.request.get(`/api/lugar/soda-flag-${tag}/resenas`);expect((await pub.json()).items).toEqual([]);
  expect((await db.from('dir_review_flags').select('status').eq('review_id',reviewId)).data).toEqual([{status:'upheld'}]);

  // prices
  await page.locator('[data-admin-dir-tab="prices"]').click();
  const obs=(await db.from('price_observations').select('id,price_items!inner(slug)').eq('price_items.slug',item).single()).data!;
  const pCard=page.locator(`[data-admin-dir-item="${obs.id}"]`);await expect(pCard).toBeVisible({timeout:30000});
  await pCard.getByRole('button',{name:t('Publicar precio','Publish price')}).click();
  await expect(page.locator('[data-admin-dir-notice="ok"]')).toBeVisible();
  await gotoOK(page,`${prefix}/lugar/super-precio-${tag}`);
  await expect(page.locator(`[data-price-item="${item}"]`)).toContainText(t('Reportado por usuarios · sin confirmar','Reported by users · unconfirmed'));
  await gotoOK(page,`${prefix}/admin/directorio`);await expect(queue).toBeVisible({timeout:60000});

  // place report: fix the name
  await page.locator('[data-admin-dir-tab="reports"]').click();
  const rep=page.locator(`[data-admin-dir-item="${reportId}"]`);await expect(rep).toBeVisible({timeout:30000});
  await rep.getByLabel(t('Nombre','Name'),{exact:true}).fill(`Soda Error ${tag}`);
  await rep.getByLabel(t('Motivo (obligatorio)','Reason (required)')).fill(t('Corrección del nombre según el reporte','Name corrected from the report'));
  await rep.getByRole('button',{name:t('Aplicar decisión','Apply decision')}).click();
  await expect(page.locator('[data-admin-dir-notice="ok"]')).toBeVisible();await expect(rep).toHaveCount(0);
  expect((await db.from('dir_places').select('name').eq('id',reported.placeId).single()).data?.name).toBe(`Soda Error ${tag}`);
  expect((await db.from('dir_reports').select('status').eq('id',reportId).single()).data?.status).toBe('accepted');

  // pharmacy permit → public
  expect((await page.request.get(`${prefix}/lugar/farmacia-permiso-${tag}`)).status()).toBe(404);
  await page.locator('[data-admin-dir-tab="pharmacies"]').click();
  await page.getByLabel(t('Buscar farmacia por nombre o localidad','Search pharmacy by name or locality')).fill(`Permiso ${tag}`);
  await page.getByRole('button',{name:t('Buscar','Search'),exact:true}).click();
  const ph=page.locator(`[data-admin-dir-item="${pharmacy.placeId}"]`);await expect(ph).toBeVisible({timeout:30000});
  await ph.getByLabel(t('Número de permiso sanitario','Health permit number')).fill('MS-0099-2026');
  await ph.getByLabel(t('Referencia de la evidencia','Evidence reference')).fill(t('Permiso sanitario revisado en la consulta pública','Health permit checked in the public registry'));
  await opsShot(page,`admin-queue-pharmacy-${language}`,info,false);
  await ph.getByRole('button',{name:t('Verificar permiso y publicar','Verify permit and publish')}).click();
  await expect(page.locator('[data-admin-dir-notice="ok"]')).toBeVisible();
  expect((await db.from('dir_places').select('status,verification_level').eq('id',pharmacy.placeId).single()).data).toEqual({status:'published',verification_level:'license_verified'});
  expect((await db.from('dir_place_permits').select('permit_number').eq('place_id',pharmacy.placeId)).data).toEqual([{permit_number:'MS-0099-2026'}]);

  // history (immutable audit trail)
  await page.locator('[data-admin-dir-tab="log"]').click();
  await expect(page.locator('[data-admin-directory]')).toContainText(t('Permiso','Permit'));
  const log=(await db.from('dir_moderation_log').select('kind,decision,reason').eq('actor_id',admin.id).order('id')).data!;
  expect(log.map(l=>`${l.kind}:${l.decision}`)).toEqual(['claim:reject','claim:approve','review:hide','price:publish','report:fix','permit:verify_permit']);
  expect(log.filter(l=>!['approve','publish'].includes(l.decision)).every(l=>(l.reason??'').length>=3)).toBe(true);
  await gotoOK(page,`${prefix}/lugar/farmacia-permiso-${tag}`);
  await expect(page.locator('[data-place-verification="license_verified"]')).toBeVisible();
  expect(await visibleHtml(page)).not.toContain('PRIVATE_EXIF_CLAIM');
  expect(errors()).toEqual([]);
 }finally{
  await retireItems(db,docs.staff,[item]);
  if(reviewId){const open=await db.from('dir_review_flags').select('id').eq('review_id',reviewId).eq('status','open');
   if(open.data?.length)await db.rpc('dir_admin_review_moderate',{p_actor:docs.staff,p_input:{actionId:uid(),reviewId,target:'review',decision:'dismiss',reason:'Limpieza E2E: reporte sintético',expectedStatus:'published'}});}
  if(reportId){const rp=await db.from('dir_reports').select('status').eq('id',reportId).maybeSingle();
   if(rp.data?.status==='open')await db.rpc('dir_admin_report_resolve',{p_actor:docs.staff,p_input:{actionId:uid(),reportId,decision:'reject',reason:'Limpieza E2E: reporte sintético'}});}
  for(const claimId of claimIds){ // a failed run must not leave synthetic claims in the staff queue
   const c=await db.from('dir_place_claims').select('status').eq('id',claimId).maybeSingle();
   if(c.data&&['open','code_sent'].includes(c.data.status as string))await db.rpc('dir_admin_claim_decide',{p_actor:docs.staff,p_input:{actionId:uid(),claimId,decision:'reject',reason:'Limpieza E2E: solicitud sintética'}});
  }
  await removeClaimDocuments(db,claimIds);
  await cleanupDisposableAccount(claimant);await cleanupDisposableAccount(admin);
 }
});

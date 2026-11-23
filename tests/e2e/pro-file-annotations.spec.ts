import {test,expect} from 'playwright/test';
import sharp from 'sharp';
import {createDisposableAccount,cleanupDisposableAccount,type DisposableAccount} from './disposable-account';
import {gotoOK,expectNoHorizontalOverflow,collectPageErrors} from './helpers';
import {origin,pdf,proOwner,loginAs} from './pro-file-ops-harness';

// Row 30: pins (normalized coordinate on a photo or a PDF page) and notes as private team comments on job files and on
// library files. Append-only history, idempotent save, never visible to customers. ES/EN, desktop and phone.
const api='/api/pro/file-annotations',lib='/api/pro/company-files',work='/api/pro/work-files';

for(const language of ['es','en'] as const)test(`File annotations: pin, note, immutable history, idempotent [${language}]`,async({page,browser,baseURL})=>{
 test.setTimeout(300000);expect(baseURL).toBe(origin);expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');
 const en=language==='en',errors=collectPageErrors(page);let rival:DisposableAccount|undefined;
 const h=await proOwner(page,'fan');const {db,owner,workId,headers,post}=h;
 try{
  const jpeg=await sharp({create:{width:160,height:100,channels:3,background:'#336699'}}).jpeg().toBuffer();
  const photo=crypto.randomUUID(),plan=crypto.randomUUID(),libPhoto=crypto.randomUUID(),libPdf=crypto.randomUUID();
  await post(work,{action:'upload',workId,fileId:photo,name:'foto.jpg',data:jpeg.toString('base64')});
  await post(work,{action:'upload',workId,fileId:plan,name:'plano.pdf',data:pdf('plano').toString('base64')});
  await post(lib,{action:'upload',actionId:crypto.randomUUID(),fileId:libPhoto,folderId:null,name:'referencia.jpg',data:jpeg.toString('base64')});
  await post(lib,{action:'upload',actionId:crypto.randomUUID(),fileId:libPdf,folderId:null,name:'plantilla.pdf',data:pdf('plantilla').toString('base64')});
  const read=async(q:Record<string,string>,status=200)=>{const r=await page.request.get(api+'?'+new URLSearchParams(q),{headers:{'X-Pro-Expected-Actor':owner.id}});expect(r.status()).toBe(status);return status===200?await r.json():null;};
  const pin=crypto.randomUUID();
  const created=await post(api,{action:'create',actionId:pin,scope:'work',workId,fileId:plan,kind:'pin',page:2,x:0.25,y:0.5,body:'Revisar el nivel de esta pared'});
  expect(created.replayed).toBe(false);expect(created.annotation).toMatchObject({kind:'pin',page:2,x:0.25,y:0.5,scope:'work'});
  expect((await post(api,{action:'create',actionId:pin,scope:'work',workId,fileId:plan,kind:'pin',page:2,x:0.25,y:0.5,body:'Revisar el nivel de esta pared'})).replayed).toBe(true);
  expect((await db.from('pro_file_annotations').select('id').eq('owner_id',owner.id)).data).toHaveLength(1);
  await post(api,{action:'create',actionId:crypto.randomUUID(),scope:'work',workId,fileId:photo,kind:'pin',page:1,x:0.9,y:0.1,body:'Mancha en la esquina'});
  await post(api,{action:'create',actionId:crypto.randomUUID(),scope:'work',workId,fileId:plan,kind:'note',body:'Pendiente de aprobación del cliente'});
  // Validation: out-of-range coordinate, empty and oversized text, unknown field, pin on a note-only format, foreign origin.
  await post(api,{action:'create',actionId:crypto.randomUUID(),scope:'work',workId,fileId:plan,kind:'pin',page:1,x:1.5,y:0.5,body:'x'},400);
  await post(api,{action:'create',actionId:crypto.randomUUID(),scope:'work',workId,fileId:plan,kind:'note',body:'   '},400);
  await post(api,{action:'create',actionId:crypto.randomUUID(),scope:'work',workId,fileId:plan,kind:'note',body:'x'.repeat(1001)},400);
  await post(api,{action:'create',actionId:crypto.randomUUID(),scope:'work',workId,fileId:plan,kind:'note',body:'x',extra:true},400);
  expect((await page.request.post(api,{headers:{...headers,Origin:'http://evil.example'},data:{action:'create',actionId:crypto.randomUUID(),scope:'work',workId,fileId:plan,kind:'note',body:'x'}})).status()).toBe(403);
  const listed=await read({scope:'work',workId,fileId:plan});expect(listed.items).toHaveLength(2);expect(listed.pinnable).toBe(true);
  // The history is immutable: no update or delete even for the service role through the trigger.
  expect((await db.from('pro_file_annotations').update({body:'cambio'}).eq('owner_id',owner.id)).error).not.toBeNull();
  expect((await db.from('pro_file_annotations').delete().eq('owner_id',owner.id)).error).not.toBeNull();
  // Another account reads and writes nothing.
  rival=await createDisposableAccount({prefix:'fan-rival'});const other=await browser.newContext();await loginAs(other,rival);
  const foreignHeaders={Origin:origin,'X-Pro-Expected-Actor':rival.id};
  expect((await other.request.get(origin+api+'?'+new URLSearchParams({scope:'work',workId,fileId:plan}),{headers:foreignHeaders})).status()).toBeGreaterThanOrEqual(403);
  expect((await other.request.post(origin+api,{headers:foreignHeaders,data:{action:'create',actionId:crypto.randomUUID(),scope:'work',workId,fileId:plan,kind:'note',body:'intruso'}})).status()).toBeGreaterThanOrEqual(400);await other.close();
  // Library: note and pin, and an annotated file is "in use" (cannot be deleted permanently).
  await post(api,{action:'create',actionId:crypto.randomUUID(),scope:'company',fileId:libPdf,kind:'note',body:'Plantilla vigente 2026'});
  await post(api,{action:'create',actionId:crypto.randomUUID(),scope:'company',fileId:libPhoto,kind:'pin',page:1,x:0.5,y:0.5,body:'Detalle de acabado'});
  await post(api,{action:'create',actionId:crypto.randomUUID(),scope:'company',workId,fileId:libPdf,kind:'note',body:'x'},400);
  // No notifications and nothing shared.
  for(const table of ['notifications','notification_push_outbox'])expect((await db.from(table).select('id').eq('user_id',owner.id).throwOnError()).data).toEqual([]);

  // ---- UI: library photo, drop a pin, save, see it in the history; then a note on the PDF ----
  await gotoOK(page,`/${language}/dashboard/pro?tab=pro_files`);const library=page.locator('[data-company-files]');
  await library.locator(`[data-company-file="${libPhoto}"] [data-annotate-open]`).click({timeout:60000});
  const dialog=page.getByRole('dialog',{name:en?'Annotations':'Anotaciones'});const surface=dialog.locator('[data-annotation-surface]');await expect(surface).toBeVisible({timeout:60000});
  await expect(dialog.locator('[data-annotation-item="pin"]')).toHaveCount(1);
  await surface.click({position:{x:40,y:25}});await expect(dialog.locator('[data-annotation-draft]')).toBeVisible();
  await dialog.locator('[data-annotation-text]').fill(en?'Check the grout here':'Revisar la lechada aquí');await dialog.locator('[data-annotation-save]').click();
  await expect(dialog.getByRole('status').filter({hasText:en?'Annotation saved. Only your team sees it.':'Anotación guardada. Solo la ve su equipo.'})).toBeVisible({timeout:60000});
  await expect(dialog.locator('[data-annotation-item="pin"]')).toHaveCount(2);await expect(dialog.locator('[data-annotation-pin]')).toHaveCount(2);
  const saved=(await db.from('pro_file_annotations').select('x,y,page').eq('owner_id',owner.id).eq('company_file_id',libPhoto).order('created_at',{ascending:false}).limit(1).single().throwOnError()).data!;
  expect(saved.page).toBe(1);expect(Number(saved.x)).toBeGreaterThan(0);expect(Number(saved.x)).toBeLessThan(1);expect(Number(saved.y)).toBeGreaterThan(0);expect(Number(saved.y)).toBeLessThan(1);
  await expectNoHorizontalOverflow(page);await dialog.getByRole('button',{name:en?'Close':'Cerrar'}).last().click();
  await library.locator(`[data-company-file="${libPdf}"] [data-annotate-open]`).click();
  const pdfDialog=page.getByRole('dialog',{name:en?'Annotations':'Anotaciones'});await expect(pdfDialog.locator('[data-annotation-item="note"]')).toHaveCount(1,{timeout:60000});
  await pdfDialog.locator('[data-annotation-text]').fill(en?'Second note':'Segunda nota');await pdfDialog.locator('[data-annotation-save]').click();
  await expect(pdfDialog.locator('[data-annotation-item="note"]')).toHaveCount(2,{timeout:60000});
  await expectNoHorizontalOverflow(page);
  expect(errors().filter(message=>!/pdf|canvas/i.test(message))).toEqual([]);
 }finally{await page.goto('about:blank').catch(()=>{});if(rival)await cleanupDisposableAccount(rival);await h.cleanup();}
});

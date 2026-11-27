import {test,expect,type Page} from 'playwright/test';
import sharp from 'sharp';
import {collectPageErrors,expectNoHorizontalOverflow,gotoOK} from './helpers';
import {local,login,origin,ownerFixture} from './pro-round2-fixture';
import {createDisposableAccount,cleanupDisposableAccount,type DisposableAccount} from './disposable-account';
import {openPlaceTab, claimByEmail,hideSeededPlaces,label,seedPlace,uid} from './pro-dir-fixture';
import {featureShots,randomIp} from './pro-dir-features-fixture';

// Launch round (LOCAL, 2026-11-18): place photo uploads. The owner of a claimed place uploads a photo with «Agregar fotos»
// (custom Spanish picker, no native English file text) → published at once; a signed-in customer uploads one → «pendiente
// de revisión», not public (the photo route answers 404); staff approve it (dir_admin_photo_moderate, logged) → the gallery
// shows both, the lightbox opens/arrows/closes with ESC (focus back), alt text from the caption or place name; ES/EN, 390/1440.
// Owner of /api/lugar/[slug]/fotos, /api/fotos-lugar/[id] and the photo components. Storage = local Supabase only.
test.afterEach(()=>hideSeededPlaces());
const jpeg=(color:string)=>sharp({create:{width:1200,height:900,channels:3,background:color}})
 .withExif({IFD0:{Make:'E2E'},IFD3:{GPSLatitudeRef:'N',GPSLatitude:'9/1 56/1 0/1'}}).jpeg().toBuffer();
async function upload(page:Page,file:{name:string;buffer:Buffer},caption?:string){
 // Phones (owner 2026-11-26): «Agregar fotos» lives in the bar's «…» sheet; from lg it sits in the chip row.
 if((page.viewportSize()?.width??1280)<1024)await expect(async()=>{await page.locator('[data-ccr-section-menu]').filter({visible:true}).first().click();await expect(page.locator('[data-place-more-menu]')).toBeVisible({timeout:1500});}).toPass({timeout:20000});
 await page.locator('[data-place-photo-open][data-ready]').filter({visible:true}).click();
 const panel=page.locator('[data-place-photo-panel]');
 await expect(panel.locator('[data-photo-choose]')).toHaveText('Elegir fotos');
 await panel.locator('[data-photo-input]').setInputFiles({name:file.name,mimeType:'image/jpeg',buffer:file.buffer});
 await expect(panel).toContainText('1 foto elegida');
 if(caption)await panel.getByLabel('Descripción (opcional)').fill(caption);
 await panel.locator('[data-place-photo-submit]').click();
 await expect(page.locator('[data-place-photo-result]')).toBeVisible({timeout:45000});
}

test('place photos: owner publishes, customer pending → staff approves → visible; gallery + lightbox',async({page,context,browser},info)=>{
 test.setTimeout(300000);local(info.project.use.baseURL);
 const tag=label(),f=await ownerFixture(context,'ph-'+tag),db=f.db,slug=`soda-fotos-${tag}`,name=`Soda Fotos ${tag}`,errors=collectPageErrors(page);
 let customer:DisposableAccount|undefined;
 try{
  const {placeId}=await seedPlace(db,{slug,vertical:'restaurant',name});
  await claimByEmail(context,slug);await context.setExtraHTTPHeaders(randomIp());
  // Owner: «Agregar fotos» → published at once.
  await gotoOK(page,`/lugar/${slug}`);
  // 2026-11-26 (identity card like the professional profile): no photos → the round avatar is the section tile, never a stock photo.
  await expect(page.locator('[data-place-header] [data-place-avatar="section"] [data-hero-tile]')).toHaveCount(1);await expect(page.locator('[data-place-photo-strip]')).toHaveCount(0);
  await upload(page,{name:'terraza.jpg',buffer:await jpeg('#2a9d8f')},'Terraza al atardecer');
  await expect(page.locator('[data-place-photo-result]')).toContainText('Se publicó 1 foto');
  await expectNoHorizontalOverflow(page);
  const rows=async()=>(await db.from('dir_place_media').select('id,status,origin,sha256,path_800').eq('place_id',placeId).order('created_at')).data!;
  const [own]=await rows();expect([own!.status,own!.origin]).toEqual(['active','owner']);
  // The stored variant has no EXIF/GPS.
  const stored=await db.storage.from('dir-place-photos').download(own!.path_800 as string);expect(stored.error).toBeNull();
  expect((await sharp(Buffer.from(await stored.data!.arrayBuffer())).metadata()).exif).toBeUndefined();

  // Customer: pending until approved.
  customer=await createDisposableAccount({prefix:'dir-photo-user'});
  const c=await browser.newContext({baseURL:origin,extraHTTPHeaders:randomIp()});
  try{
   await login(c,customer);const p=await c.newPage();
   await gotoOK(p,`/lugar/${slug}`);
   await upload(p,{name:'casado.jpg',buffer:await jpeg('#e76f51')});
   await expect(p.locator('[data-place-photo-pending]')).toContainText('pendiente de revisión');
   // Same image again → duplicate.
   await p.locator('[data-place-photo-panel] [data-photo-input]').setInputFiles({name:'casado.jpg',mimeType:'image/jpeg',buffer:await jpeg('#e76f51')});
   await p.locator('[data-place-photo-submit]').click();
   await expect(p.locator('[data-place-photo-result]')).toContainText('Esa foto ya está en este lugar');
  }finally{await c.close();}
  const userRow=(await rows()).find(r=>r.origin==='user')!;expect(userRow.status).toBe('pending');
  const anon=await browser.newContext({baseURL:origin});const a=await anon.newPage();const aErrors=collectPageErrors(a);
  try{
   expect((await a.request.get(`/api/fotos-lugar/${userRow.id}?s=320`)).status()).toBe(404);
   await gotoOK(a,`/lugar/${slug}`);await expect(a.locator('[data-place-photo-thumb]')).toHaveCount(1);await expect(a.locator('[data-place-strip-thumb]')).toHaveCount(1);

   // Staff approve (the admin queue lists it as pending) → visible.
   const queue=(await db.rpc('dir_admin_photo_queue',{p_filter:'pending',p_limit:200})).data as {id:string;slug:string}[];
   expect(queue.some(q=>q.id===userRow.id&&q.slug===slug)).toBe(true);
   const ok=await db.rpc('dir_admin_photo_moderate',{p_actor:uid(),p_input:{actionId:uid(),mediaId:userRow.id,decision:'approve',expectedStatus:'pending'}});
   expect(ok.error).toBeNull();
   expect((await db.from('dir_moderation_log').select('kind,decision').eq('target_id',userRow.id)).data).toEqual([{kind:'photo',decision:'approve'}]);
   const img=await a.request.get(`/api/fotos-lugar/${userRow.id}?s=320`);expect(img.status()).toBe(200);expect(img.headers()['content-type']).toBe('image/webp');

   for(const language of ['es','en'] as const){
    const prefix=language==='en'?'/en':'';
    await gotoOK(a,`${prefix}/lugar/${slug}`);await openPlaceTab(a,'photos');
    const thumbs=a.locator('[data-place-photo-thumb]');await expect(thumbs).toHaveCount(2);
    await expect(a.locator('[data-hero-tile]')).toHaveCount(0);
    const alts=await a.locator('[data-place-gallery] img').evaluateAll(n=>n.map(i=>(i as HTMLImageElement).alt));
    expect(alts.sort()).toEqual(['Terraza al atardecer',language==='en'?`Photo 2 of ${name}`:`Foto 2 de ${name}`].sort());
    await expect.poll(()=>a.locator('[data-place-gallery] img').evaluateAll(n=>n.every(i=>(i as HTMLImageElement).naturalWidth>0))).toBe(true);
    await featureShots(a,`photos-${language}`,info);
    await expect(a.locator('[data-place-gallery][data-ready]')).toBeVisible();await thumbs.first().click();
    const box=a.locator('[data-place-lightbox]');await expect(box).toBeVisible();await expect(box).toContainText('1 / 2');
    await a.keyboard.press('ArrowRight');await expect(box).toContainText('2 / 2');
    await expect(box.locator('[data-photo-report]')).toBeVisible();
    await featureShots(a,`photos-lightbox-${language}`,info,{fullPage:false});
    await a.keyboard.press('Escape');await expect(box).toHaveCount(0);
    await expect(thumbs.first()).toBeFocused();
    await expectNoHorizontalOverflow(a);
   }
   expect(aErrors()).toEqual([]);
  }finally{await anon.close();}
  expect(errors()).toEqual([]);
 }finally{await cleanupDisposableAccount(customer);await f.cleanup();}
});

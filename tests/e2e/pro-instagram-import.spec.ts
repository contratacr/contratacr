import {test,expect,type BrowserContext,type Page} from 'playwright/test';
import {mkdirSync} from 'node:fs';
import {collectPageErrors,expectNoHorizontalOverflow,gotoOK} from './helpers';
import {local,ownerFixture} from './pro-round2-fixture';
import {claimByEmail,hideSeededPlaces,label,seedPlace} from './pro-dir-fixture';

// "Importar desde Instagram" (2026-11-27, docs/instagram-import.md), SANDBOX adapter of `next dev` (no Meta app exists):
// the owner of a claimed place connects in the fake Instagram window, sees the account's photos (no video), imports 3 →
// published at once through the place photo pipeline with provenance; reopening marks them "Ya importada" and a repeat
// import is skipped; «Desconectar Instagram» deletes the token. A professional imports 2 photos into a success case (cap =
// free slots of the case). 390×844. Screens → tmp/instagram/ when INSTAGRAM_SHOTS=1.
test.afterEach(()=>hideSeededPlaces());
test.use({viewport:{width:390,height:844}});
const shots=process.env.INSTAGRAM_SHOTS==='1'?'tmp/instagram':null;
const shot=async(page:Page,name:string)=>{if(!shots)return;mkdirSync(shots,{recursive:true});await page.screenshot({path:`${shots}/${name}.png`});};

/**
 * The shared `next dev` (other people edit files while this runs) pushes rebuilds over its HMR socket, and a rebuild of a
 * module on this page reloads it, which would drop the open sheet. The socket stays connected (hydration needs it), but
 * rebuild/reload notices after the first sync are not passed to the page. A production build has no such socket.
 */
async function quietDevReloads(context:BrowserContext){
 await context.routeWebSocket(/\/_next\/(webpack-)?hmr/,ws=>{
  const server=ws.connectToServer();let synced=false;
  server.onMessage(m=>{let type='';try{type=String(JSON.parse(String(m)).type??'');}catch{}
   if(type==='sync'){if(synced)return;synced=true;}
   if(['building','built','serverComponentChanges','reloadPage','serverOnlyChanges','addedPage','removedPage','devPagesManifestUpdate'].includes(type))return;
   ws.send(m);});
  ws.onMessage(m=>server.send(m));
 });
}
/** `next dev` compiles a route on its first request: compile them all before any UI. */
async function warm(page:Page){
 await quietDevReloads(page.context());
 for(const path of ['/api/integrations/instagram/connection','/api/integrations/instagram/media?target=portfolio','/api/integrations/instagram/media/sbx_1001',
  '/api/integrations/instagram/import','/api/integrations/instagram/callback','/integraciones/instagram/sandbox?state=x','/integraciones/instagram/listo'])
  await page.request.get(path,{timeout:120000,maxRedirects:0}).catch(()=>null);
}

async function connectInPopup(page:Page,sheet:ReturnType<Page['locator']>){
 await expect(sheet.locator('[data-instagram-connect]')).toContainText('Conectar su cuenta de Instagram (Empresa o Creador)');
 const popupP=page.waitForEvent('popup');
 await sheet.locator('[data-instagram-connect-start]').click();
 const popup=await popupP;await popup.setViewportSize({width:390,height:844});
 await expect(popup.locator('[data-instagram-sandbox]')).toBeVisible({timeout:120000});
 await shot(popup,'03-conexion-sandbox');
 await popup.locator('[data-instagram-sandbox-allow]').click();
 await expect(sheet.locator('[data-instagram-grid]')).toBeVisible({timeout:120000});
}

test('instagram import (sandbox): place owner connects, imports 3, repeat skipped, disconnect',async({page,context},info)=>{
 test.setTimeout(600000);local(info.project.use.baseURL);
 const tag=label(),f=await ownerFixture(context,'ig-'+tag),db=f.db,slug=`soda-instagram-${tag}`,errors=collectPageErrors(page);
 try{
  const {placeId}=await seedPlace(db,{slug,vertical:'restaurant',name:`Soda Instagram ${tag}`});
  await claimByEmail(context,slug);
  await warm(page);
  await gotoOK(page,`/lugar/${slug}`);
  // Phones: «Agregar fotos» lives in the «…» sheet of the place page, which opens the panel with this window event
  // (place-ficha-menu.tsx PHOTO_OPEN); the event is used directly so this spec does not depend on that menu's layout.
  const open=page.locator('[data-place-photo-panel] [data-instagram-import-open]');
  const sheet=page.locator('[data-instagram-import-sheet]');
  await expect(async()=>{await page.evaluate(()=>window.dispatchEvent(new Event('ccr:place-photo-open')));
   await expect(open).toBeVisible({timeout:1500});}).toPass({timeout:120000});
  await expect(open).toHaveText('Importar desde Instagram');
  await shot(page,'01-boton');
  await open.click();
  await expect(sheet.locator('[data-instagram-connect]')).toBeVisible({timeout:120000});
  await shot(page,'02-conectar');
  await connectInPopup(page,sheet);
  // Token stored server-side only; the browser never receives it.
  const conn=(await db.from('instagram_connections').select('provider,username,access_token').eq('user_id',f.owner.id).single()).data!;
  expect(conn.provider).toBe('sandbox');
  const status=await page.request.get('/api/integrations/instagram/connection');expect(JSON.stringify(await status.json())).not.toContain(conn.access_token);
  const items=sheet.locator('[data-instagram-item]');
  await expect(items).toHaveCount(8);await expect(sheet.locator('[data-instagram-item="sbx_1004"]')).toHaveCount(0); // the video
  await expect(sheet).toContainText('Elija hasta 10 fotos.');
  await expect(async()=>{for(const img of await sheet.locator('[data-instagram-item] img').all())expect(await img.evaluate(i=>(i as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);}).toPass({timeout:90000});
  const ids=['sbx_1001','sbx_1003','sbx_1005'];
  for(const id of ids)await sheet.locator(`[data-instagram-item="${id}"]`).click();
  await expect(sheet.locator('[data-instagram-picked]')).toHaveText('3 de 10 elegidas.');
  await expect(page.locator('[data-instagram-import-submit]')).toBeDisabled();
  await sheet.locator('[data-instagram-rights] input').check();
  await shot(page,'04-cuadricula');
  await page.locator('[data-instagram-import-submit]').click();
  await expect(sheet.locator('[data-instagram-added]')).toHaveText('Se agregaron 3 fotos.',{timeout:180000});
  await expectNoHorizontalOverflow(page);
  await shot(page,'05-resultado');
  const media=(await db.from('dir_place_media').select('id,status,origin').eq('place_id',placeId)).data!;
  expect(media.map(m=>[m.status,m.origin])).toEqual([['active','owner'],['active','owner'],['active','owner']]);
  const log=(await db.from('instagram_media_imports').select('media_id,permalink,result_ref,target_kind,target_id').eq('user_id',f.owner.id).order('media_id')).data!;
  expect(log.map(r=>r.media_id)).toEqual(ids);
  expect(log.every(r=>r.target_kind==='place'&&r.target_id===placeId&&r.permalink?.startsWith('https://www.instagram.com/p/')&&media.some(m=>m.id===r.result_ref))).toBe(true);

  // Reopen: the three are marked and cannot be chosen; a repeat import of one of them is skipped (nothing stored).
  await page.getByRole('button',{name:'Listo'}).click();
  await open.click();
  await expect(sheet.locator('[data-instagram-item="sbx_1001"]')).toBeDisabled({timeout:90000});
  await expect(sheet.locator('[data-instagram-item="sbx_1001"]')).toContainText('Ya importada');
  const again=await page.evaluate(async slug=>{const fd=new FormData();fd.set('target','place');fd.set('slug',slug);fd.set('mediaId','sbx_1001');fd.set('rights','1');
   const r=await fetch('/api/integrations/instagram/import',{method:'POST',body:fd});return{status:r.status,json:await r.json()};},slug);
  expect(again).toEqual({status:200,json:{status:'skipped',mediaId:'sbx_1001'}});
  expect((await db.from('dir_place_media').select('id').eq('place_id',placeId)).data).toHaveLength(3);
  // A video id, or another account's id, is refused.
  const video=await page.evaluate(async slug=>{const fd=new FormData();fd.set('target','place');fd.set('slug',slug);fd.set('mediaId','sbx_1004');fd.set('rights','1');return(await fetch('/api/integrations/instagram/import',{method:'POST',body:fd})).status;},slug);
  expect(video).toBe(404);

  // Disconnect: the token row is deleted and the sheet asks to connect again.
  await sheet.locator('[data-instagram-disconnect]').click();
  await expect(sheet.locator('[data-instagram-connect]')).toBeVisible();
  expect((await db.from('instagram_connections').select('user_id').eq('user_id',f.owner.id)).data).toEqual([]);
  expect(errors().filter(e=>!/ChunkLoadError/.test(e))).toEqual([]); // a dev chunk reload is not an app error
 }finally{await f.cleanup();}
});

test('instagram import (sandbox): professional adds photos to a success case (up to its free slots)',async({page,context},info)=>{
 test.setTimeout(600000);local(info.project.use.baseURL);
 const tag=label(),f=await ownerFixture(context,'igp-'+tag),db=f.db;
 try{
  await warm(page);
  await gotoOK(page,'/dashboard/profesional?tab=photos&mode=offer');
  const add=page.getByRole('button',{name:/Agregar.*caso de .xito/i}).filter({visible:true}).first();
  const dialog=page.getByRole('dialog').filter({hasText:/Nuevo caso de .xito/i});
  const sheet=page.locator('[data-instagram-import-sheet]');
  await expect(add).toBeVisible({timeout:120000});
  // `next dev` may reload the page once while it compiles the sheet's chunk: start again until the sheet stays.
  await expect(async()=>{
   if(!await dialog.isVisible()){await add.click({timeout:30000});await expect(dialog).toBeVisible({timeout:30000});}
   await dialog.locator('[data-instagram-import-open]').click({timeout:30000});
   await expect(sheet.locator('[data-instagram-connect]')).toBeVisible({timeout:120000});
  }).toPass({timeout:300000});
  await connectInPopup(page,sheet);
  // A new case has CASE_PHOTOS_PER_CASE (5) free slots: the cap of this import.
  await expect(sheet).toContainText('Elija hasta 5 fotos.');
  for(const id of ['sbx_1002','sbx_1006','sbx_1007','sbx_1008','sbx_1009'])await sheet.locator(`[data-instagram-item="${id}"]`).click();
  await expect(sheet.locator('[data-instagram-picked]')).toHaveText('5 de 5 elegidas.');
  await expect(sheet.locator('[data-instagram-item="sbx_1001"]')).toBeDisabled();
  for(const id of ['sbx_1007','sbx_1008','sbx_1009'])await sheet.locator(`[data-instagram-item="${id}"]`).click();
  await expect(sheet.locator('[data-instagram-picked]')).toHaveText('2 de 5 elegidas.');
  await sheet.locator('[data-instagram-rights] input').check();
  await page.locator('[data-instagram-import-submit]').click();
  await expect(sheet.locator('[data-instagram-added]')).toHaveText('Se agregaron 2 fotos.',{timeout:180000});
  await page.getByRole('button',{name:'Listo'}).click();
  await expect(dialog.locator('img')).toHaveCount(2,{timeout:20000});
  await shot(page,'06-caso-de-exito');
  await dialog.locator('input[maxlength="80"]').fill('Remodelación de cocina '+tag);
  await dialog.getByRole('button',{name:/^Guardar$/i}).click();
  await expect(dialog).toBeHidden();
  const pro=(await db.from('professionals').select('id,portfolio_items').eq('profile_id',f.owner.id).single()).data!;
  const log=(await db.from('instagram_media_imports').select('media_id,result_ref,target_kind').eq('user_id',f.owner.id).order('media_id')).data!;
  expect(log.map(r=>[r.media_id,r.target_kind])).toEqual([['sbx_1002','portfolio'],['sbx_1006','portfolio']]);
  expect(JSON.stringify(pro.portfolio_items)).toContain(log[0]!.result_ref);
  // Saved now → the server reports them as imported, and a repeat import is skipped.
  const list=await page.request.get('/api/integrations/instagram/media?target=portfolio');
  const items=(await list.json()).items as {id:string;imported:boolean}[];
  expect(items.filter(i=>i.imported).map(i=>i.id).sort()).toEqual(['sbx_1002','sbx_1006']);
 }finally{await f.cleanup();}
});

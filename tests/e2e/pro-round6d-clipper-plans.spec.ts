import {test,expect,type Page} from 'playwright/test';
import {mkdirSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {collectPageErrors,gotoOK,expectNoHorizontalOverflow} from './helpers';
import {ownerFixture,local,headersFor,origin} from './pro-round2-fixture';

// Round 6D (rows 60/64/65): «Agregar desde enlace» in My items (mock reader: fixture page parsed with the real
// OG/schema.org parser, robots.txt respected, owner reviews before saving with the catalog writer, extension
// hand-off ?clip= only prefills) and the floor plan editor of a job (rectangular room + drawn wall + door,
// area/perimeter, save with DB summary, 3D view, PNG/PDF export, areas sent to Measurements through the takeoff
// writer, scan import OBJ + USDZ simulated). Loopback only.
const shots=process.env.ROUND6D_SHOTS_DIR;
async function shot(page:Page,name:string,project:string,fullPage=false){if(!shots)return;mkdirSync(shots,{recursive:true});await page.screenshot({path:join(shots,`${name}-${project}.png`),fullPage});}
async function clickPlan(page:Page,x:number,y:number){
 await page.locator('[data-floor-canvas]').scrollIntoViewIfNeeded();
 const point=await page.locator('[data-floor-canvas]').evaluate((svg,[px,py])=>{const s=svg as SVGSVGElement,p=s.createSVGPoint();p.x=px!;p.y=py!;const m=s.getScreenCTM()!;const q=p.matrixTransform(m);return {x:q.x,y:q.y};},[x,y]);
 // Phones (WebKit mobile, touch) tap; desktop clicks. Both reach the editor as pointer events.
 if((page.viewportSize()?.width??1366)<640)await page.touchscreen.tap(point.x,point.y);else await page.mouse.click(point.x,point.y);
}
for(const language of ['es','en'] as const)test(`Round 6D: product clipper and floor plans with 3D, export, takeoffs and scan import [${language}]`,async({page},info)=>{
 test.setTimeout(480000);local(info.project.use.baseURL);const en=language==='en',project=info.project.name,label=language+crypto.randomUUID().slice(0,6),t=(es:string,english:string)=>en?english:es;
 const tomorrow=new Date(Date.now()+30*3600000).toISOString().slice(0,10);
 const f=await ownerFixture(page.context(),label,document=>{document.work[0]={...document.work[0]!,stage:'scheduled',start:tomorrow+'T09:00:00-06:00',end:tomorrow+'T11:00:00-06:00'};});
 try{
  const errors=collectPageErrors(page),h=headersFor(f.owner);
  // ---- (1) Product clipper
  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_company',empresa:'articulos'}));
  await page.locator('[data-clipper-open]').click({timeout:90000});const clipper=page.locator('[data-clipper]');
  await clipper.locator('[data-clipper-url]').fill('https://bloqueado.example/p/1');await clipper.locator('[data-clipper-read]').click();
  await expect(clipper.locator('[data-clipper-error]')).toContainText('robots.txt',{timeout:60000});
  await clipper.locator('[data-clipper-url]').fill('https://ferreteria.example/porcelanato-gris-60x60');await clipper.locator('[data-clipper-read]').click();
  const review=clipper.locator('[data-clipper-review]');await expect(review).toBeVisible({timeout:60000});await expect(review.locator('[data-simulated]')).toBeVisible();
  await expect(review.locator('[data-clipper-field="name"]')).toHaveValue('Porcelanato gris mate 60×60 cm (caja 1,44 m²)');await expect(review.locator('[data-clipper-field="cost"]')).toHaveValue('18900');await expect(review.locator('[data-clipper-store-price]')).toContainText(en?'18,900':'18.900');
  expect((await f.db.from('pro_products').select('id').eq('user_id',f.owner.id)).data).toEqual([]);// nothing saved yet
  await review.locator('[data-clipper-field="price"]').fill('25000');await review.locator('[data-clipper-field="sku"]').fill('POR-'+label);
  await expectNoHorizontalOverflow(page);await shot(page,`r6d-clipper-review-${language}`,project);
  await review.locator('[data-clipper-save]').click();await expect(clipper.locator('[data-clipper-notice]')).toContainText(t('guardado','saved'),{timeout:60000});
  const product=(await f.db.from('pro_products').select('id,name,price,cost,sku').eq('user_id',f.owner.id).single().throwOnError()).data!;
  expect({price:Number(product.price),cost:Number(product.cost),sku:product.sku}).toEqual({price:25000,cost:18900,sku:'POR-'+label});
  await expect.poll(async()=>(await f.db.from('pro_catalog_clips').select('status,product_id').eq('owner_id',f.owner.id).eq('status','saved')).data?.[0]?.product_id,{timeout:30000}).toBe(product.id);
  const bad=await page.request.post(origin+'/api/pro/catalog-clipper',{headers:h,data:{action:'read',actionId:crypto.randomUUID(),id:crypto.randomUUID(),url:'http://127.0.0.1/x',source:'app'}});expect(bad.status()).toBe(400);
  // Extension hand-off: the link is prefilled, nothing is read until the owner presses «Leer enlace».
  const before=(await f.db.from('pro_catalog_clips').select('id').eq('owner_id',f.owner.id)).data!.length;
  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_company',empresa:'articulos',clip:'https://tienda.example/lampara-usd'}));
  await expect(page.locator('[data-clipper-url]')).toHaveValue('https://tienda.example/lampara-usd',{timeout:90000});await expect(page).not.toHaveURL(/clip=/);
  expect((await f.db.from('pro_catalog_clips').select('id').eq('owner_id',f.owner.id)).data!.length).toBe(before);

  // ---- (2) Floor plan in the job's Measurements
  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_agenda',cita:f.workId,vistaTrabajo:'takeoffs'}));
  const plans=page.locator('[data-floor-plans]');await expect(plans).toBeVisible({timeout:90000});await plans.scrollIntoViewIfNeeded();
  await plans.locator('[data-floor-new]').click();await plans.locator('[data-floor-name]').fill(t('Planta baja','Ground floor'));
  // Post-security fixes: the wall height uses the interface's decimal separator (2,4 in Spanish); typing either separator works.
  const height=plans.locator('[data-floor-height]');await expect(height).toHaveValue(t('2,4','2.4'));await height.fill(t('2,7','2.7'));await height.blur();await expect(height).toHaveValue(t('2,7','2.7'));await height.fill('2.4');await height.blur();await expect(height).toHaveValue(t('2,4','2.4'));
  await plans.locator('[data-floor-rect="name"]').fill(t('Cocina','Kitchen'));await plans.locator('[data-floor-rect="width"]').fill('4');await plans.locator('[data-floor-rect="depth"]').fill('3');await plans.locator('[data-floor-rect-add]').click();
  const kitchen=plans.locator(`[data-floor-room-summary="${t('Cocina','Kitchen')}"]`);await expect(kitchen.locator('[data-floor-area]')).toHaveText('12 m²');await expect(kitchen.locator('[data-floor-perimeter]')).toHaveText('14 m');
  // Draw one more wall (two taps) and put a door on the first wall of the kitchen.
  await plans.locator('[data-floor-tool="wall"]').click();await clickPlan(page,4,0);await clickPlan(page,7,0);await plans.getByRole('button',{name:t('Terminar','Finish')}).click();
  await expect(plans.locator('[data-floor-wall]')).toHaveCount(5);
  await plans.locator('[data-floor-tool="door"]').click();await clickPlan(page,2,0);await expect(plans.locator('[data-floor-opening="door"]')).toHaveCount(1);
  await plans.locator('[data-floor-tool="dimension"]').click();await clickPlan(page,0,-0.5);await clickPlan(page,4,-0.5);await expect(plans.locator('[data-floor-dimension]')).toHaveCount(1);
  await plans.locator('[data-floor-save]').click();await expect(plans.locator('[data-floor-notice]')).toContainText(t('Plano creado','Plan created'),{timeout:60000});
  const saved=(await f.db.from('pro_floor_plans').select('id,summary,revision').eq('owner_id',f.owner.id).single().throwOnError()).data!;
  expect(saved.summary).toMatchObject({totalArea:12,wallLength:17,doors:1,windows:0});
  await expectNoHorizontalOverflow(page);await plans.scrollIntoViewIfNeeded();await shot(page,`r6d-floor-2d-${language}`,project);
  // 3D view
  await plans.locator('[data-floor-3d]').click();await expect(plans.locator('[data-floor-3d-canvas]')).toBeVisible();
  await plans.getByRole('button',{name:t('Girar a la derecha','Rotate right')}).click();await shot(page,`r6d-floor-3d-${language}`,project);
  await plans.locator('[data-floor-3d]').click();await expect(plans.locator('[data-floor-canvas]')).toBeVisible();
  // Exports
  const [pdf]=await Promise.all([page.waitForEvent('download'),plans.locator('[data-floor-pdf]').click()]);expect(pdf.suggestedFilename()).toMatch(/\.pdf$/);
  expect(readFileSync((await pdf.path())!).subarray(0,8).toString('latin1')).toBe('%PDF-1.4');
  const [png]=await Promise.all([page.waitForEvent('download'),plans.locator('[data-floor-png]').click()]);expect(png.suggestedFilename()).toMatch(/\.png$/);
  expect(readFileSync((await png.path())!).subarray(1,4).toString('latin1')).toBe('PNG');
  // Areas → Measurements (existing takeoff writer) and the link recorded on the plan.
  await plans.locator('[data-floor-send]').click();await expect(plans.locator('[data-floor-notice]')).toContainText(t('enviada','sent'),{timeout:90000});
  const measurement=(await f.db.from('pro_work_takeoff_measurements').select('id,name,kind,manual_milli').eq('owner_id',f.owner.id).single().throwOnError()).data!;
  expect(measurement).toMatchObject({name:t('Cocina','Kitchen'),kind:'area',manual_milli:12000});
  expect(((await f.db.from('pro_floor_plans').select('takeoff_link').eq('id',saved.id).single()).data!.takeoff_link as {measurements:{measurementId:string}[]}).measurements[0]!.measurementId).toBe(measurement.id);
  await expect(page.locator('[data-takeoffs]')).toContainText(t('Plano: Planta baja','Plan: Ground floor'),{timeout:60000});// the takeoff list refreshed (event from the plan editor)
  // Area E: convert the sent areas into a draft quote (existing takeoff send_estimate writer).
  await plans.locator('[data-floor-estimate]').click();await expect(plans.locator('[data-floor-notice]')).toContainText(t('cotización en borrador','draft quote'),{timeout:90000});
  // CAS: a stale save is refused.
  expect((await page.request.post(origin+'/api/pro/floor-plans',{headers:h,data:{action:'archive',actionId:crypto.randomUUID(),id:saved.id,revision:1}})).status()).toBe(409);
  // ---- (3) Scan import: OBJ (local parser) and USDZ (simulated parser)
  const obj=['v 0 0 0','v 5 0 0','v 5 0 4','v 0 0 4','v 0 2.6 0','v 5 2.6 0','v 5 2.6 4','v 0 2.6 4'].join('\n');
  await plans.locator('[data-floor-scan-input]').setInputFiles({name:'sala.obj',mimeType:'model/obj',buffer:Buffer.from(obj)});
  // Row 65: the dimensions are read and shown BEFORE importing; only then the plan is created.
  await expect(plans.locator('[data-floor-scan-measures]')).toContainText('5',{timeout:60000});await plans.locator('[data-floor-scan-import]').click();
  await expect(plans.locator('[data-floor-total]')).toContainText('20 m²',{timeout:60000});await expect(plans.locator('[data-floor-name]')).toHaveValue('sala');
  // A real USDZ container holding a binary .usdc (what RoomPlan exports): no crate reader, so it stays SIMULATED and labelled.
  const entry=Buffer.from('room.usdc'),payload=Buffer.from('PXR-USDC....'),local=Buffer.alloc(30),central=Buffer.alloc(46),eocd=Buffer.alloc(22);
  local.writeUInt32LE(0x04034b50,0);local.writeUInt32LE(payload.length,18);local.writeUInt32LE(payload.length,22);local.writeUInt16LE(entry.length,26);
  central.writeUInt32LE(0x02014b50,0);central.writeUInt32LE(payload.length,20);central.writeUInt32LE(payload.length,24);central.writeUInt16LE(entry.length,28);
  eocd.writeUInt32LE(0x06054b50,0);eocd.writeUInt16LE(1,8);eocd.writeUInt16LE(1,10);eocd.writeUInt32LE(46+entry.length,12);eocd.writeUInt32LE(30+entry.length+payload.length,16);
  await plans.locator('[data-floor-scan-input]').setInputFiles({name:'cuarto.usdz',mimeType:'model/vnd.usdz+zip',buffer:Buffer.concat([local,entry,payload,central,entry,eocd])});
  await expect(plans.locator('[data-floor-scan-note]').first()).toContainText(t('SIMULADO','SIMULATED'),{timeout:60000});await plans.locator('[data-floor-scan-import]').click();
  await expect(plans.locator('[data-floor-scan-note]').first()).toContainText(t('SIMULADO','SIMULATED'),{timeout:60000});
  // The note is already visible before the import request finishes, so wait for the stored row instead of reading it once.
  await expect.poll(async()=>(await f.db.from('pro_room_scans').select('format,parser').eq('owner_id',f.owner.id).order('created_at')).data,{timeout:30000}).toEqual([{format:'obj',parser:'local'},{format:'usdz',parser:'simulado'}]);
  await expectNoHorizontalOverflow(page);await plans.scrollIntoViewIfNeeded();await shot(page,`r6d-floor-scan-${language}`,project);
  expect(errors()).toEqual([]);
 }finally{await f.cleanup();}
});

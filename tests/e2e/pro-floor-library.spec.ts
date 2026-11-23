import {test,expect} from 'playwright/test';
import {collectPageErrors,gotoOK,expectNoHorizontalOverflow} from './helpers';
import {ownerFixture,local,headersFor,origin} from './pro-round2-fixture';

// Rows 63/64: library of custom 3D objects (manual + OBJ bounding box), placed in a plan with its own name/height/colour,
// saved through the strict SQL validator, 3D walkthrough with keyboard/buttons, OBJ export. Loopback only.
for(const language of ['es','en'] as const)test(`Rows 63/64: object library, custom object in a plan, walkthrough and OBJ export [${language}]`,async({page},info)=>{
 test.setTimeout(300000);local(info.project.use.baseURL);const en=language==='en',label=language+crypto.randomUUID().slice(0,6),t=(es:string,english:string)=>en?english:es;
 const f=await ownerFixture(page.context(),label);
 try{
  const errors=collectPageErrors(page),h=headersFor(f.owner);
  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_agenda',cita:f.workId,vistaTrabajo:'takeoffs'}));
  const plans=page.locator('[data-floor-plans]');await expect(plans).toBeVisible({timeout:90000});await plans.scrollIntoViewIfNeeded();
  await plans.locator('[data-floor-new]').click();await plans.locator('[data-floor-name]').fill(t('Sala','Living'));
  await plans.locator('[data-floor-rect="name"]').fill(t('Sala','Living'));await plans.locator('[data-floor-rect="width"]').fill('5');await plans.locator('[data-floor-rect="depth"]').fill('4');await plans.locator('[data-floor-rect-add]').click();
  // Library: by hand and from an OBJ (centimetres): 60 x 40 x 80 cm box.
  const library=plans.locator('[data-floor-library]');await library.locator('summary').click();
  await library.locator('[data-floor-library-field="name"]').fill(t('Mesa de centro','Coffee table'));await library.locator('[data-floor-library-field="w"]').fill('1,2');await library.locator('[data-floor-library-field="d"]').fill('0,6');await library.locator('[data-floor-library-field="h"]').fill('0,45');
  await library.locator('[data-floor-library-add]').click();await expect(library.locator('[data-floor-library-notice]')).toBeVisible({timeout:60000});
  await expect(library.locator(`[data-floor-library-item="${t('Mesa de centro','Coffee table')}"]`)).toContainText('1.2 × 0.6 × 0.45');
  await library.locator('[data-floor-library-unit]').selectOption('cm');
  await library.locator('[data-floor-library-obj]').setInputFiles({name:'caja.obj',mimeType:'model/obj',buffer:Buffer.from(['v 0 0 0','v 60 0 0','v 60 0 40','v 0 0 40','v 0 80 0','v 60 80 40'].join('\n'))});
  await expect(library.locator('[data-floor-library-field="h"]')).toHaveValue('0.8',{timeout:30000});await library.locator('[data-floor-library-add]').click();
  await expect(library.locator('[data-floor-library-item="caja"]')).toBeVisible({timeout:60000});
  const dup=await page.request.post(origin+'/api/pro/floor-object-library',{headers:h,data:{action:'create',id:crypto.randomUUID(),name:t('Mesa de centro','Coffee table'),w:1,d:1,h:1,source:'manual'}});expect(dup.status()).toBe(409);
  // Place it and save.
  await plans.locator('[data-floor-tool="object"]').click();await plans.locator('[data-floor-object-kind]').selectOption({label:t('Mesa de centro','Coffee table')});
  const box=(await plans.locator('[data-floor-canvas]').boundingBox())!;await page.mouse.click(box.x+box.width/2,box.y+box.height/2);
  await expect(plans.locator('[data-floor-object="custom"]')).toHaveCount(1);
  await plans.locator('[data-floor-save]').click();await expect(plans.locator('[data-floor-notice]')).toContainText(t('Plano creado','Plan created'),{timeout:60000});
  const saved=(await f.db.from('pro_floor_plans').select('content').eq('owner_id',f.owner.id).single().throwOnError()).data!.content as {objects:{kind:string;label:string;h:number}[]};
  expect(saved.objects[0]).toMatchObject({kind:'custom',label:t('Mesa de centro','Coffee table'),h:0.45});
  // 3D: walkthrough with buttons, OBJ export, render image.
  await plans.locator('[data-floor-3d]').click();await plans.locator('[data-floor-walk]').click();await expect(plans.locator('[data-floor-walk-canvas]')).toBeVisible();
  await plans.locator('[data-floor-walk-move="forward"]').click();await plans.locator('[data-floor-walk-turn="right"]').click();
  const [objDownload]=await Promise.all([page.waitForEvent('download'),plans.locator('[data-floor-obj]').click()]);expect(objDownload.suggestedFilename()).toMatch(/\.obj$/);
  const [png]=await Promise.all([page.waitForEvent('download'),plans.locator('[data-floor-walk-render]').click()]);expect(png.suggestedFilename()).toMatch(/\.png$/);
  await expectNoHorizontalOverflow(page);expect(errors()).toEqual([]);
 }finally{await f.cleanup();}
});

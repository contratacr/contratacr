import {test,expect,type Page} from 'playwright/test';
import sharp from 'sharp';
import {randomBytes} from 'node:crypto';
import {createDisposableAccount,cleanupDisposableAccount,type DisposableAccount} from './disposable-account';
import {gotoOK,expectNoHorizontalOverflow} from './helpers';
import {ownerFixture,local,login,shot,headersFor,origin} from './pro-round2-fixture';
import {estimateInput,json as estimateJson,post as estimatePost} from './pro-private-estimate-publications-fixture';

// Round 2 (UX items of the manual walkthrough, 2026-11-12). Disposable owner, loopback only;
// nothing is e-mailed, notified or charged.
const label=(language:string)=>language+randomBytes(3).toString('hex');
/* Closing round: since Round 9 the job (and its Measurements) is its own page, not a modal; with no dialog open there is
 * no modal that could scroll as a whole, so the check only applies when a dialog is shown. */
async function dialogGeometry(page:Page){return page.evaluate(()=>{const dialog=[...document.querySelectorAll<HTMLElement>('[role=dialog]')].filter(node=>node.getClientRects().length).at(-1);return dialog?{top:dialog.scrollTop,extra:dialog.scrollHeight-dialog.clientHeight}:{top:0,extra:0};});}
const leaveWarning=(page:Page)=>page.evaluate(()=>{const event=new Event('beforeunload',{cancelable:true});window.dispatchEvent(event);return event.defaultPrevented;});
async function planJpeg(){return sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="600"><rect width="1200" height="600" fill="#fff"/><rect x="120" y="60" width="960" height="480" fill="none" stroke="#1f2937" stroke-width="8"/></svg>')).jpeg().toBuffer();}

for(const language of ['es','en'] as const)test(`Round 2 job: modal stays put, plan from Files, summary blocks, purchase orders, bids [${language}]`,async({page},info)=>{
 test.setTimeout(420000);local(info.project.use.baseURL);const en=language==='en',id=label(language),project=info.project.name;
 const f=await ownerFixture(page.context(),id);
 try{
  const fileId=crypto.randomUUID(),upload=await page.request.post(origin+'/api/pro/work-files',{headers:headersFor(f.owner),data:{action:'upload',workId:f.workId,fileId,name:'plano-cocina.jpg',data:(await planJpeg()).toString('base64')}});
  expect(upload.status(),await upload.text()).toBe(200);
  // (7) Takeoffs: a plan from an image already in Files, no second upload.
  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_agenda',cita:f.workId,vistaTrabajo:'takeoffs'}));
  const view=page.locator('[data-takeoffs]');await expect(view.locator('[data-takeoffs-empty]')).toBeVisible({timeout:90000});
  await view.locator('[data-takeoff-from-files]').click();
  await view.locator('[data-takeoff-job-file]').selectOption({label:'plano-cocina.jpg'});
  await expect(view.locator('[data-takeoff-plan]').first()).toContainText('plano-cocina',{timeout:60000});
  const viewer=view.locator('[data-takeoff-viewer]');await expect(viewer).toBeVisible();
  const plans=await page.request.get(origin+'/api/pro/takeoffs?'+new URLSearchParams({workId:f.workId}),{headers:{'X-Pro-Expected-Actor':f.owner.id}});expect((await plans.json()).plans[0].fileId).toBe(fileId);
  // (1) The modal never scrolls as a whole: focusing the visually hidden picker keeps header and footer pinned.
  expect(await dialogGeometry(page)).toEqual({top:0,extra:0});
  await view.locator('[data-takeoff-upload]').evaluate(node=>(node as HTMLElement).focus());
  expect(await dialogGeometry(page)).toEqual({top:0,extra:0});
  if(await page.getByRole('dialog').count())await expect(page.getByRole('dialog').last().getByRole('heading',{level:2}).first()).toBeInViewport();
  // (7) After the reference line, the «real length» field is brought into view and focused.
  await expect(viewer.locator('[data-takeoff-tool="scale"]')).toHaveAttribute('aria-pressed','true');
  const canvas=viewer.locator('[data-takeoff-canvas]');await expect(viewer.locator('img')).toHaveJSProperty('complete',true);
  const box=(await canvas.boundingBox())!;await canvas.click({position:{x:box.width*0.1,y:box.height*0.5}});await canvas.click({position:{x:box.width*0.6,y:box.height*0.5}});
  const scale=view.locator('[data-takeoff-form="calibration"]');await expect(scale).toBeInViewport();await expect(scale.locator('[data-takeoff-field="calibrationLength"]')).toBeFocused();
  expect((await dialogGeometry(page)).top).toBe(0);
  await shot(page,`r2-takeoff-scale-${language}`,project);
  await scale.locator('[data-takeoff-field="calibrationLength"]').fill('12');await scale.getByRole('button',{name:en?'Save scale':'Guardar escala'}).click();await expect(scale).toHaveCount(0);

  // (5) Summary of a new job: next steps, figures and schedule; «Finish job» is not the main action.
  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_agenda',cita:f.workId}));
  const blocks=page.locator('[data-work-summary-blocks]');await expect(blocks).toBeVisible({timeout:90000});
  for(const step of ['estimate','contract','schedule'])await expect(blocks.locator(`[data-work-summary-step="${step}"]`)).toHaveAttribute('data-done','false',{timeout:60000});
  await expect(blocks.locator('[data-work-summary-block="figures"]')).toContainText(en?'Not set':'Sin definir',{timeout:60000});
  await expect(blocks.locator('[data-work-summary-block="schedule"]')).toContainText(en?'Not scheduled yet.':'Todavía sin programar.');
  const finish=page.locator('[data-work-finish]');await expect(finish).toHaveClass(/bg-white/);await expect(finish).not.toHaveClass(/bg-\[#009FD9\]/);
  await expectNoHorizontalOverflow(page);await blocks.scrollIntoViewIfNeeded();await shot(page,`r2-summary-${language}`,project);
  await blocks.locator('[data-work-summary-block="schedule"]').getByRole('button',{name:en?'Open schedule':'Abrir cronograma'}).click();
  await expect(page).toHaveURL(/(?:vistaTrabajo=|\/trabajo\/[^/?]+\/)schedule(?:[?&]|$)/);

  // (7) Purchase orders: filters folded on phones; the budget is created from where it is shown.
  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_agenda',cita:f.workId,vistaTrabajo:'orders'}));
  const orders=page.locator('[data-purchase-order-filters]'),toggle=page.locator('[data-po-filters-toggle]');
  await expect(page.getByRole('button',{name:en?'Budget':'Presupuesto',exact:true})).toBeVisible({timeout:90000});
  if((page.viewportSize()?.width??1366)<640){await expect(toggle).toBeVisible();await expect(orders).toBeHidden();await shot(page,`r2-po-filters-folded-${language}`,project);await toggle.click();await expect(orders).toBeVisible();}
  else{await expect(toggle).toBeHidden();await expect(orders).toBeVisible();}
  await page.getByRole('button',{name:en?'Budget':'Presupuesto',exact:true}).click();
  await page.locator('[data-po-budget-create]').click();await expect(page).toHaveURL(/(?:vistaTrabajo=|\/trabajo\/[^/?]+\/)costs(?:[?&]|$)/);

  // (3)+(7) Bids: the error appears next to the button and in view; the open package stays in the URL; vendor added inline.
  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_agenda',cita:f.workId,vistaTrabajo:'bids'}));
  const bids=page.locator('[data-work-bids]');await bids.getByRole('button',{name:en?'New bid request':'Nueva licitación'}).click({timeout:90000});
  const form=bids.locator('[data-bid-form="create"]');
  await form.getByLabel(en?'Title':'Título',{exact:true}).fill(en?'Kitchen tile':'Enchape de cocina');
  await form.getByLabel(en?'Due date for offers':'Fecha límite para ofertas').fill('2020-01-01');
  await form.getByLabel(en?'Description':'Descripción',{exact:true}).fill(en?'Floor tile':'Piso de porcelanato');
  await form.getByLabel(en?'Quantity':'Cantidad',{exact:true}).fill('12');await form.getByLabel(en?'Unit':'Unidad',{exact:true}).fill('m²');
  await form.getByRole('button',{name:en?'Save bid request':'Guardar licitación'}).click();
  const error=form.locator('[data-bid-message="error"]');await expect(error).toContainText(en?'cannot be in the past':'no puede estar en el pasado');await expect(error).toBeInViewport();
  const saveBox=(await form.getByRole('button',{name:en?'Save bid request':'Guardar licitación'}).boundingBox())!,errorBox=(await error.boundingBox())!;expect(Math.abs(saveBox.y-(errorBox.y+errorBox.height))).toBeLessThan(80);
  await shot(page,`r2-bid-error-${language}`,project);
  await form.getByLabel(en?'Due date for offers':'Fecha límite para ofertas').fill('2030-12-31');await form.getByRole('button',{name:en?'Save bid request':'Guardar licitación'}).click();
  const detail=bids.locator('[data-bid-detail]');await expect(detail).toBeVisible({timeout:60000});await expect(page).toHaveURL(/[?&]licitacion=[0-9a-f-]{36}/);
  await page.reload();await expect(detail).toContainText(en?'Floor tile':'Piso de porcelanato',{timeout:90000});
  await detail.getByRole('button',{name:en?'Invite vendors':'Invitar proveedores'}).click();
  const invite=bids.locator('[data-bid-form="invite"]');const inline=invite.locator('[data-bid-vendor-inline]');await expect(invite.locator('[data-bid-vendor-add]')).toBeEnabled();
  // The invite form re-renders once its sources arrive; the click is repeated only if it landed before that.
  await expect(async()=>{if(!await inline.isVisible())await invite.locator('[data-bid-vendor-add]').click();await expect(inline).toBeVisible({timeout:3000});}).toPass({timeout:30000});await inline.getByRole('button',{name:en?'Add and select':'Agregar y seleccionar'}).click();
  await expect(inline.getByRole('alert')).toBeInViewport();
  await inline.getByLabel(en?'Name or company name':'Nombre o razón social').fill('Pinturas Ronda '+id);
  await inline.getByRole('button',{name:en?'Add and select':'Agregar y seleccionar'}).click();
  await expect(invite.getByLabel(new RegExp('Pinturas Ronda '+id))).toBeChecked({timeout:60000});
  await shot(page,`r2-bid-inline-vendor-${language}`,project);
  await invite.getByRole('button',{name:en?'Invite selected':'Invitar a los seleccionados'}).click();await expect(detail.locator('[data-bid-vendor]')).toHaveCount(1);
  const vendors=await page.request.get(origin+'/api/pro/company-vendors?'+new URLSearchParams({view:'list',status:'active',kind:'subcontractor',q:'Pinturas Ronda'}),{headers:{'X-Pro-Expected-Actor':f.owner.id}});expect(vendors.status()).toBe(200);expect((await vendors.json()).items.map((v:{name:string})=>v.name)).toEqual(['Pinturas Ronda '+id]);
 }finally{await f.cleanup();}
});

for(const language of ['es','en'] as const)test(`Round 2 quotes: 13 % VAT and discount for all, readable code, e-mail prefilled, no false leave warning [${language}]`,async({page,browser},info)=>{
 test.setTimeout(420000);local(info.project.use.baseURL);const en=language==='en',id=label(language),project=info.project.name;
 const customer:DisposableAccount=await createDisposableAccount({prefix:'r2-customer'});
 const f=await ownerFixture(page.context(),id,(document,ids)=>{document.clients[0].email=customer.email;void ids;});
 try{
  // (4) New estimate: each line starts with 13 % VAT; one discount for all lines; empty catalog explained.
  await gotoOK(page,`/${language}/dashboard/pro?tab=quotes`);
  await page.getByRole('button',{name:en?'New quote':'Nueva cotización',exact:true}).first().click({timeout:90000});
  const editor=page.getByRole('dialog').last(),line=editor.locator('[data-private-estimate-line]').first();
  await expect(line.locator('[data-private-estimate-line-summary]')).toHaveText(en?'VAT 13%':'IVA 13 %');
  await line.locator('summary').click();await expect(line.getByLabel(en?'Tax (%)':'Impuesto (%)',{exact:true})).toHaveValue('13');
  await editor.getByRole('button',{name:en?'Add item':'Agregar línea'}).click();await expect(editor.locator('[data-private-estimate-line]')).toHaveCount(2);
  const all=editor.locator('[data-private-estimate-discount-all]');await all.getByLabel(en?'Discount for all items (%)':'Descuento para todas las líneas (%)').fill('150');await all.getByRole('button',{name:en?'Apply to all items':'Aplicar a todas'}).click();
  await expect(all.getByRole('alert')).toBeVisible();
  await all.getByLabel(en?'Discount for all items (%)':'Descuento para todas las líneas (%)').fill('10');await all.getByRole('button',{name:en?'Apply to all items':'Aplicar a todas'}).click();
  for(const row of await editor.locator('[data-private-estimate-line-summary]').all())await expect(row).toHaveText(en?'VAT 13% · discount 10%':'IVA 13 % · descuento 10 %');
  await line.getByRole('button',{name:en?'Choose from catalog':'Elegir del catálogo'}).click();
  await expect(line.getByText(en?'There are no options to choose yet.':'Todavía no hay opciones para elegir.')).toBeVisible({timeout:60000});
  await shot(page,`r2-estimate-defaults-${language}`,project);
  await page.goto('about:blank');

  // (4) Sharing: customer e-mail prefilled, readable code, consistent status, no false «Leave site?».
  const ctx=await estimateJson(page.context(),{view:'context',clientId:f.clientId}),saved=await estimatePost(page.context(),f.owner,estimateInput(ctx,{validUntil:'2030-12-31'}));expect(saved.status()).toBe(200);
  const estimate=(await saved.json()).estimate;
  await gotoOK(page,`/${language}/dashboard/pro?tab=quotes`);
  const row=page.locator(`[data-sales-estimate="private_estimate:${estimate.id}"]`);await row.getByRole('button',{name:en?'Preview':'Vista previa',exact:true}).click({timeout:90000});
  const owner=page.locator('[data-estimate-publications]');/* Closing round: first compile of the publication reads on the dev server can keep «Checking quote…» >12 s. */await expect(owner.getByRole('button',{name:en?'Share':'Compartir',exact:true})).toBeEnabled({timeout:90000});await owner.getByRole('button',{name:en?'Share':'Compartir',exact:true}).click();
  const share=owner.locator('[data-estimate-share-form]');await expect(share.getByLabel(en?'Customer email':'Correo del cliente',{exact:true})).toHaveValue(customer.email);
  expect(await leaveWarning(page)).toBe(false);// a prefilled e-mail is not an unsent change
  await share.getByRole('button',{name:en?'Share version':'Compartir versión',exact:true}).click();await page.getByRole('dialog').last().getByRole('button',{name:en?'Share version':'Compartir versión',exact:true}).click();
  const code=owner.locator('[data-estimate-access-code]');await expect(code).toHaveValue(/^[0-9A-HJKMNP-TV-Z]{5}(-[0-9A-HJKMNP-TV-Z]{5}){3}$/,{timeout:60000});
  expect(await leaveWarning(page)).toBe(false);// the shared code is kept locally until «Done»
  await code.scrollIntoViewIfNeeded();await shot(page,`r2-estimate-code-${language}`,project);
  await owner.locator('[data-estimate-publication-code]').getByRole('button',{name:en?'Done':'Listo',exact:true}).click();
  await expect(owner.getByText(en?'Checking quote…':'Comprobando cotización…')).toHaveCount(0,{timeout:90000});await expect(owner.locator('[data-estimate-publication-recovery]')).toHaveCount(0);await expect(owner.getByRole('button',{name:en?'Share':'Compartir',exact:true})).toBeVisible();
  await gotoOK(page,`/${language}/dashboard/pro?tab=quotes`);
  await expect(row).toContainText(en?'Shared · waiting for the customer':'Compartida · esperando al cliente',{timeout:90000});
  await row.getByRole('button',{name:en?'Review shared version':'Revisar versión compartida',exact:true}).click();
  await owner.getByRole('button',{name:en?'Replace code':'Reemplazar código',exact:true}).click();await page.getByRole('dialog').last().getByRole('button',{name:en?'Replace code':'Reemplazar código',exact:true}).click();
  await expect(code).toHaveValue(/^[0-9A-HJKMNP-TV-Z]{5}(-[0-9A-HJKMNP-TV-Z]{5}){3}$/,{timeout:60000});const replaced=await code.inputValue();
  expect(await leaveWarning(page)).toBe(false);
  // The customer types the code as read aloud: lower case, spaces instead of dashes.
  const context=await browser.newContext({baseURL:origin});
  try{
   await login(context,customer);const client=await context.newPage();await gotoOK(client,`/${language}/dashboard/cotizaciones`);
   const claim=client.locator('[data-estimate-claim-form]');await claim.getByLabel(en?'Access code':'Código de acceso',{exact:true}).fill(replaced.replace(/-/g,' ').toLowerCase(),{timeout:90000});
   await claim.getByRole('button',{name:en?'Use code':'Usar código',exact:true}).click();await client.getByRole('dialog').last().getByRole('button',{name:en?'Use code':'Usar código',exact:true}).click();
   await expect(client.locator('[data-estimate-publication-detail]')).toBeVisible({timeout:60000});
  }finally{await context.close();}
 }finally{await f.cleanup();await cleanupDisposableAccount(customer);}
});

for(const language of ['es','en'] as const)test(`Round 2 company: same hub sections, suppliers, catalog, files, invoice issuer, client view copy, suspended quotes [${language}]`,async({page},info)=>{
 test.setTimeout(420000);local(info.project.use.baseURL);const en=language==='en',id=label(language),project=info.project.name;
 const f=await ownerFixture(page.context(),id);
 try{
  // (9) Sidebar and cards list the same sections in the same order; card columns line up.
  await gotoOK(page,`/${language}/dashboard/pro`);const tools=page.locator('[data-pro-tools]');await expect(tools).toBeVisible({timeout:90000});
  const cards=await tools.locator('[data-pro-hub-card]').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('data-pro-hub-card')));
  expect(cards).toEqual(['company','customers','suppliers','team',/* gaps round: Pro edition */'editions','files','catalog','services','projects','leads','agenda','tasks',/* Round 9: Horas */'hours','quotes','payments','expenses','statistics','preparation','billing']);
  const sidebar=page.getByRole('navigation',{name:en?'Business navigation':'Navegación del negocio',exact:true});
  if(await sidebar.isVisible()){expect(await sidebar.locator('[data-pro-hub-entry]').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('data-pro-hub-entry')))).toEqual(cards);
   const x=async(key:string)=>(await tools.locator(`[data-pro-hub-card="${key}"]`).boundingBox())!;
   const [a,b,c2,d]=await Promise.all([x('company'),x('projects'),x('customers'),x('leads')]);expect(Math.abs(a.x-b.x)).toBeLessThan(1);expect(Math.abs(a.width-b.width)).toBeLessThan(1);
   if(c2.y===a.y){expect(Math.abs(c2.x-d.x)).toBeLessThan(1);}}
  await shot(page,`r2-hub-${language}`,project,true);
  // (8) «Proveedores» opens the supplier/subcontractor directory with its own empty state.
  await tools.locator('[data-pro-hub-card="suppliers"]').getByRole('button').click();
  await expect(page).toHaveURL(/tab=pro_company&empresa=proveedores/,{timeout:90000});/* Closing round: «Opening section…» waits for the section's first dev compile. */
  await expect(page.locator('[data-company-vendors-empty]')).toContainText(en?'You have no suppliers yet.':'Todavía no tiene proveedores.',{timeout:90000});
  await shot(page,`r2-suppliers-${language}`,project);
  // (6) Company files: «New folder» is a visible button.
  await gotoOK(page,`/${language}/dashboard/pro?tab=pro_company&empresa=archivos`);await expect(page.locator('[data-company-folder-create]')).toBeVisible({timeout:90000});
  // (8) Catalog: empty state with a create button; readable code; no «To replenish» without a minimum.
  await gotoOK(page,`/${language}/dashboard/pro?tab=pro_inventory`);const create=page.locator('[data-pro-empty-create]');await expect(create).toBeVisible({timeout:90000});
  await shot(page,`r2-catalog-empty-${language}`,project);
  await create.click();const productForm=page.getByRole('dialog').last();await productForm.getByLabel(en?'Name':'Nombre',{exact:true}).fill('Bisagra cierre lento '+id);await productForm.getByLabel(en?'Unit price ₡':'Precio unitario ₡',{exact:true}).fill('4500');
  await productForm.getByRole('button',{name:en?'Save':'Guardar',exact:true}).click();await expect(productForm).toBeHidden({timeout:60000});
  const catalog=await page.request.get(origin+'/api/pro/catalog?'+new URLSearchParams({kind:'products'}));const product=(await catalog.json()).items[0];
  expect(product.sku).toMatch(/^P-(?:\d{4}|[2-9A-HJKMNP-TV-Z]{6})$/);expect(product).toMatchObject({stock:0,minimum:0});
  const card=page.locator('[data-business-panel] article').filter({hasText:'Bisagra cierre lento '+id});await expect(card).toContainText(product.sku);await expect(card).not.toContainText(en?'To replenish':'Por reponer');
  const low=await page.request.get(origin+'/api/pro/catalog?'+new URLSearchParams({kind:'products',filter:'low'}));expect((await low.json()).items).toEqual([]);
  await shot(page,`r2-catalog-item-${language}`,project);
  // (10) Invoice draft: the issuer starts with the company name.
  const source=await page.request.get(origin+'/api/pro/invoice-drafts?'+new URLSearchParams({kind:'work',sourceId:f.workId}));expect(source.status()).toBe(200);
  const body=await source.json();expect(body.issuerDefaults.issuerName).toBe('Remodelaciones '+id);expect(body.preparationDefaults.issuerName).toBe('Remodelaciones '+id);
  // (10) Client view: one consistent explanation of the default sections.
  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_agenda',cita:f.workId,vistaTrabajo:'client'}));
  await expect(page.getByText(en?'the others start hidden until you turn them on':'las demás empiezan ocultas hasta que usted las encienda',{exact:false})).toHaveCount(1,{timeout:90000});
  await expect(page.getByText(en?'Every section is visible by default':'Todas las secciones se muestran por defecto',{exact:false})).toHaveCount(0);
  // (4) A suspended professional profile is explained instead of «could not load». Since the 2026-11-17 hardening the
  // TS gate (hasProAccess) mirrors SQL pro_entitled: a banned professional is refused at the Pro page gate and lands on
  // the professional dashboard, which explains the suspension; the Pro APIs answer 403 too.
  await f.db.from('professionals').update({is_banned:true}).eq('profile_id',f.owner.id).throwOnError();
  await page.goto(`/${language}/dashboard/pro?tab=quotes`);
  await expect(page).toHaveURL(/\/dashboard\/profesional\?tab=home/,{timeout:90000});
  // The notice lives in the mobile home card (the desktop home hides that card: pre-existing layout, reported separately).
  /* Gaps round: the notice is localized and visible at every width (was Spanish-only and hidden at lg). */await expect(page.getByText((en?'Your profile is suspended':'Su perfil está suspendido'),{exact:true})).toHaveCount(1,{timeout:90000});await expect(page.getByText((en?'Your profile is suspended':'Su perfil está suspendido'),{exact:true})).toBeVisible();
  await expect(page.getByText(en?'Could not load quotes.':'No se pudieron cargar las cotizaciones.')).toHaveCount(0);
  const refused=await page.request.get(origin+'/api/pro/catalog?'+new URLSearchParams({kind:'products'}));expect(refused.status()).toBe(403);await shot(page,`r2-quotes-suspended-${language}`,project);
 }finally{await f.cleanup();}
});

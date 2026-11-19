import {test,expect,type Page,type Locator} from 'playwright/test';
import {destinationCopyFixture,cleanupDestinationCopy,destinationCopyBusiness,estimateRows,post,type DestinationCopyFixture} from './private-estimate-destination-copy-fixture';
import {stabilizeLocalProRuntime} from './pro-local-stable-runtime';
import {gotoOK,expectNoHorizontalOverflow,onAppPageError} from './helpers';

function labels(en:boolean){return{header:en?'Close dialog':'Cerrar diálogo',close:en?'Close':'Cerrar',cancel:en?'Cancel':'Cancelar',keep:en?'Keep editing':'Seguir editando',discard:en?'Discard changes':'Descartar cambios'};}
async function header(modal:Locator,en:boolean){const button=modal.getByRole('button',{name:labels(en).header,exact:true});await expect(button).toBeVisible();await expect(button).toBeEnabled();expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);return button;}
async function unchanged(f:DestinationCopyFixture,business:Awaited<ReturnType<typeof destinationCopyBusiness>>,documents:Awaited<ReturnType<typeof estimateRows>>){expect(await destinationCopyBusiness(f)).toEqual(business);expect(await estimateRows(f)).toEqual(documents);}
function observe(page:Page){const writes:string[]=[],errors:string[]=[];page.on('request',r=>{if(['POST','PATCH','PUT','DELETE'].includes(r.method())&&new URL(r.url()).pathname.startsWith('/api/pro/'))writes.push(r.method()+' '+new URL(r.url()).pathname);});onAppPageError(page,message=>errors.push(message));return{writes,errors};}
async function dismissGuard(page:Page,parent:Locator,field:Locator,value:string,en:boolean){const nested=page.getByRole('dialog').last();await expect(nested).not.toHaveAttribute('aria-label',await parent.getAttribute('aria-label')??'');await nested.getByRole('button',{name:labels(en).keep,exact:true}).click();await expect(field).toHaveValue(value);await expect.poll(()=>parent.evaluate(node=>node.contains(document.activeElement))).toBe(true);}

for(const language of ['es','en']as const){
 const en=language==='en',text=labels(en);
 test(`Pro modal localization: wrapper defaults, explicit customer labels, channel drafts and Back remain guarded (${language})`,async({page,browser,baseURL},info)=>{
  test.setTimeout(240000);expect(baseURL).toBe('http://127.0.0.1:3185');const f=await destinationCopyFixture(page.context(),browser);
  try{
   await stabilizeLocalProRuntime(page.context(),baseURL!);const seen=observe(page),business=await destinationCopyBusiness(f),documents=await estimateRows(f);
   await gotoOK(page,`/${language}/dashboard/pro?tab=pro_clients&editar=${f.secondClient}`);
   const customer=page.getByRole('dialog',{name:en?'Edit customer':'Editar cliente',exact:true});
   await expect(customer.getByLabel(en?'Name':'Nombre',{exact:true})).toHaveValue('DESTINATION_CLIENT_B');
   // This caller explicitly requests Close/Cerrar; the wrapper must retain it.
   await expect(customer.getByRole('button',{name:text.header,exact:true})).toHaveCount(0);
   await customer.getByRole('button',{name:text.close,exact:true}).click();await expect(customer).toHaveCount(0);
   await page.getByRole('button',{name:en?'New customer':'Nuevo cliente',exact:true}).click();
   const create=page.getByRole('dialog',{name:en?'New customer':'Nuevo cliente',exact:true});
   await expect(create.getByLabel(en?'Name':'Nombre',{exact:true})).toHaveValue('');
   await create.getByRole('button',{name:text.cancel,exact:true}).click();await expect(create).toHaveCount(0);
   await gotoOK(page,`/${language}/dashboard/pro?tab=pro_agenda&cita=${f.destinationWorkId}&vistaTrabajo=costs`);
   const budgetTrigger=page.locator('[data-work-budget-trigger]');/* Closing round: the first visit to «Costs and payments» compiles its whole view on the dev server (all its reads stay pending for >12 s on a fresh server). */await expect(budgetTrigger).toBeEnabled({timeout:90000});await budgetTrigger.click();
   const budget=page.getByRole('dialog',{name:en?'Cost budget (CRC)':'Presupuesto de costos (CRC)',exact:true});
   await (await header(budget,en)).click();await expect(budget).toHaveCount(0);await expect(budgetTrigger).toBeFocused();
   await budgetTrigger.click();await header(budget,en);await page.keyboard.press('Escape');await expect(budget).toHaveCount(0);await expect(budgetTrigger).toBeFocused();
   await gotoOK(page,`/${language}/dashboard/pro?tab=pro_leads`);
   await page.getByRole('button',{name:en?'Lead options':'Opciones de solicitudes',exact:true}).click();
   await page.getByRole('menuitem',{name:en?'Manage channels':'Administrar canales',exact:true}).click();
   const channels=page.getByRole('dialog',{name:en?'Manage channels':'Administrar canales',exact:true});
   await (await header(channels,en)).click();await expect(channels).toHaveCount(0);
   await page.getByRole('button',{name:en?'Lead options':'Opciones de solicitudes',exact:true}).click();await page.getByRole('menuitem',{name:en?'Manage channels':'Administrar canales',exact:true}).click();
   await channels.getByRole('button',{name:en?'New channel':'Nuevo canal',exact:true}).click();const name=channels.getByLabel(en?'Channel name':'Nombre del canal',{exact:true});await name.fill('LOCAL_MODAL_DRAFT');
   const draftKey='ccr:pro:lead-origin-channel-draft:v1:'+f.owner.id;await expect.poll(()=>page.evaluate(key=>sessionStorage.getItem(key),draftKey)).not.toBeNull();const raw=await page.evaluate(key=>sessionStorage.getItem(key),draftKey);
   await (await header(channels,en)).click();await dismissGuard(page,channels,name,'LOCAL_MODAL_DRAFT',en);expect(await page.evaluate(key=>sessionStorage.getItem(key),draftKey)).toBe(raw);
   await page.keyboard.press('Escape');await dismissGuard(page,channels,name,'LOCAL_MODAL_DRAFT',en);expect(await page.evaluate(key=>sessionStorage.getItem(key),draftKey)).toBe(raw);
   await channels.getByRole('button',{name:text.cancel,exact:true}).click();await expect(name).toHaveCount(0);await (await header(channels,en)).click();await expect(channels).toHaveCount(0);
   await gotoOK(page,`/${language}/dashboard/pro?tab=pro_tools&prepararVisita=1`);
   const back=page.getByRole('dialog').getByRole('button',{name:en?'Back':'Volver',exact:true});await expect(back).toBeEnabled();await expect(page.getByRole('dialog').getByRole('button',{name:text.header,exact:true})).toHaveCount(0);await back.click();await expect(page.getByRole('dialog')).toHaveCount(0);
   await expectNoHorizontalOverflow(page);await page.screenshot({path:info.outputPath('modal-explicit-and-wrapper-'+language+'.png'),animations:'disabled'});expect(seen.writes).toEqual([]);expect(seen.errors).toEqual([]);await unchanged(f,business,documents);
  }finally{await page.goto('about:blank').catch(()=>{});await cleanupDestinationCopy(f);}
 });

 test(`Pro modal localization: private editor guards and immutable preview, shared and accepted version closures (${language})`,async({page,browser,baseURL},info)=>{
  test.setTimeout(240000);expect(baseURL).toBe('http://127.0.0.1:3185');const f=await destinationCopyFixture(page.context(),browser);
  try{
   const workId=crypto.randomUUID(),link={action:'continue',actionId:crypto.randomUUID(),publicationId:f.publication.publicationId,contentHash:f.publication.contentHash,publicationRevision:f.publication.revision,target:{kind:'new',workId,conversionActionId:null,leadRevision:null}};
   expect((await post(page.context(),f.owner,link,'/api/pro/private-estimate-work')).status()).toBe(200);
   await stabilizeLocalProRuntime(page.context(),baseURL!);const seen=observe(page),business=await destinationCopyBusiness(f),documents=await estimateRows(f);
   await gotoOK(page,`/${language}/dashboard/pro?tab=quotes`);const row=page.locator(`[data-sales-estimate="private_estimate:${f.estimateB.id}"]`);await expect(row).toContainText('HISTORICAL_PUBLICATION_A');
   await row.getByRole('button',{name:en?'Quote actions':'Acciones de cotización',exact:true}).click();await page.getByRole('menuitem',{name:en?'Edit draft':'Editar borrador',exact:true}).click();
   const editor=page.getByRole('dialog',{name:en?'Edit private quote':'Editar cotización privada',exact:true}),title=editor.getByLabel(en?'Service or title':'Servicio o título',{exact:true});await expect(title).toHaveValue('CURRENT_DRAFT_B');await title.fill('LOCAL_UNSAVED_TITLE');
   const draftKey='ccr:pro:private-estimate-draft:v1:'+f.owner.id+':'+f.estimateB.id;await expect.poll(()=>page.evaluate(key=>sessionStorage.getItem(key),draftKey)).not.toBeNull();const raw=await page.evaluate(key=>sessionStorage.getItem(key),draftKey);
   await (await header(editor,en)).click();await dismissGuard(page,editor,title,'LOCAL_UNSAVED_TITLE',en);expect(await page.evaluate(key=>sessionStorage.getItem(key),draftKey)).toBe(raw);
   await page.keyboard.press('Escape');await dismissGuard(page,editor,title,'LOCAL_UNSAVED_TITLE',en);expect(await page.evaluate(key=>sessionStorage.getItem(key),draftKey)).toBe(raw);
   await editor.getByRole('button',{name:text.cancel,exact:true}).click();await page.getByRole('dialog').last().getByRole('button',{name:text.discard,exact:true}).click();await expect(editor).toHaveCount(0);
   await row.getByRole('button',{name:en?'View draft':'Ver borrador',exact:true}).click();const preview=page.getByRole('dialog',{name:en?'Quote preview':'Vista previa de la cotización',exact:true});await expect(preview).toContainText('CURRENT_DRAFT_B');await (await header(preview,en)).click();await expect(preview).toHaveCount(0);
   await row.getByRole('button',{name:en?'View draft':'Ver borrador',exact:true}).click();await expect(preview.getByRole('button',{name:text.close,exact:true})).toBeEnabled();await preview.getByRole('button',{name:text.close,exact:true}).click();await expect(preview).toHaveCount(0);
   const sharedTrigger=row.getByRole('button',{name:en?'Review shared version':'Revisar versión compartida',exact:true});await sharedTrigger.click();const shared=page.getByRole('dialog',{name:en?'Shared quote':'Cotización compartida',exact:true});await expect(shared.locator('[data-estimate-publication-document]')).toContainText('HISTORICAL_PUBLICATION_A');await (await header(shared,en)).click();await expect(shared).toHaveCount(0);await expect(sharedTrigger).toBeFocused();
   await gotoOK(page,`/${language}/dashboard/pro?tab=pro_agenda&cita=${workId}`);const summary=page.locator('[data-work-accepted-estimate]');await expect(summary).toContainText('HISTORICAL_PUBLICATION_A');const open=summary.getByRole('button',{name:en?'Review accepted version':'Revisar versión aceptada',exact:true});await open.click();
   const accepted=page.getByRole('dialog',{name:en?'Accepted quote':'Cotización aceptada',exact:true});await expect(accepted.locator('[data-work-accepted-estimate-document]')).toContainText('HISTORICAL_PUBLICATION_A');await header(accepted,en);await expect(accepted.getByRole('button',{name:en?'Close version':'Cerrar versión',exact:true})).toBeEnabled();await expectNoHorizontalOverflow(page);await page.screenshot({path:info.outputPath('modal-accepted-header-'+language+'.png'),animations:'disabled'});
   await page.keyboard.press('Escape');await expect(accepted).toHaveCount(0);await expect(open).toBeFocused();await open.click();await accepted.getByRole('button',{name:en?'Close version':'Cerrar versión',exact:true}).click();await expect(accepted).toHaveCount(0);
   expect(seen.writes).toEqual([]);expect(seen.errors).toEqual([]);await unchanged(f,business,documents);
  }finally{await page.goto('about:blank').catch(()=>{});await cleanupDestinationCopy(f);}
 });

 test(`Pro modal localization: long destination rows stay inside padded content and dirty close confirmation preserves selection (${language})`,async({page,browser,baseURL},info)=>{
  test.setTimeout(240000);expect(baseURL).toBe('http://127.0.0.1:3185');const f=await destinationCopyFixture(page.context(),browser);
  try{
   const clients=Array.from({length:3},(_,i)=>({user_id:f.owner.id,id:'modal-long-'+i,name:'LOCAL_LONG_DESTINATION_'+i+' Cliente con nombre largo para comprobar varias líneas sin recortar contenido lateral',email:'',phone:'',notes:'',archived:false}));await f.db.from('pro_clients').insert(clients).throwOnError();
   await stabilizeLocalProRuntime(page.context(),baseURL!);const seen=observe(page),business=await destinationCopyBusiness(f),documents=await estimateRows(f);await gotoOK(page,`/${language}/dashboard/pro?tab=quotes`);const row=page.locator(`[data-sales-estimate="private_estimate:${f.estimateB.id}"]`);await row.getByRole('button',{name:en?'Quote actions':'Acciones de cotización',exact:true}).click();await page.getByRole('menuitem',{name:en?'Copy for another customer or job':'Copiar para otro cliente o trabajo',exact:true}).click();
   const copy=page.getByRole('dialog',{name:en?'Copy quote':'Copiar cotización',exact:true});await header(copy,en);const search=copy.getByLabel(en?'Search destinations':'Buscar destinos',{exact:true});await expect(search).toBeEnabled();await search.fill('LOCAL_LONG_DESTINATION_');await copy.getByRole('button',{name:en?'Search':'Buscar',exact:true}).click();const options=copy.locator('[data-estimate-destination-copy-option]');await expect(options).toHaveCount(3);
   // Button paints a hidden loading <span> first (ui/button.tsx); measure the visible label span.
   for(const option of await options.all()){const geometry=await option.evaluate(node=>{const rect=node.getBoundingClientRect(),text=[...node.children].find(child=>getComputedStyle(child).display!=='none'&&child.getBoundingClientRect().width>0)!.getBoundingClientRect();return{height:rect.height,left:text.left-rect.left,right:rect.right-text.right,top:text.top-rect.top,bottom:rect.bottom-text.bottom,scroll:node.scrollWidth,client:node.clientWidth};});expect(geometry.height).toBeGreaterThanOrEqual(44);expect(geometry.left).toBeGreaterThanOrEqual(8);expect(geometry.right).toBeGreaterThanOrEqual(8);expect(geometry.top).toBeGreaterThanOrEqual(10);expect(geometry.bottom).toBeGreaterThanOrEqual(10);expect(geometry.scroll).toBeLessThanOrEqual(geometry.client+1);}
   await options.last().click();const selected=copy.locator('[data-estimate-destination-copy-selection]');await expect(selected).toContainText(clients[2].name);const key='ccr:pro:private-estimate-destination-copy-draft:v1:'+f.owner.id+':'+JSON.stringify({kind:'draft',estimateId:f.estimateB.id,revision:f.estimateB.revision}),raw=await page.evaluate(key=>sessionStorage.getItem(key),key);expect(raw).not.toBeNull();
   await (await header(copy,en)).click();await page.getByRole('dialog').last().getByRole('button',{name:en?'Keep editing':'Seguir editando',exact:true}).click();await expect(selected).toContainText(clients[2].name);expect(await page.evaluate(key=>sessionStorage.getItem(key),key)).toBe(raw);await expect.poll(()=>copy.evaluate(node=>node.contains(document.activeElement))).toBe(true);
   await options.last().scrollIntoViewIfNeeded();await expectNoHorizontalOverflow(page);await page.screenshot({path:info.outputPath('modal-destination-padding-'+language+'.png'),animations:'disabled'});
   await copy.getByRole('button',{name:text.cancel,exact:true}).click();await page.getByRole('dialog').last().getByRole('button',{name:en?'Discard':'Descartar',exact:true}).click();await expect(copy).toHaveCount(0);expect(await page.evaluate(key=>sessionStorage.getItem(key),key)).toBeNull();
   expect(seen.writes).toEqual([]);expect(seen.errors).toEqual([]);await unchanged(f,business,documents);
  }finally{await page.goto('about:blank').catch(()=>{});await cleanupDestinationCopy(f);}
 });
}

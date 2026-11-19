import {test,expect,type Page} from 'playwright/test';
import {publicationCopyFixture,cleanupPublicationCopy,copyBusiness,estimateRows,json} from './private-estimate-publication-copy-fixture';
import {stabilizeLocalProRuntime} from './pro-local-stable-runtime';
import {gotoOK,expectNoHorizontalOverflow,onAppPageError} from './helpers';

async function reloadActual(page:Page){
 const before=await page.evaluate(()=>performance.timeOrigin);
 const accept=async(dialog:import('playwright/test').Dialog)=>{expect(dialog.type()).toBe('beforeunload');await dialog.accept();};
 page.once('dialog',accept);
 try{expect((await page.reload())?.status()).toBe(200);}finally{page.off('dialog',accept);}
 expect(await page.evaluate(()=>performance.timeOrigin)).not.toBe(before);
}

for(const language of ['es','en'] as const){
 test(`Publication copy journey: historical A becomes editable C after GET-only recovery while newer B stays untouched (${language})`,async({page,browser,baseURL},info)=>{
  test.setTimeout(240000);
  const f=await publicationCopyFixture(page.context(),browser),en=language==='en',errors:string[]=[],posts:string[]=[],privatePosts:string[]=[];
  const journal='ccr:pro:private-estimate-publication-copy-write:v1:'+f.owner.id;
  const draftKey='ccr:pro:private-estimate-draft:v1:'+f.owner.id+':'+f.estimateB.id;
  let releaseLost:()=>void=()=>{};
  const lost=new Promise<void>(resolve=>{releaseLost=resolve;});
  let lose=true,blockProof=true;
  try {
   expect(baseURL).toBe('http://127.0.0.1:3185');
   await stabilizeLocalProRuntime(page.context(),'http://127.0.0.1:3185');
   onAppPageError(page,message=>errors.push(message));
   page.on('request',request=>{if(new URL(request.url()).pathname==='/api/pro/private-estimates'&&request.method()==='POST')privatePosts.push(request.postData()!);});
   await page.route('**/api/pro/private-estimate-publication-copy**',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(request.method()==='POST'){
     posts.push(request.postData()!);
     if(lose){lose=false;const actual=await route.fetch();expect(actual.status()).toBe(200);await route.fulfill({status:503,json:{error:'LOCAL_COPY_ACK_LOST'}});releaseLost();return;}
    }
    if(request.method()==='GET'&&url.searchParams.get('view')==='action'&&posts.length&&blockProof){await route.fulfill({status:503,json:{error:'LOCAL_COPY_PROOF_UNAVAILABLE'}});return;}
    await route.continue();
   });
   const before=await copyBusiness(f),documents=await estimateRows(f);
   await gotoOK(page,`/${language}/dashboard/pro?tab=quotes`);
   const row=page.locator(`[data-sales-estimate="private_estimate:${f.estimateA.id}"]`);
   await expect(row).toContainText('HISTORICAL_PUBLICATION_A');
   await expect(row).toContainText(en?'Accepted':'Aceptada');await expect(row).not.toContainText('CURRENT_DRAFT_B');

   // Produce a real newer editor draft, then retain those exact validated bytes as
   // an independent local fixture while the historical publication is opened.
   await row.getByRole('button',{name:en?'Quote actions':'Acciones de cotización',exact:true}).click();
   await page.getByRole('menuitem',{name:en?'Edit draft':'Editar borrador',exact:true}).click();
   const form=page.locator('[data-private-estimate-form]'),title=form.getByLabel(en?'Service or title':'Servicio o título',{exact:true});
   await expect(title).toHaveValue('CURRENT_DRAFT_B');await title.fill('NEWER_LOCAL_B_UNSAVED');
   await expect.poll(()=>page.evaluate(key=>sessionStorage.getItem(key),draftKey)).not.toBeNull();
   const beta=await page.evaluate(key=>sessionStorage.getItem(key),draftKey);expect(JSON.parse(beta!).draft.title).toBe('NEWER_LOCAL_B_UNSAVED');
   await page.locator('[data-private-estimate-actions]').getByRole('button',{name:en?'Cancel':'Cancelar',exact:true}).click();
   await page.getByRole('dialog').last().getByRole('button',{name:en?'Discard changes':'Descartar cambios',exact:true}).click();
   await expect(form).toHaveCount(0);
   await page.evaluate(({key,raw})=>sessionStorage.setItem(key,raw),{key:draftKey,raw:beta!});

   const shared=page.getByRole('dialog',{name:en?'Shared quote':'Cotización compartida',exact:true});
   const copy=page.locator('[data-estimate-publication-copy-action]');
   const recovery=page.locator('[data-estimate-publication-copy-recovery]');
   const openSource=async()=>{await row.getByRole('button',{name:en?'Review shared version':'Revisar versión compartida',exact:true}).click();await expect(shared.locator(`[data-estimate-publication-document="${f.publication.publicationId}"]`)).toContainText('HISTORICAL_PUBLICATION_A');};
   await openSource();
   const create=copy.getByRole('button',{name:en?'Create draft from this version':'Crear borrador de esta versión',exact:true});
   await expect(create).toBeEnabled();
   await copy.scrollIntoViewIfNeeded();await expectNoHorizontalOverflow(page);
   await page.screenshot({path:info.outputPath('publication-copy-shared-idle-'+language+'.png'),animations:'disabled'});
   await create.click();
   await page.getByRole('dialog').last().getByRole('button',{name:en?'Cancel':'Cancelar',exact:true}).click();
   expect(posts).toEqual([]);expect(privatePosts).toEqual([]);expect(await estimateRows(f)).toEqual(documents);
   expect(await page.evaluate(key=>sessionStorage.getItem(key),draftKey)).toBe(beta);
   await create.click();await page.getByRole('dialog').last().getByRole('button',{name:en?'Create draft':'Crear borrador',exact:true}).click();
   await lost;
   const check=recovery.getByRole('button',{name:en?'Check saved copy':'Comprobar copia guardada',exact:true});
   await expect(check).toBeEnabled();expect(posts).toHaveLength(1);
   const exact=posts[0],input=JSON.parse(exact);
   expect(input).toMatchObject({publicationId:f.publication.publicationId,version:1,estimateRevision:1,contentHash:f.publication.contentHash});
   expect(input.targetEstimateId).not.toBe(f.estimateA.id);
   await reloadActual(page);
   await openSource();await expect(check).toBeEnabled();expect(posts).toEqual([exact]);
   expect(await page.evaluate(key=>sessionStorage.getItem(key),draftKey)).toBe(beta);
   blockProof=false;
   await check.click();
   const openCopy=recovery.getByRole('button',{name:en?'Open new draft':'Abrir nuevo borrador',exact:true});
   await expect(openCopy).toBeEnabled();
   await recovery.scrollIntoViewIfNeeded();await expectNoHorizontalOverflow(page);
   await page.screenshot({path:info.outputPath('publication-copy-confirmed-'+language+'.png'),animations:'disabled'});
   const retained=await page.evaluate(key=>localStorage.getItem(key),journal);expect(JSON.parse(retained!).phase).toBe('confirmed');
   expect(posts).toEqual([exact]);expect(privatePosts).toEqual([]);
   const copied=(await json(page.context(),{view:'detail',estimateId:input.targetEstimateId})).estimate;
   const full=(value:typeof copied)=>Object.fromEntries(Object.entries(value).filter(([key])=>!['id','revision','status','createdAt','updatedAt'].includes(key)));
   expect(full(copied)).toEqual(full(f.estimateA));expect(copied.issuer.issuerActivity).toBe('432100');
   expect(copied.client.phone).toBe('PRIVATE_PHONE_A');expect(copied.lines[0].catalogProductId).toBe(f.productId);
   await recovery.getByRole('button',{name:en?'Continue later':'Continuar después',exact:true}).click();
   await expect(shared).toHaveCount(0);
   expect(await page.evaluate(key=>localStorage.getItem(key),journal)).toBe(retained);
   expect(await page.evaluate(key=>sessionStorage.getItem(key),draftKey)).toBe(beta);
   await expectNoHorizontalOverflow(page);
   await page.screenshot({path:info.outputPath('publication-copy-list-'+language+'.png'),animations:'disabled'});
   await openSource();await expect(openCopy).toBeEnabled();await openCopy.click();
   await expect.poll(()=>page.evaluate(key=>localStorage.getItem(key),journal)).toBeNull();
   await expect(form).toBeVisible();await expect(title).toHaveValue('HISTORICAL_PUBLICATION_A');
   await expect(form.getByLabel(en?'Currency':'Moneda',{exact:true})).toHaveValue('USD');
   await expect(form.locator('div[aria-busy="true"]')).toHaveCount(0);
   await expect(form.getByRole('combobox',{name:en?'Customer':'Cliente',exact:true})).toHaveValue(f.clientId);
   await expect(form.getByRole('combobox',{name:en?'Customer':'Cliente',exact:true}).locator('option:checked')).toHaveText('HISTORICAL_CLIENT_A');
   await expect(form.getByRole('alert')).toHaveCount(0);
   expect(await page.evaluate(key=>sessionStorage.getItem(key),draftKey)).toBe(beta);
   await expectNoHorizontalOverflow(page);
   await page.screenshot({path:info.outputPath('publication-copy-editable-C-'+language+'.png'),animations:'disabled'});
   await title.fill('COPIED_C_EDITED');
   await page.locator('[data-private-estimate-actions]').getByRole('button',{name:en?'Save draft':'Guardar borrador',exact:true}).click();
   await expect(form).toHaveCount(0);
   expect(privatePosts).toHaveLength(1);expect(JSON.parse(privatePosts[0])).toMatchObject({action:'save',estimateId:input.targetEstimateId,revision:1,title:'COPIED_C_EDITED',currency:'USD'});
   expect((await json(page.context(),{view:'detail',estimateId:input.targetEstimateId})).estimate).toMatchObject({revision:2,title:'COPIED_C_EDITED'});
   const after=await estimateRows(f);
   for(const [table,oldRows] of Object.entries(documents)){
    expect((after[table] as Record<string,unknown>[]).filter(record=>(table==='pro_private_estimates'?record.id:table==='pro_private_estimate_actions'?(record.input as {estimateId:string}).estimateId:record.estimate_id)!==input.targetEstimateId),table).toEqual(oldRows);
   }
   expect(await copyBusiness(f)).toEqual(before);expect(posts).toEqual([exact]);
   expect(await page.evaluate(key=>sessionStorage.getItem(key),draftKey)).toBe(beta);
   expect(await f.db.from('professionals').select('id').eq('profile_id',f.owner.id).then(result=>result.data)).toEqual([]);
   expect(errors).toEqual([]);
  } catch(error){await page.screenshot({path:info.outputPath('publication-copy-failure-'+language+'.png'),animations:'disabled'}).catch(()=>{});throw error;}
  finally {await page.goto('about:blank').catch(()=>{});await cleanupPublicationCopy(f);}
 });
}

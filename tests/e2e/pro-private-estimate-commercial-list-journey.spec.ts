import {test,expect} from 'playwright/test';
import {commercialFixture,cleanupCommercial,local,savedDraft,publishState,post,estimates,publications,snapshot,state,oldDocuments,estimateRows,publicationRows} from './private-estimate-commercial-list-fixture';
import {stabilizeLocalProRuntime} from './pro-local-stable-runtime';
import {gotoOK,expectNoHorizontalOverflow,onAppPageError} from './helpers';

for(const language of ['es','en'] as const){
 test(`Commercial quote list journey: shared versions stay immutable while the current draft is edited separately (${language})`,async({page,browser,baseURL},info)=>{
  test.setTimeout(240000);local(baseURL);const en=language==='en',f=await commercialFixture(page.context(),browser),clientPage=await f.recipientContext.newPage();
  const errors:string[]=[],ownerWrites:string[]=[],privateDetailReads:string[]=[];
  try {
   await stabilizeLocalProRuntime(page.context(),'http://127.0.0.1:3185');await stabilizeLocalProRuntime(f.recipientContext,'http://127.0.0.1:3185');
   const draft=await savedDraft(page.context(),f,{title:'PUBLICADA A · reparación eléctrica',notes:'VERSION_1_SNAPSHOT'}),first=await publishState(page.context(),f,draft,'awaiting_claim');
   onAppPageError(page,message=>errors.push(message));onAppPageError(clientPage,message=>errors.push(message));
   page.on('request',request=>{const url=new URL(request.url());if(request.method()==='GET'&&url.pathname===estimates&&url.searchParams.get('view')==='detail')privateDetailReads.push(url.searchParams.get('estimateId')??'');if(['POST','PATCH','PUT','DELETE'].includes(request.method())&&url.pathname.startsWith('/api/pro/'))ownerWrites.push(request.method()+' '+url.pathname);});
   await gotoOK(page,`/${language}/dashboard/pro?tab=quotes`);
   const row=page.locator(`[data-sales-estimate="private_estimate:${draft.estimate.id}"]`);
   await expect(row).toContainText('PUBLICADA A · reparación eléctrica');await expect(row).toContainText(en?'Shared · waiting for the customer':'Compartida · esperando al cliente');
   expect(privateDetailReads).toEqual([]);

   // Claiming a manually delivered code is not acceptance.
   await gotoOK(clientPage,`/${language}/dashboard/cotizaciones`);
   const client=clientPage.locator('[data-estimate-publications]'),claim=client.locator('[data-estimate-claim-form]');
   await claim.getByLabel(en?'Access code':'Código de acceso',{exact:true}).fill(first.input.recipient.code);
   await claim.getByRole('button',{name:en?'Use code':'Usar código',exact:true}).click();
   await clientPage.getByRole('dialog').last().getByRole('button',{name:en?'Use code':'Usar código',exact:true}).click();
   await expect(client.locator('[data-estimate-publication-detail]').getByRole('button',{name:en?'Accept quote':'Aceptar cotización',exact:true})).toBeEnabled();
   await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
   await expect(row).toContainText(en?'Shared':'Compartida');
   const initialClientDetail=client.locator('[data-estimate-publication-detail]');
   await initialClientDetail.getByLabel(en?'Requested changes':'Cambios solicitados',{exact:true}).fill('Solicito aclarar la versión inicial');
   await initialClientDetail.getByRole('button',{name:en?'Request changes':'Solicitar cambios',exact:true}).click();
   await clientPage.getByRole('dialog').last().getByRole('button',{name:en?'Request changes':'Solicitar cambios',exact:true}).click();
   await expect.poll(()=>clientPage.evaluate(key=>localStorage.getItem(key),'ccr:pro:private-estimate-publication-write:v1:'+f.recipient.id)).toBeNull();
   await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
   await expect(row).toContainText(en?'Changes requested':'Cambios solicitados');
   await row.getByRole('button',{name:en?'Review shared version':'Revisar versión compartida',exact:true}).click();
   const sharedModal=page.getByRole('dialog',{name:en?'Shared quote':'Cotización compartida',exact:true}),review=sharedModal.locator('[data-private-estimate-publication-review]');
   const firstDocument=review.locator(`[data-estimate-publication-document="${first.publication.publicationId}"]`);
   await expect(firstDocument).toContainText('VERSION_1_SNAPSHOT');expect(privateDetailReads).toEqual([]);
   await review.getByLabel(en?'Reply':'Respuesta',{exact:true}).fill('OWNER_BETA_UNSENT_REPLY');
   const publicationDraftKey='ccr:pro:estimate-publication-draft:v1:'+f.owner.id+':'+draft.estimate.id;
   const betaRaw=await page.evaluate(key=>sessionStorage.getItem(key),publicationDraftKey);expect(betaRaw).not.toBeNull();

   const update={...draft.input,actionId:crypto.randomUUID(),revision:1,notes:'VERSION_2_SNAPSHOT'};
   expect((await post(page.context(),f.owner,update)).status()).toBe(200);
   const next={action:'publish',actionId:crypto.randomUUID(),publicationId:crypto.randomUUID(),estimateId:draft.estimate.id,estimateRevision:2,recipient:{kind:'existing',recipientId:f.recipient.id}};
   expect((await post(page.context(),f.owner,next,publications)).status()).toBe(200);
   await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
   await expect(firstDocument).toContainText(en?'Replaced by a newer version':'Reemplazada por una versión nueva');
   await expect(firstDocument).toContainText('VERSION_1_SNAPSHOT');await expect(firstDocument).not.toContainText('VERSION_2_SNAPSHOT');expect(privateDetailReads).toEqual([]);
   await expect(review.getByLabel(en?'Reply':'Respuesta',{exact:true})).toHaveCount(0);
   expect(await page.evaluate(key=>sessionStorage.getItem(key),publicationDraftKey)).toBe(betaRaw);
   const discard=review.getByRole('button',{name:en?'Discard unsent details':'Descartar datos sin enviar',exact:true});
   await expect(discard).toBeEnabled();
   const documentsBeforeDiscard=await estimateRows(f),publicationsBeforeDiscard=await publicationRows(f);
   const journalsBeforeDiscard=await page.evaluate(()=>Object.fromEntries(Object.keys(localStorage).filter(key=>key.startsWith('ccr:pro:')).toSorted().map(key=>[key,localStorage.getItem(key)])));
   await discard.click();
   await page.getByRole('dialog').last().getByRole('button',{name:en?'Cancel':'Cancelar',exact:true}).click();
   expect(await page.evaluate(key=>sessionStorage.getItem(key),publicationDraftKey)).toBe(betaRaw);expect(ownerWrites).toEqual([]);
   await discard.click();await page.getByRole('dialog').last().getByRole('button',{name:en?'Discard':'Descartar',exact:true}).click();
   await expect.poll(()=>page.evaluate(key=>sessionStorage.getItem(key),publicationDraftKey)).toBeNull();
   expect(await page.evaluate(()=>Object.fromEntries(Object.keys(localStorage).filter(key=>key.startsWith('ccr:pro:')).toSorted().map(key=>[key,localStorage.getItem(key)])))).toEqual(journalsBeforeDiscard);
   expect(await estimateRows(f)).toEqual(documentsBeforeDiscard);expect(await publicationRows(f)).toEqual(publicationsBeforeDiscard);expect(ownerWrites).toEqual([]);
   await expect(firstDocument).toContainText('VERSION_1_SNAPSHOT');
   await sharedModal.getByRole('button',{name:en?'Close':'Cerrar',exact:true}).filter({hasText:en?/^Close$/:/^Cerrar$/}).click();
   await expect(sharedModal).toHaveCount(0);
   await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(row).toContainText(en?'Version 2':'Versión 2');

   await clientPage.evaluate(()=>window.dispatchEvent(new Event('focus')));
   await client.locator(`[data-estimate-publication="${next.publicationId}"]`).getByRole('button',{name:en?'Review version':'Revisar versión',exact:true}).click();
   const clientDetail=client.locator('[data-estimate-publication-detail]');
   await expect(clientDetail).toContainText('VERSION_2_SNAPSHOT');
   await clientDetail.getByRole('button',{name:en?'Accept quote':'Aceptar cotización',exact:true}).click();
   await clientPage.getByRole('dialog').last().getByRole('button',{name:en?'Accept quote':'Aceptar cotización',exact:true}).click();
   await expect.poll(()=>clientPage.evaluate(key=>localStorage.getItem(key),'ccr:pro:private-estimate-publication-write:v1:'+f.recipient.id)).toBeNull();
   const clientB=await page.request.get(estimates+'?'+new URLSearchParams({view:'context',clientId:f.secondClient}));expect(clientB.status()).toBe(200);
   const draftB={...update,actionId:crypto.randomUUID(),revision:2,clientId:f.secondClient,clientFingerprint:(await clientB.json()).clientFingerprint,refreshClient:true,title:'BORRADOR B · servicio diferente',notes:'PRIVATE_DRAFT_B_NOT_PUBLISHED',currency:'CRC',lines:[{...draft.input.lines[0],qtyMilli:1000,unitPriceCents:100000,discountBps:0,taxBps:0}]};
   expect((await post(page.context(),f.owner,draftB)).status()).toBe(200);
   const bare=await savedDraft(page.context(),f,{title:'Sólo borrador sin compartir'});
   const before=await snapshot(f),privateBefore=await state(f),old=await oldDocuments(f),draftsBefore=await estimateRows(f),publicationsBefore=await publicationRows(f);
   await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
   await expect(row).toContainText(en?'Accepted':'Aceptada');await expect(row).toContainText('PUBLICADA A · reparación eléctrica');await expect(row).toContainText('Cliente privado sin cuenta');await expect(row).toContainText(en?'24.72':'24,72');
   await expect(row).not.toContainText('BORRADOR B');await expect(row).not.toContainText('Cliente alternativo');await expect(row).not.toContainText(en?'1,000.00':'1.000,00');
   const filters=page.getByRole('group',{name:en?'Quote status':'Estado de cotizaciones',exact:true});
   await expect(filters.getByRole('button')).toHaveCount(4);
   await filters.getByRole('button',{name:en?'Drafts':'Borradores',exact:true}).click();await expect(row).toHaveCount(0);await expect(page.locator(`[data-sales-estimate="private_estimate:${bare.estimate.id}"]`)).toBeVisible();
   await filters.getByRole('button',{name:en?'Accepted':'Aceptadas',exact:true}).click();await expect(row).toBeVisible();
   await expect(filters.getByRole('button',{name:en?'Accepted':'Aceptadas',exact:true})).toHaveAttribute('aria-pressed','true');
   await expectNoHorizontalOverflow(page);await filters.scrollIntoViewIfNeeded();
   await page.screenshot({path:info.outputPath('commercial-list-filters-'+language+'.png'),animations:'disabled',fullPage:true});
   await row.getByRole('button',{name:en?'Review shared version':'Revisar versión compartida',exact:true}).click();
   const acceptedDocument=review.locator(`[data-estimate-publication-document="${next.publicationId}"]`);
   await expect(acceptedDocument).toContainText('VERSION_2_SNAPSHOT');await expect(acceptedDocument).not.toContainText('PRIVATE_DRAFT_B_NOT_PUBLISHED');await expect(acceptedDocument).toContainText('Cliente privado sin cuenta');
   expect(privateDetailReads).toEqual([]);await expectNoHorizontalOverflow(page);
   await sharedModal.getByRole('heading',{name:en?'Shared quote':'Cotización compartida',exact:true}).scrollIntoViewIfNeeded();
   await page.screenshot({path:info.outputPath('commercial-list-shared-'+language+'.png'),animations:'disabled'});
   await sharedModal.getByRole('button',{name:en?'Close':'Cerrar',exact:true}).filter({hasText:en?/^Close$/:/^Cerrar$/}).click();await expect(sharedModal).toHaveCount(0);

   await row.getByRole('button',{name:en?'View draft':'Ver borrador',exact:true}).click();
   const currentPreview=page.locator('[data-private-estimate-preview]');
   await expect(currentPreview).toContainText(draftB.title);await expect(currentPreview).toContainText('Cliente alternativo');await expect(currentPreview).toContainText('PRIVATE_DRAFT_B_NOT_PUBLISHED');
   expect(privateDetailReads.length).toBeGreaterThan(0);expect(privateDetailReads.every(id=>id===draft.estimate.id)).toBe(true);
   await page.getByRole('dialog',{name:en?'Quote preview':'Vista previa de la cotización',exact:true}).getByRole('button',{name:en?'Close':'Cerrar',exact:true}).filter({hasText:en?/^Close$/:/^Cerrar$/}).click();
   await row.getByRole('button',{name:en?'Quote actions':'Acciones de cotización',exact:true}).click();
   await page.getByRole('menuitem',{name:en?'Edit draft':'Editar borrador',exact:true}).click();
   const form=page.locator('[data-private-estimate-form]'),title=form.getByLabel(en?'Service or title':'Servicio o título',{exact:true});
   await expect(title).toHaveValue(draftB.title);await expect(form.getByRole('combobox',{name:en?'Customer':'Cliente',exact:true})).toHaveValue(f.secondClient);await expect(form.getByLabel(en?'Currency':'Moneda',{exact:true})).toHaveValue('CRC');
   await title.fill('BORRADOR_B_LOCAL_SIN_GUARDAR');
   const actions=page.locator('[data-private-estimate-actions]');await actions.getByRole('button',{name:en?'Cancel':'Cancelar',exact:true}).click();
   await page.getByRole('dialog').last().getByRole('button',{name:en?'Keep editing':'Seguir editando',exact:true}).click();await expect(title).toHaveValue('BORRADOR_B_LOCAL_SIN_GUARDAR');
   await actions.getByRole('button',{name:en?'Cancel':'Cancelar',exact:true}).click();await page.getByRole('dialog').last().getByRole('button',{name:en?'Discard changes':'Descartar cambios',exact:true}).click();await expect(form).toHaveCount(0);
   expect(ownerWrites).toEqual([]);expect(errors).toEqual([]);expect(await snapshot(f)).toEqual(before);expect(await state(f)).toEqual(privateBefore);expect(await oldDocuments(f)).toEqual(old);expect(await estimateRows(f)).toEqual(draftsBefore);expect(await publicationRows(f)).toEqual(publicationsBefore);
  } catch(error){await page.screenshot({path:info.outputPath('commercial-list-failure.png'),animations:'disabled'}).catch(()=>{});throw error;}
  finally {await page.goto('about:blank').catch(()=>{});await clientPage.goto('about:blank').catch(()=>{});await cleanupCommercial(f);}
 });
}

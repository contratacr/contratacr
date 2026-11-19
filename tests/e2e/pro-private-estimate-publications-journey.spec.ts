import {test,expect,type Page} from 'playwright/test';
import {createDisposableAccount,cleanupDisposableAccount} from './disposable-account';
import {fixture,cleanup,local,login,post,json,snapshot,state,oldDocuments,estimateInput} from './pro-private-estimate-publications-fixture';
import {stabilizeLocalProRuntime} from './pro-local-stable-runtime';
import {gotoOK,expectNoHorizontalOverflow,onAppPageError} from './helpers';
const endpoint='/api/pro/private-estimate-publications';
async function reloadActual(page:Page){
 const before=await page.evaluate(()=>performance.timeOrigin);
 const accept=async(dialog:import('playwright/test').Dialog)=>{expect(dialog.type()).toBe('beforeunload');await dialog.accept();};
 page.once('dialog',accept);
 try{expect((await page.reload())?.status()).toBe(200);}finally{page.off('dialog',accept);}
 expect(await page.evaluate(()=>performance.timeOrigin)).not.toBe(before);
}
for(const language of ['es','en'] as const){
 test(`Private quote sharing journey: manual delivery, requested changes and explicit acceptance of a new version (${language})`,async({page,browser,baseURL},info)=>{
  test.setTimeout(240000);local(baseURL);const en=language==='en',f=await fixture(page.context()),client=await createDisposableAccount({prefix:'publication-ui-client'});
  const clientContext=await browser.newContext({baseURL}),clientPage=await clientContext.newPage(),ownerPosts:string[]=[],clientPosts:string[]=[],errors:string[]=[];
  try {
   await stabilizeLocalProRuntime(page.context(),'http://127.0.0.1:3185');
   await stabilizeLocalProRuntime(clientContext,'http://127.0.0.1:3185');await login(clientContext,client);
   const ctx=await json(page.context(),{view:'context',clientId:f.clientId}),savedInput=estimateInput(ctx,{validUntil:'2030-12-31'}),saved=await post(page.context(),f.owner,savedInput);expect(saved.status()).toBe(200);
   const estimate=(await saved.json()).estimate,before=await snapshot(f),privateBefore=await state(f),old=await oldDocuments(f);
   onAppPageError(page,message=>errors.push(message));onAppPageError(clientPage,message=>errors.push(message));
   let lose=true,blockProof=true,resolveLost:()=>void=()=>{};
   const lost=new Promise<void>(resolve=>{resolveLost=resolve;});
   await page.route('**/api/pro/private-estimate-publications**',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(request.method()==='POST'){
     ownerPosts.push(request.postData()!);
     if(request.postDataJSON().action==='publish'&&lose){lose=false;const actual=await route.fetch();expect(actual.status()).toBe(200);await route.fulfill({status:503,json:{error:'LOCAL_PUBLICATION_ACK_LOST'}});resolveLost();return;}
    }
    if(request.method()==='GET'&&url.searchParams.get('view')==='action'&&ownerPosts.length&&blockProof){await route.fulfill({status:503,json:{error:'LOCAL_PUBLICATION_PROOF_UNAVAILABLE'}});return;}
    await route.continue();
   });
   clientPage.on('request',request=>{if(new URL(request.url()).pathname===endpoint&&request.method()==='POST')clientPosts.push(request.postData()!);});
   let loseChanges=true,blockChangesProof=false;
   await clientPage.route('**/api/pro/private-estimate-publications**',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(request.method()==='POST'&&request.postDataJSON().action==='request_changes'&&loseChanges){loseChanges=false;blockChangesProof=true;const actual=await route.fetch();expect(actual.status()).toBe(200);await route.fulfill({status:503,json:{error:'LOCAL_CHANGES_ACK_LOST'}});return;}
    if(request.method()==='GET'&&url.searchParams.get('view')==='action'&&blockChangesProof){await route.fulfill({status:503,json:{error:'LOCAL_CHANGES_PROOF_UNAVAILABLE'}});return;}
    await route.continue();
   });
   await gotoOK(page,`/${language}/dashboard/pro?tab=quotes`);
   const row=page.locator(`[data-sales-estimate="private_estimate:${estimate.id}"]`);
   await row.getByRole('button',{name:en?'Preview':'Vista previa',exact:true}).click();
   const owner=page.locator('[data-estimate-publications]');
   await owner.getByRole('button',{name:en?'Share':'Compartir',exact:true}).click();
   const share=owner.locator('[data-estimate-share-form]');
   await share.getByLabel(en?'Customer email':'Correo del cliente',{exact:true}).fill(client.email);
   await share.getByRole('button',{name:en?'Share version':'Compartir versión',exact:true}).click();
   await page.getByRole('dialog').last().getByRole('button',{name:en?'Share version':'Compartir versión',exact:true}).click();
   await lost;
   const recovery=owner.locator('[data-estimate-publication-recovery]');
   await expect(recovery.getByRole('button',{name:en?'Check saved result':'Comprobar guardado',exact:true})).toBeEnabled();
   expect(ownerPosts).toHaveLength(1);const exact=ownerPosts[0],publish=JSON.parse(exact),code=publish.recipient.code;
   // Round 2: readable code (20 Crockford base32 symbols = 100 random bits), shown in groups of five.
   expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{20}$/);const shown=code.match(/.{5}/g)!.join('-');
   expect(page.url()).not.toContain(code);
   await reloadActual(page);
   await row.getByRole('button',{name:en?'Review shared version':'Revisar versión compartida',exact:true}).click();
   await expect(recovery.getByRole('button',{name:en?'Check saved result':'Comprobar guardado',exact:true})).toBeEnabled();
   expect(ownerPosts).toEqual([exact]);blockProof=false;
   await recovery.getByRole('button',{name:en?'Check saved result':'Comprobar guardado',exact:true}).click();
   await expect(owner.locator('[data-estimate-publication-code]').getByLabel(en?'Access code':'Código de acceso',{exact:true})).toHaveValue(shown);
   expect(ownerPosts).toEqual([exact]);
   const handoff=owner.locator('[data-estimate-publication-code]'),link=new URL((en?'/en':'')+'/dashboard/cotizaciones',page.url()).href+'#cotizacion=cotizacion-privada-n';// Round 7A: the link names the quote (fragment only, never the code).
   await expect(recovery.getByRole('heading',{name:en?'Version ready to share':'Versión lista para compartir',exact:true})).toBeVisible();
   const linkField=handoff.getByLabel(en?'Customer link':'Enlace del cliente',{exact:true});
   await expect(linkField).toHaveValue(link);
   await expect(linkField).toHaveAttribute('readonly','');
   const parsedLink=new URL(await linkField.inputValue());
   expect(parsedLink.search).toBe('');expect(parsedLink.hash).toBe('#cotizacion=cotizacion-privada-n');expect(link).not.toContain(code);expect(link).not.toContain(shown);
   await page.evaluate(()=>{
    const state={values:[] as string[],fail:false};
    (window as unknown as {publicationClipboard:typeof state}).publicationClipboard=state;
    Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async(value:string)=>{if(state.fail)throw new Error('LOCAL_CLIPBOARD_DENIED');state.values.push(value);}}});
   });
   const copied=()=>page.evaluate(()=>(window as unknown as {publicationClipboard:{values:string[]}}).publicationClipboard.values);
   await handoff.getByRole('button',{name:en?'Copy code':'Copiar código',exact:true}).click();
   await expect.poll(copied).toEqual([shown]);
   await expect(handoff.getByRole('status')).toHaveText(en?'Code copied.':'Código copiado.');
   await handoff.getByRole('button',{name:en?'Copy customer link':'Copiar enlace del cliente',exact:true}).click();
   await expect.poll(copied).toEqual([shown,link]);
   await expect(handoff.getByRole('status')).toHaveText(en?'Customer link copied.':'Enlace del cliente copiado.');
   const journalKey='ccr:pro:private-estimate-publication-write:v1:'+f.owner.id,rawBeforeCopyFailure=await page.evaluate(key=>localStorage.getItem(key),journalKey);
   expect(rawBeforeCopyFailure).not.toBeNull();
   await page.evaluate(()=>(window as unknown as {publicationClipboard:{fail:boolean}}).publicationClipboard.fail=true);
   await handoff.getByRole('button',{name:en?'Copy code':'Copiar código',exact:true}).click();
   const codeField=handoff.getByLabel(en?'Access code':'Código de acceso',{exact:true});
   await expect(handoff.getByRole('status')).toHaveText(en?'Could not copy. Select and copy the text from the field.':'No se pudo copiar. Seleccione y copie el texto del campo.');
   await expect(codeField).toHaveValue(shown);await expect(codeField).toBeFocused();
   expect(await codeField.evaluate((field:HTMLInputElement)=>[field.selectionStart,field.selectionEnd])).toEqual([0,shown.length]);
   await handoff.getByRole('button',{name:en?'Copy customer link':'Copiar enlace del cliente',exact:true}).click();
   await expect(linkField).toBeFocused();
   expect(await linkField.evaluate((field:HTMLInputElement)=>[field.selectionStart,field.selectionEnd])).toEqual([0,link.length]);
   await expect(linkField).toHaveValue(link);
   expect(await page.evaluate(key=>localStorage.getItem(key),journalKey)).toBe(rawBeforeCopyFailure);
   expect(await copied()).toEqual([shown,link]);expect(ownerPosts).toEqual([exact]);
   await owner.locator('[data-estimate-publication-code]').scrollIntoViewIfNeeded();
   await expectNoHorizontalOverflow(page);
   await page.screenshot({path:info.outputPath('private-estimate-owner-handoff-'+language+'.png'),animations:'disabled'});
   await owner.locator('[data-estimate-publication-code]').getByRole('button',{name:en?'Done':'Listo',exact:true}).click();
   await expect(recovery).toHaveCount(0);
   await gotoOK(clientPage,`/${language}/dashboard/cotizaciones`);
   expect(clientPage.url()).not.toContain(code);expect(clientPage.url()).not.toContain(shown);
   const clientSurface=clientPage.locator('[data-estimate-publications]'),claim=clientSurface.locator('[data-estimate-claim-form]');
   await claim.getByLabel(en?'Access code':'Código de acceso',{exact:true}).fill(shown.toLowerCase());// typed as the customer reads it: dashes and case do not matter
   await claim.getByRole('button',{name:en?'Use code':'Usar código',exact:true}).click();
   await clientPage.getByRole('dialog').last().getByRole('button',{name:en?'Use code':'Usar código',exact:true}).click();
   const detail=clientSurface.locator('[data-estimate-publication-detail]');
   await expect(detail.getByRole('button',{name:en?'Accept quote':'Aceptar cotización',exact:true})).toBeEnabled();
   expect(clientPosts.map(body=>JSON.parse(body).action)).toEqual(['claim']);
   await expect(detail).toContainText(estimate.title);
   const changesNote=detail.getByLabel(en?'Requested changes':'Cambios solicitados',{exact:true}),clientDraftKey='ccr:pro:estimate-publication-draft:v1:'+client.id+':client';
   await changesNote.fill('Borrador Beta conservado para revisar');
   const betaRaw=await clientPage.evaluate(key=>sessionStorage.getItem(key),clientDraftKey);expect(betaRaw).not.toBeNull();
   await changesNote.fill('Solicito una aclaración del alcance');
   const changesSaved=clientPage.waitForResponse(response=>new URL(response.url()).pathname===endpoint&&response.request().method()==='POST'&&response.request().postDataJSON().action==='request_changes');
   await detail.getByRole('button',{name:en?'Request changes':'Solicitar cambios',exact:true}).click();
   await clientPage.getByRole('dialog').last().getByRole('button',{name:en?'Request changes':'Solicitar cambios',exact:true}).click();
   const changesResponse=await changesSaved;expect(changesResponse.status()).toBe(503);await changesResponse.finished();
   const clientRecovery=clientSurface.locator('[data-estimate-publication-recovery]');
   await expect(clientRecovery.getByRole('button',{name:en?'Check saved result':'Comprobar guardado',exact:true})).toBeEnabled();
   await clientPage.evaluate(({key,raw})=>sessionStorage.setItem(key,raw),{key:clientDraftKey,raw:betaRaw!});
   await reloadActual(clientPage);
   await expect(clientRecovery.getByRole('button',{name:en?'Check saved result':'Comprobar guardado',exact:true})).toBeEnabled();
   expect(clientPosts.map(body=>JSON.parse(body).action)).toEqual(['claim','request_changes']);
   blockChangesProof=false;
   await clientRecovery.getByRole('button',{name:en?'Check saved result':'Comprobar guardado',exact:true}).click();
   await expect(clientRecovery).toHaveCount(0);
   await clientSurface.locator(`[data-estimate-publication="${publish.publicationId}"]`).getByRole('button',{name:en?'Review version':'Revisar versión',exact:true}).click();
   await expect(changesNote).toHaveValue('Borrador Beta conservado para revisar');
   expect(await clientPage.evaluate(key=>sessionStorage.getItem(key),clientDraftKey)).toBe(betaRaw);
   await changesNote.fill('');
   await expect.poll(()=>clientPage.evaluate(key=>localStorage.getItem(key),'ccr:pro:private-estimate-publication-write:v1:'+client.id)).toBeNull();
   await expect.poll(()=>clientPosts.map(body=>JSON.parse(body).action)).toEqual(['claim','request_changes']);
   // The owner now reviews one immutable version, without the generic version list.
   const freshOwnerDetail=page.waitForResponse(response=>{const url=new URL(response.url());return response.request().method()==='GET'&&url.pathname===endpoint&&url.searchParams.get('view')==='detail'&&url.searchParams.get('publicationId')===publish.publicationId;});
   await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
   const refreshedOwner=await freshOwnerDetail;expect(refreshedOwner.status()).toBe(200);
   expect((await refreshedOwner.json()).publication).toMatchObject({publicationId:publish.publicationId,status:'changes_requested'});
   const ownerDetail=owner.locator('[data-estimate-publication-detail]');
   await expect(ownerDetail.locator(`[data-estimate-publication-document="${publish.publicationId}"]`)).toContainText(en?'Changes requested':'Cambios solicitados');
   await ownerDetail.getByLabel(en?'Reply':'Respuesta',{exact:true}).fill('Prepararemos una nueva versión aclarada');
   await ownerDetail.getByRole('button',{name:en?'Save reply':'Guardar respuesta',exact:true}).click();
   await page.getByRole('dialog').last().getByRole('button',{name:en?'Save reply':'Guardar respuesta',exact:true}).click();
   await expect(ownerDetail.getByRole('button',{name:en?'Withdraw version':'Retirar versión',exact:true})).toBeEnabled();
   await page.getByRole('dialog',{name:en?'Shared quote':'Cotización compartida',exact:true}).getByRole('button',{name:en?'Close':'Cerrar',exact:true}).filter({hasText:en?/^Close$/:/^Cerrar$/}).click();
   await row.getByRole('button',{name:en?'Quote actions':'Acciones de cotización',exact:true}).click();
   await page.getByRole('menuitem',{name:en?'Edit draft':'Editar borrador',exact:true}).click();
   const form=page.locator('[data-private-estimate-form]');
   await form.getByLabel(en?'Service or title':'Servicio o título',{exact:true}).fill('Alcance aclarado para aceptación explícita');
   await page.locator('[data-private-estimate-actions]').getByRole('button',{name:en?'Save draft':'Guardar borrador',exact:true}).click();
   await expect(form).toHaveCount(0);
   await row.getByRole('button',{name:en?'View draft':'Ver borrador',exact:true}).click();
   await owner.getByRole('button',{name:en?'Share':'Compartir',exact:true}).click();
   await share.getByLabel(en?'Sharing recipient':'Destinatario de la cotización',{exact:true}).selectOption('existing');
   await share.getByRole('button',{name:en?'Share version':'Compartir versión',exact:true}).click();
   await page.getByRole('dialog').last().getByRole('button',{name:en?'Share version':'Compartir versión',exact:true}).click();
   await expect.poll(()=>ownerPosts.filter(body=>JSON.parse(body).action==='publish').length).toBe(2);
   const latest=JSON.parse(ownerPosts.at(-1)!);
   await expect(owner.locator(`[data-estimate-publication="${latest.publicationId}"]`)).toBeVisible();
   await reloadActual(clientPage);
   const latestCard=clientSurface.locator(`[data-estimate-publication="${latest.publicationId}"]`);
   await latestCard.getByRole('button',{name:en?'Review version':'Revisar versión',exact:true}).click();
   await expect(detail).toContainText('Alcance aclarado para aceptación explícita');
   await detail.getByRole('button',{name:en?'Accept quote':'Aceptar cotización',exact:true}).click();
   await clientPage.getByRole('dialog').last().getByRole('button',{name:en?'Accept quote':'Aceptar cotización',exact:true}).click();
   await expect(detail.getByRole('button',{name:en?'Accept quote':'Aceptar cotización',exact:true})).toHaveCount(0);
   await detail.getByRole('button',{name:en?'History':'Historial',exact:true}).click();
   await expect(detail.locator('[data-estimate-publication-history]')).toContainText(en?'Accepted':'Aceptada');
   await expectNoHorizontalOverflow(clientPage);await detail.scrollIntoViewIfNeeded();
   await clientPage.screenshot({path:info.outputPath('private-estimate-client-accepted-'+language+'.png'),animations:'disabled'});
   expect(clientPosts.map(body=>JSON.parse(body).action)).toEqual(['claim','request_changes','accept']);
   expect(ownerPosts.map(body=>JSON.parse(body).action)).toEqual(['publish','respond_changes','publish']);
   expect(await snapshot(f)).toEqual(before);expect(await state(f)).toEqual(privateBefore);expect(await oldDocuments(f)).toEqual(old);
   expect((await f.db.from('professionals').select('*').eq('profile_id',f.owner.id).throwOnError()).data).toEqual([]);expect(errors).toEqual([]);
  } catch(error){await page.screenshot({path:info.outputPath('publication-owner-failure.png'),animations:'disabled'}).catch(()=>{});await clientPage.screenshot({path:info.outputPath('publication-client-failure.png'),animations:'disabled'}).catch(()=>{});throw error;}
  finally {await page.goto('about:blank').catch(()=>{});await clientPage.goto('about:blank').catch(()=>{});await clientContext.close();await cleanupDisposableAccount(client);await cleanup(f);}
 });
}

import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {test,expect,type Page} from 'playwright/test';
import {workFixture,cleanupWorkFixture,local,post,json,snapshot,state,oldDocuments,estimateRows,assertOnlyWorkAppend,workEndpoint,publicationsEndpoint} from './private-estimate-work-fixture';
import {estimateInput} from './pro-private-estimate-publications-fixture';
import {stabilizeLocalProRuntime} from './pro-local-stable-runtime';
import {gotoOK,expectNoHorizontalOverflow,onAppPageError} from './helpers';
async function reloadActual(page:Page){
 const timeOrigin=await page.evaluate(()=>performance.timeOrigin),accept=async(dialog:import('playwright/test').Dialog)=>{expect(dialog.type()).toBe('beforeunload');await dialog.accept();};
 page.once('dialog',accept);try{expect((await page.reload())?.status()).toBe(200);}finally{page.off('dialog',accept);}
 expect(await page.evaluate(()=>performance.timeOrigin)).not.toBe(timeOrigin);
}
for(const language of ['es','en'] as const){
 test(`Accepted quote job journey: finished handoff and exact recovery open one unscheduled job (${language})`,async({page,browser,baseURL},info)=>{
  test.setTimeout(240000);local(baseURL);const en=language==='en',f=await workFixture(page.context(),browser),workBodies:string[]=[],publicationBodies:string[]=[],errors:string[]=[],mutations:string[]=[];
  try {
   await stabilizeLocalProRuntime(page.context(),'http://127.0.0.1:3185');
   const ctx=await json(page.context(),{view:'context',clientId:f.clientId}),input=estimateInput(ctx,{currency:en?'USD':'CRC',validUntil:'2030-12-31'}),saved=await post(page.context(),f.owner,input);expect(saved.status()).toBe(200);const estimate=(await saved.json()).estimate;
   onAppPageError(page,message=>errors.push(message));
   page.on('request',request=>{if(['POST','PATCH','PUT','DELETE'].includes(request.method())&&new URL(request.url()).pathname.startsWith('/api/pro/'))mutations.push(request.method()+' '+new URL(request.url()).pathname);});
   page.on('request',request=>{if(new URL(request.url()).pathname===publicationsEndpoint&&request.method()==='POST')publicationBodies.push(request.postData()!);});
   let lose=true,blockProof=true,resolveLost:()=>void=()=>{};
   const lost=new Promise<void>(resolve=>{resolveLost=resolve;});
   await page.route('**/api/pro/private-estimate-work**',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(request.method()==='POST'){
     workBodies.push(request.postData()!);
     if(lose){lose=false;const response=await route.fetch();expect(response.status()).toBe(200);await route.fulfill({status:503,json:{error:'LOCAL_ACCEPTED_WORK_ACK_LOST'}});resolveLost();return;}
    }
    if(request.method()==='GET'&&url.searchParams.get('view')==='action'&&workBodies.length&&blockProof){await route.fulfill({status:503,json:{error:'LOCAL_ACCEPTED_WORK_PROOF_UNAVAILABLE'}});return;}
    await route.continue();
   });
   await gotoOK(page,`/${language}/dashboard/pro?tab=quotes`);
   const row=page.locator(`[data-sales-estimate="private_estimate:${estimate.id}"]`);
   await row.getByRole('button',{name:en?'Preview':'Vista previa',exact:true}).click();
   const publications=page.locator('[data-estimate-publications]');
   await publications.getByRole('button',{name:en?'Share':'Compartir',exact:true}).click();
   const share=publications.locator('[data-estimate-share-form]');
   await share.getByLabel(en?'Customer email':'Correo del cliente',{exact:true}).fill(f.recipient.email);
   await share.getByRole('button',{name:en?'Share version':'Compartir versión',exact:true}).click();
   await page.getByRole('dialog').last().getByRole('button',{name:en?'Share version':'Compartir versión',exact:true}).click();
   const handoff=publications.locator('[data-estimate-publication-code]');
   await expect(handoff.getByLabel(en?'Access code':'Código de acceso',{exact:true})).toBeVisible();
   expect(publicationBodies).toHaveLength(1);const published=JSON.parse(publicationBodies[0]),code=await handoff.getByLabel(en?'Access code':'Código de acceso',{exact:true}).inputValue();
   expect(page.url()).not.toContain(code);
   const claim=await post(f.recipientContext,f.recipient,{action:'claim',actionId:crypto.randomUUID(),code},publicationsEndpoint);expect(claim.status()).toBe(200);const shared=(await claim.json()).publication;
   const accepted=await post(f.recipientContext,f.recipient,{action:'accept',actionId:crypto.randomUUID(),publicationId:shared.publicationId,revision:shared.revision,contentHash:shared.contentHash},publicationsEndpoint);expect(accepted.status()).toBe(200);
   const publicationRecovery=publications.locator('[data-estimate-publication-recovery]');
   await publicationRecovery.getByRole('button',{name:en?'Check saved result':'Comprobar guardado',exact:true}).click();
   await expect(handoff).toHaveCount(0);
   // A claimed code must disappear without trapping its verified owner journal.
   await expect(publicationRecovery.getByRole('button',{name:en?'Done':'Listo',exact:true})).toBeEnabled();
   await publicationRecovery.getByRole('button',{name:en?'Done':'Listo',exact:true}).click();
   await expect.poll(()=>page.evaluate(key=>localStorage.getItem(key),'ccr:pro:private-estimate-publication-write:v1:'+f.owner.id)).toBeNull();
   await expect(publicationRecovery).toHaveCount(0);expect(publicationBodies).toHaveLength(1);
   const before=await snapshot(f),privateBefore=await state(f),old=await oldDocuments(f),documents=await estimateRows(f);
   const action=publications.locator('[data-private-estimate-work-action]');
   await action.getByRole('button',{name:en?'Continue to job':'Continuar al trabajo',exact:true}).click();
   const form=action.locator('[data-private-estimate-work-form]');
   await expect(form.getByLabel(en?'Job':'Trabajo',{exact:true})).toHaveValue('new');
   await expect(form).toContainText(en?'Quote amount':'Importe de la cotización');
   await expect(form).toContainText(en?'USD 24.72':'₡24,72');
   await form.getByRole('button',{name:en?'Continue to job':'Continuar al trabajo',exact:true}).click();
   await page.getByRole('dialog').last().getByRole('button',{name:en?'Continue to job':'Continuar al trabajo',exact:true}).click();
   await lost;
   const recovery=action.locator('[data-private-estimate-work-recovery]');
   await expect(recovery.getByRole('button',{name:en?'Check job link':'Comprobar vínculo del trabajo',exact:true})).toBeEnabled();
   expect(workBodies).toHaveLength(1);const exact=workBodies[0],command=JSON.parse(exact),journal='ccr:pro:private-estimate-work-write:v1:'+f.owner.id;
   expect(command).toMatchObject({publicationId:published.publicationId,target:{kind:'new',conversionActionId:null,leadRevision:null}});
   await reloadActual(page);
   await row.getByRole('button',{name:en?'Review shared version':'Revisar versión compartida',exact:true}).click();
   await expect(page.locator('[data-private-estimate-publication-review]').locator(`[data-estimate-publication-document="${published.publicationId}"]`)).toBeVisible();
   await expect(recovery.getByRole('button',{name:en?'Check job link':'Comprobar vínculo del trabajo',exact:true})).toBeEnabled();expect(workBodies).toEqual([exact]);blockProof=false;
   await recovery.getByRole('button',{name:en?'Check job link':'Comprobar vínculo del trabajo',exact:true}).click();
   await expect.poll(()=>(new URL(page.url()).searchParams.get('cita')??(decodeURIComponent(new URL(page.url()).pathname.split('/trabajo/')[1]?.split('/')[0]??'')||null))).toBe(command.target.workId);
   await expect.poll(()=>page.evaluate(key=>localStorage.getItem(key),journal)).toBeNull();expect(workBodies).toEqual([exact]);
   await expect(page.locator('[data-work-stage]')).toHaveText(en?'Quote accepted':'Cotización aceptada');await expect(page.locator('[data-work-period]')).toHaveText(en?'Not scheduled':'Sin programar');
   await expect(page.locator('[data-work-tasks-summary]').getByRole('button',{name:en?'View tasks':'Ver tareas',exact:true})).toBeEnabled();
   const summary=page.locator('[data-work-accepted-estimate]');
   await expect(summary).toContainText(estimate.title);await expect(summary).toContainText(en?'Quote amount':'Importe de la cotización');
   await expect(summary).toContainText(en?'USD 24.72':'₡24,72');await expect(summary).not.toContainText(en?'Balance':'Saldo');
   await summary.getByRole('button',{name:en?'Review accepted version':'Revisar versión aceptada',exact:true}).click();
   const acceptedDialog=page.getByRole('dialog',{name:en?'Accepted quote':'Cotización aceptada',exact:true});
   const document=acceptedDialog.locator('[data-work-accepted-estimate-document]');
   await expect(document).toContainText(estimate.title);await expect(document).toContainText(estimate.notes);
   await expect(acceptedDialog.getByRole('button',{name:en?/^Edit(?: job)?$/:/^Editar(?: trabajo)?$/})).toHaveCount(0);
   await expectNoHorizontalOverflow(page);
   await acceptedDialog.getByRole('heading',{name:en?'Accepted quote':'Cotización aceptada',exact:true}).scrollIntoViewIfNeeded();
   await page.screenshot({path:info.outputPath('accepted-estimate-job-'+language+'.png'),animations:'disabled'});
   const downloadEvent=page.waitForEvent('download',{timeout:120000});await acceptedDialog.getByRole('button',{name:en?'Download PDF':'Descargar PDF',exact:true}).click();const download=await downloadEvent;
   expect(download.suggestedFilename()).toBe(`${en?'accepted-estimate':'cotizacion-aceptada'}-${published.publicationId.slice(0,8)}-v1.pdf`);
   const folder=join(process.cwd(),'tmp','pdfs');await mkdir(folder,{recursive:true});const file=join(folder,'accepted-estimate-work-'+language+'-'+info.project.name+'.pdf');await download.saveAs(file);expect(await download.failure()).toBeNull();await info.attach('accepted-estimate-work.pdf',{path:file,contentType:'application/pdf'});
   const mapping=await page.request.get(workEndpoint+'?'+new URLSearchParams({view:'mapping',publicationId:published.publicationId}));expect(mapping.status()).toBe(200);const result=await mapping.json();
   await assertOnlyWorkAppend(f,before,command.target.workId,1,result.agreement.createdAt);
   expect(await state(f)).toEqual(privateBefore);expect(await oldDocuments(f)).toEqual(old);expect(await estimateRows(f)).toEqual(documents);
   expect(publicationBodies).toHaveLength(1);expect(workBodies).toEqual([exact]);expect(mutations).toEqual(['POST '+publicationsEndpoint,'POST '+workEndpoint]);expect(errors).toEqual([]);
  } catch(error){await page.screenshot({path:info.outputPath('accepted-estimate-work-failure.png'),animations:'disabled'}).catch(()=>{});throw error;}
  finally {await page.goto('about:blank').catch(()=>{});await cleanupWorkFixture(f);}
 });
}

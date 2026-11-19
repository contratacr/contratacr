import {randomBytes} from 'node:crypto';
import {mkdir,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {test,expect} from 'playwright/test';
import {createDisposableAccount,cleanupDisposableAccount} from './disposable-account';
import {fixture,cleanup,local,login,post,json,snapshot,state,oldDocuments,estimateInput,estimateRows} from './pro-private-estimate-publications-fixture';
import {gotoOK,expectNoHorizontalOverflow,onAppPageError} from './helpers';
import {stabilizeLocalProRuntime} from './pro-local-stable-runtime';
const publications='/api/pro/private-estimate-publications';

for(const language of ['es','en'] as const)for(const mode of ['normal','long'] as const){
 test(`Published quote PDF: immutable authorized ${mode} version (${language})`,async({page,browser,baseURL},info)=>{
  test.setTimeout(240000);
  test.skip(mode==='normal'?info.project.name!=='webkit-mobile':info.project.name!=='chromium-desktop','Four authored exports cover mobile and multipage desktop.');
  local(baseURL);const en=language==='en',f=await fixture(page.context()),client=await createDisposableAccount({prefix:'published-pdf-client'}),outsider=await createDisposableAccount({prefix:'published-pdf-other'});
  const clientContext=await browser.newContext({baseURL}),clientPage=await clientContext.newPage();
  let releaseFont:()=>void=()=>{};
  const writes:string[]=[],errors:string[]=[],downloads:string[]=[];
  try {
   await stabilizeLocalProRuntime(clientContext,'http://127.0.0.1:3185');await login(clientContext,client);
   await f.db.from('pro_clients').update({name:'Cliente Muñoz',tradeName:'Taller Álvarez',email:'PRIVATE_CUSTOMER_EMAIL@example.test',phone:'PRIVATE_PHONE',notes:'PRIVATE_CONTACT_NOTE',address:'Atenas, Alajuela'}).eq('user_id',f.owner.id).eq('id',f.clientId).throwOnError();
   const ctx=await json(page.context(),{view:'context',clientId:f.clientId});
   const lines=Array.from({length:mode==='long'?16:1},(_,index)=>({id:crypto.randomUUID(),description:(index===0?'Revisión eléctrica 💡 - ':'Instalación y mantenimiento - ')+(mode==='long'?'Cableado, iluminación y revisión de conexiones seguras. '.repeat(7):'Álvarez, revisión de tomacorrientes. ')+'MARCADOR_PUBLICADO_'+(index+1),unit:'hora',qtyMilli:1250,unitPriceCents:1999,discountBps:1250,taxBps:1300,catalogProductId:null}));
   const input=estimateInput(ctx,{title:'Mantenimiento eléctrico Álvarez',notes:mode==='long'?'Alcance acordado. '.repeat(70)+'NOTA_FINAL_PUBLICADA':'NOTA_FINAL_PUBLICADA',issuer:{issuerName:'Servicios López & hijos',issuerIdType:'',issuerId:'',issuerEmail:'servicios.pdf@example.test',issuerPhone:'88882222',issuerAddress:'Atenas, Costa Rica',issuerActivity:''},currency:en?'USD':'CRC',validUntil:'2030-12-31',lines});
   const saved=await post(page.context(),f.owner,input);expect(saved.status()).toBe(200);const estimate=(await saved.json()).estimate;expect(estimate.totalCents).toBe(2471*lines.length);
   const code=randomBytes(32).toString('hex'),publish={action:'publish',actionId:crypto.randomUUID(),publicationId:crypto.randomUUID(),estimateId:estimate.id,estimateRevision:1,recipient:{kind:'claim',email:client.email,code}};
   expect((await post(page.context(),f.owner,publish,publications)).status()).toBe(200);
   const claimed=await post(clientContext,client,{action:'claim',actionId:crypto.randomUUID(),code},publications);expect(claimed.status()).toBe(200);
   const edited={...input,actionId:crypto.randomUUID(),revision:1,title:'DOCUMENTO_ACTUAL_NO_EXPORTAR'};
   expect((await post(page.context(),f.owner,edited)).status()).toBe(200);
   const newer={...publish,actionId:crypto.randomUUID(),publicationId:crypto.randomUUID(),estimateRevision:2,recipient:{kind:'existing',recipientId:client.id}};
   expect((await post(page.context(),f.owner,newer,publications)).status()).toBe(200);
   expect((await post(page.context(),f.owner,{action:'archive',actionId:crypto.randomUUID(),estimateId:estimate.id,revision:2})).status()).toBe(200);
   await f.db.from('pro_clients').update({name:'NOMBRE_ACTUAL_NO_EXPORTAR',archived:true}).eq('user_id',f.owner.id).eq('id',f.clientId).throwOnError();
   await f.db.from('pro_memberships').update({status:'inactive'}).eq('user_id',f.owner.id).throwOnError();
   const detailResponse=await clientContext.request.get(publications+'?'+new URLSearchParams({view:'detail',publicationId:publish.publicationId}));expect(detailResponse.status()).toBe(200);
   const historical=await detailResponse.json();expect(historical.publication).toMatchObject({estimateId:null,status:'superseded',version:1,content:{title:input.title,totalCents:2471*lines.length,customer:{name:'Cliente Muñoz'}}});
   const before=await snapshot(f),privateBefore=await state(f),old=await oldDocuments(f),documentsBefore=await estimateRows(f);
   const publicationRows=async()=>{
    const ids=[publish.publicationId,newer.publicationId],tables=['pro_private_estimate_publications','pro_private_estimate_publication_states','pro_private_estimate_publication_invites','pro_private_estimate_publication_recipients','pro_private_estimate_publication_events','pro_private_estimate_publication_actions'];
    return Object.fromEntries(await Promise.all(tables.map(async table=>{
     let query=f.db.from(table).select('*');
     if(table==='pro_private_estimate_publications'||table.endsWith('_recipients'))query=query.eq('owner_id',f.owner.id);
     else if(table.endsWith('_actions'))query=query.in('actor_id',[f.owner.id,client.id]);
     else query=query.in('publication_id',ids);
     const result=await query.throwOnError();
     return [table,result.data?.toSorted((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))];
    })));
   };
   const publicationsBefore=await publicationRows();
   onAppPageError(clientPage,message=>errors.push(message));clientPage.on('download',download=>downloads.push(download.suggestedFilename()));
   clientPage.on('request',request=>{if(['POST','PATCH','PUT','DELETE'].includes(request.method())&&new URL(request.url()).pathname.startsWith('/api/pro/'))writes.push(request.method()+' '+new URL(request.url()).pathname);});
   // Discovery must work for an otherwise empty customer dashboard.
   await gotoOK(clientPage,`/${language}/dashboard/profesional?tab=sent_projects`);
   const discovery=clientPage.getByRole('button',{name:en?'Received quotes':'Cotizaciones recibidas',exact:true});
   await expect(discovery).toBeVisible();
   await discovery.click();
   await expect(clientPage).toHaveURL(new RegExp((en?'/en':'')+'/dashboard/cotizaciones$'));
   const surface=clientPage.locator('[data-estimate-publications]');
   await surface.locator(`[data-estimate-publication="${publish.publicationId}"]`).getByRole('button',{name:en?'Review version':'Revisar versión',exact:true}).click();
   const detail=surface.locator('[data-estimate-publication-detail]'),downloadButton=detail.getByRole('button',{name:en?'Download PDF':'Descargar PDF',exact:true});
   await expect(detail).toContainText(input.title);await expect(detail).toContainText('Cliente Muñoz');await expect(detail).not.toContainText(edited.title);await expect(detail).not.toContainText('NOMBRE_ACTUAL_NO_EXPORTAR');
   await expect(downloadButton).toBeEnabled();
   if(mode==='normal') {
    let signalFont:()=>void=()=>{};const fontSeen=new Promise<void>(resolve=>{signalFont=resolve;}),release=new Promise<void>(resolve=>{releaseFont=resolve;});
    await clientPage.route('**/exports/private-estimates/NotoSans-Regular.ttf',async route=>{const actual=await route.fetch();expect(actual.status()).toBe(200);signalFont();await release;await route.fulfill({response:actual});});
    await downloadButton.click();await fontSeen;
    if(en)await login(clientContext,outsider);
    else await f.db.from('profiles').update({is_disabled:true}).eq('id',client.id).throwOnError();
    releaseFont();
    await expect(detail.getByRole('alert')).toBeVisible();await expect(downloadButton).toBeEnabled();expect(downloads).toEqual([]);
    if(en)await login(clientContext,client);
    else await f.db.from('profiles').update({is_disabled:false}).eq('id',client.id).throwOnError();
    await clientPage.unroute('**/exports/private-estimates/NotoSans-Regular.ttf');
   }
   await expectNoHorizontalOverflow(clientPage);await detail.scrollIntoViewIfNeeded();
   await clientPage.screenshot({path:info.outputPath(`publication-pdf-${mode}-${language}.png`),animations:'disabled'});
   const downloaded=clientPage.waitForEvent('download',{timeout:120000});await downloadButton.click();const download=await downloaded;
   expect(download.suggestedFilename()).toBe(`${en?'shared-estimate':'cotizacion-compartida'}-${publish.publicationId.slice(0,8)}-v1.pdf`);
   const folder=join(process.cwd(),'tmp','pdfs');await mkdir(folder,{recursive:true});const file=join(folder,`private-estimate-publication-${mode}-${language}.pdf`);
   await download.saveAs(file);expect(await download.failure()).toBeNull();
   const bytes=await readFile(file);expect(bytes.subarray(0,5).toString()).toBe('%PDF-');expect(bytes.length).toBeGreaterThan(1000);
   await info.attach(`private-estimate-publication-${mode}-${language}.pdf`,{path:file,contentType:'application/pdf'});
   await info.attach('expected-historical-publication-content',{body:JSON.stringify(historical.publication.content,null,2),contentType:'application/json'});
   await expect(downloadButton).toBeEnabled();expect(downloads).toHaveLength(1);
   if(mode==='normal') {
    await clientPage.locator('[data-native-back="focused-step"]').click();
    await expect.poll(()=>({path:new URL(clientPage.url()).pathname,tab:new URL(clientPage.url()).searchParams.get('tab')})).toEqual({path:(en?'/en':'')+'/dashboard/profesional',tab:'sent_projects'});
    await expect(clientPage.getByRole('button',{name:en?'Received quotes':'Cotizaciones recibidas',exact:true})).toBeVisible();
   }
   expect(writes).toEqual([]);expect(errors).toEqual([]);
   expect(await snapshot(f)).toEqual(before);expect(await state(f)).toEqual(privateBefore);expect(await oldDocuments(f)).toEqual(old);expect(await estimateRows(f)).toEqual(documentsBefore);
   expect(await publicationRows()).toEqual(publicationsBefore);
  } finally {
   releaseFont();await page.goto('about:blank').catch(()=>{});await clientPage.goto('about:blank').catch(()=>{});await clientContext.close();await cleanupDisposableAccount(client);await cleanupDisposableAccount(outsider);await cleanup(f);
  }
 });
}

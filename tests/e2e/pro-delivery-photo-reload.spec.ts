import {test,expect} from 'playwright/test';
import {createServerClient} from '@supabase/ssr';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {createDisposableAccount,cleanupDisposableAccount} from './disposable-account';
import {regressionAdminClient} from './seed';
import {emptyBusiness} from '../../src/lib/pro/business';

for(const scenario of ['upload-rejected-after-reserve','ack-lost-after-ready'] as const)test(`Photo reload audit: ${scenario}`,async({page,baseURL},info)=>{
 test.setTimeout(150000);expect(baseURL).toMatch(/^http:\/\/(?:127\.0\.0\.1|localhost):3185\/?$/);expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');
 const owner=await createDisposableAccount({prefix:'photo-reload-owner'}),client=await createDisposableAccount({prefix:'photo-reload-client'}),db=regressionAdminClient(),workId=crypto.randomUUID(),api='/api/pro/work-delivery',bucket='pro-work-delivery',actions:string[]=[],recoveryAfterReload:number[]=[],storageFailures:string[]=[];let first=true,bodyError:unknown;
 const source=await sharp({create:{width:24,height:24,channels:3,background:'#00a3d7'}}).png().toBuffer(),jpeg=await sharp(source,{limitInputPixels:24000000,animated:false}).rotate().resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true}).jpeg({quality:80}).toBuffer(),digest=createHash('sha256').update(jpeg).digest('hex'),file={name:'synthetic-local.png',mimeType:'image/png',buffer:source};
 const report=page.locator('[data-work-delivery]');
 async function photos(){return (await db.from('pro_work_delivery_photos').select('id,object_path,ready,sha256,size_bytes').eq('owner_id',owner.id).eq('work_id',workId).order('id').throwOnError()).data!;}
 async function objects(){const response=await db.storage.from(bucket).list(owner.id,{limit:100});expect(response.error).toBeNull();return response.data??[];}
 async function receipts(){return (await db.from('pro_work_delivery_actions').select('action_id,input,result').eq('actor_id',owner.id).order('action_id').throwOnError()).data!;}
 async function openEditor(existing:boolean){if(await report.getByLabel('Subir foto privada',{exact:true}).isVisible())return;await report.getByRole('button',{name:existing?'Editar constancia':'Crear constancia',exact:true}).click();}
 try{
  const user=await db.auth.admin.getUserById(owner.id);expect((await db.auth.admin.updateUserById(owner.id,{user_metadata:{...user.data.user!.user_metadata,role:'professional',is_provider:true}})).error).toBeNull();await db.from('profiles').update({role:'professional',is_provider:true}).eq('id',owner.id).throwOnError();await db.from('pro_memberships').insert({user_id:owner.id,status:'active'}).throwOnError();const professional=(await db.from('professionals').insert({profile_id:owner.id,category_id:'desarrollo_web',business_name:'Photo audit fixture',slug:'photo-reload-'+owner.id,whatsapp:'',provincia_id:'al',canton_id:'al-at',verification_status:'pending',is_banned:false}).select('id').single().throwOnError()).data!;
  const workspaceDocument=emptyBusiness(),contact={id:'reservation-'+client.id,name:'Photo audit customer',email:'',phone:'',notes:'Preserve contact',archived:false};workspaceDocument.clients=[contact];workspaceDocument.work=[{id:workId,clientId:contact.id,client:contact.name,bookingClientId:client.id,service:'Completed photo audit',stage:'completed',start:'2026-10-01T09:00:00-06:00',end:'2026-10-01T10:00:00-06:00',cancelled:false}];await db.from('pro_workspaces').insert({user_id:owner.id,document:workspaceDocument,revision:1}).throwOnError();await db.from('pro_appointment_requests').insert({id:crypto.randomUUID(),professional_id:professional.id,owner_id:owner.id,client_user_id:client.id,client_name:contact.name,professional_name:'Photo audit fixture',professional_slug:'photo-reload-'+owner.id,service:'Completed photo audit',duration_minutes:60,location_kind:'agree',status:'completed',work_id:workId}).throwOnError();
  const auth=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{getAll:()=>[],setAll:async cookies=>page.context().addCookies(cookies.map(cookie=>({name:cookie.name,value:cookie.value,url:baseURL!,sameSite:'Lax' as const})))}});expect((await auth.auth.signInWithPassword({email:owner.email,password:owner.password})).error).toBeNull();const before=(await db.from('pro_workspaces').select('document,revision').eq('user_id',owner.id).single().throwOnError()).data;const initial=await page.request.get(api+'?workId='+workId);expect(initial.status()).toBe(200);expect((await initial.json()).photos).toEqual([]);
  await page.route('**/api/pro/work-delivery',async route=>{
   const request=route.request();if(request.method()!=='POST'||request.postDataJSON().action!=='photo')return route.continue();const input=request.postDataJSON();actions.push(input.actionId);
   if(scenario==='upload-rejected-after-reserve'){
    // Fault injection BETWEEN the real reservation and readiness stages. No
    // shared bucket setting is changed: this fixture upload uses a rejected MIME.
    const reserved=await db.rpc('pro_work_delivery_mutate',{p_actor:owner.id,p_input:{action:'photo',actionId:input.actionId,workId,name:input.name,sha256:digest,sizeBytes:jpeg.length}});expect(reserved.error).toBeNull();
    const failed=await db.storage.from(bucket).upload(reserved.data.path,jpeg,{contentType:'image/gif',upsert:false});expect(failed.error).not.toBeNull();storageFailures.push(failed.error!.message);return route.fulfill({status:503,json:{error:'Fixture storage rejection after real reservation'}});
   }
   const response=await route.fetch();expect(response.status()).toBe(200);if(first){first=false;return route.fulfill({status:503,json:{error:'Fixture lost acknowledgement after upload and readiness'}});}return route.fulfill({response});
  });
  await page.goto('/dashboard/profesional?tab=pro_agenda&cita='+workId+'&vistaTrabajo=delivery');await openEditor(false);
  // Corrected contract (docs/pro/delivery-photo-reload-audit-local.md): the
  // unresolved photo is kept in IndexedDB and reload shows «Comprobar subida»
  // for the SAME action instead of a reselection. The former red audit asserted
  // the defect (one row per reselection / two ready objects); it now proves the fix.
  const recovery=report.locator('[data-delivery-photo-recovery]'),check=recovery.getByRole('button',{name:'Comprobar subida',exact:true});
  async function readyRecovery(){await expect(recovery).toBeVisible({timeout:45000});await expect(recovery.getByText('Compruebe la subida antes de continuar.',{exact:true})).toBeVisible();await expect(check).toBeEnabled({timeout:45000});}
  if(scenario==='upload-rejected-after-reserve'){
   await report.getByLabel('Subir foto privada',{exact:true}).setInputFiles(file);
   for(let attempt=0;attempt<6;attempt++){
    await expect.poll(()=>actions.length).toBe(attempt+1);await readyRecovery();const current=await photos();expect(current).toHaveLength(1);expect(current.every(row=>row.ready===false&&row.sha256===digest)).toBe(true);expect(await objects()).toEqual([]);
    await page.reload();await readyRecovery();recoveryAfterReload.push(await check.count());expect(recoveryAfterReload.at(-1),'Reload must restore the pending photo recovery').toBe(1);
    if(attempt<5)await check.click();
   }
   const current=await photos(),savedActions=await receipts();await info.attach('observed-photo-capacity',{body:JSON.stringify({scenario,actions,uniqueActionIds:new Set(actions).size,recoveryAfterReload,rows:current,objects:await objects(),receiptCount:savedActions.length,storageFailures},null,2),contentType:'application/json'});expect((await db.from('pro_workspaces').select('document,revision').eq('user_id',owner.id).single().throwOnError()).data).toEqual(before);await page.screenshot({path:info.outputPath('one-pending-photo-slot.png'),fullPage:true});expect(new Set(actions).size,'One unresolved photo should preserve its action across reload/retry').toBe(1);expect(current,'One failed upload must not consume all six photo slots').toHaveLength(1);
  }else{
   await report.getByLabel('Subir foto privada',{exact:true}).setInputFiles(file);await readyRecovery();expect(await photos()).toEqual([expect.objectContaining({ready:true,sha256:digest})]);expect(await objects()).toHaveLength(1);await page.reload();await readyRecovery();recoveryAfterReload.push(await check.count());expect(recoveryAfterReload).toEqual([1]);await check.click();await expect(recovery).toHaveCount(0,{timeout:45000});await openEditor(true);await expect(report.getByRole('checkbox',{name:'synthetic-local.png',exact:true})).toHaveCount(1);
   const current=await photos(),storedObjects=await objects(),savedActions=await receipts();for(const row of current){const downloaded=await db.storage.from(bucket).download(row.object_path);expect(downloaded.error).toBeNull();expect(createHash('sha256').update(Buffer.from(await downloaded.data!.arrayBuffer())).digest('hex')).toBe(digest);}await info.attach('observed-photo-duplicates',{body:JSON.stringify({scenario,actions,uniqueActionIds:new Set(actions).size,recoveryAfterReload,rows:current,objects:storedObjects.map(object=>object.name),receiptCount:savedActions.length,downloadedHashesMatch:true},null,2),contentType:'application/json'});expect((await db.from('pro_workspaces').select('document,revision').eq('user_id',owner.id).single().throwOnError()).data).toEqual(before);await page.screenshot({path:info.outputPath('single-ready-photo-object.png'),fullPage:true});expect(new Set(actions).size,'Reload/check of the uncertain upload should retain its identity').toBe(1);expect(current,'One original photo intent should not create two ready objects').toEqual([expect.objectContaining({ready:true,sha256:digest})]);expect(storedObjects).toHaveLength(1);
  }
 }catch(error){bodyError=error;await page.screenshot({path:info.outputPath('failure-before-cleanup.png'),fullPage:true}).catch(()=>{});throw error;}finally{
  await page.goto('about:blank').catch(()=>{});try{const ownPhotos=await photos();if(ownPhotos.length){const removed=await db.storage.from(bucket).remove(ownPhotos.map(row=>row.object_path));expect(removed.error).toBeNull();}expect(await objects()).toEqual([]);for(const actor of [owner,client])await cleanupDisposableAccount(actor);}catch(cleanupError){throw new AggregateError(bodyError?[bodyError,cleanupError]:[cleanupError],'Photo audit fixture cleanup failed',{cause:bodyError});}
 }
});

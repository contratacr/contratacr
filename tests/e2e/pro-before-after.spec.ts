import {test,expect,type BrowserContext} from 'playwright/test';
import {randomBytes,randomUUID as uuid} from 'node:crypto';
import sharp from 'sharp';
import {gotoOK,expectNoHorizontalOverflow} from './helpers';
import {ownerFixture,local,origin,login,headersFor} from './pro-round2-fixture';
import {createDisposableAccount,cleanupDisposableAccount,type DisposableAccount} from './disposable-account';
import {comparisonClientSchema,comparisonOwnerSchema,comparisonResultSchema} from '../../src/lib/pro/file-comparisons';

// Row 33 (2026-11-23): before/after photo comparison. The owner picks two JPG photos of the job files (title and caption
// optional, up to 20), edits, marks visible to the customer (presentation only), archives and restores with an immutable
// history. The linked customer (and the owner's preview) reads it and each image through a reauthorized API; a trashed or
// individually hidden photo, the "Files and photos" switch off or an archived comparison remove it from the customer.
// Disposable accounts, loopback only; nothing is sent.
const api='/api/pro/work-file-comparisons',presentation='/api/pro/client-presentation',files='/api/pro/work-files',organizer='/api/pro/work-file-organizer';
const photo=(color:string)=>sharp({create:{width:48,height:36,channels:3,background:color}}).jpeg().toBuffer();
for(const language of ['es','en'] as const)test(`Before/after comparison: owner, customer, revalidation and slider [${language}]`,async({page,browser},info)=>{
 test.setTimeout(600000);local(info.project.use.baseURL);const en=language==='en',id=language+randomBytes(3).toString('hex');
 const f=await ownerFixture(page.context(),id),headers=headersFor(f.owner),work=f.workId;let customer:DisposableAccount|null=null;
 const customerContext:BrowserContext=await browser.newContext({baseURL:origin,viewport:info.project.use.viewport??undefined,isMobile:info.project.use.isMobile,hasTouch:info.project.use.hasTouch,userAgent:info.project.use.userAgent});
 try{
  const ids=[uuid(),uuid(),uuid()],bytes=[await photo('#c0392b'),await photo('#27ae60'),await photo('#2980b9')];
  for(const [n,fileId] of ids.entries()){const up=await page.request.post(files,{headers,data:{action:'upload',workId:work,fileId,name:`foto-${n}.jpg`,data:bytes[n].toString('base64')}});expect(up.status()).toBe(200);}
  const read=async()=>comparisonOwnerSchema.parse(await (await page.request.get(api+'?'+new URLSearchParams({workId:work}))).json());
  const post=(data:Record<string,unknown>)=>page.request.post(api,{headers,data:{workId:work,actionId:uuid(),...data}});
  const first=await read();expect(first.items).toEqual([]);expect(first.photos.map(p=>p.id).sort()).toEqual([...ids].sort());expect(first.max).toBe(20);
  // Validation: same photo twice, an unknown photo, unexpected fields.
  expect((await post({action:'create',beforeFileId:ids[0],afterFileId:ids[0],title:null,caption:null})).status()).toBe(400);
  expect((await post({action:'create',beforeFileId:ids[0],afterFileId:uuid(),title:null,caption:null})).status()).toBe(400);
  expect((await post({action:'create',beforeFileId:ids[0],afterFileId:ids[1],title:null,caption:null,extra:1})).status()).toBe(400);
  // Create, replay (no second row), edit with CAS.
  const actionId=uuid(),create={action:'create',actionId,beforeFileId:ids[0],afterFileId:ids[1],title:'Cocina '+id,caption:'Pared norte'};
  const made=await post(create);expect(made.status()).toBe(200);const item=comparisonResultSchema.parse(await made.json()).item;expect(item.clientVisible).toBe(false);expect(item.revision).toBe(1);expect(item.available).toBe(true);
  expect((await post(create)).status()).toBe(200);expect((await read()).items).toHaveLength(1);
  const edited=comparisonResultSchema.parse(await (await post({action:'update',comparisonId:item.id,revision:1,beforeFileId:ids[0],afterFileId:ids[2],title:'Cocina nueva '+id,caption:null})).json()).item;expect(edited.revision).toBe(2);expect(edited.afterFileId).toBe(ids[2]);
  expect((await post({action:'update',comparisonId:item.id,revision:1,beforeFileId:ids[0],afterFileId:ids[1],title:'Vieja',caption:null})).status()).toBe(409);
  // Not visible yet: the linked customer sees nothing.
  customer=await createDisposableAccount({prefix:'cmp-customer'});await login(customerContext,customer);const requestId=uuid();
  const professional=(await f.db.from('professionals').select('id').eq('profile_id',f.owner.id).single().throwOnError()).data!;
  await f.db.from('pro_appointment_requests').insert({id:requestId,professional_id:professional.id,owner_id:f.owner.id,client_user_id:customer.id,client_name:'Cliente '+id,professional_name:'Remodelaciones '+id,professional_slug:'cmp-'+f.owner.id,service:'Cocina '+id,duration_minutes:60,location_kind:'agree',location_text:'',note:'',status:'confirmed',revision:0,work_id:f.workId}).throwOnError();
  const cust=(path:string,context=customerContext)=>context.request.get(origin+api+'?'+path,{headers:{'X-Pro-Expected-Actor':customer!.id}});
  const list=async()=>comparisonClientSchema.parse(await (await cust(new URLSearchParams({requestId}).toString())).json()).items;
  const image=(side:'before'|'after')=>cust(new URLSearchParams({requestId,comparisonId:item.id,side}).toString());
  expect(await list()).toEqual([]);expect((await image('before')).status()).toBe(404);
  // Visible: the customer reads it and each image (bytes verified); the owner preview reads the same list.
  const shown=comparisonResultSchema.parse(await (await post({action:'visibility',comparisonId:item.id,revision:2,visible:true})).json()).item;expect(shown.clientVisible).toBe(true);
  expect(await list()).toHaveLength(1);const got=await image('after');expect(got.status()).toBe(200);expect(got.headers()['content-type']).toBe('image/jpeg');expect(got.headers()['cache-control']).toContain('no-store');expect((await got.body()).length).toBe(bytes[2].length);
  expect((await page.request.get(origin+api+'?'+new URLSearchParams({requestId}),{headers})).status()).toBe(200);
  expect((await cust(new URLSearchParams({requestId,comparisonId:item.id,side:'middle'}).toString())).status()).toBe(400);
  expect((await cust(new URLSearchParams({requestId,comparisonId:uuid(),side:'before'}).toString())).status()).toBe(404);
  // Hiding a photo individually, the files switch off and the trash each remove it at once; undoing brings it back.
  const hide=(hidden:boolean)=>page.request.post(presentation,{headers,data:{action:'hide',actionId:uuid(),workId:work,kind:'file',itemId:ids[0],hidden}});
  expect((await hide(true)).status()).toBe(200);expect(await list()).toEqual([]);expect((await image('before')).status()).toBe(404);expect((await hide(false)).status()).toBe(200);expect(await list()).toHaveLength(1);
  await f.db.from('pro_client_dashboards').upsert({owner_id:f.owner.id,work_id:work,show_files:false},{onConflict:'owner_id,work_id'}).throwOnError();
  expect(await list()).toEqual([]);expect((await image('before')).status()).toBe(404);
  await f.db.from('pro_client_dashboards').update({show_files:true}).eq('owner_id',f.owner.id).eq('work_id',work).throwOnError();expect(await list()).toHaveLength(1);
  const org=async()=>(await (await page.request.get(organizer+'?'+new URLSearchParams({workId:work,view:'search',q:'foto-0'}))).json()).files[0] as {id:string;metaRevision:number};
  const trash=await org();expect((await page.request.post(organizer,{headers,data:{action:'trash_file',actionId:uuid(),workId:work,subjectId:trash.id,revision:trash.metaRevision}})).status()).toBe(200);
  expect(await list()).toEqual([]);expect((await image('before')).status()).toBe(404);expect((await read()).items[0].available).toBe(false);
  const back=(await (await page.request.get(organizer+'?'+new URLSearchParams({workId:work,view:'trash'}))).json()).files.find((x:{id:string})=>x.id===ids[0]) as {metaRevision:number};
  expect((await page.request.post(organizer,{headers,data:{action:'restore_file',actionId:uuid(),workId:work,subjectId:ids[0],revision:back.metaRevision}})).status()).toBe(200);expect(await list()).toHaveLength(1);
  // A photo used by a comparison is never deleted permanently (the organizer keeps it).
  const cur=await org();expect((await page.request.post(organizer,{headers,data:{action:'trash_file',actionId:uuid(),workId:work,subjectId:ids[0],revision:cur.metaRevision}})).status()).toBe(200);
  const trashed=(await (await page.request.get(organizer+'?'+new URLSearchParams({workId:work,view:'trash'}))).json()).files.find((x:{id:string})=>x.id===ids[0]) as {metaRevision:number};
  expect((await page.request.post(organizer,{headers,data:{action:'purge_file',actionId:uuid(),workId:work,subjectId:ids[0],revision:trashed.metaRevision}})).status()).toBe(409);
  expect((await page.request.post(organizer,{headers,data:{action:'restore_file',actionId:uuid(),workId:work,subjectId:ids[0],revision:trashed.metaRevision}})).status()).toBe(200);
  // Customer page: the slider is keyboard operable and the photos download; no horizontal overflow.
  const customerPage=await customerContext.newPage();await gotoOK(customerPage,`/${language}/dashboard/profesional?tab=appointments&citaSolicitud=${requestId}`);
  const section=customerPage.locator('[data-client-comparisons]');await expect(section).toBeVisible({timeout:90000});
  const range=section.locator('[data-before-after-range]').first();await expect(range).toBeVisible({timeout:60000});
  await range.focus();await expect(range).toHaveAttribute('aria-valuetext',en?'50% of the before photo shown':'50% de la foto de antes visible');
  await customerPage.keyboard.press('ArrowRight');await expect(range).toHaveAttribute('aria-valuetext',en?'51% of the before photo shown':'51% de la foto de antes visible');
  await customerPage.keyboard.press('Home');await expect(range).toHaveAttribute('aria-valuetext',en?'0% of the before photo shown':'0% de la foto de antes visible');
  await section.locator('[data-before-after-toggle]').first().click();await expect(section.locator('[data-before-after-sidebyside]').first()).toBeVisible();
  await expect(section.locator('[data-client-comparison-download]')).toHaveCount(2);await section.scrollIntoViewIfNeeded();await expectNoHorizontalOverflow(customerPage);
  // Owner UI: archive hides it from the customer; restore keeps the history.
  await gotoOK(page,`/${language}/dashboard/pro?tab=pro_agenda&cita=${work}&vistaTrabajo=client`);
  const editor=page.locator('[data-before-after-editor]');await expect(editor).toBeVisible({timeout:90000});const row=editor.locator(`[data-comparison="${item.id}"]`);await expect(row).toBeVisible();
  await expect(row.locator(`[data-comparison-visible="${item.id}"]`)).toBeChecked();await expectNoHorizontalOverflow(page);
  await row.locator(`[data-comparison-archive="${item.id}"]`).click();await expect(editor.locator('[data-comparison-notice]')).toBeVisible({timeout:30000});expect(await list()).toEqual([]);
  const after=await read();expect(after.items[0].archived).toBe(true);expect(after.items[0].clientVisible).toBe(false);expect(after.history.map(h=>h.action)).toEqual(expect.arrayContaining(['create','update','visibility','archive']));
  expect((await post({action:'visibility',comparisonId:item.id,revision:after.items[0].revision,visible:true})).status()).toBe(400);
  const restored=comparisonResultSchema.parse(await (await post({action:'restore',comparisonId:item.id,revision:after.items[0].revision})).json()).item;expect(restored.archived).toBe(false);expect(restored.clientVisible).toBe(false);
  // Limit: 20 active comparisons per job.
  for(let n=1;n<20;n++)expect((await post({action:'create',beforeFileId:ids[0],afterFileId:ids[1],title:'C'+n,caption:null})).status()).toBe(200);
  expect((await post({action:'create',beforeFileId:ids[0],afterFileId:ids[1],title:null,caption:null})).status()).toBe(400);
 }finally{await customerContext.close();if(customer)await cleanupDisposableAccount(customer);await f.cleanup();}
});

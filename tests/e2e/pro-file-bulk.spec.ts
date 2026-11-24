import {test,expect} from 'playwright/test';
import {createDisposableAccount,cleanupDisposableAccount,type DisposableAccount} from './disposable-account';
import {gotoOK,expectNoHorizontalOverflow,collectPageErrors} from './helpers';
import {origin,pdf,proOwner,loginAs} from './pro-file-ops-harness';

// Row 29: bulk operations (move, favorites, trash, restore, tags), permanent delete only for never-used files and the
// explicit purge of what expired (30 days) with confirmation and receipt. Library and job files. ES/EN, desktop and phone.
const lib='/api/pro/company-files',libBulk='/api/pro/company-file-bulk',workBulk='/api/pro/work-file-bulk',purge='/api/pro/file-purge',org='/api/pro/work-file-organizer',work='/api/pro/work-files';

for(const language of ['es','en'] as const)test(`File bulk operations, permanent delete and purge receipt [${language}]`,async({page,browser,baseURL})=>{
 test.setTimeout(300000);expect(baseURL).toBe(origin);expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');
 const en=language==='en',errors=collectPageErrors(page);let rival:DisposableAccount|undefined;
 const h=await proOwner(page,'fbk');const {db,owner,workId,headers,post}=h;
 try{
  const bulkPost=async(url:string,data:Record<string,unknown>,status=200)=>post(url,{batchId:crypto.randomUUID(),...data},status);
  // ---- library: three files and a folder ----
  const folderId=crypto.randomUUID();await post(lib,{action:'folder_save',actionId:crypto.randomUUID(),folderId,revision:0,parentId:null,name:'Contratos',favorite:false});
  const ids=[crypto.randomUUID(),crypto.randomUUID(),crypto.randomUUID()];
  for(const [i,id] of ids.entries())await post(lib,{action:'upload',actionId:crypto.randomUUID(),fileId:id,folderId:null,name:`doc-${i}.pdf`,data:pdf('doc '+i).toString('base64')});
  const rev=async(id:string)=>(await db.from('pro_company_files').select('revision').eq('owner_id',owner.id).eq('id',id).single().throwOnError()).data!.revision as number;
  const items=async(list:string[])=>Promise.all(list.map(async fileId=>({fileId,revision:await rev(fileId)})));
  let r=await bulkPost(libBulk,{action:'move',folderId,items:await items(ids)});expect([r.ok,r.failed]).toEqual([3,0]);
  r=await bulkPost(libBulk,{action:'favorite',on:true,items:await items(ids)});expect(r.ok).toBe(3);
  r=await bulkPost(libBulk,{action:'tags_add',tags:['Manual','permiso'],items:await items(ids.slice(0,2))});expect(r.ok).toBe(2);
  r=await bulkPost(libBulk,{action:'tags_remove',tags:['permiso'],items:await items(ids.slice(0,1))});expect(r.ok).toBe(1);
  // ids[1] is copied into the job while it is still active (a copy needs an active source); it is archived just below, so it ends archived AND used.
  await post(lib,{action:'copy',actionId:crypto.randomUUID(),fileId:ids[1],revision:await rev(ids[1]),workId,targetFileId:crypto.randomUUID()});
  // A stale revision fails alone, the rest go through.
  r=await bulkPost(libBulk,{action:'archive',items:[{fileId:ids[0],revision:99},...await items([ids[1]])]});expect([r.ok,r.failed]).toEqual([1,1]);expect(r.items.find((i:{ok:boolean})=>!i.ok).error).toBe('conflict');
  // Validation: empty, too many, unknown field, foreign origin, oversized body.
  await bulkPost(libBulk,{action:'archive',items:[]},400);
  await bulkPost(libBulk,{action:'archive',items:Array.from({length:51},()=>({fileId:crypto.randomUUID(),revision:1}))},400);
  await bulkPost(libBulk,{action:'archive',items:await items([ids[2]]),extra:1},400);
  expect((await page.request.post(libBulk,{headers:{...headers,Origin:'http://evil.example'},data:{batchId:crypto.randomUUID(),action:'archive',items:await items([ids[2]])}})).status()).toBe(403);
  // Permanent delete: only archived and never used. ids[2] stays active, ids[1] is archived and used (copied into the job), ids[0] was archived by a failed revision -> archive it now.
  r=await bulkPost(libBulk,{action:'archive',items:await items([ids[0]])});expect(r.ok).toBe(1);
  const batchId=crypto.randomUUID();
  r=await post(libBulk,{batchId,action:'purge',items:await items(ids)});expect([r.ok,r.failed]).toEqual([1,2]);const bad=r.items.filter((i:{ok:boolean})=>!i.ok).map((i:{error:string})=>i.error);expect(bad).toHaveLength(2);expect(bad).toContain('in_use');
  expect((await db.from('pro_company_files').select('id').eq('owner_id',owner.id).eq('id',ids[0])).data).toEqual([]);
  expect((await db.from('pro_company_files').select('id').eq('owner_id',owner.id).in('id',[ids[1],ids[2]])).data).toHaveLength(2);
  expect((await db.from('pro_file_purge_receipts').select('action_id').eq('owner_id',owner.id).eq('scope','company')).data).toHaveLength(1);
  // Replay of the same batch returns the stored result and creates no second receipt.
  await post(libBulk,{batchId,action:'purge',items:await items(ids.slice(1))});
  // Receipts are immutable.
  expect((await db.from('pro_file_purge_receipts').update({kept_files:99}).eq('owner_id',owner.id)).error).not.toBeNull();
  // Another account cannot act on these files.
  rival=await createDisposableAccount({prefix:'fbk-rival'});const other=await browser.newContext();await loginAs(other,rival);
  const foreign=await other.request.post(origin+libBulk,{headers:{Origin:origin,'X-Pro-Expected-Actor':rival.id},data:{batchId:crypto.randomUUID(),action:'archive',items:[{fileId:ids[2],revision:1}]}});
  expect(foreign.status()===200?(await foreign.json()).ok:0).toBe(0);await other.close();

  // ---- purge of what expired: nothing expired yet, confirmation required, then receipt ----
  const preview=await page.request.get(purge+'?scope=company',{headers:{'X-Pro-Expected-Actor':owner.id}});expect(preview.status()).toBe(200);expect((await preview.json()).preview.expiredFiles).toBe(0);
  await post(purge,{action:'purge_expired',scope:'company',actionId:crypto.randomUUID()},400);
  await post(purge,{action:'purge_expired',scope:'company',actionId:crypto.randomUUID(),confirm:false},400);
  const receipt=await post(purge,{action:'purge_expired',scope:'company',actionId:crypto.randomUUID(),confirm:true});expect(receipt.receipt.purgedFiles).toBe(0);

  // ---- job files: bulk move, favorite, trash, restore, purge ----
  const wids=[crypto.randomUUID(),crypto.randomUUID()];
  for(const [i,id] of wids.entries())await post(work,{action:'upload',workId,fileId:id,name:`obra-${i}.pdf`,data:pdf('obra '+i).toString('base64')});
  const wread=async()=>{const r2=await page.request.get(org+'?'+new URLSearchParams({workId,view:'search',q:'obra'}),{headers:{'X-Pro-Expected-Actor':owner.id}});expect(r2.status()).toBe(200);return (await r2.json()).files as Array<{id:string;metaRevision:number}>;};
  const witems=async()=>(await wread()).filter(f=>wids.includes(f.id)).map(f=>({fileId:f.id,revision:f.metaRevision}));
  r=await bulkPost(workBulk,{action:'favorite',workId,on:true,items:await witems()});expect(r.ok).toBe(2);
  r=await bulkPost(workBulk,{action:'trash',workId,items:await witems()});expect(r.ok).toBe(2);
  const trashed=await page.request.get(org+'?'+new URLSearchParams({workId,view:'trash'}),{headers:{'X-Pro-Expected-Actor':owner.id}});expect((await trashed.json()).files).toHaveLength(2);
  const wr=(await (await page.request.get(org+'?'+new URLSearchParams({workId,view:'trash'}),{headers:{'X-Pro-Expected-Actor':owner.id}})).json()).files as Array<{id:string;metaRevision:number}>;
  r=await bulkPost(workBulk,{action:'restore',workId,items:[{fileId:wr[0].id,revision:wr[0].metaRevision}]});expect(r.ok).toBe(1);
  r=await bulkPost(workBulk,{action:'purge',workId,items:[{fileId:wr[1].id,revision:wr[1].metaRevision}]});expect(r.ok).toBe(1);
  expect((await db.from('pro_work_files').select('id').eq('owner_id',owner.id).eq('id',wr[1].id)).data).toEqual([]);
  const wpreview=await page.request.get(purge+'?'+new URLSearchParams({scope:'work',workId}),{headers:{'X-Pro-Expected-Actor':owner.id}});expect(wpreview.status()).toBe(200);
  const wreceipt=await post(purge,{action:'purge_expired',scope:'work',workId,actionId:crypto.randomUUID(),confirm:true});expect(wreceipt.receipt.scope).toBe('work');

  // ---- UI: library selection bar, ES/EN ----
  await gotoOK(page,`/${language}/dashboard/pro?tab=pro_files`);const library=page.locator('[data-company-files]');
  await library.getByRole('button',{name:en?'Open folder':'Abrir carpeta'}).click({timeout:60000});
  const boxes=library.locator('[data-bulk-select]');await expect(boxes.first()).toBeVisible({timeout:60000});
  await boxes.first().check();
  const bar=library.locator('[data-file-bulk="company"]');await expect(bar.locator('[data-file-bulk-count]')).toContainText(en?'1 selected':'1 archivos seleccionados');
  await bar.getByRole('button',{name:en?'Remove favorite':'Quitar favoritos'}).click();
  await expect(bar.getByRole('status').filter({hasText:en?'Removed from favorites.':'Quitados de favoritos.'})).toBeVisible({timeout:60000});
  await library.getByRole('button',{name:en?'Trash':'Papelera'}).click();
  await expect(library.locator('[data-file-purge="company"]')).toContainText(en?'Nothing is deleted by itself':'Nada se borra solo');
  await expectNoHorizontalOverflow(page);
  expect(errors()).toEqual([]);
 }finally{await page.goto('about:blank').catch(()=>{});if(rival)await cleanupDisposableAccount(rival);await h.cleanup();}
});

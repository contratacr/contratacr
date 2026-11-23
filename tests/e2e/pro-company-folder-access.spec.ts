import {test,expect} from 'playwright/test';
import {createDisposableAccount,cleanupDisposableAccount,type DisposableAccount} from './disposable-account';
import {gotoOK,expectNoHorizontalOverflow,collectPageErrors} from './helpers';
import {origin,pdf,proOwner,loginAs} from './pro-file-ops-harness';

// Row 31: permissions per folder of the company library for current team members. Default: only the owner; a grant
// ("view" or "edit") covers subfolders and files; deactivating the member closes access at once; management is owner only.
const access='/api/pro/company-folder-access',lib='/api/pro/company-files';

for(const language of ['es','en'] as const)test(`Company library folder permissions for team members [${language}]`,async({page,browser,baseURL})=>{
 test.setTimeout(300000);expect(baseURL).toBe(origin);expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');
 const en=language==='en',errors=collectPageErrors(page);let member:DisposableAccount|undefined,stranger:DisposableAccount|undefined;
 const h=await proOwner(page,'cfa');const {db,owner,headers,post}=h;
 try{
  member=await createDisposableAccount({prefix:'cfa-member'});stranger=await createDisposableAccount({prefix:'cfa-stranger'});
  await db.from('pro_company_members').insert({owner_id:owner.id,member_user_id:member.id,member_name:'Ana Integrante',member_email:member.email,role:'manager'}).throwOnError();
  const top=crypto.randomUUID(),sub=crypto.randomUUID(),closed=crypto.randomUUID();
  for(const [folderId,parentId,name] of [[top,null,'Proyectos'],[sub,top,'Planos'],[closed,null,'Finanzas']] as const)await post(lib,{action:'folder_save',actionId:crypto.randomUUID(),folderId,revision:0,parentId,name,favorite:false});
  const planFile=crypto.randomUUID(),moneyFile=crypto.randomUUID();
  await post(lib,{action:'upload',actionId:crypto.randomUUID(),fileId:planFile,folderId:sub,name:'plano.pdf',data:pdf('plano').toString('base64')});
  await post(lib,{action:'upload',actionId:crypto.randomUUID(),fileId:moneyFile,folderId:closed,name:'balance.pdf',data:pdf('balance').toString('base64')});

  // ---- owner API: read members, grant, replay, validation ----
  const read=async(folderId:string)=>{const r=await page.request.get(access+'?folderId='+folderId,{headers:{'X-Pro-Expected-Actor':owner.id}});expect(r.status()).toBe(200);return await r.json();};
  expect((await read(top)).members).toEqual([expect.objectContaining({userId:member.id,level:null,effective:null})]);
  const grant=crypto.randomUUID();const body={action:'grant',actionId:grant,folderId:top,memberUserId:member.id,level:'view'};
  expect((await post(access,body)).replayed).toBe(false);expect((await post(access,body)).replayed).toBe(true);
  expect((await read(sub)).members[0]).toMatchObject({level:null,effective:'view'});
  await post(access,{action:'grant',actionId:crypto.randomUUID(),folderId:top,memberUserId:stranger.id,level:'view'},403);
  await post(access,{action:'grant',actionId:crypto.randomUUID(),folderId:top,memberUserId:member.id,level:'admin'},400);
  await post(access,{action:'grant',actionId:crypto.randomUUID(),folderId:top,memberUserId:member.id,level:'view',extra:1},400);
  expect((await page.request.post(access,{headers:{...headers,Origin:'http://evil.example'},data:body})).status()).toBe(403);
  expect((await db.from('pro_company_folder_access_actions').update({level:'edit'}).eq('owner_id',owner.id)).error).not.toBeNull();

  // ---- the member, working in the company (workspace cookie) ----
  const ctx=await browser.newContext();await loginAs(ctx,member);await ctx.addCookies([{name:'ccr_pro_ws',value:owner.id,url:origin,httpOnly:true,sameSite:'Lax'}]);
  const mh={Origin:origin,'X-Pro-Expected-Actor':member.id};
  const mget=async(q:string)=>ctx.request.get(origin+lib+'?'+q,{headers:{'X-Pro-Expected-Actor':member!.id}});
  const mine=await ctx.request.get(origin+access+'?view=mine',{headers:{'X-Pro-Expected-Actor':member.id}});
  if(mine.status()===200){
   expect((await mine.json())).toMatchObject({isMember:true,folders:[expect.objectContaining({id:top,level:'view'})]});
   expect((await mget('view=list&scope=folder&folderId='+top)).status()).toBe(200);
   expect((await mget('view=list&scope=folder&folderId='+sub)).status()).toBe(200);
   expect((await mget('view=binary&fileId='+planFile)).status()).toBe(200);
   expect((await mget('view=list&scope=folder&folderId='+closed)).status()).toBe(403);
   expect((await mget('view=binary&fileId='+moneyFile)).status()).toBe(403);
   expect((await mget('view=list&scope=all')).status()).toBe(403);
   // view is not edit: no upload, no new folder, no rename.
   expect((await ctx.request.post(origin+lib,{headers:mh,data:{action:'upload',actionId:crypto.randomUUID(),fileId:crypto.randomUUID(),folderId:sub,name:'otro.pdf',data:pdf('otro').toString('base64')}})).status()).toBe(403);
   expect((await ctx.request.post(origin+access,{headers:mh,data:{action:'grant',actionId:crypto.randomUUID(),folderId:closed,memberUserId:member.id,level:'edit'}})).status()).toBe(403);
   for(const url of ['/api/pro/company-file-bulk','/api/pro/file-purge','/api/pro/company-file-tags','/api/pro/company-file-trash'])expect([403,404,405]).toContain((await ctx.request.get(origin+url,{headers:{'X-Pro-Expected-Actor':member.id}})).status());
   // Edit on the subfolder lets the member upload there, and only there.
   await post(access,{action:'grant',actionId:crypto.randomUUID(),folderId:sub,memberUserId:member.id,level:'edit'});
   expect((await ctx.request.post(origin+lib,{headers:mh,data:{action:'upload',actionId:crypto.randomUUID(),fileId:crypto.randomUUID(),folderId:sub,name:'otro.pdf',data:pdf('otro').toString('base64')}})).status()).toBe(200);
   expect((await ctx.request.post(origin+lib,{headers:mh,data:{action:'upload',actionId:crypto.randomUUID(),fileId:crypto.randomUUID(),folderId:top,name:'otro2.pdf',data:pdf('otro2').toString('base64')}})).status()).toBe(403);
   expect((await ctx.request.post(origin+lib,{headers:mh,data:{action:'upload',actionId:crypto.randomUUID(),fileId:crypto.randomUUID(),folderId:null,name:'raiz.pdf',data:pdf('raiz').toString('base64')}})).status()).toBe(403);
   // The member can annotate a file where they can edit, but not one they can only see.
   const an=(fileId:string)=>ctx.request.post(origin+'/api/pro/file-annotations',{headers:mh,data:{action:'create',actionId:crypto.randomUUID(),scope:'company',fileId,kind:'note',body:'Nota del integrante'}});
   expect((await an(planFile)).status()).toBe(200);expect((await an(moneyFile)).status()).toBe(403);
  }
  // Deactivating the member closes access at once, the grant is kept.
  await db.from('pro_company_members').update({active:false}).eq('owner_id',owner.id).eq('member_user_id',member.id).throwOnError();
  const gate=async()=>(await db.rpc('pro_company_folder_gate',{p_owner:owner.id,p_member:member!.id,p_folders:[top],p_files:[],p_level:'view'})).data;
  expect(await gate()).toBe(false);
  await db.from('pro_company_members').update({active:true}).eq('owner_id',owner.id).eq('member_user_id',member.id).throwOnError();expect(await gate()).toBe(true);
  // Revoke.
  await post(access,{action:'revoke',actionId:crypto.randomUUID(),folderId:top,memberUserId:member.id});expect(await gate()).toBe(false);
  await ctx.close();

  // ---- owner UI: Permissions button on the folder, change the level, ES/EN ----
  await gotoOK(page,`/${language}/dashboard/pro?tab=pro_files`);const library=page.locator('[data-company-files]');
  await library.locator(`[data-company-folder="${top}"] [data-folder-access-open]`).click({timeout:60000});
  const dialog=page.getByRole('dialog',{name:en?'Folder permissions':'Permisos de la carpeta'});await expect(dialog.locator('[data-folder-access-member]')).toHaveCount(1,{timeout:60000});
  await dialog.getByLabel(en?'Permission for Ana Integrante':'Permiso de Ana Integrante').selectOption('edit');
  await expect(dialog.getByRole('status').filter({hasText:en?'Permission saved.':'Permiso guardado.'})).toBeVisible({timeout:60000});
  expect((await db.from('pro_company_folder_access').select('level').eq('owner_id',owner.id).eq('folder_id',top).eq('member_user_id',member.id).single().throwOnError()).data!.level).toBe('edit');
  await expectNoHorizontalOverflow(page);
  expect(errors()).toEqual([]);
 }finally{await page.goto('about:blank').catch(()=>{});if(member)await cleanupDisposableAccount(member);if(stranger)await cleanupDisposableAccount(stranger);await h.cleanup();}
});

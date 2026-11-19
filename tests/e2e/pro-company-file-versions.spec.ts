import {test,expect,type BrowserContext} from 'playwright/test';
import {createHash} from 'node:crypto';
import {createServerClient} from '@supabase/ssr';
import {createDisposableAccount,cleanupDisposableAccount,type DisposableAccount} from './disposable-account';
import {regressionAdminClient} from './seed';
import {emptyBusiness} from '../../src/lib/pro/business';
import {crTodayISO} from '../../src/lib/time-cr';
import {gotoOK,expectNoHorizontalOverflow,collectPageErrors} from './helpers';
import {stabilizeLocalProRuntime} from './pro-local-stable-runtime';
import type {CompanyFileFamily} from '../../src/lib/pro/company-file-versions';

// Row 30: versions in the company library. Upload a new version, history, restore as current.
// Private to the owner: never shared with customers; the library shows only the current version.
const origin='http://127.0.0.1:3185',api='/api/pro/company-files',versions='/api/pro/company-file-versions';
const sha=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const pdf=(text:string)=>Buffer.from(`%PDF-1.4\n% ${text}\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n`,'latin1');
async function login(context:BrowserContext,actor:DisposableAccount){await stabilizeLocalProRuntime(context,origin);const auth=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{getAll:()=>[],setAll:async cookies=>context.addCookies(cookies.map(cookie=>({name:cookie.name,value:cookie.value,url:origin,sameSite:'Lax' as const})))}});expect((await auth.auth.signInWithPassword({email:actor.email,password:actor.password})).error).toBeNull();}

for(const language of ['es','en'] as const)test(`Company library versions: upload new version, history, restore as current, private [${language}]`,async({page,browser,baseURL},info)=>{
 test.setTimeout(300000);expect(baseURL).toBe(origin);expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');
 const en=language==='en',db=regressionAdminClient(),owner=await createDisposableAccount({prefix:'cfv-owner'}),errors=collectPageErrors(page);
 const mobile=(page.viewportSize()?.width??1366)<1024,suffix=`${language}${mobile?'-mobile':''}`;let rival:DisposableAccount|undefined,other:BrowserContext|undefined;
 const cleanStorage=async()=>{for(const [table,bucket] of [['pro_company_files','pro-company-files'],['pro_work_files','pro-work-files']] as const){const paths=(await db.from(table).select('object_path').eq('owner_id',owner.id).throwOnError()).data!.map(row=>row.object_path as string);if(paths.length)expect((await db.storage.from(bucket).remove(paths)).error).toBeNull();}};
 try{
  const user=await db.auth.admin.getUserById(owner.id);expect((await db.auth.admin.updateUserById(owner.id,{user_metadata:{...user.data.user!.user_metadata,is_provider:true,role:'professional'}})).error).toBeNull();
  await db.from('profiles').update({is_provider:true,role:'professional'}).eq('id',owner.id).throwOnError();await db.from('pro_memberships').insert({user_id:owner.id,status:'active'}).throwOnError();
  await db.from('professionals').insert({profile_id:owner.id,category_id:'desarrollo_web',business_name:'Biblioteca local',slug:'cfv-'+owner.id,whatsapp:'',provincia_id:'al',canton_id:'al-at',verification_status:'pending',is_banned:false,is_available:true}).throwOnError();
  const workId=crypto.randomUUID(),clientId='cfv-client',day=crTodayISO(),document=emptyBusiness();
  document.clients=[{id:clientId,name:'Cliente biblioteca',email:'',phone:'',notes:'',archived:false}];
  document.work=[{id:workId,clientId,client:'Cliente biblioteca',service:'Obra con contrato',stage:'scheduled',start:day+'T09:00:00-06:00',end:day+'T10:00:00-06:00',cancelled:false}];
  await db.from('pro_workspaces').insert({user_id:owner.id,document,revision:1}).throwOnError();await login(page.context(),owner);
  for(const endpoint of ['/api/auth/session-mfa','/api/auth/registration-state','/api/pro/access'])expect((await page.request.get(endpoint,{timeout:45000})).status()).toBe(200);
  expect((await page.request.get('/api/pro/client-operations?'+new URLSearchParams({workId,clientId}),{timeout:45000})).status()).toBe(200);
  const headers={Origin:origin,'X-Pro-Expected-Actor':owner.id};
  const post=async(url:string,data:Record<string,unknown>,status=200)=>{const r=await page.request.post(url,{headers,data,timeout:60000});expect(r.status(),JSON.stringify(data).slice(0,160)).toBe(status);return status===200?await r.json():null;};
  const read=async(fileId:string)=>{const r=await page.request.get(versions+'?'+new URLSearchParams({fileId}),{headers:{'X-Pro-Expected-Actor':owner.id}});expect(r.status()).toBe(200);return await r.json() as CompanyFileFamily;};
  // A folder and v1 through the existing library upload.
  const folderId=crypto.randomUUID();await post(api,{action:'folder_save',actionId:crypto.randomUUID(),folderId,revision:0,parentId:null,name:'Contratos',favorite:false});
  const v1Bytes=pdf('contrato original'),v1=crypto.randomUUID();await post(api,{action:'upload',actionId:crypto.randomUUID(),fileId:v1,folderId,name:'contrato.pdf',data:v1Bytes.toString('base64')});
  const initial=await read(v1);expect(initial).toMatchObject({rootId:v1,revision:0,currentVersion:1,currentFileId:v1});expect(initial.versions).toHaveLength(1);
  // API validation and isolation.
  expect((await page.request.post(versions,{headers,data:{action:'add_version',actionId:crypto.randomUUID(),fileId:v1,newFileId:crypto.randomUUID(),note:null,revision:0,extra:1}})).status()).toBe(400);
  expect((await page.request.post(versions,{headers:{...headers,'Content-Type':'application/json'},data:'{"pad":"'+'x'.repeat(17000)+'"}'})).status()).toBe(413);
  expect((await page.request.post(versions,{headers:{...headers,Origin:'http://evil.example'},data:{action:'restore',actionId:crypto.randomUUID(),fileId:v1,version:1,note:null,revision:0}})).status()).toBe(403);
  expect((await page.request.post(versions,{headers,data:{action:'add_version',actionId:crypto.randomUUID(),fileId:v1,newFileId:crypto.randomUUID(),note:null,revision:0}})).status()).toBe(400);
  rival=await createDisposableAccount({prefix:'cfv-rival'});other=await browser.newContext();await login(other,rival);
  expect((await other.request.get(origin+versions+'?'+new URLSearchParams({fileId:v1}),{headers:{'X-Pro-Expected-Actor':rival.id}})).status()).toBeGreaterThanOrEqual(403);

  // ---- UI: open the library, the file and its versions ----
  await gotoOK(page,`/${language}/dashboard/pro?tab=pro_files`);const library=page.locator('[data-company-files]');
  await library.getByRole('button',{name:en?'Open folder':'Abrir carpeta'}).click({timeout:60000});
  const card=library.locator('[data-company-file]');await expect(card).toHaveCount(1,{timeout:60000});await expect(card).toContainText('contrato.pdf');await expect(card.locator('[data-company-file-version-badge]')).toHaveCount(0);
  const openVersions=async()=>{// Round 2: versions are a visible button on the file card, no longer hidden in «…».
   await card.getByRole('button',{name:en?'Versions':'Versiones',exact:true}).click();const modal=page.getByRole('dialog',{name:en?'Versions':'Versiones'});await expect(modal.locator('[data-company-file-version]').first()).toBeVisible({timeout:60000});return modal;};
  let modal=await openVersions();
  await expect(modal.locator('[data-company-file-version]')).toHaveCount(1);await expect(modal.locator('[data-company-file-version="1"]')).toHaveAttribute('data-current','true');
  await expect(modal).toContainText(en?'Nothing is shared with customers.':'No se comparte nada con clientes.');
  await modal.getByLabel(en?'File':'Archivo',{exact:true}).setInputFiles({name:'nota.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg/>')});await expect(modal.locator('[data-company-file-versions-error]')).toContainText(en?'Choose a JPG, PNG, WebP or PDF':'Use un JPG, PNG, WebP o PDF');
  await expect(modal.locator('[data-company-file-version-save]')).toBeDisabled();
  const v2Bytes=pdf('contrato firmado');
  await modal.getByLabel(en?'File':'Archivo',{exact:true}).setInputFiles({name:'contrato-firmado.pdf',mimeType:'application/pdf',buffer:v2Bytes});
  await modal.getByLabel(en?'Note (optional)':'Nota (opcional)').fill('Firmado por ambas partes');
  await modal.locator('[data-company-file-version-save]').click();await expect(modal.locator('[data-company-file-versions-notice]')).toContainText(en?'New version saved as current.':'Versión nueva guardada como vigente.',{timeout:60000});
  await expect(modal.locator('[data-company-file-version]')).toHaveCount(2);await expect(modal.locator('[data-company-file-version="2"]')).toHaveAttribute('data-current','true');await expect(modal.locator('[data-company-file-version="2"]')).toContainText('Firmado por ambas partes');
  // Touch targets: every button of the panel on phones (the shared desktop close icon is smaller by design).
  if(mobile)for(const button of await modal.getByRole('button').all())if(await button.isVisible())expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  for(const button of await modal.locator('[data-company-file-versions] button').all())if(await button.isVisible())expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await expectNoHorizontalOverflow(page);await page.screenshot({path:info.outputPath(`company-file-versions-${suffix}.png`),fullPage:true});
  let family=await read(v1);const v2=family.currentFileId;expect(v2).not.toBe(v1);expect(family).toMatchObject({rootId:v1,revision:2,currentVersion:2});
  const v2Row=(await db.from('pro_company_files').select('folder_id,sha256,name,ready').eq('owner_id',owner.id).eq('id',v2).single().throwOnError()).data!;expect(v2Row).toEqual({folder_id:folderId,sha256:sha(v2Bytes),name:'contrato-firmado.pdf',ready:true});
  await modal.getByRole('button',{name:en?'Close':'Cerrar'}).first().click();await expect(modal).toHaveCount(0);
  // The list shows only the current version, with its badge.
  await expect(card).toHaveCount(1);await expect(card).toContainText('contrato-firmado.pdf');await expect(card.locator('[data-company-file-version-badge]')).toHaveText(en?'Version 2':'Versión 2');
  await expectNoHorizontalOverflow(page);await card.scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath(`company-file-versions-list-${suffix}.png`)});
  // Older versions stay downloadable (same verified binary route).
  const old=await page.request.get(api+'?'+new URLSearchParams({view:'binary',fileId:v1}),{headers:{'X-Pro-Expected-Actor':owner.id}});expect(old.status()).toBe(200);expect(sha(await old.body())).toBe(sha(v1Bytes));
  // Restore v1 as current (a new v3, nothing rewritten).
  modal=await openVersions();await modal.locator('[data-company-file-version="1"]').getByRole('button',{name:en?'Restore as current':'Restaurar como vigente'}).click();
  await page.getByRole('alertdialog').or(page.getByRole('dialog').last()).getByRole('button',{name:en?'Restore as current':'Restaurar como vigente'}).click();
  await expect(modal.locator('[data-company-file-versions-notice]')).toContainText(en?'Version 1 is current again':'La versión 1 vuelve a ser la vigente',{timeout:60000});
  await expect(modal.locator('[data-company-file-version]')).toHaveCount(3);await expect(modal.locator('[data-company-file-version="3"]')).toHaveAttribute('data-current','true');await expect(modal.locator('[data-company-file-version="3"]')).toContainText(en?'Restored from version 1':'Restaurada desde la versión 1');
  await expectNoHorizontalOverflow(page);await page.screenshot({path:info.outputPath(`company-file-versions-restored-${suffix}.png`),fullPage:true});
  await modal.getByRole('button',{name:en?'Close':'Cerrar'}).first().click();await expect(card).toContainText('contrato.pdf');await expect(card.locator('[data-company-file-version-badge]')).toHaveText(en?'Version 3':'Versión 3');
  family=await read(v2);expect(family).toMatchObject({rootId:v1,revision:3,currentVersion:3,currentFileId:v1});expect(family.versions.map(v=>[v.version,v.kind,v.file.id])).toEqual([[3,'restore',v1],[2,'upload',v2],[1,'original',v1]]);
  // CAS and idempotency through the API.
  const stale={action:'restore',actionId:crypto.randomUUID(),fileId:v1,version:2,note:null,revision:2};expect((await page.request.post(versions,{headers,data:stale})).status()).toBe(409);
  const restore2={...stale,actionId:crypto.randomUUID(),revision:3};const first=await post(versions,restore2),again=await post(versions,restore2);expect(again).toEqual(first);expect(first.family.currentFileId).toBe(v2);
  expect((await db.from('pro_company_file_versions').select('version').eq('owner_id',owner.id).throwOnError()).data).toHaveLength(4);
  // «Usar en trabajo» copies the current version as a private (unshared) job file.
  const targetFileId=crypto.randomUUID(),current=(await db.from('pro_company_files').select('revision').eq('owner_id',owner.id).eq('id',v2).single().throwOnError()).data!;
  const copied=await post(api,{action:'copy',actionId:crypto.randomUUID(),fileId:v2,revision:current.revision,workId,targetFileId});expect(copied.copy.file.sha256).toBe(sha(v2Bytes));
  const work=(await db.from('pro_work_files').select('revision,published_at').eq('owner_id',owner.id).eq('id',targetFileId).single().throwOnError()).data!;expect(work).toEqual({revision:1,published_at:null});
  // Nothing shared or notified.
  for(const table of ['notifications','notification_push_outbox'])expect((await db.from(table).select('id').eq('user_id',owner.id).throwOnError()).data).toEqual([]);
  expect(errors()).toEqual([]);
 }finally{await other?.close().catch(()=>{});await page.goto('about:blank').catch(()=>{});await cleanStorage().catch(()=>{});await cleanupDisposableAccount(owner);if(rival)await cleanupDisposableAccount(rival);}
});

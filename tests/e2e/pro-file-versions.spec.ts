import {test,expect,type BrowserContext,type Page} from 'playwright/test';
import {createServerClient} from '@supabase/ssr';
import sharp from 'sharp';
import {createDisposableAccount,cleanupDisposableAccount,type DisposableAccount} from './disposable-account';
import {regressionAdminClient} from './seed';
import {emptyBusiness} from '../../src/lib/pro/business';
import {crTodayISO} from '../../src/lib/time-cr';
import {gotoOK,expectNoHorizontalOverflow,onAppPageError} from './helpers';
import {stabilizeLocalProRuntime} from './pro-local-stable-runtime';

// Fila 30 «Versiones y comentarios por documento». Local types on purpose: the module's
// src/lib/pro/file-versions.ts only exists after phase 2 (docs/pro/file-versions-local.md).
type Version={versionNo:number;fileId:string;kind:'original'|'upload'|'restore';restoredFrom:number|null;note:string|null;shared:boolean;file:{id:string;name:string;sha256:string;sizeBytes:number;revision:1|2}};
type Family={familyId:string;workId:string;revision:number;currentVersionNo:number;currentFileId:string;versionCount:number;versions:Version[];counts:{team:number;client:number;teamArchived:number;clientArchived:number};canShare:boolean;recipientId:string|null};
type Comment={id:string;thread:'team'|'client';versionNo:number|null;authorKind:'owner'|'client';body:string;revision:number;edited:boolean;archived:boolean};
type CommentPage={items:Comment[];nextCursor:string|null};
type ClientDiscussion={fileId:string;versionNo:number;sharedVersions:{versionNo:number;fileId:string}[];items:{id:string;mine:boolean;fromTeam:boolean;body:string;revision:number}[];canComment:boolean};

const origin='http://127.0.0.1:3185',api='/api/pro/file-versions',filesApi='/api/pro/work-files',bucket='pro-work-files';
function local(baseURL:string|undefined){expect(baseURL).toBe(origin);expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');}
async function login(context:BrowserContext,actor:DisposableAccount){await stabilizeLocalProRuntime(context,origin);const auth=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{getAll:()=>[],setAll:async cookies=>context.addCookies(cookies.map(cookie=>({name:cookie.name,value:cookie.value,url:origin,sameSite:'Lax' as const})))}});const result=await auth.auth.signInWithPassword({email:actor.email,password:actor.password});expect(result.error).toBeNull();}
const jpeg=(color:string)=>sharp({create:{width:24,height:24,channels:3,background:color}}).png().toBuffer();

async function fixture(context:BrowserContext){
 const owner=await createDisposableAccount({prefix:'fver-owner'}),db=regressionAdminClient();let client:DisposableAccount|undefined,stranger:DisposableAccount|undefined;
 try{
  client=await createDisposableAccount({prefix:'fver-client'});stranger=await createDisposableAccount({prefix:'fver-stranger'});
  const account=await db.auth.admin.getUserById(owner.id);expect((await db.auth.admin.updateUserById(owner.id,{user_metadata:{...account.data.user!.user_metadata,is_provider:true,role:'professional'}})).error).toBeNull();
  await db.from('profiles').update({is_provider:true,role:'professional'}).eq('id',owner.id).throwOnError();await db.from('pro_memberships').insert({user_id:owner.id,status:'active'}).throwOnError();
  const professional=(await db.from('professionals').insert({profile_id:owner.id,category_id:'desarrollo_web',business_name:'Versiones locales',slug:'fver-'+owner.id,whatsapp:'',provincia_id:'al',canton_id:'al-at',verification_status:'pending',is_banned:false,is_available:true}).select('id').single().throwOnError()).data!;
  const workId=crypto.randomUUID(),requestId=crypto.randomUUID(),day=crTodayISO(),linkedClient='reservation-'+client.id,document=emptyBusiness();
  document.clients=[{id:linkedClient,name:'Cliente vinculado local',email:'',phone:'',notes:'',archived:false}];
  document.work=[{id:workId,clientId:linkedClient,client:'Cliente vinculado local',service:'Remodelación de baño',stage:'scheduled',start:day+'T11:00:00-06:00',end:day+'T12:00:00-06:00',cancelled:false,bookingClientId:client.id}];
  await db.from('pro_workspaces').insert({user_id:owner.id,document,revision:1}).throwOnError();await login(context,owner);
  for(const endpoint of ['/api/auth/session-mfa','/api/auth/registration-state','/api/pro/access'])expect((await context.request.get(origin+endpoint,{timeout:45000})).status()).toBe(200);
  expect((await context.request.get(origin+'/api/pro/client-operations?'+new URLSearchParams({workId,clientId:linkedClient}),{timeout:45000})).status()).toBe(200);
  await db.from('pro_appointment_requests').insert({id:requestId,professional_id:professional.id,owner_id:owner.id,client_user_id:client.id,client_name:'Cliente vinculado local',professional_name:'Versiones locales',professional_slug:'fver-'+owner.id,service:'Remodelación de baño',duration_minutes:60,location_kind:'agree',location_text:'',note:'',requested_start:day+'T11:00:00-06:00',status:'confirmed',revision:0,work_id:workId}).throwOnError();
  await db.from('pro_appointment_events').insert({request_id:requestId,actor_id:owner.id,side:'provider',action:'confirm',note:'',status:'confirmed'}).throwOnError();
  return {owner,client,stranger,db,workId,requestId};
 }catch(error){await cleanupDisposableAccount(owner);if(client)await cleanupDisposableAccount(client);if(stranger)await cleanupDisposableAccount(stranger);throw error;}
}
type Fixture=Awaited<ReturnType<typeof fixture>>;
async function cleanup(f:Fixture){
 try{const paths=(await f.db.from('pro_work_files').select('object_path').eq('owner_id',f.owner.id).throwOnError()).data!.map(row=>row.object_path as string);
  for(const path of paths)expect(path.startsWith(f.owner.id+'/')).toBe(true);if(paths.length)expect((await f.db.storage.from(bucket).remove(paths)).error).toBeNull();}
 finally{await cleanupDisposableAccount(f.owner);await cleanupDisposableAccount(f.client);await cleanupDisposableAccount(f.stranger);}
}
async function upload(page:Page,f:Fixture,name:string,color:string){
 const fileId=crypto.randomUUID(),response=await page.request.post(filesApi,{headers:{Origin:origin,'X-Pro-Expected-Actor':f.owner.id},data:{action:'upload',workId:f.workId,fileId,name,data:(await jpeg(color)).toString('base64')}});
 expect(response.status()).toBe(200);return fileId;
}
const ownerPost=(page:Page,f:Fixture,data:Record<string,unknown>)=>page.request.post(api,{headers:{Origin:origin,'X-Pro-Expected-Actor':f.owner.id},data});
async function family(page:Page,f:Fixture,fileId:string){const response=await page.request.get(api+'?'+new URLSearchParams({workId:f.workId,fileId}),{headers:{'X-Pro-Expected-Actor':f.owner.id}});expect(response.status()).toBe(200);return await response.json() as Family;}
async function notices(f:Fixture){const out:Record<string,unknown>={};for(const table of ['notifications','notification_push_outbox'])out[table]=(await f.db.from(table).select('*').in('user_id',[f.owner.id,f.client.id]).order('id').throwOnError()).data;return out;}

test('File versions API: versions, restore, explicit sharing, threads, isolation and idempotency',async({page,browser,baseURL})=>{
 test.setTimeout(300000);local(baseURL);const f=await fixture(page.context());let customer:BrowserContext|undefined,other:BrowserContext|undefined;
 try{
  const before=await notices(f);
  const v1=await upload(page,f,'plano baño.png','#00a1ce'),v2=await upload(page,f,'plano baño corregido.png','#162543'),loose=await upload(page,f,'otra foto.png','#ff7c0a');
  const start=await family(page,f,v1);expect(start).toMatchObject({familyId:v1,revision:0,currentVersionNo:1,currentFileId:v1,versionCount:1,canShare:true,recipientId:f.client.id});expect(start.versions).toHaveLength(1);
  // Validation 400, idempotent replay, reused identity 400, stale revision 409.
  const add={action:'add_version',actionId:crypto.randomUUID(),workId:f.workId,fileId:v1,newFileId:v2,note:'Se corrigió la cota de la ducha',revision:0};
  expect((await ownerPost(page,f,{...add,extra:true})).status()).toBe(400);
  expect((await ownerPost(page,f,{...add,note:'x'.repeat(501)})).status()).toBe(400);
  expect((await ownerPost(page,f,{...add,actionId:'no-uuid'})).status()).toBe(400);
  const first=await ownerPost(page,f,add);expect(first.status()).toBe(200);const firstBody=await first.json() as {family:Family};
  expect(firstBody.family).toMatchObject({revision:1,currentVersionNo:2,currentFileId:v2,versionCount:2});expect(firstBody.family.versions.map(v=>[v.versionNo,v.fileId,v.kind])).toEqual([[2,v2,'upload'],[1,v1,'original']]);
  const replay=await ownerPost(page,f,add);expect(replay.status()).toBe(200);expect(await replay.json()).toEqual(firstBody);
  expect((await ownerPost(page,f,{...add,note:'otra nota'})).status()).toBe(400);
  expect((await ownerPost(page,f,{...add,actionId:crypto.randomUUID(),newFileId:loose})).status()).toBe(409);
  // Same-origin, bounded body and permissions.
  expect((await page.request.post(api,{headers:{'X-Pro-Expected-Actor':f.owner.id},data:{...add,actionId:crypto.randomUUID()}})).status()).toBe(403);
  expect((await ownerPost(page,f,{...add,actionId:crypto.randomUUID(),note:'x'.repeat(17000)})).status()).toBe(413);
  expect((await page.request.post(api,{headers:{Origin:origin,'X-Pro-Expected-Actor':f.client.id},data:{...add,actionId:crypto.randomUUID()}})).status()).toBe(403);
  other=await browser.newContext({baseURL});await login(other,f.stranger);
  expect((await other.request.get(origin+api+'?'+new URLSearchParams({workId:f.workId,fileId:v1}),{headers:{'X-Pro-Expected-Actor':f.stranger.id}})).status()).toBe(403);
  // Restore creates v3 from v1; nothing is deleted and nothing becomes shared.
  const restore=await ownerPost(page,f,{action:'restore',actionId:crypto.randomUUID(),workId:f.workId,fileId:v2,versionNo:1,note:null,revision:1});expect(restore.status()).toBe(200);
  const restored=(await restore.json() as {family:Family}).family;expect(restored).toMatchObject({currentVersionNo:3,currentFileId:v1,versionCount:3});expect(restored.versions[0]).toMatchObject({kind:'restore',restoredFrom:1,fileId:v1});
  expect(restored.versions.every(v=>!v.shared)).toBe(true);
  const listed=await page.request.get(filesApi+'?'+new URLSearchParams({workId:f.workId}),{headers:{'X-Pro-Expected-Actor':f.owner.id}});expect((await listed.json() as {items:unknown[]}).items).toHaveLength(3);
  const index=await page.request.get(api+'?'+new URLSearchParams({workId:f.workId,index:[v1,v2,loose].join(',')}),{headers:{'X-Pro-Expected-Actor':f.owner.id}});expect(index.status()).toBe(200);
  const badges=(await index.json() as {items:{fileId:string;current:boolean;versionNo:number}[]}).items;expect(badges.map(b=>[b.fileId,b.current,b.versionNo]).sort()).toEqual([[v1,true,3],[v2,false,2]].sort());
  // «Compartir esta versión» is the existing explicit publish; the customer list keeps exactly that file.
  const share=await page.request.post(filesApi,{headers:{Origin:origin,'X-Pro-Expected-Actor':f.owner.id},data:{action:'publish',workId:f.workId,fileId:v2,actionId:crypto.randomUUID(),revision:1,recipientId:f.client.id}});expect(share.status()).toBe(200);
  expect((await family(page,f,v1)).versions.filter(v=>v.shared).map(v=>v.versionNo)).toEqual([2]);
  customer=await browser.newContext({baseURL});await login(customer,f.client);const clientHeaders={'X-Pro-Expected-Actor':f.client.id};
  const sharedList=await customer.request.get(origin+filesApi+'?'+new URLSearchParams({requestId:f.requestId}),{headers:clientHeaders});expect((await sharedList.json() as {items:{id:string}[]}).items.map(i=>i.id)).toEqual([v2]);
  expect((await customer.request.get(origin+api+'?'+new URLSearchParams({requestId:f.requestId,fileId:v1}),{headers:clientHeaders})).status()).toBe(404);
  // Team thread: create, replay, edit with history; never visible to the customer.
  const teamCreate={action:'comment_create',actionId:crypto.randomUUID(),workId:f.workId,fileId:v1,commentId:crypto.randomUUID(),thread:'team',versionNo:2,body:'TEAM_ONLY revisar la cota'};
  expect((await ownerPost(page,f,{...teamCreate,body:'x'.repeat(2001)})).status()).toBe(400);
  expect((await ownerPost(page,f,{...teamCreate,body:'   '})).status()).toBe(400);
  const team=await ownerPost(page,f,teamCreate);expect(team.status()).toBe(200);const teamBody=await team.json() as {comment:Comment};expect((await ownerPost(page,f,teamCreate)).status()).toBe(200);
  const edit=await ownerPost(page,f,{action:'comment_edit',actionId:crypto.randomUUID(),workId:f.workId,commentId:teamBody.comment.id,body:'TEAM_ONLY revisar la cota norte',revision:1});expect(edit.status()).toBe(200);
  expect((await ownerPost(page,f,{action:'comment_edit',actionId:crypto.randomUUID(),workId:f.workId,commentId:teamBody.comment.id,body:'otra',revision:1})).status()).toBe(409);
  const detail=await page.request.get(api+'?'+new URLSearchParams({workId:f.workId,fileId:v1,commentId:teamBody.comment.id}),{headers:{'X-Pro-Expected-Actor':f.owner.id}});
  expect((await detail.json() as {history:{action:string}[]}).history.map(h=>h.action)).toEqual(['edit','create']);
  // Customer thread on the shared version.
  expect((await ownerPost(page,f,{action:'comment_create',actionId:crypto.randomUUID(),workId:f.workId,fileId:v1,commentId:crypto.randomUUID(),thread:'client',versionNo:1,body:'v1 no está compartida'})).status()).toBe(400);
  expect((await ownerPost(page,f,{action:'comment_create',actionId:crypto.randomUUID(),workId:f.workId,fileId:v1,commentId:crypto.randomUUID(),thread:'client',versionNo:2,body:'OWNER_TO_CLIENT le comparto la v2'})).status()).toBe(200);
  const clientPost=(data:Record<string,unknown>)=>customer!.request.post(origin+api,{headers:{Origin:origin,...clientHeaders},data});
  const clientCreate={action:'create',actionId:crypto.randomUUID(),requestId:f.requestId,fileId:v2,commentId:crypto.randomUUID(),body:'CLIENT_COMMENT ¿se puede ampliar la ventana?'};
  expect((await clientPost({...clientCreate,fileId:v1})).status()).toBe(403);
  const created=await clientPost(clientCreate);expect(created.status()).toBe(200);expect((await clientPost(clientCreate)).status()).toBe(200);
  expect((await clientPost({action:'edit',actionId:crypto.randomUUID(),requestId:f.requestId,commentId:teamBody.comment.id,body:'robo',revision:2})).status()).toBe(403);
  const discussion=await customer.request.get(origin+api+'?'+new URLSearchParams({requestId:f.requestId,fileId:v2}),{headers:clientHeaders});expect(discussion.status()).toBe(200);
  const seen=await discussion.json() as ClientDiscussion;expect(seen).toMatchObject({fileId:v2,versionNo:2,canComment:true});expect(seen.sharedVersions.map(v=>v.versionNo)).toEqual([2]);
  expect(seen.items.map(i=>[i.fromTeam,i.mine])).toEqual([[false,true],[true,false]]);expect(JSON.stringify(seen)).not.toContain('TEAM_ONLY');
  expect((await other.request.get(origin+api+'?'+new URLSearchParams({requestId:f.requestId,fileId:v2}),{headers:{'X-Pro-Expected-Actor':f.stranger.id}})).status()).toBe(404);
  const ownerClient=await page.request.get(api+'?'+new URLSearchParams({workId:f.workId,fileId:v1,thread:'client'}),{headers:{'X-Pro-Expected-Actor':f.owner.id}});expect((await ownerClient.json() as CommentPage).items).toHaveLength(2);
  expect((await page.request.get(api+'?'+new URLSearchParams({workId:f.workId,fileId:v1,thread:'other'}),{headers:{'X-Pro-Expected-Actor':f.owner.id}})).status()).toBe(400);
  expect(await notices(f)).toEqual(before);
 }finally{await customer?.close();await other?.close();await cleanup(f);}
});

for(const language of ['es','en'] as const)test(`File versions UI: upload a version, restore, compare, comment and customer reply [${language}]`,async({page,browser,baseURL},info)=>{
 test.setTimeout(300000);local(baseURL);const en=language==='en',f=await fixture(page.context());let customer:BrowserContext|undefined;
 try{
  const runtime:string[]=[];onAppPageError(page,message=>runtime.push(message));
  const original=await upload(page,f,'plano cocina.png','#00a1ce');
  await gotoOK(page,`/${language}/dashboard/pro?tab=pro_agenda&cita=${f.workId}&vistaTrabajo=updates`);
  const card=page.locator(`[data-work-file="${original}"]`);await expect(card).toBeVisible({timeout:60000});
  // Error state with retry (one failed read), then the empty discussion.
  let failOnce=true;await page.route(url=>url.pathname===api&&url.searchParams.has('fileId')&&!url.searchParams.has('thread'),async route=>{if(failOnce){failOnce=false;await route.fulfill({status:503,json:{error:'x'}});}else await route.continue();});
  await card.getByRole('button',{name:en?'Versions and comments':'Versiones y comentarios',exact:true}).click();
  const panel=card.locator('[data-work-file-versions]');await expect(panel.getByRole('alert')).toContainText(en?'Could not load versions.':'No se pudieron cargar las versiones.');
  await panel.getByRole('button',{name:en?'Retry':'Reintentar',exact:true}).click();
  await expect(panel.getByText(en?'Current: version 1 of 1.':'Vigente: versión 1 de 1.',{exact:false})).toBeVisible();
  await expect(panel.locator('[data-file-discussion]')).toContainText(en?'No comments yet.':'Todavía no hay comentarios.');
  // Upload v2 through the same normalized path, with a change note.
  await panel.getByLabel(en?'New file':'Archivo nuevo',{exact:true}).setInputFiles({name:'plano cocina v2.png',mimeType:'image/png',buffer:await jpeg('#162543')});
  // Round 2: the PNG → JPG conversion is stated before saving.
  await expect(panel.locator('[data-file-version-converted]')).toContainText('plano cocina v2.jpg');
  await panel.getByLabel(en?'Change note (optional)':'Nota del cambio (opcional)',{exact:true}).fill(en?'Island moved 20 cm':'Se movió la isla 20 cm');
  await panel.getByRole('button',{name:en?'Save as new version':'Guardar como nueva versión',exact:true}).click();
  await expect(panel.getByRole('status').filter({hasText:en?'New version saved privately.':'Nueva versión guardada de forma privada.'})).toBeVisible({timeout:60000});
  await expect(panel.locator('[data-file-version]')).toHaveCount(2);await expect(panel.locator('[data-file-version="2"]')).toContainText(en?'Current':'Vigente');
  await expect(panel.locator('[data-file-version="2"]')).toContainText(en?'Island moved 20 cm':'Se movió la isla 20 cm');
  // Round 2: the form is cleared after saving (no file still «chosen», empty note, no conversion notice).
  await expect(panel.getByText(en?'No file chosen':'Ningún archivo elegido',{exact:true})).toBeVisible();await expect(panel.locator('[data-file-version-converted]')).toHaveCount(0);
  await expect(panel.getByLabel(en?'Change note (optional)':'Nota del cambio (opcional)',{exact:true})).toHaveValue('');
  // Restore v1 as current (creates v3; v1 and v2 remain).
  await panel.locator('[data-file-version="1"]').getByRole('button',{name:new RegExp(en?'^Restore as current':'^Restaurar como vigente')}).click();
  const dialog=page.getByRole('dialog').last();await dialog.getByRole('button',{name:en?'Restore as current':'Restaurar como vigente',exact:true}).click();
  await expect(panel.locator('[data-file-version]')).toHaveCount(3);await expect(panel.locator('[data-file-version="3"]')).toContainText(en?'Restored from v1':'Restaurada desde v1');
  // Compare metadata of v1 and v3: identical content.
  const compare=panel.locator('[data-file-version-compare]');await compare.getByLabel(en?'Version A':'Versión A').selectOption('1');await compare.getByLabel(en?'Version B':'Versión B').selectOption('3');
  await expect(compare).toContainText(en?'Identical (same SHA-256 fingerprint)':'Idéntico (misma huella SHA-256)');
  // Team comment, edit and history.
  const discussion=panel.locator('[data-file-discussion]');const text=en?'Check the north measurement':'Revisar la medida norte';
  await discussion.getByLabel(en?'New team comment':'Nuevo comentario del equipo',{exact:true}).fill(text);await discussion.getByRole('button',{name:en?'Post comment':'Publicar comentario',exact:true}).click();
  await expect(discussion.locator('[data-file-comment]')).toHaveCount(1);await expect(discussion.locator('[data-file-comment]')).toContainText(text);
  await discussion.getByRole('button',{name:en?'Edit':'Editar',exact:true}).click();await discussion.getByLabel(en?'Edit comment':'Editar comentario').fill(text+' y sur');
  await discussion.getByRole('button',{name:en?'Save changes':'Guardar cambios',exact:true}).click();await expect(discussion.locator('[data-file-comment]')).toContainText(en?'Edited':'Editado');
  await discussion.getByRole('button',{name:en?'View history':'Ver historial',exact:true}).click();await expect(discussion.locator('[data-file-comment-history]')).toContainText(text);
  await expectNoHorizontalOverflow(page);await page.screenshot({path:info.outputPath(`owner-${language}.png`),fullPage:true});
  // Reload: persisted.
  await page.reload();const again=page.locator(`[data-work-file="${original}"]`);await expect(again).toBeVisible({timeout:60000});
  await expect(again.locator('[data-version-badge]')).toContainText(en?'Version 3 · current':'Versión 3 · vigente');
  await again.getByRole('button',{name:new RegExp(en?'^Versions and comments':'^Versiones y comentarios')}).click();
  await expect(again.locator('[data-file-version]')).toHaveCount(3);await expect(again.locator('[data-file-comment]')).toContainText(text+' y sur');
  // Share v2 explicitly from the panel; the customer comments on it.
  await again.locator('[data-file-version="2"]').getByRole('button',{name:new RegExp(en?'^Share this version':'^Compartir esta versión')}).click();
  await page.getByRole('dialog').last().getByRole('button',{name:en?'Share this version':'Compartir esta versión',exact:true}).click();
  await expect(again.locator('[data-file-version="2"]')).toContainText(en?'Shared with customer':'Compartida con el cliente');await expect(again.locator('[data-file-version="3"]')).not.toContainText(en?'Shared with customer':'Compartida con el cliente');
  customer=await browser.newContext({baseURL});await login(customer,f.client);const customerPage=await customer.newPage();onAppPageError(customerPage,message=>runtime.push(message));
  await gotoOK(customerPage,`/${language}/dashboard/profesional?tab=appointments&citaSolicitud=${f.requestId}`);
  const shared=customerPage.locator('[data-shared-work-file]');await expect(shared).toHaveCount(1,{timeout:60000});
  await shared.getByRole('button',{name:en?'Comments':'Comentarios',exact:true}).click();const reply=en?'Can the window be wider?':'¿Se puede ampliar la ventana?';
  await shared.getByLabel(en?'Your comment on this file':'Su comentario sobre este archivo').fill(reply);await shared.getByRole('button',{name:en?'Post comment':'Enviar comentario',exact:true}).click();
  await expect(shared.locator('[data-client-file-comment]')).toContainText(reply);await expect(shared).not.toContainText(text);
  await expectNoHorizontalOverflow(customerPage);await customerPage.screenshot({path:info.outputPath(`customer-${language}.png`),fullPage:true});
  // Owner sees the customer comment in «With customer».
  await page.reload();const third=page.locator(`[data-work-file="${original}"]`);await expect(third).toBeVisible({timeout:60000});
  await third.getByRole('button',{name:new RegExp(en?'^Versions and comments':'^Versiones y comentarios')}).click();
  await third.getByRole('button',{name:en?'With customer':'Con el cliente',exact:true}).click();await expect(third.locator('[data-file-comment]')).toContainText(reply);
  await page.setViewportSize({width:390,height:844});await expectNoHorizontalOverflow(page);await page.screenshot({path:info.outputPath(`owner-mobile-${language}.png`),fullPage:true});
  expect(runtime).toEqual([]);
 }finally{await customer?.close();await cleanup(f);}
});

import {test,expect,type BrowserContext,type Page} from 'playwright/test';
import {createServerClient} from '@supabase/ssr';
import {randomBytes} from 'node:crypto';
import {mkdirSync} from 'node:fs';
import sharp from 'sharp';
import {createDisposableAccount,cleanupDisposableAccount,type DisposableAccount} from './disposable-account';
import {regressionAdminClient} from './seed';
import {emptyBusiness} from '../../src/lib/pro/business';
import {crTodayISO} from '../../src/lib/time-cr';
import {gotoOK,expectNoHorizontalOverflow,onAppPageError} from './helpers';
import {stabilizeLocalProRuntime} from './pro-local-stable-runtime';

// Row 30: @mentions of the job team in the private team thread of a job file, and the member's
// isolated in-app inbox in Equipo (docs/pro/sql/work-file-mentions-local.sql). Local Supabase only.
type Target={userId:string;grantId:string;sourceInviteId:string;name:string};
type Notice={id:string;service:string;fileName:string;versionNo:number|null;authorName:string;excerpt:string;createdAt:string;dayCr:string;readAt:string|null};
type Inbox={items:Notice[];nextCursor:string|null;unreadCount:number};
const origin=process.env.PRO_LOCAL_ORIGIN??'http://127.0.0.1:3185',api='/api/pro/file-mentions',versionsApi='/api/pro/file-versions',filesApi='/api/pro/work-files',teamApi='/api/pro/team',bucket='pro-work-files';
const shots=process.env.PRO_SHOTS_DIR;
function local(baseURL:string|undefined){expect(baseURL).toBe(origin);expect(new URL(origin).hostname).toBe('127.0.0.1');expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');}
async function login(context:BrowserContext,actor:DisposableAccount){
 await stabilizeLocalProRuntime(context,origin);
 const auth=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{getAll:()=>[],setAll:async cookies=>context.addCookies(cookies.map(cookie=>({name:cookie.name,value:cookie.value,url:origin,sameSite:'Lax' as const})))}});
 const result=await auth.auth.signInWithPassword({email:actor.email,password:actor.password});expect(result.error).toBeNull();
 for(const endpoint of ['/api/auth/session-mfa','/api/auth/registration-state'])expect((await context.request.get(origin+endpoint,{timeout:45000})).status()).toBe(200);
}
const jpeg=(color:string)=>sharp({create:{width:24,height:24,channels:3,background:color}}).png().toBuffer();
const post=(context:BrowserContext,actor:DisposableAccount,path:string,data:Record<string,unknown>,headers:Record<string,string>={Origin:origin})=>context.request.post(origin+path,{headers:{...headers,'X-Pro-Expected-Actor':actor.id},data});
const get=(context:BrowserContext,actor:DisposableAccount,path:string,query:Record<string,string>)=>context.request.get(origin+path+'?'+new URLSearchParams(query),{headers:{'X-Pro-Expected-Actor':actor.id}});

async function fixture(browser:import('playwright/test').Browser,baseURL:string|undefined,ownerContext:BrowserContext){
 const db=regressionAdminClient(),owner=await createDisposableAccount({prefix:'fmen-owner'}),accounts:DisposableAccount[]=[owner],contexts:BrowserContext[]=[];
 try{
  const ana=await createDisposableAccount({prefix:'fmen-ana'});accounts.push(ana);const beto=await createDisposableAccount({prefix:'fmen-beto'});accounts.push(beto);const outsider=await createDisposableAccount({prefix:'fmen-out'});accounts.push(outsider);
  const account=await db.auth.admin.getUserById(owner.id);expect((await db.auth.admin.updateUserById(owner.id,{user_metadata:{...account.data.user!.user_metadata,is_provider:true,role:'professional'}})).error).toBeNull();
  await db.from('profiles').update({is_provider:true,role:'professional',full_name:'Dueña Menciones'}).eq('id',owner.id).throwOnError();
  for(const [member,name] of [[ana,'Ana Rojas Local'],[beto,'Beto Mora Local'],[outsider,'Fuera Del Trabajo']] as const)await db.from('profiles').update({full_name:name}).eq('id',member.id).throwOnError();
  await db.from('pro_memberships').insert({user_id:owner.id,status:'active'}).throwOnError();
  await db.from('professionals').insert({profile_id:owner.id,category_id:'desarrollo_web',business_name:'Menciones locales',slug:'fmen-'+owner.id,whatsapp:'',provincia_id:'al',canton_id:'al-at',verification_status:'pending',is_banned:false,is_available:true}).throwOnError();
  const workId=crypto.randomUUID(),otherWorkId=crypto.randomUUID(),day=crTodayISO(),clientId='fmen-client',document=emptyBusiness();
  document.clients=[{id:clientId,name:'Cliente menciones',email:'',phone:'',notes:'',archived:false}];
  document.work=[workId,otherWorkId].map((id,index)=>({id,clientId,client:'Cliente menciones',service:index?'Otro trabajo local':'Remodelación de cocina',stage:'scheduled',start:day+'T09:00:00-06:00',end:day+'T11:00:00-06:00',cancelled:false}));
  await db.from('pro_workspaces').insert({user_id:owner.id,document,revision:1}).throwOnError();
  await login(ownerContext,owner);
  expect((await ownerContext.request.get(origin+'/api/pro/access',{timeout:45000})).status()).toBe(200);
  for(const id of [workId,otherWorkId])expect((await ownerContext.request.get(origin+'/api/pro/client-operations?'+new URLSearchParams({clientId,workId:id}),{timeout:45000})).status()).toBe(200);
  const member=async(person:DisposableAccount,job:string)=>{const context=await browser.newContext({baseURL});contexts.push(context);await login(context,person);const code=randomBytes(32).toString('hex');
   expect((await post(ownerContext,owner,teamApi,{action:'invite',actionId:crypto.randomUUID(),workId:job,email:person.email,role:'viewer',code})).status()).toBe(200);
   expect((await post(context,person,teamApi,{action:'accept',actionId:crypto.randomUUID(),code})).status()).toBe(200);return context;};
  const anaContext=await member(ana,workId),betoContext=await member(beto,workId),outsiderContext=await member(outsider,otherWorkId);
  return {db,owner,ana,beto,outsider,workId,otherWorkId,anaContext,betoContext,outsiderContext,accounts,contexts};
 }catch(error){for(const context of contexts)await context.close();for(const person of accounts)await cleanupDisposableAccount(person);throw error;}
}
type Fixture=Awaited<ReturnType<typeof fixture>>;
async function cleanup(f:Fixture){
 try{const paths=(await f.db.from('pro_work_files').select('object_path').eq('owner_id',f.owner.id).throwOnError()).data!.map(row=>row.object_path as string);
  for(const path of paths)expect(path.startsWith(f.owner.id+'/')).toBe(true);if(paths.length)expect((await f.db.storage.from(bucket).remove(paths)).error).toBeNull();}
 finally{for(const context of f.contexts)await context.close().catch(()=>{});for(const person of f.accounts)await cleanupDisposableAccount(person);}
}
async function upload(context:BrowserContext,f:Fixture,name:string,color:string){
 const fileId=crypto.randomUUID(),response=await post(context,f.owner,filesApi,{action:'upload',workId:f.workId,fileId,name,data:(await jpeg(color)).toString('base64')});
 expect(response.status()).toBe(200);return fileId;
}
async function targets(context:BrowserContext,f:Fixture){const response=await get(context,f.owner,api,{view:'targets',workId:f.workId});expect(response.status()).toBe(200);return (await response.json() as {items:Target[]}).items;}
async function inbox(context:BrowserContext,actor:DisposableAccount,status='unread'){const response=await get(context,actor,api,{view:'inbox',status});expect(response.status()).toBe(200);return await response.json() as Inbox;}
async function globals(f:Fixture){const out:Record<string,unknown>={};for(const table of ['notifications','notification_push_outbox'])out[table]=(await f.db.from(table).select('*').in('user_id',f.accounts.map(a=>a.id)).order('id').throwOnError()).data;return out;}
const pick=(target:Target)=>({userId:target.userId,grantId:target.grantId,sourceInviteId:target.sourceInviteId});

test('File mentions API: job-scoped targets, verified recipients, idempotency and an inbox without file access',async({page,browser,baseURL})=>{
 test.setTimeout(300000);local(baseURL);const owner=page.context(),f=await fixture(browser,baseURL,owner);
 try{
  const before=await globals(f),fileId=await upload(owner,f,'plano cocina.png','#00a1ce');
  const team=await targets(owner,f);expect(team.map(t=>t.name).sort()).toEqual(['Ana Rojas Local','Beto Mora Local']);
  const ana=team.find(t=>t.userId===f.ana.id)!,beto=team.find(t=>t.userId===f.beto.id)!;
  // Members and outsiders cannot list or write; cross-origin writes are refused.
  expect((await get(f.anaContext,f.ana,api,{view:'targets',workId:f.workId})).status()).toBe(403);
  expect((await get(owner,f.owner,api,{view:'targets'})).status()).toBe(400);
  const create={action:'comment_create',actionId:crypto.randomUUID(),workId:f.workId,fileId,commentId:crypto.randomUUID(),thread:'team',versionNo:null,body:'Revisar la cota norte @Ana Rojas Local y @beto mora local',mentions:[pick(ana),pick(beto)]};
  expect((await post(owner,f.owner,api,create,{})).status()).toBe(403);
  expect((await post(f.anaContext,f.ana,api,{...create,actionId:crypto.randomUUID(),commentId:crypto.randomUUID()})).status()).toBe(403);
  // Validation: names must be written, no duplicates, <= 10, team thread only; an outsider (other job) -> 409.
  for(const bad of [{body:'Sin nombres'},{mentions:[pick(ana),pick(ana)]},{mentions:Array.from({length:11},()=>pick(ana))},{thread:'client',versionNo:1},{mentions:[]},{extra:true}])
   expect((await post(owner,f.owner,api,{...create,actionId:crypto.randomUUID(),commentId:crypto.randomUUID(),...bad})).status()).toBe(400);
  const outsiderGrant=(await f.db.from('pro_team_grants').select('id,source_invite_id').eq('member_user_id',f.outsider.id).single().throwOnError()).data!;
  expect((await post(owner,f.owner,api,{...create,actionId:crypto.randomUUID(),commentId:crypto.randomUUID(),body:'@Fuera Del Trabajo',mentions:[{userId:f.outsider.id,grantId:outsiderGrant.id,sourceInviteId:outsiderGrant.source_invite_id}]})).status()).toBe(409);
  expect((await f.db.from('pro_work_file_comments').select('id').eq('owner_id',f.owner.id).throwOnError()).data).toEqual([]);
  // Save + idempotent replay + reused identity.
  const first=await post(owner,f.owner,api,create);expect(first.status()).toBe(200);const saved=await first.json() as {comment:{id:string;body:string};mentions:{userId:string;name:string}[]};
  expect(saved.mentions.map(m=>m.name)).toEqual(['Ana Rojas Local','Beto Mora Local']);
  const replay=await post(owner,f.owner,api,create);expect(replay.status()).toBe(200);expect(await replay.json()).toEqual(saved);
  expect((await post(owner,f.owner,api,{...create,body:create.body+'!'})).status()).toBe(400);
  const chips=await get(owner,f.owner,api,{view:'comments',workId:f.workId,ids:saved.comment.id});expect(chips.status()).toBe(200);
  expect((await chips.json() as {items:{commentId:string;mentions:unknown[]}[]}).items).toEqual([{commentId:saved.comment.id,mentions:saved.mentions}]);
  // The normal team thread still lists the comment (same writer).
  const thread=await get(owner,f.owner,versionsApi,{workId:f.workId,fileId,thread:'team'});expect((await thread.json() as {items:{id:string}[]}).items.map(i=>i.id)).toEqual([saved.comment.id]);
  // Member inbox: job, file name, author, excerpt, date — never file ids, paths or URLs; the file stays private.
  const box=await inbox(f.anaContext,f.ana);expect(box.unreadCount).toBe(1);
  expect(box.items[0]).toMatchObject({service:'Remodelación de cocina',fileName:'plano cocina.jpg',authorName:'Dueña Menciones',excerpt:create.body,readAt:null,versionNo:null});
  const raw=JSON.stringify(box);for(const secret of [fileId,f.owner.id,f.workId,'http','object'])expect(raw).not.toContain(secret);
  expect((await get(f.anaContext,f.ana,filesApi,{fileId})).status()).not.toBe(200);
  expect((await inbox(f.outsiderContext,f.outsider)).items).toEqual([]);
  // Mark read: idempotent receipt; another member cannot mark it.
  const read={action:'mark_read',actionId:crypto.randomUUID(),noticeId:box.items[0].id};
  expect((await post(f.betoContext,f.beto,api,read)).status()).toBe(403);
  const marked=await post(f.anaContext,f.ana,api,read);expect(marked.status()).toBe(200);const markedBody=await marked.json();
  const again=await post(f.anaContext,f.ana,api,read);expect(again.status()).toBe(200);expect(await again.json()).toEqual(markedBody);
  expect((await inbox(f.anaContext,f.ana)).unreadCount).toBe(0);expect((await inbox(f.anaContext,f.ana,'all')).items).toHaveLength(1);
  // Revoking access hides the notice and the member can no longer be mentioned.
  const grant=(await f.db.from('pro_team_grants').select('id,revision').eq('member_user_id',f.beto.id).eq('work_id',f.workId).single().throwOnError()).data!;
  expect((await post(owner,f.owner,teamApi,{action:'revoke',actionId:crypto.randomUUID(),workId:f.workId,grantId:grant.id,revision:grant.revision})).status()).toBe(200);
  expect((await inbox(f.betoContext,f.beto,'all')).items).toEqual([]);
  expect((await post(owner,f.owner,api,{...create,actionId:crypto.randomUUID(),commentId:crypto.randomUUID(),body:'@Beto Mora Local',mentions:[pick(beto)]})).status()).toBe(409);
  expect(await globals(f)).toEqual(before);
 }finally{await cleanup(f);}
});

for(const language of ['es','en'] as const)test(`File mentions UI: @ picker with keyboard and tap, chips, and the member inbox [${language}]`,async({page,browser,baseURL},info)=>{
 test.setTimeout(300000);local(baseURL);const en=language==='en',owner=page.context(),f=await fixture(browser,baseURL,owner),project=info.project.name;
 const shot=async(target:Page,name:string)=>{const path=shots?`${shots}/30-${name}-${language}-${project}.png`:info.outputPath(`${name}-${language}.png`);if(shots)mkdirSync(shots,{recursive:true});await target.screenshot({path,fullPage:true});};
 try{
  const runtime:string[]=[];onAppPageError(page,message=>runtime.push(message));const before=await globals(f);
  const fileId=await upload(owner,f,'plano cocina.png','#00a1ce');
  await gotoOK(page,`/${language}/dashboard/pro?tab=pro_agenda&cita=${f.workId}&vistaTrabajo=updates`);
  const card=page.locator(`[data-work-file="${fileId}"]`);await expect(card).toBeVisible({timeout:60000});
  await card.getByRole('button',{name:en?'Versions and comments':'Versiones y comentarios',exact:true}).click();
  const discussion=card.locator('[data-file-discussion]');await expect(discussion).toContainText(en?'No comments yet.':'Todavía no hay comentarios.');
  const box=discussion.getByRole('combobox',{name:en?'New team comment':'Nuevo comentario del equipo'});
  // Keyboard: typing "@" + part of a name filters the job team; Enter picks it.
  await box.click();await box.pressSequentially(en?'Please check the north wall @ana':'Revise la pared norte @ana');
  const picker=discussion.locator('[data-file-mention-picker]');await expect(picker.getByRole('option')).toHaveCount(1);await expect(picker.getByRole('option')).toHaveText(/Ana Rojas Local/);
  await expect(picker).not.toContainText('Fuera Del Trabajo');
  await box.press('Enter');await expect(picker).toHaveCount(0);
  await expect(box).toHaveValue((en?'Please check the north wall ':'Revise la pared norte ')+'@Ana Rojas Local ');
  await expect(discussion.locator(`[data-file-mention-chip="${f.ana.id}"]`)).toBeVisible();
  // Escape closes the picker without changing the text.
  await box.pressSequentially('@');await expect(picker).toBeVisible();await box.press('Escape');await expect(picker).toHaveCount(0);await box.press('Backspace');
  // Tap: the "@ Mention" button opens the list; both members show (Ana is already chosen, so only Beto).
  await discussion.getByRole('button',{name:'@ '+(en?'Mention':'Mencionar'),exact:true}).click();
  await expect(picker.getByRole('option')).toHaveCount(1);await shot(page,'owner-picker');
  await picker.getByRole('option',{name:'Beto Mora Local'}).click();
  await expect(discussion.locator(`[data-file-mention-chip="${f.beto.id}"]`)).toBeVisible();
  await box.pressSequentially(en?'thanks':'gracias');
  await expectNoHorizontalOverflow(page);
  await discussion.getByRole('button',{name:en?'Post comment':'Publicar comentario',exact:true}).click();
  const comment=discussion.locator('[data-file-comment]');await expect(comment).toHaveCount(1,{timeout:30000});
  await expect(comment.locator('[data-file-comment-mention]')).toHaveCount(2);await expect(comment.locator('[data-file-comment-mention-text]')).toHaveText(['@Ana Rojas Local','@Beto Mora Local']);
  await expect(comment).toContainText(en?'Mentioned:':'Mencionó a:');await expect(box).toHaveValue('');await expect(discussion.locator('[data-file-mention-chip]')).toHaveCount(0);
  await expectNoHorizontalOverflow(page);await shot(page,'owner-comment');
  // Reload: the mention chips persist.
  await page.reload();const again=page.locator(`[data-work-file="${fileId}"]`);await expect(again).toBeVisible({timeout:60000});
  await again.getByRole('button',{name:new RegExp(en?'^Versions and comments':'^Versiones y comentarios')}).click();await expect(again.locator('[data-file-comment-mention]')).toHaveCount(2);
  // Member inbox in Equipo: file name, author, excerpt and date; no download or link to the file.
  const memberPage=await f.anaContext.newPage();onAppPageError(memberPage,message=>runtime.push(message));
  await gotoOK(memberPage,`/${language}/dashboard/pro/equipo`);const teamSpace=memberPage.locator('[data-team-space]');
  const toggle=teamSpace.locator('[data-file-mention-notices-toggle]');await expect(toggle).toBeVisible({timeout:60000});await expect(toggle.getByLabel(en?'Unread mentions':'Menciones sin leer')).toHaveText('1');
  await toggle.click();const inboxSection=teamSpace.locator('[data-file-mention-inbox]');const item=inboxSection.locator('[data-file-mention-notice]');await expect(item).toHaveCount(1);
  await expect(item).toContainText(en?'Dueña Menciones mentioned you on "plano cocina.jpg"':'Dueña Menciones le mencionó en "plano cocina.jpg"');
  await expect(item).toContainText('Remodelación de cocina');await expect(item).toContainText('@Ana Rojas Local');
  await expect(item.locator('a')).toHaveCount(0);await expect(item.getByRole('button',{name:en?'Download':'Descargar'})).toHaveCount(0);
  await expectNoHorizontalOverflow(memberPage);await shot(memberPage,'member-inbox');
  await item.getByRole('button',{name:en?'Mark as read':'Marcar como leída',exact:true}).click();
  await expect(inboxSection.getByRole('status')).toContainText(en?'Mention marked as read.':'Mención marcada como leída.');await expect(item).toHaveCount(0);
  await inboxSection.getByRole('button',{name:en?'All':'Todas',exact:true}).click();await expect(inboxSection.locator('[data-file-mention-notice]')).toHaveCount(1);
  await expect(toggle.getByLabel(en?'Unread mentions':'Menciones sin leer')).toHaveCount(0);
  expect(await globals(f)).toEqual(before);expect(runtime).toEqual([]);
 }finally{await cleanup(f);}
});

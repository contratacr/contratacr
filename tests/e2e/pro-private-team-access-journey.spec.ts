import {test,expect,type BrowserContext} from 'playwright/test';
import {gotoOK,expectNoHorizontalOverflow,onAppPageError} from './helpers';
import {stabilizeLocalProRuntime} from './pro-local-stable-runtime';
import {createServerClient} from '@supabase/ssr';
import {createDisposableAccount,cleanupDisposableAccount,type DisposableAccount} from './disposable-account';
import {regressionAdminClient} from './seed';
import {emptyBusiness} from '../../src/lib/pro/business';
import {crTodayISO} from '../../src/lib/time-cr';
const origin='http://127.0.0.1:3185',api='/api/pro/work-tasks',core='/api/pro/lead-private-core',workApi='/api/pro/lead-private-work';
function local(baseURL:string|undefined){expect(baseURL).toBe(origin);expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');}
async function login(context:BrowserContext,actor:DisposableAccount){const auth=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{getAll:()=>[],setAll:async cookies=>context.addCookies(cookies.map(cookie=>({name:cookie.name,value:cookie.value,url:origin,sameSite:'Lax' as const})))}});const result=await auth.auth.signInWithPassword({email:actor.email,password:actor.password});expect(result.error).toBeNull();expect(result.data.session).not.toBeNull();return result.data.session!.access_token;}
async function fixture(context:BrowserContext){await stabilizeLocalProRuntime(context,origin);const owner=await createDisposableAccount({prefix:'private-tools-owner'}),db=regressionAdminClient();try{const user=(await db.auth.admin.getUserById(owner.id)).data.user!;expect((await db.auth.admin.updateUserById(owner.id,{user_metadata:{...user.user_metadata,is_provider:true,role:'professional'}})).error).toBeNull();await db.from('profiles').update({is_provider:true,role:'professional'}).eq('id',owner.id).throwOnError();await db.from('pro_memberships').insert({user_id:owner.id,status:'active'}).throwOnError();const document=emptyBusiness(),clientId='private-origin-client',secondClient='private-origin-other',workId=crypto.randomUUID(),completedId=crypto.randomUUID(),today=crTodayISO();document.clients=[{id:clientId,name:'Cliente privado sin cuenta',email:'',phone:'',notes:'Conservar cliente',archived:false},{id:secondClient,name:'Cliente alternativo',email:'',phone:'',notes:'Conservar otro',archived:false}];document.work=[{id:workId,clientId,client:'Cliente privado sin cuenta',service:'Trabajo existente sin programar',stage:'new',start:'',end:'',cancelled:false},{id:completedId,clientId,client:'Cliente privado sin cuenta',service:'Trabajo concluido previo',stage:'completed',start:today+'T09:00:00-06:00',end:today+'T10:00:00-06:00',cancelled:false}];await db.from('pro_workspaces').insert({user_id:owner.id,document,revision:1}).throwOnError();const token=await login(context,owner);for(const endpoint of ['/api/auth/session-mfa','/api/auth/registration-state','/api/pro/access'])expect((await context.request.get(endpoint,{timeout:45000})).status()).toBe(200);for(const id of [workId,completedId])expect((await context.request.get('/api/pro/client-operations?'+new URLSearchParams({workId:id,clientId}),{timeout:45000})).status()).toBe(200);expect((await db.from('professionals').select('id').eq('profile_id',owner.id).throwOnError()).data).toEqual([]);return{owner,db,token,clientId,secondClient,workId,completedId};}catch(error){await cleanupDisposableAccount(owner);throw error;}}
type Fixture=Awaited<ReturnType<typeof fixture>>;
async function cleanup(f:Fixture){await cleanupDisposableAccount(f.owner);}
function input(f:Fixture,channel:{id:string;revision:number}|null=null){return{action:'create_lead',actionId:crypto.randomUUID(),channel,lead:{action:'create',actionId:crypto.randomUUID(),kind:'manual',id:crypto.randomUUID(),revision:0,catalogRevision:0,clientId:f.clientId,title:'Solicitud privada sin directorio',description:'Descripción privada conservada',address:'Ubicación por definir',sourceLabel:'Referencia manual anterior',forecast:{projectType:'Instalación',expectedStart:'2024-02-29',currency:'USD',revenueCents:125050,budgetCents:null,profitCents:-2575},stageMode:'automatic',stageId:null}};}
async function post(context:BrowserContext,actor:DisposableAccount,body:unknown,path=api){return context.request.post(path,{headers:{Origin:origin,'X-Pro-Expected-Actor':actor.id},data:body});}
async function snapshot(f:Fixture){const result:Record<string,unknown>={};for(const table of ['pro_workspaces','pro_work','pro_clients','pro_quote_links','pro_client_entries','pro_work_cost_entries'])result[table]=(await f.db.from(table).select('*').eq('user_id',f.owner.id).throwOnError()).data;for(const table of ['pro_appointment_requests','pro_request_quotes','pro_request_followups'])result[table]=(await f.db.from(table).select('*').eq('owner_id',f.owner.id).throwOnError()).data;for(const table of ['notifications','notification_push_outbox'])result[table]=(await f.db.from(table).select('*').eq('user_id',f.owner.id).throwOnError()).data;result.directory=(await f.db.from('professionals').select('*').eq('profile_id',f.owner.id).throwOnError()).data;for(const key of Object.keys(result))if(Array.isArray(result[key]))result[key]=(result[key] as unknown[]).toSorted((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));return result;}
async function state(f:Fixture){const result:Record<string,unknown>={};for(const table of ['pro_lead_center_records','pro_lead_center_actions','pro_lead_center_history','pro_lead_origin_assignments','pro_lead_origin_actions','pro_lead_origin_history','pro_lead_origin_creates','pro_request_pipeline_heads','pro_request_pipeline_stages'])result[table]=(await f.db.from(table).select('*').eq('owner_id',f.owner.id).throwOnError()).data?.toSorted((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));return result;}
async function seed(context:BrowserContext,f:Fixture,id=crypto.randomUUID()){const body={...input(f).lead,id},response=await post(context,f.owner,body,core);expect(response.status()).toBe(200);return{body,result:await response.json()};}
function conversion(leadId:string,leadRevision=1,workId=crypto.randomUUID()){return{action:'convert',actionId:crypto.randomUUID(),leadId,leadRevision,workId};}
async function prepare(context:BrowserContext,f:Fixture){const lead=await seed(context,f),command=conversion(lead.body.id),response=await post(context,f.owner,command,workApi);expect(response.status()).toBe(200);const result=await response.json();return{lead,result,workId:result.link.workId as string};}
function taskInput(workId:string){return{action:'create',actionId:crypto.randomUUID(),workId,taskId:crypto.randomUUID(),revision:0,title:'Tarea privada%_literal',details:'Detalles privados conservados',dueDate:'2024-02-29',assignee:'Carlos manual'};}


for (const language of ['es','en'] as const) {
 test(`Private Team journey: no public issuer, manual invitation and free-member receipt recovery (${language})`, async ({page,browser,baseURL},info) => {
  test.setTimeout(180000);
  local(baseURL);
  const en = language==='en', f = await fixture(page.context());
  const member = await createDisposableAccount({prefix:'private-team-ui'});
  const memberContext = await browser.newContext({baseURL:origin}), memberPage = await memberContext.newPage();
  const errors:string[] = [], accepts:string[] = [];
  try {
   await stabilizeLocalProRuntime(memberContext,origin);
   await login(memberContext,member);
   const job = await prepare(page.context(),f), task = taskInput(job.workId);
   expect((await post(page.context(),f.owner,task)).status()).toBe(200);
   const before = await snapshot(f), privateBefore = await state(f);
   onAppPageError(page,message=>errors.push(message));
   onAppPageError(memberPage,message=>errors.push(message));
   let loseProof=true;
   await memberPage.route('**/api/pro/team**',async route=>{
    if(route.request().method()==='POST' && JSON.parse(route.request().postData()!).action==='accept') {
     accepts.push(route.request().postData()!);

    }
    const url=new URL(route.request().url());
    if(route.request().method()==='GET'&&url.searchParams.get('view')==='action'&&accepts.length===1&&loseProof){loseProof=false;await route.fulfill({status:503,json:{error:'LOCAL_PRIVATE_TEAM_PROOF_LOST'}});return;}
    await route.continue();
   });
   await gotoOK(page,`/${language}/dashboard/pro/equipo`);
   const teamSpace = page.locator('[data-team-space]');
   await teamSpace.locator(`[data-team-job="${job.workId}"]`).getByRole('button',{name:en?'Manage access':'Administrar acceso',exact:true}).click();
   const owner = teamSpace.locator('[data-team-owner]');
   await owner.getByRole('button',{name:en?'Create invitation':'Crear invitación',exact:true}).click();
   const invite = owner.locator('[data-team-invite-form]');
   await invite.getByLabel(en?'Email':'Correo',{exact:true}).fill(member.email);
   await invite.getByLabel(en?'Permission':'Permiso',{exact:true}).selectOption('contributor');
   await invite.getByRole('button',{name:en?'Create code':'Crear código',exact:true}).click();
   const codeField = teamSpace.locator('[data-team-code]').getByLabel(en?'Invitation code':'Código de invitación',{exact:true});
   await expect(codeField).toBeVisible();
   const code = await codeField.inputValue();
   expect(code).toMatch(/^[a-f0-9]{64}$/);
   expect(page.url()).not.toContain(code);
   await gotoOK(memberPage,`/${language}/dashboard/pro/equipo`);
   const freeTeam = memberPage.locator('[data-team-space]');
   await freeTeam.getByRole('button',{name:en?'Use code':'Usar código',exact:true}).click();
   const acceptForm = freeTeam.locator('[data-team-accept-form]');
   await acceptForm.getByLabel(en?'Invitation code':'Código de invitación',{exact:true}).fill(code);
   const lostProof=memberPage.waitForResponse(response=>new URL(response.url()).pathname==='/api/pro/team'&&new URL(response.url()).searchParams.get('view')==='action'&&response.status()===503);
   await acceptForm.getByRole('button',{name:en?'Accept access':'Aceptar acceso',exact:true}).click();
   const recovery = freeTeam.locator('[data-team-recovery]');
   await expect(recovery).toBeVisible();
   expect(accepts).toHaveLength(1);
   const exact=accepts[0];
   await (await lostProof).finished();
   await expect(recovery.getByRole('button',{name:en?'Check saved result':'Comprobar guardado',exact:true})).toBeEnabled();
   const journal='ccr:pro:team-write:v1:'+member.id;
   await expect.poll(()=>memberPage.evaluate(key=>{
    const record=JSON.parse(localStorage.getItem(key)??'null');
    return record?{phase:record.phase,body:record.body}:null;
   },journal)).toEqual({phase:'confirmed',body:null});
   const oldTimeOrigin=await memberPage.evaluate(()=>performance.timeOrigin);
   memberPage.once('dialog',async dialog=>{expect(dialog.type()).toBe('beforeunload');await dialog.accept();});
   const reloaded=await memberPage.reload();
   expect(reloaded?.status()).toBe(200);
   expect(await memberPage.evaluate(()=>performance.timeOrigin)).not.toBe(oldTimeOrigin);
   await expect(recovery).toBeVisible({timeout:45000});
   expect(accepts).toEqual([exact]);
   await recovery.getByRole('button',{name:en?'Check saved result':'Comprobar guardado',exact:true}).click();
   await expect(recovery).toHaveCount(0);
   expect(accepts).toEqual([exact]);
   const shared = freeTeam.locator('[data-team-grant]');
   await expect(shared).toHaveCount(1);
   await shared.getByRole('button',{name:en?'View job':'Ver trabajo',exact:true}).click();
   const board = freeTeam.locator('[data-team-board]');
   await expect(board.getByText(task.title,{exact:true})).toBeVisible();
   await expect(board).not.toContainText(task.details);
   await expect(board).not.toContainText(task.assignee);
   const taskCard=board.locator(`[data-team-task="${task.taskId}"]`);
   await taskCard.getByRole('button',{name:en?'Complete':'Completar',exact:true}).click();
   await expect(taskCard.getByRole('button',{name:en?'Reopen':'Reabrir',exact:true})).toBeEnabled();
   const storedTask=(await f.db.from('pro_work_tasks').select('*').eq('owner_id',f.owner.id).eq('id',task.taskId).single().throwOnError()).data!;
   expect(storedTask).toMatchObject({status:'done',revision:2,details:task.details,assignee:task.assignee});
   await expectNoHorizontalOverflow(memberPage);
   await board.scrollIntoViewIfNeeded();
   await memberPage.screenshot({path:info.outputPath('private-team-'+language+'.png'),animations:'disabled'});
   const acceptedInput=JSON.parse(exact);
   const grantRow=(await f.db.from('pro_team_grants').select('*').eq('owner_id',f.owner.id).eq('work_id',job.workId).eq('member_user_id',member.id).single().throwOnError()).data!;
   const historyBefore=(await f.db.from('pro_work_task_history').select('*').eq('owner_id',f.owner.id).eq('task_id',task.taskId).order('at').throwOnError()).data;
   await teamSpace.locator('[data-team-recovery]').getByRole('button',{name:en?'Done':'Listo',exact:true}).click();
   const ownerReload=await page.reload();
   expect(ownerReload?.status()).toBe(200);
   await teamSpace.locator(`[data-team-job="${job.workId}"]`).getByRole('button',{name:en?'Manage access':'Administrar acceso',exact:true}).click();
   const members=teamSpace.locator('[data-team-owner]');
   await expect(members.getByRole('button',{name:en?'Revoke access':'Quitar acceso',exact:true})).toBeEnabled();
   const revokeResponse=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/pro/team'&&response.request().method()==='POST'&&JSON.parse(response.request().postData()!).action==='revoke');
   await members.getByRole('button',{name:en?'Revoke access':'Quitar acceso',exact:true}).click();
   await page.getByRole('dialog').last().getByRole('button',{name:en?'Revoke access':'Quitar acceso',exact:true}).click();
   const revoked=await revokeResponse;
   expect(revoked.status()).toBe(200);
   await revoked.finished();
   await expect(members).toContainText(en?'Access revoked':'Acceso retirado');
   const deniedRead=memberPage.waitForResponse(response=>new URL(response.url()).pathname==='/api/pro/team'&&new URL(response.url()).searchParams.get('view')==='tasks'&&response.status()===403);
   await memberPage.evaluate(()=>window.dispatchEvent(new Event('focus')));
   await deniedRead;
   await expect(board.getByRole('alert').filter({hasText:en?'Shared information is hidden':'La información compartida está oculta'})).toBeVisible();
   await expect(board.getByText(task.title,{exact:true})).toHaveCount(0);
   await expect(board.getByRole('button',{name:en?'Reopen':'Reabrir',exact:true})).toHaveCount(0);
   const headers={'X-Pro-Expected-Actor':member.id};
   expect((await memberContext.request.get('/api/pro/team?'+new URLSearchParams({view:'action',actionId:acceptedInput.actionId}),{headers})).status()).toBe(403);
   expect((await memberContext.request.get('/api/pro/team?'+new URLSearchParams({view:'tasks',grantId:grantRow.id}),{headers})).status()).toBe(403);
   expect((await f.db.from('pro_team_grants').select('*').eq('id',grantRow.id).single().throwOnError()).data).toMatchObject({active:false,revision:2});
   expect((await f.db.from('pro_work_tasks').select('*').eq('owner_id',f.owner.id).eq('id',task.taskId).single().throwOnError()).data).toEqual(storedTask);
   expect((await f.db.from('pro_work_task_history').select('*').eq('owner_id',f.owner.id).eq('task_id',task.taskId).order('at').throwOnError()).data).toEqual(historyBefore);
   expect((await f.db.from('professionals').select('*').in('profile_id',[f.owner.id,member.id]).throwOnError()).data).toEqual([]);
   expect(await snapshot(f)).toEqual(before);
   expect(await state(f)).toEqual(privateBefore);
   expect(errors).toEqual([]);
  } catch(error) {
   await memberPage.screenshot({path:info.outputPath('private-team-failure.png'),animations:'disabled'}).catch(()=>{});
   throw error;
  } finally {
   await page.goto('about:blank').catch(()=>{});
   await memberPage.goto('about:blank').catch(()=>{});
   await memberContext.close();
   await cleanupDisposableAccount(member);
   await cleanup(f);
  }
 });
}

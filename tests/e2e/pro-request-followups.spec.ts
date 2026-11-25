import {test,expect,type BrowserContext,type Page} from 'playwright/test';
import {createServerClient} from '@supabase/ssr';
import {createClient} from '@supabase/supabase-js';
import {createDisposableAccount,cleanupDisposableAccount,type DisposableAccount} from './disposable-account';
import {regressionAdminClient} from './seed';
import {emptyBusiness} from '../../src/lib/pro/business';
import {crTodayISO} from '../../src/lib/time-cr';
import {gotoOK,expectNoHorizontalOverflow,onAppPageError} from './helpers';
import type {RequestFollowupMutation,RequestFollowupDetail,RequestFollowupPage} from '../../src/lib/pro/request-followups';
import {stableSnapshotRows} from './stable-rows';

const origin='http://127.0.0.1:3185',api='/api/pro/request-followups';
function local(baseURL:string|undefined){expect(baseURL).toBe(origin);expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');}
async function signIn(context:BrowserContext,actor:DisposableAccount){
 const auth=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{getAll:()=>[],setAll:async cookies=>context.addCookies(cookies.map(cookie=>({name:cookie.name,value:cookie.value,url:origin,sameSite:'Lax' as const})))}});
 const response=await auth.auth.signInWithPassword({email:actor.email,password:actor.password});expect(response.error).toBeNull();expect(response.data.session).not.toBeNull();return response.data.session!.access_token;
}
async function fixture(context:BrowserContext){
 const owner=await createDisposableAccount({prefix:'followup-owner'});let client:DisposableAccount|undefined;
 const db=regressionAdminClient();
 try{
  client=await createDisposableAccount({prefix:'followup-client'});
  const account=await db.auth.admin.getUserById(owner.id);expect((await db.auth.admin.updateUserById(owner.id,{user_metadata:{...account.data.user!.user_metadata,is_provider:true,role:'professional'}})).error).toBeNull();
  await db.from('profiles').update({is_provider:true,role:'professional'}).eq('id',owner.id).throwOnError();
  await db.from('pro_memberships').insert({user_id:owner.id,status:'active'}).throwOnError();
  const professional=(await db.from('professionals').insert({profile_id:owner.id,category_id:'desarrollo_web',business_name:'Seguimiento local',slug:'followup-'+owner.id,whatsapp:'',provincia_id:'al',canton_id:'al-at',verification_status:'pending',is_banned:false,is_available:true}).select('id').single().throwOnError()).data!;
  await db.from('pro_workspaces').insert({user_id:owner.id,document:emptyBusiness(),revision:1}).throwOnError();
  const requestId=crypto.randomUUID(),otherRequestId=crypto.randomUUID(),service='Solicitud local sin trabajo';
  const requestRow=(id:string,name:string)=>({id,professional_id:professional.id,owner_id:owner.id,client_user_id:client!.id,client_name:'Cliente local seguimiento',professional_name:'Seguimiento local',professional_slug:'followup-'+owner.id,service:name,duration_minutes:60,location_kind:'agree',location_text:'',note:'PUBLIC_REQUEST_NOTE',requested_start:null,preferred_day:crTodayISO(),preference:'',status:'requested',revision:0,work_id:null});
  await db.from('pro_appointment_requests').insert([requestRow(requestId,service),requestRow(otherRequestId,'Otra solicitud local')]).throwOnError();
  await db.from('pro_appointment_events').insert([requestId,otherRequestId].map(id=>({request_id:id,actor_id:client!.id,side:'client',action:'create',note:'',status:'requested'}))).throwOnError();
  const token=await signIn(context,owner);
  // Setup may compile handlers on the local dev server. Product probe budgets
  // and assertions stay unchanged; these calls do not create follow-up rows.
  for(const endpoint of ['/api/auth/session-mfa','/api/auth/registration-state','/api/pro/access'])expect((await context.request.get(origin+endpoint,{timeout:45000})).status()).toBe(200);
  expect((await context.request.get(origin+'/api/pro/agenda?'+new URLSearchParams({day:crTodayISO(),mode:'day'}),{timeout:45000})).status()).toBe(200);
  return {owner,client,professionalId:professional.id,requestId,otherRequestId,service,db,token,requestRow};
 }catch(error){await cleanupDisposableAccount(owner);if(client)await cleanupDisposableAccount(client);throw error;}
}
async function cleanup(f:Awaited<ReturnType<typeof fixture>>){await cleanupDisposableAccount(f.owner);await cleanupDisposableAccount(f.client);}
async function detail(page:Page,owner:DisposableAccount,requestId:string){const response=await page.request.get(api+'?'+new URLSearchParams({requestId}),{headers:{'X-Pro-Expected-Actor':owner.id}});expect(response.status()).toBe(200);return await response.json() as RequestFollowupDetail;}
async function write(page:Page,owner:DisposableAccount,input:RequestFollowupMutation){return page.request.post(api,{headers:{Origin:origin,'X-Pro-Expected-Actor':owner.id},data:input});}
async function publicSnapshot(f:Awaited<ReturnType<typeof fixture>>){
 const {db,owner,client}=f,ids=[owner.id,client.id],requests=(await db.from('pro_appointment_requests').select('*').eq('owner_id',owner.id).order('id').throwOnError()).data!;
 return {requests,events:(await db.from('pro_appointment_events').select('*').in('request_id',requests.map(row=>row.id)).order('position').throwOnError()).data,requestActions:(await db.from('pro_appointment_actions').select('*').in('actor_id',ids).order('action_id').throwOnError()).data,work:(await db.from('pro_work').select('*').eq('user_id',owner.id).order('id').throwOnError()).data,clients:(await db.from('pro_clients').select('*').eq('user_id',owner.id).order('id').throwOnError()).data,ledger:(await db.from('pro_client_entries').select('*').eq('user_id',owner.id).order('id').throwOnError()).data,workspace:stableSnapshotRows((await db.from('pro_workspaces').select('*').eq('user_id',owner.id).throwOnError()).data),notifications:(await db.from('notifications').select('*').in('user_id',ids).order('id').throwOnError()).data,outbox:(await db.from('notification_push_outbox').select('*').in('user_id',ids).order('id').throwOnError()).data,pushTokens:(await db.from('user_push_tokens').select('*').in('user_id',ids).order('id').throwOnError()).data};
}

for(const language of ['es','en'] as const)test(`Private request follow-up preserves the request, draft and recovery [${language}]`,async({page,browser,baseURL},info)=>{
 test.setTimeout(240000);local(baseURL);const en=language==='en',f=await fixture(page.context()),{owner,client,requestId,otherRequestId,service}=f;let clientContext:BrowserContext|undefined;
 try{
  const before=await publicSnapshot(f),day=crTodayISO(),note='PRIVATE_FOLLOWUP_NOTE_'+language,editedNote='PRIVATE_FOLLOWUP_EDITED_'+language,bodies:string[]=[],runtime:string[]=[];
  let failFirstRead=true,loseNextWrite=false,finishLostResponse:()=>void=()=>{};const lostResponseFinished=new Promise<void>(resolve=>{finishLostResponse=resolve;});
  onAppPageError(page,message=>runtime.push(message));
  await page.route('**/api/pro/request-followups**',async route=>{
   const req=route.request(),url=new URL(req.url());
   if(req.method()==='GET'&&url.searchParams.get('requestId')===requestId&&failFirstRead){failFirstRead=false;return route.fulfill({status:503,json:{error:'LOCAL_FOLLOWUP_READ_FAILURE'}});}
   if(req.method()==='POST'){bodies.push(req.postData()!);if(loseNextWrite){loseNextWrite=false;const response=await route.fetch();expect(response.status()).toBe(200);await route.fulfill({status:503,json:{error:'LOCAL_RESPONSE_LOST_AFTER_COMMIT'}});finishLostResponse();return;}}
   return route.continue();
  });
  const path=`/${language}/dashboard/pro?tab=pro_agenda&citaSolicitud=${requestId}`;
  await gotoOK(page,path);
  const card=page.locator('[data-request-followup]');await expect(card).toBeVisible({timeout:45000});await expect(card.getByRole('alert')).toBeVisible();
  await card.getByRole('button',{name:en?'Retry':'Reintentar',exact:true}).click();
  await card.getByRole('button',{name:en?'Schedule follow-up':'Programar contacto',exact:true}).click();
  const form=card.locator('[data-request-followup-form]');
  await form.getByLabel(en?'Date (optional)':'Fecha (opcional)',{exact:true}).fill(day);await form.getByLabel(en?'Private note (optional)':'Nota privada (opcional)',{exact:true}).fill(note);
  // Tab must stay inside the request when the private form is dynamically added.
  for(let index=0;index<16;index++){await page.keyboard.press(index%3===0?'Shift+Tab':'Tab');expect(await page.evaluate(()=>!!document.activeElement?.closest('[role="dialog"][data-managed-modal-focus]'))).toBe(true);}
  const draftKey='ccr:pro:request-followup-draft:v1:'+owner.id+':'+requestId;
  await expect.poll(()=>page.evaluate(key=>sessionStorage.getItem(key),draftKey)).toContain(note);const originalDraft=await page.evaluate(key=>sessionStorage.getItem(key),draftKey);
  const dirtyPath=page.url();const requestDialog=page.getByRole('dialog',{name:en?'Appointment request':'Solicitud de cita',exact:true});
  await requestDialog.getByRole('button',{name:en?'Close':'Cerrar',exact:true}).click();await expect(page).toHaveURL(dirtyPath);await expect(form).toBeVisible();await expect(form.getByLabel(en?'Private note (optional)':'Nota privada (opcional)',{exact:true})).toHaveValue(note);
  await form.getByRole('button',{name:en?'Cancel':'Cancelar',exact:true}).click();const confirm=page.getByRole('dialog').last();await confirm.getByRole('button',{name:en?'Keep editing':'Seguir editando',exact:true}).click();
  await expect(form).toBeVisible();await expect(form.getByLabel(en?'Date (optional)':'Fecha (opcional)',{exact:true})).toHaveValue(day);await expect(form.getByLabel(en?'Private note (optional)':'Nota privada (opcional)',{exact:true})).toHaveValue(note);expect(await page.evaluate(key=>sessionStorage.getItem(key),draftKey)).toBe(originalDraft);
  await form.getByRole('button',{name:en?'Cancel':'Cancelar',exact:true}).click();await confirm.getByRole('button',{name:en?'Discard changes':'Descartar cambios',exact:true}).click();await expect(form).toHaveCount(0);expect(await page.evaluate(key=>sessionStorage.getItem(key),draftKey)).toBeNull();expect(bodies).toEqual([]);
  await card.getByRole('button',{name:en?'Schedule follow-up':'Programar contacto',exact:true}).click();await form.getByLabel(en?'Date (optional)':'Fecha (opcional)',{exact:true}).fill(day);await form.getByLabel(en?'Private note (optional)':'Nota privada (opcional)',{exact:true}).fill(note);
  loseNextWrite=true;await form.getByRole('button',{name:en?'Save':'Guardar',exact:true}).click();await lostResponseFinished;
  const recovery=card.locator('[data-request-followup-recovery]');await expect(recovery).toBeVisible();expect(bodies).toHaveLength(1);const originalBody=bodies[0];
  expect((await detail(page,owner,requestId)).followup).toMatchObject({requestId,dueDate:day,note,status:'open',revision:1});
  await page.reload();await expect(recovery).toBeVisible({timeout:45000});expect(bodies).toEqual([originalBody]);
  await recovery.getByRole('button',{name:en?'Check saved result':'Comprobar guardado',exact:true}).click();await expect(recovery).toHaveCount(0);expect(bodies).toEqual([originalBody,originalBody]);
  await expect(card).toContainText(note);expect((await detail(page,owner,requestId)).history).toHaveLength(1);
  await card.getByRole('button',{name:en?'Edit follow-up':'Editar seguimiento',exact:true}).click();await form.getByLabel(en?'Private note (optional)':'Nota privada (opcional)',{exact:true}).fill(editedNote);await form.getByRole('button',{name:en?'Save':'Guardar',exact:true}).click();await expect(form).toHaveCount(0);await expect(card).toContainText(editedNote);
  await card.getByRole('button',{name:en?'Mark done':'Marcar atendido',exact:true}).click();await expect(card.getByRole('button',{name:en?'Reopen':'Reabrir',exact:true})).toBeVisible();
  await card.getByRole('button',{name:en?'Reopen':'Reabrir',exact:true}).click();await expect(card.getByRole('button',{name:en?'Mark done':'Marcar atendido',exact:true})).toBeVisible();
  await card.locator(en?'summary[aria-label="Follow-up options"]':'summary[aria-label="Opciones del seguimiento"]').click();await card.getByRole('button',{name:en?'History':'Historial',exact:true}).click();const history=card.locator('[data-request-followup-history]');await expect(history).toContainText(note);await expect(history).toContainText(editedNote);const final=await detail(page,owner,requestId);expect(final.followup).toMatchObject({revision:4,status:'open',note:editedNote,dueDate:day});expect(final.history.map(row=>row.action)).toEqual(['reopen','complete','save','save']);
  await gotoOK(page,`/${language}/dashboard/pro?tab=pro_agenda&citaSolicitud=${otherRequestId}`);await expect(card).toBeVisible({timeout:45000});await expect(card).not.toContainText(editedNote);await expect(card.getByRole('button',{name:en?'Schedule follow-up':'Programar contacto',exact:true})).toBeVisible();
  await gotoOK(page,`/${language}/dashboard/pro`);const summary=page.locator('[data-lead-followup-summary]');await expect(summary).toBeVisible({timeout:45000});await expect(summary).toContainText(service);const summaryRow=summary.locator(`[data-lead-followup="request:${requestId}"]`);await summaryRow.getByRole('button',{name:en?'View lead':'Ver solicitud',exact:true}).click();await expect(page).toHaveURL(new RegExp('citaSolicitud='+requestId));await expect(card).toContainText(editedNote);expect(new URL(page.url()).pathname).toContain('/dashboard/pro');await expectNoHorizontalOverflow(page);await card.scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('request-followup-'+language+'.png'),fullPage:false});
  clientContext=await browser.newContext({baseURL});await signIn(clientContext,client);const clientPage=await clientContext.newPage();await gotoOK(clientPage,`/${language}/dashboard/profesional?tab=appointments&citaSolicitud=${requestId}`);await expect(clientPage.getByRole('dialog',{name:en?'Appointment request':'Solicitud de cita',exact:true}).or(clientPage.locator('[data-client-project-page]'))/* Fix 14 */).toContainText(service,{timeout:45000});await expect(clientPage.locator('[data-request-followup]')).toHaveCount(0);await expect(clientPage.locator('body')).not.toContainText(note);await expect(clientPage.locator('body')).not.toContainText(editedNote);
  expect(runtime).toEqual([]);expect(await publicSnapshot(f)).toEqual(before);
 }finally{await page.goto('about:blank').catch(()=>{});await clientContext?.close();await cleanup(f);}
});

test('Private request follow-up API: no-write default, permissions, CAS, exact replay and pagination',async({page,browser,baseURL})=>{
 test.setTimeout(240000);local(baseURL);const f=await fixture(page.context()),{owner,client,requestId,otherRequestId,db}=f;let other:Awaited<ReturnType<typeof fixture>>|undefined,foreignContext:BrowserContext|undefined,clientContext:BrowserContext|undefined;
 try{
  const original=await publicSnapshot(f);
  const privateRows=async()=>({rows:(await db.from('pro_request_followups').select('*').eq('owner_id',owner.id).order('request_id').throwOnError()).data,history:(await db.from('pro_request_followup_history').select('*').eq('owner_id',owner.id).order('action_id').throwOnError()).data,actions:(await db.from('pro_request_followup_actions').select('*').eq('actor_id',owner.id).order('action_id').throwOnError()).data});
  const beforeDefault=await privateRows();expect(beforeDefault).toEqual({rows:[],history:[],actions:[]});expect(await detail(page,owner,requestId)).toEqual({followup:{requestId,dueDate:null,note:'',status:'open',revision:0,updatedAt:null},history:[]});expect(await privateRows()).toEqual(beforeDefault);
  foreignContext=await browser.newContext({baseURL});expect((await foreignContext.request.get(origin+api+'?'+new URLSearchParams({requestId}))).status()).toBe(401);other=await fixture(foreignContext);
  clientContext=await browser.newContext({baseURL});await signIn(clientContext,client);
  const input:RequestFollowupMutation={action:'save',requestId,actionId:crypto.randomUUID(),revision:0,dueDate:'2026-12-15',note:'PRIVATE_API_FOLLOWUP'};
  expect((await page.request.post(api,{headers:{Origin:'https://foreign.invalid','X-Pro-Expected-Actor':owner.id},data:input})).status()).toBe(403);
  const first=await write(page,owner,input);expect(first.status()).toBe(200);const firstResult=await first.json();expect(firstResult.followup).toMatchObject({requestId,revision:1,dueDate:'2026-12-15',note:input.note,status:'open'});
  const update:RequestFollowupMutation={...input,actionId:crypto.randomUUID(),revision:1,dueDate:null,note:'PRIVATE_API_EDITED'};expect((await write(page,owner,update)).status()).toBe(200);
  const replay=await write(page,owner,input);expect(replay.status()).toBe(200);expect(await replay.json()).toEqual(firstResult);expect((await write(page,owner,{...input,note:'CHANGED SAME ACTION'})).status()).toBe(400);expect((await write(page,owner,{...update,actionId:crypto.randomUUID(),note:'STALE MUST NOT SAVE'})).status()).toBe(409);expect((await write(page,owner,{...input,requestId:otherRequestId,actionId:crypto.randomUUID(),dueDate:'2026-02-30'})).status()).toBe(400);
  const foreignHeaders={Origin:origin,'X-Pro-Expected-Actor':other.owner.id},clientHeaders={Origin:origin,'X-Pro-Expected-Actor':client.id};
  expect((await foreignContext.request.get(origin+api+'?'+new URLSearchParams({requestId}),{headers:foreignHeaders})).status()).toBe(404);expect((await foreignContext.request.post(origin+api,{headers:foreignHeaders,data:{action:'complete',requestId,actionId:crypto.randomUUID(),revision:2}})).status()).toBe(403);
  expect((await clientContext.request.get(origin+api+'?'+new URLSearchParams({requestId}),{headers:clientHeaders})).status()).toBe(403);expect((await clientContext.request.post(origin+api,{headers:clientHeaders,data:{action:'complete',requestId,actionId:crypto.randomUUID(),revision:2}})).status()).toBe(403);
  expect((await page.request.get(api+'?'+new URLSearchParams({requestId}),{headers:{'X-Pro-Expected-Actor':client.id}})).status()).toBe(403);
  const publicDetail=await clientContext.request.get(origin+'/api/pro/appointment-requests?'+new URLSearchParams({view:'detail',id:requestId}));expect(publicDetail.status()).toBe(200);const publicText=await publicDetail.text();expect(publicText).not.toContain('PRIVATE_API_');
  for(const direct of [createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{auth:{persistSession:false,autoRefreshToken:false}}),createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{global:{headers:{Authorization:'Bearer '+f.token}},auth:{persistSession:false,autoRefreshToken:false}})]){
   expect((await direct.from('pro_request_followups').select('*').eq('owner_id',owner.id)).error?.code).toBe('42501');expect((await direct.from('pro_request_followups').insert({owner_id:owner.id,request_id:otherRequestId,note:'DIRECT MUST NOT SAVE'})).error?.code).toBe('42501');expect((await direct.rpc('pro_request_followup_mutate',{p_actor:owner.id,p_input:input})).error?.code).toBe('42501');
  }
  const simultaneous:RequestFollowupMutation={action:'save',requestId:otherRequestId,actionId:crypto.randomUUID(),revision:0,dueDate:null,note:'SAME CONCURRENT FOLLOWUP'};
  const duplicates=await Promise.all([write(page,owner,simultaneous),write(page,owner,simultaneous)]);expect(duplicates.map(response=>response.status())).toEqual([200,200]);const results=await Promise.all(duplicates.map(response=>response.json()));expect(results[0]).toEqual(results[1]);expect((await detail(page,owner,otherRequestId)).history).toHaveLength(1);
  const competing:Extract<RequestFollowupMutation,{action:'save'}>[]=['WINNER_A','WINNER_B'].map(note=>({...simultaneous,action:'save',revision:1,actionId:crypto.randomUUID(),note}));const competition=await Promise.all(competing.map(value=>write(page,owner,value)));expect(competition.map(response=>response.status()).sort()).toEqual([200,409]);const winnerIndex=competition.findIndex(response=>response.status()===200),winner=await competition[winnerIndex].json();const finalOther=await detail(page,owner,otherRequestId);expect(finalOther.followup).toEqual(winner.followup);expect(finalOther.followup.note).toBe(competing[winnerIndex].note);expect(finalOther.history.map(row=>row.after.revision)).toEqual([2,1]);
  const beforeReads=await privateRows();await detail(page,owner,requestId);await detail(page,owner,otherRequestId);expect(await privateRows()).toEqual(beforeReads);expect(await publicSnapshot(f)).toEqual(original);
  // Pagination data is test-only; neither original request nor its customer is
  // changed by creating these separate requested/no-work fixtures.
  const requestIds=Array.from({length:23},()=>crypto.randomUUID()).sort();await db.from('pro_appointment_requests').insert(requestIds.map((id,index)=>f.requestRow(id,'PAGE_FOLLOWUP_'+index))).throwOnError();await db.from('pro_request_followups').insert(requestIds.map(id=>({owner_id:owner.id,request_id:id,due_date:'2026-12-15',note:'PAGINATED_PRIVATE',status:'open',revision:1}))).throwOnError();
  const firstPageResponse=await page.request.get(api+'?view=upcoming',{headers:{'X-Pro-Expected-Actor':owner.id}});expect(firstPageResponse.status()).toBe(200);const firstPage=await firstPageResponse.json() as RequestFollowupPage;expect(firstPage.items).toHaveLength(20);expect(firstPage.nextCursor).not.toBeNull();
  const lastResponse=await page.request.get(api+'?'+new URLSearchParams({view:'upcoming',after:firstPage.nextCursor!}),{headers:{'X-Pro-Expected-Actor':owner.id}});expect(lastResponse.status()).toBe(200);const last=await lastResponse.json() as RequestFollowupPage;expect(last.items).toHaveLength(3);expect(last.nextCursor).toBeNull();expect(new Set([...firstPage.items,...last.items].map(row=>row.requestId))).toEqual(new Set(requestIds));
  const foreignPage=await foreignContext.request.get(origin+api+'?view=upcoming',{headers:foreignHeaders});expect(foreignPage.status()).toBe(200);expect((await foreignPage.json()).items).toEqual([]);
  const immutable=await db.from('pro_request_followup_history').update({action:'complete'}).eq('owner_id',owner.id).eq('action_id',input.actionId);expect(immutable.error?.code).toBe('23514');
  await db.from('pro_memberships').update({status:'inactive'}).eq('user_id',owner.id).throwOnError();expect((await page.request.get(api+'?'+new URLSearchParams({requestId}),{headers:{'X-Pro-Expected-Actor':owner.id}})).status()).toBe(403);expect((await write(page,owner,{action:'complete',requestId,actionId:crypto.randomUUID(),revision:2})).status()).toBe(403);await db.from('pro_memberships').update({status:'active'}).eq('user_id',owner.id).throwOnError();
  await db.from('profiles').update({is_disabled:true}).eq('id',owner.id).throwOnError();expect((await page.request.get(api+'?'+new URLSearchParams({requestId}),{headers:{'X-Pro-Expected-Actor':owner.id}})).status()).toBe(403);expect((await write(page,owner,{action:'complete',requestId,actionId:crypto.randomUUID(),revision:2})).status()).toBe(403);
  const preserved=await publicSnapshot(f);expect(preserved.requests.filter(row=>row.id===requestId||row.id===otherRequestId)).toEqual(original.requests);for(const key of ['events','requestActions','work','clients','ledger','workspace','notifications','outbox','pushTokens'] as const)expect(preserved[key]).toEqual(original[key]);
 }finally{await page.goto('about:blank').catch(()=>{});await foreignContext?.close();await clientContext?.close();if(other)await cleanup(other);await cleanup(f);}
});

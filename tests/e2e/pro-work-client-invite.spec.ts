import {test,expect,type Browser,type BrowserContext,type Page} from 'playwright/test';
import {randomBytes} from 'node:crypto';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {createServerClient} from '@supabase/ssr';
import {createDisposableAccount,cleanupDisposableAccount,type DisposableAccount} from './disposable-account';
import {regressionAdminClient} from './seed';
import {emptyBusiness} from '../../src/lib/pro/business';
import {collectPageErrors,gotoOK,expectNoHorizontalOverflow} from './helpers';
import {stabilizeLocalProRuntime} from './pro-local-stable-runtime';
import {estimateInput,json as estimateJson,post as estimatePost} from './pro-private-estimate-publications-fixture';

// Round 1 after the manual walkthrough (2026-11-12): the owner of a job created from a MANUAL lead
// (no public booking) invites the customer account; the customer accepts explicitly and then follows
// the job. Second scenario: the customer accepts an estimate shared by code and opts in to join the
// job the owner creates from it. Two disposable accounts (owner and customer) plus a stranger.
const origin='http://127.0.0.1:3185',ownerApi='/api/pro/work-client-invitations',clientApi='/api/pro/project-invitation';
const shots=process.env.ROUND1_SHOTS_DIR;
function local(baseURL:string|undefined){expect(baseURL).toBe(origin);expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');}
async function login(context:BrowserContext,actor:DisposableAccount){await stabilizeLocalProRuntime(context,origin);const auth=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{getAll:()=>[],setAll:async cookies=>context.addCookies(cookies.map(cookie=>({name:cookie.name,value:cookie.value,url:origin,sameSite:'Lax' as const})))}});const result=await auth.auth.signInWithPassword({email:actor.email,password:actor.password});expect(result.error).toBeNull();}
async function shot(page:Page,name:string,project:string){if(!shots)return;mkdirSync(shots,{recursive:true});await page.screenshot({path:join(shots,`${name}-${project}.png`),fullPage:false});}
const ownerHeaders=(owner:DisposableAccount)=>({Origin:origin,'X-Pro-Expected-Actor':owner.id});

async function ownerFixture(context:BrowserContext,label:string){
 const owner=await createDisposableAccount({prefix:'invite-owner'}),db=regressionAdminClient();
 try{
  const account=await db.auth.admin.getUserById(owner.id);expect((await db.auth.admin.updateUserById(owner.id,{user_metadata:{...account.data.user!.user_metadata,is_provider:true,role:'professional'}})).error).toBeNull();
  await db.from('profiles').update({is_provider:true,role:'professional'}).eq('id',owner.id).throwOnError();await db.from('pro_memberships').insert({user_id:owner.id,status:'active'}).throwOnError();
  await db.from('professionals').insert({profile_id:owner.id,category_id:'desarrollo_web',business_name:'Remodelaciones '+label,slug:'invite-'+owner.id,whatsapp:'',provincia_id:'al',canton_id:'al-at',verification_status:'pending',is_banned:false,is_available:true}).throwOnError();
  const workId=crypto.randomUUID(),clientId='manual-client-'+label,document=emptyBusiness();
  // Same shape as the walkthrough: customer entered by hand, job new and unscheduled.
  document.clients=[{id:clientId,name:'Cliente manual '+label,email:'',phone:'',notes:'',archived:false}];
  document.work=[{id:workId,clientId,client:'Cliente manual '+label,service:'Remodelación de cocina '+label,stage:'new',start:'',end:'',cancelled:false}];
  await db.from('pro_workspaces').insert({user_id:owner.id,document,revision:1}).throwOnError();await login(context,owner);
  for(const endpoint of ['/api/auth/session-mfa','/api/auth/registration-state','/api/pro/access'])expect((await context.request.get(origin+endpoint,{timeout:45000})).status()).toBe(200);
  expect((await context.request.get(origin+'/api/pro/client-operations?'+new URLSearchParams({workId,clientId}),{timeout:45000})).status()).toBe(200);
  return {owner,db,workId,clientId};
 }catch(error){await cleanupDisposableAccount(owner);throw error;}
}
async function customer(browser:Browser,baseURL:string|undefined,prefix:string,name:string){const account=await createDisposableAccount({prefix});await regressionAdminClient().from('profiles').update({full_name:name}).eq('id',account.id).throwOnError();const context=await browser.newContext({baseURL});await login(context,account);return {account,context};}

for(const language of ['es','en'] as const)test(`Invite the customer of a manual job; the customer joins and follows it [${language}]`,async({page,browser,baseURL},info)=>{
 test.setTimeout(420000);local(baseURL);const en=language==='en',label=language+randomBytes(3).toString('hex');
 const f=await ownerFixture(page.context(),label),{owner,db,workId}=f;let client:Awaited<ReturnType<typeof customer>>|undefined,stranger:Awaited<ReturnType<typeof customer>>|undefined;
 try{
  const errors=collectPageErrors(page);
  client=await customer(browser,baseURL,'invite-client','Clienta Invitada '+label);stranger=await customer(browser,baseURL,'invite-stranger','Persona Ajena '+label);
  // API guards: same origin, owner only, strict body.
  expect((await page.request.post(origin+ownerApi,{headers:{'X-Pro-Expected-Actor':owner.id},data:{action:'create',actionId:crypto.randomUUID(),workId,invitationId:crypto.randomUUID(),expiresInDays:7}})).status()).toBe(403);
  expect((await page.request.post(origin+ownerApi,{headers:ownerHeaders(owner),data:{action:'create',actionId:crypto.randomUUID(),workId,invitationId:crypto.randomUUID(),expiresInDays:7,tokenHash:'0'.repeat(64)}})).status()).toBe(400);
  expect((await client.context.request.get(origin+ownerApi+'?'+new URLSearchParams({workId}),{headers:{'X-Pro-Expected-Actor':client.account.id}})).status()).toBe(403);
  expect((await client.context.request.post(origin+ownerApi,{headers:{Origin:origin,'X-Pro-Expected-Actor':client.account.id},data:{action:'create',actionId:crypto.randomUUID(),workId,invitationId:crypto.randomUUID(),expiresInDays:7}})).status()).toBe(403);

  // Owner: the job says nobody is linked and offers the invitation.
  await gotoOK(page,`/${language}/dashboard/pro?tab=pro_agenda&cita=${workId}`);
  const invite=page.locator('[data-work-client-invite]').first();await expect(invite).toBeVisible({timeout:90000});
  await expect(invite).toContainText(en?'Customer access':'Acceso del cliente');
  await shot(page,`invite-owner-before-${language}`,info.project.name);
  const created=page.waitForResponse(r=>new URL(r.url()).pathname===ownerApi&&r.request().method()==='POST');
  await invite.getByRole('button',{name:en?'Invite customer to the job':'Invitar al cliente al proyecto'}).click();
  expect((await created).status()).toBe(200);
  const linkField=invite.locator('[data-work-client-invite-link]');await expect(linkField).toBeVisible();
  const link=await linkField.inputValue(),code=await invite.locator('[data-work-client-invite-code]').inputValue();
  expect(link).toBe(`${origin}${en?'/en':''}/dashboard/unirse-proyecto#codigo=${code}`);expect(code).toMatch(/^[A-Za-z0-9_-]{43}$/);
  await expect(invite).toContainText(en?'It works once and expires in 7 days':'Sirve una sola vez y vence en 7 días');
  await expectNoHorizontalOverflow(page);await shot(page,`invite-owner-ready-${language}`,info.project.name);
  // Only the hash is stored; nothing was e-mailed or notified.
  const stored=(await db.from('pro_work_client_invitations').select('*').eq('owner_id',owner.id).throwOnError()).data!;expect(stored).toHaveLength(1);expect(JSON.stringify(stored)).not.toContain(code);
  // A stranger with a forged code learns nothing; the owner cannot use her own code.
  const strangerPreview=await stranger.context.request.post(origin+clientApi,{headers:{Origin:origin,'X-Pro-Expected-Actor':stranger.account.id},data:{action:'preview',token:'A'.repeat(43)}});expect(strangerPreview.status()).toBe(200);expect((await strangerPreview.json()).state).toBe('unknown');
  expect((await page.request.post(origin+clientApi,{headers:ownerHeaders(owner),data:{action:'accept',actionId:crypto.randomUUID(),token:code}})).status()).toBe(403);
  expect((await client.context.request.post(origin+clientApi,{headers:{'X-Pro-Expected-Actor':client.account.id},data:{action:'preview',token:code}})).status()).toBe(403);

  // Customer: opens the link, sees who invites and what is shared, and must confirm explicitly.
  const clientPage=await client.context.newPage();const clientErrors=collectPageErrors(clientPage);
  await clientPage.goto(link);
  const preview=clientPage.locator('[data-project-invitation-preview]');await expect(preview).toBeVisible({timeout:90000});
  expect(clientPage.url()).not.toContain(code);
  await expect(preview).toContainText('Remodelaciones '+label);await expect(preview).toContainText('Remodelación de cocina '+label);
  const join=preview.locator('[data-project-invitation-join]');await expect(join).toBeDisabled();
  await expectNoHorizontalOverflow(clientPage);await shot(clientPage,`invite-client-preview-${language}`,info.project.name);
  await preview.locator('[data-project-invitation-consent]').check();
  const accepted=clientPage.waitForResponse(r=>new URL(r.url()).pathname===clientApi&&r.request().method()==='POST'&&r.request().postDataJSON().action==='accept');
  await join.click();expect((await accepted).status()).toBe(200);
  const joined=clientPage.locator('[data-project-invitation-joined]');await expect(joined).toContainText(en?'The job is now in your account.':'El trabajo ya está en su cuenta.');
  await shot(clientPage,`invite-client-joined-${language}`,info.project.name);
  // Single use: the stranger cannot reuse it.
  const reused=await stranger.context.request.post(origin+clientApi,{headers:{Origin:origin,'X-Pro-Expected-Actor':stranger.account.id},data:{action:'accept',actionId:crypto.randomUUID(),token:code}});expect(reused.status()).toBe(410);expect((await reused.json()).reason).toBe('used');

  // The job is linked: customer view, contracts and shared updates use this account.
  const request=(await db.from('pro_appointment_requests').select('id,origin,status,client_user_id').eq('owner_id',owner.id).eq('work_id',workId).single().throwOnError()).data!;
  expect(request).toMatchObject({origin:'project_invite',status:'confirmed',client_user_id:client.account.id});
  const dashboard=await page.request.get(origin+'/api/pro/client-dashboard?'+new URLSearchParams({workId}),{headers:{'X-Pro-Expected-Actor':owner.id}});expect((await dashboard.json()).recipientName).toBe('Clienta Invitada '+label);
  const entryId=crypto.randomUUID();
  expect((await page.request.post(origin+'/api/pro/work-updates',{headers:ownerHeaders(owner),data:{action:'create',workId,entryId,actionId:crypto.randomUUID(),revision:0,title:'Demolición lista',text:'INVITE_SHARED_UPDATE'}})).status()).toBe(200);
  expect((await page.request.post(origin+'/api/pro/work-updates',{headers:ownerHeaders(owner),data:{action:'publish',workId,entryId,actionId:crypto.randomUUID(),revision:1,recipientId:client.account.id}})).status()).toBe(200);
  const shared=await client.context.request.get(origin+'/api/pro/work-updates?'+new URLSearchParams({requestId:request.id}),{headers:{'X-Pro-Expected-Actor':client.account.id}});expect(shared.status()).toBe(200);expect(JSON.stringify(await shared.json())).toContain('INVITE_SHARED_UPDATE');
  expect((await stranger.context.request.get(origin+'/api/pro/work-updates?'+new URLSearchParams({requestId:request.id}),{headers:{'X-Pro-Expected-Actor':stranger.account.id}})).status()).not.toBe(200);
  expect((await db.from('notifications').select('id').in('user_id',[owner.id,client.account.id]).throwOnError()).data).toEqual([]);
  // The job is not a new lead or appointment request of the owner.
  const leads=await page.request.get(origin+'/api/pro/appointment-requests?'+new URLSearchParams({side:'provider'}),{headers:{'X-Pro-Expected-Actor':owner.id}});
  if(leads.status()===200)expect(JSON.stringify(await leads.json())).not.toContain(request.id);

  // Customer panel: "Mis proyectos" lists the job and opens it.
  await gotoOK(clientPage,`/${language}/dashboard/profesional?tab=sent_projects&mode=use`);
  const links=clientPage.locator('[data-client-project-links]');await expect(links).toContainText('Remodelación de cocina '+label,{timeout:90000});
  await expectNoHorizontalOverflow(clientPage);await shot(clientPage,`invite-client-projects-${language}`,info.project.name);
  await links.locator(`[data-client-project-link="${request.id}"]`).click();
  await expect(clientPage).toHaveURL(new RegExp(`/dashboard/mi-proyecto/${request.id}`),{timeout:60000});/* Fix 14: the linked job opens as its own page */
  await expect(clientPage.getByText('INVITE_SHARED_UPDATE').first()).toBeVisible({timeout:90000});
  await shot(clientPage,`invite-client-job-${language}`,info.project.name);

  // Owner sees the linked customer; the owner can change the job stage freely.
  await page.reload();const linked=page.locator('[data-work-client-invite]').first();
  await expect(linked.locator('[data-work-client-linked]')).toContainText('Clienta Invitada '+label,{timeout:90000});
  await shot(page,`invite-owner-linked-${language}`,info.project.name);
  // Unlink: confirmation, access removed.
  await linked.getByRole('button',{name:en?'Unlink customer':'Desvincular cliente'}).click();
  await page.getByRole('dialog').last().getByRole('button',{name:en?'Unlink':'Desvincular',exact:true}).click();
  await expect(linked.getByRole('status')).toContainText(en?'Customer unlinked.':'Cliente desvinculado.');
  // Same rule as a cancelled appointment: nothing new can be shared (no recipient) and the job
  // leaves the customer's projects; what was already shared stays in the customer's history.
  const after=await page.request.get(origin+'/api/pro/client-dashboard?'+new URLSearchParams({workId}),{headers:{'X-Pro-Expected-Actor':owner.id}});expect((await after.json()).recipientName).toBeNull();
  const entry2=crypto.randomUUID();expect((await page.request.post(origin+'/api/pro/work-updates',{headers:ownerHeaders(owner),data:{action:'create',workId,entryId:entry2,actionId:crypto.randomUUID(),revision:0,title:'Después',text:'AFTER_UNLINK'}})).status()).toBe(200);
  expect((await page.request.post(origin+'/api/pro/work-updates',{headers:ownerHeaders(owner),data:{action:'publish',workId,entryId:entry2,actionId:crypto.randomUUID(),revision:1,recipientId:client.account.id}})).status()).not.toBe(200);
  const list=await client.context.request.get(origin+clientApi,{headers:{'X-Pro-Expected-Actor':client.account.id}});expect((await list.json()).items).toEqual([]);
  expect(errors()).toEqual([]);expect(clientErrors()).toEqual([]);
 }finally{
  await client?.context.close();await stranger?.context.close();
  if(client)await cleanupDisposableAccount(client.account);if(stranger)await cleanupDisposableAccount(stranger.account);await cleanupDisposableAccount(owner);
 }
});

test('Quote accepted with a code: the customer opts in and joins the job created from it',async({page,browser,baseURL},info)=>{
 test.setTimeout(420000);local(baseURL);const label='q'+randomBytes(3).toString('hex');
 const f=await ownerFixture(page.context(),label),{owner,db,clientId}=f;let client:Awaited<ReturnType<typeof customer>>|undefined;
 try{
  client=await customer(browser,baseURL,'invite-estimate-client','Cliente Cotización '+label);
  // Owner shares an estimate by code to the customer's e-mail (no e-mail is sent).
  const ctx=await estimateJson(page.context(),{view:'context',clientId});
  const save=estimateInput(ctx,{validUntil:'2030-12-31',title:'Cocina completa '+label}),saved=await estimatePost(page.context(),owner,save);expect(saved.status()).toBe(200);
  const estimate=(await saved.json()).estimate,code=randomBytes(32).toString('hex');
  expect((await estimatePost(page.context(),owner,{action:'publish',actionId:crypto.randomUUID(),publicationId:crypto.randomUUID(),estimateId:estimate.id,estimateRevision:1,recipient:{kind:'claim',email:client.account.email,code}},'/api/pro/private-estimate-publications')).status()).toBe(200);
  // Customer: uses the code and accepts in the UI, then is offered to join the job.
  const clientPage=await client.context.newPage();const clientErrors=collectPageErrors(clientPage);
  await gotoOK(clientPage,'/es/dashboard/cotizaciones');
  const surface=clientPage.locator('[data-estimate-publications]'),claim=surface.locator('[data-estimate-claim-form]');
  await claim.getByLabel('Código de acceso',{exact:true}).fill(code);await claim.getByRole('button',{name:'Usar código',exact:true}).click();
  await clientPage.getByRole('dialog').last().getByRole('button',{name:'Usar código',exact:true}).click();
  const detail=surface.locator('[data-estimate-publication-detail]');
  await detail.getByRole('button',{name:'Aceptar cotización',exact:true}).click();
  await clientPage.getByRole('dialog').last().getByRole('button',{name:'Aceptar cotización',exact:true}).click();
  const consent=detail.locator('[data-project-link-consent]');await expect(consent).toBeVisible({timeout:60000});
  const joinButton=consent.locator('[data-project-link-consent-join]');await expect(joinButton).toBeDisabled();
  await consent.locator('[data-project-link-consent-check]').check();await joinButton.click();
  await expect(consent.getByRole('status')).toContainText('Usted aceptó unirse');
  await expectNoHorizontalOverflow(clientPage);await shot(clientPage,'consent-pending-es',info.project.name);
  // Owner continues the accepted estimate into a new job: the consent links the account.
  const publication=(await db.from('pro_private_estimate_publications').select('id,content_hash').eq('estimate_id',estimate.id).single().throwOnError()).data!;
  const state=(await db.from('pro_private_estimate_publication_states').select('revision,status').eq('publication_id',publication.id).single().throwOnError()).data!;expect(state.status).toBe('accepted');
  const newWork=crypto.randomUUID();
  const continued=await estimatePost(page.context(),owner,{action:'continue',actionId:crypto.randomUUID(),publicationId:publication.id,contentHash:publication.content_hash,publicationRevision:state.revision,target:{kind:'new',workId:newWork,conversionActionId:null,leadRevision:null}},'/api/pro/private-estimate-work');expect(continued.status()).toBe(200);
  const link=(await db.from('pro_appointment_requests').select('id,origin,status,client_user_id').eq('owner_id',owner.id).eq('work_id',newWork).single().throwOnError()).data!;
  expect(link).toMatchObject({origin:'project_invite',status:'confirmed',client_user_id:client.account.id});
  const consentRead=await client.context.request.get(origin+clientApi+'?'+new URLSearchParams({publicationId:publication.id}),{headers:{'X-Pro-Expected-Actor':client.account.id}});
  expect(await consentRead.json()).toMatchObject({consented:true,jobReady:true,requestId:link.id});
  await gotoOK(clientPage,'/es/dashboard/profesional?tab=sent_projects&mode=use');
  await expect(clientPage.locator('[data-client-project-links]')).toContainText('Cocina completa '+label,{timeout:90000});
  await shot(clientPage,'consent-linked-projects-es',info.project.name);
  // Owner: the new job shows the linked customer.
  await gotoOK(page,`/es/dashboard/pro?tab=pro_agenda&cita=${newWork}`);
  await expect(page.locator('[data-work-client-linked]').first()).toContainText('Cliente Cotización '+label,{timeout:90000});
  expect(clientErrors()).toEqual([]);
 }finally{await client?.context.close();if(client)await cleanupDisposableAccount(client.account);await cleanupDisposableAccount(owner);}
});

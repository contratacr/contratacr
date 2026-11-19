import {test,expect,type Page} from 'playwright/test';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {collectPageErrors,gotoOK,expectNoHorizontalOverflow} from './helpers';
import {ownerFixture,local,headersFor,origin} from './pro-round2-fixture';

// Round 6C (2026-11-13): Round 6B follow-ups in MOCK mode. (1) A signed e-signature request accepts the change
// order through its existing writer exactly once (agreement updated once, shown on the request). (2) Project
// email composed from the job workspace (project fixed; outbox «simulated», never sent). (3) Calendar auto-sync:
// interval per calendar, in-app scheduler runs the due window once. No third-party call. Loopback only.
const shots=process.env.ROUND6C_SHOTS_DIR;
async function shot(page:Page,name:string,project:string,fullPage=false){if(!shots)return;mkdirSync(shots,{recursive:true});await page.screenshot({path:join(shots,`${name}-${project}.png`),fullPage});}
for(const language of ['es','en'] as const)test(`Round 6C: e-signature acceptance, job email and calendar auto-sync [${language}]`,async({page},info)=>{
 test.setTimeout(600000);local(info.project.use.baseURL);const en=language==='en',project=info.project.name,label=language+crypto.randomUUID().slice(0,6);
 const day=(offset:number)=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Costa_Rica'}).format(new Date(Date.now()+offset*86400000));
 const f=await ownerFixture(page.context(),label,document=>{document.work[0]={...document.work[0]!,stage:'scheduled',start:day(2)+'T09:00:00-06:00',end:day(2)+'T11:00:00-06:00'};});
 try{
  const errors=collectPageErrors(page),h=headersFor(f.owner),changeId=crypto.randomUUID(),email='cliente.'+label+'@example.test';
  const agreements=async()=>(await f.db.from('pro_client_entries').select('amount_cents').eq('user_id',f.owner.id).eq('work_id',f.workId).eq('kind','agreement')).data!;

  // (1) Agreement ₡1 000 000 + proposed change +₡250 000, then e-signature by the customer.
  const core=(await f.db.from('pro_workspace_core').select('revision').eq('user_id',f.owner.id).single()).data!;
  const op=await f.db.rpc('pro_record_client_operation',{p_user:f.owner.id,p_input:{actionId:crypto.randomUUID(),workId:f.workId,clientId:f.clientId,kind:'agreement',amountCents:100000000},p_revision:core.revision});expect(op.error).toBeNull();
  const proposed=await f.db.rpc('pro_work_changes_mutate',{p_actor:f.owner.id,p_input:{action:'propose',id:changeId,actionId:crypto.randomUUID(),workId:f.workId,reason:en?'Premium tiles':'Azulejo premium',baseCents:100000000,lines:[{description:en?'Premium tiles':'Azulejo premium',amountCents:25000000}]}});
  expect(proposed.error).toBeNull();expect(await agreements()).toHaveLength(1);
  const created=await page.request.post(origin+'/api/pro/esign',{headers:h,data:{action:'create',actionId:crypto.randomUUID(),documentKind:'work_change',documentId:changeId,signerName:'Cliente ronda '+label,signerEmail:email,language}});
  expect(created.status(),await created.text()).toBe(200);
  const read=async()=>(await (await page.request.get(origin+'/api/pro/esign?'+new URLSearchParams({kind:'work_change',id:changeId}))).json()) as {requests:{id:string;status:string;signerUrl:string|null;acceptance:{outcome:string}|null}[]};
  const token=new URL((await read()).requests[0]!.signerUrl!).searchParams.get('t')!;
  const signed=await page.request.post(origin+'/api/pro/esign/mock-sign',{headers:{Origin:origin},form:{t:token,action:'sign',typedName:'Cliente ronda '+label,consent:'yes'}});expect(signed.status()).toBe(200);
  const after=(await read()).requests[0]!;expect(after.status).toBe('signed');expect(after.acceptance?.outcome).toBe('accepted');
  const change=(await f.db.from('pro_work_changes').select('status,recorded_by,acceptance_note').eq('owner_id',f.owner.id).eq('id',changeId).single()).data!;
  expect(change.status).toBe('accepted');expect(change.recorded_by).toBe('provider');expect(change.acceptance_note).toContain(en?'Electronically signed by Cliente ronda':'Firmado electrónicamente por Cliente ronda');
  const totals=(await agreements()).map(row=>Number(row.amount_cents));expect(totals).toHaveLength(2);expect(totals).toContain(125000000);
  // Replaying the signature (same signer link) never applies the acceptance twice.
  await page.request.post(origin+'/api/pro/esign/mock-sign',{headers:{Origin:origin},form:{t:token,action:'sign',typedName:'Cliente ronda '+label,consent:'yes'}});
  expect(await agreements()).toHaveLength(2);
  expect((await f.db.from('pro_esign_acceptances').select('outcome').eq('owner_id',f.owner.id)).data).toEqual([{outcome:'accepted'}]);
  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_agenda',cita:f.workId,vistaTrabajo:'changes'}));
  const badge=page.locator('[data-esign-acceptance="accepted"]');await expect(badge).toBeVisible({timeout:90000});
  await expect(badge).toContainText(en?'accepted automatically':'aceptado automáticamente');
  await badge.scrollIntoViewIfNeeded();await expectNoHorizontalOverflow(page);await shot(page,`r6c-esign-acceptance-${language}`,project);

  // (2) Project email from the job workspace: first a hint to connect; after the (mock) OAuth the composer has the
  // project fixed; confirming records the message in the outbox as «simulated» (never sent).
  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_agenda',cita:f.workId,vistaTrabajo:'notes'}));
  const jobMail=page.locator('[data-work-project-email]');await expect(jobMail.locator('[data-work-email-connect]')).toBeVisible({timeout:90000});
  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_company',empresa:'conectores'}));
  const root=page.locator('[data-company-connectors]');await expect(root).toBeVisible({timeout:90000});
  await root.locator('[data-connector="google"] [data-connector-connect]').click();
  await expect(page.locator('[data-mock-consent="google"]')).toBeVisible({timeout:60000});await page.locator('[data-mock-allow]').click();
  await expect(page.locator('[data-oauth-result="connected"]')).toBeVisible({timeout:90000});
  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_agenda',cita:f.workId,vistaTrabajo:'notes'}));
  const composer=jobMail.locator('[data-email-composer]');await expect(composer).toBeVisible({timeout:90000});
  await expect(composer.locator(`[data-email-fixed-work="${f.workId}"]`)).toContainText('Remodelación de cocina '+label);await expect(composer.locator('[data-email-field="work"]')).toHaveCount(0);
  await composer.locator('[data-email-field="to"]').fill(email);
  await composer.locator('[data-email-field="subject"]').fill(en?'Change approved':'Cambio aprobado');
  await composer.locator('[data-email-field="body"]').fill(en?'Hello, the signed change is attached to your project.':'Hola, el cambio firmado ya está en su proyecto.');
  await composer.locator('[data-email-send]').click();
  const dialog=page.getByRole('dialog').filter({hasText:en?'Send this email?':'¿Enviar este correo?'});await expect(dialog).toContainText(en?'the email is NOT sent':'el correo NO se envía');
  await dialog.getByRole('button',{name:en?'Confirm (simulated)':'Confirmar (simulado)',exact:true}).click();
  await expect(jobMail.locator('[data-work-email-item="simulated"]')).toHaveCount(1,{timeout:60000});
  const outbox=(await f.db.from('pro_email_outbox').select('status,work_id').eq('owner_id',f.owner.id)).data!;expect(outbox).toEqual([{status:'simulated',work_id:f.workId}]);
  await jobMail.scrollIntoViewIfNeeded();await expectNoHorizontalOverflow(page);await shot(page,`r6c-job-email-${language}`,project);

  // (3) Calendar auto-sync: choose «every 15 min»; the in-app scheduler runs the due window by itself once.
  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_company',empresa:'conectores'}));
  const auto=root.locator('[data-calendar-autosync]');await expect(auto).toBeVisible({timeout:90000});
  await auto.locator('[data-calendar-autosync-interval="google"]').selectOption('15');
  await expect.poll(async()=>(await f.db.from('pro_calendar_autosync').select('interval_minutes').eq('owner_id',f.owner.id).eq('provider','google').maybeSingle()).data?.interval_minutes??0,{timeout:30000}).toBe(15);
  await page.reload();
  await expect.poll(async()=>(await f.db.from('pro_calendar_autosync_runs').select('status').eq('owner_id',f.owner.id)).data?.map(r=>r.status)??[],{timeout:90000}).toEqual(['ok']);
  expect((await f.db.from('pro_calendar_links').select('local_kind').eq('owner_id',f.owner.id)).data!.length).toBeGreaterThan(0);
  const tick=await page.request.post(origin+'/api/pro/connectors',{headers:h,data:{action:'calendar_autosync_tick',actionId:crypto.randomUUID()}});
  expect(tick.status()).toBe(200);expect(await tick.json()).toEqual({ran:[]});// not due again for 15 min
  await page.reload();await expect(auto.locator('[data-calendar-autosync-run="ok"]')).toHaveCount(1,{timeout:90000});
  await auto.scrollIntoViewIfNeeded();await expectNoHorizontalOverflow(page);await shot(page,`r6c-calendar-autosync-${language}`,project);
  expect(errors()).toEqual([]);
 }finally{await f.cleanup();}
});

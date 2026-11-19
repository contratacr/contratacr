import {test,expect,type Page} from 'playwright/test';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {collectPageErrors,gotoOK,expectNoHorizontalOverflow} from './helpers';
import {ownerFixture,local,headersFor,origin} from './pro-round2-fixture';

// Round 6B (2026-11-13): Google / Microsoft connectors in MOCK mode (rows 10 and 72). OAuth with PKCE + state
// against the local mock authorization server, tokens only encrypted, project email confirmed per message and
// kept in the outbox (never sent), two-way calendar sync with conflicts, Drive picker, revoke. Loopback only.
const shots=process.env.ROUND6B_SHOTS_DIR;
async function shot(page:Page,name:string,project:string,fullPage=false){if(!shots)return;mkdirSync(shots,{recursive:true});await page.screenshot({path:join(shots,`${name}-${project}.png`),fullPage});}
for(const language of ['es','en'] as const)test(`Round 6B: email, calendar and Drive connectors in mock mode [${language}]`,async({page},info)=>{
 test.setTimeout(480000);local(info.project.use.baseURL);const en=language==='en',project=info.project.name,label=language+crypto.randomUUID().slice(0,6);
 const day=(offset:number)=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Costa_Rica'}).format(new Date(Date.now()+offset*86400000));
 const f=await ownerFixture(page.context(),label,document=>{document.work[0]={...document.work[0]!,stage:'scheduled',start:day(2)+'T09:00:00-06:00',end:day(2)+'T11:00:00-06:00'};});
 try{
  const errors=collectPageErrors(page),h=headersFor(f.owner),taskId=crypto.randomUUID();
  await f.db.from('pro_work_tasks').insert({owner_id:f.owner.id,work_id:f.workId,id:taskId,title:(en?'Buy materials ':'Comprar materiales ')+label,due_date:day(5)}).throwOnError();
  const read=async()=>(await (await page.request.get(origin+'/api/pro/connectors')).json()) as {connections:{provider:string;status:string;revision:number}[];outbox:{status:string;to:string[];attachments:unknown[]}[];calendar:{links:{kind:string;localId:string;status:string;remoteId:string;conflict:{reason:string}|null}[];external:{title:string}[]}};
  const post=(data:Record<string,unknown>)=>page.request.post(origin+'/api/pro/connectors',{headers:h,data:{actionId:crypto.randomUUID(),...data}});

  // (1) Company › Email and calendar: both accounts disconnected; connect Google through the mock consent.
  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_company',empresa:'conectores'}));
  const root=page.locator('[data-company-connectors]');await expect(root).toBeVisible({timeout:90000});
  await expect(root.locator('[data-connector="google"]')).toHaveAttribute('data-connector-state','disconnected');
  await expect(root.locator('[data-email-composer]')).toHaveCount(0);
  await root.locator('[data-connector="google"] [data-connector-connect]').click();
  await expect(page.locator('[data-mock-consent="google"]')).toBeVisible({timeout:60000});
  const consentUrl=new URL(page.url());expect(consentUrl.searchParams.get('code_challenge_method')).toBe('S256');expect(consentUrl.searchParams.get('state')).toMatch(/^[A-Za-z0-9_-]{43}$/);
  await expectNoHorizontalOverflow(page);await shot(page,`r6b-oauth-consent-${language}`,project);
  const allowHref=await page.locator('[data-mock-allow]').getAttribute('href');
  await page.locator('[data-mock-allow]').click();
  await expect(page.locator('[data-oauth-result="connected"]')).toBeVisible({timeout:90000});
  await expect(root.locator('[data-connector="google"]')).toHaveAttribute('data-connector-state','connected');
  await expect(root.locator('[data-connector="google"] [data-connector-encrypted="true"]')).toBeVisible();
  // Tokens are stored only as AES-GCM envelopes; the API never returns them.
  const stored=(await f.db.from('pro_oauth_connections').select('access_box,refresh_box').eq('owner_id',f.owner.id).eq('provider','google').single()).data!;
  expect(stored.access_box).toMatch(/^v1\.mock\./);expect(stored.access_box).not.toContain('mock-at-');expect(stored.refresh_box).not.toContain('mock-rt-');
  expect(await (await page.request.get(origin+'/api/pro/connectors')).text()).not.toContain('v1.mock.');
  // The state is single-use: replaying the consent redirect fails without touching the connection.
  const replay=await page.request.get(allowHref!);expect(replay.status()).toBe(400);expect(await replay.text()).toContain('data-oauth-error');
  const forged=await page.request.get(origin+'/api/pro/oauth/callback?'+new URLSearchParams({state:'x'.repeat(43),code:'abc.def'}));expect(forged.status()).toBe(400);
  const badRedirect=await page.request.get(origin+'/api/pro/oauth/mock-authorize?'+new URLSearchParams({provider:'google',client_id:'mock-google',redirect_uri:'https://evil.example/cb',response_type:'code',state:'s'.repeat(43),code_challenge:'c'.repeat(43),code_challenge_method:'S256',scope:'email',hl:'es'}));
  expect(badRedirect.status()).toBe(400);

  // (2) Project email: compose, attach from Drive (mock picker), confirm THIS message → outbox «simulated».
  const composer=root.locator('[data-email-composer]');await expect(composer).toBeVisible();
  await composer.locator('[data-email-field="to"]').fill('Cliente.'+label+'@Example.test');
  await composer.locator('[data-email-field="subject"]').fill(en?'Progress update':'Avance de la obra');
  await composer.locator('[data-email-field="body"]').fill(en?'Hello, attached are the plans and the budget.':'Hola, adjunto los planos y el presupuesto.');
  await composer.locator('[data-email-field="work"]').selectOption(f.workId);
  await composer.locator('[data-email-attach]').click();
  const picker=page.locator('[data-file-picker]');await expect(picker).toBeVisible();
  await picker.locator('[data-picker-file="mock-google-planos-cocina"]').check();await picker.locator('[data-picker-file="mock-google-presupuesto-materiales"]').check();
  await shot(page,`r6b-drive-picker-${language}`,project);
  await page.locator('[data-picker-done]').click();await expect(composer.locator('[data-email-attachments] li')).toHaveCount(2);
  await composer.locator('[data-email-send]').click();
  const dialog=page.getByRole('dialog').filter({hasText:en?'Send this email?':'¿Enviar este correo?'});await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(en?'the email is NOT sent':'el correo NO se envía');
  await dialog.getByRole('button',{name:en?'Cancel':'Cancelar',exact:true}).click();
  expect((await read()).outbox).toHaveLength(0); // cancelled confirmation records nothing
  await composer.locator('[data-email-send]').click();
  await page.getByRole('dialog').filter({hasText:en?'Send this email?':'¿Enviar este correo?'}).getByRole('button',{name:en?'Confirm (simulated)':'Confirmar (simulado)',exact:true}).click();
  await expect(root.locator('[data-outbox-item="simulated"]')).toHaveCount(1,{timeout:60000});
  const outbox=(await read()).outbox;expect(outbox[0]).toMatchObject({status:'simulated',to:['cliente.'+label+'@example.test']});expect(outbox[0]!.attachments).toHaveLength(2);
  const unconfirmed=await post({action:'send_email',provider:'google',to:['a@example.test'],subject:'S',body:'B',workId:null,attachments:[]});expect(unconfirmed.status()).toBe(400);
  const foreignFile=await post({action:'send_email',provider:'google',confirmed:true,to:['a@example.test'],subject:'S',body:'B',workId:null,attachments:['no-es-un-archivo-ofrecido']});expect(foreignFile.status()).toBe(400);
  const notConnected=await post({action:'send_email',provider:'microsoft',confirmed:true,to:['a@example.test'],subject:'S',body:'B',workId:null,attachments:[]});expect(notConnected.status()).toBe(409);
  await root.locator('[data-outbox]').scrollIntoViewIfNeeded();await expectNoHorizontalOverflow(page);await shot(page,`r6b-outbox-${language}`,project);

  // (3) Calendar two-way: push job + task, pull a task moved in the calendar, appointment moved → conflict.
  const cal=root.locator('[data-calendar-sync]');
  await cal.locator('[data-calendar-sync-now="google"]').click();
  await expect(cal.locator('[data-calendar-summary]')).toContainText(en?'2 created':'2 creados',{timeout:60000});
  await expect(cal.locator('[data-calendar-link]')).toHaveCount(2);
  await cal.locator(`[data-calendar-simulate-move="${taskId}"]`).click();await expect(cal.locator(`[data-calendar-simulate-move="${taskId}"]`)).toBeEnabled();
  await cal.locator('[data-calendar-sync-now="google"]').click();
  await expect(cal.locator('[data-calendar-summary]')).toContainText(en?'1 pulled from the calendar':'1 traído del calendario',{timeout:60000});
  expect((await f.db.from('pro_work_tasks').select('due_date').eq('owner_id',f.owner.id).eq('id',taskId).single()).data!.due_date).toBe(day(6));
  await cal.locator(`[data-calendar-simulate-move="${f.workId}"]`).click();await expect(cal.locator(`[data-calendar-simulate-move="${f.workId}"]`)).toBeEnabled();
  await cal.locator('[data-calendar-simulate-external="google"]').click();await expect(cal.locator('[data-calendar-simulate-external="google"]')).toBeEnabled();
  await cal.locator('[data-calendar-sync-now="google"]').click();
  await expect(cal.locator('[data-calendar-conflict="appointment_moved"]')).toBeVisible({timeout:60000});
  await expect(cal.locator('[data-calendar-external] li')).toContainText(['Dentista (personal)']);
  await expect(cal.locator('[data-calendar-conflict="appointment_moved"] [data-calendar-keep="remote"]')).toHaveCount(0); // customer appointments are rescheduled from Appointments only
  await expectNoHorizontalOverflow(page);await cal.scrollIntoViewIfNeeded();await shot(page,`r6b-calendar-conflict-${language}`,project);
  await cal.locator('[data-calendar-conflict="appointment_moved"] [data-calendar-keep="local"]').click();
  await expect(cal.locator('[data-calendar-conflict]')).toHaveCount(0,{timeout:60000});
  const remote=(await f.db.from('pro_mock_calendar_events').select('starts_at').eq('owner_id',f.owner.id).eq('id',(await read()).calendar.links.find(l=>l.kind==='appointment')!.remoteId).single()).data!;
  expect(new Date(remote.starts_at).toISOString()).toBe(new Date(day(2)+'T09:00:00-06:00').toISOString()); // calendar restored to the agenda time
  // Task changed in BOTH places → conflict; keep the calendar version.
  const task=(await f.db.from('pro_work_tasks').select('revision').eq('owner_id',f.owner.id).eq('id',taskId).single()).data!;
  await f.db.from('pro_work_tasks').update({title:(en?'Buy tiles ':'Comprar azulejo ')+label,revision:task.revision+1}).eq('owner_id',f.owner.id).eq('id',taskId).throwOnError();
  expect((await post({action:'calendar_simulate',provider:'google',change:'move',remoteId:(await read()).calendar.links.find(l=>l.kind==='task')!.remoteId})).status()).toBe(200);
  expect(await (await post({action:'calendar_sync',provider:'google'})).json()).toMatchObject({conflicts:1});
  expect((await read()).calendar.links.find(l=>l.kind==='task')!.conflict!.reason).toBe('both_changed');
  expect((await post({action:'calendar_resolve',provider:'google',kind:'appointment',localId:f.workId,choice:'keep_remote'})).status()).toBe(409);
  expect((await post({action:'calendar_resolve',provider:'google',kind:'task',localId:taskId,choice:'keep_remote'})).status()).toBe(200);
  expect((await f.db.from('pro_work_tasks').select('due_date').eq('owner_id',f.owner.id).eq('id',taskId).single()).data!.due_date).toBe(day(7));
  // Completing the task removes its event from the calendar.
  await f.db.from('pro_work_tasks').update({status:'done'}).eq('owner_id',f.owner.id).eq('id',taskId).throwOnError();
  expect(await (await post({action:'calendar_sync',provider:'google'})).json()).toMatchObject({removed:1});

  // (4) Microsoft consent cancelled → «denied», nothing stored.
  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_company',empresa:'conectores'}));
  await expect(root).toBeVisible({timeout:90000});
  await root.locator('[data-connector="microsoft"] [data-connector-connect]').click();
  await page.locator('[data-mock-deny]').click({timeout:60000});
  await expect(page.locator('[data-oauth-result="denied"]')).toBeVisible({timeout:90000});
  expect((await read()).connections.find(c=>c.provider==='microsoft')).toBeUndefined();
  // (5) Disconnect Google: confirm → tokens wiped, outbox and links kept.
  await root.locator('[data-connector="google"] [data-connector-disconnect]').click();
  await page.getByRole('dialog').filter({hasText:en?'Disconnect the account?':'¿Desconectar la cuenta?'}).getByRole('button',{name:en?'Disconnect':'Desconectar',exact:true}).click();
  await expect(root.locator('[data-connector="google"]')).toHaveAttribute('data-connector-state','disconnected',{timeout:60000});
  const revoked=(await f.db.from('pro_oauth_connections').select('status,access_box,refresh_box').eq('owner_id',f.owner.id).eq('provider','google').single()).data!;
  expect(revoked).toEqual({status:'revoked',access_box:null,refresh_box:null});
  expect((await read()).outbox).toHaveLength(1);
  expect((await post({action:'calendar_sync',provider:'google'})).status()).toBe(409);
  await expectNoHorizontalOverflow(page);await shot(page,`r6b-connectors-${language}`,project);
  expect(errors()).toEqual([]);
 }finally{await f.cleanup();}
});

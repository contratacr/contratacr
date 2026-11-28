import {test,expect} from 'playwright/test';
import {randomBytes} from 'node:crypto';
import {ownerFixture,local,headersFor} from './pro-round2-fixture';
import {gotoOK,expectNoHorizontalOverflow} from './helpers';

// Row 24 (migrations 402 and 438): the hourly digest tick in SQL and the schedule panel in the browser. In-app only:
// the digest is a SIMULATED outbox row (mode sandbox, status simulated); nothing leaves the server.
// 2030-03-11 is a Monday; 14:05 UTC = 08:05 in Costa Rica, 15:05 UTC = 09:05.
const url='/api/pro/notification-schedule';
test('digest tick: due hour writes one simulated row per person and hour, quiet hours and other weekdays skip it',async({page},info)=>{
 test.setTimeout(240000);local(info.project.use.baseURL);
 const tag=randomBytes(3).toString('hex'),f=await ownerFixture(page.context(),tag);
 try{
  const db=f.db,owner=f.owner.id,headers=headersFor(f.owner);
  const save=async(revision:number,patch:Record<string,unknown>)=>{const r=await page.request.post(url,{headers,data:{actionId:crypto.randomUUID(),revision,quietEnabled:false,quietStart:'21:00',quietEnd:'07:00',quietWeekends:false,digestFrequency:'daily',digestHour:8,digestWeekday:1,...patch}});expect(r.status()).toBe(200);return (await r.json()).revision as number;};
  const outbox=async()=>(await db.from('pro_notification_outbox').select('id,channel,mode,status,unread_count,body').eq('owner_id',owner).eq('person_id',owner).throwOnError()).data!;
  const tick=async(at:string)=>{const r=await db.rpc('pro_notification_digest_tick',{p_now:at});expect(r.error).toBeNull();return r.data as {key:string;mode:string};};
  let rev=await save(0,{});
  // No unread notices: nothing is written even at the due hour.
  expect((await tick('2030-03-11T14:05:00Z')).mode).toBe('sandbox');expect(await outbox()).toEqual([]);
  await db.from('pro_notifications').insert([{owner_id:owner,person_id:owner,event:'task_assigned',source_key:'digest-test:'+tag+':1',title:'Tarea asignada '+tag,body:''},{owner_id:owner,person_id:owner,event:'task_due',source_key:'digest-test:'+tag+':2',title:'Tarea vence hoy '+tag,body:''}]).throwOnError();
  // Not the digest hour: nothing.
  await tick('2030-03-11T15:05:00Z');expect(await outbox()).toEqual([]);
  const due=await tick('2030-03-11T14:05:00Z');expect(due.key).toBe('2030-03-11T08');
  const rows=await outbox();expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({channel:'email',mode:'sandbox',status:'simulated',unread_count:2});
  expect(rows[0].body).toContain('Tarea vence hoy '+tag);
  // Same hour again (the Worker cron may retry): idempotent.
  await tick('2030-03-11T14:35:00Z');expect(await outbox()).toHaveLength(1);
  // Quiet hours covering the digest hour: skipped.
  rev=await save(rev,{digestHour:9,quietEnabled:true,quietStart:'09:00',quietEnd:'10:00'});
  await tick('2030-03-11T15:05:00Z');expect(await outbox()).toHaveLength(1);
  // Weekly on Friday: Monday is skipped, Friday 2030-03-15 at 09:05 writes (quiet off).
  rev=await save(rev,{digestFrequency:'weekly',digestHour:9,digestWeekday:5});
  await tick('2030-03-11T15:05:00Z');expect(await outbox()).toHaveLength(1);
  await tick('2030-03-15T15:05:00Z');expect(await outbox()).toHaveLength(2);
  // Read notices do not produce a digest.
  await db.from('pro_notifications').update({read_at:new Date().toISOString()}).eq('owner_id',owner).eq('person_id',owner).throwOnError();
  await tick('2030-03-22T15:05:00Z');expect(await outbox()).toHaveLength(2);
 }finally{await f.cleanup();}
});

for(const language of ['es','en'] as const)test(`Notification schedule panel: quiet hours, daily digest and a simulated try [${language}]`,async({page},info)=>{
 test.setTimeout(240000);local(info.project.use.baseURL);
 const en=language==='en',tag=randomBytes(3).toString('hex'),f=await ownerFixture(page.context(),tag);
 try{
  await gotoOK(page,`/${language}/dashboard/pro?tab=pro_notifications`);
  const panel=page.locator('[data-notification-schedule]');await expect(panel).toBeVisible({timeout:90000});
  await expect(panel.getByRole('heading',{name:en?'Quiet hours and digest':'Horario de silencio y resumen'})).toBeVisible();
  await panel.locator('[data-schedule-quiet]').check();
  await panel.locator('[data-schedule-start]').selectOption('22:00');await panel.locator('[data-schedule-end]').selectOption('06:00');
  await panel.locator('[data-schedule-frequency]').selectOption('daily');await panel.locator('[data-schedule-hour]').selectOption('8');
  await expect(panel.locator('[data-schedule-simulate="email"]')).toBeDisabled();// save first
  await panel.locator('[data-schedule-save]').click();
  await expect(panel.getByRole('status')).toHaveText(en?'Schedule saved.':'Horario guardado.',{timeout:30000});
  await expectNoHorizontalOverflow(page);
  const row=(await f.db.from('pro_notification_schedule').select('quiet_enabled,quiet_start,quiet_end,digest_frequency,digest_hour,revision').eq('owner_id',f.owner.id).eq('person_id',f.owner.id).single().throwOnError()).data!;
  expect(row).toEqual({quiet_enabled:true,quiet_start:'22:00',quiet_end:'06:00',digest_frequency:'daily',digest_hour:8,revision:1});
  await panel.locator('[data-schedule-simulate="email"]').click();
  await expect(panel.getByRole('status')).toHaveText(en?'Digest simulated. Nothing was sent.':'Resumen simulado. No se envió nada.',{timeout:30000});
  await expect(panel.locator('[data-schedule-outbox] li')).toHaveCount(1);
  await expect(panel.locator('[data-schedule-outbox] li').first()).toContainText(en?'Email · Simulated':'Correo · Simulado');
  const sent=(await f.db.from('pro_notification_outbox').select('channel,status').eq('owner_id',f.owner.id).throwOnError()).data!;
  expect(sent).toEqual([{channel:'email',status:'simulated'}]);
  await page.reload();await expect(page.locator('[data-notification-schedule] [data-schedule-quiet]')).toBeChecked({timeout:90000});
 }finally{await page.goto('about:blank').catch(()=>{});await f.cleanup();}
});

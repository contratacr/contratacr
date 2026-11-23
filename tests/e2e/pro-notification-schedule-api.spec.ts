import {test,expect} from 'playwright/test';
import {randomBytes} from 'node:crypto';
import {ownerFixture,local,origin,login,headersFor} from './pro-round2-fixture';
import {createDisposableAccount,cleanupDisposableAccount} from './disposable-account';

// Row 24: quiet hours + digest schedule per person (CAS by revision, idempotent action ids) and the sandbox digest.
// The sandbox records "simulated" rows only; no notification leaves the server. Loopback Supabase, disposable accounts.
test('notification schedule: validate, save, replay, conflict, simulate digest, isolation',async({page,browser},info)=>{
 test.setTimeout(240000);local(info.project.use.baseURL);
 const tag=randomBytes(3).toString('hex'),f=await ownerFixture(page.context(),tag),rival=await createDisposableAccount({prefix:'sched-rival'});
 try{
  const headers=headersFor(f.owner),url='/api/pro/notification-schedule';
  const first=await (await page.request.get(url)).json();expect(first).toMatchObject({revision:0,delivery:'sandbox',quietEnabled:false,digestFrequency:'off',outbox:[]});
  const action=crypto.randomUUID(),body={actionId:action,revision:0,quietEnabled:true,quietStart:'21:00',quietEnd:'07:00',quietWeekends:true,digestFrequency:'weekly',digestHour:8,digestWeekday:5};
  expect((await page.request.post(url,{headers:{'X-Pro-Expected-Actor':f.owner.id},data:body})).status()).toBe(403);
  expect((await page.request.post(url,{headers,data:{...body,quietEnd:'21:00'}})).status()).toBe(400);
  expect((await page.request.post(url,{headers,data:{...body,digestHour:24}})).status()).toBe(400);
  const saved=await page.request.post(url,{headers,data:body});expect(saved.status()).toBe(200);expect(await saved.json()).toMatchObject({revision:1,quietStart:'21:00',digestFrequency:'weekly',digestWeekday:5});
  const replay=await page.request.post(url,{headers,data:body});expect(replay.status()).toBe(200);expect((await replay.json()).revision).toBe(1);
  expect((await page.request.post(url,{headers,data:{...body,actionId:crypto.randomUUID(),revision:0}})).status()).toBe(409);
  const digest={actionId:crypto.randomUUID(),channels:['email','whatsapp','push']};
  const sim=await page.request.post(url,{headers,data:digest});expect(sim.status()).toBe(200);const simBody=await sim.json();expect(simBody.simulated).toBe(3);expect(simBody.outbox.map((o:{channel:string})=>o.channel).sort()).toEqual(['email','push','whatsapp']);
  expect(simBody.outbox.every((o:{status:string})=>o.status==='simulated')).toBe(true);
  const again=await page.request.post(url,{headers,data:digest});expect((await again.json()).outbox.length).toBe(3);
  expect((await page.request.post(url,{headers,data:{actionId:crypto.randomUUID(),channels:['sms']}})).status()).toBe(400);
  expect((await page.request.post(url,{headers,data:{actionId:crypto.randomUUID(),channels:['push','push']}})).status()).toBe(400);
  const other=await browser.newContext({baseURL:origin});await login(other,rival);expect((await other.request.get(origin+url)).status()).toBe(403);await other.close();
  const anonymous=await browser.newContext({baseURL:origin});expect((await anonymous.request.get(origin+url)).status()).toBe(401);await anonymous.close();
 }finally{await f.cleanup();await cleanupDisposableAccount(rival);}
});

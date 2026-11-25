import {test,expect} from 'playwright/test';
import {collectPageErrors,gotoOK,expectNoHorizontalOverflow} from './helpers';
import {ownerFixture,local,headersFor,origin} from './pro-round2-fixture';
import {isPrivateAddress,checkWebhookUrl,deliverWebhook,buildEnvelope} from '../../src/lib/pro/integrations/webhooks/adapter';
import {verifyWebhook} from '../../src/lib/pro/integrations/webhook';
import {mockMeetingUrl} from '../../src/lib/pro/integrations/webhooks/meetings';

// Row 72 (round 13): outgoing signed webhooks and meetings, SANDBOX/MOCK only. Nothing leaves the machine:
// sandbox deliveries are recorded as "simulated"; the live adapter is exercised with an injected fetch and resolver.
test('Row 72: webhook adapter blocks private targets, never follows redirects and signs with HMAC',async()=>{
 for(const ip of ['127.0.0.1','10.1.2.3','172.16.0.1','172.31.255.255','192.168.1.1','169.254.169.254','100.64.0.1','0.0.0.0','::1','fd00::1','fe80::1','::ffff:10.0.0.1'])expect(isPrivateAddress(ip),ip).toBe(true);
 for(const ip of ['8.8.8.8','93.184.216.34','2606:4700::1111'])expect(isPrivateAddress(ip),ip).toBe(false);
 const pub=async()=>['93.184.216.34'];
 expect((await checkWebhookUrl('http://example.com/h',pub)).ok).toBe(false);
 expect((await checkWebhookUrl('https://user:pw@example.com/h',pub)).ok).toBe(false);
 expect((await checkWebhookUrl('https://example.com:8443/h',pub)).ok).toBe(false);
 expect((await checkWebhookUrl('https://localhost/h',pub)).ok).toBe(false);
 expect((await checkWebhookUrl('https://127.0.0.1/h',pub)).ok).toBe(false);
 expect((await checkWebhookUrl('https://rebind.example.com/h',async()=>['93.184.216.34','10.0.0.5'])).ok).toBe(false);
 expect((await checkWebhookUrl('https://example.com/h',pub)).ok).toBe(true);
 const body=buildEnvelope('test.ping',{note:'x'});
 // Sandbox never calls fetch.
 let calls=0;const spy=(async()=>{calls++;return new Response(null,{status:200});}) as typeof fetch;
 expect(await deliverWebhook({mode:'sandbox',url:'https://example.com/h',secret:'s',body,fetcher:spy})).toEqual({status:'simulated',httpStatus:null,error:null});expect(calls).toBe(0);
 // Live: signed, redirect refused, private DNS refused.
 let seen:{headers:Record<string,string>;redirect?:string}|null=null;
 const ok=(async(_u:unknown,init:RequestInit)=>{seen={headers:init.headers as Record<string,string>,redirect:init.redirect};return new Response(null,{status:204});}) as unknown as typeof fetch;
 expect((await deliverWebhook({mode:'live',url:'https://example.com/h',secret:'whsec_test',body,fetcher:ok,resolver:pub})).status).toBe('delivered');
 expect(seen!.redirect).toBe('manual');expect(verifyWebhook('whsec_test',body,seen!.headers['x-ccr-signature']??seen!.headers['X-CCR-Signature']??null)).toEqual({ok:true});
 const redirect=(async()=>new Response(null,{status:302,headers:{Location:'http://169.254.169.254/'}})) as unknown as typeof fetch;
 expect(await deliverWebhook({mode:'live',url:'https://example.com/h',secret:'s',body,fetcher:redirect,resolver:pub})).toMatchObject({status:'failed',error:'redirect_refused'});
 expect(await deliverWebhook({mode:'live',url:'https://example.com/h',secret:'s',body,fetcher:ok,resolver:async()=>['10.0.0.5']})).toMatchObject({status:'failed',error:'url_private'});
 expect(mockMeetingUrl('zoom')).toMatch(/^https:\/\/zoom\.contratacr\.invalid\/m\/[A-Za-z0-9_-]{12}$/);
});

for(const language of ['es','en'] as const)test(`Row 72: webhooks and meetings in sandbox mode [${language}]`,async({page},info)=>{
 test.setTimeout(300000);local(info.project.use.baseURL);const en=language==='en',label=language+crypto.randomUUID().slice(0,6),tr=(es:string,english:string)=>en?english:es;
 const f=await ownerFixture(page.context(),label);
 try{
  const errors=collectPageErrors(page),h=headersFor(f.owner),api=origin+'/api/pro/company-automation';
  // Webhooks: unsafe address refused, safe one created with the secret shown once.
  const bad=await page.request.post(api,{headers:h,data:{action:'create',name:'Mala '+label,url:'https://127.0.0.1/hook',events:['lead.created']}});expect(bad.status()).toBe(400);
  const plain=await page.request.post(api,{headers:h,data:{action:'create',name:'Http '+label,url:'http://example.com/hook',events:['lead.created']}});expect(plain.status()).toBe(400);
  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_company',empresa:'automatizacion'}));
  const root=page.locator('[data-company-automation]');await expect(root).toBeVisible({timeout:90000});
  await expect(root.locator('[data-automation-mode="sandbox"]')).toBeVisible();
  await root.locator('[data-automation-name]').fill('Zapier '+label);await root.locator('[data-automation-url]').fill('https://hooks.example.com/ccr/'+label);
  await root.getByRole('button',{name:tr('Crear conexión','Create connection')}).click();
  const secret=root.locator('[data-automation-secret] code');await expect(secret).toContainText('whsec_',{timeout:60000});const shown=(await secret.textContent())!.trim();
  const stored=(await f.db.from('pro_webhook_endpoints').select('secret_box,secret_hint').eq('owner_id',f.owner.id).single()).data!;
  expect(stored.secret_box).not.toContain(shown);expect(shown.endsWith(stored.secret_hint)).toBe(true);
  expect(await (await page.request.get(api)).text()).not.toContain(shown);
  await expectNoHorizontalOverflow(page);
  // Test event: recorded as simulated, never sent.
  await root.locator('[data-automation-test]').click();
  await expect(root.locator('[data-automation-delivery="simulated"]')).toHaveCount(1,{timeout:60000});
  const read=(await (await page.request.get(api)).json()) as {endpoints:{id:string;status:string;revision:number}[]};
  // Pause: a paused connection no longer accepts tests.
  const endpoint=read.endpoints[0]!;
  expect((await page.request.post(api,{headers:h,data:{action:'pause',id:endpoint.id,revision:endpoint.revision}})).status()).toBe(200);
  expect((await page.request.post(api,{headers:h,data:{action:'test',id:endpoint.id}})).status()).toBe(404);
  expect((await page.request.post(api,{headers:h,data:{action:'resume',id:endpoint.id,revision:endpoint.revision}})).status(),'stale revision').toBe(409);
  // Another account cannot see or change it.
  // Revoke (no way back).
  const fresh=(await (await page.request.get(api)).json()) as {endpoints:{id:string;revision:number}[]};
  expect((await page.request.post(api,{headers:h,data:{action:'revoke',id:endpoint.id,revision:fresh.endpoints[0]!.revision}})).status()).toBe(200);
  expect((await page.request.post(api,{headers:h,data:{action:'resume',id:endpoint.id,revision:fresh.endpoints[0]!.revision+1}})).status()).toBe(400);
  // Meetings.
  const mapi=origin+'/api/pro/company-meetings';
  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_company',empresa:'reuniones'}));
  const meet=page.locator('[data-company-meetings]');await expect(meet).toBeVisible({timeout:90000});
  const when=new Date(Date.now()+2*86400000);const pad=(n:number)=>String(n).padStart(2,'0');
  await meet.locator('[data-meeting-title]').fill('Visita '+label);
  await meet.locator('[data-meeting-start]').fill(`${when.getFullYear()}-${pad(when.getMonth()+1)}-${pad(when.getDate())}T10:00`);
  await meet.getByRole('button',{name:tr('Crear reunión','Create meeting')}).click();
  const item=meet.locator('[data-meeting-status="scheduled"]');await expect(item).toHaveCount(1,{timeout:60000});
  await expect(item.locator('[data-meeting-link]')).toContainText('.invalid/m/');
  await expectNoHorizontalOverflow(page);
  const list=(await (await page.request.get(mapi)).json()) as {meetings:{id:string;revision:number}[]};
  expect((await page.request.post(mapi,{headers:h,data:{action:'cancel',id:list.meetings[0]!.id,revision:list.meetings[0]!.revision+5}})).status()).toBe(409);
  await item.locator('[data-meeting-cancel]').click();await page.getByRole('button',{name:tr('Cancelar reunión','Cancel meeting')}).last().click();
  await expect(meet.locator('[data-meeting-status="cancelled"]')).toHaveCount(1,{timeout:60000});
  expect(errors()).toEqual([]);
 }finally{await f.cleanup();}
});

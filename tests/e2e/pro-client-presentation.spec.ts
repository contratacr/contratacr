import {test,expect} from 'playwright/test';
import {randomBytes,randomUUID as uuid} from 'node:crypto';
import {ownerFixture,local,headersFor} from './pro-round2-fixture';
import {presentationOwnerSchema,presentationResultSchema,weatherSchema} from '../../src/lib/pro/client-presentation';

// Row 33 (2026-11-22): presentation of the customer view of a job: cover, video link, weather widget, individually hidden
// documents and the opening record. API level: validation (video host, province), optimistic concurrency, idempotent
// retry, hide/show, the weather route and the customer read of an unknown request. Disposable accounts, loopback only.
const api='/api/pro/client-presentation';
test('Client presentation: save, conflict, hide documents, weather',async({page},info)=>{
 test.setTimeout(300000);local(info.project.use.baseURL);
 const id=randomBytes(3).toString('hex');const f=await ownerFixture(page.context(),id),headers=headersFor(f.owner),work=f.workId;
 try{
  const read=async()=>presentationOwnerSchema.parse(await (await page.request.get(api+'?'+new URLSearchParams({workId:work}))).json());
  const first=await read();expect(first.revision).toBe(0);expect(first.headline).toBeNull();expect(first.opens.count).toBe(0);expect(first.linked).toBe(false);
  const base={action:'save',workId:work,revision:0,headline:'Su cocina nueva',subtitle:'Seguimiento de la obra',accent:'green',videoUrl:'https://youtu.be/abc123',showWeather:true,weatherCity:'heredia'};
  // Validation: a video from another site, weather without a province.
  expect((await page.request.post(api,{headers,data:{...base,actionId:uuid(),videoUrl:'https://example.com/video'}})).status()).toBe(400);
  expect((await page.request.post(api,{headers,data:{...base,actionId:uuid(),videoUrl:'http://youtu.be/abc123'}})).status()).toBe(400);
  expect((await page.request.post(api,{headers,data:{...base,actionId:uuid(),weatherCity:null}})).status()).toBe(400);
  // Save, then replay with the same action id (no second write) and a stale revision (409).
  const actionId=uuid(),saved=await page.request.post(api,{headers,data:{...base,actionId}});expect(saved.status()).toBe(200);
  const result=presentationResultSchema.parse(await saved.json());expect(result.action==='save'&&result.settings.revision).toBe(1);
  const replay=await page.request.post(api,{headers,data:{...base,actionId}});expect(replay.status()).toBe(200);
  expect((await page.request.post(api,{headers,data:{...base,actionId:uuid(),revision:0,headline:'Otra'}})).status()).toBe(409);
  const after=await read();expect(after.headline).toBe('Su cocina nueva');expect(after.accent).toBe('green');expect(after.weatherCity).toBe('heredia');expect(after.videoUrl).toBe('https://youtu.be/abc123');expect(after.revision).toBe(1);
  // Hide and show a document individually.
  const hide=(hidden:boolean)=>page.request.post(api,{headers,data:{action:'hide',actionId:uuid(),workId:work,kind:'contract',itemId:'doc-'+id,hidden}});
  expect((await hide(true)).status()).toBe(200);expect((await read()).hidden).toEqual([{kind:'contract',itemId:'doc-'+id}]);
  expect((await hide(false)).status()).toBe(200);expect((await read()).hidden).toEqual([]);
  // The customer read of a request that is not theirs is unavailable; the weather route validates the province.
  expect((await page.request.get(api+'?'+new URLSearchParams({requestId:uuid()}))).status()).toBe(404);
  expect((await page.request.get(api+'/weather?city=atlantis')).status()).toBe(400);
  const weather=await page.request.get(api+'/weather?city=heredia');expect(weather.status()).toBe(200);expect(typeof weatherSchema.parse(await weather.json()).available).toBe('boolean');
 }finally{await f.cleanup();}
});

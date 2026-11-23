import {test,expect} from 'playwright/test';
import {ownerFixture,local,headersFor,origin} from './pro-round2-fixture';

// Round 13 (rows 76 and 71, triage additions): meeting audio is deleted automatically after the retention period
// (the reviewed notes stay), and the campaign e-mail provider cannot be switched to production on this server.
// Disposable account, loopback only; mock adapters, nothing is sent or transcribed by a third party.
test('Round 13: audio retention purge and marketing production lock',async({page},info)=>{
 test.setTimeout(300000);local(info.project.use.baseURL);const f=await ownerFixture(page.context(),'ret'+crypto.randomUUID().slice(0,6)),h=headersFor(f.owner);
 try{
  const audio=Buffer.concat([Buffer.from([0x1a,0x45,0xdf,0xa3]),Buffer.alloc(4996,3)]);
  const settings=await (await page.request.get(origin+'/api/pro/ai?settings=1')).json() as {revision:number};
  expect((await page.request.post(origin+'/api/pro/ai',{headers:h,data:{action:'set_consent',actionId:crypto.randomUUID(),revision:settings.revision,consent:true,consentVersion:'2026-11-13'}})).status()).toBe(200);
  const up=await page.request.post(origin+'/api/pro/ai-meetings',{headers:h,multipart:{id:crypto.randomUUID(),workId:f.workId,title:'Retencion',consentAllParties:'true',language:'es',file:{name:'a.webm',mimeType:'audio/webm',buffer:audio}}});
  expect(up.status(),await up.text()).toBe(200);
  const count=async()=>(await f.db.from('pro_ai_recordings').select('id').eq('owner_id',f.owner.id).throwOnError()).data!.length;
  expect(await count()).toBe(1);
  // Within the period: kept (the default server limit is 90 days, so opening the job's meetings keeps it).
  expect((await page.request.get(origin+'/api/pro/ai-meetings?workId='+encodeURIComponent(f.workId))).status()).toBe(200);expect(await count()).toBe(1);
  expect((await f.db.rpc('pro_ai_recordings_purge',{p_actor:f.owner.id,p_days:90})).data).toEqual({removed:0,days:90});
  // Invalid periods are refused; zero days removes everything created before now.
  expect((await f.db.rpc('pro_ai_recordings_purge',{p_actor:f.owner.id,p_days:-1})).error?.code).toBe('22023');
  expect((await f.db.rpc('pro_ai_recordings_purge',{p_actor:f.owner.id,p_days:0})).data).toEqual({removed:1,days:0});expect(await count()).toBe(0);
  // Row 71: production mode of the campaign e-mail provider is refused without the server flag.
  const state=(await (await page.request.get(origin+'/api/pro/integrations')).json()) as {providers:{id:string;connection:{revision:number}}[]};
  const refused=await page.request.post(origin+'/api/pro/integrations',{headers:h,data:{action:'set_mode',actionId:crypto.randomUUID(),provider:'marketing_email',revision:state.providers.find(p=>p.id==='marketing_email')!.connection.revision,mode:'production',confirm:'ACTIVAR PRODUCCION'}});
  expect(refused.status()).toBe(403);
 }finally{await f.cleanup();}
});

import {test,expect} from 'playwright/test';
import {randomBytes,randomUUID as uuid} from 'node:crypto';
import {ownerFixture,local,origin,headersFor} from './pro-round2-fixture';
import {stageRulesReadSchema,stageRulesResultSchema} from '../../src/lib/pro/sales-pipeline';

// Row 07 (2026-11-22): rules per stage. A rule asks for a follow-up N days after a lead enters a stage; the reader
// lists the open leads that reached it. API level: validation, optimistic concurrency, idempotent retry, the due list
// and removal. Disposable accounts, loopback only; nothing is sent.
const api='/api/pro/lead-pipeline/rules';
test('Stage rules: set, retry, conflict, due list and clear',async({page},info)=>{
 test.setTimeout(300000);local(info.project.use.baseURL);
 const id=randomBytes(3).toString('hex');const f=await ownerFixture(page.context(),id),headers=headersFor(f.owner),owner=f.owner.id;
 try{
  const read=async()=>stageRulesReadSchema.parse(await (await page.request.get(api)).json());
  const empty=await read();expect(empty.rules).toEqual([]);expect(empty.due).toEqual([]);
  // Validation: unknown shape, days out of range, unknown stage.
  expect((await page.request.post(api,{headers,data:{action:'set',actionId:uuid(),revision:0,stageId:'new',days:0}})).status()).toBe(400);
  expect((await page.request.post(api,{headers,data:{action:'set',actionId:uuid(),revision:0,stageId:'new',days:91}})).status()).toBe(400);
  expect((await page.request.post(api,{headers,data:{action:'set',actionId:uuid(),revision:0,stageId:'no-such-stage',days:3}})).status()).toBeGreaterThanOrEqual(400);
  // A lead that entered "new" five days ago.
  const lead=uuid();
  await f.db.from('pro_lead_center_records').insert({owner_id:owner,kind:'manual',id:lead,client_id:f.clientId,title:'Cocina regla '+id,description:'',address:'',source_label:'',project_type:'',currency:'CRC',stage_mode:'automatic',revision:1}).throwOnError();
  await f.db.from('pro_lead_stage_spans').insert({owner_id:owner,kind:'manual',lead_id:lead,seq:1,stage_id:'new',entered_at:new Date(Date.now()-5*86400000).toISOString(),source:'backfill'}).throwOnError();
  // Set a 3-day rule; a retry with the same action id is a replay, not a second write.
  const actionId=uuid(),body={action:'set',actionId,revision:0,stageId:'new',days:3};
  const set=await page.request.post(api,{headers,data:body});expect(set.status()).toBe(200);const result=stageRulesResultSchema.parse(await set.json());expect(result.followUpDays).toBe(3);expect(result.revision).toBe(1);
  const replay=await page.request.post(api,{headers,data:body});expect(replay.status()).toBe(200);expect(stageRulesResultSchema.parse(await replay.json()).replayed).toBe(true);
  // A stale revision is a conflict.
  expect((await page.request.post(api,{headers,data:{action:'set',actionId:uuid(),revision:0,stageId:'new',days:7}})).status()).toBe(409);
  // The lead has been 5 days in the stage: it is due.
  const withRule=await read();expect(withRule.rules).toEqual([{stageId:'new',followUpDays:3}]);
  const item=withRule.due.find(d=>d.id===lead);expect(item).toBeTruthy();expect(item!.daysIn).toBeGreaterThanOrEqual(5);expect(item!.title).toContain('Cocina regla');
  // A longer rule takes it off the list; removing the rule empties the rules.
  expect((await page.request.post(api,{headers,data:{action:'set',actionId:uuid(),revision:1,stageId:'new',days:30}})).status()).toBe(200);
  expect((await read()).due.find(d=>d.id===lead)).toBeUndefined();
  expect((await page.request.post(api,{headers,data:{action:'clear',actionId:uuid(),revision:2,stageId:'new'}})).status()).toBe(200);
  expect((await read()).rules).toEqual([]);
  void origin;
 }finally{await f.cleanup();}
});

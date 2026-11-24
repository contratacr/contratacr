import {test,expect} from 'playwright/test';
import {randomBytes} from 'node:crypto';
import {ownerFixture,local,origin,login,headersFor} from './pro-round2-fixture';
import {createDisposableAccount,cleanupDisposableAccount} from './disposable-account';
import {personWorkdaysMutationSchema,personWorkdaysSchema} from '../../src/lib/pro/work-calendar';

// Row 13 (migration 440): working weekdays per person. Pure schemas, then the API and the SQL day rule end to end.
// 2030-03-09 is a Saturday, 2030-03-11 a Monday.
test('person workdays schemas',()=>{
 const id=crypto.randomUUID();
 expect(personWorkdaysMutationSchema.safeParse({action:'set',personId:id,revision:0,workDays:[6]}).success).toBe(true);
 expect(personWorkdaysMutationSchema.safeParse({action:'set',personId:id,revision:0,workDays:[]}).success).toBe(false);
 expect(personWorkdaysMutationSchema.safeParse({action:'set',personId:id,revision:0,workDays:[1,1]}).success).toBe(false);
 expect(personWorkdaysMutationSchema.safeParse({action:'set',personId:id,revision:0,workDays:[7]}).success).toBe(false);
 expect(personWorkdaysMutationSchema.safeParse({action:'clear',personId:id,revision:0}).success).toBe(false);
 expect(personWorkdaysSchema.safeParse({people:[{personId:id,name:'Ana',workDays:null,revision:0}]}).success).toBe(true);
});
test('Person workdays: owner sets and clears them, others cannot, the day rule uses them',async({page,browser},info)=>{
 test.setTimeout(240000);local(info.project.use.baseURL);
 const tag=randomBytes(3).toString('hex'),f=await ownerFixture(page.context(),tag),member=await createDisposableAccount({prefix:'workdays-member'}),rival=await createDisposableAccount({prefix:'workdays-rival'});
 try{
  const db=f.db,owner=f.owner.id,headers=headersFor(f.owner),url='/api/pro/person-workdays';
  await db.from('pro_company_members').insert({owner_id:owner,member_user_id:member.id,member_name:'Ana Jornada '+tag,member_email:member.email,role:'member'}).throwOnError();
  const list=async()=>(await (await page.request.get(url)).json()).people as {personId:string;workDays:number[]|null;revision:number}[];
  const mine=async()=>(await list()).find(p=>p.personId===member.id)!;
  expect(await mine()).toMatchObject({workDays:null,revision:0});
  const set={action:'set',personId:member.id,revision:0,workDays:[6]};
  expect((await page.request.post(url,{headers:{'X-Pro-Expected-Actor':owner},data:set})).status()).toBe(403);// no origin
  expect((await page.request.post(url,{headers,data:{...set,workDays:[]}})).status()).toBe(400);
  expect((await page.request.post(url,{headers,data:{...set,personId:rival.id}})).status()).toBeGreaterThanOrEqual(400);// not on the team
  expect((await page.request.post(url,{headers,data:set})).status()).toBe(200);
  expect(await mine()).toMatchObject({workDays:[6],revision:1});
  expect((await page.request.post(url,{headers,data:set})).status()).toBe(409);// stale revision
  const day=async(d:string)=>(await db.rpc('pro_cal_is_workday_for',{p_owner:owner,p_person:member.id,p_day:d})).data;
  expect(await day('2030-03-09')).toBe(true);expect(await day('2030-03-11')).toBe(false);// own Saturday, not Monday
  expect((await db.rpc('pro_cal_is_workday_for',{p_owner:owner,p_person:null,p_day:'2030-03-11'})).data).toBe(true);// company calendar
  expect((await db.rpc('pro_cal_next_workday_for',{p_owner:owner,p_person:member.id,p_day:'2030-03-10'})).data).toBe('2030-03-16');// next own Saturday
  const other=await browser.newContext({baseURL:origin});await login(other,rival);expect((await other.request.get(origin+url)).status()).toBe(403);
  expect((await other.request.post(origin+url,{headers:headersFor(rival),data:{action:'clear',personId:member.id,revision:1}})).status()).toBe(403);await other.close();
  expect((await page.request.post(url,{headers,data:{action:'clear',personId:member.id,revision:1}})).status()).toBe(200);
  expect(await mine()).toMatchObject({workDays:null,revision:0});expect(await day('2030-03-11')).toBe(true);
 }finally{await f.cleanup();await cleanupDisposableAccount(member);await cleanupDisposableAccount(rival);}
});

import {test,expect} from 'playwright/test';
import {randomBytes} from 'node:crypto';
import {ownerFixture,local,origin,login,headersFor} from './pro-round2-fixture';
import {createDisposableAccount,cleanupDisposableAccount} from './disposable-account';
import {gotoOK,expectNoHorizontalOverflow} from './helpers';
import {personWorkdaysMutationSchema,personWorkdaysSchema} from '../../src/lib/pro/work-calendar';

// Row 13 (batch F, migration 561): days off per person on top of the per-person working weekdays (migration 440).
// 2030-03-11 is a Monday, 2030-03-12 a Tuesday.
const url='/api/pro/person-workdays';
test('person days off schemas',()=>{
 const id=crypto.randomUUID();
 expect(personWorkdaysMutationSchema.safeParse({action:'days_off',personId:id,revision:0,daysOff:['2030-03-11']}).success).toBe(true);
 expect(personWorkdaysMutationSchema.safeParse({action:'days_off',personId:id,revision:0,daysOff:['2030-02-30']}).success).toBe(false);
 expect(personWorkdaysMutationSchema.safeParse({action:'days_off',personId:id,revision:0,daysOff:['2030-03-11','2030-03-11']}).success).toBe(false);
 expect(personWorkdaysMutationSchema.safeParse({action:'days_off',personId:id,revision:0,daysOff:Array.from({length:61},(_,i)=>`2030-01-${String(1+(i%28)).padStart(2,'0')}`)}).success).toBe(false);
 // Older payloads without the new fields still parse (defaults).
 expect(personWorkdaysSchema.parse({people:[{personId:id,name:'Ana',workDays:null,revision:0}]}).people[0]).toMatchObject({daysOff:[],daysOffRevision:0});
});

test('Person days off: owner saves and clears them, CAS, others cannot, the day rule and the next working day use them',async({page,browser},info)=>{
 test.setTimeout(240000);local(info.project.use.baseURL);
 const tag=randomBytes(3).toString('hex'),f=await ownerFixture(page.context(),tag),member=await createDisposableAccount({prefix:'daysoff-member'}),rival=await createDisposableAccount({prefix:'daysoff-rival'});
 try{
  const db=f.db,owner=f.owner.id,headers=headersFor(f.owner);
  await db.from('pro_company_members').insert({owner_id:owner,member_user_id:member.id,member_name:'Luis Libre '+tag,member_email:member.email,role:'member'}).throwOnError();
  const mine=async()=>((await (await page.request.get(url)).json()).people as {personId:string;daysOff:string[];daysOffRevision:number;workDays:number[]|null}[]).find(p=>p.personId===member.id)!;
  expect(await mine()).toMatchObject({daysOff:[],daysOffRevision:0,workDays:null});
  const set={action:'days_off',personId:member.id,revision:0,daysOff:['2030-03-12','2030-03-11']};
  expect((await page.request.post(url,{headers:{'X-Pro-Expected-Actor':owner},data:set})).status()).toBe(403);
  expect((await page.request.post(url,{headers,data:{...set,daysOff:['2030-13-01']}})).status()).toBe(400);
  expect((await page.request.post(url,{headers,data:{...set,personId:rival.id}})).status()).toBeGreaterThanOrEqual(400);
  expect((await page.request.post(url,{headers,data:{...set,daysOff:[]}})).status()).toBe(400);// nothing to clear yet
  expect((await page.request.post(url,{headers,data:set})).status()).toBe(200);
  expect(await mine()).toMatchObject({daysOff:['2030-03-11','2030-03-12'],daysOffRevision:1,workDays:null});
  expect((await page.request.post(url,{headers,data:set})).status()).toBe(409);
  const day=async(d:string,person:string|null=member.id)=>(await db.rpc('pro_cal_is_workday_for',{p_owner:owner,p_person:person,p_day:d})).data;
  expect(await day('2030-03-11')).toBe(false);expect(await day('2030-03-12')).toBe(false);expect(await day('2030-03-13')).toBe(true);
  expect(await day('2030-03-11',null)).toBe(true);// the company calendar is unchanged
  expect((await db.rpc('pro_cal_next_workday_for',{p_owner:owner,p_person:member.id,p_day:'2030-03-11'})).data).toBe('2030-03-13');
  // Days off combine with own weekdays (440): own Monday-only week, Monday 11 off -> next is Monday 18.
  expect((await page.request.post(url,{headers,data:{action:'set',personId:member.id,revision:0,workDays:[1]}})).status()).toBe(200);
  expect((await db.rpc('pro_cal_next_workday_for',{p_owner:owner,p_person:member.id,p_day:'2030-03-11'})).data).toBe('2030-03-18');
  const other=await browser.newContext({baseURL:origin});await login(other,rival);
  expect((await other.request.post(origin+url,{headers:headersFor(rival),data:{...set,revision:1}})).status()).toBe(403);await other.close();
  expect((await page.request.post(url,{headers,data:{...set,revision:1,daysOff:[]}})).status()).toBe(200);
  expect(await mine()).toMatchObject({daysOff:[],daysOffRevision:0});expect(await day('2030-03-11')).toBe(true);
 }finally{await f.cleanup();await cleanupDisposableAccount(member);await cleanupDisposableAccount(rival);}
});

for(const language of ['es','en'] as const)test(`Person days off in the work calendar panel [${language}]`,async({page},info)=>{
 test.setTimeout(240000);local(info.project.use.baseURL);
 const en=language==='en',tag=randomBytes(3).toString('hex'),f=await ownerFixture(page.context(),tag),member=await createDisposableAccount({prefix:'daysoff-ui'});
 try{
  await f.db.from('pro_company_members').insert({owner_id:f.owner.id,member_user_id:member.id,member_name:'Luis Libre '+tag,member_email:member.email,role:'member'}).throwOnError();
  await gotoOK(page,`${en?'/en':''}/dashboard/pro/trabajo/${encodeURIComponent(f.workId)}/schedule`);
  const panel=page.locator('[data-work-calendar]');await expect(panel).toBeVisible({timeout:90000});
  await panel.locator('summary').first().click();
  const row=panel.locator(`[data-person-workdays-row="${member.id}"]`);await expect(row).toBeVisible({timeout:30000});
  const box=row.locator('[data-person-days-off]');
  await expect(box).toContainText(en?'No days off recorded.':'No tiene días libres registrados.');
  await box.locator('[data-person-day-off-input]').fill('2030-03-11');
  await box.locator('[data-person-day-off-add]').click();
  await expect(box.locator('[data-person-day-off="2030-03-11"]')).toBeVisible({timeout:30000});
  await expect(panel.locator('[data-person-workdays]').getByRole('status')).toContainText(en?'Day off added.':'Día libre agregado.');
  await expectNoHorizontalOverflow(page);
  expect((await f.db.from('pro_person_days_off').select('days').eq('owner_id',f.owner.id).eq('person_id',member.id).single().throwOnError()).data!.days).toEqual(['2030-03-11']);
  await box.locator('[data-person-day-off="2030-03-11"]').getByRole('button',{name:en?/^Remove the day off /:/^Quitar el día libre /}).click();
  await expect(box.locator('[data-person-day-off]')).toHaveCount(0,{timeout:30000});
  expect((await f.db.from('pro_person_days_off').select('days').eq('owner_id',f.owner.id).eq('person_id',member.id).throwOnError()).data!).toEqual([]);
 }finally{await page.goto('about:blank').catch(()=>{});await f.cleanup();await cleanupDisposableAccount(member);}
});

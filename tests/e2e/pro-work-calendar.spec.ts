import {test,expect} from 'playwright/test';
import {randomBytes} from 'node:crypto';
import {gotoOK,expectNoHorizontalOverflow} from './helpers';
import {ownerFixture,local,origin,login} from './pro-round2-fixture';
import {createDisposableAccount,cleanupDisposableAccount,type DisposableAccount} from './disposable-account';
import {adjustPeriodToWorkingDays,crHolidaySuggestions,defaultWorkCalendar,easterSunday,isWorkingDay,mergeExceptions,nearestWorkingDay,workCalendarMutationSchema,workingDaysBetween,type WorkCalendar} from '../../src/lib/pro/work-calendar';

// Row 13 (work calendar): pure rules (no database) and the owner's calendar end to end (API authz, revision, UI).
// The calendar only informs the schedule (shading, working-day counts, explicit adjustment); it never moves a date.
test.describe('work calendar rules',()=>{
 test('Easter and the Holy Week holidays are computed, not typed',()=>{
  expect(easterSunday(2026)).toBe('2026-04-05');expect(easterSunday(2027)).toBe('2027-03-28');expect(easterSunday(2025)).toBe('2025-04-20');
  const days=crHolidaySuggestions(2026,false).map(h=>h.day);
  expect(days).toContain('2026-04-02');expect(days).toContain('2026-04-03');expect(days).toContain('2026-12-25');expect(days).toEqual([...days].sort());
  expect(crHolidaySuggestions(2027,true).find(h=>h.day==='2027-03-25')?.label).toBe('Holy Thursday');
 });
 test('exceptions win over the weekday and working days are counted',()=>{
  const cal:WorkCalendar={...defaultWorkCalendar(),exceptions:[{day:'2026-05-01',kind:'holiday',label:'Día del Trabajo'},{day:'2026-05-02',kind:'workday',label:'Sábado extra'}]};
  expect(isWorkingDay(cal,'2026-05-01')).toBe(false);expect(isWorkingDay(cal,'2026-05-02')).toBe(true);expect(isWorkingDay(cal,'2026-05-03')).toBe(false);expect(isWorkingDay(cal,'2026-05-04')).toBe(true);
  // 2026-04-27 (Mon) to 2026-05-04 (Mon): Mon-Thu (4) + Fri holiday + Sat extra (1) + Mon (1) = 6
  expect(workingDaysBetween(cal,'2026-04-27','2026-05-04')).toBe(6);
  expect(workingDaysBetween(cal,'2026-05-04','2026-05-01')).toBe(0);
  expect(workingDaysBetween(null,'2026-05-04','2026-05-08')).toBe(5);
 });
 test('adjusting a period moves its edges inward to working days and never crosses them',()=>{
  const cal=defaultWorkCalendar();
  expect(nearestWorkingDay(cal,'2026-05-02',1)).toBe('2026-05-04');expect(nearestWorkingDay(cal,'2026-05-03',-1)).toBe('2026-05-01');
  expect(adjustPeriodToWorkingDays(cal,'2026-05-02','2026-05-10')).toEqual({start:'2026-05-04',end:'2026-05-08'});
  expect(adjustPeriodToWorkingDays(cal,'2026-05-02','2026-05-03')).toEqual({start:'2026-05-02',end:'2026-05-03'});
 });
 test('merging suggestions keeps what the person already wrote and the 200 limit',()=>{
  const mine=[{day:'2026-12-25',kind:'workday' as const,label:'Abrimos'}];
  const merged=mergeExceptions(mine,crHolidaySuggestions(2026,false));
  expect(merged.find(e=>e.day==='2026-12-25')).toEqual(mine[0]);expect(merged.length).toBeGreaterThan(10);expect(merged.length).toBeLessThanOrEqual(200);
  expect(workCalendarMutationSchema.safeParse({revision:0,workDays:[],exceptions:[]}).success).toBe(false);
  expect(workCalendarMutationSchema.safeParse({revision:0,workDays:[1],exceptions:[],extra:1}).success).toBe(false);
 });
});

for(const language of ['es','en'] as const)test(`Work calendar: owner saves it, a stranger and anonymous cannot, the schedule shows it [${language}]`,async({page,browser},info)=>{
 test.setTimeout(420000);local(info.project.use.baseURL);
 const en=language==='en',tag=language+randomBytes(3).toString('hex'),tr=(es:string,english:string)=>en?english:es,prefix=en?'/en':'';
 const f=await ownerFixture(page.context(),tag);let rival:DisposableAccount|undefined;
 try{
  const owner=f.owner.id,headers={Origin:origin,'X-Pro-Expected-Actor':owner};
  rival=await createDisposableAccount({prefix:'wcal-rival'});
  // Defaults: Monday to Friday, no exceptions, revision 0.
  const first=await page.request.get('/api/pro/work-calendar',{headers:{'X-Pro-Expected-Actor':owner}});expect(first.status()).toBe(200);
  expect(await first.json()).toEqual({revision:0,workDays:[1,2,3,4,5],exceptions:[]});
  expect((await page.request.get('/api/pro/work-calendar?x=1')).status()).toBe(400);
  // Contracts: nothing is written for a bad body or a foreign origin.
  const bad=[{revision:0,workDays:[],exceptions:[]},{revision:0,workDays:[1,1],exceptions:[]},{revision:0,workDays:[1],exceptions:[{day:'2026-02-30',kind:'holiday',label:'X'}]},
   {revision:0,workDays:[1],exceptions:[{day:'2026-05-01',kind:'holiday',label:'A'},{day:'2026-05-01',kind:'workday',label:'B'}]},{revision:0,workDays:[7],exceptions:[]}];
  for(const body of bad)expect((await page.request.post('/api/pro/work-calendar',{headers,data:body})).status(),JSON.stringify(body)).toBe(400);
  expect((await page.request.post('/api/pro/work-calendar',{headers:{'X-Pro-Expected-Actor':owner},data:{revision:0,workDays:[1],exceptions:[]}})).status()).toBe(403);
  // Save, then a stale revision is refused (409) and the saved calendar stays.
  const saved=await page.request.post('/api/pro/work-calendar',{headers,data:{revision:0,workDays:[1,2,3,4,5,6],exceptions:[{day:'2026-12-25',kind:'holiday',label:'Navidad'}]}});
  expect(saved.status()).toBe(200);expect(await saved.json()).toEqual({revision:1});
  expect((await page.request.post('/api/pro/work-calendar',{headers,data:{revision:0,workDays:[1],exceptions:[]}})).status()).toBe(409);
  expect(await (await page.request.get('/api/pro/work-calendar',{headers:{'X-Pro-Expected-Actor':owner}})).json()).toEqual({revision:1,workDays:[1,2,3,4,5,6],exceptions:[{day:'2026-12-25',kind:'holiday',label:'Navidad'}]});
  // Another account has no access to this company's calendar; anonymous gets 401.
  const other=await browser.newContext({baseURL:origin});await login(other,rival);
  expect((await other.request.post(origin+'/api/pro/work-calendar',{headers:{Origin:origin},data:{revision:1,workDays:[1],exceptions:[]}})).status()).toBeGreaterThanOrEqual(400);
  await other.close();
  const anonymous=await browser.newContext({baseURL:origin});expect((await anonymous.request.get(origin+'/api/pro/work-calendar')).status()).toBe(401);await anonymous.close();
  // UI: the panel is in the schedule of the job, shows the saved data and saves a new holiday with the suggestion button.
  await gotoOK(page,`${prefix}/dashboard/pro/trabajo/${encodeURIComponent(f.workId)}/schedule`);
  const panel=page.locator('[data-work-calendar]');await expect(panel).toBeVisible({timeout:90000});
  await panel.locator('summary').click();
  await expect(panel.locator('[data-work-exception="2026-12-25"]')).toBeVisible({timeout:30000});
  await expect(panel.locator('[data-work-day="6"]')).toBeChecked();
  await panel.locator('[data-work-day="6"]').evaluate((el:HTMLInputElement)=>el.click());
  await expect(panel.locator('[data-work-day="6"]')).not.toBeChecked();
  await panel.locator('[data-work-calendar-suggest]').click();
  await expect(panel.locator('[data-work-exception]').nth(1)).toBeVisible();
  await panel.locator('[data-work-calendar-save]').click();
  await expect(panel.getByRole('status')).toContainText(tr('Calendario guardado','Calendar saved'),{timeout:30000});
  const after=await (await page.request.get('/api/pro/work-calendar',{headers:{'X-Pro-Expected-Actor':owner}})).json();
  expect(after.revision).toBe(2);expect(after.workDays).toEqual([1,2,3,4,5]);expect(after.exceptions.length).toBeGreaterThan(5);
  await expectNoHorizontalOverflow(page);
 }finally{if(rival)await cleanupDisposableAccount(rival);await f.cleanup();}
});

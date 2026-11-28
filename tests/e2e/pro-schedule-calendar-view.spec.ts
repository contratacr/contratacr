import {test,expect} from 'playwright/test';
import {randomBytes} from 'node:crypto';
import {ownerFixture,local,origin} from './pro-round2-fixture';
import {crTodayISO} from '../../src/lib/time-cr';
import {gotoOK,expectNoHorizontalOverflow} from './helpers';
import type {Gantt} from '../../src/lib/pro/project-schedule';

// Row 13: the «Calendario» view of the job schedule in the browser (month, Monday first): tasks on each planned day, key
// dates, month navigation, and full titles that wrap instead of being cut. The pure rules are in pro-schedule-views-unit.
const scheduleApi='/api/pro/project-schedule',planApi='/api/pro/work-schedule',tasksApi='/api/pro/work-tasks';
for(const language of ['es','en'] as const)test(`Schedule calendar view: tasks and key dates by day, navigation, no cut titles [${language}]`,async({page},info)=>{
 test.setTimeout(300000);local(info.project.use.baseURL);
 const en=language==='en',label='cal'+randomBytes(3).toString('hex'),f=await ownerFixture(page.context(),label),{owner,workId}=f,today=crTodayISO();
 try{
  const headers={Origin:origin,'X-Pro-Expected-Actor':owner.id};
  const gantt=async()=>{const r=await page.request.get(origin+scheduleApi+'?'+new URLSearchParams({workId}),{headers:{'X-Pro-Expected-Actor':owner.id},timeout:120000});expect(r.status()).toBe(200);return await r.json() as Gantt;};
  const post=async(url:string,data:Record<string,unknown>)=>{const r=await page.request.post(origin+url,{headers,data,timeout:120000});expect(r.status(),url+' '+await r.text()).toBe(200);return await r.json();};
  const plan=async(data:Record<string,unknown>)=>post(planApi,{actionId:crypto.randomUUID(),workId,revision:(await gantt()).revision,...data});
  const long='Instalación completa de la cerámica del baño principal con fragua epóxica '+label;
  const task=(await post(tasksApi,{action:'create',workId,taskId:crypto.randomUUID(),actionId:crypto.randomUUID(),revision:0,title:long,details:'',dueDate:null,assignee:''})).task as {id:string};
  await plan({action:'task_plan',taskId:task.id,phaseId:null,plannedStart:today,plannedEnd:today,dependsOn:[]});
  await plan({action:'milestone_save',milestoneId:crypto.randomUUID(),title:'Entrega '+label,date:today,notes:''});
  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_agenda',cita:workId,vistaTrabajo:'schedule'}));
  const section=page.locator('[data-project-schedule]');await expect(section).toBeVisible({timeout:120000});
  await section.locator('[data-schedule-mode="calendar"]').click();
  await expect(section.locator('[data-schedule-mode="calendar"]')).toHaveAttribute('aria-pressed','true');
  const cal=section.locator('[data-schedule-calendar]');await expect(cal).toBeVisible();
  await expect(cal.getByRole('grid',{name:en?'Schedule calendar':'Calendario del cronograma'})).toBeVisible();
  const title=await cal.locator('[data-calendar-title]').textContent();
  const cell=cal.locator(`[data-calendar-day="${today}"]`);
  await expect(cell.locator('[data-calendar-entry="task"]')).toHaveText(long);
  await expect(cell.locator('[data-calendar-entry="milestone"]')).toHaveText('Entrega '+label);
  // The whole title is visible: it wraps, nothing is clipped.
  const clipped=await cell.locator('[data-calendar-entry="task"]').evaluate(el=>el.scrollWidth>el.clientWidth+1||getComputedStyle(el).textOverflow==='ellipsis');
  expect(clipped).toBe(false);
  // Monday first.
  await expect(cal.getByRole('columnheader').first()).toHaveText(en?/^mon/i:/^lun/i);
  await cal.locator('[data-calendar-next]').click();await expect(cal.locator('[data-calendar-title]')).not.toHaveText(title!);
  await cal.locator('[data-calendar-today]').click();await expect(cal.locator('[data-calendar-title]')).toHaveText(title!);
  await expectNoHorizontalOverflow(page);
 }finally{await page.goto('about:blank').catch(()=>{});await f.cleanup();}
});

import {test,expect} from 'playwright/test';
import {randomBytes} from 'node:crypto';
import {ownerFixture,local,origin} from './pro-round2-fixture';
import {crTodayISO} from '../../src/lib/time-cr';
import {gotoOK,expectNoHorizontalOverflow,warmLocalRoutes} from './helpers';
import {wouldCreateCycle} from '../../src/lib/pro/gantt-edit';
import type {Gantt} from '../../src/lib/pro/project-schedule';

// Row 13: a dependency is created from the Gantt itself: choose the handle of the task that must finish first, then
// click the dependent task's bar (no drag needed, so it also works with a keyboard or a finger). Loops are refused.
const scheduleApi='/api/pro/project-schedule',planApi='/api/pro/work-schedule',tasksApi='/api/pro/work-tasks';
const shift=(iso:string,days:number)=>{const d=new Date(iso+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);};

test('the loop rule is pure',()=>{
 const tasks=[{id:'a',plannedStart:null,plannedEnd:null,dependsOn:[]},{id:'b',plannedStart:null,plannedEnd:null,dependsOn:['a']},{id:'c',plannedStart:null,plannedEnd:null,dependsOn:['b']},{id:'d',plannedStart:null,plannedEnd:null,dependsOn:[]}];
 expect(wouldCreateCycle(tasks,'c','a')).toBe(true);expect(wouldCreateCycle(tasks,'b','a')).toBe(true);expect(wouldCreateCycle(tasks,'a','a')).toBe(true);
 expect(wouldCreateCycle(tasks,'a','c')).toBe(false);expect(wouldCreateCycle(tasks,'d','a')).toBe(false);expect(wouldCreateCycle(tasks,'c','d')).toBe(false);
});

for(const language of ['es','en'] as const)test(`Gantt dependency from the chart: handle then bar, repeat and loop refused [${language}]`,async({page},info)=>{
 test.setTimeout(600000);local(info.project.use.baseURL);const en=language==='en',tr=(es:string,english:string)=>en?english:es,label=language+randomBytes(3).toString('hex');
 if(!info.project.use.isMobile)await page.setViewportSize({width:1440,height:900});
 const f=await ownerFixture(page.context(),label),{owner,workId}=f,today=crTodayISO();
 try{
  const headers={Origin:origin,'X-Pro-Expected-Actor':owner.id};
  const gantt=async()=>{const r=await page.request.get(origin+scheduleApi+'?'+new URLSearchParams({workId}),{headers:{'X-Pro-Expected-Actor':owner.id},timeout:120000});expect(r.status()).toBe(200);return await r.json() as Gantt;};
  const post=async(url:string,data:Record<string,unknown>)=>{const r=await page.request.post(origin+url,{headers,data,timeout:120000});expect(r.status(),url+' '+await r.text()).toBe(200);return await r.json();};
  const plan=async(data:Record<string,unknown>)=>post(planApi,{actionId:crypto.randomUUID(),workId,revision:(await gantt()).revision,...data});
  const newTask=async(title:string)=>((await post(tasksApi,{action:'create',workId,taskId:crypto.randomUUID(),actionId:crypto.randomUUID(),revision:0,title,details:'',dueDate:null,assignee:''})).task as {id:string});
  const A=await newTask(tr('Demolición ','Demolition ')+label),B=await newTask(tr('Repello ','Plaster ')+label),C=await newTask(tr('Pintura ','Painting ')+label);
  await plan({action:'task_plan',taskId:A.id,phaseId:null,plannedStart:shift(today,-2),plannedEnd:shift(today,1),dependsOn:[]});
  await plan({action:'task_plan',taskId:B.id,phaseId:null,plannedStart:shift(today,2),plannedEnd:shift(today,4),dependsOn:[A.id]});
  await plan({action:'task_plan',taskId:C.id,phaseId:null,plannedStart:shift(today,6),plannedEnd:shift(today,8),dependsOn:[]});
  const view=`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_agenda',cita:workId,vistaTrabajo:'schedule'});
  await warmLocalRoutes(page,[view,scheduleApi+'?workId='+workId]);
  await gotoOK(page,view);
  const section=page.locator('[data-project-schedule]');await expect(section).toBeVisible({timeout:120000});
  if(info.project.use.isMobile)await section.locator('[data-schedule-mode="gantt"]').click();
  const chart=section.locator('[data-schedule-gantt]');await expect(chart.locator('[data-schedule-bar]')).toHaveCount(3);
  const handle=(id:string)=>chart.locator(`[data-gantt-link-handle="${id}"]`),bar=(id:string)=>chart.locator(`[data-schedule-bar="${id}"]`),banner=section.locator('[data-gantt-link-banner]');
  const deps=async(id:string)=>(await gantt()).tasks.find(t=>t.id===id)!.dependsOn;
  // 1. B must finish before C: handle of B, then the bar of C. C now depends on B, dates unchanged.
  await handle(B.id).scrollIntoViewIfNeeded();await handle(B.id).click();await expect(banner).toBeVisible();await expect(banner).toContainText(tr('Elija la tarea que depende','Choose the task that depends'));
  await bar(C.id).scrollIntoViewIfNeeded();await bar(C.id).click();
  await expect(section.locator('[data-gantt-notice]')).toContainText(tr('ahora empieza después de','now starts after'),{timeout:60000});
  expect(await deps(C.id)).toEqual([B.id]);
  const c=(await gantt()).tasks.find(t=>t.id===C.id)!;expect([c.plannedStart,c.plannedEnd]).toEqual([shift(today,6),shift(today,8)]);
  // 2. The same link again is not duplicated.
  await handle(B.id).click();await bar(C.id).click();await expect(section.locator('[data-gantt-notice]')).toContainText(tr('ya existe','already exists'));
  expect(await deps(C.id)).toEqual([B.id]);
  // 3. C → A would close a loop (C already waits for B, which waits for A): refused with a clear message, nothing saved.
  await handle(C.id).click();await bar(A.id).click();await expect(section.getByRole('alert')).toContainText(tr('se esperen entre sí','wait for each other'));
  expect(await deps(A.id)).toEqual([]);
  // 4. Escape cancels link mode.
  await handle(A.id).click();await expect(banner).toBeVisible();await page.keyboard.press('Escape');await expect(banner).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
 }finally{await f.cleanup();}
});

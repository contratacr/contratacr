import {test,expect} from 'playwright/test';
import {randomBytes} from 'node:crypto';
import {ownerFixture,local,origin} from './pro-round2-fixture';
import {crTodayISO} from '../../src/lib/time-cr';
import {gotoOK} from './helpers';
import type {Gantt} from '../../src/lib/pro/project-schedule';

// Row 13: a dependency is made by DRAGGING the circle at the end of a bar onto another bar, and a key date (milestone) is
// moved by dragging its diamond. Desktop pointer only; the click and keyboard paths are covered by pro-gantt-link.spec.ts.
const scheduleApi='/api/pro/project-schedule',planApi='/api/pro/work-schedule',tasksApi='/api/pro/work-tasks';
const shift=(iso:string,days:number)=>{const d=new Date(iso+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);};

test('Gantt: drag a relation between bars and drag a key date',async({page},info)=>{
 test.skip(!!info.project.use.isMobile,'pointer drag is the desktop path');
 test.setTimeout(600000);local(info.project.use.baseURL);const label='dr'+randomBytes(3).toString('hex');
 await page.setViewportSize({width:1440,height:900});
 const f=await ownerFixture(page.context(),label),{owner,workId}=f,today=crTodayISO();
 try{
  const headers={Origin:origin,'X-Pro-Expected-Actor':owner.id};
  const gantt=async()=>{const r=await page.request.get(origin+scheduleApi+'?'+new URLSearchParams({workId}),{headers:{'X-Pro-Expected-Actor':owner.id},timeout:120000});expect(r.status()).toBe(200);return await r.json() as Gantt;};
  const post=async(url:string,data:Record<string,unknown>)=>{const r=await page.request.post(origin+url,{headers,data,timeout:120000});expect(r.status(),url+' '+await r.text()).toBe(200);return await r.json();};
  const plan=async(data:Record<string,unknown>)=>post(planApi,{actionId:crypto.randomUUID(),workId,revision:(await gantt()).revision,...data});
  const newTask=async(title:string)=>((await post(tasksApi,{action:'create',workId,taskId:crypto.randomUUID(),actionId:crypto.randomUUID(),revision:0,title,details:'',dueDate:null,assignee:''})).task as {id:string});
  const A=await newTask('Demolicion '+label),C=await newTask('Pintura '+label);
  await plan({action:'task_plan',taskId:A.id,phaseId:null,plannedStart:shift(today,-2),plannedEnd:shift(today,1),dependsOn:[]});
  await plan({action:'task_plan',taskId:C.id,phaseId:null,plannedStart:shift(today,6),plannedEnd:shift(today,8),dependsOn:[]});
  const milestoneId=crypto.randomUUID(),original=shift(today,4);
  await plan({action:'milestone_save',milestoneId,title:'Entrega de planos '+label,date:original,notes:''});
  await gotoOK(page,`/es/dashboard/pro?`+new URLSearchParams({tab:'pro_agenda',cita:workId,vistaTrabajo:'schedule'}));
  const section=page.locator('[data-project-schedule]');await expect(section).toBeVisible({timeout:120000});
  const chart=section.locator('[data-schedule-gantt]');await expect(chart.locator('[data-schedule-bar]')).toHaveCount(2);
  // While a save or its follow-up refresh is in flight the chart is busy and its handles are disabled, so a drag started then
  // is ignored on purpose. Each drag waits for the chart to be idle again.
  const idle=()=>expect(section).toHaveAttribute('data-gantt-busy','false',{timeout:60000});await idle();
  const handle=chart.locator(`[data-gantt-link-handle="${A.id}"]`),target=chart.locator(`[data-schedule-bar="${C.id}"]`);
  await handle.scrollIntoViewIfNeeded();await target.scrollIntoViewIfNeeded();
  const from=(await handle.boundingBox())!,to=(await target.boundingBox())!;
  await page.mouse.move(from.x+from.width/2,from.y+from.height/2);await page.mouse.down();await page.mouse.move(to.x+to.width/2,to.y+to.height/2,{steps:8});await page.mouse.up();
  await expect.poll(async()=>(await gantt()).tasks.find(t=>t.id===C.id)!.dependsOn,{timeout:60000}).toEqual([A.id]);
  await idle();const diamond=chart.locator(`[data-schedule-milestone="${milestoneId}"]`);await expect(diamond).toBeEnabled();await diamond.scrollIntoViewIfNeeded();
  const box=(await diamond.boundingBox())!;
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+120,box.y+box.height/2,{steps:8});await page.mouse.up();
  await expect.poll(async()=>(await gantt()).milestones.find(m=>m.id===milestoneId)!.date,{timeout:60000}).not.toBe(original);
  expect((await gantt()).milestones.find(m=>m.id===milestoneId)!.date>original).toBe(true);
 }finally{await f.cleanup();}
});

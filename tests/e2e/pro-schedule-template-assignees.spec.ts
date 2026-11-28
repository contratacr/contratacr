import {test,expect} from 'playwright/test';
import {randomBytes} from 'node:crypto';
import {ownerFixture,local,origin,login,headersFor} from './pro-round2-fixture';
import {createDisposableAccount,cleanupDisposableAccount} from './disposable-account';
import {crTodayISO} from '../../src/lib/time-cr';
import {gotoOK,expectNoHorizontalOverflow} from './helpers';

// Row 79 (batch F, migration 560): apply a schedule template choosing who does each template role on this job,
// in one transaction with a replay-safe receipt. API contract + the UI journey in ES and EN.
const api='/api/pro/schedule-templates',applyApi='/api/pro/schedule-templates-apply';
const ids=(n:number)=>Array.from({length:n},()=>crypto.randomUUID());
async function seed(page:import('playwright/test').Page,tag:string){
 const day=crTodayISO();
 const f=await ownerFixture(page.context(),tag,(document,{workId})=>{document.work=document.work.map(w=>w.id===workId?{...w,stage:'scheduled',start:day+'T09:00:00-06:00',end:day+'T11:00:00-06:00'}:w);});
 const member=await createDisposableAccount({prefix:'sched-map-member'});
 await f.db.from('pro_company_members').insert({owner_id:f.owner.id,member_user_id:member.id,member_name:'Ana Maestra '+tag,member_email:member.email,role:'member'}).throwOnError();
 const templateId=crypto.randomUUID(),phase=crypto.randomUUID(),[t1,t2,t3]=ids(3);
 const saved=await page.request.post(api,{headers:headersFor(f.owner),data:{action:'save',actionId:crypto.randomUUID(),templateId,revision:0,name:'Plan con cargos '+tag,notes:'',
  phases:[{id:phase,title:'Obra gris',position:0}],
  tasks:[{id:t1,title:'Demoler muros',details:'',assignee:'Maestro de obras',dueOffset:null,phaseId:phase,startOffset:0,endOffset:1,dependsOn:[]},
   {id:t2,title:'Cableado nuevo',details:'',assignee:'Electricista',dueOffset:null,phaseId:phase,startOffset:2,endOffset:3,dependsOn:[t1]},
   {id:t3,title:'Revisión final',details:'',assignee:'',dueOffset:null,phaseId:phase,startOffset:4,endOffset:4,dependsOn:[t2]}],milestones:[]}});
 expect(saved.status()).toBe(200);
 return {f,member,templateId,day,cleanup:async()=>{await f.cleanup();await cleanupDisposableAccount(member);}};
}
async function workTasks(f:Awaited<ReturnType<typeof ownerFixture>>){return (await f.db.from('pro_work_tasks').select('id,title,assignee').eq('owner_id',f.owner.id).eq('work_id',f.workId).throwOnError()).data!;}

test('schedule template apply with assignees: one transaction, replay, reuse guard, CAS, isolation',async({page,browser},info)=>{
 test.setTimeout(240000);local(info.project.use.baseURL);
 const tag=randomBytes(3).toString('hex'),s=await seed(page,tag),rival=await createDisposableAccount({prefix:'sched-map-rival'});
 try{
  const {f}=s,headers=headersFor(f.owner);
  const preview=await (await page.request.get(api+'?'+new URLSearchParams({view:'preview',templateId:s.templateId,workId:f.workId,startDate:s.day}))).json();
  expect(preview.tasks.map((t:{assignee:string})=>t.assignee)).toEqual(['Maestro de obras','Electricista','']);
  const input={action:'apply',actionId:crypto.randomUUID(),templateId:s.templateId,revision:preview.template.revision,workId:f.workId,workRevision:preview.revision,startDate:s.day,
   phaseIds:ids(1),phaseActionIds:ids(1),taskIds:ids(3),taskActionIds:ids(3),planActionIds:ids(3),milestoneIds:[],milestoneActionIds:[],
   assigneeMap:{'Maestro de obras':'Ana Maestra '+tag,'Electricista':''}};
  expect((await page.request.post(applyApi,{headers:{'X-Pro-Expected-Actor':f.owner.id},data:input})).status()).toBe(403);
  expect((await page.request.post(applyApi,{headers,data:{...input,assigneeMap:{}}})).status()).toBe(400);
  expect((await page.request.post(applyApi,{headers,data:{...input,action:'archive'}})).status()).toBe(400);
  const ok=await page.request.post(applyApi,{headers,data:input});expect(ok.status()).toBe(200);
  const body=await ok.json();expect(body.action).toBe('apply_mapped');expect(body.mapped).toBe(2);expect(body.applied.taskIds).toEqual(input.taskIds);
  const tasks=await workTasks(f);const by=(title:string)=>tasks.find(t=>t.title===title)!;
  expect(by('Demoler muros').assignee).toBe('Ana Maestra '+tag);expect(by('Cableado nuevo').assignee).toBe('');expect(by('Revisión final').assignee).toBe('');
  // Same action id and same input: stored answer, nothing duplicated.
  const replay=await page.request.post(applyApi,{headers,data:input});expect(replay.status()).toBe(200);expect((await replay.json()).replayed).toBe(true);
  expect((await workTasks(f)).length).toBe(3);
  // Same action id, other mapping: rejected.
  expect((await page.request.post(applyApi,{headers,data:{...input,assigneeMap:{'Electricista':'Ana Maestra '+tag}}})).status()).toBe(400);
  // Stale plan revision: 409 and nothing applied.
  const stale=await page.request.post(applyApi,{headers,data:{...input,actionId:crypto.randomUUID(),phaseIds:ids(1),phaseActionIds:ids(1),taskIds:ids(3),taskActionIds:ids(3),planActionIds:ids(3)}});
  expect(stale.status()).toBe(409);expect((await workTasks(f)).length).toBe(3);
  // The history of the mapped task records the change made by the task writer.
  const history=(await f.db.from('pro_work_task_history').select('task_id').eq('owner_id',f.owner.id).eq('task_id',by('Demoler muros').id).throwOnError()).data!;
  expect(history.length).toBeGreaterThanOrEqual(2);
  expect((await f.db.from('pro_schedule_template_map_actions').delete().eq('owner_id',f.owner.id)).error).not.toBeNull();
  const other=await browser.newContext({baseURL:origin});await login(other,rival);
  expect((await other.request.post(origin+applyApi,{headers:headersFor(rival),data:{...input,actionId:crypto.randomUUID()}})).status()).not.toBe(200);await other.close();
  const anonymous=await browser.newContext({baseURL:origin});expect((await anonymous.request.post(origin+applyApi,{headers:{Origin:origin},data:input})).status()).toBe(401);await anonymous.close();
 }finally{await s.cleanup();await cleanupDisposableAccount(rival);}
});

for(const language of ['es','en'] as const)test(`schedule template apply: choose assignees in the preview [${language}]`,async({page},info)=>{
 test.setTimeout(240000);local(info.project.use.baseURL);
 const en=language==='en',tag=randomBytes(3).toString('hex'),s=await seed(page,tag);
 try{
  const {f}=s;
  await gotoOK(page,`${en?'/en':'/es'}/dashboard/pro?tab=pro_agenda&cita=${f.workId}&vistaTrabajo=tasks&vistaTareas=plan`);
  await page.locator('[data-schedule-templates-trigger]').click();
  const modal=page.locator('[data-schedule-templates-modal]'),card=modal.locator(`[data-schedule-template="${s.templateId}"]`);
  await expect(card).toBeVisible({timeout:60000});
  await card.getByRole('button',{name:en?'Apply to this job':'Aplicar a este trabajo',exact:true}).click();
  await modal.getByRole('button',{name:en?'Preview':'Vista previa',exact:true}).click();
  const mapping=modal.locator('[data-task-template-mapping]');await expect(mapping).toBeVisible();
  await expect(mapping).toContainText(en?'Assignees on this job':'Responsables en este trabajo');
  const boss=mapping.locator('[data-task-template-map="Maestro de obras"]');
  await expect(boss.locator('option',{hasText:'Ana Maestra '+tag})).toHaveCount(1);
  await boss.selectOption('Ana Maestra '+tag);
  await mapping.locator('[data-task-template-map="Electricista"]').selectOption('');
  await expectNoHorizontalOverflow(page);
  const preview=modal.locator('[data-schedule-template-preview]');
  await preview.getByRole('button',{name:en?'Apply plan template':'Aplicar plantilla del plan',exact:true}).click();
  await page.getByRole('dialog').last().getByRole('button',{name:en?'Apply plan template':'Aplicar plantilla del plan',exact:true}).click();
  await expect(page.getByText(en?'New plan items were added to this job with the chosen assignees.':'Se agregaron elementos nuevos al plan de este trabajo con los responsables elegidos.')).toBeVisible({timeout:30000});
  const tasks=await workTasks(f);
  expect(tasks.find(t=>t.title==='Demoler muros')!.assignee).toBe('Ana Maestra '+tag);
  expect(tasks.find(t=>t.title==='Cableado nuevo')!.assignee).toBe('');
  expect(tasks.length).toBe(3);
 }finally{await page.goto('about:blank').catch(()=>{});await s.cleanup();}
});

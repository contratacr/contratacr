import {test,expect} from 'playwright/test';
import {ownerFixture,local,origin} from './pro-round2-fixture';

// Rows 78/79: a task template and a schedule template attached to an opportunity that is not a job yet. The plan stays
// pending (no task exists) and is created inside the job by the conversion itself; with the work calendar on, schedule
// dates that fall on a rest day move to the next working day. 2030-03-09 is a Saturday, 03-11 a Monday.
// Disposable account, loopback only; nothing is sent.
const plansApi='/api/pro/lead-plans';
test('Opportunity plan templates: pending until conversion, idempotent, CAS and materialized with the work calendar',async({page},info)=>{
 test.setTimeout(240000);local(info.project.use.baseURL);
 const label='lp'+Math.random().toString(16).slice(2,8),f=await ownerFixture(page.context(),label);
 try{
  const owner=f.owner.id,headers={Origin:origin,'X-Pro-Expected-Actor':owner},ctx=page.context().request,post=(path:string,data:unknown)=>ctx.post(origin+path,{headers,data});
  // Templates: two task rows (due +0 and +2 days) and a schedule with a dependent pair on days 0-1 and 2-3.
  const taskTemplate=crypto.randomUUID(),otherTemplate=crypto.randomUUID(),scheduleTemplate=crypto.randomUUID(),a=crypto.randomUUID(),b=crypto.randomUUID(),phase=crypto.randomUUID();
  const rows=[{id:crypto.randomUUID(),title:'Visita tecnica',details:'',assignee:'',dueOffset:0},{id:crypto.randomUUID(),title:'Compra de materiales',details:'',assignee:'',dueOffset:2}];
  for(const id of [taskTemplate,otherTemplate])expect((await post('/api/pro/task-templates',{action:'save',actionId:crypto.randomUUID(),templateId:id,revision:0,name:'Plan '+id.slice(0,6),notes:'',rows})).status()).toBe(200);
  expect((await post('/api/pro/schedule-templates',{action:'save',actionId:crypto.randomUUID(),templateId:scheduleTemplate,revision:0,name:'Cronograma '+label,notes:'',
   phases:[{id:phase,title:'Obra gris',position:0}],tasks:[{id:a,title:'Demolicion',details:'',assignee:'',dueOffset:null,phaseId:phase,startOffset:0,endOffset:1,dependsOn:[]},{id:b,title:'Tuberia',details:'',assignee:'',dueOffset:null,phaseId:phase,startOffset:2,endOffset:3,dependsOn:[a]}],milestones:[]})).status()).toBe(200);
  const lead={action:'create',actionId:crypto.randomUUID(),kind:'manual',id:crypto.randomUUID(),revision:0,catalogRevision:0,clientId:f.clientId,title:'Remodelacion '+label,description:'',address:'',sourceLabel:'Recomendacion',forecast:{projectType:'',expectedStart:'2030-03-09',currency:'CRC',revenueCents:null,budgetCents:null,profitCents:null},stageMode:'automatic',stageId:null};
  expect((await post('/api/pro/lead-center',lead)).status()).toBe(200);
  const attach=(kind:string,templateId:string,calendar:boolean,actionId=crypto.randomUUID())=>({action:'attach',actionId,leadId:lead.id,kind,templateId,startDate:'2030-03-09',calendar});
  const first=attach('tasks',taskTemplate,false),second=attach('schedule',scheduleTemplate,true),third=attach('tasks',otherTemplate,false);
  const one=await post(plansApi,first);expect(one.status()).toBe(200);const oneBody=await one.json();expect(oneBody).toMatchObject({kind:'tasks',status:'pending',calendar:false,startDate:'2030-03-09'});
  expect((await post(plansApi,second)).status()).toBe(200);
  const replay=await post(plansApi,first);expect(replay.status()).toBe(200);expect((await replay.json()).id).toBe(oneBody.id);// same actionId: same row
  expect((await post(plansApi,attach('tasks',taskTemplate,false))).status()).toBe(409);// the same template is already pending
  expect((await post(plansApi,{...first,calendar:true})).status()).toBe(400);// action id reused with other content
  const removable=await (await post(plansApi,third)).json();
  const removal={action:'remove',actionId:crypto.randomUUID(),leadId:lead.id,id:removable.id,revision:removable.revision};
  expect((await post(plansApi,removal)).status()).toBe(200);
  expect((await post(plansApi,{...removal,actionId:crypto.randomUUID()})).status()).toBe(409);// already removed
  const read=async()=>(await (await ctx.get(origin+plansApi+'?leadId='+lead.id,{headers})).json());
  let state=await read();expect(state.converted).toBe(false);expect(state.items.map((i:{status:string})=>i.status)).toEqual(['pending','pending']);
  expect((await f.db.from('pro_work_tasks').select('id').eq('owner_id',owner).neq('work_id',f.workId).throwOnError()).data).toHaveLength(0);// nothing created yet
  // Convert: the plans are created in the new job in the same transaction.
  const workId=crypto.randomUUID();
  expect((await post('/api/pro/manual-lead-work',{action:'convert',actionId:crypto.randomUUID(),leadId:lead.id,leadRevision:1,workId})).status()).toBe(200);
  state=await read();expect(state.converted).toBe(true);expect(state.items.map((i:{status:string})=>i.status)).toEqual(['applied','applied']);expect(state.items.every((i:{workId:string})=>i.workId===workId)).toBe(true);
  const tasks=(await f.db.from('pro_work_tasks').select('id,title,due_date').eq('owner_id',owner).eq('work_id',workId).throwOnError()).data!;
  expect(tasks).toHaveLength(4);
  expect(tasks.filter(t=>['Visita tecnica','Compra de materiales'].includes(t.title)).map(t=>t.due_date).sort()).toEqual(['2030-03-09','2030-03-11']);// calendar off: dates kept
  const plans=(await f.db.from('pro_work_schedule_plans').select('planned_start,planned_end,task_id').eq('owner_id',owner).eq('work_id',workId).throwOnError()).data!;
  const byTitle=(title:string)=>plans.find(p=>p.task_id===tasks.find(t=>t.title===title)!.id)!;
  expect(byTitle('Demolicion')).toMatchObject({planned_start:'2030-03-11',planned_end:'2030-03-11'});// Saturday-Sunday moved to Monday
  expect(byTitle('Tuberia')).toMatchObject({planned_start:'2030-03-12',planned_end:'2030-03-13'});// waits for its predecessor
  // A converted opportunity accepts no more pending plans.
  expect((await post(plansApi,attach('tasks',otherTemplate,false))).status()).toBe(409);
 }finally{await f.cleanup();}
});

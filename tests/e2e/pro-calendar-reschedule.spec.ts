import {test,expect} from 'playwright/test';
import {ownerFixture,local,origin} from './pro-round2-fixture';

// Row 13: the company work calendar drives a controlled reschedule. Preview first, then apply (CAS 409, idempotent
// receipt, one-step undo). Dates are fixed in 2030 so the weekdays are deterministic:
// 2030-03-04 Mon, 03-08 Fri, 03-09 Sat, 03-11 Mon, 03-12 Tue (declared holiday), 03-13 Wed.
// Disposable account, loopback only; nothing is sent.
const links='/api/pro/schedule-links',calendarApi='/api/pro/work-calendar';
test('Work calendar reschedule: working-day shift preview/apply/undo and calendarize with CAS and receipts',async({page},info)=>{
 test.setTimeout(240000);local(info.project.use.baseURL);
 const f=await ownerFixture(page.context(),'cal'+Math.random().toString(16).slice(2,8));
 try{
  const owner=f.owner.id,headers={Origin:origin,'X-Pro-Expected-Actor':owner},t1=crypto.randomUUID(),t2=crypto.randomUUID(),post=(path:string,data:unknown)=>page.context().request.post(origin+path,{headers,data});
  await f.db.from('pro_work_tasks').insert([{owner_id:owner,work_id:f.workId,id:t1,title:'Demoler',details:'',assignee:''},{owner_id:owner,work_id:f.workId,id:t2,title:'Tuberia',details:'',assignee:''}]).throwOnError();
  await f.db.from('pro_work_schedule_plans').insert([{owner_id:owner,work_id:f.workId,task_id:t1,planned_start:'2030-03-04',planned_end:'2030-03-06'},{owner_id:owner,work_id:f.workId,task_id:t2,planned_start:'2030-03-07',planned_end:'2030-03-08'}]).throwOnError();
  await f.db.from('pro_work_schedule_dependencies').insert({owner_id:owner,work_id:f.workId,task_id:t2,predecessor_id:t1}).throwOnError();
  await f.db.from('pro_work_schedule_heads').insert({owner_id:owner,work_id:f.workId,revision:1}).throwOnError();
  // Company calendar: Monday to Friday plus one holiday.
  expect((await post(calendarApi,{revision:0,workDays:[1,2,3,4,5],exceptions:[{day:'2030-03-12',kind:'holiday',label:'Feriado de prueba'}]})).status()).toBe(200);
  const query=(extra:Record<string,string>)=>links+'?'+new URLSearchParams({view:'preview',workId:f.workId,taskId:t1,start:'2030-03-06',end:'2030-03-08',...extra});
  // Plain preview lands the dependent on the Saturday; the calendar preview moves it to Monday and skips the holiday.
  const plain=await (await page.context().request.get(origin+query({}))).json();
  expect(plain.changes.find((c:{taskId:string})=>c.taskId===t2)).toMatchObject({toStart:'2030-03-09',toEnd:'2030-03-10'});
  const cal=await (await page.context().request.get(origin+query({calendar:'1'}))).json();
  expect(cal.revision).toBe(1);
  expect(cal.changes.find((c:{taskId:string})=>c.taskId===t2)).toMatchObject({fromStart:'2030-03-07',fromEnd:'2030-03-08',toStart:'2030-03-11',toEnd:'2030-03-13'});
  const plans=async()=>Object.fromEntries((await f.db.from('pro_work_schedule_plans').select('task_id,planned_start,planned_end').eq('work_id',f.workId).throwOnError()).data!.map(r=>[r.task_id,r.planned_start+'/'+r.planned_end]));
  expect((await plans())[t2]).toBe('2030-03-07/2030-03-08');// previews never write
  const shift={action:'shift_cal',actionId:crypto.randomUUID(),workId:f.workId,taskId:t1,start:'2030-03-06',end:'2030-03-08',revision:1};
  const applied=await post(links,shift);expect(applied.status()).toBe(200);expect((await applied.json()).revision).toBe(2);
  expect((await plans())[t2]).toBe('2030-03-11/2030-03-13');
  const replay=await post(links,shift);expect(replay.status()).toBe(200);expect((await replay.json()).replayed).toBe(true);
  expect((await post(links,{...shift,actionId:crypto.randomUUID()})).status()).toBe(409);// stale revision
  const undo=await post(links,{action:'undo',actionId:crypto.randomUUID(),workId:f.workId,shiftId:shift.actionId,revision:2});expect(undo.status()).toBe(200);
  expect((await plans())[t2]).toBe('2030-03-07/2030-03-08');
  // Calendarize: a task that starts on a Saturday moves to Monday and keeps at least one working day.
  await f.db.from('pro_work_schedule_plans').update({planned_start:'2030-03-09',planned_end:'2030-03-10'}).eq('task_id',t2).throwOnError();
  const preview=await (await page.context().request.get(origin+links+'?'+new URLSearchParams({view:'calendarize',workId:f.workId}))).json();
  expect(preview.changes).toHaveLength(1);expect(preview.changes[0]).toMatchObject({taskId:t2,toStart:'2030-03-11',toEnd:'2030-03-11'});
  const calendarize={action:'calendarize',actionId:crypto.randomUUID(),workId:f.workId,revision:preview.revision};
  expect((await post(links,{...calendarize,revision:preview.revision+5})).status()).toBe(409);
  expect((await post(links,calendarize)).status()).toBe(200);expect((await plans())[t2]).toBe('2030-03-11/2030-03-11');
  expect((await post(links,{...calendarize,actionId:crypto.randomUUID(),revision:preview.revision+1})).status()).toBe(400);// nothing left to move
  // Only the owner writes the calendar; a foreign actor header is refused before any SQL.
  expect((await page.context().request.post(origin+links,{headers:{Origin:origin,'X-Pro-Expected-Actor':crypto.randomUUID()},data:calendarize})).status()).toBe(403);
 }finally{await f.cleanup();}
});

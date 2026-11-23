import {test,expect,type BrowserContext} from 'playwright/test';
import {randomBytes} from 'node:crypto';
import {gotoOK,expectNoHorizontalOverflow} from './helpers';
import {ownerFixture,local,origin,login} from './pro-round2-fixture';
import {createDisposableAccount,cleanupDisposableAccount,type DisposableAccount} from './disposable-account';
import {crTodayISO} from '../../src/lib/time-cr';

// Row 15 (collaborator's global task center): a member sees the tasks of every job shared with them in ONE list, with
// "only mine", status, date and search filters. It adds no access: it only reads what the job board already reads.
const api='/api/pro/team',addDays=(iso:string,n:number)=>{const d=new Date(iso+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
const post=(context:BrowserContext,actor:DisposableAccount,input:Record<string,unknown>)=>context.request.post(origin+api,{headers:{Origin:origin,'X-Pro-Expected-Actor':actor.id},data:input});

for(const language of ['es','en'] as const)test(`Collaborator task center: one list across jobs, only mine, filters, no access beyond the grant [${language}]`,async({page,browser},info)=>{
 test.setTimeout(420000);local(info.project.use.baseURL);
 const en=language==='en',tag=language+randomBytes(3).toString('hex'),tr=(es:string,english:string)=>en?english:es;
 const f=await ownerFixture(page.context(),tag);let member:DisposableAccount|undefined,stranger:DisposableAccount|undefined;
 const memberContext=await browser.newContext({baseURL:origin});
 try{
  member=await createDisposableAccount({prefix:'collab-member'});stranger=await createDisposableAccount({prefix:'collab-stranger'});
  const today=crTodayISO(),owner=f.owner.id,db=f.db;
  const ids={mine:crypto.randomUUID(),other:crypto.randomUUID(),late:crypto.randomUUID()};
  await db.from('pro_work_tasks').insert([
   {owner_id:owner,work_id:f.workId,id:ids.mine,title:'COLLAB_MINE '+tag,details:'OWNER_ONLY_DETAILS',assignee:'',due_date:addDays(today,3),status:'open',archived:false,revision:1},
   {owner_id:owner,work_id:f.workId,id:ids.other,title:'COLLAB_OTHER '+tag,details:'OWNER_ONLY_DETAILS',assignee:'',due_date:addDays(today,5),status:'open',archived:false,revision:1},
   {owner_id:owner,work_id:f.workId,id:ids.late,title:'COLLAB_LATE '+tag,details:'OWNER_ONLY_DETAILS',assignee:'',due_date:addDays(today,-2),status:'open',archived:false,revision:1},
  ]).throwOnError();
  // Invite the member to the job (contributor) and assign one task to them.
  const raw=randomBytes(32).toString('hex');
  expect((await post(page.context(),f.owner,{action:'invite',actionId:crypto.randomUUID(),workId:f.workId,email:member.email,role:'contributor',code:raw})).status()).toBe(200);
  await login(memberContext,member);
  const accepted=await post(memberContext,member,{action:'accept',actionId:crypto.randomUUID(),code:raw});expect(accepted.status()).toBe(200);
  const grant=(await accepted.json()).grant as {id:string};
  expect((await post(page.context(),f.owner,{action:'assign',actionId:crypto.randomUUID(),workId:f.workId,taskId:ids.mine,revision:1,assigneeGrantId:grant.id})).status()).toBe(200);
  // The stranger (no grant) has no shared jobs, so the center never renders for them and the API shows nothing of this job.
  const outsider=await browser.newContext({baseURL:origin});await login(outsider,stranger);
  const shared=await outsider.request.get(origin+api+'?view=shared',{headers:{'X-Pro-Expected-Actor':stranger.id}});
  if(shared.status()===200)expect((await shared.json()).items).toEqual([]);else expect(shared.status()).toBeGreaterThanOrEqual(400);
  expect((await outsider.request.get(origin+api+'?'+new URLSearchParams({view:'tasks',grantId:grant.id}),{headers:{'X-Pro-Expected-Actor':stranger.id}})).status()).toBeGreaterThanOrEqual(400);
  await outsider.close();
  // The member's page: one list, only mine by default.
  const memberPage=await memberContext.newPage();
  await gotoOK(memberPage,`${en?'/en':''}/dashboard/pro/equipo`);
  const center=memberPage.locator('[data-collaborator-task-center]');await expect(center).toBeVisible({timeout:90000});
  await expect(center.locator(`[data-collab-task="${ids.mine}"]`)).toBeVisible({timeout:60000});
  await expect(center.locator(`[data-collab-task="${ids.other}"]`)).toHaveCount(0);
  await expect(center.locator(`[data-collab-task="${ids.mine}"]`)).toContainText(tr('Asignada a usted','Assigned to you'));
  await expect(memberPage.locator('body')).not.toContainText('OWNER_ONLY_DETAILS');
  await center.locator('[data-collab-mine]').uncheck();
  await expect(center.locator(`[data-collab-task="${ids.other}"]`)).toBeVisible();await expect(center.locator(`[data-collab-task="${ids.late}"]`)).toBeVisible();
  await center.locator('[data-collab-timing]').selectOption('overdue');
  await expect(center.locator('[data-collab-task]')).toHaveCount(1);await expect(center.locator(`[data-collab-task="${ids.late}"]`)).toContainText(tr('Atrasada','Overdue'));
  await center.locator('[data-collab-timing]').selectOption('all');
  await center.locator('[data-collab-search]').fill('COLLAB_OTHER');
  await expect(center.locator('[data-collab-task]')).toHaveCount(1);await expect(center.locator(`[data-collab-task="${ids.other}"]`)).toBeVisible();
  await expectNoHorizontalOverflow(memberPage);
  // Comments open that task's discussion straight from the global list (mentions live there).
  await center.locator(`[data-collab-task="${ids.other}"] [data-collab-discuss]`).click();
  await expect(memberPage.locator('[data-team-board]')).toBeVisible({timeout:60000});await expect(memberPage.getByRole('button',{name:tr('Volver a tareas','Back to tasks')})).toBeVisible();
  await memberPage.getByRole('button',{name:tr('Volver a tareas','Back to tasks')}).click();await memberPage.getByRole('button',{name:tr('Volver a trabajos','Back to jobs')}).click();
  await expect(center).toBeVisible({timeout:60000});await center.locator('[data-collab-mine]').uncheck();await center.locator('[data-collab-search]').fill('COLLAB_OTHER');
  await center.locator(`[data-collab-task="${ids.other}"]`).getByRole('button',{name:tr('Abrir trabajo','Open job')}).click();
  await expect(memberPage.locator('[data-team-board]')).toBeVisible({timeout:60000});
 }finally{await memberContext.close();await Promise.allSettled([f.cleanup(),...[member,stranger].filter((a):a is DisposableAccount=>!!a).map(a=>cleanupDisposableAccount(a))]);}
});

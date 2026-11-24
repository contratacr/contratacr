import {test,expect} from 'playwright/test';
import {gotoOK,expectNoHorizontalOverflow} from './helpers';
import {fixture,local,login,origin,uuid} from './pro-schedule-time-fixture';

// Area A (time management): team permissions per activity. No restriction = whole team; with a list, only those members can be credited.
const api='/api/pro/time-activity-members',time='/api/pro/time-tracking';
for(const language of ['es','en'] as const)test(`Time activity team permissions [${language}]`,async({page,browser,baseURL},info)=>{
 test.setTimeout(300000);local(baseURL);const en=language==='en',f=await fixture(page.context(),'tam',1),{owner,rival,client,db}=f,[workId]=f.works;
 try{
  await login(page.context(),owner);for(const endpoint of ['/api/auth/session-mfa','/api/auth/registration-state','/api/pro/access'])expect((await page.request.get(origin+endpoint,{timeout:45000})).status()).toBe(200);
  const grantA=uuid(),grantB=uuid();
  await db.from('pro_team_grants').insert([
   {id:grantA,owner_id:owner.id,work_id:workId,member_user_id:client.id,member_name:'Ana Pintora',role:'contributor',source_invite_id:uuid()},
   {id:grantB,owner_id:owner.id,work_id:workId,member_user_id:rival.id,member_name:'Beto Electricista',role:'contributor',source_invite_id:uuid()}]).throwOnError();
  const activityId=uuid(),create=await page.request.post(origin+time,{headers:{Origin:origin},data:{action:'activity_save',actionId:uuid(),activityId,revision:0,name:'Pintura',rateCents:1500000,costCents:900000,billable:true}});expect(create.status(),await create.text()).toBe(200);
  const post=(data:Record<string,unknown>)=>page.request.post(origin+api,{headers:{Origin:origin},data});
  const manual=(person:string|null)=>page.request.post(origin+time,{headers:{Origin:origin},data:{action:'manual',actionId:uuid(),entryId:uuid(),workId,activityId,billable:true,date:new Date().toISOString().slice(0,10),minutes:60,note:'',personGrantId:person}});
  const first=await (await page.request.get(origin+api)).json();expect(first.restrictions).toEqual({});expect(first.members.map((m:{name:string})=>m.name)).toEqual(['Ana Pintora','Beto Electricista']);
  // Open by default: any member can be credited.
  expect((await manual(grantB)).status()).toBe(200);
  const saved=await post({activityId,memberUserIds:[client.id]});expect(saved.status(),await saved.text()).toBe(200);expect(await saved.json()).toEqual({activityId,memberUserIds:[client.id]});
  expect((await (await page.request.get(origin+api)).json()).restrictions).toEqual({[activityId]:[client.id]});
  expect((await manual(grantB)).status()).toBe(403);expect((await manual(grantA)).status()).toBe(200);expect((await manual(null)).status()).toBe(200);
  const read=await (await page.request.get(origin+time+'?'+new URLSearchParams({workId,from:'2000-01-01',to:'2999-12-31'}))).json();
  expect(read.people.find((p:{grantId:string|null})=>p.grantId===grantA).memberUserId).toBe(client.id);
  for(const bad of [{memberUserIds:[rival.id]},{memberUserIds:['x']},{memberUserIds:'x'},{extra:1}])expect((await post({activityId,...bad})).status()).toBe(400);
  expect((await post({activityId:uuid(),memberUserIds:[]})).status()).toBe(404);
  expect((await page.request.get(origin+api+'?x=1')).status()).toBe(400);
  const other=await browser.newContext({baseURL});await login(other,rival);expect((await (await other.request.get(origin+api)).json()).restrictions).toEqual({});
  expect((await other.request.post(origin+api,{headers:{Origin:origin},data:{activityId,memberUserIds:[]}})).status()).toBe(404);await other.close();
  const anonymous=await browser.newContext({baseURL:origin});expect((await anonymous.request.get(origin+api)).status()).toBe(401);await anonymous.close();
  // UI: the editor shows the members, and clearing them opens the activity again.
  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_agenda',cita:workId,vistaTrabajo:'time'}));
  const section=page.locator('[data-time-tracking]');await expect(section).toBeVisible({timeout:60000});
  await section.locator('[data-time-activities] summary').click();
  await section.locator(`[data-time-activity="${activityId}"]`).getByRole('button',{name:en?'Edit':'Editar'}).click();
  const form=section.locator('[data-time-activity-form]');await expect(form.locator('[data-time-activity-members]')).toBeVisible();
  await expect(form.locator(`[data-member="${client.id}"]`)).toBeChecked();await expect(form.locator(`[data-member="${rival.id}"]`)).not.toBeChecked();
  await form.locator(`[data-member="${client.id}"]`).uncheck();await form.getByRole('button',{name:en?'Save':'Guardar',exact:true}).click();await expect(form).toHaveCount(0);
  await expect.poll(async()=>(await (await page.request.get(origin+api)).json()).restrictions[activityId]??[]).toEqual([]);
  expect((await manual(grantB)).status()).toBe(200);
  await expectNoHorizontalOverflow(page);await page.screenshot({path:info.outputPath(`time-activity-members-${language}.png`),fullPage:true});
 }finally{await f.cleanup();}
});

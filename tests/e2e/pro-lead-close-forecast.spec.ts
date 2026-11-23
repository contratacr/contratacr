import {test,expect,type Page} from 'playwright/test';
import {randomBytes,randomUUID as uuid} from 'node:crypto';
import {gotoOK,expectNoHorizontalOverflow} from './helpers';
import {ownerFixture,local,origin} from './pro-round2-fixture';
import {closeForecastSchema,closeDateResultSchema} from '../../src/lib/pro/sales-pipeline';

// Row 07 (2026-11-23): forecast by expected close date. API: validation, per-lead revision (409), idempotent retry, grouping by
// Costa Rica month with overdue and undated groups, weighted by stage probability, clear. UI: the panel on the board sets and
// clears a date in ES and EN. Disposable accounts, loopback only; nothing is sent.
const api='/api/pro/lead-pipeline/close-dates';
const crDay=(offset:number)=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Costa_Rica',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(Date.now()+offset*86400000));
async function openPro(page:Page,path:string,en:boolean){
 await gotoOK(page,path);
 const failed=page.getByText(en?'Could not verify Pro access. Your data is preserved.':'No se pudo comprobar el acceso a Pro. Sus datos se conservan.');
 const ready=page.locator('[data-independent-pro]');
 await expect(failed.or(ready).first()).toBeVisible({timeout:90000});
 if(await failed.isVisible())await page.getByRole('button',{name:en?'Retry':'Reintentar',exact:true}).click();
 await expect(ready.first()).toBeVisible({timeout:90000});
}
for(const language of ['es','en'] as const)test(`Close-date forecast: API contract and board panel [${language}]`,async({page},info)=>{
 test.setTimeout(480000);local(info.project.use.baseURL);const en=language==='en',id=language+randomBytes(3).toString('hex'),prefix=en?'/en':'';
 const f=await ownerFixture(page.context(),id),owner=f.owner.id,headers={Origin:origin,'X-Pro-Expected-Actor':owner};
 try{
  const read=async()=>closeForecastSchema.parse(await (await page.request.get(api)).json());
  const row=(lid:string,title:string,currency:string|null,cents:number|null)=>({owner_id:owner,kind:'manual',id:lid,client_id:f.clientId,title:title+' '+id,description:'',address:'',source_label:'',project_type:'',currency,revenue_cents:cents,stage_mode:'automatic',revision:1});
  const a=uuid(),b=uuid(),c=uuid();
  await f.db.from('pro_lead_center_records').insert([row(a,'Cocina cierre','CRC',100000000),row(b,'Terraza cierre','USD',200000),row(c,'Bano cierre','CRC',null)]).throwOnError();

  // Without dates everything is in the undated group.
  const first=await read();expect(first.groups.map(g=>g.group)).toEqual(['none']);expect(first.groups[0].count).toBe(3);expect(first.groups[0].withoutValue).toBe(1);
  // Validation and permissions.
  expect((await page.request.post(api,{headers:{'X-Pro-Expected-Actor':owner},data:{}})).status()).toBe(403);
  expect((await page.request.post(api,{headers,data:{actionId:uuid(),kind:'manual',id:a,revision:0,closeOn:'2026-13-45'}})).status()).toBeGreaterThanOrEqual(400);
  expect((await page.request.post(api,{headers,data:{actionId:uuid(),kind:'manual',id:a,revision:0,closeOn:'1999-01-01'}})).status()).toBeGreaterThanOrEqual(400);
  expect((await page.request.post(api,{headers,data:{actionId:uuid(),kind:'manual',id:uuid(),revision:0,closeOn:crDay(10)}})).status()).toBeGreaterThanOrEqual(400);
  // Set, replay, stale revision.
  const future=crDay(40),body={actionId:uuid(),kind:'manual',id:a,revision:0,closeOn:future};
  const set=await page.request.post(api,{headers,data:body});expect(set.status()).toBe(200);expect(closeDateResultSchema.parse(await set.json()).revision).toBe(1);
  expect(closeDateResultSchema.parse(await (await page.request.post(api,{headers,data:body})).json()).replayed).toBe(true);
  expect((await page.request.post(api,{headers,data:{actionId:uuid(),kind:'manual',id:a,revision:0,closeOn:crDay(50)}})).status()).toBe(409);
  // An overdue date for B.
  expect((await page.request.post(api,{headers,data:{actionId:uuid(),kind:'manual',id:b,revision:0,closeOn:crDay(-3)}})).status()).toBe(200);
  const grouped=await read();
  const month=grouped.groups.find(g=>g.group===future.slice(0,7));expect(month?.count).toBe(1);
  // Stage "new" weighs 10 %: 1,000,000.00 CRC estimated, 100,000.00 weighted.
  expect(month?.values).toEqual([{currency:'CRC',totalCents:100000000,weightedCents:10000000}]);
  expect(grouped.groups.find(g=>g.group==='overdue')?.values[0]).toMatchObject({currency:'USD',totalCents:200000,weightedCents:20000});
  expect(grouped.groups.find(g=>g.group==='none')?.count).toBe(1);
  expect(grouped.items.find(i=>i.id===a)).toMatchObject({closeOn:future,revision:1});

  // UI: the board panel clears the date of A and sets one for C.
  await openPro(page,`${prefix}/dashboard/pro?tab=pro_leads&tablero=1`,en);
  const panel=page.locator('[data-close-forecast]');await expect(panel.locator(`[data-close-item="${a}"]`)).toBeVisible({timeout:90000});
  await expect(panel.locator('[data-close-group="overdue"]')).toBeVisible();
  await panel.locator(`[data-close-clear="${a}"]`).click();
  await expect(panel.locator('[data-close-forecast-notice]')).toContainText(en?'Close date removed.':'Fecha de cierre quitada.',{timeout:60000});
  const target=crDay(20);await panel.locator(`[data-close-date="${c}"]`).fill(target);await panel.locator(`[data-close-save="${c}"]`).click();
  await expect(panel.locator('[data-close-forecast-notice]')).toContainText(en?'Close date saved.':'Fecha de cierre guardada.',{timeout:60000});
  await expect(panel.locator(`[data-close-date="${c}"]`)).toHaveValue(target);
  await expectNoHorizontalOverflow(page);
  const after=await read();expect(after.items.find(i=>i.id===a)?.closeOn).toBeNull();expect(after.items.find(i=>i.id===c)?.closeOn).toBe(target);
  // The history is immutable.
  const hist=await f.db.from('pro_lead_close_date_history').select('action_id,after_on').eq('owner_id',owner);expect(hist.data?.length).toBe(4);
  expect((await f.db.from('pro_lead_close_date_history').update({after_on:null}).eq('owner_id',owner)).error).not.toBeNull();
 }finally{await f.cleanup();}
});

// Row 08 (2026-11-23): conversion by team member (group=member), assigned leads vs unassigned, JSON and CSV.
test('Conversion by team member: assigned and unassigned leads',async({page},info)=>{
 test.setTimeout(300000);local(info.project.use.baseURL);const id=randomBytes(3).toString('hex');
 const f=await ownerFixture(page.context(),id),owner=f.owner.id;
 try{
  const a=uuid(),b=uuid(),today=crDay(0),q=(extra:Record<string,string>)=>'/api/pro/lead-board?'+new URLSearchParams({view:'conversion',from:today,to:today,group:'member',...extra});
  const row=(lid:string,title:string)=>({owner_id:owner,kind:'manual',id:lid,client_id:f.clientId,title:title+' '+id,description:'',address:'',source_label:'',project_type:'',currency:'CRC',revenue_cents:null,stage_mode:'automatic',revision:1});
  await f.db.from('pro_lead_center_records').insert([row(a,'Asignada'),row(b,'Sin asignar')]).throwOnError();
  await f.db.from('pro_lead_assignments').insert({owner_id:owner,kind:'manual',lead_id:a,assignee_id:owner}).throwOnError();
  const report=await (await page.request.get(q({}))).json() as {group:string;rows:{key:string;received:number}[];totals:{received:number}};
  expect(report.group).toBe('member');expect(report.totals.received).toBe(2);
  expect(report.rows.find(r=>r.key===owner)?.received).toBe(1);expect(report.rows.find(r=>r.key==='unassigned')?.received).toBe(1);
  const csv=await page.request.get(q({format:'csv',lang:'en'}));expect(csv.status()).toBe(200);const text=await csv.text();
  expect(text).toContain('Team member');expect(text).toContain('Unassigned');
  expect((await page.request.get(q({group:'nope'}))).status()).toBe(400);
 }finally{await f.cleanup();}
});

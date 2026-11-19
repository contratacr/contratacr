import {test,expect,type Page,type BrowserContext} from 'playwright/test';
import {randomBytes} from 'node:crypto';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {gotoOK,expectNoHorizontalOverflow,warmLocalRoutes,onAppPageError} from './helpers';
import {ownerFixture,local,origin,login} from './pro-round2-fixture';
import {createDisposableAccount,cleanupDisposableAccount,type DisposableAccount} from './disposable-account';
import {newCompanyInviteCode} from '../../src/lib/pro/team-roles';
import {stageSettingsSchema,pipelineForecastSchema,stageFunnelSchema,leadStageHistorySchema} from '../../src/lib/pro/sales-pipeline';

// Ronda F2-B (rows 07, 08): stage colour and probability, weighted forecast on the board, moving a card through
// the existing writer records its stage span (time in stage), funnel by stage reached with CSV, role gate.
// Disposable accounts, loopback only; nothing is sent.
const shots=process.env.F2B_SHOTS_DIR;
async function shot(page:Page,name:string,project:string){if(!shots)return;mkdirSync(shots,{recursive:true});await page.screenshot({path:join(shots,`${name}-${project}.png`)});}
async function openPro(page:Page,path:string,en:boolean){
 await gotoOK(page,path);
 const failed=page.getByText(en?'Could not verify Pro access. Your data is preserved.':'No se pudo comprobar el acceso a Pro. Sus datos se conservan.');
 const ready=page.locator('[data-independent-pro]');
 await expect(failed.or(ready).first()).toBeVisible({timeout:90000});
 if(await failed.isVisible())await page.getByRole('button',{name:en?'Retry':'Reintentar',exact:true}).click();
 await expect(ready.first()).toBeVisible({timeout:90000});
}
const crToday=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Costa_Rica',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const api='/api/pro/lead-pipeline';

for(const language of ['es','en'] as const)test(`Sales pipeline: stage colour/probability, forecast, time in stage and funnel [${language}]`,async({page,browser},info)=>{
 test.setTimeout(600000);local(info.project.use.baseURL);const en=language==='en',id=language+randomBytes(3).toString('hex'),project=info.project.name,tr=(es:string,english:string)=>en?english:es,prefix=en?'/en':'';
 const f=await ownerFixture(page.context(),id);const contexts:BrowserContext[]=[],members:DisposableAccount[]=[];
 try{
  const runtime:string[]=[];onAppPageError(page,message=>runtime.push(message));
  const owner=f.owner.id,today=crToday(),headers={Origin:origin,'X-Pro-Expected-Actor':owner};
  await warmLocalRoutes(page,[api+'?view=settings',api+'?view=forecast','/api/pro/lead-board?view=board',api+'?'+new URLSearchParams({view:'funnel',from:today,to:today})]);
  // ---- Contract and validation ----
  const settings=stageSettingsSchema.parse(await (await page.request.get(api+'?view=settings')).json());
  expect(settings.stages.map(s=>[s.id,s.color,s.probability])).toEqual([['new','blue',10],['followed_up','cyan',20],['connected','teal',30],['meeting_scheduled','violet',50],['estimate_sent','amber',70],['won','green',100]]);
  expect((await page.request.get(api+'?view=nope')).status()).toBe(400);
  expect((await page.request.post(api,{headers:{'X-Pro-Expected-Actor':owner},data:{}})).status()).toBe(403);
  expect((await page.request.post(api,{headers,data:{action:'style',actionId:crypto.randomUUID(),revision:0,stageId:'won',color:'#000',probability:5}})).status()).toBe(400);
  expect((await page.request.post(api,{headers,data:{action:'style',actionId:crypto.randomUUID(),revision:9,stageId:'won',color:'green',probability:100}})).status()).toBe(409);
  expect((await page.request.get(api+'?'+new URLSearchParams({view:'lead',kind:'manual',id:crypto.randomUUID()}))).status()).toBe(400);

  // ---- Leads: A (CRC, referral), B (USD), C (no value) ----
  const leadA=crypto.randomUUID(),leadB=crypto.randomUUID(),leadC=crypto.randomUUID();
  const row=(lid:string,title:string,currency:string|null,cents:number|null)=>({owner_id:owner,kind:'manual',id:lid,client_id:f.clientId,title:title+' '+id,description:'',address:'',source_label:'',project_type:'',currency,revenue_cents:cents,stage_mode:'automatic',revision:1});
  await f.db.from('pro_lead_center_records').insert([row(leadA,tr('Cocina embudo','Kitchen pipeline'),'CRC',250000000),row(leadB,tr('Terraza embudo','Deck pipeline'),'USD',100000),row(leadC,tr('Baño embudo','Bath pipeline'),'CRC',null)]).throwOnError();
  await f.db.from('pro_lead_origin_assignments').insert({owner_id:owner,kind:'manual',id:leadA,manual_id:leadA,channel_id:'referral',revision:1}).throwOnError();

  // ---- Board with the forecast ----
  await openPro(page,`${prefix}/dashboard/pro?tab=pro_leads&tablero=1`,en);
  const forecast=page.locator('[data-pipeline-forecast]'),board=page.locator('[data-lead-board]');
  await expect(board.locator(`[data-lead-board-card="${leadA}"]`)).toBeVisible({timeout:90000});
  await expect(forecast.locator('[data-pipeline-total="open"]')).toContainText(/2[.,]500[.,]000/,{timeout:60000});
  await expect(forecast.locator('[data-pipeline-total="weighted"]')).toContainText(/250[.,]000/);
  await expect(forecast.locator('[data-pipeline-without-value]')).toContainText('1');
  await expect(board.locator('[data-lead-board-forecast="new"]')).toContainText(en?'10%':'10 %');
  await expect(board.locator('[data-lead-board-column="new"] [data-lead-board-color]')).toHaveAttribute('data-lead-board-color','blue');
  await expectNoHorizontalOverflow(page);await shot(page,`f2b-board-forecast-${language}`,project);

  // ---- Colour and probability of a stage ----
  await page.locator('[data-pipeline-style-open]').click();const style=page.locator('[data-pipeline-style]');await expect(style).toBeVisible();
  const quote=style.locator('[data-pipeline-style-stage="estimate_sent"]');
  await quote.locator('[data-pipeline-color="red"]').click();await quote.locator('[data-pipeline-probability="estimate_sent"]').fill('80');
  await shot(page,`f2b-stage-style-${language}`,project);
  await quote.locator('[data-pipeline-style-save="estimate_sent"]').click();
  await expect(style.locator('[data-pipeline-style-notice]')).toContainText(tr('Cotización enviada','Quote sent'),{timeout:60000});
  await expect(quote.locator('[data-pipeline-style-reset="estimate_sent"]')).toBeVisible();
  expect((await f.db.from('pro_lead_stage_styles').select('color,probability').eq('owner_id',owner).eq('stage_id','estimate_sent').single()).data).toEqual({color:'red',probability:80});
  await page.keyboard.press('Escape');await expect(style).toBeHidden();

  // ---- Move A through the existing writer: forecast and stage history follow ----
  await board.locator(`[data-lead-board-move="${leadA}"]`).selectOption('estimate_sent');
  await expect(board.locator('[data-lead-board-column="estimate_sent"]').locator(`[data-lead-board-card="${leadA}"]`)).toBeVisible({timeout:60000});
  await expect(board.locator('[data-lead-board-forecast="estimate_sent"]')).toContainText(/2[.,]000[.,]000/,{timeout:60000});
  await expect(board.locator('[data-lead-board-forecast="estimate_sent"]')).toContainText(en?'80%':'80 %');
  await expect(board.locator('[data-lead-board-column="estimate_sent"] [data-lead-board-color]')).toHaveAttribute('data-lead-board-color','red');
  await board.locator(`[data-lead-board-history="${leadA}"]`).click();const hist=page.locator('[data-lead-stage-history]');
  await expect(hist.locator('[data-lead-stage-span]')).toHaveCount(2,{timeout:60000});
  await expect(hist.locator('[data-lead-stage-span]').first()).toHaveAttribute('data-lead-stage-span','estimate_sent');
  await expectNoHorizontalOverflow(page);await shot(page,`f2b-stage-history-${language}`,project);
  await page.keyboard.press('Escape');await expect(hist).toBeHidden();
  const spans=leadStageHistorySchema.parse(await (await page.request.get(api+'?'+new URLSearchParams({view:'lead',kind:'manual',id:leadA}))).json()).spans;
  expect(spans.map(s=>[s.stageId,s.leftAt===null])).toEqual([['new',false],['estimate_sent',true]]);expect(spans[1].source).toBe('moved');
  // B lost: it leaves the forecast (USD disappears).
  expect((await page.request.post('/api/pro/lead-board',{headers,data:{action:'outcome',actionId:crypto.randomUUID(),kind:'manual',id:leadB,revision:0,outcome:'lost',reason:'price',note:''}})).status()).toBe(200);
  const fc=pipelineForecastSchema.parse(await (await page.request.get(api+'?view=forecast')).json());
  expect(fc.totals).toEqual([{currency:'CRC',openCents:250000000,weightedCents:200000000,wonCents:0}]);

  // ---- Funnel by stage reached ----
  await page.locator('[data-stage-funnel-open]').click();const funnel=page.locator('[data-stage-funnel]');
  await expect(funnel.locator('[data-stage-funnel-total="received"]')).toContainText('3',{timeout:60000});
  await expect(funnel.locator('[data-stage-funnel-row="estimate_sent"] [data-stage-funnel-reached]')).toHaveText('1');
  await expect(funnel.locator('[data-stage-funnel-row="new"] [data-stage-funnel-reached]')).toHaveText('3');
  await expect(funnel.locator('[data-stage-funnel-row="estimate_sent"]')).toContainText(en?'33.3%':'33,3 %');
  await expect(funnel.locator('[data-stage-funnel-total="lost"]')).toContainText('1');
  await expectNoHorizontalOverflow(page);await shot(page,`f2b-funnel-${language}`,project);
  const report=stageFunnelSchema.parse(await (await page.request.get(api+'?'+new URLSearchParams({view:'funnel',from:today,to:today,channel:'referral'}))).json());
  expect(report.received).toBe(1);expect(report.stages.find(s=>s.stageId==='estimate_sent')!.fromStart).toBe(100);
  const csv=await page.request.get(api+'?'+new URLSearchParams({view:'funnel',from:today,to:today,format:'csv',lang:language,names:JSON.stringify({new:tr('Nueva','New')})}));expect(csv.status()).toBe(200);
  const lines=(await csv.text()).replace(/^﻿/,'').split('\r\n');
  expect(lines[0]).toBe(tr('"Etapa";"Llegaron";"% desde el inicio";"% desde la etapa anterior";"Ahora en la etapa";"Tiempo promedio (días)";"Tiempo mediano (días)"','"Stage";"Reached";"% from start";"% from previous stage";"Currently in stage";"Average time (days)";"Median time (days)"'));
  expect(lines[1]).toMatch(new RegExp('^"'+tr('Nueva','New')+'";"3";"100";'));
  await page.keyboard.press('Escape');

  // ---- Role gate: Read-only reads, cannot change stages ----
  const c=await browser.newContext({baseURL:origin,viewport:info.project.use.viewport??undefined,isMobile:info.project.use.isMobile,hasTouch:info.project.use.hasTouch,userAgent:info.project.use.userAgent});contexts.push(c);
  const account=await createDisposableAccount({prefix:'f2b-ro'});members.push(account);await login(c,account);const code=newCompanyInviteCode();
  const team=(ctx:BrowserContext,data:Record<string,unknown>)=>ctx.request.post(origin+'/api/pro/team-roles',{headers:{Origin:origin},data,timeout:120000});
  expect((await team(page.context(),{action:'invite',actionId:crypto.randomUUID(),email:account.email,role:'read_only',code,locale:'es'})).status()).toBe(200);
  expect((await team(c,{action:'accept',actionId:crypto.randomUUID(),code})).status()).toBe(200);expect((await team(c,{action:'enter',ownerId:owner})).status()).toBe(200);
  expect((await c.request.get(origin+api+'?view=settings',{timeout:120000})).status()).toBe(200);
  const denied=await c.request.post(origin+api,{headers:{Origin:origin},data:{action:'style',actionId:crypto.randomUUID(),revision:1,stageId:'won',color:'green',probability:90}});
  expect(denied.status()).toBe(403);expect((await denied.json()).code).toBe('pro_role');
  expect(runtime).toEqual([]);
 }finally{for(const c of contexts)await c.close().catch(()=>{});for(const m of members)await cleanupDisposableAccount(m).catch(()=>{});await f.cleanup();}
});

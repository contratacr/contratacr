import {test,expect,type BrowserContext} from 'playwright/test';
import {randomBytes} from 'node:crypto';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {gotoOK,expectNoHorizontalOverflow,warmLocalRoutes} from './helpers';
import {ownerFixture,local,origin,login} from './pro-round2-fixture';
import {createDisposableAccount,cleanupDisposableAccount,type DisposableAccount} from './disposable-account';
import {newCompanyInviteCode} from '../../src/lib/pro/team-roles';

// Closing round (2026-11-16), security review of rounds 13–14:
//  M1  /api/pro/accounting-export (customers with ID numbers, invoices, payments) → 403 for Member / Read-only.
//  M2  internal cost and margin: work-costs, work-budget, purchase-orders and their print → 403; work-overview
//      (finance), time-report (also its CSV), time-tracking → costs as null; private estimates without unitCostCents.
//      The owner, Administrator and Manager are unaffected. The UI shows why instead of an error.
//  B3  a person working in another company's space cannot decide quote lines «as the customer».
//  B4  the new heavy-read limits are keyed by account, not by a client IP header.
// Disposable accounts, loopback only; nothing is sent, charged or issued.
const shots=process.env.FIX14_SHOTS_DIR?join(process.env.FIX14_SHOTS_DIR,'..','close-shots'):null;
const label=()=>'cs'+randomBytes(3).toString('hex');
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Costa_Rica'}).format(new Date()),monthStart=today.slice(0,8)+'01';

test('Closing round: internal costs, accounting export and line decisions by company role',async({page,browser},info)=>{
 test.setTimeout(900000);local(info.project.use.baseURL);const id=label();
 const f=await ownerFixture(page.context(),id);const contexts:BrowserContext[]=[];const members:DisposableAccount[]=[];
 try{
  const owner=f.owner.id,headers={Origin:origin,'X-Pro-Expected-Actor':owner};
  const q=(params:Record<string,string>)=>new URLSearchParams(params).toString();
  const work=q({workId:f.workId});
  const denied=['/api/pro/accounting-export?'+q({kind:'customers',format:'cr'}),'/api/pro/accounting-export?'+q({kind:'invoices',format:'standard'}),
   '/api/pro/work-costs?'+q({clientId:f.clientId,workId:f.workId}),'/api/pro/work-budget?'+q({view:'overview',workId:f.workId}),
   '/api/pro/purchase-orders?'+work,'/api/pro/purchase-order-print?'+q({workId:f.workId,id:crypto.randomUUID()})];
  await warmLocalRoutes(page,[denied[0],denied[2],denied[3],denied[4],'/api/pro/work-overview?'+q({workId:f.workId,part:'finance'}),'/api/pro/time-report?'+q({from:monthStart,to:today}),'/api/pro/time-tracking?'+q({workId:f.workId,from:monthStart,to:today}),'/api/pro/quote-line-decisions?'+q({publicationId:crypto.randomUUID()})]);
  // An estimate of the job with an internal unit cost on its line.
  const ctx=await page.request.get('/api/pro/private-estimates?'+q({view:'context',clientId:f.clientId}),{headers:{'X-Pro-Expected-Actor':owner}});expect(ctx.status()).toBe(200);
  const context=await ctx.json(),estimateId=crypto.randomUUID();
  const save=await page.request.post('/api/pro/private-estimates',{headers,data:{action:'save',actionId:crypto.randomUUID(),estimateId,revision:0,clientId:f.clientId,refreshClient:false,clientFingerprint:context.clientFingerprint,source:null,issuer:{...context.issuer,issuerName:context.issuer.issuerName||'Remodelaciones '+id},title:'Cocina cierre',notes:'',currency:'CRC',validUntil:null,lines:[{id:crypto.randomUUID(),description:'Gabinetes',unit:'u',qtyMilli:1000,unitPriceCents:100000,unitCostCents:60000,discountBps:0,taxBps:1300,catalogProductId:null}]}});
  expect(save.status(),await save.text()).toBe(200);
  const detailPath='/api/pro/private-estimates?'+q({view:'detail',estimateId});
  // The owner reads everything.
  const ownerDetail=await (await page.request.get(detailPath,{headers:{'X-Pro-Expected-Actor':owner}})).json();expect(ownerDetail.estimate.lines[0].unitCostCents).toBe(60000);
  const ownerFinance=await (await page.request.get('/api/pro/work-overview?'+q({workId:f.workId,part:'finance'}))).json();expect(typeof ownerFinance.costCents).toBe('number');expect(ownerFinance.costsHidden).toBeUndefined();
  for(const path of denied.slice(0,5))expect((await page.request.get(path,{headers:{'X-Pro-Expected-Actor':owner}})).status(),path).toBe(200);

  // Company people: Read-only, Member and Manager.
  const team=(c:BrowserContext,data:Record<string,unknown>)=>c.request.post(origin+'/api/pro/team-roles',{headers:{Origin:origin},data,timeout:120000});
  const join_=async(role:'read_only'|'member'|'manager')=>{
   const c=await browser.newContext({baseURL:origin,viewport:info.project.use.viewport??undefined,isMobile:info.project.use.isMobile,hasTouch:info.project.use.hasTouch,userAgent:info.project.use.userAgent});contexts.push(c);
   const account=await createDisposableAccount({prefix:'cs-'+role.replace('_','')});members.push(account);await login(c,account);const code=newCompanyInviteCode();
   expect((await team(page.context(),{action:'invite',actionId:crypto.randomUUID(),email:account.email,role,code,locale:'es'})).status()).toBe(200);
   expect((await team(c,{action:'accept',actionId:crypto.randomUUID(),code})).status()).toBe(200);
   expect((await team(c,{action:'enter',ownerId:owner})).status()).toBe(200);
   return c;
  };
  const readOnly=await join_('read_only'),member=await join_('member'),manager=await join_('manager');
  for(const [name,c] of [['read_only',readOnly],['member',member]] as const){
   for(const path of denied){const r=await c.request.get(origin+path,{timeout:120000});expect(r.status(),name+' '+path+' '+(await r.text()).slice(0,200)).toBe(403);if(!path.startsWith('/api/pro/purchase-order-print'))expect((await r.json()).code,path).toBe('pro_role');}
   const finance=await (await c.request.get(origin+'/api/pro/work-overview?'+q({workId:f.workId,part:'finance'}))).json();
   expect(finance,name).toMatchObject({costCents:null,committedCents:null,resultCents:null,resultWithCommittedCents:null,costsHidden:true});expect(finance.paidCents).toBe(0);
   const report=await (await c.request.get(origin+'/api/pro/time-report?'+q({from:monthStart,to:today}))).json();expect(report.totals.costCents,name).toBeNull();expect(report.costsHidden).toBe(true);
   const csv=await (await c.request.get(origin+'/api/pro/time-report?'+q({from:monthStart,to:today,format:'csv'}))).text();expect(csv).not.toContain('Costo (CRC)');expect(csv).toContain('Monto facturable (CRC)');
   const hours=await (await c.request.get(origin+'/api/pro/time-tracking?'+q({workId:f.workId,from:monthStart,to:today}))).json();expect(hours.totals.costCents,name).toBeNull();expect(hours.costsHidden).toBe(true);expect(hours.activities.every((a:{costCents:number|null})=>a.costCents===null)).toBe(true);
   const detail=await (await c.request.get(origin+detailPath)).json();expect(detail.estimate.lines[0],name).not.toHaveProperty('unitCostCents');expect(detail.estimate.lines[0].unitPriceCents).toBe(100000);
   const list=await (await c.request.get(origin+'/api/pro/private-estimates?'+q({view:'list',status:'draft'}))).text();expect(list,name).not.toContain('unitCostCents');
  }
  // A Member records hours but cannot overwrite the internal cost per hour of an activity.
  const activity=await member.request.post(origin+'/api/pro/time-tracking',{headers:{Origin:origin},data:{action:'activity_save',actionId:crypto.randomUUID(),activityId:crypto.randomUUID(),revision:0,name:'Pintura',rateCents:500000,costCents:null,billable:true}});
  expect(activity.status(),await activity.text()).toBe(403);
  // The Manager is unaffected.
  for(const path of denied.slice(0,5))expect((await manager.request.get(origin+path,{timeout:120000})).status(),'manager '+path).toBe(200);
  const managerDetail=await (await manager.request.get(origin+detailPath)).json();expect(managerDetail.estimate.lines[0].unitCostCents).toBe(60000);
  const managerFinance=await (await manager.request.get(origin+'/api/pro/work-overview?'+q({workId:f.workId,part:'finance'}))).json();expect(typeof managerFinance.costCents).toBe('number');
  // B3: inside the owner's company, a Manager cannot answer quote lines «as the customer».
  const decide=await manager.request.post(origin+'/api/pro/quote-line-decisions',{headers:{Origin:origin},data:{actionId:crypto.randomUUID(),publicationId:crypto.randomUUID(),lineId:crypto.randomUUID(),decision:'approved',note:'',revision:0}});
  expect(decide.status(),await decide.text()).toBe(403);expect((await decide.json()).code).toBe('pro_workspace_member');

  // UI: the Read-only person sees why, not an error or ₡0 (job costs and overview).
  const view=await readOnly.newPage();
  await gotoOK(view,`/es/dashboard/pro/trabajo/${encodeURIComponent(f.workId)}/costs`);
  await expect(view.locator('[data-pro-cost-denied]').first()).toContainText('Su rol en esta empresa no permite ver costos internos',{timeout:90000});
  await expect(view.getByText('No se pudieron cargar los costos del trabajo.',{exact:true})).toHaveCount(0);
  await expectNoHorizontalOverflow(view);if(shots){mkdirSync(shots,{recursive:true});await view.screenshot({path:join(shots,`costs-read-only-${info.project.name}.png`),fullPage:true});}
  await gotoOK(view,`/en/dashboard/pro/trabajo/${encodeURIComponent(f.workId)}`);
  await expect(view.locator('[data-work-overview-costs-hidden]')).toContainText('Your role in this company does not allow viewing costs',{timeout:90000});
  await expect(view.locator('[data-work-overview-costs]')).toHaveCount(0);
  if(shots)await view.screenshot({path:join(shots,`overview-read-only-${info.project.name}.png`),fullPage:true});
  await view.close();

  // B4: the accounting export limit (10 per minute) is per account; another X-Forwarded-For does not reset it.
  const statuses:number[]=[];
  for(let n=0;n<12;n++)statuses.push((await page.request.get(denied[0],{headers:{'X-Pro-Expected-Actor':owner,'X-Forwarded-For':'203.0.113.'+(n+1),'CF-Connecting-IP':'203.0.113.'+(n+1)}})).status());
  expect(statuses.filter(s=>s===429).length,statuses.join(',')).toBeGreaterThan(0);
 }finally{for(const c of contexts)await c.close();for(const m of members)await cleanupDisposableAccount(m);await f.cleanup();}
});

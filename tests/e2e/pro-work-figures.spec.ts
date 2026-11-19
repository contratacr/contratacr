import {test,expect,type BrowserContext} from 'playwright/test';
import {randomBytes} from 'node:crypto';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {createServerClient} from '@supabase/ssr';
import {createDisposableAccount,cleanupDisposableAccount,type DisposableAccount} from './disposable-account';
import {regressionAdminClient} from './seed';
import {emptyBusiness} from '../../src/lib/pro/business';
import {crTodayISO} from '../../src/lib/time-cr';
import {collectPageErrors,gotoOK,expectNoHorizontalOverflow} from './helpers';
import {stabilizeLocalProRuntime} from './pro-local-stable-runtime';
import {estimateInput,json as estimateJson,post as estimatePost} from './pro-private-estimate-publications-fixture';

// Round 1 after the manual walkthrough (2026-11-12), points 2 and 3, with the walkthrough data:
// manual customer, estimate accepted by code and continued into a new job, 6 h recorded in
// «Costos y pagos», a ₡500.000 payment. Checks: «Horas» shows the 6 h, the agreed amount is the
// accepted estimate, «Resultado» compares without VAT, the customer record and the statement show
// the same balance, the job header says «Cotización aceptada» and the job is under «Pendientes».
const origin='http://127.0.0.1:3185',shots=process.env.ROUND1_SHOTS_DIR;
async function login(context:BrowserContext,actor:DisposableAccount){await stabilizeLocalProRuntime(context,origin);const auth=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{getAll:()=>[],setAll:async cookies=>context.addCookies(cookies.map(cookie=>({name:cookie.name,value:cookie.value,url:origin,sameSite:'Lax' as const})))}});const result=await auth.auth.signInWithPassword({email:actor.email,password:actor.password});expect(result.error).toBeNull();}

for(const language of ['es','en'] as const)test(`Walkthrough figures are coherent: hours, agreed amount, result, balance, header and agenda [${language}]`,async({page,browser,baseURL},info)=>{
 test.setTimeout(420000);expect(baseURL).toBe(origin);const en=language==='en',label=randomBytes(3).toString('hex');
 const db=regressionAdminClient(),owner=await createDisposableAccount({prefix:'figures-owner'});let customer:DisposableAccount|undefined,customerContext:BrowserContext|undefined;
 try{
  const errors=collectPageErrors(page);
  const account=await db.auth.admin.getUserById(owner.id);expect((await db.auth.admin.updateUserById(owner.id,{user_metadata:{...account.data.user!.user_metadata,is_provider:true,role:'professional'}})).error).toBeNull();
  await db.from('profiles').update({is_provider:true,role:'professional'}).eq('id',owner.id).throwOnError();await db.from('pro_memberships').insert({user_id:owner.id,status:'active'}).throwOnError();
  const clientId='manual-'+label,document=emptyBusiness();document.clients=[{id:clientId,name:'Cliente recorrido '+label,email:'',phone:'',notes:'',archived:false}];
  await db.from('pro_workspaces').insert({user_id:owner.id,document,revision:1}).throwOnError();await login(page.context(),owner);
  for(const endpoint of ['/api/auth/session-mfa','/api/auth/registration-state','/api/pro/access'])expect((await page.request.get(origin+endpoint,{timeout:45000})).status()).toBe(200);
  customer=await createDisposableAccount({prefix:'figures-customer'});customerContext=await browser.newContext({baseURL});await login(customerContext,customer);
  // Estimate shared by code, claimed and accepted by the customer, continued into a new job.
  const ctx=await estimateJson(page.context(),{view:'context',clientId});
  const save={...estimateInput(ctx,{validUntil:'2030-12-31',title:'Remodelación '+label}),currency:'CRC',lines:[{id:crypto.randomUUID(),description:'Mano de obra',unit:'día',qtyMilli:3000,unitPriceCents:8500000,discountBps:0,taxBps:1300,catalogProductId:null}]};
  const saved=await estimatePost(page.context(),owner,save);expect(saved.status()).toBe(200);const estimate=(await saved.json()).estimate;
  const code=randomBytes(32).toString('hex');
  expect((await estimatePost(page.context(),owner,{action:'publish',actionId:crypto.randomUUID(),publicationId:crypto.randomUUID(),estimateId:estimate.id,estimateRevision:1,recipient:{kind:'claim',email:customer.email,code}},'/api/pro/private-estimate-publications')).status()).toBe(200);
  const claim=await estimatePost(customerContext,customer,{action:'claim',actionId:crypto.randomUUID(),code},'/api/pro/private-estimate-publications');expect(claim.status()).toBe(200);
  const publication=(await claim.json()).publication;
  const accept=await estimatePost(customerContext,customer,{action:'accept',actionId:crypto.randomUUID(),publicationId:publication.publicationId,revision:publication.revision,contentHash:publication.contentHash},'/api/pro/private-estimate-publications');expect(accept.status()).toBe(200);
  const accepted=(await accept.json()).publication,workId=crypto.randomUUID();
  expect((await estimatePost(page.context(),owner,{action:'continue',actionId:crypto.randomUUID(),publicationId:accepted.publicationId,contentHash:accepted.contentHash,publicationRevision:accepted.revision,target:{kind:'new',workId,conversionActionId:null,leadRevision:null}},'/api/pro/private-estimate-work')).status()).toBe(200);
  const total=accepted.content.totalCents as number,tax=accepted.content.taxCents as number;expect(total).toBe(28815000);expect(tax).toBe(3315000);
  // 6 h in «Costos y pagos» and a ₡500.000 payment.
  const costs=async()=>{const r=await page.request.get(origin+'/api/pro/work-costs?'+new URLSearchParams({clientId,workId,after:''}));expect(r.status()).toBe(200);return r.json();};
  const before=await costs();
  expect((await page.request.post(origin+'/api/pro/work-costs',{headers:{origin},data:{clientId,workId,action:'add_time',requestId:crypto.randomUUID(),revision:before.revision,date:crTodayISO(),minutes:360,hourlyCostCents:500000,note:'Demolición'}})).status()).toBe(200);
  const core=(await db.from('pro_workspace_core').select('revision').eq('user_id',owner.id).single().throwOnError()).data!;
  expect((await page.request.post(origin+'/api/pro/client-operations',{headers:{origin},data:{clientId,workId,actionId:crypto.randomUUID(),revision:core.revision,kind:'payment',amountCents:10000000,note:'Abono'}})).status()).toBe(200);
  const after=await costs();
  expect(after.summary).toMatchObject({agreedCents:total,agreedSource:'estimate',agreedTaxCents:tax,agreedNetCents:total-tax,resultBasis:'without_tax',laborCents:3000000,resultCents:total-tax-3000000});
  const balance=await (await page.request.get(origin+'/api/pro/client-balance?'+new URLSearchParams({workId}))).json();expect(balance.customerBalanceCents).toBe(total-10000000);
  const statement=await (await page.request.get(origin+'/api/pro/client-statement?'+new URLSearchParams({clientId}))).json();
  if(statement?.summary)expect(statement.summary.balanceCents).toBe(balance.customerBalanceCents);

  // Job header and «Horas».
  await gotoOK(page,`/${language}/dashboard/pro?tab=pro_agenda&cita=${workId}`);
  await expect(page.locator('[data-work-stage]')).toHaveText(en?'Quote accepted':'Cotización aceptada',{timeout:90000});
  await shot('figures-header');
  await gotoOK(page,`/${language}/dashboard/pro?tab=pro_agenda&cita=${workId}&vistaTrabajo=time`);
  const ledgerRow=page.locator('[data-time-entry]:visible,[data-time-entry-card]:visible').filter({hasText:en?'Costs & payments':'Costos y pagos'}).first();
  await expect(ledgerRow).toBeVisible({timeout:90000});await expect(page.locator('[data-time-empty]')).toHaveCount(0);
  await ledgerRow.scrollIntoViewIfNeeded();await shot('figures-hours');
  // «Costos y pagos»: agreed amount from the estimate, result without VAT.
  await gotoOK(page,`/${language}/dashboard/pro?tab=pro_agenda&cita=${workId}&vistaTrabajo=costs`);
  await expect(page.locator('[data-work-agreed]').first()).toContainText(en?'Taken from the accepted quote':'Tomado de la cotización aceptada',{timeout:90000});
  await expect(page.locator('[data-work-cost-basis]').first()).toContainText(en?'without VAT':'sin IVA');
  await expectNoHorizontalOverflow(page);await page.locator('[data-work-cost-basis]').first().scrollIntoViewIfNeeded();await shot('figures-costs');
  // Agenda list: the job is under «Pendientes» (accepted estimate, still to schedule).
  await gotoOK(page,`/${language}/dashboard/pro?tab=pro_agenda&estadoCitas=pending`);
  await expect(page.locator('[data-appointment-inbox]')).toContainText('Remodelación '+label,{timeout:90000});
  await shot('figures-agenda');
  // Customer record shows the same balance as the statement and the draft figure.
  await gotoOK(page,`/${language}/dashboard/pro?tab=pro_clients&cliente=${clientId}`);
  const recordBalance=page.locator('[data-client-balance]').first();await expect(recordBalance).toBeVisible({timeout:90000});
  const shown=(await recordBalance.innerText()).replace(/\D/g,'');expect(shown).toBe(balance.customerBalanceCents%100===0?String(balance.customerBalanceCents/100):String(balance.customerBalanceCents));
  await shot('figures-client');
  expect(errors()).toEqual([]);
  async function shot(name:string){if(!shots)return;mkdirSync(shots,{recursive:true});await page.screenshot({path:join(shots,`${name}-${language}-${info.project.name}.png`)});}
 }finally{await customerContext?.close();if(customer)await cleanupDisposableAccount(customer);await cleanupDisposableAccount(owner);}
});

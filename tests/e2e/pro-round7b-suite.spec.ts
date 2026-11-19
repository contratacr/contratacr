import {test,expect,type Page} from 'playwright/test';
import {randomBytes} from 'node:crypto';
import {mkdirSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {collectPageErrors,gotoOK,expectNoHorizontalOverflow,warmLocalRoutes} from './helpers';
import {ownerFixture,local,headersFor,origin,isMobile} from './pro-round2-fixture';
import {proReportSchema,proCsv} from '../../src/lib/pro/reports';
import {proMoney} from '../../src/lib/pro/money';

// Round 7B (2026-11-13), walkthrough 2 follow-up: reports (financial/jobs + CSV), Team inside the Pro
// shell, one invoice draft editor per address, change orders with quantity × cost + markup and
// schedule impact, an explicit /es winning over the English cookie, and the next tasks of a job
// showing their planned period. Disposable owner, loopback only; nothing is sent, charged or issued.
const shots=process.env.ROUND7B_SHOTS_DIR;
async function shot(page:Page,name:string,project:string,fullPage=false){if(!shots)return;mkdirSync(shots,{recursive:true});await page.screenshot({path:join(shots,`${name}-${project}.png`),fullPage});}
const label=(language:string)=>language+randomBytes(3).toString('hex');
/** Opens a Pro address; a cold dev compile can exceed the access probe's own 8 s limit, which shows
 * «Could not verify Pro access» with Retry (existing behavior) — retry once, as a user would. */
async function openPro(page:Page,path:string,en:boolean){
 await gotoOK(page,path);
 const failed=page.getByText(en?'Could not verify Pro access. Your data is preserved.':'No se pudo comprobar el acceso a Pro. Sus datos se conservan.');
 const ready=page.locator('[data-independent-pro]');
 await expect(failed.or(ready).first()).toBeVisible({timeout:90000});
 if(await failed.isVisible())await page.getByRole('button',{name:en?'Retry':'Reintentar',exact:true}).click();
 await expect(ready.first()).toBeVisible({timeout:90000});
}

for(const language of ['es','en'] as const)test(`Round 7B: reports, team shell, invoice editor, change orders [${language}]`,async({page},info)=>{
 test.setTimeout(600000);local(info.project.use.baseURL);const en=language==='en',id=label(language),project=info.project.name,tr=(es:string,english:string)=>en?english:es;
 const f=await ownerFixture(page.context(),id);
 try{
  await warmLocalRoutes(page,[`/${language}/dashboard/pro`,`/${language}/dashboard/pro/equipo`,'/api/pro/access','/api/pro/reports','/api/pro/team?view=shared','/api/pro/work-changes?workId='+f.workId,'/api/pro/invoice-drafts?kind=work&sourceId='+f.workId]);
  const errors=collectPageErrors(page);
  // Agreement of ₡100.000 through the real writer (as «Importe acordado» does).
  const revision=(await f.db.from('pro_workspace_core').select('revision').eq('user_id',f.owner.id).single().throwOnError()).data!.revision as number;
  const agreed=await f.db.rpc('pro_record_client_operation',{p_user:f.owner.id,p_input:{actionId:crypto.randomUUID(),clientId:f.clientId,workId:f.workId,kind:'agreement',amountCents:10000000,note:'Acuerdo R7B'},p_revision:revision});
  expect(agreed.error,JSON.stringify(agreed.error)).toBeNull();

  // (1) Reports API: owner only, strict answer, the job uses the job formula.
  const report=await page.request.get(origin+'/api/pro/reports',{headers:headersFor(f.owner)});expect(report.status(),await report.text()).toBe(200);
  const body=proReportSchema.parse(await report.json());
  expect(body.jobs.find(job=>job.workId===f.workId)?.agreedCents).toBe(10000000);
  expect((await page.request.get(origin+'/api/pro/reports?from=2030-01-02&to=2030-01-01',{headers:headersFor(f.owner)})).status()).toBe(400);
  expect((await page.request.get(origin+'/api/pro/reports',{headers:{Origin:origin,'X-Pro-Expected-Actor':crypto.randomUUID()}})).status()).toBe(403);

  // Reports UI in Statistics + CSV export (formula-safe, BOM, plain decimals).
  await openPro(page,`/${language}/dashboard/pro?tab=statistics`,en);
  const reports=page.locator('[data-pro-reports]');await expect(reports).toBeVisible({timeout:90000});
  await expect(reports.locator('[data-pro-report-invoiced]')).toContainText(proMoney(0,en),{timeout:60000});
  await expect(reports.locator('[data-pro-report-profitability]')).toContainText('Remodelación de cocina '+id);
  await expectNoHorizontalOverflow(page);await reports.scrollIntoViewIfNeeded();await shot(page,`r7b-reports-financial-${language}`,project);
  await reports.locator('[data-pro-report-tab="jobs"]').click();await expect(reports.locator('[data-pro-report-jobs]')).toContainText(proMoney(100000,en));
  await shot(page,`r7b-reports-jobs-${language}`,project);
  const [download]=await Promise.all([page.waitForEvent('download'),reports.locator('[data-pro-report-export]').click()]);
  expect(download.suggestedFilename()).toMatch(/^reporte-trabajos-\d{4}-\d{2}-\d{2}\.csv$/);
  const csv=readFileSync(await download.path(),'utf8');expect(csv.charCodeAt(0)).toBe(0xfeff);expect(csv).toContain(tr('Trabajo,Cliente,Etapa','Job,Customer,Stage'));expect(csv).toContain('100000.00');
  expect(proCsv([['=1+1','a,b']])).toBe("﻿'=1+1,\"a,b\"\r\n");

  // (2) Hub → Statistics → Team: Team stays inside the Pro shell (header + side menu).
  await openPro(page,`/${language}/dashboard/pro`,en);await expect(page.locator('[data-pro-tools]')).toBeVisible({timeout:90000});
  await page.locator('[data-pro-tools]').getByRole('button',{name:tr('Estadísticas','Statistics'),exact:true}).click();
  await expect(page.locator('[data-pro-reports]')).toBeVisible({timeout:90000});await expect(page.locator('[data-pro-transition]')).toHaveCount(0,{timeout:45000});
  await gotoOK(page,`/${language}/dashboard/pro/equipo`);
  await expect(page.locator('[data-pro-team-shell]')).toBeVisible({timeout:90000});await expect(page.locator('[data-team-space]')).toBeVisible({timeout:60000});
  if(!isMobile(page)){const nav=page.getByRole('navigation',{name:tr('Navegación del negocio','Business navigation'),exact:true});await expect(nav).toBeVisible();await expect(nav.locator('[data-pro-hub-entry="team"]')).toHaveAttribute('aria-current','page');
   await shot(page,`r7b-team-shell-${language}`,project);
   await nav.locator('[data-pro-hub-entry="statistics"]').click();await expect(page).toHaveURL(/\/dashboard\/pro\?tab=statistics/,{timeout:90000});await expect(page.locator('[data-pro-reports]')).toBeVisible({timeout:90000});}
  else await shot(page,`r7b-team-shell-${language}`,project);

  // (3) One invoice draft editor per address, also after a reload (bug 6).
  const invoicePath=`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_agenda',cita:f.workId,factura:'nueva',facturaOrigen:'work:'+f.workId});
  await openPro(page,invoicePath,en);
  const drafts=page.getByRole('dialog',{name:tr('Borrador de factura','Invoice draft'),exact:true});
  await expect(drafts.first()).toBeVisible({timeout:90000});await expect(page.getByText(tr('Preparando datos…','Preparing details…'))).toHaveCount(0,{timeout:60000});
  await expect(drafts).toHaveCount(1);
  await page.reload();await expect(drafts.first()).toBeVisible({timeout:90000});await page.waitForTimeout(1500);await expect(drafts).toHaveCount(1);
  await shot(page,`r7b-invoice-single-${language}`,project);
  await drafts.getByRole('button',{name:tr('Cerrar','Close'),exact:true}).first().click();await expect(drafts).toHaveCount(0);
  await expect(page).not.toHaveURL(/facturaOrigen=/);

  // (4) Change order: quantity × cost + markup and schedule impact (days), via the real route.
  const changeId=crypto.randomUUID();
  const proposed=await page.request.post(origin+'/api/pro/work-changes',{headers:{...headersFor(f.owner),'Content-Type':'application/json'},data:{action:'propose',id:changeId,actionId:crypto.randomUUID(),workId:f.workId,baseCents:10000000,reason:'Muro adicional '+id,lines:[{description:'Bloques',amountCents:23000,qtyMilli:2000,unitCostCents:10000,markupBps:1500}],scheduleDays:4}});
  expect(proposed.status(),await proposed.text()).toBe(200);
  const wrong=await page.request.post(origin+'/api/pro/work-changes',{headers:{...headersFor(f.owner),'Content-Type':'application/json'},data:{action:'propose',id:crypto.randomUUID(),actionId:crypto.randomUUID(),workId:f.workId,baseCents:10000000,reason:'Incorrecto',lines:[{description:'Bloques',amountCents:23001,qtyMilli:2000,unitCostCents:10000,markupBps:1500}]}});
  expect(wrong.status()).toBe(400);
  const listed=await page.request.get(origin+'/api/pro/work-changes?'+new URLSearchParams({workId:f.workId}),{headers:headersFor(f.owner)});expect(listed.status()).toBe(200);
  const item=((await listed.json()).items as Array<{id:string;scheduleDays:number;scheduleApplied:boolean;lines:Array<{qtyMilli?:number}>}>).find(row=>row.id===changeId)!;
  expect(item.scheduleDays).toBe(4);expect(item.scheduleApplied).toBe(false);expect(item.lines[0].qtyMilli).toBe(2000);
  await openPro(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_agenda',cita:f.workId,vistaTrabajo:'changes'}),en);
  const changes=page.locator('[data-work-changes]').first();await expect(changes).toContainText('Muro adicional '+id,{timeout:90000});
  await expect(changes.locator('[data-work-change-line-calc]').first()).toContainText('2 × '+proMoney(100,en)+' + 15 %');
  await expect(changes.locator('[data-work-change-schedule]').first()).toContainText(en?'+4 days':'+4 días');
  await changes.scrollIntoViewIfNeeded();await shot(page,`r7b-change-order-${language}`,project);
  // The proposal form offers the detail fields and the schedule impact (opened, not saved).
  const withdraw=await page.request.post(origin+'/api/pro/work-changes',{headers:{...headersFor(f.owner),'Content-Type':'application/json'},data:{action:'withdraw',id:changeId,actionId:crypto.randomUUID(),revision:1}});expect(withdraw.status(),await withdraw.text()).toBe(200);
  await page.reload();await expect(changes).toContainText('Muro adicional '+id,{timeout:90000});
  await changes.getByRole('button',{name:tr('Proponer extra o cambio','Propose extra or change'),exact:true}).click();
  const form=page.getByRole('dialog',{name:tr('Proponer extra o cambio','Propose extra or change'),exact:true});await expect(form).toBeVisible({timeout:30000});
  await form.locator('[data-work-change-line-detail] summary').first().click();
  await form.getByLabel(tr('Cantidad','Quantity'),{exact:true}).fill('3');await form.getByLabel(tr('Costo unitario (₡)','Unit cost (₡)'),{exact:true}).fill('1000');await form.getByLabel(tr('Recargo (%)','Markup (%)'),{exact:true}).fill('10');
  await expect(form.getByLabel(tr('Cambio en el importe (₡)','Amount change (₡)'),{exact:true})).toHaveValue('3300');
  await form.locator('[data-work-change-schedule-days]').fill('2');await shot(page,`r7b-change-form-${language}`,project);
  await form.getByRole('button',{name:tr('Cancelar','Cancel'),exact:true}).click();
  const discard=page.getByRole('dialog').filter({hasText:tr('¿Descartar lo escrito?','Discard your changes?')});if(await discard.count())await discard.getByRole('button',{name:tr('Descartar','Discard'),exact:true}).click();

  // (5) An explicit /es in the address wins over the English cookie of the visit.
  if(!en){await page.context().addCookies([{name:'NEXT_LOCALE',value:'en',url:origin}]);await page.goto(origin+'/es/dashboard/pro?tab=statistics',{timeout:90000});await expect(page).not.toHaveURL(/\/en\//);await expect(page.locator('[data-pro-reports]')).toContainText('Reportes',{timeout:90000});}
  expect(errors()).toEqual([]);
 }finally{await f.cleanup();}
});

test('Round 7B: Pro reads have a deadline (unit, no browser)',async()=>{
 // The watchdog wraps window.fetch; a GET /api/pro/* that never settles is retried once and then
 // rejected, so the screen shows its own error + Retry instead of «Loading…» forever. Writes untouched.
 const calls:string[]=[];const g=globalThis as unknown as {window?:unknown};const previous=g.window;
 const fake={location:{href:'http://127.0.0.1:3185/dashboard/pro',origin:'http://127.0.0.1:3185'},fetch:(input:RequestInfo|URL,init?:RequestInit)=>{calls.push((init?.method??'GET')+' '+String(input));return new Promise<Response>((resolve,reject)=>{init?.signal?.addEventListener('abort',()=>reject(init.signal!.reason));if(init?.method==='POST')setTimeout(()=>resolve(new Response('{}')),120);});}} as unknown as Window&typeof globalThis;
 g.window=fake;
 try{
  const {installProFetchWatchdog}=await import('../../src/lib/pro/fetch-watchdog');installProFetchWatchdog(60);
  await expect(fake.fetch('/api/pro/agenda?day=x')).rejects.toMatchObject({name:'TimeoutError'});
  expect(calls).toEqual(['GET /api/pro/agenda?day=x','GET /api/pro/agenda?day=x']);
  await expect(fake.fetch('/api/pro/agenda',{method:'POST',body:'{}'})).resolves.toBeInstanceOf(Response);
  expect(calls.filter(call=>call.startsWith('POST'))).toHaveLength(1);
  const outside=fake.fetch('/api/other');await new Promise(resolve=>setTimeout(resolve,200));expect(calls.filter(call=>call.endsWith('/api/other'))).toHaveLength(1);void outside.catch(()=>undefined);
  const controller=new AbortController();const own=fake.fetch('/api/pro/x',{signal:controller.signal});controller.abort(new DOMException('mine','AbortError'));await expect(own).rejects.toMatchObject({name:'AbortError'});
 }finally{g.window=previous;}
});

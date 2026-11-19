import {test,expect,type Page} from 'playwright/test';
import {randomBytes} from 'node:crypto';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {gotoOK,expectNoHorizontalOverflow,warmLocalRoutes} from './helpers';
import {ownerFixture,local} from './pro-round2-fixture';

// Round 9 (2026-11-15): the job is its own route and document (/dashboard/pro/trabajo/<id>/<section>),
// old ?vistaTrabajo links redirect there, Back/Forward and deep links work; one-line job header and a
// compact grouped section strip on phones. Disposable accounts, loopback only; nothing is sent.
const shots=process.env.ROUND9_SHOTS_DIR;
async function shot(page:Page,name:string,project:string,fullPage=false){if(!shots)return;mkdirSync(shots,{recursive:true});await page.screenshot({path:join(shots,`${name}-${project}.png`),fullPage});}
const label=(language:string)=>language+randomBytes(3).toString('hex');
const jobPath=(path:string)=>new URL(path).pathname.replace(/^\/(?:es|en)(?=\/)/,'');

for(const language of ['es','en'] as const)test(`Round 9: job route, header and section strip [${language}]`,async({page},info)=>{
 test.setTimeout(600000);local(info.project.use.baseURL);const en=language==='en',id=label(language),project=info.project.name,tr=(es:string,english:string)=>en?english:es;
 const f=await ownerFixture(page.context(),id);
 try{
  const prefix=en?'/en':'',job=encodeURIComponent(f.workId),service='Remodelación de cocina '+id;
  await warmLocalRoutes(page,['/api/pro/work-sidebar?workId='+f.workId,'/api/pro/work-header?workId='+f.workId]);
  // (1) An old query link redirects to the job route (server redirect, section kept).
  await gotoOK(page,`/${language}/dashboard/pro?tab=pro_agenda&cita=${job}&vistaTrabajo=tasks`);
  await expect(page).toHaveURL(new RegExp(`/dashboard/pro/trabajo/${job}/tasks$`),{timeout:90000});
  const route=page.locator('[data-job-route]');await expect(route).toBeVisible({timeout:90000});
  // A page, not a dialog: its own heading, no dialog around the job, no Pro section list underneath.
  await expect(page.getByRole('heading',{level:1,name:service,exact:true})).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('heading',{level:1,name:tr('Citas','Appointments'),exact:true})).toHaveCount(0);
  const nav=page.getByRole('navigation',{name:tr('Gestión del trabajo','Job workspace'),exact:true});
  await expect(nav.getByRole('button',{name:tr('Tareas','Tasks'),exact:true})).toHaveAttribute('aria-current','page');
  // (2) One header line: customer · phase · dates.
  const line=route.locator('[data-job-header-line]');await expect(line).toContainText('Cliente ronda '+id);await expect(line.locator('[data-work-stage]')).toBeVisible();await expect(line.locator('[data-work-period]')).toContainText(tr('Sin programar','Not scheduled'));
  const lineBox=await line.boundingBox();expect(lineBox!.height).toBeLessThan(80);
  // (3) Section change is a history step on the same document; Back/Forward work.
  const marker=await page.evaluate(()=>{(window as unknown as {r9doc:number}).r9doc=Math.random();return (window as unknown as {r9doc:number}).r9doc;});
  await nav.getByRole('button',{name:tr('Archivos','Files'),exact:true}).click();
  await expect(page).toHaveURL(new RegExp(`/dashboard/pro/trabajo/${job}/files$`));
  await expect(page.locator('[data-work-file-organizer]')).toBeVisible({timeout:60000});
  await nav.getByRole('button',{name:tr('Resumen','Overview'),exact:true}).click();
  await expect(page).toHaveURL(new RegExp(`/dashboard/pro/trabajo/${job}$`));
  await expect(page.locator('[data-work-sidebar]')).toBeVisible({timeout:60000});
  expect(await page.evaluate(()=>(window as unknown as {r9doc:number}).r9doc)).toBe(marker);
  await page.goBack();await expect(page).toHaveURL(new RegExp(`/trabajo/${job}/files$`),{timeout:30000});await expect(nav.getByRole('button',{name:tr('Archivos','Files'),exact:true})).toHaveAttribute('aria-current','page');
  await page.goBack();await expect(page).toHaveURL(new RegExp(`/trabajo/${job}/tasks$`),{timeout:30000});await expect(nav.getByRole('button',{name:tr('Tareas','Tasks'),exact:true})).toHaveAttribute('aria-current','page');
  await page.goForward();await expect(page).toHaveURL(new RegExp(`/trabajo/${job}/files$`),{timeout:30000});
  expect(await page.evaluate(()=>(window as unknown as {r9doc:number}).r9doc)).toBe(marker);
  await expectNoHorizontalOverflow(page);await shot(page,`r9-job-route-files-${language}`,project);
  // (4) Phones: the 20 sections are one compact strip (not the whole first screen).
  const navBox=await nav.boundingBox(),viewport=page.viewportSize()!;
  if(viewport.width<1024){expect(navBox!.height).toBeLessThan(90);await nav.getByRole('button',{name:tr('Extras y cambios','Changes'),exact:true}).click();await expect(page).toHaveURL(new RegExp(`/trabajo/${job}/changes$`));}
  // (5) Deep link + reload keep the section; the back arrow leaves the job (a new document), browser Back returns.
  await gotoOK(page,`${prefix}/dashboard/pro/trabajo/${job}/schedule`);await expect(route).toBeVisible({timeout:90000});
  await expect(nav.getByRole('button',{name:tr('Cronograma','Schedule'),exact:true})).toHaveAttribute('aria-current','page');
  await page.reload();await expect(route).toBeVisible({timeout:90000});await expect(page).toHaveURL(new RegExp(`/trabajo/${job}/schedule$`));
  await expect(route.locator('[data-job-header-line]')).toBeVisible({timeout:60000});await shot(page,`r9-job-route-schedule-${language}`,project);
  // WebKit treats a location change before the document finished loading as a replacement; wait for load like a person would.
  await page.waitForLoadState('load');
  await route.getByRole('button',{name:tr('Volver','Back'),exact:true}).first().click();
  await expect(page).toHaveURL(/\/dashboard\/pro\?tab=pro_agenda$/,{timeout:60000});await expect(page.getByRole('heading',{level:1,name:tr('Citas','Appointments'),exact:true})).toBeVisible({timeout:60000});await expect(route).toHaveCount(0);
  await page.goBack();await expect(page).toHaveURL(new RegExp(`/trabajo/${job}/schedule$`),{timeout:60000});await expect(route).toBeVisible({timeout:60000});
  // (6) Opening a job from the jobs list (client navigation) lands on the route, summary first.
  await gotoOK(page,`${prefix}/dashboard/pro?tab=pro_agenda&cita=${job}`);await expect(page).toHaveURL(new RegExp(`/dashboard/pro/trabajo/${job}$`),{timeout:60000});
  expect(jobPath(page.url())).toBe(`/dashboard/pro/trabajo/${job}`);
  // (7) Unknown section → 404; old link keeps other parameters.
  // (the Pro loading boundary streams first, so the not-found page arrives with 200 in dev)
  await page.goto(`${prefix}/dashboard/pro/trabajo/${job}/nope`);await page.waitForLoadState('load');await expect(page.locator('[data-independent-pro]')).toHaveCount(0,{timeout:30000});await expect(route).toHaveCount(0);
  await gotoOK(page,`${prefix}/dashboard/pro?tab=pro_agenda&cita=${job}&vistaTrabajo=tasks&vistaTareas=plan`);await expect(page).toHaveURL(new RegExp(`/trabajo/${job}/tasks\\?vistaTareas=plan$`),{timeout:60000});
  await expect(page.locator('[data-work-task-views] [data-work-plan]')).toBeVisible({timeout:60000});
  await shot(page,`r9-job-route-plan-${language}`,project);
 }finally{await f.cleanup();}
});

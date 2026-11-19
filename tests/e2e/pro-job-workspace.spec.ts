import {test,expect} from 'playwright/test';
import {createServerClient} from '@supabase/ssr';
import {createDisposableAccount,cleanupDisposableAccount} from './disposable-account';
import {regressionAdminClient} from './seed';
import {emptyBusiness} from '../../src/lib/pro/business';
import {clientOperationRecoveryKey} from '../../src/lib/pro/client-operation-recovery';
import {crTodayISO} from '../../src/lib/time-cr';
import {gotoOK,expectNoHorizontalOverflow,onAppPageError} from './helpers';

for(const language of ['es','en'] as const)test(`Job workspace preserves context, edits and data across management panels [${language}]`,async({page,baseURL},info)=>{
 test.setTimeout(180000);
 expect(baseURL).toBe('http://127.0.0.1:3185');
 expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');
 const route=process.env.PRO_INDEPENDENT==='1'?'pro':'profesional';
 const owner=await createDisposableAccount({prefix:'pro-job-workspace'}),db=regressionAdminClient(),en=language==='en';
 try{
  const account=await db.auth.admin.getUserById(owner.id);
  expect((await db.auth.admin.updateUserById(owner.id,{user_metadata:{...account.data.user!.user_metadata,is_provider:true,role:'professional'}})).error).toBeNull();
  await db.from('profiles').update({is_provider:true,role:'professional'}).eq('id',owner.id).throwOnError();
  await db.from('pro_memberships').insert({user_id:owner.id,status:'active'}).throwOnError();
  await db.from('professionals').insert({profile_id:owner.id,category_id:'desarrollo_web',business_name:'Workspace fixture',slug:'workspace-'+owner.id,whatsapp:'',provincia_id:'al',canton_id:'al-at',verification_status:'pending'}).throwOnError();
  const document=emptyBusiness(),clientId='workspace-client',workId=crypto.randomUUID(),day=crTodayISO();
  document.clients=[{id:clientId,name:'Cliente del espacio',email:'',phone:'',notes:'Conservar',archived:false}];
  document.work=[{id:workId,clientId,client:'Cliente del espacio',service:'Servicio del espacio',stage:'scheduled',start:day+'T09:00:00-06:00',end:day+'T11:00:00-06:00',cancelled:false}];
  const pendingWorkId=crypto.randomUUID();document.work.push({...document.work[0],id:pendingWorkId,service:'Trabajo pendiente original'});
  await db.from('pro_workspaces').insert({user_id:owner.id,document,revision:1}).throwOnError();
  const auth=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{getAll:()=>[],setAll:async cookies=>page.context().addCookies(cookies.map(c=>({name:c.name,value:c.value,url:baseURL!,sameSite:'Lax' as const})))}});
  expect((await auth.auth.signInWithPassword({email:owner.email,password:owner.password})).error).toBeNull();
  for(const endpoint of ['/api/auth/session-mfa','/api/auth/registration-state'])expect((await page.request.get(endpoint,{timeout:45000})).status()).toBe(200);
  const endpoint='/api/pro/client-operations?'+new URLSearchParams({clientId,workId});
  expect((await page.request.get(endpoint)).status()).toBe(200);
  // Reuse the existing private report draft: this is a work checklist, not a
  // second task store. One done + four pending also exercises the compact limit.
  const checklist=[{label:'CHECKLIST_DONE',done:true},...Array.from({length:4},(_,index)=>({label:'CHECKLIST_PENDING_'+(index+1),done:false}))];
  await db.from('pro_work_delivery_drafts').insert({owner_id:owner.id,work_id:workId,revision:1,content:{summary:'PRIVATE_REPORT_SUMMARY',checklist,recommendations:'PRIVATE_RECOMMENDATIONS',photoIds:[]},internal_note:'PRIVATE_INTERNAL_NOTE'}).throwOnError();
  const snapshot=async()=>{
   const result:Record<string,unknown>={};
   for(const table of ['pro_workspaces','pro_clients','pro_products','pro_work','pro_client_entries','pro_quote_links'])result[table]=(await db.from(table).select('*').eq('user_id',owner.id).throwOnError()).data;
   for(const table of ['pro_work_delivery_drafts','pro_work_delivery_versions','pro_work_delivery_photos'])result[table]=(await db.from(table).select('*').eq('owner_id',owner.id).throwOnError()).data;
   result.pro_work_delivery_actions=(await db.from('pro_work_delivery_actions').select('*').eq('actor_id',owner.id).throwOnError()).data;
   return result;
  };
  const before=await snapshot(),posts:string[]=[],runtime:string[]=[];
  onAppPageError(page,message=>runtime.push(message));
  page.on('request',request=>{const url=new URL(request.url());if(request.method()==='POST'&&(url.pathname.startsWith('/api/pro/')||url.pathname==='/api/quotes'))posts.push(url.pathname);});
  if((page.viewportSize()?.width??0)>=1024)await page.setViewportSize({width:1440,height:1000});
  await gotoOK(page,`/${language}/dashboard/${route}?tab=pro_tools`);
  const tools=page.locator('[data-pro-tools]');
  for(const label of en?['Company','Library','Management']:['Empresa','Biblioteca','Gestión'])await expect(tools.getByRole('heading',{name:label,exact:true})).toBeVisible();
  const businessNav=page.getByRole('navigation',{name:en?'Business navigation':'Navegación del negocio',exact:true});
  if((page.viewportSize()?.width??0)>=1024){
   await expect(businessNav).toBeVisible();
   // Round 2: in the independent space «Proveedores» opens the supplier directory of the company hub.
   await businessNav.getByRole('button',{name:en?'Suppliers':'Proveedores',exact:true}).click();
   if(new URL(page.url()).pathname.endsWith('/dashboard/pro')){await expect(page).toHaveURL(/tab=pro_company&empresa=proveedores/);await expect(page.locator('[data-company-hub="proveedores"]')).toBeVisible();}
   else await expect(page).toHaveURL(/gastosVista=suppliers/);// the embedded panel has no company hub
   await businessNav.getByRole('button',{name:en?'Tools overview':'Herramientas',exact:true}).click();await expect(tools).toBeVisible();
  }else await expect(businessNav).toBeHidden();
  await expectNoHorizontalOverflow(page);
  await page.screenshot({path:info.outputPath('tools-groups-'+language+'.png'),fullPage:false});
  if((page.viewportSize()?.width??0)>=1024){await page.setViewportSize({width:1024,height:1000});await expect(tools).toBeVisible();await expectNoHorizontalOverflow(page);await page.screenshot({path:info.outputPath('tools-groups-1024-'+language+'.png'),fullPage:false});await page.setViewportSize({width:1440,height:1000});}
  const path=`/${language}/dashboard/${route}?`+new URLSearchParams({tab:'pro_agenda',cita:workId});
  let failChecklistRead=true;
  const checklistReads:{actor:string|undefined;work:string|null}[]=[];
  await page.route('**/api/pro/work-delivery?**',async route=>{
   const request=route.request(),url=new URL(request.url());
   if(request.method()!=='GET'||!url.searchParams.has('workId'))return route.continue();
   checklistReads.push({actor:request.headers()['x-pro-expected-actor'],work:url.searchParams.get('workId')});
   if(failChecklistRead){failChecklistRead=false;return route.fulfill({status:503,json:{error:'LOCAL checklist read failure'}});}
   return route.continue();
  });
  await gotoOK(page,path);
  const workspace=page.locator('[data-job-workspace]'),nav=workspace.getByRole('navigation',{name:en?'Job workspace':'Gestión del trabajo'});
  await expect(workspace).toBeVisible();
  // Eight views: customer view (family 33) and Planning > Estimates (project planning), grouped like a project menu.
  // Estimates exist only in the independent Pro space (the private estimate editor lives there);
  // on the embedded professional dashboard the view would be an empty panel, so it is not offered.
  const independent=route==='pro';
  // Planning > Allowances (family 75) and Planning > Selections (family 62) follow the same rule: independent Pro space only.
  // Finance > Purchase orders (families 51/52/54) too.
  // Finance > Credits & retainers (family 50) too: intentional +1 in the independent space.
  // Management > Schedule and Finance > Time (families 13/21/22) too: intentional +2 in the independent space.
  // Planning > Measurements (family 66): intentional +1 in the independent space (added by hand; the takeoffs script does not touch this spec).
  // Planning > Idea boards (row 61): intentional +1 in the independent space.
  // Planning > Contracts (row 40): intentional +1 in the independent space.
  // Planning > Bid requests (row 53): intentional +1 in the independent space.
  // Round 8 (2026-11-15): Management > Files (job file organizer) and Management > Subcontractors: intentional +2 in the independent space.
  // 2026-11-17: Activity (per-job history, next to Overview): intentional +1 in the independent space.
  await expect(nav.getByRole('button')).toHaveCount(independent?21:7);
  await expect(nav.getByRole('button',{name:en?'Activity':'Actividad',exact:true})).toHaveCount(independent?1:0);
  // Notes and calls + Project details open from the header bar, not the nav (nav count intentionally unchanged).
  const jobHeader=workspace.locator('[data-job-workspace-header]');await expect(jobHeader.getByRole('button')).toHaveCount(independent?2:0);
  await expect(jobHeader.getByRole('button',{name:en?'Notes and calls':'Notas y llamadas',exact:true})).toHaveCount(independent?1:0);await expect(jobHeader.getByRole('button',{name:en?'Project details':'Detalles del proyecto',exact:true})).toHaveCount(independent?1:0);
  await expect(nav.getByRole('button',{name:en?'Schedule':'Cronograma',exact:true})).toHaveCount(independent?1:0);
  await expect(nav.getByRole('button',{name:en?'Time':'Horas',exact:true})).toHaveCount(independent?1:0);
  await expect(nav.getByRole('button',{name:en?'Quotes':'Cotizaciones',exact:true})).toHaveCount(independent?1:0);
  await expect(nav.getByRole('button',{name:en?'Contracts':'Contratos',exact:true})).toHaveCount(independent?1:0);
  await expect(nav.getByRole('button',{name:en?'Allowances':'Montos previstos',exact:true})).toHaveCount(independent?1:0);
  await expect(nav.getByRole('button',{name:en?'Bid requests':'Licitaciones',exact:true})).toHaveCount(independent?1:0);
  await expect(nav.getByRole('button',{name:en?'Selections':'Selecciones',exact:true})).toHaveCount(independent?1:0);
  await expect(nav.getByRole('button',{name:en?'Idea boards':'Tableros de ideas',exact:true})).toHaveCount(independent?1:0);
  await expect(nav.getByRole('button',{name:en?'Purchase orders':'Órdenes de compra',exact:true})).toHaveCount(independent?1:0);
  await expect(nav.getByRole('button',{name:en?'Credits & retainers':'Créditos y anticipos',exact:true})).toHaveCount(independent?1:0);
  await expect(nav.getByRole('button',{name:en?'Measurements':'Mediciones',exact:true})).toHaveCount(independent?1:0);
  await expect(nav.getByRole('button',{name:en?'Customer view':'Vista del cliente',exact:true})).toBeVisible();
  const summary=workspace.getByRole('region',{name:en?'Overview':'Resumen',exact:true});
  await expect(summary).toBeVisible();
  await expect(page.getByRole('dialog').last()).toContainText('Cliente del espacio');
  const checklistSummary=summary.locator('[data-job-checklist-summary]');
  await expect(checklistSummary.getByRole('alert')).toContainText(en?'Could not load the work checklist.':'No se pudo cargar la lista de trabajo.');
  await expect(checklistSummary.getByRole('progressbar')).toHaveCount(0);
  await expect(checklistSummary.getByRole('listitem')).toHaveCount(0);
  await checklistSummary.getByRole('button',{name:en?'Retry':'Reintentar',exact:true}).click();
  await expect(checklistSummary).toContainText(en?'1/5 completed':'1/5 completadas');
  const progress=checklistSummary.getByRole('progressbar');
  await expect(progress).toHaveAttribute('aria-valuemin','0');await expect(progress).toHaveAttribute('aria-valuemax','5');await expect(progress).toHaveAttribute('aria-valuenow','1');
  await expect(checklistSummary.getByRole('listitem')).toHaveCount(3);
  for(const label of ['CHECKLIST_PENDING_1','CHECKLIST_PENDING_2','CHECKLIST_PENDING_3'])await expect(checklistSummary).toContainText(label);
  for(const privateText of ['CHECKLIST_DONE','CHECKLIST_PENDING_4','PRIVATE_REPORT_SUMMARY','PRIVATE_RECOMMENDATIONS','PRIVATE_INTERNAL_NOTE'])await expect(checklistSummary).not.toContainText(privateText);
  expect(checklistReads.length).toBeGreaterThanOrEqual(2);
  expect(checklistReads.every(read=>read.actor===owner.id&&read.work===workId)).toBe(true);
  await checklistSummary.getByRole('button',{name:en?'View checklist and report':'Ver lista y constancia',exact:true}).click();
  await expect(page).toHaveURL(/(?:vistaTrabajo=|\/trabajo\/[^/?]+\/)delivery(?:[?&]|$)/);await expect(workspace.locator('[data-work-delivery]')).toBeVisible();
  const beforeSummaryReturn=checklistReads.length;
  await nav.getByRole('button',{name:en?'Overview':'Resumen',exact:true}).click();
  await expect(summary).toBeVisible();await expect(checklistSummary).toContainText(en?'1/5 completed':'1/5 completadas');
  await expect.poll(()=>checklistReads.length).toBeGreaterThan(beforeSummaryReturn);
  expect(checklistReads.every(read=>read.actor===owner.id&&read.work===workId)).toBe(true);
  expect(posts).toEqual([]);
  await checklistSummary.scrollIntoViewIfNeeded();
  await page.screenshot({path:info.outputPath('job-checklist-'+language+'.png'),fullPage:false});
  // A different work item without a report must not inherit the previous list.
  await gotoOK(page,path.replace(workId,pendingWorkId));
  await expect(summary).toBeVisible();
  await expect.poll(()=>checklistReads.at(-1)?.work).toBe(pendingWorkId);
  await expect(checklistSummary).toHaveCount(0);
  await expect(summary.locator('[data-work-tasks-summary]')).toContainText(en?'0 open':'0 pendientes');
  expect(checklistReads.at(-1)).toEqual({actor:owner.id,work:pendingWorkId});
  expect(posts).toEqual([]);
  await gotoOK(page,path);
  await expect(summary).toBeVisible();await expect(checklistSummary).toContainText(en?'1/5 completed':'1/5 completadas');
  await nav.getByRole('button',{name:en?'Costs & payments':'Costos y pagos',exact:true}).click();
  await expect(page).toHaveURL(/(?:vistaTrabajo=|\/trabajo\/[^/?]+\/)costs(?:[?&]|$)/);
  const costs=workspace.locator('[data-work-account]');await expect(costs).toBeVisible();
  await expect(costs.getByRole('button',{name:en?'Set amount':'Definir importe',exact:true})).toBeEnabled();
  await costs.getByRole('button',{name:en?'Record time':'Registrar tiempo',exact:true}).click();
  const form=page.getByRole('dialog',{name:en?'Record time':'Registrar tiempo',exact:true});
  await form.getByLabel(en?'Hours worked':'Horas trabajadas',{exact:true}).fill('2');
  const dirtyPath=page.url();await nav.getByRole('button',{name:en?'Changes':'Extras y cambios',exact:true}).dispatchEvent('click');
  await expect(page).toHaveURL(dirtyPath);await expect(form).toBeVisible();
  await expect(form.getByLabel(en?'Hours worked':'Horas trabajadas',{exact:true})).toHaveValue('2');
  await form.getByRole('button',{name:en?'Cancel':'Cancelar',exact:true}).click();
  const confirmation=page.getByRole('dialog').last();
  await expect(confirmation.getByRole('button',{name:en?'Discard changes':'Descartar cambios',exact:true})).toBeVisible();
  await confirmation.getByRole('button',{name:en?'Discard changes':'Descartar cambios',exact:true}).click();
  await expect(form).toHaveCount(0);
  await nav.getByRole('button',{name:en?'Changes':'Extras y cambios',exact:true}).click();
  await expect(summary).toBeHidden();await expect(workspace.getByRole('region',{name:en?'Changes':'Extras y cambios',exact:true})).toBeVisible();
  await workspace.getByRole('button',{name:en?'Set agreed amount':'Definir importe acordado',exact:true}).click();
  const agreement=page.getByRole('dialog',{name:en?'Agreed amount':'Importe acordado',exact:true});
  await expect(agreement.getByLabel(en?'Amount in CRC':'Monto en colones',{exact:true})).toBeVisible();
  expect((new URL(page.url()).searchParams.get('cita')??(decodeURIComponent(new URL(page.url()).pathname.split('/trabajo/')[1]?.split('/')[0]??'')||null))).toBe(workId);
  await agreement.getByRole('button',{name:en?'Cancel':'Cancelar',exact:true}).click();
  await expect(agreement).toHaveCount(0);
  await nav.getByRole('button',{name:en?'Completion report':'Constancia',exact:true}).click();
  await expect(workspace.locator('[data-work-delivery]')).toBeVisible();
  await page.reload();await expect(workspace.locator('[data-work-delivery]')).toBeVisible();
  await nav.getByRole('button',{name:en?'Costs & payments':'Costos y pagos',exact:true}).click();await expect(costs).toBeVisible();
  await page.goBack();await expect(workspace.locator('[data-work-delivery]')).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await expect(page.getByRole('dialog').last().getByRole('button',{name:en?'Edit job':'Editar trabajo',exact:true})).toBeEnabled();
  await page.screenshot({path:info.outputPath('job-workspace-'+language+'.png'),fullPage:false});
  // An unresolved entry for another job must remain reachable, with the exact
  // original context/bytes and no automatic POST from this workspace.
  const pendingBody=JSON.stringify({clientId,workId:pendingWorkId,kind:'agreement',actionId:crypto.randomUUID(),revision:1,amountCents:70000});
  const recoveryKey=clientOperationRecoveryKey(owner.id,clientId),recoveryBytes=JSON.stringify({version:1,accountId:owner.id,clientId,body:pendingBody,phase:'uncertain'});
  await page.evaluate(({key,bytes})=>localStorage.setItem(key,bytes),{key:recoveryKey,bytes:recoveryBytes});
  await gotoOK(page,path+'&vistaTrabajo=costs');
  await workspace.getByRole('button',{name:en?'Review pending entry':'Revisar registro pendiente',exact:true}).click();
  const recovered=page.getByRole('dialog',{name:en?'Agreed amount':'Importe acordado',exact:true});
  await expect(recovered).toContainText('Trabajo pendiente original');
  await expect(recovered.getByLabel(en?'Amount in CRC':'Monto en colones',{exact:true})).toHaveValue('700.00');
  await expect(recovered.getByRole('button',{name:en?'Retry the same action':'Reintentar la misma acción',exact:true})).toBeEnabled();
  expect(await page.evaluate(key=>localStorage.getItem(key),recoveryKey)).toBe(recoveryBytes);
  expect(posts).toEqual([]);expect(runtime).toEqual([]);expect(await snapshot()).toEqual(before);
 }finally{await page.goto('about:blank').catch(()=>{});await cleanupDisposableAccount(owner);}
});

import {test,expect,type Page} from 'playwright/test';
import {budgetFixture,cleanup,local,budgetApi,budgetWrite,json,overview,seedBudgetActuals,budgetBusiness} from './work-budget-fixture';
import {createWorkCostWrite,workCostWriteKey} from '../../src/lib/pro/work-cost-write-recovery';
import {stabilizeLocalProRuntime} from './pro-local-stable-runtime';
import {gotoOK,expectNoHorizontalOverflow,onAppPageError} from './helpers';

async function reloadActual(page:Page){
 const before=await page.evaluate(()=>performance.timeOrigin);
 const accept=async(dialog:import('playwright/test').Dialog)=>{expect(dialog.type()).toBe('beforeunload');await dialog.accept();};
 page.once('dialog',accept);
 try{expect((await page.reload())?.status()).toBe(200);}finally{page.off('dialog',accept);}
 expect(await page.evaluate(()=>performance.timeOrigin)).not.toBe(before);
}

test('Private work budget journey: a delayed More page cannot replace a newer filtered view (es)',async({page,baseURL},info)=>{
 test.setTimeout(180000);local(baseURL);const f=await budgetFixture(page.context()),writes:string[]=[],errors:string[]=[];
 let release:()=>void=()=>{},markHeld:()=>void=()=>{},markReleased:()=>void=()=>{},heldSeen=false;
 const hold=new Promise<void>(resolve=>{release=resolve;}),held=new Promise<void>(resolve=>{markHeld=resolve;}),released=new Promise<void>(resolve=>{markReleased=resolve;});
 try{
  await stabilizeLocalProRuntime(page.context(),'http://127.0.0.1:3185');
  const ids:string[]=[];
  for(let index=1;index<=21;index++){
   const id=crypto.randomUUID(),code='Z'+String(index).padStart(2,'0');ids.push(id);
   await budgetWrite(page.context(),f,{action:'save_item',id,code,title:'Partida '+code,parentId:null,plannedCents:0});
  }
  const business=await budgetBusiness(f);
  const metadata=async()=>Object.fromEntries(await Promise.all(['pro_work_budget_state','pro_work_budget_codes','pro_work_budget_assignments','pro_work_budget_actions'].map(async table=>[table,(await f.db.from(table).select('*').eq('owner_id',f.owner.id).throwOnError()).data?.toSorted((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))])));
  const before=await metadata();
  onAppPageError(page,message=>errors.push(message));
  page.on('request',request=>{const url=new URL(request.url());if(url.pathname.startsWith('/api/pro/')&&['POST','PATCH','PUT','DELETE'].includes(request.method()))writes.push(request.method()+' '+url.pathname);});
  await page.route('**/api/pro/work-budget**',async route=>{
   const url=new URL(route.request().url());
   if(!heldSeen&&route.request().method()==='GET'&&url.searchParams.get('view')==='codes'&&url.searchParams.has('after')&&!url.searchParams.get('q')){
    const actual=await route.fetch();expect(actual.status()).toBe(200);
    heldSeen=true;markHeld();
    try{await hold;await route.fulfill({response:actual});}finally{markReleased();}
    return;
   }
   await route.continue();
  });
  await gotoOK(page,`/es/dashboard/pro?tab=pro_agenda&cita=${f.budgetWorkId}&vistaTrabajo=costs`);
  await expect(page.locator('[data-work-budget-trigger]')).toBeEnabled({timeout:45000});await page.locator('[data-work-budget-trigger]').click();
  const modal=page.getByRole('dialog',{name:'Presupuesto de costos (CRC)',exact:true}),section=modal.locator('[data-work-budget]'),rows=section.locator('[data-work-budget-code]'),search=section.getByLabel('Buscar en presupuesto',{exact:true});
  await expect(rows).toHaveCount(20);await expect(section.getByText('Cargando presupuesto…',{exact:true})).toHaveCount(0);
  const oldResponse=page.waitForResponse(response=>{const url=new URL(response.url());return url.pathname===budgetApi&&url.searchParams.get('view')==='codes'&&url.searchParams.has('after')&&!url.searchParams.get('q');});
  await section.getByRole('button',{name:'Ver más',exact:true}).click();await held;
  const filtered=page.waitForResponse(response=>{const url=new URL(response.url());return url.pathname===budgetApi&&url.searchParams.get('view')==='codes'&&url.searchParams.get('q')==='Z21'&&response.status()===200;});
  await search.fill('Z21');await(await filtered).finished();
  await expect(rows).toHaveCount(1);await expect(section.locator(`[data-work-budget-code="${ids[20]}"]`)).toContainText('Z21 · Partida Z21');
  await expect(section.locator(`[data-work-budget-code="${ids[0]}"]`)).toHaveCount(0);
  release();await released;const late=await oldResponse;expect(late.status()).toBe(200);await late.finished();
  // Wait for a paint after the actual response is consumed, rather than passing
  // the assertion while the obsolete fetch is still queued on the browser.
  await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
  await expect(search).toHaveValue('Z21');await expect(rows).toHaveCount(1);
  await expect(section.locator(`[data-work-budget-code="${ids[20]}"]`)).toBeVisible();await expect(section.locator(`[data-work-budget-code="${ids[0]}"]`)).toHaveCount(0);
  await expect(section.getByText('Cargando presupuesto…',{exact:true})).toHaveCount(0);await expect(section.getByRole('alert')).toHaveCount(0);
  expect(writes).toEqual([]);expect(errors).toEqual([]);expect(await metadata()).toEqual(before);expect(await budgetBusiness(f)).toEqual(business);
  expect((await overview(page.context(),f)).summary).toMatchObject({plannedCents:0,actualCents:0,sourceCount:0,varianceCents:0});
  await modal.getByRole('heading',{name:'Presupuesto de costos (CRC)',exact:true}).scrollIntoViewIfNeeded();await expectNoHorizontalOverflow(page);
  await page.screenshot({path:info.outputPath('work-budget-filter-after-delayed-more.png'),animations:'disabled'});
 }catch(error){await page.screenshot({path:info.outputPath('work-budget-delayed-more-failure.png'),animations:'disabled'}).catch(()=>{});throw error;}
 finally{release();if(heldSeen)await released;await page.goto('about:blank').catch(()=>{});await cleanup(f);}
});
for(const language of ['es','en'] as const){
 test(`Private work budget journey: real groups, planned versus actual costs and exact recovery preserve newer drafts (${language})`,async({page,baseURL},info)=>{
  test.setTimeout(300000);local(baseURL);const en=language==='en',f=await budgetFixture(page.context()),posts:string[]=[],errors:string[]=[];
  const journal='ccr:pro:work-budget-write:v1:'+f.owner.id+':'+f.budgetWorkId,draftKey='ccr:pro:work-budget-draft:v1:'+f.owner.id+':'+f.budgetWorkId;
  let lose=false,blockProof=false,resolveLost:()=>void=()=>{};
  const lostProof=new Promise<void>(resolve=>{resolveLost=resolve;});
  try{
   await stabilizeLocalProRuntime(page.context(),'http://127.0.0.1:3185');
   const actual=await seedBudgetActuals(page.context(),f),before=await budgetBusiness(f);
   // A valid old cost intent for a different job must survive this new namespace.
   const oldPage=await json(page.context(),{clientId:f.clientId,workId:f.completedId},'/api/pro/work-costs');
   const old=createWorkCostWrite(f.owner.id,{action:'add_time',requestId:crypto.randomUUID(),clientId:f.clientId,workId:f.completedId,revision:oldPage.revision,date:'2024-02-29',minutes:1,hourlyCostCents:0,note:'Independent old cost intent'},oldPage),oldKey=workCostWriteKey(f.owner.id,f.clientId,f.completedId),oldRaw=JSON.stringify(old);
   onAppPageError(page,message=>errors.push(message));
   await page.route('**/api/pro/work-budget**',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(request.method()==='POST'){
     posts.push(request.postData()!);
     if(lose){lose=false;blockProof=true;const real=await route.fetch();expect(real.status()).toBe(200);await route.fulfill({status:503,json:{error:'LOCAL_BUDGET_ACK_LOST'}});return;}
    }
    if(request.method()==='GET'&&url.searchParams.get('view')==='action'&&blockProof){await route.fulfill({status:503,json:{error:'LOCAL_BUDGET_PROOF_UNAVAILABLE'}});resolveLost();return;}
    await route.continue();
   });
   await gotoOK(page,`/${language}/dashboard/pro?tab=pro_agenda&cita=${f.budgetWorkId}&vistaTrabajo=costs`);
   await page.evaluate(({key,raw})=>localStorage.setItem(key,raw),{key:oldKey,raw:oldRaw});
   const trigger=page.locator('[data-work-budget-trigger]');await expect(trigger).toBeEnabled({timeout:45000});await trigger.click();
   const modal=page.getByRole('dialog',{name:en?'Cost budget (CRC)':'Presupuesto de costos (CRC)',exact:true}),section=modal.locator('[data-work-budget]'),form=section.locator('[data-work-budget-form]');
   const ready=async()=>{await expect(section.getByText(en?'Loading budget…':'Cargando presupuesto…',{exact:true})).toHaveCount(0);await expect(section.getByRole('alert')).toHaveCount(0);};
   const waitPage=(view:string)=>page.waitForResponse(response=>{const url=new URL(response.url());return url.pathname===budgetApi&&url.searchParams.get('view')===view&&response.request().method()==='GET'&&response.status()===200;});
   const save=async(view='codes')=>{
    const refreshed=waitPage(view);await modal.getByRole('button',{name:en?'Save':'Guardar',exact:true}).click();
    await refreshed;await expect.poll(()=>page.evaluate(key=>localStorage.getItem(key),journal)).toBeNull();await expect(form).toHaveCount(0);await ready();return JSON.parse(posts.at(-1)!);
   };
   await expect(section.getByRole('button',{name:en?'Add cost item':'Agregar partida',exact:true})).toBeEnabled();await ready();
   await expect(section).toContainText(en?'Comparison incomplete.':'Comparación incompleta.');await expect(section).toContainText('15 min');
   const group=async(code:string,name:string)=>{
    await section.getByRole('button',{name:en?'Budget options':'Opciones del presupuesto',exact:true}).click();
    await page.getByRole('menuitem',{name:en?'New group':'Nuevo grupo',exact:true}).click();
    await form.getByLabel(en?'Code':'Código',{exact:true}).fill(code);await form.getByLabel(en?'Name':'Nombre',{exact:true}).fill(name);
    return (await save()).id as string;
   };
   const firstGroup=await group('G01','Preparación'),secondGroup=await group('G02','Terminación');
   const item=async(code:string,name:string,planned:string,parent:string)=>{
    await section.getByRole('button',{name:en?'Add cost item':'Agregar partida',exact:true}).click();
    await form.getByLabel(en?'Code':'Código',{exact:true}).fill(code);await form.getByLabel(en?'Name':'Nombre',{exact:true}).fill(name);
    await form.getByLabel(en?'Planned cost CRC':'Costo previsto CRC',{exact:true}).fill(planned);
    await form.getByRole('button',{name:en?'Choose group':'Elegir grupo',exact:true}).click();
    await page.locator(`[data-work-budget-pick-code="${parent}"]`).click();return (await save()).id as string;
   };
   const materialCode=await item('01.10','Materiales','2.00',firstGroup),laborCode=await item('01.20','Mano de obra','3.00',firstGroup),expenseCode=await item('02.10','Transporte','4.00',secondGroup);
   expect((await overview(page.context(),f)).summary).toMatchObject({plannedCents:900,actualCents:104,unknownMinutes:15,varianceCents:null});
   const view=section.getByRole('group',{name:en?'Budget view':'Vista del presupuesto',exact:true});
   const recorded=async()=>{const refreshed=waitPage('costs');await view.getByRole('button',{name:en?'Recorded costs':'Costos registrados',exact:true}).click();await refreshed;await ready();};
   await recorded();
   const setAssignment=async(kind:string,id:string,target:string|null)=>{
    const row=section.locator(`[data-work-budget-cost="${kind}:${id}"]`);
    await row.getByRole('button',{name:en?'Assign cost item':'Asignar partida',exact:true}).click();
    if(target){await form.getByRole('button',{name:en?'Choose cost item':'Elegir partida',exact:true}).click();await page.locator(`[data-work-budget-pick-code="${target}"]`).click();}
    else await form.getByRole('button',{name:en?'Unassigned':'Sin partida',exact:true}).click();
    await save('costs');return row;
   };
   await setAssignment('material',actual.sharedId,materialCode);
   await setAssignment('time',actual.sharedId,laborCode);
   await setAssignment('time',actual.unknown.result.id,laborCode);
   const expenseRow=await setAssignment('expense',actual.expense.result.id,expenseCode);
   await expect(expenseRow).toContainText('02.10 · Transporte');
   await expect(section.locator(`[data-work-budget-cost="material:${actual.sharedId}"]`)).toContainText('01.10 · Materiales');
   await expect(section.locator(`[data-work-budget-cost="time:${actual.sharedId}"]`)).toContainText('01.20 · Mano de obra');
   await expenseRow.scrollIntoViewIfNeeded();await expectNoHorizontalOverflow(page);
   await page.screenshot({path:info.outputPath('work-budget-recorded-'+language+'.png'),animations:'disabled'});
   await setAssignment('expense',actual.expense.result.id,null);
   expect((await overview(page.context(),f)).unassigned).toMatchObject({actualCents:102,sourceCount:3});
   const budgetPage=waitPage('codes');await view.getByRole('button',{name:en?'Budget':'Presupuesto',exact:true}).click();await budgetPage;await ready();
   await expect(section.locator(`[data-work-budget-code="${firstGroup}"]`)).toContainText(en?'Incomplete':'Incompleto');
   await modal.getByRole('heading',{name:en?'Cost budget (CRC)':'Presupuesto de costos (CRC)',exact:true}).scrollIntoViewIfNeeded();await expectNoHorizontalOverflow(page);
   await page.screenshot({path:info.outputPath('work-budget-hierarchy-'+language+'.png'),animations:'disabled'});
   const code=section.locator(`[data-work-budget-code="${materialCode}"]`);
   await expect(code).toContainText('01.10 · Materiales');await expect(code).toContainText((en?'Group: ':'Grupo: ')+'G01 · Preparación');
   await expect(section.locator(`[data-work-budget-code="${laborCode}"]`)).toContainText((en?'Group: ':'Grupo: ')+'G01 · Preparación');
   await expect(section.locator(`[data-work-budget-code="${expenseCode}"]`)).toContainText((en?'Group: ':'Grupo: ')+'G02 · Terminación');
   await code.scrollIntoViewIfNeeded();await expectNoHorizontalOverflow(page);
   await page.screenshot({path:info.outputPath('work-budget-tree-items-'+language+'.png'),animations:'disabled'});
   const groupRow=section.locator(`[data-work-budget-code="${firstGroup}"]`);
   await expect(groupRow).toContainText('G01 · Preparación');await expect(groupRow).toContainText('₡5');await expect(groupRow).toContainText(en?'₡0.02':'₡0,02');
   await expect(section.locator(`[data-work-budget-code="${secondGroup}"]`)).toContainText('G02 · Terminación');
   await groupRow.scrollIntoViewIfNeeded();await expectNoHorizontalOverflow(page);
   await page.screenshot({path:info.outputPath('work-budget-tree-groups-'+language+'.png'),animations:'disabled'});
   await code.getByRole('button',{name:en?'Code actions: 01.10':'Acciones de partida: 01.10',exact:true}).click();
   await page.getByRole('menuitem',{name:en?'Edit':'Editar',exact:true}).click();
   const name=form.getByLabel(en?'Name':'Nombre',{exact:true});await expect(name).toHaveValue('Materiales');
   await name.fill('BETA_LOCAL_PRESERVED');
   const beta=await page.evaluate(key=>sessionStorage.getItem(key),draftKey);expect(JSON.parse(beta!).editor.title).toBe('BETA_LOCAL_PRESERVED');
   await name.fill('ALPHA_SAVED_MATERIALS');lose=true;
   await modal.getByRole('button',{name:en?'Save':'Guardar',exact:true}).click();await lostProof;
   const recovery=section.locator('[data-work-budget-recovery]'),check=recovery.getByRole('button',{name:en?'Check saved budget':'Comprobar presupuesto guardado',exact:true});
   await expect(check).toBeEnabled();const count=posts.length,exact=posts.at(-1)!;
   expect(JSON.parse(exact)).toMatchObject({action:'save_item',workId:f.budgetWorkId,clientId:f.clientId,id:materialCode,title:'ALPHA_SAVED_MATERIALS',plannedCents:200});
   // Restore exact UI-produced Beta bytes, modeling a newer retained local draft
   // independently from Alpha's uncertain network result.
   await page.evaluate(({key,raw})=>sessionStorage.setItem(key,raw),{key:draftKey,raw:beta!});
   await reloadActual(page);await expect(check).toBeEnabled({timeout:45000});expect(posts).toHaveLength(count);
   expect(await page.evaluate(key=>sessionStorage.getItem(key),draftKey)).toBe(beta);
   expect(await page.evaluate(key=>localStorage.getItem(key),oldKey)).toBe(oldRaw);
   blockProof=false;await check.click();
   await expect.poll(()=>page.evaluate(key=>localStorage.getItem(key),journal)).toBeNull();await expect(recovery).toHaveCount(0);
   await expect(name).toHaveValue('BETA_LOCAL_PRESERVED');expect(posts).toHaveLength(count);expect(posts.at(-1)).toBe(exact);
   expect(await page.evaluate(key=>sessionStorage.getItem(key),draftKey)).toBe(beta);
   await section.getByRole('button',{name:en?'Keep draft and close':'Conservar borrador y cerrar',exact:true}).click();await expect(modal).toHaveCount(0);
   expect(await page.evaluate(key=>sessionStorage.getItem(key),draftKey)).toBe(beta);await trigger.click();await expect(name).toHaveValue('BETA_LOCAL_PRESERVED');
   await modal.getByRole('button',{name:en?'Cancel':'Cancelar',exact:true}).click();await page.getByRole('dialog').last().getByRole('button',{name:en?'Keep editing':'Seguir editando',exact:true}).click();
   expect(await page.evaluate(key=>sessionStorage.getItem(key),draftKey)).toBe(beta);
   const alphaInput=JSON.parse(exact),alphaReceipt=await json(page.context(),{view:'action',actionId:alphaInput.actionId},budgetApi);
   expect((await json(page.context(),{view:'code',workId:f.budgetWorkId,id:materialCode},budgetApi)).code.title).toBe('ALPHA_SAVED_MATERIALS');
   await section.getByRole('button',{name:en?'Review current budget':'Revisar presupuesto actual',exact:true}).click();
   await page.getByRole('dialog').last().getByRole('button',{name:en?'Use current budget':'Usar presupuesto actual',exact:true}).click();
   await expect(name).toHaveValue('BETA_LOCAL_PRESERVED');
   await expect(form.getByLabel(en?'Code':'Código',{exact:true})).toHaveValue('01.10');
   await expect(form.getByLabel(en?'Planned cost CRC':'Costo previsto CRC',{exact:true})).toHaveValue('2.00');
   const reviewed=JSON.parse((await page.evaluate(key=>sessionStorage.getItem(key),draftKey))!);
   expect(reviewed.editor.capture.revision).toBe(alphaInput.revision+1);expect(reviewed.editor.baseline.title).toBe('ALPHA_SAVED_MATERIALS');
   expect(reviewed.editor).toMatchObject({id:materialCode,title:'BETA_LOCAL_PRESERVED',code:'01.10',planned:'2.00',parent:{id:firstGroup}});
   expect(posts).toHaveLength(count); // Reviewing and confirming a baseline are GET-only.
   await expect(modal.getByRole('button',{name:en?'Save':'Guardar',exact:true})).toBeEnabled();
   await expect(section.getByRole('alert')).toHaveCount(0);await expectNoHorizontalOverflow(page);
   await page.screenshot({path:info.outputPath('work-budget-reviewed-draft-'+language+'.png'),animations:'disabled'});
   const betaInput=await save();
   expect(betaInput).toMatchObject({action:'save_item',id:materialCode,revision:alphaInput.revision+1,title:'BETA_LOCAL_PRESERVED',plannedCents:200});
   expect(betaInput.actionId).not.toBe(alphaInput.actionId);expect(posts).toHaveLength(count+1);
   expect(await json(page.context(),{view:'action',actionId:alphaInput.actionId},budgetApi)).toEqual(alphaReceipt);
   await expect(code).toContainText('BETA_LOCAL_PRESERVED');
   const historyReady=waitPage('history');await view.getByRole('button',{name:en?'History':'Historial',exact:true}).click();await historyReady;await ready();
   await expect(section.locator('[data-work-budget-history]')).toHaveCount(posts.length);
   await expect(section).toContainText('ALPHA_SAVED_MATERIALS');
   await expect(section).toContainText('BETA_LOCAL_PRESERVED');
   const current=await overview(page.context(),f);expect(current.summary).toMatchObject({plannedCents:900,actualCents:104,unknownMinutes:15,varianceCents:null});
   expect(posts.filter(body=>JSON.parse(body).title==='ALPHA_SAVED_MATERIALS')).toEqual([exact]);
   expect(await page.evaluate(key=>localStorage.getItem(key),oldKey)).toBe(oldRaw);expect(await budgetBusiness(f)).toEqual(before);expect(errors).toEqual([]);
   await expect(section.getByRole('alert')).toHaveCount(0);await expectNoHorizontalOverflow(page);
  }catch(error){await page.screenshot({path:info.outputPath('work-budget-failure-'+language+'.png'),animations:'disabled'}).catch(()=>{});throw error;}
  finally{await page.goto('about:blank').catch(()=>{});await cleanup(f);}
 });
}

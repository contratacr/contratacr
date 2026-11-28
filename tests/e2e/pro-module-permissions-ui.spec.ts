import {test,expect} from 'playwright/test';
import {randomBytes} from 'node:crypto';
import {gotoOK,expectNoHorizontalOverflow} from './helpers';
import {local,login,origin,ownerFixture} from './pro-round2-fixture';
import {createDisposableAccount,cleanupDisposableAccount} from './disposable-account';
import {randomIp} from './pro-dir-features-fixture';

// Row 17 (migration 404): the «Permisos por módulo» panel end to end. The owner denies "Finanzas · crear y editar" to the
// Manager role in Equipo; a manager working in that company gets 403 pro_module_permission from the single /api/pro gate
// on a finance write (other modules still pass the gate), and the page carries the denial so finance controls are hidden.
for(const language of ['es','en'] as const)test(`Module permissions panel: deny, save, enforced for the role [${language}]`,async({page,browser},info)=>{
 test.setTimeout(300000);local(info.project.use.baseURL);
 const en=language==='en',prefix=en?'/en':'/es',tag=randomBytes(3).toString('hex'),f=await ownerFixture(page.context(),tag);
 const manager=await createDisposableAccount({prefix:'modperm-ui-manager'});
 try{
  await f.db.from('pro_company_members').insert({owner_id:f.owner.id,member_user_id:manager.id,member_name:'Gerente '+tag,member_email:manager.email,role:'manager'}).throwOnError();
  await gotoOK(page,`${prefix}/dashboard/pro/equipo`);
  const panel=page.locator('[data-module-permissions]');await expect(panel).toBeVisible({timeout:90000});
  await expect(panel.getByRole('heading',{name:en?'Permissions by module':'Permisos por módulo'})).toBeVisible();
  await panel.locator('[data-module-subject]').selectOption('manager');
  const box=panel.locator('[data-module-deny="finance:edit"]');await expect(box).not.toBeChecked();
  await expect(panel.locator('[data-module-deny="work:view"]')).toBeDisabled();// Jobs can never be hidden
  await box.check();
  await panel.locator('[data-module-save]').click();
  await expect(panel.getByRole('status')).toContainText(en?'Permissions saved.':'Permisos guardados.',{timeout:30000});
  await expectNoHorizontalOverflow(page);
  await page.reload();await expect(page.locator('[data-module-permissions] [data-module-deny="finance:edit"]')).toBeChecked({timeout:90000});
  const row=(await f.db.from('pro_company_module_permission_history').select('action_id').eq('owner_id',f.owner.id).throwOnError()).data!;expect(row).toHaveLength(1);
  // The manager, working in this company.
  const context=await browser.newContext({baseURL:origin,extraHTTPHeaders:randomIp()});
  try{
   await login(context,manager);await context.addCookies([{name:'ccr_pro_ws',value:f.owner.id,url:origin,httpOnly:true,sameSite:'Lax'}]);
   const headers={Origin:origin,'X-Pro-Expected-Actor':f.owner.id};
   const denied=await context.request.post(origin+'/api/pro/invoice-drafts',{headers,data:{}});
   expect(denied.status()).toBe(403);expect(await denied.json()).toMatchObject({code:'pro_module_permission',module:'finance',action:'edit'});
   const other=await context.request.post(origin+'/api/pro/lead-board',{headers,data:{}});
   expect(other.status()===403&&(await other.json().catch(()=>({}))).code==='pro_module_permission').toBe(false);
   const mp=await context.newPage();await gotoOK(mp,`${prefix}/dashboard/pro`);
   await expect(mp.locator('[data-pro-workspace-banner]')).toBeVisible({timeout:90000});
   await expect.poll(()=>mp.evaluate(()=>document.documentElement.dataset.proDenied??''),{timeout:30000}).toContain('finance:edit');
   // The shared CSS hides every finance write control for this role; a lead write control stays visible.
   await mp.evaluate(()=>{for(const cap of ['finance.write','lead.write']){const b=document.createElement('button');b.dataset.proWrite=cap;b.dataset.probe=cap;b.textContent=cap;document.body.appendChild(b);}});
   await expect(mp.locator('[data-probe="finance.write"]')).toBeHidden();await expect(mp.locator('[data-probe="lead.write"]')).toBeVisible();
  }finally{await context.close();}
 }finally{await page.goto('about:blank').catch(()=>{});await f.cleanup();await cleanupDisposableAccount(manager);}
});

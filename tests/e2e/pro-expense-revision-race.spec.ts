import {test,expect,type Route} from 'playwright/test';
import {createServerClient} from '@supabase/ssr';
import {createDisposableAccount,cleanupDisposableAccount} from './disposable-account';
import {regressionAdminClient} from './seed';
import {collectPageErrors,expectNoHorizontalOverflow} from './helpers';

// Gastos: a «New expense»/«New supplier» form must never be opened with a list
// revision older than the current view, and a 409 on a brand-new record must be
// recoverable with the current revision without losing what was typed. Edits of
// existing records keep the conflict (nothing is overwritten silently).
const api='/api/pro/expenses';
const words={
 es:{suppliers:'Proveedores',expenses:'Gastos',newSupplier:'Nuevo proveedor',newExpense:'Nuevo gasto',name:'Nombre del proveedor',savedSupplier:'Proveedor guardado',description:'Concepto',total:'Importe total ₡',date:'Fecha del gasto',save:'Guardar',refreshed:'Los datos cambiaron mientras completaba el formulario. Ya se actualizaron; revise y pulse «Guardar» de nuevo.',edit:'Editar gasto',internal:'Gasto interno',conflict:'Los datos cambiaron. Actualice antes de volver a guardar; el proveedor y el borrador se conservan.'},
 en:{suppliers:'Suppliers',expenses:'Expenses',newSupplier:'New supplier',newExpense:'New expense',name:'Supplier name',savedSupplier:'Saved supplier',description:'Description',total:'Total amount ₡',date:'Expense date',save:'Save',refreshed:'Data changed while you were filling in the form. It has been refreshed; review it and select “Save” again.',edit:'Edit expense',internal:'Internal expense',conflict:'Data changed. Refresh before saving again; the supplier and draft are preserved.'},
};

for(const language of ['es','en'] as const)test(`Expenses: new forms use the current revision and recover a 409 without losing input [${language}]`,async({page,baseURL},info)=>{
 test.setTimeout(180000);expect(baseURL).toMatch(/^http:\/\/(?:127\.0\.0\.1|localhost):3185\/?$/);expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');
 const owner=await createDisposableAccount({prefix:'expense-revision-race'}),db=regressionAdminClient(),text=words[language],headers={origin:new URL(baseURL!).origin},panel=page.locator('[data-pro-expenses]'),pageErrors=collectPageErrors(page);
 const posts:{action:string;revision:number;status:number}[]=[];let holdList:Promise<void>|null=null;
 async function current(){const response=await page.request.get(api+'?kind=suppliers');expect(response.status()).toBe(200);return (await response.json()).revision as number;}
 async function bump(name:string){const revision=await current();const response=await page.request.post(api,{headers,data:{action:'supplier',actionId:crypto.randomUUID(),revision,id:crypto.randomUUID(),name,identification:'',email:'',phone:'',archived:false}});expect(response.status()).toBe(200);}
 async function intercept(route:Route){
  const request=route.request(),url=new URL(request.url());
  if(request.method()==='GET'&&!url.searchParams.has('id')&&holdList)await holdList;
  if(request.method()!=='POST')return route.continue();
  const body=request.postDataJSON() as {action:string;revision:number};const response=await route.fetch();posts.push({action:body.action,revision:body.revision,status:response.status()});return route.fulfill({response});
 }
 let bodyError:unknown;
 try{
  const account=await db.auth.admin.getUserById(owner.id);expect((await db.auth.admin.updateUserById(owner.id,{user_metadata:{...account.data.user!.user_metadata,role:'professional',is_provider:true}})).error).toBeNull();await db.from('profiles').update({role:'professional',is_provider:true}).eq('id',owner.id).throwOnError();await db.from('pro_memberships').insert({user_id:owner.id,status:'active'}).throwOnError();
  await db.from('professionals').insert({profile_id:owner.id,category_id:'desarrollo_web',business_name:'Expense revision fixture',slug:'expense-revision-'+owner.id,whatsapp:'',provincia_id:'al',canton_id:'al-at',verification_status:'pending',is_banned:false}).throwOnError();
  const auth=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{getAll:()=>[],setAll:async cookies=>page.context().addCookies(cookies.map(cookie=>({name:cookie.name,value:cookie.value,url:baseURL!,sameSite:'Lax' as const})))}});expect((await auth.auth.signInWithPassword({email:owner.email,password:owner.password})).error).toBeNull();
  await page.route('**/api/pro/expenses**',intercept);
  await page.goto((language==='en'?'/en':'')+'/dashboard/profesional?tab=pro_expenses');await expect(panel.getByRole('button',{name:text.newExpense,exact:true})).toBeEnabled();

  // 1) Saving a supplier refreshes the list. While that refresh (or the view
  // change) has not loaded, «New …» stays disabled, so no form can start with
  // the revision from before the save.
  await panel.getByRole('button',{name:text.suppliers,exact:true}).click();await panel.getByRole('button',{name:text.newSupplier,exact:true}).click();let form=page.getByRole('dialog',{name:text.newSupplier,exact:true});
  await form.getByLabel(text.name,{exact:true}).fill('Race supplier '+language);
  let release:()=>void=()=>{};holdList=new Promise<void>(resolve=>{release=resolve;});
  await form.getByRole('button',{name:text.save,exact:true}).click();await expect(form).toHaveCount(0);
  await panel.getByRole('button',{name:text.expenses,exact:true}).click();
  const newExpense=panel.getByRole('button',{name:text.newExpense,exact:true});
  await expect(newExpense).toBeDisabled();await page.waitForTimeout(600);await expect(newExpense).toBeDisabled();
  holdList=null;release();await expect(newExpense).toBeEnabled();
  const supplierId=((await (await page.request.get(api+'?kind=suppliers')).json()).items[0] as {id:string}).id;
  await newExpense.click();form=page.getByRole('dialog',{name:text.newExpense,exact:true});
  await form.getByLabel(text.savedSupplier,{exact:true}).selectOption(supplierId);await form.getByLabel(text.description,{exact:true}).fill('First try '+language);await form.getByLabel(text.total,{exact:true}).fill('10');await form.getByLabel(text.date,{exact:true}).fill('2026-11-05');
  const firstRevision=await current();await form.getByRole('button',{name:text.save,exact:true}).click();await expect(form).toHaveCount(0);
  expect(posts.filter(post=>post.action==='expense')).toEqual([{action:'expense',revision:firstRevision,status:200}]);

  // 2) Another tab changes the account while the form is open: the first save
  // is a real 409; the form adopts the current revision, keeps every field and
  // the second «Save» succeeds exactly once.
  await newExpense.click();form=page.getByRole('dialog',{name:text.newExpense,exact:true});
  await form.getByLabel(text.savedSupplier,{exact:true}).selectOption(supplierId);await form.getByLabel(text.description,{exact:true}).fill('Concurrent draft '+language);await form.getByLabel(text.total,{exact:true}).fill('25.50');await form.getByLabel(text.date,{exact:true}).fill('2026-11-06');
  await bump('Other tab supplier '+language);
  const rejected=page.waitForResponse(response=>new URL(response.url()).pathname===api&&response.request().method()==='POST'&&response.status()===409);await form.getByRole('button',{name:text.save,exact:true}).click();await rejected;
  await expect(form.getByRole('alert')).toHaveText(text.refreshed);
  await expect(form.getByLabel(text.description,{exact:true})).toHaveValue('Concurrent draft '+language);await expect(form.getByLabel(text.total,{exact:true})).toHaveValue('25.50');await expect(form.getByLabel(text.date,{exact:true})).toHaveValue('2026-11-06');await expect(form.getByLabel(text.savedSupplier,{exact:true})).toHaveValue(supplierId);
  await expectNoHorizontalOverflow(page);await page.screenshot({path:info.outputPath('expense-conflict-refreshed-'+language+'.png'),fullPage:true});
  await form.getByRole('button',{name:text.save,exact:true}).click();await expect(form).toHaveCount(0);
  const expensePosts=posts.filter(post=>post.action==='expense');expect(expensePosts.map(post=>post.status)).toEqual([200,409,200]);expect(expensePosts[2].revision).toBe(expensePosts[1].revision+1);
  const saved=(await (await page.request.get(api+'?'+new URLSearchParams({kind:'expenses',q:'Concurrent draft '+language}))).json()).items;expect(saved).toHaveLength(1);expect(saved[0]).toMatchObject({concept:'Concurrent draft '+language,amountCents:2550,date:'2026-11-06',supplierId});
  expect((await db.from('pro_internal_expenses').select('id').eq('user_id',owner.id).throwOnError()).data).toHaveLength(2);

  // 3) Editing an existing expense never adopts a newer revision on its own.
  await panel.getByRole('heading',{name:'Concurrent draft '+language,exact:true}).click();const detail=page.getByRole('dialog',{name:text.internal,exact:true});await detail.getByRole('button',{name:text.edit,exact:true}).click();form=page.getByRole('dialog',{name:text.edit,exact:true});
  await form.getByLabel(text.description,{exact:true}).fill('Edited after conflict '+language);await bump('Second other tab '+language);
  const editRejected=page.waitForResponse(response=>new URL(response.url()).pathname===api&&response.request().method()==='POST'&&response.status()===409);await form.getByRole('button',{name:text.save,exact:true}).click();await editRejected;await expect(form.getByRole('alert')).toHaveText(text.conflict);
  expect(saved[0].concept).toBe('Concurrent draft '+language);expect(((await (await page.request.get(api+'?id='+saved[0].id)).json()).expense as {concept:string}).concept).toBe('Concurrent draft '+language);
  expect(pageErrors()).toEqual([]);
 }catch(error){bodyError=error;await page.screenshot({path:info.outputPath('failure-before-cleanup.png'),fullPage:true}).catch(()=>{});throw error;}finally{await page.goto('about:blank').catch(()=>{});try{await cleanupDisposableAccount(owner);}catch(cleanupError){throw new AggregateError(bodyError?[bodyError,cleanupError]:[cleanupError],'Expense revision fixture cleanup failed',{cause:bodyError});}}
});

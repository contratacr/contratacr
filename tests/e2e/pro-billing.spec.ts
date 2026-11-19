import {test,expect,type BrowserContext} from 'playwright/test';
import {createServerClient} from '@supabase/ssr';
import {createDisposableAccount,cleanupDisposableAccount} from './disposable-account';
import {regressionAdminClient} from './seed';
import {emptyBusiness} from '../../src/lib/pro/business';
import {expectNoHorizontalOverflow,gotoOK,openProSpaceFromPanel,proHubButton,proSpaceUrl} from './helpers';

test('Pro billing: bounded discovery, contextual search, saved editing, history and retry without operational mutations',async({page,browser,baseURL})=>{
 test.setTimeout(180000);expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');
 const owner=await createDisposableAccount({prefix:'pro-billing'}),other=await createDisposableAccount({prefix:'pro-billing-other'}),db=regressionAdminClient();let foreign:BrowserContext|undefined;
 async function login(context:BrowserContext,actor:typeof owner){const auth=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{getAll:()=>[],setAll:async cookies=>{await context.addCookies(cookies.map(c=>({name:c.name,value:c.value,url:baseURL!,sameSite:'Lax' as const})));}}});expect((await auth.auth.signInWithPassword({email:actor.email,password:actor.password})).error).toBeNull();return auth;}
 try{
  for(const actor of [owner,other]){await db.from('profiles').update({is_provider:true}).eq('id',actor.id).throwOnError();await db.from('professionals').insert({profile_id:actor.id,category_id:'desarrollo_web',business_name:'Facturación local de prueba',slug:'billing-'+actor.id,whatsapp:'',provincia_id:'al',canton_id:'al-at',verification_status:'pending'}).throwOnError();await db.from('pro_memberships').insert({user_id:actor.id,status:'active'}).throwOnError();}
  const document=emptyBusiness();document.clients=[{id:'client',name:'María Cliente',email:'maria@example.com',phone:'',notes:'No modificar',archived:false}];
  document.quotes=[{id:'quote',clientId:'client',title:'Presupuesto fachada',lines:[{description:'Servicio',quantity:1,price:100,tax:0}],status:'accepted',validUntil:'2027-12-31'}];
  document.work=Array.from({length:23},(_,n)=>({id:'work-'+n,clientId:'client',client:'María Cliente',service:n===0?'Pintura exterior':'Trabajo '+n,stage:'new' as const,start:'',end:'',cancelled:false,...(n===0?{quoteId:'quote'}:{})}));
  await db.from('pro_workspaces').insert({user_id:owner.id,document,revision:1}).throwOnError();
  const ids:string[]=[];
  for(let n=0;n<23;n++){const result=await db.rpc('pro_invoice_source',{p_user:owner.id,p_kind:'work',p_id:'work-'+n}).throwOnError();const s=result.data;const saved=await db.rpc('pro_invoice_draft_save',{p_user:owner.id,p_input:{action:'create',kind:'work',sourceId:'work-'+n,clientId:'client',fingerprint:s.fingerprint,manualTotalCents:10000,title:'Preparación '+String(n).padStart(2,'0'),notes:'Nota original',receiver:s.receiver}}).throwOnError();ids.push(saved.data);}
  const snapshot=async()=>(await db.from('pro_workspaces').select('document,revision').eq('user_id',owner.id).single().throwOnError()).data;
  const before=await snapshot(),original=(await db.from('pro_invoice_drafts').select('*').eq('user_id',owner.id).order('id').throwOnError()).data!;
  const auth=await login(page.context(),owner);expect((await auth.rpc('pro_invoice_draft_page',{p_user:owner.id})).error).not.toBeNull();
  foreign=await browser.newContext();await login(foreign,other);expect((await (await foreign.request.get('/api/pro/invoice-drafts')).json()).rows).toEqual([]);
  const first=await (await page.request.get('/api/pro/invoice-drafts')).json();expect(first.rows).toHaveLength(20);expect(first.nextCursor).toBeTruthy();
  const next=await (await page.request.get('/api/pro/invoice-drafts?after='+encodeURIComponent(first.nextCursor))).json();expect(next.rows).toHaveLength(3);expect(next.nextCursor).toBeNull();expect(new Set([...first.rows,...next.rows].map((r:{id:string})=>r.id)).size).toBe(23);
  expect((await page.request.get('/api/pro/invoice-drafts?'+new URLSearchParams({q:'other',after:first.nextCursor}))).status()).toBe(400);
  expect((await page.request.get('/api/pro/invoice-drafts?after=bad')).status()).toBe(400);
  const fullDownloads:string[]=[];await page.route('**/api/pro/workspace**',route=>{fullDownloads.push(route.request().url());return route.abort();});
  for(const path of ['/api/auth/session-mfa','/api/auth/registration-state'])expect((await page.request.get(path)).status()).toBe(200);
  await gotoOK(page,'/es/dashboard/profesional?tab=pro_billing');const recovery=page.locator('[data-session-recovery]');await expect(page.getByRole('heading',{name:'Borradores de factura',exact:true}).or(recovery)).toBeVisible();if(await recovery.isVisible()){await recovery.getByRole('button',{name:'Reintentar',exact:true}).click();await expect(recovery).toHaveCount(0);}
  const list=()=>page.getByRole('region',{name:'Borradores de facturación'}),cards=()=>list().getByRole('button',{name:/^Editar borrador:/});
  await expect(cards()).toHaveCount(20);await list().getByRole('button',{name:'Ver más borradores',exact:true}).click();await expect(cards()).toHaveCount(23);await expect(list().getByRole('button',{name:'Ver más borradores',exact:true})).toHaveCount(0);
  // Opening and closing preserves all pages already loaded, not just the query.
  await cards().first().click();await expect(page.getByRole('dialog',{name:'Borrador de factura',exact:true})).toBeVisible();await page.getByRole('dialog',{name:'Borrador de factura',exact:true}).getByRole('button',{name:'Cerrar',exact:true}).click();await expect(cards()).toHaveCount(23);
  const search=list().getByRole('textbox',{name:'Buscar borradores',exact:true});
  await search.fill('maria');await expect(page).toHaveURL(/buscarFactura=maria/);await expect(cards()).toHaveCount(20);
  await search.fill('Presupuesto fachada');await expect(cards()).toHaveCount(1);await expect(cards()).toContainText('Pintura exterior');await expect(cards()).toContainText('Preparación 00');
  await search.fill('Pintura exterior');await expect(page).toHaveURL(/buscarFactura=Pintura/);await expect(cards()).toHaveCount(1);await cards().click();
  const editor=()=>page.getByRole('dialog',{name:'Borrador de factura',exact:true});await expect(editor()).toContainText('₡100');await expect(editor().getByRole('textbox',{name:'Notas del borrador (opcional)'})).toHaveValue('Nota original');
  await editor().getByRole('textbox',{name:'Concepto de la factura',exact:true}).fill('Concepto editado');await editor().getByRole('textbox',{name:'Nombre del receptor',exact:true}).fill('Receptor especial');await editor().getByRole('button',{name:'Guardar borrador',exact:true}).click();await expect(editor()).toContainText('Borrador guardado');
  await page.reload();await expect(editor().getByRole('textbox',{name:'Concepto de la factura',exact:true})).toHaveValue('Concepto editado');await expect(editor().getByRole('textbox',{name:'Nombre del receptor',exact:true})).toHaveValue('Receptor especial');
  await editor().getByRole('button',{name:'Cerrar',exact:true}).click();await expect(editor()).toHaveCount(0);await expect(page).toHaveURL(/buscarFactura=Pintura/);await expect(cards()).toContainText('Concepto editado');await expect(cards()).toContainText('Receptor especial');
  await cards().click();await expect(editor()).toBeVisible();await page.goBack();await expect(editor()).toHaveCount(0);await expect(cards()).toHaveCount(1);
  await search.fill('Receptor especial');await expect(cards()).toHaveCount(1);await search.fill('%');await expect(list()).toContainText('No hay borradores para esta búsqueda.');await list().getByRole('button',{name:'Ver todos los borradores',exact:true}).click();await expect(cards()).toHaveCount(20);
  let failed=false;await page.route('**/api/pro/invoice-management?*',route=>{const url=new URL(route.request().url());if(url.searchParams.get('q')==='retry'&&!failed){failed=true;return route.fulfill({status:503,json:{error:'local test failure'}});}return route.continue();});
  await search.fill('retry');await expect(list().getByRole('alert')).toContainText('No se pudieron cargar');await list().getByRole('button',{name:'Reintentar',exact:true}).click();await expect(list()).toContainText('No hay borradores para esta búsqueda.');await search.fill('');await expect(cards()).toHaveCount(20);
  // «Ventas y cobros» left Inicio: sales are reached through ContrataCR Pro → Pagos → Borradores.
  await gotoOK(page,'/es/dashboard/profesional?tab=home');await openProSpaceFromPanel(page);await proHubButton(page,'Pagos').click();await expect(page).toHaveURL(proSpaceUrl('pro_payments'));await page.getByRole('navigation',{name:'Secciones de ventas y cobros',exact:true}).getByRole('button',{name:'Borradores',exact:true}).click();await expect(page).toHaveURL(proSpaceUrl('pro_billing'));await expect(cards()).toHaveCount(20);
  await expectNoHorizontalOverflow(page);expect(fullDownloads).toEqual([]);expect(await snapshot()).toEqual(before);
  const after=(await db.from('pro_invoice_drafts').select('*').eq('user_id',owner.id).order('id').throwOnError()).data!;expect(after.filter(row=>row.id!==ids[0])).toEqual(original.filter(row=>row.id!==ids[0]));expect(after.find(row=>row.id===ids[0])?.total_cents).toBe(10000);
 }finally{await foreign?.close();await cleanupDisposableAccount(owner);await cleanupDisposableAccount(other);}
});

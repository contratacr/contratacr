import { test,expect,type BrowserContext } from 'playwright/test';
import { createServerClient } from '@supabase/ssr';
import { createDisposableAccount,cleanupDisposableAccount } from './disposable-account';
import { regressionAdminClient } from './seed';
import { expectNoHorizontalOverflow ,hideNextDevOverlay,retryInterruptedNavigation} from './helpers';
import { emptyBusiness } from '../../src/lib/pro/business';

test('Pro quote UX: six exact states, filtered recovery and retrying the selected detail',async({page,baseURL},testInfo)=>{hideNextDevOverlay(page);retryInterruptedNavigation(page);
 test.setTimeout(120000);
 expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');
 const owner=await createDisposableAccount({prefix:'pro-quote-ux'}),db=regressionAdminClient();
 async function login(context:BrowserContext){const auth=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{getAll:()=>[],setAll:async cookies=>{await context.addCookies(cookies.map(c=>({name:c.name,value:c.value,url:baseURL!,sameSite:'Lax' as const})));}}});expect((await auth.auth.signInWithPassword({email:owner.email,password:owner.password})).error).toBeNull();}
 try{
  await db.from('profiles').update({is_provider:true}).eq('id',owner.id).throwOnError();
  await db.from('pro_memberships').insert({user_id:owner.id,status:'active'}).throwOnError();
  const professional=await db.from('professionals').insert({profile_id:owner.id,category_id:'desarrollo_web',business_name:'Negocio UX',slug:'quote-ux-'+owner.id,whatsapp:'',provincia_id:'al',canton_id:'al-at',verification_status:'pending'}).select('id').single().throwOnError();
  const quotes=['sent','withdrawn'].map((status,i)=>({id:crypto.randomUUID(),professional_id:professional.data!.id,client_id:null,client_name:'Cliente UX '+i,client_phone:'',public_code:'quote-ux-'+owner.id+'-'+i,quote_number:i+1,title:'Servicio UX '+i,items:[{description:'Servicio',quantity:1,unit_price:1000}],tax_mode:'exento',subtotal:1000,tax_amount:0,total:1000,status}));
  await login(page.context());await page.goto('/es/dashboard/profesional?tab=quotes');await expect(page.getByText('Aún no tiene cotizaciones',{exact:true})).toBeVisible();
  await db.from('quotes').insert(quotes).throwOnError();
  for(const en of [false,true]){
   await page.goto(`/${en?'en':'es'}/dashboard/profesional?tab=quotes`);
   const status=page.getByLabel(en?'Quote status':'Estado de cotización',{exact:true}),search=page.getByRole('textbox',{name:en?'Search quotes':'Buscar cotizaciones',exact:true});
   await expect(status).toBeVisible();await expect(status.locator('option')).toHaveCount(6);
   await status.selectOption('withdrawn');await expect(page.getByRole('heading',{name:'Servicio UX 1',exact:true})).toBeVisible();await expect(page.getByRole('heading',{name:'Servicio UX 0',exact:true})).toHaveCount(0);
   await search.fill('Servicio UX 1');await page.getByRole('button',{name:en?'Clear search':'Limpiar búsqueda',exact:true}).click();await expect(status).toHaveValue('withdrawn');await expect(search).toHaveValue('');await expect(search).toBeFocused();await expect(page.getByRole('heading',{name:'Servicio UX 1',exact:true})).toBeVisible();
   await search.fill('sin-coincidencias-ux');await expect(page.getByText(en?'No quotes match these filters':'No encontramos cotizaciones con esos filtros',{exact:true})).toBeVisible();
   await page.getByRole('button',{name:en?'Clear search and filters':'Limpiar búsqueda y filtros',exact:true}).click();await expect(status).toHaveValue('all');await expect(search).toHaveValue('');await expect(page.getByRole('heading',{name:'Servicio UX 0',exact:true})).toBeVisible();
   await expectNoHorizontalOverflow(page);await page.screenshot({path:testInfo.outputPath(`quotes-simple-${en?'en':'es'}.png`),fullPage:true});
  }
  await page.goto('/en/dashboard/profesional?tab=quotes&estado=unknown');await expect(page.getByLabel('Quote status',{exact:true})).toHaveValue('all');await expect(page.getByRole('heading',{name:'Servicio UX 0',exact:true})).toBeVisible();await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0);
  // A legacy ID may itself be a UUID: the explicit URL discriminator must win.
  const legacy=emptyBusiness();legacy.clients.push({id:'legacy-client',name:'Cliente anterior UX',email:'',phone:'',notes:'',archived:false});legacy.quotes.push({id:quotes[0].id,clientId:'legacy-client',title:'Cotización anterior UUID UX',lines:[{description:'Servicio anterior',quantity:1,price:750,tax:0}],status:'accepted',validUntil:'2026-12-01'});
  legacy.work.push({id:'legacy-appointment',clientId:'legacy-client',client:'Cliente anterior UX',service:'Cita con cotización anterior',stage:'scheduled',start:'2026-11-01T09:00:00-06:00',end:'2026-11-01T10:00:00-06:00',quoteId:quotes[0].id,cancelled:false});
  await db.from('pro_workspaces').insert({user_id:owner.id,document:legacy,revision:1}).throwOnError();
  await page.goto('/en/dashboard/profesional?tab=pro_agenda&cita=legacy-appointment');await expect(page.getByRole('dialog')).toContainText('Cita con cotización anterior');await page.getByRole('button',{name:'View quote',exact:true}).click();await expect(page).toHaveURL(/legacy=1/);await expect(page.getByRole('dialog')).toContainText('Cotización anterior UUID UX');await expect(page.getByRole('dialog')).not.toContainText('Servicio UX 0');
  await page.goto('/es/dashboard/profesional?tab=quotes&cotizacion='+quotes[0].id+'&legacy=1');await expect(page.getByRole('dialog')).toContainText('Cotización anterior UUID UX');await expect(page.getByRole('dialog')).not.toContainText('Servicio UX 0');
  await page.goto('/en/dashboard/profesional?tab=quotes');
  // Only the detail transport is interrupted: list, authentication and successful retry use the real local backend.
  let detailRequests=0;
  await page.route('**/api/pro/quotes?*',async route=>{const url=new URL(route.request().url());if(url.searchParams.get('id')===quotes[1].id){detailRequests++;if(detailRequests===1){await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Temporary test failure'})});return;}}await route.continue();});
  await page.getByLabel('Quote status',{exact:true}).selectOption('withdrawn');
  await page.getByRole('button').filter({has:page.getByRole('heading',{name:'Servicio UX 1',exact:true})}).click();
  const failed=page.getByRole('dialog');await expect(failed.getByRole('alert')).toContainText('This quote could not be loaded');await failed.getByRole('button',{name:'Retry',exact:true}).click();
  await expect(page.getByRole('dialog')).toContainText('Servicio UX 1');expect(detailRequests).toBe(2);
  await page.getByRole('dialog').getByRole('button',{name:'Close',exact:true}).click();await expect(page.getByLabel('Quote status',{exact:true})).toHaveValue('withdrawn');
  expect((await db.from('quotes').select('id,status').eq('professional_id',professional.data!.id).throwOnError()).data).toEqual(expect.arrayContaining(quotes.map(q=>({id:q.id,status:q.status}))));
  // A failed next page must stop automatic loading and retry precisely that cursor.
  const extra=Array.from({length:23},(_,i)=>({...quotes[0],id:crypto.randomUUID(),client_name:'Cliente paginado UX '+i,title:'Servicio paginado UX '+i,public_code:'quote-ux-page-'+owner.id+'-'+i,quote_number:i+10}));
  await db.from('quotes').insert(extra).throwOnError();
  const attemptedCursors:string[]=[];
  await page.route('**/api/pro/quotes?*',async route=>{const url=new URL(route.request().url()),after=url.searchParams.get('after');if(after&&!url.searchParams.has('id')){attemptedCursors.push(after);if(attemptedCursors.length===1){await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Next page temporarily unavailable'})});return;}}await route.continue();});
  await page.goto('/en/dashboard/profesional?tab=quotes');await page.getByLabel('Quote status',{exact:true}).selectOption('sent');
  const sentRows=page.getByRole('heading',{name:/^Servicio (?:paginado UX \d+|UX 0)$/});await expect(sentRows).toHaveCount(20);
  await page.getByRole('button',{name:'Show more',exact:true}).scrollIntoViewIfNeeded();await expect(page.getByRole('alert').filter({hasText:'Next page temporarily unavailable'})).toContainText('Next page temporarily unavailable');
  await page.getByRole('alert').filter({hasText:'Next page temporarily unavailable'}).scrollIntoViewIfNeeded();await sentRows.last().scrollIntoViewIfNeeded();await page.waitForTimeout(750);expect(attemptedCursors).toHaveLength(1);await expect(sentRows).toHaveCount(20);
  await page.getByRole('button',{name:'Retry',exact:true}).click();await expect(sentRows).toHaveCount(24);expect(attemptedCursors).toEqual([attemptedCursors[0],attemptedCursors[0]]);

 }finally{await page.goto('about:blank');await cleanupDisposableAccount(owner);}
});

import {test,expect,type BrowserContext} from 'playwright/test';
import {createServerClient} from '@supabase/ssr';
import {createDisposableAccount,cleanupDisposableAccount,type DisposableAccount} from './disposable-account';
import {regressionAdminClient} from './seed';
import {emptyBusiness} from '../../src/lib/pro/business';
import {crTodayISO} from '../../src/lib/time-cr';
import {stabilizeLocalProRuntime} from './pro-local-stable-runtime';
import {gotoOK,expectNoHorizontalOverflow,onAppPageError} from './helpers';
import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
const origin='http://127.0.0.1:3185',api='/api/pro/private-estimates';
async function login(context:BrowserContext,actor:DisposableAccount){const auth=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{getAll:()=>[],setAll:async cookies=>context.addCookies(cookies.map(cookie=>({name:cookie.name,value:cookie.value,url:origin,sameSite:'Lax' as const})))}});const result=await auth.auth.signInWithPassword({email:actor.email,password:actor.password});expect(result.error).toBeNull();expect(result.data.session).not.toBeNull();return result.data.session!.access_token;}
async function fixture(context:BrowserContext){await stabilizeLocalProRuntime(context,origin);const owner=await createDisposableAccount({prefix:'private-estimate-pdf'}),db=regressionAdminClient();try{const user=(await db.auth.admin.getUserById(owner.id)).data.user!;expect((await db.auth.admin.updateUserById(owner.id,{user_metadata:{...user.user_metadata,is_provider:true,role:'professional'}})).error).toBeNull();await db.from('profiles').update({is_provider:true,role:'professional'}).eq('id',owner.id).throwOnError();await db.from('pro_memberships').insert({user_id:owner.id,status:'active'}).throwOnError();const document=emptyBusiness(),clientId='private-origin-client',secondClient='private-origin-other',workId=crypto.randomUUID(),completedId=crypto.randomUUID(),today=crTodayISO();document.clients=[{id:clientId,name:'Cliente privado sin cuenta',email:'',phone:'',notes:'Conservar cliente',archived:false},{id:secondClient,name:'Cliente alternativo',email:'',phone:'',notes:'Conservar otro',archived:false}];document.products=[{id:'private-estimate-service',sku:'EST-LOCAL',name:'Servicio de catálogo privado',stock:0,minimum:0,cost:7,price:19.99,archived:false,unit:'hora',itemType:'service'}];document.work=[{id:workId,clientId,client:'Cliente privado sin cuenta',service:'Trabajo existente sin programar',stage:'new',start:'',end:'',cancelled:false},{id:completedId,clientId,client:'Cliente privado sin cuenta',service:'Trabajo concluido previo',stage:'completed',start:today+'T09:00:00-06:00',end:today+'T10:00:00-06:00',cancelled:false}];await db.from('pro_workspaces').insert({user_id:owner.id,document,revision:1}).throwOnError();const token=await login(context,owner);for(const endpoint of ['/api/auth/session-mfa','/api/auth/registration-state','/api/pro/access'])expect((await context.request.get(endpoint,{timeout:45000})).status()).toBe(200);for(const id of [workId,completedId])expect((await context.request.get('/api/pro/client-operations?'+new URLSearchParams({workId:id,clientId}),{timeout:45000})).status()).toBe(200);expect((await db.from('professionals').select('id').eq('profile_id',owner.id).throwOnError()).data).toEqual([]);return{owner,db,token,clientId,secondClient,workId,completedId};}catch(error){await cleanupDisposableAccount(owner);throw error;}}

for(const language of ['es','en'] as const)for(const mode of ['normal','long'] as const)test(`Private quote PDF: saved Unicode and money ${mode} (${language})`,async({page,baseURL},info)=>{
 test.setTimeout(180000);
 test.skip(mode==='normal'?info.project.name!=='webkit-mobile':info.project.name!=='chromium-desktop','Normal mobile and multipage desktop are distinct export gates.');
 expect(baseURL).toBe(origin);expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');
 const f=await fixture(page.context()),en=language==='en';
 try{
  if(mode==='long'){
   await f.db.from('pro_legacy_quotes').insert({user_id:f.owner.id,id:'legacy-large-pdf',clientId:f.clientId,title:'Cotización anterior de importe grande',status:'draft',validUntil:'2030-12-31'}).throwOnError();
   await f.db.from('pro_legacy_quote_lines').insert({user_id:f.owner.id,quote_id:'legacy-large-pdf',line_number:1,description:'Importe permitido por el modelo anterior',quantity:100000,price:100000000,tax:100}).throwOnError();
  }
  const clientUpdate={name:'Cliente Muñoz',tradeName:'Taller Álvarez',email:'cliente.pdf@example.test',phone:'88881111',address:mode==='long'?'Dirección de entrega - '.repeat(22):'Atenas, Alajuela'};
  await f.db.from('pro_clients').update(clientUpdate).eq('user_id',f.owner.id).eq('id',f.clientId).throwOnError();
  const contextResponse=await page.request.get(api+'?'+new URLSearchParams({view:'context',clientId:f.clientId}),{headers:{'X-Pro-Expected-Actor':f.owner.id}});expect(contextResponse.status()).toBe(200);const context=await contextResponse.json();
  const estimateId=crypto.randomUUID(),lines=Array.from({length:mode==='long'?16:1},(_,i)=>({id:crypto.randomUUID(),description:(i===0?'Revisión eléctrica 💡 - ':'Instalación y mantenimiento - ')+(mode==='long'?'Cableado, iluminación y revisión de conexiones seguras. '.repeat(7):'Álvarez, revisión de tomacorrientes.' )+' MARCADOR_'+(i+1),unit:'hora',qtyMilli:1250,unitPriceCents:1999,discountBps:1250,taxBps:1300,catalogProductId:null}));
  const input={action:'save',actionId:crypto.randomUUID(),estimateId,revision:0,clientId:f.clientId,refreshClient:false,clientFingerprint:context.clientFingerprint,source:null,issuer:{issuerName:'Servicios López & hijos',issuerIdType:'',issuerId:'',issuerEmail:'servicios.pdf@example.test',issuerPhone:'88882222',issuerAddress:'Atenas, Costa Rica',issuerActivity:''},title:'Mantenimiento eléctrico Álvarez',notes:mode==='long'?'Trabajo por revisar. '.repeat(70)+' NOTA_FINAL_PDF':'NOTA_FINAL_PDF',currency:en?'USD':'CRC',validUntil:'2026-12-31',lines};
  const saved=await page.request.post(api,{headers:{Origin:origin,'X-Pro-Expected-Actor':f.owner.id},data:input});expect(saved.status()).toBe(200);const body=await saved.json();expect(body.estimate.totalCents).toBe(2471*lines.length);
  let expectedActions=(await f.db.from('pro_private_estimate_actions').select('*').eq('actor_id',f.owner.id).order('action_id').throwOnError()).data;
  await f.db.from('pro_clients').update({name:'Nombre actual fuera del documento'}).eq('user_id',f.owner.id).eq('id',f.clientId).throwOnError();
  const writes:string[]=[],errors:string[]=[],downloads:string[]=[];page.on('download',download=>downloads.push(download.suggestedFilename()));page.on('request',request=>{if(['POST','PATCH','PUT','DELETE'].includes(request.method())&&new URL(request.url()).pathname.startsWith('/api/pro/'))writes.push(request.method()+' '+new URL(request.url()).pathname);});onAppPageError(page,message=>errors.push(message));
  await gotoOK(page,`/${language}/dashboard/pro?tab=quotes`);
  const row=page.locator(`[data-sales-estimate="private_estimate:${estimateId}"]`);await expect(row).toContainText(input.title,{timeout:45000});
  await row.getByRole('button',{name:en?'Preview':'Vista previa',exact:true}).click();const preview=page.locator('[data-private-estimate-preview]');await expect(preview).toContainText(input.issuer.issuerName);await expect(preview).toContainText(input.notes);
  await expectNoHorizontalOverflow(page);await page.screenshot({path:info.outputPath(`private-estimate-pdf-${mode}-${language}.png`),animations:'disabled'});
  const downloadPromise=page.waitForEvent('download',{timeout:120000});await page.getByRole('button',{name:en?'Download PDF':'Descargar PDF',exact:true}).click();const download=await downloadPromise;expect(download.suggestedFilename()).toBe(`${en?'estimate':'cotizacion'}-${estimateId.slice(0,8)}-v1-${input.currency}.pdf`);
  const target=join(process.cwd(),'tmp','pdfs');await mkdir(target,{recursive:true});const file=join(target,`private-estimate-${mode}-${language}.pdf`);await download.saveAs(file);expect(await download.failure()).toBeNull();await info.attach(`private-estimate-${mode}-${language}.pdf`,{path:file,contentType:'application/pdf'});
  await expect(page.getByRole('button',{name:en?'Download PDF':'Descargar PDF',exact:true})).toBeEnabled();
  if(mode==='normal'){
   if(en){const changed=await page.request.post(api,{headers:{Origin:origin,'X-Pro-Expected-Actor':f.owner.id},data:{...input,actionId:crypto.randomUUID(),revision:1,title:'Versión nueva que requiere revisar la vista previa'}});expect(changed.status()).toBe(200);expectedActions=(await f.db.from('pro_private_estimate_actions').select('*').eq('actor_id',f.owner.id).order('action_id').throwOnError()).data;}
   else await f.db.from('pro_memberships').update({status:'inactive'}).eq('user_id',f.owner.id).throwOnError();
   await page.getByRole('button',{name:en?'Download PDF':'Descargar PDF',exact:true}).click();await expect(preview.getByRole('alert')).toBeVisible();await expect(page.getByRole('button',{name:en?'Download PDF':'Descargar PDF',exact:true})).toBeEnabled();expect(downloads).toHaveLength(1);
  }
  expect(writes).toEqual([]);expect(errors).toEqual([]);expect((await f.db.from('pro_private_estimate_actions').select('*').eq('actor_id',f.owner.id).order('action_id').throwOnError()).data).toEqual(expectedActions);
  for(const table of ['notifications','notification_push_outbox'])expect((await f.db.from(table).select('*').eq('user_id',f.owner.id).throwOnError()).data).toEqual([]);
  expect((await f.db.from('professionals').select('id').eq('profile_id',f.owner.id).throwOnError()).data).toEqual([]);
 }finally{await page.goto('about:blank').catch(()=>{});await cleanupDisposableAccount(f.owner);}
});

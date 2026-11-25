import {test,expect,type Page,type BrowserContext} from 'playwright/test';
import {createServerClient} from '@supabase/ssr';
import {createDisposableAccount,cleanupDisposableAccount} from './disposable-account';
import {stabilizeLocalProRuntime} from './pro-local-stable-runtime';
import {warmLocalRoutes} from './helpers';
import {regressionAdminClient} from './seed';

type Language='es'|'en';
async function fixture(context:BrowserContext,baseURL:string){
 expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');
 const actor=await createDisposableAccount({prefix:'notification-read-failure'}),db=regressionAdminClient();
 try{
  await db.from('profiles').update({role:'professional',is_provider:true}).eq('id',actor.id).throwOnError();
  const account=await db.auth.admin.getUserById(actor.id);expect((await db.auth.admin.updateUserById(actor.id,{user_metadata:{...account.data.user!.user_metadata,role:'professional',is_provider:true}})).error).toBeNull();
  // More than the list's 100 fetched rows, plus another mode and chat: scope=all
  // must acknowledge the whole account rather than only loaded or visible IDs.
  const notifications=Array.from({length:103},(_,i)=>({user_id:actor.id,type:i===101?'project_cancelled':i===102?'direct_message':'new_project',title:'Read QA '+i,message:'Local read receipt fixture',read:false,created_at:new Date(Date.now()-i*60000).toISOString(),data:{push_suppressed:true,project_title:'Read QA '+i,category_id:'desarrollo_web',link:i===0?'/empleos':'/proyectos'}}));
  await db.from('notifications').insert(notifications).throwOnError();
  const saved=(await db.from('notifications').select('*').eq('user_id',actor.id).order('id').throwOnError()).data!;
  const outbox=(await db.from('notification_push_outbox').select('id,status,attempts').eq('user_id',actor.id).throwOnError()).data!;
  expect(outbox).toHaveLength(notifications.length);expect(outbox.every(row=>row.status==='suppressed'&&row.attempts===0)).toBe(true);
  expect((await db.from('notification_push_deliveries').select('id').in('outbox_id',outbox.map(row=>row.id)).throwOnError()).data).toEqual([]);
  expect((await db.from('user_push_tokens').select('id').eq('user_id',actor.id).throwOnError()).data).toEqual([]);
  const auth=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{getAll:()=>[],setAll:async cookies=>context.addCookies(cookies.map(c=>({name:c.name,value:c.value,url:baseURL,sameSite:'Lax' as const})))}});
  expect((await auth.auth.signInWithPassword({email:actor.email,password:actor.password})).error).toBeNull();
  return {actor,db,total:notifications.length,saved};
 }catch(error){await cleanupDisposableAccount(actor);throw error;}
}
async function watchReadFailures(page:Page){
 let mode:'503'|'abort'|'success'='503';const attempts:string[]=[];
 await page.addInitScript(()=>window.addEventListener('notificationsChanged',event=>{const detail=(event as CustomEvent<{sinLeer?:number}>).detail;if(detail?.sinLeer===0)sessionStorage.setItem('qa:false-read-zero',String(Number(sessionStorage.getItem('qa:false-read-zero')||0)+1));}));
 await page.route('**/rest/v1/notifications?**',route=>{
  if(route.request().method()!=='PATCH')return route.continue();
  expect(route.request().postDataJSON()).toEqual({read:true});attempts.push(route.request().url());
  if(mode==='success')return route.continue();
  return mode==='abort'?route.abort('failed'):route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'Local simulated read failure'})});
 });
 return {attempts,setMode:(next:typeof mode)=>{mode=next;}};
}
async function assertCachedUnread(page:Page,actorId:string){
 const cached=await page.evaluate(id=>JSON.parse(localStorage.getItem('ccr:notifications:'+id)||'[]') as {read:boolean}[],actorId);
 expect(cached.length).toBeGreaterThan(0);expect(cached.every(row=>row.read===false)).toBe(true);
 expect(await page.evaluate(()=>sessionStorage.getItem('qa:false-read-zero'))).toBeNull();
}
const errorCopy=(language:Language)=>language==='en'?'Could not mark as read. Please try again.':'No se pudo guardar como leída. Intente de nuevo.';
const retryCopy=(language:Language)=>language==='en'?'Try again':'Reintentar';
const markAllCopy=(language:Language)=>language==='en'?'Mark all read':'Marcar todas como leídas';
const bell=(page:Page,language:Language)=>page.getByRole('button',{name:language==='en'?'Notifications':'Notificaciones',exact:true}).filter({visible:true}).first();

for(const language of ['es','en'] as const){
 test(`Notification center retains unread data on failed acknowledgements and retries the entire account (${language})`,async({page,baseURL},testInfo)=>{
 // WebKit dev HMR full reloads interrupted goto in the 11-nov run (category C).
 await stabilizeLocalProRuntime(page.context(),baseURL!);await warmLocalRoutes(page,['/empleos','/proyectos','/notificaciones'].map(path=>(language==='en'?'/en':'')+path)); // same locale only: a warm-up sets NEXT_LOCALE
  test.setTimeout(120000);const {actor,db,total,saved}=await fixture(page.context(),baseURL!);const network=await watchReadFailures(page),prefix=language==='en'?'/en':'';
  const unread=async()=>{const result=await db.from('notifications').select('id',{count:'exact',head:true}).eq('user_id',actor.id).eq('read',false).throwOnError();return result.count;};
  try{
   await page.goto(prefix+'/notificaciones');const list=page.locator('.ccr-notifications-list');await expect(list).toContainText('Read QA 0');
   await expect(page.getByRole('alert').filter({hasText:errorCopy(language)})).toBeVisible();expect(await unread()).toBe(total);await assertCachedUnread(page,actor.id);
   network.setMode('abort');const before=network.attempts.length;await page.getByRole('button',{name:retryCopy(language),exact:true}).click();await expect.poll(()=>network.attempts.length).toBeGreaterThan(before);await expect(page.getByRole('alert').filter({hasText:errorCopy(language)})).toBeVisible();expect(await unread()).toBe(total);await assertCachedUnread(page,actor.id);
   // Opening remains useful even when the read receipt cannot be saved.
   await list.getByRole('button').filter({hasText:'Read QA 0'}).click();await expect(page).toHaveURL(new RegExp(prefix+'/empleos(?:[?#]|$)'));expect(await unread()).toBe(total);await assertCachedUnread(page,actor.id);await expect(bell(page,language)).toContainText('9+');
   network.setMode('503');await page.goto(prefix+'/notificaciones');await expect(page.getByRole('alert').filter({hasText:errorCopy(language)})).toBeVisible();network.setMode('success');await page.getByRole('button',{name:retryCopy(language),exact:true}).click();await expect.poll(unread).toBe(0);expect((await db.from('notifications').select('*').eq('user_id',actor.id).order('id').throwOnError()).data).toEqual(saved.map(row=>({...row,read:true})));
   const retryUrl=new URL(network.attempts.at(-1)!);expect(retryUrl.searchParams.get('user_id')).toBe('eq.'+actor.id);expect(retryUrl.searchParams.get('read')).toBe('eq.false');expect(retryUrl.searchParams.has('id')).toBe(false);
   await expect(page.getByRole('alert').filter({hasText:errorCopy(language)})).toHaveCount(0);
   // /proyectos is the mobile Projects hub (directory app) with no header bell; /empleos keeps the bell on every width.
   await page.goto(prefix+'/empleos');await expect(bell(page,language)).not.toContainText('9+');
   await page.screenshot({path:testInfo.outputPath('read-retry-'+language+'.png')});
  }finally{await page.goto('about:blank');await cleanupDisposableAccount(actor);}
 });
 test(`Desktop bell preserves unread counts on read failure and still opens destinations (${language})`,async({page,baseURL})=>{
 // WebKit dev HMR full reloads interrupted goto in the 11-nov run (category C).
 await stabilizeLocalProRuntime(page.context(),baseURL!);await warmLocalRoutes(page,['/empleos','/proyectos','/notificaciones'].map(path=>(language==='en'?'/en':'')+path)); // same locale only: a warm-up sets NEXT_LOCALE
  test.skip((page.viewportSize()?.width??0)<1024,'Popover belongs to desktop; the center is covered on mobile.');test.setTimeout(120000);
  const {actor,db,total,saved}=await fixture(page.context(),baseURL!),network=await watchReadFailures(page),prefix=language==='en'?'/en':'';
  const unread=async()=>{const result=await db.from('notifications').select('id',{count:'exact',head:true}).eq('user_id',actor.id).eq('read',false).throwOnError();return result.count;};
  try{
   await page.goto(prefix+'/proyectos');await expect(bell(page,language)).toContainText('9+');await bell(page,language).click();await page.getByRole('button',{name:markAllCopy(language),exact:true}).click();await expect(page.getByRole('alert').filter({hasText:errorCopy(language)})).toBeVisible();expect(await unread()).toBe(total);await assertCachedUnread(page,actor.id);await expect(bell(page,language)).toContainText('9+');
   network.setMode('abort');const before=network.attempts.length;await page.getByRole('button',{name:retryCopy(language),exact:true}).click();await expect.poll(()=>network.attempts.length).toBeGreaterThan(before);await expect(page.getByRole('alert').filter({hasText:errorCopy(language)})).toBeVisible();expect(await unread()).toBe(total);await assertCachedUnread(page,actor.id);
   // Choose a distinct valid destination so navigation is observable even on failure.
   await page.getByRole('button').filter({hasText:'Read QA 0'}).click();await expect(page).toHaveURL(new RegExp(prefix+'/empleos(?:[?#]|$)'));await expect(bell(page,language)).toHaveAttribute('aria-expanded','false');expect(await unread()).toBe(total);await assertCachedUnread(page,actor.id);
   await bell(page,language).click();network.setMode('success');await page.getByRole('button',{name:markAllCopy(language),exact:true}).click();await expect.poll(unread).toBe(0);expect((await db.from('notifications').select('*').eq('user_id',actor.id).order('id').throwOnError()).data).toEqual(saved.map(row=>({...row,read:true})));await expect(bell(page,language)).not.toContainText('9+');
   const retryUrl=new URL(network.attempts.at(-1)!);expect(retryUrl.searchParams.get('user_id')).toBe('eq.'+actor.id);expect(retryUrl.searchParams.get('read')).toBe('eq.false');expect(retryUrl.searchParams.has('id')).toBe(false);
  }finally{await page.goto('about:blank');await cleanupDisposableAccount(actor);}
 });
}

for(const surface of ['center','bell'] as const)test(`A delayed ${surface} mark-all acknowledgement preserves a newly arrived unread notification (en)`,async({page,baseURL})=>{
 // WebKit dev HMR full reloads interrupted goto in the 11-nov run (category C).
 await stabilizeLocalProRuntime(page.context(),baseURL!);await warmLocalRoutes(page,['/en/empleos','/en/proyectos','/en/notificaciones']); // same locale only: a warm-up sets NEXT_LOCALE
 test.skip(surface==='bell'&&(page.viewportSize()?.width??0)<1024,'Popover belongs to desktop.');
 test.setTimeout(120000);const {actor,db,saved}=await fixture(page.context(),baseURL!);
 let release=()=>{};const acknowledgement=new Promise<void>(resolve=>{release=resolve;});let savedBeforeAcknowledgement=false,patches=0;
 await page.addInitScript(()=>window.addEventListener('notificationsChanged',event=>{if((event as CustomEvent<{sinLeer?:number}>).detail?.sinLeer===0)sessionStorage.setItem('qa:false-read-zero','1');}));
 await page.route('**/rest/v1/notifications?**',async route=>{
  if(route.request().method()!=='PATCH')return route.continue();
  patches++;expect(route.request().postDataJSON()).toEqual({read:true});
  const response=await route.fetch();expect(response.status()).toBe(204);savedBeforeAcknowledgement=true;
  await acknowledgement;return route.fulfill({response});
 });
 try{
  await page.goto(surface==='center'?'/en/notificaciones':'/en/proyectos');
  if(surface==='bell'){await expect(bell(page,'en')).toContainText('9+');await bell(page,'en').click();await page.getByRole('button',{name:markAllCopy('en'),exact:true}).click();}
  await expect(page.getByText(/Read QA 0/).first()).toBeVisible();await expect.poll(()=>savedBeforeAcknowledgement).toBe(true);
  expect((await db.from('notifications').select('id').eq('user_id',actor.id).eq('read',false).throwOnError()).data).toEqual([]);
  const arrival=(await db.from('notifications').insert({user_id:actor.id,type:'new_project',title:'New notice during acknowledgement',message:'Local late arrival',read:false,data:{push_suppressed:true,project_title:'Late arrival after saved read',category_id:'desarrollo_web',link:'/empleos'}}).select('*').single().throwOnError()).data!;
  // A normal refresh/realtime update can arrive while the earlier PATCH's ACK
  // is in flight. Ensure the cache has actually observed the new notification.
  await page.evaluate(({actorId,notificationId})=>{window.addEventListener('ccr:notifications-cache-changed',()=>{const rows=JSON.parse(localStorage.getItem('ccr:notifications:'+actorId)||'[]') as {id:string;read:boolean}[];if(rows.find(row=>row.id===notificationId)?.read===true)sessionStorage.setItem('qa:late-arrival-false-read','1');});window.dispatchEvent(new Event('notificationsChanged'));},{actorId:actor.id,notificationId:arrival.id});
  await expect(page.getByText(/Late arrival after saved read/).first()).toBeVisible();
  await expect.poll(()=>page.evaluate(({actorId,notificationId})=>(JSON.parse(localStorage.getItem('ccr:notifications:'+actorId)||'[]') as {id:string;read:boolean}[]).find(row=>row.id===notificationId)?.read,{actorId:actor.id,notificationId:arrival.id})).toBe(false);
  await page.evaluate(()=>window.addEventListener('notificationsChanged',()=>sessionStorage.setItem('qa:read-ack-observed','1'),{once:true}));
  release();await expect.poll(()=>page.evaluate(()=>sessionStorage.getItem('qa:read-ack-observed'))).toBe('1');expect(patches).toBe(1);
  // Let the original callback settle; a second navigation then reads the same
  // persisted cache and server count, rather than observing pending UI alone.
  await expect.poll(async()=>{const rows=(await db.from('notifications').select('*').eq('user_id',actor.id).order('id').throwOnError()).data!;return rows;}).toEqual([...saved.map(row=>({...row,read:true})),arrival].sort((a,b)=>a.id.localeCompare(b.id)));
  await page.goto('/en/empleos');await expect(bell(page,'en')).toHaveText('1');
  const cached=await page.evaluate(id=>JSON.parse(localStorage.getItem('ccr:notifications:'+id)||'[]') as {id:string;read:boolean}[],actor.id);expect(cached.find(row=>row.id===arrival.id)?.read).toBe(false);expect(await page.evaluate(()=>sessionStorage.getItem('qa:false-read-zero'))).toBeNull();expect(patches).toBe(1);expect(await page.evaluate(()=>sessionStorage.getItem('qa:late-arrival-false-read'))).toBeNull();
 }finally{release();await page.goto('about:blank');await cleanupDisposableAccount(actor);}
});

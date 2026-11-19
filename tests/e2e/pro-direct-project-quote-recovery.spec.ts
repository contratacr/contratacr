import {test,expect,type BrowserContext,type Page,type Route,type Dialog} from 'playwright/test';
import {createServerClient} from '@supabase/ssr';
import {createDisposableAccount,cleanupDisposableAccount} from './disposable-account';
import {stabilizeLocalProRuntime} from './pro-local-stable-runtime';
import {regressionAdminClient} from './seed';
import {emptyBusiness} from '../../src/lib/pro/business';
import type {DirectQuoteWrite} from '../../src/lib/pro/direct-quote-write-recovery';
import {expectNoHorizontalOverflow,onAppPageError} from './helpers';

const endpoint='/api/pro/quote-create';
const labels={
 es:{name:'Ej.: María Rodríguez',description:'Descripción',price:'Precio (₡)',saved:'Cliente guardado',create:'Crear cotización',send:'Enviar cotización',check:'Comprobar guardado',close:'Cerrar',prepare:'Preparar cotización',conflict:'Tiene una cotización sin terminar para otro cliente.',continueDraft:'Continuar cotización anterior',discard:'Descartar formulario y preparar esta solicitud'},
 en:{name:'E.g. María Rodríguez',description:'Description',price:'Price (₡)',saved:'Saved customer',create:'Create quote',send:'Send quote',check:'Check saved result',close:'Close',prepare:'Prepare quote',conflict:'You have an unfinished quote for another customer.',continueDraft:'Continue previous quote',discard:'Discard form and prepare this request'},
};

for(const language of ['es','en'] as const)test(`Direct and project quote creation recovers one atomic result without replacing another draft [${language}]`,async({page,browser,baseURL},info)=>{
 // WebKit dev HMR full reloads interrupted goto in the 11-nov run (category C).
 await stabilizeLocalProRuntime(page.context(),baseURL!);
 test.setTimeout(240000);expect(baseURL).toMatch(/^http:\/\/(?:127\.0\.0\.1|localhost):3185\/?$/);expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');
 const owner=await createDisposableAccount({prefix:'atomic-quote-owner'}),customer=await createDisposableAccount({prefix:'atomic-quote-customer'}),db=regressionAdminClient();
 const actors=[owner,customer],contexts:BrowserContext[]=[],text=labels[language],prefix=language==='en'?'/en':'';
 const draftKey='ccr:pro:quote-draft:'+owner.id,writeKey='ccr:pro:direct-quote-write:'+owner.id;
 const posts:string[]=[],forbidden:string[]=[],runtimeErrors:string[]=[];let mode:'normal'|'lost'|'401'|'403'|'ack-read-failed'='normal',failedRead=false,bodyError:unknown;
 const otherContact='unrelated-draft-customer',linkedContact='private-direct-customer';
 async function login(context:BrowserContext,actor:typeof owner){const client=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{getAll:()=>[],setAll:async cookies=>context.addCookies(cookies.map(cookie=>({name:cookie.name,value:cookie.value,url:baseURL!,sameSite:'Lax' as const})))}});expect((await client.auth.signInWithPassword({email:actor.email,password:actor.password})).error).toBeNull();}
 // Explicit reload models the user accepting the native unsaved-work warning.
 // Other navigation keeps its existing cancel/guard assertions unchanged.
 async function reload(p:Page){const accept=(dialog:Dialog)=>{if(dialog.type()==='beforeunload')void dialog.accept();};p.on('dialog',accept);try{await p.reload();}finally{p.off('dialog',accept);}}
 const form=(p:Page)=>p.getByRole('dialog').filter({has:p.getByPlaceholder(text.description,{exact:true})});
 async function journal(){const raw=await page.evaluate(key=>localStorage.getItem(key),writeKey);expect(raw).not.toBeNull();return JSON.parse(raw!) as DirectQuoteWrite;}
 async function storedDraft(p:Page){return p.evaluate(key=>sessionStorage.getItem(key),draftKey);}
 async function quotes(professionalId:string){return (await db.from('quotes').select('*').eq('professional_id',professionalId).order('quote_number').throwOnError()).data!;}
 async function receipts(){return (await db.from('pro_direct_project_quote_actions').select('*').eq('actor_id',owner.id).order('action_id').throwOnError()).data!;}
 async function links(){return (await db.from('pro_quote_links').select('*').eq('user_id',owner.id).order('quoteId').throwOnError()).data!;}
 async function readOnlyBusiness(){const result:Record<string,unknown>={};for(const table of ['pro_work','pro_products','pro_client_entries','pro_legacy_quotes','pro_invoice_drafts'])result[table]=(await db.from(table).select('*').eq('user_id',owner.id).throwOnError()).data;return result;}
 async function blocked(p:Page){const editor=form(p);await expect(editor.getByPlaceholder(text.description,{exact:true})).toBeDisabled();await expect(editor.getByLabel(text.price,{exact:true})).toBeDisabled();await editor.getByRole('button',{name:text.close,exact:true}).click();await expect(editor).toBeVisible();await p.keyboard.press('Escape');await expect(editor).toBeVisible();}
 async function openDirect(p:Page,clientId?:string){await p.goto(prefix+'/dashboard/profesional?'+new URLSearchParams({tab:'quotes',nueva:'1',...(clientId?{cliente:clientId}:{})}));await expect(form(p).getByPlaceholder(text.description,{exact:true})).toBeVisible();}
 async function settle(p:Page,description:string){await expect.poll(()=>new URL(p.url()).searchParams.get('cotizacion')).not.toBeNull();await expect(p.getByRole('dialog')).toContainText(description);await expect.poll(()=>p.evaluate(key=>localStorage.getItem(key),writeKey)).toBeNull();}
 async function intercept(route:Route){
  const url=new URL(route.request().url());
  if((url.pathname==='/api/quotes'||url.pathname==='/api/pro/quote-link')&&route.request().method()==='POST'){
   forbidden.push(url.pathname);return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Conventional write is forbidden in this atomic test'})});
  }
  if(url.pathname==='/api/pro/quotes'&&route.request().method()==='GET'){
   if(failedRead&&url.searchParams.has('id'))return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Fixture canonical read unavailable'})});
   return route.continue();
  }
  if(url.pathname!==endpoint||route.request().method()!=='POST')return route.continue();
  posts.push(route.request().postData()!);
  if(mode==='401'||mode==='403')return route.fulfill({status:Number(mode),contentType:'application/json',body:JSON.stringify({error:'Fixture session unavailable'})});
  if(mode==='lost'){const response=await route.fetch();expect(response.status()).toBe(200);return route.abort();}
  if(mode==='ack-read-failed'){const response=await route.fetch();expect(response.status()).toBe(200);failedRead=true;return route.fulfill({response});}
  return route.continue();
 }
 try{
  const auth=await db.auth.admin.getUserById(owner.id);expect((await db.auth.admin.updateUserById(owner.id,{user_metadata:{...auth.data.user!.user_metadata,role:'professional',is_provider:true}})).error).toBeNull();await db.from('profiles').update({role:'professional',is_provider:true}).eq('id',owner.id).throwOnError();await db.from('pro_memberships').insert({user_id:owner.id,status:'active'}).throwOnError();
  const professional=(await db.from('professionals').insert({profile_id:owner.id,category_id:'redes_internet',business_name:'Atomic quote fixture',slug:'atomic-quote-'+owner.id,whatsapp:'',provincia_id:'al',canton_id:'al-al',verification_status:'pending',is_banned:false}).select('id').single().throwOnError()).data!;
  const workspaceDocument=emptyBusiness();workspaceDocument.clients=[{id:linkedContact,name:'Private contact '+language,email:'',phone:'',notes:'Keep private contact notes',archived:false},{id:otherContact,name:'Unrelated customer '+language,email:'',phone:'',notes:'Keep unrelated draft context',archived:false}];await db.from('pro_workspaces').insert({user_id:owner.id,document:workspaceDocument,revision:1}).throwOnError();
  const project=(await db.from('projects').insert({client_id:customer.id,title:'Causal quote project '+language,description:'Preserve the original project request.',category_id:'redes_internet',provincia_id:'al',canton_id:'al-al',status:'open',allow_direct_contact:true,allow_phone_contact:false}).select('*').single().throwOnError()).data!;
  for(const actor of actors)await db.from('notification_once_receipts').insert({user_id:actor.id,type:'resena_google',status:'historical_unknown',sent_at:null}).throwOnError();
  await login(page.context(),owner);await page.context().route('**/api/**',intercept);
  page.context().on('page',p=>onAppPageError(p,message=>runtimeErrors.push(message)));onAppPageError(page,message=>runtimeErrors.push(message));
  const {viewport,isMobile,hasTouch,userAgent,deviceScaleFactor}=info.project.use;const anonymous=await browser.newContext({baseURL,viewport,isMobile,hasTouch,userAgent,deviceScaleFactor});contexts.push(anonymous);anonymous.on('page',p=>onAppPageError(p,message=>runtimeErrors.push(message)));
  const baseline=await readOnlyBusiness(),notifications=(await db.from('notifications').select('*').in('user_id',actors.map(actor=>actor.id)).order('id').throwOnError()).data;
  const contacts=(await db.from('pro_clients').select('*').eq('user_id',owner.id).order('id').throwOnError()).data!;

  // An independently created draft with identical commercial content/context
  // is not owned by the other tab's action. Content equality must never erase it.
  const otherPage=await page.context().newPage();await openDirect(otherPage);await form(otherPage).getByPlaceholder(text.name,{exact:true}).fill('Manual recipient '+language);await otherPage.getByPlaceholder(text.description,{exact:true}).fill('Manual atomic quote '+language);await otherPage.getByLabel(text.price,{exact:true}).fill('1234');
  await expect.poll(async()=>JSON.parse((await storedDraft(otherPage))||'null')?.rows[0]?.unit_price).toBe('1234');const otherDraft=await storedDraft(otherPage);

  // Manual direct quote: no client account and no private contact link. A
  // received ACK followed by GET503 must recover using reads alone.
  await openDirect(page);await form(page).getByPlaceholder(text.name,{exact:true}).fill('Manual recipient '+language);await form(page).getByPlaceholder(text.description,{exact:true}).fill('Manual atomic quote '+language);await form(page).getByLabel(text.price,{exact:true}).fill('1234');
  mode='ack-read-failed';await form(page).getByRole('button',{name:text.create,exact:true}).click();await expect(form(page).getByRole('button',{name:text.check,exact:true})).toBeEnabled();const manual=await journal();expect(manual.phase).toBe('confirmed');const manualInput=JSON.parse(manual.body);expect(manualInput).toMatchObject({context:'direct',proClientId:null});expect(JSON.parse(otherDraft!).clientName).toBe(manualInput.clientName);expect(JSON.parse(otherDraft!).rows).toEqual(manualInput.items.map((row:{description:string;quantity:number;unit_price:number})=>({description:row.description,quantity:String(row.quantity),unit_price:String(row.unit_price)})));expect(await quotes(professional.id)).toHaveLength(1);expect(await receipts()).toHaveLength(1);expect(await links()).toEqual([]);await blocked(page);
  const committedPosts=posts.length;await reload(otherPage);await expect(form(otherPage).getByRole('button',{name:text.check,exact:true})).toBeEnabled();expect(posts).toHaveLength(committedPosts);expect(await storedDraft(otherPage)).toBe(otherDraft);await blocked(otherPage);
  mode='normal';failedRead=false;await form(otherPage).getByRole('button',{name:text.check,exact:true}).click();await settle(otherPage,'Manual atomic quote '+language);expect(posts).toHaveLength(committedPosts);expect(await storedDraft(otherPage)).toBe(otherDraft);
  await openDirect(otherPage);await expect(form(otherPage).getByPlaceholder(text.name,{exact:true})).toHaveValue('Manual recipient '+language);await expect(form(otherPage).getByPlaceholder(text.description,{exact:true})).toHaveValue('Manual atomic quote '+language);await expect(form(otherPage).getByLabel(text.price,{exact:true})).toHaveValue('1234');
  // The origin tab still knows the same action after another tab resolves it.
  // Explicitly checking it again may replay the receipt, never create a quote.
  await reload(page);await expect(form(page).getByRole('button',{name:text.check,exact:true})).toBeEnabled();await form(page).getByRole('button',{name:text.check,exact:true}).click();await settle(page,'Manual atomic quote '+language);expect(await quotes(professional.id)).toHaveLength(1);expect(await receipts()).toHaveLength(1);expect(posts.filter(body=>JSON.parse(body).clientActionId===manualInput.clientActionId).every(body=>body===manual.body)).toBe(true);
  await otherPage.close();

  // A linked direct quote is a private customer snapshot, not proof that the
  // recipient has an app account. Archiving after commit cannot break replay.
  const differentPage=await page.context().newPage();await openDirect(differentPage,otherContact);await form(differentPage).getByPlaceholder(text.description,{exact:true}).fill('Unrelated draft remains '+language);await form(differentPage).getByLabel(text.price,{exact:true}).fill('777');await expect.poll(async()=>JSON.parse((await storedDraft(differentPage))||'null')?.rows[0]?.unit_price).toBe('777');const differentDraft=await storedDraft(differentPage);
  await openDirect(page,linkedContact);await form(page).getByPlaceholder(text.description,{exact:true}).fill('Private linked atomic quote '+language);await form(page).getByLabel(text.price,{exact:true}).fill('2500');mode='lost';await form(page).getByRole('button',{name:text.create,exact:true}).click();await expect(form(page).getByRole('button',{name:text.check,exact:true})).toBeEnabled();const linked=await journal(),linkedInput=JSON.parse(linked.body);expect(linked).toMatchObject({phase:'uncertain',quoteId:null});expect(linkedInput).toMatchObject({context:'direct',proClientId:linkedContact});await blocked(page);
  // The other tab was already editing before this account-wide attempt began.
  // Its first save collides before transport; preserve that draft, adopt the
  // existing journal and never POST a second quote for the colliding action.
  const beforeCollision=posts.length;await form(differentPage).getByRole('button',{name:text.create,exact:true}).click();let conflict=differentPage.getByRole('dialog');await expect(conflict.getByText(text.conflict,{exact:true})).toBeVisible();await expect(conflict.getByRole('button',{name:text.discard,exact:true})).toBeDisabled();expect(posts).toHaveLength(beforeCollision);expect(await journal()).toEqual(linked);expect(await storedDraft(differentPage)).toBe(differentDraft);expect(await differentPage.evaluate(key=>sessionStorage.getItem(key),writeKey)).toBeNull();
  await reload(differentPage);conflict=differentPage.getByRole('dialog');await expect(conflict.getByText(text.conflict,{exact:true})).toBeVisible();await expect(conflict.getByRole('button',{name:text.discard,exact:true})).toBeDisabled();expect(posts).toHaveLength(beforeCollision);expect(await storedDraft(differentPage)).toBe(differentDraft);
  for(const status of ['401','403'] as const){mode=status;const response=page.waitForResponse(r=>new URL(r.url()).pathname===endpoint&&r.status()===Number(status));await form(page).getByRole('button',{name:text.check,exact:true}).click();await response;await expect(form(page).getByRole('button',{name:text.check,exact:true})).toBeEnabled();expect(await journal()).toEqual(linked);await blocked(page);}
  await db.from('pro_clients').update({archived:true}).eq('user_id',owner.id).eq('id',linkedContact).throwOnError();const linkedPosts=posts.length;await reload(page);await expect(form(page).getByRole('button',{name:text.check,exact:true})).toBeEnabled();expect(posts).toHaveLength(linkedPosts);expect(await journal()).toEqual(linked);mode='normal';await form(page).getByRole('button',{name:text.check,exact:true}).click();await settle(page,'Private linked atomic quote '+language);expect(await storedDraft(differentPage)).toBe(differentDraft);await conflict.getByRole('button',{name:text.continueDraft,exact:true}).click();await expect(form(differentPage).getByPlaceholder(text.description,{exact:true})).toHaveValue('Unrelated draft remains '+language);await expect(form(differentPage).getByLabel(text.price,{exact:true})).toHaveValue('777');await differentPage.close();
  const linkedBodies=posts.filter(body=>JSON.parse(body).clientActionId===linkedInput.clientActionId);expect(linkedBodies).toHaveLength(4);expect(linkedBodies.every(body=>body===linked.body)).toBe(true);const afterLinked=await quotes(professional.id);expect(afterLinked).toHaveLength(2);expect(afterLinked[1]).toMatchObject({client_id:null,project_id:null,total:2500});expect(await links()).toEqual([expect.objectContaining({quoteId:afterLinked[1].id,clientId:linkedContact})]);expect(await receipts()).toHaveLength(2);

  // Project creation starts at the real project CTA and keeps its exact client
  // relation. Closing the disposable project after commit must still replay.
  await page.goto(prefix+'/proyectos/'+project.id);await page.getByRole('button',{name:text.prepare,exact:true}).click();await expect(page).toHaveURL(/proyectoOrigen=/);expect(new URL(page.url()).searchParams.get('cliente')).toBe('reservation-'+customer.id);await expect(form(page).getByPlaceholder(text.description,{exact:true})).toHaveValue(project.title);await expect(form(page).getByLabel(text.saved,{exact:true})).toHaveCount(0);await form(page).getByLabel(text.price,{exact:true}).fill('3750');
  mode='lost';await form(page).getByRole('button',{name:text.send,exact:true}).click();await expect(form(page).getByRole('button',{name:text.check,exact:true})).toBeEnabled();const causal=await journal(),causalInput=JSON.parse(causal.body);expect(causalInput).toMatchObject({context:'project',projectId:project.id,proClientId:'reservation-'+customer.id});expect(await quotes(professional.id)).toHaveLength(3);
  await db.from('projects').update({status:'completed'}).eq('id',project.id).throwOnError();const projectPosts=posts.length;await reload(page);await expect(form(page).getByRole('button',{name:text.check,exact:true})).toBeEnabled();expect(posts).toHaveLength(projectPosts);expect(await journal()).toEqual(causal);mode='normal';await form(page).getByRole('button',{name:text.check,exact:true}).click();await settle(page,project.title);
  const causalBodies=posts.filter(body=>JSON.parse(body).clientActionId===causalInput.clientActionId);expect(causalBodies).toHaveLength(2);expect(causalBodies.every(body=>body===causal.body)).toBe(true);
  const allQuotes=await quotes(professional.id);expect(allQuotes).toHaveLength(3);expect(allQuotes[0]).toMatchObject({client_id:null,project_id:null,total:1234});expect(allQuotes[2]).toMatchObject({client_id:customer.id,project_id:project.id,total:3750});expect(await receipts()).toHaveLength(3);expect(await links()).toEqual(expect.arrayContaining([expect.objectContaining({quoteId:allQuotes[1].id,clientId:linkedContact}),expect.objectContaining({quoteId:allQuotes[2].id,clientId:'reservation-'+customer.id})]));expect(await links()).toHaveLength(2);
  for(const receipt of await receipts())expect(posts.map(body=>JSON.parse(body))).toContainEqual(receipt.input);
  for(const quote of allQuotes){expect(quote.public_code).toMatch(/^[abcdefghjkmnpqrstuvwxyz23456789]{12}$/);const publicPage=await anonymous.newPage();const response=await publicPage.goto(prefix+'/cotizacion/'+quote.public_code);expect(response?.status()).toBe(200);await expect(publicPage.locator('body')).toContainText(quote.items[0].description);await expectNoHorizontalOverflow(publicPage);await publicPage.close();}
  expect(forbidden).toEqual([]);expect((await db.from('notification_push_outbox').select('id').in('user_id',actors.map(actor=>actor.id)).throwOnError()).data).toEqual([]);expect((await db.from('user_push_tokens').select('id').in('user_id',actors.map(actor=>actor.id)).throwOnError()).data).toEqual([]);expect((await db.from('notification_push_deliveries').select('id,notification_push_outbox!inner(user_id)').in('notification_push_outbox.user_id',actors.map(actor=>actor.id)).throwOnError()).data).toEqual([]);expect(await readOnlyBusiness()).toEqual(baseline);expect((await db.from('notifications').select('*').in('user_id',actors.map(actor=>actor.id)).order('id').throwOnError()).data).toEqual(notifications);
  const finalContacts=(await db.from('pro_clients').select('*').eq('user_id',owner.id).order('id').throwOnError()).data!;for(const contact of contacts)expect(finalContacts.find(row=>row.id===contact.id)).toEqual({...contact,archived:contact.id===linkedContact});expect(finalContacts).toHaveLength(3);
  const finalProject=(await db.from('projects').select('*').eq('id',project.id).single().throwOnError()).data!;expect(finalProject.status).toBe('completed');expect(Object.fromEntries(Object.entries(finalProject).filter(([key])=>!['status','updated_at'].includes(key)))).toEqual(Object.fromEntries(Object.entries(project).filter(([key])=>!['status','updated_at'].includes(key))));await expectNoHorizontalOverflow(page);await page.screenshot({path:info.outputPath('atomic-project-quote-'+language+'.png'),fullPage:true});expect(runtimeErrors).toEqual([]);
 }catch(error){bodyError=error;for(const [index,activePage] of page.context().pages().entries())await activePage.screenshot({path:info.outputPath('failure-before-cleanup-'+index+'.png'),fullPage:true}).catch(()=>{});throw error;}finally{
  await page.goto('about:blank').catch(()=>{});const cleanupErrors:unknown[]=[];for(const context of contexts)try{await context.close();}catch(error){cleanupErrors.push(error);}for(const actor of actors)try{await cleanupDisposableAccount(actor);}catch(error){cleanupErrors.push(error);}if(cleanupErrors.length)throw new AggregateError(bodyError?[bodyError,...cleanupErrors]:cleanupErrors,'Atomic quote fixture cleanup failed',{cause:bodyError});
 }
});

import {test,expect,type BrowserContext,type Page} from 'playwright/test';
import {createServerClient} from '@supabase/ssr';
import sharp from 'sharp';
import {createDisposableAccount,cleanupDisposableAccount,type DisposableAccount} from './disposable-account';
import {regressionAdminClient} from './seed';
import {emptyBusiness} from '../../src/lib/pro/business';
import {crTodayISO} from '../../src/lib/time-cr';
import {gotoOK,expectNoHorizontalOverflow,onAppPageError} from './helpers';
import {stabilizeLocalProRuntime} from './pro-local-stable-runtime';

// Row 61: tableros de ideas por proyecto (idea / mood boards). Local types on purpose: this spec
// must type-check before phase 2 copies src/lib/pro/mood-boards.ts into the repository.
type Element={id:string;kind:'image'|'product'|'swatch'|'note';x:number;y:number;w:number;h:number;rotation:number;[key:string]:unknown};
type Page_={id:string;sortOrder:number;name:string|null;background:string;elements:Element[];revision:number};
type Board={id:string;name:string;room:string|null;pageFormat:'wide'|'a4';archived:boolean;publishedVersion:number|null;pageCount:number;revision:number;commentCount:number};
type Detail={board:Board;pages:Page_[];comments:Array<{id:string;side:'owner'|'client';authorName:string|null;body:string;version:number}>;history:Array<{action:string}>;publications:Array<{id:string;version:number}>};
type ClientView={visible:false}|{visible:true;boards:Array<{id:string;publicationId:string;version:number;name:string;pages:Array<{id:string;elements:Element[]}>;comments:Array<{side:string;body:string}>}>};
const origin='http://127.0.0.1:3185',api='/api/pro/mood-boards';
function local(baseURL:string|undefined){expect(baseURL).toBe(origin);expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');}
async function login(context:BrowserContext,actor:DisposableAccount){await stabilizeLocalProRuntime(context,origin);const auth=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{getAll:()=>[],setAll:async cookies=>context.addCookies(cookies.map(cookie=>({name:cookie.name,value:cookie.value,url:origin,sameSite:'Lax' as const})))}});const result=await auth.auth.signInWithPassword({email:actor.email,password:actor.password});expect(result.error).toBeNull();}
const uuid=()=>crypto.randomUUID();

async function makePro(db:ReturnType<typeof regressionAdminClient>,account:DisposableAccount,slug:string){
 const user=await db.auth.admin.getUserById(account.id);expect((await db.auth.admin.updateUserById(account.id,{user_metadata:{...user.data.user!.user_metadata,is_provider:true,role:'professional'}})).error).toBeNull();
 await db.from('profiles').update({is_provider:true,role:'professional'}).eq('id',account.id).throwOnError();await db.from('pro_memberships').insert({user_id:account.id,status:'active'}).throwOnError();
 return (await db.from('professionals').insert({profile_id:account.id,category_id:'desarrollo_web',business_name:'Tableros local',slug:slug+'-'+account.id,whatsapp:'',provincia_id:'al',canton_id:'al-at',verification_status:'pending',is_banned:false,is_available:true}).select('id').single().throwOnError()).data!;
}

async function fixture(context:BrowserContext){
 const owner=await createDisposableAccount({prefix:'mood-owner'}),db=regressionAdminClient();let client:DisposableAccount|undefined,rival:DisposableAccount|undefined;
 try{
  client=await createDisposableAccount({prefix:'mood-client'});rival=await createDisposableAccount({prefix:'mood-rival'});
  const professional=await makePro(db,owner,'mood');await makePro(db,rival,'mood-rival');
  const workId=uuid(),uiWorkId=uuid(),requestId=uuid(),uiRequestId=uuid(),day=crTodayISO(),linkedClient='reservation-'+client.id,document=emptyBusiness();
  document.clients=[{id:linkedClient,name:'Cliente tableros local',email:'',phone:'',notes:'',archived:false}];
  document.products=[
   {id:'porcelanato',sku:'POR-60',name:'Porcelanato gris 60×60',stock:0,minimum:0,cost:9000,price:12500.5,archived:false,category:'Pisos',unit:'m2'},
   {id:'retirado',sku:'OLD-1',name:'Grifo descontinuado',stock:0,minimum:0,cost:1,price:2,archived:true},
  ];
  document.work=[
   {id:workId,clientId:linkedClient,client:'Cliente tableros local',service:'Remodelación de cocina',stage:'scheduled',start:day+'T11:00:00-06:00',end:day+'T12:00:00-06:00',cancelled:false,bookingClientId:client.id},
   {id:uiWorkId,clientId:linkedClient,client:'Cliente tableros local',service:'Baño principal',stage:'scheduled',start:day+'T14:00:00-06:00',end:day+'T15:00:00-06:00',cancelled:false,bookingClientId:client.id},
  ];
  await db.from('pro_workspaces').insert({user_id:owner.id,document,revision:1}).throwOnError();await login(context,owner);
  for(const endpoint of ['/api/auth/session-mfa','/api/auth/registration-state','/api/pro/access'])expect((await context.request.get(origin+endpoint,{timeout:45000})).status()).toBe(200);
  for(const id of [workId,uiWorkId])expect((await context.request.get(origin+'/api/pro/client-operations?'+new URLSearchParams({workId:id,clientId:linkedClient}),{timeout:45000})).status()).toBe(200);
  for(const [id,work,service,start] of [[requestId,workId,'Remodelación de cocina','T11:00:00-06:00'],[uiRequestId,uiWorkId,'Baño principal','T14:00:00-06:00']] as const){
   await db.from('pro_appointment_requests').insert({id,professional_id:professional.id,owner_id:owner.id,client_user_id:client.id,client_name:'Cliente tableros local',professional_name:'Tableros local',professional_slug:'mood-'+owner.id,service,duration_minutes:60,location_kind:'agree',location_text:'',note:'',requested_start:day+start,status:'confirmed',revision:0,work_id:work}).throwOnError();
   await db.from('pro_appointment_events').insert({request_id:id,actor_id:owner.id,side:'provider',action:'confirm',note:'',status:'confirmed'}).throwOnError();
  }
  return {owner,client,rival,db,workId,uiWorkId,requestId,uiRequestId};
 }catch(error){await cleanupDisposableAccount(owner);if(client)await cleanupDisposableAccount(client);if(rival)await cleanupDisposableAccount(rival);throw error;}
}

// Real job file through the existing work-files API (PNG in, private JPEG stored).
async function uploadPhoto(page:Page,owner:DisposableAccount,workId:string,name:string,color:string){
 const png=await sharp({create:{width:96,height:64,channels:3,background:color}}).png().toBuffer();const fileId=uuid();
 const r=await page.request.post('/api/pro/work-files',{headers:{Origin:origin,'X-Pro-Expected-Actor':owner.id},data:{action:'upload',workId,fileId,name,data:png.toString('base64')}});
 expect(r.status(),await r.text()).toBe(200);return fileId;
}

for(const language of ['es','en'] as const)test(`Idea boards: pages, elements, history, sharing and customer comments [${language}]`,async({page,browser,baseURL},info)=>{
 test.setTimeout(480000);local(baseURL);const en=language==='en',f=await fixture(page.context()),{owner,client,rival,db,workId,uiWorkId,requestId,uiRequestId}=f;let customer:BrowserContext|undefined,other:BrowserContext|undefined;
 try{
  const runtime:string[]=[];onAppPageError(page,message=>runtime.push(message));
  const notices=async()=>{const out:Record<string,unknown>={};for(const table of ['notifications','notification_push_outbox'])out[table]=(await db.from(table).select('*').in('user_id',[owner.id,client.id]).order('id').throwOnError()).data;return out;};const noticesBefore=await notices();
  const headers={Origin:origin,'X-Pro-Expected-Actor':owner.id};
  const list=async(id=workId,archived=false)=>{const r=await page.request.get(api+'?'+new URLSearchParams(archived?{workId:id,archived:'1'}:{workId:id}),{headers:{'X-Pro-Expected-Actor':owner.id}});expect(r.status()).toBe(200);return await r.json() as {items:Board[];clientVisible:boolean;counts:{active:number;archived:number};recipientName:string|null};};
  const detail=async(boardId:string,id=workId)=>{const r=await page.request.get(api+'?'+new URLSearchParams({workId:id,boardId}),{headers:{'X-Pro-Expected-Actor':owner.id}});expect(r.status()).toBe(200);return await r.json() as Detail;};
  const post=async(data:Record<string,unknown>,status=200)=>{const r=await page.request.post(api,{headers,data});expect(r.status(),JSON.stringify(data).slice(0,300)).toBe(status);return status===200?await r.json() as {board?:Board;pages?:Page_[];page?:Page_;comment?:{id:string;side:string;body:string;version:number}}:null;};
  const setSection=async(work:string,on:boolean)=>{const settings=(await (await page.request.get('/api/pro/client-dashboard?'+new URLSearchParams({workId:work}),{headers:{'X-Pro-Expected-Actor':owner.id}})).json()).settings;
   const r=await page.request.post('/api/pro/client-dashboard',{headers,data:{workId:work,actionId:uuid(),revision:settings.revision,showUpdates:true,showDailyLogs:true,showFiles:true,showMoodBoards:on,welcomeText:null}});expect(r.status()).toBe(200);return (await r.json()).settings;};
  const photo=await uploadPhoto(page,owner,workId,'cocina.png','#008bb5'),otherJobPhoto=await uploadPhoto(page,owner,uiWorkId,'bano.png','#bc4749');

  // ---- API: owner ----
  expect(await list()).toMatchObject({items:[],clientVisible:false,counts:{active:0,archived:0},recipientName:'Cliente tableros local'});
  for(const query of ['',`?workId=${workId}&workId=${workId}`,`?workId=${workId}&archived=2`,`?workId=${workId}&extra=1`,'?image=no-uuid'])expect((await page.request.get(api+query,{headers:{'X-Pro-Expected-Actor':owner.id}})).status(),query).toBe(400);
  expect((await page.request.get(api+'?'+new URLSearchParams({workId}),{headers:{'X-Pro-Expected-Actor':client.id}})).status()).toBe(403);// account changed
  const createInput={action:'board_create',actionId:uuid(),workId,id:uuid(),pageId:uuid(),name:'  Cocina blanca ',room:'Cocina',pageFormat:'wide'};
  expect((await page.request.post(api,{headers:{'X-Pro-Expected-Actor':owner.id},data:createInput})).status()).toBe(403);// no same-origin header
  await post({...createInput,extra:1},400);await post({...createInput,name:'  '},400);await post({...createInput,pageFormat:'square'},400);
  const created=(await post(createInput))!;expect(created.board).toMatchObject({name:'Cocina blanca',room:'Cocina',pageFormat:'wide',pageCount:1,publishedVersion:null,revision:1});
  expect((await post(createInput))!).toEqual(created);// idempotent replay
  await post({...createInput,name:'Otro'},400);// same action id, other payload
  await post({...createInput,actionId:uuid()},409);// same board id
  const boardId=createInput.id,pageId=createInput.pageId;
  const pageInput=(revision:number,elements:unknown[],extra:Record<string,unknown>={})=>({action:'page_save',actionId:uuid(),workId,id:boardId,pageId,revision,name:'Paleta',background:'#f7f9fc',elements,...extra});
  const note={id:uuid(),kind:'note',x:0,y:7000,w:4000,h:2000,rotation:0,text:'Encimera de cuarzo'};
  await post(pageInput(1,[{...note,x:7000}]),400);// outside the page
  await post(pageInput(1,[{...note,x:10.5}]),400);// not an integer
  await post(pageInput(1,[{...note,rotation:45}]),400);
  await post(pageInput(1,[{id:uuid(),kind:'image',x:0,y:0,w:3000,h:3000,rotation:0,fileId:otherJobPhoto}]),400);// photo of another job
  await post(pageInput(1,[{id:uuid(),kind:'product',x:0,y:0,w:3000,h:3000,rotation:0,productId:'retirado',fileId:null,showPrice:true}]),400);// archived item
  await post(pageInput(1,[note,note]),400);// repeated element
  await post(pageInput(1,[note],{background:'#FFFFFF'}),400);
  const big=await page.request.post(api,{headers,data:{...pageInput(1,[note]),padding:'x'.repeat(70000)}});expect(big.status()).toBe(413);
  const elements=[
   {id:uuid(),kind:'image',x:0,y:0,w:5000,h:6000,rotation:0,fileId:photo},
   {id:uuid(),kind:'product',x:5000,y:0,w:2500,h:3000,rotation:90,productId:'porcelanato',fileId:null,showPrice:false},
   {id:uuid(),kind:'swatch',x:7500,y:0,w:2500,h:2500,rotation:0,color:'#008bb5',label:'Turquesa'},
   note,
  ];
  const savedInput=pageInput(1,elements),saved=(await post(savedInput))!;
  expect(saved.page).toMatchObject({revision:2,name:'Paleta',background:'#f7f9fc'});
  expect(saved.page!.elements[1]).toMatchObject({kind:'product',name:'Porcelanato gris 60×60',unit:'m2',priceCents:1250050,showPrice:false,rotation:90});
  expect((await post(savedInput))!.page).toEqual(saved.page);// replay
  await post(pageInput(1,elements.slice(0,2)),409);// stale page revision
  // Item snapshot: a later catalog price change does not alter the placed item.
  await db.from('pro_products').update({price:99999}).eq('user_id',owner.id).eq('id','porcelanato').throwOnError();
  const moved=(await post(pageInput(2,[{...elements[1],x:5100,showPrice:true},elements[0],elements[2],note])))!;
  expect(moved.page!.elements[0]).toMatchObject({x:5100,priceCents:1250050,showPrice:true});
  expect((await page.request.get(api+'?'+new URLSearchParams({products:'porce'}),{headers:{'X-Pro-Expected-Actor':owner.id}})).ok()).toBe(true);
  // Pages: add, reorder, delete (board revision CAS).
  let board=(await post({action:'page_add',actionId:uuid(),workId,id:boardId,revision:1,pageId:uuid()}))!.board!;expect(board).toMatchObject({pageCount:2,revision:2});
  await post({action:'page_add',actionId:uuid(),workId,id:boardId,revision:1,pageId:uuid()},409);
  let d=await detail(boardId);const order=d.pages.map(p=>p.id);
  board=(await post({action:'page_reorder',actionId:uuid(),workId,id:boardId,revision:2,pageIds:[...order].reverse()}))!.board!;
  await post({action:'page_reorder',actionId:uuid(),workId,id:boardId,revision:board.revision,pageIds:[order[0]]},409);
  board=(await post({action:'page_delete',actionId:uuid(),workId,id:boardId,revision:board.revision,pageId:order[1]}))!.board!;
  await post({action:'page_delete',actionId:uuid(),workId,id:boardId,revision:board.revision,pageId:order[0]},400);// keeps one page
  board=(await post({action:'board_update',actionId:uuid(),workId,id:boardId,revision:board.revision,name:'Cocina blanca',room:'Cocina',pageFormat:'a4'}))!.board!;expect(board.pageFormat).toBe('a4');
  const copyId=uuid();expect((await post({action:'board_duplicate',actionId:uuid(),workId,id:boardId,newId:copyId,name:'Cocina (copia)'}))!.board).toMatchObject({name:'Cocina (copia)',publishedVersion:null,pageCount:1});
  // Isolation: the rival Pro account sees nothing and cannot write.
  other=await browser.newContext({baseURL});await login(other,rival);
  expect((await other.request.get(api+'?'+new URLSearchParams({workId}),{headers:{'X-Pro-Expected-Actor':rival.id}})).status()).toBe(404);
  expect((await other.request.get(api+'?'+new URLSearchParams({workId,boardId}),{headers:{'X-Pro-Expected-Actor':rival.id}})).status()).toBe(404);
  expect((await other.request.post(api,{headers:{Origin:origin,'X-Pro-Expected-Actor':rival.id},data:{action:'board_archive',actionId:uuid(),workId,id:boardId,revision:board.revision}})).status()).toBe(403);
  expect((await other.request.get(api+'?'+new URLSearchParams({image:photo}),{headers:{'X-Pro-Expected-Actor':rival.id}})).status()).toBe(404);
  const ownerImage=await page.request.get(api+'?'+new URLSearchParams({image:photo}),{headers:{'X-Pro-Expected-Actor':owner.id}});expect(ownerImage.status()).toBe(200);expect(ownerImage.headers()['content-type']).toBe('image/jpeg');

  // ---- API: sharing and customer comments ----
  board=(await post({action:'publish',actionId:uuid(),workId,id:boardId,revision:board.revision}))!.board!;expect(board.publishedVersion).toBe(1);
  customer=await browser.newContext({baseURL});await login(customer,client);
  const cHeaders={Origin:origin,'X-Pro-Expected-Actor':client.id};
  const clientRead=async(id=requestId)=>{const r=await customer!.request.get(api+'?'+new URLSearchParams({requestId:id}),{headers:{'X-Pro-Expected-Actor':client.id}});expect(r.status()).toBe(200);return await r.json() as ClientView;};
  expect(await clientRead()).toEqual({visible:false});// section off by default
  expect((await setSection(workId,true)).showMoodBoards).toBe(true);
  let view=await clientRead();expect(view.visible).toBe(true);if(!view.visible)throw Error('hidden');
  expect(view.boards).toHaveLength(1);expect(JSON.stringify(view)).not.toContain(photo);expect(JSON.stringify(view)).not.toContain('porcelanato');
  const shared=view.boards[0],sharedImage=shared.pages[0].elements.find(e=>e.kind==='image')!;expect(sharedImage.hasImage).toBe(true);
  expect(shared.pages[0].elements.find(e=>e.kind==='product')).toMatchObject({name:'Porcelanato gris 60×60',priceCents:1250050});
  const imageQuery='?'+new URLSearchParams({publication:shared.publicationId,page:shared.pages[0].id,element:sharedImage.id});
  expect((await customer.request.get(api+imageQuery,{headers:{'X-Pro-Expected-Actor':client.id}})).status()).toBe(200);
  expect((await other.request.get(api+imageQuery,{headers:{'X-Pro-Expected-Actor':rival.id}})).status()).toBe(404);
  expect((await customer.request.get(api+'?'+new URLSearchParams({image:photo}),{headers:{'X-Pro-Expected-Actor':client.id}})).status()).toBe(403);// owner mode needs Pro
  const commentInput={action:'comment',actionId:uuid(),requestId,boardId,commentId:uuid(),version:1,body:'  Me gusta el turquesa  '};
  const cPost=async(data:Record<string,unknown>,status=200)=>{const r=await customer!.request.post(api,{headers:cHeaders,data});expect(r.status(),JSON.stringify(data)).toBe(status);return status===200?await r.json():null;};
  await cPost({...commentInput,body:'   '},400);await cPost({...commentInput,extra:1},400);
  const firstComment=await cPost(commentInput);expect(firstComment.comment).toMatchObject({side:'client',body:'Me gusta el turquesa',version:1,authorName:'Cliente tableros local'});
  expect(await cPost(commentInput)).toEqual(firstComment);
  await cPost({...commentInput,body:'otro'},400);
  expect((await other.request.post(api,{headers:{Origin:origin,'X-Pro-Expected-Actor':rival.id},data:{...commentInput,actionId:uuid(),commentId:uuid()}})).status()).toBe(403);
  await cPost({...commentInput,actionId:uuid(),commentId:uuid(),boardId:copyId},403);// not shared
  expect((await post({action:'comment',actionId:uuid(),workId,id:boardId,commentId:uuid(),body:'Gracias, lo dejamos así.'}))!.comment).toMatchObject({side:'owner',version:1});
  board=(await post({action:'publish',actionId:uuid(),workId,id:boardId,revision:board.revision}))!.board!;expect(board.publishedVersion).toBe(2);
  await cPost({...commentInput,actionId:uuid(),commentId:uuid()},409);// the customer must see version 2 first
  view=await clientRead();if(!view.visible)throw Error('hidden');expect(view.boards[0]).toMatchObject({version:2});expect(view.boards[0].comments.map(c=>c.side)).toEqual(['client','owner']);
  expect((await customer.request.get(api+imageQuery,{headers:{'X-Pro-Expected-Actor':client.id}})).status()).toBe(404);// old version no longer served
  d=await detail(boardId);expect(d.comments).toHaveLength(2);expect(d.publications.map(p=>p.version)).toEqual([2,1]);expect(d.history.map(h=>h.action)).toContain('page_save');
  // Archive withdraws the board; restore keeps it private.
  board=(await post({action:'board_archive',actionId:uuid(),workId,id:boardId,revision:board.revision}))!.board!;expect(board).toMatchObject({archived:true,publishedVersion:null});
  view=await clientRead();expect(view).toEqual({visible:true,boards:[]});
  await post(pageInput(moved.page!.revision,[note]),400);// archived: restore first
  expect((await list(workId,true)).items.map(b=>b.id)).toEqual([boardId]);
  board=(await post({action:'board_restore',actionId:uuid(),workId,id:boardId,revision:board.revision}))!.board!;expect(board).toMatchObject({archived:false,publishedVersion:null});

  // ---- Owner UI ----
  const mobile=(page.viewportSize()?.width??1366)<1024,suffix=`${language}${mobile?'-mobile':''}`;
  const uiPhoto=await uploadPhoto(page,owner,uiWorkId,'lavamanos.png','#6a994e');
  let failFirst=true;
  await page.route('**/api/pro/mood-boards?**',async route=>{const url=new URL(route.request().url());if(failFirst&&route.request().method()==='GET'&&url.searchParams.has('workId')&&!url.searchParams.has('boardId')){failFirst=false;return route.fulfill({status:503,json:{error:'LOCAL failure'}});}return route.continue();});
  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_agenda',cita:uiWorkId,vistaTrabajo:'moodboards'}));
  const nav=page.getByRole('navigation',{name:en?'Job workspace':'Gestión del trabajo'});await expect(nav).toBeVisible({timeout:60000});
  const planning=nav.locator('[data-job-workspace-group]').nth(1);await expect(planning).toHaveAttribute('data-job-workspace-group',en?'Planning':'Planificación');
  await expect(planning.getByRole('button',{name:en?'Idea boards':'Tableros de ideas',exact:true})).toHaveAttribute('aria-current','page');
  const loadError=page.locator('[data-mood-boards-load-error]');await expect(loadError).toBeVisible({timeout:60000});
  await loadError.getByRole('button',{name:en?'Retry':'Reintentar'}).click();
  const boards=page.locator('[data-mood-boards]');await expect(boards.locator('[data-mood-boards-empty]')).toBeVisible();
  await expect(boards.locator('[data-mood-client-visibility]')).toContainText(en?'turn on the Idea boards section':'active la sección Tableros de ideas');
  await expectNoHorizontalOverflow(page);await page.screenshot({path:info.outputPath(`moodboards-empty-${suffix}.png`),fullPage:true});
  const overview=nav.getByRole('button',{name:en?'Overview':'Resumen',exact:true});
  await boards.getByRole('button',{name:en?'New board':'Nuevo tablero'}).click();await expect(overview).toBeEnabled();// untouched form is not dirty
  const form=boards.locator('[data-mood-board-form]');await form.locator('[data-mood-field="name"]').fill(en?'Bathroom mood':'Baño sereno');
  await expect(overview).toBeDisabled();// dirty form blocks the job menu
  await form.locator('[data-mood-field="room"]').fill(en?'Main bathroom':'Baño principal');
  await form.getByRole('button',{name:en?'Create board':'Crear tablero'}).click();
  const editor=page.locator('[data-mood-board-editor]');await expect(editor).toBeVisible({timeout:60000});await expect(overview).toBeEnabled();
  const canvas=editor.locator('[data-mood-canvas="editor"]');await expect(canvas.locator('[data-mood-element]')).toHaveCount(0);
  // Note, color, photo and item.
  await editor.locator('[data-mood-add="note"]').click();const panel=editor.locator('[data-mood-add-panel]');
  await panel.getByRole('button',{name:en?'Add note':'Agregar nota'}).click();await expect(panel.getByRole('alert')).toContainText(en?'Write the note.':'Escriba la nota.');
  await panel.locator('[data-mood-field="note"]').fill(en?'Warm light over the mirror':'Luz cálida sobre el espejo');await panel.getByRole('button',{name:en?'Add note':'Agregar nota'}).click();
  await expect(canvas.locator('[data-mood-element="note"]')).toHaveCount(1);await expect(overview).toBeDisabled();
  await editor.locator('[data-mood-add="swatch"]').click();await panel.locator('[data-mood-field="swatch-hex"]').fill('#6A994E');await panel.locator('[data-mood-field="swatch-label"]').fill(en?'Sage':'Salvia');
  await panel.getByRole('button',{name:en?'Add color':'Agregar color'}).click();await expect(canvas.locator('[data-mood-element="swatch"]')).toContainText(en?'Sage':'Salvia');
  await editor.locator('[data-mood-add="image"]').click();await panel.locator(`[data-mood-photo="${uiPhoto}"]`).click();
  const image=canvas.locator('[data-mood-element="image"] img');await expect(image).toBeVisible();await expect.poll(()=>image.evaluate(node=>(node as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await editor.locator('[data-mood-add="product"]').click();await panel.locator('[data-mood-field="item-search"]').fill('porce');
  await panel.locator('[data-mood-product="porcelanato"]').click();await expect(canvas.locator('[data-mood-element="product"]')).toContainText('Porcelanato gris');
  await expect(canvas.locator('[data-mood-element]')).toHaveCount(4);
  // Keyboard: arrows move the selected note; numeric fields edit the size; rotate.
  const noteEl=canvas.locator('[data-mood-element="note"]');await noteEl.focus();
  const inspector=editor.locator('[data-mood-inspector="note"]');const xField=inspector.locator('[data-mood-geometry="x"]');
  const x0=Number(await xField.inputValue());await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowRight');
  await expect.poll(async()=>Number(await xField.inputValue())).toBeCloseTo(x0+1,1);
  await inspector.locator('[data-mood-geometry="w"]').fill('40');await inspector.locator('[data-mood-geometry="w"]').press('Enter');
  await expect(inspector.locator('[data-mood-geometry="w"]')).toHaveValue('40.0');
  await inspector.getByRole('button',{name:en?'Rotate 90°':'Girar 90°'}).click();await expect(noteEl).toHaveAttribute('style',/rotate\(90deg\)/);
  // Pointer drag of the photo changes its position.
  // Grab the photo by its top-left corner: later elements cover its center.
  const imageEl=canvas.locator('[data-mood-element="image"]');await imageEl.scrollIntoViewIfNeeded();// on a phone the inspector pushes the canvas out of view
  const beforeDrag=await imageEl.getAttribute('style'),boxBefore=(await imageEl.boundingBox())!;
  // On a phone the rotated note can cover that corner too: grab the first visible point of the photo itself.
  const grab=await imageEl.evaluate(node=>{const r=node.getBoundingClientRect();for(let y=8;y<r.height-8;y+=8)for(let x=8;x<r.width-8;x+=8){const hit=document.elementFromPoint(r.left+x,r.top+y);if(hit&&node.contains(hit))return {x,y};}return null;});
  expect(grab,'some part of the photo must be reachable').not.toBeNull();
  await page.mouse.move(boxBefore.x+grab!.x,boxBefore.y+grab!.y);await page.mouse.down();await page.mouse.move(boxBefore.x+grab!.x+40,boxBefore.y+grab!.y+20,{steps:5});await page.mouse.up();
  await expect.poll(()=>imageEl.getAttribute('style')).not.toBe(beforeDrag);
  // Delete with the keyboard, then undo / redo.
  const swatch=canvas.locator('[data-mood-element="swatch"]');await swatch.focus();await page.keyboard.press('Delete');await expect(swatch).toHaveCount(0);
  await editor.getByRole('button',{name:en?'Undo':'Deshacer',exact:true}).click();await expect(swatch).toHaveCount(1);
  await editor.getByRole('button',{name:en?'Redo':'Rehacer',exact:true}).click();await expect(swatch).toHaveCount(0);
  await editor.getByRole('button',{name:en?'Undo':'Deshacer',exact:true}).click();await expect(swatch).toHaveCount(1);
  // Accessible element list mirrors the canvas.
  await expect(editor.locator('[data-mood-element-list] li')).toHaveCount(4);
  await editor.getByRole('button',{name:'#f4efe6',exact:true}).click();await editor.locator('[data-mood-field="page-name"]').fill(en?'Palette':'Paleta');
  await expectNoHorizontalOverflow(page);await page.screenshot({path:info.outputPath(`moodboards-editor-${suffix}.png`),fullPage:true});
  await editor.locator('[data-mood-save-page]').click();await expect(editor.getByRole('status').filter({hasText:en?'Page saved.':'Página guardada.'})).toBeVisible();await expect(overview).toBeEnabled();
  // Second page: switching while dirty is blocked; move and delete pages.
  await editor.getByRole('button',{name:en?'Add page':'Agregar página'}).click();await expect(editor.locator('[data-mood-page-thumb]')).toHaveCount(2);
  await expect(editor.locator('[data-mood-page-thumb="2"]')).toHaveAttribute('aria-current','page');
  await editor.locator('[data-mood-add="note"]').click();await panel.locator('[data-mood-field="note"]').fill(en?'Second page':'Segunda página');await panel.getByRole('button',{name:en?'Add note':'Agregar nota'}).click();
  await editor.locator('[data-mood-page-thumb="1"]').click();await expect(editor.locator('[data-mood-error]')).toContainText(en?'Save or discard the changes to this page first.':'Primero guarde o descarte los cambios de esta página.');
  await editor.locator('[data-mood-save-page]').click();await expect(editor.getByRole('status').filter({hasText:en?'Page saved.':'Página guardada.'})).toBeVisible();
  await editor.getByRole('button',{name:en?'Move page left':'Mover página a la izquierda'}).click();await expect(editor.locator('[data-mood-page-thumb="1"]')).toHaveAttribute('aria-current','page');
  await editor.getByRole('button',{name:en?'Delete page':'Eliminar página'}).click();
  await page.getByRole('dialog').last().getByRole('button',{name:en?'Delete page':'Eliminar página'}).click();await expect(editor.locator('[data-mood-page-thumb]')).toHaveCount(1);
  await expect(canvas.locator('[data-mood-element]')).toHaveCount(4);
  // Present full screen; Escape closes.
  await editor.getByRole('button',{name:en?'Present':'Presentar',exact:true}).click();const presenter=page.locator('[data-mood-presenter]');await expect(presenter).toBeVisible();
  await expect(presenter.locator('[data-mood-element]')).toHaveCount(4);await page.screenshot({path:info.outputPath(`moodboards-present-${suffix}.png`)});
  await page.keyboard.press('Escape');await expect(presenter).toHaveCount(0);
  // Reload keeps everything (thumbnail on the card, page content when reopened).
  await page.reload();const card=page.locator('[data-mood-board-card]').first();await expect(card).toBeVisible({timeout:60000});
  await expect(card).toContainText(en?'Bathroom mood':'Baño sereno');await expect(card.locator('[data-mood-canvas="thumbnail"] [data-mood-element]')).toHaveCount(4);
  await card.getByRole('button',{name:en?'Open':'Abrir',exact:true}).click();
  await expect(editor.locator('[data-mood-canvas="editor"] [data-mood-element]')).toHaveCount(4,{timeout:60000});
  await expect(editor.locator('[data-mood-canvas="editor"] [data-mood-element="note"]')).toHaveAttribute('style',/rotate\(90deg\)/);
  await expect(editor.locator('[data-mood-field="page-name"]')).toHaveValue(en?'Palette':'Paleta');
  // Share; the dialog explains the section is still off.
  await editor.locator('[data-mood-publish]').click();const shareDialog=page.getByRole('dialog').last();
  await expect(shareDialog).toContainText(en?'The Idea boards section is off':'La sección Tableros de ideas está apagada');
  await shareDialog.getByRole('button',{name:en?'Share with customer':'Compartir con el cliente'}).click();
  await expect(editor.locator('[data-mood-share-status]')).toContainText(en?'Version 1 shared':'Versión 1 compartida');
  await expectNoHorizontalOverflow(page);await page.screenshot({path:info.outputPath(`moodboards-shared-${suffix}.png`),fullPage:true});
  // Turn the section on in the customer view editor.
  await nav.getByRole('button',{name:en?'Customer view':'Vista del cliente',exact:true}).click();
  const dashboard=page.locator('[data-client-dashboard-editor]');await expect(dashboard).toBeVisible({timeout:60000});
  const toggle=dashboard.locator('[data-client-dashboard-section="showMoodBoards"]');await expect(toggle).not.toBeChecked();await toggle.check();
  await dashboard.getByRole('button',{name:en?'Save customer view':'Guardar vista del cliente'}).click();
  await expect(dashboard.getByRole('status').filter({hasText:en?'Customer view saved.':'Vista del cliente guardada.'})).toBeVisible();
  await expect(dashboard.locator('ol li').first()).toContainText(en?'Idea boards: Visible':'Tableros de ideas: Visible');

  // ---- Customer UI ----
  const customerPage=await customer.newPage();onAppPageError(customerPage,message=>runtime.push(message));
  await gotoOK(customerPage,`/${language}/dashboard/profesional?tab=appointments&citaSolicitud=${uiRequestId}`);
  const section=customerPage.locator('[data-client-mood-boards]');await expect(section).toBeVisible({timeout:60000});
  await expect(section).toContainText(en?'Bathroom mood':'Baño sereno');await expect(section.locator('[data-mood-canvas="view"] [data-mood-element]')).toHaveCount(4);
  const cImage=section.locator('[data-mood-element="image"] img');await expect.poll(()=>cImage.evaluate(node=>(node as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  const send=section.getByRole('button',{name:en?'Send comment':'Enviar comentario'});await expect(send).toBeDisabled();
  await section.locator('[data-client-mood-comment-field]').fill(en?'Could the sage be lighter?':'¿Podría ser la salvia más clara?');await send.click();
  await expect(section.getByRole('status')).toContainText(en?'Comment sent.':'Comentario enviado.');
  await expect(section.locator('[data-client-mood-comment="client"]')).toContainText(en?'Could the sage be lighter?':'¿Podría ser la salvia más clara?');
  await expectNoHorizontalOverflow(customerPage);await customerPage.screenshot({path:info.outputPath(`customer-moodboards-${suffix}.png`),fullPage:true});
  // Owner sees the comment with its author and replies.
  // The visited board stays mounted while in another view: reload to see the new comment from the list.
  await nav.getByRole('button',{name:en?'Idea boards':'Tableros de ideas',exact:true}).click();await page.reload();
  await page.locator('[data-mood-board-card]').first().getByRole('button',{name:en?'Open':'Abrir',exact:true}).click();
  const comments=editor.locator('[data-mood-comments]');await expect(comments.locator('[data-mood-comment="client"]')).toContainText('Cliente tableros local',{timeout:60000});
  await comments.locator('[data-mood-field="reply"]').fill(en?'Yes, we will try a lighter tone.':'Sí, probaremos un tono más claro.');await comments.getByRole('button',{name:en?'Send':'Enviar',exact:true}).click();
  await expect(comments.locator('[data-mood-comment="owner"]')).toHaveCount(1);
  await customerPage.reload();await expect(section.locator('[data-client-mood-comment="owner"]')).toContainText(en?'Your professional':'Su profesional',{timeout:60000});
  // Archive from the list withdraws it from the customer.
  await editor.getByRole('button',{name:en?'Idea boards':'Tableros de ideas',exact:true}).click();
  const archiveCard=page.locator('[data-mood-board-card]').first();await archiveCard.getByRole('button',{name:en?'Archive':'Archivar',exact:true}).click();
  await page.getByRole('dialog').last().getByRole('button',{name:en?'Archive':'Archivar',exact:true}).click();
  await expect(page.locator('[data-mood-boards-empty]')).toBeVisible();
  // Wait for the section's own read so an absent section is not just a section still loading.
  const read=customerPage.waitForResponse(response=>response.url().includes(api+'?requestId=')&&response.request().method()==='GET');
  await customerPage.reload();expect((await read).status()).toBe(200);
  await expect(customerPage.locator('[data-client-mood-boards]')).toHaveCount(0);
  await expectNoHorizontalOverflow(page);

  expect(await notices()).toEqual(noticesBefore);
  expect(runtime).toEqual([]);
 }finally{await customer?.close();await other?.close();await cleanupDisposableAccount(f.owner);await cleanupDisposableAccount(f.client);await cleanupDisposableAccount(f.rival);}
});

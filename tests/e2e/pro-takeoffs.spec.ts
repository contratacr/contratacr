import {test,expect,type BrowserContext,type Page} from 'playwright/test';
import {createServerClient} from '@supabase/ssr';
import sharp from 'sharp';
import {createDisposableAccount,cleanupDisposableAccount,type DisposableAccount} from './disposable-account';
import {regressionAdminClient} from './seed';
import {emptyBusiness} from '../../src/lib/pro/business';
import {crTodayISO} from '../../src/lib/time-cr';
import {gotoOK,expectNoHorizontalOverflow,onAppPageError} from './helpers';
import {stabilizeLocalProRuntime} from './pro-local-stable-runtime';
import type {TakeoffDetail,TakeoffMeasurement,TakeoffPage,TakeoffPlan,TakeoffSendResult} from '../../src/lib/pro/takeoffs';

// Row 66: mediciones sobre planos (plans, per-page scale, area/length/count, send to estimate).
const origin='http://127.0.0.1:3185',api='/api/pro/takeoffs';
function local(baseURL:string|undefined){expect(baseURL).toBe(origin);expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');}
async function login(context:BrowserContext,actor:DisposableAccount){await stabilizeLocalProRuntime(context,origin);const auth=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{getAll:()=>[],setAll:async cookies=>context.addCookies(cookies.map(cookie=>({name:cookie.name,value:cookie.value,url:origin,sameSite:'Lax' as const})))}});const result=await auth.auth.signInWithPassword({email:actor.email,password:actor.password});expect(result.error).toBeNull();}
const uuid=()=>crypto.randomUUID();

async function makePro(db:ReturnType<typeof regressionAdminClient>,account:DisposableAccount,slug:string){
 const user=await db.auth.admin.getUserById(account.id);expect((await db.auth.admin.updateUserById(account.id,{user_metadata:{...user.data.user!.user_metadata,is_provider:true,role:'professional'}})).error).toBeNull();
 await db.from('profiles').update({is_provider:true,role:'professional'}).eq('id',account.id).throwOnError();await db.from('pro_memberships').insert({user_id:account.id,status:'active'}).throwOnError();
 await db.from('professionals').insert({profile_id:account.id,category_id:'desarrollo_web',business_name:'Mediciones local',slug:slug+'-'+account.id,whatsapp:'',provincia_id:'al',canton_id:'al-at',verification_status:'pending',is_banned:false,is_available:true}).throwOnError();
}

async function workspace(context:BrowserContext,db:ReturnType<typeof regressionAdminClient>,account:DisposableAccount,works:Array<{id:string;service:string}>){
 const day=crTodayISO(),client='cliente-mediciones',document=emptyBusiness();
 document.clients=[{id:client,name:'Cliente mediciones local',email:'',phone:'',notes:'',archived:false}];
 document.products=[{id:'porcelanato',sku:'POR-60',name:'Porcelanato 60x60',stock:0,minimum:0,cost:0,price:12500.5,archived:false,unit:'m²'}];
 document.work=works.map((work,index)=>({id:work.id,clientId:client,client:'Cliente mediciones local',service:work.service,stage:'scheduled' as const,start:`${day}T${String(9+index*2).padStart(2,'0')}:00:00-06:00`,end:`${day}T${String(10+index*2).padStart(2,'0')}:00:00-06:00`,cancelled:false}));
 await db.from('pro_workspaces').insert({user_id:account.id,document,revision:1}).throwOnError();await login(context,account);
 for(const endpoint of ['/api/auth/session-mfa','/api/auth/registration-state','/api/pro/access'])expect((await context.request.get(origin+endpoint,{timeout:45000})).status()).toBe(200);
 for(const work of works)expect((await context.request.get(origin+'/api/pro/client-operations?'+new URLSearchParams({workId:work.id,clientId:client}),{timeout:45000})).status()).toBe(200);
}

/** A 1200×600 drawing that looks like a floor plan (generated, no external assets). */
async function planImage(){
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="600"><rect width="1200" height="600" fill="#ffffff"/><g fill="none" stroke="#1f2937" stroke-width="8"><rect x="120" y="60" width="960" height="480"/><line x1="420" y1="60" x2="420" y2="540"/><line x1="420" y1="300" x2="1080" y2="300"/></g><g stroke="#94a3b8" stroke-width="2"><line x1="120" y1="580" x2="720" y2="580"/></g></svg>`;
 return sharp(Buffer.from(svg)).png().toBuffer();
}
async function uploadFile(page:Page,owner:DisposableAccount,workId:string,name:string){
 const fileId=uuid(),r=await page.request.post('/api/pro/work-files',{headers:{Origin:origin,'X-Pro-Expected-Actor':owner.id},data:{action:'upload',workId,fileId,name,data:(await planImage()).toString('base64')}});
 expect(r.status(),await r.text()).toBe(200);return fileId;
}
const near=(value:string|null,expected:number)=>{const n=Number(value);expect(Math.abs(n-expected),`${value} ≈ ${expected}`).toBeLessThanOrEqual(expected*0.03+5);};

for(const language of ['es','en'] as const)test(`Plan measurements: plans, scale, area/length/count, panel and send to quote [${language}]`,async({page,browser,baseURL},info)=>{
 test.setTimeout(480000);local(baseURL);const en=language==='en',db=regressionAdminClient();
 const owner=await createDisposableAccount({prefix:'tko-owner'});let rival:DisposableAccount|undefined,other:BrowserContext|undefined,anon:BrowserContext|undefined;
 try{
  rival=await createDisposableAccount({prefix:'tko-rival'});await makePro(db,owner,'tko');await makePro(db,rival,'tko-rival');
  const workId=uuid(),uiWorkId=uuid(),otherWorkId=uuid();
  await workspace(page.context(),db,owner,[{id:workId,service:'Remodelación de sala'},{id:uiWorkId,service:'Ampliación de cocina'},{id:otherWorkId,service:'Otro trabajo'}]);
  const runtime:string[]=[];onAppPageError(page,message=>runtime.push(message));
  const notices=async()=>{const out:Record<string,unknown>={};for(const table of ['notifications','notification_push_outbox'])out[table]=(await db.from(table).select('*').eq('user_id',owner.id).order('id').throwOnError()).data;return out;};const noticesBefore=await notices();
  const headers={Origin:origin,'X-Pro-Expected-Actor':owner.id};
  const read=async(id=workId)=>{const r=await page.request.get(api+'?'+new URLSearchParams({workId:id}),{headers:{'X-Pro-Expected-Actor':owner.id}});expect(r.status()).toBe(200);return await r.json() as TakeoffDetail;};
  const post=async(data:Record<string,unknown>,status=200)=>{const r=await page.request.post(api,{headers,data});expect(r.status(),JSON.stringify(data).slice(0,300)+' → '+await r.text()).toBe(status);return status===200?await r.json() as {plan?:TakeoffPlan;page?:TakeoffPage;measurement?:TakeoffMeasurement;estimate?:TakeoffSendResult}:null;};
  const measure=(fields:Record<string,unknown>)=>({action:'measurement_create',actionId:uuid(),workId,id:uuid(),categoryId:null,color:'#0089bb',manualMilli:null,multiplierMode:'none',multiplierMilli:null,wasteBps:0,productId:null,...fields});

  // ---- API: access and validation ----
  expect(await read()).toMatchObject({workId,canQuote:true,plans:[],measurements:[],history:[]});
  expect((await page.request.get(api,{headers:{'X-Pro-Expected-Actor':owner.id}})).status()).toBe(400);
  expect((await page.request.get(api+'?workId='+workId+'&workId='+workId,{headers:{'X-Pro-Expected-Actor':owner.id}})).status()).toBe(400);
  expect((await page.request.get(api+'?'+new URLSearchParams({workId}),{headers:{'X-Pro-Expected-Actor':rival.id}})).status()).toBe(403);// account changed
  anon=await browser.newContext({baseURL});expect((await anon.request.get(origin+api+'?'+new URLSearchParams({workId}))).status()).toBe(401);
  expect((await anon.request.post(origin+api,{headers:{Origin:origin},data:{}})).status()).toBe(401);
  // Plans reuse the private job files; the page size is read from the stored image.
  const fileId=await uploadFile(page,owner,workId,'planta-baja.png'),otherFile=await uploadFile(page,owner,otherWorkId,'otro.png');
  const planInput={action:'plan_create',actionId:uuid(),workId,id:uuid(),fileId,title:'Planta baja'};
  await post({...planInput,fileId:otherFile},400);await post({...planInput,fileId:uuid()},400);await post({...planInput,title:'  '},400);await post({...planInput,widthPx:10,heightPx:10},400);
  expect((await page.request.post(api,{headers:{'X-Pro-Expected-Actor':owner.id},data:planInput})).status()).toBe(403);// no Origin
  expect((await page.request.post(api,{headers,data:{...planInput,title:'x'.repeat(17000)}})).status()).toBe(413);
  const plan=(await post(planInput))!.plan!;
  expect(plan).toMatchObject({title:'Planta baja',fileId,mimeType:'image/jpeg',pageCount:1,archived:false,revision:1,pages:[{pageNumber:1,widthPx:1200,heightPx:600,unit:'m',calibration:null,revision:1}]});
  expect(plan.uploadedOn).toBe(crTodayISO());// Costa Rica calendar day
  // Idempotent replay; same action id with other data → 400; same plan id → 409; same file twice → 409.
  expect((await post(planInput))!.plan).toEqual(plan);await post({...planInput,title:'Otra'},400);await post({...planInput,actionId:uuid()},409);await post({...planInput,actionId:uuid(),id:uuid()},409);
  const image=await page.request.get(api+'?'+new URLSearchParams({image:plan.id}),{headers:{'X-Pro-Expected-Actor':owner.id}});
  expect(image.status()).toBe(200);expect(image.headers()['content-type']).toBe('image/jpeg');expect(image.headers()['cache-control']).toContain('no-store');
  // Scale: reference line of 600 px = 12 m (1 px = 0.02 m).
  const calibrate={action:'page_calibrate',actionId:uuid(),workId,id:plan.id,pageNumber:1,revision:1,unit:'m',calibration:{points:[[0.1,0.5],[0.6,0.5]],lengthMilli:12000}};
  await post({...calibrate,calibration:{points:[[0.1,0.5],[1.5,0.5]],lengthMilli:12000}},400);await post({...calibrate,calibration:{points:[[0.1,0.5],[0.1000001,0.5]],lengthMilli:12000}},400);await post({...calibrate,calibration:{points:[[0.1,0.5],[0.102,0.5]],lengthMilli:12000}},400);// 7 decimals / line under 5 px
  await post({...calibrate,calibration:{points:[[0.1,0.5],[0.6,0.5]],lengthMilli:0}},400);await post({...calibrate,revision:2},409);
  // Drawn before the scale: the area needs it; a count does not.
  const early=(await post(measure({planId:plan.id,pageNumber:1,kind:'area',name:'Sin escala',points:[[0.1,0.1],[0.2,0.1],[0.2,0.2]]})))!.measurement!;
  expect(early.result).toMatchObject({needsScale:true,totalMilli:null,unit:'m2'});
  // Quoting needs the scale: rejected while the page is uncalibrated (once calibrated, the same drawing gets its value).
  await post({action:'send_estimate',actionId:uuid(),workId,measurementIds:[early.id],estimateId:null,estimateRevision:null,language},400);
  expect((await post(calibrate))!.page).toMatchObject({unit:'m',revision:2,calibration:{lengthMilli:12000,points:[[0.1,0.5],[0.6,0.5]]}});
  // Area (shoelace): 300 × 300 px = 90 000 px² × 0.0004 m²/px² = 36 m².
  const rect=[[0.1,0.1],[0.35,0.1],[0.35,0.6],[0.1,0.6]];
  await post(measure({planId:plan.id,pageNumber:1,kind:'area',name:'X',points:rect.slice(0,2)}),400);
  await post(measure({planId:plan.id,pageNumber:1,kind:'area',name:'X',points:[[0.1,0.1],[0.2,0.2],[0.3,0.3]]}),400);// zero area
  await post(measure({planId:plan.id,pageNumber:1,kind:'area',name:'X',points:rect,multiplierMode:'height',multiplierMilli:2500}),400);
  await post(measure({planId:plan.id,pageNumber:1,kind:'area',name:'X',points:[[0.1234567,0.1],[0.35,0.1],[0.35,0.6]]}),400);
  await post(measure({planId:plan.id,pageNumber:1,kind:'area',name:'X',points:rect,color:'red'}),400);
  await post(measure({planId:plan.id,pageNumber:1,kind:'area',name:'X',points:rect,categoryId:uuid()}),400);
  await post(measure({planId:plan.id,pageNumber:1,kind:'area',name:'X',points:rect,productId:'no-existe'}),400);
  await post(measure({planId:plan.id,pageNumber:2,kind:'area',name:'X',points:rect}),400);
  await post(measure({planId:plan.id,pageNumber:1,kind:'area',name:'X',points:rect,manualMilli:5000}),400);// points and typed value
  const floorInput=measure({planId:plan.id,pageNumber:1,kind:'area',name:'Piso sala',points:rect});
  let floor=(await post(floorInput))!.measurement!;expect(floor.result).toEqual({baseMilli:36000,totalMilli:36000,baseUnit:'m2',unit:'m2',needsScale:false});
  expect((await post(floorInput))!.measurement).toEqual(floor);await post({...floorInput,name:'Otro'},400);await post({...floorInput,actionId:uuid()},409);
  // Length: 300 + 300 px = 12 m; × 2.5 m wall height = 30 m²; + 10 % waste = 33 m².
  const wall=(await post(measure({planId:plan.id,pageNumber:1,kind:'length',name:'Pared norte',color:'#d9480f',points:[[0.1,0.1],[0.35,0.1],[0.35,0.6]],multiplierMode:'height',multiplierMilli:2500,wasteBps:1000})))!.measurement!;
  expect(wall.result).toEqual({baseMilli:12000,totalMilli:33000,baseUnit:'m',unit:'m2',needsScale:false});
  // Count: 4 points = 4 units, no scale needed.
  const outlets=(await post(measure({planId:plan.id,pageNumber:1,kind:'count',name:'Tomacorrientes',color:'#2b8a3e',points:[[0.2,0.2],[0.3,0.2],[0.4,0.2],[0.5,0.2]]})))!.measurement!;
  expect(outlets.result).toEqual({baseMilli:4000,totalMilli:4000,baseUnit:'u',unit:'u',needsScale:false});
  // Typed value without a pointer: 7.5 m of baseboard + 5 % = 7.875 m.
  const typed=(await post(measure({planId:plan.id,pageNumber:1,kind:'length',name:'Zócalo',points:[],manualMilli:7500,wasteBps:500})))!.measurement!;
  expect(typed.result).toMatchObject({baseMilli:7500,totalMilli:7875,unit:'m'});
  // Category (Company › Categories) and item of My items; factor ×2 (two coats) → 72 m².
  const categoryId=uuid();expect((await page.request.post('/api/pro/catalog-organizations',{headers,data:{kind:'product_category',action:'create',id:categoryId,name:'Pisos',revision:0}})).status()).toBe(200);
  const update={action:'measurement_update',actionId:uuid(),workId,id:floor.id,revision:1,name:'Piso sala',categoryId,color:'#0089bb',points:rect,manualMilli:null,multiplierMode:'factor',multiplierMilli:2000,wasteBps:0,productId:'porcelanato'};
  await post({...update,revision:2},409);
  floor=(await post(update))!.measurement!;expect(floor).toMatchObject({categoryName:'Pisos',productName:'Porcelanato 60x60',revision:2,result:{baseMilli:36000,totalMilli:72000,unit:'m2'}});
  await post({...update,actionId:uuid(),revision:2},400);// no changes
  const hidden=(await post({action:'measurement_visibility',actionId:uuid(),workId,id:outlets.id,revision:1,hidden:true}))!.measurement!;expect(hidden).toMatchObject({hidden:true,revision:2});
  // Recalibrating in feet recomputes drawn results in ft/ft²; back to meters afterwards.
  expect((await post({...calibrate,actionId:uuid(),revision:2,unit:'ft',calibration:{points:[[0.1,0.5],[0.6,0.5]],lengthMilli:40000}}))!.page!.unit).toBe('ft');
  expect((await read()).measurements.find(m=>m.id===floor.id)!.result).toMatchObject({unit:'ft2',baseMilli:400000});// 300 px = 20 ft → 400 ft²
  await post({...calibrate,actionId:uuid(),revision:3});

  // ---- Send to estimate (reuses the private estimate writer) ----
  const sendInput={action:'send_estimate',actionId:uuid(),workId,measurementIds:[floor.id,wall.id,outlets.id],estimateId:null,estimateRevision:null,language};
  await post({...sendInput,measurementIds:[floor.id,floor.id]},400);// duplicate
  expect((await read()).measurements.find(m=>m.id===early.id)!.result).toMatchObject({needsScale:false,unit:'m2'});// drawn before the scale, valued after calibrating
  const sentResult=(await post(sendInput))!.estimate!;
  expect(sentResult).toMatchObject({created:true,estimateRevision:1,title:'Remodelación de sala',lineCount:3,currency:'CRC',totalCents:90003600});// 72 × ₡12 500.50
  expect((await post(sendInput))!.estimate).toEqual(sentResult);// replay: no second estimate
  const lines=async(id:string)=>(await db.from('pro_private_estimate_items').select('position,content').eq('owner_id',owner.id).eq('estimate_id',id).order('position').throwOnError()).data!.map(row=>row.content as Record<string,unknown>);
  expect(await lines(sentResult.estimateId)).toEqual([
   {id:sentResult.lineIds[0],description:'Pisos · Piso sala',unit:'m²',qtyMilli:72000,unitPriceCents:1250050,discountBps:0,taxBps:0,catalogProductId:'porcelanato'},
   {id:sentResult.lineIds[1],description:'Pared norte',unit:'m²',qtyMilli:33000,unitPriceCents:0,discountBps:0,taxBps:0,catalogProductId:null},
   {id:sentResult.lineIds[2],description:'Tomacorrientes',unit:en?'ea':'unid.',qtyMilli:4000,unitPriceCents:0,discountBps:0,taxBps:0,catalogProductId:null},
  ]);
  expect((await db.from('pro_private_estimates').select('id,source').eq('owner_id',owner.id).throwOnError()).data).toEqual([{id:sentResult.estimateId,source:expect.objectContaining({kind:'work',id:workId})}]);
  let detail=await read();expect(detail.estimates).toEqual([expect.objectContaining({id:sentResult.estimateId,revision:1,lineCount:3})]);
  // Planning › Estimates lists it as this project's draft.
  const planning=await (await page.request.get('/api/pro/project-planning?'+new URLSearchParams({workId}),{headers:{'X-Pro-Expected-Actor':owner.id}})).json();
  expect(planning.items.map((row:{id:string;status:string})=>[row.id,row.status])).toEqual([[sentResult.estimateId,'draft']]);
  // Sending again to the same draft updates the same lines (no duplicates) and appends new ones; stale revision → 409.
  const resend={action:'send_estimate',actionId:uuid(),workId,measurementIds:[wall.id,typed.id],estimateId:sentResult.estimateId,estimateRevision:1,language};
  await post({...resend,estimateRevision:5},409);
  const wall2=(await post({action:'measurement_update',actionId:uuid(),workId,id:wall.id,revision:1,name:'Pared norte',categoryId:null,color:'#d9480f',points:[[0.1,0.1],[0.35,0.1],[0.35,0.6]],manualMilli:null,multiplierMode:'height',multiplierMilli:3000,wasteBps:1000,productId:null}))!.measurement!;
  expect(wall2.result.totalMilli).toBe(39600);// 12 m × 3 m × 1.10
  const second=(await post(resend))!.estimate!;expect(second).toMatchObject({created:false,estimateId:sentResult.estimateId,estimateRevision:2,lineCount:4});
  const after=await lines(sentResult.estimateId);expect(after.map(line=>[line.id,line.qtyMilli])).toEqual([[sentResult.lineIds[0],72000],[sentResult.lineIds[1],39600],[sentResult.lineIds[2],4000],[second.lineIds[1],7875]]);
  // Archive: kept in the history, no longer quotable; restore brings it back.
  const archivedTyped=(await post({action:'measurement_archive',actionId:uuid(),workId,id:typed.id,revision:1}))!.measurement!;expect(archivedTyped.archived).toBe(true);
  await post({action:'send_estimate',actionId:uuid(),workId,measurementIds:[typed.id],estimateId:null,estimateRevision:null,language},400);
  await post({action:'measurement_restore',actionId:uuid(),workId,id:typed.id,revision:2});

  // ---- Isolation: a second professional sees and changes nothing ----
  other=await browser.newContext({baseURL});await login(other,rival);const rh={Origin:origin,'X-Pro-Expected-Actor':rival.id};
  expect((await other.request.get(origin+api+'?'+new URLSearchParams({workId}),{headers:{'X-Pro-Expected-Actor':rival.id}})).status()).toBe(404);
  expect((await other.request.get(origin+api+'?'+new URLSearchParams({image:plan.id}),{headers:{'X-Pro-Expected-Actor':rival.id}})).status()).toBe(404);
  expect((await other.request.post(origin+api,{headers:rh,data:{action:'plan_update',actionId:uuid(),workId,id:plan.id,revision:1,title:'Intruso'}})).status()).toBe(403);
  expect((await other.request.post(origin+api,{headers:rh,data:{action:'send_estimate',actionId:uuid(),workId,measurementIds:[floor.id],estimateId:sentResult.estimateId,estimateRevision:2,language}})).status()).toBe(403);
  expect((await other.request.post(origin+api,{headers:rh,data:{...planInput,actionId:uuid(),id:uuid()}})).status()).toBe(403);
  detail=await read();expect(detail.plans[0].title).toBe('Planta baja');
  expect(detail.history.map(row=>row.action)).toEqual(['measurement_restore','measurement_archive','send_estimate','measurement_update','send_estimate','page_calibrate','page_calibrate','measurement_visibility','measurement_update','measurement_create','measurement_create','measurement_create','measurement_create','page_calibrate','measurement_create','plan_create']);

  // ---- Owner UI on the second project ----
  const mobile=(page.viewportSize()?.width??1366)<1024,suffix=`${language}${mobile?'-mobile':''}`;
  let failFirst=true;
  await page.route('**/api/pro/takeoffs?**',async route=>{const url=new URL(route.request().url());if(failFirst&&route.request().method()==='GET'&&url.searchParams.has('workId')){failFirst=false;return route.fulfill({status:503,json:{error:'LOCAL failure'}});}return route.continue();});
  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_agenda',cita:uiWorkId,vistaTrabajo:'takeoffs'}));
  const nav=page.getByRole('navigation',{name:en?'Job workspace':'Gestión del trabajo'});await expect(nav).toBeVisible({timeout:60000});
  const planningGroup=nav.locator('[data-job-workspace-group]').nth(1);await expect(planningGroup).toHaveAttribute('data-job-workspace-group',en?'Planning':'Planificación');
  await expect(planningGroup.getByRole('button',{name:en?'Measurements':'Mediciones',exact:true})).toHaveAttribute('aria-current','page');
  const loadError=page.locator('[data-takeoffs-load-error]');await expect(loadError).toBeVisible({timeout:60000});await loadError.getByRole('button',{name:en?'Retry':'Reintentar'}).click();
  const view=page.locator('[data-takeoffs]');await expect(view.locator('[data-takeoffs-empty]')).toBeVisible();
  await expectNoHorizontalOverflow(page);await page.screenshot({path:info.outputPath(`takeoffs-empty-${suffix}.png`),fullPage:true});
  // A broken PDF gets a clear message and nothing is uploaded (full PDF flow: pro-takeoffs-pdf.spec.ts).
  await view.locator('[data-takeoff-upload]').setInputFiles({name:'plano.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4\n%%EOF\n')});
  await expect(view.locator('[data-takeoff-error]')).toContainText(en?'This PDF could not be read.':'No se pudo leer este PDF.',{timeout:60000});await expect(view.locator('[data-takeoff-pdf]')).toHaveCount(0);
  await view.locator('[data-takeoff-upload]').setInputFiles({name:en?'ground-floor.png':'planta-baja.png',mimeType:'image/png',buffer:await planImage()});
  const planRow=view.locator('[data-takeoff-plan]').first();await expect(planRow).toContainText(en?'ground-floor':'planta-baja',{timeout:60000});
  await expect(planRow).toContainText(en?'JPG image':'Imagen JPG');await expect(planRow).toContainText('1');
  const viewer=view.locator('[data-takeoff-viewer]');await expect(viewer).toBeVisible();
  await expect(viewer.locator('[data-takeoff-tool="scale"]')).toHaveAttribute('aria-pressed','true');await expect(viewer.locator('[data-takeoff-scale-status]')).toHaveAttribute('data-takeoff-scale-status','missing');
  const canvas=viewer.locator('[data-takeoff-canvas]');await expect(viewer.locator('img')).toHaveJSProperty('complete',true);
  await expect.poll(()=>viewer.locator('img').evaluate(node=>(node as HTMLImageElement).naturalWidth)).toBe(1200);
  const at=async(x:number,y:number)=>{const box=(await canvas.boundingBox())!;await canvas.click({position:{x:box.width*x,y:box.height*y}});};
  // Rename the plan inline.
  await planRow.getByRole('button',{name:new RegExp(en?'^Rename':'^Renombrar')}).click();await view.locator('[data-takeoff-field="planTitle"]').fill(en?'Ground floor':'Planta baja');
  await view.getByRole('button',{name:en?'Save title':'Guardar título'}).click();await expect(planRow).toContainText(en?'Ground floor':'Planta baja');
  // Scale: draw the reference line and type 12 m.
  await at(0.1,0.5);await at(0.6,0.5);const scaleForm=viewer.locator('[data-takeoff-form="calibration"]');await expect(scaleForm).toBeVisible();
  await expect(nav.getByRole('button',{name:en?'Overview':'Resumen',exact:true})).toBeDisabled();// unsaved scale blocks the job menu
  await scaleForm.locator('[data-takeoff-field="calibrationLength"]').fill('0');await scaleForm.getByRole('button',{name:en?'Save scale':'Guardar escala'}).click();
  await expect(view.locator('[data-takeoff-error]')).toContainText(en?'greater than zero':'mayor que cero');
  await scaleForm.locator('[data-takeoff-field="calibrationLength"]').fill('12');await scaleForm.getByRole('button',{name:en?'Save scale':'Guardar escala'}).click();
  await expect(viewer.locator('[data-takeoff-scale-status]')).toHaveAttribute('data-takeoff-scale-status','set');await expect(viewer.locator('[data-takeoff-scale-status]')).toContainText('12 m');
  await expect(nav.getByRole('button',{name:en?'Overview':'Resumen',exact:true})).toBeEnabled();
  // Area with undo of the last point.
  const area=viewer.getByRole('button',{name:en?'Area':'Área',exact:true});await area.click();await expect(area).toHaveAttribute('aria-pressed','true');
  await at(0.1,0.1);await at(0.35,0.1);await at(0.5,0.9);await expect(viewer.locator('[data-takeoff-drawing]')).toContainText(en?'3 points':'3 puntos');
  await viewer.getByRole('button',{name:en?'Undo last point':'Deshacer último punto'}).click();await expect(viewer.locator('[data-takeoff-drawing]')).toContainText(en?'2 points':'2 puntos');
  await expect(viewer.getByRole('button',{name:en?'Finish':'Terminar'})).toBeDisabled();
  await at(0.35,0.6);await at(0.1,0.6);await viewer.getByRole('button',{name:en?'Finish':'Terminar'}).click();
  let form=viewer.locator('[data-takeoff-form="measurement"]');await form.locator('[data-takeoff-field="name"]').fill(en?'Kitchen floor':'Piso cocina');
  await expect(form.locator('[data-takeoff-preview]')).toContainText('m²');
  await form.locator('[data-takeoff-color="#7048e8"]').click();await expect(form.locator('[data-takeoff-color="#7048e8"]')).toHaveAttribute('aria-pressed','true');
  await form.getByRole('button',{name:en?'Save measurement':'Guardar medición'}).click();
  const panel=viewer.locator('[data-takeoff-panel]');const floorRow=panel.locator('[data-takeoff-measurement][data-takeoff-kind="area"]');await expect(floorRow).toContainText(en?'Kitchen floor':'Piso cocina');
  near(await floorRow.locator('[data-takeoff-total]').getAttribute('data-takeoff-total-milli'),36000);
  // Length × wall height + waste (typed in the locale's decimal format).
  await viewer.getByRole('button',{name:en?'Length':'Longitud',exact:true}).click();await at(0.1,0.1);await at(0.35,0.1);await at(0.35,0.6);await viewer.getByRole('button',{name:en?'Finish':'Terminar'}).click();
  form=viewer.locator('[data-takeoff-form="measurement"]');await form.locator('[data-takeoff-field="name"]').fill(en?'Kitchen walls':'Paredes cocina');
  await form.locator('[data-takeoff-field="multiplierMode"]').selectOption('height');await form.locator('[data-takeoff-field="multiplier"]').fill(en?'2.5':'2,5');await form.locator('[data-takeoff-field="waste"]').fill('10');
  await form.getByRole('button',{name:en?'Save measurement':'Guardar medición'}).click();
  const wallRow=panel.locator('[data-takeoff-measurement][data-takeoff-kind="length"]').first();await expect(wallRow).toContainText(en?'Kitchen walls':'Paredes cocina');
  await expect(wallRow).toContainText(en?'× 2.5 m height':'× 2,5 m de altura');await expect(wallRow).toContainText(en?'+10 % waste':'+10 % de desperdicio');
  near(await wallRow.locator('[data-takeoff-total]').getAttribute('data-takeoff-total-milli'),33000);
  // Count.
  await viewer.getByRole('button',{name:en?'Count':'Conteo',exact:true}).click();for(const x of [0.2,0.3,0.4,0.5])await at(x,0.2);
  await viewer.getByRole('button',{name:en?'Finish':'Terminar'}).click();form=viewer.locator('[data-takeoff-form="measurement"]');await form.locator('[data-takeoff-field="name"]').fill(en?'Outlets':'Tomacorrientes');
  await form.getByRole('button',{name:en?'Save measurement':'Guardar medición'}).click();
  const countRow=panel.locator('[data-takeoff-measurement][data-takeoff-kind="count"]');await expect(countRow.locator('[data-takeoff-total]')).toHaveText(en?'4 units':'4 unidades');
  // Alternative without a pointer: a typed value (exact).
  await panel.locator('[data-takeoff-manual]').click();form=viewer.locator('[data-takeoff-form="measurement"]');
  await form.getByRole('button',{name:en?'Save measurement':'Guardar medición'}).click();await expect(view.locator('[data-takeoff-error]')).toBeVisible();// name and quantity required
  await form.locator('[data-takeoff-field="name"]').fill(en?'Baseboard':'Zócalo');await form.locator('[data-takeoff-field="kind"]').selectOption('length');await form.locator('[data-takeoff-field="manual"]').fill(en?'7.5':'7,5');
  await expect(form.locator('[data-takeoff-preview]')).toContainText(en?'7.5 m':'7,5 m');await form.getByRole('button',{name:en?'Save measurement':'Guardar medición'}).click();
  const typedRow=panel.locator('[data-takeoff-measurement]').filter({hasText:en?'Baseboard':'Zócalo'});await expect(typedRow.locator('[data-takeoff-total]')).toHaveAttribute('data-takeoff-total-milli','7500');
  await expect(typedRow).toContainText(en?'Typed value':'Valor escrito');
  // Hide on the plan (toggle button state), then show again.
  const hideButton=countRow.locator('[data-takeoff-visibility]');await hideButton.click();await expect(countRow.locator('[data-takeoff-visibility]')).toHaveAttribute('aria-pressed','true');
  await expect(viewer.locator(`[data-takeoff-shape="${await countRow.getAttribute('data-takeoff-measurement')}"]`)).toHaveCount(0);
  await countRow.locator('[data-takeoff-visibility]').click();await expect(countRow.locator('[data-takeoff-visibility]')).toHaveAttribute('aria-pressed','false');
  // Zoom keeps the page inside the viewer (no page-level horizontal scroll).
  await viewer.locator('[data-takeoff-zoom="in"]').click();await expect(viewer).toContainText('150%');await expectNoHorizontalOverflow(page);await viewer.locator('[data-takeoff-zoom="fit"]').click();
  await viewer.scrollIntoViewIfNeeded();await expectNoHorizontalOverflow(page);await page.screenshot({path:info.outputPath(`takeoffs-viewer-${suffix}.png`),fullPage:true});
  // Reload: everything persisted.
  await page.reload();await expect(page.locator('[data-takeoff-plan]').first()).toBeVisible({timeout:60000});
  await page.locator('[data-takeoff-plan]').first().getByRole('button',{name:new RegExp(en?'^Open':'^Abrir')}).click();
  await expect(page.locator('[data-takeoff-panel] [data-takeoff-measurement]')).toHaveCount(4);await expect(page.locator('[data-takeoff-scale-status]')).toHaveAttribute('data-takeoff-scale-status','set');
  // Archive one (dialog), see it under archived and restore it.
  const reloaded=page.locator('[data-takeoff-panel]');
  await reloaded.locator('[data-takeoff-measurement]').filter({hasText:en?'Baseboard':'Zócalo'}).getByRole('button',{name:new RegExp(en?'^Archive':'^Archivar')}).click();
  const dialog=page.getByRole('dialog').last();await expect(dialog).toContainText(en?'stays in the history':'queda en el historial');await dialog.getByRole('button',{name:en?'Archive':'Archivar'}).click();
  await expect(reloaded.locator('[data-takeoff-measurement]')).toHaveCount(3);
  await reloaded.getByRole('button',{name:en?'Show archived (1)':'Mostrar archivadas (1)'}).click();await reloaded.locator('[data-takeoff-archived-measurement]').getByRole('button').click();
  await expect(reloaded.locator('[data-takeoff-measurement]')).toHaveCount(4);
  // Send to a new draft estimate and open it.
  const sendPanel=reloaded.locator('[data-takeoff-send]');await expect(sendPanel.locator('[data-takeoff-send-button]')).toHaveText(en?'Send 4 measurements':'Enviar 4 mediciones');
  await sendPanel.locator('[data-takeoff-send-button]').click();
  await expect(page.locator('[data-takeoff-notice]')).toContainText(en?'4 lines sent to «Ampliación de cocina».':'Se enviaron 4 partidas a «Ampliación de cocina».');
  await expect(sendPanel.locator('[data-takeoff-target]')).not.toHaveValue('new');
  await page.locator('[data-takeoff-panel]').scrollIntoViewIfNeeded();await expectNoHorizontalOverflow(page);await page.screenshot({path:info.outputPath(`takeoffs-sent-${suffix}.png`),fullPage:true});
  const uiEstimates=(await db.from('pro_private_estimates').select('id').eq('owner_id',owner.id).neq('id',sentResult.estimateId).throwOnError()).data!;expect(uiEstimates).toHaveLength(1);
  const uiLines=await lines(uiEstimates[0].id);expect(uiLines.map(line=>[line.description,line.unit])).toEqual([[en?'Kitchen floor':'Piso cocina','m²'],[en?'Kitchen walls':'Paredes cocina','m²'],[en?'Outlets':'Tomacorrientes',en?'ea':'unid.'],[en?'Baseboard':'Zócalo','m']]);
  expect(uiLines[2].qtyMilli).toBe(4000);expect(uiLines[3].qtyMilli).toBe(7500);
  await page.locator('[data-takeoff-open-estimate]').click();
  await expect.poll(()=>new URL(page.url()).searchParams.get('estimacionPrivada')).toBe(uiEstimates[0].id);
  const editor=page.locator('[data-private-estimate-editor]');await expect(editor.locator('[data-private-estimate-line]')).toHaveCount(4,{timeout:45000});
  await expect(editor.locator('[data-private-estimate-line]').first().getByLabel(en?'Description':'Descripción',{exact:true})).toHaveValue(en?'Kitchen floor':'Piso cocina');
  await expect(editor.locator('[data-private-estimate-line]').nth(3).getByLabel(en?'Quantity':'Cantidad',{exact:true})).toHaveValue(/^7[.,]5$/);
  await page.screenshot({path:info.outputPath(`takeoffs-estimate-${suffix}.png`),fullPage:true});
  // The customer view never exposes takeoffs: no table is reachable without the owner's tools.
  expect(await notices()).toEqual(noticesBefore);
  expect(runtime).toEqual([]);
 }finally{await other?.close();await anon?.close();await cleanupDisposableAccount(owner);if(rival)await cleanupDisposableAccount(rival);}
});

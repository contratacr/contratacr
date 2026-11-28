import {test,expect,type BrowserContext} from 'playwright/test';
import {createServerClient} from '@supabase/ssr';
import sharp from 'sharp';
import {createDisposableAccount,cleanupDisposableAccount,type DisposableAccount} from './disposable-account';
import {regressionAdminClient} from './seed';
import {emptyBusiness} from '../../src/lib/pro/business';
import {crTodayISO} from '../../src/lib/time-cr';
import {gotoOK,expectNoHorizontalOverflow,onAppPageError} from './helpers';
import {stabilizeLocalProRuntime} from './pro-local-stable-runtime';
import type {TakeoffDetail} from '../../src/lib/pro/takeoffs';

// Row 66: browser journey of the assisted room detection («Detectar ambiente» in Mediciones, takeoff-detect.ts).
// Manual measurement on an uploaded plan: the owner sets the scale, taps inside a room, confirms the proposed outline,
// saves it with the existing measurement writer and sends it to a private quote. No provider and no AI.
const origin='http://127.0.0.1:3185',api='/api/pro/takeoffs';
function local(baseURL:string|undefined){expect(baseURL).toBe(origin);expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');}
async function login(context:BrowserContext,actor:DisposableAccount){await stabilizeLocalProRuntime(context,origin);const auth=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{getAll:()=>[],setAll:async cookies=>context.addCookies(cookies.map(cookie=>({name:cookie.name,value:cookie.value,url:origin,sameSite:'Lax' as const})))}});const result=await auth.auth.signInWithPassword({email:actor.email,password:actor.password});expect(result.error).toBeNull();}

async function makePro(db:ReturnType<typeof regressionAdminClient>,account:DisposableAccount){
 const user=await db.auth.admin.getUserById(account.id);expect((await db.auth.admin.updateUserById(account.id,{user_metadata:{...user.data.user!.user_metadata,is_provider:true,role:'professional'}})).error).toBeNull();
 await db.from('profiles').update({is_provider:true,role:'professional'}).eq('id',account.id).throwOnError();await db.from('pro_memberships').insert({user_id:account.id,status:'active'}).throwOnError();
 await db.from('professionals').insert({profile_id:account.id,category_id:'desarrollo_web',business_name:'Detección local',slug:'tkd-'+account.id,whatsapp:'',provincia_id:'al',canton_id:'al-at',verification_status:'pending',is_banned:false,is_available:true}).throwOnError();
}

/**
 * 1200×600 generated plan (no external asset). Walls are 8 px strokes centred on the lines, so the left room's open
 * interior is x 124..415 and y 64..535: 292 × 472 px. With the reference line 600 px = 12 m (0.02 m/px) that is
 * 292 × 472 × 0.0004 = 55.13 m².
 */
async function planImage(){
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="600"><rect width="1200" height="600" fill="#ffffff"/><g fill="none" stroke="#1f2937" stroke-width="8"><rect x="120" y="60" width="960" height="480"/><line x1="420" y1="60" x2="420" y2="540"/><line x1="420" y1="300" x2="1080" y2="300"/></g><g stroke="#94a3b8" stroke-width="2"><line x1="120" y1="580" x2="720" y2="580"/></g></svg>`;
 return sharp(Buffer.from(svg)).png().toBuffer();
}
const EXPECTED_MILLI=Math.round(292*472*0.0004*1000);// 55 130 (m² × 1000)
// The outline is traced through the centres of the room's edge pixels, so it sits about half a pixel inside the
// wall on each side (291 × 471 px ≈ 54.82 m², −0.6 %); the stored plan is a JPEG, whose edge noise can move a wall
// edge by a pixel. 3 % (≈ 1.65 m²) covers both without accepting a leak into the other rooms (≥ 2× the area).
const TOLERANCE=0.03;

for(const language of ['es','en'] as const)test(`Takeoffs: detect a room on the plan, save it and send it to a quote [${language}]`,async({page,baseURL},info)=>{
 test.setTimeout(360000);local(baseURL);const en=language==='en',db=regressionAdminClient();
 const owner=await createDisposableAccount({prefix:'tkd-owner'});
 try{
  await makePro(db,owner);
  const workId=crypto.randomUUID(),day=crTodayISO(),client='cliente-deteccion',document=emptyBusiness();
  document.clients=[{id:client,name:'Cliente detección local',email:'',phone:'',notes:'',archived:false}];
  document.work=[{id:workId,clientId:client,client:'Cliente detección local',service:'Remodelación de dormitorio',stage:'scheduled',start:day+'T09:00:00-06:00',end:day+'T10:00:00-06:00',cancelled:false}];
  await db.from('pro_workspaces').insert({user_id:owner.id,document,revision:1}).throwOnError();await login(page.context(),owner);
  for(const endpoint of ['/api/auth/session-mfa','/api/auth/registration-state','/api/pro/access'])expect((await page.request.get(origin+endpoint,{timeout:45000})).status()).toBe(200);
  expect((await page.request.get(origin+'/api/pro/client-operations?'+new URLSearchParams({workId,clientId:client}),{timeout:45000})).status()).toBe(200);
  const runtime:string[]=[];onAppPageError(page,message=>runtime.push(message));
  const read=async()=>{const r=await page.request.get(api+'?'+new URLSearchParams({workId}),{headers:{'X-Pro-Expected-Actor':owner.id}});expect(r.status()).toBe(200);return await r.json() as TakeoffDetail;};
  const mobile=(page.viewportSize()?.width??1366)<1024,suffix=`${language}${mobile?'-mobile':''}`;

  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_agenda',cita:workId,vistaTrabajo:'takeoffs'}));
  const view=page.locator('[data-takeoffs]');await expect(view.locator('[data-takeoffs-empty]')).toBeVisible({timeout:60000});
  await view.locator('[data-takeoff-upload]').setInputFiles({name:en?'bedroom-plan.png':'plano-dormitorio.png',mimeType:'image/png',buffer:await planImage()});
  await expect(view.locator('[data-takeoff-plan]').first()).toContainText(en?'bedroom-plan':'plano-dormitorio',{timeout:60000});
  const viewer=view.locator('[data-takeoff-viewer]');await expect(viewer).toBeVisible();
  await expect.poll(()=>viewer.locator('img').evaluate(node=>(node as HTMLImageElement).naturalWidth)).toBe(1200);
  const canvas=viewer.locator('[data-takeoff-canvas]');
  const at=async(x:number,y:number)=>{const box=(await canvas.boundingBox())!;await canvas.click({position:{x:box.width*x,y:box.height*y}});};

  // Without a scale the tool says so before anything is tapped.
  const detectTool=viewer.locator('[data-takeoff-tool="detect"]');await expect(detectTool).toHaveText(en?'Detect room':'Detectar ambiente');
  await detectTool.click();await expect(detectTool).toHaveAttribute('aria-pressed','true');
  const status=viewer.locator('[data-takeoff-detect-status]');await expect(status).toHaveText(en?'Define the scale first so the area comes out in real units.':'Defina primero la escala para que el área salga en unidades reales.');

  // Scale: the reference line 600 px = 12 m.
  await viewer.locator('[data-takeoff-tool="scale"]').click();await at(0.1,0.5);await at(0.6,0.5);
  const scaleForm=viewer.locator('[data-takeoff-form="calibration"]');await expect(scaleForm).toBeVisible();
  await scaleForm.locator('[data-takeoff-field="calibrationLength"]').fill('12');await scaleForm.getByRole('button',{name:en?'Save scale':'Guardar escala'}).click();
  await expect(viewer.locator('[data-takeoff-scale-status]')).toHaveAttribute('data-takeoff-scale-status','set');

  await detectTool.click();await expect(detectTool).toHaveAttribute('aria-pressed','true');
  const points=viewer.locator('[data-takeoff-drawing]'),finish=viewer.getByRole('button',{name:en?'Finish':'Terminar'});
  // Outside the building the region reaches the page border: nothing is proposed and the message explains why.
  await at(0.04,0.04);
  await expect(status).toHaveText(en?'The room is not closed (an opening is too wide). Raise "Close doors" or draw the area by hand.':'El ambiente no está cerrado (una abertura es muy ancha). Suba "Cerrar puertas" o dibuje el área a mano.');
  await expect(points).toContainText(en?'0 points':'0 puntos');await expect(finish).toBeDisabled();
  // Inside the left room: an outline is proposed and can be confirmed.
  await at(0.2,0.5);
  await expect(status).toHaveText(en?/^Outline proposed with \d+ corners\. Review it and press "Finish", or tap again\.$/:/^Contorno propuesto con \d+ esquinas\. Revíselo y pulse "Terminar", o toque de nuevo\.$/);
  await expect(finish).toBeEnabled();
  await viewer.scrollIntoViewIfNeeded();await expectNoHorizontalOverflow(page);await page.screenshot({path:info.outputPath(`takeoff-detect-proposed-${suffix}.png`),fullPage:true});
  await finish.click();
  const form=viewer.locator('[data-takeoff-form="measurement"]');await expect(form).toBeVisible();
  await expect(form.locator('[data-takeoff-field="kind"]')).toHaveValue('area');// a detected outline is saved as an area
  await form.locator('[data-takeoff-field="name"]').fill(en?'Bedroom floor':'Piso dormitorio');
  await expect(form.locator('[data-takeoff-preview]')).toContainText('m²');
  await form.getByRole('button',{name:en?'Save measurement':'Guardar medición'}).click();

  const panel=viewer.locator('[data-takeoff-panel]'),row=panel.locator('[data-takeoff-measurement][data-takeoff-kind="area"]');
  await expect(row).toHaveCount(1);await expect(row).toContainText(en?'Bedroom floor':'Piso dormitorio');
  const shownMilli=Number(await row.locator('[data-takeoff-total]').getAttribute('data-takeoff-total-milli'));
  expect(Math.abs(shownMilli-EXPECTED_MILLI),`${shownMilli} ≈ ${EXPECTED_MILLI}`).toBeLessThanOrEqual(EXPECTED_MILLI*TOLERANCE);
  // Stored by the existing writer as an area polygon on the calibrated page.
  const detail=await read();expect(detail.measurements).toHaveLength(1);const saved=detail.measurements[0];
  expect(saved).toMatchObject({kind:'area',name:en?'Bedroom floor':'Piso dormitorio',archived:false,result:{unit:'m2',needsScale:false,totalMilli:shownMilli}});
  expect(saved.points.length).toBeGreaterThanOrEqual(4);
  for(const [x,y] of saved.points){expect(x).toBeGreaterThan(0.09);expect(x).toBeLessThan(0.36);expect(y).toBeGreaterThan(0.09);expect(y).toBeLessThan(0.91);}// inside the left room's walls
  expect(detail.history.map(entry=>entry.action)).toEqual(['measurement_create','page_calibrate','plan_create']);

  // Send to a new private quote: the line quantity is the area's net quantity.
  const sendPanel=panel.locator('[data-takeoff-send]');await expect(sendPanel.locator('[data-takeoff-send-button]')).toHaveText(en?'Send 1 measurement':'Enviar 1 medición');
  await sendPanel.locator('[data-takeoff-send-button]').click();
  await expect(page.locator('[data-takeoff-notice]')).toContainText(en?'1 line sent to "Remodelación de dormitorio".':'Se envió 1 partida a "Remodelación de dormitorio".');
  const estimates=(await db.from('pro_private_estimates').select('id,source').eq('owner_id',owner.id).throwOnError()).data!;
  expect(estimates).toEqual([{id:expect.any(String),source:expect.objectContaining({kind:'work',id:workId})}]);
  const lines=(await db.from('pro_private_estimate_items').select('position,content').eq('owner_id',owner.id).eq('estimate_id',estimates[0].id).order('position').throwOnError()).data!.map(item=>item.content as Record<string,unknown>);
  expect(lines).toEqual([expect.objectContaining({description:en?'Bedroom floor':'Piso dormitorio',unit:'m²',qtyMilli:shownMilli,catalogProductId:null})]);
  expect((await read()).estimates).toEqual([expect.objectContaining({id:estimates[0].id,lineCount:1})]);
  await panel.scrollIntoViewIfNeeded();await expectNoHorizontalOverflow(page);await page.screenshot({path:info.outputPath(`takeoff-detect-sent-${suffix}.png`),fullPage:true});
  expect(runtime).toEqual([]);
 }finally{await cleanupDisposableAccount(owner);}
});

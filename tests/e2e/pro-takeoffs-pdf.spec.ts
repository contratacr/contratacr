import {test,expect,type BrowserContext} from 'playwright/test';
import {createServerClient} from '@supabase/ssr';
import {createDisposableAccount,cleanupDisposableAccount,type DisposableAccount} from './disposable-account';
import {regressionAdminClient} from './seed';
import {emptyBusiness} from '../../src/lib/pro/business';
import {crTodayISO} from '../../src/lib/time-cr';
import {gotoOK,expectNoHorizontalOverflow,collectPageErrors} from './helpers';
import {stabilizeLocalProRuntime} from './pro-local-stable-runtime';
import type {TakeoffDetail} from '../../src/lib/pro/takeoffs';

// Row 66: PDF plans. The PDF is rendered in the browser with the vendored pdf.js (worker
// served locally from /vendor/pdfjs/); only the chosen page is uploaded as the plan image.
const origin='http://127.0.0.1:3185',api='/api/pro/takeoffs';
async function login(context:BrowserContext,actor:DisposableAccount){await stabilizeLocalProRuntime(context,origin);const auth=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{getAll:()=>[],setAll:async cookies=>context.addCookies(cookies.map(cookie=>({name:cookie.name,value:cookie.value,url:origin,sameSite:'Lax' as const})))}});expect((await auth.auth.signInWithPassword({email:actor.email,password:actor.password})).error).toBeNull();}
/** Minimal valid PDF (real xref offsets); each page fills shapes, no fonts or external assets. */
function pdf(pages:{width:number;height:number;draw:string}[]){
 const objects:string[]=[];objects[1]='<< /Type /Catalog /Pages 2 0 R >>';objects[2]=`<< /Type /Pages /Kids [${pages.map((_,i)=>`${3+i*2} 0 R`).join(' ')}] /Count ${pages.length} >>`;
 pages.forEach((page,i)=>{objects[3+i*2]=`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${page.width} ${page.height}] /Contents ${4+i*2} 0 R /Resources << >> >>`;objects[4+i*2]=`<< /Length ${Buffer.byteLength(page.draw)} >>\nstream\n${page.draw}\nendstream`;});
 let out='%PDF-1.4\n';const offsets:number[]=[];
 for(let n=1;n<objects.length;n++){offsets[n]=Buffer.byteLength(out);out+=`${n} 0 obj\n${objects[n]}\nendobj\n`;}
 const xref=Buffer.byteLength(out);out+=`xref\n0 ${objects.length}\n0000000000 65535 f \n`+offsets.slice(1).map(offset=>String(offset).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
 return Buffer.from(out,'latin1');
}

for(const language of ['es','en'] as const)test(`Plan measurements from a PDF page: local pdf.js render, page choice and the usual scale flow [${language}]`,async({page,baseURL},info)=>{
 test.setTimeout(300000);expect(baseURL).toBe(origin);expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');
 const en=language==='en',db=regressionAdminClient(),owner=await createDisposableAccount({prefix:'tko-pdf'}),errors=collectPageErrors(page);
 const mobile=(page.viewportSize()?.width??1366)<1024,suffix=`${language}${mobile?'-mobile':''}`;
 try{
  const user=await db.auth.admin.getUserById(owner.id);expect((await db.auth.admin.updateUserById(owner.id,{user_metadata:{...user.data.user!.user_metadata,is_provider:true,role:'professional'}})).error).toBeNull();
  await db.from('profiles').update({is_provider:true,role:'professional'}).eq('id',owner.id).throwOnError();await db.from('pro_memberships').insert({user_id:owner.id,status:'active'}).throwOnError();
  await db.from('professionals').insert({profile_id:owner.id,category_id:'desarrollo_web',business_name:'Mediciones PDF local',slug:'tko-pdf-'+owner.id,whatsapp:'',provincia_id:'al',canton_id:'al-at',verification_status:'pending',is_banned:false,is_available:true}).throwOnError();
  const workId=crypto.randomUUID(),client='cliente-pdf',day=crTodayISO(),document=emptyBusiness();
  document.clients=[{id:client,name:'Cliente planos PDF',email:'',phone:'',notes:'',archived:false}];
  document.work=[{id:workId,clientId:client,client:'Cliente planos PDF',service:'Casa de dos plantas',stage:'scheduled',start:day+'T09:00:00-06:00',end:day+'T10:00:00-06:00',cancelled:false}];
  await db.from('pro_workspaces').insert({user_id:owner.id,document,revision:1}).throwOnError();await login(page.context(),owner);
  for(const endpoint of ['/api/auth/session-mfa','/api/auth/registration-state','/api/pro/access'])expect((await page.request.get(endpoint,{timeout:45000})).status()).toBe(200);
  expect((await page.request.get('/api/pro/client-operations?'+new URLSearchParams({workId,clientId:client}),{timeout:45000})).status()).toBe(200);
  const read=async()=>{const r=await page.request.get(api+'?'+new URLSearchParams({workId}),{headers:{'X-Pro-Expected-Actor':owner.id}});expect(r.status()).toBe(200);return await r.json() as TakeoffDetail;};
  // pdf.js and its worker come from this origin only (no CDN; only loopback hosts are contacted).
  const external:string[]=[],vendor:string[]=[];page.on('request',request=>{const url=new URL(request.url());if(/^https?:$/.test(url.protocol)&&url.hostname!=='127.0.0.1'&&url.hostname!=='localhost')external.push(url.href);if(url.pathname.startsWith('/vendor/pdfjs/'))vendor.push(url.pathname);});
  const uploads:string[]=[];page.on('request',request=>{if(new URL(request.url()).pathname==='/api/pro/work-files'&&request.method()==='POST')uploads.push(request.postDataJSON().name);});

  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_agenda',cita:workId,vistaTrabajo:'takeoffs'}));
  const view=page.locator('[data-takeoffs]');await expect(view.locator('[data-takeoffs-empty]')).toBeVisible({timeout:60000});
  await expect(view).toContainText(en?'or a PDF of up to 25 MB and 200 pages':'o un PDF de hasta 25 MB y 200 páginas');
  const input=view.locator('[data-takeoff-upload]'),error=view.locator('[data-takeoff-error]');
  // Rejected before anything is uploaded: not a PDF, oversize, and an unreadable PDF.
  await input.setInputFiles({name:'plano.pdf',mimeType:'application/pdf',buffer:Buffer.from('<html>no es un PDF</html>')});await expect(error).toContainText(en?'This PDF could not be read.':'No se pudo leer este PDF.');
  await input.setInputFiles({name:'enorme.pdf',mimeType:'application/pdf',buffer:Buffer.alloc(25*1024*1024+1,32)});await expect(error).toContainText(en?'Use a PDF of up to 25 MB.':'Use un PDF de hasta 25 MB.');
  await input.setInputFiles({name:'roto.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4\n%%EOF\n')});await expect(error).toContainText(en?'This PDF could not be read.':'No se pudo leer este PDF.',{timeout:60000});
  expect(uploads).toEqual([]);await expect(view.locator('[data-takeoff-pdf]')).toHaveCount(0);

  // Two pages: a red landscape sheet and a 2:1 plan whose left half is black.
  const file=pdf([{width:842,height:595,draw:'1 0 0 rg 0 0 842 595 re f'},{width:600,height:300,draw:'0 0 0 rg 0 0 300 300 re f'}]);
  await input.setInputFiles({name:'planos-casa.pdf',mimeType:'application/pdf',buffer:file});
  const chooser=view.locator('[data-takeoff-pdf]');await expect(chooser).toBeVisible({timeout:60000});await expect(error).toHaveCount(0);
  await expect(chooser.getByRole('heading',{name:en?'Choose the PDF page':'Elegir la página del PDF'})).toBeVisible();
  await expect(chooser.locator('[data-takeoff-pdf-summary]')).toHaveText(en?'planos-casa.pdf · 2 pages':'planos-casa.pdf · 2 páginas');
  const canvas=chooser.locator('[data-takeoff-pdf-canvas]'),pageInput=chooser.locator('[data-takeoff-pdf-page]');
  // Colour of the rendered preview at relative points (tolerant to anti-aliasing).
  const colours=(...points:[number,number][])=>canvas.evaluate((node,list)=>{const c=node as HTMLCanvasElement,context=c.getContext('2d')!;return list.map(([x,y])=>{const [r,g,b]=context.getImageData(Math.floor(c.width*x),Math.floor(c.height*y),1,1).data;return r>230&&g<30&&b<30?'red':r<30&&g<30&&b<30?'black':r>230&&g>230&&b>230?'white':`${r},${g},${b}`;});},points);
  await expect(pageInput).toHaveValue('1');await expect(canvas).toHaveAccessibleName(en?'Preview of page 1 of 2':'Vista previa de la página 1 de 2');
  await expect.poll(()=>canvas.evaluate(node=>[(node as HTMLCanvasElement).width,(node as HTMLCanvasElement).height])).toEqual([1600,1130]);
  await expect.poll(()=>colours([0.5,0.5])).toEqual(['red']);
  expect(uploads).toEqual([]);
  for(const button of await chooser.getByRole('button').all())expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect((await pageInput.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await expectNoHorizontalOverflow(page);await chooser.scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath(`takeoffs-pdf-page1-${suffix}.png`)});
  // Choose page 2 (button), check bounds on the typed page and its preview.
  await expect(chooser.getByRole('button',{name:en?'Previous page':'Página anterior'})).toBeDisabled();
  await chooser.getByRole('button',{name:en?'Next page':'Página siguiente'}).click();await expect(pageInput).toHaveValue('2');await expect(chooser.getByRole('button',{name:en?'Next page':'Página siguiente'})).toBeDisabled();
  await expect.poll(()=>canvas.evaluate(node=>[(node as HTMLCanvasElement).width,(node as HTMLCanvasElement).height])).toEqual([1600,800]);
  await expect.poll(()=>colours([0.25,0.5],[0.75,0.5])).toEqual(['black','white']);
  await pageInput.fill('3');await chooser.locator('[data-takeoff-pdf-use]').click();await expect(error).toContainText(en?'choose an existing page':'elija una página existente');expect(uploads).toEqual([]);
  await pageInput.fill('2');await expect(error).toHaveCount(0);
  await expectNoHorizontalOverflow(page);await page.screenshot({path:info.outputPath(`takeoffs-pdf-page2-${suffix}.png`)});
  await chooser.locator('[data-takeoff-pdf-use]').click();
  const planRow=view.locator('[data-takeoff-plan]').first();await expect(planRow).toContainText('planos-casa · p. 2',{timeout:60000});await expect(chooser).toHaveCount(0);
  expect(uploads).toEqual(['planos-casa · p. 2.jpg']);
  const detail=await read();expect(detail.plans).toHaveLength(1);expect(detail.plans[0]).toMatchObject({title:'planos-casa · p. 2',mimeType:'image/jpeg',pageCount:1});expect(detail.plans[0].pages[0]).toMatchObject({pageNumber:1,widthPx:1600,heightPx:800});
  // The usual calibration and measurement flow on the rendered page.
  const viewer=view.locator('[data-takeoff-viewer]');await expect(viewer).toBeVisible();await expect.poll(()=>viewer.locator('img').evaluate(node=>(node as HTMLImageElement).naturalWidth)).toBe(1600);
  await expect(viewer.locator('[data-takeoff-tool="scale"]')).toHaveAttribute('aria-pressed','true');
  const area=viewer.locator('[data-takeoff-canvas]'),at=async(x:number,y:number)=>{const box=(await area.boundingBox())!;await area.click({position:{x:box.width*x,y:box.height*y}});};
  await at(0.1,0.5);await at(0.6,0.5);const scaleForm=viewer.locator('[data-takeoff-form="calibration"]');await expect(scaleForm).toBeVisible();
  await scaleForm.locator('[data-takeoff-field="calibrationLength"]').fill('10');await scaleForm.getByRole('button',{name:en?'Save scale':'Guardar escala'}).click();
  await expect(viewer.locator('[data-takeoff-scale-status]')).toHaveAttribute('data-takeoff-scale-status','set');
  await viewer.getByRole('button',{name:en?'Length':'Longitud',exact:true}).click();await at(0.1,0.2);await at(0.6,0.2);await viewer.getByRole('button',{name:en?'Finish':'Terminar'}).click();
  const form=viewer.locator('[data-takeoff-form="measurement"]');await form.locator('[data-takeoff-field="name"]').fill(en?'Facade from PDF':'Fachada del PDF');await form.getByRole('button',{name:en?'Save measurement':'Guardar medición'}).click();
  const row=viewer.locator('[data-takeoff-panel] [data-takeoff-measurement][data-takeoff-kind="length"]');await expect(row).toContainText(en?'Facade from PDF':'Fachada del PDF');
  const total=Number(await row.locator('[data-takeoff-total]').getAttribute('data-takeoff-total-milli'));expect(Math.abs(total-10000)).toBeLessThanOrEqual(400);
  await expectNoHorizontalOverflow(page);await page.screenshot({path:info.outputPath(`takeoffs-pdf-measured-${suffix}.png`),fullPage:true});
  // Cancel keeps nothing.
  await input.setInputFiles({name:'otro.pdf',mimeType:'application/pdf',buffer:file});await expect(chooser).toBeVisible({timeout:60000});await chooser.getByRole('button',{name:en?'Cancel':'Cancelar'}).click();await expect(chooser).toHaveCount(0);
  expect((await read()).plans).toHaveLength(1);expect(uploads).toHaveLength(1);
  expect(vendor).toEqual(expect.arrayContaining(['/vendor/pdfjs/pdf-6.4.299.min.mjs','/vendor/pdfjs/pdf.worker-6.4.299.min.mjs']));expect(external).toEqual([]);
  expect((await db.from('notifications').select('id').eq('user_id',owner.id).throwOnError()).data).toEqual([]);
  expect(errors()).toEqual([]);
 }finally{await page.goto('about:blank').catch(()=>{});await cleanupDisposableAccount(owner);}
});

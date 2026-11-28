import {test,expect,type BrowserContext} from 'playwright/test';
import {createServerClient} from '@supabase/ssr';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {createDisposableAccount,cleanupDisposableAccount,type DisposableAccount} from './disposable-account';
import {regressionAdminClient} from './seed';
import {emptyBusiness} from '../../src/lib/pro/business';
import {crTodayISO} from '../../src/lib/time-cr';
import {moodTemplateElements} from '../../src/lib/pro/round12';
import {gotoOK,expectNoHorizontalOverflow,onAppPageError} from './helpers';
import {stabilizeLocalProRuntime} from './pro-local-stable-runtime';

// Row 61, panel UI: a new board started from a built-in template (Cocina), «Guardar esta página como plantilla» in the
// templates panel, applying that own template on another page (undo / redo, then saved), and «Mi biblioteca de imágenes»:
// a company-file photo and a catalog-item photo copied into the job as private job photos and placed on the board.
// The API rules of own templates are in pro-board-templates.spec.ts; the layout rules in pro-board-templates-unit.spec.ts.
const origin='http://127.0.0.1:3185';
function local(baseURL:string|undefined){expect(baseURL).toBe(origin);expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');}
async function login(context:BrowserContext,actor:DisposableAccount){await stabilizeLocalProRuntime(context,origin);const auth=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{getAll:()=>[],setAll:async cookies=>context.addCookies(cookies.map(cookie=>({name:cookie.name,value:cookie.value,url:origin,sameSite:'Lax' as const})))}});const result=await auth.auth.signInWithPassword({email:actor.email,password:actor.password});expect(result.error).toBeNull();}
const uuid=()=>crypto.randomUUID();

async function makePro(db:ReturnType<typeof regressionAdminClient>,account:DisposableAccount){
 const user=await db.auth.admin.getUserById(account.id);expect((await db.auth.admin.updateUserById(account.id,{user_metadata:{...user.data.user!.user_metadata,is_provider:true,role:'professional'}})).error).toBeNull();
 await db.from('profiles').update({is_provider:true,role:'professional'}).eq('id',account.id).throwOnError();await db.from('pro_memberships').insert({user_id:account.id,status:'active'}).throwOnError();
 await db.from('professionals').insert({profile_id:account.id,category_id:'desarrollo_web',business_name:'Biblioteca tableros local',slug:'mood-lib-'+account.id,whatsapp:'',provincia_id:'al',canton_id:'al-at',verification_status:'pending',is_banned:false,is_available:true}).throwOnError();
}

for(const language of ['es','en'] as const)test(`Idea boards panel: built-in and own page templates, image library from company files and catalog photos [${language}]`,async({page,baseURL},info)=>{
 test.setTimeout(420000);local(baseURL);const en=language==='en',db=regressionAdminClient(),owner=await createDisposableAccount({prefix:'mood-lib'});
 try{
  await makePro(db,owner);
  const workId=uuid(),productId='grifo-lib',day=crTodayISO(),clientId='private-'+uuid(),document=emptyBusiness();
  document.clients=[{id:clientId,name:'Cliente biblioteca local',email:'',phone:'',notes:'',archived:false}];
  document.products=[{id:productId,sku:'GRI-1',name:en?'Brushed steel faucet':'Grifo de acero cepillado',stock:0,minimum:0,cost:20000,price:35000,archived:false,category:en?'Faucets':'Grifería',unit:'u'}];
  document.work=[{id:workId,clientId,client:'Cliente biblioteca local',service:'Remodelación de cocina',stage:'scheduled',start:day+'T11:00:00-06:00',end:day+'T12:00:00-06:00',cancelled:false}];
  await db.from('pro_workspaces').insert({user_id:owner.id,document,revision:1}).throwOnError();await login(page.context(),owner);
  for(const endpoint of ['/api/auth/session-mfa','/api/auth/registration-state','/api/pro/access'])expect((await page.request.get(origin+endpoint,{timeout:45000})).status()).toBe(200);
  expect((await page.request.get(origin+'/api/pro/client-operations?'+new URLSearchParams({workId,clientId}),{timeout:45000})).status()).toBe(200);
  // A real photo in the company files (Empresa › Archivos): JPEG bytes in the private bucket plus its row.
  const companyFile=uuid(),jpeg=await sharp({create:{width:320,height:240,channels:3,background:'#b08d57'}}).jpeg({quality:85}).toBuffer(),objectPath=`${owner.id}/${companyFile}.jpg`;
  expect((await db.storage.from('pro-company-files').upload(objectPath,jpeg,{contentType:'image/jpeg'})).error).toBeNull();
  await db.from('pro_company_files').insert({owner_id:owner.id,id:companyFile,name:en?'kitchen-hardware.jpg':'herrajes-cocina.jpg',mime_type:'image/jpeg',size_bytes:jpeg.length,sha256:createHash('sha256').update(jpeg).digest('hex'),object_path:objectPath,ready:true}).throwOnError();
  // A catalog item photo through the existing catalog-details upload (Mis artículos).
  const png=await sharp({create:{width:200,height:200,channels:3,background:'#9a9a9a'}}).png().toBuffer();
  const up=await page.request.post(origin+'/api/pro/catalog-details',{headers:{Origin:origin},data:{action:'upload_image',actionId:uuid(),productId,revision:0,name:'grifo.png',data:png.toString('base64')}});expect(up.status(),await up.text()).toBe(200);
  const jobFiles=async()=>(await db.from('pro_work_files').select('id').eq('owner_id',owner.id).eq('work_id',workId).throwOnError()).data!.length;
  expect(await jobFiles()).toBe(0);

  const runtime:string[]=[];onAppPageError(page,message=>runtime.push(message));
  const mobile=(page.viewportSize()?.width??1366)<1024,suffix=`${language}${mobile?'-mobile':''}`;
  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_agenda',cita:workId,vistaTrabajo:'moodboards'}));
  const nav=page.getByRole('navigation',{name:en?'Job workspace':'Gestión del trabajo'});await expect(nav).toBeVisible({timeout:60000});
  const boards=page.locator('[data-mood-boards]');await expect(boards.getByRole('button',{name:en?'New board':'Nuevo tablero'})).toBeVisible({timeout:60000});

  // ---- (a) Built-in template: the first page starts with the Kitchen layout ----
  const kitchen=moodTemplateElements('kitchen',en).length;expect(kitchen).toBeGreaterThan(3);
  await boards.getByRole('button',{name:en?'New board':'Nuevo tablero'}).click();
  const form=boards.locator('[data-mood-board-form]');await form.locator('[data-mood-field="name"]').fill(en?'Kitchen ideas':'Ideas de cocina');
  await form.locator('[data-mood-field="template"]').selectOption('kitchen');
  await form.getByRole('button',{name:en?'Create board':'Crear tablero'}).click();
  const editor=page.locator('[data-mood-board-editor]');await expect(editor).toBeVisible({timeout:60000});
  const canvas=editor.locator('[data-mood-canvas="editor"]'),items=canvas.locator('[data-mood-element]');
  await expect(items).toHaveCount(kitchen,{timeout:60000});
  await expect(canvas).toContainText(en?'Kitchen: ideas and materials':'Cocina: ideas y materiales');
  await expect(canvas.locator('[data-mood-element="swatch"]')).toHaveCount(4);

  // ---- (b) Own template: save this page, apply it on a new page, undo / redo, save ----
  await editor.locator('[data-mood-templates-toggle]').click();
  const templates=editor.locator('[data-mood-templates]');await expect(templates).toBeVisible();
  await expect(templates).toContainText(en?'You have no templates of your own yet.':'Todavía no tiene plantillas propias.');
  await templates.locator('[data-mood-template-save]').click();
  await expect(templates.locator('[data-mood-template-error]')).toContainText(en?'Enter a name for the template.':'Escriba un nombre para la plantilla.');
  const templateName=en?'My kitchen layout':'Mi distribución de cocina';
  await templates.locator('[data-mood-template-name]').fill(templateName);await templates.locator('[data-mood-template-save]').click();
  await expect(templates.locator('[data-mood-template-notice]')).toContainText(en?'Template saved.':'Plantilla guardada.');
  const row=templates.locator('[data-mood-template]');await expect(row).toHaveCount(1);await expect(row).toContainText(templateName);
  await expect(row).toContainText(en?`${kitchen} elements`:`${kitchen} elementos`);
  const stored=(await db.from('pro_mood_board_templates').select('name,elements').eq('owner_id',owner.id).throwOnError()).data!;
  expect(stored).toHaveLength(1);expect(stored[0]!.name).toBe(templateName);expect((stored[0]!.elements as unknown[]).length).toBe(kitchen);
  await expectNoHorizontalOverflow(page);await page.screenshot({path:info.outputPath(`mood-templates-${suffix}.png`),fullPage:true});
  await templates.getByRole('button',{name:en?'Close':'Cerrar',exact:true}).click();await expect(templates).toHaveCount(0);
  await editor.getByRole('button',{name:en?'Add page':'Agregar página'}).click();await expect(editor.locator('[data-mood-page-thumb]')).toHaveCount(2);
  await expect(editor.locator('[data-mood-page-thumb="2"]')).toHaveAttribute('aria-current','page');await expect(items).toHaveCount(0);
  await editor.locator('[data-mood-templates-toggle]').click();await expect(templates).toBeVisible();
  await templates.locator('[data-mood-template-apply]').click();// empty page: applied without asking, the panel closes
  await expect(templates).toHaveCount(0);await expect(items).toHaveCount(kitchen);
  await editor.getByRole('button',{name:en?'Undo':'Deshacer',exact:true}).click();await expect(items).toHaveCount(0);
  await editor.getByRole('button',{name:en?'Redo':'Rehacer',exact:true}).click();await expect(items).toHaveCount(kitchen);
  await editor.locator('[data-mood-save-page]').click();await expect(editor.getByRole('status').filter({hasText:en?'Page saved.':'Página guardada.'})).toBeVisible();
  // On a page with content, applying asks first; cancelling keeps the page.
  await editor.locator('[data-mood-templates-toggle]').click();await templates.locator('[data-mood-template-apply]').click();
  const ask=page.getByRole('dialog').last();await expect(ask).toContainText(en?'Apply the template?':'¿Aplicar la plantilla?');
  await ask.getByRole('button',{name:en?'Cancel':'Cancelar',exact:true}).click();await expect(items).toHaveCount(kitchen);
  await templates.getByRole('button',{name:en?'Close':'Cerrar',exact:true}).click();

  // ---- (c) Image library: a company-file photo is copied into the job and placed ----
  const panel=editor.locator('[data-mood-add-panel]');
  const openImages=async()=>{if(!await panel.filter({has:page.locator('[data-mood-library]')}).count())await editor.locator('[data-mood-add="image"]').click();await expect(panel.locator('[data-mood-library]')).toBeVisible();};
  await openImages();const library=panel.locator('[data-mood-library]');
  await expect(library).toContainText(en?'No external image banks are used.':'No se usan bancos de imágenes externos.');
  await expect(library.locator('[data-mood-library-source="company"]')).toHaveAttribute('aria-pressed','true');
  const companyPick=library.locator(`[data-mood-library-image="${companyFile}"]`);await expect(companyPick).toBeVisible({timeout:60000});
  await expect.poll(()=>companyPick.locator('img').evaluate(node=>(node as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await companyPick.click();
  const photos=canvas.locator('[data-mood-element="image"]');await expect(photos).toHaveCount(1,{timeout:60000});
  await expect.poll(()=>photos.first().locator('img').evaluate(node=>(node as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await expect.poll(jobFiles).toBe(1);// a private job photo, not a link to the company file

  // ---- (d) Image library: a catalog-item photo ----
  await openImages();await library.locator('[data-mood-library-source="catalog"]').click();
  await expect(library.locator('[data-mood-library-source="catalog"]')).toHaveAttribute('aria-pressed','true');
  const catalogPick=library.locator(`[data-mood-library-image="${productId}"]`);await expect(catalogPick).toBeVisible({timeout:60000});
  await expect(catalogPick).toContainText(en?'Brushed steel faucet':'Grifo de acero cepillado');
  await catalogPick.click();await expect(photos).toHaveCount(2,{timeout:60000});await expect.poll(jobFiles).toBe(2);
  await expectNoHorizontalOverflow(page);await page.screenshot({path:info.outputPath(`mood-library-${suffix}.png`),fullPage:true});
  await editor.locator('[data-mood-save-page]').click();await expect(editor.getByRole('status').filter({hasText:en?'Page saved.':'Página guardada.'})).toBeVisible();

  // Reload: the second page keeps the template layout and both copied photos.
  await page.reload();const card=page.locator('[data-mood-board-card]').first();await expect(card).toBeVisible({timeout:60000});
  await card.getByRole('button',{name:en?'Open':'Abrir',exact:true}).click();await expect(editor.locator('[data-mood-page-thumb]')).toHaveCount(2,{timeout:60000});
  await editor.locator('[data-mood-page-thumb="2"]').click();await expect(items).toHaveCount(kitchen+2,{timeout:60000});
  const files=(await db.from('pro_work_files').select('id,mime_type').eq('owner_id',owner.id).eq('work_id',workId).throwOnError()).data!;
  expect(files.map(file=>file.mime_type)).toEqual(['image/jpeg','image/jpeg']);
  expect(runtime).toEqual([]);
 }finally{await cleanupDisposableAccount(owner);}
});

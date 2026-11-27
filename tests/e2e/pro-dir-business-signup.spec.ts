import {test,expect} from 'playwright/test';
import {collectPageErrors,expectNoHorizontalOverflow,gotoOK} from './helpers';
import {local,login} from './pro-round2-fixture';
import {createDisposableAccount,cleanupDisposableAccount} from './disposable-account';
import {dirDb,hideSeededPlaces,label,postJson,seedPlace,trackPlace,uid} from './pro-dir-fixture';
import {placeRequestQueue} from '@/lib/directory/place-request';

// Sign-up «Profesional» → «Profesional independiente» or «Empresa o local» (owner 2026-11-27, directory on). Owner of
// /registro/empresa, /api/negocio/buscar and /api/negocio/solicitud: the business searches itself by name and claims it (existing claim page),
// or asks the team to add it → a DRAFT place (source owner, not public) in the staff queue «Lugares nuevos».
// BUSINESS_SIGNUP_SHOTS_DIR=<dir> saves the screens at 390 and 1280.
test.afterEach(()=>hideSeededPlaces());
const shotsDir=process.env.BUSINESS_SIGNUP_SHOTS_DIR;

test('sign-up: Profesional asks independiente or empresa; empresa finds and claims, or requests a new place',async({page,context},info)=>{
 test.setTimeout(240000);local(info.project.use.baseURL);
 const db=dirDb(),tag=label(),slug=`soda-alta-${tag}`;
 await seedPlace(db,{slug,vertical:'restaurant',name:`Soda Alta ${tag}`});
 await context.setExtraHTTPHeaders({'x-forwarded-for':`10.${Math.floor(Math.random()*250)}.${Math.floor(Math.random()*250)}.${Math.floor(Math.random()*250)}`});
 const errors=collectPageErrors(page);
 const shot=async(name:string)=>{if(!shotsDir)return;for(const width of [390,1280]){await page.setViewportSize({width,height:width>800?900:844});
  await page.screenshot({path:`${shotsDir}/4-${name}-${width}.png`,fullPage:true});}};

 // Choice screen: Cliente stays a link; Profesional opens the second question.
 await gotoOK(page,'/registro');
 await expect(page.getByRole('link',{name:/Busco servicios/})).toHaveAttribute('href',/\/registro\/cliente/);
 await shot('registro');
 await page.locator('[data-register-pro]').click();
 await expect(page.getByRole('heading',{name:'¿Cómo ofrece sus servicios?'})).toBeVisible();
 await expect(page.locator('[data-register-pro-kind-option=independiente]')).toHaveAttribute('href',/\/registro\/profesional$/);
 await expect(page.locator('[data-register-pro-kind-option=empresa]')).toHaveAttribute('href',/\/registro\/empresa$/);
 await expectNoHorizontalOverflow(page);
 await shot('registro-tipo');

 // Empresa o local: search by name → the claim page of the place.
 await page.locator('[data-register-pro-kind-option=empresa]').click();
 await expect(page.getByRole('heading',{name:'Agregar o reclamar mi empresa'})).toBeVisible();
 const hit=page.locator(`[data-business-claim="${slug}"]`);
 // Typed again until the page is hydrated (a value typed before hydration is not searched).
 await expect(async()=>{await page.locator('[data-business-search]').fill(`Soda Alta ${tag}`);await expect(hit).toBeVisible({timeout:4000});}).toPass({timeout:45000});
 await expect(hit).toHaveAttribute('href',`/lugar/${slug}/reclamar`);
 await shot('empresa-busqueda');
 // Not found, signed out: an account is needed first (the form would be lost on the way), and the API refuses.
 await page.locator('[data-business-search]').fill(`Nada ${tag} zzz`);
 await expect(page.locator('[data-business-no-results]')).toBeVisible({timeout:30000});
 await page.locator('[data-business-request-open]').click();
 await expect(page.locator('[data-business-request-login] a').first()).toHaveAttribute('href',/\/registro\/cliente\?redirect=%2Fregistro%2Fempresa/);
 expect((await postJson(page,'/api/negocio/solicitud',{actionId:uid(),place:{vertical:'restaurant',name:'X'}})).status).toBe(401);

 const user=await createDisposableAccount({prefix:'dir-alta'});
 try{
  await login(context,user);
  await gotoOK(page,'/registro/empresa');
  const form=page.locator('[data-business-request]');
  await expect(async()=>{await page.locator('[data-business-request-open]').click({timeout:4000});await expect(form).toBeVisible({timeout:4000});}).toPass({timeout:45000});
  await form.locator('[data-business-request-submit]').click();
  await expect(form.locator('[data-business-request-error]')).toHaveText('Elija la sección.');
  await form.locator('select[name=vertical]').selectOption('restaurant');
  await form.locator('input[name=name]').fill(`Soda Nueva ${tag}`);
  await form.locator('select[name=province]').selectOption('Heredia');
  await form.locator('select[name=canton]').selectOption({index:1});
  await form.locator('input[name=phone]').fill('2260-1111');
  await shot('empresa-solicitud');
  await form.locator('[data-business-request-submit]').click();
  await expect(page.locator('[data-business-request-sent]')).toContainText('Recibimos su solicitud.');
  await shot('empresa-enviada');
  // A draft (not public), created by this person with source owner, listed in the staff queue «Lugares nuevos».
  const row=(await db.from('dir_places').select('id,slug,status,phone,admin_area_1').eq('name',`Soda Nueva ${tag}`).single()).data as {id:string;slug:string;status:string;phone:string;admin_area_1:string};
  trackPlace(row.id,uid());
  expect(row).toMatchObject({status:'draft',admin_area_1:'Heredia'});
  const queue=await placeRequestQueue(db as never);
  expect('items' in queue&&queue.items?.find(i=>i.placeId===row.id)).toMatchObject({name:`Soda Nueva ${tag}`,requesterEmail:user.email});
  expect((await page.request.get(`/lugar/${row.slug}`)).status()).toBe(404);
  // Bad data is refused with the field.
  const bad=await postJson(context,'/api/negocio/solicitud',{actionId:uid(),place:{vertical:'restaurant',name:`Soda ${tag}`,website:'sitio'}});
  expect(bad.status).toBe(400);expect(bad.body?.reason).toBe('invalid_website');
 }finally{await cleanupDisposableAccount(user);}
 expect(errors()).toEqual([]);
});

import {randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {createServerClient} from '@supabase/ssr';
import {test,expect,type Page,type BrowserContext} from 'playwright/test';
import {collectPageErrors,expectNoHorizontalOverflow,gotoOK,waitForInteractivePage} from './helpers';
import {regressionAdminClient} from './seed';
import {cleanupDisposableAccount} from './disposable-account';

// «Ofrezco servicios» step of sign-up (directory on, owner 2026-11-27), end to end:
// /registro → «Ofrezco servicios» → «¿Cómo ofrece sus servicios?» → «Profesional independiente» → account, code, service,
// location → «Publicar mi perfil» → the panel with the session; and the same question in /onboarding (Google/Apple accounts).
// The question is a history entry (?paso=profesional): Back returns to the first question and, from /registro/profesional,
// to this question (before 2026-11-28 it was page state: Back left sign-up and came back to the first question).
const PASSWORD=`Ofrezco!${randomUUID().slice(0,8)}aA1`;
const KIND_TITLE='¿Cómo ofrece sus servicios?';
const created:string[]=[];

test.describe.configure({mode:'serial'});
test.afterEach(async()=>{
 const admin=regressionAdminClient();
 for(const email of created.splice(0)){
  const {data}=await admin.from('profiles').select('id').eq('email',email).maybeSingle();
  const id=(data as {id?:string}|null)?.id;
  if(id)await cleanupDisposableAccount({id,email,password:''}).catch(()=>{});
 }
});
test.beforeEach(async({context})=>{
 await context.setExtraHTTPHeaders({'x-forwarded-for':`10.${Math.floor(Math.random()*250)}.${Math.floor(Math.random()*250)}.${Math.floor(Math.random()*250)}`});
});

/** Sign-up without e-mail delivery: the admin API creates the account and the code screen gets a real session. */
async function interceptSignUp(page:Page){
 const admin=regressionAdminClient(),state:{email?:string}={};
 await page.route('**/auth/v1/signup**',async route=>{
  const body=route.request().postDataJSON() as {email:string;password:string;data?:Record<string,unknown>};
  const {data,error}=await admin.auth.admin.generateLink({type:'signup',email:body.email,password:body.password,options:{data:body.data??{}}});
  if(error||!data.user)return route.fulfill({status:400,json:{msg:error?.message??'no user'}});
  state.email=body.email;created.push(body.email);
  await route.fulfill({status:200,json:data.user});
 });
 await page.route('**/auth/v1/verify**',async route=>{
  if(!state.email)return route.continue();
  const {data:users}=await admin.auth.admin.listUsers({page:1,perPage:200});
  const user=users.users.find(u=>u.email===state.email);
  if(!user)return route.fulfill({status:400,json:{msg:'no user'}});
  await admin.auth.admin.updateUserById(user.id,{email_confirm:true});
  const anon=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{auth:{persistSession:false}});
  const {data:signIn,error}=await anon.auth.signInWithPassword({email:state.email,password:PASSWORD});
  if(error||!signIn.session)return route.fulfill({status:400,json:{msg:error?.message??'no session'}});
  await route.fulfill({status:200,json:{...signIn.session,user:signIn.user}});
 });
 return state;
}

async function typeCode(page:Page){
 const boxes=page.locator('input[inputmode="numeric"]').filter({visible:true});
 await expect(boxes.first()).toBeVisible({timeout:30_000});
 for(let attempt=0;attempt<6;attempt++){
  const sent=page.waitForRequest(r=>r.url().includes('/auth/v1/verify'),{timeout:4_000}).then(()=>true,()=>false);
  await boxes.first().fill('123456');
  if(await sent)return;
 }
 throw new Error('The code screen never sent the code.');
}

/** «Volver» of the step: the bar arrow on phones, the in-page link from lg. */
const stepBack=(page:Page)=>page.getByRole('button',{name:'Volver',exact:true}).filter({visible:true}).first();

/** Service, location and publish: the steps after the account, the same for e-mail and Google/Apple accounts. */
async function publishProfile(page:Page,email:string){
 const main=page.locator('main');
 await main.getByRole('button',{name:'Busque su servicio'}).click();
 await page.getByRole('dialog').getByRole('textbox',{name:'Buscar servicio...',exact:true}).fill('Desarrollo web');
 await page.getByRole('button',{name:/^Desarrollo web/}).or(page.getByRole('option',{name:/^Desarrollo web/})).first().click();
 const location=main.locator('[data-field="location"]');
 await location.getByRole('switch',{name:/Atiendo a domicilio/}).click();
 await location.getByRole('button',{name:'Elija una provincia',exact:true}).click();
 await page.getByRole('option',{name:/^Alajuela$/}).first().click();
 await location.getByRole('button',{name:'Elija un cantón',exact:true}).click();
 await page.getByRole('option',{name:/^Atenas$/}).first().click();
 await location.getByRole('button',{name:'Agregar zona',exact:true}).click();
 await expect(location.getByText('Atenas, Alajuela',{exact:true})).toBeVisible();
 const phone=main.locator('input[type="tel"]');
 if(await phone.count()&&!(await phone.first().inputValue()))await phone.first().fill('88885555');
 const cedula=main.getByPlaceholder(/c[eé]dula/i);
 if(await cedula.count()&&await cedula.first().isVisible()&&!(await cedula.first().inputValue()))await cedula.first().fill('112340567');
 await main.getByRole('button',{name:/^Continuar$/}).click();
 await main.getByRole('button',{name:/^Publicar mi perfil$/}).click();
 // Out of public search: a profile that appears and is deleted moves the cached list for other specs.
 const admin=regressionAdminClient();
 await expect.poll(async()=>{
  const {data:profile}=await admin.from('profiles').select('id').eq('email',email).maybeSingle();
  const id=(profile as {id?:string}|null)?.id;if(!id)return 0;
  const {data}=await admin.from('professionals').update({oculto_del_buscador:true}).eq('profile_id',id).select('id');
  return (data??[]).length;
 },{timeout:30_000}).toBeGreaterThan(0);
 await page.waitForURL(/\/dashboard\/profesional/,{timeout:30_000});
 expect(new URL(page.url()).pathname).not.toMatch(/\/login/);
}

test('«Ofrezco servicios» on /registro: the kind question is a history step; «Profesional independiente» signs up and publishes',async({page})=>{
 test.setTimeout(240_000);
 const errors=collectPageErrors(page);
 await gotoOK(page,'/');
 await gotoOK(page,'/registro');
 await waitForInteractivePage(page);
 await page.locator('[data-register-pro]').click();
 const kind=page.locator('[data-register-pro-kind]');
 await expect(kind.getByRole('heading',{name:KIND_TITLE})).toBeVisible();
 await expect(page).toHaveURL(/\/registro\?paso=profesional$/);
 await expect(page.locator('[data-register-pro-kind-option=independiente]')).toHaveAttribute('href',/\/registro\/profesional$/);
 await expectNoHorizontalOverflow(page);

 // Browser Back (the phone's back gesture) returns to the first question, Forward to the step again.
 await page.goBack();
 await expect(page).toHaveURL(/\/registro$/);
 await expect(page.locator('[data-register-pro]')).toBeVisible();
 await expect(kind).toHaveCount(0);
 await page.goForward();
 await expect(kind.getByRole('heading',{name:KIND_TITLE})).toBeVisible();
 // The step's own «Volver» does the same, without leaving sign-up.
 await stepBack(page).click();
 await expect(page).toHaveURL(/\/registro$/);
 await expect(page.locator('[data-register-pro]')).toBeVisible();

 // «Profesional independiente» → the professional form; Back from there lands on the kind question, not the first one.
 await page.locator('[data-register-pro]').click();
 await page.locator('[data-register-pro-kind-option=independiente]').click();
 await page.waitForURL(/\/registro\/profesional$/);
 await waitForInteractivePage(page);
 await page.goBack();
 await expect(kind.getByRole('heading',{name:KIND_TITLE})).toBeVisible();
 await page.goForward();
 await page.waitForURL(/\/registro\/profesional$/);
 await waitForInteractivePage(page);

 const signUp=await interceptSignUp(page);
 const main=page.locator('main');
 const email=`ofrezco-${Date.now()}-${randomUUID().slice(0,6)}@contratacr.test`;
 await main.getByRole('button',{name:'Registrarme sin identificación por ahora'}).click();
 await main.getByPlaceholder('Su nombre completo').fill('Profesional Independiente Prueba');
 await main.locator('input[type="email"]').fill(email);
 await main.getByPlaceholder('Mínimo 8 caracteres').fill(PASSWORD);
 await main.getByPlaceholder('Repita su contraseña').fill(PASSWORD);
 const terms=main.getByRole('checkbox').first();
 if(await terms.count()){await terms.locator('..').locator('span[aria-hidden="true"]').click();await expect(terms).toBeChecked();}
 await main.getByRole('button',{name:/^Continuar$/}).click();
 await expect.poll(()=>signUp.email,{timeout:30_000}).toBe(email);
 await typeCode(page);
 await publishProfile(page,email);
 const admin=regressionAdminClient();
 const {data:profile}=await admin.from('profiles').select('id,role').eq('email',email).single();
 expect((profile as {role:string}).role).toBe('professional');
 expect(errors()).toEqual([]);
});

async function signInAs(context:BrowserContext,baseURL:string,email:string,password:string){
 const auth=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{getAll:()=>[],setAll:async cookies=>{await context.addCookies(cookies.map(cookie=>({name:cookie.name,value:cookie.value,url:baseURL,sameSite:'Lax' as const})));}}});
 expect((await auth.auth.signInWithPassword({email,password})).error).toBeNull();
}

test('«Ofrezco servicios» in /onboarding (Google/Apple account): same history step; «Profesional independiente» keeps the intent and publishes',async({page,context,baseURL})=>{
 test.setTimeout(240_000);
 const admin=regressionAdminClient();
 // A brand-new social account: verified identity, no role yet, onboarding not completed.
 const email=`ofrezco-social-${Date.now()}-${randomUUID().slice(0,6)}@contratacr.test`;created.push(email);
 const {data,error}=await admin.auth.admin.createUser({email,password:PASSWORD,email_confirm:true,user_metadata:{full_name:'Cuenta Social Prueba'}});
 expect(error).toBeNull();
 const id=data.user!.id;
 await signInAs(context,baseURL!,email,PASSWORD);
 const errors=collectPageErrors(page);
 await gotoOK(page,'/onboarding?new=1');
 const offer=page.getByRole('button',{name:/Ofrezco servicios/});
 await expect(offer).toBeVisible({timeout:30_000});
 await waitForInteractivePage(page);
 await offer.click();
 const kind=page.locator('[data-onboarding-pro-kind]');
 await expect(kind.getByRole('heading',{name:KIND_TITLE})).toBeVisible();
 await expect(page).toHaveURL(/[?&]paso=profesional/);
 await expectNoHorizontalOverflow(page);
 await page.goBack();
 await expect(offer).toBeVisible();
 await expect(kind).toHaveCount(0);
 await page.goForward();
 await expect(kind.getByRole('heading',{name:KIND_TITLE})).toBeVisible();
 await stepBack(page).click();
 await expect(offer).toBeVisible();
 await offer.click();
 // Choosing is only an intent until the profile exists: the account stays a client with intended_role professional.
 await page.locator('[data-onboarding-pro-kind-option=independiente]').click();
 await page.waitForURL(/\/registro\/profesional/,{timeout:30_000});
 await expect.poll(async()=>(await admin.auth.admin.getUserById(id)).data.user?.user_metadata,{timeout:15_000}).toMatchObject({role:'client',intended_role:'professional',onboarding_completed:false});
 await waitForInteractivePage(page);
 // Step 1 shows the connected account in full: a long address wraps, it is never cut with an ellipsis.
 const connected=page.locator('main').getByText(email,{exact:true});
 await expect(connected).toBeVisible({timeout:30_000});
 expect(await connected.evaluate(el=>el.scrollWidth<=el.clientWidth&&getComputedStyle(el).textOverflow!=='ellipsis')).toBe(true);
 const main=page.locator('main');
 await main.getByRole('button',{name:'Registrarme sin identificación por ahora'}).click();
 await main.getByRole('button',{name:/^Continuar$/}).click();
 await publishProfile(page,email);
 const {data:profile}=await admin.from('profiles').select('role').eq('id',id).single();
 expect((profile as {role:string}).role).toBe('professional');
 expect(errors()).toEqual([]);
});

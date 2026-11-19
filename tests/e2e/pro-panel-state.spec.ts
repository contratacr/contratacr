import {test, expect, type BrowserContext, type Page, type Request} from 'playwright/test';
import {createServerClient} from '@supabase/ssr';
import {createDisposableAccount, cleanupDisposableAccount, type DisposableAccount} from './disposable-account';
import {regressionAdminClient} from './seed';
import {emptyBusiness} from '../../src/lib/pro/business';
import {gotoOK, expectNoHorizontalOverflow,PRO_SPACE_HOME_URL,proSpaceTitle,proSpaceBack} from './helpers';

for (const locale of ['es', 'en'] as const) test(`Panel state: cache hydration, missing provider guard, guides and one header [${locale}]`, async ({page, browser, baseURL}, testInfo) => {
  test.setTimeout(180000);
  expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');
  const db = regressionAdminClient(), owner = await createDisposableAccount({prefix:'panel-state-owner'}), customer = await createDisposableAccount({prefix:'panel-state-customer'});
  let clientContext: BrowserContext | undefined;
  let release = () => {};
  const prefix = locale === 'en' ? '/en' : '/es';
  const expectEmptyDay=async()=>{await expect(page.locator('[data-pro-day]')).toHaveCount(0);};
  const renderErrors: string[] = [];
  const watchRender = (target: Page) => {
    target.on('pageerror', error=>renderErrors.push(error.message));
    target.on('console', message=>{if(message.type()==='error'&&/hydration|hydrated|maximum update depth|snapshot.*cached|rendered (?:more|fewer) hooks/i.test(message.text()))renderErrors.push(message.text());});
  };
  watchRender(page);
  const pendingReads = new Set<Request>();
  let followUpResponses=0,requiredFollowUpResponses=0;
  page.on('response', response=>{if(new URL(response.url()).pathname==='/api/contact/follow-up'&&response.request().method()==='GET')followUpResponses++;});
  page.on('request', request=>{const origin=new URL(request.url()).origin;if(request.isNavigationRequest()&&request.frame()===page.mainFrame()&&origin===new URL(baseURL!).origin)requiredFollowUpResponses=followUpResponses+1;if(['fetch','xhr'].includes(request.resourceType())&&[new URL(baseURL!).origin,process.env.NEXT_PUBLIC_SUPABASE_URL].includes(origin))pendingReads.add(request);});
  page.on('requestfinished', request=>pendingReads.delete(request));
  page.on('requestfailed', request=>pendingReads.delete(request));
  const finishReads=async()=>{try{
    // The optional review prompt starts its GET four seconds after a document loads.
    // A momentarily empty request set must not let the next full navigation cancel it.
    await expect.poll(()=>followUpResponses).toBeGreaterThanOrEqual(requiredFollowUpResponses);
    await expect.poll(()=>pendingReads.size).toBe(0);}catch(error){await testInfo.attach('pending-local-requests',{body:Buffer.from(JSON.stringify(await Promise.all([...pendingReads].map(async request=>({path:new URL(request.url()).pathname,method:request.method(),type:request.resourceType(),status:(await request.response())?.status(),failure:request.failure()?.errorText}))))),contentType:'application/json'});throw error;}};
  async function login(context: BrowserContext, actor: DisposableAccount) {
    const auth = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {cookies:{getAll:()=>[], setAll:async cookies=>context.addCookies(cookies.map(cookie=>({name:cookie.name,value:cookie.value,url:baseURL!,sameSite:'Lax' as const})))}});
    expect((await auth.auth.signInWithPassword({email:actor.email,password:actor.password})).error).toBeNull();
  }
  try {
    // Returning-account fixture: first-touch attribution is already settled.
    // Keep the complete profile comparison; do not ignore these columns.
    await db.from('profiles').update({acquisition_source:'direct',acquisition_captured_at:new Date().toISOString(),acquisition_landing_path:'/dashboard/profesional'}).in('id',[owner.id,customer.id]).throwOnError();
    await db.from('profiles').update({is_provider:true,role:'professional'}).eq('id',owner.id).throwOnError();
    const authOwner = await db.auth.admin.getUserById(owner.id);
    expect((await db.auth.admin.updateUserById(owner.id,{user_metadata:{...authOwner.data.user!.user_metadata,is_provider:true}})).error).toBeNull();
    const professional = (await db.from('professionals').insert({profile_id:owner.id,category_id:'redes_internet',business_name:'Panel conservado',slug:'panel-state-'+owner.id,whatsapp:'',provincia_id:'al',canton_id:'al-al',verification_status:'pending',is_banned:false}).select('*').single().throwOnError()).data!;
    const profile = (await db.from('profiles').select('full_name,phone,avatar_url,cedula').eq('id',owner.id).single().throwOnError()).data!;
    await db.from('pro_memberships').insert({user_id:owner.id,status:'active'}).throwOnError();
    const document = emptyBusiness();
    await db.from('pro_workspaces').insert({user_id:owner.id,document,revision:1}).throwOnError();
    await login(page.context(),owner);
    for (const path of ['/api/auth/session-mfa','/api/auth/registration-state','/api/pro/access','/api/pro/catalog','/api/pro/agenda','/api/pro/appointment-requests','/api/direct-chat','/api/analytics/usage','/api/attribution/claim','/api/projects','/api/contact/follow-up']) expect((await page.request.fetch(path,{method:'OPTIONS',timeout:30000})).status()).toBe(204);
    const before = (await db.from('profiles').select('*').in('id',[owner.id,customer.id]).order('id').throwOnError()).data;
    const notices = (await db.from('notifications').select('*').in('user_id',[owner.id,customer.id]).order('id').throwOnError()).data;
    await gotoOK(page,prefix+'/dashboard/profesional?tab=home');
    await expectEmptyDay();
    await finishReads();

    const isProfessionalRead = (url: string) => {const u=new URL(url);return u.pathname==='/rest/v1/professionals'&&u.searchParams.get('profile_id')==='eq.'+owner.id&&u.searchParams.get('select')==='*';};
    let heldReads = 0;
    const gate = () => {heldReads=0;return new Promise<void>(resolve=>{release=resolve;});};
    let pending = gate();
    await page.route('**/rest/v1/professionals?**',async route=>{if(isProfessionalRead(route.request().url())){heldReads++;await pending;}await route.continue().catch(()=>{});});
    const putCache = async (pro: typeof professional | null) => page.evaluate(({id,otherId,profile,pro})=>{
      for(const [uid,value] of [[id,pro],[otherId,{business_name:'FOREIGN CACHE MUST NOT APPEAR'}]] as const) sessionStorage.setItem('ccr:dashboard-cache:dashboard:bootstrap:'+uid,JSON.stringify({version:1,updatedAt:Date.now(),data:{pro:value,profile}}));
    },{id:owner.id,otherId:customer.id,profile,pro});
    await putCache(professional);
    const currentProfessional = page.waitForResponse(r=>isProfessionalRead(r.url()));
    await gotoOK(page,prefix+'/dashboard/profesional?tab=home');
    await expect.poll(()=>heldReads).toBeGreaterThan(0);
    // A warm provider must remain usable while its real revalidation is held.
    await expect(page.getByTestId('panel-tab-pro_agenda').filter({visible:true})).toBeVisible();
    await expectEmptyDay();
    await expect(page.getByText('FOREIGN CACHE MUST NOT APPEAR',{exact:true})).toHaveCount(0);
    release();expect((await currentProfessional).status()).toBe(200);
    // The next full document must not abort an old notification/profile read.
    await finishReads();

    pending = gate();
    await putCache(null);
    const missingProfessional = page.waitForResponse(r=>isProfessionalRead(r.url()));
    await gotoOK(page,prefix+'/dashboard/profesional?tab=home');
    await expect.poll(()=>heldReads).toBeGreaterThan(0);
    // A cache without a professional row must not turn a provider into a client.
    await expect(page.locator('[aria-busy="true"]').filter({visible:true}).first()).toBeVisible();
    await expect(page.getByTestId('panel-tab-sent_projects').filter({visible:true})).toHaveCount(0);
    release();expect((await missingProfessional).status()).toBe(200);
    await expectEmptyDay();
    await finishReads();
    await page.unroute('**/rest/v1/professionals?**');

    await gotoOK(page,prefix+'/dashboard/profesional?tab=guides&ref=local-panel');
    const guides = page.getByRole('dialog').filter({has:page.getByPlaceholder(locale==='en'?'Search the guides':'Buscar en las guías')});
    await expect(guides).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(new URL(page.url()).searchParams.get('tab')).toBe('home');
    expect(new URL(page.url()).searchParams.get('ref')).toBe('local-panel');
    await finishReads();await page.reload();await expectEmptyDay();await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByTestId('panel-tab-pro_tools').filter({visible:true}).click();
    await expect(page.locator('[data-pro-tools]')).toBeVisible();
    if((page.viewportSize()?.width??0)<1024){
      // Independent Pro space: a single own header (banner) with h1 «Inicio» and
      // «Volver a Mi panel», instead of the navbar's [data-ccr-section-title]/«Volver».
      await expect(page).toHaveURL(PRO_SPACE_HOME_URL);
      await expect(proSpaceTitle(page)).toHaveText(locale==='en'?'Overview':'Inicio');
      await expect(page.getByRole('banner').filter({visible:true})).toHaveCount(1);
      await expect(page.locator('.ccr-cabecera-pegada:not(.ccr-app-header)').filter({visible:true})).toHaveCount(0);
      await proSpaceBack(page,locale==='en');
      await expectEmptyDay();
      await page.getByTestId('panel-tab-pro_tools').filter({visible:true}).click();
      await expect(proSpaceTitle(page)).toHaveText(locale==='en'?'Overview':'Inicio');
    }
    await expectNoHorizontalOverflow(page);await page.screenshot({path:testInfo.outputPath('panel-header-'+locale+'.png'),fullPage:true});

    clientContext=await browser.newContext({viewport:page.viewportSize()??undefined});await login(clientContext,customer);
    const clientPage=await clientContext.newPage();watchRender(clientPage);await gotoOK(clientPage,prefix+'/dashboard/profesional?tab=guides');
    await expect(clientPage.getByRole('dialog')).toBeVisible();await clientPage.keyboard.press('Escape');await expect(clientPage.getByRole('dialog')).toHaveCount(0);
    // Desktop basic accounts resume their normal Projects destination;
    // compact layouts resume the panel menu. Pro resumes My panel above.
    await expect.poll(()=>new URL(clientPage.url()).searchParams.get('tab')).toBe((page.viewportSize()?.width??0)>=1024?'sent_projects':'home');
    expect((await clientPage.request.get('/api/pro/access')).status()).toBe(403);
    await expect(clientPage.getByTestId('panel-tab-pro_agenda')).toHaveCount(0);
    const clientHome=clientPage.url();
    const openGuides=()=>clientPage.getByRole('button',{name:locale==='en'?'Guides':'Guías',exact:true}).filter({visible:true}).first().click();
    await openGuides();await expect(clientPage.getByRole('dialog')).toBeVisible();
    expect(clientPage.url()).toBe(clientHome);
    await clientPage.keyboard.press('Escape');await expect(clientPage.getByRole('dialog')).toHaveCount(0);
    expect(clientPage.url()).toBe(clientHome);
    await openGuides();await expect(clientPage.getByRole('dialog')).toBeVisible();
    await clientPage.evaluate(()=>window.addEventListener('ccr:confirm-unsaved-action',event=>event.preventDefault(),{once:true}));
    await clientPage.getByRole('dialog').getByRole('button',{name:locale==='en'?'Contact support':'Contactar soporte',exact:true}).click();
    await expect(clientPage.getByRole('dialog')).toHaveCount(0);expect(clientPage.url()).toBe(clientHome);
    await openGuides();await expect(clientPage.getByRole('dialog')).toBeVisible();
    await clientPage.getByRole('dialog').getByRole('button',{name:locale==='en'?'Contact support':'Contactar soporte',exact:true}).click();
    await expect.poll(()=>new URL(clientPage.url()).searchParams.get('tab')).toBe('soporte');
    await expect(clientPage.getByRole('dialog')).toHaveCount(0);
    expect(new URL(clientPage.url()).pathname).toBe(new URL(clientHome).pathname);
    expect((await db.from('profiles').select('*').in('id',[owner.id,customer.id]).order('id').throwOnError()).data).toEqual(before);
    expect((await db.from('notifications').select('*').in('user_id',[owner.id,customer.id]).order('id').throwOnError()).data).toEqual(notices);
    expect((await db.from('quotes').select('id').eq('professional_id',professional.id).throwOnError()).data).toEqual([]);
    expect((await db.from('pro_workspaces').select('document').eq('user_id',owner.id).single().throwOnError()).data!.document).toEqual(document);
    expect(renderErrors).toEqual([]);
  } catch(error) {await page.screenshot({path:testInfo.outputPath('panel-state-failure.png'),fullPage:true}).catch(()=>{});throw error;}
  finally {release();await page.goto('about:blank').catch(()=>{});await clientContext?.close();for(const actor of [owner,customer])await cleanupDisposableAccount(actor);}
});

import {test, expect} from 'playwright/test';
import {createServerClient} from '@supabase/ssr';
import {createDisposableAccount, cleanupDisposableAccount} from './disposable-account';
import {regressionAdminClient} from './seed';
import {emptyBusiness} from '../../src/lib/pro/business';
import {gotoOK} from './helpers';

// Real shared Modal + focused field. Emulation does not supply Safari's toolbar,
// so verify its paint sources and geometry: no exposed backdrop below a
// fullscreen form, while sheets retain their backdrop inside the viewport.
test('Pro modal keyboard: no dark paint outside the visible form, backdrop retained', async ({page, baseURL}, testInfo) => {
  // Mobile contract only: the visual-viewport fit lives in globals.css @media (max-width:640px) and 804 = 844-40 (iPhone viewport);
  // docs/pro/modal-keyboard-boundary-local.md validated it on mobile WebKit/Chromium. Desktop has no such rule.
  test.skip((page.viewportSize()?.width??0)>640,'Mobile keyboard contract (globals.css @media max-width:640px)');
  test.setTimeout(120000);
  expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');
  const actor=await createDisposableAccount({prefix:'pro-keyboard'}), db=regressionAdminClient();
  try {
    await db.from('profiles').update({is_provider:true,role:'professional'}).eq('id',actor.id).throwOnError();
    const account=await db.auth.admin.getUserById(actor.id);expect(account.error).toBeNull();expect((await db.auth.admin.updateUserById(actor.id,{user_metadata:{...account.data.user!.user_metadata,is_provider:true}})).error).toBeNull();
    await db.from('pro_memberships').insert({user_id:actor.id,status:'active'}).throwOnError();
    await db.from('professionals').insert({profile_id:actor.id,category_id:'redes_internet',business_name:'Teclado local',slug:'keyboard-'+actor.id,whatsapp:'',provincia_id:'al',canton_id:'al-al',verification_status:'pending',is_banned:false}).throwOnError();
    await db.from('pro_workspaces').insert({user_id:actor.id,document:emptyBusiness(),revision:1}).throwOnError();
    const auth=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{getAll:()=>[],setAll:async cookies=>{await page.context().addCookies(cookies.map(c=>({name:c.name,value:c.value,url:baseURL!,sameSite:'Lax' as const})));}}});
    expect((await auth.auth.signInWithPassword({email:actor.email,password:actor.password})).error).toBeNull();
    for(const endpoint of ['/api/auth/session-mfa','/api/auth/registration-state'])expect((await page.request.get(endpoint,{timeout:45000})).status()).toBe(200);
    await gotoOK(page,'/es/dashboard/profesional?tab=pro_clients');
    await page.getByRole('button',{name:'Nuevo cliente',exact:true}).click();
    const dialog=page.getByRole('dialog',{name:'Nuevo cliente',exact:true});
    await dialog.getByLabel('Nombre',{exact:true}).fill('PRUEBA_TECLADO');
    await dialog.getByLabel('Nombre',{exact:true}).focus();
    // Neutral paint witness behind the real dialog; it is not application data.
    await page.evaluate(()=>{const witness=document.createElement('div');witness.id='keyboard-paint-witness';witness.style.cssText='position:fixed;inset:0;background:#fff;z-index:99';document.body.append(witness);});
    // Accessory bar + hardware keyboard: only 40px are lost, so the normal
    // software-keyboard flag stays off. The wrapper must still follow it.
    await page.evaluate(()=>{const height=window.innerHeight-40;Object.defineProperty(window.visualViewport,'height',{configurable:true,get:()=>height});Object.defineProperty(window.visualViewport,'offsetTop',{configurable:true,get:()=>0});window.visualViewport!.dispatchEvent(new Event('resize'));});
    await expect.poll(()=>page.locator('.app-modal-screen').evaluate(n=>Math.round(n.getBoundingClientRect().bottom))).toBe(804);
    expect(await page.evaluate(()=>document.documentElement.hasAttribute('data-keyboard-open'))).toBe(false);
    await expect.poll(()=>dialog.evaluate(n=>Math.round(n.getBoundingClientRect().bottom))).toBe(804);
    await expect(page.locator('.app-modal-screen')).toHaveCSS('box-shadow','none');
    await page.screenshot({path:testInfo.outputPath('keyboard-accessory.png'),scale:'css'});
    await page.evaluate(()=>{Object.defineProperty(window.visualViewport,'height',{configurable:true,get:()=>380});Object.defineProperty(window.visualViewport,'offsetTop',{configurable:true,get:()=>80});window.visualViewport!.dispatchEvent(new Event('resize'));});
    for(const mode of ['fullscreen','compact','centered'] as const) {
      // Resize and scroll events can remeasure the emulated viewport. Keep the
      // keyboard fixture deterministic until the screenshot has been captured.
      await page.evaluate((mode)=>{
        const root=document.documentElement, screen=document.querySelector('.app-modal-screen') as HTMLElement;
        root.setAttribute('data-keyboard-open','');root.removeAttribute('data-teclado-formulario-largo');
        root.style.setProperty('--app-visual-viewport-top','80px');root.style.setProperty('--app-visual-viewport-height','380px');
        screen.classList.toggle('app-sheet-compact-screen',mode==='compact');screen.classList.toggle('app-centered-modal-screen',mode==='centered');
        const frame=screen.querySelector('[role=dialog]') as HTMLElement;
        frame.classList.toggle('app-fullscreen-modal',mode==='fullscreen');frame.classList.toggle('app-centered-modal',mode==='centered');
        frame.style.height=mode==='fullscreen'?'380px':'220px';frame.style.maxHeight='380px';
        screen.style.alignItems=mode==='centered'?'center':'flex-end';
      },mode);
      await expect.poll(()=>page.locator('.app-modal-screen').evaluate(n=>Math.round(n.getBoundingClientRect().bottom))).toBe(460);
      await page.screenshot({path:testInfo.outputPath('keyboard-'+mode+'.png'),scale:'css',animations:'disabled'});
      await expect(page.locator('.app-modal-screen')).toHaveCSS('box-shadow','none');
      await expect(dialog).toHaveCSS('box-shadow','none');
      expect(await dialog.evaluate(n=>n.getBoundingClientRect().bottom),mode+' must fit inside visual viewport').toBeLessThanOrEqual(460);
      if(mode!=='fullscreen') {
        const veil=page.locator('.app-modal-screen > .absolute').first();
        const color=await veil.evaluate(n=>{const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d')!;ctx.fillStyle=getComputedStyle(n).backgroundColor;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data];});expect(color).toEqual([0,0,0,128]);
        expect(await dialog.evaluate(n=>n.getBoundingClientRect().top)).toBeGreaterThan(100);
        expect(await veil.evaluate(n=>Math.round(n.getBoundingClientRect().height))).toBe(380);
      }
    }
    await page.evaluate(()=>{document.getElementById('keyboard-paint-witness')?.remove();document.documentElement.removeAttribute('data-keyboard-open');});
    expect((await db.from('pro_clients').select('id').eq('user_id',actor.id).throwOnError()).data).toHaveLength(0);
  } finally {await page.goto('about:blank');await cleanupDisposableAccount(actor);}
});

import { test, expect } from 'playwright/test';
import { loginAs, gotoOK, waitForInteractivePage } from './helpers';
import { canRunSeededRegression } from './seed';
import { createDisposableAccount, cleanupDisposableAccount } from './disposable-account';

for (const native of [false, true]) {
  test(`menu header travels with options and closes without displacing the page (${native ? 'native' : 'web'})`,async({page,context,baseURL})=>{
    test.skip((page.viewportSize()?.width ?? 1280) >= 1024, 'The mobile drawer is not rendered on desktop.');
    if(native){await context.addCookies([{name:'ccr_platform',value:'native',url:baseURL!}]);await page.addInitScript(()=>{localStorage.setItem('ccr:native-first-run-onboarding:v12','1');const bridge={isNativePlatform:()=>true};Object.defineProperty(window,'Capacitor',{configurable:true,get:()=>bridge,set:value=>{Object.assign(bridge,value);bridge.isNativePlatform=()=>true;}});});}
    await page.goto('/');
    const banner=page.getByTestId('mobile-app-download');
    const showsDownloadBanner=!native;
    if(showsDownloadBanner)await expect(banner).toBeVisible();
    const button=page.getByRole('button',{name:'Abrir menú'}).filter({visible:true}).first();
    await button.click();
    const menu=page.getByRole('dialog',{name:'Menú',exact:true});await expect(menu).toBeVisible();
    const header=menu.locator('.ccr-menu-fila-superior'),body=menu.locator('.ccr-menu-cuerpo');
    // WebKit can advance the compositor between consecutive geometry reads.
    // Bracket the body read with header reads without weakening the shared-motion check.
    const samples=await menu.evaluate(el=>new Promise<{before:number;after:number;body:number}[]>(resolve=>{const result:{before:number;after:number;body:number}[]=[];let frames=0;const sample=()=>{const header=el.querySelector('.ccr-menu-fila-superior')!,body=el.querySelector('.ccr-menu-cuerpo')!;const before=header.getBoundingClientRect().x;const bodyX=body.getBoundingClientRect().x;const after=header.getBoundingClientRect().x;result.push({before,after,body:bodyX});if(++frames<12)requestAnimationFrame(sample);else resolve(result)};requestAnimationFrame(sample)}));
    for(const sample of samples){expect(sample.body).toBeGreaterThanOrEqual(Math.min(sample.before,sample.after)-1);expect(sample.body).toBeLessThanOrEqual(Math.max(sample.before,sample.after)+1);}
    await expect.poll(async()=>Math.round((await menu.boundingBox())!.x)).toBe(0);
    // The download notice must not leave a 76px empty band in the menu.
    expect(await header.evaluate(el=>parseFloat(getComputedStyle(el).paddingTop))).toBeLessThan(20);
    await expect(menu.getByRole('button',{name:'Buscar profesionales',exact:true})).toBeVisible();
    await menu.getByRole('button',{name:'Ayuda y soporte'}).click();
    const top=(await header.boundingBox())!.y;
    await body.evaluate(el=>{el.scrollTop=el.scrollHeight});
    expect((await header.boundingBox())!.y).toBe(top);
    const socials=menu.getByTestId('mobile-menu-social-links');
    await expect(socials).toHaveAccessibleName('Síguenos');
    const footer=menu.locator('[data-mobile-menu-footer]');
    const language=footer.getByRole('button',{name:'English',exact:true});
    const languageBox=(await language.boundingBox())!,socialBox=(await socials.boundingBox())!;
    expect(Math.abs(languageBox.y+languageBox.height/2-socialBox.y-socialBox.height/2)).toBeLessThan(1);
    expect(languageBox.x+languageBox.width).toBeLessThanOrEqual(socialBox.x);
    expect(await footer.evaluate(el=>el.scrollWidth>el.clientWidth)).toBe(false);
    const originalViewport=page.viewportSize()!;
    await page.setViewportSize({width:320,height:originalViewport.height});
    await expect.poll(()=>footer.evaluate(el=>{
      const language=el.querySelector('button')!.getBoundingClientRect();
      const social=el.querySelector('nav')!.getBoundingClientRect();
      return el.scrollWidth<=el.clientWidth && language.right<=social.left && Math.abs(language.top+language.height/2-social.top-social.height/2)<1;
    })).toBe(true);
    await page.setViewportSize(originalViewport);
    for(const [name,href] of [['Facebook','https://www.facebook.com/share/18tY9mAhub/?mibextid=wwXIfr'],['Instagram','https://www.instagram.com/contratacr/'],['TikTok','https://www.tiktok.com/@contratacr']]){
      const link=socials.getByRole('link',{name,exact:true});
      await expect(link).toBeVisible();await expect(link).toHaveAttribute('href',href);await expect(link).toHaveAttribute('target','_blank');await expect(link).toHaveAttribute('rel','noopener noreferrer');
      const box=(await link.boundingBox())!;expect(box.width).toBeGreaterThanOrEqual(44);expect(Math.round(box.height)).toBeGreaterThanOrEqual(44);
    }
    await page.keyboard.press('Tab');
    expect(await menu.evaluate(el=>el.contains(document.activeElement))).toBe(true);
    await menu.getByRole('button',{name:'Cerrar menú'}).click();
    await expect(menu).toBeHidden();
    if(showsDownloadBanner)await expect(banner).toBeVisible();
    await button.click();
    await menu.getByRole('button',{name:'Buscar profesionales',exact:true}).click();
    await expect(menu).toBeHidden();
    await expect(page.locator('.ccr-native-search-panel')).toBeVisible();
    await expect(page.locator('.ccr-native-search-panel input').first()).toBeFocused();
    await page.locator('.ccr-native-search-panel').getByRole('button',{name:'Volver',exact:true}).click();
    if(process.env.MENU_EVIDENCE_DIR){await button.click();await expect.poll(async()=>Math.round((await menu.boundingBox())!.x)).toBe(0);await page.screenshot({path:`${process.env.MENU_EVIDENCE_DIR}/${test.info().project.name}-${native?'native':'web'}.png`});await footer.screenshot({path:`${process.env.MENU_EVIDENCE_DIR}/${test.info().project.name}-${native?'native':'web'}-footer.png`});}
  });
}

for (const native of [false, true]) {
  test(`signed-in menu keeps account actions above centered social links (${native ? 'native' : 'web'})`, async ({page,context,baseURL}) => {
    test.skip((page.viewportSize()?.width ?? 1280) >= 1024, 'Mobile menu');
    test.skip(!canRunSeededRegression(), 'Isolated TEST account required');
    if (native) {
      await context.addCookies([{name:'ccr_platform',value:'native',url:baseURL!}]);
      await page.addInitScript(()=>localStorage.setItem('ccr:native-first-run-onboarding:v12','1'));
    }
    const account=await createDisposableAccount({prefix:'menu-footer'});
    try {
      await loginAs(page,account.email,account.password);
      await gotoOK(page,'/');await waitForInteractivePage(page);
      await page.getByRole('button',{name:'Abrir menú',exact:true}).filter({visible:true}).click();
      const menu=page.getByRole('dialog',{name:'Menú',exact:true});
      const body=menu.locator('.ccr-menu-cuerpo');
      await body.evaluate(el=>{el.scrollTop=el.scrollHeight});
      const footer=menu.locator('[data-mobile-menu-footer]');
      const actions=footer.locator('[data-mobile-menu-account-actions]');
      const social=footer.getByTestId('mobile-menu-social-links');
      await expect(actions.getByRole('button',{name:'English',exact:true})).toBeVisible();
      await expect(actions.getByRole('button',{name:'Cerrar sesión',exact:true})).toBeVisible();
      await expect(social).toHaveAccessibleName('Síguenos');
      await expect(social.getByText('Síguenos',{exact:true})).toHaveCount(0);
      const geometry=await footer.evaluate(el=>{
        const actions=el.querySelector('[data-mobile-menu-account-actions]')!;
        const social=el.querySelector('nav')!;
        const links=[...social.querySelectorAll('a')].map(a=>a.getBoundingClientRect());
        const rect=el.getBoundingClientRect();
        return {background:getComputedStyle(el).backgroundColor,border:getComputedStyle(el).borderTopWidth,overflow:el.scrollWidth>el.clientWidth,
          socialTop:social.getBoundingClientRect().top,actionsBottom:actions.getBoundingClientRect().bottom,
          center:(links[0].left+links[links.length-1].right)/2,expectedCenter:(rect.left+rect.right)/2,
          bottom:links[links.length-1].bottom,viewport:innerHeight,
          targets:[...el.querySelectorAll('a,button')].map(a=>({width:a.getBoundingClientRect().width,height:a.getBoundingClientRect().height}))};
      });
      expect(geometry.background).toBe('rgb(255, 255, 255)');expect(geometry.border).toBe('0px');
      expect(geometry.overflow).toBe(false);expect(geometry.socialTop).toBeGreaterThan(geometry.actionsBottom);
      expect(Math.abs(geometry.center-geometry.expectedCenter)).toBeLessThan(1);
      expect(geometry.bottom).toBeLessThanOrEqual(geometry.viewport-16);
      for(const target of geometry.targets){expect(Math.round(target.width)).toBeGreaterThanOrEqual(44);expect(Math.round(target.height)).toBeGreaterThanOrEqual(44);}
      if(process.env.MENU_EVIDENCE_DIR) {
        const prefix=`${process.env.MENU_EVIDENCE_DIR}/${test.info().project.name}-${native?'native':'web'}`;
        await page.screenshot({path:`${prefix}-con-sesion.png`});
        const help=await menu.getByRole('button',{name:'Ayuda y soporte',exact:true}).boundingBox();
        const viewport=page.viewportSize()!;
        const y=Math.max(0,Math.floor(help!.y)-12);
        await page.screenshot({path:`${prefix}-detalle.png`,clip:{x:0,y,width:viewport.width,height:viewport.height-y}});
      }
      await page.setViewportSize({width:320,height:568});
      await body.evaluate(el=>{el.scrollTop=el.scrollHeight});
      const smallLast=await social.getByRole('link',{name:'TikTok',exact:true}).boundingBox();
      expect(smallLast!.y+smallLast!.height).toBeLessThanOrEqual(552);
      expect(await footer.evaluate(el=>el.scrollWidth>el.clientWidth)).toBe(false);
      await actions.getByRole('button',{name:'English',exact:true}).click();
      await expect(page).toHaveURL(/\/en(?:\/|$)/);
      await waitForInteractivePage(page);
      await page.getByRole('button',{name:'Open menu',exact:true}).filter({visible:true}).click();
      const english=page.getByRole('dialog',{name:'Menu',exact:true});
      await english.locator('.ccr-menu-cuerpo').evaluate(el=>{el.scrollTop=el.scrollHeight});
      await expect(english.getByRole('button',{name:'Español',exact:true})).toBeVisible();
      await expect(english.getByRole('navigation',{name:'Follow us',exact:true})).toBeVisible();
      await english.getByRole('button',{name:'Sign out',exact:true}).click();
      await page.getByRole('button',{name:'Open menu',exact:true}).filter({visible:true}).click();
      await expect(page.getByRole('dialog',{name:'Menu',exact:true}).getByRole('button',{name:'Sign out',exact:true})).toHaveCount(0);
    } finally {await cleanupDisposableAccount(account);}
  });
}

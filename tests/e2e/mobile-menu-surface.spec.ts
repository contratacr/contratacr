import { test, expect } from 'playwright/test';

for (const native of [false, true]) {
  test(`menu header travels with options and closes without displacing the page (${native ? 'native' : 'web'})`,async({page,context,baseURL})=>{
    test.skip((page.viewportSize()?.width ?? 1280) >= 1024, 'The mobile drawer is not rendered on desktop.');
    if(native){await context.addCookies([{name:'ccr_platform',value:'native',url:baseURL!}]);await page.addInitScript(()=>{localStorage.setItem('ccr:native-first-run-onboarding:v12','1');const bridge={isNativePlatform:()=>true};Object.defineProperty(window,'Capacitor',{configurable:true,get:()=>bridge,set:value=>{Object.assign(bridge,value);bridge.isNativePlatform=()=>true;}});});}
    await page.goto('/');
    const banner=page.getByTestId('mobile-app-download');
    if(!native)await expect(banner).toBeVisible();
    const button=page.getByRole('button',{name:'Abrir menú'}).filter({visible:true}).first();
    await button.click();
    const menu=page.getByRole('dialog',{name:'Menú',exact:true});await expect(menu).toBeVisible();
    const header=menu.locator('.ccr-menu-fila-superior'),body=menu.locator('.ccr-menu-cuerpo');
    const samples=await menu.evaluate(el=>new Promise<{header:number;body:number}[]>(resolve=>{const result:{header:number;body:number}[]=[];let frames=0;const sample=()=>{result.push({header:el.querySelector('.ccr-menu-fila-superior')!.getBoundingClientRect().x,body:el.querySelector('.ccr-menu-cuerpo')!.getBoundingClientRect().x});if(++frames<12)requestAnimationFrame(sample);else resolve(result)};requestAnimationFrame(sample)}));
    for(const sample of samples)expect(Math.abs(sample.header-sample.body)).toBeLessThan(1);
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
    for(const [name,href] of [['Facebook','https://www.facebook.com/share/18tY9mAhub/?mibextid=wwXIfr'],['Instagram','https://www.instagram.com/contratacr/'],['TikTok','https://www.tiktok.com/@contratacr']]){
      const link=socials.getByRole('link',{name,exact:true});
      await expect(link).toBeVisible();await expect(link).toHaveAttribute('href',href);await expect(link).toHaveAttribute('target','_blank');await expect(link).toHaveAttribute('rel','noopener noreferrer');
      const box=(await link.boundingBox())!;expect(box.width).toBeGreaterThanOrEqual(44);expect(box.height).toBeGreaterThanOrEqual(44);
    }
    await page.keyboard.press('Tab');
    expect(await menu.evaluate(el=>el.contains(document.activeElement))).toBe(true);
    await menu.getByRole('button',{name:'Cerrar menú'}).click();
    await expect(menu).toBeHidden();
    if(!native)await expect(banner).toBeVisible();
    await button.click();
    await menu.getByRole('button',{name:'Buscar profesionales',exact:true}).click();
    await expect(menu).toBeHidden();
    await expect(page.locator('.ccr-native-search-panel')).toBeVisible();
    await expect(page.locator('.ccr-native-search-panel input').first()).toBeFocused();
    await page.locator('.ccr-native-search-panel').getByRole('button',{name:'Volver',exact:true}).click();
    if(process.env.MENU_EVIDENCE_DIR){await button.click();await expect.poll(async()=>Math.round((await menu.boundingBox())!.x)).toBe(0);await page.screenshot({path:`${process.env.MENU_EVIDENCE_DIR}/${test.info().project.name}-${native?'native':'web'}.png`});}
  });
}

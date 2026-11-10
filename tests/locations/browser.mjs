import { chromium, webkit, expect } from 'playwright/test';
for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]){
 const browser=await engine.launch();const page=await browser.newPage({viewport:{width:390,height:844}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
 await page.goto('http://127.0.0.1:3195');
 const toggle=page.getByRole('switch',{name:/Mostrar esta dirección en mi perfil/});
 await expect(toggle).toHaveCount(1);await expect(toggle).toHaveAttribute('aria-checked','false');
 await expect(page.locator('[data-workplace-directions]')).toHaveCount(0);
 await toggle.click();await expect(page.locator('[data-workplace-directions]')).toHaveCount(0);
 await page.getByRole('button',{name:'Guardar lugares'}).click();
 const link=page.getByRole('link',{name:'Cómo llegar',exact:true});await expect(link).toHaveCount(1);
 expect(new URL(await link.getAttribute('href')).searchParams.get('destination')).toBe('9.97,-84.38');
 await page.reload();await expect(toggle).toHaveAttribute('aria-checked','true');await expect(link).toBeVisible();
 await page.locator('[data-workplace-directions]').screenshot({path:`/tmp/ccr-public-workplaces/${name}-public.png`});
 await toggle.click();await page.getByRole('button',{name:'Guardar lugares'}).click();await page.reload();await expect(link).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.goto('http://127.0.0.1:3195/?en');await expect(page.getByRole('switch',{name:/Show this address on my profile/})).toBeVisible();
 expect(errors).toEqual([]);console.log(`PASS ${name}: only fixed pin gets switch, explicit save and reload, route destination, withdrawal, English and mobile layout`);
 }finally{await browser.close();}
}

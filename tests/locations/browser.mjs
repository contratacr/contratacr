import { chromium, webkit, expect } from 'playwright/test';
for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]){
 const browser=await engine.launch();const page=await browser.newPage({viewport:{width:390,height:844}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
 await page.goto('http://127.0.0.1:3195');
 const toggle=page.getByRole('switch',{name:/^Mostrar dirección/});
 await expect(toggle).toHaveCount(1);await expect(toggle).toHaveAttribute('aria-checked','true');
 await expect(page.locator('[data-directions-provider]')).toHaveCount(2);
 await toggle.click();await expect(page.locator('[data-directions-provider]')).toHaveCount(2);
 await page.getByRole('button',{name:'Guardar lugares'}).click();
 await expect(page.locator('[data-directions-provider]')).toHaveCount(0);
 await toggle.click();
 await page.getByRole('button',{name:'Guardar lugares'}).click();
 const link=page.getByRole('link',{name:'Google Maps: Sede de ejemplo',exact:true});await expect(link).toHaveCount(1);
 expect(new URL(await link.getAttribute('href')).searchParams.get('destination')).toBe('9.97,-84.38');
 await page.reload();await expect(toggle).toHaveAttribute('aria-checked','true');await expect(link).toBeVisible();
 await page.locator('[data-directions-provider]').first().screenshot({path:`/tmp/ccr-public-workplaces/${name}-public.png`});
 await toggle.click();await page.getByRole('button',{name:'Guardar lugares'}).click();await page.reload();await expect(link).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.getByRole('button',{name:'Editar ubicación',exact:true}).first().click();
 await page.getByRole('button',{name:'Cancelar edición',exact:true}).click();
 await expect(toggle).toHaveAttribute('aria-checked','false');
 await page.goto('http://127.0.0.1:3195/?en');await expect(page.getByRole('switch',{name:/^Show address/})).toBeVisible();
 await page.evaluate(()=>sessionStorage.removeItem('locations'));
 await page.goto('http://127.0.0.1:3195/?multi');
 await expect(page.locator('[data-directions-provider] > summary')).toHaveCount(2);
 await page.locator('[data-directions-provider="Waze"] > summary').click();
 const waze=page.locator('[data-directions-provider="Waze"] a',{hasText:'Sede de ejemplo'});
 expect(new URL(await waze.getAttribute('href')).searchParams.get('ll')).toBe('9.97,-84.38');
 await page.screenshot({path:`/tmp/ccr-public-workplaces/${name}-ordered.png`,fullPage:true});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 expect(errors).toEqual([]);console.log(`PASS ${name}: automatic visibility, explicit hide persists, edit cancellation, contact route and multiple-site chooser, English/mobile layout`);
 }finally{await browser.close();}
}

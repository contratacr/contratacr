import { test, expect } from 'playwright/test';
import { build } from 'esbuild';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import { readFileSync } from 'node:fs';

let script: string, css: string;
test.beforeAll(async () => {
 const result = await build({stdin:{contents:`import React from 'react'; import {createRoot} from 'react-dom/client'; import {CookiePreferences} from './src/components/privacy/cookie-preferences'; import {AdvertisingPreferences} from './src/components/privacy/advertising-preferences'; createRoot(document.getElementById('root')).render(<><main><h1>ContrataCR</h1><AdvertisingPreferences/></main><CookiePreferences/></>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,jsx:'automatic',format:'iife',platform:'browser',tsconfig:'tsconfig.json',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'framework-boundaries',setup(b){
 b.onResolve({filter:/^(next-intl|@\/i18n\/navigation|next\/navigation)$/},args=>({path:args.path,namespace:'boundary'}));
 b.onLoad({filter:/.*/,namespace:'boundary'},args=>({contents:args.path==='next-intl'?`export const useLocale=()=>document.documentElement.lang;`:args.path==='next/navigation'?`export const usePathname=()=>null;`:`import React from 'react'; export const Link=({children,...props})=>React.createElement('a',props,children);`,resolveDir:process.cwd()}));
 }}]});
 script=result.outputFiles[0].text;
 css=(await postcss([tailwind()]).process(readFileSync('src/app/globals.css','utf8'),{from:'src/app/globals.css'})).css;
 // The app sets --font-sans to the bundled Inter (next/font/local in src/app/layout.tsx). Without it the harness fell back to
 // each OS's system font, so text measurements (wrapping, sheet height) depended on the machine instead of the product font.
 css=[400,500,600,700,800,900].map(weight=>`@font-face{font-family:"Inter harness";font-weight:${weight};font-display:block;src:url(data:font/woff2;base64,${readFileSync(`src/fuentes/inter-latin-${weight}.woff2`).toString('base64')}) format("woff2")}`).join('')+':root{--font-sans:"Inter harness"}'+css;
});
for(const locale of ['es','en']) for(const width of [320,390,768,1440]) test(`consent UI ${locale} ${width}: one Continuar button, close, no refusal button, independent purposes and reopening`,async({page})=>{
 await page.addInitScript(()=>{ if (!sessionStorage.getItem("consent-fixture-ready")) { localStorage.clear(); sessionStorage.setItem("consent-fixture-ready","1"); } });
 await page.setViewportSize({width,height:width===320?568:width===390?700:900});
 await page.route('**/api/privacy/**',r=>r.fulfill({status:200,json:{ok:true}}));
 await page.route('**/cookie-harness',r=>r.fulfill({contentType:'text/html',body:`<!doctype html><html lang="${locale}"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div></body></html>`}));
 await page.goto('http://localhost/cookie-harness');
 await page.addStyleTag({content:css}); await page.addScriptTag({content:script});
 const banner=page.locator('[data-cookie-banner]');await expect(banner).toBeVisible();
 await expect(banner.getByRole('heading',{name:locale==='en'?'Cookies and tracking pixels':'Cookies y píxeles de seguimiento',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>localStorage.getItem('contratacr:consent:advertising:v1'))).toBeNull();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 // A stable classic scrollbar gutter reduces the rendered root width even when clientWidth still reports the viewport.
 const box=await banner.boundingBox();expect(box).not.toBeNull();
 if(width<640){expect(box!.x).toBe(0);expect(box!.width).toBe(await page.evaluate(()=>document.documentElement.getBoundingClientRect().width));expect(Math.abs(box!.y+box!.height-page.viewportSize()!.height)).toBeLessThan(1);}
 else {expect(box!.x).toBeGreaterThan(0);expect(box!.width).toBeLessThan(width);expect(box!.y+box!.height).toBeLessThan(page.viewportSize()!.height);}
 // Like a retail notice: ONE prominent button plus a close X. Never a refusal button.
 const continuar=banner.getByRole('button',{name:locale==='en'?'Continue to site':'Continuar',exact:true});
 await expect(continuar).toBeVisible();
 await expect(banner.getByRole('button',{name:locale==='en'?'Close':'Cerrar',exact:true})).toBeVisible();
 await expect(banner.getByRole('button')).toHaveCount(2);
 await expect(banner.getByRole('button',{name:/rechaz|reject|decline|configur|settings/i})).toHaveCount(0);
 await expect(banner).toContainText(locale==='en'?'By browsing our site, you agree':'Al navegar por nuestro sitio, usted acepta');
 expect((await continuar.boundingBox())!.width).toBeGreaterThan(Math.min(width,380)*0.6);
 await expect(banner.getByRole('link',{name:locale==='en'?'Cookie Policy and Privacy Notice':'Política de cookies y Aviso de privacidad',exact:true})).toHaveAttribute('href',/privacidad#cookies/);
 // The settings stay reachable (footer / privacy policy button), outside the notice.
 await page.locator('main button').click();
 const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();
 if(width===390){expect(await dialog.evaluate(n=>n.scrollHeight<=n.clientHeight)).toBe(true);}
 await expect(dialog.getByRole('button',{name:locale==='en'?'Back':'Volver',exact:true})).toBeVisible();
 await expect(dialog.getByRole('heading',{level:2})).toBeFocused();
 expect(await dialog.getByRole('heading',{level:2}).evaluate(n=>getComputedStyle(n).outlineStyle)).toBe('none');
 const back=dialog.getByRole('button',{name:locale==='en'?'Back':'Volver',exact:true});
 expect((await back.boundingBox())!.width).toBeLessThan(100);

 await page.screenshot({path:`/tmp/ccr-cookie-compact-settings-${locale}-${width}.png`});

 await expect(dialog.getByRole('heading',{name:locale==='en'?'Data privacy settings':'Configuración de privacidad',exact:true})).toBeVisible();
 await expect(dialog.locator('summary')).toHaveCount(3);
 const accept=dialog.getByRole('button',{name:locale==='en'?'Accept all':'Aceptar todas',exact:true});
 const save=dialog.getByRole('button',{name:locale==='en'?'Save':'Guardar',exact:true});
 const acceptBounds=(await accept.boundingBox())!,saveBounds=(await save.boundingBox())!;
 expect(Math.abs(acceptBounds.y-saveBounds.y)).toBeLessThan(1);
 expect(Math.abs(acceptBounds.width-saveBounds.width)).toBeLessThan(1);
 expect(Math.abs(acceptBounds.height-saveBounds.height)).toBeLessThan(1);
 expect(await save.evaluate(n=>getComputedStyle(n).backgroundColor)).toBe('rgb(0, 159, 217)');
 const statisticsInfo=dialog.locator('details').nth(1);await statisticsInfo.locator('summary').click();
 await expect(statisticsInfo.locator('p')).toContainText(locale==='en'?'not necessarily anonymous':'no son necesariamente anónimos');
 await expect(accept).toBeInViewport({ratio:1});
 await expect(save).toBeInViewport({ratio:1});
 await statisticsInfo.locator('summary').click();
 await expect(dialog.getByRole('checkbox')).toHaveCount(2);
 for(const checkbox of await dialog.getByRole('checkbox').all()) await expect(checkbox).toBeChecked();
 // Preselection is a draft, not a saved consent or permission to measure.
 expect(await page.evaluate(()=>['analytics','advertising'].map(p=>localStorage.getItem(`contratacr:consent:${p}:v1`)))).toEqual([null,null]);
 await dialog.getByRole('checkbox').last().uncheck();
 await dialog.getByRole('button',{name:locale==='en'?'Save':'Guardar',exact:true}).click();
 await expect(dialog).not.toBeVisible();await expect(banner).toHaveCount(0);
 const choices=await page.evaluate(()=>['analytics','advertising'].map(p=>JSON.parse(localStorage.getItem(`contratacr:consent:${p}:v1`)! ).choice));
 expect(choices).toEqual(['accepted','declined']);
 await page.locator('main button').click();await expect(dialog).toBeVisible();
 await expect(dialog.getByRole('checkbox').first()).toBeChecked();
 await expect(dialog.getByRole('checkbox').last()).not.toBeChecked();
 await dialog.getByRole('checkbox').first().uncheck();
 await dialog.getByRole('button',{name:locale==='en'?'Save':'Guardar',exact:true}).click();
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('contratacr:consent:analytics:v1')!).choice)).toBe('declined');
 await page.locator('main button').click();await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();
 await page.locator('main button').click();
 await dialog.getByRole('button',{name:locale==='en'?'Accept all':'Aceptar todas',exact:true}).click();
 expect(await page.evaluate(()=>['analytics','advertising'].map(p=>JSON.parse(localStorage.getItem(`contratacr:consent:${p}:v1`)! ).choice))).toEqual(['accepted','accepted']);
 await page.evaluate(()=>localStorage.clear());await page.reload();await page.addStyleTag({content:css});await page.addScriptTag({content:script});
 await expect(banner).toBeVisible();
 await page.screenshot({path:`/tmp/ccr-cookies-${locale}-${width}.png`});
 await banner.getByRole('button',{name:locale==='en'?'Continue to site':'Continuar',exact:true}).click();
 await expect(banner).toHaveCount(0);
 expect(await page.evaluate(()=>['analytics','advertising'].map(p=>JSON.parse(localStorage.getItem(`contratacr:consent:${p}:v1`)! ).choice))).toEqual(['accepted','accepted']);
 expect(await page.evaluate(()=>['analytics','advertising'].map(p=>JSON.parse(localStorage.getItem(`contratacr:consent:${p}:v1`)! ).source))).toEqual(['click','click']);
});

const choicesOf=(page:import('playwright/test').Page)=>page.evaluate(()=>['analytics','advertising'].map(p=>{const raw=localStorage.getItem(`contratacr:consent:${p}:v1`);return raw?JSON.parse(raw):null;}));
async function openHarness(page:import('playwright/test').Page,locale:string,seed?:()=>void){
 await page.addInitScript(()=>{ if (!sessionStorage.getItem("consent-fixture-ready")) { localStorage.clear(); sessionStorage.setItem("consent-fixture-ready","1"); } });
 if(seed) await page.addInitScript(seed);
 await page.route('**/api/privacy/**',r=>r.fulfill({status:200,json:{ok:true}}));
 await page.route('**/cookie-harness',r=>r.fulfill({contentType:'text/html',body:`<!doctype html><html lang="${locale}"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div></body></html>`}));
 await page.goto('http://localhost/cookie-harness');
 await page.addStyleTag({content:css}); await page.addScriptTag({content:script});
}
test('closing the notice with the X accepts, recorded as "close"',async({page})=>{
 await openHarness(page,'es');
 const banner=page.locator('[data-cookie-banner]');await expect(banner).toBeVisible();
 await banner.getByRole('button',{name:'Cerrar',exact:true}).click();
 await expect(banner).toHaveCount(0);
 const saved=await choicesOf(page);
 expect(saved.map(c=>c.choice)).toEqual(['accepted','accepted']);
 expect(saved.map(c=>c.source)).toEqual(['close','close']);
});
test('a refusal saved earlier survives the X and Continuar (even if expired)',async({page})=>{
 await openHarness(page,'es',()=>{ localStorage.setItem('contratacr:consent:analytics:v1',JSON.stringify({version:'1999-01-01',choice:'declined',at:'2020-01-01T00:00:00.000Z'})); });
 const banner=page.locator('[data-cookie-banner]');await expect(banner).toBeVisible();
 await banner.getByRole('button',{name:'Cerrar',exact:true}).click();
 const saved=await choicesOf(page);
 expect(saved[0].choice).toBe('declined');
 expect(saved[1].choice).toBe('accepted');
});
test('Continuar keeps a refusal that is still valid',async({page})=>{
 await openHarness(page,'es',()=>{ localStorage.setItem('contratacr:consent:advertising:v1',JSON.stringify({version:'2026-10-29',choice:'declined',at:new Date().toISOString()})); });
 const banner=page.locator('[data-cookie-banner]');await expect(banner).toBeVisible();
 await banner.getByRole('button',{name:'Continuar',exact:true}).click();
 const saved=await choicesOf(page);
 expect(saved.map(c=>c.choice)).toEqual(['accepted','declined']);
});
test('withdrawing from the footer settings stops measurement and the notice does not come back',async({page})=>{
 await openHarness(page,'es');
 await page.locator('[data-cookie-banner]').getByRole('button',{name:'Continuar',exact:true}).click();
 await page.locator('main button').click();
 const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();
 for(const box of await dialog.getByRole('checkbox').all()) await box.uncheck();
 await dialog.getByRole('button',{name:'Guardar',exact:true}).click();
 expect((await choicesOf(page)).map(c=>c.choice)).toEqual(['declined','declined']);
 await expect(page.locator('[data-cookie-banner]')).toHaveCount(0);
 expect(await page.evaluate(()=>document.cookie)).toContain('ccr_ads_consent_v2=declined');
});

test('cookie notice stays compact on a phone: about a third of the screen at most, with a 44px close target', async ({ page }) => {
 // Runs in every project. In desktop Chromium on Linux the page keeps a classic 15 px scrollbar gutter (html{scrollbar-gutter:stable}),
 // so the fixed sheet is 375 px wide at a 390 px window, the same width as a 375 px phone (iPhone SE / mini).
 await page.addInitScript(()=>{ if (!sessionStorage.getItem("consent-fixture-ready")) { localStorage.clear(); sessionStorage.setItem("consent-fixture-ready","1"); } });
 await page.setViewportSize({width:390,height:844});
 await page.route('**/api/privacy/**',r=>r.fulfill({status:200,json:{ok:true}}));
 await page.route('**/cookie-harness',r=>r.fulfill({contentType:'text/html',body:`<!doctype html><html lang="es"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div></body></html>`}));
 await page.goto('http://localhost/cookie-harness');
 await page.addStyleTag({content:css}); await page.addScriptTag({content:script});
 const banner=page.locator('[data-cookie-banner]');await expect(banner).toBeVisible();
 await page.evaluate(()=>document.fonts.ready);expect(await page.evaluate(()=>document.fonts.check('800 18px "Inter harness"'))).toBe(true);
 const box=(await banner.boundingBox())!;
 expect(box.height).toBeLessThanOrEqual(844*0.33);
 // The title keeps one line at that width: its reserved right padding only clears the close button, no more.
 expect((await page.locator('#cookie-title').boundingBox())!.height).toBeLessThan(30);
 const close=(await page.locator('[data-cookie-close]').boundingBox())!;
 expect(close.width).toBeGreaterThanOrEqual(44);expect(close.height).toBeGreaterThanOrEqual(44);
 const continuar=(await banner.getByRole('button',{name:'Continuar',exact:true}).boundingBox())!;
 expect(continuar.height).toBeGreaterThanOrEqual(44);
});

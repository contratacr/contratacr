import { test, expect } from 'playwright/test';
import { build } from 'esbuild';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import { readFileSync } from 'node:fs';

let script: string, css: string;
test.beforeAll(async () => {
 const result = await build({stdin:{contents:`import React from 'react'; import {createRoot} from 'react-dom/client'; import {CookiePreferences} from './src/components/privacy/cookie-preferences'; import {AdvertisingPreferences} from './src/components/privacy/advertising-preferences'; createRoot(document.getElementById('root')).render(<><main><h1>ContrataCR</h1><AdvertisingPreferences/></main><CookiePreferences/></>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,jsx:'automatic',format:'iife',platform:'browser',tsconfig:'tsconfig.json',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'framework-boundaries',setup(b){
 b.onResolve({filter:/^(next-intl|@\/i18n\/navigation)$/},args=>({path:args.path,namespace:'boundary'}));
 b.onLoad({filter:/.*/,namespace:'boundary'},args=>({contents:args.path==='next-intl'?`export const useLocale=()=>document.documentElement.lang;`:`import React from 'react'; export const Link=({children,...props})=>React.createElement('a',props,children);`,resolveDir:process.cwd()}));
 }}]});
 script=result.outputFiles[0].text;
 css=(await postcss([tailwind()]).process(readFileSync('src/app/globals.css','utf8'),{from:'src/app/globals.css'})).css;
});
for(const locale of ['es','en']) for(const width of [320,390,768,1440]) test(`consent UI ${locale} ${width}: explicit choices, independent purposes and reopening`,async({page})=>{
 await page.addInitScript(()=>{ if (!sessionStorage.getItem("consent-fixture-ready")) { localStorage.clear(); sessionStorage.setItem("consent-fixture-ready","1"); } });
 await page.setViewportSize({width,height:width===320?568:width===390?700:900});
 await page.route('**/api/privacy/**',r=>r.fulfill({status:200,json:{ok:true}}));
 await page.route('**/cookie-harness',r=>r.fulfill({contentType:'text/html',body:`<!doctype html><html lang="${locale}"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div></body></html>`}));
 await page.goto('http://localhost/cookie-harness');
 await page.addStyleTag({content:css}); await page.addScriptTag({content:script});
 const banner=page.locator('[data-cookie-banner]');await expect(banner).toBeVisible();
 await expect(banner.getByRole('heading',{name:locale==='en'?'Cookies and privacy':'Cookies y privacidad',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>localStorage.getItem('contratacr:consent:advertising:v1'))).toBeNull();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 // A stable classic scrollbar gutter reduces the rendered root width even when clientWidth still reports the viewport.
 const box=await banner.boundingBox();expect(box).not.toBeNull();
 if(width<640){expect(box!.x).toBe(0);expect(box!.width).toBe(await page.evaluate(()=>document.documentElement.getBoundingClientRect().width));expect(Math.abs(box!.y+box!.height-page.viewportSize()!.height)).toBeLessThan(1);}
 else {expect(box!.x).toBeGreaterThan(0);expect(box!.width).toBeLessThan(width);expect(box!.y+box!.height).toBeLessThan(page.viewportSize()!.height);}
 const primary= banner.getByRole('button').filter({hasText:locale==='en'?/^(Accept all|Only necessary)$/:/^(Aceptar todas|Solo necesarias)$/});
 expect(await primary.evaluateAll(nodes=>new Set(nodes.map(n=>{const s=getComputedStyle(n);return `${s.color}|${s.backgroundColor}|${s.borderColor}`;})).size)).toBe(1);

 await banner.getByRole('button',{name:locale==='en'?'Manage preferences':'Configurar preferencias',exact:true}).click();
 const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();
 if(width===390){expect(await dialog.evaluate(n=>n.scrollHeight<=n.clientHeight)).toBe(true);}
 await expect(dialog.getByRole('button',{name:locale==='en'?'Back':'Volver',exact:true})).toBeVisible();
 await expect(dialog.getByRole('heading',{level:2})).toBeFocused();
 expect(await dialog.getByRole('heading',{level:2}).evaluate(n=>getComputedStyle(n).outlineStyle)).toBe('none');
 const back=dialog.getByRole('button',{name:locale==='en'?'Back':'Volver',exact:true});
 expect((await back.boundingBox())!.width).toBeLessThan(100);

 await page.screenshot({path:`/tmp/ccr-cookie-compact-settings-${locale}-${width}.png`});

 await expect(dialog.getByRole('checkbox')).toHaveCount(2);
 for(const checkbox of await dialog.getByRole('checkbox').all()) await expect(checkbox).not.toBeChecked();
 await dialog.getByRole('checkbox').first().check();
 await dialog.getByRole('button',{name:locale==='en'?'Save preferences':'Guardar preferencias',exact:true}).click();
 await expect(dialog).not.toBeVisible();await expect(banner).toHaveCount(0);
 const choices=await page.evaluate(()=>['analytics','advertising'].map(p=>JSON.parse(localStorage.getItem(`contratacr:consent:${p}:v1`)! ).choice));
 expect(choices).toEqual(['accepted','declined']);
 await page.locator('main button').click();await expect(dialog).toBeVisible();
 await expect(dialog.getByRole('checkbox').first()).toBeChecked();
 await dialog.getByRole('button',{name:locale==='en'?'Only necessary':'Solo necesarias',exact:true}).click();
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('contratacr:consent:analytics:v1')!).choice)).toBe('declined');
 await page.locator('main button').click();await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();
 await page.evaluate(()=>localStorage.clear());await page.reload();await page.addStyleTag({content:css});await page.addScriptTag({content:script});
 await expect(banner).toBeVisible();
 await page.screenshot({path:`/tmp/ccr-cookies-${locale}-${width}.png`});
 await banner.getByRole('button',{name:locale==='en'?'Accept all':'Aceptar todas',exact:true}).click();
 await expect(banner).toHaveCount(0);
 expect(await page.evaluate(()=>['analytics','advertising'].map(p=>JSON.parse(localStorage.getItem(`contratacr:consent:${p}:v1`)! ).choice))).toEqual(['accepted','accepted']);
});

import {test,expect,type Page} from 'playwright/test';
import {collectPageErrors} from './helpers';
import {local,origin} from './pro-round2-fixture';
import {dirDb,hideSeededPlaces} from './pro-dir-fixture';
import {pricesShot,seedPriceComparison} from './pro-dir-prices-fixture';

// Multivertical A1/A2 (LOCAL Pro): the public assistant answers directory questions with the directory tools (same
// server functions as the pages, never the HTTP API): places by section/province/open now, and price comparison with
// source + date per price, neutral order (no paid boosting) and NEVER prescription medicines. The deterministic local
// planner answers: no model is called (aiProvider "local"). Synthetic data only, cleaned up.
test.afterEach(()=>hideSeededPlaces());
test.describe.configure({mode:'serial'});

type Answer={answer?:string;action?:string;searchHref?:string|null;ctaLabel?:string|null;aiProvider?:string;professionals?:unknown[];directory?:{tool:string;citations:{label:string;date:string}[]}};
const ip=(seed:string)=>{let h=0;for(const c of seed)h=(h*31+c.charCodeAt(0))>>>0;return `198.51.100.${(h%254)+1}`;};
async function ask(page:Page,message:string,locale:'es'|'en',tag:string){
 const r=await page.request.post(origin+'/api/ai-assistant',{headers:{Origin:origin,'content-type':'application/json','x-forwarded-for':ip(tag+message)},
  data:{aiConsent:{accepted:true,version:'2026-10-19'},message,locale,pagePath:locale==='en'?'/en':'/',platform:'native'}});
 expect(r.status()).toBe(200);return await r.json() as Answer;
}
async function nativeAssistant(page:Page){
 await page.context().addCookies([{name:'ccr_platform',value:'native',url:origin}]);
 await page.addInitScript(()=>{
  localStorage.setItem('ccr:native-first-run-onboarding:v12','1');
  localStorage.setItem('contratacr:consent:ai:v1',JSON.stringify({version:'2026-10-19',choice:'accepted',at:new Date().toISOString()}));
  const runtime:Record<string,unknown>={isNativePlatform:()=>true};
  Object.defineProperty(window,'Capacitor',{configurable:true,get:()=>runtime,set:v=>{if(v&&typeof v==='object')Object.assign(runtime,v);runtime.isNativePlatform=()=>true;}});
 });
}

// Launch mirror: directory assistant tools are development-only (DIRECTORY_ASSISTANT_ENABLED, assistant-tools-server.ts).
test.skip(process.env.E2E_PROD_MIRROR==='1','directory assistant tools are development-only (DIRECTORY_ASSISTANT_ENABLED, assistant-tools-server.ts)');
for(const language of ['es','en'] as const)test(`A2: assistant directory tools — prices with sources, places, Rx refused [${language}]`,async({page},info)=>{
 test.setTimeout(240000);local(info.project.use.baseURL);
 const en=language==='en',t=(es:string,english:string)=>en?english:es,prefix=en?'/en':'',db=dirDb();
 const seed=await seedPriceComparison(db);
 try{
  // Price comparison: current prices, lowest per kg first, each with source and date; the stale price is not offered as current.
  const price=await ask(page,t(`¿Cuánto cuesta el arroz ${seed.tag}?`,`How much is arroz ${seed.tag}?`),language,seed.tag);
  expect(price.aiProvider).toBe('local');expect(price.directory?.tool).toBe('directory_compare_prices');expect(price.professionals).toEqual([]);
  const lines=price.answer!.split('\n');
  expect(lines[1]).toMatch(new RegExp(`^1\\. Mercado Norte ${seed.tag}: .*${t('por kg','per kg')}\\) — ${t('Fuente: MEIC, estudio de precios','Source: MEIC price survey')} · E2E-${seed.tag} · ${t('dato del','as of')} `));
  expect(lines[2]).toMatch(new RegExp(`^2\\. Almacén Centro ${seed.tag}: `));
  expect(price.answer).not.toContain(`Abastecedor Viejo ${seed.tag}`);
  expect(price.answer).toContain(t('Ningún comercio paga por aparecer primero','No store pays to appear first'));
  expect(price.directory!.citations).toHaveLength(2);
  expect(price.searchHref).toBe(`${prefix}/precios?producto=${seed.rice}`);
  // OTC at pharmacies: every pharmacy since 2026-11-17 (the one without a verified licence is cheaper: ₡700 < ₡850).
  const otc=await ask(page,t(`precio del acetaminofén ${seed.tag} en farmacias`,`price of acetaminofén ${seed.tag} at pharmacies`),language,seed.tag);
  expect(otc.answer).toContain(`Farmacia Comparada ${seed.tag}`);
  const otcText=otc.answer??'';
  expect(otcText.indexOf(`Farmacia Sin Permiso ${seed.tag}`)).toBeGreaterThan(-1);
  expect(otcText.indexOf(`Farmacia Sin Permiso ${seed.tag}`)).toBeLessThan(otcText.indexOf(`Farmacia Comparada ${seed.tag}`));
  // Prescription medicine: refused, no price, even for a product present in the catalogue as Rx.
  for(const q of [t(`precio de la amoxicilina ${seed.tag}`,`price of amoxicilina ${seed.tag}`),t('¿Cuánto cuesta un antibiótico con receta?','How much is a prescription antibiotic?')]){
   const rx=await ask(page,q,language,seed.tag);
   expect(rx.answer).toContain('36868-S');expect(rx.answer).not.toMatch(/₡|CRC/);
  }
  // Places by section + province + open now: neutral note, source and date.
  // (the synthetic licensed pharmacy has no hours, so «open now» may legitimately find none: both answers cite source + date)
  const places=await ask(page,t('farmacias en San José','pharmacies in San José'),language,seed.tag);
  expect(places.directory?.tool).toBe('directory_search_places');
  expect(places.answer).toContain(t('nadie paga por aparecer primero','no one pays to appear first'));
  expect(places.answer).toMatch(new RegExp(t('Fuente: Directorio ContrataCR .* consultado el ','Source: ContrataCR directory .* checked on ')));
  expect(places.searchHref).toBe(`${prefix}/farmacias?province=San+Jos%C3%A9`);
  const open=await ask(page,t('farmacias abiertas ahora en San José','pharmacies open now in San José'),language,seed.tag);
  expect(open.searchHref).toBe(`${prefix}/farmacias?province=San+Jos%C3%A9&openNow=1`);
  expect(open.answer).toMatch(new RegExp(t('Fuente: Directorio ContrataCR .* consultado el ','Source: ContrataCR directory .* checked on ')));
  // Professional questions keep the regular assistant (no directory tool).
  const pro=await ask(page,t('Busco un electricista en Heredia','I need an electrician in Heredia'),language,seed.tag);
  expect(pro.directory).toBeUndefined();

  // The answer in the app's assistant (native shell emulated), screenshots ES/EN at 1440 and 390.
  if(info.project.name==='chromium-desktop'){
   const errors=collectPageErrors(page);
   await nativeAssistant(page);
   for(const width of [1440,390] as const){
    await page.setViewportSize({width,height:width===390?844:900});
    await page.goto(`${prefix}/?assistantDirectoryTest=${width}`);
    await page.waitForLoadState('networkidle');
    // The listener exists only after hydration: send the event again until the dialog opens (a lost event is not a failure).
    const dialog=page.locator('[data-ai-concierge-dialog]').filter({visible:true});
    await expect(async()=>{await page.evaluate(()=>window.dispatchEvent(new Event('contratacr:open-ai')));await expect(dialog).toBeVisible({timeout:2500});}).toPass({timeout:45000});
    await dialog.getByRole('textbox').fill(t(`¿Cuánto cuesta el arroz ${seed.tag}?`,`How much is arroz ${seed.tag}?`));
    await dialog.getByRole('button',{name:t('Enviar mensaje','Send message'),exact:true}).click();
    await expect(dialog.getByText(`Mercado Norte ${seed.tag}`,{exact:false})).toBeVisible({timeout:30000});
    await expect(dialog.getByRole('button',{name:t('Ver todos los precios','See all prices')})).toBeVisible();
    await pricesShot(page,`asistente-precios-${language}`,width);
    await page.evaluate(()=>{try{for(const k of Object.keys(sessionStorage))if(k.startsWith('contratacr:ai-session:'))sessionStorage.removeItem(k);for(const k of Object.keys(localStorage))if(k.startsWith('contratacr:ai-session:'))localStorage.removeItem(k);}catch{}});
   }
   expect(errors()).toEqual([]);
  }
 }finally{await seed.cleanup();}
});

import { build } from "esbuild";
import { test, expect } from "playwright/test";

async function harness(source: string) {
  const result = await build({
    stdin: { contents: source, resolveDir: process.cwd(), loader: "tsx" },
    bundle: true, write: false, format: "iife", platform: "browser", jsx: "automatic",
    plugins: [{ name: "loading-boundaries", setup(builder) {
      builder.onResolve({ filter: /^(next-intl|@\/hooks\/(use-auth|use-app-dialog|use-native-app)|@\/lib\/analytics\/(interaction-events|meta-pixel)|@\/components\/professionals\/(contact-gate|message-launcher)|@\/components\/ui\/image-preview-dialog|@\/components\/professionals\/(professional-card|save-button))$/ }, args => ({ path: args.path, namespace: "loading-boundaries" }));
      builder.onLoad({ filter: /.*/, namespace: "loading-boundaries" }, args => ({ contents: args.path === "next-intl"
        ? `export const useLocale=()=>"es"; export const useTranslations=()=>key=>key==='contactPending'?'Cargando':key;`
        : args.path === "@/hooks/use-auth" ? `export const useAuth=()=>window.__loadingState??({user:window.__loadingViewer??null,loading:false});`
        : args.path === "@/hooks/use-app-dialog" ? `export const useAppDialog=()=>({dialogNode:null,showMessage:async()=>{}});`
        : args.path === "@/hooks/use-native-app" ? `export const useNativeApp=()=>false;`
        : args.path === "@/components/professionals/contact-gate" ? `export const useContactGate=()=>({requireAccount:async()=>true,modals:null});`
        : args.path === "@/components/professionals/message-launcher" ? `import React from 'react'; export const MessageLauncher=()=>React.createElement('button',{},'Enviar mensaje');`
        : args.path.startsWith("@/lib/analytics/") ? `export const trackInteraction=()=>{}; export const trackMetaConversion=()=>{};`
        : `import React from 'react'; import {useProfesionalConApp} from '@/hooks/use-profesional-con-app'; export const ImagePreviewDialog=({children})=>children; export const SaveableCard=({children})=>children; export const ProfessionalCard=({professional})=>{const channel=useProfesionalConApp(professional.id,true);return React.createElement('article',{'data-pro-id':professional.id},React.createElement('button',channel===null?{'data-contact-pending':true}:{},channel===null?'Cargando':channel?'Mensaje':'WhatsApp'))};`, resolveDir: process.cwd() }));
    } }],
  });
  return result.outputFiles[0].text;
}

test("offer thumbnails start together, keep original quality and defer hidden desktop artwork", async ({ page }) => {
  const requested = new Set<string>();
  await page.route("https://assets.contratacr.com/loading-test/**", route => {
    requested.add(new URL(route.request().url()).pathname);
    return route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><rect width="48" height="48" fill="navy"/></svg>' });
  });
  await page.route("**/loading-harness", route => route.fulfill({ contentType: "text/html", body: '<!doctype html><style>img{width:48px;height:48px} #root{margin-top:20000px}</style><div id="root"></div>' }));
  await page.goto("/loading-harness");
  await page.addScriptTag({ content: await harness(`import React from 'react'; import {createRoot} from 'react-dom/client';
    import {OfferThumbnail} from './src/components/offers/offer-thumbnail';
    import {OfferImageGallery} from './src/components/offers/offer-image-gallery';
    const url=id=>'https://assets.contratacr.com/loading-test/'+id+'.png';
    createRoot(document.getElementById('root')).render(<>
      {Array.from({length:12},(_,i)=><OfferThumbnail key={i} offer={{title:'Oferta '+i,image_urls:[url(i)]}} priority={i===0} eager={i<6}/>)}
      <div id="desktop-preview" style={{display:'none'}}><OfferImageGallery images={[url('preview')]} title="Preview" priority={false}/></div>
      <div id="detail"><OfferImageGallery images={[url('detail')]} title="Detalle"/></div>
    </>);`) });
  await expect.poll(() => requested.size).toBe(7);
  for (let i = 0; i < 6; i++) expect(requested.has(`/loading-test/${i}.png`)).toBe(true);
  expect(requested.has("/loading-test/preview.png")).toBe(false);
  expect(requested.has("/loading-test/detail.png")).toBe(true);
  for (let i = 0; i < 12; i++) {
    const image = page.getByRole("img", { name: `Oferta ${i}`, exact: true });
    await expect(image).toHaveAttribute("src", `https://assets.contratacr.com/loading-test/${i}.png`);
    await expect(image).toHaveAttribute("loading", i < 6 ? "eager" : "lazy");
  }
  await expect(page.getByRole("img", { name: "Oferta 0", exact: true })).toHaveAttribute("fetchpriority", "high");
  await page.locator("#root").scrollIntoViewIfNeeded();
  await expect.poll(() => requested.size).toBe(13);
  await page.locator("#desktop-preview").evaluate(el => { (el as HTMLElement).style.display = "block"; });
  await expect.poll(() => requested.has("/loading-test/preview.png")).toBe(true);
});

test("an offer without artwork prioritizes its professional photo too", async ({ page }) => {
  let requested = false;
  await page.route("https://assets.contratacr.com/loading-avatar.png", route => {
    requested = true;
    return route.fulfill({contentType:"image/svg+xml", body:'<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"/>'});
  });
  await page.route("**/loading-harness", route => route.fulfill({contentType:"text/html",body:'<!doctype html><div id="root" style="margin-top:20000px"></div>'}));
  await page.goto("/loading-harness");
  await page.addScriptTag({content:await harness(`import React from 'react'; import {createRoot} from 'react-dom/client'; import {OfferThumbnail} from './src/components/offers/offer-thumbnail'; createRoot(document.getElementById('root')).render(<OfferThumbnail priority offer={{title:'Oferta',image_urls:[],professional_name:'Profesional',professional_avatar_url:'https://assets.contratacr.com/loading-avatar.png'}}/>);`)});
  await expect.poll(()=>requested).toBe(true);
  await expect(page.getByRole("img")).toHaveAttribute("loading","eager");
  await expect(page.getByRole("img")).toHaveAttribute("fetchpriority","high");
});

for (const signedIn of [false, true]) for (const slow of [false, true]) {
  test(`${signedIn ? "signed-in" : "guest"} search keeps twenty cards and ${slow ? "shows matching skeletons only while waiting" : "skips skeletons for an immediate next batch"}`, async ({ page }) => {
    let release = () => {};
    const gate = new Promise<void>(resolve => { release = resolve; });
    page.on("close", release);
    const offsets: string[] = [];
    let channelRequests = 0;
    await page.route("**/api/direct-chat?conApp=*", route => { channelRequests++; return route.abort(); });
    await page.route("**/api/buscar/results?*", async route => {
      offsets.push(new URL(route.request().url()).searchParams.get("offset")!);
      if (slow) await gate;
      await route.fulfill({ json: { professionals: Array.from({length:20},(_,i)=>({professional:{id:'next-'+i},forceContactOnly:false,preferVideo:false})), contactAvailability:{viewerId:signedIn?'viewer':'',resolvedAt:Date.now(),values:Object.fromEntries(Array.from({length:20},(_,i)=>['next-'+i,i%2===0]))} } });
    });
    await page.route("**/loading-harness", route => route.fulfill({ contentType: "text/html", body: '<!doctype html><style>.ccr-skeleton-shimmer{display:block;min-height:16px}</style><div id="root"></div>' }));
    await page.goto("/loading-harness");
    await page.addScriptTag({ content: await harness(`import React from 'react'; import {createRoot} from 'react-dom/client'; import {SearchResultsInfinite} from './src/components/search/search-results-infinite';
      window.__loadingViewer=${signedIn ? "{id:'viewer'}" : "null"};
      window.skeletonAppeared=false; window.pendingContactAppeared=false; new MutationObserver(()=>{if(document.querySelector('[data-contact-pending]'))window.pendingContactAppeared=true;if(document.querySelector('[role="status"]'))window.skeletonAppeared=true}).observe(document.body,{childList:true,subtree:true});
      createRoot(document.getElementById('root')).render(<>{Array.from({length:20},(_,i)=><article key={i} data-initial-card style={{height:300}}>Profesional {i}</article>)}<SearchResultsInfinite viewerProfileId={${signedIn ? "'viewer'" : "undefined"}} query="q=fixture" initialCount={20} total={40} highlightMetric="rating" searchReturnHref="/buscar" loadingLabel="Cargando profesionales" failedLabel="Error" retryLabel="Reintentar"/></>);`) });
    await expect(page.locator("[data-initial-card]")).toHaveCount(20);
    await expect(page.getByRole("status")).toHaveCount(0);
    expect(offsets).toEqual([]);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    if (slow) {
      const status = page.getByRole("status", { name: "Cargando profesionales" });
      await expect(status).toBeVisible();
      // Two cards with two pill-shaped actions each; no second reveal delay.
      await expect(status.locator(".h-11.rounded-full")).toHaveCount(4);
      await expect(status.locator(".ccr-delayed-loading")).toHaveCount(0);
      await expect(status.locator(".ccr-skeleton-shimmer").first()).toHaveCSS("opacity", "1");
      await expect(page.locator("[data-initial-card]")).toHaveCount(20);
      release();
    }
    await expect(page.locator("[data-pro-id]")).toHaveCount(20);
    await expect(page.getByRole("status")).toHaveCount(0);
    expect(offsets).toEqual(["20"]);
    await expect(page.locator("[data-contact-pending]")).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as {pendingContactAppeared:boolean}).pendingContactAppeared)).toBe(false);
    expect(channelRequests).toBe(0);
    if (signedIn) await expect(page.getByRole("button",{name:"Mensaje",exact:true})).toHaveCount(10);
    if (!slow) expect(await page.evaluate(() => (window as unknown as {skeletonAppeared:boolean}).skeletonAppeared)).toBe(false);
  });
}

async function mountContactBoundary(page: import("playwright/test").Page, scenario: string) {
  await page.route("**/contact-boundary-harness", route => route.fulfill({contentType:"text/html",body:'<!doctype html><style>.ccr-skeleton-shimmer{display:block;min-height:16px}</style><div id="root"></div>'}));
  await page.goto("/contact-boundary-harness");
  await page.addScriptTag({content:await harness(`import React from 'react'; import {createRoot} from 'react-dom/client';
    import {SearchCardContactBoundary} from './src/components/search/professional-card-loading';
    import {ContactAvailabilityProvider} from './src/hooks/use-profesional-con-app';
    import {DirectChatLauncher} from './src/components/professionals/direct-chat-launcher';
    const scenario=${JSON.stringify(scenario)};
    const seeded=scenario==='switch'||scenario==='remount'||scenario.startsWith('seed-');
    const seed={viewerId:'viewer-a',values:seeded?{recipient:scenario!=='seed-whatsapp'}:{},resolvedAt:Date.now()-(scenario==='remount'?61000:0)};
    const root=createRoot(document.getElementById('root'));
    window.pendingContactAppeared=false;
    new MutationObserver(()=>{if(document.querySelector('[data-contact-pending]'))window.pendingContactAppeared=true}).observe(document.body,{childList:true,subtree:true});
    window.renderContactCard=(state,visible=true)=>{
      window.__loadingState=state;
      root.render(<ContactAvailabilityProvider {...seed}>{visible&&<SearchCardContactBoundary professionalId="recipient"><article data-ready-card><h2>Profesional</h2><DirectChatLauncher professionalId="recipient" professionalName="Profesional" analyticsSource="search"/><button>Llamar</button></article></SearchCardContactBoundary>}</ContactAvailabilityProvider>);
    };
    window.renderContactCard({user:scenario==='auth'?null:{id:'viewer-a'},loading:scenario==='auth'});
  `)});
}

for (const {scenario,channel} of [
  {scenario:"missing",channel:true},{scenario:"missing",channel:false},
  {scenario:"auth",channel:true},{scenario:"auth",channel:false},
  {scenario:"switch",channel:false},
]) {
  test(`whole card owns contact loading when ${scenario}, ending in ${channel ? "chat" : "WhatsApp"}`,async({page})=>{
    let release=()=>{};
    const gate=new Promise<void>(resolve=>{release=resolve;});
    let lookups=0;
    await page.route("**/api/direct-chat?conApp=*",async route=>{
      lookups++;
      await gate;
      await route.fulfill({json:{conApp:{recipient:channel}}});
    });
    try {
      await mountContactBoundary(page,scenario);
      if(scenario==="switch") {
        await expect(page.locator("[data-ready-card]")).toBeVisible();
        await expect(page.getByRole("button",{name:"Enviar mensaje"})).toBeVisible();
        expect(lookups).toBe(0);
        await page.evaluate(()=> (window as unknown as {renderContactCard:(state:unknown)=>void}).renderContactCard({user:{id:"viewer-b"},loading:true}));
      }
      await expect(page.locator("[data-search-card-loading]")).toBeVisible();
      await expect(page.locator("[data-ready-card]")).toHaveCount(0);
      await expect(page.locator("[data-contact-pending]")).toHaveCount(0);
      if(scenario!=="missing") {
        expect(lookups).toBe(0);
        await page.evaluate(id=>(window as unknown as {renderContactCard:(state:unknown)=>void}).renderContactCard({user:{id},loading:false}),scenario==="switch"?"viewer-b":"viewer-a");
      }
      await expect.poll(()=>lookups).toBe(1);
      // A slow channel query cannot expose the content or either contact button.
      await expect(page.locator("[data-search-card-loading]")).toBeVisible();
      await expect(page.getByRole("button",{name:"Llamar"})).toHaveCount(0);
      release();
      await expect(page.locator("[data-ready-card]")).toBeVisible();
      await expect(page.getByRole("button",{name:channel?"Enviar mensaje":"WhatsApp",exact:true})).toBeVisible();
      await expect(page.getByRole("button",{name:"Llamar",exact:true})).toBeVisible();
      await expect(page.locator("[data-search-card-loading]")).toHaveCount(0);
      expect(await page.evaluate(()=>(window as unknown as {pendingContactAppeared:boolean}).pendingContactAppeared)).toBe(false);
      expect(lookups).toBe(1);
    }finally{release();await page.unrouteAll({behavior:"wait"});}
  });
}

test("an expired result can remount and resume without loading inside its contact button",async({page})=>{
  let release=()=>{};
  const gate=new Promise<void>(resolve=>{release=resolve;});
  let lookups=0;
  await page.route("**/api/direct-chat?conApp=*",async route=>{
    lookups++;
    await gate;
    await route.fulfill({json:{conApp:{recipient:true}}});
  });
  try{
    await mountContactBoundary(page,"remount");
    await expect(page.locator("[data-ready-card]")).toBeVisible();
    await expect.poll(()=>lookups).toBe(1);
    await page.evaluate(()=>(window as unknown as {renderContactCard:(state:unknown,visible:boolean)=>void}).renderContactCard({user:{id:"viewer-a"},loading:false},false));
    await expect(page.locator("[data-ready-card]")).toHaveCount(0);
    await page.evaluate(()=>(window as unknown as {renderContactCard:(state:unknown)=>void}).renderContactCard({user:{id:"viewer-a"},loading:false}));
    await expect(page.getByRole("button",{name:"Enviar mensaje"})).toBeVisible();
    await page.evaluate(()=>{window.dispatchEvent(new Event("focus"));window.dispatchEvent(new Event("online"));document.dispatchEvent(new Event("visibilitychange"));});
    await expect(page.getByRole("button",{name:"Enviar mensaje"})).toBeVisible();
    release();
    await expect(page.locator("[data-contact-pending]")).toHaveCount(0);
    expect(await page.evaluate(()=>(window as unknown as {pendingContactAppeared:boolean}).pendingContactAppeared)).toBe(false);
    expect(lookups).toBe(1);
  }finally{release();await page.unrouteAll({behavior:"wait"});}
});

for (const channel of [true,false]) test(`prepared contact paints ready without a second lookup: ${channel}`,async({page})=>{
  let lookups=0;
  await page.route("**/api/direct-chat?conApp=*",r=>{lookups++;return r.fulfill({status:503});});
  await mountContactBoundary(page,channel?"seed-chat":"seed-whatsapp");
  await expect(page.locator("[data-ready-card]")).toBeVisible();
  await expect(page.getByRole("button",{name:channel?"Enviar mensaje":/WhatsApp/}).first()).toBeVisible();
  await expect(page.locator("[data-contact-pending]")).toHaveCount(0);
  expect(await page.evaluate(()=>(window as unknown as {pendingContactAppeared:boolean}).pendingContactAppeared)).toBe(false);
  expect(lookups).toBe(0);
});

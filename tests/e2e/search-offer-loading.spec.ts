import { build } from "esbuild";
import { test, expect } from "playwright/test";

async function harness(source: string) {
  const result = await build({
    stdin: { contents: source, resolveDir: process.cwd(), loader: "tsx" },
    bundle: true, write: false, format: "iife", platform: "browser", jsx: "automatic",
    plugins: [{ name: "loading-boundaries", setup(builder) {
      builder.onResolve({ filter: /^(next-intl|@\/components\/ui\/image-preview-dialog|@\/components\/professionals\/(professional-card|save-button))$/ }, args => ({ path: args.path, namespace: "loading-boundaries" }));
      builder.onLoad({ filter: /.*/, namespace: "loading-boundaries" }, args => ({ contents: args.path === "next-intl"
        ? `export const useLocale=()=>"es"; export const useTranslations=()=>key=>key;`
        : `import React from 'react'; export const ImagePreviewDialog=({children})=>children; export const SaveableCard=({children})=>children; export const ProfessionalCard=({professional})=>React.createElement('article',{'data-pro-id':professional.id},professional.id);`, resolveDir: process.cwd() }));
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

for (const slow of [false, true]) {
  test(`search keeps twenty cards and ${slow ? "shows matching skeletons only while waiting" : "skips skeletons for an immediate next batch"}`, async ({ page }) => {
    let release = () => {};
    const gate = new Promise<void>(resolve => { release = resolve; });
    page.on("close", release);
    const offsets: string[] = [];
    await page.route("**/api/buscar/results?*", async route => {
      offsets.push(new URL(route.request().url()).searchParams.get("offset")!);
      if (slow) await gate;
      await route.fulfill({ json: { professionals: Array.from({length:20},(_,i)=>({professional:{id:'next-'+i},forceContactOnly:false,preferVideo:false})) } });
    });
    await page.route("**/loading-harness", route => route.fulfill({ contentType: "text/html", body: '<!doctype html><style>.ccr-skeleton-shimmer{display:block;min-height:16px}</style><div id="root"></div>' }));
    await page.goto("/loading-harness");
    await page.addScriptTag({ content: await harness(`import React from 'react'; import {createRoot} from 'react-dom/client'; import {SearchResultsInfinite} from './src/components/search/search-results-infinite';
      window.skeletonAppeared=false; new MutationObserver(()=>{if(document.querySelector('[role="status"]'))window.skeletonAppeared=true}).observe(document.body,{childList:true,subtree:true});
      createRoot(document.getElementById('root')).render(<>{Array.from({length:20},(_,i)=><article key={i} data-initial-card style={{height:300}}>Profesional {i}</article>)}<SearchResultsInfinite query="q=fixture" initialCount={20} total={40} highlightMetric="rating" searchReturnHref="/buscar" loadingLabel="Cargando profesionales" failedLabel="Error" retryLabel="Reintentar"/></>);`) });
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
    if (!slow) expect(await page.evaluate(() => (window as unknown as {skeletonAppeared:boolean}).skeletonAppeared)).toBe(false);
  });
}

import { waitForInteractivePage } from "./helpers";
import { test, expect } from "playwright/test";
import { build } from "esbuild";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";

for (const native of [false,true]) for (const locale of ['es','en'] as const) {
  test(`${native?'native':'web'} missing-page home action acknowledges a slow navigation in ${locale}`,async({page,context,baseURL})=>{
    test.skip(native && test.info().project.name==='chromium-desktop','Native presentation on mobile');
    await context.addCookies([{name:'ccr_sin_analitica',value:'1',url:baseURL!}]);
    if(native){
      await context.addCookies([{name:'ccr_platform',value:'native',url:baseURL!}]);
      await page.addInitScript(()=>localStorage.setItem('ccr:native-first-run-onboarding:v12','1'));
    }
    const missing=locale==='en'?'/en/ruta-inexistente/para-regresion':'/ruta-inexistente/para-regresion';
    await page.goto(missing);
    const home=page.locator('[data-home-recovery-link]').first();
    await expect(home).toBeVisible();
    await waitForInteractivePage(page);
    const original=await home.boundingBox();
    await page.evaluate(()=>{
      const capture=()=>{
        const link=document.querySelector('[data-home-recovery-link]');
        if(link?.getAttribute('aria-busy')!=='true')return;
        const box=link.getBoundingClientRect();
        sessionStorage.setItem('qa:home-feedback',JSON.stringify({busy:true,text:link.querySelector('[role=status]')?.textContent,width:box.width,height:box.height}));
      };
      window.addEventListener('beforeunload',capture);
      new MutationObserver(capture).observe(document.body,{subtree:true,attributes:true,attributeFilter:['aria-busy']});
    });
    let release!:()=>void;
    const gate=new Promise<void>(resolve=>{release=resolve;});
    await page.route('**/*',async route=>{
      const request=route.request();
      const url=new URL(request.url());
      if((url.pathname==='/'||url.pathname==='/en')&&(request.isNavigationRequest()||request.headers().rsc==='1'))await gate;
      await route.continue();
    });
    const navigating=page.waitForRequest(request=>{const path=new URL(request.url()).pathname;return request.isNavigationRequest()&&(path==='/'||path==='/en')});
    try {
      await home.click({noWaitAfter:true});
      await navigating;
    }finally{release();}
    await expect(page).toHaveURL(locale==='en'?/\/en\/?$/:/\/$/);
    await expect(page.locator('main.ccr-portada')).toBeVisible();
    await expect(page.locator('.ccr-error-screen')).toHaveCount(0);
    const feedback=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('qa:home-feedback')??'null'));
    expect(feedback?.busy).toBe(true);
    expect(feedback.text).toBe(locale==='en'?'Opening home…':'Abriendo el inicio…');
    expect(feedback.width).toBeCloseTo(original!.width,0);
    expect(feedback.height).toBeCloseTo(original!.height,0);
  });
}

test('home streams its main content while coverage and service data are still pending',async()=>{
  test.setTimeout(20_000);
  const modules:Record<string,string>={
    '@/lib/queries/professionals':`export const getZoneCoverage=()=>new Promise(resolve=>{globalThis.__releaseCoverage=()=>resolve({byProvince:{},countryWide:false})});`,
    '@/components/landing/pros-section':`import React from 'react';export async function ProsSection(){await new Promise(resolve=>{globalThis.__releaseSupply=resolve});return React.createElement('section',null,'Ready services')}`,
    '@/components/landing/find-by-zone':`import React from 'react';export const FindByZone=()=>React.createElement('section',null,'Ready coverage');`,
    'next-intl/server':`export const getTranslations=async()=>key=>key;`,
  };
  const names:Record<string,string>={'app-download':'AppDownloadSection','landing-navbar':'LandingNavbar','landing-hero':'LandingHero','featured-brands':'FeaturedBrands','why-contratacr':'WhyContratacr','landing-footer':'LandingFooter','fade-in-up':'FadeInUp'};
  const result=await build({stdin:{contents:`import React from 'react';import{renderToReadableStream}from'react-dom/server';import Home from './src/app/[locale]/page';export async function render(){return renderToReadableStream(await Home({params:Promise.resolve({locale:'es'}),searchParams:Promise.resolve({})}))}export function release(){globalThis.__releaseCoverage?.();globalThis.__releaseSupply?.()}`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,format:'cjs',platform:'node',packages:'external',jsx:'automatic',plugins:[{name:'boundaries',setup(b){
    b.onResolve({filter:/^(?:next-intl\/server|@\/lib\/queries\/professionals|@\/components\/landing\/)/},a=>({path:a.path,namespace:'mock'}));
    b.onLoad({filter:/.*/,namespace:'mock'},a=>{
      let contents=modules[a.path];
      if(!contents){const name=names[a.path.split('/').at(-1)!];if(!name)throw Error('Missing module '+a.path);contents=`import React from 'react';export function ${name}({children}){return React.createElement('${name==='LandingHero'?'h1':'div'}',null,children??'${name==='LandingHero'?'Home hero':name}')}`;}
      return {contents,resolveDir:process.cwd(),loader:'tsx'};
    });
  }}]});
  const dir=resolve('node_modules/.cache/ccr-home-stream');await mkdir(dir,{recursive:true});
  const file=resolve(dir,`harness-${process.pid}-${test.info().workerIndex}.cjs`);await writeFile(file,result.outputFiles[0].text);
  const require=createRequire(resolve(process.cwd(), "package.json"));
  const harness=require(file) as {render:()=>Promise<ReadableStream<Uint8Array>&{allReady:Promise<void>}>;release:()=>void};
  try {
    const stream=await harness.render();
    const reader=stream.getReader();
    const first=await reader.read();
    const shell=new TextDecoder().decode(first.value);
    expect(shell).toContain('Home hero');
    expect(shell).not.toContain('Ready coverage');expect(shell).not.toContain('Ready services');
    harness.release();await stream.allReady;
    let rest='';for(;;){const chunk=await reader.read();if(chunk.done)break;rest+=new TextDecoder().decode(chunk.value);}
    expect(rest).toContain('Ready coverage');expect(rest).toContain('Ready services');
  }finally{harness.release();delete require.cache[file];await unlink(file);}
});

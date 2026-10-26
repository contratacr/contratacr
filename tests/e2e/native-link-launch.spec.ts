import { test, expect } from 'playwright/test';
import { build } from 'esbuild';

for (const newer of [false, true]) test(`cold link waits for destination commit and respects newer event ${newer}`, async ({page}) => {
  await page.route('**/launch-harness', r => r.fulfill({contentType:'text/html',body:'<div id="root"></div>'}));
  await page.goto('/launch-harness');
  const bundle=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`import React from 'react';import{createRoot}from'react-dom/client';import{CampaignAppLinks}from'./src/components/mobile/campaign-app-links';createRoot(document.getElementById('root')).render(<CampaignAppLinks/>);`},bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',plugins:[{name:'native-launch',setup(b){
    b.onResolve({filter:/^(next\/navigation|@capacitor\/app|@\/hooks\/use-native-app)$/},a=>({path:a.path,namespace:'native-launch'}));
    b.onLoad({filter:/.*/,namespace:'native-launch'},a=>({resolveDir:process.cwd(),contents:a.path==='@/hooks/use-native-app'?`export const useNativeApp=()=>true;`:a.path==='@capacitor/app'?`export const App={addListener:async(_,cb)=>{window.deliver=cb;return{remove:async()=>{}}},getLaunchUrl:()=>new Promise(r=>window.resolveLaunch=r)};`:`import{useSyncExternalStore}from'react';let path=location.pathname;let listeners=new Set();window.moves=[];window.commit=()=>{path=window.moves.at(-1).path.split(/[?#]/)[0];listeners.forEach(f=>f())};const router={push:path=>window.moves.push({kind:'push',path}),replace:path=>window.moves.push({kind:'replace',path})};export const useRouter=()=>router;export const usePathname=()=>useSyncExternalStore(cb=>{listeners.add(cb);return()=>listeners.delete(cb)},()=>path);`}));
  }}]});
  await page.addScriptTag({content:bundle.outputFiles[0].text});
  await expect.poll(()=>page.evaluate(()=>Boolean((window as unknown as {resolveLaunch?:unknown}).resolveLaunch))).toBe(true);
  expect(await page.evaluate(()=>(window as unknown as {__ccrAppLinkPending:string}).__ccrAppLinkPending)).toBe('resolving-launch');
  await page.evaluate(newer=>{
    const w=window as unknown as {deliver:(v:{url:string})=>void;resolveLaunch:(v:{url:string})=>void};
    if(newer)w.deliver({url:'https://contratacr.com/en/proyectos'});
    w.resolveLaunch({url:'https://contratacr.com/isaac-alberto-sanchez-monge'});
  },newer);
  const path=newer?'/en/proyectos':'/profesionales/isaac-alberto-sanchez-monge';
  await expect.poll(()=>page.evaluate(()=>(window as unknown as {moves:unknown[]}).moves)).toEqual([{kind:newer?'push':'replace',path}]);
  expect(await page.evaluate(()=>(window as unknown as {__ccrAppLinkPending:string}).__ccrAppLinkPending)).toBe(path);
  await page.evaluate(()=>(window as unknown as {commit:()=>void}).commit());
  await expect.poll(()=>page.evaluate(()=>(window as unknown as {__ccrAppLinkPending?:string}).__ccrAppLinkPending)).toBeUndefined();
});

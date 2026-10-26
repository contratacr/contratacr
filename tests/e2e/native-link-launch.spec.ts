import { test, expect } from 'playwright/test';
import { build } from 'esbuild';
import { APP_LINK_COVER_CSS, APP_LINK_PREPAINT } from '../../src/lib/mobile/app-link-pending';

for (const newer of [false, true]) test(`cold link waits for destination commit and respects newer event ${newer}`, async ({page}) => {
  await page.route('**/launch-harness', r => r.fulfill({contentType:'text/html',body:`<!doctype html><html class="ccr-native-app"><head><style>${APP_LINK_COVER_CSS}</style><script>${APP_LINK_PREPAINT}</script></head><body><main>Inicio</main><div id="root"><div id="ccr-app-link-cover"><span></span></div></div></body></html>`}));
  await page.goto('/launch-harness');
  await expect(page.locator('#ccr-app-link-cover')).toBeVisible();
  // Restored storage must not suppress this document's launch resolution.
  await page.evaluate(()=>sessionStorage.setItem('ccr:campaign-launch-consumed:v1','1'));
  const bundle=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`import React from 'react';import{createRoot}from'react-dom/client';import{CampaignAppLinks}from'./src/components/mobile/campaign-app-links';import{AppLinkCover}from'./src/components/mobile/app-link-cover';createRoot(document.getElementById('root')).render(<><AppLinkCover/><CampaignAppLinks/></>);`},bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',plugins:[{name:'native-launch',setup(b){
    b.onResolve({filter:/^(next\/navigation|@capacitor\/app|@\/hooks\/use-native-app)$/},a=>({path:a.path,namespace:'native-launch'}));
    b.onLoad({filter:/.*/,namespace:'native-launch'},a=>({resolveDir:process.cwd(),contents:a.path==='@/hooks/use-native-app'?`export const useNativeApp=()=>true;`:a.path==='@capacitor/app'?`export const App={addListener:async(_,cb)=>{window.deliver=cb;return{remove:async()=>{}}},getLaunchUrl:()=>new Promise(r=>window.resolveLaunch=r)};`:`import{useSyncExternalStore}from'react';let path=location.pathname;let listeners=new Set();window.moves=[];window.commit=()=>{path=window.moves.at(-1).path.split(/[?#]/)[0].replace(/\\/+$/,'');listeners.forEach(f=>f())};const router={push:path=>window.moves.push({kind:'push',path}),replace:path=>window.moves.push({kind:'replace',path})};export const useRouter=()=>router;export const usePathname=()=>useSyncExternalStore(cb=>{listeners.add(cb);return()=>listeners.delete(cb)},()=>path);`}));
  }}]});
  await page.clock.install();
  await page.addScriptTag({content:bundle.outputFiles[0].text});
  await expect.poll(()=>page.evaluate(()=>Boolean((window as unknown as {resolveLaunch?:unknown}).resolveLaunch))).toBe(true);
  expect(await page.evaluate(()=>(window as unknown as {__ccrAppLinkPending:string}).__ccrAppLinkPending)).toBe('resolving-launch');
  await page.clock.fastForward(16_000);
  await expect(page.getByRole('button',{name:/Reintentar/})).toBeVisible();
  await expect(page.locator('#ccr-app-link-cover')).toBeVisible();
  await page.evaluate(newer=>{
    const w=window as unknown as {deliver:(v:{url:string})=>void;resolveLaunch:(v:{url:string})=>void};
    if(newer)w.deliver({url:'https://contratacr.com/en/proyectos/?utm_source=notes#list'});
    w.resolveLaunch({url:'https://contratacr.com/isaac-alberto-sanchez-monge?utm_source=notes#contact'});
  },newer);
  const path=newer?'/en/proyectos/?utm_source=notes#list':'/profesionales/isaac-alberto-sanchez-monge?utm_source=notes#contact';
  await expect.poll(()=>page.evaluate(()=>(window as unknown as {moves:unknown[]}).moves)).toEqual([{kind:newer?'push':'replace',path}]);
  expect(await page.evaluate(()=>(window as unknown as {__ccrAppLinkPending:string}).__ccrAppLinkPending)).toBe(path);
  // Native hide timeouts may elapse; the document must still cover home.
  await expect(page.locator('#ccr-app-link-cover')).toBeVisible();
  expect(await page.evaluate(()=>document.elementFromPoint(innerWidth/2,innerHeight/2)?.closest('#ccr-app-link-cover')?.id)).toBe('ccr-app-link-cover');
  await page.evaluate(()=>(window as unknown as {commit:()=>void}).commit());
  await expect.poll(()=>page.evaluate(()=>(window as unknown as {__ccrAppLinkPending?:string}).__ccrAppLinkPending)).toBeUndefined();
  await expect(page.locator('#ccr-app-link-cover')).toBeHidden();
});

// Exercise the real MFA gate with a delayed native launch, without credentials
// or mutations. Only native transport/authentication responses are test doubles.
test('native launch resolves while MFA blocks protected children', async ({ page }) => {
  const { readFileSync } = await import('node:fs');
  const ts = await import('typescript');
  const layout = ts.createSourceFile('layout.tsx', readFileSync('src/app/[locale]/layout.tsx', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let gateContainsListener = false;
  let listeners = 0;
  const walk = (node: import('typescript').Node, blocked = false) => {
    const inside = blocked || (ts.isJsxElement(node) && node.openingElement.tagName.getText(layout) === 'SessionMfaGate');
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(layout) === 'CampaignAppLinks') {
      listeners++;
      gateContainsListener ||= inside;
    }
    node.forEachChild(child => walk(child, inside));
  };
  walk(layout);
  expect(listeners).toBe(1);
  expect(gateContainsListener).toBe(false);
  await page.route('**/mfa-launch-harness', route => route.fulfill({contentType:'text/html',body:`<!doctype html><html class="ccr-native-app"><head><style>${APP_LINK_COVER_CSS}</style><script>${APP_LINK_PREPAINT}</script></head><body><div id="root"></div></body></html>`}));
  await page.goto('/mfa-launch-harness');
  const mocks: Record<string,string> = {
    '@/hooks/use-native-app': 'export const useNativeApp=()=>true;',
    '@/hooks/use-auth': 'export const useAuth=()=>({user:{id:"admin"}});',
    '@/lib/supabase/client': 'export const createClient=()=>({auth:{onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})}});',
    'next-intl': 'export const useTranslations=()=>key=>key;',
    '@/i18n/navigation': 'export const usePathname=()=>"/admin";export const useRouter=()=>({refresh(){}});',
    'next/navigation': 'export const usePathname=()=>"/admin";export const useRouter=()=>({push(){},replace(){}});',
    '@capacitor/app': 'export const App={addListener:async()=>({remove:async()=>{}}),getLaunchUrl:()=>new Promise(r=>window.resolveLaunch=r)};',
    '@/components/admin/admin-mfa': 'import React from "react";export const AdminMfa=()=>React.createElement("button",{onClick:()=>window.mfaClicked=true},"Configurar autenticador");',
    '@/components/auth/authentication-loading': 'export const AuthenticationLoading=()=>null;',
    '@/components/landing/landing-navbar': 'export const ContrataCRLogo=()=>null;',
  };
  const bundle=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`import React from'react';import{createRoot}from'react-dom/client';import{CampaignAppLinks}from'./src/components/mobile/campaign-app-links';import{AppLinkCover}from'./src/components/mobile/app-link-cover';import{SessionMfaGate}from'./src/components/auth/session-mfa-gate';createRoot(document.getElementById('root')).render(<><AppLinkCover/><CampaignAppLinks/><SessionMfaGate initialState={{userId:'admin',authenticated:true,isAdmin:true,enrolled:false,required:true}}><main>Protected content</main></SessionMfaGate></>);`},bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',plugins:[{name:'mfa-native-transport',setup(b){b.onResolve({filter:/.*/},a=>a.path in mocks?{path:a.path,namespace:'mfa-native-transport'}:undefined);b.onLoad({filter:/.*/,namespace:'mfa-native-transport'},a=>({contents:mocks[a.path],resolveDir:process.cwd()}));}}]});
  await page.addScriptTag({content:bundle.outputFiles[0].text});
  await expect.poll(()=>page.evaluate(()=>typeof (window as unknown as {resolveLaunch?:unknown}).resolveLaunch)).toBe('function');
  await expect(page.locator('#ccr-app-link-cover')).toBeVisible();
  await expect(page.getByText('Protected content')).toHaveCount(0);
  await page.evaluate(()=>(window as unknown as {resolveLaunch:(value:object)=>void}).resolveLaunch({}));
  await expect(page.locator('#ccr-app-link-cover')).toBeHidden();
  await page.getByRole('button',{name:'Configurar autenticador'}).click();
  expect(await page.evaluate(()=>(window as unknown as {mfaClicked?:boolean}).mfaClicked)).toBe(true);
  await expect(page.getByText('Protected content')).toHaveCount(0);
});

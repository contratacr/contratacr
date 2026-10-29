import { build } from "esbuild";
import { expect, test, type Page } from "playwright/test";

declare global {
  interface Window {
    resumeQA: {
      native: boolean; wakes: number; refreshes: number; heartbeats: number; connects: number; removed: number;
      listeners: Record<string, (value?: { isActive: boolean }) => void>;
      stop: () => void; plain: () => void; lock: () => void;
    };
  }
}
let bundle: string;
test.beforeAll(async () => {
  const result = await build({
    stdin: { resolveDir: process.cwd(), loader: "tsx", contents: `
      import React, {useState} from 'react'; import {createRoot} from 'react-dom/client';
      import {installAppResumeRecovery} from './src/lib/app-resume-recovery';
      import {lockBodyScroll} from './src/lib/body-scroll-lock';
      const qa=window.resumeQA; const root=createRoot(document.getElementById('root'));
      function Editor(){const [draft,setDraft]=useState('');const [count,setCount]=useState(0);
        return <form onSubmit={e=>e.preventDefault()}><label>Borrador<textarea value={draft} onChange={e=>setDraft(e.target.value)}/></label>
        <label>Adjunto<input type="file"/></label><button onClick={()=>setCount(n=>n+1)}>Responder {count}</button></form>}
      root.render(<Editor/>); qa.plain=()=>root.render(<main><button>Vista</button></main>);
      qa.lock=()=>{lockBodyScroll()}; window.addEventListener('contratacr:app-resume',()=>qa.wakes++);
      qa.stop=installAppResumeRecovery(()=>qa.refreshes++);`,
    }, jsx: "automatic", bundle: true, write: false, platform: "browser", format: "iife", tsconfig: "tsconfig.json",
    define: { "process.env.NODE_ENV": '"production"' },
    plugins: [{ name: "native-and-transport-boundary", setup(builder) {
      builder.onResolve({ filter: /^(@capacitor\/(app|core)|@\/lib\/supabase\/client)$/ }, args => ({ path: args.path, namespace: "resume-test" }));
      builder.onLoad({ filter: /.*/, namespace: "resume-test" }, args => ({ contents:
        args.path === "@capacitor/core" ? `export const Capacitor={isNativePlatform:()=>window.resumeQA.native};` :
        args.path === "@capacitor/app" ? `export const App={addListener:async(name,listener)=>{const qa=window.resumeQA;qa.listeners[name]=listener;return {remove:async()=>{delete qa.listeners[name];qa.removed++}}}};` :
        `export const createClient=()=>({realtime:{getChannels:()=>[{}],connect:()=>window.resumeQA.connects++,sendHeartbeat:async()=>{window.resumeQA.heartbeats++}}});`,
      }));
    } }],
  });
  bundle = result.outputFiles[0].text;
});

async function harness(page: Page, native = false) {
  await page.clock.install();
  await page.route("**/resume-harness", route => route.fulfill({ contentType: "text/html", body: '<!doctype html><div id="root"></div>' }));
  await page.goto("/resume-harness");
  await page.evaluate(native => {
    window.resumeQA = { native, wakes: 0, refreshes: 0, heartbeats: 0, connects: 0, removed: 0, listeners: {}, stop: () => {}, plain: () => {}, lock: () => {} };
    if (native) document.documentElement.classList.add("ccr-native-app");
    sessionStorage.setItem("resume-session-marker", "unchanged");
    localStorage.setItem("resume-draft-marker", "unchanged");
    document.cookie = "resume-session-marker=unchanged; SameSite=Lax; path=/";
  }, native);
  await page.addScriptTag({ content: bundle });
  await expect(page.getByLabel("Borrador")).toBeVisible();
  if (native) await expect.poll(() => page.evaluate(() => Object.keys(window.resumeQA.listeners).length)).toBe(3);
}
async function suspend(page: Page, duration: number, native: boolean) {
  await page.evaluate(native => {
    if (native) window.resumeQA.listeners.appStateChange({ isActive: false });
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
    if (native) window.resumeQA.listeners.pause();
  }, native);
  await page.clock.setSystemTime(new Date(await page.evaluate(() => Date.now()) + duration));
}
async function resume(page: Page, native: boolean, keepDocumentHidden = false) {
  await page.evaluate(({ native, keepDocumentHidden }) => {
    if (!keepDocumentHidden) Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    if (native) {
      window.resumeQA.listeners.resume();
      window.resumeQA.listeners.appStateChange({ isActive: true });
    }
    document.dispatchEvent(new Event("visibilitychange"));
    document.dispatchEvent(new Event("resume"));
    window.dispatchEvent(new Event("focus"));
    window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: false }));
  }, { native, keepDocumentHidden });
}

for (const native of [false, true]) {
  for (const seconds of [5, 660]) {
    test(`desbloquear tras ${seconds}s conserva texto, adjunto y almacenamiento (${native ? "nativo" : "web"})`, async ({ page }) => {
      await harness(page, native);
      await page.getByLabel("Borrador").fill("Proyecto sin publicar: texto escrito antes de bloquear");
      await page.getByLabel("Adjunto").setInputFiles({ name: "borrador.txt", mimeType: "text/plain", buffer: Buffer.from("adjunto local sin enviar") });
      await suspend(page, seconds * 1000, native);
      await resume(page, native);
      await page.waitForTimeout(450);
      await expect(page.getByLabel("Borrador")).toHaveValue("Proyecto sin publicar: texto escrito antes de bloquear");
      expect(await page.getByLabel("Adjunto").evaluate((input: HTMLInputElement) => input.files?.[0]?.name)).toBe("borrador.txt");
      await page.getByRole("button", { name: "Responder 0" }).click();
      await expect(page.getByRole("button", { name: "Responder 1" })).toBeVisible();
      expect(await page.evaluate(() => ({ session: sessionStorage.getItem("resume-session-marker"), draft: localStorage.getItem("resume-draft-marker"), cookie: document.cookie.includes("resume-session-marker=unchanged"), wakes: window.resumeQA.wakes, refreshes: window.resumeQA.refreshes })))
        .toEqual({ session: "unchanged", draft: "unchanged", cookie: true, wakes: 1, refreshes: 0 });
      expect(await page.evaluate(() => window.resumeQA.heartbeats)).toBe(seconds >= 60 ? 1 : 0);
    });
  }
}

test("reanudar sin red conserva la vista y reconcilia una vez al volver la conexión", async ({ page }) => {
  await harness(page);
  await page.evaluate(() => window.resumeQA.plain());
  await expect(page.getByRole("button", { name: "Vista" })).toBeVisible();
  await page.context().setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  await suspend(page, 180000, false);
  await resume(page, false);
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => window.resumeQA.refreshes)).toBe(0);
  await page.context().setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect.poll(() => page.evaluate(() => window.resumeQA.refreshes)).toBe(1);
});

test("recuperación nativa no depende de visibilitychange y limpia sus tres listeners", async ({ page }) => {
  await harness(page, true);
  await page.evaluate(() => window.resumeQA.plain());
  await expect(page.getByRole("button", { name: "Vista" })).toBeVisible();
  await suspend(page, 180000, true);
  await page.evaluate(() => window.resumeQA.listeners.resume());
  await expect.poll(() => page.evaluate(() => window.resumeQA.wakes)).toBe(1);
  await expect.poll(() => page.evaluate(() => window.resumeQA.refreshes)).toBe(1);
  await page.evaluate(() => window.resumeQA.stop());
  await expect.poll(() => page.evaluate(() => window.resumeQA.removed)).toBe(3);
  await page.evaluate(() => { window.dispatchEvent(new Event("focus")); document.dispatchEvent(new Event("resume")); });
  expect(await page.evaluate(() => window.resumeQA.wakes)).toBe(1);
});

test("al despertar libera un candado huérfano y conserva el de un diálogo abierto", async ({ page }) => {
  await harness(page);
  await page.evaluate(() => {
    const drawer = document.createElement("div"); drawer.setAttribute("role", "dialog"); drawer.setAttribute("aria-modal", "true");
    drawer.style.cssText = "position:fixed;left:100vw;top:0;width:100vw;height:100vh";
    document.body.append(drawer);
    window.resumeQA.lock();
  });
  await expect(page.locator("body")).toHaveCSS("position", "fixed");
  await suspend(page, 5000, false);
  await resume(page, false);
  await expect(page.locator("body")).not.toHaveCSS("position", "fixed");
  await page.evaluate(() => {
    const dialog = document.createElement("div"); dialog.setAttribute("role", "dialog"); dialog.setAttribute("aria-modal", "true"); dialog.style.cssText = "position:fixed;left:0;top:0;width:100px;height:100px"; document.body.append(dialog);
    window.resumeQA.lock();
  });
  await suspend(page, 5000, false);
  await resume(page, false);
  await expect(page.locator("body")).toHaveCSS("position", "fixed");
});

for (const initiallyFailing of [false, true]) test(`un error de sesión conserva el usuario; cierre explícito se aplica (fallo inicial ${initiallyFailing})`, async ({ page }) => {
  const result = await build({
    stdin: { resolveDir: process.cwd(), loader: "tsx", contents: `
      import React from 'react'; import {createRoot} from 'react-dom/client';
      import {AuthProvider,useAuth} from './src/hooks/use-auth';
      const user={id:'synthetic-resume-user',updated_at:'2026-10-22T00:00:00Z',user_metadata:{},app_metadata:{}};
      window.authResumeQA={fail:${initiallyFailing},callback:()=>{}};
      function Screen(){const {user}=useAuth();return <output>{user?.id??'signed-out'}</output>}
      createRoot(document.getElementById('root')).render(<AuthProvider initialUser={user} initialAvatarUrl={null}><Screen/></AuthProvider>);`,
    }, jsx: "automatic", bundle: true, write: false, platform: "browser", format: "iife", tsconfig: "tsconfig.json",
    define: { "process.env.NODE_ENV": '"production"' },
    plugins: [{ name: "auth-transport-boundary", setup(builder) {
      builder.onResolve({ filter: /^@\/lib\/(supabase\/client|auth\/sign-out|dashboard-prefetch-cache|direct-chat\/conversations-cache)$/ }, args => ({ path: args.path, namespace: "auth-resume-test" }));
      builder.onLoad({ filter: /.*/, namespace: "auth-resume-test" }, args => ({ contents: args.path.endsWith("supabase/client") ? `
        export const hasSupabaseBrowserConfig=()=>true;
        export const createClient=()=>({auth:{getSession:async()=>window.authResumeQA.fail?{data:{session:null},error:Error('temporary-network-error')}:{data:{session:{user:{id:'synthetic-resume-user',updated_at:'2026-10-22T00:00:00Z',user_metadata:{},app_metadata:{}}}},error:null},
        onAuthStateChange:callback=>{window.authResumeQA.callback=callback;return {data:{subscription:{unsubscribe(){}}}}}},
        from:()=>({select:()=>({eq:()=>({single:async()=>({data:null})})})})});` :
        `export const isSigningOut=()=>false;export const clearDashboardCache=()=>{};export const clearConversationsCache=()=>{};`,
      }));
    } }],
  });
  await page.route("**/auth-resume-harness", route => route.fulfill({ contentType: "text/html", body: '<!doctype html><div id="root"></div>' }));
  await page.goto("/auth-resume-harness");
  await page.addScriptTag({ content: result.outputFiles[0].text });
  await page.waitForTimeout(initiallyFailing ? 1700 : 100);
  await expect(page.locator("output")).toHaveText("synthetic-resume-user");
  await page.evaluate(() => {
    (window as unknown as { authResumeQA: { fail: boolean } }).authResumeQA.fail = true;
    window.dispatchEvent(new Event("contratacr:app-resume"));
  });
  await page.waitForTimeout(100);
  await expect(page.locator("output")).toHaveText("synthetic-resume-user");
  await page.evaluate(() => (window as unknown as { authResumeQA: { callback: (event: string, session: null) => void } }).authResumeQA.callback("SIGNED_OUT", null));
  await expect(page.locator("output")).toHaveText("signed-out");
});

for (const native of [false, true]) {
  test(`cada regreso rápido recupera candados sin perder borradores (${native ? "nativo" : "web"})`, async ({ page }) => {
    await harness(page, native);
    await page.getByLabel("Borrador").fill("Conservar al alternar apps");
    for (let cycle = 0; cycle < 4; cycle++) {
      await page.evaluate(() => window.resumeQA.lock());
      await suspend(page, 120, native);
      await resume(page, native);
      await expect(page.locator("body")).not.toHaveCSS("position", "fixed");
      await expect(page.getByLabel("Borrador")).toHaveValue("Conservar al alternar apps");
    }
    expect(await page.evaluate(() => window.resumeQA.wakes)).toBe(4);
    expect(await page.evaluate(() => window.resumeQA.refreshes)).toBe(0);
  });
}

for (const phase of ["startup", "resume", "hung"]) {
  for (const event of ["SIGNED_IN", "SIGNED_OUT"] as const) {
    test(`sesión tardía de ${phase} no revierte ${event}`, async ({ page }) => {
      const result = await build({
        stdin: { resolveDir: process.cwd(), loader: "tsx", contents: `
          import React from 'react';import{createRoot}from'react-dom/client';
          import{AuthProvider,useAuth}from'./src/hooks/use-auth';
          function Screen(){const{user,loading}=useAuth();return <output>{loading?'loading':user?.id??'signed-out'}</output>}
          createRoot(document.getElementById('root')).render(<AuthProvider initialAvatarUrl={null}><Screen/></AuthProvider>);`,
        }, jsx: "automatic", bundle: true, write: false, platform: "browser", format: "iife", tsconfig: "tsconfig.json",
        define: { "process.env.NODE_ENV": '"production"' },
        plugins: [{ name: "delayed-auth", setup(builder) {
          builder.onResolve({ filter: /^@\/lib\/(supabase\/client|auth\/sign-out|dashboard-prefetch-cache|direct-chat\/conversations-cache)$/ }, args => ({ path: args.path, namespace: "delayed-auth" }));
          builder.onLoad({ filter: /.*/, namespace: "delayed-auth" }, args => ({ contents: args.path.endsWith("supabase/client") ? `
            export const hasSupabaseBrowserConfig=()=>true;
            export const createClient=()=>({auth:{
              getSession:()=>new Promise(resolve=>window.delayedAuth.resolve=resolve),
              onAuthStateChange:callback=>{window.delayedAuth.callback=callback;return{data:{subscription:{unsubscribe(){}}}}}},
              from:()=>({select:()=>({eq:()=>({single:async()=>({data:null})})})})});` :
            `export const isSigningOut=()=>true;export const clearDashboardCache=()=>{};export const clearConversationsCache=()=>{};`,
          }));
        } }],
      });
      await page.route("**/delayed-auth", route => route.fulfill({contentType:"text/html",body:'<!doctype html><div id="root"></div>'}));
      await page.goto("/delayed-auth");
      await page.evaluate(() => Object.assign(window, { delayedAuth: {} }));
      await page.addScriptTag({ content: result.outputFiles[0].text });
      await expect.poll(() => page.evaluate(() => typeof (window as unknown as { delayedAuth: {callback: unknown} }).delayedAuth.callback)).toBe("function");
      if (phase === "resume") {
        await page.evaluate(() => {
          const qa = (window as unknown as { delayedAuth: {resolve: (value: unknown) => void} }).delayedAuth;
          qa.resolve({data:{session:null},error:null});
        });
        await expect(page.locator("output")).toHaveText("signed-out");
        await page.evaluate(() => window.dispatchEvent(new Event("contratacr:app-resume")));
      }
      await page.evaluate(({event, phase}) => {
        const qa = (window as unknown as { delayedAuth: {callback: (event: string, session: unknown) => void; resolve: (value: unknown) => void} }).delayedAuth;
        const user = {id:"new-session",updated_at:"2026-10-29T00:00:00Z",user_metadata:{},app_metadata:{}};
        qa.callback(event, event === "SIGNED_IN" ? {user} : null);
        // The old read arrives AFTER the authoritative event with opposite state.
        if (phase !== "hung") qa.resolve({data:{session:event === "SIGNED_IN" ? null : {user}},error:null});
      }, {event, phase});
      await expect(page.locator("output")).toHaveText(event === "SIGNED_IN" ? "new-session" : "signed-out");
    });
  }
}

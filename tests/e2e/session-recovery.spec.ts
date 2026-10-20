import { test, expect } from "playwright/test";
import { build } from "esbuild";

for (const automatic of [false, true]) {
  test(`session recovery ${automatic ? "retries on reconnect" : "shows progress and retries manually"} without bypassing MFA`, async ({ page }) => {
    const bundle = await build({ stdin: { contents: `import React from 'react';import{createRoot}from'react-dom/client';import{SessionMfaGate}from'./src/components/auth/session-mfa-gate';createRoot(document.getElementById('root')).render(<SessionMfaGate initialState={{userId:null,authenticated:false,isAdmin:false,enrolled:false,required:false}}><div data-private-content>Private content</div></SessionMfaGate>);`,loader:"tsx",resolveDir:process.cwd()},jsx:"automatic",bundle:true,write:false,platform:"browser",format:"iife",define:{"process.env.NODE_ENV":'"production"'},plugins:[{name:"boundaries",setup(b){
      b.onResolve({filter:/^(next-intl|@\/hooks\/use-auth|@\/lib\/supabase\/client|@\/components\/admin\/admin-mfa|@\/components\/ui\/route-loading|@\/i18n\/navigation|@\/components\/landing\/landing-navbar)$/},a=>({path:a.path,namespace:"mock"}));
      b.onLoad({filter:/.*/,namespace:"mock"},a=>({resolveDir:process.cwd(),contents: a.path==="next-intl"?`export const useTranslations=()=>key=>key;`:a.path.includes("use-auth")?`export const useAuth=()=>({user:{id:'test'}});`:a.path.includes("supabase/client")?`export const createClient=()=>({auth:{onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})}});`:a.path.includes("admin-mfa")?`import React from 'react';export const AdminMfa=()=>React.createElement('div',{'data-mfa-challenge':''},'Challenge');`:a.path.includes("route-loading")?`export const PageRouteLoading=()=>null;`:a.path.includes("landing-navbar")?`export const ContrataCRLogo=()=>null;`:`export const useRouter=()=>({refresh(){}});export const usePathname=()=>"/dashboard/profesional";`}));
    }}]});
    await page.route("**/session-recovery-harness", r=>r.fulfill({contentType:"text/html",body:'<!doctype html><meta name="viewport" content="width=device-width"><div id="root"></div>'}));
    let requests = 0;
    let release!: () => void;
    const responseReady = new Promise<void>(resolve => { release = resolve; });
    await page.route("**/api/auth/session-mfa", async route => {
      requests++;
      if (requests === 1) return route.abort("internetdisconnected");
      await responseReady;
      await route.fulfill({json:{userId:"test",authenticated:true,isAdmin:false,enrolled:true,required:true}});
    });
    await page.goto("/session-recovery-harness");
    // Older WebViews may lack this newer API; the retry must still work.
    await page.evaluate(() => Object.defineProperty(AbortSignal,"timeout",{value:undefined,configurable:true}));
    await page.addScriptTag({content:bundle.outputFiles[0].text});
    const recovery = page.locator("[data-session-recovery]");
    await expect(recovery).toBeVisible();
    await expect(page.locator("[data-private-content]")).toHaveCount(0);
    if (automatic) await page.evaluate(()=>window.dispatchEvent(new Event("online")));
    else await recovery.getByRole("button",{name:"retry",exact:true}).click();
    await expect(recovery.getByRole("button",{name:"checking",exact:true})).toBeDisabled();
    release();
    await expect(recovery).toHaveCount(0);
    await expect(page.locator("[data-mfa-challenge]")).toBeVisible();
    await expect(page.locator("[data-private-content]")).toHaveCount(0);
    expect(requests).toBe(2);
  });
}

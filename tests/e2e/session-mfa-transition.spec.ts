import { test, expect } from "playwright/test";
import { build } from "esbuild";

for (const path of ["/login", "/dashboard/profesional"]) {
  test(`MFA pending transition ${path} keeps authentication presentation without the route header`, async ({ page }) => {
    const bundle = await build({
      stdin: { contents: `import React from 'react';import{createRoot}from'react-dom/client';import{SessionMfaGate}from'./src/components/auth/session-mfa-gate';createRoot(document.getElementById('root')).render(<SessionMfaGate initialState={{userId:null,authenticated:false,isAdmin:false,enrolled:false,required:false}}><form data-login-form><button>Ingresar</button></form></SessionMfaGate>);`, loader: "tsx", resolveDir: process.cwd() },
      jsx: "automatic", bundle: true, write: false, platform: "browser", format: "iife", define: { "process.env.NODE_ENV": '"production"' },
      plugins: [{ name: "boundaries", setup(b) {
        b.onResolve({ filter: /^(next-intl|@\/hooks\/use-auth|@\/lib\/supabase\/client|@\/components\/admin\/admin-mfa|@\/i18n\/navigation|@\/components\/landing\/landing-navbar)$/ }, a => ({ path: a.path, namespace: "mock" }));
        b.onLoad({ filter: /.*/, namespace: "mock" }, a => ({ resolveDir: process.cwd(), contents:
          a.path === "next-intl" ? `export const useTranslations=()=>key=>key;` :
          a.path.includes("use-auth") ? `export const useAuth=()=>({user:{id:'test'}});` :
          a.path.includes("supabase/client") ? `export const createClient=()=>({auth:{onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})}});` :
          a.path.includes("admin-mfa") ? `import React from 'react';export const AdminMfa=()=>React.createElement('main',{'data-mfa-challenge':''},'Verificación en dos pasos');` :
          a.path.includes("landing-navbar") ? `export const ContrataCRLogo=()=>null;` :
          `export const useRouter=()=>({refresh(){}});export const usePathname=()=>${JSON.stringify(path)};`
        }));
      } }],
    });
    await page.route("**/mfa-transition-harness", route => route.fulfill({ contentType: "text/html", body: '<!doctype html><meta name="viewport" content="width=device-width"><div id="root"></div>' }));
    let release!: () => void;
    const responseReady = new Promise<void>(resolve => { release = resolve; });
    await page.route("**/api/auth/session-mfa", async route => {
      await responseReady;
      await route.fulfill({ json: { userId: "test", authenticated: true, isAdmin: true, enrolled: true, required: true } });
    });
    await page.goto("/mfa-transition-harness");
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    if (path === "/login") {
      await expect(page.locator("[data-login-form]")).toBeVisible();
      await expect(page.locator("[data-login-form]").locator("..")).toHaveAttribute("inert", "");
      await expect(page.locator("[data-session-security-loading]")).toHaveCount(0);
    } else {
      await expect(page.locator("[data-session-security-loading]")).toBeVisible();
      await expect(page.locator("[data-login-form]")).toHaveCount(0);
      await expect(page.locator("[data-authentication-screen]")).toHaveCount(1);
    }
    await expect(page.locator(".ccr-page-route-loading")).toHaveCount(0);
    release();
    await expect(page.locator("[data-mfa-challenge]")).toBeVisible();
    await expect(page.locator("[data-login-form]")).not.toBeVisible();
    await expect(page.locator("[data-session-security-loading]")).toHaveCount(0);
    await expect(page.locator(".ccr-page-route-loading")).toHaveCount(0);
  });
}

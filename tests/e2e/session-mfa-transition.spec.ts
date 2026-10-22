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

for (const locale of ["es", "en"]) {
  test(`MFA stays centered while native navigation classes settle (${locale})`, async ({ page, isMobile }) => {
    // Use the real stylesheet, including the more specific native shell rules.
    await page.goto(locale === "en" ? "/en/login" : "/login", { waitUntil: "domcontentloaded" });
    const styles = await page.locator('link[rel="stylesheet"]').evaluateAll(links => links.map(link => (link as HTMLLinkElement).href));
    expect(styles.length).toBeGreaterThan(0);
    const bundle = await build({
      stdin: { contents: `import React from 'react';import{createRoot}from'react-dom/client';import{AdminMfa}from'./src/components/admin/admin-mfa';createRoot(document.getElementById('root')).render(<AdminMfa enrolled onVerified={async()=>{}}/>);`, loader: "tsx", resolveDir: process.cwd() },
      jsx: "automatic", bundle: true, write: false, platform: "browser", format: "iife", tsconfig: "tsconfig.json", define: { "process.env.NODE_ENV": '"production"' },
      plugins: [{ name: "mfa-transport", setup(builder) {
        builder.onResolve({ filter: /^(next-intl|@\/lib\/supabase\/client)$/ }, args => ({ path: args.path, namespace: "mfa-centering" }));
        builder.onLoad({ filter: /.*/, namespace: "mfa-centering" }, args => ({ contents: args.path === "next-intl" ? `export const useLocale=()=>${JSON.stringify(locale)};` : `export const createClient=()=>{throw Error('No authentication request expected')};` }));
      } }],
    });
    await page.route("**/mfa-centering-harness", route => route.fulfill({ contentType: "text/html", body: `<!doctype html><meta name="viewport" content="width=device-width"><html class="ccr-native-app"><head>${styles.map(href => `<link rel="stylesheet" href="${href}">`).join("")}</head><body class="ccr-native-app ccr-native-bottom-nav-visible"><div id="root"></div></body></html>` }));
    await page.goto("/mfa-centering-harness");
    if (isMobile) await page.evaluate(() => document.documentElement.style.setProperty("--app-visual-viewport-height", "300px"));
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    const screen = page.locator("[data-admin-mfa]");
    await expect(screen).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    if (isMobile) await expect(screen.locator("input")).not.toBeFocused();
    const before = await screen.locator("h1").boundingBox();
    expect(before).not.toBeNull();
    const samples = await page.evaluate(async () => {
      const title = document.querySelector('[data-admin-mfa] h1')!;
      const positions: number[] = [];
      for (let i = 0; i < 24; i++) {
        if (i === 1) document.documentElement.style.setProperty("--app-visual-viewport-height", "100dvh");
        if (i === 2) document.body.classList.remove("ccr-native-bottom-nav-visible");
        if (i === 10) document.body.classList.add("ccr-native-bottom-nav-visible");
        await new Promise(requestAnimationFrame);
        positions.push(title.getBoundingClientRect().top);
      }
      return positions;
    });
    expect(Math.max(...samples) - Math.min(...samples)).toBeLessThan(1);
    const geometry = await screen.evaluate(element => {
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      const content = element.firstElementChild!.getBoundingClientRect();
      return { top: box.top, left: box.left, height: box.height, width: box.width, paddingTop: style.paddingTop, paddingBottom: style.paddingBottom,
        centerX: content.left + content.width / 2, centerY: content.top + content.height / 2, transition: style.transitionDuration };
    });
    expect(geometry.top).toBe(0);
    expect(geometry.left).toBe(0);
    expect(geometry.paddingBottom).toBe(geometry.paddingTop);
    expect(geometry.transition).toBe("0s");
    expect(geometry.centerX).toBeCloseTo(geometry.width / 2, 0);
    expect(geometry.centerY).toBeCloseTo(geometry.height / 2, 0);
    if (isMobile) {
      await screen.locator("input").focus();
      await page.evaluate(() => document.documentElement.style.setProperty("--app-visual-viewport-height", "300px"));
      expect(await screen.evaluate(element => element.getBoundingClientRect().height)).toBe(300);
      await screen.locator("input").blur();
      await page.evaluate(() => document.documentElement.style.setProperty("--app-visual-viewport-height", "100dvh"));
    }
    await screen.screenshot({ path: test.info().outputPath(`mfa-stable-${locale}.png`) });
  });
}

for (const locale of ["es", "en"]) for (const administrator of [false, true]) {
 test(`account MFA keeps its layout while checking ${locale} admin=${administrator}`, async ({page}) => {
  await page.goto(locale === "en" ? "/en/login" : "/login",{waitUntil:"domcontentloaded"});
  const styles = await page.locator('link[rel="stylesheet"]').evaluateAll(links=>links.map(link=>(link as HTMLLinkElement).href));
  const bundle = await build({
   stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import{TwoFactorSecurity}from'./src/components/account/two-factor-security';createRoot(document.getElementById('root')).render(<TwoFactorSecurity/>);`,loader:"tsx",resolveDir:process.cwd()},
   jsx:"automatic",bundle:true,write:false,platform:"browser",format:"iife",tsconfig:"tsconfig.json",define:{"process.env.NODE_ENV":'"production"'},
   plugins:[{name:"account-mfa-boundaries",setup(builder){
    builder.onResolve({filter:/^(next-intl|@\/i18n\/navigation|@\/lib\/supabase\/client)$/},args=>({path:args.path,namespace:"account-mfa"}));
    builder.onLoad({filter:/.*/,namespace:"account-mfa"},args=>({contents:args.path==="next-intl"?`export const useLocale=()=>${JSON.stringify(locale)};`:args.path.includes("navigation")?`export const useRouter=()=>({refresh(){}});`:`export const createClient=()=>{throw Error('No auth mutation expected')};`}));
   }}],
  });
  let release!:()=>void;
  const pending = new Promise<void>(resolve=>{release=resolve;});
  await page.route("**/api/auth/session-mfa",async route=>{await pending;await route.fulfill({json:{isAdmin:administrator,enrolled:true}});});
  await page.route("**/account-mfa-harness",route=>route.fulfill({contentType:"text/html",body:`<!doctype html><meta name="viewport" content="width=device-width"><head>${styles.map(href=>`<link rel="stylesheet" href="${href}">`).join('')}</head><body><div style="max-width:420px;padding:24px" id="root"></div></body>`}));
  await page.goto("/account-mfa-harness");
  await page.addScriptTag({content:bundle.outputFiles[0].text});
  const section = page.locator("[data-account-mfa]");
  const title = section.locator("h3");
  await expect(title).toBeVisible();
  await page.evaluate(()=>document.fonts.ready);
  const before = await section.boundingBox();
  const heading = await title.boundingBox();
  release();
  await expect(section.getByText(locale==="en"?"Enabled":"Activada",{exact:true})).toBeVisible();
  const after = await section.boundingBox();
  expect(after!.height).toBeCloseTo(before!.height,0);
  expect((await title.boundingBox())!.y).toBeCloseTo(heading!.y,0);
  await expect(section).not.toContainText(/Obligatoria|Required for administrator/);
  const disable = section.getByRole("button",{name:locale==="en"?"Disable":"Desactivar",exact:true});
  if (administrator) { await expect(disable).toHaveCount(0); return; }
  await disable.click();
  await expect(section.locator("[data-admin-mfa]")).toBeVisible();
  await expect(section.getByRole("textbox")).toHaveAttribute("autoComplete","one-time-code");
  await section.getByRole("button",{name:locale==="en"?"Cancel":"Cancelar",exact:true}).click();
  await expect(section.locator("[data-admin-mfa]")).toHaveCount(0);
 });
}

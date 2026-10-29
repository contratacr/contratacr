import { test, expect } from "playwright/test";
import { NextResponse } from "next/server";
import { gotoOK, waitForInteractivePage, loginAs } from "./helpers";
import { canRunSeededRegression, regressionAdminClient } from "./seed";
import { createDisposableAccount, cleanupDisposableAccount } from "./disposable-account";
import { OPTIONAL_CONSENT_VERSION } from "../../src/lib/privacy/optional-consent";
import { LEGAL_VERSION } from "../../src/lib/privacy/legal-version";

for (const locale of ["es","en"]) test(`legal documents: ${locale} identifies the actual operator and explains the current verification`,async({page})=>{
 const prefix=locale==="en"?"/en":"";
 await gotoOK(page,`${prefix}/terminos`);
 await expect(page.locator("main")).toContainText("Isaac Alberto Sanchez Monge");
 await expect(page.locator("main")).toContainText("Barrio Mercedes, Atenas, Alajuela");
 await expect(page.locator("main")).toContainText("Hacienda");
 await expect(page.locator("main")).not.toContainText(/padrón electoral|electoral roll|foto de un trabajo suyo/);
 await gotoOK(page,`${prefix}/privacidad`);
 await expect(page.locator("main")).toContainText("Zoho Mail");
 await expect(page.locator("main")).toContainText(locale==="es"?"cinco días hábiles":"five business days");
 await expect(page.locator("main")).toContainText("PRODHAB");
 await expect(page.locator("main")).toContainText(locale === "es" ? "no equivale a estadísticas anónimas" : "it is not anonymous statistics");
 await expect(page.locator("main")).toContainText(locale === "es" ? "se reintenta al reconectar" : "retry on reconnection");
});

test("privacy provides a permanent way to change optional choices",async({page})=>{
 await gotoOK(page,"/privacidad");await waitForInteractivePage(page);
 await expect(page.locator('main [data-advertising-preferences] button')).toBeVisible();
 await page.locator('main [data-advertising-preferences] button').click();
 await expect(page.getByRole('dialog',{name:'Cookies y privacidad'})).toBeVisible();
 await expect(page.locator('[data-ai-consent]')).toHaveCount(0);
});

test("native local answers require no external AI permission",async({request})=>{
 const response=await request.post("/api/ai-assistant",{data:{platform:"native",locale:"es",message:"Olvidé mi contraseña"}});
 expect(response.status()).toBe(200);
 expect((await response.json()).aiProvider).toBe("local");
});

for (const native of [false, true]) test(`${native ? "native" : "web"}: login never adds a second terms screen; explicit receipts remain isolated and idempotent`,async({page,context,baseURL})=>{
 test.skip(!canRunSeededRegression(),"Requires isolated TEST database");
 if(native) {
  await context.addCookies([{name:"ccr_platform",value:"native",url:baseURL!}]);
  await page.addInitScript(()=>localStorage.setItem("ccr:native-first-run-onboarding:v12","1"));
 }
 const account=await createDisposableAccount({prefix:"legal-consent"});
 const other=await createDisposableAccount({prefix:"legal-consent-other"});
 const admin=regressionAdminClient();
 try {
  await loginAs(page,account.email,account.password);
  const gate=page.locator('[data-legal-acceptance]');
  await expect(gate).toHaveCount(0);
  await expect(page.getByRole("heading",{name:"Términos y privacidad",exact:true})).toHaveCount(0);
  let result=await page.request.get("/api/privacy/choices");expect(result.status()).toBe(200);
  const state=await result.json();expect(state.choices.terms).toBeUndefined();expect(state.choices.marketing).toBeUndefined();
  for(let n=0;n<2;n++){
   result=await page.request.post("/api/privacy/choices",{data:{purpose:"terms",accepted:true,version:LEGAL_VERSION,locale:"es",channel:"web"}});expect(result.status()).toBe(200);
  }
  const receipts=await admin.from("privacy_choices").select("id").eq("user_id",account.id).eq("purpose","terms");expect(receipts.error).toBeNull();expect(receipts.data).toHaveLength(1);
  await page.reload();await expect(gate).toHaveCount(0);
  await loginAs(page,other.email,other.password);
  await expect(gate).toHaveCount(0);
  result=await page.request.get("/api/privacy/choices");expect((await result.json()).choices).toEqual({});
 } finally {await cleanupDisposableAccount(account);await cleanupDisposableAccount(other);}
});

test("native assistant sends a prompt without an extra permission step",async({page,context,baseURL})=>{
 await page.setViewportSize({width:390,height:844});
 await context.addCookies([{name:"ccr_platform",value:"native",url:baseURL!}]);
 await page.addInitScript(()=>{
  localStorage.setItem("ccr:native-first-run-onboarding:v12","1");
  const runtime:Record<string,unknown>={isNativePlatform:()=>true};
  Object.defineProperty(window,"Capacitor",{configurable:true,get:()=>runtime,set:value=>{if(value&&typeof value==="object")Object.assign(runtime,value);runtime.isNativePlatform=()=>true;}});
 });
 let requests=0;let consent:unknown;
 await page.route("**/api/ai-assistant",async route=>{requests++;consent=route.request().postDataJSON().aiConsent;await route.fulfill({json:{answer:"Respuesta de prueba",action:"answer"}});});
 await gotoOK(page,"/");await waitForInteractivePage(page);
 await page.getByRole("button",{name:/Abrir men[uú]|Open menu/i}).filter({visible:true}).first().click();
 await page.getByRole("dialog",{name:/Men[uú]|Menu/i}).getByRole("button",{name:"Asistente",exact:true}).click();
 const assistant=page.getByRole("dialog",{name:"Asistente ContrataCR"});
 await expect(assistant.locator("[data-ai-consent]")).toHaveCount(0);
 await assistant.getByRole("textbox").fill("Necesito electricidad");
 await assistant.getByRole("button",{name:"Enviar mensaje",exact:true}).click();
 await expect(assistant).toContainText("Respuesta de prueba");
 expect(requests).toBe(1);expect(consent).toBeUndefined();
});

for(const locale of ["es","en"]) test(`login keeps the existing legal disclosure before continuing (${locale})`,async({page})=>{
 await gotoOK(page,locale === "en" ? "/en/login" : "/login");
 const main=page.locator("main");
 await expect(main).toContainText(locale === "en" ? "Consult our" : "Consulta nuestros");
 await expect(main.getByRole("link",{name:locale === "en" ? "Terms" : "Términos",exact:true})).toHaveAttribute("href",/terminos/);
 await expect(main.getByRole("link",{name:locale === "en" ? "Privacy Policy" : "Política de Privacidad",exact:true})).toHaveAttribute("href",/privacidad/);
});

for (const native of [false, true]) test(`${native ? "native" : "web"}: optional consent notice never implies acceptance of terms on entry`, async ({ page, context, baseURL }) => {
 await page.addInitScript(()=>{ localStorage.removeItem("contratacr:consent:analytics:v1"); localStorage.removeItem("contratacr:consent:advertising:v1"); });
 if(native) {
  await context.addCookies([{name:"ccr_platform",value:"native",url:baseURL!}]);
  await page.addInitScript(()=>localStorage.setItem("ccr:native-first-run-onboarding:v12","1"));
 }
 const trackingRequests: string[] = [];
 page.on("request", request => { if (/connect\.facebook\.net|www\.facebook\.com\/tr/.test(request.url())) trackingRequests.push(request.url()); });
 for(const route of ["/profesionales", "/login", "/registro/cliente"]) {
  await gotoOK(page,route);await waitForInteractivePage(page);
  await expect(page.locator("[data-legal-acceptance]")).toHaveCount(0);
  await expect(page.locator("[data-cookie-banner]")).toBeVisible();
  expect((await context.cookies()).find(cookie=>cookie.name==="ccr_ads_consent_v2")?.value).not.toBe("accepted");
 }
 expect(trackingRequests).toEqual([]);
 expect(await page.evaluate(()=>localStorage.getItem("contratacr:consent:advertising:v1"))).toBeNull();
});

// Withdrawal is a same-origin operation, never an acceptance inferred from login.
test("advertising withdrawal rejects cross-origin and invalid choices", async () => {
 const { readFileSync } = await import("node:fs");
 const { runInNewContext } = await import("node:vm");
 const ts = await import("typescript");
 const code = ts.transpileModule(readFileSync("src/app/api/privacy/advertising/route.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
 const box = {exports:{} as {POST:(req:Request)=>Promise<Response>}};
 const mocks:Record<string,unknown> = {"next/server":{NextResponse},"@/lib/rate-limit":{enforceRateLimit:()=>null},"@/lib/privacy/optional-consent":{OPTIONAL_CONSENT_VERSION},"node:crypto":{},"@/lib/supabase/server":{},"@/lib/supabase/admin":{},"@/lib/supabase/get-user":{}};
 runInNewContext(code,{module:box,exports:box.exports,require:(name:string)=>mocks[name],URL});
 const { POST } = box.exports;
 const url = "https://contratacr.com/api/privacy/advertising";
 const post = (origin:string, data:unknown) => POST(new Request(url,{method:"POST",headers:{origin,"content-type":"application/json"},body:JSON.stringify(data)}));
 const valid = { accepted: false, version: OPTIONAL_CONSENT_VERSION };
 expect((await post("https://untrusted.invalid",valid)).status).toBe(403);
 for (const data of [{ accepted: true, version: OPTIONAL_CONSENT_VERSION }, { accepted: false, version: "old" }, {}]) {
  const response = await post("https://contratacr.com",data);
  expect(response.status).toBe(400);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
 }
});

test("offline guest advertising withdrawal retries on reconnect without a popup", async ({page}) => {
 let available = false;
 let withdrawals = 0;
 await page.route("**/api/privacy/advertising", async route => {
  withdrawals++;
  await route.fulfill({status:available ? 200 : 503,json:available ? {ok:true} : {error:"offline"}});
 });
 await page.addInitScript(() => {
  if (!sessionStorage.getItem("withdrawal-test-seeded")) {
   localStorage.setItem("contratacr:advertising-withdrawal-pending","1");
   localStorage.setItem("contratacr:consent:advertising:v1",JSON.stringify({choice:"declined",version:"2026-10-19",at:new Date().toISOString()}));
   sessionStorage.setItem("withdrawal-test-seeded","1");
  }
 });
 await gotoOK(page,"/privacidad");
 await expect.poll(()=>withdrawals).toBe(1);
 await expect(page.locator("main [data-advertising-preferences] button")).toBeVisible();
 await expect(page.getByRole("dialog")).toHaveCount(0);
 await page.reload();
 await expect.poll(()=>withdrawals).toBe(2);
 available = true;
 await page.evaluate(()=>window.dispatchEvent(new Event("online")));
 await expect.poll(()=>withdrawals).toBe(3);
 await expect.poll(()=>page.evaluate(()=>localStorage.getItem("contratacr:advertising-withdrawal-pending"))).toBeNull();
 await expect(page.locator("main [data-advertising-preferences] button")).toBeVisible();
 await expect(page.getByRole("dialog")).toHaveCount(0);
});

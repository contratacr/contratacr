import { test, expect } from "playwright/test";
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
 await expect(page.locator("main")).toContainText(locale === "es" ? "reintentamos la solicitud" : "we retry");
});

test("limited advertising can be disabled and enabled without blocking legal pages",async({page,context})=>{
 await gotoOK(page,"/privacidad");await waitForInteractivePage(page);
 const controls=page.locator('[data-advertising-preferences]');
 await expect(controls).toHaveCount(1);
 await expect(controls).toBeVisible();await controls.getByRole("button",{name:"Desactivar",exact:true}).click();
 await expect(controls).toContainText("desactivada");
 expect((await context.cookies()).find(cookie=>cookie.name==="ccr_ads_consent_v1")?.value).toBe("declined");
 await controls.getByRole("button",{name:"Activar",exact:true}).click();
 await expect(controls).toContainText("Medición publicitaria activada en este dispositivo.");
 await expect.poll(async () => (await context.cookies()).find(cookie=>cookie.name==="ccr_ads_consent_v1")?.value).toBe("accepted");
 await controls.getByRole("button",{name:"Desactivar",exact:true}).click();
 await page.reload();await expect(page.locator('[data-advertising-preferences]')).toHaveCount(1);
});

test("the AI API rejects missing or outdated consent before processing a native prompt",async({request})=>{
 for(const aiConsent of [undefined,{accepted:false,version:LEGAL_VERSION},{accepted:true,version:"old"}]){
  const response=await request.post("/api/ai-assistant",{data:{platform:"native",locale:"es",message:"Consulta de prueba",aiConsent}});
  expect(response.status()).toBe(428);expect((await response.json()).code).toBe("AI_CONSENT_REQUIRED");
 }
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

test("native assistant asks permission before sending the first prompt",async({page,context,baseURL})=>{
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
 await expect(assistant.locator("[data-ai-consent]")).toBeVisible();
 await assistant.getByRole("textbox").fill("Necesito electricidad");
 await assistant.getByRole("button",{name:"Enviar mensaje",exact:true}).click();
 expect(requests).toBe(0);
 await assistant.getByRole("button",{name:"Permitir y continuar",exact:true}).click();
 await expect(assistant).toContainText("Respuesta de prueba");
 expect(requests).toBe(1);expect(consent).toEqual({version:LEGAL_VERSION,accepted:true});
});

for(const locale of ["es","en"]) test(`login keeps the existing legal disclosure before continuing (${locale})`,async({page})=>{
 await gotoOK(page,locale === "en" ? "/en/login" : "/login");
 const main=page.locator("main");
 await expect(main).toContainText(locale === "en" ? "By continuing, you accept" : "Al continuar, aceptas");
 await expect(main.getByRole("link",{name:locale === "en" ? "Terms" : "Términos",exact:true})).toHaveAttribute("href",/terminos/);
 await expect(main.getByRole("link",{name:locale === "en" ? "Privacy Policy" : "Política de Privacidad",exact:true})).toHaveAttribute("href",/privacidad/);
});

for (const native of [false, true]) test(`${native ? "native" : "web"}: no automatic advertising or terms notice on entry`, async ({ page, context, baseURL }) => {
 if(native) {
  await context.addCookies([{name:"ccr_platform",value:"native",url:baseURL!}]);
  await page.addInitScript(()=>localStorage.setItem("ccr:native-first-run-onboarding:v12","1"));
 }
 const trackingRequests: string[] = [];
 page.on("request", request => { if (/connect\.facebook\.net|www\.facebook\.com\/tr/.test(request.url())) trackingRequests.push(request.url()); });
 for(const route of ["/profesionales", "/login", "/registro/cliente"]) {
  await gotoOK(page,route);await waitForInteractivePage(page);
  await expect(page.locator("[data-advertising-preferences], [data-legal-acceptance]")).toHaveCount(0);
  expect((await context.cookies()).find(cookie=>cookie.name==="ccr_ads_consent_v1")?.value).not.toBe("accepted");
 }
 expect(trackingRequests).toEqual([]);
 expect(await page.evaluate(()=>localStorage.getItem("contratacr:consent:advertising:v1"))).toBeNull();
});

// Withdrawal is a same-origin operation, never an acceptance inferred from login.
test("advertising withdrawal rejects cross-origin and invalid choices", async ({ request, baseURL }) => {
 const url = new URL("/api/privacy/advertising", baseURL!).toString();
 const valid = { accepted: false, version: OPTIONAL_CONSENT_VERSION };
 expect((await request.post(url, { headers: { origin: "https://untrusted.invalid" }, data: valid })).status()).toBe(403);
 for (const data of [{ accepted: true, version: OPTIONAL_CONSENT_VERSION }, { accepted: false, version: "old" }, {}]) {
  const response = await request.post(url, { headers: { origin: new URL(url).origin }, data });
  expect(response.status()).toBe(400);
  expect(response.headers()["cache-control"]).toBe("private, no-store");
 }
});


test("offline guest advertising withdrawal retries on reconnect without a popup", async ({page}) => {
 let available = false;
 let withdrawals = 0;
 await page.route("**/api/privacy/advertising", async route => {
  withdrawals++;
  await route.fulfill({status:available ? 200 : 503,json:available ? {ok:true} : {error:"offline"}});
 });
 await gotoOK(page,"/privacidad");
 const controls = page.locator("[data-advertising-preferences]");
 await controls.getByRole("button",{name:"Desactivar",exact:true}).click();
 await expect.poll(()=>withdrawals).toBe(1);
 await expect(controls).toContainText("desactivada");
 await page.reload();
 await expect.poll(()=>withdrawals).toBe(2);
 await expect(page.locator("[data-advertising-preferences]")).toContainText("desactivada");
 available = true;
 await page.evaluate(()=>window.dispatchEvent(new Event("online")));
 await expect.poll(()=>withdrawals).toBe(3);
 await expect.poll(()=>page.evaluate(()=>localStorage.getItem("contratacr:advertising-withdrawal-pending"))).toBeNull();
 await expect(page.locator("[data-advertising-preferences]")).toContainText("desactivada");
 await expect(page.getByRole("dialog")).toHaveCount(0);
});

import { test, expect } from "playwright/test";
import { gotoOK, waitForInteractivePage, loginAs } from "./helpers";
import { canRunSeededRegression, regressionAdminClient } from "./seed";
import { createDisposableAccount, cleanupDisposableAccount } from "./disposable-account";
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
});

test("advertising starts off; rejecting and later changing the choice works without blocking legal pages",async({page,context})=>{
 await gotoOK(page,"/privacidad");await waitForInteractivePage(page);
 const notice=page.locator('[data-advertising-preferences]').first();
 await expect(notice).toBeVisible();await notice.getByRole("button",{name:"Rechazar",exact:true}).click();
 const controls=page.locator('[data-advertising-preferences]').last();
 await expect(controls).toContainText("desactivada");
 expect((await context.cookies()).find(cookie=>cookie.name==="ccr_ads_consent_v1")?.value).toBe("declined");
 await controls.getByRole("button",{name:"Aceptar",exact:true}).click();
 await expect(controls).toContainText("activada");
 expect((await context.cookies()).find(cookie=>cookie.name==="ccr_ads_consent_v1")?.value).toBe("accepted");
 await controls.getByRole("button",{name:"Rechazar",exact:true}).click();
 await page.reload();await expect(page.locator('[data-advertising-preferences]')).toHaveCount(1);
});

test("the AI API rejects missing or outdated consent before processing a native prompt",async({request})=>{
 for(const aiConsent of [undefined,{accepted:false,version:LEGAL_VERSION},{accepted:true,version:"old"}]){
  const response=await request.post("/api/ai-assistant",{data:{platform:"native",locale:"es",message:"Consulta de prueba",aiConsent}});
  expect(response.status()).toBe(428);expect((await response.json()).code).toBe("AI_CONSENT_REQUIRED");
 }
});

test("account acceptance is recorded once, separate from marketing, and cannot be read by another account",async({page})=>{
 test.skip(!canRunSeededRegression(),"Requires isolated TEST database");
 const account=await createDisposableAccount({prefix:"legal-consent"});
 const other=await createDisposableAccount({prefix:"legal-consent-other"});
 const admin=regressionAdminClient();
 try {
  await loginAs(page,account.email,account.password,{legalAcceptance:false});
  const gate=page.locator('[data-legal-acceptance]');await expect(gate).toBeVisible();
  await expect(gate.getByRole("button",{name:"Aceptar y continuar"})).toBeDisabled();
  await gate.getByRole("checkbox").focus();await gate.getByRole("checkbox").press("Space");await gate.getByRole("button",{name:"Aceptar y continuar"}).click();
  await expect(gate).toHaveCount(0);
  let result=await page.request.get("/api/privacy/choices");expect(result.status()).toBe(200);
  const state=await result.json();expect(state.requiresAcceptance).toBe(false);expect(state.choices.marketing).toBeUndefined();
  for(let n=0;n<2;n++){
   result=await page.request.post("/api/privacy/choices",{data:{purpose:"terms",accepted:true,version:LEGAL_VERSION,locale:"es",channel:"web"}});expect(result.status()).toBe(200);
  }
  const receipts=await admin.from("privacy_choices").select("id").eq("user_id",account.id).eq("purpose","terms");expect(receipts.error).toBeNull();expect(receipts.data).toHaveLength(1);
  await page.reload();await expect(gate).toHaveCount(0);
  await loginAs(page,other.email,other.password,{legalAcceptance:false});
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

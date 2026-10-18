import { createDisposableAccount, cleanupDisposableAccount } from "./disposable-account";
import { test, expect } from "playwright/test";
import { E2E_USERS, canRunSeededRegression, ensureRegressionSeed, regressionAdminClient } from "./seed";
import { sinPrefijoDeIdioma } from "../../src/lib/prefijo-de-idioma";
import { loginAs } from "./helpers";

for (const locale of ["es", "en"] as const) test(`native assistant ${locale} keeps badges beside names and restores the chat after profile/search navigation`, async ({ page, baseURL }) => {
  test.skip(!canRunSeededRegression(), "Requires the isolated local regression account");
  test.setTimeout(120000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.context().addCookies([{ name: "ccr_platform", value: "native", url: baseURL! }]);
  await page.addInitScript(() => {
    localStorage.setItem("ccr:native-first-run-onboarding:v12", "1");
    const nativeRuntime: Record<string, unknown> = { isNativePlatform: () => true };
    Object.defineProperty(window, "Capacitor", {
      configurable: true, get: () => nativeRuntime,
      set: value => { if (value && typeof value === "object") Object.assign(nativeRuntime, value); nativeRuntime.isNativePlatform = () => true; },
    });
  });
  const pageErrors: string[] = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  const prefix = locale === "en" ? "/en" : "";
  const slug = E2E_USERS.professional.slug;
  const profileHref = `${prefix}/profesionales/${slug}`;
  const origin = `${prefix}/?assistantNavigationTest=1`;
  await page.route("**/api/ai-assistant", route => route.fulfill({ json: {
    answer: "Encontré 18 profesionales de Electricidad en Atenas.", action: "search_professionals",
    searchHref: `${prefix}/profesionales?categoria=electricidad`, ctaLabel: "Ver 18 profesionales",
    professionals: [{ id: "00000000-0000-4000-8000-000000000001", name: "Profesional de prueba", avatarUrl: null, service: "Electricidad", location: "Atenas", verified: true, rating: null, reviewCount: 0, price: null, profileHref, actionHref: profileHref, requestHref: profileHref, actionLabel: "WhatsApp" }],
  } }));
  await page.goto(origin);
  await page.getByRole("button", { name: /Abrir men[uú]|Open menu/i }).filter({ visible: true }).first().click();
  await page.getByRole("dialog", { name: /Men[uú]|Menu/i }).getByRole("button", { name: locale === "es" ? "Asistente" : "Assistant", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: locale === "es" ? "Asistente ContrataCR" : "ContrataCR Assistant" });
  await dialog.getByRole("textbox").fill("Busco electricista en Atenas");
  await dialog.getByRole("button", { name: locale === "es" ? "Enviar mensaje" : "Send message", exact: true }).click();
  const badge = dialog.locator("[data-verification-badge]");
  await expect(badge).toBeVisible();
  const name = await dialog.getByRole("button", { name: "Profesional de prueba", exact: true }).boundingBox();
  const mark = await badge.boundingBox();
  expect(mark!.x - (name!.x + name!.width)).toBeLessThan(12);
  expect(Math.abs(mark!.y + mark!.height / 2 - name!.y - name!.height / 2)).toBeLessThan(4);
  await badge.click();
  const verification = page.getByRole("dialog", { name: locale === "es" ? "Identidad verificada" : "Identity verified", exact: true });
  await expect(verification).toContainText(locale === "es" ? "Verificamos los datos de identificación de esta cuenta." : "We checked this account’s identification details.");
  await expect(verification).not.toContainText(/Hacienda|biométric|biometric|revisión manual|manual review/);
  await page.getByRole("button", { name: locale === "es" ? "Entendido" : "Got it", exact: true }).click();
  await page.screenshot({ path: test.info().outputPath(`assistant-${locale}-verified-name.png`) });
  await dialog.getByRole("button", { name: locale === "es" ? "Ver perfil" : "View profile", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1 }).filter({ visible: true }).first()).toBeVisible();
  await expect(page.locator("[data-ccr-section-title]").filter({ visible: true })).toContainText(locale === "es" ? "Volver al asistente" : "Back to assistant");
  await page.locator("[data-ccr-section-back]").filter({ visible: true }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Encontré 18 profesionales de Electricidad en Atenas.")).toBeVisible();
  await dialog.getByRole("button", { name: "Ver 18 profesionales", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(/profesionales/);
  await page.goBack();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Ver 18 profesionales", exact: true })).toBeVisible();
  expect(pageErrors.filter(message => /hydration|hydrating|server rendered/i.test(message))).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await page.goForward();
  await expect(page).toHaveURL(/profesionales/);
  await page.goBack();
  await expect(dialog).toHaveCount(0);
});

for (const existing of [false, true]) test(`signed-in assistant Message opens ${existing ? "an existing conversation" : "a new draft"} and back restores the assistant`, async ({ page, baseURL }) => {
  test.skip(!canRunSeededRegression(), "Requires the isolated local regression account");
  test.setTimeout(120000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.context().addCookies([{ name: "ccr_platform", value: "native", url: baseURL! }]);
  await page.addInitScript(() => {
    localStorage.setItem("ccr:native-first-run-onboarding:v12", "1");
    const nativeRuntime: Record<string, unknown> = { isNativePlatform: () => true };
    Object.defineProperty(window, "Capacitor", {
      configurable: true, get: () => nativeRuntime,
      set: value => { if (value && typeof value === "object") Object.assign(nativeRuntime, value); nativeRuntime.isNativePlatform = () => true; },
    });
  });
  const seed = await ensureRegressionSeed();
  const client = await createDisposableAccount({ prefix: "assistant-chat-return" });
  try {
    let conversationId: string | undefined;
    if (existing) {
      const { data, error } = await regressionAdminClient().from("direct_conversations").insert({
        client_id: client.id, professional_id: seed.professionalId, professional_profile_id: seed.professionalUserId,
        last_message: "Conversación de prueba", last_message_at: new Date().toISOString(),
      }).select("id").single();
      expect(error).toBeNull();
      conversationId = data?.id;
    }
    await loginAs(page, client.email, client.password);
    await page.route("**/api/ai-assistant", route => route.fulfill({ json: { answer: "Resultado para tu búsqueda", professionals: [{ id: seed.professionalId, name: "Profesional de prueba", avatarUrl: null, service: "Electricidad", location: "Atenas", verified: true, rating: null, reviewCount: 0, price: null, profileHref: "/profesionales/prueba", actionHref: "/profesionales/prueba", requestHref: "/profesionales/prueba", actionLabel: "WhatsApp" }] } }));
    await page.goto("/?assistantNavigationTest=message");
    await page.getByRole("button", { name: /Abrir men[uú]/i }).filter({ visible: true }).first().click();
    await page.getByRole("dialog", { name: /Men[uú]/i }).getByRole("button", { name: "Asistente", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Asistente ContrataCR" });
    await dialog.getByRole("textbox").fill("Busco electricista");
    await dialog.getByRole("button", { name: "Enviar mensaje", exact: true }).click();
    await dialog.getByRole("button", { name: "Mensaje", exact: true }).click();
    if (existing) await expect(page).toHaveURL(new RegExp(`/mensajes\\?.*conversation=${conversationId}`));
    else await expect(page).toHaveURL(/\/mensajes\?.*draftChat=1/);
    await expect(dialog).toHaveCount(0);
    await expect(page.locator(".ccr-direct-chat-composer")).toBeVisible();
    expect(new URL(page.url()).searchParams.get("back")).toBe("/?assistantNavigationTest=message");
    await page.goBack();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("Resultado para tu búsqueda")).toBeVisible();
  } finally { await cleanupDisposableAccount(client); }
});

test("assistant return routes preserve root queries and hash in both languages", () => {
  for (const path of ["/?tab=perfil", "/en?tab=perfil", "/en/?tab=perfil", "/es?tab=perfil"]) expect(sinPrefijoDeIdioma(path)).toBe("/?tab=perfil");
  expect(sinPrefijoDeIdioma("/en#asistente")).toBe("/#asistente");
  expect(sinPrefijoDeIdioma("/en/mensajes?draftChat=1")).toBe("/mensajes?draftChat=1");
});

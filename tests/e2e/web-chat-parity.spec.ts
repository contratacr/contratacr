import { test, expect } from "playwright/test";
import { createDisposableAccount, cleanupDisposableAccount, type DisposableAccount } from "./disposable-account";
import { loginAs, gotoOK, waitForInteractivePage } from "./helpers";

test("web shows the shared inbox and enforces message moderation without a native cookie", async ({ page }) => {
  test.setTimeout(120_000);
  let account: DisposableAccount | undefined;
  try {
    account = await createDisposableAccount({ prefix: "web-chat" });
    await loginAs(page, account.email, account.password);
    await gotoOK(page, "/mensajes");
    await expect(page.locator("[data-messages-page-shell]")).toBeVisible();
    await expect(page.getByText(/Los mensajes están en la app|Mensajes solo en la app/i)).toHaveCount(0);
    // The policy applies before conversation creation, equally in web and native.
    const response = await page.request.post("/api/direct-chat", { data: { message: "te voy a matar" } });
    expect(response.status()).toBe(422);
  } finally { if (account) await cleanupDisposableAccount(account); }
});

test("mobile drawer groups social links above plain white account controls", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await gotoOK(page, "/");
  await waitForInteractivePage(page);
  await page.getByRole("button", { name: /abrir menú/i }).filter({ visible: true }).click();
  const footer = page.locator("[data-mobile-menu-footer]");
  await expect(footer).toBeVisible();
  const social = footer.getByTestId("mobile-menu-social-links");
  await expect(social.getByRole("link")).toHaveCount(3);
  await expect(footer.getByRole("button", { name: "English" })).toBeVisible();
  const geometry = await footer.evaluate(element => {
    const nav = element.querySelector("nav")!;
    const button = element.querySelector("button")!;
    return { background: getComputedStyle(element).backgroundColor, socialBottom: nav.getBoundingClientRect().bottom, actionTop: button.getBoundingClientRect().top, overflow: element.scrollWidth > element.clientWidth };
  });
  expect(geometry.background).toBe("rgb(255, 255, 255)");
  expect(geometry.actionTop).toBeGreaterThanOrEqual(geometry.socialBottom);
  expect(geometry.overflow).toBe(false);
  await footer.screenshot({ path: test.info().outputPath("menu-compacto-blanco.png") });
});

test("web and native resume the same conversation for the same account", async ({ page, context, baseURL }) => {
  test.setTimeout(120_000);
  const { regressionAdminClient } = await import("./seed");
  let client: DisposableAccount | undefined;
  let professional: DisposableAccount | undefined;
  try {
    client = await createDisposableAccount({ prefix: "chat-web-sender" });
    professional = await createDisposableAccount({ prefix: "chat-web-recipient", professional: true });
    await regressionAdminClient().from("professionals").update({ whatsapp: "" }).eq("id", professional.professionalId!).throwOnError();
    await loginAs(page, client.email, client.password);
    const first = await page.request.post("/api/direct-chat", { data: { professionalId: professional.professionalId, message: "Hola, quisiera información del servicio." } });
    expect(first.status()).toBe(200);
    const { conversationId } = await first.json();
    expect(conversationId).toBeTruthy();
    await context.addCookies([{ name: "ccr_platform", value: "native", url: baseURL! }]);
    const second = await page.request.post("/api/direct-chat", { data: { professionalId: professional.professionalId, message: "Este seguimiento llega desde la misma cuenta." } });
    expect(second.status()).toBe(200);
    expect((await second.json()).conversationId).toBe(conversationId);
    await context.clearCookies({ name: "ccr_platform" });
    const thread = await page.request.get(`/api/direct-chat?id=${conversationId}`);
    expect(thread.status()).toBe(200);
    const data = await thread.json();
    expect(data.messages).toHaveLength(2);
    await gotoOK(page, `/mensajes?conversation=${conversationId}`);
    await expect(page.getByRole("paragraph").filter({ hasText: /^Este seguimiento llega desde la misma cuenta\.$/ })).toBeVisible();
    if (test.info().project.name === "chromium-desktop") {
      const header = page.locator(".ccr-direct-chat-thread-header");
      await expect(header.getByRole("button", { name: /^(Archivar|Desarchivar)$/ })).toHaveCount(0);
      const row = page.locator(".ccr-desktop-conversation-row").filter({ has: page.getByRole("button", { name: /Más:/ }) }).first();
      const trigger = row.getByRole("button", { name: /Más:/ });
      await trigger.click();
      const menu = page.getByRole("menu");
      await expect(menu).toBeVisible();
      await expect(menu.getByRole("menuitem", { name: "Archivar", exact: true })).toBeVisible();
      const box = await menu.boundingBox();
      const anchor = await trigger.boundingBox();
      expect(Math.abs(box!.y - anchor!.y)).toBeLessThan(100);
      await page.screenshot({ path: test.info().outputPath("mensajes-pc-menu.png") });
      await page.keyboard.press("Escape");
      await expect(menu).toHaveCount(0);
      await expect(trigger).toBeFocused();
      await page.screenshot({ path: test.info().outputPath("mensajes-pc-limpio.png") });
      await trigger.click();
      await header.click();
      await expect(menu).toHaveCount(0);
      await trigger.click();
      page.once("dialog", dialog => { void dialog.dismiss(); });
      await menu.getByRole("menuitem", { name: "Eliminar", exact: true }).click();
      await expect(row).toBeVisible();
      await trigger.click();
      await menu.getByRole("menuitem", { name: "Archivar", exact: true }).click();
      await expect(row).toHaveCount(0);
    }

  } finally {
    if (client) await cleanupDisposableAccount(client);
    if (professional) await cleanupDisposableAccount(professional);
  }
});

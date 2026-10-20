import { expect, test, type Route } from "playwright/test";
import { loginAs } from "./helpers";
import { canRunSeededRegression, E2E_USERS, ensureRegressionSeed } from "./seed";

for (const obsoleteResult of ["success", "error"] as const) {
test(`@seeded mensajes: respuesta atrasada (${obsoleteResult}) conserva lista y borrador`, async ({ page, context, baseURL, isMobile }) => {
  test.skip(!isMobile, "Native chat regression runs at phone sizes.");
  test.skip(!canRunSeededRegression(), "Requires isolated regression credentials.");
  const seed = await ensureRegressionSeed();
  await loginAs(page, E2E_USERS.client.email, E2E_USERS.client.password);
  await context.addCookies([{ name: "ccr_platform", value: "native", url: baseURL! }]);
  const older = {
    id: "b6000000-0000-4000-8000-000000000011", client_id: seed.clientId,
    professional_profile_id: seed.professionalUserId, status: "open",
    professionals: { profiles: { full_name: "Terapia de prueba" } },
    last_message: "Hola", last_message_at: "2026-10-13T12:00:00Z",
  };
  const newer = { ...older, id: "b6000000-0000-4000-8000-000000000012", professionals: { profiles: { full_name: "Profesional nuevo" } } };
  await page.addInitScript(({ userId, older, newer }) => {
    localStorage.setItem("ccr:native-first-run-onboarding:v12", "1");
    sessionStorage.setItem("ccr:direct-chat:conversations", JSON.stringify({ fetchedAt: Date.now(), rows: [older] }));
    localStorage.setItem(`ccr:chat:drafts:${userId}`, JSON.stringify({ [newer.id]: "Hola, te escribo por fisioterapia." }));
    sessionStorage.setItem(`ccr:dashboard-cache:chat:conversations:${userId}:open`, JSON.stringify({ version: 1, updatedAt: Date.now(), data: [older] }));
  }, { userId: seed.clientId, older, newer });
  let delayed: Route | undefined;
  let delayNext = false;
  let writes = 0;
  await page.route("**/api/direct-chat**", async (route) => {
    if (route.request().method() !== "GET") { writes++; await route.fulfill({ json: {} }); return; }
    const url = new URL(route.request().url());
    if (url.searchParams.has("id")) { await route.fulfill({ json: { messages: [] } }); return; }
    if (url.searchParams.has("status")) { await route.fulfill({ json: { conversations: [] } }); return; }
    if (url.search) { await route.fulfill({ json: { unread: 0, conversations: [] } }); return; }
    if (delayNext) { delayNext = false; delayed = route; return; }
    await route.fulfill({ json: { conversations: [newer, older] } });
  });
  await page.goto("/mensajes");
  // Desktop and touch layouts share the row content, but only one is visible.
  // Target the touch row rather than matching its hidden desktop counterpart.
  const row = page.locator(".ccr-direct-chat-list .ccr-fila-chat").filter({ hasText: "Profesional nuevo" });
  await expect(row).toHaveCount(1);
  await expect(row.getByText("Profesional nuevo", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /^Archivados/ }).click();
  await expect(page.getByText(/No hay conversaciones archivadas/)).toBeVisible();
  delayNext = true;
  await page.getByRole("button", { name: /Volver|Atrás/ }).filter({ visible: true }).first().click();
  await expect.poll(() => Boolean(delayed)).toBe(true);
  await page.getByRole("button", { name: /^Archivados/ }).click();
  await expect(page.getByText(/No hay conversaciones archivadas/)).toBeVisible();
  await page.getByRole("button", { name: /Volver|Atrás/ }).filter({ visible: true }).first().click();
  await expect(row).toBeVisible();
  await expect(row).toContainText("Borrador: Hola, te escribo por fisioterapia.");
  // Watch every DOM update, not just the final screenshot: a removed/reinserted
  // row can finish in the right place and still flicker visibly in between.
  await page.evaluate(() => {
    const list = document.querySelector(".ccr-direct-chat-list")!;
    const state = { missing: false };
    Object.assign(window, { chatStability: state });
    new MutationObserver(() => { if (![...list.querySelectorAll(".ccr-fila-chat")].some(row => row.textContent?.includes("Profesional nuevo") && row.getBoundingClientRect().height > 0)) state.missing = true; })
      .observe(list, { childList: true, subtree: true, characterData: true });
  });
  await delayed!.fulfill(obsoleteResult === "success"
    ? { json: { conversations: [older] } }
    : { status: 503, json: { error: "Respuesta anterior fallida" } });
  await page.waitForTimeout(500); // Allow the obsolete response and React paint to complete.
  await expect(row).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { chatStability: { missing: boolean } }).chatStability.missing)).toBe(false);
  await expect(page.getByText("Respuesta anterior fallida", { exact: true })).toHaveCount(0);
  expect(writes, "Opening the inbox must never send the saved draft").toBe(0);
});
}

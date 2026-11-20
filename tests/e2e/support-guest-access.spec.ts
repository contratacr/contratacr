import { randomUUID } from "node:crypto";
import { expect, test } from "playwright/test";
import { guestAccessEligible, guestAccessToken, validGuestAccess, GUEST_ACCESS_SECONDS } from "../../src/lib/support/guest-access";
import { supportReplyEmail } from "../../src/lib/support-notify";
import { canRunSeededRegression, regressionAdminClient } from "./seed";
import { cleanupDisposableAccount, createDisposableAccount } from "./disposable-account";
import { expectNoHorizontalOverflow, gotoOK, openLoginForm, waitForInteractivePage } from "./helpers";

test("private capabilities expire and cannot be transferred to another case or email", () => {
  const id = randomUUID(), other = randomUUID(), email = "guest@contratacr.test", now = Date.now();
  const token = guestAccessToken(id, email, now)!;
  expect(token).toBeTruthy();
  expect(validGuestAccess(id, email, token, now)).toBe(true);
  expect(validGuestAccess(id, email.toUpperCase(), token, now)).toBe(true);
  expect(validGuestAccess(other, email, token, now)).toBe(false);
  expect(validGuestAccess(id, "other@contratacr.test", token, now)).toBe(false);
  expect(validGuestAccess(id, email, token + "x", now)).toBe(false);
  expect(validGuestAccess(id, email, token, now + GUEST_ACCESS_SECONDS * 1000)).toBe(false);
  expect(guestAccessEligible({ topic: "subject0" })).toBe(false);
  expect(guestAccessEligible({ topic: "subject1", user_id: other })).toBe(false);
});

test("reply email sends access guests to their private case and other guests through login with the case preserved", () => {
  const id = randomUUID();
  const options = { toEmail: "guest@contratacr.test", subject: "Consulta", body: "Respuesta", ticketId: id };
  const normal = supportReplyEmail({ ...options, topic: "subject5" });
  expect(normal).toContain(`/login?redirect=${encodeURIComponent(`/dashboard/cliente?tab=soporte&ticket=${id}`)}`);
  expect(normal).not.toContain(`/soporte/caso/`);
  const access = supportReplyEmail({ ...options, topic: "subject1" });
  expect(access).toContain(`/soporte/caso/${id}#`);
  expect(access).toContain("14 días");
  const account = supportReplyEmail({ ...options, topic: "subject1", hasAccount: true, panel: "profesional" });
  expect(account).toContain(`/dashboard/profesional?tab=soporte&ticket=${id}`);
  expect(account).not.toContain(`/soporte/caso/`);
});

test.describe("private support case in regression", () => {
  test.skip(!canRunSeededRegression(), "Requires isolated regression database.");
  let id: string, email: string;
  test.beforeEach(async ({ context }) => {
    id = randomUUID(); email = `support-${id}@contratacr.test`;
    await context.setExtraHTTPHeaders({ "x-forwarded-for": id });
    const db = regressionAdminClient();
    const { error } = await db.from("support_tickets").insert({ id, name: "Invitado de prueba", email, subject: "No puedo entrar", message: "Ayuda con acceso", topic: "subject1", status: "resolved" });
    expect(error).toBeNull();
    const { error: messageError } = await db.from("support_ticket_messages").insert({ ticket_id: id, sender_role: "admin", body: "Podemos ayudarte a recuperar el acceso.", sender_name: "Soporte" });
    expect(messageError).toBeNull();
  });
  test.afterEach(async () => {
    const db = regressionAdminClient();
    await db.from("support_ticket_messages").delete().eq("ticket_id", id);
    await db.from("support_tickets").delete().eq("id", id);
  });

  test("guest opens, replies and reloads the same thread without an account", async ({ page }) => {
    const token = guestAccessToken(id, email)!;
    await gotoOK(page, `/soporte/caso/${id}#${token}`);
    await expect(page.getByText("Podemos ayudarte a recuperar el acceso.")).toBeVisible();
    expect(new URL(page.url()).hash).toBe("");
    const cookie = (await page.context().cookies()).find(c => c.name === `support_guest_${id}`);
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe("Strict");
    await page.getByLabel("Tu respuesta", { exact: true }).fill("Todavía no puedo entrar <script>no ejecutar</script>");
    await page.getByRole("button", { name: "Enviar respuesta", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Respuesta enviada");
    await expect(page.getByText("Todavía no puedo entrar <script>no ejecutar</script>", { exact: true })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await page.reload();
    await expect(page.getByText("Todavía no puedo entrar <script>no ejecutar</script>", { exact: true })).toBeVisible();
    const { data } = await regressionAdminClient().from("support_tickets").select("status,user_id,last_reply_role").eq("id", id).single();
    expect(data).toMatchObject({ status: "in_progress", user_id: null, last_reply_role: "user" });
  });

  test("missing, forged, expired and cross-case links disclose nothing", async ({ page }) => {
    await gotoOK(page, `/soporte/caso/${id}#invalid`);
    await expect(page.locator("main").getByRole("alert")).toContainText("enlace venció");
    await expect(page.getByText("Podemos ayudarte a recuperar el acceso.")).toHaveCount(0);
    const endpoint = `/api/support/guest/${id}`;
    expect((await page.request.get(endpoint)).status()).toBe(403);
    const origin = new URL(page.url()).origin;
    for (const token of [guestAccessToken(randomUUID(), email), guestAccessToken(id, "another@contratacr.test"), guestAccessToken(id, email, Date.now() - (GUEST_ACCESS_SECONDS + 10) * 1000)]) {
      expect((await page.request.post(endpoint, { headers: { origin }, data: { action: "open", token } })).status()).toBe(403);
    }
    expect((await page.request.post(endpoint, { headers: { origin: "https://example.com" }, data: { action: "open", token: guestAccessToken(id, email) } })).status()).toBe(403);
  });

  test("a temporary opening failure can be retried without recovering the token from the address bar", async ({ page }) => {
    let unavailable = true;
    await page.route(`**/api/support/guest/${id}`, async route => {
      if (unavailable && route.request().method() === "POST") {
        await route.fulfill({ status: 503, json: { error: "unavailable" } });
      } else await route.continue();
    });
    await gotoOK(page, `/soporte/caso/${id}#${guestAccessToken(id, email)}`);
    await expect(page.locator("main").getByRole("alert")).toContainText("Intenta de nuevo");
    expect(new URL(page.url()).hash).toBe("");
    unavailable = false;
    await page.getByRole("button", { name: "Intentar de nuevo" }).click();
    await expect(page.getByText("Podemos ayudarte a recuperar el acceso.")).toBeVisible();
  });

  test("non-access cases and cases attached to an account reject private access", async ({ page }) => {
    const db = regressionAdminClient();
    const origin = new URL(test.info().project.use.baseURL as string).origin;
    const endpoint = `/api/support/guest/${id}`;
    const token = guestAccessToken(id, email)!;
    await db.from("support_tickets").update({ topic: "subject5" }).eq("id", id);
    expect((await page.request.post(endpoint, { headers: { origin }, data: { action: "open", token } })).status()).toBe(403);
    await db.from("support_tickets").update({ topic: "subject1" }).eq("id", id);
    await gotoOK(page, `/soporte/caso/${id}#${token}`);
    await expect(page.getByText("Podemos ayudarte a recuperar el acceso.")).toBeVisible();
    const account = await createDisposableAccount({ prefix: "support-claim" });
    try {
      await db.from("support_tickets").update({ user_id: account.id }).eq("id", id);
      expect((await page.request.get(endpoint)).status()).toBe(403);
      expect((await page.request.post(endpoint, { headers: { origin }, data: { action: "reply", body: "Must not be saved" } })).status()).toBe(403);
    } finally { await db.from("support_tickets").update({ user_id: null }).eq("id", id); await cleanupDisposableAccount(account); }
  });

  test("signing in with the verified guest email opens and claims the exact case", async ({ page }) => {
    test.setTimeout(120_000);
    const account = await createDisposableAccount({ prefix: "support-login" });
    const db = regressionAdminClient();
    try {
      await db.from("support_tickets").update({ email: account.email, topic: "subject5" }).eq("id", id);
      await gotoOK(page, `/login?redirect=${encodeURIComponent(`/dashboard/profesional?tab=soporte&ticket=${id}`)}`);
      await waitForInteractivePage(page);
      await openLoginForm(page);
      await page.locator('main input[type="email"]').fill(account.email);
      await page.locator('main input[type="password"]').fill(account.password);
      const terms = page.locator("main").getByRole("checkbox");
      if (await terms.isVisible()) await terms.check();
      await page.locator("main").getByRole("button", { name: /Ingresar|Sign in/i }).first().click();
      await expect(page).toHaveURL(new RegExp(`dashboard/profesional.*ticket=${id}`), { timeout: 30_000 });
      await expect(page.getByText("Podemos ayudarte a recuperar el acceso.")).toBeVisible({ timeout: 30_000 });
      const { data } = await db.from("support_tickets").select("user_id").eq("id", id).single();
      expect(data?.user_id).toBe(account.id);
    } finally { await db.from("support_tickets").update({ user_id: null }).eq("id", id); await cleanupDisposableAccount(account); }
  });
});

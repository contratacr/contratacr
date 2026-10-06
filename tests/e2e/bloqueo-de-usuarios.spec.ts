import { expect, test } from "playwright/test";
import { gotoOK, loginAs, waitForInteractivePage } from "./helpers";
import { canRunSeededRegression, E2E_USERS, ensureRegressionSeed, regressionAdminClient } from "./seed";
import { cleanupDisposableAccount, createDisposableAccount, type DisposableAccount } from "./disposable-account";

// BLOQUEAR A UN USUARIO (6-oct-2026, regla 1.2 de Apple): desde la ficha, el
// contenido de esa persona desaparece al instante (ficha, búsqueda, tableros),
// la conversación queda bloqueada, el equipo recibe el reporte y se puede
// desbloquear desde Cuenta y seguridad.
test.skip(!canRunSeededRegression(), "Necesita la base de regresión.");
test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test("bloquear desde la ficha: desaparece, avisa al equipo y se puede desbloquear", async ({ page }) => {
  test.slow();
  await ensureRegressionSeed();
  const admin = regressionAdminClient();
  const { data: pro } = await admin.from("professionals").select("id, profile_id").eq("slug", E2E_USERS.professional.slug).maybeSingle();
  const proId = (pro as { id: string; profile_id: string }).id;
  const proPerfil = (pro as { id: string; profile_id: string }).profile_id;
  let cuenta: DisposableAccount | undefined;
  try {
    cuenta = await createDisposableAccount({ prefix: "bloquea" });
    await loginAs(page, cuenta.email, cuenta.password);

    // 1. La ficha se ve y el «···» ofrece bloquear.
    await gotoOK(page, `/profesionales/${E2E_USERS.professional.slug}`);
    await waitForInteractivePage(page);
    // En el teléfono el «···» vive en la barra de arriba («Opciones»).
    await page.getByRole("button", { name: /^(Opciones|Options|Más opciones|More options)$/ }).filter({ visible: true }).first().click();
    await page.getByText("Bloquear usuario", { exact: true }).first().click();
    const ventana = page.getByRole("dialog");
    await expect(ventana.getByText(/¿Bloquear a/)).toBeVisible();
    if (process.env.CAPTURAS) await page.screenshot({ path: "test-results/bloqueo-1-ventana.png" });
    await ventana.getByPlaceholder(/Qué pasó/).fill("Mensajes ofensivos (prueba automática).");
    await ventana.getByRole("button", { name: /^Bloquear$/ }).click();
    await expect(ventana.getByText("Usuario bloqueado")).toBeVisible({ timeout: 20_000 });
    await ventana.getByRole("button", { name: "OK" }).click();

    // 2. La ficha ya no se muestra.
    await expect(page.getByText("Bloqueaste a este usuario")).toBeVisible();
    if (process.env.CAPTURAS) await page.screenshot({ path: "test-results/bloqueo-2-pantalla.png" });
    await gotoOK(page, `/profesionales/${E2E_USERS.professional.slug}`);
    await expect(page.getByText("Bloqueaste a este usuario")).toBeVisible({ timeout: 20_000 });

    // 3. Ni en la búsqueda ni en los tableros.
    await gotoOK(page, "/profesionales");
    await waitForInteractivePage(page);
    await expect(page.locator(`a[href*="/profesionales/${E2E_USERS.professional.slug}"]`)).toHaveCount(0);

    // 4. El equipo tiene el reporte, y la conversación (si la hubiera) queda bloqueada.
    await expect.poll(async () => {
      const { data } = await admin.from("reports").select("id, kind, reason").eq("kind", "block").eq("reporter_email", cuenta!.email);
      return (data ?? []).length;
    }, { timeout: 15_000 }).toBeGreaterThan(0);
    const { data: bloqueo } = await admin.from("user_blocks").select("blocked_id").eq("blocker_id", cuenta.id);
    expect((bloqueo ?? []).map((b) => (b as { blocked_id: string }).blocked_id)).toContain(proPerfil);

    // 5. Desbloquear desde Cuenta y seguridad.
    await gotoOK(page, "/dashboard/profesional?tab=cuenta");
    const fila = page.locator("li", { hasText: E2E_USERS.professional.fullName }).first();
    await expect(fila).toBeVisible({ timeout: 30_000 });
    if (process.env.CAPTURAS) { await fila.scrollIntoViewIfNeeded(); await page.screenshot({ path: "test-results/bloqueo-3-cuenta.png" }); }
    await fila.getByRole("button", { name: /Desbloquear/ }).click();
    await expect(fila).toHaveCount(0);
    await expect.poll(async () => (await admin.from("user_blocks").select("blocked_id").eq("blocker_id", cuenta!.id)).data?.length ?? 0).toBe(0);
    await gotoOK(page, `/profesionales/${E2E_USERS.professional.slug}`);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(E2E_USERS.professional.fullName.split(" ")[0], { timeout: 30_000 });
    void proId;
  } finally {
    if (cuenta) {
      await admin.from("reports").delete().eq("reporter_email", cuenta.email);
      await cleanupDisposableAccount(cuenta).catch(() => undefined);
    }
  }
});

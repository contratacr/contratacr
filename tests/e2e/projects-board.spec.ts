import { expect, test } from "playwright/test";
import { apiJson, expectHealthyPage, gotoOK, loginAs, resetAuth, waitForInteractivePage } from "./helpers";
import { canRunSeededRegression, E2E_USERS, ensureRegressionSeed, regressionAdminClient } from "./seed";

// Los proyectos salieron del panel a un tablero público, como empleos y
// promociones. Lo que se protege aquí: que el tablero se vea sin cuenta, que el
// teléfono del cliente NO viaje con la página, y que escribirle exija cuenta
// profesional —la única puerta del app que la pide, porque el número es el de
// un vecino, no el de un negocio que se anuncia.

test.describe("@seeded tablero público de proyectos", () => {
  test.skip(!canRunSeededRegression(), "Requiere las cuentas de prueba.");

  // El tablero depende de la migración 207. Mientras no esté aplicada en el
  // entorno, la columna no existe y no hay nada que comprobar: se salta en vez
  // de fallar por algo que no es del código.
  let proyectosPublicos: Array<{ id: string; client_id: string }> = [];

  test.beforeAll(async () => {
    await ensureRegressionSeed();
    const { data, error } = await regressionAdminClient()
      .from("projects")
      .select("id, client_id")
      .eq("status", "open")
      .eq("allow_direct_contact", true)
      .limit(20);
    if (!error) proyectosPublicos = (data ?? []) as Array<{ id: string; client_id: string }>;
  });

  test.beforeEach(() => {
    test.skip(proyectosPublicos.length === 0, "Falta la migración 207 (o no hay proyectos abiertos con contacto directo).");
  });

  test("un invitado ve el tablero y ningún teléfono viaja con la página", async ({ page }) => {
    await resetAuth(page);
    await gotoOK(page, "/es/proyectos");
    await waitForInteractivePage(page);

    const tarjetas = page.locator('a[href*="/proyectos/"]').filter({ visible: true });
    await expect(tarjetas.first()).toBeVisible({ timeout: 15_000 });

    const html = await page.content();
    expect(html, "El tablero no publica teléfonos").not.toMatch(/tel:\+?\d{8,}/);
    expect(html).not.toMatch(/wa\.me\/\d{8,}/);
    expect(html).not.toContain("client_phone");
    await expectHealthyPage(page);
  });

  test("escribirle al cliente exige cuenta profesional y nunca la propia publicación", async ({ page }) => {
    const admin = regressionAdminClient();
    const abiertos = proyectosPublicos;

    // Sin cuenta: la ruta no entrega nada.
    await resetAuth(page);
    await gotoOK(page, "/es/proyectos");
    const invitado = await apiJson<{ error?: string }>(page, "/api/contact/project-lead", {
      method: "POST",
      body: { projectId: abiertos[0].id },
    });
    expect(invitado.status).toBe(401);

    // Con cuenta profesional: enlace de WhatsApp, y nunca al propio proyecto.
    await loginAs(page, E2E_USERS.professional.email, E2E_USERS.professional.password);
    await gotoOK(page, "/es/proyectos");
    const { data: pro } = await admin
      .from("professionals")
      .select("profile_id")
      .eq("id", (await ensureRegressionSeed()).professionalId)
      .maybeSingle();
    const ajeno = abiertos.find((p) => p.client_id !== (pro as { profile_id?: string } | null)?.profile_id);
    const propio = abiertos.find((p) => p.client_id === (pro as { profile_id?: string } | null)?.profile_id);

    if (ajeno) {
      const respuesta = await apiJson<{ href?: string }>(page, "/api/contact/project-lead", {
        method: "POST",
        body: { projectId: ajeno.id },
      });
      expect(respuesta.status).toBe(200);
      expect(respuesta.body.href ?? "").toMatch(/^https:\/\/wa\.me\/\d{8,}/);
    }
    if (propio) {
      const respuesta = await apiJson<{ error?: string }>(page, "/api/contact/project-lead", {
        method: "POST",
        body: { projectId: propio.id },
      });
      expect(respuesta.status).toBe(409);
    }
  });
});

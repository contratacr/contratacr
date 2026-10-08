import { expect, test } from "playwright/test";
import { enlaceDeReporte, semanaAnterior } from "../../src/lib/notifications/resumen-semanal";
import { canRunSeededRegression, regressionAdminClient } from "./seed";
import { cleanupDisposableAccount, createDisposableAccount, type DisposableAccount } from "./disposable-account";

// El resumen de los lunes al profesional (8-oct-2026): «Esta semana te
// escribieron N personas. ¿Con cuántas cerraste trabajo?». Lo que se sostiene:
//  · la puerta interna no se abre sin el secreto de las tareas;
//  · la semana es lunes a domingo de la semana ANTERIOR, en hora de Costa Rica;
//  · un enlace sin firma válida no anota nada;
//  · ABRIR el enlace no anota (los antivirus del correo los abren solos): solo
//    el botón «Confirmar».

test.describe("resumen semanal a profesionales", () => {
  test("la puerta interna exige el secreto de las tareas", async ({ request }) => {
    const sinSecreto = await request.post("/api/internal/resumen-semanal");
    expect([401, 503]).toContain(sinSecreto.status());
    const conSecretoMalo = await request.post("/api/internal/resumen-semanal", { headers: { Authorization: "Bearer no-es-el-secreto" } });
    expect([401, 503]).toContain(conSecretoMalo.status());
  });

  test("la semana es lunes a domingo de la anterior, en hora de Costa Rica", () => {
    // Lunes 12-oct-2026, 8:00 a.m. en Costa Rica (14:00 UTC): resume del 5 al 11.
    const lunes = semanaAnterior(new Date("2026-10-12T14:00:00Z"));
    expect(lunes.semana).toBe("2026-10-05");
    expect(lunes.desde.toISOString()).toBe("2026-10-05T06:00:00.000Z");
    expect(lunes.hasta.toISOString()).toBe("2026-10-12T06:00:00.000Z");
    // Domingo 11 a las 11 p.m. en Costa Rica ya es lunes 12 en UTC: todavía es
    // domingo aquí, así que la semana anterior es la del 28-sep.
    expect(semanaAnterior(new Date("2026-10-12T05:00:00Z")).semana).toBe("2026-09-28");
  });

  test("un enlace con firma inválida no anota nada", async ({ request }) => {
    const r = await request.get("/api/trabajos/reportar?p=00000000-0000-4000-8000-000000000001&s=2026-10-06&n=2&f=falsa");
    expect(r.status()).toBe(400);
    expect(await r.text()).toContain("no es válido");
  });

  test.describe("con la base de pruebas", () => {
    test.skip(!canRunSeededRegression(), "Needs the seeded regression environment.");
    let pro: DisposableAccount | undefined;
    test.afterAll(async () => { await cleanupDisposableAccount(pro); });

    test("abrir el enlace pide confirmar; solo «Confirmar» anota", async ({ page }) => {
      const db = regressionAdminClient();
      pro = await createDisposableAccount({ prefix: "resumen-semanal", professional: true });
      const semana = "2026-10-05";
      const { error } = await db.from("trabajos_reportados").insert({ professional_id: pro.professionalId, semana, contactos: 4 });
      if (error) throw error;

      const enlace = new URL(enlaceDeReporte(pro.professionalId!, semana, 2));
      await page.goto(`${enlace.pathname}${enlace.search}`);
      await expect(page.getByRole("heading", { name: "¿Con cuántas cerraste trabajo?" })).toBeVisible();
      await expect(page.getByText("Vas a anotar: 2.")).toBeVisible();
      const { data: antes } = await db.from("trabajos_reportados").select("cerrados").eq("professional_id", pro.professionalId!).eq("semana", semana).single();
      expect(antes?.cerrados).toBeNull();

      await page.getByRole("button", { name: "Confirmar" }).click();
      await expect(page.getByRole("heading", { name: "¡Gracias!" })).toBeVisible();
      const { data: despues } = await db.from("trabajos_reportados").select("cerrados, respondido_en").eq("professional_id", pro.professionalId!).eq("semana", semana).single();
      expect(despues?.cerrados).toBe(2);
      expect(despues?.respondido_en).toBeTruthy();
    });
  });
});

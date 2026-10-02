import { expect, test } from "playwright/test";
import { apiJson, gotoOK, isMobileProject, loginAs, resetAuth, waitForInteractivePage } from "./helpers";
import { canRunSeededRegression, E2E_USERS } from "./seed";

// LA COTIZACIÓN DE PUNTA A PUNTA. Era lo único del panel del profesional sin
// prueba: crearla, que los montos salgan bien (con y sin IVA), que el enlace
// público la muestre a quien no tiene cuenta —y no la deje indexar—, que el PDF
// que se le manda al cliente sea un PDF de verdad, y que se pueda borrar.

type Quote = {
  id: string;
  public_code: string;
  quote_number: number | null;
  subtotal: number;
  tax_amount: number;
  total: number;
  status: string;
};

test.describe("@seeded cotizaciones", () => {
  test.skip(!canRunSeededRegression(), "Necesita las cuentas de regresión.");

  test("un invitado no puede crear cotizaciones", async ({ page }) => {
    test.skip(isMobileProject(test.info()), "Basta comprobarlo una vez.");
    await resetAuth(page);
    await gotoOK(page, "/");
    const intento = await apiJson(page, "/api/quotes", {
      method: "POST",
      body: { clientName: "Nadie", items: [{ description: "x", quantity: 1, unit_price: 1000 }] },
    });
    expect(intento.status).toBe(401);
  });

  test("crear, abrir el enlace público, descargar el PDF y borrar", async ({ page, browser }) => {
    test.slow();
    const marca = `Cotización de prueba ${Date.now()}`;
    await loginAs(page, E2E_USERS.professional.email, E2E_USERS.professional.password);

    // 1. Crear: dos renglones y «más IVA» (13 %).
    const creada = await apiJson<{ quote: Quote }>(page, "/api/quotes", {
      method: "POST",
      body: {
        title: marca,
        clientName: "Cliente de prueba",
        taxMode: "mas_iva",
        validDays: 15,
        items: [
          { description: "Revisión eléctrica", quantity: 1, unit_price: 25000 },
          { description: "Tomacorriente doble", quantity: 3, unit_price: 5000 },
        ],
      },
    });
    expect(creada.status, JSON.stringify(creada.body)).toBe(200);
    const quote = creada.body.quote;
    expect(quote.public_code).toBeTruthy();
    expect(quote.status).toBe("sent");
    expect(Number(quote.subtotal)).toBe(40000);
    expect(Number(quote.tax_amount)).toBe(5200);
    expect(Number(quote.total)).toBe(45200);

    try {
      // 2. Aparece en la sección del panel.
      await gotoOK(page, "/dashboard/profesional?tab=quotes");
      const fila = page.getByText(marca, { exact: true }).filter({ visible: true }).first();
      await expect(fila).toBeVisible({ timeout: 20_000 });

      // 3. El PDF que se le manda al cliente (en computadora se descarga).
      if (!isMobileProject(test.info())) {
        await waitForInteractivePage(page);
        await fila.click();
        const descargar = page.getByRole("button", { name: /Descargar PDF/i }).filter({ visible: true }).first();
        await expect(descargar).toBeEnabled({ timeout: 20_000 });
        const [archivo] = await Promise.all([page.waitForEvent("download"), descargar.click()]);
        expect(archivo.suggestedFilename()).toMatch(/^Cotizacion-.+\.pdf$/);
        const ruta = await archivo.path();
        const { readFileSync } = await import("node:fs");
        const bytes = readFileSync(ruta);
        expect(bytes.subarray(0, 5).toString("latin1"), "el archivo debe ser un PDF").toBe("%PDF-");
        expect(bytes.length).toBeGreaterThan(2_000);
      }

      // 4. El enlace público, abierto por alguien SIN cuenta: el corto y el largo.
      const invitado = await browser.newContext();
      try {
        const visita = await invitado.newPage();
        for (const ruta of [`/c/${quote.public_code}`, `/cotizacion/${quote.public_code}`]) {
          const respuesta = await visita.goto(ruta);
          expect(respuesta?.status(), ruta).toBe(200);
          await expect(visita.getByText("Revisión eléctrica").first(), ruta).toBeVisible();
          await expect(visita.getByText("Tomacorriente doble").first(), ruta).toBeVisible();
          await expect(visita.locator("body"), ruta).toContainText(/45[\s.,]?200/);
          // Una cotización es un documento privado entre dos personas: no se indexa.
          const html = await respuesta!.text();
          expect(html, ruta).toMatch(/name="robots" content="noindex/);
        }
        // Un código inventado no enseña otra cotización.
        const falsa = await visita.goto("/cotizacion/zzzzzzzzzzzz");
        expect([200, 404]).toContain(falsa?.status());
        await expect(visita.getByText("Revisión eléctrica")).toHaveCount(0);
      } finally {
        await invitado.close();
      }
    } finally {
      // 5. Borrar: solo quien la hizo, y deja de verse en el enlace.
      const borrada = await apiJson(page, "/api/quotes", { method: "PATCH", body: { id: quote.id, action: "delete" } });
      expect(borrada.status, JSON.stringify(borrada.body)).toBe(200);
    }
  });
});

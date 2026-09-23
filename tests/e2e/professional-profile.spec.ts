import { expect, test } from "playwright/test";
import { expectNoHorizontalOverflow, firstProfessionalHref, gotoOK, loginAs } from "./helpers";
import { canRunSeededRegression, ensureRegressionSeed, regressionAdminClient, E2E_USERS, type RegressionSeedState } from "./seed";
import { cleanupDisposableAccount, createDisposableAccount, type DisposableAccount } from "./disposable-account";

test.describe("@seeded professional profile", () => {
  let seed: RegressionSeedState | null = null;

  test.beforeAll(async () => {
    if (canRunSeededRegression()) seed = await ensureRegressionSeed();
  });

  test("first search result opens a complete public profile", async ({ page }) => {
    const href = await firstProfessionalHref(page);
    expect(href, "The verified production mirror must expose at least one professional").toBeTruthy();

    await gotoOK(page, href!);
    await expect(page).toHaveURL(/\/es\/profesionales\//);
    await expect(page.locator("h1").first()).toBeVisible();
    await expect(page.locator("main").getByText(/Servicios|Sobre mi|Rese|Casos de/i).first()).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("professional share image is generated as a PNG", async ({ page, request }) => {
    test.setTimeout(45_000);
    const href = await firstProfessionalHref(page);
    expect(href, "The verified production mirror must expose at least one professional").toBeTruthy();

    const profileUrl = new URL(href!, page.url());
    profileUrl.pathname = `${profileUrl.pathname.replace(/\/$/, "")}/opengraph-image`;
    profileUrl.search = `e2e=${Date.now()}`;
    const response = await request.get(profileUrl.toString(), { timeout: 30_000 });

    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("image/png");
    expect((await response.body()).byteLength).toBeGreaterThan(10_000);
  });

  test("long professional names remain readable on responsive profile headers", async ({ page }) => {
    const href = await firstProfessionalHref(page);
    expect(href).toBeTruthy();
    await gotoOK(page, href!);
    const name = page.getByTestId("professional-profile-name");
    await expect(name).toBeVisible();

    if ((page.viewportSize()?.width ?? 1280) < 640) {
      await name.evaluate((element) => {
        element.textContent = "Constructora de Costa Rica instalación de proyectos especializados";
      });
      const layout = await name.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          fontSize: Number.parseFloat(style.fontSize),
          lineHeight: Number.parseFloat(style.lineHeight),
          height: element.getBoundingClientRect().height,
        };
      });
      expect(layout.fontSize).toBeLessThanOrEqual(18);
      expect(layout.height).toBeGreaterThan(layout.lineHeight * 1.5);
      expect(layout.height).toBeLessThanOrEqual(layout.lineHeight * 3.1);
    }
    await expectNoHorizontalOverflow(page);
  });

  test("reviews never freeze navigation back to results or home", async ({ page }) => {
    const href = await firstProfessionalHref(page);
    expect(href, "The verified production mirror must expose at least one professional").toBeTruthy();

    const profile = new URL(href!, page.url());
    const reviewsHref = `${profile.pathname}?tab=resenas&from=${encodeURIComponent("/buscar?categoria=enfermeria")}#resenas`;

    await gotoOK(page, reviewsHref);
    await expect(page.getByRole("heading", { name: /Reseñas|Reviews/i }).first()).toBeVisible();
    // En el teléfono el «volver» vive en la barra superior (un botón con flecha
    // junto al título); en computadora es el enlace de la página. Los dos llevan
    // al mismo sitio, así que la prueba toma el que exista.
    const enTelefono = (page.viewportSize()?.width ?? 1280) < 1024;
    // En computadora la ficha NO dibuja «Volver a resultados»: la flecha del
    // navegador ya hace eso (ver sin-volver-en-computadora.spec.ts). En el
    // teléfono el «volver» vive en la barra superior y sí se comprueba.
    if (enTelefono) {
      await page.locator("[data-ccr-section-back]").first().click();
      await expect(page).toHaveURL(/\/es\/buscar\?categoria=enfermeria$/);
    } else {
      // Sin ese viaje, volver a la misma dirección sería solo un cambio de
      // ancla (#resenas) y no habría respuesta que esperar.
      await gotoOK(page, "/es");
    }

    await gotoOK(page, reviewsHref);
    await expect(page.getByRole("heading", { name: /Reseñas|Reviews/i }).first()).toBeVisible();
    // El logo que lleva al inicio solo está en la barra de computadora: en el
    // teléfono esa barra la ocupa el «volver» con el título de la ficha, que ya
    // se comprobó arriba.
    if (!enTelefono) {
      await page.getByRole("banner").getByRole("link", { name: /ContrataCR inicio/i }).click();
      await expect(page).toHaveURL(/\/es\/?$/);
    }
  });

  test("profile reviews use a compact inline form instead of an isolated modal", async ({ page }) => {
    test.skip(!seed, "Requires protected regression actors.");
    let account: DisposableAccount | undefined;
    try {
      account = await createDisposableAccount({ prefix: "profile-review-inline" });
      await loginAs(page, account.email, account.password);
      await gotoOK(page, `/es/profesionales/${seed!.professionalSlug}?tab=resenas#resenas`);

      await expect(page.getByText("¿Ya trabajaste con este profesional?")).toBeVisible();
      await expect(page.getByRole("button", { name: "Escribir reseña" })).toHaveCount(0);
      await expect(page.getByPlaceholder(/Cuéntanos sobre tu experiencia/i)).toHaveCount(0);
      await page.getByRole("button", { name: "5 estrellas", exact: true }).click();
      await expect(page.getByPlaceholder(/Cuéntanos sobre tu experiencia/i)).toBeVisible();
      await expect(page.getByRole("button", { name: /Enviar reseña|Actualizar reseña/i })).toBeVisible();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expectNoHorizontalOverflow(page);
    } finally {
      await cleanupDisposableAccount(account);
    }
  });

  test("reviews are the second profile section and do not label review provenance", async ({ page }) => {
    const href = await firstProfessionalHref(page);
    expect(href).toBeTruthy();
    await gotoOK(page, href!);

    // En el teléfono la primera pestaña es Disponibilidad —contactar es a lo que
    // se viene— y en computadora esa pestaña no existe porque es la columna de la
    // derecha. Lo que se comprueba aquí es el orden del contenido: Servicios y,
    // pegadas, las Reseñas.
    const tabs = page.getByRole("tablist", { name: /Secciones del perfil|Profile sections/i }).getByRole("tab");
    const servicios = tabs.filter({ hasText: /Servicios|Services/i }).first();
    const resenas = tabs.filter({ hasText: /Reseñas|Reviews/i }).first();
    await expect(servicios).toBeVisible();
    await expect(resenas).toBeVisible();
    const posiciones = await tabs.evaluateAll((nodos) => nodos.map((n) => n.textContent?.trim() ?? ""));
    const iServicios = posiciones.findIndex((texto) => /Servicios|Services/i.test(texto));
    const iResenas = posiciones.findIndex((texto) => /Reseñas|Reviews/i.test(texto));
    expect(iResenas).toBe(iServicios + 1);

    await resenas.click();
    await expect(page.getByText(/Contratación verificada|Contacto confirmado|Experiencia no verificada|Verified booking|Confirmed contact|Unverified experience/i)).toHaveCount(0);
  });

  test("no puedo guardarme a mí mismo aunque pulse apenas abre", async ({ page }) => {
    const seed = await ensureRegressionSeed();
    const admin = regressionAdminClient();
    await admin.from("saved_professionals").delete().eq("client_id", seed.professionalUserId).eq("professional_id", seed.professionalId);
    await loginAs(page, E2E_USERS.professional.email, E2E_USERS.professional.password);
    await gotoOK(page, `/es/profesionales/${seed.professionalSlug}`);
    // Sin esperar: se pulsa apenas la ficha aparece, que es cuando se rompía.
    // En computadora Guardar es un botón; en el teléfono vive en el «···».
    const boton = page.locator("[data-save-button]").filter({ visible: true }).first();
    const conBoton = (await boton.count()) > 0;
    if (conBoton) {
      await boton.click({ timeout: 10_000 });
    } else {
      // En el teléfono Guardar vive en el «···» y en la ficha propia no se
      // ofrece: lo que se prueba es que no esté.
      await page.getByRole("button", { name: /^(Options|Opciones|More|Más|Más opciones|More options)$/i }).filter({ visible: true }).first().click({ timeout: 10_000 });
      // «Compartir» donde hay hoja del sistema, «Copiar enlace» donde no.
      await expect(page.getByRole("menuitem", { name: /Compartir|Share|Copiar enlace|Copy link/i }).first()).toBeVisible();
      await expect(page.getByRole("menuitem", { name: /^(Save|Saved|Guardar|Guardado)$/i })).toHaveCount(0);
    }
    await page.waitForTimeout(1500);
    const { count } = await admin.from("saved_professionals")
      .select("id", { count: "exact", head: true })
      .eq("client_id", seed.professionalUserId)
      .eq("professional_id", seed.professionalId);
    expect(count ?? 0).toBe(0);
    if (conBoton) await expect(page.getByText(/tus propios favoritos|your own favorites/i).first()).toBeVisible();
  });
});

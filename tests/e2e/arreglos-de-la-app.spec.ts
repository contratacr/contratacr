import { expect, test } from "playwright/test";
import { gotoOK, waitForInteractivePage } from "./helpers";

// LO QUE SE ROMPIÓ EL 9-OCT-2026 Y NO PUEDE VOLVER.
// 1. «Cédula verificada» se partía en dos renglones en las tarjetas y le
//    quitaba al nombre el doble de espacio. Ahora es solo el check junto al nombre y nunca se
//    parte, ni con el nombre más largo, ni a 320 px.
// 2. Al cambiar de rol en la bienvenida de la app, el fondo se volvía
//    transparente y asomaba la pantalla de espera del arranque, que además
//    decía otro texto («Elige como quieres comenzar»).
// 3. Al recargarse una pantalla en la app, la cabecera de la web (con la
//    campana) se pintaba medio segundo. Con la cookie de la app el servidor ya
//    manda la cabecera de la app: solo logo y menú.

test.describe("check de identidad en las listas", () => {
  test.use({ viewport: { width: 320, height: 800 }, isMobile: true, hasTouch: true });

  for (const ruta of ["/profesionales", "/promociones", "/empleos", "/proyectos"]) {
    test(`${ruta}: la insignia va en un renglón aunque el nombre sea larguísimo`, async ({ page }) => {
      await gotoOK(page, ruta);
      await waitForInteractivePage(page);
      const insignias = page.locator("[data-verification-badge]").filter({ visible: true });
      // Sin perfiles verificados en la lista no hay nada que medir.
      if ((await insignias.count()) === 0) test.skip(true, "La lista no trae perfiles verificados.");
      const malas = await page.evaluate(() => {
        // El nombre más largo posible: cede él, nunca la insignia.
        for (const el of document.querySelectorAll("[data-verification-badge]")) {
          const nombre = el.closest("[data-inline-identity-name]")?.querySelector("[data-profile-name-start]");
          if (nombre) nombre.textContent = "Constructora y Remodelaciones Hermanos Rodríguez Villalobos Sociedad Anónima";
        }
        const fallos: string[] = [];
        for (const el of document.querySelectorAll<HTMLElement>("[data-verification-badge]")) {
          const r = el.getBoundingClientRect();
          if (!r.width) continue;
          if (r.height > 26) fallos.push(`partida en dos renglones (${Math.round(r.height)}px)`);
          // The transparent ::before extends the touch target by 4px. Measure
          // the visible seal instead of treating that hit area as clipped text.
          const seal = el.querySelector("svg")?.getBoundingClientRect();
          if (!seal || seal.width < 15 || seal.height < 15 || seal.left < r.left - 1 || seal.right > r.right + 1) fallos.push("recortada");
          for (let parent = el.parentElement; parent; parent = parent.parentElement) {
            const style = getComputedStyle(parent);
            if (["hidden", "clip", "auto", "scroll"].includes(style.overflowX)) {
              const bounds = parent.getBoundingClientRect();
              if (seal && (seal.left < bounds.left - 1 || seal.right > bounds.right + 1)) fallos.push("recortada por contenedor");
            }
          }
          if (r.right > window.innerWidth + 1) fallos.push("se sale de la pantalla");
          if (el.textContent?.trim() !== "") fallos.push(`dice «${el.textContent?.trim()}»`);
        }
        return fallos;
      });
      expect(malas, "la insignia de verificado en las tarjetas").toEqual([]);
    });
  }
});

test.describe("bienvenida de la app", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("la pantalla de espera coincide y se oculta al abrir el registro profesional", async ({ page }) => {
    await gotoOK(page, "/?nativePreview=1&resetNativeOnboarding=1");
    const titulo = page.getByRole("heading", { name: "¿Cómo quieres empezar?" });
    await expect(titulo).toBeVisible({ timeout: 30_000 });
    const espera = page.locator("#ccr-native-first-run-prepaint h1").first();
    await expect(espera, "la pantalla de espera del arranque usa el mismo título").toHaveText("¿Cómo quieres empezar?");

    await page.getByRole("button", { name: /Ofrezco servicios/ }).tap();
    await expect(page).toHaveURL(/\/registro\/profesional/);
    await expect(page.locator("[data-native-onboarding-ready]")).toBeHidden();
  });
});

test.describe("cabecera de la app", () => {
  test("con la cookie de la app el servidor manda la cabecera sin acciones de la web", async ({ request }) => {
    const conApp = await (await request.get("/terminos", { headers: { cookie: "ccr_platform=native" } })).text();
    const web = await (await request.get("/terminos")).text();
    expect(web, "la web sí lleva sus acciones (control de la prueba)").toContain("ccr-cabecera-acciones-web");
    expect(conApp, "en la app la cabecera es solo logo y menú desde el primer pintado").not.toContain("ccr-cabecera-acciones-web");
  });
});

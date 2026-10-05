import { expect, test } from "playwright/test";
import { gotoOK, loginAs, waitForInteractivePage } from "./helpers";
import { canRunSeededRegression, E2E_USERS, ensureRegressionSeed, regressionAdminClient } from "./seed";
import { cleanupDisposableAccount, createDisposableAccount, type DisposableAccount } from "./disposable-account";

// LO QUE SE PIDIÓ Y SE ARREGLÓ EL 4 Y 5 DE OCTUBRE DE 2026, UNA PRUEBA POR COSA.
// La investigación de ese día encontró que catorce ajustes no tenían ninguna
// prueba: si algo los rompía, la regresión salía verde igual (así pasó con el
// aviso «¿Necesitas a alguien?», que no llegó a nadie). Aquí queda cada uno.
// El registro de profesional tiene la suya en borrador-sin-sesion.spec.ts.

const TELEFONO = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } as const;
const base = () => String(test.info().project.use.baseURL ?? "http://localhost:3000").replace(/\/$/, "");
const esLocal = () => /localhost|127\.0\.0\.1/.test(base());

test.describe("invitación a publicar un proyecto", () => {
  test.use(TELEFONO);

  test("la portada invita a crear un proyecto y la flecha del formulario vuelve a la portada", async ({ page }) => {
    await gotoOK(page, "/");
    await waitForInteractivePage(page);
    await expect(page.getByText("¿No sabes a quién llamar?")).toBeVisible();
    await page.getByRole("link", { name: "Crea un proyecto" }).click();
    const titulo = page.locator("#publish-project-title");
    await titulo.waitFor({ timeout: 30_000 });
    // El formulario ya no lleva frases debajo del título ni de los campos.
    await expect(page.getByText(/Para que te escriban profesionales de tu zona|No aparece en la publicación/)).toHaveCount(0);
    await titulo.locator("xpath=../..").getByRole("button").first().click();
    await expect.poll(() => new URL(page.url()).pathname, { timeout: 15_000 }).toBe("/");
  });

  test("una búsqueda sin resultados ofrece publicar lo que se necesita", async ({ page }) => {
    await gotoOK(page, "/profesionales?q=zzqqxxyy-no-existe-123");
    const publicar = page.locator('a[href*="/publicar-proyecto"]').filter({ visible: true }).first();
    await expect(publicar).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Gratis · Tu número no se publica").first()).toBeVisible();
    await expect(page.getByText(/los profesionales te contactan por WhatsApp/).first()).toBeVisible();
  });

  test("el final de los resultados ofrece publicar, con el servicio de la búsqueda", async ({ page }) => {
    // Se pide una página muy alta: la app la recorta a la última, que es donde
    // vive la tarjeta.
    await gotoOK(page, "/profesionales?categoria=desarrollo_web&page=999");
    const tarjeta = page.locator('a[href*="/publicar-proyecto"][href*="categoria=desarrollo_web"]').filter({ visible: true }).first();
    await expect(tarjeta).toBeVisible({ timeout: 30_000 });
  });

  test("el formulario dice cuántos profesionales recibirán el proyecto, también sin sesión", async ({ page, request }) => {
    const respuesta = await request.get("/api/projects?role=destinatarios&category=desarrollo_web");
    expect(respuesta.status()).toBe(200);
    const { total } = await respuesta.json() as { total: number };
    expect(typeof total).toBe("number");
    // Un servicio inventado (o con caracteres raros) no rompe ni cuenta.
    const raro = await request.get("/api/projects?role=destinatarios&category=" + encodeURIComponent("x'; drop table--"));
    expect((await raro.json() as { total: number }).total).toBe(0);
    if (total > 0) {
      await gotoOK(page, "/publicar-proyecto?categoria=desarrollo_web");
      await expect(page.getByText(/recibirán? tu proyecto/)).toBeVisible({ timeout: 30_000 });
    }
  });

  test("el tablero de Proyectos no lleva la línea aclaratoria que se quitó", async ({ page }) => {
    await gotoOK(page, "/proyectos");
    await waitForInteractivePage(page);
    await expect(page.getByText(/Aquí la gente pide servicios/)).toHaveCount(0);
  });

  test("tras abrir WhatsApp en una ficha, al volver se ofrece publicar", async ({ page }) => {
    test.skip(!canRunSeededRegression(), "Necesita el profesional de regresión.");
    await ensureRegressionSeed();
    await gotoOK(page, `/profesionales/${E2E_USERS.professional.slug}`);
    await waitForInteractivePage(page);
    await expect(page.getByText("¿No te respondió?")).toHaveCount(0);
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent("ccr:whatsapp-abierto"));
      window.dispatchEvent(new Event("focus"));
    });
    await expect(page.getByText("¿No te respondió?")).toBeVisible();
    const publicar = page.getByRole("link", { name: "Publicar", exact: true });
    await expect(publicar).toBeVisible();
    expect(await publicar.getAttribute("href")).toContain("/publicar-proyecto");
    await page.getByRole("button", { name: "Cerrar" }).last().click();
    await expect(page.getByText("¿No te respondió?")).toHaveCount(0);
  });
});

test.describe("la flecha vuelve a la pantalla de origen", () => {
  test.use(TELEFONO);

  test("la cotización sin sesión vuelve a la página que la abrió", async ({ page }) => {
    await page.goto("/cotizar", { referer: `${base()}/proyectos`, waitUntil: "domcontentloaded" });
    const editor = page.getByRole("dialog");
    await editor.waitFor({ timeout: 30_000 });
    await waitForInteractivePage(page);
    await editor.getByRole("button").first().click();
    await expect.poll(() => new URL(page.url()).pathname, { timeout: 15_000 }).toBe("/proyectos");
  });

  test("un perfil que no existe, abierto desde la portada, ofrece volver al inicio", async ({ page }) => {
    await gotoOK(page, "/");
    await waitForInteractivePage(page);
    // Navegación completa, como al tocar un enlace: la pantalla anterior queda
    // anotada por la app y la ficha la lee.
    await page.waitForFunction(() => { try { return sessionStorage.getItem("ccr:ruta-actual") === "/"; } catch { return false; } }, null, { timeout: 10_000 });
    await page.evaluate(() => { window.location.href = "/profesionales/perfil-que-no-existe-zz9"; });
    await expect(page.getByRole("heading", { name: /Perfil no encontrado/ })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Volver al inicio").filter({ visible: true }).first()).toBeVisible();
    await expect(page.getByText("Volver a resultados")).toHaveCount(0);
  });
});

test.describe("reseñas, panel y administración", () => {
  test.skip(!canRunSeededRegression(), "Necesita la base de regresión.");

  test("una reseña muestra nombre corto en una línea y la fecha junto a las estrellas", async ({ page }) => {
    await ensureRegressionSeed();
    const admin = regressionAdminClient();
    const { data: pro } = await admin.from("professionals").select("id").eq("slug", E2E_USERS.professional.slug).maybeSingle();
    const proId = (pro as { id?: string } | null)?.id;
    expect(proId).toBeTruthy();
    // Una cuenta con nombre de cuatro palabras: nombre, segundo nombre y dos apellidos.
    const cliente = await createDisposableAccount({ prefix: "resena-corta" });
    const comentario = `Reseña de nombre corto ${Date.now()}`;
    try {
      await admin.from("profiles").update({ full_name: "Ana María Pérez Solano" }).eq("id", cliente.id);
      const { error } = await admin.from("reviews").insert({ professional_id: proId, client_id: cliente.id, rating: 5, comment: comentario });
      expect(error, error?.message).toBeNull();
      await page.setViewportSize({ width: 390, height: 844 });
      await gotoOK(page, `/profesionales/${E2E_USERS.professional.slug}?tab=resenas`);
      const texto = page.getByText(comentario);
      await expect(texto).toBeVisible({ timeout: 30_000 });
      const tarjeta = texto.locator("xpath=..");
      const nombre = tarjeta.getByText("Ana Pérez", { exact: true });
      await expect(nombre).toBeVisible();
      await expect(page.getByText("Ana María Pérez Solano")).toHaveCount(0);
      // La fecha va en la misma fila de las estrellas, con su punto.
      await expect(tarjeta.getByText(/^· /)).toBeVisible();
      expect(await nombre.evaluate((el) => el.getClientRects().length === 1 && el.scrollWidth <= el.clientWidth + 1), "el nombre cabe en una línea").toBe(true);
    } finally {
      await admin.from("reviews").delete().eq("comment", comentario);
      await cleanupDisposableAccount(cliente).catch(() => undefined);
    }
  });

  test("el panel precarga Mis proyectos y Cotizaciones: entrar no muestra esqueleto", async ({ page }) => {
    await ensureRegressionSeed();
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAs(page, E2E_USERS.professional.email, E2E_USERS.professional.password);
    await expect.poll(() => page.evaluate(() => Object.keys(sessionStorage).filter((k) => /dashboard-cache:(dashboard:client-projects|quotes):/.test(k)).length), { timeout: 20_000 }).toBe(2);
    for (const tab of ["sent_projects", "quotes"]) {
      await page.evaluate((t) => { history.pushState(null, "", `/dashboard/profesional?tab=${t}`); dispatchEvent(new PopStateEvent("popstate")); }, tab);
      await page.waitForTimeout(150);
      expect(await page.locator('[aria-busy="true"], .animate-pulse').filter({ visible: true }).count(), `${tab} abre sin esqueleto`).toBe(0);
    }
  });

  test("el menú del admin agrupa las secciones y muestra Contactos", async ({ page }) => {
    let cuenta: DisposableAccount | undefined;
    try {
      cuenta = await createDisposableAccount({ prefix: "admin-menu", admin: true });
      await page.setViewportSize({ width: 1366, height: 900 });
      await loginAs(page, cuenta.email, cuenta.password).catch(() => undefined);
      await gotoOK(page, "/admin");
      const menu = page.locator("aside nav");
      await expect(menu).toBeVisible({ timeout: 30_000 });
      const grupos = (await menu.locator("p").allTextContents()).map((t) => t.trim());
      expect(grupos).toEqual(["Principal", "Por atender", "Publicaciones", "Personas", "Catálogo", "Negocio"]);
      // El menú entero, en orden: lo publicado va junto.
      const enlaces = (await menu.getByRole("link").allTextContents()).map((t) => t.replace(/\d+/g, "").trim());
      const desde = enlaces.indexOf("Proyectos");
      expect(enlaces.slice(desde, desde + 4), enlaces.join(" · ")).toEqual(["Proyectos", "Empleos", "Promociones", "Reseñas"]);
      await expect(menu.getByRole("link", { name: /Contactos/ })).toBeVisible();
    } finally {
      await cleanupDisposableAccount(cuenta).catch(() => undefined);
    }
  });
});

test.describe("límite de solicitudes", () => {
  test("cuenta por la IP real de Cloudflare: cambiar x-forwarded-for no lo salta", async ({ request }) => {
    test.skip(!esLocal(), "Fuera de local, Cloudflare escribe cf-connecting-ip y no se puede fijar.");
    const ip = `203.0.113.${Math.floor(Math.random() * 250) + 1}`;
    const estados: number[] = [];
    for (let n = 0; n < 11; n += 1) {
      const r = await request.post("/api/report-client", {
        headers: { "cf-connecting-ip": ip, "x-forwarded-for": `10.9.${n}.${Math.floor(Math.random() * 250)}` },
        data: {},
      });
      estados.push(r.status());
    }
    expect(estados.slice(0, 10).every((e) => e !== 429), `los 10 primeros pasan: ${estados.join(",")}`).toBe(true);
    expect(estados[10], `el undécimo se frena: ${estados.join(",")}`).toBe(429);
  });
});

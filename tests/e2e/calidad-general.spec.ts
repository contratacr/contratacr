import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "playwright/test";
import { gotoOK, loginAs, waitForInteractivePage } from "./helpers";
import { canRunSeededRegression, E2E_USERS, ensureRegressionSeed } from "./seed";
import { cleanupDisposableAccount, createDisposableAccount, type DisposableAccount } from "./disposable-account";

// CALIDAD GENERAL (5-oct-2026, pedido de Isaac): textos, inglés, seguridad,
// tiempos de carga y esqueletos. Cada bloque es una REGLA del producto, no un
// arreglo puntual:
//   · todo texto existe en español y en inglés, con las mismas variables;
//   · ninguna pantalla en inglés deja español a la vista;
//   · quien no tiene permiso recibe un «no», nunca datos;
//   · las páginas públicas responden dentro de un presupuesto de tiempo;
//   · el esqueleto solo sale cuando de verdad hay que esperar: las páginas que
//     llegan pintadas del servidor no lo muestran, y una lista vacía no se
//     queda «cargando».

const base = () => String(test.info().project.use.baseURL ?? "http://localhost:3000").replace(/\/$/, "");
const esLocal = () => /localhost|127\.0\.0\.1/.test(base());
// En desarrollo cada ruta se compila al pedirla: medir tiempos ahí no dice nada.
const medirTiempos = () => !esLocal() || process.env.PLAYWRIGHT_LOCAL_PRODUCTION === "1" || !!process.env.CI;

const PUBLICAS = [
  "/", "/profesionales", "/servicios", "/promociones", "/empleos", "/proyectos", "/como-funciona", "/ayuda",
  "/login", "/registro", "/registro/cliente", "/registro/profesional", "/publicar-proyecto", "/cotizar",
  "/empleos/publicar", "/promociones/publicar", "/soporte", "/terminos", "/privacidad", "/mejorar-mi-perfil",
  "/verificacion-de-identidad",
];
const TELEFONO = { width: 390, height: 844 };
const COMPUTADORA = { width: 1366, height: 900 };

test.describe("textos", () => {
  type Arbol = { [clave: string]: Arbol | string };
  const leer = (idioma: string) => JSON.parse(fs.readFileSync(path.join(process.cwd(), "messages", `${idioma}.json`), "utf8")) as Arbol;
  const plano = (arbol: Arbol, prefijo = "", salida: Record<string, string> = {}) => {
    for (const [clave, valor] of Object.entries(arbol)) {
      const ruta = prefijo ? `${prefijo}.${clave}` : clave;
      if (valor && typeof valor === "object") plano(valor, ruta, salida);
      else salida[ruta] = String(valor);
    }
    return salida;
  };
  // Las variables de un texto ({nombre}, {n, plural, …}), sin contar lo que va
  // dentro de las ramas de un plural.
  const variables = (texto: string) => {
    const nombres: string[] = [];
    let hondo = 0;
    for (let i = 0; i < texto.length; i += 1) {
      if (texto[i] === "{") {
        if (hondo === 0) nombres.push((/^\{\s*(\w+)/.exec(texto.slice(i)) ?? [])[1] ?? "");
        hondo += 1;
      } else if (texto[i] === "}") hondo -= 1;
    }
    return nombres.sort().join(",");
  };

  test("cada texto existe en español y en inglés, con las mismas variables", () => {
    const es = plano(leer("es"));
    const en = plano(leer("en"));
    expect(Object.keys(es).filter((k) => !(k in en)), "faltan en inglés").toEqual([]);
    expect(Object.keys(en).filter((k) => !(k in es)), "faltan en español").toEqual([]);
    expect(Object.keys(es).filter((k) => variables(es[k]) !== variables(en[k])), "variables distintas entre idiomas").toEqual([]);
    // Un texto vacío en un idioma y lleno en el otro es una traducción olvidada.
    expect(Object.keys(es).filter((k) => (es[k] === "") !== (en[k] === "")), "vacío en un solo idioma").toEqual([]);
  });

  test("el inglés no arrastra signos ni frases del español", () => {
    const en = plano(leer("en"));
    expect(Object.keys(en).filter((k) => /[¿¡]/.test(en[k])), "signos de apertura en inglés").toEqual([]);
    const frases = /\b(Publicar|Guardar cambios|Iniciar sesión|Contraseña|Cuéntanos|Reseñas|Proyectos publicados|Notificaciones)\b/;
    expect(Object.keys(en).filter((k) => frases.test(en[k])), "frases en español dentro del inglés").toEqual([]);
  });

  test("ninguna pantalla pública deja a la vista una clave de texto sin traducir", async ({ page }) => {
    test.slow();
    for (const idioma of ["", "/en"]) {
      for (const ruta of PUBLICAS) {
        await gotoOK(page, `${idioma}${ruta === "/" && idioma ? "" : ruta}` || "/");
        const cuerpo = await page.locator("body").innerText();
        // Una clave cruda se ve como «seccion.subseccion.clave».
        const crudas = cuerpo.match(/\b[a-z][A-Za-z]+\.[a-z][A-Za-z]+\.[a-z][A-Za-z]+\b/g)?.filter((c) => !/\.(com|cr|org|net|io)\b/.test(c)) ?? [];
        expect(crudas, `${idioma}${ruta}`).toEqual([]);
      }
    }
  });
});

test.describe("inglés", () => {
  test("lo nuevo de octubre está traducido: portada, proyecto, cotización y registro", async ({ page }) => {
    test.slow();
    await page.setViewportSize(TELEFONO);
    await gotoOK(page, "/en");
    await expect(page.locator("html")).toHaveAttribute("lang", /^en/);
    await expect(page.getByText("Don't know who to call?")).toBeVisible();
    await expect(page.getByRole("link", { name: "Post a project" })).toBeVisible();
    await expect(page.getByText(/No sabes a quién llamar|Crea un proyecto/)).toHaveCount(0);

    await gotoOK(page, "/en/publicar-proyecto?categoria=desarrollo_web");
    await page.locator("#publish-project-title").waitFor({ timeout: 30_000 });
    await expect(page.getByText(/Cuéntanos|¿Qué necesitas|¿Dónde\?|recibirán tu proyecto/)).toHaveCount(0);

    await gotoOK(page, "/en/cotizar");
    await page.getByRole("dialog").waitFor({ timeout: 30_000 });
    await expect(page.getByText(/Nueva cotización|Crear cotización|Cédula/)).toHaveCount(0);

    await gotoOK(page, "/en/registro/profesional");
    await waitForInteractivePage(page);
    await expect(page.getByPlaceholder("Repeat your password")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Confirmar contraseña|Repite tu contraseña/)).toHaveCount(0);

    await gotoOK(page, "/en/profesionales?q=zzqqxxyy-no-existe-123");
    await expect(page.getByText(/Free · Your number is never published|professionals will contact you on WhatsApp/).first()).toBeVisible({ timeout: 30_000 });
  });
});

test.describe("seguridad", () => {
  test("las cabeceras de protección van en cada respuesta", async ({ request }) => {
    for (const ruta of ["/", "/login", "/dashboard/profesional", "/api/health"]) {
      const cabeceras = (await request.get(ruta, { maxRedirects: 0 })).headers();
      expect(cabeceras["x-content-type-options"], ruta).toContain("nosniff");
      expect(cabeceras["x-frame-options"], ruta).toMatch(/SAMEORIGIN|DENY/i);
      expect(cabeceras["content-security-policy"], ruta).toContain("frame-ancestors");
      expect(cabeceras["referrer-policy"], ruta).toContain("strict-origin");
      expect(cabeceras["strict-transport-security"], ruta).toContain("max-age=");
    }
  });

  test("sin sesión: administración, datos privados y tareas internas responden «no»", async ({ request }) => {
    const cerradas: [string, number[]][] = [
      ["/api/admin/projects", [401, 403]], ["/api/admin/users", [401, 403]], ["/api/admin/invitar-resena", [401, 403, 405]],
      ["/api/quotes", [401]], ["/api/projects?role=client", [401]],
      // Las tareas internas piden su llave: sin ella nunca corren.
      ["/api/internal/resena-google", [401, 403, 503]],
    ];
    for (const [ruta, esperados] of cerradas) {
      const r = await request.get(ruta, { maxRedirects: 0 });
      expect(esperados, `${ruta} → ${r.status()}`).toContain(r.status());
    }
    // Escribir sin sesión tampoco.
    for (const ruta of ["/api/projects", "/api/quotes", "/api/jobs/posts", "/api/offers"]) {
      const r = await request.post(ruta, { data: {} });
      expect([400, 401, 403], `POST ${ruta} → ${r.status()}`).toContain(r.status());
      expect(r.status(), `POST ${ruta} no crea nada`).not.toBe(200);
    }
  });

  test("una cuenta normal no entra a la administración", async ({ page }) => {
    test.skip(!canRunSeededRegression(), "Necesita la base de regresión.");
    let cuenta: DisposableAccount | undefined;
    try {
      cuenta = await createDisposableAccount({ prefix: "sin-permiso" });
      await loginAs(page, cuenta.email, cuenta.password);
      for (const ruta of ["/api/admin/projects", "/api/admin/users"]) {
        const r = await page.request.get(ruta);
        expect([401, 403], `${ruta} → ${r.status()}`).toContain(r.status());
      }
      const borrar = await page.request.delete("/api/admin/projects?id=00000000-0000-0000-0000-000000000000");
      expect([401, 403]).toContain(borrar.status());
    } finally {
      await cleanupDisposableAccount(cuenta).catch(() => undefined);
    }
  });

  test("ningún enlace de regreso saca a la persona del sitio", async ({ page, request }) => {
    // El regreso del inicio de sesión no acepta destinos de afuera.
    const vuelta = await request.get("/auth/callback?next=//evil.example.com", { maxRedirects: 0 });
    expect(vuelta.headers().location ?? "", "callback").not.toContain("evil.example.com");
    // La flecha de un formulario no vuelve a una página de otro sitio.
    await page.setViewportSize(TELEFONO);
    await page.goto("/cotizar", { referer: "https://evil.example.com/trampa", waitUntil: "domcontentloaded" });
    const editor = page.getByRole("dialog");
    await editor.waitFor({ timeout: 30_000 });
    await waitForInteractivePage(page);
    await editor.getByRole("button").first().click();
    await expect.poll(() => new URL(page.url()).host, { timeout: 15_000 }).toBe(new URL(base()).host);
    await expect.poll(() => new URL(page.url()).pathname).toBe("/");
  });

  test("lo que se escribe en la búsqueda nunca se ejecuta como código", async ({ page }) => {
    let alerta = false;
    page.on("dialog", (d) => { alerta = true; void d.dismiss(); });
    const carga = `"><img src=x onerror=alert(1)><script>alert(2)</script>`;
    await gotoOK(page, `/profesionales?q=${encodeURIComponent(carga)}`);
    await waitForInteractivePage(page);
    await page.waitForTimeout(800);
    expect(alerta, "no se abrió ningún diálogo").toBe(false);
    expect(await page.locator('img[src="x"]').count()).toBe(0);
  });
});

test.describe("tiempos de carga", () => {
  // Presupuesto amplio a propósito: no mide «qué tan rápido», sino que ninguna
  // página pública se vuelva lenta sin que nadie se entere.
  const TOPE = { respuesta: 2500, interactiva: 5000, completa: 9000 };

  test("las páginas públicas responden dentro del presupuesto, en teléfono y computadora", async ({ page }) => {
    test.skip(!medirTiempos(), "En desarrollo cada ruta se compila al pedirla; se mide contra la versión construida.");
    test.slow();
    const lentas: string[] = [];
    for (const [nombre, tamano] of [["teléfono", TELEFONO], ["computadora", COMPUTADORA]] as const) {
      await page.setViewportSize(tamano);
      for (const ruta of ["/", "/profesionales", "/servicios", "/promociones", "/empleos", "/proyectos", "/login", "/registro/profesional", "/publicar-proyecto", "/en"]) {
        // La mejor de dos visitas: la primera puede pagar el arranque en frío.
        let mejor = { respuesta: Infinity, interactiva: Infinity, completa: Infinity };
        for (let intento = 0; intento < 2; intento += 1) {
          await page.goto(ruta, { waitUntil: "load" });
          const t = await page.evaluate(() => {
            const n = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
            return { respuesta: n.responseStart, interactiva: n.domContentLoadedEventEnd, completa: n.loadEventEnd || n.domComplete };
          });
          if (t.interactiva < mejor.interactiva) mejor = t;
        }
        for (const clave of ["respuesta", "interactiva", "completa"] as const) {
          if (mejor[clave] > TOPE[clave]) lentas.push(`${ruta} (${nombre}): ${clave} ${Math.round(mejor[clave])} ms > ${TOPE[clave]}`);
        }
      }
    }
    expect(lentas, lentas.join("\n")).toEqual([]);
  });

  test("la portada no carga más código del necesario", async ({ page }) => {
    test.skip(!medirTiempos(), "El peso solo significa algo en la versión construida.");
    let bytes = 0;
    page.on("response", (r) => {
      if (/\.js(\?|$)/.test(r.url()) && new URL(r.url()).host === new URL(base()).host) bytes += Number(r.headers()["content-length"] ?? 0);
    });
    await page.goto("/", { waitUntil: "networkidle" });
    // Tope de 2,5 MB de JavaScript (comprimido) propio: hoy está muy por debajo.
    expect(bytes, `${Math.round(bytes / 1024)} KB de JavaScript`).toBeLessThan(2_500_000);
  });
});

test.describe("esqueletos", () => {
  // Cuenta, cuadro por cuadro, cuántos esqueletos se ven desde que la página empieza.
  async function vigilar(page: Page) {
    await page.addInitScript(() => {
      const estado = { cuadros: 0, total: 0, max: 0 };
      (window as unknown as { __esq: typeof estado }).__esq = estado;
      const mirar = () => {
        const n = [...document.querySelectorAll('.animate-pulse,[aria-busy="true"]')].filter((e) => {
          const r = e.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight;
        }).length;
        estado.total += 1;
        if (n) { estado.cuadros += 1; estado.max = Math.max(estado.max, n); }
        requestAnimationFrame(mirar);
      };
      requestAnimationFrame(mirar);
    });
  }
  const medida = (page: Page) => page.evaluate(() => (window as unknown as { __esq: { cuadros: number; total: number; max: number } }).__esq);

  test("las páginas que llegan pintadas del servidor nunca muestran esqueleto", async ({ page }) => {
    test.slow();
    await vigilar(page);
    const conEsqueleto: string[] = [];
    for (const [nombre, tamano] of [["teléfono", TELEFONO], ["computadora", COMPUTADORA]] as const) {
      await page.setViewportSize(tamano);
      for (const ruta of PUBLICAS) {
        await page.goto(ruta, { waitUntil: "load" });
        await page.waitForTimeout(700);
        const m = await medida(page);
        if (m.cuadros > 0) conEsqueleto.push(`${ruta} (${nombre}): ${m.cuadros} de ${m.total} cuadros`);
      }
    }
    expect(conEsqueleto, conEsqueleto.join("\n")).toEqual([]);
  });

  test("una cuenta sin nada no se queda «cargando»: ve el vacío, no un esqueleto", async ({ page }) => {
    test.skip(!canRunSeededRegression(), "Necesita la base de regresión.");
    test.slow();
    let cuenta: DisposableAccount | undefined;
    try {
      cuenta = await createDisposableAccount({ prefix: "sin-nada" });
      await page.setViewportSize(TELEFONO);
      await loginAs(page, cuenta.email, cuenta.password);
      for (const ruta of ["/notificaciones", "/dashboard/profesional?tab=sent_projects", "/dashboard/profesional?tab=saved"]) {
        await gotoOK(page, ruta);
        // Pasado un momento razonable, no queda nada girando ni latiendo.
        await expect.poll(() => page.locator('.animate-pulse, [aria-busy="true"], .animate-spin').filter({ visible: true }).count(), { timeout: 8_000, message: `${ruta} deja de cargar` }).toBe(0);
        await page.waitForTimeout(600);
        expect(await page.locator('.animate-pulse, [aria-busy="true"], .animate-spin').filter({ visible: true }).count(), `${ruta} no vuelve a cargar`).toBe(0);
      }
    } finally {
      await cleanupDisposableAccount(cuenta).catch(() => undefined);
    }
  });

  test("volver a una sección del panel ya visitada no muestra esqueleto", async ({ page }) => {
    test.skip(!canRunSeededRegression(), "Necesita la base de regresión.");
    test.slow();
    await ensureRegressionSeed();
    await page.setViewportSize(TELEFONO);
    await loginAs(page, E2E_USERS.professional.email, E2E_USERS.professional.password);
    const secciones = ["quotes", "sent_projects", "offers", "jobs", "services", "soporte"];
    const ir = async (tab: string) => {
      await page.evaluate((t) => { history.pushState(null, "", `/dashboard/profesional?tab=${t}`); dispatchEvent(new PopStateEvent("popstate")); }, tab);
    };
    // Primera vuelta: cada sección carga lo suyo.
    for (const tab of secciones) {
      await ir(tab);
      await expect.poll(() => page.locator('.animate-pulse, [aria-busy="true"]').filter({ visible: true }).count(), { timeout: 15_000 }).toBe(0);
    }
    // Segunda vuelta: lo que ya se tiene se pinta de una.
    const conEsqueleto: string[] = [];
    for (const tab of secciones) {
      await ir(tab);
      await page.waitForTimeout(120);
      if (await page.locator('.animate-pulse, [aria-busy="true"]').filter({ visible: true }).count()) conEsqueleto.push(tab);
    }
    expect(conEsqueleto, `volvieron a mostrar esqueleto: ${conEsqueleto.join(", ")}`).toEqual([]);
  });
});

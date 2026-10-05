import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "playwright/test";
import { gotoOK, waitForInteractivePage } from "./helpers";
import { canRunSeededRegression, regressionAdminClient } from "./seed";
import { cleanupDisposableAccount, createDisposableAccount, type DisposableAccount } from "./disposable-account";

// LLENAR PRIMERO, CUENTA AL FINAL (4-oct-2026). Quien no tiene sesión llena un
// proyecto, un empleo, una promoción o una cotización completos; al publicar se
// le pide entrar o registrarse y, al volver, el formulario está lleno y se
// publica con un toque. Tres caminos por formulario:
//   1. entrar con una cuenta que ya existe;
//   2. crear una cuenta de cliente;
//   3. crear una cuenta de profesional.
// El alta y la verificación en Supabase se interceptan para no mandar correos
// a direcciones inventadas: el usuario se crea con la llave de administrador
// (generateLink, que no envía nada) y, al escribir el código en la pantalla
// real de verificación, se confirma y se le devuelve a la app una sesión de
// verdad. (El proyecto de test genera códigos de 8 dígitos y la pantalla tiene
// 6: con el código real no se podría.) Todo lo demás es la app de verdad.

test.skip(!canRunSeededRegression(), "Necesita la base de regresión (llave de administrador).");
test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

type Tipo = "proyecto" | "empleo" | "promocion" | "cotizacion";
const ONE_PIXEL_PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z9Z8AAAAASUVORK5CYII=", "base64");
const creadas: DisposableAccount[] = [];
const correosNuevos: string[] = [];

test.afterEach(async () => {
  for (const cuenta of creadas) await cleanupDisposableAccount(cuenta).catch(() => {});
  const admin = regressionAdminClient();
  for (const correo of correosNuevos) {
    const { data } = await admin.from("profiles").select("id").eq("email", correo).maybeSingle();
    const id = (data as { id?: string } | null)?.id;
    if (id) await cleanupDisposableAccount({ id, email: correo, password: "" }).catch(() => {});
  }
  creadas.length = 0;
  correosNuevos.length = 0;
});

// Cada escenario registra cuentas: con su propia IP de origen el límite por
// IP (en memoria, local) no frena a los siguientes.
test.beforeEach(async ({ page }) => {
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` });
});

/** Escribe y comprueba que el texto se queda (si la página aún hidrataba, se borraba). */
async function escribirFirme(campo: ReturnType<Page["locator"]>, texto: string) {
  await expect(async () => {
    await campo.fill(texto);
    await campo.page().waitForTimeout(400);
    await expect(campo).toHaveValue(texto, { timeout: 500 });
  }).toPass({ timeout: 20_000 });
}

/** Marca «Acepto los Términos…» tocando su texto, como una persona. */
async function aceptarTerminos(main: ReturnType<Page["locator"]>) {
  const casilla = main.getByRole("checkbox").first();
  await expect(async () => {
    if (!(await casilla.isChecked())) await main.getByText(/^Acepto los/).first().click();
    await expect(casilla).toBeChecked({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
}

const MARCA = () => `Borrador ${Date.now().toString(36)}`;

/** Llena el formulario sin sesión y toca publicar; devuelve el texto que lo identifica. */
async function llenarSinSesion(page: Page, tipo: Tipo): Promise<string> {
  const marca = MARCA();
  if (tipo === "proyecto") {
    await gotoOK(page, "/publicar-proyecto?categoria=electricidad");
    await waitForInteractivePage(page);
    await page.locator("#publish-project-title").waitFor();
    await escribirFirme(page.locator("textarea").first(), `${marca}: instalar tres tomacorrientes en la cocina.`);
    await page.locator('input[type="tel"]').first().fill("88887777");
    await page.getByRole("button", { name: /^Publicar$/ }).last().click();
  } else if (tipo === "empleo") {
    await gotoOK(page, "/empleos/publicar");
    await waitForInteractivePage(page);
    await escribirFirme(page.locator('input[name="title"]'), marca);
    // El buscador de servicio solo abre ya hidratada la página: se reintenta.
    const buscador = page.getByPlaceholder(/Buscar servicio|Search service/);
    await expect(async () => {
      await page.locator("text=/plomería, electricista|plumbing, electrician/").first().click();
      await expect(buscador).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 30_000 });
    await buscador.fill("Desarrollo web");
    await page.getByRole("button", { name: /^Desarrollo web$/ }).first().click();
    await page.getByRole("button", { name: /^Presencial$/ }).first().click();
    await page.getByRole("option", { name: /^Remoto$/ }).first().click();
    await page.locator('textarea[name="description"]').fill("Empleo escrito sin sesión por la regresión para probar que el borrador sobrevive al registro.");
    await page.getByRole("button", { name: /^Publicar empleo$/ }).click();
  } else if (tipo === "promocion") {
    await gotoOK(page, "/promociones/publicar");
    await waitForInteractivePage(page);
    await escribirFirme(page.locator('input[name="title"]'), marca);
    const buscadorPromo = page.getByPlaceholder(/Ejemplo: Redes e internet/);
    await expect(async () => {
      await page.getByText("Selecciona un servicio", { exact: true }).first().click();
      await expect(buscadorPromo).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 30_000 });
    await buscadorPromo.fill("Desarrollo");
    await page.locator("#offer-service-options").getByRole("option").first().click();
    await page.locator('input[type="tel"]').first().fill("88887777");
    await page.locator('textarea[name="description"]').fill("Promoción escrita sin sesión por la regresión, con foto y precio.");
    await page.locator('input[type="file"]').setInputFiles({ name: "borrador.png", mimeType: "image/png", buffer: ONE_PIXEL_PNG });
    await expect(page.locator('img[src^="blob:"]').first()).toBeVisible({ timeout: 15_000 });
    await page.locator('input[name="price_now"]').fill("45000");
    await page.getByRole("button", { name: /^Publicar promoción$/ }).click();
  } else {
    await gotoOK(page, "/cotizar");
    await waitForInteractivePage(page);
    const dlg = page.getByRole("dialog");
    await escribirFirme(dlg.getByPlaceholder("Ej.: María Rodríguez"), "María Prueba");
    await dlg.getByPlaceholder("Ej.: Instalación de 4 tomas").fill(marca);
    await dlg.getByPlaceholder("Descripción").first().fill("Mano de obra");
    await dlg.getByPlaceholder("0", { exact: true }).first().fill("25000");
    await dlg.getByRole("button", { name: /^Crear cotización$/ }).click();
  }
  await page.waitForURL(/\/login\?redirect=/, { timeout: 30_000 });
  expect(decodeURIComponent(page.url())).toContain("borrador=1");
  return marca;
}

/** Al volver con sesión, el formulario está lleno con lo escrito. */
async function esperarLleno(page: Page, tipo: Tipo, marca: string) {
  // Mientras navega, la lectura puede caer en medio de un cambio de página.
  const conValor = async () => {
    try {
      return (await page.locator("input:visible, textarea:visible").evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value))).join(" | ");
    } catch {
      return "";
    }
  };
  await expect.poll(conValor, { timeout: 45_000, message: `el ${tipo} vuelve lleno` }).toContain(marca);
  if (tipo === "promocion") await expect(page.locator('img[src^="blob:"]').first()).toBeVisible({ timeout: 15_000 });
}

/** Publica y comprueba que quedó guardado de verdad. */
/** ¿Este entorno puede subir fotos? La regresión local de CI no tiene servidor de imágenes (503). */
async function puedeSubirFotos(page: Page): Promise<boolean> {
  const estado = await page.evaluate(async () => {
    try { return (await fetch("/api/upload/photo", { method: "POST", body: new FormData() })).status; } catch { return 0; }
  });
  return estado !== 503 && estado !== 0;
}

async function publicar(page: Page, tipo: Tipo, marca: string) {
  // La promoción lleva foto: sin servidor de imágenes no hay cómo publicarla.
  // Lo que esta prueba cuida —que vuelva llena, con su foto— ya se comprobó.
  if (tipo === "promocion" && !(await puedeSubirFotos(page))) return;
  const api = { proyecto: "/api/projects", empleo: "/api/jobs/posts", promocion: "/api/offers", cotizacion: "/api/quotes" }[tipo];
  const respuesta = page.waitForResponse((r) => new URL(r.url()).pathname === api && r.request().method() === "POST", { timeout: 60_000 });
  const boton = { proyecto: /^Publicar$/, empleo: /^Publicar empleo$/, promocion: /^Publicar promoción$/, cotizacion: /^Crear cotización$/ }[tipo];
  await page.getByRole("button", { name: boton }).filter({ visible: true }).last().click();
  const r = await respuesta;
  expect(r.status(), `${tipo}: ${await r.text().catch(() => "")}`).toBeLessThan(300);
  // El borrador se borra al publicar: no vuelve a aparecer.
  const quedo = await page.evaluate((t) => window.localStorage.getItem(`ccr:borrador:${t}`), tipo);
  expect(quedo).toBeNull();
  void marca;
}

/** Intercepta el alta (sin correo) y deja el código para la pantalla de verificación. */
async function interceptarAlta(page: Page) {
  const admin = regressionAdminClient();
  const estado: { codigo?: string; correo?: string } = {};
  await page.route("**/auth/v1/signup**", async (route) => {
    const cuerpo = route.request().postDataJSON() as { email: string; password: string; data?: Record<string, unknown> };
    const { data, error } = await admin.auth.admin.generateLink({ type: "signup", email: cuerpo.email, password: cuerpo.password, options: { data: cuerpo.data ?? {} } });
    if (error || !data.user) return route.fulfill({ status: 400, json: { msg: error?.message ?? "sin usuario" } });
    estado.codigo = "123456";
    estado.correo = cuerpo.email;
    correosNuevos.push(cuerpo.email);
    await route.fulfill({ status: 200, json: data.user });
  });
  await page.route("**/auth/v1/verify**", async (route) => {
    if (!estado.correo) return route.continue();
    const { data: lista } = await admin.from("profiles").select("id").eq("email", estado.correo).maybeSingle();
    void lista;
    const { data: usuarios } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    const usuario = usuarios.users.find((u) => u.email === estado.correo);
    if (!usuario) return route.fulfill({ status: 400, json: { msg: "sin usuario" } });
    await admin.auth.admin.updateUserById(usuario.id, { email_confirm: true });
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    const { data: entrada, error } = await anon.auth.signInWithPassword({ email: estado.correo, password: CLAVE });
    if (error || !entrada.session) return route.fulfill({ status: 400, json: { msg: error?.message ?? "sin sesión" } });
    await route.fulfill({ status: 200, json: { ...entrada.session, user: entrada.user } });
  });
  return estado;
}

async function escribirCodigo(page: Page, codigo: string) {
  const casillas = page.locator('input[inputmode="numeric"]').filter({ visible: true });
  await expect(casillas.first()).toBeVisible({ timeout: 30_000 });
  // Como si se pegara: la casilla acepta los 6 dígitos de una vez. Si la
  // pantalla aún no estaba lista, se vuelve a intentar hasta que se envía.
  for (let intento = 0; intento < 6; intento++) {
    const enviada = page.waitForRequest((r) => r.url().includes("/auth/v1/verify"), { timeout: 4_000 }).then(() => true, () => false);
    await casillas.first().fill(codigo);
    if (await enviada) return;
  }
  throw new Error("La pantalla de verificación nunca envió el código.");
}

async function entrar(page: Page, correo: string, clave: string) {
  const main = page.locator("main");
  const conCorreo = main.getByRole("button", { name: /correo|email/i }).first();
  if (await conCorreo.isVisible().catch(() => false)) await conCorreo.click();
  await main.locator('input[type="email"]').fill(correo);
  await main.locator('input[type="password"]').fill(clave);
  // La casilla de términos solo se toca si el botón la está esperando.
  const ingresar = main.getByRole("button", { name: /^Ingresar$/ }).first();
  if (await ingresar.isDisabled().catch(() => false)) await main.getByRole("checkbox").first().check({ force: true });
  await ingresar.click();
}

const correoNuevo = (tipo: string) => `borrador-${tipo}-${Date.now()}-${randomUUID().slice(0, 6)}@contratacr.test`;
const CLAVE = `Borrador!${randomUUID().slice(0, 8)}aA1`;

async function registrarCliente(page: Page, tipo: Tipo) {
  const alta = await interceptarAlta(page);
  await page.locator("main").getByRole("link", { name: /Regístrate|Crear cuenta|Sign up/i }).first().click();
  await page.waitForURL(/\/registro\?/, { timeout: 30_000 });
  await page.locator('a[href*="/registro/cliente"]').first().click();
  await page.waitForURL(/\/registro\/cliente/, { timeout: 30_000 });
  const main = page.locator("main");
  await main.getByPlaceholder("Tu nombre y apellidos").fill("Cliente Borrador");
  await main.locator('input[type="email"]').fill(correoNuevo(tipo));
  await main.getByPlaceholder("Mínimo 8 caracteres").fill(CLAVE);
  await main.getByPlaceholder("Repite tu contraseña").fill(CLAVE);
  const tel = main.locator('input[type="tel"]');
  if (await tel.count()) await tel.first().fill("88886666");
  await aceptarTerminos(main);
  await main.getByRole("button", { name: /Crear cuenta|Continuar|Registrarme/i }).last().click();
  await expect.poll(() => alta.codigo, { timeout: 30_000 }).toBeTruthy();
  await escribirCodigo(page, alta.codigo!);
}

/**
 * Los profesionales que esta prueba registra de verdad NO deben salir en la
 * búsqueda: la lista pública se guarda en caché, y uno que aparece y luego se
 * borra le mueve la pantalla a las pruebas que corren después (así falló
 * «/buscar no salta» en la exhaustiva del 5-oct).
 */
async function ocultarDelBuscador() {
  const correo = correosNuevos[correosNuevos.length - 1];
  if (!correo) return;
  const admin = regressionAdminClient();
  await expect.poll(async () => {
    const { data: perfil } = await admin.from("profiles").select("id").eq("email", correo).maybeSingle();
    const id = (perfil as { id?: string } | null)?.id;
    if (!id) return 0;
    const { data } = await admin.from("professionals").update({ oculto_del_buscador: true }).eq("profile_id", id).select("id");
    return (data ?? []).length;
  }, { timeout: 30_000, message: "el profesional recién registrado queda fuera del buscador" }).toBeGreaterThan(0);
}

/** Pasos 2 y 3 del registro de profesional: servicio, lugar, WhatsApp y publicar. */
async function completarPerfilProfesional(page: Page) {
  const main = page.locator("main");
  await main.getByRole("button", { name: "Busca tu servicio" }).click();
  await page.getByPlaceholder("Buscar servicio...").fill("Desarrollo web");
  await page.getByRole("button", { name: /^Desarrollo web/ }).or(page.getByRole("option", { name: /^Desarrollo web/ })).first().click();
  await main.getByRole("button", { name: /^Provincia$/ }).first().click();
  await page.getByRole("option", { name: /^Alajuela$/ }).first().click();
  await main.getByRole("button", { name: /Agregar toda la provincia/ }).click();
  const tel = main.locator('input[type="tel"]');
  if (!(await tel.inputValue())) await tel.fill("88885555");
  await main.getByRole("button", { name: /^Continuar$/ }).click();
  await main.getByRole("button", { name: /^Publicar mi perfil$/ }).click();
  await ocultarDelBuscador();
}

/** Crea la cuenta de profesional desde cero (sin identificación) y llena el perfil. */
async function registrarProfesional(page: Page, tipo: Tipo) {
  const alta = await interceptarAlta(page);
  await page.locator("main").getByRole("link", { name: /Regístrate|Crear cuenta|Sign up/i }).first().click();
  await page.waitForURL(/\/registro\?/, { timeout: 30_000 });
  await page.locator('a[href*="/registro/profesional"]').first().click();
  await page.waitForURL(/\/registro\/profesional/, { timeout: 30_000 });
  const main = page.locator("main");
  await main.getByRole("button", { name: "Registrarme sin identificación por ahora" }).click();
  await main.getByPlaceholder("Tu nombre completo").fill("Pro Borrador Prueba");
  await main.locator('input[type="email"]').fill(correoNuevo(tipo));
  await main.getByPlaceholder("Mínimo 8 caracteres").fill(CLAVE);
  await main.getByPlaceholder("Repite tu contraseña").fill(CLAVE);
  await aceptarTerminos(main);
  await main.getByRole("button", { name: /^Continuar$/ }).click();
  await expect.poll(() => alta.codigo, { timeout: 30_000 }).toBeTruthy();
  await escribirCodigo(page, alta.codigo!);
  await completarPerfilProfesional(page);
}

for (const tipo of ["proyecto", "empleo", "promocion", "cotizacion"] as Tipo[]) {
  test(`${tipo}: sin sesión → entrar con una cuenta existente → vuelve lleno y se publica`, async ({ page }) => {
    test.slow();
    const cuenta = await createDisposableAccount({ prefix: `borrador-${tipo}`, professional: tipo !== "proyecto" });
    creadas.push(cuenta);
    const marca = await llenarSinSesion(page, tipo);
    await entrar(page, cuenta.email, cuenta.password);
    await esperarLleno(page, tipo, marca);
    await publicar(page, tipo, marca);
  });

  test(`${tipo}: sin sesión → crear cuenta de cliente → vuelve lleno y se publica`, async ({ page }) => {
    test.slow();
    const marca = await llenarSinSesion(page, tipo);
    await registrarCliente(page, tipo);
    if (tipo !== "proyecto") {
      // Empleos, promociones y cotizaciones son de profesionales: la cuenta de
      // cliente pasa por el registro de profesional y después vuelve.
      await page.waitForURL(/\/registro\/profesional\?redirect=.*borrador%3D1/, { timeout: 45_000 });
      // Espera a que el paso 1 termine de cargar los datos de la cuenta.
      await page.getByRole("button", { name: "Registrarme sin identificación por ahora" }).waitFor({ timeout: 30_000 });
      // Ya con sesión, el primer paso pide solo lo que falta; luego el perfil.
      const main = page.locator("main");
      const continuar = main.getByRole("button", { name: /^Continuar$/ });
      await continuar.waitFor({ timeout: 30_000 });
      const sinId = main.getByRole("button", { name: "Registrarme sin identificación por ahora" });
      if (await sinId.isVisible().catch(() => false)) await sinId.click();
      const nombre = main.getByPlaceholder("Tu nombre completo");
      if (await nombre.isVisible().catch(() => false) && !(await nombre.inputValue())) await nombre.fill("Cliente Borrador");
      if (await main.getByText(/^Acepto los/).first().isVisible().catch(() => false)) await aceptarTerminos(main);
      await continuar.click();
      await completarPerfilProfesional(page);
    }
    await esperarLleno(page, tipo, marca);
    await publicar(page, tipo, marca);
  });
  test(`${tipo}: sin sesión → crear cuenta de profesional → vuelve lleno y se publica`, async ({ page }) => {
    test.slow();
    const marca = await llenarSinSesion(page, tipo);
    await registrarProfesional(page, tipo);
    await esperarLleno(page, tipo, marca);
    await publicar(page, tipo, marca);
  });
}



// EL REGISTRO DE PROFESIONAL, PASO A PASO (lista de Isaac del 5-oct-2026).
// Cada comprobación es algo que estuvo roto o que se pidió a mano: si alguna
// se pierde, esta prueba lo dice antes que un usuario.
test("registro de profesional: contraseña, provincia, tarifa, fijo, abre arriba y avisos de bienvenida", async ({ page }) => {
  test.slow();
  await gotoOK(page, "/registro/profesional");
  await waitForInteractivePage(page);
  const alta = await interceptarAlta(page);
  const main = page.locator("main");
  await main.getByRole("button", { name: "Registrarme sin identificación por ahora" }).click();
  await escribirFirme(main.getByPlaceholder("Tu nombre completo"), "Pro Ajustes Octubre");
  const correo = correoNuevo("ajustes");
  await main.locator('input[type="email"]').fill(correo);
  await main.getByPlaceholder("Mínimo 8 caracteres").fill(CLAVE);

  // 1. «Confirmar contraseña» existe y frena cuando no coincide.
  await main.getByPlaceholder("Repite tu contraseña").fill(`${CLAVE}x`);
  await aceptarTerminos(main);
  await main.getByRole("button", { name: /^Continuar$/ }).click();
  await expect(main.getByText("Las contraseñas no coinciden")).toBeVisible();
  expect(alta.codigo, "con contraseñas distintas no se crea la cuenta").toBeUndefined();
  await main.getByPlaceholder("Repite tu contraseña").fill(CLAVE);
  await main.getByRole("button", { name: /^Continuar$/ }).click();
  await expect.poll(() => alta.codigo, { timeout: 30_000 }).toBeTruthy();

  // 2. La pantalla del código abre ARRIBA (venía del formulario, desplazado).
  await expect(page.locator('input[inputmode="numeric"]').filter({ visible: true }).first()).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => page.evaluate(() => Math.round(window.scrollY)), { timeout: 3_000 }).toBeLessThanOrEqual(4);
  await escribirCodigo(page, alta.codigo!);

  // 3. Paso 2: la tarifa va junto al servicio, con su texto corto.
  await main.getByRole("button", { name: "Busca tu servicio" }).waitFor({ timeout: 30_000 });
  await expect(main.getByText("¿Desde cuánto cobras por hora?")).toBeVisible();
  await expect(main.getByText(/tu perfil dirá «Consultar precio»/)).toBeVisible();

  // 4. «Agregar toda la provincia» no existe hasta elegir una provincia.
  const agregarProvincia = main.getByRole("button", { name: /Agregar toda la provincia/ });
  await expect(agregarProvincia).toHaveCount(0);
  await main.getByRole("button", { name: "Busca tu servicio" }).click();
  await page.getByPlaceholder("Buscar servicio...").fill("Desarrollo web");
  await page.getByRole("button", { name: /^Desarrollo web/ }).or(page.getByRole("option", { name: /^Desarrollo web/ })).first().click();

  // 5. «Todo el país» no cuenta como lugar: sin provincia, el aviso lo explica.
  await main.getByRole("switch", { name: /todo el país/ }).or(main.getByText("Trabajo a domicilio en todo el país")).first().click();
  await main.locator('input[type="tel"]').fill("88885555");
  await main.getByRole("button", { name: /^Continuar$/ }).click();
  await expect(main.getByText(/Además de todo el país, elige de dónde sales/)).toBeVisible();
  await expect(main.getByText("Todo Costa Rica")).toHaveCount(0);

  await main.getByRole("button", { name: /^Provincia$/ }).first().click();
  await page.getByRole("option", { name: /^Alajuela$/ }).first().click();
  await expect(agregarProvincia).toBeVisible();
  await agregarProvincia.click();

  // 6. Un teléfono fijo no sirve de WhatsApp.
  await main.locator('input[type="tel"]').fill("22223333");
  await main.getByRole("button", { name: /^Continuar$/ }).click();
  await expect(main.getByText(/parece de teléfono fijo/)).toBeVisible();
  await main.locator('input[type="tel"]').fill("88885555");
  await main.getByRole("button", { name: /^Continuar$/ }).click();

  // 7. Paso 3: solo la foto; la tarifa ya no está ahí.
  const publicarPerfil = main.getByRole("button", { name: /^Publicar mi perfil$/ });
  await publicarPerfil.waitFor({ timeout: 30_000 });
  await expect(main.getByText("¿Desde cuánto cobras por hora?")).toHaveCount(0);
  await publicarPerfil.click();

  // 8. Cae en «Completa tu perfil», con los opcionales en su propio grupo.
  await page.waitForURL(/tab=completion/, { timeout: 60_000 });
  await ocultarDelBuscador();
  await expect(page.getByText("Opcionales", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("opcional", { exact: true })).toHaveCount(0);

  // 9. Los dos avisos de bienvenida EXISTEN en la base (el 4-oct la base los
  //    rechazaba en silencio y en producción no llegó ninguno).
  const admin = regressionAdminClient();
  const { data: perfil } = await admin.from("profiles").select("id").eq("email", correo).maybeSingle();
  const idPerfil = (perfil as { id?: string } | null)?.id;
  expect(idPerfil, "la cuenta nueva tiene perfil").toBeTruthy();
  await expect.poll(async () => {
    const { data } = await admin.from("notifications").select("type").eq("user_id", idPerfil!);
    return (data ?? []).map((f) => (f as { type: string }).type).sort().join(",");
  }, { timeout: 15_000 }).toBe("completa_perfil,invita_proyecto");

  // 10. Notificaciones: el texto se lee COMPLETO y cada aviso lleva su raya.
  await gotoOK(page, "/notificaciones");
  const largo = page.getByText(/Es para pedir un servicio, no para ofrecerlo\./);
  await expect(largo).toBeVisible({ timeout: 30_000 });
  const medidas = await largo.evaluate((el) => {
    const fila = el.closest('[role="button"]') as HTMLElement;
    return { cortado: el.scrollHeight > el.clientHeight + 1, raya: getComputedStyle(fila).borderBottomWidth, derecha: parseFloat(getComputedStyle(fila).paddingRight) };
  });
  expect(medidas.cortado, "el aviso no se corta").toBe(false);
  expect(medidas.raya).toBe("1px");
  expect(medidas.derecha, "sin hueco grande a la derecha en el teléfono").toBeLessThanOrEqual(48);
  await expect(page.getByText(/Los perfiles con foto, descripción y precios reciben más clientes/)).toBeVisible();
});

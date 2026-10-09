import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "playwright/test";
import { gotoOK, waitForInteractivePage } from "./helpers";
import { canRunSeededRegression, regressionAdminClient } from "./seed";
import { cleanupDisposableAccount } from "./disposable-account";

// DESPUÉS DE CREAR LA CUENTA (9-oct-2026). Isaac creó una cuenta de cliente,
// tocó «Ir a mi panel» y cayó en «Ingresa a tu cuenta»: la cuenta recién hecha
// no llegaba con sesión al panel. Aquí se recorre cada salida de la pantalla
// final, para cliente y para profesional, y se exige que lleve a donde dice y
// con la sesión puesta.
//
// El alta se intercepta igual que en borrador-sin-sesion.spec.ts: el usuario se
// crea con la llave de administrador (generateLink, no manda correos) y al
// escribir el código se le devuelve a la app una sesión real.

test.skip(!canRunSeededRegression(), "Necesita la base de regresión (llave de administrador).");
test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

const CLAVE = `Despues!${randomUUID().slice(0, 8)}aA1`;
const correosNuevos: string[] = [];
const correoNuevo = (tipo: string) => `despues-${tipo}-${Date.now()}-${randomUUID().slice(0, 6)}@contratacr.test`;

test.afterEach(async () => {
  const admin = regressionAdminClient();
  for (const correo of correosNuevos) {
    const { data } = await admin.from("profiles").select("id").eq("email", correo).maybeSingle();
    const id = (data as { id?: string } | null)?.id;
    if (id) await cleanupDisposableAccount({ id, email: correo, password: "" }).catch(() => {});
  }
  correosNuevos.length = 0;
});

test.beforeEach(async ({ page }) => {
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` });
});

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
  for (let intento = 0; intento < 6; intento++) {
    const enviada = page.waitForRequest((r) => r.url().includes("/auth/v1/verify"), { timeout: 4_000 }).then(() => true, () => false);
    await casillas.first().fill(codigo);
    if (await enviada) return;
  }
  throw new Error("La pantalla de verificación nunca envió el código.");
}

async function aceptarTerminos(page: Page) {
  const casilla = page.locator("main").getByRole("checkbox").first();
  if (await casilla.count()) await casilla.check({ force: true }).catch(() => {});
}

/** Crea una cuenta de cliente desde /registro/cliente y deja la pantalla de «cuenta creada». */
async function crearCliente(page: Page) {
  const alta = await interceptarAlta(page);
  await gotoOK(page, "/registro/cliente");
  await waitForInteractivePage(page);
  const main = page.locator("main");
  await main.getByPlaceholder("Tu nombre y apellidos").fill("Cliente Recién Creado");
  await main.locator('input[type="email"]').fill(correoNuevo("cliente"));
  await main.getByPlaceholder("Mínimo 8 caracteres").fill(CLAVE);
  await main.getByPlaceholder("Repite tu contraseña").fill(CLAVE);
  const tel = main.locator('input[type="tel"]');
  if (await tel.count()) await tel.first().fill("88886666");
  await aceptarTerminos(page);
  await main.getByRole("button", { name: /Crear cuenta|Continuar|Registrarme/i }).last().click();
  await expect.poll(() => alta.codigo, { timeout: 30_000 }).toBeTruthy();
  await escribirCodigo(page, alta.codigo!);
  await expect(main.getByRole("button", { name: /^Ir a mi panel$/ })).toBeVisible({ timeout: 30_000 });
}

/** El panel abrió con sesión: ni la pantalla de entrar ni un salto a /login. */
async function exigirPanelConSesion(page: Page) {
  await page.waitForURL(/\/dashboard\/profesional/, { timeout: 30_000 });
  // El salto a /login llega después de que el panel monta y mira la sesión.
  await page.waitForTimeout(3_000);
  expect(new URL(page.url()).pathname, "el panel no puede mandar a entrar a una cuenta recién creada").not.toMatch(/\/login/);
  await expect(page.getByText(/Ingresa a tu cuenta/)).toHaveCount(0);
}

/** En la app (rama nativa, ?nativePreview=1) la bienvenida ya se vio. */
async function entrarComo(page: Page, ambiente: "web" | "app") {
  if (ambiente === "web") return;
  await page.addInitScript(() => {
    try { window.localStorage.setItem("ccr:native-first-run-onboarding:v12", "1"); } catch {}
  });
  await gotoOK(page, "/?nativePreview=1");
  await waitForInteractivePage(page);
}

for (const ambiente of ["web", "app"] as const) {
  test(`${ambiente}: cliente recién creado: «Ir a mi panel» abre su panel con la sesión puesta`, async ({ page }) => {
      await entrarComo(page, ambiente);
    await crearCliente(page);
    await page.locator("main").getByRole("button", { name: /^Ir a mi panel$/ }).click();
    await exigirPanelConSesion(page);
  });

  test(`${ambiente}: con otra cuenta abierta antes (entrar, salir, crear cliente), «Ir a mi panel» abre su panel`, async ({ page }) => {
    await entrarComo(page, ambiente);
    // Como Isaac el 9-oct: el teléfono ya tenía una sesión de profesional; se
    // sale desde el menú y se crea la cuenta nueva en el mismo aparato.
    await gotoOK(page, "/login");
    await waitForInteractivePage(page);
    const main = page.locator("main");
    const conCorreo = main.getByRole("button", { name: /correo|email/i }).first();
    if (await conCorreo.isVisible().catch(() => false)) await conCorreo.click();
    await main.locator('input[type="email"]').fill("e2e.pro@contratacr.test");
    await main.locator('input[type="password"]').fill(process.env.E2E_TEST_PASSWORD!);
    const ingresar = main.getByRole("button", { name: /^Ingresar$/ }).first();
    if (await ingresar.isDisabled().catch(() => false)) await main.getByRole("checkbox").first().check({ force: true });
    await ingresar.click();
    await page.waitForURL(/\/dashboard\//, { timeout: 30_000 });
    await page.getByRole("button", { name: /Abrir men[uú]/i }).filter({ visible: true }).first().click();
    await page.locator(".ccr-menu-completo.ccr-menu-abierto").getByRole("button", { name: /^Salir$/ }).click();
    await expect(page.getByRole("button", { name: /Abrir men[uú]/i }).filter({ visible: true }).first()).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(1_500);
    await crearCliente(page);
    await page.locator("main").getByRole("button", { name: /^Ir a mi panel$/ }).click();
    await exigirPanelConSesion(page);
  });

  test(`${ambiente}: cliente recién creado: «Buscar profesionales» abre la búsqueda con la sesión puesta`, async ({ page }) => {
      await entrarComo(page, ambiente);
    await crearCliente(page);
    await page.locator("main").getByRole("button", { name: /^Buscar profesionales$/ }).click();
    await page.waitForURL(/\/profesionales(?:\?|$)/, { timeout: 30_000 });
    await page.waitForTimeout(2_000);
    expect(new URL(page.url()).pathname).not.toMatch(/\/login/);
    // Con sesión, el menú muestra la cuenta y no «Ingresar».
    await page.getByRole("button", { name: /Abrir men[uú]/i }).filter({ visible: true }).first().click();
    await expect(page.locator(".ccr-menu-completo.ccr-menu-abierto").getByRole("link", { name: /^Ingresar$/ })).toHaveCount(0);
  });

  test(`${ambiente}: profesional recién creado: al publicar el perfil llega a su panel con la sesión puesta`, async ({ page }) => {
      await entrarComo(page, ambiente);
    const alta = await interceptarAlta(page);
    await gotoOK(page, "/registro/profesional");
    await waitForInteractivePage(page);
    const main = page.locator("main");
    await main.getByRole("button", { name: "Registrarme sin identificación por ahora" }).click();
    await main.getByPlaceholder("Tu nombre completo").fill("Pro Recién Creado");
    await main.locator('input[type="email"]').fill(correoNuevo("pro"));
    await main.getByPlaceholder("Mínimo 8 caracteres").fill(CLAVE);
    await main.getByPlaceholder("Repite tu contraseña").fill(CLAVE);
    await aceptarTerminos(page);
    await main.getByRole("button", { name: /^Continuar$/ }).click();
    await expect.poll(() => alta.codigo, { timeout: 30_000 }).toBeTruthy();
    await escribirCodigo(page, alta.codigo!);
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
    // Fuera del buscador: un perfil que aparece y se borra mueve la lista en caché.
    const admin = regressionAdminClient();
    await expect.poll(async () => {
      const correo = correosNuevos[correosNuevos.length - 1];
      const { data: perfil } = await admin.from("profiles").select("id").eq("email", correo).maybeSingle();
      const id = (perfil as { id?: string } | null)?.id;
      if (!id) return 0;
      const { data } = await admin.from("professionals").update({ oculto_del_buscador: true }).eq("profile_id", id).select("id");
      return (data ?? []).length;
    }, { timeout: 30_000 }).toBeGreaterThan(0);
    await exigirPanelConSesion(page);
  });
}

import { createClient } from "@supabase/supabase-js";
import { expect, request as peticiones, test, type Page } from "playwright/test";
import { gotoOK, resetAuth, waitForInteractivePage } from "./helpers";
import { canRunSeededRegression, regressionAdminClient } from "./seed";
import { cleanupDisposableAccount, createDisposableAccount, type DisposableAccount } from "./disposable-account";

// «Editar datos» de la ficha de usuario del admin (7-oct-2026): nombre, nombre
// comercial, WhatsApp y correo se cambian desde la pantalla; el WhatsApp nuevo
// entra en las publicaciones que tenían el número viejo y en ninguna otra; con
// el correo nuevo la persona entra con su misma contraseña; todo queda en el
// historial. La contraseña nunca la escribe el admin: se manda el enlace.

const WA_VIEJO = "50670009911";
const WA_NUEVO = "50670009922";
const WA_DE_ENCARGADO = "50670009933";

async function entrarComoAdmin(page: Page, cuenta: DisposableAccount) {
  await resetAuth(page);
  await gotoOK(page, "/admin");
  await waitForInteractivePage(page);
  await page.getByPlaceholder(/Correo de administrador/i).fill(cuenta.email);
  await page.getByPlaceholder(/Contrase.a|Contrasena/i).fill(cuenta.password);
  await page.getByRole("button", { name: /Ingresar/i }).click();
  await expect(page.getByPlaceholder(/Correo de administrador/i)).toBeHidden({ timeout: 20_000 });
}

test.describe("@admin editar datos de un usuario", () => {
  test.skip(!canRunSeededRegression(), "Requires the isolated test project.");

  let admin: DisposableAccount | undefined;
  let pro: DisposableAccount | undefined;
  const empleos: string[] = [];

  test.afterAll(async () => {
    const db = regressionAdminClient();
    if (empleos.length) await db.from("job_posts").delete().in("id", empleos);
    await cleanupDisposableAccount(pro);
    await cleanupDisposableAccount(admin);
  });

  test("cambia nombre, WhatsApp y correo, y lo deja en el historial", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium-desktop", "El panel de administración se prueba en escritorio.");
    test.setTimeout(150_000);
    const db = regressionAdminClient();
    admin = await createDisposableAccount({ prefix: "admin-datos", admin: true });
    pro = await createDisposableAccount({ prefix: "pro-datos", professional: true });

    await db.from("profiles").update({ phone: WA_VIEJO }).eq("id", pro.id);
    await db.from("professionals").update({ whatsapp: WA_VIEJO, call_phone: WA_VIEJO }).eq("id", pro.professionalId!);
    for (const contacto of [WA_VIEJO, WA_DE_ENCARGADO]) {
      const { data, error } = await db.from("job_posts").insert({
        employer_id: pro.professionalId,
        title: `Vacante de prueba ${contacto}`,
        description: "Vacante desechable de la prueba de editar datos.",
        employment_type: "contract",
        workplace_type: "remote",
        salary_period: "project",
        currency: "CRC",
        status: "draft",
        contact_whatsapp: contacto,
      }).select("id").single();
      if (error) throw error;
      empleos.push(data.id);
    }

    // Con PRUEBA_CORREO_REAL el correo nuevo es un alias del buzón de soporte, y el
    // enlace de contraseña llega de verdad. Sin eso, un dominio .test.
    const correoReal = process.env.PRUEBA_CORREO_REAL?.trim();
    const correoNuevo = correoReal || `nuevo-${pro.email}`;
    const nombreNuevo = `Nombre editado ${Date.now()}`;
    const negocioNuevo = `Negocio editado ${Date.now()}`;

    await entrarComoAdmin(page, admin);
    await gotoOK(page, `/admin/usuarios/${pro.id}`);
    await page.getByRole("button", { name: "Editar datos" }).click();
    const formulario = page.locator("[data-editar-datos]");
    await expect(formulario).toBeVisible();
    await formulario.getByLabel("Nombre", { exact: true }).fill(nombreNuevo);
    await formulario.getByLabel("Nombre comercial").fill(negocioNuevo);
    await formulario.locator("#admin-datos-whatsapp").fill(WA_NUEVO.slice(3));
    await formulario.getByLabel("Correo").fill(correoNuevo);
    await formulario.getByRole("button", { name: "Guardar cambios" }).click();

    await expect(page.getByRole("status")).toContainText("Datos guardados", { timeout: 20_000 });
    await expect(page.getByRole("status")).toContainText("1 empleo");

    const { data: perfil } = await db.from("profiles").select("full_name, phone, email").eq("id", pro.id).single();
    expect(perfil).toMatchObject({ full_name: nombreNuevo, phone: WA_NUEVO, email: correoNuevo });
    const { data: ficha } = await db.from("professionals").select("business_name, whatsapp, call_phone").eq("id", pro.professionalId!).single();
    // Las llamadas iban al mismo número viejo: siguen al nuevo.
    expect(ficha).toMatchObject({ business_name: negocioNuevo, whatsapp: WA_NUEVO, call_phone: WA_NUEVO });
    const { data: vacantes } = await db.from("job_posts").select("id, contact_whatsapp").in("id", empleos);
    expect(vacantes?.find((v) => v.id === empleos[0])?.contact_whatsapp).toBe(WA_NUEVO);
    // La del encargado tenía otro número a propósito: no se toca.
    expect(vacantes?.find((v) => v.id === empleos[1])?.contact_whatsapp).toBe(WA_DE_ENCARGADO);

    const { data: auth } = await db.auth.admin.getUserById(pro.id);
    expect(auth.user?.email).toBe(correoNuevo);
    expect(auth.user?.user_metadata?.full_name).toBe(nombreNuevo);

    // Entra con el correo nuevo y su misma contraseña.
    const publico = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error: entrada } = await publico.auth.signInWithPassword({ email: correoNuevo, password: pro.password });
    expect(entrada).toBeNull();

    const { data: registro } = await db
      .from("user_action_audit")
      .select("actor_user_id, before_data, after_data, metadata")
      .eq("entity_owner_user_id", pro.id)
      .eq("action", "admin_edit_user_data");
    expect(registro).toHaveLength(1);
    expect(registro![0].actor_user_id).toBe(admin.id);
    expect(registro![0].before_data).toMatchObject({ whatsapp: WA_VIEJO });
    expect(registro![0].after_data).toMatchObject({ whatsapp: WA_NUEVO, correo: correoNuevo, nombre: nombreNuevo });

    const historial = page.locator("details", { hasText: "Historial de cambios" });
    await expect(historial).toBeVisible();
    await historial.locator("summary").click();
    await expect(historial).toContainText("7000-9911 → 7000-9922");

    // El enlace de contraseña solo se manda cuando hay un buzón real (o en la base
    // local del CI, donde el envío se omite y el enlace igual se genera).
    if (correoReal || process.env.LOCAL_REGRESSION_SEED === "1") {
      page.once("dialog", (dialogo) => void dialogo.accept());
      await page.getByRole("button", { name: /Enviar enlace para cambiar contrase/ }).click();
      await expect(page.getByRole("status")).toContainText(`Enlace enviado a ${correoNuevo}`, { timeout: 20_000 });
      await expect(historial).toContainText("Envió el enlace para cambiar la contraseña");
    }

    // Sin sesión de admin, la API no deja cambiar nada.
    const sinSesion = await peticiones.newContext({ baseURL: testInfo.project.use.baseURL });
    const ajeno = await sinSesion.patch(`/api/admin/users/${pro.id}/datos`, { data: { full_name: "Intruso" } });
    expect([401, 403]).toContain(ajeno.status());
    await sinSesion.dispose();
  });
});

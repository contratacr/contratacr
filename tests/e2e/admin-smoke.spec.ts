import { expect, test, type Page } from "playwright/test";
import { expectHealthyPage, expectVisibleText, gotoOK, resetAuth, waitForInteractivePage } from "./helpers";
import { canRunSeededRegression, ensureRegressionSeed, regressionAdminClient, type RegressionSeedState } from "./seed";
import { cleanupDisposableAccount, createDisposableAccount, type DisposableAccount } from "./disposable-account";

const adminRoutes = [
  { path: "/es/admin", marker: /Resumen|Panel de administracion|Panel de administraci.n/i },
  { path: "/es/admin/verificacion", marker: /Verificacion|Verificaci.n/i },
  { path: "/es/admin/usuarios", marker: /Usuarios/i },
  { path: "/es/admin/reportes", marker: /Reportes/i },
  { path: "/es/admin/aseguradoras", marker: /Aseguradoras/i },
  { path: "/es/admin/servicios", marker: /Servicios/i },
  { path: "/es/admin/categorias", marker: /Servicios/i },
  { path: "/es/admin/solicitudes", marker: /Solicitudes/i },
  { path: "/es/admin/publicaciones", marker: /Proyectos/i },
  { path: "/es/admin/empleos", marker: /Empleos/i },
  { path: "/es/admin/ofertas", marker: /Ofertas/i },
  { path: "/es/admin/cuentas", marker: /Cuentas/i },
  { path: "/es/admin/soporte", marker: /Soporte/i },
  { path: "/es/admin/analitica", marker: /Analitica|Anal.tica/i },
  { path: "/es/admin/cobertura", marker: /Cobertura/i },
  { path: "/es/admin/actividad", marker: /Resumen|Actividad reciente/i },
  { path: "/es/admin/resenas", marker: /Rese.nas|Reseñas/i },
] as const;

async function loginAdmin(page: Page, account: DisposableAccount) {
  await resetAuth(page);
  await gotoOK(page, "/es/admin");
  await waitForInteractivePage(page);
  await page.getByPlaceholder(/Correo de administrador/i).fill(account.email);
  await page.getByPlaceholder(/Contrase.a|Contrasena/i).fill(account.password);
  await page.getByRole("button", { name: /Ingresar/i }).click();
  await expect(page.getByPlaceholder(/Correo de administrador/i)).toBeHidden({ timeout: 20_000 });
}

test.describe("@admin surfaces", () => {
  let seed: RegressionSeedState | null = null;

  test.beforeAll(async () => {
    if (canRunSeededRegression()) seed = await ensureRegressionSeed();
  });

  test("admin entry shows the restricted login when signed out", async ({ page }) => {
    await resetAuth(page);
    await gotoOK(page, "/es/admin");
    await expect(page.getByText(/Panel de administracion|Panel de administraci.n/i).first()).toBeVisible();
    await expect(page.getByPlaceholder(/Correo de administrador/i)).toBeVisible();
    await expect(page.getByPlaceholder(/Contrase.a|Contrasena/i)).toBeVisible();
    await expectHealthyPage(page);
  });

  test("admin APIs reject unauthenticated access", async ({ request }) => {
    const routes = [
      "/api/admin/projects",
      "/api/admin/bookings",
      "/api/admin/users",
      "/api/admin/providers",
      "/api/admin/reports",
      "/api/admin/support",
      "/api/admin/accounts",
      "/api/admin/insurers",
      "/api/admin/pending-counts",
      "/api/admin/reviews",
      "/api/admin/marketplace?kind=jobs",
      "/api/admin/marketplace?kind=offers",
      "/api/admin/coverage",
    ];

    for (const route of routes) {
      const response = await request.get(route);
      expect([401, 403], `${route} must reject unauthenticated access`).toContain(response.status());
    }

    for (const method of ["patch", "delete"] as const) {
      const response = await request[method]("/api/admin/reviews", {
        data: { id: "00000000-0000-4000-8000-000000000000", action: "hide", reason: "E2E guard" },
      });
      expect([401, 403], `admin reviews ${method} must reject unauthenticated access`).toContain(response.status());
    }
    const marketplace = await request.patch("/api/admin/marketplace", { data: { kind: "offers", id: "00000000-0000-4000-8000-000000000000", status: "paused" } });
    expect([401, 403]).toContain(marketplace.status());
  });

  test("admin panel sections render with an isolated disposable administrator", async ({ page }) => {
    let account: DisposableAccount | undefined;
    try {
      account = await createDisposableAccount({ prefix: "admin-cycle", admin: true });
      await loginAdmin(page, account);
      await expectVisibleText(page.locator("body"), adminRoutes[0].marker);

      for (const route of adminRoutes) {
        await gotoOK(page, route.path);
        await expectVisibleText(page.locator("body"), route.marker);
        await expectHealthyPage(page);
      }

      if (seed) {
        for (const detail of [
          { path: `/es/admin/usuarios/${seed.clientId}`, marker: /ContrataCR|B.squeda de usuarios/i },
          { path: `/es/admin/proveedores/${seed.professionalId}`, marker: /SG Solutions|Proveedor/i },
        ]) {
          await gotoOK(page, detail.path);
          await expectVisibleText(page.locator("body"), detail.marker);
          await expectHealthyPage(page);
        }
      }
    } finally {
      await cleanupDisposableAccount(account);
    }
  });

  test("admin sections act on real data: marketplace moderation, coverage, services, reviews and growth", async ({ page }) => {
    test.skip(!canRunSeededRegression(), "Requires the isolated test project.");
    test.slow();
    const admin = regressionAdminClient();
    const state = seed ?? (await ensureRegressionSeed());
    const offerTitle = `Oferta admin regression ${Date.now()}`;
    let account: DisposableAccount | undefined;
    let offerId = "";
    try {
      const { data: inserted, error } = await admin
        .from("professional_offers")
        .insert({
          professional_id: state.professionalId,
          title: offerTitle,
          description: "Oferta sembrada por la regresión del panel admin para moderarla desde la interfaz real.",
          offer_type: "service_offer",
          service_label: "Redes e internet",
          image_urls: ["https://res.cloudinary.com/demo/image/upload/sample.jpg"],
          price_now: 50000,
          price_before: 65000,
          currency: "CRC",
          price_unit: "total",
          location_label: "Todo Costa Rica",
          status: "published",
        })
        .select("id")
        .single();
      if (error || !inserted) throw error ?? new Error("Could not seed the admin offer");
      offerId = inserted.id;

      account = await createDisposableAccount({ prefix: "admin-actions", admin: true });
      await loginAdmin(page, account);

      // Ofertas: the owner finds the publication with its creator and moderates it.
      await gotoOK(page, "/es/admin/ofertas");
      await expectVisibleText(page.locator("body"), /en esta vista/);
      await page.getByPlaceholder(/Título, servicio, ubicación, creador o correo/).filter({ visible: true }).first().fill(offerTitle);
      const row = page.locator("li").filter({ hasText: offerTitle }).first();
      await expect(row).toBeVisible();
      await expect(row.getByText("SG Solutions")).toBeVisible();
      await expect(row.getByText("Publicada", { exact: true })).toBeVisible();
      await row.getByRole("button", { name: /^Pausar$/ }).click();
      await expect(row.getByText("Pausada", { exact: true })).toBeVisible();
      await expect.poll(async () => (await admin.from("professional_offers").select("status").eq("id", offerId).single()).data?.status).toBe("paused");
      await row.getByRole("button", { name: /^Publicar$/ }).click();
      await expect(row.getByText("Publicada", { exact: true })).toBeVisible();
      await row.getByRole("button", { name: /^Marcar vencida$/ }).click();
      await expect(row.getByText("Vencida", { exact: true })).toBeVisible();
      await expect.poll(async () => (await admin.from("professional_offers").select("status").eq("id", offerId).single()).data?.status).toBe("expired");
      page.once("dialog", (dialog) => void dialog.accept());
      await row.getByRole("button", { name: /^Eliminar$/ }).click();
      await expect(row).toBeHidden();
      await expect.poll(async () => (await admin.from("professional_offers").select("id").eq("id", offerId).maybeSingle()).data).toBeNull();
      offerId = "";
      await expectHealthyPage(page);

      // Empleos: the seeded SG job lists its creator and the application count.
      await gotoOK(page, "/es/admin/empleos");
      await expectVisibleText(page.locator("body"), /en esta vista/);
      await page.getByPlaceholder(/Título, servicio, ubicación, creador o correo/).filter({ visible: true }).first().fill("SG Solutions");
      await expect(page.locator("li").filter({ hasText: "SG Solutions" }).first()).toBeVisible();
      await expect(page.getByText(/postulaci(?:ón|ones)/).first()).toBeVisible();
      await expectHealthyPage(page);

      // Cobertura: services with supply, every province, a canton by search.
      await gotoOK(page, "/es/admin/cobertura");
      await expectVisibleText(page.locator("body"), /Servicios con oferta/);
      // Every category is on screen, with its services, and the category filter narrows the list.
      await expect(page.getByRole("button", { name: /^Hogar/ }).first()).toBeVisible();
      await expect(page.getByText("Plomería", { exact: true }).first()).toBeVisible();
      await page.getByLabel("Filtrar por categoría").selectOption({ index: 1 });
      await expect(page.getByText(/\d+ · \d+/).first()).toBeVisible();
      await page.getByLabel("Filtrar por categoría").selectOption("all");
      // The filter bar answers "who offers X here?" with the actual professionals.
      await page.getByLabel("Servicio", { exact: true }).selectOption("redes_internet");
      await expectVisibleText(page.locator("body"), /profesionales? cumplen?/);
      await expect(page.getByText("SG Solutions").first()).toBeVisible();
      await page.getByLabel("Provincia", { exact: true }).selectOption("al");
      await expect(page.getByText(/Con sede aquí|Atiende aquí|Todo el país/).first()).toBeVisible();
      await page.getByRole("button", { name: /Limpiar filtros/ }).click();
      await page.getByRole("button", { name: /Provincias y cantones/ }).click();
      for (const province of ["San José", "Alajuela", "Cartago", "Heredia", "Guanacaste", "Puntarenas", "Limón"]) {
        await expect(page.getByRole("button", { name: new RegExp(`^${province}`) }).first()).toBeVisible();
      }
      await page.getByPlaceholder(/Buscar provincia o cantón/).filter({ visible: true }).first().fill("Atenas");
      await expect(page.getByText("Atenas", { exact: true }).first()).toBeVisible();
      await expectHealthyPage(page);

      // Servicios: categories fold with counts; a search shows the service with its professionals.
      await gotoOK(page, "/es/admin/servicios");
      const homeGroup = page.getByRole("button", { name: /^Hogar/ }).first();
      await expect(homeGroup).toBeVisible();
      await expect(homeGroup).toContainText(/servicios · \d+ con profesionales/);
      await page.getByPlaceholder(/Buscar servicio o categoría/).filter({ visible: true }).first().fill("Redes e internet");
      await expect(page.getByText(/\d+ profesionales · \d+ verificados/).first()).toBeVisible();
      await expectHealthyPage(page);

      // Reseñas: the professional behind a seeded review is named, never the generic label.
      await gotoOK(page, "/es/admin/resenas");
      await expect(page.getByText("SG Solutions").first()).toBeVisible();
      await expectHealthyPage(page);

      // Verificación names the identification type of everyone waiting.
      await gotoOK(page, "/es/admin/verificacion");
      await page.getByRole("button", { name: /^Todos/ }).click();
      await expect(page.getByText(/Nacional|Jurídica|DIMEX|NITE|Manual/).first()).toBeVisible();

      // Analítica reads in plain words: this week, the funnel, demand vs supply.
      await gotoOK(page, "/es/admin/analitica");
      await expectVisibleText(page.locator("body"), /Esta semana/);
      await expectVisibleText(page.locator("body"), /semana anterior/);
      await expectVisibleText(page.locator("body"), /Del interés a la contratación/);
      await expectVisibleText(page.locator("body"), /Qué buscan vs\. qué ofrecemos/);
      await expectVisibleText(page.locator("body"), /Desde dónde entran/);
      await expectHealthyPage(page);

      // Resumen: what needs attention today, new accounts and recent activity, in words.
      await gotoOK(page, "/es/admin");
      await expectVisibleText(page.locator("body"), /Qué necesita tu atención|Nada pendiente hoy/);
      await expectVisibleText(page.locator("body"), /Verificaciones por revisar/);
      await expectVisibleText(page.locator("body"), /Cuentas nuevas/);
      await expectVisibleText(page.locator("body"), /Actividad reciente/);
      await expectHealthyPage(page);

      // The account page reads top to bottom: identity, verification, client, professional, reach, support, network, danger zone.
      await gotoOK(page, `/es/admin/usuarios/${state.professionalUserId}`);
      for (const heading of [/Verificación de identidad/, /Como cliente/, /Como profesional/, /Solicitudes recibidas/, /Reseñas recibidas/, /Empleos publicados/, /Ofertas publicadas/, /Alcance del perfil/, /Casos de soporte/, /Reportes recibidos/, /Seguidos y seguidores/, /Eliminar esta cuenta al 100%/]) {
        await expectVisibleText(page.locator("body"), heading);
      }
      await expectHealthyPage(page);
    } finally {
      if (offerId) {
        await admin.from("notifications").delete().eq("type", "followed_professional_activity").eq("data->>content_id", offerId);
        await admin.from("professional_activity").delete().eq("content_id", offerId);
        await admin.from("professional_offers").delete().eq("id", offerId);
      }
      await cleanupDisposableAccount(account);
    }
  });

  test("admin deletes support cases, reports and whole accounts, and a renamed service shows everywhere", async ({ page }) => {
    test.skip(!canRunSeededRegression(), "Requires the isolated test project.");
    test.slow();
    const admin = regressionAdminClient();
    const state = seed ?? (await ensureRegressionSeed());
    const stamp = Date.now();
    const startedAt = new Date(stamp - 60_000).toISOString();
    let account: DisposableAccount | undefined;
    let victim: DisposableAccount | undefined;
    let ticketId = "";
    let reportId = "";
    const renamedId = "redes_internet";
    const originalName = (await admin.from("categories").select("name").eq("id", renamedId).maybeSingle()).data?.name ?? null;
    try {
      const ticket = await admin.from("support_tickets").insert({ user_id: state.clientId, name: "ContrataCR", email: "e2e.client@contratacr.test", subject: `Caso admin regression ${stamp}`, message: "Caso sembrado por la regresión para eliminarlo desde el panel.", status: "open", topic: "cuenta" }).select("id").single();
      if (ticket.error || !ticket.data) throw ticket.error ?? new Error("ticket");
      ticketId = ticket.data.id;
      const report = await admin.from("reports").insert({ professional_id: state.professionalId, professional_name: "SG Solutions", reason: `Reporte admin regression ${stamp}`, reporter_email: "e2e.client@contratacr.test", status: "open" }).select("id").single();
      if (report.error || !report.data) throw report.error ?? new Error("report");
      reportId = report.data.id;
      victim = await createDisposableAccount({ prefix: "admin-delete" });
      account = await createDisposableAccount({ prefix: "admin-deleter", admin: true });
      await loginAdmin(page, account);

      // Soporte: open the case and delete it with its thread.
      await gotoOK(page, "/es/admin/soporte");
      await page.getByText(`Caso admin regression ${stamp}`).first().click();
      await expectVisibleText(page.locator("body"), /Eliminar caso/);
      page.once("dialog", (dialog) => void dialog.accept());
      await page.getByRole("button", { name: /Eliminar caso/ }).click();
      await expect.poll(async () => (await admin.from("support_tickets").select("id").eq("id", ticketId).maybeSingle()).data).toBeNull();
      ticketId = "";
      await expectHealthyPage(page);

      // Reportes: delete the record.
      await gotoOK(page, "/es/admin/reportes");
      const reportRow = page.locator("li").filter({ hasText: `Reporte admin regression ${stamp}` }).first();
      await expect(reportRow).toBeVisible();
      page.once("dialog", (dialog) => void dialog.accept());
      await reportRow.getByRole("button", { name: /^Eliminar$/ }).click();
      await expect.poll(async () => (await admin.from("reports").select("id").eq("id", reportId).maybeSingle()).data).toBeNull();
      reportId = "";
      await expectHealthyPage(page);

      // Usuarios: delete a whole account from its profile (confirm + typed word).
      await gotoOK(page, `/es/admin/usuarios/${victim.id}`);
      await expectVisibleText(page.locator("body"), /Eliminar esta cuenta al 100%/);
      page.on("dialog", (dialog) => void (dialog.type() === "prompt" ? dialog.accept("ELIMINAR") : dialog.accept()));
      await page.getByRole("button", { name: /Eliminar cuenta/ }).click();
      await page.waitForURL(/\/admin\/usuarios\?deleted=1/, { timeout: 60_000, waitUntil: "domcontentloaded" });
      await expect.poll(async () => {
        const { data } = await admin.auth.admin.getUserById(victim!.id);
        return data?.user ? "exists" : "gone";
      }, { timeout: 30_000 }).toBe("gone");
      await expectHealthyPage(page);

      // Servicios: a renamed service is what the server renders, not only what the browser patches later.
      const marker = `Redes e internet ${stamp}`;
      await admin.from("categories").update({ name: marker }).eq("id", renamedId);
      await expect.poll(async () => (await page.request.get(`/es/buscar?categoria=${renamedId}`)).text().then((html) => html.includes(marker)), { timeout: 45_000, intervals: [2_000] }).toBe(true);
      const professionalSlug = (await admin.from("professionals").select("slug").eq("id", state.professionalId).single()).data?.slug;
      expect(professionalSlug).toBeTruthy();
      await expect.poll(async () => (await page.request.get(`/es/profesionales/${professionalSlug}`)).text().then((html) => html.includes(marker)), { timeout: 45_000, intervals: [2_000] }).toBe(true);
    } finally {
      if (originalName) await admin.from("categories").update({ name: originalName }).eq("id", renamedId);
      if (ticketId) await admin.from("support_tickets").delete().eq("id", ticketId);
      if (reportId) await admin.from("reports").delete().eq("id", reportId);
      await cleanupDisposableAccount(victim).catch(() => undefined);
      // The finalizer anonymizes the request (user_id becomes null), so the
      // per-account cleanup cannot find it; remove what this test produced.
      await admin.from("account_deletion_requests").delete().is("user_id", null).eq("status", "completed").gte("requested_at", startedAt);
      await cleanupDisposableAccount(account);
    }
  });
});

import { test, expect, type BrowserContext } from "playwright/test";
import {
  createDisposableAccount,
  cleanupDisposableAccount,
} from "./disposable-account";
import { regressionAdminClient } from "./seed";
import { completeAdminMfa } from "./admin-mfa-helper";
import { expectNoHorizontalOverflow, gotoOK, PRO_SPACE_HOME_URL, retryInterruptedNavigation} from "./helpers";
import { createServerClient } from "@supabase/ssr";
import { emptyBusiness } from "../../src/lib/pro/business";
import { crTodayISO } from "../../src/lib/time-cr";
test("real local Supabase: admin MFA, Pro memberships, account isolation and recorded promotion", async ({
  page,
  browser,
  baseURL,
}, testInfo) => {
  retryInterruptedNavigation(page);
  test.setTimeout(240000);
  expect(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname).toMatch(
    /^(localhost|127\.0\.0\.1)$/,
  );
  const admin = await createDisposableAccount({
    prefix: "pro-admin",
    admin: true,
  });
  const owner = await createDisposableAccount({ prefix: "pro-owner" });
  const other = await createDisposableAccount({ prefix: "pro-other" });
  const db = regressionAdminClient();
  // This journey ends in Upcoming: its fixture must remain in the future
  // regardless of when the local regression is run (Costa Rica calendar).
  const fixtureDay = (offset: number) => new Date(Date.parse(crTodayISO() + "T12:00:00Z") + offset * 86400000).toISOString().slice(0, 10);
  const appointmentDay = fixtureDay(2);
  const contexts: BrowserContext[] = [];
  try {
    for (const actor of [admin, owner]) {
      const provider = await db.from("professionals").insert({
        profile_id: actor.id,
        category_id: "desarrollo_web",
        business_name: "Profesional local",
        slug: "pro-local-" + actor.id,
        whatsapp: "",
        provincia_id: "al",
        canton_id: "al-at",
        verification_status: "pending",
      });
      expect(provider.error).toBeNull();
      const profile = await db
        .from("profiles")
        .update({ is_provider: true })
        .eq("id", actor.id);
      expect(profile.error).toBeNull();
      const authActor = await db.auth.admin.getUserById(actor.id);
      await db.auth.admin.updateUserById(actor.id, {
        user_metadata: {
          ...authActor.data.user!.user_metadata,
          is_provider: true,
        },
      });
    }
    await page.goto("/admin");
    await page.getByPlaceholder(/Correo de administrador/i).fill(admin.email);
    await page.getByPlaceholder(/Contrase.a/i).fill(admin.password);
    await page.getByRole("button", { name: /Ingresar/i }).click();
    await expect(page.locator("[data-admin-mfa]")).toBeVisible({
      timeout: 30000,
    });
    expect((await page.request.get("/api/admin/pro")).status()).toBe(403);
    for (const endpoint of ["/api/pro/visit-preparation?settings=1", "/api/pro/work-delivery?workId=not-authorized", "/api/pro/work-changes?workId=not-authorized", "/api/pro/quote-choices?view=client", "/api/pro/appointment-reschedule?requestId=00000000-0000-4000-8000-000000000001"]) {
      expect((await page.request.get(endpoint)).status()).toBe(403);
    }
    await completeAdminMfa(page, admin.email);
    await expect(
      page.getByRole("heading", { name: "Resumen", exact: true }),
    ).toBeVisible({ timeout: 30000 });
    await page
      .getByRole("link", { name: "ContrataCR Pro", exact: true })
      .filter({ visible: true })
      .first()
      .click();
    await expect(
      page.getByRole("heading", { name: "Acceso Pro", exact: true }),
    ).toBeVisible({ timeout: 30000 });
    await expectNoHorizontalOverflow(page);
    expect(
      (
        await page.request.post("/api/admin/pro", {
          headers: { origin: baseURL! },
          data: {
            action: "membership",
            userId: other.id,
            status: "active",
            expiresAt: null,
            reason: "No profesional",
          },
        })
      ).status(),
    ).toBe(400);
    await page
      .getByLabel("Buscar cuenta por nombre o correo")
      .fill(owner.email);
    await page
      .getByRole("button", { name: "Buscar cuenta", exact: true })
      .click();
    await page
      .getByRole("button", {
        name: new RegExp(owner.email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      })
      .click();
    await page
      .getByLabel("Motivo", { exact: true })
      .fill("Prueba local de Pro");
    await page
      .getByRole("button", { name: "Guardar acceso", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText("actualizado");
    await page.getByRole("button", { name: "Consultar cuenta" }).click();
    await expect(page.getByRole("status")).toContainText("Pro activo");
    await page.goto("/dashboard/profesional?tab=pro_clients");
    await expect(
      page.getByRole("button", { name: "Nuevo cliente" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Nuevo cliente" }),
    ).toBeEnabled({ timeout: 60000 });
    await page.getByRole("button", { name: "Nuevo cliente" }).click();
    await page
      .getByLabel("Nombre", { exact: true })
      .fill("Cliente del administrador");
    await page.getByRole("button", { name: "Guardar", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Cliente del administrador" }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Cliente del administrador" }),
    ).toBeVisible();
    // Keep an earlier Pro quotation: it must remain visible alongside standard quotes.
    const workspace = await (
      await page.request.get("/api/pro/workspace")
    ).json();
    const legacyQuote = {
      id: "old-pro-quote",
      clientId: workspace.document.clients[0].id,
      title: "Servicio de prueba",
      lines: [{ description: "Servicio", quantity: 1, price: 1000, tax: 13 }],
      status: "accepted",
      validUntil: fixtureDay(30),
    };
    expect(
      (
        await page.request.put("/api/pro/workspace", {
          headers: { origin: baseURL! },
          data: {
            revision: workspace.revision,
            document: {
              ...workspace.document,
              quotes: [legacyQuote],
              products: [
                {
                  id: "picker-product",
                  sku: "PICKER",
                  name: "Producto del editor",
                  stock: 5,
                  minimum: 1,
                  cost: 800,
                  price: 1000,
                  archived: false,
                },
              ],
            },
          },
        })
      ).status(),
    ).toBe(200);
    await page.goto("/dashboard/profesional?tab=quotes");
    await expect(
      page.getByText("Servicio de prueba", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Nueva cotización", exact: true })
      .click();
    await page
      .getByLabel("Cliente guardado", { exact: true })
      .selectOption({ label: "Cliente del administrador" });
    await page
      .getByLabel("Título", { exact: false })
      .fill("Cotización unificada nueva");
    await page
      .getByLabel("Agregar producto o servicio", { exact: true })
      .selectOption({ label: "Producto del editor" });
    await expect(
      page.getByPlaceholder("Descripción", { exact: true }),
    ).toHaveValue("Producto del editor");
    await expect(page.getByLabel("Precio (₡)", { exact: true })).toHaveValue(
      "1130",
    );
    // Pro creates the quote, its consecutive and the client link atomically in
    // /api/pro/quote-create (quote-link is no longer used here). Lose the ACK
    // of a committed create: the editor must require «Comprobar guardado» and
    // the retry must not create a second quote.
    let lostCreate = false;
    let createPosts = 0;
    await page.route("**/api/pro/quote-create", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      createPosts++;
      if (!lostCreate) {
        lostCreate = true;
        // First call compiles the route on the dev server (cold webpack build).
        const response = await route.fetch({ timeout: 90000 });
        expect(response.status()).toBe(200);
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "ACK perdido de prueba" }),
        });
      } else await route.continue();
    });
    await page
      .getByRole("button", { name: "Crear cotización", exact: true })
      .click();
    await expect(
      page.getByText(
        "Compruebe el intento anterior antes de editar. Reintentar no creará otra cotización.",
        { exact: true },
      ),
    ).toBeVisible({ timeout: 45000 });
    await page
      .getByRole("button", { name: "Comprobar guardado", exact: true })
      .click();
    await expect(
      page.getByLabel("Cliente guardado", { exact: true }),
    ).toHaveCount(0);
    await expect
      .poll(async () => {
        const r = await page.request.get("/api/quotes");
        return (await r.json()).quotes?.filter(
          (q: { title: string }) => q.title === "Cotización unificada nueva",
        ).length;
      })
      .toBe(1);
    expect(createPosts).toBeLessThanOrEqual(2);
    await page.goto("/dashboard/profesional?tab=quotes");
    await expect(
      page.getByText("Servicio de prueba", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Cotización unificada nueva", { exact: true }),
    ).toBeVisible();
    const linkedWorkspace = await (
      await page.request.get("/api/pro/workspace")
    ).json();
    const canonical = (
      await (await page.request.get("/api/quotes")).json()
    ).quotes.find(
      (q: { title: string }) => q.title === "Cotización unificada nueva",
    );
    expect(
      (await (await page.request.get("/api/quotes")).json()).quotes.filter(
        (q: { title: string }) => q.title === "Cotización unificada nueva",
      ),
    ).toHaveLength(1);
    expect(linkedWorkspace.document.quoteLinks).toContainEqual({
      quoteId: canonical.id,
      clientId: workspace.document.clients[0].id,
    });
    // A sent document is not an accepted job, even if a caller forges the form.
    const unsanctioned = {
      id: "forged-appointment",
      clientId: workspace.document.clients[0].id,
      client: "Cliente",
      service: "Sin aceptar",
      start: appointmentDay + "T09:00:00-06:00",
      end: appointmentDay + "T10:00:00-06:00",
      stage: "scheduled",
      cancelled: false,
      externalQuoteId: canonical.id,
    };
    expect(
      (
        await page.request.put("/api/pro/workspace", {
          headers: { origin: baseURL! },
          data: {
            revision: linkedWorkspace.revision,
            document: { ...linkedWorkspace.document, work: [unsanctioned] },
          },
        })
      ).status(),
    ).toBe(400);
    // Fixture models an actual accepted quote; the UI must carry its stable IDs forward.
    expect(
      (
        await db
          .from("quotes")
          .update({ status: "accepted", accepted_at: new Date().toISOString() })
          .eq("id", canonical.id)
      ).error,
    ).toBeNull();
    await page.goto(
      "/dashboard/profesional?tab=quotes&cotizacion=" + canonical.id,
    );
    await page
      .getByRole("button", { name: "Agendar cita", exact: true })
      .click();
    await expect(page.getByLabel("Cliente", { exact: true })).toHaveValue(
      workspace.document.clients[0].id,
    );
    await expect(
      page.getByLabel("Cotización aceptada (opcional)", { exact: true }),
    ).toHaveValue("quote:" + canonical.id);
    await page
      .getByLabel("Trabajo", { exact: true })
      .fill("Trabajo desde cotización");
    await page.getByLabel("Inicio · Costa Rica").fill(appointmentDay + "T09:00");
    await page.getByLabel("Final · Costa Rica").fill(appointmentDay + "T10:00");
    // Draft survives reload without clearing the real authenticated session.
    await page.reload();
    await expect(page.getByLabel("Trabajo", { exact: true })).toHaveValue(
      "Trabajo desde cotización",
    );
    await page.getByRole("button", { name: "Guardar", exact: true }).click();
    // Saving a new appointment from a quote opens the saved job directly
    // (docs/pro/autonomous-pro-plan.md:324). The job keeps its link back to the
    // originating quote («Ver cotización»), then the Agenda list check follows.
    const savedJob = page.getByRole("dialog", { name: "Trabajo desde cotización", exact: true });
    await expect(savedJob).toBeVisible();
    await expect(page).toHaveURL(/[?&]tab=pro_agenda(?:&|$).*[?&]?cita=/);
    await savedJob.getByRole("button", { name: "Ver cotización", exact: true }).click();
    await expect(page.getByRole("dialog")).toContainText("Cotización unificada nueva");
    await expect(page).toHaveURL(new RegExp("tab=quotes&cotizacion=" + canonical.id));
    // The agenda list now filters by status (default «Pendientes»); a saved job is «Agendada» → estadoCitas=confirmed (former vista=upcoming).
    await gotoOK(page,"/dashboard/profesional?tab=pro_agenda&estadoCitas=confirmed&q=Trabajo+desde+cotizaci%C3%B3n");
    // Record cards now title the job and show the customer as subtitle
    // (ProRecordCard) instead of a «Cliente · Trabajo» heading.
    const agendaCard = page.locator("article").filter({
      has: page.getByRole("heading", { name: "Trabajo desde cotización", exact: true }),
    });
    await expect(agendaCard).toHaveCount(1);
    await expect(agendaCard).toContainText("Cliente del administrador");
    await page.goto(
      "/dashboard/profesional?tab=pro_clients&cliente=" +
        workspace.document.clients[0].id,
    );
    await expect(page.getByRole("dialog")).toContainText(
      "Cotización unificada nueva",
    );
    await expect(page.getByRole("dialog")).toContainText(
      "Trabajo desde cotización",
    );
    await page.screenshot({
      path: testInfo.outputPath("pro-customer-history.png"),
      fullPage: true,
    });

    await page.goto("/dashboard/profesional?tab=pro_agenda");
    await page.getByRole("button", { name: "Nueva cita" }).click();
    await page
      .getByLabel("Cliente", { exact: true })
      .selectOption({ label: "Cliente del administrador" });
    await page.getByLabel("Trabajo", { exact: true }).fill("Reparación");
    const repairDay = new Date(Date.parse(crTodayISO() + "T12:00:00Z") + 4 * 86400000).toISOString().slice(0, 10);
    await page.getByLabel("Inicio · Costa Rica").fill(repairDay + "T09:00");
    await page.getByLabel("Final · Costa Rica").fill(repairDay + "T10:00");
    await page
      .getByLabel("Cotización aceptada (opcional)")
      .selectOption({ label: "Servicio de prueba" });
    await page.getByRole("button", { name: "Guardar", exact: true }).click();
    await expect(page).toHaveURL(/tab=pro_agenda|\/dashboard\/pro\/trabajo\//);
    await expect(page.getByRole('dialog',{name:'Reparación',exact:true})).toBeVisible();
    await expect(page).toHaveURL(/estadoCitas=confirmed/);
    await page.goto("/dashboard/profesional?tab=pro_inventory");
    await page.getByRole("button", { name: "Nuevo producto o servicio" }).click();
    // The code now lives in the collapsed «Datos del catálogo (opcionales)».
    await page
      .getByRole("dialog", { name: "Nuevo producto o servicio", exact: true })
      .locator("summary", { hasText: "Datos del catálogo (opcionales)" })
      .click();
    for (const [label, value] of [
      ["Código", "A-1"],
      ["Nombre", "Cable de prueba"],
      ["Existencias iniciales", "5"],
      ["Mínimo", "2"],
      ["Costo unitario ₡", "100"],
      ["Precio unitario ₡", "200"],
    ])
      await page.getByLabel(label, { exact: true }).fill(value);
    await page.getByRole("button", { name: "Guardar", exact: true }).click();
    const inventoryCard = page.locator("article").filter({
      has: page.getByRole("heading", {
        name: "Cable de prueba · A-1",
        exact: true,
      }),
    });
    await expect(inventoryCard).toBeVisible();
    await inventoryCard
      .getByRole("button", { name: /^Cable de prueba/ })
      .click();
    await page
      .getByRole("button", { name: "Registrar movimiento", exact: true })
      .click();
    await page.getByLabel("Tipo de movimiento").selectOption("out");
    await page.getByLabel("Cantidad", { exact: true }).fill("3");
    await page.getByLabel("Motivo del movimiento").fill("Servicio de prueba");
    await page.getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByRole("dialog").getByText(/2 unidades/)).toBeVisible();
    await expect(page).toHaveURL(/producto=/);
    await page.reload();
    await expect(page.getByRole("dialog").getByText(/2 unidades/)).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await page.screenshot({
      path: testInfo.outputPath("pro-admin.png"),
      fullPage: true,
    });
    async function userContext(account: typeof owner) {
      const context = await browser.newContext({
        baseURL,
        viewport: page.viewportSize()!,
        isMobile: Boolean(testInfo.project.use.isMobile),
        hasTouch: Boolean(testInfo.project.use.hasTouch),
        deviceScaleFactor: testInfo.project.use.deviceScaleFactor,
      });
      contexts.push(context);
      const auth = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          cookies: {
            getAll: () => [],
            setAll: async (cookies) => {
              await context.addCookies(
                cookies.map((c) => ({
                  name: c.name,
                  value: c.value,
                  url: baseURL!,
                  httpOnly: false,
                  sameSite: "Lax" as const,
                })),
              );
            },
          },
        },
      );
      const { error } = await auth.auth.signInWithPassword({
        email: account.email,
        password: account.password,
      });
      expect(error).toBeNull();
      const foreign = await auth
        .from("pro_workspaces")
        .select("*")
        .eq("user_id", admin.id);
      expect(foreign.error).toBeNull();
      expect(foreign.data).toEqual([]);
      const denied = await auth
        .from("pro_workspaces")
        .insert({ user_id: account.id, document: {}, revision: 1 });
      expect(denied.error).not.toBeNull();
      return context;
    }
    const a = await userContext(owner),
      b = await userContext(other);
    expect((await b.request.get("/api/pro/workspace")).status()).toBe(403);
    expect(
      (
        await a.request.post("/api/pro/quote-link", {
          headers: { origin: baseURL! },
          data: { quoteId: canonical.id, clientId: "c" },
        })
      ).status(),
    ).toBe(400);
    const initial = await a.request.get("/api/pro/workspace");
    expect(initial.status()).toBe(200);
    expect((await initial.json()).document.clients).toEqual([]);
    const document = emptyBusiness();
    document.clients.push({
      id: "c",
      name: "Cliente privado del profesional",
      email: "",
      phone: "",
      notes: "",
      archived: false,
    });
    for (let i = 1; i <= 43; i++)
      document.clients.push({
        id: "customer-" + i,
        name: "Cliente ficticio " + String(i).padStart(2, "0"),
        email: "",
        phone: "",
        notes: "",
        archived: false,
      });
    const saved = await a.request.put("/api/pro/workspace", {
      headers: { origin: baseURL! },
      data: { document, revision: 0 },
    });
    expect(saved.status()).toBe(200);
    expect(
      (
        await a.request.put("/api/pro/workspace", {
          headers: { origin: baseURL! },
          data: { document, revision: 0 },
        })
      ).status(),
    ).toBe(409);
    expect(
      (
        await a.request.post("/api/pro/quote-link", {
          headers: { origin: baseURL! },
          data: { quoteId: canonical.id, clientId: "c" },
        })
      ).status(),
    ).toBe(400);
    const ownAdmin = await (
      await page.request.get("/api/pro/workspace")
    ).json();
    expect(ownAdmin.document.clients[0].name).toBe("Cliente del administrador");
    expect((await a.request.post("/api/pro/social",{headers:{origin:baseURL!},data:{}})).status()).toBe(410);
    await page.goto("about:blank");
    await page.goto("/es/admin/pro");
    const promotion=page.locator("[data-promotion-admin]");
    await promotion.getByLabel("Cuenta a promocionar").fill(owner.email);
    await promotion.getByRole("button",{name:"Buscar cuenta para difusión",exact:true}).click();
    await promotion.getByRole("button").filter({hasText:owner.email}).click();
    await expect(promotion.getByLabel("Contenido publicado")).not.toHaveValue("");
    await promotion.getByLabel("Enlace de la publicación en redes").fill("https://www.instagram.com/p/local-test/");
    await promotion.getByLabel("Fue un anuncio pagado").check();
    await promotion.getByRole("button",{name:"Registrar difusión realizada",exact:true}).click();
    await expect(promotion.getByRole("status")).toContainText("Difusión registrada");
    const {data:provider}=await db.from("professionals").select("id,slug").eq("profile_id",owner.id).single();
    const historyUrl="/api/pro/promotions?type=profile&contentId="+provider!.id;
    const history=await (await a.request.get(historyUrl)).json();
    expect(history.records).toHaveLength(1);expect(history.records[0].paid).toBe(true);expect(history.records[0].channel).toBe("instagram");
    expect((await page.request.get(historyUrl)).status()).toBe(404); // Admin cannot read another account's private evidence through the owner API.
    expect((await a.request.post("/api/admin/pro/promotions",{headers:{origin:baseURL!},data:{}})).status()).toBe(403);
    const {data:event}=await db.from("pro_audit").select("detail").eq("subject",owner.id).eq("action","publication_promotion").single();
    const retry={...event!.detail};delete retry.title;
    const replay=await Promise.all([page.request.post("/api/admin/pro/promotions",{headers:{origin:baseURL!},data:retry}),page.request.post("/api/admin/pro/promotions",{headers:{origin:baseURL!},data:retry})]);
    expect(replay.map(r=>r.status())).toEqual([200,200]);
    expect((await (await a.request.get(historyUrl)).json()).records).toHaveLength(1);
    expect((await page.request.post("/api/admin/pro/promotions",{headers:{origin:baseURL!},data:{...retry,requestId:crypto.randomUUID(),publishedUrl:"https://example.com/fake"}})).status()).toBe(400);
    expect((await page.request.post("/api/admin/pro/promotions",{headers:{origin:baseURL!},data:{...retry,requestId:crypto.randomUUID(),userId:admin.id}})).status()).toBe(400);
    const historyPage=retryInterruptedNavigation(await a.newPage());await historyPage.goto("/"+provider!.slug);
    await expect(historyPage.locator("[data-promotion-history]")).toContainText("Anuncio pagado");
    await expect(historyPage.locator("[data-promotion-history] a")).toHaveAttribute("href","https://www.instagram.com/p/local-test/");
    await historyPage.screenshot({path:testInfo.outputPath("promotion-history.png"),fullPage:true});
    const offer=await db.from("professional_offers").insert({professional_id:provider!.id,title:"Promoción con difusión",description:"Contenido ficticio para validar su historial.",offer_type:"service_offer",image_urls:[],price_now:10000,currency:"CRC",price_unit:"total",status:"published"}).select("id").single();expect(offer.error).toBeNull();
    const offerPayload={...retry,requestId:crypto.randomUUID(),contentType:"offer",contentId:offer.data!.id,paid:false};
    expect((await page.request.post("/api/admin/pro/promotions",{headers:{origin:baseURL!},data:offerPayload})).status()).toBe(200);
    await historyPage.goto("about:blank");
    // Cold dev compile of the public promotion route can exceed the default 30 s.
    await historyPage.goto("/es/promociones/"+offer.data!.id,{timeout:90000});
    await expect(historyPage.locator("[data-promotion-history]")).toContainText("Compartida en redes");
    await expectNoHorizontalOverflow(historyPage);
    await historyPage.screenshot({path:testInfo.outputPath("offer-promotion-history.png"),fullPage:true});
    await historyPage.goto("about:blank");
    await historyPage.goto("/es/dashboard/profesional?tab=offers&offer="+offer.data!.id);
    await expect(historyPage.locator("[data-promotion-history]")).toContainText("Compartida en redes");
    await expectNoHorizontalOverflow(historyPage);
    await historyPage.screenshot({path:testInfo.outputPath("promotion-in-my-panel.png"),fullPage:true});
    await historyPage.close();
    const ownerPage = retryInterruptedNavigation(await a.newPage());
    await ownerPage.bringToFront();
    // /dashboard/pro is now the independent Pro space (houzz-quality-roadmap-local.md:565), not a redirect to the agenda.
    await ownerPage.goto("/dashboard/pro");
    await expect(ownerPage).toHaveURL(PRO_SPACE_HOME_URL);
    await expect(ownerPage.locator("[data-pro-tools]")).toBeVisible({timeout:30000});
    await ownerPage.goto("/dashboard/pro?tab=pro_agenda");
    await expect(ownerPage.locator("[data-pro-workspace]")).toBeVisible();
    await ownerPage.goto("/dashboard/profesional?tab=pro_clients");
    await expect(
      ownerPage.getByRole("heading", {
        name: "Cliente privado del profesional",
      }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(ownerPage);
    await expect(
      ownerPage.locator("[data-business-panel] article"),
    ).toHaveCount(20);
    await ownerPage
      .getByRole("button", { name: "Ver más", exact: true })
      .evaluate((button) =>
        button.scrollIntoView({ block: "end", behavior: "instant" }),
      );
    await expect
      .poll(() => ownerPage.locator("[data-business-panel] article").count())
      .toBeGreaterThan(20);
    await ownerPage.getByLabel("Buscar registros").fill("Cliente ficticio 43");
    await expect(
      ownerPage.locator("[data-business-panel] article"),
    ).toHaveCount(1);
    await ownerPage.screenshot({
      path: testInfo.outputPath("pro-owner.png"),
      fullPage: true,
    });
    await ownerPage.goto("/en/dashboard/profesional?tab=pro_inventory");
    await expect(
      ownerPage.getByRole("button", { name: "New product or service", exact: true }),
    ).toBeVisible();
    await ownerPage
      .getByRole("button", { name: "New product or service", exact: true })
      .click();
    await expect(ownerPage.getByRole("dialog")).toContainText("Initial stock");
    await expectNoHorizontalOverflow(ownerPage);
    const { data: audit, error } = await db
      .from("pro_audit")
      .select("action,actor")
      .eq("subject", owner.id);
    expect(error).toBeNull();
    expect(
      audit?.some(
        (r) => r.action === "publication_promotion" && r.actor === admin.id,
      ),
    ).toBe(true);
  } finally {
    for (const context of contexts) await context.close();
    await cleanupDisposableAccount(owner);
    await cleanupDisposableAccount(other);
    await cleanupDisposableAccount(admin);
  }
});

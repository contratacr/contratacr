import { expect, test } from "playwright/test";
import { apiJson, expectNoHorizontalOverflow, gotoOK, loginAs, openLoginForm, resetAuth, isMobileProject } from "./helpers";
import { canRunSeededRegression, E2E_USERS, ensureRegressionSeed, regressionAdminClient, type RegressionSeedState } from "./seed";
import { getCategoryLabel } from "../../src/lib/data/categories";

type IdResponse = { id?: string; success?: boolean; error?: string };
type CategorySuggestionRow = {
  id: string;
  label?: string | null;
  suggested_name?: string | null;
  status?: string | null;
  approved?: boolean | null;
  suggested_by?: string | null;
};

// Cleanup must be scoped to this execution. A broad `E2E Regression%` delete
// lets a focused local run interfere with CI. GitHub's run id remains stable across a
// serial retry; local processes receive an independent high-entropy key.
const regressionRunKey = process.env.GITHUB_RUN_ID
  ? `${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT ?? "1"}`
  : `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
let regressionRowPrefix = `E2E Regression ${regressionRunKey}`;

function regressionMarker(kind: string) {
  return `${regressionRowPrefix} ${kind} ${Date.now()}`;
}

test.describe.configure({ mode: "serial" });

test.describe("@seeded core regression", () => {
  test.skip(!canRunSeededRegression(), "Set E2E_FIXTURES_READY=1 with the test Supabase secrets to run seeded regression.");

  let seed: RegressionSeedState;

  test.beforeAll(async ({}, workerInfo) => {
    const projectScope = workerInfo.project.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    regressionRowPrefix = `E2E Regression ${regressionRunKey} ${projectScope}`;
    seed = await ensureRegressionSeed();
  });

  async function cleanupGeneratedRows() {
    const admin = regressionAdminClient();
    const actorIds = [seed.clientId, seed.professionalUserId];
    const { data: projects, error: projectsLookupError } = await admin
      .from("projects")
      .select("id")
      .in("client_id", actorIds)
      .ilike("title", `${regressionRowPrefix}%`);
    if (projectsLookupError) throw projectsLookupError;
    if (projects?.length) {
      const projectIds = projects.map((project) => project.id);
      for (const projectId of projectIds) {
        const { error } = await admin.from("notifications").delete().contains("data", { project_id: projectId });
        if (error) throw error;
        const { error: interactionError } = await admin.from("interaction_events").delete().contains("metadata", { project_id: projectId });
        if (interactionError) throw interactionError;
      }
      const { error: projectDeleteError } = await admin.from("projects").delete().in("id", projectIds);
      if (projectDeleteError) throw projectDeleteError;
      const { error: projectAuditError } = await admin
        .from("user_action_audit")
        .delete()
        .eq("entity_table", "projects")
        .in("entity_id", projectIds);
      if (projectAuditError) throw projectAuditError;
    }
  }

  test.beforeEach(cleanupGeneratedRows);
  test.afterEach(cleanupGeneratedRows);

  test("email-change states render cleanly without stacking duplicate messages", async ({ page }) => {
    await gotoOK(page, "/login?emailChanged=1");
    await openLoginForm(page);
    await expect(page.getByText("Correo actualizado").first()).toBeVisible();
    await expect(page.getByText("Inicia sesión con tu correo nuevo.").first()).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await loginAs(page, E2E_USERS.professional.email, E2E_USERS.professional.password);
    await gotoOK(page, "/dashboard/profesional?tab=cuenta&emailChanged=1");
    await expect(page.getByText("Correo actualizado").first()).toBeVisible();
    await expect(page.getByText("Revisa tu correo nuevo").first()).toBeHidden();

    await gotoOK(page, "/dashboard/profesional?tab=cuenta&emailChangePending=1");
    await expect(page.getByText("Cambio pendiente").first()).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("support tickets keep the automatic first acknowledgement in the user panel", async ({ page }) => {
    const renderWarnings: string[] = [];
    page.on("console", (message) => {
      if (message.text().includes("Cannot update a component") && message.text().includes("SupportTickets")) {
        renderWarnings.push(message.text());
      }
    });
    const admin = regressionAdminClient();
    const subject = regressionMarker("support");
    const firstMessage = "Necesito ayuda con una prueba automatizada de soporte.";
    const autoMessage = "Gracias, recibimos su tiquete de soporte. Nuestro equipo lo revisará y le responderá lo antes posible.";
    let insertedMessageIds: string[] = [];

    const { data: staleTickets, error: staleError } = await admin
      .from("support_tickets")
      .select("id")
      .eq("user_id", seed.clientId)
      .ilike("subject", `${regressionRowPrefix} support%`);
    if (staleError) throw staleError;
    const staleIds = (staleTickets ?? []).map((ticket) => ticket.id).filter(Boolean);
    if (staleIds.length > 0) {
      const { data: staleMessages, error: staleMessagesLookupError } = await admin
        .from("support_ticket_messages")
        .select("id")
        .in("ticket_id", staleIds);
      if (staleMessagesLookupError) throw staleMessagesLookupError;
      const staleMessageIds = (staleMessages ?? []).map((message) => message.id);
      const { error: staleMessagesDeleteError } = await admin.from("support_ticket_messages").delete().in("ticket_id", staleIds);
      if (staleMessagesDeleteError) throw staleMessagesDeleteError;
      if (staleMessageIds.length) {
        const { error: staleMessageAuditError } = await admin
          .from("user_action_audit")
          .delete()
          .eq("entity_table", "support_ticket_messages")
          .in("entity_id", staleMessageIds);
        if (staleMessageAuditError) throw staleMessageAuditError;
      }
      const { error: staleTicketsDeleteError } = await admin.from("support_tickets").delete().in("id", staleIds);
      if (staleTicketsDeleteError) throw staleTicketsDeleteError;
      const { error: staleTicketAuditError } = await admin
        .from("user_action_audit")
        .delete()
        .eq("entity_table", "support_tickets")
        .in("entity_id", staleIds);
      if (staleTicketAuditError) throw staleTicketAuditError;
    }

    const now = new Date().toISOString();
    const { data: ticket, error: ticketError } = await admin
      .from("support_tickets")
      .insert({
        user_id: seed.clientId,
        name: E2E_USERS.client.fullName,
        email: E2E_USERS.client.email,
        subject,
        message: firstMessage,
        topic: "subject1",
        status: "open",
        last_reply_at: now,
        last_reply_role: "user",
      })
      .select("id")
      .single();
    if (ticketError || !ticket?.id) throw ticketError ?? new Error("Could not seed support ticket.");

    try {
      const { data: insertedMessages, error: messagesError } = await admin.from("support_ticket_messages").insert([
        {
          ticket_id: ticket.id,
          sender_role: "user",
          sender_id: seed.clientId,
          sender_name: E2E_USERS.client.fullName,
          body: firstMessage,
        },
        {
          ticket_id: ticket.id,
          sender_role: "admin",
          sender_name: "Soporte ContrataCR",
          body: autoMessage,
        },
      ]).select("id");
      if (messagesError) throw messagesError;
      insertedMessageIds = (insertedMessages ?? []).map((message) => message.id);

      await loginAs(page, E2E_USERS.client.email, E2E_USERS.client.password);
      await gotoOK(page, `/dashboard/profesional?tab=soporte&mode=use&ticket=${ticket.id}`);
      await expect(page.getByText(/SUP-/).filter({ visible: true }).first()).toBeVisible();
      await expect(page.getByText(/Cuenta, inicio de sesi[oó]n o datos|Account, login/i).filter({ visible: true }).first()).toBeVisible();
      await expect(page.getByText(firstMessage).filter({ visible: true }).first()).toBeVisible();
      await expect(page.getByText(autoMessage).filter({ visible: true }).first()).toBeVisible();
      await expectNoHorizontalOverflow(page);
      expect(renderWarnings, "Support ticket reads must not update the dashboard during render").toEqual([]);
    } finally {
      const { error: messagesDeleteError } = await admin.from("support_ticket_messages").delete().eq("ticket_id", ticket.id);
      if (messagesDeleteError) throw messagesDeleteError;
      if (insertedMessageIds.length) {
        const { error: messageAuditError } = await admin
          .from("user_action_audit")
          .delete()
          .eq("entity_table", "support_ticket_messages")
          .in("entity_id", insertedMessageIds);
        if (messageAuditError) throw messageAuditError;
      }
      const { error: ticketDeleteError } = await admin.from("support_tickets").delete().eq("id", ticket.id);
      if (ticketDeleteError) throw ticketDeleteError;
      const { error: ticketAuditError } = await admin
        .from("user_action_audit")
        .delete()
        .eq("entity_table", "support_tickets")
        .eq("entity_id", ticket.id);
      if (ticketAuditError) throw ticketAuditError;
    }
  });

  test("guest service suggestions create a pending admin moderation row", async ({ page }) => {
    const admin = regressionAdminClient();
    const stamp = Date.now();
    const submittedName = `rotulacion e2e ${stamp}`;
    const expectedLabel = `Rotulacion e2e ${stamp}`;
    let suggestionId: string | null = null;

    try {
      await resetAuth(page);
      const response = await apiJson<{ ok?: boolean; error?: string }>(page, "/api/categories/suggest", {
        method: "POST",
        body: { name: submittedName, locale: "es" },
      });
      expect(response.status).toBe(200);
      expect(response.body.ok).toBe(true);

      await expect
        .poll(
          async () => {
            const { data, error } = await admin
              .from("category_suggestions")
              .select("id, label, suggested_name, status, approved, suggested_by")
              .eq("suggested_name", expectedLabel)
              .maybeSingle();
            if (error) throw error;
            if (data?.id) suggestionId = data.id;
            return data as CategorySuggestionRow | null;
          },
          { timeout: 8_000, message: "Expected guest service suggestion to reach admin moderation." },
        )
        .toEqual(expect.objectContaining({
          label: expectedLabel,
          suggested_name: expectedLabel,
          status: "pending",
          approved: false,
          suggested_by: null,
        }));

      expect(suggestionId).toBeTruthy();
      const { data: hiddenCategory, error: categoryError } = await admin
        .from("categories")
        .select("id, name, is_hidden")
        .eq("id", suggestionId!)
        .maybeSingle();
      if (categoryError) throw categoryError;
      expect(hiddenCategory).toEqual(expect.objectContaining({
        id: suggestionId,
        name: expectedLabel,
        is_hidden: true,
      }));
    } finally {
      if (suggestionId) {
        await admin.from("user_action_audit").delete().eq("entity_table", "category_suggestions").eq("entity_id", suggestionId);
        await admin.from("category_suggestions").delete().eq("id", suggestionId);
        await admin.from("categories").delete().eq("id", suggestionId).eq("is_hidden", true);
      } else {
        const { data } = await admin
          .from("category_suggestions")
          .select("id")
          .eq("suggested_name", expectedLabel)
          .maybeSingle();
        if (data?.id) {
          await admin.from("user_action_audit").delete().eq("entity_table", "category_suggestions").eq("entity_id", data.id);
          await admin.from("category_suggestions").delete().eq("id", data.id);
          await admin.from("categories").delete().eq("id", data.id).eq("is_hidden", true);
        }
      }
    }
  });

  // Cancelar un proyecto no le avisa a un profesional que nunca respondió.
  test("project cancellation does not notify professionals who never replied", async ({ page }) => {
    await loginAs(page, E2E_USERS.client.email, E2E_USERS.client.password);
    const project = await apiJson<IdResponse>(page, "/api/projects", {
      method: "POST",
      body: {
        title: regressionMarker("cancel project"),
        description: "Proyecto para probar cancelación sin propuesta activa.",
        categoryId: seed.categoryId,
        provinciaId: "al",
        cantonId: "al-al",
        budgetMin: 10000,
        budgetMax: 25000,
        timeline: "flexible",
      },
    });
    expect(project.status).toBe(200);

    const cancelledProject = await apiJson<IdResponse>(page, "/api/projects", {
      method: "PATCH",
      body: { id: project.body.id, status: "cancelled" },
    });
    expect(cancelledProject.status).toBe(200);

    const admin = regressionAdminClient();
    const { data: noisyNotifications, error } = await admin
      .from("notifications")
      .select("id")
      .eq("user_id", seed.professionalUserId)
      .eq("type", "project_cancelled")
      .contains("data", { project_id: project.body.id });
    if (error) throw error;
    expect(noisyNotifications ?? []).toHaveLength(0);
  });

  test("public seeded professional profile and search remain reachable on desktop and mobile layouts", async ({ page }) => {
    const categoryLabel = getCategoryLabel(seed.categoryId, "es");

    await resetAuth(page);
    await gotoOK(page, `/profesionales/${seed.professionalSlug}`);
    await expect(
      page.locator("h1").filter({ hasText: E2E_USERS.professional.fullName, visible: true }).first(),
    ).toBeVisible();
    // En el teléfono la ficha abre en Disponibilidad —contactar es a lo que se
    // viene— y el oficio se lee en Servicios. En computadora esa pestaña no
    // existe: el bloque de servicios ya está a la vista.
    const pestanaServicios = page.getByRole("tab", { name: /Servicios|Services/i }).filter({ visible: true }).first();
    if (await pestanaServicios.count()) await pestanaServicios.click();
    await expect(page.getByText(categoryLabel, { exact: true }).filter({ visible: true }).first()).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await gotoOK(page, `/profesionales?categoria=${encodeURIComponent(seed.categoryId)}`);
    const resultCard = page.locator("article", {
      has: page.locator(`a[href^="/profesionales/${seed.professionalSlug}"]`),
    }).filter({ visible: true }).first();
    await expect(resultCard).toBeVisible();
    await expect(resultCard.getByRole("link", { name: new RegExp(`^${E2E_USERS.professional.fullName}`) }).first()).toBeVisible();
    await expect(resultCard).toContainText(categoryLabel);
    await expectNoHorizontalOverflow(page);
  });

  test("anonymous visitors can see seeded offers and open an offer detail", async ({ page }) => {
    const publishedOfferTitle = `${E2E_USERS.professional.fullName}: oferta published`;
    const secondaryOfferTitle = `${E2E_USERS.client.fullName}: oferta published`;
    await resetAuth(page);
    await gotoOK(page, "/promociones");

    await expect(page.getByText(publishedOfferTitle).first()).toBeVisible();
    await expect(page.getByText(secondaryOfferTitle).first()).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await gotoOK(page, `/promociones/${seed.publishedOfferId}`);
    await expect(page.getByRole("heading", { name: publishedOfferTitle })).toBeVisible();
    await expect(page.getByText("Atenas, Alajuela").first()).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("anonymous visitors can see seeded jobs and open a job detail", async ({ page }) => {
    await resetAuth(page);
    await gotoOK(page, "/empleos");

    await expect(page.getByText(seed.publishedJobTitle, { exact: true }).first()).toBeVisible();
    await expect(page.getByText(seed.secondaryJobTitle, { exact: true }).first()).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await gotoOK(page, `/empleos/${seed.publishedJobId}`);
    await expect(page.getByRole("heading", { name: seed.publishedJobTitle, exact: true }).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Responsabilidades" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("mobile offers and jobs keep compact owner actions above the scrolling cards", async ({ page }) => {
    await loginAs(page, E2E_USERS.professional.email, E2E_USERS.professional.password);
    await page.setViewportSize({ width: 390, height: 844 });

    for (const surface of [
      {
        path: "/promociones",
        testId: "offers-mobile-sticky-actions",
        actions: [/^Mis promociones$/i, /^Publicar promoción$/i],
      },
      {
        path: "/empleos",
        testId: "jobs-mobile-sticky-actions",
        actions: [/^Mis empleos$/i, /^Publicar empleo$/i],
      },
    ]) {
      await gotoOK(page, surface.path);
      const actions = page.getByTestId(surface.testId);
      await expect(actions).toBeVisible();
      for (const name of surface.actions) {
        const action = actions.getByRole("link", { name });
        await expect(action).toBeVisible();
        const box = await action.boundingBox();
        expect(box, `${surface.path} action needs visible geometry`).not.toBeNull();
        expect(box!.height, `${surface.path} actions should stay compact on mobile`).toBeLessThanOrEqual(38);
      }

      // LA PÁGINA YA NO SE DESPLAZA: el tablero mide la pantalla y lo que se
      // desplaza es la LISTA. Así que las acciones no necesitan quedar
      // «pegadas» —nunca se van—, y lo que se comprueba es justo eso: mover la
      // lista hasta el final no las corre ni un píxel.
      const antes = await actions.boundingBox();
      const lista = page.locator(".ccr-marketplace-card-list").first();
      await expect(lista).toBeVisible();
      // Con pocos datos (la base local del CI) la lista no da para desplazar:
      // entonces solo se comprueba que las acciones estén y la página no se mueva.
      const daParaDesplazar = await lista.evaluate((nodo) => nodo.scrollHeight > nodo.clientHeight + 10);
      await lista.evaluate((nodo) => { nodo.scrollTop = nodo.scrollHeight; });
      if (daParaDesplazar) await expect.poll(() => lista.evaluate((nodo) => nodo.scrollTop)).toBeGreaterThan(0);
      expect(await page.evaluate(() => window.scrollY), `${surface.path} no debe desplazar la página`).toBe(0);
      const despues = await actions.boundingBox();
      expect(Math.abs((despues?.y ?? 0) - (antes?.y ?? 0)), `${surface.path} actions must not move`).toBeLessThanOrEqual(1);
    }
  });

  test("English offer listings and details render localized copy without leaking translation keys", async ({ page }) => {
    await resetAuth(page);
    await gotoOK(page, "/en/promociones");

    // Desde el 28-sep-2026 «ofertas» es «promociones» en los dos idiomas.
    await expect(page.getByRole("heading", { name: "Promotions" })).toBeVisible();
    // El tablero ya no lleva la frase de apoyo bajo el título ni filtros fijos
    // (salen con volumen): lo que prueba que está en inglés es el verbo de cada
    // tarjeta («View …») y el texto de ayuda del buscador.
    // En computadora el buscador va a la vista y cada tarjeta lleva su «View …»;
    // en el teléfono el buscador se abre aparte y la tarjeta entera es el enlace.
    if (!isMobileProject(test.info())) {
      await expect(page.getByPlaceholder(/promotion/i).first()).toBeVisible();
      await expect(page.getByRole("button", { name: /^View / }).first()).toBeVisible();
    }
    const publishedOfferTitle = `${E2E_USERS.professional.fullName}: oferta published`;
    await expect(page.getByText(publishedOfferTitle).first()).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await gotoOK(page, `/en/promociones/${seed.publishedOfferId}`);
    await expect(page.getByRole("heading", { name: publishedOfferTitle })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Details" })).toBeVisible();
    await expect(page.getByText(/Published by/i).first()).toBeAttached();
    await expect(page.getByText("Product").first()).toBeVisible();
    await expect(page.locator("body")).not.toContainText(/(?:offers?\.|search\.filters\.|proPanel\.|verificationPanel\.)/);
    await expectNoHorizontalOverflow(page);
  });

  test("English job listings and details render localized copy without leaking translation keys", async ({ page }) => {
    await resetAuth(page);
    await gotoOK(page, "/en/empleos");

    await expect(page.getByRole("heading", { name: "Jobs" })).toBeVisible();
    await expect(page.getByText(seed.publishedJobTitle, { exact: true }).first()).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await gotoOK(page, `/en/empleos/${seed.publishedJobId}`);
    await expect(page.getByRole("heading", { name: seed.publishedJobTitle, exact: true }).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Responsibilities" })).toBeVisible();
    await expect(page.locator("body")).not.toContainText(/(?:jobs?\.|search\.filters\.|proPanel\.|verificationPanel\.)/);
    await expectNoHorizontalOverflow(page);
  });
});

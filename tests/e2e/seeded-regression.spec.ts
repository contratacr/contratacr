import { expect, test } from "playwright/test";
import { apiJson, expectNoHorizontalOverflow, gotoOK, loginAs, resetAuth } from "./helpers";
import { canRunSeededRegression, E2E_USERS, ensureRegressionSeed, regressionAdminClient, type RegressionSeedState } from "./seed";

type IdResponse = { id?: string; success?: boolean; error?: string };
type ListResponse<T> = { bookings?: T[]; projects?: T[]; proposals?: T[]; error?: string };
type BookingRow = { id: string; status: string; service_description?: string };
type ProjectRow = { id: string; title: string; status: string };
type ProposalRow = { id: string; status: string; project_id?: string; message?: string };
type NotificationData = { booking_id?: string | null; project_id?: string | null };
type PublicAvailabilityResponse = {
  slots?: Array<{ date: string; time: string; locationId?: string | null }>;
  allSlots?: Array<{ date: string; time: string; locationId?: string | null }>;
  taken?: string[];
  error?: string;
};
type CategorySuggestionRow = {
  id: string;
  label?: string | null;
  suggested_name?: string | null;
  status?: string | null;
  approved?: boolean | null;
  suggested_by?: string | null;
};

async function expectNotification(
  userId: string,
  type: string,
  match: NotificationData,
) {
  const admin = regressionAdminClient();
  await expect
    .poll(
      async () => {
        const { data, error } = await admin
          .from("notifications")
          .select("type, data")
          .eq("user_id", userId)
          .eq("type", type)
          .order("created_at", { ascending: false })
          .limit(30);
        if (error) throw error;
        return (data ?? []).some((row) => {
          const payload = (row.data ?? {}) as NotificationData;
          return (
            (!match.booking_id || payload.booking_id === match.booking_id) &&
            (!match.project_id || payload.project_id === match.project_id)
          );
        });
      },
      { timeout: 5_000, message: `Expected notification ${type} for ${userId}` },
    )
    .toBe(true);
}

test.describe.configure({ mode: "serial" });

test.describe("@seeded core regression", () => {
  test.skip(!canRunSeededRegression(), "Set E2E_SEED=1 with the test Supabase secrets to run seeded regression.");

  let seed: RegressionSeedState;

  test.beforeAll(async () => {
    seed = await ensureRegressionSeed();
  });

  test("email-change states render cleanly without stacking duplicate messages", async ({ page }) => {
    await gotoOK(page, "/es/login?emailChanged=1");
    await expect(page.getByText("Correo actualizado").first()).toBeVisible();
    await expect(page.getByText("Inicia sesión con tu correo nuevo.").first()).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await loginAs(page, E2E_USERS.professional.email, E2E_USERS.professional.password);
    await gotoOK(page, "/es/dashboard/profesional?tab=cuenta&emailChanged=1");
    await expect(page.getByText("Correo actualizado").first()).toBeVisible();
    await expect(page.getByText("Revisa tu correo nuevo").first()).toBeHidden();

    await gotoOK(page, "/es/dashboard/profesional?tab=cuenta&emailChangePending=1");
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
    const subject = `E2E Regression support ${Date.now()}`;
    const firstMessage = "Necesito ayuda con una prueba automatizada de soporte.";
    const autoMessage = "Gracias, recibimos su tiquete de soporte. Nuestro equipo lo revisará y le responderá lo antes posible.";

    const { data: staleTickets, error: staleError } = await admin
      .from("support_tickets")
      .select("id")
      .eq("user_id", seed.clientId)
      .ilike("subject", "E2E Regression support%");
    if (staleError) throw staleError;
    const staleIds = (staleTickets ?? []).map((ticket) => ticket.id).filter(Boolean);
    if (staleIds.length > 0) {
      await admin.from("support_ticket_messages").delete().in("ticket_id", staleIds);
      await admin.from("support_tickets").delete().in("id", staleIds);
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
      const { error: messagesError } = await admin.from("support_ticket_messages").insert([
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
      ]);
      if (messagesError) throw messagesError;

      await loginAs(page, E2E_USERS.client.email, E2E_USERS.client.password);
      await gotoOK(page, `/es/dashboard/profesional?tab=soporte&mode=use&ticket=${ticket.id}`);
      await expect(page.getByText(/SUP-/).filter({ visible: true }).first()).toBeVisible();
      await expect(page.getByText(/Cuenta, inicio de sesi[oó]n o datos|Account, login/i).filter({ visible: true }).first()).toBeVisible();
      await expect(page.getByText(firstMessage).filter({ visible: true }).first()).toBeVisible();
      await expect(page.getByText(autoMessage).filter({ visible: true }).first()).toBeVisible();
      await expectNoHorizontalOverflow(page);
      expect(renderWarnings, "Support ticket reads must not update the dashboard during render").toEqual([]);
    } finally {
      await admin.from("support_ticket_messages").delete().eq("ticket_id", ticket.id);
      await admin.from("support_tickets").delete().eq("id", ticket.id);
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

  test("client booking flow creates a request, blocks double booking, and supports completion", async ({ page }) => {
    const marker = `E2E Regression booking ${Date.now()}`;

    await loginAs(page, E2E_USERS.client.email, E2E_USERS.client.password);
    const created = await apiJson<IdResponse>(page, "/api/bookings", {
      method: "POST",
      body: {
        professionalId: seed.professionalId,
        clientName: E2E_USERS.client.fullName,
        clientEmail: E2E_USERS.client.email,
        clientPhone: E2E_USERS.client.phone,
        serviceDescription: marker,
        scheduledDate: seed.slotDate,
        scheduledTime: seed.slotTime,
        categoryId: seed.categoryId,
        slotLocationId: "e2e-main",
        slotLocationLabel: "Alajuela, Alajuela",
      },
    });
    expect(created.status).toBe(200);
    expect(created.body.id).toBeTruthy();
    await expectNotification(seed.professionalUserId, "booking_received", { booking_id: created.body.id });

    const duplicate = await apiJson<IdResponse>(page, "/api/bookings", {
      method: "POST",
      body: {
        professionalId: seed.professionalId,
        clientName: E2E_USERS.client.fullName,
        clientEmail: E2E_USERS.client.email,
        clientPhone: E2E_USERS.client.phone,
        serviceDescription: `${marker} duplicate`,
        scheduledDate: seed.slotDate,
        scheduledTime: seed.slotTime,
        categoryId: seed.categoryId,
      },
    });
    expect(duplicate.status).toBe(409);

    const clientList = await apiJson<ListResponse<BookingRow>>(page, "/api/bookings?role=client");
    expect(clientList.status).toBe(200);
    expect(clientList.body.bookings?.some((booking) => booking.id === created.body.id)).toBe(true);

    await loginAs(page, E2E_USERS.professional.email, E2E_USERS.professional.password);
    const proList = await apiJson<ListResponse<BookingRow>>(page, "/api/bookings?role=professional");
    expect(proList.status).toBe(200);
    expect(proList.body.bookings?.some((booking) => booking.id === created.body.id)).toBe(true);

    const workDone = await apiJson<IdResponse>(page, "/api/bookings", {
      method: "PATCH",
      body: { id: created.body.id, status: "awaiting_confirmation" },
    });
    expect(workDone.status).toBe(200);
    await expectNotification(seed.clientId, "booking_update", { booking_id: created.body.id });

    await loginAs(page, E2E_USERS.client.email, E2E_USERS.client.password);
    const completed = await apiJson<IdResponse>(page, "/api/bookings", {
      method: "PATCH",
      body: { id: created.body.id, status: "completed" },
    });
    expect(completed.status).toBe(200);
    await expectNotification(seed.professionalUserId, "booking_completed_by_client", { booking_id: created.body.id });
  });

  test("video consultation and in-person slots can share schedule but one booking blocks both", async ({ page }) => {
    const marker = `E2E Regression video shared availability ${Date.now()}`;

    await loginAs(page, E2E_USERS.client.email, E2E_USERS.client.password);
    const videoBooking = await apiJson<IdResponse>(page, "/api/bookings", {
      method: "POST",
      body: {
        professionalId: seed.videoProfessionalId,
        clientName: E2E_USERS.client.fullName,
        clientEmail: E2E_USERS.client.email,
        clientPhone: E2E_USERS.client.phone,
        serviceDescription: marker,
        scheduledDate: seed.videoSlotDate,
        scheduledTime: seed.videoSharedSlotTime,
        categoryId: seed.videoCategoryId,
        slotLocationId: "videoconsulta",
        slotLocationLabel: "Videoconsulta",
      },
    });
    expect(videoBooking.status).toBe(200);
    expect(videoBooking.body.id).toBeTruthy();
    await expectNotification(seed.videoProfessionalUserId, "booking_received", { booking_id: videoBooking.body.id });

    const availability = await apiJson<PublicAvailabilityResponse>(
      page,
      `/api/public-availability?professionalId=${seed.videoProfessionalId}`,
    );
    expect(availability.status).toBe(200);
    expect(
      (availability.body.allSlots ?? []).filter(
        (slot) => slot.date === seed.videoSlotDate && slot.time === seed.videoSharedSlotTime,
      ).map((slot) => slot.locationId).sort(),
    ).toEqual(["e2e-video-office", "videoconsulta"]);
    expect(
      (availability.body.slots ?? []).filter(
        (slot) => slot.date === seed.videoSlotDate && slot.time === seed.videoSharedSlotTime,
      ),
    ).toHaveLength(0);
    expect(
      (availability.body.slots ?? []).some(
        (slot) => slot.date === seed.videoSlotDate && slot.time === seed.videoSecondSlotTime && slot.locationId === "videoconsulta",
      ),
    ).toBe(true);

    const physicalDuplicate = await apiJson<IdResponse>(page, "/api/bookings", {
      method: "POST",
      body: {
        professionalId: seed.videoProfessionalId,
        clientName: E2E_USERS.client.fullName,
        clientEmail: E2E_USERS.client.email,
        clientPhone: E2E_USERS.client.phone,
        serviceDescription: `${marker} duplicate physical`,
        scheduledDate: seed.videoSlotDate,
        scheduledTime: seed.videoSharedSlotTime,
        categoryId: seed.videoCategoryId,
        slotLocationId: "e2e-video-office",
        slotLocationLabel: "Atenas, Alajuela",
      },
    });
    expect(physicalDuplicate.status).toBe(409);
  });

  test("project and proposal flow enforces ownership, decision, notifications state, and completion", async ({ page }) => {
    const marker = `E2E Regression project ${Date.now()}`;

    await loginAs(page, E2E_USERS.client.email, E2E_USERS.client.password);
    const project = await apiJson<IdResponse>(page, "/api/projects", {
      method: "POST",
      body: {
        title: marker,
        description: "Necesito reparar una fuga de agua en la cocina para prueba automatizada.",
        categoryId: seed.categoryId,
        provinciaId: "al",
        cantonId: "al-al",
        budgetMin: 15000,
        budgetMax: 45000,
        timeline: "esta_semana",
      },
    });
    expect(project.status).toBe(200);
    expect(project.body.id).toBeTruthy();
    await expectNotification(seed.professionalUserId, "new_project", { project_id: project.body.id });

    await loginAs(page, E2E_USERS.professional.email, E2E_USERS.professional.password);
    const opportunities = await apiJson<ListResponse<ProjectRow>>(page, "/api/projects?role=professional");
    expect(opportunities.status).toBe(200);
    expect(opportunities.body.projects?.some((item) => item.id === project.body.id)).toBe(true);

    const proposal = await apiJson<IdResponse>(page, "/api/proposals", {
      method: "POST",
      body: {
        projectId: project.body.id,
        price: 35000,
        message: "E2E Regression propuesta inicial para reparar la fuga.",
      },
    });
    expect(proposal.status).toBe(200);
    expect(proposal.body.id).toBeTruthy();

    const proCannotAcceptOwnProposal = await apiJson<IdResponse>(page, "/api/proposals", {
      method: "PATCH",
      body: { id: proposal.body.id, status: "accepted" },
    });
    expect(proCannotAcceptOwnProposal.status).toBe(403);

    const edited = await apiJson<IdResponse>(page, "/api/proposals", {
      method: "PATCH",
      body: {
        id: proposal.body.id,
        price: 36000,
        message: "E2E Regression propuesta editada con mejor detalle.",
      },
    });
    expect(edited.status).toBe(200);
    await expectNotification(seed.clientId, "proposal_updated", { project_id: project.body.id });

    await loginAs(page, E2E_USERS.client.email, E2E_USERS.client.password);
    const proposalList = await apiJson<ListResponse<ProposalRow>>(page, `/api/proposals?project=${project.body.id}`);
    expect(proposalList.status).toBe(200);
    expect(proposalList.body.proposals?.some((item) => item.id === proposal.body.id)).toBe(true);

    const accepted = await apiJson<IdResponse>(page, "/api/proposals", {
      method: "PATCH",
      body: { id: proposal.body.id, status: "accepted" },
    });
    expect(accepted.status).toBe(200);
    await expectNotification(seed.professionalUserId, "project_proposal_accepted", { project_id: project.body.id });

    await loginAs(page, E2E_USERS.professional.email, E2E_USERS.professional.password);
    const workDone = await apiJson<IdResponse>(page, "/api/projects", {
      method: "PATCH",
      body: { id: project.body.id, action: "work_done" },
    });
    expect(workDone.status).toBe(200);
    await expectNotification(seed.clientId, "project_work_done", { project_id: project.body.id });

    await loginAs(page, E2E_USERS.client.email, E2E_USERS.client.password);
    const confirmed = await apiJson<IdResponse>(page, "/api/projects", {
      method: "PATCH",
      body: { id: project.body.id, action: "confirm" },
    });
    expect(confirmed.status).toBe(200);
    await expectNotification(seed.professionalUserId, "project_completed", { project_id: project.body.id });
  });

  test("withdrawn and declined proposals are handled without reopening duplicate actions", async ({ page }) => {
    const marker = `E2E Regression withdraw ${Date.now()}`;

    await loginAs(page, E2E_USERS.client.email, E2E_USERS.client.password);
    const project = await apiJson<IdResponse>(page, "/api/projects", {
      method: "POST",
      body: {
        title: marker,
        description: "Proyecto para probar retiro y rechazo de propuestas.",
        categoryId: seed.categoryId,
        provinciaId: "al",
        cantonId: "al-al",
        budgetMin: 20000,
        budgetMax: 50000,
        timeline: "flexible",
      },
    });
    expect(project.status).toBe(200);
    expect(project.body.id).toBeTruthy();

    await loginAs(page, E2E_USERS.professional.email, E2E_USERS.professional.password);
    const proposal = await apiJson<IdResponse>(page, "/api/proposals", {
      method: "POST",
      body: {
        projectId: project.body.id,
        price: 30000,
        message: "E2E Regression propuesta para retirar.",
      },
    });
    expect(proposal.status).toBe(200);

    const withdrawn = await apiJson<IdResponse>(page, `/api/proposals?id=${proposal.body.id}`, { method: "DELETE" });
    expect(withdrawn.status).toBe(200);
    await expectNotification(seed.clientId, "proposal_withdrawn", { project_id: project.body.id });

    const myProposals = await apiJson<ListResponse<ProposalRow>>(page, "/api/proposals?mine=true");
    expect(myProposals.status).toBe(200);
    expect(myProposals.body.proposals?.some((item) => item.id === proposal.body.id)).toBe(false);

    const secondProposal = await apiJson<IdResponse>(page, "/api/proposals", {
      method: "POST",
      body: {
        projectId: project.body.id,
        price: 28000,
        message: "E2E Regression propuesta para rechazar.",
      },
    });
    expect(secondProposal.status).toBe(200);

    await loginAs(page, E2E_USERS.client.email, E2E_USERS.client.password);
    const declined = await apiJson<IdResponse>(page, "/api/proposals", {
      method: "PATCH",
      body: { id: secondProposal.body.id, status: "declined" },
    });
    expect(declined.status).toBe(200);
    await expectNotification(seed.professionalUserId, "project_proposal_declined", { project_id: project.body.id });

    await loginAs(page, E2E_USERS.professional.email, E2E_USERS.professional.password);
    const afterDecline = await apiJson<ListResponse<ProposalRow>>(page, "/api/proposals?mine=true");
    expect(afterDecline.status).toBe(200);
    const declinedRow = afterDecline.body.proposals?.find((item) => item.id === secondProposal.body.id);
    expect(declinedRow?.status).toBe("declined");
  });

  test("cancellations notify only the affected opposite side", async ({ page }) => {
    const bookingMarker = `E2E Regression cancel booking ${Date.now()}`;

    await loginAs(page, E2E_USERS.client.email, E2E_USERS.client.password);
    const booking = await apiJson<IdResponse>(page, "/api/bookings", {
      method: "POST",
      body: {
        professionalId: seed.professionalId,
        clientName: E2E_USERS.client.fullName,
        clientEmail: E2E_USERS.client.email,
        clientPhone: E2E_USERS.client.phone,
        serviceDescription: bookingMarker,
        scheduledDate: seed.slotDate,
        scheduledTime: "11:00",
        categoryId: seed.categoryId,
        slotLocationId: "e2e-main",
        slotLocationLabel: "Alajuela, Alajuela",
      },
    });
    expect(booking.status).toBe(200);

    const cancelledBooking = await apiJson<IdResponse>(page, "/api/bookings", {
      method: "PATCH",
      body: { id: booking.body.id, status: "cancelled", cancelReason: "E2E cancelacion" },
    });
    expect(cancelledBooking.status).toBe(200);
    await expectNotification(seed.professionalUserId, "booking_cancelled_by_client", { booking_id: booking.body.id });

    const project = await apiJson<IdResponse>(page, "/api/projects", {
      method: "POST",
      body: {
        title: `E2E Regression cancel project ${Date.now()}`,
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
    await resetAuth(page);
    await gotoOK(page, `/es/profesionales/${seed.professionalSlug}`);
    await expect(page.getByText(E2E_USERS.professional.fullName).first()).toBeVisible();
    await expect(page.getByText(/Plomer/i).first()).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await gotoOK(page, "/es/buscar?categoria=plomeria");
    const resultCard = page.locator("article", {
      has: page.locator(`a[href^="/es/profesionales/${seed.professionalSlug}"]`),
    }).first();
    await expect(resultCard).toBeVisible();
    await expect(resultCard.getByRole("link", { name: /E2E Profesional/i }).first()).toBeVisible();
    await expect(resultCard).toContainText(/Plomer/i);
    await expectNoHorizontalOverflow(page);
  });

  test("anonymous visitors can see seeded offers and open an offer detail", async ({ page }) => {
    await resetAuth(page);
    await gotoOK(page, "/es/ofertas");

    await expect(page.getByText("E2E Mantenimiento residencial").first()).toBeVisible();
    await expect(page.getByText("E2E Sitio web para pyme").first()).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await gotoOK(page, `/es/ofertas/${seed.publishedOfferId}`);
    await expect(page.getByRole("heading", { name: "E2E Mantenimiento residencial" })).toBeVisible();
    await expect(page.getByText("Alajuela, Alajuela").first()).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("anonymous visitors can see seeded jobs and open a job detail", async ({ page }) => {
    await resetAuth(page);
    await gotoOK(page, "/es/empleos");

    await expect(page.getByText("E2E Asistente de operaciones").first()).toBeVisible();
    await expect(page.getByText("E2E Desarrollador web remoto").first()).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await gotoOK(page, `/es/empleos/${seed.publishedJobId}`);
    await expect(page.getByRole("heading", { name: "E2E Asistente de operaciones" }).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Responsabilidades" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("English offer listings and details render localized copy without leaking translation keys", async ({ page }) => {
    await resetAuth(page);
    await gotoOK(page, "/en/ofertas");

    await expect(page.getByRole("heading", { name: "Offers" })).toBeVisible();
    await expect(page.getByText("Promotions from professionals").first()).toBeAttached();
    await expect(page.getByText("E2E Mantenimiento residencial").first()).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await gotoOK(page, `/en/ofertas/${seed.publishedOfferId}`);
    await expect(page.getByRole("heading", { name: "E2E Mantenimiento residencial" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Details" })).toBeVisible();
    await expect(page.getByText(/Published by/i).first()).toBeAttached();
    await expect(page.getByText("Service offer").first()).toBeVisible();
    await expect(page.locator("body")).not.toContainText(/(?:offers?\.|search\.filters\.|proPanel\.|verificationPanel\.)/);
    await expectNoHorizontalOverflow(page);
  });

  test("English job listings and details render localized copy without leaking translation keys", async ({ page }) => {
    await resetAuth(page);
    await gotoOK(page, "/en/empleos");

    await expect(page.getByRole("heading", { name: "Jobs" })).toBeVisible();
    await expect(page.getByText("E2E Asistente de operaciones").first()).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await gotoOK(page, `/en/empleos/${seed.publishedJobId}`);
    await expect(page.getByRole("heading", { name: "E2E Asistente de operaciones" }).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Responsibilities" })).toBeVisible();
    await expect(page.locator("body")).not.toContainText(/(?:jobs?\.|search\.filters\.|proPanel\.|verificationPanel\.)/);
    await expectNoHorizontalOverflow(page);
  });
});

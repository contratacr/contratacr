import { createHash } from "node:crypto";
import { expect, test } from "playwright/test";
import { apiJson, expectNoHorizontalOverflow, gotoOK, loginAs, resetAuth } from "./helpers";
import { canRunSeededRegression, E2E_USERS, ensureRegressionSeed, regressionAdminClient, type RegressionSeedState } from "./seed";
import { getCategoryLabel } from "../../src/lib/data/categories";

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

type RegressionSchedule = {
  professionalDate: string;
  professionalTime: string;
  professionalSecondTime: string;
  videoDate: string;
  videoSharedTime: string;
  videoSecondTime: string;
  slotIds: string[];
};

// Cleanup and occupied calendar moments must be scoped to this execution. A
// broad `E2E Regression%` delete or the canonical seed's two fixed slots lets a
// focused local run interfere with CI. GitHub's run id remains stable across a
// serial retry; local processes receive an independent high-entropy key.
const regressionRunKey = process.env.GITHUB_RUN_ID
  ? `${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT ?? "1"}`
  : `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
let regressionRowPrefix = `E2E Regression ${regressionRunKey}`;

function regressionMarker(kind: string) {
  return `${regressionRowPrefix} ${kind} ${Date.now()}`;
}

function stableNumber(key: string, modulo: number) {
  return Number.parseInt(createHash("sha256").update(key).digest("hex").slice(0, 8), 16) % modulo;
}

function stableUuid(key: string) {
  const hex = createHash("sha256").update(key).digest("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function futureDate(days: number) {
  const date = new Date();
  date.setUTCHours(12, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function minuteLabel(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

async function allocateRegressionSchedule(seed: RegressionSeedState, scope: string): Promise<RegressionSchedule> {
  const admin = regressionAdminClient();

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const candidate = `${scope}-${attempt}`;
    const professionalDate = futureDate(45 + stableNumber(`${candidate}:professional-date`, 270));
    const videoDate = futureDate(45 + stableNumber(`${candidate}:video-date`, 270));
    const professionalMinute = 8 * 60 + stableNumber(`${candidate}:professional-time`, 8 * 60);
    const videoMinute = 8 * 60 + stableNumber(`${candidate}:video-time`, 8 * 60);
    const professionalTime = minuteLabel(professionalMinute);
    const professionalSecondTime = minuteLabel(professionalMinute + 60);
    const videoSharedTime = minuteLabel(videoMinute);
    const videoSecondTime = minuteLabel(videoMinute + 60);
    const slotIds = Array.from({ length: 5 }, (_, index) => stableUuid(`${candidate}:slot:${index}`));
    const { error } = await admin.from("availability_slots").upsert([
      {
        id: slotIds[0],
        professional_id: seed.professionalId,
        slot_date: professionalDate,
        slot_time: professionalTime,
        category_id: seed.categoryId,
        location_id: seed.slotLocationId,
      },
      {
        id: slotIds[1],
        professional_id: seed.professionalId,
        slot_date: professionalDate,
        slot_time: professionalSecondTime,
        category_id: seed.categoryId,
        location_id: seed.slotLocationId,
      },
      {
        id: slotIds[2],
        professional_id: seed.videoProfessionalId,
        slot_date: videoDate,
        slot_time: videoSharedTime,
        category_id: seed.videoCategoryId,
        location_id: "videoconsulta",
      },
      {
        id: slotIds[3],
        professional_id: seed.videoProfessionalId,
        slot_date: videoDate,
        slot_time: videoSharedTime,
        category_id: seed.videoCategoryId,
        location_id: seed.videoPhysicalLocationId,
      },
      {
        id: slotIds[4],
        professional_id: seed.videoProfessionalId,
        slot_date: videoDate,
        slot_time: videoSecondTime,
        category_id: seed.videoCategoryId,
        location_id: "videoconsulta",
      },
    ], { onConflict: "id" });

    if (!error) {
      return {
        professionalDate,
        professionalTime,
        professionalSecondTime,
        videoDate,
        videoSharedTime,
        videoSecondTime,
        slotIds,
      };
    }
    if (error.code !== "23505") throw error;
  }

  throw new Error(`Could not allocate an isolated regression schedule for ${scope}`);
}

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
  test.skip(!canRunSeededRegression(), "Set E2E_FIXTURES_READY=1 with the test Supabase secrets to run seeded regression.");

  let seed: RegressionSeedState;
  let schedule: RegressionSchedule | undefined;

  test.beforeAll(async ({}, workerInfo) => {
    const projectScope = workerInfo.project.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    regressionRowPrefix = `E2E Regression ${regressionRunKey} ${projectScope}`;
    seed = await ensureRegressionSeed();
    schedule = await allocateRegressionSchedule(seed, `${regressionRunKey}-${projectScope}`);
  });

  test.afterAll(async () => {
    if (!schedule?.slotIds.length) return;
    const admin = regressionAdminClient();
    const { error: slotError } = await admin.from("availability_slots").delete().in("id", schedule.slotIds);
    if (slotError) throw slotError;
    const { error: auditError } = await admin
      .from("user_action_audit")
      .delete()
      .eq("entity_table", "availability_slots")
      .in("entity_id", schedule.slotIds);
    if (auditError) throw auditError;
  });

  async function cleanupGeneratedRows() {
    const admin = regressionAdminClient();
    const actorIds = [seed.clientId, seed.professionalUserId];
    const { data: bookings, error: bookingsLookupError } = await admin
      .from("bookings")
      .select("id")
      .in("client_id", actorIds)
      .ilike("service_description", `${regressionRowPrefix}%`);
    if (bookingsLookupError) throw bookingsLookupError;
    for (const booking of bookings ?? []) {
      const { error } = await admin.from("notifications").delete().contains("data", { booking_id: booking.id });
      if (error) throw error;
      const { error: interactionError } = await admin.from("interaction_events").delete().contains("metadata", { booking_id: booking.id });
      if (interactionError) throw interactionError;
    }
    if (bookings?.length) {
      const bookingIds = bookings.map((booking) => booking.id);
      const { error: deleteError } = await admin.from("bookings").delete().in("id", bookingIds);
      if (deleteError) throw deleteError;
      const { error: auditError } = await admin
        .from("user_action_audit")
        .delete()
        .eq("entity_table", "bookings")
        .in("entity_id", bookingIds);
      if (auditError) throw auditError;
    }

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
      const { data: proposals, error: proposalsLookupError } = await admin
        .from("proposals")
        .select("id")
        .in("project_id", projectIds);
      if (proposalsLookupError) throw proposalsLookupError;
      if (proposals?.length) {
        const proposalIds = proposals.map((proposal) => proposal.id);
        for (const proposalId of proposalIds) {
          const { error: interactionError } = await admin.from("interaction_events").delete().contains("metadata", { proposal_id: proposalId });
          if (interactionError) throw interactionError;
        }
        const { error: proposalDeleteError } = await admin.from("proposals").delete().in("id", proposalIds);
        if (proposalDeleteError) throw proposalDeleteError;
        const { error: proposalAuditError } = await admin
          .from("user_action_audit")
          .delete()
          .eq("entity_table", "proposals")
          .in("entity_id", proposalIds);
        if (proposalAuditError) throw proposalAuditError;
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
      await gotoOK(page, `/es/dashboard/profesional?tab=soporte&mode=use&ticket=${ticket.id}`);
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

  test("client booking flow creates a request, blocks double booking, and supports completion", async ({ page }) => {
    const marker = regressionMarker("booking");

    await loginAs(page, E2E_USERS.client.email, E2E_USERS.client.password);
    const created = await apiJson<IdResponse>(page, "/api/bookings", {
      method: "POST",
      body: {
        professionalId: seed.professionalId,
        clientName: E2E_USERS.client.fullName,
        clientEmail: E2E_USERS.client.email,
        clientPhone: E2E_USERS.client.phone,
        serviceDescription: marker,
        scheduledDate: schedule!.professionalDate,
        scheduledTime: schedule!.professionalTime,
        categoryId: seed.categoryId,
        slotLocationId: seed.slotLocationId,
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
        scheduledDate: schedule!.professionalDate,
        scheduledTime: schedule!.professionalTime,
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
    const marker = regressionMarker("video shared availability");

    await loginAs(page, E2E_USERS.professional.email, E2E_USERS.professional.password);
    const videoBooking = await apiJson<IdResponse>(page, "/api/bookings", {
      method: "POST",
      body: {
        professionalId: seed.videoProfessionalId,
        clientName: E2E_USERS.professional.fullName,
        clientEmail: E2E_USERS.professional.email,
        clientPhone: E2E_USERS.professional.phone,
        serviceDescription: marker,
        scheduledDate: schedule!.videoDate,
        scheduledTime: schedule!.videoSharedTime,
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
        (slot) => slot.date === schedule!.videoDate && slot.time === schedule!.videoSharedTime,
      ).map((slot) => slot.locationId).sort(),
    ).toEqual([seed.videoPhysicalLocationId, "videoconsulta"].sort());
    expect(
      (availability.body.slots ?? []).filter(
        (slot) => slot.date === schedule!.videoDate && slot.time === schedule!.videoSharedTime,
      ),
    ).toHaveLength(0);
    expect(
      (availability.body.slots ?? []).some(
        (slot) => slot.date === schedule!.videoDate && slot.time === schedule!.videoSecondTime && slot.locationId === "videoconsulta",
      ),
    ).toBe(true);

    const physicalDuplicate = await apiJson<IdResponse>(page, "/api/bookings", {
      method: "POST",
      body: {
        professionalId: seed.videoProfessionalId,
        clientName: E2E_USERS.professional.fullName,
        clientEmail: E2E_USERS.professional.email,
        clientPhone: E2E_USERS.professional.phone,
        serviceDescription: `${marker} duplicate physical`,
        scheduledDate: schedule!.videoDate,
        scheduledTime: schedule!.videoSharedTime,
        categoryId: seed.videoCategoryId,
        slotLocationId: seed.videoPhysicalLocationId,
        slotLocationLabel: "Atenas, Alajuela",
      },
    });
    expect(physicalDuplicate.status).toBe(409);
  });

  test("project and proposal flow enforces ownership, decision, notifications state, and completion", async ({ page }) => {
    const marker = regressionMarker("project");

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
    const { data: clientProfessional, error: clientProfessionalError } = await regressionAdminClient()
      .from("professionals")
      .select("verification_status")
      .eq("id", seed.videoProfessionalId)
      .single();
    if (clientProfessionalError) throw clientProfessionalError;
    expect(
      clientProfessional.verification_status,
      "Using a dual-role account as a client must not demote its professional verification",
    ).toBe("verified");
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
    const marker = regressionMarker("withdraw");

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
    const bookingMarker = regressionMarker("cancel booking");

    await loginAs(page, E2E_USERS.client.email, E2E_USERS.client.password);
    const booking = await apiJson<IdResponse>(page, "/api/bookings", {
      method: "POST",
      body: {
        professionalId: seed.professionalId,
        clientName: E2E_USERS.client.fullName,
        clientEmail: E2E_USERS.client.email,
        clientPhone: E2E_USERS.client.phone,
        serviceDescription: bookingMarker,
        scheduledDate: schedule!.professionalDate,
        scheduledTime: schedule!.professionalSecondTime,
        categoryId: seed.categoryId,
        slotLocationId: seed.slotLocationId,
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
    await gotoOK(page, `/es/profesionales/${seed.professionalSlug}`);
    await expect(
      page.locator("h1").filter({ hasText: E2E_USERS.professional.fullName, visible: true }).first(),
    ).toBeVisible();
    await expect(page.getByText(categoryLabel, { exact: true }).filter({ visible: true }).first()).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await gotoOK(page, `/es/buscar?categoria=${encodeURIComponent(seed.categoryId)}`);
    const resultCard = page.locator("article", {
      has: page.locator(`a[href^="/es/profesionales/${seed.professionalSlug}"]`),
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
    await gotoOK(page, "/es/ofertas");

    await expect(page.getByText(publishedOfferTitle).first()).toBeVisible();
    await expect(page.getByText(secondaryOfferTitle).first()).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await gotoOK(page, `/es/ofertas/${seed.publishedOfferId}`);
    await expect(page.getByRole("heading", { name: publishedOfferTitle })).toBeVisible();
    await expect(page.getByText("Atenas, Alajuela").first()).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("anonymous visitors can see seeded jobs and open a job detail", async ({ page }) => {
    await resetAuth(page);
    await gotoOK(page, "/es/empleos");

    await expect(page.getByText(seed.publishedJobTitle, { exact: true }).first()).toBeVisible();
    await expect(page.getByText(seed.secondaryJobTitle, { exact: true }).first()).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await gotoOK(page, `/es/empleos/${seed.publishedJobId}`);
    await expect(page.getByRole("heading", { name: seed.publishedJobTitle, exact: true }).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Responsabilidades" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("English offer listings and details render localized copy without leaking translation keys", async ({ page }) => {
    await resetAuth(page);
    await gotoOK(page, "/en/ofertas");

    await expect(page.getByRole("heading", { name: "Offers" })).toBeVisible();
    await expect(page.getByText("Promotions from professionals").first()).toBeAttached();
    const publishedOfferTitle = `${E2E_USERS.professional.fullName}: oferta published`;
    await expect(page.getByText(publishedOfferTitle).first()).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await gotoOK(page, `/en/ofertas/${seed.publishedOfferId}`);
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

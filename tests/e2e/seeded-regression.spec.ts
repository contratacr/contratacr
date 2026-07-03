import { expect, test } from "playwright/test";
import { apiJson, expectNoHorizontalOverflow, gotoOK, loginAs, resetAuth } from "./helpers";
import { canRunSeededRegression, E2E_USERS, ensureRegressionSeed, regressionAdminClient, type RegressionSeedState } from "./seed";

type IdResponse = { id?: string; success?: boolean; error?: string };
type ListResponse<T> = { bookings?: T[]; projects?: T[]; proposals?: T[]; error?: string };
type BookingRow = { id: string; status: string; service_description?: string };
type ProjectRow = { id: string; title: string; status: string };
type ProposalRow = { id: string; status: string; project_id?: string; message?: string };
type NotificationData = { booking_id?: string | null; project_id?: string | null };

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
        description: "Publicación para probar retiro y rechazo de propuestas.",
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
        description: "Publicacion para probar cancelacion sin propuesta activa.",
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
    await expect(page.getByText(E2E_USERS.professional.fullName).first()).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});

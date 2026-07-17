import { expect, test } from "playwright/test";
import { apiJson, gotoOK, loginAs, resetAuth } from "./helpers";
import { canRunSeededRegression, E2E_USERS, ensureRegressionSeed, regressionAdminClient, type RegressionSeedState } from "./seed";

type ChatResponse = { conversationId?: string; error?: string };
type ConversationListResponse = { conversations?: Array<{ id: string }> };

test.describe.configure({ mode: "serial" });
test.describe("@seeded contextual direct chat", () => {
  test.skip(!canRunSeededRegression(), "Requires the isolated test Supabase seed.");
  let seed: RegressionSeedState;
  const conversationIds: string[] = [];
  let bookingId = "";

  test.beforeAll(async () => { seed = await ensureRegressionSeed(); });
  test.afterAll(async () => {
    const admin = regressionAdminClient();
    if (conversationIds.length) {
      await admin.from("direct_messages").delete().in("conversation_id", conversationIds);
      for (const conversationId of conversationIds) {
        await admin.from("notifications").delete().eq("type", "direct_message").contains("data", { conversation_id: conversationId });
      }
      await admin.from("direct_conversations").delete().in("id", conversationIds);
    }
    if (bookingId) await admin.from("bookings").delete().eq("id", bookingId);
  });

  test("profile messages deduplicate and both participants can reply", async ({ page }) => {
    await loginAs(page, E2E_USERS.client.email, E2E_USERS.client.password);
    const first = await apiJson<ChatResponse>(page, "/api/direct-chat", { method: "POST", body: { professionalId: seed.professionalId, message: "E2E chat desde perfil" } });
    expect(first.status, JSON.stringify(first.body)).toBe(200); expect(first.body.conversationId).toBeTruthy();
    conversationIds.push(first.body.conversationId!);
    const second = await apiJson<ChatResponse>(page, "/api/direct-chat", { method: "POST", body: { professionalId: seed.professionalId, message: "E2E segundo mensaje" } });
    expect(second.body.conversationId).toBe(first.body.conversationId);

    await resetAuth(page);
    await loginAs(page, E2E_USERS.professional.email, E2E_USERS.professional.password);
    const reply = await apiJson<ChatResponse>(page, "/api/direct-chat", { method: "POST", body: { conversationId: first.body.conversationId, message: "E2E respuesta profesional" } });
    expect(reply.status).toBe(200);
    await gotoOK(page, `/es/dashboard/profesional?tab=chat&conversation=${first.body.conversationId}`);
    await expect(page.getByText("E2E respuesta profesional").last()).toBeVisible();
    await expect(page.getByText(/Perfil ·|Profile ·/).last()).toBeVisible();

    const archived = await apiJson(page, "/api/direct-chat", { method: "PATCH", body: { conversationId: first.body.conversationId, status: "archived" } });
    expect(archived.status).toBe(200);
    const professionalActive = await apiJson<ConversationListResponse>(page, "/api/direct-chat");
    expect(professionalActive.body.conversations?.some((item) => item.id === first.body.conversationId)).toBe(false);

    await resetAuth(page);
    await loginAs(page, E2E_USERS.client.email, E2E_USERS.client.password);
    const clientActive = await apiJson<ConversationListResponse>(page, "/api/direct-chat");
    expect(clientActive.body.conversations?.some((item) => item.id === first.body.conversationId)).toBe(true);
    const reopensForProfessional = await apiJson<ChatResponse>(page, "/api/direct-chat", { method: "POST", body: { conversationId: first.body.conversationId, message: "E2E reabre para profesional" } });
    expect(reopensForProfessional.status).toBe(200);

    await resetAuth(page);
    await loginAs(page, E2E_USERS.professional.email, E2E_USERS.professional.password);
    const reopened = await apiJson<ConversationListResponse>(page, "/api/direct-chat");
    expect(reopened.body.conversations?.some((item) => item.id === first.body.conversationId)).toBe(true);
  });

  test("booking chat carries its context and rejects outsiders", async ({ page }) => {
    const admin = regressionAdminClient();
    const { data: booking, error } = await admin.from("bookings").insert({ professional_id: seed.professionalId, client_id: seed.clientId, service_description: "E2E reparación contextual", status: "pending" }).select("id").single();
    if (error) throw error; bookingId = booking.id;
    await loginAs(page, E2E_USERS.client.email, E2E_USERS.client.password);
    const created = await apiJson<ChatResponse>(page, "/api/direct-chat", { method: "POST", body: { bookingId, message: "E2E consulta de solicitud" } });
    expect(created.status).toBe(200); conversationIds.push(created.body.conversationId!);
    await gotoOK(page, `/es/dashboard/profesional?tab=chat&conversation=${created.body.conversationId}`);
    await expect(page.getByText(/Solicitud · E2E reparación contextual/).last()).toBeVisible();

    await resetAuth(page);
    await loginAs(page, E2E_USERS.videoProfessional.email, E2E_USERS.videoProfessional.password);
    const denied = await apiJson(page, `/api/direct-chat?id=${created.body.conversationId}`);
    expect(denied.status).toBe(404);
  });
});

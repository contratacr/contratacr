import { expect, test } from "playwright/test";
import { apiJson, gotoOK, loginAs, resetAuth } from "./helpers";
import { canRunSeededRegression, E2E_USERS, ensureRegressionSeed, regressionAdminClient, type RegressionSeedState } from "./seed";
import { cleanupDisposableAccount, createDisposableAccount } from "./disposable-account";

type ChatResponse = { conversationId?: string; error?: string };
type ConversationListResponse = {
  conversations?: Array<{
    id: string;
    client_unread_count?: number;
    professional_unread_count?: number;
    context?: { type?: string; title?: string };
  }>;
};
type ThreadResponse = {
  conversation?: { id: string; context?: { type?: string; title?: string } };
  messages?: Array<{ id: string; sender_id: string; body: string; read_at?: string | null }>;
};

test.describe.configure({ mode: "serial" });
test.describe("@seeded contextual direct chat", () => {
  test.skip(!canRunSeededRegression(), "Requires the isolated test Supabase seed.");
  let seed: RegressionSeedState;
  const conversationIds: string[] = [];
  let bookingId = "";
  let projectId = "";
  let proposalId = "";

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
    if (proposalId) await admin.from("proposals").delete().eq("id", proposalId);
    if (projectId) await admin.from("projects").delete().eq("id", projectId);
  });

  test("profile messages deduplicate and both participants can reply", async ({ page }) => {
    await loginAs(page, E2E_USERS.client.email, E2E_USERS.client.password);
    const first = await apiJson<ChatResponse>(page, "/api/direct-chat", { method: "POST", body: { professionalId: seed.professionalId, message: "E2E chat desde perfil" } });
    expect(first.status, JSON.stringify(first.body)).toBe(200); expect(first.body.conversationId).toBeTruthy();
    conversationIds.push(first.body.conversationId!);
    const second = await apiJson<ChatResponse>(page, "/api/direct-chat", { method: "POST", body: { professionalId: seed.professionalId, message: "E2E segundo mensaje" } });
    expect(second.body.conversationId).toBe(first.body.conversationId);
    const admin = regressionAdminClient();
    const { data: beforeRead } = await admin.from("direct_conversations")
      .select("client_unread_count, professional_unread_count")
      .eq("id", first.body.conversationId).single();
    expect(beforeRead?.client_unread_count).toBe(0);
    expect(beforeRead?.professional_unread_count).toBe(2);
    const { data: recipientNotifications } = await admin.from("notifications")
      .select("user_id")
      .eq("type", "direct_message")
      .contains("data", { conversation_id: first.body.conversationId });
    expect(recipientNotifications).toHaveLength(2);
    expect(recipientNotifications?.every((item) => item.user_id === seed.professionalUserId)).toBe(true);

    await resetAuth(page);
    await loginAs(page, E2E_USERS.professional.email, E2E_USERS.professional.password);
    const professionalThread = await apiJson<ThreadResponse>(page, `/api/direct-chat?id=${first.body.conversationId}`);
    expect(professionalThread.status).toBe(200);
    expect(professionalThread.body.messages?.map((item) => item.body)).toEqual(expect.arrayContaining(["E2E chat desde perfil", "E2E segundo mensaje"]));
    const { data: afterProfessionalRead } = await admin.from("direct_conversations")
      .select("professional_unread_count")
      .eq("id", first.body.conversationId).single();
    expect(afterProfessionalRead?.professional_unread_count).toBe(0);
    const { data: readClientMessages } = await admin.from("direct_messages")
      .select("read_at")
      .eq("conversation_id", first.body.conversationId)
      .eq("sender_id", seed.clientId);
    expect(readClientMessages?.every((item) => Boolean(item.read_at))).toBe(true);

    const reply = await apiJson<ChatResponse>(page, "/api/direct-chat", { method: "POST", body: { conversationId: first.body.conversationId, message: "E2E respuesta profesional" } });
    expect(reply.status).toBe(200);
    await gotoOK(page, `/es/mensajes?conversation=${first.body.conversationId}`);
    await expect(page.getByText("E2E respuesta profesional").last()).toBeVisible();
    await expect(page.getByText(/Conversación desde un perfil|Profile conversation/i).last()).toBeVisible();
    await expect(page.getByRole("button", { name: /Ver perfil|View profile/i })).toHaveCount(0);

    const archived = await apiJson(page, "/api/direct-chat", { method: "PATCH", body: { conversationId: first.body.conversationId, status: "archived" } });
    expect(archived.status).toBe(200);
    const professionalActive = await apiJson<ConversationListResponse>(page, "/api/direct-chat");
    expect(professionalActive.body.conversations?.some((item) => item.id === first.body.conversationId)).toBe(false);

    await resetAuth(page);
    await loginAs(page, E2E_USERS.client.email, E2E_USERS.client.password);
    const persistedThread = await apiJson<ThreadResponse>(page, `/api/direct-chat?id=${first.body.conversationId}`);
    expect(persistedThread.body.messages?.at(-1)?.body).toBe("E2E respuesta profesional");
    const { data: afterClientRead } = await admin.from("direct_conversations")
      .select("client_unread_count")
      .eq("id", first.body.conversationId).single();
    expect(afterClientRead?.client_unread_count).toBe(0);
    const clientActive = await apiJson<ConversationListResponse>(page, "/api/direct-chat");
    expect(clientActive.body.conversations?.some((item) => item.id === first.body.conversationId)).toBe(true);
    const reopensForProfessional = await apiJson<ChatResponse>(page, "/api/direct-chat", { method: "POST", body: { conversationId: first.body.conversationId, message: "E2E reabre para profesional" } });
    expect(reopensForProfessional.status).toBe(200);

    await resetAuth(page);
    await loginAs(page, E2E_USERS.professional.email, E2E_USERS.professional.password);
    const reopened = await apiJson<ConversationListResponse>(page, "/api/direct-chat");
    expect(reopened.body.conversations?.some((item) => item.id === first.body.conversationId)).toBe(true);
    const archiveAgain = await apiJson(page, "/api/direct-chat", { method: "PATCH", body: { conversationId: first.body.conversationId, status: "archived" } });
    expect(archiveAgain.status).toBe(200);
    const archivedList = await apiJson<ConversationListResponse>(page, "/api/direct-chat?status=archived");
    expect(archivedList.body.conversations?.some((item) => item.id === first.body.conversationId)).toBe(true);
    const deleted = await apiJson(page, "/api/direct-chat", { method: "DELETE", body: { conversationId: first.body.conversationId } });
    expect(deleted.status).toBe(200);
    const archivedAfterDelete = await apiJson<ConversationListResponse>(page, "/api/direct-chat?status=archived");
    expect(archivedAfterDelete.body.conversations?.some((item) => item.id === first.body.conversationId)).toBe(false);
  });

  test("booking chat carries its context and rejects outsiders", async ({ page }) => {
    const admin = regressionAdminClient();
    const { data: booking, error } = await admin.from("bookings").insert({ professional_id: seed.professionalId, client_id: seed.clientId, service_description: "E2E reparación contextual", status: "pending" }).select("id").single();
    if (error) throw error; bookingId = booking.id;
    await loginAs(page, E2E_USERS.client.email, E2E_USERS.client.password);
    const created = await apiJson<ChatResponse>(page, "/api/direct-chat", { method: "POST", body: { bookingId, message: "E2E consulta de solicitud" } });
    expect(created.status).toBe(200); conversationIds.push(created.body.conversationId!);
    await gotoOK(page, `/es/mensajes?conversation=${created.body.conversationId}`);
    await expect(page.getByText("E2E reparación contextual").last()).toBeVisible();
    await expect(page.getByRole("button", { name: /Ver solicitud|View request/i })).toBeVisible();

    const outsider = await createDisposableAccount({ prefix: "direct-chat-outsider" });
    try {
      await resetAuth(page);
      await loginAs(page, outsider.email, outsider.password);
      const denied = await apiJson(page, `/api/direct-chat?id=${created.body.conversationId}`);
      expect(denied.status).toBe(404);
    } finally {
      await cleanupDisposableAccount(outsider);
    }
  });

  test("proposal chat remains linked to the publication and persists for both sides", async ({ page }) => {
    const admin = regressionAdminClient();
    const { data: project, error: projectError } = await admin.from("projects").insert({
      client_id: seed.clientId,
      category_id: seed.categoryId,
      title: "E2E proyecto con chat",
      description: "E2E contexto para comprobar el chat de una propuesta.",
      provincia_id: "al",
      canton_id: "al-al",
      status: "open",
    }).select("id").single();
    if (projectError) throw projectError;
    projectId = project.id;
    const { data: proposal, error: proposalError } = await admin.from("proposals").insert({
      project_id: projectId,
      professional_id: seed.professionalId,
      price: 35000,
      message: "E2E propuesta enlazada al chat",
      status: "pending",
    }).select("id").single();
    if (proposalError) throw proposalError;
    proposalId = proposal.id;

    await loginAs(page, E2E_USERS.client.email, E2E_USERS.client.password);
    const created = await apiJson<ChatResponse>(page, "/api/direct-chat", {
      method: "POST",
      body: { proposalId, openConversation: true, initialMessage: "E2E mensaje sobre propuesta" },
    });
    expect(created.status, JSON.stringify(created.body)).toBe(200);
    conversationIds.push(created.body.conversationId!);
    const reopened = await apiJson<ChatResponse>(page, "/api/direct-chat", {
      method: "POST",
      body: { proposalId, openConversation: true, initialMessage: "E2E mensaje que no debe duplicarse" },
    });
    expect(reopened.status, JSON.stringify(reopened.body)).toBe(200);
    expect(reopened.body.conversationId).toBe(created.body.conversationId);
    const thread = await apiJson<ThreadResponse>(page, `/api/direct-chat?id=${created.body.conversationId}`);
    expect(thread.body.conversation?.context?.type).toBe("proposal");
    expect(thread.body.messages?.map((message) => message.body)).toEqual(["E2E mensaje sobre propuesta"]);
    expect(thread.body.conversation?.context?.title).toBe("E2E proyecto con chat");

    await resetAuth(page);
    await loginAs(page, E2E_USERS.professional.email, E2E_USERS.professional.password);
    const professionalThread = await apiJson<ThreadResponse>(page, `/api/direct-chat?id=${created.body.conversationId}`);
    expect(professionalThread.body.messages?.at(-1)?.body).toBe("E2E mensaje sobre propuesta");
    const reply = await apiJson<ChatResponse>(page, "/api/direct-chat", {
      method: "POST",
      body: { conversationId: created.body.conversationId, message: "E2E respuesta sobre propuesta" },
    });
    expect(reply.status).toBe(200);
  });

  test("validation, blocked threads and realtime delivery protect the conversation", async ({ page }) => {
    const admin = regressionAdminClient();
    await loginAs(page, E2E_USERS.client.email, E2E_USERS.client.password);
    const empty = await apiJson<ChatResponse>(page, "/api/direct-chat", {
      method: "POST",
      body: { professionalId: seed.professionalId, message: "   " },
    });
    expect(empty.status).toBe(400);

    const created = await apiJson<ChatResponse>(page, "/api/direct-chat", {
      method: "POST",
      body: { professionalId: seed.videoProfessionalId, message: "E2E inicia tiempo real" },
    });
    expect(created.status).toBe(200);
    conversationIds.push(created.body.conversationId!);

    await resetAuth(page);
    await loginAs(page, E2E_USERS.videoProfessional.email, E2E_USERS.videoProfessional.password);
    await gotoOK(page, `/es/mensajes?conversation=${created.body.conversationId}`);
    await expect(page.getByText("E2E inicia tiempo real").last()).toBeVisible();
    const realtimeBody = `E2E tiempo real ${Date.now()}`;
    const { error: realtimeError } = await admin.rpc("send_direct_message_atomic", {
      p_conversation_id: created.body.conversationId,
      p_sender_id: seed.clientId,
      p_body: realtimeBody,
    });
    if (realtimeError) throw realtimeError;
    await expect(page.getByText(realtimeBody).last()).toBeVisible({ timeout: 15_000 });

    await admin.from("direct_conversations").update({ status: "blocked" }).eq("id", created.body.conversationId);
    const blocked = await apiJson<ChatResponse>(page, "/api/direct-chat", {
      method: "POST",
      body: { conversationId: created.body.conversationId, message: "E2E no debe guardarse" },
    });
    expect(blocked.status).toBe(403);
    const { count } = await admin.from("direct_messages")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", created.body.conversationId)
      .eq("body", "E2E no debe guardarse");
    expect(count).toBe(0);
  });
});

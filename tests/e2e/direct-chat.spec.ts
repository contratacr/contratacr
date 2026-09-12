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
  const conversacionesDePrueba: string[] = [];
  const reportIds: string[] = [];
  let bookingId = "";
  let projectId = "";
  let proposalId = "";

  // Desde a8c05f7a hay UNA conversación por pareja: un chat previo entre el
  // cliente y el profesional sembrados (de otra suite, o de la prueba anterior
  // de este archivo) se reutilizaría con su contexto y sus contadores, y la
  // prueba no vería el contexto que acaba de crear. Cada prueba contextual
  // parte de una pareja sin chat.
  // Los chats que deja la siembra canónica (con sus citas y mensajes) se
  // fotografían antes de empezar y se devuelven al final tal cual: con un chat
  // por pareja, las pruebas los reutilizan o los quitan, y el verificador de
  // la siembra (y otras suites) los esperan ahí.
  const CHATS_SEMBRADOS = ["b6000000-0000-4000-8000-000000000001", "b6000000-0000-4000-8000-000000000002"];
  const AVISOS_SEMBRADOS = ["bf000000-0000-4000-8000-000000000001", "bf000000-0000-4000-8000-000000000002"];
  const conversacionesSembradas: Record<string, unknown>[] = [];
  const mensajesSembrados: Record<string, unknown>[] = [];
  const avisosSembrados: Record<string, unknown>[] = [];
  async function fotografiarChatsSembrados() {
    const admin = regressionAdminClient();
    const { data: conversaciones } = await admin.from("direct_conversations").select("*").in("id", CHATS_SEMBRADOS);
    const { data: mensajes } = await admin.from("direct_messages").select("*").in("conversation_id", CHATS_SEMBRADOS);
    const { data: avisos } = await admin.from("notifications").select("*").in("id", AVISOS_SEMBRADOS);
    conversacionesSembradas.push(...(conversaciones ?? []));
    mensajesSembrados.push(...(mensajes ?? []));
    avisosSembrados.push(...(avisos ?? []));
  }
  async function parejaSinChat() {
    const admin = regressionAdminClient();
    const { data: leftovers } = await admin.from("direct_conversations")
      .select("id")
      .eq("client_id", seed.clientId)
      .eq("professional_profile_id", seed.professionalUserId);
    const leftoverIds = (leftovers ?? []).map((row) => row.id as string);
    if (!leftoverIds.length) return;
    await admin.from("direct_messages").delete().in("conversation_id", leftoverIds);
    await admin.from("direct_conversations").delete().in("id", leftoverIds);
  }

  test.beforeAll(async () => {
    seed = await ensureRegressionSeed();
    await fotografiarChatsSembrados();
    await parejaSinChat();
  });
  // Direct chat is exercised as the app: the native shell marks every request
  // with this cookie, and the API moderates messages only for the app.
  test.beforeEach(async ({ context, baseURL }) => {
    await context.addCookies([{ name: "ccr_platform", value: "native", url: baseURL ?? "http://localhost:3000" }]);
    // Con la marca de app, la portada de bienvenida del primer arranque tapa
    // /login (y esconde el formulario): esta suite no la prueba, así que entra
    // como una app ya estrenada.
    await context.addInitScript(() => {
      window.localStorage.setItem("ccr:native-first-run-onboarding:v12", "1");
    });
  });
  test.afterAll(async () => {
    const admin = regressionAdminClient();
    // Un chat sembrado que la API reutilizó (un chat por pareja) no es de la
    // prueba: ni él, ni sus mensajes ni sus avisos se borran.
    const conversationIds = conversacionesDePrueba.filter((id) => !CHATS_SEMBRADOS.includes(id));
    if (conversationIds.length) {
      await admin.from("direct_messages").delete().in("conversation_id", conversationIds);
      const disposableReferences = [
        ...conversationIds,
        bookingId,
        projectId,
        proposalId,
      ].filter(Boolean);
      const { data: generatedNotifications, error: notificationLookupError } = await admin
        .from("notifications")
        .select("id,data")
        .limit(5000);
      if (notificationLookupError) throw notificationLookupError;
      const generatedNotificationIds = (generatedNotifications ?? [])
        .filter((notification) => {
          const data = JSON.stringify(notification.data ?? {});
          return disposableReferences.some((reference) => data.includes(reference));
        })
        .map((notification) => notification.id);
      if (generatedNotificationIds.length) {
        const { error: notificationCleanupError } = await admin
          .from("notifications")
          .delete()
          .in("id", generatedNotificationIds);
        if (notificationCleanupError) throw notificationCleanupError;
      }
      await admin.from("direct_conversations").delete().in("id", conversationIds);
    }
    if (bookingId) await admin.from("bookings").delete().eq("id", bookingId);
    if (proposalId) await admin.from("proposals").delete().eq("id", proposalId);
    if (projectId) await admin.from("projects").delete().eq("id", projectId);
    if (reportIds.length) await admin.from("reports").delete().in("id", reportIds);
    // Se devuelve el chat sembrado tal como estaba (una conversación por pareja:
    // primero se borra lo que quedó de las pruebas, arriba, y luego vuelve él).
    if (conversacionesSembradas.length) {
      // Lo que las pruebas dejaron entre las parejas sembradas se quita antes
      // de devolver los chats originales (un chat por pareja).
      const parejas = conversacionesSembradas.map((row) => `and(client_id.eq.${row.client_id},professional_profile_id.eq.${row.professional_profile_id})`);
      const { data: intrusos } = await admin.from("direct_conversations").select("id").or(parejas.join(","));
      const intrusoIds = (intrusos ?? []).map((row) => row.id as string).filter((id) => !CHATS_SEMBRADOS.includes(id));
      if (intrusoIds.length) {
        await admin.from("direct_messages").delete().in("conversation_id", intrusoIds);
        await admin.from("direct_conversations").delete().in("id", intrusoIds);
      }
      // Lo que las pruebas escribieron DENTRO de un chat sembrado reutilizado
      // (mensajes y avisos nuevos) también se retira antes de devolverlo.
      const mensajeIdsSembrados = mensajesSembrados.map((row) => row.id as string);
      let sobrantes = admin.from("direct_messages").delete().in("conversation_id", CHATS_SEMBRADOS);
      if (mensajeIdsSembrados.length) sobrantes = sobrantes.not("id", "in", `(${mensajeIdsSembrados.join(",")})`);
      await sobrantes;
      const { data: avisosDelRun } = await admin.from("notifications").select("id,data").limit(5000);
      const avisosSobrantes = (avisosDelRun ?? [])
        .filter((row) => !AVISOS_SEMBRADOS.includes(row.id as string) && CHATS_SEMBRADOS.some((id) => JSON.stringify(row.data ?? {}).includes(id)))
        .map((row) => row.id as string);
      if (avisosSobrantes.length) await admin.from("notifications").delete().in("id", avisosSobrantes);
      const { error: conversationRestoreError } = await admin.from("direct_conversations").upsert(conversacionesSembradas, { onConflict: "id" });
      if (conversationRestoreError) throw conversationRestoreError;
      if (mensajesSembrados.length) {
        const { error: messageRestoreError } = await admin.from("direct_messages").upsert(mensajesSembrados, { onConflict: "id" });
        if (messageRestoreError) throw messageRestoreError;
      }
    }
    if (avisosSembrados.length) {
      const { error: noticeRestoreError } = await admin.from("notifications").upsert(avisosSembrados, { onConflict: "id" });
      if (noticeRestoreError) throw noticeRestoreError;
    }
  });

  test("profile messages deduplicate and both participants can reply", async ({ page }) => {
    await loginAs(page, E2E_USERS.client.email, E2E_USERS.client.password);
    const first = await apiJson<ChatResponse>(page, "/api/direct-chat", { method: "POST", body: { professionalId: seed.professionalId, message: "E2E chat desde perfil" } });
    expect(first.status, JSON.stringify(first.body)).toBe(200); expect(first.body.conversationId).toBeTruthy();
    conversacionesDePrueba.push(first.body.conversationId!);
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
    // Desde a8c05f7a (un chat por persona) la cabecera del hilo muestra a la
    // persona, no el asunto «Conversación desde un perfil»: ese texto ya no
    // aparece en pantalla y solo vive en la base como asunto de respaldo.
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
    expect(created.status).toBe(200); conversacionesDePrueba.push(created.body.conversationId!);
    await gotoOK(page, `/es/mensajes?conversation=${created.body.conversationId}`);
    await expect(page.getByText("E2E reparación contextual").last()).toBeVisible();
    // La cabecera del hilo ya no lleva el botón «Ver cita» (a8c05f7a): el
    // contexto se lee en el propio hilo, con la descripción de la cita.

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

    await parejaSinChat();
    await loginAs(page, E2E_USERS.client.email, E2E_USERS.client.password);
    const created = await apiJson<ChatResponse>(page, "/api/direct-chat", {
      method: "POST",
      body: { proposalId, openConversation: true, initialMessage: "E2E mensaje sobre propuesta" },
    });
    expect(created.status, JSON.stringify(created.body)).toBe(200);
    conversacionesDePrueba.push(created.body.conversationId!);
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
    await loginAs(page, E2E_USERS.professional.email, E2E_USERS.professional.password);
    const empty = await apiJson<ChatResponse>(page, "/api/direct-chat", {
      method: "POST",
      body: { professionalId: seed.videoProfessionalId, message: "   " },
    });
    expect(empty.status).toBe(400);
    const offensive = await apiJson<ChatResponse>(page, "/api/direct-chat", {
      method: "POST",
      body: { professionalId: seed.videoProfessionalId, message: "Eres un imbécil" },
    });
    expect(offensive.status).toBe(422);

    const created = await apiJson<ChatResponse>(page, "/api/direct-chat", {
      method: "POST",
      body: { professionalId: seed.videoProfessionalId, message: "E2E inicia tiempo real" },
    });
    expect(created.status).toBe(200);
    conversacionesDePrueba.push(created.body.conversationId!);

    await resetAuth(page);
    await loginAs(page, E2E_USERS.videoProfessional.email, E2E_USERS.videoProfessional.password);
    await gotoOK(page, `/es/mensajes?conversation=${created.body.conversationId}`);
    await expect(page.getByText("E2E inicia tiempo real").last()).toBeVisible();
    const realtimeBody = `E2E tiempo real ${Date.now()}`;
    const { error: realtimeError } = await admin.rpc("send_direct_message_atomic", {
      p_conversation_id: created.body.conversationId,
      p_sender_id: seed.professionalUserId,
      p_body: realtimeBody,
      p_attachment_urls: [],
    });
    if (realtimeError) throw realtimeError;
    await expect(page.getByText(realtimeBody).last()).toBeVisible({ timeout: 15_000 });

    const reportAndBlock = await apiJson<ChatResponse>(page, "/api/direct-chat", {
      method: "PATCH",
      body: { conversationId: created.body.conversationId, action: "block_and_report", reason: "E2E conducta abusiva" },
    });
    expect(reportAndBlock.status).toBe(200);
    const { data: report } = await admin.from("reports")
      .select("id,reason,status")
      .eq("reported_client_id", seed.professionalUserId)
      .ilike("reason", "%E2E conducta abusiva%")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    expect(report?.status).toBe("open");
    expect(report?.reason).toContain("[Mensaje directo]");
    if (report?.id) reportIds.push(report.id);
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

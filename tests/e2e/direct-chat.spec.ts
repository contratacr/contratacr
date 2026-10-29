import { expect, test } from "playwright/test";
import { apiJson, gotoOK, loginAs, resetAuth } from "./helpers";
import { canRunSeededRegression, E2E_USERS, ensureRegressionSeed, regressionAdminClient, type RegressionSeedState } from "./seed";

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
  messages?: Array<{ id: string; sender_id: string; body: string; read_at?: string | null; reply_to_id?: string | null }>;
};

test.describe.configure({ mode: "serial" });
test.describe("@seeded contextual direct chat", () => {
  test.skip(!canRunSeededRegression(), "Requires the isolated test Supabase seed.");
  let seed: RegressionSeedState;
  const conversacionesDePrueba: string[] = [];
  const reportIds: string[] = [];
  let projectId = "";

  // Desde a8c05f7a hay UNA conversación por pareja: un chat previo entre el
  // cliente y el profesional sembrados (de otra suite, o de la prueba anterior
  // de este archivo) se reutilizaría con su contexto y sus contadores, y la
  // prueba no vería el contexto que acaba de crear. Cada prueba contextual
  // parte de una pareja sin chat.
  // Los chats que deja la siembra canónica (con sus mensajes) se
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
        projectId,
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
    // Dos mensajes seguidos sin leer dejan UN aviso, no dos: el segundo pone al
    // día el que ya estaba. Antes se apilaba uno por mensaje y diez mensajes
    // seguidos eran diez avisos y diez pushes.
    const { data: recipientNotifications } = await admin.from("notifications")
      .select("user_id, message")
      .eq("type", "direct_message")
      .contains("data", { conversation_id: first.body.conversationId });
    expect(recipientNotifications).toHaveLength(1);
    expect(recipientNotifications?.every((item) => item.user_id === seed.professionalUserId)).toBe(true);
    // Y el que queda muestra el ÚLTIMO mensaje, no el primero.
    expect(recipientNotifications?.[0]?.message).toContain("E2E segundo");

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
    await gotoOK(page, `/mensajes?conversation=${first.body.conversationId}`);
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

  // RESPONDER CITANDO (migración 228): la respuesta lleva la cita, se ve en la
  // burbuja, y solo se puede citar un mensaje de la MISMA conversación.
  test("responder citando un mensaje, por la API y desde la pantalla", async ({ page }) => {
    const marca = Date.now();
    await loginAs(page, E2E_USERS.client.email, E2E_USERS.client.password);
    const original = await apiJson<ChatResponse & { message?: { id: string } }>(page, "/api/direct-chat", { method: "POST", body: { professionalId: seed.professionalId, message: `E2E original ${marca}` } });
    expect(original.status, JSON.stringify(original.body)).toBe(200);
    const conversationId = original.body.conversationId!;
    if (!conversacionesDePrueba.includes(conversationId)) conversacionesDePrueba.push(conversationId);
    const originalId = original.body.message!.id;

    await loginAs(page, E2E_USERS.professional.email, E2E_USERS.professional.password);
    const respuesta = await apiJson<ChatResponse & { message?: { id: string; reply_to_id?: string | null } }>(page, "/api/direct-chat", { method: "POST", body: { conversationId, message: `E2E respuesta ${marca}`, replyToId: originalId } });
    expect(respuesta.status, JSON.stringify(respuesta.body)).toBe(200);
    expect(respuesta.body.message?.reply_to_id).toBe(originalId);

    // Citar algo que no es de esta conversación: el mensaje sale, sin cita.
    const ajeno = await apiJson<ChatResponse & { message?: { reply_to_id?: string | null } }>(page, "/api/direct-chat", { method: "POST", body: { conversationId, message: `E2E sin cita ${marca}`, replyToId: "00000000-0000-4000-8000-000000000000" } });
    expect(ajeno.status).toBe(200);
    expect(ajeno.body.message?.reply_to_id ?? null).toBeNull();

    const hilo = await apiJson<ThreadResponse>(page, `/api/direct-chat?id=${conversationId}`);
    expect(hilo.body.messages?.find((m) => m.body === `E2E respuesta ${marca}`)?.reply_to_id).toBe(originalId);

    // A pending service follow-up must not cover messages or their reply menu.
    await page.route("**/api/contact/follow-up", async (route) => {
      await route.fulfill({ json: { followUp: {
        id: "00000000-0000-4000-8000-000000000134",
        professional_id: seed.professionalId, professional_name: "Redes Bahía",
        status: "contacted", contact_method: "whatsapp",
      }, pendingCount: 1 } });
    });
    // En pantalla: la burbuja muestra la cita…
    await gotoOK(page, `/mensajes?conversation=${conversationId}`);
    const burbuja = page.locator(`[id^="msg-"]`).filter({ hasText: `E2E respuesta ${marca}` }).last();
    await expect(burbuja.locator("[data-cita]")).toContainText(`E2E original ${marca}`);

    // The follow-up normally appears after four seconds on eligible pages.
    await page.waitForTimeout(4500);
    await expect(page.locator(".ccr-seguimiento-servicio")).toHaveCount(0);
    // …y se responde desde el menú del mensaje.
    const objetivo = page.locator(`[id^="msg-"]`).filter({ hasText: `E2E sin cita ${marca}` }).last();
    await objetivo.locator("p").first().click({ button: "right" });
    await page.getByRole("menuitem", { name: /^(Responder|Reply)$/ }).click();
    await expect(page.locator("[data-respuesta-en-curso]")).toContainText(`E2E sin cita ${marca}`);
    await page.locator("textarea").last().fill(`E2E desde la pantalla ${marca}`);
    await page.getByRole("button", { name: /^(Enviar|Send)$/ }).last().click();
    await expect(page.locator("[data-respuesta-en-curso]")).toHaveCount(0);
    const enviada = page.locator(`[id^="msg-"]`).filter({ hasText: `E2E desde la pantalla ${marca}` }).last();
    await expect(enviada.locator("[data-cita]")).toContainText(`E2E sin cita ${marca}`);
  });

  // Las PROPUESTAS se retiraron del app: `/api/direct-chat` ya no abre un chat
  // desde una propuesta —lo dice su propio comentario— y solo sigue LEYENDO las
  // conversaciones que nacieron así. Esta prueba pedía esa puerta retirada y
  // recibía «Profesional no encontrado»: deriva de la prueba, no del app. Ahora
  // cubre las dos cosas que sí siguen vivas.
  test("el chat de un proyecto queda enlazado a su publicación y lo ven los dos lados", async ({ page }) => {
    const admin = regressionAdminClient();
    const { data: project, error: projectError } = await admin.from("projects").insert({
      client_id: seed.clientId,
      category_id: seed.categoryId,
      title: "E2E proyecto con chat",
      description: "E2E contexto para comprobar el chat de un proyecto.",
      provincia_id: "al",
      canton_id: "al-al",
      status: "open",
    }).select("id").single();
    if (projectError) throw projectError;
    projectId = project.id;

    await parejaSinChat();
    await loginAs(page, E2E_USERS.client.email, E2E_USERS.client.password);
    const created = await apiJson<ChatResponse>(page, "/api/direct-chat", {
      method: "POST",
      body: { projectId, professionalId: seed.professionalId, openConversation: true, initialMessage: "E2E mensaje sobre el proyecto" },
    });
    expect(created.status, JSON.stringify(created.body)).toBe(200);
    conversacionesDePrueba.push(created.body.conversationId!);

    // Volver a pedirlo NO abre una segunda conversación ni duplica el mensaje.
    const reopened = await apiJson<ChatResponse>(page, "/api/direct-chat", {
      method: "POST",
      body: { projectId, professionalId: seed.professionalId, openConversation: true, initialMessage: "E2E mensaje que no debe duplicarse" },
    });
    expect(reopened.status, JSON.stringify(reopened.body)).toBe(200);
    expect(reopened.body.conversationId).toBe(created.body.conversationId);

    const thread = await apiJson<ThreadResponse>(page, `/api/direct-chat?id=${created.body.conversationId}`);
    expect(thread.body.conversation?.context?.type).toBe("project");
    expect(thread.body.conversation?.context?.title).toBe("E2E proyecto con chat");
    expect(thread.body.messages).toEqual([]);
    // Reopening an existing contact keeps the suggested text in the composer.
    const draftParams = new URLSearchParams({ draftChat: "1", professionalId: seed.professionalId, professionalName: "Profesional de prueba", projectId, contextTitle: "E2E proyecto con chat", draftMessage: "E2E mensaje sobre el proyecto" });
    await gotoOK(page, `/mensajes?${draftParams}`);
    await expect(page.getByPlaceholder(/Escribe un mensaje|Write a message/)).toHaveValue("E2E mensaje sobre el proyecto");
    await expect(page).toHaveURL(new RegExp(`conversation=${created.body.conversationId}`));
    const unsent = await apiJson<ThreadResponse>(page, `/api/direct-chat?id=${created.body.conversationId}`);
    expect(unsent.body.messages).toEqual([]);
    // Only the explicit Send action delivers the draft.
    const sent = await apiJson<ChatResponse>(page, "/api/direct-chat", {
      method: "POST", body: { conversationId: created.body.conversationId, message: "E2E mensaje sobre el proyecto" },
    });
    expect(sent.status, JSON.stringify(sent.body)).toBe(200);

    await resetAuth(page);
    await loginAs(page, E2E_USERS.professional.email, E2E_USERS.professional.password);
    const professionalThread = await apiJson<ThreadResponse>(page, `/api/direct-chat?id=${created.body.conversationId}`);
    expect(professionalThread.body.messages?.at(-1)?.body).toBe("E2E mensaje sobre el proyecto");
    const reply = await apiJson<ChatResponse>(page, "/api/direct-chat", {
      method: "POST",
      body: { conversationId: created.body.conversationId, message: "E2E respuesta sobre el proyecto" },
    });
    expect(reply.status).toBe(200);
  });

  test("abrir un chat desde una propuesta ya no existe", async ({ page }) => {
    // La puerta se retiró con las propuestas. Que siga cerrada es parte del
    // contrato: si alguien la reabre sin querer, esto se pone rojo.
    await loginAs(page, E2E_USERS.client.email, E2E_USERS.client.password);
    const intento = await apiJson<ChatResponse>(page, "/api/direct-chat", {
      method: "POST",
      body: { proposalId: "00000000-0000-4000-8000-000000000001", openConversation: true, initialMessage: "E2E propuesta retirada" },
    });
    expect([400, 404]).toContain(intento.status);
    expect(intento.body.conversationId).toBeFalsy();
  });

  test("validation, blocked threads and realtime delivery protect the conversation", async ({ page }, testInfo) => {
    // Record protocol states, never credentials, channel identifiers or messages.
    // A 101 handshake alone does not certify a subscribed Postgres channel.
    const realtimeStates: Array<{ event: string; status?: string; at: number }> = [];
    page.on("websocket", socket => {
      if (!socket.url().includes("/realtime/")) return;
      socket.on("framereceived", frame => {
        try {
          const data = JSON.parse(String(frame.payload));
          const event = Array.isArray(data) ? data[3] : data.event;
          const payload = Array.isArray(data) ? data[4] : data.payload;
          if (!["phx_reply", "system", "postgres_changes", "phx_error", "phx_close"].includes(event)) return;
          const rawStatus = payload?.status;
          const status = ["ok", "error", "timeout"].includes(rawStatus) ? rawStatus : undefined;
          if (realtimeStates.length < 100) realtimeStates.push({ event, status, at: Date.now() });
        } catch { /* Binary frames are not diagnostic text. */ }
      });
    });
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
    await gotoOK(page, `/mensajes?conversation=${created.body.conversationId}`);
    await expect(page.getByText("E2E inicia tiempo real").last()).toBeVisible();
    const realtimeBody = `E2E tiempo real ${Date.now()}`;
    const { error: realtimeError } = await admin.rpc("send_direct_message_atomic", {
      p_conversation_id: created.body.conversationId,
      p_sender_id: seed.professionalUserId,
      p_body: realtimeBody,
      p_attachment_urls: [],
    });
    if (realtimeError) throw realtimeError;
    try {
      await expect(page.getByText(realtimeBody).last()).toBeVisible({ timeout: 15_000 });
    } finally {
      await testInfo.attach("realtime-protocol-states", {
        body: JSON.stringify(realtimeStates), contentType: "application/json",
      });
    }

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

test('chat download saves bytes without opening the storage URL', async ({ page }) => {
 const { build } = await import('esbuild');
 const built = await build({entryPoints:['src/lib/chat-download.ts'],bundle:true,write:false,platform:'browser',format:'iife',globalName:'ChatDownload',tsconfig:'tsconfig.json'});
 await page.route('**/chat-download-harness', route => route.fulfill({contentType:'text/html',body:'<!doctype html><title>Chat download test</title>'}));
 await page.goto('/chat-download-harness');
 await page.addScriptTag({content:built.outputFiles[0].text});
 await page.route('**/chat-download-test.png', route => route.fulfill({contentType:'image/png',body:Buffer.from('89504e470d0a1a0a','hex')}));
 await page.evaluate(()=>{Object.defineProperty(navigator,'share',{configurable:true,value:undefined})});
 const [download] = await Promise.all([
  page.waitForEvent('download'),
  page.evaluate(async()=>{
   const api=(window as unknown as {ChatDownload:{downloadChatAttachment:(a:unknown)=>Promise<void>}}).ChatDownload;
   await api.downloadChatAttachment({url:'/chat-download-test.png',name:'foto.png',type:'image/png'});
  }),
 ]);
 expect(download.suggestedFilename()).toBe('foto.png');
 expect(page.url()).toContain('/chat-download-harness');
 expect(page.context().pages()).toHaveLength(1);
});

test('canceling the mobile file sheet never downloads or opens another page',async({page})=>{
 const { build } = await import('esbuild');
 const built=await build({entryPoints:['src/lib/chat-download.ts'],bundle:true,write:false,platform:'browser',format:'iife',globalName:'ChatDownload',tsconfig:'tsconfig.json'});
 await page.route('**/chat-download-harness', route => route.fulfill({contentType:'text/html',body:'<!doctype html><title>Chat download test</title>'}));
 await page.goto('/chat-download-harness');
 await page.addScriptTag({content:built.outputFiles[0].text});
 await page.route('**/chat-download-test.png',route=>route.fulfill({contentType:'image/png',body:Buffer.from('89504e470d0a1a0a','hex')}));
 let downloads=0;page.on('download',()=>downloads++);
 await page.evaluate(async()=>{
  window.matchMedia=(()=>({matches:true})) as unknown as typeof window.matchMedia;
  Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>true});
  Object.defineProperty(navigator,'share',{configurable:true,value:async()=>{throw new DOMException('Canceled','AbortError')}});
  await (window as unknown as {ChatDownload:{downloadChatAttachment:(a:unknown)=>Promise<void>}}).ChatDownload.downloadChatAttachment({url:'/chat-download-test.png',name:'foto.png',type:'image/png'});
 });
 expect(downloads).toBe(0);expect(page.context().pages()).toHaveLength(1);
});

test('chat reconciles messages missed while subscribing and ignores obsolete channels', async ({ page }) => {
  const { readFileSync } = await import('node:fs');
  const ts = await import('typescript');
  const source = readFileSync('src/components/dashboard/direct-chat-inbox.tsx', 'utf8');
  const ast = ts.createSourceFile('inbox.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let effect = '';
  const visit = (node: import('typescript').Node) => {
    if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect'
      && node.arguments[0]?.getText(ast).includes('`direct-chat-${user.id}`')) effect = node.arguments[0].getText(ast);
    ts.forEachChild(node, visit);
  };
  visit(ast);
  expect(effect, 'Exercise the actual inbox subscription effect').not.toBe('');
  const compiled = ts.transpileModule(`window.mountChat = ${effect};`, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
  await page.route('**/chat-subscription-harness', r => r.fulfill({ contentType: 'text/html', body: '<!doctype html><div id="messages">initial</div>' }));
  await page.goto('/chat-subscription-harness');
  await page.addScriptTag({ content: `
    const user={id:'recipient'},activeId='thread',DRAFT_CONVERSATION_ID='draft',APP_RESUME_EVENT='resume';
    const vistosVisibles={current:true}; const setMessages=()=>{};
    let stored='initial'; let loads=0; const callbacks=[];
    const loadThread=async()=>{loads++;document.getElementById('messages').textContent=stored;};
    const loadConversations=async()=>{};
    const createClient=()=>({channel:()=>{const c={on:()=>c,subscribe:cb=>{callbacks.push(cb);return c;}};return c;},removeChannel:async()=>{}});
    ${compiled}
    window.chatProbe={insert:value=>{stored=value;},subscribe:index=>callbacks[index]?.('SUBSCRIBED'),loads:()=>loads};
    window.disposeChat=window.mountChat();
  ` });
  // The first HTTP snapshot is visible, but the server has not acknowledged
  // the channel yet. An insert in that interval has no realtime recipient.
  await page.evaluate(() => {
    const w = window as unknown as { chatProbe: { insert(v: string): void; subscribe(i: number): void } };
    w.chatProbe.insert('message during subscription'); w.chatProbe.subscribe(0);
  });
  await expect(page.locator('#messages')).toHaveText('message during subscription');
  await page.evaluate(() => {
    const w = window as unknown as { disposeChat(): void; mountChat(): () => void; chatProbe: { insert(v: string): void; subscribe(i: number): void } };
    w.disposeChat(); w.disposeChat=w.mountChat();
    w.chatProbe.insert('message during reconnect'); w.chatProbe.subscribe(1);
  });
  await expect(page.locator('#messages')).toHaveText('message during reconnect');
  const before = await page.evaluate(() => (window as unknown as { chatProbe: { loads(): number } }).chatProbe.loads());
  await page.evaluate(() => (window as unknown as { chatProbe: { subscribe(i: number): void } }).chatProbe.subscribe(0));
  expect(await page.evaluate(() => (window as unknown as { chatProbe: { loads(): number } }).chatProbe.loads())).toBe(before);
});

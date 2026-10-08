import { NextResponse } from "next/server";
import { idiomaDeLaPeticion, mensajeDeError } from "@/lib/api-errors";
import { createClient } from "@/lib/supabase/server";
import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordServerInteraction } from "@/lib/analytics/server-interactions";
import { limitTrimmedText } from "@/lib/text-limits";
import { validateDirectMessage } from "@/lib/moderation/messages";

// Messages written inside the app are moderated and, when the other person
// has no app, announced by email; the website keeps the behaviour it always
// had. The native shell marks its requests with the ccr_platform cookie.
function isNativeRequest(req: Request) {
  return /(?:^|;\s*)ccr_platform=native(?:;|$)/.test(req.headers.get("cookie") ?? "");
}
import { sendNotificationPush } from "@/lib/push/notify";
import { notifyRecipientOutsideApp, usersWithFreshPush } from "@/lib/direct-chat/outside-app-notify";
import { drainPushOutbox } from "@/lib/push/worker";
import { despuesDeResponder } from "@/lib/after-response";
import { invitarAResenaAhora } from "@/lib/notifications/invitar-ahora";

type ConversationRow = {
  id: string;
  client_id: string;
  professional_id: string;
  professional_profile_id: string;
  project_id?: string | null;
  proposal_id?: string | null;
  subject?: string | null;
  status?: "open" | "archived" | "blocked";
  client_archived_at?: string | null;
  professional_archived_at?: string | null;
  client_deleted_at?: string | null;
  professional_deleted_at?: string | null;
  [key: string]: unknown;
};
type DirectAttachment = {
  path: string;
  name: string;
  type: string;
  size: number;
  url?: string | null;
};
type DirectMessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  attachment_urls?: unknown;
  read_at?: string | null;
  created_at: string;
  edited_at?: string | null;
  deleted_at?: string | null;
  reply_to_id?: string | null;
};

const ATTACHMENT_BUCKET = "direct-message-attachments";
const MAX_ATTACHMENTS = 3;
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const ALLOWED_ATTACHMENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

async function currentUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

function participant(row: ConversationRow, userId: string) {
  return row.client_id === userId || row.professional_profile_id === userId;
}

function normalizeAttachments(value: unknown, conversationId: string, senderId: string): DirectAttachment[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, MAX_ATTACHMENTS).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const raw = item as Record<string, unknown>;
    const path = typeof raw.path === "string" ? raw.path : "";
    const name = typeof raw.name === "string" ? raw.name.slice(0, 120) : "archivo";
    const type = typeof raw.type === "string" ? raw.type : "";
    const size = typeof raw.size === "number" ? raw.size : Number(raw.size ?? 0);
    const expectedPrefix = `${conversationId}/${senderId}/`;
    if (!path.startsWith(expectedPrefix) || !ALLOWED_ATTACHMENT_TYPES.has(type) || !Number.isFinite(size) || size <= 0 || size > MAX_ATTACHMENT_BYTES) return [];
    return [{ path, name, type, size }];
  });
}

async function signMessageAttachments(db: ReturnType<typeof createAdminClient>, rows: DirectMessageRow[]) {
  return Promise.all(rows.map(async (row) => {
    const refs = normalizeAttachments(row.attachment_urls, row.conversation_id, row.sender_id);
    if (!refs.length) return { ...row, attachment_urls: [] };
    const signed = await Promise.all(refs.map(async (attachment) => {
      const { data } = await db.storage.from(ATTACHMENT_BUCKET).createSignedUrl(attachment.path, 60 * 60);
      return { ...attachment, url: data?.signedUrl ?? null };
    }));
    return { ...row, attachment_urls: signed };
  }));
}

// La columna `contexts` llega con la migración 188: hasta que esté aplicada, el
// chat sigue funcionando sin ella y simplemente no acumula orígenes.
function missingContextsColumn(error: { code?: string; message?: string } | null | undefined) {
  const message = error?.message ?? "";
  return error?.code === "42703" || message.includes("contexts");
}

function missingParticipantDeleteColumns(error: { code?: string; message?: string } | null | undefined) {
  const message = error?.message ?? "";
  return error?.code === "42703" || message.includes("client_deleted_at") || message.includes("professional_deleted_at");
}

async function enrichConversations(db: ReturnType<typeof createAdminClient>, rows: ConversationRow[]) {
  if (!rows.length) return [];
  const clientIds = [...new Set(rows.map((row) => row.client_id))];
  // Un hilo puede arrastrar varios orígenes (una solicitud, luego un proyecto…).
  const listaContextos = (row: ConversationRow) => (Array.isArray(row.contexts) ? row.contexts as Array<Record<string, unknown>> : []);
  const projectIds = [...new Set(rows.flatMap((row) => [
    ...(row.project_id ? [row.project_id] : []),
    ...listaContextos(row).flatMap((ctx) => (ctx.projectId ? [String(ctx.projectId)] : [])),
  ]))];
  const proposalIds = [...new Set(rows.flatMap((row) => [
    ...(row.proposal_id ? [row.proposal_id] : []),
    ...listaContextos(row).flatMap((ctx) => (ctx.proposalId ? [String(ctx.proposalId)] : [])),
  ]))];
  const [clientsResult, projectsResult, proposalsResult] = await Promise.all([
    db.from("profiles").select("id, full_name, avatar_url").in("id", clientIds),
    projectIds.length ? db.from("projects").select("id, title, status").in("id", projectIds) : Promise.resolve({ data: [] }),
    proposalIds.length ? db.from("proposals").select("id, status").in("id", proposalIds) : Promise.resolve({ data: [] }),
  ]);
  const clients = new Map((clientsResult.data ?? []).map((row) => [row.id, row]));
  const projects = new Map((projectsResult.data ?? []).map((row) => [row.id, row]));
  const proposals = new Map((proposalsResult.data ?? []).map((row) => [row.id, row]));
  const withPush = await usersWithFreshPush(db, rows.flatMap((row) => [row.client_id, row.professional_profile_id]));
  return rows.map((row) => {
    const professionalHasApp = withPush.has(row.professional_profile_id);
    const joined = row.professionals as { whatsapp?: string | null } | null | undefined;
    const { whatsapp, ...professionalPublic } = joined ?? {};
    return {
    ...row,
    professionals: joined ? professionalPublic : row.professionals,
    client_has_app: withPush.has(row.client_id),
    professional_has_app: professionalHasApp,
    // Exposed only as the last-resort contact when the professional cannot be
    // reached inside the app; the web already shows this number publicly.
    professional_whatsapp: professionalHasApp ? null : (whatsapp ?? null),
    client_profile: clients.get(row.client_id) ?? null,
    context: row.project_id
      ? { type: row.proposal_id ? "proposal" : "project", ...(projects.get(row.project_id) ?? {}), proposal_status: row.proposal_id ? proposals.get(row.proposal_id)?.status : null }
      : { type: "profile", title: row.subject ?? null, status: "open" },
    contexts: listaContextos(row).map((ctx) => {
      const projectId = ctx.projectId ? String(ctx.projectId) : null;
      const proposalId = ctx.proposalId ? String(ctx.proposalId) : null;
      const project = projectId ? projects.get(projectId) : null;
      return {
        type: proposalId ? "proposal" : projectId ? "project" : "profile",
        projectId,
        proposalId,
        title: (project?.title as string | undefined)
          || (ctx.title ? String(ctx.title) : null),
        status: (project?.status as string | undefined) || null,
        at: ctx.at ? String(ctx.at) : null,
      };
    }),
    };
  });
}

export async function GET(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const db = createAdminClient();
  const searchParams = new URL(req.url).searchParams;
  // ¿QUÉ PROFESIONALES TIENEN LA APP? De eso depende el botón de contacto en la
  // app: «Mensaje» (el chat) si el profesional la tiene, «WhatsApp» si no. Al
  // lanzar casi nadie la tiene, y mandar al cliente a un chat que el otro no
  // abre era la peor primera experiencia. Se pregunta por varios a la vez: una
  // búsqueda pinta muchas tarjetas y cada una necesita saberlo antes de pintar
  // su botón, no al tocarlo.
  //
  // EL BLOQUEO MANDA ANTES QUE LA SALIDA A WHATSAPP. Si esta persona tiene una
  // conversación bloqueada con el profesional, el botón es el chat, tenga o no
  // la app el otro: ahí está la explicación y el botón de deshacerlo. Mandarla a
  // WhatsApp sería esquivar el bloqueo por otra puerta.
  const conApp = searchParams.get("conApp");
  if (conApp) {
    const ids = [...new Set(conApp.split(",").map((v) => v.trim()).filter(Boolean))].slice(0, 60);
    const { data: filas } = await db.from("professionals").select("id, profile_id").in("id", ids);
    const perfiles = ((filas ?? []) as { id: string; profile_id: string | null }[]).filter((f) => f.profile_id);
    const [conPush, { data: bloqueadas }] = await Promise.all([
      usersWithFreshPush(db, perfiles.map((f) => f.profile_id as string)),
      db.from("direct_conversations").select("professional_id")
        .eq("client_id", user.id).eq("status", "blocked").in("professional_id", ids),
    ]);
    const conBloqueo = new Set(((bloqueadas ?? []) as { professional_id: string }[]).map((b) => b.professional_id));
    const resultado: Record<string, boolean> = {};
    for (const id of ids) resultado[id] = false;
    for (const f of perfiles) resultado[f.id] = conPush.has(f.profile_id as string) || conBloqueo.has(f.id);
    return NextResponse.json({ conApp: resultado });
  }
  const id = searchParams.get("id");
  if (id) {
    const { data } = await db.from("direct_conversations")
      .select("*, professionals(id, slug, business_name, whatsapp, profiles(full_name, avatar_url))")
      .eq("id", id).maybeSingle();
    const conversation = data as ConversationRow | null;
    const deletedForParticipant = conversation && (conversation.client_id === user.id
      ? conversation.client_deleted_at
      : conversation.professional_deleted_at);
    if (deletedForParticipant) return NextResponse.json({ error: mensajeDeError(req, { es: "Conversación no encontrada", en: "Conversation not found" }) }, { status: 404 });
    if (!conversation || !participant(conversation, user.id)) return NextResponse.json({ error: mensajeDeError(req, { es: "Conversación no encontrada", en: "Conversation not found" }) }, { status: 404 });
    // reply_to_id (migración 228): sin la columna se piden los mensajes sin
    // cita, en vez de dejar el chat entero sin cargar.
    const COLUMNAS = "id, conversation_id, sender_id, body, attachment_urls, read_at, delivered_at, created_at, edited_at, deleted_at";
    const pedirMensajes = (columnas: string) => db.from("direct_messages")
      .select(columnas)
      .eq("conversation_id", id)
      // Lo que esta persona eliminó «para mí» no le vuelve a llegar.
      .not("hidden_for", "cs", `{${user.id}}`)
      .order("created_at", { ascending: true });
    let { data: messages, error } = await pedirMensajes(`${COLUMNAS}, reply_to_id`);
    if (error && /reply_to_id/.test(error.message)) ({ data: messages, error } = await pedirMensajes(COLUMNAS));
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    // CONFIRMACIONES DE LECTURA, recíprocas (migración 226). Quien las apagó no
    // marca «visto» lo que lee, y quien habla con alguien que las apagó —o las
    // apagó él— no ve el «visto» de sus mensajes. Sin la columna, todos
    // encendidos, que es como estaban.
    const otraParte = conversation.client_id === user.id ? conversation.professional_profile_id : conversation.client_id;
    const { data: preferencias } = await db.from("profiles").select("id, confirmaciones_de_lectura").in("id", [user.id, otraParte]);
    const confirma = (quien: string) => (preferencias as { id: string; confirmaciones_de_lectura?: boolean }[] | null)
      ?.find((fila) => fila.id === quien)?.confirmaciones_de_lectura !== false;
    const marcoVisto = confirma(user.id);
    const veoVistos = marcoVisto && confirma(otraParte);
    const readAt = new Date().toISOString();
    const [{ error: readError }, , { error: unreadError }] = await Promise.all([
      marcoVisto
        ? db.from("direct_messages")
          .update({ read_at: readAt })
          .eq("conversation_id", id)
          .neq("sender_id", user.id)
          .is("read_at", null)
        : Promise.resolve({ error: null }),
      // Visto implica recibido: si nunca pasó por «recibido» (quien lee desde
      // un aviso sin haber abierto antes la app), se marca a la vez.
      db.from("direct_messages")
        .update({ delivered_at: readAt })
        .eq("conversation_id", id)
        .neq("sender_id", user.id)
        .is("delivered_at", null),
      db.from("direct_conversations").update(conversation.client_id === user.id
        ? { client_unread_count: 0 }
        : { professional_unread_count: 0 }).eq("id", id),
    ]);
    if (readError || unreadError) {
      return NextResponse.json({ error: readError?.message ?? unreadError?.message }, { status: 500 });
    }
    const [enriched] = await enrichConversations(db, [conversation]);
    const visibles = ((messages ?? []) as unknown as DirectMessageRow[]).map((m) => (
      !veoVistos && m.sender_id === user.id ? { ...m, read_at: null } : m
    ));
    return NextResponse.json({ conversation: enriched, messages: await signMessageAttachments(db, visibles), vistos: veoVistos });
  }
  const estado = searchParams.get("status");
  const archived = estado === "archived";

  // LA BANDEJA DE BLOQUEADOS ES «LOS QUE YO BLOQUEÉ», no «los bloqueados». Se
  // filtra por `blocked_by` a propósito: si listara todas las bloqueadas, la
  // persona bloqueada vería una bandeja nueva apareciendo de la nada y sabría
  // que la bloquearon. Para ella la conversación simplemente ya no está.
  if (estado === "blocked") {
    const { data, error } = await db.from("direct_conversations")
      .select("*, professionals(id, slug, business_name, whatsapp, profiles(full_name, avatar_url))")
      .or(`client_id.eq.${user.id},professional_profile_id.eq.${user.id}`)
      .eq("status", "blocked")
      .eq("blocked_by", user.id)
      .order("updated_at", { ascending: false })
      .limit(50);
    // Sin la columna todavía en la base, la bandeja sale vacía en vez de romperse.
    if (error) return NextResponse.json({ conversations: [] });
    return NextResponse.json({ conversations: await enrichConversations(db, (data ?? []) as ConversationRow[]) });
  }

  const buildConversationsQuery = (filterDeleted: boolean) => {
    let conversationsQuery = db.from("direct_conversations")
      .select("*, professionals(id, slug, business_name, whatsapp, profiles(full_name, avatar_url))")
      .or(`client_id.eq.${user.id},professional_profile_id.eq.${user.id}`)
      .neq("status", "blocked");
    conversationsQuery = archived
      ? conversationsQuery.or(`and(client_id.eq.${user.id},client_archived_at.not.is.null),and(professional_profile_id.eq.${user.id},professional_archived_at.not.is.null)`)
      : conversationsQuery.or(`and(client_id.eq.${user.id},client_archived_at.is.null),and(professional_profile_id.eq.${user.id},professional_archived_at.is.null)`);
    if (filterDeleted) {
      conversationsQuery = conversationsQuery
        .or(`and(client_id.eq.${user.id},client_deleted_at.is.null),and(professional_profile_id.eq.${user.id},professional_deleted_at.is.null)`);
    }
    return conversationsQuery
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(50);
  };
  let { data, error } = await buildConversationsQuery(true);
  if (missingParticipantDeleteColumns(error)) {
    ({ data, error } = await buildConversationsQuery(false));
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // RECIBIDO (✓✓): la app de esta persona acaba de cargar sus conversaciones,
  // así que lo que le escribieron ya le llegó. Solo en la app —la web no
  // muestra el chat— y solo donde tiene algo sin leer. Va después de responder:
  // la lista no espera por esto.
  if (isNativeRequest(req)) {
    const conPendientes = ((data ?? []) as ConversationRow[])
      .filter((c) => Number(c.client_id === user.id ? c.client_unread_count : c.professional_unread_count) > 0)
      .map((c) => c.id);
    if (conPendientes.length) {
      despuesDeResponder(Promise.resolve(db.from("direct_messages")
        .update({ delivered_at: new Date().toISOString() })
        .in("conversation_id", conPendientes)
        .neq("sender_id", user.id)
        .is("delivered_at", null)), "direct-chat:recibido");
    }
  }
  return NextResponse.json({ conversations: await enrichConversations(db, (data ?? []) as ConversationRow[]) });
}

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: mensajeDeError(req, { es: "Inicia sesión para usar el chat.", en: "Sign in to use chat." }) }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const professionalId = String(body.professionalId ?? "");
  const conversationId = String(body.conversationId ?? "");
  const projectId = String(body.projectId ?? "");
  const contextTitle = limitTrimmedText(body.contextTitle, 160);
  const message = limitTrimmedText(body.message, 2000);
  const nativeRequest = isNativeRequest(req);
  if (nativeRequest) {
    const moderation = validateDirectMessage(message, idiomaDeLaPeticion(req));
    if (!moderation.ok) return NextResponse.json({ error: moderation.error }, { status: 422 });
  }
  const initialMessage = limitTrimmedText(body.initialMessage, 2000);
  const openConversation = body.openConversation === true;
  const hasRawAttachments = Array.isArray(body.attachmentUrls) && body.attachmentUrls.length > 0;
  if (!message && !hasRawAttachments && !openConversation) return NextResponse.json({ error: "Escribe un mensaje o adjunta un archivo." }, { status: 400 });
  const db = createAdminClient();
  let conversation: ConversationRow | null = null;
  let conversationCreated = false;

  if (conversationId) {
    const { data } = await db.from("direct_conversations").select("*").eq("id", conversationId).maybeSingle();
    conversation = data as ConversationRow | null;
  } else {
    let clientId = user.id;
    const resolvedProfessionalId = professionalId;
    let resolvedProjectId: string | null = null;
    let subject = contextTitle || "Conversación desde un perfil";

    // Abrir un chat DESDE una propuesta ya no existe: no hay propuestas, y las
    // citas se borraron (8-oct-2026). Las conversaciones que nacieron así se
    // siguen leyendo; lo que se retira es la puerta para crear nuevas.
    if (projectId && professionalId) {
      const { data: project } = await db.from("projects").select("id, client_id, title").eq("id", projectId).maybeSingle();
      if (!project) return NextResponse.json({ error: "Proyecto no encontrado." }, { status: 404 });
      clientId = project.client_id; resolvedProjectId = project.id; subject = project.title;
    }

    const { data: professional } = await db.from("professionals").select("id, profile_id, business_name, profiles(full_name)").eq("id", resolvedProfessionalId).maybeSingle();
    if (!professional) return NextResponse.json({ error: "Profesional no encontrado." }, { status: 404 });
    const professionalProfileId = professional.profile_id as string;
    if (clientId === professionalProfileId) return NextResponse.json({ error: "No puedes abrir un chat contigo mismo." }, { status: 400 });
    if (user.id !== clientId && user.id !== professionalProfileId) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

    const { data: existing } = await db.from("direct_conversations")
      .select("*")
      .eq("client_id", clientId)
      .eq("professional_id", resolvedProfessionalId)
      .eq("status", "open")
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    conversation = existing as ConversationRow | null;
    if (conversation && contextTitle && !resolvedProjectId) {
      let { error: subjectError } = await db.from("direct_conversations")
        .update({
          subject: contextTitle,
          client_deleted_at: null,
          professional_deleted_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", conversation.id);
      if (missingParticipantDeleteColumns(subjectError)) {
        ({ error: subjectError } = await db.from("direct_conversations")
          .update({ subject: contextTitle, updated_at: new Date().toISOString() })
          .eq("id", conversation.id));
      }
      if (subjectError) return NextResponse.json({ error: subjectError.message }, { status: 500 });
      conversation.subject = contextTitle;
      conversation.client_deleted_at = null;
      conversation.professional_deleted_at = null;
    } else if (conversation) {
      const { error: reopenDeletedError } = await db.from("direct_conversations")
        .update({ client_deleted_at: null, professional_deleted_at: null, updated_at: new Date().toISOString() })
        .eq("id", conversation.id);
      if (reopenDeletedError && !missingParticipantDeleteColumns(reopenDeletedError)) {
        return NextResponse.json({ error: reopenDeletedError.message }, { status: 500 });
      }
      conversation.client_deleted_at = null;
      conversation.professional_deleted_at = null;
    }
    const nuevoOrigen = resolvedProjectId
      ? {
        type: "project",
        projectId: resolvedProjectId,
        title: subject,
        at: new Date().toISOString(),
      }
      : null;

    // UN BLOQUEO QUE SE PUEDE ESQUIVAR NO ES UN BLOQUEO. La búsqueda de arriba
    // solo mira las conversaciones `open`, así que la bloqueada no aparecía y el
    // código seguía de largo hasta crear una NUEVA: tocar «Mensaje» en la ficha
    // deshacía el bloqueo en silencio, sin que ninguna de las dos partes lo
    // decidiera. Se corta antes de crear nada, y vale para los dos lados: ni
    // quien bloqueó ni el bloqueado reabren el canal por su cuenta.
    if (!conversation) {
      const { data: bloqueada } = await db.from("direct_conversations")
        .select("id")
        .eq("client_id", clientId)
        .eq("professional_id", resolvedProfessionalId)
        .eq("status", "blocked")
        .limit(1)
        .maybeSingle();
      // No se devuelve un error: se devuelve LA CONVERSACIÓN. Un aviso suelto
      // deja a la persona sin saber qué pasó ni dónde arreglarlo; el chat
      // abierto muestra el bloqueo en su sitio y, a quien bloqueó, el botón para
      // deshacerlo. El mensaje que venía escrito no se guarda: bloqueada es
      // bloqueada hasta que alguien decida lo contrario.
      if (bloqueada) {
        return NextResponse.json({ ok: true, conversationId: bloqueada.id, blocked: true });
      }
    }

    if (!conversation) {
      const base = {
        client_id: clientId, professional_id: resolvedProfessionalId, professional_profile_id: professionalProfileId,
        project_id: resolvedProjectId, subject,
      };
      let { data: inserted, error } = await db.from("direct_conversations")
        .insert({ ...base, contexts: nuevoOrigen ? [nuevoOrigen] : [] })
        .select("*").single();
      if (error && missingContextsColumn(error)) {
        ({ data: inserted, error } = await db.from("direct_conversations").insert(base).select("*").single());
      }
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      conversation = inserted as ConversationRow;
      conversationCreated = true;
    } else if (nuevoOrigen) {
      // El origen se agrega al frente y sin repetir: la barra fijada muestra el
      // más reciente y detrás quedan los anteriores.
      const previos = Array.isArray(conversation.contexts) ? conversation.contexts : [];
      const mismaClave = (item: Record<string, unknown>) =>
        (item.projectId ?? null) === nuevoOrigen.projectId;
      if (!previos.some((item) => mismaClave(item as Record<string, unknown>))) {
        const siguientes = [nuevoOrigen, ...previos].slice(0, 12);
        const { error: ctxError } = await db.from("direct_conversations")
          .update({
            contexts: siguientes,
            project_id: resolvedProjectId ?? conversation.project_id,
            subject,
            updated_at: new Date().toISOString(),
          })
          .eq("id", conversation.id);
        if (ctxError && !missingContextsColumn(ctxError)) {
          return NextResponse.json({ error: ctxError.message }, { status: 500 });
        }
        conversation.contexts = siguientes;
        conversation.subject = subject;
        conversation.project_id = resolvedProjectId ?? conversation.project_id;
      }
    }
  }

  if (!conversation || !participant(conversation, user.id)) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  if (conversation.status === "blocked") return NextResponse.json({ error: mensajeDeError(req, { es: "Esta conversación está bloqueada.", en: "This conversation is blocked." }) }, { status: 403 });
  if (openConversation && !conversationCreated) {
    return NextResponse.json({ ok: true, conversationId: conversation.id, created: false });
  }
  if (openConversation && !message && !initialMessage) {
    return NextResponse.json({ ok: true, conversationId: conversation.id, created: conversationCreated });
  }
  const messageToSend = message || initialMessage || (hasRawAttachments ? "Archivo adjunto" : "");
  const attachmentUrls = normalizeAttachments(body.attachmentUrls, conversation.id, user.id);
  if (hasRawAttachments && !attachmentUrls.length) {
    return NextResponse.json({ error: "No se pudieron validar los adjuntos." }, { status: 400 });
  }
  let { data: sentMessages, error: msgError } = await db.rpc("send_direct_message_atomic", {
    p_conversation_id: conversation.id,
    p_sender_id: user.id,
    p_body: messageToSend,
    p_attachment_urls: attachmentUrls,
  });
  if (msgError && !attachmentUrls.length && msgError.message?.includes("p_attachment_urls")) {
    ({ data: sentMessages, error: msgError } = await db.rpc("send_direct_message_atomic", {
      p_conversation_id: conversation.id,
      p_sender_id: user.id,
      p_body: messageToSend,
    }));
  }
  if (msgError) return NextResponse.json({ error: msgError.message }, { status: 500 });
  const msg = Array.isArray(sentMessages) ? sentMessages[0] : sentMessages;
  if (!msg) return NextResponse.json({ error: "No se pudo guardar el mensaje." }, { status: 500 });
  // RESPONDER CITANDO (migración 228). Solo se acepta citar un mensaje de esta
  // misma conversación. Si algo falla —la columna aún no existe, el citado no
  // es de aquí— el mensaje ya salió y sale sin cita: nunca se pierde por eso.
  const replyToId = typeof body.replyToId === "string" && /^[0-9a-f-]{36}$/i.test(body.replyToId) ? body.replyToId : null;
  if (replyToId) {
    const { data: citado } = await db.from("direct_messages").select("id, conversation_id").eq("id", replyToId).maybeSingle();
    if (citado && (citado as { conversation_id: string }).conversation_id === conversation.id) {
      const { error: citaError } = await db.from("direct_messages").update({ reply_to_id: replyToId }).eq("id", (msg as { id: string }).id);
      if (!citaError) (msg as Record<string, unknown>).reply_to_id = replyToId;
    }
  }
  // El mensaje interno es un CANAL DE CONTACTO más, como WhatsApp o la
  // llamada, y no se medía: el chat solo existe en la app, así que sin esto
  // no había forma de saber si la app sirve para algo. Solo el primero de la
  // conversación cuenta como contacto; los demás son la conversación.
  if (conversation.client_id === user.id) {
    const { count } = await db
      .from("direct_messages")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", conversation.id);
    if ((count ?? 0) <= 1) {
      await recordServerInteraction(db, req as unknown as NextRequest, {
        type: "internal_message_sent",
        professionalId: conversation.professional_id ?? null,
        viewerUserId: user.id,
        source: "profile",
        metadata: { platform: "native" },
      });
    }
  }
  const recipientId = conversation.client_id === user.id
    ? conversation.professional_profile_id
    : conversation.client_id;
  const pushPreview = messageToSend.length > 120
    ? `${messageToSend.slice(0, 117)}...`
    : messageToSend;
  // Avisar al destinatario (push, y correo/WhatsApp si no tiene la app) son
  // llamadas HTTP externas que no cambian lo que ve quien escribe: salen del
  // camino de la respuesta.
  despuesDeResponder(sendNotificationPush({
    userId: recipientId,
    title: "Nuevo mensaje",
    message: pushPreview,
    data: {
      link: "/mensajes",
      conversation_id: conversation.id,
      project_id: conversation.project_id,
      proposal_id: conversation.proposal_id,
    },
  }), "direct-chat:push");
  // El push de este mensaje ya está en la cola (lo encola un trigger al
  // insertar el aviso). El cron la vacía cada 10 minutos; para un chat eso es
  // una eternidad, así que se vacía AHORA. El trabajador reclama cada fila con
  // un arriendo, de modo que pisarse con el cron no duplica envíos. Sin
  // `PUSH_DELIVERY_ENABLED` no hace nada.
  despuesDeResponder(drainPushOutbox({ limit: 10 }), "direct-chat:drain");
  // Push only lands on installed apps. Someone without one hears about the
  // first unread message by email (professionals also by WhatsApp); later
  // messages in the same unread run stay quiet so a long exchange is one notice.
  const recipientIsProfessional = recipientId === conversation.professional_profile_id;
  const priorUnread = Number(
    (recipientIsProfessional ? conversation.professional_unread_count : conversation.client_unread_count) ?? 0,
  );
  // Depende de QUIEN RECIBE, no de quien escribe. Antes exigía que el
  // remitente viniera de la app: si escribía desde la web, al otro no le
  // llegaba ni correo ni WhatsApp aunque no tuviera la app. La pregunta
  // correcta es si el destinatario puede enterarse por push, y eso solo lo
  // dice su token.
  if (priorUnread === 0) {
    despuesDeResponder((async () => {
      const reachable = await usersWithFreshPush(db, [recipientId]);
      if (!reachable.has(recipientId)) {
        const [{ data: senderProfile }, { data: senderProfessional }] = await Promise.all([
          db.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
          recipientIsProfessional
            ? Promise.resolve({ data: null })
            : db.from("professionals").select("business_name").eq("profile_id", user.id).maybeSingle(),
        ]);
        const senderName = (senderProfessional as { business_name?: string | null } | null)?.business_name
          || senderProfile?.full_name
          || "Alguien";
        await notifyRecipientOutsideApp({
          db,
          origin: process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin,
          conversationId: conversation.id,
          recipientId,
          recipientIsProfessional,
          senderName,
          preview: pushPreview,
        }).catch((error) => console.error("[direct-chat] outside-app notice failed:", error));
      }
    })(), "direct-chat:aviso-fuera-de-la-app");
  }
  const [signedMessage] = await signMessageAttachments(db, [msg as DirectMessageRow]);
  await invitarAResenaAhora(user.id);
  return NextResponse.json({ ok: true, conversationId: conversation.id, message: signedMessage, created: conversationCreated });
}

export async function PATCH(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const conversationId = String(body.conversationId ?? "");
  const action = body.action === "block_and_report" || body.action === "unblock" ? body.action : null;

  // DESBLOQUEAR LO PUEDE HACER SOLO QUIEN BLOQUEÓ. Si pudiera cualquiera de las
  // dos partes, el botón quedaría en manos de la persona de la que alguien se
  // quiso proteger y el bloqueo dejaría de servir para lo único que sirve.
  //
  // El reporte NO se retira: que dos personas vuelvan a hablar no borra lo que
  // pasó, y moderación decide aparte.
  if (conversationId && action === "unblock") {
    const db = createAdminClient();
    const { data } = await db.from("direct_conversations").select("*").eq("id", conversationId).maybeSingle();
    const conversation = data as (ConversationRow & { blocked_by?: string | null }) | null;
    if (!conversation || !participant(conversation, user.id)) {
      return NextResponse.json({ error: mensajeDeError(req, { es: "Conversación no encontrada", en: "Conversation not found" }) }, { status: 404 });
    }
    if (conversation.status !== "blocked" || conversation.blocked_by !== user.id) {
      return NextResponse.json({ error: mensajeDeError(req, { es: "Solo quien bloqueó puede desbloquear.", en: "Only whoever blocked can unblock." }) }, { status: 403 });
    }
    const { error } = await db.from("direct_conversations")
      .update({ status: "open", blocked_by: null, updated_at: new Date().toISOString() })
      .eq("id", conversationId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, unblocked: true });
  }

  const reportReason = limitTrimmedText(body.reason, 1000);
  if (conversationId && action) {
    const db = createAdminClient();
    const { data } = await db.from("direct_conversations").select("*").eq("id", conversationId).maybeSingle();
    const conversation = data as ConversationRow | null;
    if (!conversation || !participant(conversation, user.id)) return NextResponse.json({ error: mensajeDeError(req, { es: "Conversación no encontrada", en: "Conversation not found" }) }, { status: 404 });
    if (reportReason.length < 3) return NextResponse.json({ error: "Explica brevemente el motivo del reporte." }, { status: 400 });

    const reportingAsClient = conversation.client_id === user.id;
    const { error: reportError } = await db.from("reports").insert({
      professional_id: reportingAsClient ? conversation.professional_id ?? null : null,
      reported_client_id: reportingAsClient ? null : conversation.client_id,
      reporter_professional_id: reportingAsClient ? null : conversation.professional_id ?? null,
      reporter_email: user.email ?? null,
      reason: `[Mensaje directo] ${reportReason}`,
      status: "open",
    });
    if (reportError) return NextResponse.json({ error: reportError.message }, { status: 500 });
    const now = new Date().toISOString();
    // Se guarda QUIÉN bloqueó: es lo que permite ofrecer «Desbloquear» solo a
    // esa persona. Si la columna todavía no existe en la base, el bloqueo no se
    // pierde: se reintenta sin ella y esa conversación simplemente no ofrecerá
    // desbloqueo.
    let { error: blockError } = await db.from("direct_conversations")
      .update({ status: "blocked", blocked_by: user.id, updated_at: now })
      .eq("id", conversationId);
    if (blockError && /blocked_by/.test(blockError.message)) {
      ({ error: blockError } = await db.from("direct_conversations")
        .update({ status: "blocked", updated_at: now })
        .eq("id", conversationId));
    }
    if (blockError) return NextResponse.json({ error: blockError.message }, { status: 500 });
    // El bloqueo desde el chat es el MISMO bloqueo que desde la ficha (6-oct-2026):
    // la otra persona deja de verse también en búsqueda y tableros.
    const otro = conversation.client_id === user.id ? conversation.professional_profile_id : conversation.client_id;
    if (otro) await createAdminClient().from("user_blocks").upsert({ blocker_id: user.id, blocked_id: otro, reason: reportReason }, { onConflict: "blocker_id,blocked_id" });
    // Aquí salía un correo a soporte para que un humano viera el reporte dentro
    // de la ventana de 24 horas que promete la pantalla. Se quitó porque el
    // panel ya lo muestra en «Reportes abiertos», dentro de «Necesitan
    // atención», y esa bandeja se revisa todos los días: el correo repetía el
    // aviso sin agregar nada. Si algún día deja de revisarse a diario, esto hay
    // que devolverlo: el panel es pasivo y no busca a nadie.

    return NextResponse.json({ ok: true, blocked: true });
  }
  // Marcar leído o no leído desde la lista, como el deslizamiento de WhatsApp.
  // «No leído» pone el contador en 1: la bandeja y la campana ya lo leen así, y
  // el siguiente mensaje real lo vuelve a subir sin que nada más cambie.
  const leido = typeof body.read === "boolean" ? body.read : null;
  const archived = body.status === "archived" ? true : body.status === "open" ? false : null;
  if (!conversationId || (archived === null && leido === null)) return NextResponse.json({ error: mensajeDeError(req, { es: "Acción inválida.", en: "Invalid action." }) }, { status: 400 });
  const db = createAdminClient();
  const { data } = await db.from("direct_conversations").select("*").eq("id", conversationId).maybeSingle();
  const conversation = data as ConversationRow | null;
  if (!conversation || !participant(conversation, user.id)) return NextResponse.json({ error: mensajeDeError(req, { es: "Conversación no encontrada", en: "Conversation not found" }) }, { status: 404 });
  const now = new Date().toISOString();
  if (leido !== null) {
    const campo = conversation.client_id === user.id ? "client_unread_count" : "professional_unread_count";
    const { error: errorDeLectura } = await db.from("direct_conversations")
      .update({ [campo]: leido ? 0 : 1, updated_at: now })
      .eq("id", conversationId);
    if (errorDeLectura) return NextResponse.json({ error: errorDeLectura.message }, { status: 500 });
    return NextResponse.json({ ok: true, read: leido });
  }
  const archiveField = conversation.client_id === user.id ? "client_archived_at" : "professional_archived_at";
  const { error } = await db.from("direct_conversations").update({ [archiveField]: archived ? now : null, updated_at: now }).eq("id", conversationId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const conversationId = String(body.conversationId ?? "");
  if (!conversationId) return NextResponse.json({ error: mensajeDeError(req, { es: "Acción inválida.", en: "Invalid action." }) }, { status: 400 });

  const db = createAdminClient();
  const { data } = await db.from("direct_conversations").select("*").eq("id", conversationId).maybeSingle();
  const conversation = data as ConversationRow | null;
  if (!conversation || !participant(conversation, user.id)) return NextResponse.json({ error: mensajeDeError(req, { es: "Conversación no encontrada", en: "Conversation not found" }) }, { status: 404 });

  const isClient = conversation.client_id === user.id;
  const deleteField = isClient ? "client_deleted_at" : "professional_deleted_at";
  // Eliminar ya no exige archivar primero: el menú de la fila lo ofrece en
  // cualquier conversación, como WhatsApp, y la confirmación vive en la
  // pantalla. El borrado sigue siendo POR PERSONA —la otra parte conserva su
  // hilo—, así que no destruye nada de nadie más.

  const now = new Date().toISOString();
  const { error } = await db.from("direct_conversations").update({ [deleteField]: now, updated_at: now }).eq("id", conversationId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

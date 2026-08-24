import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { limitTrimmedText } from "@/lib/text-limits";
import { validateDirectMessage } from "@/lib/moderation/messages";

// Messages written inside the app are moderated and, when the other person
// has no app, announced by email; the website keeps the behaviour it always
// had. The native shell marks its requests with the ccr_platform cookie.
function isNativeRequest(req: Request) {
  return /(?:^|;\s*)ccr_platform=native(?:;|$)/.test(req.headers.get("cookie") ?? "");
}
import { sendNotificationPush } from "@/lib/push/notify";
import { sendBrevoEmail } from "@/lib/email/send";
import { notifyRecipientOutsideApp, usersWithActivePush } from "@/lib/direct-chat/outside-app-notify";

type ConversationRow = {
  id: string;
  client_id: string;
  professional_id: string;
  professional_profile_id: string;
  booking_id?: string | null;
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

function missingParticipantDeleteColumns(error: { code?: string; message?: string } | null | undefined) {
  const message = error?.message ?? "";
  return error?.code === "42703" || message.includes("client_deleted_at") || message.includes("professional_deleted_at");
}

async function enrichConversations(db: ReturnType<typeof createAdminClient>, rows: ConversationRow[]) {
  if (!rows.length) return [];
  const clientIds = [...new Set(rows.map((row) => row.client_id))];
  const bookingIds = rows.flatMap((row) => row.booking_id ? [row.booking_id] : []);
  const projectIds = rows.flatMap((row) => row.project_id ? [row.project_id] : []);
  const proposalIds = rows.flatMap((row) => row.proposal_id ? [row.proposal_id] : []);
  const [clientsResult, bookingsResult, projectsResult, proposalsResult] = await Promise.all([
    db.from("profiles").select("id, full_name, avatar_url").in("id", clientIds),
    bookingIds.length ? db.from("bookings").select("id, service_description, status").in("id", bookingIds) : Promise.resolve({ data: [] }),
    projectIds.length ? db.from("projects").select("id, title, status").in("id", projectIds) : Promise.resolve({ data: [] }),
    proposalIds.length ? db.from("proposals").select("id, status").in("id", proposalIds) : Promise.resolve({ data: [] }),
  ]);
  const clients = new Map((clientsResult.data ?? []).map((row) => [row.id, row]));
  const bookings = new Map((bookingsResult.data ?? []).map((row) => [row.id, row]));
  const projects = new Map((projectsResult.data ?? []).map((row) => [row.id, row]));
  const proposals = new Map((proposalsResult.data ?? []).map((row) => [row.id, row]));
  const withPush = await usersWithActivePush(db, rows.flatMap((row) => [row.client_id, row.professional_profile_id]));
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
    context: row.booking_id
      ? { type: "booking", ...(bookings.get(row.booking_id) ?? {}) }
      : row.project_id
        ? { type: row.proposal_id ? "proposal" : "project", ...(projects.get(row.project_id) ?? {}), proposal_status: row.proposal_id ? proposals.get(row.proposal_id)?.status : null }
        : { type: "profile", title: row.subject ?? null, status: "open" },
    };
  });
}

export async function GET(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const db = createAdminClient();
  const searchParams = new URL(req.url).searchParams;
  const id = searchParams.get("id");
  if (id) {
    const { data } = await db.from("direct_conversations")
      .select("*, professionals(id, slug, business_name, whatsapp, profiles(full_name, avatar_url))")
      .eq("id", id).maybeSingle();
    const conversation = data as ConversationRow | null;
    const deletedForParticipant = conversation && (conversation.client_id === user.id
      ? conversation.client_deleted_at
      : conversation.professional_deleted_at);
    if (deletedForParticipant) return NextResponse.json({ error: "Conversación no encontrada" }, { status: 404 });
    if (!conversation || !participant(conversation, user.id)) return NextResponse.json({ error: "Conversación no encontrada" }, { status: 404 });
    const { data: messages, error } = await db.from("direct_messages")
      .select("id, conversation_id, sender_id, body, attachment_urls, read_at, created_at")
      .eq("conversation_id", id).order("created_at", { ascending: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const readAt = new Date().toISOString();
    const [{ error: readError }, { error: unreadError }] = await Promise.all([
      db.from("direct_messages")
        .update({ read_at: readAt })
        .eq("conversation_id", id)
        .neq("sender_id", user.id)
        .is("read_at", null),
      db.from("direct_conversations").update(conversation.client_id === user.id
        ? { client_unread_count: 0 }
        : { professional_unread_count: 0 }).eq("id", id),
    ]);
    if (readError || unreadError) {
      return NextResponse.json({ error: readError?.message ?? unreadError?.message }, { status: 500 });
    }
    const [enriched] = await enrichConversations(db, [conversation]);
    return NextResponse.json({ conversation: enriched, messages: await signMessageAttachments(db, (messages ?? []) as DirectMessageRow[]) });
  }
  const archived = searchParams.get("status") === "archived";
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
  return NextResponse.json({ conversations: await enrichConversations(db, (data ?? []) as ConversationRow[]) });
}

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Inicia sesión para usar el chat." }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const professionalId = String(body.professionalId ?? "");
  const conversationId = String(body.conversationId ?? "");
  const bookingId = String(body.bookingId ?? "");
  const projectId = String(body.projectId ?? "");
  const proposalId = String(body.proposalId ?? "");
  const contextTitle = limitTrimmedText(body.contextTitle, 160);
  const message = limitTrimmedText(body.message, 2000);
  const nativeRequest = isNativeRequest(req);
  if (nativeRequest) {
    const moderation = validateDirectMessage(message);
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
    let resolvedProfessionalId = professionalId;
    let resolvedBookingId: string | null = null;
    let resolvedProjectId: string | null = null;
    let resolvedProposalId: string | null = null;
    let subject = contextTitle || "Conversación desde un perfil";

    if (bookingId) {
      const { data: booking } = await db.from("bookings").select("id, client_id, professional_id, service_description").eq("id", bookingId).maybeSingle();
      if (!booking) return NextResponse.json({ error: "Solicitud no encontrada." }, { status: 404 });
      clientId = booking.client_id; resolvedProfessionalId = booking.professional_id; resolvedBookingId = booking.id; subject = booking.service_description;
    } else if (proposalId) {
      const { data: proposal } = await db.from("proposals").select("id, professional_id, project_id, projects(client_id, title)").eq("id", proposalId).maybeSingle();
      const project = Array.isArray(proposal?.projects) ? proposal.projects[0] : proposal?.projects;
      if (!proposal || !project) return NextResponse.json({ error: "Propuesta no encontrada." }, { status: 404 });
      clientId = project.client_id; resolvedProfessionalId = proposal.professional_id; resolvedProjectId = proposal.project_id; resolvedProposalId = proposal.id; subject = project.title;
    } else if (projectId && professionalId) {
      const { data: project } = await db.from("projects").select("id, client_id, title").eq("id", projectId).maybeSingle();
      if (!project) return NextResponse.json({ error: "Proyecto no encontrado." }, { status: 404 });
      clientId = project.client_id; resolvedProjectId = project.id; subject = project.title;
    }

    const { data: professional } = await db.from("professionals").select("id, profile_id, business_name, profiles(full_name)").eq("id", resolvedProfessionalId).maybeSingle();
    if (!professional) return NextResponse.json({ error: "Profesional no encontrado." }, { status: 404 });
    const professionalProfileId = professional.profile_id as string;
    if (clientId === professionalProfileId) return NextResponse.json({ error: "No puedes abrir un chat contigo mismo." }, { status: 400 });
    if (user.id !== clientId && user.id !== professionalProfileId) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

    let query = db.from("direct_conversations").select("*").eq("client_id", clientId).eq("professional_id", resolvedProfessionalId).eq("status", "open");
    if (resolvedBookingId) query = query.eq("booking_id", resolvedBookingId);
    else if (resolvedProjectId) query = query.eq("project_id", resolvedProjectId);
    else query = query.is("booking_id", null).is("project_id", null).is("proposal_id", null);
    const { data: existing } = await query.limit(1).maybeSingle();
    conversation = existing as ConversationRow | null;
    if (conversation && contextTitle && !resolvedBookingId && !resolvedProjectId) {
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
    if (!conversation) {
      const { data: inserted, error } = await db.from("direct_conversations").insert({
        client_id: clientId, professional_id: resolvedProfessionalId, professional_profile_id: professionalProfileId,
        booking_id: resolvedBookingId, project_id: resolvedProjectId, proposal_id: resolvedProposalId, subject,
      }).select("*").single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      conversation = inserted as ConversationRow;
      conversationCreated = true;
    }
  }

  if (!conversation || !participant(conversation, user.id)) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  if (conversation.status === "blocked") return NextResponse.json({ error: "Esta conversación está bloqueada." }, { status: 403 });
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
  const recipientId = conversation.client_id === user.id
    ? conversation.professional_profile_id
    : conversation.client_id;
  const pushPreview = messageToSend.length > 120
    ? `${messageToSend.slice(0, 117)}...`
    : messageToSend;
  await sendNotificationPush({
    userId: recipientId,
    title: "Nuevo mensaje",
    message: pushPreview,
    data: {
      link: "/es/mensajes",
      conversation_id: conversation.id,
      booking_id: conversation.booking_id,
      project_id: conversation.project_id,
      proposal_id: conversation.proposal_id,
    },
  });
  // Push only lands on installed apps. Someone without one hears about the
  // first unread message by email (professionals also by WhatsApp); later
  // messages in the same unread run stay quiet so a long exchange is one notice.
  const recipientIsProfessional = recipientId === conversation.professional_profile_id;
  const priorUnread = Number(
    (recipientIsProfessional ? conversation.professional_unread_count : conversation.client_unread_count) ?? 0,
  );
  if (nativeRequest && priorUnread === 0) {
    const reachable = await usersWithActivePush(db, [recipientId]);
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
  }
  const [signedMessage] = await signMessageAttachments(db, [msg as DirectMessageRow]);
  return NextResponse.json({ ok: true, conversationId: conversation.id, message: signedMessage, created: conversationCreated });
}

export async function PATCH(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const conversationId = String(body.conversationId ?? "");
  const action = body.action === "block_and_report" ? "block_and_report" : null;
  const reportReason = limitTrimmedText(body.reason, 1000);
  if (conversationId && action) {
    const db = createAdminClient();
    const { data } = await db.from("direct_conversations").select("*").eq("id", conversationId).maybeSingle();
    const conversation = data as ConversationRow | null;
    if (!conversation || !participant(conversation, user.id)) return NextResponse.json({ error: "Conversación no encontrada" }, { status: 404 });
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
    const { error: blockError } = await db.from("direct_conversations").update({ status: "blocked", updated_at: now }).eq("id", conversationId);
    if (blockError) return NextResponse.json({ error: blockError.message }, { status: 500 });
    // The report is already queued for moderation; the email only makes sure a
    // human sees it inside the 24-hour window. A delivery failure never blocks
    // the user, who is already protected by the blocked conversation.
    const escaped = reportReason.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    void sendBrevoEmail({
      to: "soporte@contratacr.com",
      replyTo: user.email ?? undefined,
      subject: `[Reporte] Mensaje directo bloqueado — conversación ${conversationId.slice(0, 8)}`,
      html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#374151;line-height:1.6;">
        <h2 style="margin:0 0 12px;color:#162543;">Reporte desde el chat — ContrataCR</h2>
        <p style="margin:0 0 6px;"><strong>Conversación:</strong> ${conversationId}</p>
        <p style="margin:0 0 6px;"><strong>Reportado por:</strong> ${user.email ?? "—"} (${reportingAsClient ? "cliente" : "profesional"})</p>
        <p style="margin:0 0 6px;"><strong>Usuario reportado:</strong> ${reportingAsClient ? `profesional ${conversation.professional_id ?? "—"}` : `cliente ${conversation.client_id}`}</p>
        <p style="margin:12px 0 4px;color:#6b7280;">Motivo:</p>
        <div style="white-space:pre-wrap;">${escaped}</div>
        <p style="margin:16px 0 0;color:#6b7280;font-size:12px;">La conversación quedó bloqueada de inmediato para ambas partes. Revisa el reporte en el panel de administración.</p>
      </div>`,
    }).catch((error) => console.error("[direct-chat] report email failed:", error));
    return NextResponse.json({ ok: true, blocked: true });
  }
  const archived = body.status === "archived" ? true : body.status === "open" ? false : null;
  if (!conversationId || archived === null) return NextResponse.json({ error: "Acción inválida." }, { status: 400 });
  const db = createAdminClient();
  const { data } = await db.from("direct_conversations").select("*").eq("id", conversationId).maybeSingle();
  const conversation = data as ConversationRow | null;
  if (!conversation || !participant(conversation, user.id)) return NextResponse.json({ error: "Conversación no encontrada" }, { status: 404 });
  const now = new Date().toISOString();
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
  if (!conversationId) return NextResponse.json({ error: "Acción inválida." }, { status: 400 });

  const db = createAdminClient();
  const { data } = await db.from("direct_conversations").select("*").eq("id", conversationId).maybeSingle();
  const conversation = data as ConversationRow | null;
  if (!conversation || !participant(conversation, user.id)) return NextResponse.json({ error: "Conversación no encontrada" }, { status: 404 });

  const isClient = conversation.client_id === user.id;
  const archiveField = isClient ? "client_archived_at" : "professional_archived_at";
  const deleteField = isClient ? "client_deleted_at" : "professional_deleted_at";
  if (!conversation[archiveField]) {
    return NextResponse.json({ error: "Solo puedes eliminar conversaciones archivadas." }, { status: 409 });
  }

  const now = new Date().toISOString();
  const { error } = await db.from("direct_conversations").update({ [deleteField]: now, updated_at: now }).eq("id", conversationId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

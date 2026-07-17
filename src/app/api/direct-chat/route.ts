import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { limitTrimmedText } from "@/lib/text-limits";

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
  [key: string]: unknown;
};

async function currentUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

function participant(row: ConversationRow, userId: string) {
  return row.client_id === userId || row.professional_profile_id === userId;
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
  return rows.map((row) => ({
    ...row,
    client_profile: clients.get(row.client_id) ?? null,
    context: row.booking_id
      ? { type: "booking", ...(bookings.get(row.booking_id) ?? {}) }
      : row.project_id
        ? { type: row.proposal_id ? "proposal" : "project", ...(projects.get(row.project_id) ?? {}), proposal_status: row.proposal_id ? proposals.get(row.proposal_id)?.status : null }
        : { type: "profile", title: row.subject ?? null, status: "open" },
  }));
}

export async function GET(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const db = createAdminClient();
  const searchParams = new URL(req.url).searchParams;
  const id = searchParams.get("id");
  if (id) {
    const { data } = await db.from("direct_conversations")
      .select("*, professionals(id, slug, business_name, profiles(full_name, avatar_url))")
      .eq("id", id).maybeSingle();
    const conversation = data as ConversationRow | null;
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
    return NextResponse.json({ conversation: enriched, messages: messages ?? [] });
  }
  const archived = searchParams.get("status") === "archived";
  let conversationsQuery = db.from("direct_conversations")
    .select("*, professionals(id, slug, business_name, profiles(full_name, avatar_url))")
    .or(`client_id.eq.${user.id},professional_profile_id.eq.${user.id}`)
    .neq("status", "blocked");
  conversationsQuery = archived
    ? conversationsQuery.or(`and(client_id.eq.${user.id},client_archived_at.not.is.null),and(professional_profile_id.eq.${user.id},professional_archived_at.not.is.null)`)
    : conversationsQuery.or(`and(client_id.eq.${user.id},client_archived_at.is.null),and(professional_profile_id.eq.${user.id},professional_archived_at.is.null)`);
  const { data, error } = await conversationsQuery
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
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
  if (!message) return NextResponse.json({ error: "Escribe un mensaje." }, { status: 400 });
  const db = createAdminClient();
  let conversation: ConversationRow | null = null;

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
      if (!project) return NextResponse.json({ error: "Publicación no encontrada." }, { status: 404 });
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
      const { error: subjectError } = await db.from("direct_conversations")
        .update({ subject: contextTitle, updated_at: new Date().toISOString() })
        .eq("id", conversation.id);
      if (subjectError) return NextResponse.json({ error: subjectError.message }, { status: 500 });
      conversation.subject = contextTitle;
    }
    if (!conversation) {
      const { data: inserted, error } = await db.from("direct_conversations").insert({
        client_id: clientId, professional_id: resolvedProfessionalId, professional_profile_id: professionalProfileId,
        booking_id: resolvedBookingId, project_id: resolvedProjectId, proposal_id: resolvedProposalId, subject,
      }).select("*").single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      conversation = inserted as ConversationRow;
    }
  }

  if (!conversation || !participant(conversation, user.id)) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  if (conversation.status === "blocked") return NextResponse.json({ error: "Esta conversación está bloqueada." }, { status: 403 });
  const isClient = conversation.client_id === user.id;
  const { data: sentMessages, error: msgError } = await db.rpc("send_direct_message_atomic", {
    p_conversation_id: conversation.id,
    p_sender_id: user.id,
    p_body: message,
  });
  if (msgError) return NextResponse.json({ error: msgError.message }, { status: 500 });
  const msg = Array.isArray(sentMessages) ? sentMessages[0] : sentMessages;
  if (!msg) return NextResponse.json({ error: "No se pudo guardar el mensaje." }, { status: 500 });
  const receiverId = isClient ? conversation.professional_profile_id : conversation.client_id;
  const { error: notificationError } = await db.from("notifications").insert({
    user_id: receiverId, type: "direct_message", title: "Nuevo mensaje",
    message: message.length > 96 ? `${message.slice(0, 96)}...` : message,
    data: { link: `/es/dashboard/profesional?tab=chat&conversation=${conversation.id}`, conversation_id: conversation.id, booking_id: conversation.booking_id, project_id: conversation.project_id },
  });
  if (notificationError) console.error("Direct-chat notification failed", notificationError);
  return NextResponse.json({ ok: true, conversationId: conversation.id, message: msg });
}

export async function PATCH(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const conversationId = String(body.conversationId ?? "");
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

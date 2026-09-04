import { NextResponse } from "next/server";
import { getApiAdmin } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyUserOfReply } from "@/lib/support-notify";
import { LONG_TEXT_MAX_LENGTH, limitTrimmedText } from "@/lib/text-limits";
import { sendNotificationPush } from "@/lib/push/notify";
import { buildSupportCloseMessage, supportCloseReason } from "@/lib/support/close-reasons";

const STATUSES = ["open", "in_progress", "resolved"];

// GET /api/admin/support?status=… — ticket list (admin-only).
// GET /api/admin/support?id=… — one ticket + its full message thread.
export async function GET(req: Request) {
  const admin = await getApiAdmin();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const db = createAdminClient();

  if (id) {
    const { data: ticket } = await db.from("support_tickets").select("*").eq("id", id).single();
    const { data: messages } = await db
      .from("support_ticket_messages")
      .select("*")
      .eq("ticket_id", id)
      .order("created_at", { ascending: true });
    return NextResponse.json({ ticket, messages: messages ?? [] });
  }

  const status = url.searchParams.get("status") ?? "open";
  let q = db.from("support_tickets").select("*").order("last_reply_at", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false });
  if (STATUSES.includes(status)) q = q.eq("status", status);
  const { data } = await q;

  // Per-status badge counts. "Pendientes" = open; "En proceso" awaiting a reply
  // = in_progress whose last message is the USER's. Needs-attention = both.
  const { count: pending } = await db
    .from("support_tickets").select("id", { count: "exact", head: true }).eq("status", "open");
  const { count: inProgress } = await db
    .from("support_tickets").select("id", { count: "exact", head: true }).eq("status", "in_progress");
  const { count: awaitingReply } = await db
    .from("support_tickets").select("id", { count: "exact", head: true }).eq("status", "in_progress").eq("last_reply_role", "user");
  const needsAttention = (pending ?? 0) + (awaitingReply ?? 0);

  return NextResponse.json({
    tickets: data ?? [],
    openCount: needsAttention,
    needsAttention,
    counts: { open: pending ?? 0, in_progress: inProgress ?? 0, awaiting: awaitingReply ?? 0 },
  });
}

// PATCH /api/admin/support — change ticket status (with audit). Admin-only.
export async function PATCH(req: Request) {
  const admin = await getApiAdmin();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { id, status, reason, note } = await req.json();
  if (!id || !STATUSES.includes(status)) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }
  const db = createAdminClient();
  const { data: ticket } = await db.from("support_tickets").select("*").eq("id", id).single();
  if (!ticket) return NextResponse.json({ error: "Ticket no encontrado" }, { status: 404 });

  // Cerrar exige un motivo: es lo que el usuario va a leer en el hilo.
  const cerrando = status === "resolved" && ticket.status !== "resolved";
  if (cerrando && !supportCloseReason(String(reason ?? ""))) {
    return NextResponse.json({ error: "Elegí el motivo del cierre." }, { status: 400 });
  }

  // One-way flow: open→in_progress→resolved (open→resolved allowed). Never move
  // BACKWARD (in_progress/resolved → open). Reopen happens only via a new reply.
  const cur = ticket.status as string;
  const ok =
    cur === status ||
    (cur === "open" && (status === "in_progress" || status === "resolved")) ||
    (cur === "in_progress" && status === "resolved");
  if (!ok) return NextResponse.json({ error: "Transición no permitida." }, { status: 400 });

  const now = new Date().toISOString();
  const cuerpoCierre = cerrando
    ? buildSupportCloseMessage(String(reason), limitTrimmedText(note, LONG_TEXT_MAX_LENGTH))
    : null;

  const { error } = await db
    .from("support_tickets")
    .update({
      status,
      reviewed_at: now,
      handled_by: admin.id,
      handled_by_name: admin.fullName,
      handled_at: now,
      ...(cuerpoCierre ? { last_reply_at: now, last_reply_role: "admin", user_confirmed: false } : {}),
    })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // El cierre se cuenta como cualquier respuesta de soporte: queda escrito en el
  // hilo y llega por correo y campana. Un caso que se cierra en silencio deja a
  // la persona sin saber si la leyeron.
  if (cuerpoCierre) {
    await db.from("support_ticket_messages").insert({
      ticket_id: id, sender_role: "admin", sender_id: admin.id, sender_name: admin.fullName, body: cuerpoCierre,
    });

    let panel: "cliente" | "profesional" = "cliente";
    if (ticket.user_id) {
      const { data: prof } = await db.from("profiles").select("role").eq("id", ticket.user_id).maybeSingle();
      if (prof?.role === "professional") panel = "profesional";
    }
    if (ticket.email) {
      await notifyUserOfReply({ toEmail: ticket.email, toName: ticket.name, subject: ticket.subject, body: cuerpoCierre, hasAccount: !!ticket.user_id, panel, ticketId: id });
    }
    if (ticket.user_id) {
      const notification = {
        user_id: ticket.user_id,
        type: "support_reply",
        title: "Caso de soporte cerrado",
        message: `Soporte cerró tu caso "${ticket.subject}". Podés responder si el problema continúa.`,
        data: { link: `/es/dashboard/${panel}?tab=soporte&ticket=${id}`, ticketId: id, ticket_subject: ticket.subject },
      };
      await db.from("notifications").insert(notification);
      await sendNotificationPush({ userId: notification.user_id, ...notification });
    }
  }

  return NextResponse.json({ ok: true });
}

// POST /api/admin/support — admin replies in the thread; emails the user. Admin-only.
export async function POST(req: Request) {
  const admin = await getApiAdmin();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { id, body } = await req.json();
  const safeBody = limitTrimmedText(body, LONG_TEXT_MAX_LENGTH);
  if (!id || !safeBody) {
    return NextResponse.json({ error: "Escribe una respuesta." }, { status: 400 });
  }
  const db = createAdminClient();
  const { data: ticket } = await db.from("support_tickets").select("*").eq("id", id).single();
  if (!ticket) return NextResponse.json({ error: "Ticket no encontrado" }, { status: 404 });

  const now = new Date().toISOString();
  const { error: msgErr } = await db.from("support_ticket_messages").insert({
    ticket_id: id, sender_role: "admin", sender_id: admin.id, sender_name: admin.fullName, body: safeBody,
  });
  if (msgErr) return NextResponse.json({ error: msgErr.message }, { status: 500 });

  // An admin reply always (re)opens the ticket into "in_progress" — picking up a
  // pending one OR reopening a resolved one — in the SAME thread, never a new
  // ticket. Clears any user confirmation.
  await db.from("support_tickets").update({
    status: "in_progress", user_confirmed: false,
    last_reply_at: now, last_reply_role: "admin",
    handled_by: admin.id, handled_by_name: admin.fullName, handled_at: now,
  }).eq("id", id);

  // Reply email + bell deep-link both open THIS exact ticket in the requester's
  // panel. Resolve their role so a professional lands on the pro panel, not cliente.
  let panel: "cliente" | "profesional" = "cliente";
  if (ticket.user_id) {
    const { data: prof } = await db.from("profiles").select("role").eq("id", ticket.user_id).maybeSingle();
    if (prof?.role === "professional") panel = "profesional";
  }

  // Email the user (best-effort) AND drop a tagged notification in their bell so
  // the reply also shows in their general Notifications and links to the ticket.
  if (ticket.email) {
    // `user_id` set → the requester has an account → deep-link to the exact ticket in
    // their panel; null → a guest (no panel) → "create account / sign in" path instead.
    await notifyUserOfReply({ toEmail: ticket.email, toName: ticket.name, subject: ticket.subject, body: safeBody, hasAccount: !!ticket.user_id, panel, ticketId: id });
  }
  if (ticket.user_id) {
    const notification = {
      user_id: ticket.user_id,
      type: "support_reply",
      title: "Respuesta de soporte",
      message: `Soporte respondió a tu ticket "${ticket.subject}".`,
      data: {
        link: `/es/dashboard/${panel}?tab=soporte&ticket=${id}`,
        ticketId: id,
        ticket_subject: ticket.subject,
      },
    };
    await db.from("notifications").insert(notification);
    await sendNotificationPush({ userId: notification.user_id, ...notification });
  }

  return NextResponse.json({ ok: true });
}
// DELETE /api/admin/support?id=… — removes a ticket and its whole thread.
export async function DELETE(req: Request) {
  const admin = await getApiAdmin();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Identificador requerido." }, { status: 400 });
  const db = createAdminClient();
  const { error } = await db.from("support_tickets").delete().eq("id", id);
  if (error) {
    console.error("[admin/support] delete", error.message);
    return NextResponse.json({ error: "No se pudo eliminar el caso." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, id });
}

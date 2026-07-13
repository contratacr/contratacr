import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifySupportInbox } from "@/lib/support-notify";
import { enforceRateLimit } from "@/lib/rate-limit";
import { LONG_TEXT_MAX_LENGTH, limitTrimmedText } from "@/lib/text-limits";
import { auditUserAction } from "@/lib/audit/user-action";

// Guest→account linking: when a user with a VERIFIED email views/uses support,
// attach any prior GUEST tickets (user_id null) with the same email to their
// account so the history appears in-app. Only on verified email — never claim
// someone else's tickets.
async function claimGuestTickets(db: SupabaseClient, user: User) {
  if (!user.email || !user.email_confirmed_at) return;
  await db.from("support_tickets").update({ user_id: user.id }).is("user_id", null).ilike("email", user.email);
}

async function getCanonicalProfileContact(db: SupabaseClient, user: User) {
  const { data: profile } = await db
    .from("profiles")
    .select("full_name, email")
    .eq("id", user.id)
    .maybeSingle();
  return {
    name: (profile?.full_name as string | null) || (user.user_metadata?.full_name as string) || null,
    email: (profile?.email as string | null) || user.email || "",
  };
}

async function syncUserTicketEmail(db: SupabaseClient, user: User, email: string) {
  if (!email) return;
  await db.from("support_tickets").update({ email }).eq("user_id", user.id).neq("email", email);
}

// GET /api/support — the logged-in user's tickets.
// GET /api/support?id=… — one of THEIR tickets + its message thread.
export async function GET(req: Request) {
  const supa = await createClient();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const db = createAdminClient();
  const id = new URL(req.url).searchParams.get("id");

  if (id) {
    await claimGuestTickets(db, user);
    const contact = await getCanonicalProfileContact(db, user);
    if (contact.email && contact.email !== user.email) {
      await db.from("support_tickets").update({ user_id: user.id }).is("user_id", null).ilike("email", contact.email);
    }
    await syncUserTicketEmail(db, user, contact.email);
    const { data: ticket } = await db.from("support_tickets").select("*").eq("id", id).eq("user_id", user.id).single();
    if (!ticket) return NextResponse.json({ error: "Ticket no encontrado" }, { status: 404 });
    const { data: messages } = await db
      .from("support_ticket_messages")
      .select("*")
      .eq("ticket_id", id)
      .order("created_at", { ascending: true });
    return NextResponse.json({ ticket, messages: messages ?? [] });
  }

  const selectUserTickets = () => db
    .from("support_tickets")
    .select("*")
    .eq("user_id", user.id)
    .order("last_reply_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  const { data: existingTickets } = await selectUserTickets();
  if ((existingTickets?.length ?? 0) > 0) {
    return NextResponse.json({ tickets: existingTickets ?? [] });
  }

  await claimGuestTickets(db, user);
  const contact = await getCanonicalProfileContact(db, user);
  if (contact.email && contact.email !== user.email) {
    await db.from("support_tickets").update({ user_id: user.id }).is("user_id", null).ilike("email", contact.email);
  }
  await syncUserTicketEmail(db, user, contact.email);

  const { data } = await selectUserTickets();
  return NextResponse.json({ tickets: data ?? [] });
}

// POST /api/support — the user replies in one of THEIR ticket threads.
export async function POST(req: Request) {
  const rl = enforceRateLimit(req, "support-reply", 10, 60_000);
  if (rl) return rl;

  const supa = await createClient();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { ticketId, body, action } = await req.json();
  if (!ticketId) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  const db = createAdminClient();
  const { data: ticket } = await db.from("support_tickets").select("*").eq("id", ticketId).eq("user_id", user.id).single();
  if (!ticket) return NextResponse.json({ error: "Ticket no encontrado" }, { status: 404 });

  const now = new Date().toISOString();
  const contact = await getCanonicalProfileContact(db, user);
  const senderName = contact.name || ticket.name || null;
  if (contact.email && ticket.email !== contact.email) {
    await db.from("support_tickets").update({ email: contact.email }).eq("id", ticketId);
  }
  const safeBody = limitTrimmedText(body, LONG_TEXT_MAX_LENGTH);

  // CONFIRM — the user agrees the ticket is resolved (finalizes it).
  if (action === "confirm") {
    await db.from("support_tickets").update({ user_confirmed: true, status: "resolved" }).eq("id", ticketId);
    await auditUserAction(db, req, {
      actorUserId: user.id,
      actorRole: "user",
      action: "support.confirm_resolved",
      entityTable: "support_tickets",
      entityId: ticketId,
      entityOwnerUserId: user.id,
      beforeData: { status: ticket.status },
      afterData: { status: "resolved", user_confirmed: true },
    });
    return NextResponse.json({ ok: true });
  }

  // REOPEN — the problem persists; the SAME thread goes back to "En proceso"
  // (never a new ticket) and the inbox is notified.
  if (action === "reopen") {
    await db.from("support_tickets").update({ status: "in_progress", user_confirmed: false, last_reply_at: now, last_reply_role: "user" }).eq("id", ticketId);
    await db.from("support_ticket_messages").insert({
      ticket_id: ticketId, sender_role: "user", sender_id: user.id, sender_name: senderName, body: safeBody || "El usuario solicitó reabrir el ticket: el problema continúa.",
    });
    await notifySupportInbox({ subject: ticket.subject, fromName: senderName, fromEmail: contact.email || ticket.email || user.email || "", body: "Solicitud de reapertura: el problema continúa.", isReply: true });
    await auditUserAction(db, req, {
      actorUserId: user.id,
      actorRole: "user",
      action: "support.reopen",
      entityTable: "support_tickets",
      entityId: ticketId,
      entityOwnerUserId: user.id,
      beforeData: { status: ticket.status },
      afterData: { status: "in_progress", user_confirmed: false },
    });
    return NextResponse.json({ ok: true });
  }

  // Otherwise: a normal reply message.
  if (!safeBody) return NextResponse.json({ error: "Escribe un mensaje." }, { status: 400 });
  const { error: msgErr } = await db.from("support_ticket_messages").insert({
    ticket_id: ticketId, sender_role: "user", sender_id: user.id, sender_name: senderName, body: safeBody,
  });
  if (msgErr) return NextResponse.json({ error: msgErr.message }, { status: 500 });

  // A user reply re-opens a resolved ticket into "En proceso" (same thread).
  const nextStatus = ticket.status === "resolved" ? "in_progress" : ticket.status;
  await db.from("support_tickets").update({ status: nextStatus, user_confirmed: false, last_reply_at: now, last_reply_role: "user" }).eq("id", ticketId);

  await notifySupportInbox({
    subject: ticket.subject, fromName: senderName, fromEmail: contact.email || ticket.email || user.email || "", body: safeBody, isReply: true,
  });

  await auditUserAction(db, req, {
    actorUserId: user.id,
    actorRole: "user",
    action: "support.reply",
    entityTable: "support_tickets",
    entityId: ticketId,
    entityOwnerUserId: user.id,
    beforeData: { status: ticket.status },
    afterData: { status: nextStatus, last_reply_role: "user" },
    metadata: { message_length: safeBody.length },
  });

  return NextResponse.json({ ok: true });
}

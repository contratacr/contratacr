import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifySupportInbox } from "@/lib/support-notify";

// Guest→account linking: when a user with a VERIFIED email views/uses support,
// attach any prior GUEST tickets (user_id null) with the same email to their
// account so the history appears in-app. Only on verified email — never claim
// someone else's tickets.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function claimGuestTickets(db: SupabaseClient<any>, user: User) {
  if (!user.email || !user.email_confirmed_at) return;
  await db.from("support_tickets").update({ user_id: user.id }).is("user_id", null).ilike("email", user.email);
}

// GET /api/support — the logged-in user's tickets.
// GET /api/support?id=… — one of THEIR tickets + its message thread.
export async function GET(req: Request) {
  const supa = await createClient();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const db = createAdminClient();
  await claimGuestTickets(db, user);
  const id = new URL(req.url).searchParams.get("id");

  if (id) {
    const { data: ticket } = await db.from("support_tickets").select("*").eq("id", id).eq("user_id", user.id).single();
    if (!ticket) return NextResponse.json({ error: "Ticket no encontrado" }, { status: 404 });
    const { data: messages } = await db
      .from("support_ticket_messages")
      .select("*")
      .eq("ticket_id", id)
      .order("created_at", { ascending: true });
    return NextResponse.json({ ticket, messages: messages ?? [] });
  }

  const { data } = await db
    .from("support_tickets")
    .select("*")
    .eq("user_id", user.id)
    .order("last_reply_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  return NextResponse.json({ tickets: data ?? [] });
}

// POST /api/support — the user replies in one of THEIR ticket threads.
export async function POST(req: Request) {
  const supa = await createClient();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { ticketId, body, action } = await req.json();
  if (!ticketId) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  const db = createAdminClient();
  const { data: ticket } = await db.from("support_tickets").select("*").eq("id", ticketId).eq("user_id", user.id).single();
  if (!ticket) return NextResponse.json({ error: "Ticket no encontrado" }, { status: 404 });

  const now = new Date().toISOString();
  const senderName = (user.user_metadata?.full_name as string) || ticket.name || null;

  // CONFIRM — the user agrees the ticket is resolved (finalizes it).
  if (action === "confirm") {
    await db.from("support_tickets").update({ user_confirmed: true, status: "resolved" }).eq("id", ticketId);
    return NextResponse.json({ ok: true });
  }

  // REOPEN — the problem persists; back to "Pendiente" and notify the inbox.
  if (action === "reopen") {
    await db.from("support_tickets").update({ status: "open", user_confirmed: false, last_reply_at: now, last_reply_role: "user" }).eq("id", ticketId);
    await db.from("support_ticket_messages").insert({
      ticket_id: ticketId, sender_role: "user", sender_id: user.id, sender_name: senderName, body: body?.trim() || "El usuario solicitó reabrir el ticket: el problema continúa.",
    });
    await notifySupportInbox({ subject: ticket.subject, fromName: senderName, fromEmail: ticket.email ?? user.email ?? "", body: "Solicitud de reapertura: el problema continúa.", isReply: true });
    return NextResponse.json({ ok: true });
  }

  // Otherwise: a normal reply message.
  if (!body?.trim()) return NextResponse.json({ error: "Escribe un mensaje." }, { status: 400 });
  const { error: msgErr } = await db.from("support_ticket_messages").insert({
    ticket_id: ticketId, sender_role: "user", sender_id: user.id, sender_name: senderName, body: body.trim(),
  });
  if (msgErr) return NextResponse.json({ error: msgErr.message }, { status: 500 });

  // A user reply re-opens a resolved ticket into "in_progress".
  const nextStatus = ticket.status === "resolved" ? "in_progress" : ticket.status;
  await db.from("support_tickets").update({ status: nextStatus, user_confirmed: false, last_reply_at: now, last_reply_role: "user" }).eq("id", ticketId);

  await notifySupportInbox({
    subject: ticket.subject, fromName: senderName, fromEmail: ticket.email ?? user.email ?? "", body: body.trim(), isReply: true,
  });

  return NextResponse.json({ ok: true });
}

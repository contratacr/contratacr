import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifySupportInbox } from "@/lib/support-notify";

// GET /api/support — the logged-in user's tickets.
// GET /api/support?id=… — one of THEIR tickets + its message thread.
export async function GET(req: Request) {
  const supa = await createClient();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const db = createAdminClient();
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

  const { ticketId, body } = await req.json();
  if (!ticketId || !body?.trim()) {
    return NextResponse.json({ error: "Escribe un mensaje." }, { status: 400 });
  }
  const db = createAdminClient();
  const { data: ticket } = await db.from("support_tickets").select("*").eq("id", ticketId).eq("user_id", user.id).single();
  if (!ticket) return NextResponse.json({ error: "Ticket no encontrado" }, { status: 404 });

  const now = new Date().toISOString();
  const senderName = (user.user_metadata?.full_name as string) || ticket.name || null;
  const { error: msgErr } = await db.from("support_ticket_messages").insert({
    ticket_id: ticketId, sender_role: "user", sender_id: user.id, sender_name: senderName, body: body.trim(),
  });
  if (msgErr) return NextResponse.json({ error: msgErr.message }, { status: 500 });

  // A user reply re-opens a resolved/closed ticket into "in_progress".
  const nextStatus = ticket.status === "resolved" || ticket.status === "closed" ? "in_progress" : ticket.status;
  await db.from("support_tickets").update({ status: nextStatus, last_reply_at: now, last_reply_role: "user" }).eq("id", ticketId);

  await notifySupportInbox({
    subject: ticket.subject, fromName: senderName, fromEmail: ticket.email ?? user.email ?? "", body: body.trim(), isReply: true,
  });

  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";
import { getApiAdmin } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyUserOfReply } from "@/lib/support-notify";

const STATUSES = ["open", "in_progress", "resolved", "closed"];

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

  const { count: openCount } = await db
    .from("support_tickets")
    .select("id", { count: "exact", head: true })
    .in("status", ["open", "in_progress"]);

  return NextResponse.json({ tickets: data ?? [], openCount: openCount ?? 0 });
}

// PATCH /api/admin/support — change ticket status (with audit). Admin-only.
export async function PATCH(req: Request) {
  const admin = await getApiAdmin();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { id, status } = await req.json();
  if (!id || !STATUSES.includes(status)) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }
  const now = new Date().toISOString();
  const db = createAdminClient();
  const { error } = await db
    .from("support_tickets")
    .update({ status, reviewed_at: now, handled_by: admin.id, handled_by_name: admin.fullName, handled_at: now })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// POST /api/admin/support — admin replies in the thread; emails the user. Admin-only.
export async function POST(req: Request) {
  const admin = await getApiAdmin();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { id, body } = await req.json();
  if (!id || !body?.trim()) {
    return NextResponse.json({ error: "Escribe una respuesta." }, { status: 400 });
  }
  const db = createAdminClient();
  const { data: ticket } = await db.from("support_tickets").select("*").eq("id", id).single();
  if (!ticket) return NextResponse.json({ error: "Ticket no encontrado" }, { status: 404 });

  const now = new Date().toISOString();
  const { error: msgErr } = await db.from("support_ticket_messages").insert({
    ticket_id: id, sender_role: "admin", sender_id: admin.id, sender_name: admin.fullName, body: body.trim(),
  });
  if (msgErr) return NextResponse.json({ error: msgErr.message }, { status: 500 });

  // Replying moves an untouched ticket into "in_progress" and records the handler.
  await db.from("support_tickets").update({
    status: ticket.status === "open" ? "in_progress" : ticket.status,
    last_reply_at: now, last_reply_role: "admin",
    handled_by: admin.id, handled_by_name: admin.fullName, handled_at: now,
  }).eq("id", id);

  // Email the user so they receive the reply (best-effort).
  if (ticket.email) {
    await notifyUserOfReply({ toEmail: ticket.email, toName: ticket.name, subject: ticket.subject, body: body.trim() });
  }

  return NextResponse.json({ ok: true });
}

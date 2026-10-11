import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enforceRateLimit } from "@/lib/rate-limit";
import { guestAccessEligible, validGuestAccess, GUEST_ACCESS_SECONDS } from "@/lib/support/guest-access";
import { firmarAdjuntos } from "@/lib/support/adjuntos";
import { auditUserAction } from "@/lib/audit/user-action";
import { despuesDeResponder } from "@/lib/after-response";
import { LONG_TEXT_MAX_LENGTH, limitTrimmedText } from "@/lib/text-limits";

export const runtime = "nodejs";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Context = { params: Promise<{ id: string }> };
const cookieName = (id: string) => `support_guest_${id}`;
const json = (body: unknown, status = 200) => NextResponse.json(body, {
  status, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
});
const denied = () => json({ error: "invalid_link" }, 403);

async function load(id: string) {
  if (!UUID.test(id)) return null;
  const db = createAdminClient();
  const { data: ticket } = await db.from("support_tickets").select("id, email, name, subject, topic, user_id, status").eq("id", id).maybeSingle();
  return ticket && guestAccessEligible(ticket) ? { db, ticket } : null;
}

export async function GET(req: NextRequest, ctx: Context) {
  const rl = enforceRateLimit(req, "support-guest-read", 60, 60_000);
  if (rl) return rl;
  const { id } = await ctx.params;
  const access = await load(id);
  if (!access || !validGuestAccess(id, access.ticket.email, req.cookies.get(cookieName(id))?.value || "")) return denied();
  const { data: messages, error } = await access.db.from("support_ticket_messages")
    .select("id, body, sender_role, created_at, attachments").eq("ticket_id", id).order("created_at", { ascending: true });
  if (error) return json({ error: "unavailable" }, 503);
  return json({ ticket: { subject: access.ticket.subject, status: access.ticket.status }, messages: await firmarAdjuntos(access.db, messages ?? []) });
}

export async function POST(req: NextRequest, ctx: Context) {
  // Cookie-bearing mutations require the same origin; no cross-site replies.
  // Next's Node server can expose an internal hostname in req.url. The Host
  // header is the actual browser destination (also true behind Cloudflare).
  const destination = new URL(req.url);
  destination.host = req.headers.get("host") || destination.host;
  if (req.headers.get("origin") !== destination.origin) return denied();
  const { id } = await ctx.params;
  let input;
  try { input = await req.json(); } catch { return json({ error: "invalid_body" }, 400); }
  if (!input || typeof input !== "object" || Array.isArray(input)) return json({ error: "invalid_body" }, 400);
  const rl = enforceRateLimit(req, input.action === "open" ? "support-guest-open" : "support-guest-reply", input.action === "open" ? 30 : 10, 60_000);
  if (rl) return rl;
  const access = await load(id);
  if (!access) return denied();
  const { db, ticket } = access;
  if (input.action === "open") {
    if (!validGuestAccess(id, ticket.email, input.token)) return denied();
    const response = json({ ok: true });
    response.cookies.set(cookieName(id), input.token, {
      httpOnly: true, secure: new URL(req.url).protocol === "https:", sameSite: "strict",
      path: `/api/support/guest/${id}`, maxAge: Math.min(GUEST_ACCESS_SECONDS, Number(input.token.split(".")[0]) - Math.floor(Date.now() / 1000)),
    });
    return response;
  }
  if (input.action !== "reply" || !validGuestAccess(id, ticket.email, req.cookies.get(cookieName(id))?.value || "")) return denied();
  if (typeof input.body !== "string") return json({ error: "invalid_body" }, 400);
  const body = limitTrimmedText(input.body, LONG_TEXT_MAX_LENGTH);
  if (!body) return json({ error: "empty_message" }, 400);
  // Re-check guest ownership at the write boundary: claimed cases require login.
  const now = new Date().toISOString();
  const { data: updated, error: updateError } = await db.from("support_tickets").update({
    status: ticket.status === "resolved" ? "in_progress" : ticket.status,
    user_confirmed: false, last_reply_at: now, last_reply_role: "user",
  }).eq("id", id).is("user_id", null).eq("topic", "subject1").eq("email", ticket.email).select("id").maybeSingle();
  if (updateError) return json({ error: "unavailable" }, 503);
  if (!updated) return denied();
  const { error } = await db.from("support_ticket_messages").insert({
    ticket_id: id, sender_role: "user", sender_id: null, sender_name: ticket.name, body,
  });
  if (error) return json({ error: "unavailable" }, 503);
  despuesDeResponder(auditUserAction(db, req, {
    actorRole: "guest", action: "support.guest_reply", entityTable: "support_tickets", entityId: id,
    metadata: { message_length: body.length },
  }), "support.guest-reply:audit");
  return json({ ok: true });
}

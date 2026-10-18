import { canRequestIdentityReview } from "@/lib/verification/review-eligibility";
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enforceRateLimit } from "@/lib/rate-limit";
import { cleanId, detectIdType, isValidId } from "@/lib/cedula";
import { DOC_KINDS, IMAGE_KINDS, MIME_FOR, validateUpload } from "@/lib/upload-validation";
import { BUCKET_SOPORTE, type AdjuntoDeSoporte } from "@/lib/support/adjuntos";
import { documentCaseId } from "@/lib/verification/documents";

export const runtime = "nodejs";

async function context() {
  const session = await createClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return null;
  const db = createAdminClient();
  const { data: pro, error } = await db.from("professionals")
    .select("id, verification_status, is_verified, verification_updated_at, verification_provider, verification_reason, profiles(cedula, full_name, email)")
    .eq("profile_id", user.id).maybeSingle();
  if (error) throw error;
  if (!pro) return null;
  const profile = pro.profiles as unknown as { cedula: string | null; full_name: string | null; email: string | null };
  const cedula = cleanId(profile?.cedula ?? "");
  const { data: decision, error: decisionError } = await db.from("provider_verification_log").select("id")
    .eq("professional_id", pro.id).in("action", ["verified", "rejected", "reverted_pending"])
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (decisionError) throw decisionError;
  return { db, user, pro, profile, cedula, hasAdminDecision: !!decision, legal: pro.verification_provider === "hacienda_api_juridica" || detectIdType(cedula) === "juridica", ticketId: documentCaseId(user.id, cedula, decision?.id ?? null) };
}
const unavailable = () => NextResponse.json({ error: "No se pudo guardar. Intenta nuevamente." }, { status: 503 });

export async function GET() {
  try {
    const ctx = await context();
    if (!ctx) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const { data, error } = await ctx.db.from("support_ticket_messages").select("id").eq("id", ctx.ticketId).maybeSingle();
    if (error) return unavailable();
    const { data: ticket, error: ticketError } = await ctx.db.from("support_tickets").select("id, topic, status").eq("id", ctx.ticketId).maybeSingle();
    if (ticketError) return unavailable();
    const verified = ctx.pro.is_verified || ctx.pro.verification_status === "verified";
    const canReview = canRequestIdentityReview(ctx.pro, ctx.cedula);
    const requiresSupport = ctx.hasAdminDecision && ctx.pro.verification_status === "pending" && !verified && !canReview;
    return NextResponse.json({
      verified, canReview, requiresSupport,
      canVerify: isValidId(ctx.cedula) && ctx.pro.verification_status === "pending" && !verified && !ctx.hasAdminDecision,
      submitted: !!data, ticketId: ticket ? ctx.ticketId : null, legal: ctx.legal,
      reviewRequested: ticket?.topic === "verification_appeal" && ticket.status !== "resolved",
    }, { headers: { "Cache-Control": "no-store" } });
  } catch { return unavailable(); }
}

// Files remain in the existing private support bucket. No email or push is sent.
export async function POST(req: Request) {
  const limit = enforceRateLimit(req, "verification-documents", 6, 60_000);
  if (limit) return limit;
  try {
    const ctx = await context();
    if (!ctx) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const { db, user, pro, profile, ticketId } = ctx;
    if (pro.is_verified || pro.verification_status === "verified") return NextResponse.json({ error: "Tu identidad ya está verificada." }, { status: 409 });
    if (!canRequestIdentityReview(pro, ctx.cedula)) return NextResponse.json({ error: "La revisión manual está disponible para identificaciones no encontradas." }, { status: 409 });
    const { data: saved, error: readError } = await db.from("support_ticket_messages").select("id").eq("id", ticketId).maybeSingle();
    if (readError) return unavailable();
    async function enterReview() {
      const { error } = await db.from("professionals").update({ verification_status: "under_appeal", verification_updated_at: new Date().toISOString() })
        .eq("id", pro.id).neq("verification_status", "verified");
      if (error) throw error;
    }
    if (saved) { await enterReview(); return NextResponse.json({ ok: true, ticketId }); }
    const form = await req.formData();
    const message = String(form.get("message") ?? "").trim();
    if (message.length > 2000) return NextResponse.json({ error: "El motivo debe tener 2000 caracteres o menos." }, { status: 400 });
    const required = ctx.legal ? ["identity", "company"] : ["identity"];
    const checked: { key: string; file: File; bytes: Buffer; mime: string }[] = [];
    for (const key of required) {
      const file = form.get(key);
      if (!(file instanceof File) || !file.size || file.size > 4 * 1024 * 1024)
        return NextResponse.json({ error: "Adjunta los documentos requeridos, de hasta 4 MB cada uno." }, { status: 400 });
      const bytes = Buffer.from(await file.arrayBuffer());
      const validation = validateUpload(bytes, { allow: [...IMAGE_KINDS, ...DOC_KINDS], maxBytes: 4 * 1024 * 1024, allowLabel: "Foto o PDF" });
      if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 400 });
      checked.push({ key, file, bytes, mime: MIME_FOR[validation.kind] });
    }
    // Reserve once without overwriting an administrator's handling on a retry.
    const { error: ticketError } = await db.from("support_tickets").upsert({
      id: ticketId, user_id: user.id, professional_id: pro.id, topic: "verification_documents",
      name: profile.full_name, email: profile.email ?? user.email, subject: "Documentos de verificación",
      message: message || "Revisión de identidad solicitada desde el panel.", status: "open", last_reply_role: "user", last_reply_at: new Date().toISOString(),
    }, { onConflict: "id", ignoreDuplicates: true });
    if (ticketError) return unavailable();
    const attachments: AdjuntoDeSoporte[] = [];
    for (const item of checked) {
      const hash = createHash("sha256").update(item.bytes).digest("hex");
      const path = `${ticketId}/${user.id}/${item.key}-${hash}`;
      const { error } = await db.storage.from(BUCKET_SOPORTE).upload(path, item.bytes, { contentType: item.mime, upsert: false });
      if (error && String((error as { statusCode?: string }).statusCode) !== "409") return unavailable();
      attachments.push({ path, name: `${item.key === "identity" ? "Identificación" : "Personería o autorización"} · ${item.file.name.replace(/[^\p{L}\p{N}_. -]/gu, "").slice(0, 100) || "documento"}`, type: item.mime, size: item.file.size });
    }
    const { error: messageError } = await db.from("support_ticket_messages").upsert({
      id: ticketId, ticket_id: ticketId, sender_id: user.id, sender_role: "user", sender_name: profile.full_name,
      body: message || "Documentos para revisión de identidad.", attachments,
    }, { onConflict: "id", ignoreDuplicates: true });
    if (messageError) return unavailable();
    await enterReview();
    return NextResponse.json({ ok: true, ticketId });
  } catch { return unavailable(); }
}

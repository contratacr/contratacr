import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { auditUserAction } from "@/lib/audit/user-action";
import { writeSourceColumns } from "@/lib/security/write-guard";
import { sendNotificationPush } from "@/lib/push/notify";
import { formatColones } from "@/lib/pricing";
import { randomBytes } from "node:crypto";
import { quoteTotals, sanitizeQuoteItems, type QuoteTaxMode } from "@/lib/quotes";

/**
 * Cotizaciones: el profesional las crea desde su sección (a cualquier cliente,
 * con nombre y WhatsApp) o sobre una cita o un proyecto; el cliente las acepta o
 * rechaza desde su panel o desde el enlace público. Las escrituras usan la
 * llave de servicio tras verificar quién es quién.
 */
const TAX_MODES = new Set<QuoteTaxMode>(["incluido", "mas_iva", "exento"]);
const SELECT = "id, professional_id, client_id, client_name, client_phone, client_cedula, public_code, booking_id, project_id, proposal_id, title, items, tax_mode, subtotal, tax_amount, total, notes, valid_until, status, accepted_at, declined_at, created_at";

// Código del enlace público: 12 caracteres de un alfabeto sin ambigüedades.
const ALFABETO = "abcdefghjkmnpqrstuvwxyz23456789";
function codigoPublico() {
  const bytes = randomBytes(12);
  let out = "";
  for (let i = 0; i < 12; i++) out += ALFABETO[bytes[i] % ALFABETO.length];
  return out;
}

function tableMissing(message?: string | null) {
  return /relation .*quotes.* does not exist|Could not find the table|schema cache/i.test(message ?? "");
}

async function whoAmI() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const admin = createAdminClient();
  const { data: pro } = await admin.from("professionals").select("id, profiles(full_name)").eq("profile_id", user.id).maybeSingle();
  const proName = (pro?.profiles as { full_name?: string | null } | null)?.full_name ?? null;
  return { user, admin, proId: pro?.id ?? null, proName };
}

export async function GET(req: NextRequest) {
  const me = await whoAmI();
  if (!me) return NextResponse.json({ error: "Inicia sesión." }, { status: 401 });
  const url = new URL(req.url);
  const bookingId = url.searchParams.get("bookingId");
  const projectId = url.searchParams.get("projectId");
  // Con el nombre de quien cotiza: el cliente lo ve en "De X" y el profesional
  // lo necesita para la imagen que manda por WhatsApp.
  let q = me.admin.from("quotes").select(`${SELECT}, professionals(business_name, profiles(full_name))`).order("created_at", { ascending: false }).limit(100);
  if (bookingId) q = q.eq("booking_id", bookingId);
  else if (projectId) q = q.eq("project_id", projectId);
  // Solo lo propio: lo que envié como profesional o lo que me enviaron como cliente.
  q = me.proId ? q.or(`client_id.eq.${me.user.id},professional_id.eq.${me.proId}`) : q.eq("client_id", me.user.id);
  const { data, error } = await q;
  if (error) {
    if (tableMissing(error.message)) return NextResponse.json({ quotes: [], unavailable: true });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const quotes = ((data ?? []) as Array<Record<string, unknown>>).map((row) => {
    const pro = row.professionals as { business_name?: string | null; profiles?: { full_name?: string | null } | null } | null;
    const { professionals: _p, ...resto } = row; void _p;
    return { ...resto, professional_name: pro?.business_name?.trim() || pro?.profiles?.full_name || null };
  });
  return NextResponse.json({ quotes });
}

export async function POST(req: NextRequest) {
  const me = await whoAmI();
  if (!me) return NextResponse.json({ error: "Inicia sesión." }, { status: 401 });
  if (!me.proId) return NextResponse.json({ error: "Solo los profesionales envían cotizaciones." }, { status: 403 });
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const items = sanitizeQuoteItems(body.items);
  if (items.length === 0) return NextResponse.json({ error: "Agrega al menos un renglón con descripción y precio." }, { status: 400 });
  const taxMode = TAX_MODES.has(body.taxMode as QuoteTaxMode) ? (body.taxMode as QuoteTaxMode) : "incluido";
  const title = String(body.title ?? "").replace(/\s+/g, " ").trim().slice(0, 120) || null;
  const notes = String(body.notes ?? "").trim().slice(0, 1000) || null;
  const validDays = Math.min(90, Math.max(1, Number(body.validDays) || 15));
  const validUntil = new Date(Date.now() + validDays * 86_400_000).toISOString().slice(0, 10);
  const bookingId = typeof body.bookingId === "string" ? body.bookingId : null;
  const projectId = typeof body.projectId === "string" ? body.projectId : null;
  const clientName = String(body.clientName ?? "").replace(/\s+/g, " ").trim().slice(0, 80) || null;
  const clientPhone = String(body.clientPhone ?? "").replace(/[^\d+]/g, "").slice(0, 20) || null;
  const clientCedula = String(body.clientCedula ?? "").replace(/\D/g, "").slice(0, 20) || null;
  if (!bookingId && !projectId && !clientName) return NextResponse.json({ error: "Escribe para quién es la cotización." }, { status: 400 });

  // El contexto tiene que ser del profesional: su cita, o un proyecto que respondió.
  let clientId: string | null = null; let proposalId: string | null = null; let contextTitle = "";
  if (bookingId) {
    const { data: b } = await me.admin.from("bookings").select("id, client_id, professional_id, service_description").eq("id", bookingId).maybeSingle();
    if (!b || b.professional_id !== me.proId) return NextResponse.json({ error: "Esa cita no es tuya." }, { status: 403 });
    clientId = b.client_id ?? null; contextTitle = b.service_description ?? "";
  } else if (projectId) {
    const { data: p } = await me.admin.from("projects").select("id, client_id, title").eq("id", projectId).maybeSingle();
    if (!p) return NextResponse.json({ error: "Proyecto no encontrado." }, { status: 404 });
    const { data: prop } = await me.admin.from("proposals").select("id").eq("project_id", projectId).eq("professional_id", me.proId).maybeSingle();
    if (!prop) return NextResponse.json({ error: "Primero responde el proyecto." }, { status: 403 });
    clientId = p.client_id ?? null; proposalId = prop.id; contextTitle = p.title ?? "";
  }
  if ((bookingId || projectId) && !clientId) return NextResponse.json({ error: "Esta cita no tiene una cuenta de cliente a la que enviarle la cotización." }, { status: 400 });

  const totals = quoteTotals(items, taxMode);
  const insert = {
    professional_id: me.proId, client_id: clientId, client_name: clientName, client_phone: clientPhone, client_cedula: clientCedula, public_code: codigoPublico(),
    booking_id: bookingId, project_id: projectId, proposal_id: proposalId,
    title: title ?? (contextTitle || null), items, tax_mode: taxMode, ...totals, notes, valid_until: validUntil, status: "sent",
    ...writeSourceColumns(req),
  };
  const { data, error } = await me.admin.from("quotes").insert(insert).select(SELECT).single();
  if (error) {
    if (tableMissing(error.message)) return NextResponse.json({ error: "Las cotizaciones todavía no están habilitadas." }, { status: 503 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await auditUserAction(me.admin, req, { actorUserId: me.user.id, actorRole: "professional", action: "quote.create", entityTable: "quotes", entityId: data.id, entityOwnerUserId: me.user.id, afterData: insert });

  if (clientId) try {
    const proName = me.proName ?? "El profesional";
    const link = bookingId ? "/es/dashboard/profesional?tab=sent_bookings" : "/es/dashboard/profesional?tab=sent_projects";
    const notification = {
      user_id: clientId, type: "quote_sent", title: "Te enviaron una cotización",
      message: `${proName} te envió una cotización por ${formatColones(totals.total)}${contextTitle ? ` para "${contextTitle}"` : ""}. Revísala y acéptala si te sirve.`,
      data: { link, quote_id: data.id, booking_id: bookingId, project_id: projectId, total: totals.total },
    };
    await me.admin.from("notifications").insert(notification);
    await sendNotificationPush({ userId: clientId, title: notification.title, message: notification.message, data: notification.data });
  } catch (err) { console.error("[quotes] aviso al cliente:", err); }

  return NextResponse.json({ quote: data });
}

export async function PATCH(req: NextRequest) {
  const me = await whoAmI();
  if (!me) return NextResponse.json({ error: "Inicia sesión." }, { status: 401 });
  const body = await req.json().catch(() => ({})) as { id?: string; action?: string };
  const id = String(body.id ?? ""); const action = String(body.action ?? "");
  if (!id || !["accept", "decline", "withdraw"].includes(action)) return NextResponse.json({ error: "Acción no válida." }, { status: 400 });
  const { data: q, error } = await me.admin.from("quotes").select(SELECT).eq("id", id).maybeSingle();
  if (error || !q) return NextResponse.json({ error: "Cotización no encontrada." }, { status: 404 });
  if (q.status !== "sent") return NextResponse.json({ error: "Esta cotización ya se cerró." }, { status: 409 });

  const now = new Date().toISOString();
  let patch: Record<string, unknown>; let notifyUserId: string | null = null; let type = ""; let title = ""; let message = "";
  if (action === "withdraw") {
    if (q.professional_id !== me.proId) return NextResponse.json({ error: "Solo quien la envió puede retirarla." }, { status: 403 });
    patch = { status: "withdrawn", updated_at: now };
  } else {
    if (q.client_id !== me.user.id) return NextResponse.json({ error: "Solo el cliente puede responder la cotización." }, { status: 403 });
    patch = action === "accept" ? { status: "accepted", accepted_at: now, updated_at: now } : { status: "declined", declined_at: now, updated_at: now };
    const { data: pro } = await me.admin.from("professionals").select("profile_id").eq("id", q.professional_id).maybeSingle();
    notifyUserId = pro?.profile_id ?? null;
    const { data: cliente } = await me.admin.from("profiles").select("full_name").eq("id", me.user.id).maybeSingle();
    const nombre = cliente?.full_name ?? "El cliente";
    type = action === "accept" ? "quote_accepted" : "quote_declined";
    title = action === "accept" ? "Cotización aceptada" : "Cotización no aceptada";
    message = action === "accept"
      ? `${nombre} aceptó tu cotización por ${formatColones(q.total)}${q.title ? ` para "${q.title}"` : ""}. Coordinen los detalles.`
      : `${nombre} no aceptó tu cotización por ${formatColones(q.total)}${q.title ? ` para "${q.title}"` : ""}. Puedes enviarle otra.`;
  }
  const { data: updated, error: upErr } = await me.admin.from("quotes").update(patch).eq("id", id).select(SELECT).single();
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
  await auditUserAction(me.admin, req, { actorUserId: me.user.id, actorRole: action === "withdraw" ? "professional" : "client", action: `quote.${action}`, entityTable: "quotes", entityId: id, entityOwnerUserId: q.client_id, afterData: patch });
  if (notifyUserId) {
    try {
      const link = q.booking_id ? "/es/dashboard/profesional?mode=offer&tab=bookings" : "/es/dashboard/profesional?mode=offer&tab=proposals";
      const notification = { user_id: notifyUserId, type, title, message, data: { link, quote_id: id, booking_id: q.booking_id, project_id: q.project_id, total: q.total } };
      await me.admin.from("notifications").insert(notification);
      await sendNotificationPush({ userId: notifyUserId, title, message, data: notification.data });
    } catch (err) { console.error("[quotes] aviso al profesional:", err); }
  }
  return NextResponse.json({ quote: updated });
}

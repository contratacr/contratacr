import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendNotificationPush } from "@/lib/push/notify";
import { formatColones } from "@/lib/pricing";
import { isQuoteExpired } from "@/lib/quotes";

/**
 * El cliente responde la cotización desde el enlace público, sin cuenta. El
 * código es la llave: 12 caracteres al azar que solo tiene quien recibió el
 * enlace. Solo se puede responder una vez y mientras esté vigente.
 */
const SELECT = "id, professional_id, client_id, client_name, title, total, valid_until, status";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as { code?: string; action?: string };
  const code = String(body.code ?? "").trim().toLowerCase();
  const action = String(body.action ?? "");
  if (!/^[a-z0-9]{8,20}$/.test(code) || !["accept", "decline"].includes(action)) {
    return NextResponse.json({ error: "Acción no válida." }, { status: 400 });
  }
  const admin = createAdminClient();
  const { data: q, error } = await admin.from("quotes").select(SELECT).eq("public_code", code).maybeSingle();
  if (error || !q) return NextResponse.json({ error: "Cotización no encontrada." }, { status: 404 });
  if (q.status !== "sent") return NextResponse.json({ error: "Esta cotización ya se cerró." }, { status: 409 });
  if (isQuoteExpired(q)) return NextResponse.json({ error: "Esta cotización ya venció." }, { status: 409 });

  const now = new Date().toISOString();
  const patch = action === "accept"
    ? { status: "accepted", accepted_at: now, updated_at: now }
    : { status: "declined", declined_at: now, updated_at: now };
  const { error: upErr } = await admin.from("quotes").update(patch).eq("id", q.id).eq("status", "sent");
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  // Aviso al profesional: en el panel y por push.
  try {
    const { data: pro } = await admin.from("professionals").select("profile_id").eq("id", q.professional_id).maybeSingle();
    if (pro?.profile_id) {
      const nombre = q.client_name || "El cliente";
      const type = action === "accept" ? "quote_accepted" : "quote_declined";
      const title = action === "accept" ? "Cotización aceptada" : "Cotización no aceptada";
      const message = action === "accept"
        ? `${nombre} aceptó tu cotización por ${formatColones(q.total)}${q.title ? ` para "${q.title}"` : ""}. Coordinen los detalles.`
        : `${nombre} no aceptó tu cotización por ${formatColones(q.total)}${q.title ? ` para "${q.title}"` : ""}. Puedes enviarle otra.`;
      const data = { link: "/es/dashboard/profesional?mode=offer&tab=quotes", quote_id: q.id, total: q.total };
      await admin.from("notifications").insert({ user_id: pro.profile_id, type, title, message, data });
      await sendNotificationPush({ userId: pro.profile_id, title, message, data });
    }
  } catch (err) { console.error("[quotes/public] aviso al profesional:", err); }

  return NextResponse.json({ status: patch.status });
}

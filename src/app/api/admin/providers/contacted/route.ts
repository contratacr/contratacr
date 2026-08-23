import { NextResponse } from "next/server";
import { getApiAdmin } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";

// POST /api/admin/providers/contacted — records that the owner wrote to this
// professional by WhatsApp from the review queue. The message itself goes out
// from their own phone (personal, free, and replies come back to them); this
// only keeps the tally so nobody gets written to twice on a long list.
export async function POST(req: Request) {
  const admin = await getApiAdmin();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  let professionalId: string | undefined;
  try {
    professionalId = (await req.json())?.professionalId;
  } catch {
    professionalId = undefined;
  }
  if (!professionalId) return NextResponse.json({ error: "Falta el profesional." }, { status: 400 });

  const db = createAdminClient();
  const { error } = await db.from("provider_verification_log").insert({
    professional_id: professionalId,
    admin_id: admin.id,
    admin_name: admin.fullName || admin.email,
    action: "whatsapp_manual",
    reason: "Mensaje de verificación enviado por WhatsApp desde la cola",
  });
  if (error) {
    console.error("[admin/providers/contacted] insert error:", error);
    return NextResponse.json({ error: "No se pudo registrar el contacto." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, contactedAt: new Date().toISOString() });
}

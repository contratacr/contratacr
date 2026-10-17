import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enforceRateLimit } from "@/lib/rate-limit";
import { requestManualVerification } from "@/lib/verification/manual-review";

// Appealing requests a human review, never another automatic lookup/decision.
export async function POST(req: Request) {
  const session = await createServerClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const limited = enforceRateLimit(req, "verification-appeal", 6, 60_000);
  if (limited) return limited;
  const body = await req.json().catch(() => ({}));
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (message.length > 2000) return NextResponse.json({ error: "El motivo debe tener 2000 caracteres o menos." }, { status: 400 });
  try {
    const db = createAdminClient();
    const { data: pro, error } = await db.from("professionals").select("id, verification_status, is_verified, profiles(id, cedula, full_name, email)")
      .eq("profile_id", user.id).maybeSingle();
    if (error) throw error;
    if (!pro) return NextResponse.json({ error: "No se encontró tu perfil." }, { status: 404 });
    if (pro.verification_status === "verified" || pro.is_verified) return NextResponse.json({ ok: true, outcome: "verified" });
    const profile = pro.profiles as unknown as { id: string; cedula: string | null; full_name: string | null; email: string | null };
    if (!profile || profile.id !== user.id) throw new Error("Profile mismatch");
    const ticketId = await requestManualVerification(db, profile, pro.id, message);
    return NextResponse.json({ ok: true, outcome: "ticket", ticketId }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "No se pudo solicitar la revisión. Intenta nuevamente." }, { status: 503 });
  }
}

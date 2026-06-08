import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runIdentityVerification } from "@/lib/verification/run-verification";

// POST /api/appeals  { message }
// A professional appeals a pending/failed verification. The system FIRST RE-RUNS
// automatic verification against the (possibly updated) padrón:
//   - now passes → grant "Identidad verificada" automatically (no human).
//   - still fails → create a support ticket (the rare manual tail) + under_appeal.
export async function POST(req: Request) {
  const session = await createServerClient();
  const {
    data: { user },
  } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const message = typeof body.message === "string" ? body.message.trim() : "";

  const db = createAdminClient();
  const { data: pro } = await db
    .from("professionals")
    .select("id, verification_status, no_cr_id")
    .eq("profile_id", user.id)
    .maybeSingle();

  if (!pro) return NextResponse.json({ error: "No se encontró tu perfil." }, { status: 404 });
  if (pro.verification_status === "verified") {
    return NextResponse.json({ ok: true, outcome: "verified" });
  }

  // Record the appeal text for the case.
  if (message) await db.from("provider_appeals").insert({ professional_id: pro.id, message });

  // No-CR-identification cases have NO cédula to re-verify against the padrón, so
  // an appeal goes STRAIGHT to a tracked support case (never a padrón re-run).
  if (pro.no_cr_id) {
    await db
      .from("professionals")
      .update({ verification_status: "under_appeal", verification_updated_at: new Date().toISOString() })
      .eq("id", pro.id);
    await db.from("support_tickets").insert({
      professional_id: pro.id,
      type: "verification",
      subject: "Revisión manual — sin identificación costarricense",
      detail: message || "El proveedor solicita revisión manual de su documento.",
    });
    return NextResponse.json({ ok: true, outcome: "ticket" });
  }

  // Cédula-based cases: re-run automatic verification against the padrón.
  const outcome = await runIdentityVerification(pro.id, { appeal: true, appealMessage: message });
  return NextResponse.json({ ok: true, outcome });
}

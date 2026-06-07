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
    .select("id, verification_status")
    .eq("profile_id", user.id)
    .maybeSingle();

  if (!pro) return NextResponse.json({ error: "No se encontró tu perfil." }, { status: 404 });
  if (pro.verification_status === "verified") {
    return NextResponse.json({ ok: true, outcome: "verified" });
  }

  // Record the appeal text for the case, then re-run verification.
  if (message) await db.from("provider_appeals").insert({ professional_id: pro.id, message });

  const outcome = await runIdentityVerification(pro.id, { appeal: true, appealMessage: message });
  return NextResponse.json({ ok: true, outcome });
}

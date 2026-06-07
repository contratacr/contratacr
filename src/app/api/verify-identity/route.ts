import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runIdentityVerification } from "@/lib/verification/run-verification";

// POST /api/verify-identity
// Runs automatic identity verification for the calling professional against the
// padrón. Called right after registration and from the verification panel. Only
// runs for the authenticated user's own professional record (internal use).
export async function POST() {
  const session = await createServerClient();
  const {
    data: { user },
  } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const admin = createAdminClient();
  const { data: pro } = await admin
    .from("professionals")
    .select("id, verification_status")
    .eq("profile_id", user.id)
    .maybeSingle();
  if (!pro) return NextResponse.json({ error: "No se encontró tu perfil profesional." }, { status: 404 });

  // Already verified → no-op (don't re-run unnecessarily).
  if (pro.verification_status === "verified") {
    return NextResponse.json({ ok: true, outcome: "verified" });
  }

  const outcome = await runIdentityVerification(pro.id);
  return NextResponse.json({ ok: true, outcome });
}

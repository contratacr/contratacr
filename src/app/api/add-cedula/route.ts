import { identityReviewScope } from "@/lib/verification/review-scope";
import { invalidateProfessionalCache } from "@/lib/cache/professional-revision";
import { NextResponse } from "next/server";
import { mensajeDeError } from "@/lib/api-errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runIdentityVerification } from "@/lib/verification/run-verification";

// POST /api/add-cedula { cedula }
// A no-CR-identification professional (e.g. a Nicaraguan who later receives a
// cédula) adds it from their panel. We store it, clear the no_cr_id flag, and run
// the normal Hacienda verification automatically.
export async function POST(req: Request) {
  // Public endpoint: bound abuse and enumeration per client IP.
  const limited = enforceRateLimit(req, "add-cedula", 10, 600000);
  if (limited) return limited;
  const session = await createServerClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const raw = typeof body.cedula === "string" ? body.cedula : "";
  const cedula = raw.replace(/\D/g, "");
  // Format check (cédula 9 / NITE 10 / DIMEX 11-12).
  const validFormat = /^[\d\s-]+$/.test(raw) && (/^[1-9]\d{8}$/.test(cedula) || /^\d{10}$/.test(cedula) || /^\d{11,12}$/.test(cedula));
  if (!validFormat) {
    return NextResponse.json({ error: mensajeDeError(req, { es: "Formato inválido. CR: 9 dígitos · DIMEX: 11-12 · NITE: 10.", en: "Invalid format. CR: 9 digits · DIMEX: 11-12 · NITE: 10." }) }, { status: 400 });
  }

  const db = createAdminClient();

  // Reject a cédula already used by another account.
  const { data: dupe, error: dupeError } = await db
    .from("profiles")
    .select("id")
    .eq("cedula", cedula)
    .neq("id", user.id)
    .maybeSingle();
  if (dupeError) return NextResponse.json({ error: "No se pudo comprobar la identificación. Intenta nuevamente." }, { status: 503 });
  if (dupe) {
    return NextResponse.json({ error: mensajeDeError(req, { es: "Esta identificación ya está registrada en ContrataCR.", en: "That ID is already registered with ContrataCR." }) }, { status: 409 });
  }

  const { data: pro } = await db
    .from("professionals")
    .select("id, verification_status")
    .eq("profile_id", user.id)
    .maybeSingle();

  // La misma que ya tiene verificada: no es un cambio. (Si todavía no está
  // verificada sí se deja pasar: reintentar con el mismo número es legítimo.)
  const { data: propio } = await db.from("profiles").select("cedula").eq("id", user.id).maybeSingle();
  if ((propio?.cedula ?? "").replace(/\D/g, "") === cedula && (pro as { verification_status?: string } | null)?.verification_status === "verified") {
    return NextResponse.json({ error: mensajeDeError(req, { es: "Esta ya es tu identificación verificada.", en: "That is already your verified ID." }) }, { status: 409 });
  }
  if (!pro) return NextResponse.json({ error: mensajeDeError(req, { es: "No se encontró tu perfil.", en: "We could not find your profile." }) }, { status: 404 });

  const changed = (propio?.cedula ?? "").replace(/\D/g, "") !== cedula;
  // Remove the old badge BEFORE changing the document. A failed save can never
  // leave a newly entered document carrying the previous document's approval.
  const { error: resetError } = await db.from("professionals").update({ no_cr_id: false,
    ...(changed ? { verification_status: "pending", is_verified: false, verified_at: null,
      verification_provider: null, verification_reason: null, verification_updated_at: new Date().toISOString() } : {}),
  }).eq("id", pro.id);
  if (resetError) return NextResponse.json({ error: "No se pudo guardar. Intenta nuevamente." }, { status: 503 });
  if (changed) {
    const { error: scopeError } = await db.from("provider_verification_log").insert({
      professional_id: pro.id, admin_id: null, admin_name: "Cambio de identificación",
      action: "identity_document_changed", from_status: pro.verification_status, to_status: "pending",
      reason: identityReviewScope(user.id, cedula),
    });
    if (scopeError) return NextResponse.json({ error: "No se pudo guardar. Intenta nuevamente." }, { status: 503 });
    await invalidateProfessionalCache();
  }
  const { error: saveError } = await db.from("profiles").update({ cedula,
    ...(changed ? { client_identity_status: "pending", client_identity_verified_at: null, client_identity_provider: null } : {}),
  }).eq("id", user.id);
  if (saveError) return NextResponse.json({ error: "No se pudo guardar. Intenta nuevamente." }, { status: 503 });

  const outcome = await runIdentityVerification(pro.id, { expectedCedula: cedula });

  const { data: updatedProfile } = await db
    .from("profiles")
    .select("full_name, cedula")
    .eq("id", user.id)
    .maybeSingle();

  return NextResponse.json({
    ok: true,
    outcome,
    fullName: outcome === "verified" ? updatedProfile?.full_name ?? null : null,
    cedula: outcome === "verified" ? updatedProfile?.cedula ?? cedula : null,
  });
}

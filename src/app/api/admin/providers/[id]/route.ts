import { NextResponse } from "next/server";
import { getApiAdmin } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { detectIdType, idTypeLabel, isValidId, cleanId } from "@/lib/cedula";
import { getIdentityVerifier, nameSimilarity, NAME_MATCH_THRESHOLD } from "@/lib/verification/identity-verifier";

// GET /api/admin/providers/[id]
// Full case file for one provider: profile, documents/images, audit log,
// appeals, and the automatic ID-format assist. Admin-only.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getApiAdmin();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { id } = await params;
  const db = createAdminClient();

  const { data: pro, error } = await db
    .from("professionals")
    .select(
      `id, slug, verification_status, verification_reason, verification_updated_at,
       category_id, professions, whatsapp, bio, address, portfolio_urls,
       business_name, workplaces, lat, lng, service_type, created_at,
       is_banned, banned_reason, no_cr_id, id_document_note, insurance_networks,
       profiles(full_name, email, cedula, phone, avatar_url)`
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !pro) {
    return NextResponse.json({ error: "Proveedor no encontrado." }, { status: 404 });
  }

  const { data: log } = await db
    .from("provider_verification_log")
    .select("*")
    .eq("professional_id", id)
    .order("created_at", { ascending: false });

  const { data: appeals } = await db
    .from("provider_appeals")
    .select("*")
    .eq("professional_id", id)
    .order("created_at", { ascending: false });

  // Automatic ID-format assist (format/length only — human review still required
  // for the badge). The live name-match lookup uses the shared identity verifier
  // so deployed environments read the heavy padrón from Neon first, with the
  // Supabase RPC kept as a temporary/local fallback.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cedula = cleanId((pro.profiles as any)?.cedula ?? "");
  const detectedIdType = cedula ? detectIdType(cedula) : null;
  const idAssist = cedula
    ? {
        value: cedula,
        valid: isValidId(cedula),
        type: detectedIdType,
        typeLabel: detectedIdType ? idTypeLabel(detectedIdType) : null,
      }
    : { value: "", valid: false, type: null, typeLabel: null };

  // Live padrón comparison for the manual reviewer (entered vs official name).
  // Read-only/transient — not stored on the profile (data minimization).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const enteredName: string = (pro.profiles as any)?.full_name ?? "";
  let padron: {
    found: boolean;
    name: string;
    score: number;
    matched: boolean;
    skipped?: boolean;
    unavailable?: boolean;
    reason?: string;
    source?: string;
  } | null = null;
  if (cedula && detectedIdType === "juridica") {
    padron = {
      found: false,
      name: "",
      score: 0,
      matched: false,
      skipped: true,
      reason: "La cédula jurídica no devuelve nombre desde el padrón TSE. Revísala manualmente con la documentación o datos de la empresa.",
    };
  } else if (cedula) {
    const lookup = await getIdentityVerifier().lookup(cedula);
    if (lookup.unavailable) {
      padron = {
        found: false,
        name: "",
        score: 0,
        matched: false,
        unavailable: true,
        reason: "No pudimos consultar el padrón en este momento. Intenta nuevamente o revisa la documentación manualmente.",
        source: lookup.provider,
      };
    } else if (lookup.found && lookup.fullName) {
      const name = lookup.fullName;
      const score = nameSimilarity(enteredName, name);
      padron = { found: true, name, score, matched: score >= NAME_MATCH_THRESHOLD, source: lookup.provider };
    } else {
      padron = { found: false, name: "", score: 0, matched: false, source: lookup.provider };
    }
  }

  return NextResponse.json({ provider: pro, log: log ?? [], appeals: appeals ?? [], idAssist, padron });
}

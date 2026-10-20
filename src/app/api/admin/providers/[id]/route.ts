import { readAllAdminRows, readAdminRowsByIds } from "@/lib/admin/read-all-rows";
import { firmarAdjuntos } from "@/lib/support/adjuntos";
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

  const { data: log } = await readAllAdminRows((from, to) => db
    .from("provider_verification_log")
    .select("*")
    .eq("professional_id", id)
    .order("created_at", { ascending: false }).order("id").range(from, to));

  const { data: appeals } = await readAllAdminRows((from, to) => db
    .from("provider_appeals")
    .select("*")
    .eq("professional_id", id)
    .order("created_at", { ascending: false }).order("id").range(from, to));

  // Automatic ID-format assist (format/length only — human review still required
  // for the badge). The live name-match lookup uses the shared identity verifier
  // so all environments consult the same free Hacienda API.
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

  // Live Hacienda comparison for the manual reviewer (entered vs official name).
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
  if (cedula) {
    const lookup = await getIdentityVerifier().lookup(cedula);
    if (lookup.idType) { idAssist.type = lookup.idType; idAssist.typeLabel = idTypeLabel(lookup.idType); }
    if (lookup.unavailable) {
      padron = {
        found: false,
        name: "",
        score: 0,
        matched: false,
        unavailable: true,
        reason: "No pudimos consultar Hacienda en este momento. Intenta nuevamente o revisa la documentación manualmente.",
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

  const { data: cases, error: caseError } = await readAllAdminRows((from, to) => db.from("support_tickets").select("id")
    .eq("professional_id", id).in("topic", ["verification_documents", "verification_appeal"]).order("created_at", { ascending: false }).order("id").range(from, to));
  if (caseError) return NextResponse.json({ error: "No se pudieron cargar los documentos." }, { status: 503 });
  let documents: { attachments: import("@/lib/support/adjuntos").AdjuntoDeSoporte[]; created_at: string }[] = [];
  if (cases?.length) {
    const { data: rows, error: documentsError } = await readAdminRowsByIds(cases.map(c => c.id), (batch, from, to) => db.from("support_ticket_messages").select("attachments, created_at")
      .in("ticket_id", batch).eq("sender_role", "user").order("created_at", { ascending: false }).order("id").range(from, to));
    if (documentsError) return NextResponse.json({ error: "No se pudieron cargar los documentos." }, { status: 503 });
    documents = await firmarAdjuntos(db, rows ?? []);
  }
  return NextResponse.json({ documents, provider: pro, log: log ?? [], appeals: appeals ?? [], idAssist, padron }, { headers: { "Cache-Control": "no-store" } });
}

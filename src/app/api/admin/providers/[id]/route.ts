import { NextResponse } from "next/server";
import { getApiAdmin } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { detectIdType, idTypeLabel, isValidId, cleanId } from "@/lib/cedula";

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
  // for the badge). A live TSE name-match lookup is available on demand via
  // /api/cedula/[id] from the panel.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cedula = cleanId((pro.profiles as any)?.cedula ?? "");
  const idAssist = cedula
    ? {
        value: cedula,
        valid: isValidId(cedula),
        type: detectIdType(cedula),
        typeLabel: detectIdType(cedula) ? idTypeLabel(detectIdType(cedula)!) : null,
      }
    : { value: "", valid: false, type: null, typeLabel: null };

  return NextResponse.json({ provider: pro, log: log ?? [], appeals: appeals ?? [], idAssist });
}

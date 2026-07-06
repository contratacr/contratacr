import { NextResponse } from "next/server";
import { getApiAdmin } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { VERIFICATION_STATUSES, type VerificationStatus } from "@/lib/verification";

// GET /api/admin/providers?status=pending|authorized|rejected|under_appeal|all
// Review queue, filterable by verification status. Admin-only.
export async function GET(req: Request) {
  const admin = await getApiAdmin();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const url = new URL(req.url);
  const status = url.searchParams.get("status") ?? "pending";

  const db = createAdminClient();
  const { data: professionals, error } = await db
    .from("professionals")
    .select(
      `id, slug, verification_status, verification_reason, verification_updated_at,
       category_id, professions, whatsapp, created_at,
       profiles(id, full_name, email, cedula, avatar_url, client_identity_status, client_identity_verified_at)`
    )
    .order("verification_updated_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) {
    console.error("[admin/providers] list error:", error);
    return NextResponse.json({ error: "No se pudo cargar la cola." }, { status: 500 });
  }

  // Client-only accounts belong in this queue only when identity review actually
  // exists. A saved ID with client_identity_status="unverified" can happen when
  // someone starts a request flow and does not finish it; that is not actionable
  // for admin verification and should not pollute "Todos".
  const { data: profiles, error: profilesError } = await db
    .from("profiles")
    .select("id, full_name, email, cedula, avatar_url, client_identity_status, client_identity_verified_at, created_at")
    .in("client_identity_status", ["pending", "verified"])
    .order("client_identity_verified_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(300);
  if (profilesError) {
    console.error("[admin/providers] profiles list error:", profilesError);
    return NextResponse.json({ error: "No se pudo cargar la cola." }, { status: 500 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const proRows = (professionals ?? []) as any[];
  const proByProfile = new Map<string, unknown>();
  for (const pro of proRows) {
    const profileId = pro.profiles?.id;
    if (profileId) proByProfile.set(profileId, pro);
  }

  function accountStatus(profileStatus?: string | null, proStatus?: string | null): VerificationStatus {
    if ((VERIFICATION_STATUSES as string[]).includes(proStatus ?? "")) return proStatus as VerificationStatus;
    if (profileStatus === "verified") return "verified";
    if (profileStatus === "pending") return "pending";
    return "rejected";
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const clientRows = ((profiles ?? []) as any[])
    .filter((profile) => !proByProfile.has(profile.id))
    .map((profile) => ({
      id: profile.id,
      account_id: profile.id,
      slug: null,
      verification_status: accountStatus(profile.client_identity_status, null),
      verification_reason: null,
      verification_updated_at: profile.client_identity_verified_at,
      category_id: null,
      professions: null,
      whatsapp: null,
      created_at: profile.created_at,
      role_label: "Cliente",
      detail_href: `/admin/usuarios/${profile.id}?from=verificacion`,
      profiles: profile,
    }));

  const unified = [
    ...proRows.map((pro) => ({
      ...pro,
      account_id: pro.profiles?.id ?? null,
      role_label: "Cliente y profesional",
      detail_href: pro.profiles?.id ? `/admin/usuarios/${pro.profiles.id}?from=verificacion` : `/admin/proveedores/${pro.id}`,
    })),
    ...clientRows,
  ];

  const filtered = unified.filter((row) => {
    if (status === "all") return true;
    if (status === "pending") return row.verification_status === "pending" || row.verification_status === "under_appeal";
    return row.verification_status === status;
  });

  const counts: Record<string, number> = {};
  for (const s of VERIFICATION_STATUSES) counts[s] = unified.filter((row) => row.verification_status === s).length;

  return NextResponse.json({ providers: filtered.slice(0, 200), counts });
}

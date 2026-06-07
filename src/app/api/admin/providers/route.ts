import { NextResponse } from "next/server";
import { getApiAdmin } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { VERIFICATION_STATUSES } from "@/lib/verification";

// GET /api/admin/providers?status=pending|authorized|rejected|under_appeal|all
// Review queue, filterable by verification status. Admin-only.
export async function GET(req: Request) {
  const admin = await getApiAdmin();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const url = new URL(req.url);
  const status = url.searchParams.get("status") ?? "pending";

  const db = createAdminClient();
  let query = db
    .from("professionals")
    .select(
      `id, slug, verification_status, verification_reason, verification_updated_at,
       category_id, professions, whatsapp, created_at,
       profiles(full_name, email, cedula, avatar_url)`
    )
    .order("verification_updated_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (status !== "all" && (VERIFICATION_STATUSES as string[]).includes(status)) {
    query = query.eq("verification_status", status);
  }

  const { data, error } = await query.limit(200);
  if (error) {
    console.error("[admin/providers] list error:", error);
    return NextResponse.json({ error: "No se pudo cargar la cola." }, { status: 500 });
  }

  // Counts per status for the filter tabs.
  const counts: Record<string, number> = {};
  for (const s of VERIFICATION_STATUSES) {
    const { count } = await db
      .from("professionals")
      .select("id", { count: "exact", head: true })
      .eq("verification_status", s);
    counts[s] = count ?? 0;
  }

  return NextResponse.json({ providers: data ?? [], counts });
}

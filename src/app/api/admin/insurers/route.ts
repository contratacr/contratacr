import { NextResponse } from "next/server";
import { getApiAdmin } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";

// GET /api/admin/insurers?status=pending|approved|all — aseguradora suggestion
// tickets. Admin-only.
export async function GET(req: Request) {
  const admin = await getApiAdmin();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const status = new URL(req.url).searchParams.get("status") ?? "pending";
  const db = createAdminClient();

  let q = db.from("insurers").select("*").order("created_at", { ascending: false });
  if (status === "pending" || status === "approved" || status === "rejected") q = q.eq("status", status);
  const { data: insurers } = await q;

  const { count: pendingCount } = await db
    .from("insurers")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");

  return NextResponse.json({ insurers: insurers ?? [], pendingCount: pendingCount ?? 0 });
}

// PATCH /api/admin/insurers — approve / reject a suggested insurer. Approving makes
// it an official, filterable option for everyone. Admin-only.
export async function PATCH(req: Request) {
  const admin = await getApiAdmin();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { id, status } = await req.json();
  if (!id || !["approved", "rejected", "pending"].includes(status)) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }
  const db = createAdminClient();
  const { error } = await db
    .from("insurers")
    .update({ status, approved: status === "approved", reviewed_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

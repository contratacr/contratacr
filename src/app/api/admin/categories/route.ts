import { NextResponse } from "next/server";
import { getApiAdmin } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";

// GET /api/admin/categories?status=pending|approved|all — category suggestion
// tickets. Admin-only.
export async function GET(req: Request) {
  const admin = await getApiAdmin();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const status = new URL(req.url).searchParams.get("status") ?? "pending";
  const db = createAdminClient();

  let q = db.from("category_suggestions").select("*").order("created_at", { ascending: false });
  if (status === "pending" || status === "approved" || status === "rejected") q = q.eq("status", status);
  const { data } = await q;

  const { count: pendingCount } = await db
    .from("category_suggestions")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");

  return NextResponse.json({ categories: data ?? [], pendingCount: pendingCount ?? 0 });
}

// PATCH /api/admin/categories — review a suggested category. Admin-only.
//   { id, status, label? }
// • status "approved" → it becomes a REAL, selectable/searchable category: the row
//   is flagged approved (the app's runtime overlay reads approved rows) AND mirrored
//   into the official `categories` table. `label` (optional) lets the admin clean up
//   the wording (e.g. "plomeria" → "Plomería") before approving.
// • status "rejected" → discarded (leaves the pending list, not added to the catalog).
// • status "pending"  → reopen.
export async function PATCH(req: Request) {
  const admin = await getApiAdmin();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { id, status, label } = await req.json();
  if (!id || !["approved", "rejected", "pending"].includes(status)) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }
  const db = createAdminClient();

  const update: Record<string, unknown> = {
    status,
    approved: status === "approved",
    reviewed_at: new Date().toISOString(),
  };
  // Admin-edited display text (applies on approve, and as a general normalization).
  const cleanLabel = typeof label === "string" ? label.trim() : "";
  if (cleanLabel) {
    update.label = cleanLabel;
    update.suggested_name = cleanLabel;
  }

  const { error } = await db.from("category_suggestions").update(update).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // On approval, mirror into the official `categories` table so the new category is
  // a first-class citizen in the DB too (es_salud defaults to false). The runtime
  // overlay (lib/data/categories.ts) is what makes it selectable in the UI, but the
  // DB row keeps the two lists in sync. Best-effort — never fail the approval on it.
  if (status === "approved") {
    const name = cleanLabel || undefined;
    const { data: row } = await db
      .from("category_suggestions")
      .select("label, suggested_name")
      .eq("id", id)
      .single();
    const finalName = name || row?.label || row?.suggested_name || id;
    await db.from("categories").upsert({ id, name: finalName }, { onConflict: "id", ignoreDuplicates: false });
  }

  return NextResponse.json({ ok: true });
}

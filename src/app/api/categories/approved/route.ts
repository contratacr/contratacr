import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// GET /api/categories/approved — the admin-approved CUSTOM categories (public).
// These are `category_suggestions` rows an admin approved; the app merges them
// into the fixed catalog at runtime (see lib/data/categories.ts) so an approved
// suggestion becomes a real, selectable/searchable category with no code deploy.
export async function GET() {
  const db = createAdminClient();
  const { data } = await db
    .from("category_suggestions")
    .select("id, label, suggested_name")
    .eq("status", "approved")
    .order("label", { ascending: true });

  const categories = (data ?? []).map((c) => ({
    id: c.id,
    label: (c.label || c.suggested_name || "").trim(),
  }));

  return NextResponse.json(
    { categories },
    // Cache briefly at the edge — approvals are rare; pickers can be a touch stale.
    { headers: { "Cache-Control": "public, max-age=60, s-maxage=300" } }
  );
}

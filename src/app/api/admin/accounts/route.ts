import { NextResponse } from "next/server";
import { getApiAdmin } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";

// GET /api/admin/accounts — soft-disabled accounts + their reasons (item 17).
export async function GET() {
  const admin = await getApiAdmin();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const db = createAdminClient();
  const { data } = await db
    .from("profiles")
    .select("id, full_name, email, role, disabled_reason, disabled_at")
    .eq("is_disabled", true)
    .order("disabled_at", { ascending: false });

  return NextResponse.json({ accounts: data ?? [] });
}

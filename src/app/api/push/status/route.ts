import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("user_push_tokens")
      .select("id, platform, is_active, last_seen_at, created_at")
      .eq("user_id", user.id)
      .order("last_seen_at", { ascending: false });

    if (error) {
      return NextResponse.json({
        ok: false,
        error: /user_push_tokens/i.test(error.message) ? "push_tokens_table_missing_or_unavailable" : "push_status_failed",
        message: error.message,
      }, { status: 503 });
    }

    const tokens = data ?? [];
    return NextResponse.json({
      ok: true,
      total: tokens.length,
      active: tokens.filter((token) => token.is_active).length,
      tokens,
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: "push_status_failed",
      message: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}

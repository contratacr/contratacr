import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Current disabled state (best-effort; column from migration 034).
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ disabled: false });
  try {
    const { data } = await createAdminClient().from("profiles").select("is_disabled").eq("id", user.id).maybeSingle();
    return NextResponse.json({ disabled: !!(data as { is_disabled?: boolean })?.is_disabled });
  } catch {
    return NextResponse.json({ disabled: false });
  }
}

// A disabled account stays hidden until the next successful login automatically
// reactivates it. The reason remains available to admins.
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const action = body.action === "reactivate" ? "reactivate" : "disable";
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";

  if (action === "disable" && !reason) {
    return NextResponse.json({ error: "Cuéntanos el motivo para cerrar tu cuenta." }, { status: 400 });
  }

  const admin = createAdminClient();
  if (action === "reactivate") {
    const { data: deletion } = await admin
      .from("account_deletion_requests")
      .select("id")
      .eq("user_id", user.id)
      .in("status", ["pending", "processing", "failed"])
      .maybeSingle();
    if (deletion) {
      return NextResponse.json({ error: "La eliminación permanente de esta cuenta ya fue iniciada." }, { status: 409 });
    }
  }
  const update = action === "disable"
    ? { is_disabled: true, disabled_reason: reason, disabled_at: new Date().toISOString() }
    : { is_disabled: false, disabled_reason: null, disabled_at: null };

  const { error } = await admin.from("profiles").update(update).eq("id", user.id);
  if (error && /is_disabled|disabled_reason|disabled_at|column|schema cache|PGRST204/i.test(error.message)) {
    return NextResponse.json({ error: "Función no disponible todavía. Intenta más tarde." }, { status: 503 });
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, disabled: action === "disable" });
}

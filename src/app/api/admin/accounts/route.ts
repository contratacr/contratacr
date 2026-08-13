import { NextResponse } from "next/server";
import { getApiAdmin } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { processAccountDeletion } from "@/lib/account-deletion/process";

export async function GET() {
  const admin = await getApiAdmin();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const db = createAdminClient();
  const [{ data: profiles }, { data: deletions }] = await Promise.all([
    db.from("profiles")
      .select("id, full_name, email, role, disabled_reason, disabled_at")
      .eq("is_disabled", true)
      .order("disabled_at", { ascending: false }),
    db.from("account_deletion_requests")
      .select("id,user_id,status,attempts,requested_at,updated_at,last_error")
      .in("status", ["pending", "processing", "failed"])
      .order("requested_at", { ascending: false }),
  ]);
  const deletionByUser = new Map((deletions ?? []).map((item) => [item.user_id, item]));
  const accounts = (profiles ?? []).map((profile) => ({ ...profile, deletion: deletionByUser.get(profile.id) ?? null }));
  return NextResponse.json({ accounts });
}

export async function POST(req: Request) {
  const admin = await getApiAdmin();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const requestId = typeof body.requestId === "string" ? body.requestId : "";
  if (!requestId) return NextResponse.json({ error: "Solicitud requerida" }, { status: 400 });
  try {
    await processAccountDeletion(requestId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo reintentar" }, { status: 500 });
  }
}

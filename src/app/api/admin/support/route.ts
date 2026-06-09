import { NextResponse } from "next/server";
import { getApiAdmin } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";

// GET /api/admin/support?status=open|closed — support tickets. Admin-only.
export async function GET(req: Request) {
  const admin = await getApiAdmin();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const status = new URL(req.url).searchParams.get("status") ?? "open";
  const db = createAdminClient();

  let q = db.from("support_tickets").select("*").order("created_at", { ascending: false });
  if (status === "open" || status === "closed") q = q.eq("status", status);
  const { data } = await q;

  const { count: openCount } = await db
    .from("support_tickets")
    .select("id", { count: "exact", head: true })
    .eq("status", "open");

  return NextResponse.json({ tickets: data ?? [], openCount: openCount ?? 0 });
}

// PATCH /api/admin/support — mark a ticket open/closed. Admin-only.
export async function PATCH(req: Request) {
  const admin = await getApiAdmin();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { id, status } = await req.json();
  if (!id || !["open", "closed"].includes(status)) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }
  const db = createAdminClient();
  const { error } = await db
    .from("support_tickets")
    .update({ status, reviewed_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

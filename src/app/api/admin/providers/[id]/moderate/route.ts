import { NextResponse } from "next/server";
import { getApiAdmin } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";

// POST /api/admin/providers/[id]/moderate — moderation actions. Admin-only.
//  action: "ban" | "unban" | "remove_photo"
//   - ban/unban: revoke/restore the professional from search (is_banned).
//   - remove_photo: drop one fake/inappropriate caso de éxito (portfolio_urls).
// Every action is recorded in provider_verification_log (audit trail).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getApiAdmin();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { id } = await params;
  const { action, reason, url } = await req.json();
  const db = createAdminClient();

  const { data: pro } = await db
    .from("professionals")
    .select("id, is_banned, portfolio_urls")
    .eq("id", id)
    .maybeSingle();
  if (!pro) return NextResponse.json({ error: "Proveedor no encontrado." }, { status: 404 });

  const now = new Date().toISOString();

  async function log(actionName: string, detail: string) {
    await db.from("provider_verification_log").insert({
      professional_id: id,
      admin_id: admin!.id,
      admin_name: admin!.fullName,
      action: actionName,
      reason: detail,
    });
  }

  if (action === "ban") {
    await db.from("professionals").update({ is_banned: true, banned_reason: reason ?? null, banned_at: now }).eq("id", id);
    await log("banned", reason ?? "Sin motivo");
    return NextResponse.json({ ok: true });
  }

  if (action === "unban") {
    await db.from("professionals").update({ is_banned: false, banned_reason: null, banned_at: null }).eq("id", id);
    await log("unbanned", reason ?? "");
    return NextResponse.json({ ok: true });
  }

  if (action === "remove_photo") {
    if (!url) return NextResponse.json({ error: "Falta la foto." }, { status: 400 });
    const next = (pro.portfolio_urls as string[] ?? []).filter((u) => u !== url);
    await db.from("professionals").update({ portfolio_urls: next }).eq("id", id);
    await log("photo_removed", `Caso de éxito eliminado por moderación.${reason ? ` Motivo: ${reason}` : ""}`);
    return NextResponse.json({ ok: true, portfolio_urls: next });
  }

  return NextResponse.json({ error: "Acción inválida." }, { status: 400 });
}

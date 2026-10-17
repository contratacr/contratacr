import { NextResponse } from "next/server";
import { getApiAdmin } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { enforceRateLimit } from "@/lib/rate-limit";
import { verifyPendingIdentity } from "@/lib/verification/admin-review";
import { auditUserAction } from "@/lib/audit/user-action";
const headers = { "Cache-Control": "no-store" };
export async function POST(req: Request) {
  const admin = await getApiAdmin();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 403, headers });
  const limited = enforceRateLimit(req, "admin-identity-verify", 20, 60_000);
  if (limited) { limited.headers.set("Cache-Control", "no-store"); return limited; }
  const body = await req.json().catch(() => null);
  if (typeof body?.accountId !== "string" || !/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(body.accountId) || typeof body?.cedula !== "string" || !/^\d{9,12}$/.test(body.cedula))
    return NextResponse.json({ error: "Cuenta o identificación inválida." }, { status: 400, headers });
  try {
    const db = createAdminClient();
    const result = await verifyPendingIdentity(db, body.accountId, body.cedula);
    if (result.outcome === "verified") await auditUserAction(db, req, { actorUserId: admin.id, actorRole: "admin", action: "admin.verify_identity_hacienda", entityTable: "profiles", entityId: body.accountId, entityOwnerUserId: body.accountId, afterData: { identity_status: "verified", source: "hacienda_api" } });
    return NextResponse.json(result, { headers });
  } catch { return NextResponse.json({ error: "No se pudo completar la verificación. Recarga antes de reintentar." }, { status: 503, headers }); }
}

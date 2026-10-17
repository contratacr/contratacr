import { NextResponse } from "next/server";
import { getApiAdmin } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { enforceRateLimit } from "@/lib/rate-limit";
import { pendingIdentities, inspectPendingIdentity } from "@/lib/verification/admin-review";
const headers = { "Cache-Control": "no-store" };
export async function GET() {
  if (!await getApiAdmin()) return NextResponse.json({ error: "No autorizado" }, { status: 403, headers });
  try { return NextResponse.json({ rows: await pendingIdentities(createAdminClient()) }, { headers }); }
  catch { return NextResponse.json({ error: "No se pudo cargar la revisión. Intenta nuevamente." }, { status: 503, headers }); }
}
export async function POST(req: Request) {
  if (!await getApiAdmin()) return NextResponse.json({ error: "No autorizado" }, { status: 403, headers });
  const limited = enforceRateLimit(req, "admin-identity-review", 12, 60_000);
  if (limited) { limited.headers.set("Cache-Control", "no-store"); return limited; }
  const body = await req.json().catch(() => null);
  if (!Array.isArray(body?.ids) || !body.ids.length || body.ids.length > 3 || body.ids.some((id: unknown) => typeof id !== "string" || !/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(id)))
    return NextResponse.json({ error: "Selecciona entre 1 y 3 cuentas pendientes." }, { status: 400, headers });
  try {
    const pending = await pendingIdentities(createAdminClient());
    const rows = pending.filter(row => body.ids.includes(row.accountId));
    const reviews = [];
    for (const row of rows) {
      if (reviews.length) await new Promise(resolve => setTimeout(resolve, 350));
      reviews.push(await inspectPendingIdentity(row));
    }
    return NextResponse.json({ reviews }, { headers });
  } catch { return NextResponse.json({ error: "No se pudo consultar la revisión. Intenta nuevamente." }, { status: 503, headers }); }
}

import { NextRequest, NextResponse } from "next/server";
import { getApiAdmin } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";
export async function GET(req: NextRequest) {
  const headers = { "Cache-Control": "private, no-store" };
  if (!await getApiAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403, headers });
  const p = req.nextUrl.searchParams;
  const days = Number(p.get("days") || 7), runtime = p.get("runtime") || "", actor = p.get("actor") || "";
  const before = p.get("before") || new Date().toISOString(), key = p.get("key") || "~";
  if (![1,7,30,90].includes(days) || !["","web","web_desktop","web_mobile","android","ios","native_unknown"].includes(runtime)
    || (actor && !/^(?:[a-f0-9]{64}|[a-f0-9-]{36})$/i.test(actor)) || !Number.isFinite(Date.parse(before)) || !/^[a-zA-Z0-9:_~-]{1,200}$/.test(key)) return NextResponse.json({ error: "Invalid filters" }, { status: 400, headers });
  const { data, error } = await createAdminClient().rpc("admin_activity_journey", { p_days: days, p_runtime: runtime, p_actor: actor, p_before: before, p_key: key });
  if (error) return NextResponse.json({ error: "No se pudo cargar la actividad" }, { status: 503, headers });
  const rows = Array.isArray(data) ? data : [];
  const delivery = !p.has("before") ? await createAdminClient().rpc("admin_meta_delivery", { p_days: days }) : null;
  return NextResponse.json({ events: rows.slice(0,50), more: rows.length > 50, ...(delivery ? { delivery: delivery.error ? null : delivery.data } : {}) }, { headers });
}

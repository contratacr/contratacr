import { metaTestEventCode } from "@/lib/analytics/meta-delivery";
import { NextResponse } from "next/server";
import { getApiAdmin } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { summarizeGrowth, type GrowthRow } from "@/lib/analytics/growth-report";
export async function GET() {
  if (!await getApiAdmin()) return NextResponse.json({ error: "unauthorized" },{ status: 401 });
  const db = createAdminClient();
  const month = new Date(Date.now()-6*3600000).toISOString().slice(0,7);
  const from = `${month}-01T06:00:00Z`;
  const rows: GrowthRow[] = [];
  for (let offset=0;;offset+=1000) {
    const { data,error } = await db.from("growth_conversion_events").select("action,actor_hash,attribution,status,delivery_mode").eq("is_baseline",false).gte("created_at",from).lte("created_at",new Date().toISOString()).order("event_id").range(offset,offset+999);
    if (error) return NextResponse.json({ error: "La medición requiere la migración 237. No se confirma recepción en Meta." },{ status: 503 });
    rows.push(...data); if (data.length<1000) break;
  }
  let spent = 0;
  for (let offset=0;;offset+=1000) {
    const { data,error } = await db.from("admin_cost_entries").select("amount,currency").eq("service_id","meta-ads").gte("spent_on",`${month}-01`).lte("spent_on",new Date(Date.now()-6*3600000).toISOString().slice(0,10)).order("id").range(offset,offset+999);
    if (error) return NextResponse.json({ error: "No se pudo comprobar el gasto registrado." },{ status: 503 });
    if (data.some(row => row.currency!=="USD")) return NextResponse.json({ error: "Hay gasto Meta en colones; concilia la moneda antes de evaluar el límite en dólares." },{ status: 409 });
    spent += data.reduce((sum,row) => sum+Number(row.amount),0);if(data.length<1000)break;
  }
  return NextResponse.json({ ...summarizeGrowth(rows,spent,month),month,
    capiConfigured: process.env.META_CAPI_ENABLED==="true" && Boolean(process.env.META_CAPI_ACCESS_TOKEN && process.env.META_GRAPH_API_VERSION && process.env.NEXT_PUBLIC_META_PIXEL_ID),
    testMode: Boolean(metaTestEventCode(process.env.META_CAPI_TEST_EVENT_CODE)),
  },{ headers: { "Cache-Control": "no-store" } });
}

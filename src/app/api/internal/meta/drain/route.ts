import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAuthorizedPushWorkerRequest } from "@/lib/push/worker-auth";
import { sendMetaConversion, metaTestEventCode } from "@/lib/analytics/meta-delivery";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(req: Request) {
  if (!isAuthorizedPushWorkerRequest(req,process.env.CRON_SECRET)) return NextResponse.json({ error: "unauthorized" },{ status: 401 });
  const db = createAdminClient();
  const { error: cleanupError } = await db.rpc("expire_growth_conversion_payloads");
  if (cleanupError) return NextResponse.json({ error: "queue_unavailable" },{ status: 503 });
  const pixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID ?? "";
  const token = process.env.META_CAPI_ACCESS_TOKEN ?? "";
  const version = process.env.META_GRAPH_API_VERSION ?? "";
  if (process.env.META_CAPI_ENABLED !== "true" || !/^\d+$/.test(pixelId) || !token || !/^v\d+\.\d+$/.test(version)) return NextResponse.json({ ok: true, configured: false, sent: 0 });
  const { data, error } = await db.rpc("claim_growth_conversions", { batch_size: 5 });
  if (error) return NextResponse.json({ error: "queue_unavailable" },{ status: 503 });
  const testCode = metaTestEventCode(process.env.META_CAPI_TEST_EVENT_CODE);
  let sent = 0;
  for (const row of data ?? []) {
    const outcome = await sendMetaConversion(row.payload,{ pixelId,token,version,testCode });
    const delivered = outcome === "sent";
    const { error: updateError } = await db.from("growth_conversion_events").update(delivered
      ? { status: "sent",delivery_mode: testCode ? "test" : "production",sent_at: new Date().toISOString(),locked_at: null }
      : { status: "pending",next_attempt_at: new Date(Date.now()+Math.min(3600000,60000*2**Math.min(row.attempts,6))).toISOString(),locked_at: null })
      .eq("event_id",row.event_id).eq("status","sending").eq("attempts",row.attempts);
    if (updateError) return NextResponse.json({ error: "receipt_update_failed" },{ status: 503 });
    if (delivered) sent++;
  }
  return NextResponse.json({ ok: true,configured: true,sent,attempted: data?.length ?? 0 });
}

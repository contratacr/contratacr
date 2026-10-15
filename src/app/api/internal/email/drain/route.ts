import { NextResponse } from "next/server";
import { isAuthorizedPushWorkerRequest } from "@/lib/push/worker-auth";
import { drainEmailDeliveries } from "@/lib/email/outbox";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export async function POST(request: Request) {
  if (!process.env.CRON_SECRET && !process.env.PUSH_WORKER_SECRET) return NextResponse.json({ ok: false, error: "cron_not_configured" }, { status: 503 });
  if (!isAuthorizedPushWorkerRequest(request)) return NextResponse.json({ ok: false }, { status: 401 });
  try { return NextResponse.json({ ok: true, ...await drainEmailDeliveries(10) }); }
  catch { return NextResponse.json({ ok: false, error: "email_queue_unavailable" }, { status: 503 }); }
}

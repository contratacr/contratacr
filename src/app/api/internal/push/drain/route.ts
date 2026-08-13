import { NextResponse } from "next/server";
import { drainPushOutbox, normalizePushDrainLimit, PushWorkerError } from "@/lib/push/worker";
import { isAuthorizedPushWorkerRequest } from "@/lib/push/worker-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  if (!process.env.PUSH_WORKER_SECRET) {
    return NextResponse.json({ ok: false, error: "push_worker_not_configured" }, { status: 503 });
  }
  if (!isAuthorizedPushWorkerRequest(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({})) as { limit?: unknown };
  try {
    const summary = await drainPushOutbox({ limit: normalizePushDrainLimit(body.limit) });
    return NextResponse.json({ ok: true, ...summary });
  } catch (error) {
    const code = error instanceof PushWorkerError ? error.code : "push_worker_failed";
    // Only a bounded internal code is logged. Notification bodies, raw provider
    // errors and registration tokens must never enter application logs.
    console.error("[push-worker] drain failed", { code });
    return NextResponse.json({ ok: false, error: code }, { status: 500 });
  }
}

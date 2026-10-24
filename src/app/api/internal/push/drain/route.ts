import { verifyFirebasePushCredentials } from "@/lib/push/firebase-admin";
import { NextResponse } from "next/server";
import { drainPushOutbox, normalizePushDrainLimit, PushWorkerError } from "@/lib/push/worker";
import { isAuthorizedPushWorkerRequest } from "@/lib/push/worker-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handleDrain(request: Request, limit: unknown, checkOnly = false) {
  if (!process.env.PUSH_WORKER_SECRET && !process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false, error: "push_worker_not_configured" }, { status: 503 });
  }
  if (!isAuthorizedPushWorkerRequest(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  try {
    if (checkOnly) {
      await verifyFirebasePushCredentials();
      return NextResponse.json({ ok: true, credentialReady: true, sent: 0 });
    }
    const summary = await drainPushOutbox({ limit: normalizePushDrainLimit(limit) });
    return NextResponse.json({ ok: true, ...summary });
  } catch (error) {
    const code = error instanceof PushWorkerError ? error.code : "push_worker_failed";
    // Only a bounded internal code is logged. Notification bodies, raw provider
    // errors and registration tokens must never enter application logs.
    console.error("[push-worker] drain failed", { code });
    return NextResponse.json({ ok: false, error: code }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return handleDrain(request, 25);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { limit?: unknown; checkOnly?: unknown };
  return handleDrain(request, body.limit, body.checkOnly === true);
}

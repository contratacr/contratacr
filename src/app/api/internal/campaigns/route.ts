import { outreachPendingProfessionals } from "@/lib/verification-notify";
import { drainEmailDeliveries } from "@/lib/email/outbox";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAuthorizedPushWorkerRequest } from "@/lib/push/worker-auth";
import { runLifecycleEmails } from "@/lib/email/lifecycle-worker";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export async function POST(request: Request) {
  if (!process.env.CRON_SECRET && !process.env.PUSH_WORKER_SECRET)
    return NextResponse.json({ok:false,error:"cron_not_configured"},{status:503});
  if (!isAuthorizedPushWorkerRequest(request)) return NextResponse.json({ok:false},{status:401});
  try {
    const simulate = new URL(request.url).searchParams.get("simular") === "1";
    const verification = await outreachPendingProfessionals({ simulate });
    const campaigns = await runLifecycleEmails(createAdminClient(), simulate);
    const queue = simulate ? null : await drainEmailDeliveries();
    return NextResponse.json({ ok: true, ...campaigns, verification, queue });
  } catch {
    return NextResponse.json({ok:false,error:"campaign_verification_failed"},{status:503});
  }
}

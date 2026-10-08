import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enviarResumenSemanal } from "@/lib/notifications/resumen-semanal";
import { isAuthorizedPushWorkerRequest } from "@/lib/push/worker-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Lo llama un trabajo de los lunes (resumen-semanal.yml). Sin secreto
// configurado no hace nada: falla cerrado, igual que el resto de lo interno.
async function manejar(request: Request) {
  if (!process.env.CRON_SECRET && !process.env.PUSH_WORKER_SECRET) {
    return NextResponse.json({ ok: false, error: "cron_not_configured" }, { status: 503 });
  }
  if (!isAuthorizedPushWorkerRequest(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  try {
    const simular = new URL(request.url).searchParams.get("simular") === "1";
    // La respuesta solo trae contadores, nunca quiénes.
    return NextResponse.json({ ok: true, ...(await enviarResumenSemanal(createAdminClient(), { simular })) });
  } catch (err) {
    console.error("[resumen-semanal]", err);
    return NextResponse.json({ ok: false, error: "weekly_summary_failed" }, { status: 500 });
  }
}

export async function POST(request: Request) { return manejar(request); }

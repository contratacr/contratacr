import { NextResponse } from "next/server";
import { cerrarCasosSinRespuesta, DIAS_DE_SILENCIO } from "@/lib/support/cierre-por-silencio";
import { isAuthorizedPushWorkerRequest } from "@/lib/push/worker-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Lo llama un trabajo diario (cierre-soporte.yml). Sin secreto configurado no
// hace nada: falla cerrado, como el vaciado de la cola de push.
async function manejar(request: Request) {
  if (!process.env.CRON_SECRET && !process.env.PUSH_WORKER_SECRET) {
    return NextResponse.json({ ok: false, error: "cron_not_configured" }, { status: 503 });
  }
  if (!isAuthorizedPushWorkerRequest(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  try {
    const resumen = await cerrarCasosSinRespuesta();
    return NextResponse.json({ ok: true, dias: DIAS_DE_SILENCIO, ...resumen });
  } catch {
    return NextResponse.json({ ok: false, error: "support_autoclose_failed" }, { status: 500 });
  }
}

export async function POST(request: Request) { return manejar(request); }
export async function GET(request: Request) { return manejar(request); }

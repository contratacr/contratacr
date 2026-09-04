import { NextResponse } from "next/server";
import { isAuthorizedPushWorkerRequest } from "@/lib/push/worker-auth";
import { enviarRecordatoriosDeInactividad } from "@/lib/recordatorios/inactividad";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Endpoint interno: lo llama la tarea programada, nunca la app. Misma llave y
// mismo guardián que el drenaje de push, así no hay un segundo secreto que
// mantener.
async function correr(request: Request, ensayo: boolean) {
  if (!process.env.PUSH_WORKER_SECRET && !process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false, error: "reminder_worker_not_configured" }, { status: 503 });
  }
  if (!isAuthorizedPushWorkerRequest(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  try {
    const resumen = await enviarRecordatoriosDeInactividad({ ensayo });
    return NextResponse.json({ ok: true, ...resumen });
  } catch (error) {
    // Solo un código acotado entra al registro: jamás el contenido de un aviso.
    console.error("[recordatorios] la corrida falló", { message: error instanceof Error ? error.message : "unknown" });
    return NextResponse.json({ ok: false, error: "reminder_run_failed" }, { status: 500 });
  }
}

/** `?ensayo=1` cuenta lo que saldría sin avisarle a nadie. */
function esEnsayo(request: Request) {
  const valor = new URL(request.url).searchParams.get("ensayo");
  return valor === "1" || valor === "true";
}

export async function GET(request: Request) {
  return correr(request, esEnsayo(request));
}

export async function POST(request: Request) {
  return correr(request, esEnsayo(request));
}

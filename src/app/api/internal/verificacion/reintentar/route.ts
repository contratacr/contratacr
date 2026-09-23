import { NextResponse } from "next/server";
import { repescarVerificacionesSinRespuesta } from "@/lib/verification/repesca";
import { isAuthorizedPushWorkerRequest } from "@/lib/push/worker-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Lo llama un trabajo diario (verificacion-repesca.yml). Sin secreto
// configurado no hace nada: falla cerrado, igual que el resto de lo interno.
async function manejar(request: Request) {
  if (!process.env.CRON_SECRET && !process.env.PUSH_WORKER_SECRET) {
    return NextResponse.json({ ok: false, error: "cron_not_configured" }, { status: 503 });
  }
  if (!isAuthorizedPushWorkerRequest(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  try {
    const parametros = new URL(request.url).searchParams;
    // `?padron=1` mide el padrón mismo: cuántas filas cargaron y si la consulta
    // responde. Un padrón cargado a medias devuelve «no encontrado» para
    // cédulas perfectamente válidas, que es indistinguible de un rechazo real.
    if (parametros.get("padron") === "1") {
      const { medirPadron } = await import("@/lib/verification/medir-padron");
      return NextResponse.json({ ok: true, ...(await medirPadron()) });
    }
    // `?simular=1` pregunta al padrón y devuelve el conteo SIN escribir nada.
    const simular = parametros.get("simular") === "1";
    const resumen = await repescarVerificacionesSinRespuesta({ simular });
    return NextResponse.json({ ok: true, ...resumen });
  } catch {
    return NextResponse.json({ ok: false, error: "verification_retry_failed" }, { status: 500 });
  }
}

export async function POST(request: Request) { return manejar(request); }
export async function GET(request: Request) { return manejar(request); }

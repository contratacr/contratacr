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
    // Legacy query alias retained, but runtime health no longer touches the padrón.
    if (parametros.get("fuente") === "1" || parametros.get("padron") === "1") {
      const { getIdentityVerifier } = await import("@/lib/verification/identity-verifier");
      const result = await getIdentityVerifier().lookup("2100042005", { fresh: true });
      return NextResponse.json({ ok: !result.unavailable, provider: "hacienda_api", available: !!result.found });
    }
    // Simulation performs lookups only; it never changes accounts.
    const simular = parametros.get("simular") === "1";
    const resumen = await repescarVerificacionesSinRespuesta({ simular });
    return NextResponse.json({ ok: true, ...resumen });
  } catch {
    return NextResponse.json({ ok: false, error: "verification_retry_failed" }, { status: 500 });
  }
}

export async function POST(request: Request) { return manejar(request); }
export async function GET(request: Request) { return manejar(request); }

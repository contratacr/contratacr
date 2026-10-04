import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { invitarTrasExperiencia } from "@/lib/notifications/invitar-tras-experiencia";
import { invitarAPublicarATodas } from "@/lib/notifications/invitacion-a-publicar";
import { isAuthorizedPushWorkerRequest } from "@/lib/push/worker-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Lo llama un trabajo diario (resena-google.yml). Sin secreto configurado no
// hace nada: falla cerrado, igual que el resto de lo interno.
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
    const admin = createAdminClient();
    // De paso, «¿Necesitas a alguien?» a las cuentas que aún no lo tienen
    // (la primera vez llega a todas; después, solo a alguna que se escapó).
    const proyecto = await invitarAPublicarATodas(admin, { simular });
    return NextResponse.json({ ok: true, ...(await invitarTrasExperiencia(admin, { simular })), proyecto });
  } catch {
    return NextResponse.json({ ok: false, error: "review_invite_failed" }, { status: 500 });
  }
}

export async function POST(request: Request) { return manejar(request); }
export async function GET(request: Request) { return manejar(request); }

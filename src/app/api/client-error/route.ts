import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enforceRateLimit } from "@/lib/rate-limit";

/**
 * Registro de errores del cliente. Sin esto, un "Algo salió mal" en el teléfono
 * de alguien se queda en la consola de ese teléfono y no hay forma de
 * arreglarlo. Guarda lo mínimo para diagnosticar: mensaje, pila, ruta y si fue
 * en la app. No guarda nada que el usuario haya escrito.
 */
export async function POST(req: NextRequest) {
  const rl = enforceRateLimit(req, "client-error", 20, 60_000);
  if (rl) return rl;

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const message = String(body.message ?? "").slice(0, 500);
  if (!message) return NextResponse.json({ ok: true });

  let userId: string | null = null;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    userId = user?.id ?? null;
  } catch { /* sin sesión: el error se guarda igual */ }

  try {
    const admin = createAdminClient();
    await admin.from("client_errors").insert({
      user_id: userId,
      pathname: String(body.pathname ?? "").slice(0, 200) || null,
      message,
      stack: String(body.stack ?? "").slice(0, 4000) || null,
      origen: ["boundary", "window", "rejection"].includes(String(body.origen)) ? String(body.origen) : "window",
      user_agent: (req.headers.get("user-agent") ?? "").slice(0, 300) || null,
      native: body.native === true,
      app_environment: process.env.NEXT_PUBLIC_APP_ENVIRONMENT ?? null,
    });
  } catch (err) {
    // Si la tabla todavía no existe (migración sin aplicar) no se rompe nada.
    console.error("[client-error] no se pudo guardar:", err);
  }
  return NextResponse.json({ ok: true });
}

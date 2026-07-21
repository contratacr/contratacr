import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendUserPush } from "@/lib/push/send";

async function sendTestPush() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const result = await sendUserPush({
      userId: user.id,
      title: "ContrataCR",
      body: "Notificacion de prueba recibida correctamente.",
      url: "/es/notificaciones",
    });

    if (result.sent === 0 && result.failed === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "no_active_push_tokens",
          message: "No hay tokens activos para este usuario. Abre el APK, inicia sesion y toca Activar notificaciones.",
          ...result,
        },
        { status: 409 },
      );
    }

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const missingFirebase = /Missing Firebase Admin credentials/i.test(message);
    const missingTable = /push_tokens_table_missing_or_unavailable|user_push_tokens/i.test(message);

    return NextResponse.json(
      {
        ok: false,
        error: missingFirebase
          ? "missing_firebase_credentials"
          : missingTable
            ? "push_tokens_table_missing_or_unavailable"
            : "push_test_failed",
        message,
      },
      { status: missingFirebase || missingTable ? 503 : 500 },
    );
  }
}

export async function GET() {
  return sendTestPush();
}

export async function POST() {
  return sendTestPush();
}
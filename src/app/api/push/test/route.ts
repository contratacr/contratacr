import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendUserPush } from "@/lib/push/send";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const result = await sendUserPush({
    userId: user.id,
    title: "ContrataCR",
    body: "Notificación de prueba recibida correctamente.",
    url: "/es/notificaciones",
  });

  return NextResponse.json({ ok: true, ...result });
}

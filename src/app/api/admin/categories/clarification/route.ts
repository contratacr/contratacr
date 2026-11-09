import { NextResponse } from "next/server";
import { getApiAdmin } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  const admin = await getApiAdmin();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const body = await req.json().catch(() => null);
  const question = typeof body?.question === "string" ? body.question.trim() : "";
  if (typeof body?.id !== "string" || question.length < 3 || question.length > 2000 || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body?.requestKey ?? "")) {
    return NextResponse.json({ error: "Escribí una pregunta de 3 a 2000 caracteres." }, { status: 400 });
  }
  const { data, error } = await createAdminClient().rpc("request_service_clarification", {
    p_suggestion_id: body.id, p_admin_id: admin.id, p_question: question, p_request_key: body.requestKey,
  });
  if (error) return NextResponse.json({ error: "No se pudo solicitar la aclaración. Comprobá que siga pendiente y tenga una cuenta vinculada." }, { status: 409 });
  return NextResponse.json({ ok: true, sent: data });
}

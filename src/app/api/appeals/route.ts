import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyAppealReceived } from "@/lib/verification-notify";

// POST /api/appeals  { message }
// A rejected provider appeals the decision (in-app, trackable path). Moves the
// case to "under_appeal" and surfaces it in the admin queue. The provider must
// be authenticated and own a professional record currently in "rejected".
export async function POST(req: Request) {
  const session = await createServerClient();
  const {
    data: { user },
  } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (message.length < 10) {
    return NextResponse.json(
      { error: "Contanos por qué deberíamos revisar de nuevo (mínimo 10 caracteres)." },
      { status: 400 }
    );
  }

  const db = createAdminClient();
  const { data: pro } = await db
    .from("professionals")
    .select("id, verification_status, profiles(full_name)")
    .eq("profile_id", user.id)
    .maybeSingle();

  if (!pro) return NextResponse.json({ error: "No se encontró tu perfil." }, { status: 404 });
  if (pro.verification_status !== "rejected") {
    return NextResponse.json(
      { error: "Solo podés apelar cuando tu verificación fue rechazada." },
      { status: 409 }
    );
  }

  // Record the appeal, move to under_appeal, log it.
  await db.from("provider_appeals").insert({ professional_id: pro.id, message });
  await db
    .from("professionals")
    .update({ verification_status: "under_appeal", verification_updated_at: new Date().toISOString() })
    .eq("id", pro.id);
  await db.from("provider_verification_log").insert({
    professional_id: pro.id,
    admin_id: null,
    admin_name: "Proveedor (apelación)",
    action: "appeal_received",
    from_status: "rejected",
    to_status: "under_appeal",
    reason: message,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const providerName = (pro.profiles as any)?.full_name ?? "Un proveedor";
  await notifyAppealReceived(pro.id, providerName, message);

  return NextResponse.json({ ok: true });
}

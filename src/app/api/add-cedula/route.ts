import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runIdentityVerification } from "@/lib/verification/run-verification";

// POST /api/add-cedula { cedula }
// A no-CR-identification professional (e.g. a Nicaraguan who later receives a
// cédula) adds it from their panel. We store it, clear the no_cr_id flag, and run
// the normal padrón verification automatically (no ticket).
export async function POST(req: Request) {
  const session = await createServerClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const raw = typeof body.cedula === "string" ? body.cedula : "";
  const cedula = raw.replace(/\D/g, "");
  // Format check (cédula 9 / NITE 10 / DIMEX 11-12).
  const validFormat = /^[1-9]\d{8}$/.test(cedula) || /^\d{10}$/.test(cedula) || /^\d{11,12}$/.test(cedula);
  if (!validFormat) {
    return NextResponse.json({ error: "Formato inválido. CR: 9 dígitos · DIMEX: 11-12 · NITE: 10." }, { status: 400 });
  }

  const db = createAdminClient();

  // Reject a cédula already used by another account.
  const { data: dupe } = await db
    .from("profiles")
    .select("id")
    .eq("cedula", cedula)
    .neq("id", user.id)
    .maybeSingle();
  if (dupe) {
    return NextResponse.json({ error: "Esta cédula ya está registrada en ContrataCR." }, { status: 409 });
  }

  const { data: pro } = await db
    .from("professionals")
    .select("id")
    .eq("profile_id", user.id)
    .maybeSingle();
  if (!pro) return NextResponse.json({ error: "No se encontró tu perfil." }, { status: 404 });

  await db.from("profiles").update({ cedula }).eq("id", user.id);
  // Clear the no-CR-ID flag (best-effort if the column exists) so the normal
  // padrón verification path applies.
  await db.from("professionals").update({ no_cr_id: false }).eq("id", pro.id);

  const outcome = await runIdentityVerification(pro.id);
  return NextResponse.json({ ok: true, outcome });
}

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// A professional suggests an aseguradora that isn't in the official list. We create
// a tracked, pending row in `insurers` (a moderation ticket) — NOT a loose message,
// and NOT shown on the profile until an admin approves it.
export async function POST(req: NextRequest) {
  try {
    const { name } = await req.json();
    const clean = typeof name === "string" ? name.trim() : "";
    if (!clean) return NextResponse.json({ error: "Nombre requerido" }, { status: 400 });

    const supabase = await createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();
    // Deterministic id from the suggested name; on conflict keep the existing ticket.
    const id = `sg_${clean.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40)}`;

    const { error } = await admin.from("insurers").upsert(
      {
        id,
        label: clean,
        suggested_name: clean,
        suggested_by: session.user.id,
        approved: false,
        status: "pending",
      },
      { onConflict: "id", ignoreDuplicates: true }
    );
    if (error && !/duplicate|conflict/i.test(error.message)) {
      console.error("[insurers/suggest]", error);
      return NextResponse.json({ error: "No se pudo enviar la sugerencia" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[insurers/suggest] unexpected:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

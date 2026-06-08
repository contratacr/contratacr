import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// A user suggests a category that isn't in the official list. Creates a tracked,
// pending row in `category_suggestions` (an admin moderation ticket) — NOT usable
// or filterable until an admin approves it.
export async function POST(req: NextRequest) {
  try {
    const { name } = await req.json();
    const clean = typeof name === "string" ? name.trim() : "";
    if (!clean) return NextResponse.json({ error: "Nombre requerido" }, { status: 400 });

    // Suggestions are allowed even pre-account (category selection happens during
    // registration before the session exists). Attach the user id when present.
    const supabase = await createClient();
    const { data: { session } } = await supabase.auth.getSession();

    const admin = createAdminClient();
    const id = `sg_${clean.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40)}`;

    const { error } = await admin.from("category_suggestions").upsert(
      { id, label: clean, suggested_name: clean, suggested_by: session?.user?.id ?? null, approved: false, status: "pending" },
      { onConflict: "id", ignoreDuplicates: true }
    );
    if (error && !/duplicate|conflict/i.test(error.message)) {
      console.error("[categories/suggest]", error);
      return NextResponse.json({ error: "No se pudo enviar la sugerencia" }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[categories/suggest] unexpected:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

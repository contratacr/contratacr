import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { slugifyCategory } from "@/lib/data/categories";
import { suggestEnglishServiceLabel, suggestSpanishServiceLabel } from "@/lib/translation/service-labels";

// A user suggests a category that isn't in the official list. Creates a tracked,
// pending row in `category_suggestions` (an admin moderation ticket) — NOT usable
// or filterable until an admin approves it. The row id (reused as the real category
// id on approval) is the CLEAN slug of the canonical Spanish name — e.g. "Amor"
// → "amor", "Amor bueno" → "amor_bueno" — with NO prefix (the old `sg_`
// "suggestion" tag is gone).
export async function POST(req: NextRequest) {
  try {
    const { name, locale } = await req.json();
    const clean = typeof name === "string" ? name.trim() : "";
    if (!clean) return NextResponse.json({ error: "Nombre requerido" }, { status: 400 });
    const sourceLocale = locale === "en" ? "en" : "es";
    const labelEs = sourceLocale === "en" ? await suggestSpanishServiceLabel(clean) : clean;
    const labelEn = sourceLocale === "en" ? clean : await suggestEnglishServiceLabel(clean);

    // Suggestions are allowed even pre-account (category selection happens during
    // registration before the session exists). Attach the user id when present.
    const supabase = await createClient();
    const { data: { session } } = await supabase.auth.getSession();

    const admin = createAdminClient();
    const id = slugifyCategory(labelEs);

    // `ignoreDuplicates` = re-suggesting the SAME name reuses its existing ticket
    // (the slug is the primary key) instead of creating a duplicate or erroring.
    const { error } = await admin.from("category_suggestions").upsert(
      { id, label: labelEs, suggested_name: labelEs, suggested_by: session?.user?.id ?? null, approved: false, status: "pending" },
      { onConflict: "id", ignoreDuplicates: true }
    );
    if (error && !/duplicate|conflict/i.test(error.message)) {
      console.error("[categories/suggest]", error);
      return NextResponse.json({ error: "No se pudo enviar la sugerencia" }, { status: 500 });
    }
    const existingCategory = await admin.from("categories").select("id, is_hidden").eq("id", id).maybeSingle();
    if (!existingCategory.data) {
      await admin.from("categories").upsert(
        { id, name: labelEs, name_en: labelEn, is_hidden: true },
        { onConflict: "id", ignoreDuplicates: true }
      );
    } else if (existingCategory.data.is_hidden) {
      await admin.from("categories").update({ name: labelEs, name_en: labelEn }).eq("id", id);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[categories/suggest] unexpected:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

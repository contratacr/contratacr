import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { slugifyCategory } from "@/lib/data/categories";
import {
  normalizeServiceDisplayName,
  suggestEnglishServiceLabel,
  suggestSpanishServiceLabel,
} from "@/lib/translation/service-labels";

function isValidUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim())
  );
}

// A user suggests a category that isn't in the official list. Creates a tracked,
// pending row in `category_suggestions` (an admin moderation ticket) — NOT usable
// or filterable until an admin approves it. The row id (reused as the real category
// id on approval) is the CLEAN slug of the canonical Spanish name — e.g. "Amor"
// "Amor bueno" —> "amor_bueno" — with NO prefix (the old `sg_` suggestion tag is gone).
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, locale, userId } = body as {
      name?: unknown;
      locale?: unknown;
      userId?: unknown;
    };

    const clean = normalizeServiceDisplayName(typeof name === "string" ? name : "");
    if (!clean) return NextResponse.json({ error: "Nombre requerido" }, { status: 400 });

    const submittedFromEnglish = locale === "en";
    const labelEs = submittedFromEnglish ? await suggestSpanishServiceLabel(clean) : clean;
    const labelEn = submittedFromEnglish ? clean : await suggestEnglishServiceLabel(clean);

    // Suggestions are allowed even pre-account (category selection happens during
    // registration before the session exists). Attach the user id when present.
    const supabase = await createClient();
    const admin = createAdminClient();
    const [{ data: { session } }, { data: { user }, error: userError }] = await Promise.all([
      supabase.auth.getSession(),
      supabase.auth.getUser(),
    ]);

    let resolvedUserId = session?.user?.id || (!userError ? user?.id : null);
    if (!resolvedUserId && isValidUuid(userId)) {
      const normalizedUserId = userId.trim().toLowerCase();
      const { data: profile, error: profileError } = await admin
        .from("profiles")
        .select("id")
        .eq("id", normalizedUserId)
        .maybeSingle();

      if (!profileError && profile?.id) {
        resolvedUserId = profile.id;
      } else if (profileError) {
        console.error("[categories/suggest] fallback profile lookup for userId failed", {
          userId: normalizedUserId,
          error: profileError,
        });
      }
    }

    const id = slugifyCategory(labelEs || clean);
    const authenticatedUserId = resolvedUserId ?? null;
    const suggestionPayload = { id, label: labelEs, suggested_name: labelEs, approved: false, status: "pending" };

    const { data: existingSuggestion } = await admin
      .from("category_suggestions")
      .select("suggested_by, status")
      .eq("id", id)
      .maybeSingle();

    if (!existingSuggestion) {
      // New suggestion: create it immediately.
      const { error } = await admin.from("category_suggestions").upsert(
        { ...suggestionPayload, suggested_by: authenticatedUserId },
        { onConflict: "id", ignoreDuplicates: false }
      );
      if (error) {
        console.error("[categories/suggest] create failed", error);
        return NextResponse.json({ error: "No se pudo enviar la sugerencia" }, { status: 500 });
      }
    } else if (authenticatedUserId && !existingSuggestion.suggested_by && existingSuggestion.status === "pending") {
      // Re-suggested row created by an anonymous flow: capture the logged user so
      // admin notifications can be delivered to the correct account later.
      const { error: updateError } = await admin
        .from("category_suggestions")
        .update({ suggested_by: authenticatedUserId })
        .eq("id", id);
      if (updateError) {
        console.error("[categories/suggest] couldn't bind suggestion to user", updateError);
      }
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

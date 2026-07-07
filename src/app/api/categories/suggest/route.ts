import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { slugifyCategory } from "@/lib/data/categories";
import {
  normalizeServiceDisplayName,
  suggestEnglishServiceLabel,
  suggestSpanishServiceLabel,
} from "@/lib/translation/service-labels";
import { auditUserAction } from "@/lib/audit/user-action";

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
    let auditAction = "category_suggestion.resubmit";

    let existingSuggestion: Record<string, unknown> | null = null;
    let existingError: { message?: string } | null = null;
    {
      const { data, error } = await admin
        .from("category_suggestions")
        .select("id, suggested_by, status, review_reason, label, suggested_name")
        .eq("id", id)
        .maybeSingle();
      existingSuggestion = data as Record<string, unknown> | null;
      existingError = error;
    }

    if (!existingSuggestion && isMissingColumnError(existingError, "status")) {
      const fallback = await admin
        .from("category_suggestions")
        .select("id, suggested_by, approved")
        .eq("id", id)
        .maybeSingle();
      existingSuggestion = (fallback.data as Record<string, unknown> | null) ?? null;
      existingError = fallback.error as { message?: string } | null;
    }

    if (existingError) {
      console.error("[categories/suggest] failed to check existing suggestion", existingError);
    }

    if (!existingSuggestion) {
      auditAction = "category_suggestion.create";
      // New suggestion: create it immediately.
      const { error } = await upsertSuggestion(admin, {
        ...suggestionPayload,
        suggested_by: authenticatedUserId,
      });
      if (error) {
        console.error("[categories/suggest] create failed", error);
        return NextResponse.json({ error: "No se pudo enviar la sugerencia" }, { status: 500 });
      }
    } else if (authenticatedUserId) {
      const wasPending = isPendingSuggestion(existingSuggestion);
      const wasRejected = isRejectedSuggestion(existingSuggestion);
      if (wasPending) {
        // Re-suggested row created by an anonymous flow: capture the logged user so
        // admin notifications can be delivered to the correct account later.
        if (!existingSuggestion.suggested_by) {
          const { error: updateError } = await admin
            .from("category_suggestions")
            .update({ suggested_by: authenticatedUserId })
            .eq("id", id);
          if (updateError) {
            console.error("[categories/suggest] couldn't bind suggestion to user", updateError);
          } else {
            auditAction = "category_suggestion.bind_user";
          }
        }
      } else if (wasRejected) {
        auditAction = "category_suggestion.reopen";
        const reopenReviewReason = (existingSuggestion?.review_reason && String(existingSuggestion.review_reason).trim())
          ? String(existingSuggestion.review_reason)
          : null;
        // If it was rejected before, reopen it so a new review request is created.
        const { error: reopenError } = await admin
          .from("category_suggestions")
          .update({
            status: "pending",
            approved: false,
            suggested_by: authenticatedUserId,
            label: labelEs,
            suggested_name: labelEs,
            review_reason: reopenReviewReason,
            reviewed_at: null,
            created_at: new Date().toISOString(),
          })
          .eq("id", id);
        if (reopenError) {
          console.error("[categories/suggest] couldn't reopen rejected suggestion", reopenError);
          return NextResponse.json({ error: "No se pudo enviar la sugerencia" }, { status: 500 });
        }
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

    await auditUserAction(admin, req, {
      actorUserId: authenticatedUserId,
      actorRole: authenticatedUserId ? "user" : "guest",
      action: auditAction,
      entityTable: "category_suggestions",
      entityId: id,
      entityOwnerUserId: authenticatedUserId,
      afterData: { id, label: labelEs, label_en: labelEn, status: "pending" },
      metadata: { submitted_locale: locale ?? null },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[categories/suggest] unexpected:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

type SuggestionError = { message?: string } | null;

async function upsertSuggestion(
  admin: ReturnType<typeof createAdminClient>,
  row: Record<string, unknown>
) {
  const current = { ...row };
  const { error } = await admin.from("category_suggestions").upsert(
    current,
    { onConflict: "id", ignoreDuplicates: false }
  );
  if (!error || !isMissingColumnError(error, "status")) return { error };

  const fallback = { ...current };
  delete (fallback as { status?: string }).status;
  return admin.from("category_suggestions").upsert(
    fallback,
    { onConflict: "id", ignoreDuplicates: false }
  );
}

function isMissingColumnError(error: SuggestionError, column: string): boolean {
  if (!error?.message) return false;
  return new RegExp(`Could not find the '${column}' column|column \\\"${column}\\\" does not exist|column .*${column}`, "i").test(
    error.message
  );
}

function isPendingSuggestion(suggestion: Record<string, unknown> | null | undefined): boolean {
  if (!suggestion) return false;
  const status = typeof suggestion.status === "string" ? suggestion.status : null;
  if (status) return status === "pending";
  if (typeof suggestion.approved === "boolean") return !suggestion.approved;
  return true;
}

function isRejectedSuggestion(suggestion: Record<string, unknown> | null | undefined): boolean {
  if (!suggestion) return false;
  const status = typeof suggestion.status === "string" ? suggestion.status : null;
  if (status) return status === "rejected";
  return false;
}

import { NextResponse } from "next/server";
import { getApiAdmin } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  ALL_CATEGORIES,
  CATEGORY_GROUP_ICON_KEYS,
  CATEGORY_GROUPS,
  autoEnglishCategoryLabel,
  classifySuggestedCategory,
  getCategoryGroupLabel,
  isHealthCategory,
  searchCategories,
  slugifyCategory,
  supportsVideoConsultCategory,
} from "@/lib/data/categories";
import { normalizeServiceDisplayName, suggestEnglishServiceLabel, suggestSpanishServiceLabel } from "@/lib/translation/service-labels";

type DbCategory = {
  id: string;
  name?: string | null;
  name_en?: string | null;
  group_id?: string | null;
  is_hidden?: boolean | null;
  es_salud?: boolean | null;
  supports_videoconsulta?: boolean | null;
};

type DbCategoryGroup = {
  id: string;
  label: string;
  label_en?: string | null;
  icon_key?: string | null;
  sort_order?: number | null;
  is_hidden?: boolean | null;
};

type SuggestionAuthor = {
  id: string;
  full_name?: string | null;
  email?: string | null;
};

type SuggestionProfessional = {
  profile_id?: string | null;
  business_name?: string | null;
};

// GET /api/admin/categories?status=pending|approved|rejected|catalog
export async function GET(req: Request) {
  const admin = await getApiAdmin();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const status = new URL(req.url).searchParams.get("status") ?? "pending";
  const db = createAdminClient();
  const groups = await getAdminGroups(db);

  if (status === "catalog") {
    let rows: DbCategory[] | null = null;
    const full = await db
      .from("categories")
      .select("id, name, name_en, group_id, is_hidden, es_salud, supports_videoconsulta")
      .order("name", { ascending: true });
    rows = full.data;

    if (full.error && /name_en|group_id|is_hidden|schema cache|PGRST204|could not find/i.test(full.error.message)) {
      const fallback = await db
        .from("categories")
        .select("id, name, es_salud, supports_videoconsulta")
        .order("name", { ascending: true });
      rows = fallback.data;
    }

    const dbMap = new Map((rows ?? []).map((row) => [row.id, row]));
    const fixedIds = new Set(ALL_CATEGORIES.map((category) => category.id));

    const fixed = ALL_CATEGORIES.flatMap((category) => {
      const row = dbMap.get(category.id);
      if (row?.is_hidden) return [];
      const groupId = validGroupId(row?.group_id, groups) || category.groupId;
      return [{
        id: category.id,
        label: row?.name || category.label,
        labelEn: row?.name_en || autoEnglishCategoryLabel(row?.name || category.label),
        groupId,
        groupLabel: groupLabel(groupId, groups),
        source: "base",
        isHidden: !!row?.is_hidden,
        esSalud: row?.es_salud ?? isHealthCategory(category.id),
        supportsVideoconsulta: row?.supports_videoconsulta ?? supportsVideoConsultCategory(category.id),
      }];
    });

    const custom = (rows ?? [])
      .filter((row) => !fixedIds.has(row.id))
      .filter((row) => !row.is_hidden)
      .map((row) => {
        const label = row.name || labelFromId(row.id);
        const groupId = validGroupId(row.group_id, groups) || inferCategoryGroupId(label);
        return {
          id: row.id,
          label,
          labelEn: row.name_en || autoEnglishCategoryLabel(label),
          groupId,
          groupLabel: groupLabel(groupId, groups),
          source: "custom",
          isHidden: !!row.is_hidden,
          esSalud: !!row.es_salud,
          supportsVideoconsulta: !!row.supports_videoconsulta,
        };
      });

    return NextResponse.json({
      catalog: [...fixed, ...custom],
      groups,
    });
  }

  let q = db.from("category_suggestions").select("*").order("created_at", { ascending: false });
  if (status === "pending" || status === "approved" || status === "rejected") q = q.eq("status", status);
  const qResult = await q;
  let data = qResult.data;
  const qError = qResult.error;
  if (qError && isMissingColumnError(qError, "status")) {
    const fallback = await db.from("category_suggestions").select("*").order("created_at", { ascending: false });
    data = fallback.data;
    if (fallback.error) {
      console.error("[admin/categories] failed to fetch suggestions", fallback.error);
      data = [];
    }
  } else if (qError) {
    console.error("[admin/categories] failed to fetch suggestions", qError);
    data = [];
  }

  let suggestionRows = (data ?? []) as Array<Record<string, unknown>>;
  if ((status === "pending" || status === "approved" || status === "rejected") && qError && isMissingColumnError(qError, "status")) {
    suggestionRows = suggestionRows.filter((row) => mapLegacySuggestionStatus(row) === status);
  }

  const ids = suggestionRows.map((row) => row.id).filter(Boolean);
  const suggestedByIds = [...new Set(suggestionRows.map((row) => row.suggested_by).filter(Boolean) as string[])];
  let englishById = new Map<string, string>();
  if (ids.length) {
    const english = await db.from("categories").select("id, name_en").in("id", ids);
    englishById = new Map((english.data ?? [])
      .filter((row) => row.id && row.name_en)
      .map((row) => [row.id, row.name_en as string]));
  }
  let authorById = new Map<string, SuggestionAuthor>();
  let professionalById = new Map<string, SuggestionProfessional>();
  if (suggestedByIds.length) {
    const [authors, professionals] = await Promise.all([
      db.from("profiles").select("id, full_name, email").in("id", suggestedByIds),
      db.from("professionals").select("profile_id, business_name").in("profile_id", suggestedByIds),
    ]);
    authorById = new Map(((authors.data ?? []) as SuggestionAuthor[]).map((row) => [row.id, row]));
    professionalById = new Map(((professionals.data ?? []) as SuggestionProfessional[])
      .filter((row) => row.profile_id)
      .map((row) => [row.profile_id as string, row]));
  }

  const { count: pendingCount } = await db
    .from("category_suggestions")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");
  const legacyPendingCount = qError && isMissingColumnError(qError, "status")
    ? await db
        .from("category_suggestions")
        .select("id", { count: "exact", head: true })
        .eq("approved", false)
    : null;

  return NextResponse.json({
    categories: suggestionRows.map((row) => {
      const author = typeof row.suggested_by === "string" ? authorById.get(row.suggested_by) : null;
      const professional = typeof row.suggested_by === "string" ? professionalById.get(row.suggested_by) : null;
      return {
        ...row,
        labelEn: englishById.get(String(row.id)) ?? null,
        suggestedByName: author?.full_name ?? null,
        suggestedByEmail: author?.email ?? null,
        suggestedByBusinessName: professional?.business_name ?? null,
      };
    }),
    pendingCount: (legacyPendingCount?.count ?? pendingCount ?? 0) as number,
  });
}

// PATCH /api/admin/categories
// - Suggestion review: { id, status, label?, groupId?, esSalud?, supportsVideoconsulta? }
// - Catalog edit:      { id, label, groupId, isHidden, esSalud, supportsVideoconsulta }
export async function PATCH(req: Request) {
  const admin = await getApiAdmin();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const body = await req.json();
  if (body?.type === "group") return updateCategoryGroup(body);

  const {
    id,
    status,
    label,
    labelEn,
    groupId,
    isHidden,
    esSalud,
    supportsVideoconsulta,
    reviewReason,
  } = body;
  if (!id || (status && !["approved", "rejected", "pending"].includes(status))) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const db = createAdminClient();
  const groups = await getAdminGroups(db);
  const normalizedReviewReason = normalizeReviewReason(reviewReason);
  let suggestionRow: {
    id: string;
    label?: string | null;
    suggested_name?: string | null;
    suggested_by?: string | null;
    review_reason?: string | null;
  } | null = null;
  if (status) {
    const { data } = await db
      .from("category_suggestions")
      .select("id, label, suggested_name, suggested_by, review_reason")
      .eq("id", id)
      .maybeSingle();
    suggestionRow = data;
    if (!suggestionRow) {
      return NextResponse.json({ error: "Sugerencia no encontrada" }, { status: 404 });
    }
  }

  if (!status) {
    const rawLabel = normalizeServiceDisplayName(typeof label === "string" ? label : "");
    const rawLabelEn = normalizeServiceDisplayName(typeof labelEn === "string" ? labelEn : "");
    const cleanLabel = rawLabel || (rawLabelEn ? await suggestSpanishServiceLabel(rawLabelEn) : normalizeServiceDisplayName(labelFromId(id)));
    const cleanLabelEn = rawLabelEn || await suggestEnglishServiceLabel(cleanLabel);
    const { error } = await upsertCategory(db, {
      id,
      name: cleanLabel,
      name_en: cleanLabelEn,
      group_id: validGroupId(groupId, groups) || inferCategoryGroupId(cleanLabel),
      is_hidden: !!isHidden,
      es_salud: !!esSalud,
      supports_videoconsulta: !!supportsVideoconsulta,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  const update: Record<string, unknown> = {
    status,
    approved: status === "approved",
    reviewed_at: new Date().toISOString(),
  };
  const cleanLabel = normalizeServiceDisplayName(typeof label === "string" ? label : "");
  if (cleanLabel) {
    update.label = cleanLabel;
    update.suggested_name = cleanLabel;
  }

  if ((status === "approved" || status === "rejected") && !suggestionRow) {
    return NextResponse.json({ error: "Sugerencia no encontrada" }, { status: 404 });
  }

  if (status === "approved") {
    update.review_reason = null;
    const rawName = cleanLabel || suggestionRow!.label || suggestionRow!.suggested_name || labelFromId(id);
    const rawNameEn = normalizeServiceDisplayName(typeof labelEn === "string" ? labelEn : "");
    const finalName = normalizeServiceDisplayName(rawName);
    const finalNameEn = rawNameEn || await suggestEnglishServiceLabel(finalName);
    const review = classifySuggestedCategory(finalName);
    const upsertResult = await upsertCategory(db, {
      id,
      name: finalName,
      name_en: finalNameEn,
      group_id: validGroupId(groupId, groups) || inferCategoryGroupId(finalName),
      is_hidden: false,
      es_salud: typeof esSalud === "boolean" ? esSalud : review.healthLikely,
      supports_videoconsulta: typeof supportsVideoconsulta === "boolean" ? supportsVideoconsulta : review.videoConsultLikely,
    });
    if (upsertResult.error) return NextResponse.json({ error: upsertResult.error.message }, { status: 500 });
    const approvedUpdateError = await updateSuggestionRow(db, id, update);
    if (approvedUpdateError) return NextResponse.json({ error: approvedUpdateError.message }, { status: 500 });
    await notifySuggestionDecision(db, suggestionRow!, "approved", finalName);
    return NextResponse.json({ ok: true });
  }

  if (status === "rejected") {
    update.review_reason = normalizedReviewReason;
    const rawName = cleanLabel || suggestionRow!.label || suggestionRow!.suggested_name || labelFromId(id);
    const finalName = normalizeServiceDisplayName(rawName);
    const rejectedUpdateError = await updateSuggestionRow(db, id, update);
    if (rejectedUpdateError) return NextResponse.json({ error: rejectedUpdateError.message }, { status: 500 });
    await notifySuggestionDecision(db, suggestionRow!, "rejected", finalName, normalizedReviewReason);
    return NextResponse.json({ ok: true });
  }

  const updateError = await updateSuggestionRow(db, id, update);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function POST(req: Request) {
  const admin = await getApiAdmin();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const body = await req.json();
  if (body?.type === "group") return createCategoryGroup(body);

  const { label, labelEn, groupId, esSalud, supportsVideoconsulta } = body;
  const rawLabel = normalizeServiceDisplayName(typeof label === "string" ? label : "");
  const rawLabelEn = normalizeServiceDisplayName(typeof labelEn === "string" ? labelEn : "");
  const cleanLabel = rawLabel || (rawLabelEn ? await suggestSpanishServiceLabel(rawLabelEn) : "");
  if (!cleanLabel) return NextResponse.json({ error: "Nombre requerido" }, { status: 400 });

  const id = slugifyCategory(cleanLabel);
  const db = createAdminClient();
  const groups = await getAdminGroups(db);
  const cleanLabelEn = rawLabelEn || await suggestEnglishServiceLabel(cleanLabel);
  const review = classifySuggestedCategory(cleanLabel);
  const flags = {
    es_salud: typeof esSalud === "boolean" ? esSalud : review.healthLikely,
    supports_videoconsulta: typeof supportsVideoconsulta === "boolean" ? supportsVideoconsulta : review.videoConsultLikely,
  };

  const { error: categoryError } = await upsertCategory(db, {
    id,
    name: cleanLabel,
    name_en: cleanLabelEn,
    group_id: validGroupId(groupId, groups) || inferCategoryGroupId(cleanLabel),
    is_hidden: false,
    ...flags,
  });
  if (categoryError) return NextResponse.json({ error: categoryError.message }, { status: 500 });

  const { error: suggestionError } = await db.from("category_suggestions").upsert({
    id,
    label: cleanLabel,
    suggested_name: cleanLabel,
    approved: true,
    status: "approved",
    reviewed_at: new Date().toISOString(),
  }, { onConflict: "id", ignoreDuplicates: false });
  if (suggestionError) return NextResponse.json({ error: suggestionError.message }, { status: 500 });

  return NextResponse.json({ ok: true, category: { id, label: cleanLabel } });
}

async function createCategoryGroup(body: Record<string, unknown>) {
  const admin = await getApiAdmin();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const rawLabel = normalizeServiceDisplayName(typeof body.label === "string" ? body.label : "");
  const rawLabelEn = normalizeServiceDisplayName(typeof body.labelEn === "string" ? body.labelEn : "");
  const label = rawLabel ? await suggestSpanishServiceLabel(rawLabel) : rawLabelEn ? await suggestSpanishServiceLabel(rawLabelEn) : "";
  if (!label) return NextResponse.json({ error: "Nombre requerido" }, { status: 400 });
  const id = slugifyCategory(label);
  const labelEn = rawLabelEn || await suggestEnglishServiceLabel(label);
  const db = createAdminClient();
  const existingGroups = await getAdminGroups(db);
  const nextSort = Math.max(0, ...existingGroups.map((group) => group.sortOrder ?? 0)) + 10;
  const { error } = await db.from("category_groups").upsert({
    id,
    label,
    label_en: labelEn,
    icon_key: typeof body.iconKey === "string" && body.iconKey.trim() ? body.iconKey.trim() : "tag",
    sort_order: nextSort,
    is_hidden: false,
    updated_at: new Date().toISOString(),
  }, { onConflict: "id", ignoreDuplicates: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, group: { id, label, labelEn, iconKey: "tag", sortOrder: nextSort } });
}

async function updateCategoryGroup(body: Record<string, unknown>) {
  const admin = await getApiAdmin();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const id = typeof body.id === "string" ? body.id.trim() : "";
  const rawLabel = normalizeServiceDisplayName(typeof body.label === "string" ? body.label : "");
  const rawLabelEn = normalizeServiceDisplayName(typeof body.labelEn === "string" ? body.labelEn : "");
  const label = rawLabel ? await suggestSpanishServiceLabel(rawLabel) : rawLabelEn ? await suggestSpanishServiceLabel(rawLabelEn) : "";
  if (!id || !label) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  const labelEn = rawLabelEn || await suggestEnglishServiceLabel(label);
  const sortOrder = typeof body.sortOrder === "number" ? body.sortOrder : 100;
  const db = createAdminClient();
  const { error } = await db.from("category_groups").upsert({
    id,
    label,
    label_en: labelEn,
    icon_key: typeof body.iconKey === "string" && body.iconKey.trim() ? body.iconKey.trim() : "tag",
    sort_order: sortOrder,
    is_hidden: false,
    updated_at: new Date().toISOString(),
  }, { onConflict: "id", ignoreDuplicates: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const admin = await getApiAdmin();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const url = new URL(req.url);
  const groupId = url.searchParams.get("groupId");
  if (groupId) {
    const db = createAdminClient();
    const { error } = await db.from("category_groups").update({ is_hidden: true, updated_at: new Date().toISOString() }).eq("id", groupId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID requerido" }, { status: 400 });

  const db = createAdminClient();
  const base = ALL_CATEGORIES.find((category) => category.id === id);
  if (base) {
    const { error } = await upsertCategory(db, {
      id,
      name: base.label,
      name_en: autoEnglishCategoryLabel(base.label),
      group_id: base.groupId,
      is_hidden: true,
      es_salud: isHealthCategory(id),
      supports_videoconsulta: supportsVideoConsultCategory(id),
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  await db.from("category_suggestions").delete().eq("id", id);
  const { error } = await db.from("categories").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

function labelFromId(id: string): string {
  return ALL_CATEGORIES.find((category) => category.id === id)?.label
    ?? id.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

function validGroupId(groupId: unknown, groups: { id: string }[]): string | null {
  return typeof groupId === "string" && groups.some((group) => group.id === groupId) ? groupId : null;
}

function inferCategoryGroupId(label: string): string {
  return searchCategories(label)[0]?.groupId || "profesional";
}

async function upsertCategory(db: ReturnType<typeof createAdminClient>, row: Record<string, unknown>) {
  const current = { ...row };
  for (let attempt = 0; attempt < 4; attempt++) {
    const result = await db.from("categories").upsert(current, { onConflict: "id", ignoreDuplicates: false });
    if (!result.error) return result;

    const msg = result.error.message;
    if (/name_en|Could not find the 'name_en' column|column .*name_en/i.test(msg) && "name_en" in current) {
      delete current.name_en;
      continue;
    }
    if (/group_id|Could not find the 'group_id' column|column .*group_id/i.test(msg) && "group_id" in current) {
      delete current.group_id;
      continue;
    }
    if (/is_hidden|Could not find the 'is_hidden' column|column .*is_hidden/i.test(msg) && "is_hidden" in current) {
      delete current.is_hidden;
      continue;
    }
    return result;
  }
  return db.from("categories").upsert(current, { onConflict: "id", ignoreDuplicates: false });
}

function normalizeReviewReason(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function suggestionNotificationMessage(
  name: string,
  decision: "approved" | "rejected",
  reason?: string | null
): { title: string; message: string } {
  if (decision === "approved") {
    return {
      title: "Sugerencia aprobada",
      message: `Tu sugerencia "${name}" fue aprobada y ya está disponible para la búsqueda.`,
    };
  }

  const safeReason = reason && reason.trim() ? ` Motivo: ${reason.trim()}` : "";
  return {
    title: "Sugerencia rechazada",
    message: `Tu sugerencia "${name}" no fue aprobada.${safeReason}`,
  };
}

async function notifySuggestionDecision(
  db: ReturnType<typeof createAdminClient>,
  suggestionRow: { id: string; suggested_by?: string | null },
  decision: "approved" | "rejected",
  serviceName: string,
  reviewReason?: string | null
) {
  if (!suggestionRow.suggested_by) {
    console.warn("[admin/categories] suggestion has no suggested_by; cannot send decision notification", {
      id: suggestionRow.id,
      decision,
    });
    return;
  }

  const { title, message } = suggestionNotificationMessage(serviceName, decision, reviewReason);
  const notificationType = decision === "approved" ? "suggestion_approved" : "suggestion_rejected";
  const payload = {
    user_id: suggestionRow.suggested_by,
    title,
    message,
    data: {
      link: "/dashboard/profesional?tab=notifications",
    },
  };

  const primary = await db.from("notifications").insert({
    ...payload,
    type: notificationType,
  });

  if (!primary.error) {
    return;
  }

  console.warn("[admin/categories] suggestion decision notification insert failed, trying fallback", {
    suggestionId: suggestionRow.id,
    decision,
    notificationType,
    error: primary.error,
  });

  if (!isNotificationsTypeConstraintError(primary.error)) {
    console.error("[admin/categories] failed to insert suggestion decision notification:", {
      decision,
      notificationType,
      error: primary.error,
    });
  }

  const fallback = await db.from("notifications").insert({
    ...payload,
    type: "support_reply",
  });
  if (fallback.error) {
    console.error("[admin/categories] failed to insert suggestion decision fallback notification:", {
      decision,
      notificationType,
      error: fallback.error,
    });
  }
}

type NotificationInsertError = {
  message?: string;
  code?: string;
};

function isNotificationsTypeConstraintError(error: NotificationInsertError | null): boolean {
  if (!error) return false;
  if (error.code === "23514") return true;
  return /notifications_type_check|constraint .*notifications_type_check|violates check constraint/i.test(error.message ?? "");
}

async function getAdminGroups(db: ReturnType<typeof createAdminClient>): Promise<Array<{ id: string; label: string; labelEn?: string; iconKey?: string; sortOrder?: number }>> {
  let dbGroups: DbCategoryGroup[] = [];
  const res = await db
    .from("category_groups")
    .select("id, label, label_en, icon_key, sort_order, is_hidden")
    .eq("is_hidden", false)
    .order("sort_order", { ascending: true });
  if (!res.error) dbGroups = res.data ?? [];

  const dbIds = new Set(dbGroups.map((group) => group.id));
  const fixed = CATEGORY_GROUPS
    .filter((group) => !dbIds.has(group.id))
    .map((group, index) => ({
      id: group.id,
      label: group.label,
      labelEn: getCategoryGroupLabel(group.id, "en"),
      iconKey: CATEGORY_GROUP_ICON_KEYS[group.id],
      sortOrder: (index + 1) * 10,
    }));

  return [
    ...dbGroups.map((group) => ({
      id: group.id,
      label: group.label,
      labelEn: group.label_en || undefined,
      iconKey: group.icon_key || undefined,
      sortOrder: group.sort_order ?? 100,
    })),
    ...fixed,
  ].sort((a, b) => (a.sortOrder ?? 100) - (b.sortOrder ?? 100) || a.label.localeCompare(b.label));
}

function groupLabel(groupId: string, groups: Array<{ id: string; label: string }>) {
  return groups.find((group) => group.id === groupId)?.label || getCategoryGroupLabel(groupId);
}

function mapLegacySuggestionStatus(row: Record<string, unknown>): "pending" | "approved" | "rejected" {
  if (typeof row.status === "string") return (row.status as "pending" | "approved" | "rejected");
  if (row.approved === true) return "approved";
  if (row.approved === false) return "pending";
  return "rejected";
}

function isMissingColumnError(error: { message?: string }, column: string): boolean {
  return !!error?.message && new RegExp(`Could not find the '${column}' column|column \\\"${column}\\\" does not exist|column .*${column}`, "i").test(error.message);
}

async function updateSuggestionRow(
  db: ReturnType<typeof createAdminClient>,
  id: string,
  update: Record<string, unknown>
) {
  const { error } = await db.from("category_suggestions").update(update).eq("id", id);
  if (!error || !isMissingColumnError(error, "review_reason")) return error;
  const fallback = { ...update };
  delete (fallback as { review_reason?: string | null }).review_reason;
  return (await db.from("category_suggestions").update(fallback).eq("id", id)).error;
}




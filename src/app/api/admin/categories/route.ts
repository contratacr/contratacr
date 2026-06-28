import { NextResponse } from "next/server";
import { getApiAdmin } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  ALL_CATEGORIES,
  CATEGORY_GROUPS,
  autoEnglishCategoryLabel,
  classifySuggestedCategory,
  getCategoryGroupLabel,
  isHealthCategory,
  searchCategories,
  slugifyCategory,
  supportsVideoConsultCategory,
} from "@/lib/data/categories";

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
  const { data } = await q;

  const { count: pendingCount } = await db
    .from("category_suggestions")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");

  return NextResponse.json({ categories: data ?? [], pendingCount: pendingCount ?? 0 });
}

// PATCH /api/admin/categories
// - Suggestion review: { id, status, label?, groupId?, esSalud?, supportsVideoconsulta? }
// - Catalog edit:      { id, label, groupId, isHidden, esSalud, supportsVideoconsulta }
export async function PATCH(req: Request) {
  const admin = await getApiAdmin();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { id, status, label, labelEn, groupId, isHidden, esSalud, supportsVideoconsulta } = await req.json();
  if (!id || (status && !["approved", "rejected", "pending"].includes(status))) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const db = createAdminClient();
  const groups = await getAdminGroups(db);

  if (!status) {
    const cleanLabel = typeof label === "string" && label.trim() ? label.trim() : labelFromId(id);
    const cleanLabelEn = typeof labelEn === "string" && labelEn.trim() ? labelEn.trim() : autoEnglishCategoryLabel(cleanLabel);
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
  const cleanLabel = typeof label === "string" ? label.trim() : "";
  if (cleanLabel) {
    update.label = cleanLabel;
    update.suggested_name = cleanLabel;
  }

  const { error } = await db.from("category_suggestions").update(update).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (status === "approved") {
    const { data: row } = await db
      .from("category_suggestions")
      .select("label, suggested_name")
      .eq("id", id)
      .single();
    const finalName = cleanLabel || row?.label || row?.suggested_name || labelFromId(id);
    const finalNameEn = typeof labelEn === "string" && labelEn.trim() ? labelEn.trim() : autoEnglishCategoryLabel(finalName);
    const review = classifySuggestedCategory(finalName);
    await upsertCategory(db, {
      id,
      name: finalName,
      name_en: finalNameEn,
      group_id: validGroupId(groupId, groups) || inferCategoryGroupId(finalName),
      is_hidden: false,
      es_salud: typeof esSalud === "boolean" ? esSalud : review.healthLikely,
      supports_videoconsulta: typeof supportsVideoconsulta === "boolean" ? supportsVideoconsulta : review.videoConsultLikely,
    });
  }

  return NextResponse.json({ ok: true });
}

export async function POST(req: Request) {
  const admin = await getApiAdmin();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const body = await req.json();
  if (body?.type === "group") return createCategoryGroup(body);

  const { label, labelEn, groupId, esSalud, supportsVideoconsulta } = body;
  const cleanLabel = typeof label === "string" ? label.trim() : "";
  if (!cleanLabel) return NextResponse.json({ error: "Nombre requerido" }, { status: 400 });

  const id = slugifyCategory(cleanLabel);
  const db = createAdminClient();
  const groups = await getAdminGroups(db);
  const cleanLabelEn = typeof labelEn === "string" && labelEn.trim() ? labelEn.trim() : autoEnglishCategoryLabel(cleanLabel);
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

  const label = typeof body.label === "string" ? body.label.trim() : "";
  if (!label) return NextResponse.json({ error: "Nombre requerido" }, { status: 400 });
  const id = slugifyCategory(label);
  const labelEn = typeof body.labelEn === "string" && body.labelEn.trim() ? body.labelEn.trim() : autoEnglishCategoryLabel(label);
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

export async function DELETE(req: Request) {
  const admin = await getApiAdmin();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const id = new URL(req.url).searchParams.get("id");
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
    if (/name_en|schema cache|PGRST204|could not find/i.test(msg) && "name_en" in current) {
      delete current.name_en;
      continue;
    }
    if (/group_id|schema cache|PGRST204|could not find/i.test(msg) && "group_id" in current) {
      delete current.group_id;
      continue;
    }
    if (/is_hidden|schema cache|PGRST204|could not find/i.test(msg) && "is_hidden" in current) {
      delete current.is_hidden;
      continue;
    }
    return result;
  }
  return db.from("categories").upsert(current, { onConflict: "id", ignoreDuplicates: false });
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

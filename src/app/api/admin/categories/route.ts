import { NextResponse } from "next/server";
import { getApiAdmin } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  ALL_CATEGORIES,
  autoEnglishCategoryLabel,
  classifySuggestedCategory,
  isHealthCategory,
  slugifyCategory,
  supportsVideoConsultCategory,
} from "@/lib/data/categories";

// GET /api/admin/categories?status=pending|approved|rejected|catalog
export async function GET(req: Request) {
  const admin = await getApiAdmin();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const status = new URL(req.url).searchParams.get("status") ?? "pending";
  const db = createAdminClient();

  if (status === "catalog") {
    let rows: Array<{ id: string; name?: string | null; name_en?: string | null; es_salud?: boolean | null; supports_videoconsulta?: boolean | null }> | null = null;
    const withEnglish = await db
      .from("categories")
      .select("id, name, name_en, es_salud, supports_videoconsulta")
      .order("name", { ascending: true });
    rows = withEnglish.data;
    if (withEnglish.error && /name_en|schema cache|PGRST204|could not find/i.test(withEnglish.error.message)) {
      const withoutEnglish = await db
        .from("categories")
        .select("id, name, es_salud, supports_videoconsulta")
        .order("name", { ascending: true });
      rows = withoutEnglish.data;
    }
    const dbMap = new Map((rows ?? []).map((row) => [row.id, row]));
    const fixedIds = new Set(ALL_CATEGORIES.map((category) => category.id));

    const fixed = ALL_CATEGORIES.map((category) => {
      const row = dbMap.get(category.id);
      return {
        id: category.id,
        label: row?.name || category.label,
        labelEn: row?.name_en || autoEnglishCategoryLabel(row?.name || category.label),
        groupLabel: category.groupLabel,
        source: "base",
        esSalud: row?.es_salud ?? isHealthCategory(category.id),
        supportsVideoconsulta: row?.supports_videoconsulta ?? supportsVideoConsultCategory(category.id),
      };
    });
    const custom = (rows ?? [])
      .filter((row) => !fixedIds.has(row.id))
      .map((row) => ({
        id: row.id,
        label: row.name || labelFromId(row.id),
        labelEn: row.name_en || autoEnglishCategoryLabel(row.name || labelFromId(row.id)),
        groupLabel: "Otras categorÃ­as",
        source: "custom",
        esSalud: !!row.es_salud,
        supportsVideoconsulta: !!row.supports_videoconsulta,
      }));

    return NextResponse.json({ catalog: [...fixed, ...custom] });
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
// - Suggestion review: { id, status, label?, esSalud?, supportsVideoconsulta? }
// - Catalog flags:     { id, esSalud, supportsVideoconsulta }
export async function PATCH(req: Request) {
  const admin = await getApiAdmin();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { id, status, label, labelEn, esSalud, supportsVideoconsulta } = await req.json();
  if (!id || (status && !["approved", "rejected", "pending"].includes(status))) {
    return NextResponse.json({ error: "Datos invÃ¡lidos" }, { status: 400 });
  }

  const db = createAdminClient();

  if (!status) {
    const cleanLabel = typeof label === "string" && label.trim() ? label.trim() : labelFromId(id);
    const cleanLabelEn = typeof labelEn === "string" && labelEn.trim() ? labelEn.trim() : autoEnglishCategoryLabel(cleanLabel);
    const { error } = await upsertCategory(db, {
      id,
      name: cleanLabel,
      name_en: cleanLabelEn,
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
      es_salud: typeof esSalud === "boolean" ? esSalud : review.healthLikely,
      supports_videoconsulta: typeof supportsVideoconsulta === "boolean" ? supportsVideoconsulta : review.videoConsultLikely,
    });
  }

  return NextResponse.json({ ok: true });
}

export async function POST(req: Request) {
  const admin = await getApiAdmin();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { label, labelEn, esSalud, supportsVideoconsulta } = await req.json();
  const cleanLabel = typeof label === "string" ? label.trim() : "";
  if (!cleanLabel) return NextResponse.json({ error: "Nombre requerido" }, { status: 400 });

  const id = slugifyCategory(cleanLabel);
  const fixedExists = ALL_CATEGORIES.some((category) => category.id === id);
  if (fixedExists) return NextResponse.json({ error: "Ese servicio ya existe en el catalogo base" }, { status: 409 });

  const db = createAdminClient();
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

export async function DELETE(req: Request) {
  const admin = await getApiAdmin();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID requerido" }, { status: 400 });
  if (ALL_CATEGORIES.some((category) => category.id === id)) {
    return NextResponse.json({ error: "Los servicios base no se eliminan; solo se editan sus flags." }, { status: 400 });
  }

  const db = createAdminClient();
  await db.from("category_suggestions").delete().eq("id", id);
  const { error } = await db.from("categories").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

function labelFromId(id: string): string {
  return ALL_CATEGORIES.find((category) => category.id === id)?.label
    ?? id.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

async function upsertCategory(db: ReturnType<typeof createAdminClient>, row: Record<string, unknown>) {
  const result = await db.from("categories").upsert(row, { onConflict: "id", ignoreDuplicates: false });
  if (result.error && /name_en|schema cache|PGRST204|could not find/i.test(result.error.message)) {
    const withoutEnglish = { ...row };
    delete withoutEnglish.name_en;
    return db.from("categories").upsert(withoutEnglish, { onConflict: "id", ignoreDuplicates: false });
  }
  return result;
}

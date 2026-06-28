import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { CATEGORY_GROUP_LABELS_EN, CATEGORY_GROUPS, autoEnglishCategoryLabel } from "@/lib/data/categories";

// GET /api/categories/approved — the admin-approved CUSTOM categories (public).
// These are `category_suggestions` rows an admin approved; the app merges them
// into the fixed catalog at runtime (see lib/data/categories.ts) so an approved
// suggestion becomes a real, selectable/searchable category with no code deploy.
export async function GET() {
  const db = createAdminClient();
  const { data } = await db
    .from("category_suggestions")
    .select("id, label, suggested_name")
    .eq("status", "approved")
    .order("label", { ascending: true });
  let flags: Array<{ id: string; name?: string | null; name_en?: string | null; group_id?: string | null; is_hidden?: boolean | null; es_salud?: boolean | null; supports_videoconsulta?: boolean | null }> | null = null;
  const withEnglish = await db
    .from("categories")
    .select("id, name, name_en, group_id, is_hidden, es_salud, supports_videoconsulta");
  flags = withEnglish.data;
  if (withEnglish.error && /name_en|group_id|is_hidden|schema cache|PGRST204|could not find/i.test(withEnglish.error.message)) {
    const withoutEnglish = await db
      .from("categories")
      .select("id, name, es_salud, supports_videoconsulta");
    flags = withoutEnglish.data;
  }
  const flagMap = new Map((flags ?? []).map((c) => [c.id, c]));

  const categories = (data ?? []).map((c) => ({
    id: c.id,
    label: (c.label || c.suggested_name || "").trim(),
    labelEn: flagMap.get(c.id)?.name_en || autoEnglishCategoryLabel((c.label || c.suggested_name || "").trim()),
    groupId: flagMap.get(c.id)?.group_id || undefined,
    isHidden: !!flagMap.get(c.id)?.is_hidden,
    esSalud: !!flagMap.get(c.id)?.es_salud,
    supportsVideoconsulta: !!flagMap.get(c.id)?.supports_videoconsulta,
  }));
  const categoryFlags = (flags ?? []).map((c) => ({
    id: c.id,
    isHidden: !!c.is_hidden,
    esSalud: !!c.es_salud,
    supportsVideoconsulta: !!c.supports_videoconsulta,
  }));
  let dbGroups: Array<{ id: string; label: string; label_en?: string | null; icon_key?: string | null; sort_order?: number | null; is_hidden?: boolean | null }> = [];
  const groupsRes = await db
    .from("category_groups")
    .select("id, label, label_en, icon_key, sort_order, is_hidden")
    .eq("is_hidden", false)
    .order("sort_order", { ascending: true });
  if (!groupsRes.error) dbGroups = groupsRes.data ?? [];
  const dbGroupIds = new Set(dbGroups.map((group) => group.id));
  const fallbackGroups = CATEGORY_GROUPS
    .filter((group) => !dbGroupIds.has(group.id))
    .map((group, index) => ({
      id: group.id,
      label: group.label,
      labelEn: CATEGORY_GROUP_LABELS_EN[group.id],
      sortOrder: (index + 1) * 10,
    }));
  const groups = [
    ...dbGroups.map((group) => ({
      id: group.id,
      label: group.label,
      labelEn: group.label_en || undefined,
      iconKey: group.icon_key || undefined,
      sortOrder: group.sort_order ?? 100,
      isHidden: !!group.is_hidden,
    })),
    ...fallbackGroups,
  ];

  return NextResponse.json(
    { categories, categoryFlags, groups },
    // Cache briefly at the edge — approvals are rare; pickers can be a touch stale.
    { headers: { "Cache-Control": "public, max-age=60, s-maxage=300" } }
  );
}

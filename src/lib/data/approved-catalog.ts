import { createAdminClient } from "@/lib/supabase/admin";
import { ALL_CATEGORIES, CATEGORY_GROUP_ICON_KEYS, CATEGORY_GROUP_LABELS_EN, CATEGORY_GROUPS, autoEnglishCategoryLabel, resolveCategoryGroupIconKey } from "@/lib/data/categories";
import { hasBrokenVisibleText, repairVisibleText } from "@/lib/text/repair-visible-text";

// The operational service catalogue as the public app should see it: the
// `categories` table (renamed labels, groups, flags) plus approved suggestions
// not mirrored yet. Shared by the public API and the server-side loader so a
// rename made in the admin shows up identically in server-rendered pages and
// in the browser.
export type ApprovedCatalog = {
  categories: Array<{ id: string; label: string; labelEn?: string; groupId?: string; isHidden: boolean; esSalud: boolean; supportsVideoconsulta: boolean }>;
  categoryFlags: Array<{ id: string; isHidden: boolean; esSalud: boolean; supportsVideoconsulta: boolean }>;
  groups: Array<{ id: string; label: string; labelEn?: string; iconKey?: string; sortOrder?: number; isHidden?: boolean }>;
};

export async function buildApprovedCatalog(): Promise<ApprovedCatalog> {
  const db = createAdminClient();
  const { data: suggestions } = await db
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
  const fixedById = new Map(ALL_CATEGORIES.map((category) => [category.id, category]));
  const fixedIds = new Set(fixedById.keys());
  const categoriesById = new Map<string, {
    id: string;
    label: string;
    labelEn?: string;
    groupId?: string;
    isHidden: boolean;
    esSalud: boolean;
    supportsVideoconsulta: boolean;
  }>();

  for (const row of flags ?? []) {
    if (!row.id || row.is_hidden) continue;
    const repairedLabel = repairVisibleText(row.name || "").trim();
    const fixedCategory = fixedById.get(row.id);
    const label = hasBrokenVisibleText(repairedLabel) && fixedCategory
      ? fixedCategory.label
      : repairedLabel;
    if (!label) continue;
    const groupId = fixedCategory?.groupId || row.group_id || undefined;
    if (!fixedCategory && !groupId) continue;
    categoriesById.set(row.id, {
      id: row.id,
      label,
      labelEn: repairVisibleText(row.name_en) || autoEnglishCategoryLabel(label),
      groupId,
      isHidden: false,
      esSalud: !!row.es_salud,
      supportsVideoconsulta: !!row.supports_videoconsulta,
    });
  }

  for (const suggestion of suggestions ?? []) {
    if (!suggestion.id || fixedIds.has(suggestion.id) || categoriesById.has(suggestion.id)) continue;
    const row = flagMap.get(suggestion.id);
    if (row?.is_hidden) continue;
    const label = repairVisibleText(row?.name || suggestion.label || suggestion.suggested_name || "").trim();
    if (!label) continue;
    if (!row?.group_id) continue;
    categoriesById.set(suggestion.id, {
      id: suggestion.id,
      label,
      labelEn: repairVisibleText(row?.name_en) || autoEnglishCategoryLabel(label),
      groupId: row.group_id,
      isHidden: false,
      esSalud: !!row?.es_salud,
      supportsVideoconsulta: !!row?.supports_videoconsulta,
    });
  }

  const categories = Array.from(categoriesById.values()).sort((a, b) => a.label.localeCompare(b.label));
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
      iconKey: resolveCategoryGroupIconKey(group.id, group.label, CATEGORY_GROUP_ICON_KEYS[group.id]),
      sortOrder: (index + 1) * 10,
    }));
  const groups = [
    ...dbGroups.map((group) => ({
      id: group.id,
      label: repairVisibleText(group.label),
      labelEn: repairVisibleText(group.label_en) || undefined,
      iconKey: resolveCategoryGroupIconKey(group.id, group.label, group.icon_key),
      sortOrder: group.sort_order ?? 100,
      isHidden: !!group.is_hidden,
    })),
    ...fallbackGroups,
  ];

  return { categories, categoryFlags, groups };
}

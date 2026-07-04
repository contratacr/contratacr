import { NextRequest, NextResponse } from "next/server";
import {
  searchCategories,
  getMatchingCategoryIds,
  getCategoryLabel,
  normalizeText,
  resolveCategoryIntent,
} from "@/lib/data/categories";

const SUPABASE_CONFIGURED =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export type SearchSuggestion =
  | { type: "category"; id: string; label: string }
  | { type: "professional"; slug: string; label: string; sublabel?: string };

// Autocomplete for the homepage search bar. Combines the service-category taxonomy
// with actual professional specialties so suggestions always lead to results.
//
// IMPORTANT: the static `searchCategories()` taxonomy lives in code; the DYNAMIC
// overlay of admin-approved custom categories is loaded CLIENT-SIDE (via
// `useCustomCategories`) and is therefore EMPTY on the server. So this endpoint
// must read the approved categories straight from the DB (`category_suggestions`,
// the same source `/api/categories/approved` exposes) — otherwise the home search
// would miss newly-approved categories that the other searches already show.
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const locale = url.searchParams.get("locale") ?? "es";
  if (q.length < 2) return NextResponse.json({ suggestions: [] });

  const norm = normalizeText(q);

  // Create the client once (RLS lets anyone read approved category_suggestions +
  // professionals). Best-effort: static category matches always return regardless.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let supabase: any = null;
  if (SUPABASE_CONFIGURED) {
    try {
      const { createClient } = await import("@/lib/supabase/server");
      supabase = await createClient();
    } catch (err) {
      console.error("[GET /api/search/suggestions] client init failed:", err);
    }
  }

  // 1. Matching service categories from the fixed taxonomy (keyword synonyms), localized.
  const inferredCat = resolveCategoryIntent(q, locale);
  const dbCategoryLabels = new Map<string, { label: string; labelEn?: string }>();
  if (supabase) {
    try {
      const { data } = await supabase
        .from("categories")
        .select("id, name, name_en, is_hidden")
        .eq("is_hidden", false);
      for (const row of data ?? []) {
        const id = String(row.id ?? "");
        const label = String(row.name ?? "").trim();
        if (!id || !label) continue;
        dbCategoryLabels.set(id, { label, labelEn: typeof row.name_en === "string" ? row.name_en : undefined });
      }
    } catch (err) {
      console.error("[GET /api/search/suggestions] categories lookup failed:", err);
    }
  }
  const categoryLabel = (id: string) => {
    const dbLabel = dbCategoryLabels.get(id);
    if (dbLabel) return locale === "en" && dbLabel.labelEn ? dbLabel.labelEn : dbLabel.label;
    return getCategoryLabel(id, locale);
  };
  const staticCats: SearchSuggestion[] = [
    ...(inferredCat ? [inferredCat] : []),
    ...searchCategories(q).filter((c) => c.id !== inferredCat?.id),
  ]
    .slice(0, 6)
    .map((c) => ({ type: "category", id: c.id, label: categoryLabel(c.id) }));

  // 1b. Matching admin-managed categories read LIVE from the DB, so newly approved
  //     services and label overrides appear here just like in the other searches.
  const customCats: SearchSuggestion[] = [];
  const customIds: string[] = [];
  if (supabase) {
    try {
      const seen = new Set(staticCats.map((c) => (c.type === "category" ? c.id : "")));
      for (const [id, labels] of dbCategoryLabels) {
        const label = locale === "en" && labels.labelEn ? labels.labelEn : labels.label;
        if (!id || !label || seen.has(id)) continue;
        if (!normalizeText(label).includes(norm)) continue;
        seen.add(id);
        customIds.push(id);
        customCats.push({ type: "category", id, label });
      }
    } catch (err) {
      console.error("[GET /api/search/suggestions] approved categories lookup failed:", err);
    }
  }

  const categorySuggestions: SearchSuggestion[] = [...staticCats, ...customCats].slice(0, 6);

  // 2. Real professionals whose specialty matches the query — including those
  //    registered under a newly-approved custom category (customIds).
  let professionalSuggestions: SearchSuggestion[] = [];
  if (supabase) {
    try {
      const catIds = [...new Set([...getMatchingCategoryIds(q), ...customIds])];
      if (catIds.length > 0) {
        const { data } = await supabase
          .from("professionals")
          .select("slug, category_id, rating_avg, profiles(full_name)")
          .in("category_id", catIds)
          .order("rating_avg", { ascending: false })
          .limit(4);

        professionalSuggestions = ((data ?? []) as unknown[])
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((p: any): SearchSuggestion => {
            const cid = p.category_id as string;
            const customLabel = customCats.find((c) => c.type === "category" && c.id === cid)?.label;
            return {
              type: "professional",
              slug: p.slug as string,
              label: (p.profiles?.full_name as string) ?? "Profesional",
              sublabel: customLabel ?? getCategoryLabel(cid, locale),
            };
          })
          .filter((s) => s.type === "professional" && !!s.slug);
      }
    } catch (err) {
      // Best-effort — category suggestions still return.
      console.error("[GET /api/search/suggestions] pro lookup failed:", err);
    }
  }

  return NextResponse.json({
    suggestions: [...categorySuggestions, ...professionalSuggestions].slice(0, 8),
  });
}

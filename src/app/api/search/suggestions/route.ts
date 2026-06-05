import { NextRequest, NextResponse } from "next/server";
import {
  searchCategories,
  getMatchingCategoryIds,
  getCategoryLabel,
} from "@/lib/data/categories";

const SUPABASE_CONFIGURED =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export type SearchSuggestion =
  | { type: "category"; id: string; label: string }
  | { type: "professional"; slug: string; label: string; sublabel?: string };

// Autocomplete for the homepage search bar. Combines the real service-category
// taxonomy (mirrors the `categories` table) with actual professional specialties
// pulled from the `professionals` table, so suggestions always lead to results.
export async function GET(req: NextRequest) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ suggestions: [] });

  // 1. Matching service categories (taxonomy + keyword synonyms)
  const categorySuggestions: SearchSuggestion[] = searchCategories(q)
    .slice(0, 6)
    .map((c) => ({ type: "category", id: c.id, label: c.label }));

  // 2. Real professionals whose specialty matches the query
  let professionalSuggestions: SearchSuggestion[] = [];
  if (SUPABASE_CONFIGURED) {
    try {
      const { createClient } = await import("@/lib/supabase/server");
      const supabase = await createClient();
      const catIds = getMatchingCategoryIds(q);

      if (catIds.length > 0) {
        const { data } = await supabase
          .from("professionals")
          .select("slug, category_id, rating_avg, profiles(full_name)")
          .in("category_id", catIds)
          .order("rating_avg", { ascending: false })
          .limit(4);

        professionalSuggestions = (data ?? [])
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((p: any) => ({
            type: "professional" as const,
            slug: p.slug as string,
            label: (p.profiles?.full_name as string) ?? "Profesional",
            sublabel: getCategoryLabel(p.category_id as string),
          }))
          .filter((s) => s.slug);
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

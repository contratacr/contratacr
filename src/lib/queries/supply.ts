import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { PROVINCES } from "@/lib/data/cr-geography";

/**
 * Cuántos profesionales activos hay por oficio y por oficio×provincia.
 * Decide qué páginas de aterrizaje existen (solo donde hay oferta real) y
 * alimenta el sitemap. Se recalcula cada hora.
 */
export type SupplyCounts = {
  byCategory: Record<string, number>;
  byCategoryProvince: Record<string, number>;
  total: number;
  verified: number;
};

export const MIN_SUPPLY_FOR_LANDING = 3;

const ALL_PROVINCES = PROVINCES.map((p) => p.id);

async function computeSupplyCounts(): Promise<SupplyCounts> {
  const empty: SupplyCounts = { byCategory: {}, byCategoryProvince: {}, total: 0, verified: 0 };
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("professionals")
      .select("category_id, professions, provincia_id, coverage_provincias, coverage_country, verification_status, is_banned, profiles(is_disabled)")
      .eq("is_banned", false)
      .neq("verification_status", "rejected");
    if (error || !data) return empty;
    const out: SupplyCounts = { byCategory: {}, byCategoryProvince: {}, total: 0, verified: 0 };
    for (const row of data as unknown as Record<string, unknown>[]) {
      if ((row.profiles as { is_disabled?: boolean } | null)?.is_disabled) continue;
      out.total += 1;
      if (row.verification_status === "verified") out.verified += 1;
      const cats = Array.isArray(row.professions) && (row.professions as string[]).length > 0
        ? (row.professions as string[])
        : row.category_id ? [row.category_id as string] : [];
      const provs = new Set<string>();
      if (row.provincia_id) provs.add(row.provincia_id as string);
      for (const p of (Array.isArray(row.coverage_provincias) ? (row.coverage_provincias as string[]) : [])) provs.add(p);
      if (row.coverage_country) ALL_PROVINCES.forEach((p) => provs.add(p));
      for (const cat of cats) {
        out.byCategory[cat] = (out.byCategory[cat] ?? 0) + 1;
        for (const prov of provs) {
          const key = `${cat}|${prov}`;
          out.byCategoryProvince[key] = (out.byCategoryProvince[key] ?? 0) + 1;
        }
      }
    }
    return out;
  } catch (err) {
    console.error("[supply] error:", err);
    return empty;
  }
}

export const getSupplyCounts = unstable_cache(computeSupplyCounts, ["supply-counts-v1"], { revalidate: 3600 });

export function supplyKey(categoryId: string, provinceId?: string | null) {
  return provinceId ? `${categoryId}|${provinceId}` : categoryId;
}

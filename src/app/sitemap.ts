import type { MetadataRoute } from "next";
import { getAllCategories } from "@/lib/data/categories";
import { PROVINCES } from "@/lib/data/cr-geography";
import { getSupplyCounts, supplyKey, MIN_SUPPLY_FOR_LANDING } from "@/lib/queries/supply";
import { createAdminClient } from "@/lib/supabase/admin";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://contratacr.com";

/**
 * Antes /sitemap.xml devolvía la página de inicio: Google no tenía mapa del
 * sitio. Lista el home, los tableros, las páginas por oficio (solo donde hay
 * oferta real) y los perfiles públicos.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supply = await getSupplyCounts();
  const now = new Date();
  const out: MetadataRoute.Sitemap = [];
  const fijos = ["", "/buscar", "/servicios", "/ofertas", "/empleos", "/como-funciona", "/ayuda", "/atraer-clientes"];
  for (const p of fijos) out.push({ url: `${APP_URL}/es${p}`, lastModified: now, changeFrequency: "daily", priority: p === "" ? 1 : 0.8 });

  for (const cat of getAllCategories()) {
    if ((supply.byCategory[supplyKey(cat.id)] ?? 0) < MIN_SUPPLY_FOR_LANDING) continue;
    out.push({ url: `${APP_URL}/es/servicios/${cat.id}`, lastModified: now, changeFrequency: "weekly", priority: 0.9 });
    for (const prov of PROVINCES) {
      if ((supply.byCategoryProvince[supplyKey(cat.id, prov.id)] ?? 0) < MIN_SUPPLY_FOR_LANDING) continue;
      out.push({ url: `${APP_URL}/es/servicios/${cat.id}/${prov.id}`, lastModified: now, changeFrequency: "weekly", priority: 0.8 });
    }
  }

  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("professionals")
      .select("slug, updated_at, verification_status, is_banned")
      .eq("is_banned", false)
      .neq("verification_status", "rejected")
      .not("slug", "is", null)
      .limit(5000);
    for (const row of (data ?? []) as { slug: string; updated_at?: string | null }[]) {
      out.push({ url: `${APP_URL}/es/profesionales/${row.slug}`, lastModified: row.updated_at ? new Date(row.updated_at) : now, changeFrequency: "weekly", priority: 0.6 });
    }
  } catch (err) {
    console.error("[sitemap] perfiles:", err);
  }
  return out;
}

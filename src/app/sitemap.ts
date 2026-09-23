import type { MetadataRoute } from "next";
import { getAllCategories } from "@/lib/data/categories";
import { PROVINCES } from "@/lib/data/cr-geography";
import { getSupplyCounts, supplyKey, MIN_SUPPLY_FOR_LANDING } from "@/lib/queries/supply";
import { createAdminClient } from "@/lib/supabase/admin";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://contratacr.com";
// El sitio es bilingüe con hreflang: el mapa tiene que decir las dos direcciones
// de cada página, no solo la española. Sin /en, la mitad del sitio era invisible.
const IDIOMAS = ["es", "en"] as const;

/**
 * Antes /sitemap.xml devolvía la página de inicio: Google no tenía mapa del
 * sitio. Lista el home, los tableros, las páginas por oficio (solo donde hay
 * oferta real) y los perfiles públicos.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Fuera de producción no hay mapa que ofrecer: armarlo recorre categorías,
  // oferta por provincia y los 283 perfiles, y solo servía para que los
  // buscadores entraran a un entorno de pruebas.
  if (!/^https:\/\/(www\.)?contratacr\.com$/.test(APP_URL.replace(/\/$/, ""))) return [];
  const supply = await getSupplyCounts();
  const now = new Date();
  const out: MetadataRoute.Sitemap = [];
  const fijos = ["", "/buscar", "/servicios", "/ofertas", "/empleos", "/proyectos", "/como-funciona", "/ayuda", "/atraer-clientes"];
  for (const p of fijos) for (const l of IDIOMAS) out.push({ url: `${APP_URL}/${l}${p}`, lastModified: now, changeFrequency: "daily", priority: p === "" ? 1 : 0.8 });

  for (const cat of getAllCategories()) {
    if ((supply.byCategory[supplyKey(cat.id)] ?? 0) < MIN_SUPPLY_FOR_LANDING) continue;
    for (const l of IDIOMAS) out.push({ url: `${APP_URL}/${l}/servicios/${cat.id}`, lastModified: now, changeFrequency: "weekly", priority: 0.9 });
    for (const prov of PROVINCES) {
      if ((supply.byCategoryProvince[supplyKey(cat.id, prov.id)] ?? 0) < MIN_SUPPLY_FOR_LANDING) continue;
      for (const l of IDIOMAS) out.push({ url: `${APP_URL}/${l}/servicios/${cat.id}/${prov.id}`, lastModified: now, changeFrequency: "weekly", priority: 0.8 });
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
      for (const l of IDIOMAS) out.push({ url: `${APP_URL}/${l}/profesionales/${row.slug}`, lastModified: row.updated_at ? new Date(row.updated_at) : now, changeFrequency: "weekly", priority: 0.6 });
    }
  } catch (err) {
    console.error("[sitemap] perfiles:", err);
  }

  // Las FICHAS de empleos y promociones vivas: son lo que la gente busca en
  // Google («vacante de X en Y»), y no estaban en el mapa —solo los tableros—.
  try {
    const supabase = createAdminClient();
    const hoy = now.toISOString().slice(0, 10);
    const [{ data: empleos }, { data: ofertas }] = await Promise.all([
      supabase.from("job_posts").select("id, updated_at").eq("status", "published").limit(2000),
      supabase.from("professional_offers").select("id, updated_at, valid_until").eq("status", "published").or(`valid_until.is.null,valid_until.gte.${hoy}`).limit(2000),
    ]);
    for (const row of (empleos ?? []) as { id: string; updated_at?: string | null }[]) {
      for (const l of IDIOMAS) out.push({ url: `${APP_URL}/${l}/empleos/${row.id}`, lastModified: row.updated_at ? new Date(row.updated_at) : now, changeFrequency: "weekly", priority: 0.7 });
    }
    for (const row of (ofertas ?? []) as { id: string; updated_at?: string | null }[]) {
      for (const l of IDIOMAS) out.push({ url: `${APP_URL}/${l}/ofertas/${row.id}`, lastModified: row.updated_at ? new Date(row.updated_at) : now, changeFrequency: "weekly", priority: 0.6 });
    }
  } catch (err) {
    console.error("[sitemap] empleos/ofertas:", err);
  }
  return out;
}

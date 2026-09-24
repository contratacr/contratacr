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
  const out: MetadataRoute.Sitemap = [];

  // `lastModified` tiene que ser una fecha REAL. Antes las páginas fijas y las
  // de oficio llevaban `new Date()`, o sea el instante de la consulta: Google
  // veía 1 586 direcciones que decían haber cambiado todas justo en ese
  // segundo, en CADA lectura del mapa. Un dato que siempre dice «cambié ahora»
  // no distingue nada, así que el buscador aprende a ignorarlo —y de paso
  // gasta rastreo volviendo a páginas que no se tocaron, que en un sitio
  // chico es rastreo que les falta a las que sí importan.
  //
  // Lo que de verdad cambia en una página de oficio es su lista de
  // profesionales, así que la fecha sale del último perfil actualizado. Si no
  // se puede leer, se omite: no poner fecha es honesto; poner una inventada,
  // no.
  let ultimoCambio: Date | undefined;
  try {
    const { data } = await createAdminClient()
      .from("professionals")
      .select("updated_at")
      .eq("is_banned", false)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const crudo = (data as { updated_at?: string } | null)?.updated_at;
    if (crudo) ultimoCambio = new Date(crudo);
  } catch { /* sin fecha es mejor que una fecha falsa */ }
  const fijos = ["", "/buscar", "/servicios", "/promociones", "/empleos", "/proyectos", "/como-funciona", "/ayuda", "/mejorar-mi-perfil"];
  for (const p of fijos) for (const l of IDIOMAS) out.push({ url: `${APP_URL}/${l}${p}`, lastModified: ultimoCambio, changeFrequency: "daily", priority: p === "" ? 1 : 0.8 });

  for (const cat of getAllCategories()) {
    if ((supply.byCategory[supplyKey(cat.id)] ?? 0) < MIN_SUPPLY_FOR_LANDING) continue;
    for (const l of IDIOMAS) out.push({ url: `${APP_URL}/${l}/servicios/${cat.id}`, lastModified: ultimoCambio, changeFrequency: "weekly", priority: 0.9 });
    for (const prov of PROVINCES) {
      if ((supply.byCategoryProvince[supplyKey(cat.id, prov.id)] ?? 0) < MIN_SUPPLY_FOR_LANDING) continue;
      for (const l of IDIOMAS) out.push({ url: `${APP_URL}/${l}/servicios/${cat.id}/${prov.slug}`, lastModified: ultimoCambio, changeFrequency: "weekly", priority: 0.8 });
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
      for (const l of IDIOMAS) out.push({ url: `${APP_URL}/${l}/profesionales/${row.slug}`, lastModified: row.updated_at ? new Date(row.updated_at) : ultimoCambio, changeFrequency: "weekly", priority: 0.6 });
    }
  } catch (err) {
    console.error("[sitemap] perfiles:", err);
  }

  // Las FICHAS de empleos y promociones vivas: son lo que la gente busca en
  // Google («vacante de X en Y»), y no estaban en el mapa —solo los tableros—.
  try {
    const supabase = createAdminClient();
    const hoy = new Date().toISOString().slice(0, 10);
    const [{ data: empleos }, { data: ofertas }] = await Promise.all([
      supabase.from("job_posts").select("id, updated_at").eq("status", "published").limit(2000),
      supabase.from("professional_offers").select("id, updated_at, valid_until").eq("status", "published").or(`valid_until.is.null,valid_until.gte.${hoy}`).limit(2000),
    ]);
    for (const row of (empleos ?? []) as { id: string; updated_at?: string | null }[]) {
      for (const l of IDIOMAS) out.push({ url: `${APP_URL}/${l}/empleos/${row.id}`, lastModified: row.updated_at ? new Date(row.updated_at) : ultimoCambio, changeFrequency: "weekly", priority: 0.7 });
    }
    for (const row of (ofertas ?? []) as { id: string; updated_at?: string | null }[]) {
      for (const l of IDIOMAS) out.push({ url: `${APP_URL}/${l}/promociones/${row.id}`, lastModified: row.updated_at ? new Date(row.updated_at) : ultimoCambio, changeFrequency: "weekly", priority: 0.6 });
    }
  } catch (err) {
    console.error("[sitemap] empleos/ofertas:", err);
  }
  return out;
}

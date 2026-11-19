import type { MetadataRoute } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { rutaConIdioma } from "@/lib/prefijo-de-idioma";
import { DIR_INDEX_IMPORTED } from "@/lib/directory/feature-flags";
import { sitemapSections } from "@/lib/directory/sitemap-sections";

// Mapa del sitio del DIRECTORIO (2026-11-18): un archivo por sección, /sitemap-directorio/sitemap/<sección>.xml, con
// las fichas /lugar/<slug> que se pueden indexar (misma regla que la ficha, feature-flags.ts placeIndexable):
//  - reclamadas o verificadas: siempre;
//  - importadas sin reclamar: solo con teléfono, horario o sitio web, y solo si DIR_INDEX_IMPORTED no es 'false'.
// Cada sección queda muy por debajo del límite de 50 000 direcciones de Google (hoy la mayor, restaurantes, ≈1 000 ×2
// idiomas). Las páginas de búsqueda/filtros, marcas, eventos y precios son noindex y no entran. Fuera del dominio de
// producción no se publica nada (igual que src/app/sitemap.ts).
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://contratacr.com").replace(/\/$/, "");
const IDIOMAS = ["es", "en"] as const;
export const dynamic = "force-dynamic";

export async function generateSitemaps() {
  return sitemapSections().map((s) => ({ id: s.section }));
}

type Fila = { slug: string; updated_at: string | null };
async function fichas(vertical: string, soloConHorario: boolean): Promise<Fila[]> {
  const db = createAdminClient(), out: Fila[] = [];
  for (let desde = 0; desde < 100_000; desde += 1000) {
    let q = db.from("dir_places").select(soloConHorario ? "slug, updated_at, dir_place_hours!inner(place_id)" : "slug, updated_at")
      .eq("status", "published").eq("vertical_id", vertical);
    q = soloConHorario ? q : q.or(DIR_INDEX_IMPORTED
      ? "verification_level.not.in.(imported,unverified),claim_status.eq.claimed,phone.not.is.null,website.not.is.null"
      : "verification_level.not.in.(imported,unverified),claim_status.eq.claimed");
    const { data, error } = await q.order("slug").range(desde, desde + 999);
    if (error) throw error;
    out.push(...((data ?? []) as unknown as Fila[]).map((r) => ({ slug: r.slug, updated_at: r.updated_at })));
    if ((data ?? []).length < 1000) break;
  }
  return out;
}

export default async function sitemap(props: { id: Promise<string> }): Promise<MetadataRoute.Sitemap> {
  if (!/^https:\/\/(www\.)?contratacr\.com$/.test(APP_URL)) return [];
  const id = await props.id;
  const seccion = sitemapSections().find((s) => s.section === id);
  if (!seccion) return [];
  try {
    const [principales, conHorario] = await Promise.all([fichas(seccion.id, false), DIR_INDEX_IMPORTED ? fichas(seccion.id, true) : Promise.resolve([])]);
    const unicas = new Map<string, Fila>();
    for (const f of [...principales, ...conHorario]) unicas.set(f.slug, f);
    const out: MetadataRoute.Sitemap = [];
    for (const f of [...unicas.values()].sort((a, b) => a.slug.localeCompare(b.slug))) {
      for (const l of IDIOMAS) out.push({ url: `${APP_URL}${rutaConIdioma(l, `/lugar/${f.slug}`)}`, lastModified: f.updated_at ? new Date(f.updated_at) : undefined, changeFrequency: "weekly", priority: 0.5 });
    }
    return out;
  } catch (err) {
    console.error("[sitemap-directorio]", id, err);
    return [];
  }
}

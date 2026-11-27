import { getLocale, getTranslations } from "next-intl/server";
import { MapPin, Star } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseSearchParams, type DirectorySearchResult, type SearchVertical } from "@/lib/directory/search-schemas";
import { sitemapSections } from "@/lib/directory/sitemap-sections";
import { DIRECTORY_SECTION_LABELS } from "@/lib/search/directory-search";
import { idiomaDe } from "@/lib/prefijo-de-idioma";

// Home bands that exist only with the directory on (page.tsx gates them): featured places, promotions, business strip.

const NEAR_SECTIONS: string[] = ["restaurantes", "farmacias", "supermercados"];

/** Up to six places of the first enabled section, in the section's own order (no location on the server). Empty on any failure. */
async function nearbyPlaces() {
  const enabled: string[] = sitemapSections().map((s) => s.section);
  const section = NEAR_SECTIONS.find((s) => enabled.includes(s)) as SearchVertical | undefined;
  if (!section) return null;
  try {
    const parsed = parseSearchParams(new URLSearchParams({ vertical: section, limit: "6" }));
    if (!parsed.ok) return null;
    const { data, error } = await createAdminClient().rpc("dir_search", {
      p_vertical: parsed.vertical, p_q: parsed.q, p_filters: parsed.filters, p_lat: parsed.lat, p_lng: parsed.lng,
      p_radius_km: parsed.radiusKm, p_sort: parsed.sort, p_cursor: parsed.cursor, p_limit: 6,
    });
    if (error || !data) return null;
    const items = (data as DirectorySearchResult).items.flatMap((i) => (i.kind === "place" ? [i] : []));
    return items.length ? { section, items } : null;
  } catch {
    return null;
  }
}

export async function HomeFeaturedPlaces() {
  const found = await nearbyPlaces();
  if (!found) return null;
  const [t, locale] = await Promise.all([getTranslations("landing.inicio"), getLocale()]);
  const l = idiomaDe(locale);
  return (
    <section data-home-featured-places aria-labelledby="ccr-home-destacados" className="bg-white pb-8 sm:pb-12">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <h2 id="ccr-home-destacados" className="mb-4 text-xl font-extrabold text-[#1a2744] sm:text-2xl">{t("destacadosTitulo")}</h2>
        <ul className="grid grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-3">
          {found.items.map((p) => {
            const area = [p.address.adminArea3, p.address.adminArea2].filter(Boolean).join(", ");
            return (
              <li key={p.key}>
                <Link href={`/negocios/${p.slug}`} className="flex h-full flex-col gap-1 rounded-2xl border border-[#e5e9ee] bg-white p-3 shadow-sm transition-colors hover:border-[#009FD9] sm:p-4">
                  <span className="text-[15px] font-extrabold leading-snug text-[#1A2744] break-words">{p.name}</span>
                  <span className="text-[12px] font-semibold text-[#5b6b82]">{l === "en" ? p.vertical.nameEn : p.vertical.nameEs}</span>
                  {area && <span className="flex items-center gap-1 text-[13px] text-[#5b6b82]"><MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />{area}</span>}
                  {p.rating.count > 0 && p.rating.average != null && (
                    <span className="flex items-center gap-1 text-[13px] font-semibold text-[#1A2744]"><Star className="h-3.5 w-3.5 fill-[#f5b301] text-[#f5b301]" aria-hidden />{Number(p.rating.average).toFixed(1)} ({p.rating.count})</span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
        <p className="mt-3">
          <Link href={`/${found.section}`} className="inline-flex min-h-11 items-center text-sm font-extrabold text-[#009FD9] hover:underline">
            {t("destacadosVer", { seccion: DIRECTORY_SECTION_LABELS[found.section]?.[l] ?? found.section })} &rarr;
          </Link>
        </p>
      </div>
    </section>
  );
}

export async function HomePromoBand() {
  const t = await getTranslations("landing.inicio");
  return (
    <section data-home-promos aria-labelledby="ccr-home-promos" className="bg-white pb-8 sm:pb-12">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <div className="rounded-2xl bg-[#eaf7fd] p-4 sm:flex sm:w-full sm:items-center sm:justify-between sm:gap-6 sm:p-6">
          <div>
            <h2 id="ccr-home-promos" className="text-xl font-extrabold text-[#1a2744] sm:text-2xl">{t("promoTitulo")}</h2>
            <p className="mt-1 text-[15px] text-[#4a5b73]">{t("promoTexto")}</p>
          </div>
          <Link href="/promociones" className="mt-3 inline-flex min-h-11 shrink-0 items-center rounded-full border border-[#1A2744] px-5 text-sm font-bold text-[#1A2744] transition-colors hover:bg-[#1A2744] hover:text-white sm:mt-0">{t("promoCta")}</Link>
        </div>
      </div>
    </section>
  );
}

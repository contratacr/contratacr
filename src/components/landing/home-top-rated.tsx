import { Star } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { ScrollRow } from "@/components/landing/scroll-row";
import { searchProfessionals } from "@/lib/queries/professionals";
import { loadTopPlaces } from "@/components/directory/app-home-data";
import type { ProfessionalCardData } from "@/lib/data/mock-professionals";
import { getCategoryLabel } from "@/lib/data/categories";
import { DIRECTORY_SECTION_LABELS } from "@/lib/search/directory-search";

/**
 * Directory on (owner 2026-11-26): under the hero, instead of the brands strip, the best-rated accounts — professionals and
 * companies together, ranked by rating weighted by the number of reviews — in one row that slides. Real data only; nothing is drawn without reviews.
 */
export async function HomeTopRated() {
  const locale = await getLocale();
  const t = await getTranslations("landing.topRated");
  const [pros, ...places] = await Promise.all([
    Promise.race([searchProfessionals({ sortBy: "rating" } as Parameters<typeof searchProfessionals>[0]), new Promise<ProfessionalCardData[]>((r) => setTimeout(() => r([]), 2500))]).catch(() => [] as ProfessionalCardData[]),
    ...["restaurantes", "cafes", "farmacias", "supermercados", "belleza", "talleres"].map((s) => loadTopPlaces(s)),
  ]);
  const items = [
    ...pros.filter((p) => p.reviewCount > 0).map((p) => ({ key: `p:${p.id}`, href: `/profesionales/${p.slug}`, name: p.fullName, photo: p.avatarUrl ?? null, avg: p.ratingAvg, count: p.reviewCount, sub: [getCategoryLabel(p.categoryId, locale), p.cantonName || p.provinceName].filter(Boolean).join(" · ") })),
    ...places.flat().map((p) => ({ key: `l:${p.slug}`, href: `/lugar/${p.slug}`, name: p.name, photo: p.photo, avg: p.average ?? 0, count: p.count, sub: [(DIRECTORY_SECTION_LABELS[p.section] as Record<string, string> | undefined)?.[locale] ?? "", p.area].filter(Boolean).join(" · ") })),
  ]
    // Rating weighted by how many reviews back it (a 5.0 with one review must not beat a 4.7 with eighty): the average
    // pulled toward 4.0 as if it had five extra reviews; ties go to more reviews.
    .map((i) => ({ ...i, score: (i.avg * i.count + 4 * 5) / (i.count + 5) }))
    .sort((a, b) => b.score - a.score || b.count - a.count).slice(0, 12);
  if (!items.length) return null;
  return (
    <section data-home-top-rated className="bg-white pb-3 pt-6">
      <h2 className="mb-3 px-4 text-center text-[clamp(1.15rem,6.3vw,2.25rem)] font-extrabold text-[#1a2744] sm:text-4xl">{t("title")}</h2>
      {/* Bigger horizontal cards (owner 2026-11-26): photo on top, name, stars with the review count, section and area. */}
      <ScrollRow prevLabel={t("prev")} nextLabel={t("next")}>
        {items.map((i) => (
          <li key={i.key} className="w-[168px] shrink-0 snap-start sm:w-[190px]">
            <Link href={i.href} prefetch={false} data-home-top-rated-item className="flex h-full flex-col overflow-hidden rounded-2xl border border-[#e5e9ee] bg-white">
              <span className="grid aspect-square w-full place-items-center overflow-hidden bg-[#eef6fa] text-[30px] font-extrabold text-[#0083b0]">
                {i.photo
                  // eslint-disable-next-line @next/next/no-img-element -- remote photo
                  ? <img src={i.photo} alt="" className="h-full w-full object-cover" loading="lazy" />
                  : i.name.slice(0, 1)}
              </span>
              <span className="flex flex-1 flex-col gap-0.5 p-2.5">
                <span className="line-clamp-1 text-[14px] font-extrabold text-[#162543]">{i.name}</span>
                <span className="flex items-center gap-1 text-[12px]"><Star className="h-3.5 w-3.5 fill-[#f59e0b] text-[#f59e0b]" aria-hidden /><span className="font-bold text-[#162543]">{i.avg.toFixed(1)}</span><span className="text-[#6b7a8f]">({i.count} {t(i.count === 1 ? "review" : "reviews")})</span></span>
                {i.sub && <span className="line-clamp-1 text-[11.5px] text-[#6b7a8f]">{i.sub}</span>}
              </span>
            </Link>
          </li>
        ))}
      </ScrollRow>
    </section>
  );
}

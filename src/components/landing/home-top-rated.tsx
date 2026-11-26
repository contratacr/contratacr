import { Star } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { searchProfessionals } from "@/lib/queries/professionals";
import { loadTopPlaces } from "@/components/directory/app-home-data";
import type { ProfessionalCardData } from "@/lib/data/mock-professionals";

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
    ...pros.filter((p) => p.reviewCount > 0).map((p) => ({ key: `p:${p.id}`, href: `/profesionales/${p.slug}`, name: p.fullName, photo: p.avatarUrl ?? null, avg: p.ratingAvg, count: p.reviewCount })),
    ...places.flat().map((p) => ({ key: `l:${p.slug}`, href: `/lugar/${p.slug}`, name: p.name, photo: p.photo, avg: p.average ?? 0, count: p.count })),
  ]
    // Rating weighted by how many reviews back it (a 5.0 with one review must not beat a 4.7 with eighty): the average
    // pulled toward 4.0 as if it had five extra reviews; ties go to more reviews.
    .map((i) => ({ ...i, score: (i.avg * i.count + 4 * 5) / (i.count + 5) }))
    .sort((a, b) => b.score - a.score || b.count - a.count).slice(0, 12);
  if (!items.length) return null;
  return (
    <section data-home-top-rated className="bg-white pb-2 pt-5">
      <h2 className="mb-3 px-4 text-center text-[18px] font-extrabold text-[#1a2744] sm:text-2xl">{t("title")}</h2>
      <ul className="mx-auto flex max-w-6xl gap-4 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:justify-center [&::-webkit-scrollbar]:hidden">
        {items.map((i) => (
          <li key={i.key} className="w-[84px] shrink-0">
            <Link href={i.href} prefetch={false} className="flex flex-col items-center gap-1.5 text-center">
              <span className="grid h-[68px] w-[68px] place-items-center overflow-hidden rounded-full border border-[#e5e9ee] bg-[#eef6fa] text-[22px] font-extrabold text-[#0083b0]">
                {i.photo
                  // eslint-disable-next-line @next/next/no-img-element -- small remote photo
                  ? <img src={i.photo} alt="" className="h-full w-full object-cover" loading="lazy" />
                  : i.name.slice(0, 1)}
              </span>
              <span className="line-clamp-2 text-[12px] font-bold leading-tight text-[#162543]">{i.name}</span>
              <span className="flex items-center gap-0.5 text-[11.5px] font-semibold text-[#526277]"><Star className="h-3 w-3 fill-[#f59e0b] text-[#f59e0b]" aria-hidden />{i.avg.toFixed(1)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

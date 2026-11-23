"use client";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { useSiteFeatures } from "@/components/site-features";
import { HeroTile } from "@/components/directory/biz-ui";
import { placeSection } from "@/lib/directory/place-verticals";
import { CURATED_PLACE_SECTIONS, DIRECTORY_SECTION_BLURBS, pick } from "@/lib/directory/directory-groups";
import { DIRECTORY_SECTION_LABELS } from "@/lib/search/directory-search";
import { normalizeText } from "@/lib/data/categories";

/** Sections of the directory that are on and have businesses (a section whose total is a confirmed 0 is not offered; an
 * unknown total, null or missing, still shows the tile with its one-line description instead of a number). */
export function useVisiblePlaceSections(totals: Record<string, number | null | undefined>, query = ""): string[] {
  const { directorySections } = useSiteFeatures();
  const q = normalizeText(query.trim());
  return CURATED_PLACE_SECTIONS.filter((s) => directorySections.includes(s) && DIRECTORY_SECTION_LABELS[s] && placeSection(s) && totals[s] !== 0)
    .filter((s) => !q || [s, DIRECTORY_SECTION_LABELS[s].es, DIRECTORY_SECTION_LABELS[s].en, DIRECTORY_SECTION_BLURBS[s]?.es, DIRECTORY_SECTION_BLURBS[s]?.en].some((t) => t && normalizeText(t).includes(q)));
}

/** "Empresas" grid of the Categorías page (Yelp style): one big brand tile per directory section with its name and total. */
export function PlaceTiles({ sections, totals, locale, className }: { sections: string[]; totals: Record<string, number | null | undefined>; locale: string; className?: string }) {
  const en = locale === "en";
  const tp = useTranslations("categoriesPage");
  if (!sections.length) return null;
  return (
    <ul data-place-tiles className={cn("grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5", className)}>
      {sections.map((s) => {
        const def = placeSection(s);
        if (!def) return null;
        const total = totals[s];
        const blurb = DIRECTORY_SECTION_BLURBS[s];
        return (
          <li key={s}>
            <Link href={`/${s}`} prefetch={false} data-place-tile={s} className="group flex h-full flex-col overflow-hidden rounded-2xl border border-[#e5e9ee] bg-white shadow-sm transition-colors hover:border-[#009FD9] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#009FD9]">
              <HeroTile verticalId={def.id} className="h-20 w-full sm:h-24" iconClass="h-9 w-9 sm:h-11 sm:w-11" />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5 p-3">
                <span className="text-[15px] font-extrabold leading-tight text-[#162543] group-hover:text-[#0083b0] [overflow-wrap:anywhere]">{pick(DIRECTORY_SECTION_LABELS[s], locale)}</span>
                {typeof total === "number" && total > 0
                  ? <span data-place-tile-count={total} className="text-xs font-semibold text-[#0083b0]">{total.toLocaleString(en ? "en-US" : "es-CR")} {tp(total === 1 ? "businessOne" : "businessMany")}</span>
                  : blurb && <span className="line-clamp-2 text-xs leading-snug text-[#64748b]">{pick(blurb, locale)}</span>}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { directorySectionHref, suggestDirectorySections, type DirectoryLocation } from "@/lib/search/directory-search";
import { countDirectoryPlaces } from "@/lib/directory/search-server";

// Results tabs "Servicios | Lugares" (owner, 2026-11-21): a free-text search that also names a directory section
// shows a slim segmented bar under the title with both answers. Only while the directory is on (the caller passes
// the sections that are ON; empty = nothing renders). Counts come from the cheap section facets with a short
// timeout; any failure or zero places renders nothing. Desktop title strip only (phones keep the sheet untouched).
type Tab = { href: string; count: number | null; active: boolean };

export async function ResultTabsBar({ services, places }: { services: Tab; places: Tab }) {
  const t = await getTranslations("resultTabs");
  const count = (n: number | null) => (n == null ? "" : ` (${n.toLocaleString("es-CR")})`);
  const base = "inline-flex h-8 items-center rounded-full px-3.5 text-[13px] font-bold transition-colors";
  const on = "bg-[#009FD9] text-white";
  const off = "text-[#526277] hover:bg-[#eaf7fd] hover:text-[#007fae]";
  return (
    <nav aria-label={t("aria")} data-result-tabs="" className="hidden bg-white lg:block">
      <div className="mx-auto max-w-[1920px] px-4 pb-2 sm:px-6 lg:px-8">
        <div className="inline-flex items-center gap-1 rounded-full bg-[#f1f5f9] p-0.5">
          <Link href={services.href} data-result-tab="servicios" aria-current={services.active ? "page" : undefined} className={`${base} ${services.active ? on : off}`}>
            {t("services")}{count(services.count)}
          </Link>
          <Link href={places.href} data-result-tab="lugares" aria-current={places.active ? "page" : undefined} className={`${base} ${places.active ? on : off}`}>
            {t("places")}{count(places.count)}
          </Link>
        </div>
      </div>
    </nav>
  );
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([promise, new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))]);
}

/** Professionals results page: shows the bar when `q` names directory sections that have places. */
export async function CrossResultTabs({ q, sections, locale, servicesHref, servicesCount, location }: {
  q: string | undefined;
  sections: readonly string[];
  locale: string;
  servicesHref: string;
  servicesCount: number;
  location: DirectoryLocation;
}) {
  try {
    const text = (q ?? "").trim();
    if (!sections.length || text.length < 3) return null;
    const matches = suggestDirectorySections(text, sections, locale, 2);
    if (!matches.length) return null;
    const pages = await Promise.all(matches.map(async ({ section }) => {
      const href = directorySectionHref(section, text, location);
      const params = Object.fromEntries(new URLSearchParams(href.split("?")[1] ?? ""));
      const total = await withTimeout(countDirectoryPlaces(section as Parameters<typeof countDirectoryPlaces>[0], params), 1500);
      return { href, total };
    }));
    const counted = pages.filter((p) => p.total != null && p.total > 0);
    if (!counted.length) return null;
    const total = counted.reduce((sum, p) => sum + (p.total ?? 0), 0);
    return <ResultTabsBar services={{ href: servicesHref, count: servicesCount, active: true }} places={{ href: counted[0]!.href, count: total, active: false }} />;
  } catch {
    return null;
  }
}

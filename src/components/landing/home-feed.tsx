import { Star, ChevronRight, MapPin } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { HomeFeedLocation } from "@/components/landing/home-feed-location";
import { Link } from "@/i18n/navigation";
import { searchProfessionals } from "@/lib/queries/professionals";
import { getCategoryLabel } from "@/lib/data/categories";
import { loadTopPlaces, type TopPlace } from "@/components/directory/app-home-data";
import { HeroTile } from "@/components/directory/biz-ui";
import { placeSection } from "@/lib/directory/place-verticals";
import type { ProfessionalCardData } from "@/lib/data/mock-professionals";

/**
 * Phone home with the directory on (owner, 2026-11-26, Yelp style): the page opens on recommendations instead of a
 * second search box. Best-rated professionals and businesses, real data only (a card needs at least one review); a band
 * with nothing to show is not drawn. Desktop keeps the production landing.
 */
export async function HomeFeed() {
  const locale = await getLocale();
  const en = locale === "en";
  const t = await getTranslations("homeFeed");
  const [pros, ...places] = await Promise.all([topProfessionals(), ...FEED_SECTIONS.map((s) => loadTopPlaces(s))]);
  const empty = pros.length === 0 && places.every((p) => p.length === 0);
  return (
    <div data-home-feed className="space-y-6 pb-8 pt-4">
      <HomeFeedLocation />
      {empty && (
        <div className="px-4 pt-6">
          <h2 className="text-[22px] font-extrabold leading-tight text-[#162543]">{t("emptyTitle")}</h2>
          <p className="mt-2 text-[15px] text-[#526277]">{t("emptyBody")}</p>
        </div>
      )}
      <Band title={t("topPros")} href="/profesionales" all={t("seeAll")} show={pros.length > 0}>
        {pros.slice(0, 3).map((p) => <ProCard key={p.id} p={p} locale={locale} />)}
      </Band>
      {FEED_SECTIONS.map((s, n) => (
        <Band key={s} title={t(`top_${s}`)} href={`/${s}`} all={t("seeAll")} show={places[n].length > 0}>
          {places[n].slice(0, 3).map((p) => <PlaceCardMini key={p.slug} p={p} en={en} />)}
        </Band>
      ))}
    </div>
  );
}

/** Business bands of the feed, in order; one with no reviewed place is not drawn. */
const FEED_SECTIONS = ["restaurantes", "cafes", "farmacias", "supermercados", "talleres", "belleza"] as const;

async function topProfessionals(): Promise<ProfessionalCardData[]> {
  try {
    const all = await Promise.race([
      searchProfessionals({ sortBy: "rating" } as Parameters<typeof searchProfessionals>[0]),
      new Promise<ProfessionalCardData[]>((r) => setTimeout(() => r([]), 2500)),
    ]);
    return all.filter((p) => p.reviewCount > 0 && p.ratingAvg > 0).slice(0, 10);
  } catch {
    return [];
  }
}

function Band({ title, href, all, show, children }: { title: string; href: string; all: string; show: boolean; children: React.ReactNode }) {
  if (!show) return null;
  return (
    <section>
      <h2 className="mb-3 px-4 text-[20px] font-extrabold leading-tight text-[#162543]">{title}</h2>
      <ul className="space-y-4 px-4">{children}</ul>
      <Link href={href} prefetch={false} className="mx-4 mt-3 flex h-11 items-center justify-center gap-1 rounded-full border border-[#d7e1ea] text-[14px] font-bold text-[#162543]">{all}<ChevronRight className="h-4 w-4" aria-hidden /></Link>
    </section>
  );
}

function Rating({ avg, count, en }: { avg: number; count: number; en: boolean }) {
  return (
    <span className="flex items-center gap-1 text-[13px]">
      <Star className="h-3.5 w-3.5 fill-[#f59e0b] text-[#f59e0b]" aria-hidden />
      <span className="font-bold text-[#162543]">{avg.toFixed(1)}</span>
      <span className="text-[#6b7a8f]">({count} {en ? (count === 1 ? "review" : "reviews") : (count === 1 ? "reseña" : "reseñas")})</span>
    </span>
  );
}

function ProCard({ p, locale }: { p: ProfessionalCardData; locale: string }) {
  const en = locale === "en";
  // A person, not a place: round photo beside the details (a square avatar cropped to 16:9 cut faces).
  return (
    <li>
      <Link href={`/profesionales/${p.slug}`} prefetch={false} className="flex items-center gap-4 rounded-2xl border border-[#e5e9ee] bg-white p-4">
        <span className="grid h-[72px] w-[72px] shrink-0 place-items-center overflow-hidden rounded-full bg-[#eef6fa]">
          {p.avatarUrl
            // eslint-disable-next-line @next/next/no-img-element -- small remote avatar in a feed card
            ? <img src={p.avatarUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
            : <span className="text-[24px] font-extrabold text-[#0083b0]">{p.fullName.slice(0, 1)}</span>}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="line-clamp-1 text-[17px] font-extrabold text-[#162543]">{p.fullName}</span>
          <span className="line-clamp-1 text-[13.5px] font-semibold text-[#526277]">{getCategoryLabel(p.categoryId, locale)}</span>
          <Rating avg={p.ratingAvg} count={p.reviewCount} en={en} />
          {p.provinceName && <span className="flex items-center gap-1 text-[12px] text-[#6b7a8f]"><MapPin className="h-3 w-3" aria-hidden /><span className="line-clamp-1">{p.cantonName || p.provinceName}</span></span>}
        </span>
      </Link>
    </li>
  );
}

function PlaceCardMini({ p, en }: { p: TopPlace; en: boolean }) {
  const vertical = placeSection(p.section)?.id ?? p.section;
  return (
    <li>
      <Link href={`/lugar/${p.slug}`} prefetch={false} className="flex h-full flex-col overflow-hidden rounded-2xl border border-[#e5e9ee] bg-white">
        {p.photo
          // eslint-disable-next-line @next/next/no-img-element -- place photo served by our own photo route
          ? <img src={p.photo} alt="" className="aspect-[16/9] w-full shrink-0 object-cover" loading="lazy" />
          : <HeroTile verticalId={vertical} className="aspect-[16/9] w-full" iconClass="h-12 w-12" />}
        <span className="flex flex-1 flex-col gap-1 px-4 py-3">
          <span className="line-clamp-1 text-[17px] font-extrabold text-[#162543]">{p.name}</span>
          {p.average != null && <Rating avg={p.average} count={p.count} en={en} />}
          {p.area && <span className="flex items-center gap-1 text-[12px] text-[#6b7a8f]"><MapPin className="h-3 w-3" aria-hidden /><span className="line-clamp-1">{p.area}</span></span>}
        </span>
      </Link>
    </li>
  );
}

import { Star, ChevronRight, MapPin } from "lucide-react";
import { cookies } from "next/headers";
import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { searchProfessionals } from "@/lib/queries/professionals";
import { getCategoryLabel } from "@/lib/data/categories";
import { loadFeedPlaces, type FeedPlace } from "@/components/directory/app-home-data";
import { HeroTile } from "@/components/directory/biz-ui";
import { placeSection } from "@/lib/directory/place-verticals";
import { DIRECTORY_SECTION_LABELS } from "@/lib/search/directory-search";
import { HomeFeedExplore } from "@/components/landing/home-feed-location";
import { NEAR_COOKIE } from "@/lib/home-feed-near";
import { FeedPhotoCarousel } from "@/components/landing/feed-photo-carousel";
import type { ProfessionalCardData } from "@/lib/data/mock-professionals";

/**
 * Phone home with the directory on (owner, 2026-11-26, Yelp style): the page opens on recommendations, without headings.
 * Professionals top to bottom (work photos passing by, profile photo in a corner), then businesses left to right; ordered
 * by number of reviews, or by distance when the visitor chose "Cerca de mí". Real data only.
 */
export async function HomeFeed() {
  const locale = await getLocale();
  const en = locale === "en";
  const t = await getTranslations("homeFeed");
  const near = readNear((await cookies()).get(NEAR_COOKIE)?.value);
  const [pros, places] = await Promise.all([feedProfessionals(near), loadFeedPlaces(near)]);
  return (
    <div data-home-feed className="pb-8 pt-3">
      <HomeFeedExplore near={!!near} />
      {pros.length === 0 && places.length === 0 && (
        <div className="px-4 pt-8">
          <h2 className="text-[22px] font-extrabold leading-tight text-[#162543]">{t("emptyTitle")}</h2>
          <p className="mt-2 text-[15px] text-[#526277]">{t("emptyBody")}</p>
        </div>
      )}
      {/* No headings (owner): professionals top to bottom, then businesses left to right. */}
      {pros.length > 0 && (
        <section aria-label={near ? t("prosNear") : t("prosReviews")} className="mt-4">
          <ul className="space-y-4 px-4">{pros.map((p) => <ProCard key={p.id} p={p} locale={locale} />)}</ul>
          <SeeAll href="/profesionales" label={t("seeAllPros")} />
        </section>
      )}
      {places.length > 0 && (
        <section aria-label={near ? t("placesNear") : t("placesReviews")} className="mt-6">
          <ul className="flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{places.map((p) => <PlaceCard key={p.slug} p={p} en={en} />)}</ul>
          <SeeAll href="/categorias" label={t("seeAllPlaces")} />
        </section>
      )}
    </div>
  );
}

function readNear(raw: string | undefined): { lat: number; lng: number } | null {
  const m = raw ? /^(-?\d{1,2}\.\d{1,3}),(-?\d{1,3}\.\d{1,3})$/.exec(raw) : null;
  return m ? { lat: Number(m[1]), lng: Number(m[2]) } : null;
}

async function feedProfessionals(near: { lat: number; lng: number } | null): Promise<ProfessionalCardData[]> {
  try {
    const filters = (near ? { sortBy: "cercania", nearLat: near.lat, nearLng: near.lng } : { sortBy: "rating" }) as Parameters<typeof searchProfessionals>[0];
    const all = await Promise.race([searchProfessionals(filters), new Promise<ProfessionalCardData[]>((r) => setTimeout(() => r([]), 2500))]);
    const list = near ? all : all.filter((p) => p.reviewCount > 0).sort((a, b) => b.reviewCount - a.reviewCount || b.ratingAvg - a.ratingAvg);
    return list.slice(0, 5);
  } catch {
    return [];
  }
}

function SeeAll({ href, label }: { href: string; label: string }) {
  return <Link href={href} prefetch={false} className="mx-4 mt-3 flex h-11 items-center justify-center gap-1 rounded-full border border-[#d7e1ea] text-[14px] font-bold text-[#162543]">{label}<ChevronRight className="h-4 w-4" aria-hidden /></Link>;
}

function Rating({ avg, count, en }: { avg: number | null; count: number; en: boolean }) {
  if (!count || avg == null) return null;
  return (
    <span className="flex items-center gap-1 text-[13px]">
      <Star className="h-3.5 w-3.5 fill-[#f59e0b] text-[#f59e0b]" aria-hidden />
      <span className="font-bold text-[#162543]">{avg.toFixed(1)}</span>
      <span className="text-[#6b7a8f]">({count} {en ? (count === 1 ? "review" : "reviews") : (count === 1 ? "reseña" : "reseñas")})</span>
    </span>
  );
}

function ProCard({ p, locale }: { p: ProfessionalCardData; locale: string }) {
  const photos = ((p as ProfessionalCardData & { casePhotos?: string[] }).casePhotos ?? []).filter(Boolean);
  const avatar = p.avatarUrl
    // eslint-disable-next-line @next/next/no-img-element -- remote avatar
    ? <img src={p.avatarUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
    : <span className="grid h-full w-full place-items-center bg-[#eef6fa] text-[40px] font-extrabold text-[#0083b0]">{p.fullName.slice(0, 1)}</span>;
  return (
    <li>
      <Link href={`/profesionales/${p.slug}`} prefetch={false} data-home-feed-pro className="block overflow-hidden rounded-2xl border border-[#e5e9ee] bg-white">
        {/* Work photos pass by themselves with the profile photo in a corner; without them, the profile photo fills it. */}
        <span className="relative block aspect-[4/3] w-full overflow-hidden bg-[#eef6fa]">
          {photos.length > 0 ? <FeedPhotoCarousel photos={photos} /> : avatar}
          {photos.length > 0 && <span className="absolute bottom-3 left-3 h-14 w-14 overflow-hidden rounded-full border-[3px] border-white bg-white shadow-md">{avatar}</span>}
        </span>
        <span className="flex flex-col gap-0.5 px-4 py-3">
          <span className="line-clamp-1 text-[17px] font-extrabold text-[#162543]">{p.fullName}</span>
          <span className="line-clamp-1 text-[13.5px] font-semibold text-[#526277]">{getCategoryLabel(p.categoryId, locale)}</span>
          <Rating avg={p.ratingAvg} count={p.reviewCount} en={locale === "en"} />
          {p.provinceName && <span className="flex items-center gap-1 text-[12.5px] text-[#6b7a8f]"><MapPin className="h-3 w-3" aria-hidden /><span className="line-clamp-1">{p.cantonName || p.provinceName}</span></span>}
        </span>
      </Link>
    </li>
  );
}

function PlaceCard({ p, en }: { p: FeedPlace; en: boolean }) {
  const vertical = placeSection(p.section)?.id ?? p.section;
  const label = DIRECTORY_SECTION_LABELS[p.section]?.[en ? "en" : "es"] ?? "";
  const km = p.distanceKm != null ? (p.distanceKm < 1 ? `${Math.round(p.distanceKm * 1000)} m` : `${p.distanceKm.toFixed(1)} km`) : null;
  return (
    <li className="w-[220px] shrink-0 snap-start">
      <Link href={`/lugar/${p.slug}`} prefetch={false} data-home-feed-place className="flex h-full flex-col overflow-hidden rounded-2xl border border-[#e5e9ee] bg-white">
        <span className="block aspect-[16/10] w-full overflow-hidden">
          {p.photo
            // eslint-disable-next-line @next/next/no-img-element -- place photo served by our own photo route
            ? <img src={p.photo} alt="" className="h-full w-full object-cover" loading="lazy" />
            : <HeroTile verticalId={vertical} className="h-full w-full" iconClass="h-7 w-7" />}
        </span>
        <span className="flex flex-1 flex-col gap-0.5 px-3 py-2.5">
          <span className="line-clamp-1 text-[15px] font-extrabold text-[#162543]">{p.name}</span>
          <Rating avg={p.average} count={p.count} en={en} />
          <span className="line-clamp-1 text-[12.5px] text-[#6b7a8f]">{[label, km ?? p.area].filter(Boolean).join(" · ")}</span>
        </span>
      </Link>
    </li>
  );
}

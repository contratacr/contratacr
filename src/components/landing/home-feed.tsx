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
import type { ProfessionalCardData } from "@/lib/data/mock-professionals";

/**
 * Phone home with the directory on (owner, 2026-11-26, Yelp style): the page opens on recommendations. Two lists that
 * look different on purpose — professionals (people: round photo) and businesses (compact rows with a small photo or
 * icon) — ordered by number of reviews, or by distance when the visitor chose "Cerca de mí". Real data only.
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
      {pros.length > 0 && (
        <section className="mt-5">
          <h2 className="mb-3 px-4 text-[20px] font-extrabold leading-tight text-[#162543]">{near ? t("prosNear") : t("prosReviews")}</h2>
          <ul className="space-y-3 px-4">{pros.map((p) => <ProRow key={p.id} p={p} locale={locale} />)}</ul>
          <SeeAll href="/profesionales" label={t("seeAllPros")} />
        </section>
      )}
      {places.length > 0 && (
        <section className="mt-7">
          <h2 className="mb-1 px-4 text-[20px] font-extrabold leading-tight text-[#162543]">{near ? t("placesNear") : t("placesReviews")}</h2>
          <ul className="divide-y divide-[#eef2f6] px-4">{places.map((p) => <PlaceRow key={p.slug} p={p} en={en} />)}</ul>
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

function ProRow({ p, locale }: { p: ProfessionalCardData; locale: string }) {
  return (
    <li>
      <Link href={`/profesionales/${p.slug}`} prefetch={false} className="flex items-center gap-4 rounded-2xl border border-[#e5e9ee] bg-white p-3.5">
        <span className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-full bg-[#eef6fa]">
          {p.avatarUrl
            // eslint-disable-next-line @next/next/no-img-element -- small remote avatar in a feed row
            ? <img src={p.avatarUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
            : <span className="text-[22px] font-extrabold text-[#0083b0]">{p.fullName.slice(0, 1)}</span>}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="line-clamp-1 text-[16px] font-extrabold text-[#162543]">{p.fullName}</span>
          <span className="line-clamp-1 text-[13px] font-semibold text-[#526277]">{getCategoryLabel(p.categoryId, locale)}</span>
          <Rating avg={p.ratingAvg} count={p.reviewCount} en={locale === "en"} />
          {p.provinceName && <span className="flex items-center gap-1 text-[12px] text-[#6b7a8f]"><MapPin className="h-3 w-3" aria-hidden /><span className="line-clamp-1">{p.cantonName || p.provinceName}</span></span>}
        </span>
      </Link>
    </li>
  );
}

function PlaceRow({ p, en }: { p: FeedPlace; en: boolean }) {
  const vertical = placeSection(p.section)?.id ?? p.section;
  const label = DIRECTORY_SECTION_LABELS[p.section]?.[en ? "en" : "es"] ?? "";
  const km = p.distanceKm != null ? (p.distanceKm < 1 ? `${Math.round(p.distanceKm * 1000)} m` : `${p.distanceKm.toFixed(1)} km`) : null;
  return (
    <li>
      <Link href={`/lugar/${p.slug}`} prefetch={false} className="flex items-center gap-3.5 py-3">
        <span className="h-14 w-14 shrink-0 overflow-hidden rounded-xl">
          {p.photo
            // eslint-disable-next-line @next/next/no-img-element -- place photo served by our own photo route
            ? <img src={p.photo} alt="" className="h-full w-full object-cover" loading="lazy" />
            : <HeroTile verticalId={vertical} className="h-full w-full" iconClass="h-6 w-6" />}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="line-clamp-1 text-[15.5px] font-extrabold text-[#162543]">{p.name}</span>
          <Rating avg={p.average} count={p.count} en={en} />
          <span className="line-clamp-1 text-[12.5px] text-[#6b7a8f]">{[label, km ?? p.area].filter(Boolean).join(" · ")}</span>
        </span>
        <ChevronRight className="h-5 w-5 shrink-0 text-[#c2c7cc]" aria-hidden />
      </Link>
    </li>
  );
}

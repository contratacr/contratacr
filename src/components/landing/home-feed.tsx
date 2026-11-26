import { Star, ChevronRight, MapPin } from "lucide-react";
import { getLocale } from "next-intl/server";
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
  const [pros, restaurantes, cafes] = await Promise.all([
    topProfessionals(),
    loadTopPlaces("restaurantes"),
    loadTopPlaces("cafes"),
  ]);
  return (
    <div data-home-feed className="space-y-6 pb-4 pt-4">
      <Band title={en ? "Top-rated professionals" : "Profesionales mejor calificados"} href="/profesionales" all={en ? "See all" : "Ver todos"} show={pros.length > 0}>
        {pros.map((p) => <ProCard key={p.id} p={p} locale={locale} />)}
      </Band>
      <Band title={en ? "Top-rated restaurants" : "Restaurantes mejor calificados"} href="/restaurantes" all={en ? "See all" : "Ver todos"} show={restaurantes.length > 0}>
        {restaurantes.map((p) => <PlaceCardMini key={p.slug} p={p} en={en} />)}
      </Band>
      <Band title={en ? "Top-rated cafés" : "Cafés mejor calificados"} href="/cafes" all={en ? "See all" : "Ver todos"} show={cafes.length > 0}>
        {cafes.map((p) => <PlaceCardMini key={p.slug} p={p} en={en} />)}
      </Band>
    </div>
  );
}

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
      <div className="mb-2.5 flex items-center justify-between px-4">
        <h2 className="text-[18px] font-extrabold leading-tight text-[#162543]">{title}</h2>
        <Link href={href} prefetch={false} className="inline-flex items-center gap-0.5 text-[14px] font-bold text-[#0083b0]">{all}<ChevronRight className="h-4 w-4" aria-hidden /></Link>
      </div>
      <ul className="flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{children}</ul>
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
  return (
    <li className="w-[168px] shrink-0 snap-start">
      <Link href={`/profesionales/${p.slug}`} prefetch={false} className="flex h-full flex-col overflow-hidden rounded-2xl border border-[#e5e9ee] bg-white">
        <span className="grid h-[112px] shrink-0 place-items-center overflow-hidden bg-[#eef6fa]">
          {p.avatarUrl
            // eslint-disable-next-line @next/next/no-img-element -- small remote avatar in a feed card
            ? <img src={p.avatarUrl} alt="" className="h-[112px] w-full object-cover" loading="lazy" />
            : <span className="grid h-16 w-16 place-items-center rounded-full bg-white text-[22px] font-extrabold text-[#0083b0]">{p.fullName.slice(0, 1)}</span>}
        </span>
        <span className="flex flex-1 flex-col gap-1 p-3">
          <span className="line-clamp-1 text-[15px] font-extrabold text-[#162543]">{p.fullName}</span>
          <span className="line-clamp-1 text-[12.5px] font-semibold text-[#526277]">{getCategoryLabel(p.categoryId, locale)}</span>
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
    <li className="w-[168px] shrink-0 snap-start">
      <Link href={`/lugar/${p.slug}`} prefetch={false} className="flex h-full flex-col overflow-hidden rounded-2xl border border-[#e5e9ee] bg-white">
        {p.photo
          // eslint-disable-next-line @next/next/no-img-element -- place photo served by our own photo route
          ? <img src={p.photo} alt="" className="h-[112px] w-full shrink-0 object-cover" loading="lazy" />
          : <HeroTile verticalId={vertical} className="h-[112px] w-full" iconClass="h-9 w-9" />}
        <span className="flex flex-1 flex-col gap-1 p-3">
          <span className="line-clamp-1 text-[15px] font-extrabold text-[#162543]">{p.name}</span>
          {p.average != null && <Rating avg={p.average} count={p.count} en={en} />}
          {p.area && <span className="flex items-center gap-1 text-[12px] text-[#6b7a8f]"><MapPin className="h-3 w-3" aria-hidden /><span className="line-clamp-1">{p.area}</span></span>}
        </span>
      </Link>
    </li>
  );
}

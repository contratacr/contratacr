import { Star, ChevronRight, MapPin } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { searchProfessionals } from "@/lib/queries/professionals";
import { getCategoryLabel } from "@/lib/data/categories";
import { loadTopPlaces, type TopPlace, type FeedPlace } from "@/components/directory/app-home-data";
import { DIRECTORY_SECTION_LABELS } from "@/lib/search/directory-search";
import { FeedPhotoCarousel } from "@/components/landing/feed-photo-carousel";
import type { ProfessionalCardData } from "@/lib/data/mock-professionals";

/**
 * Phone home with the directory on (owner, 2026-11-26, Yelp style): the page opens on recommendations, without headings.
 * Every professional with reviews top to bottom (most reviews first; work photos passing by, profile photo in a corner), and
 * every few of them one business section left to right. Real data only.
 */
export async function HomeFeed() {
  const locale = await getLocale();
  const en = locale === "en";
  const t = await getTranslations("homeFeed");
  const [pros, ...strips] = await Promise.all([feedProfessionals(), ...STRIP_SECTIONS.map((s) => loadTopPlaces(s))]);
  const rows = STRIP_SECTIONS.map((section, n) => ({ section, places: strips[n] })).filter((r) => r.places.length > 0);
  // Every PROS_PER_STRIP professionals, one business strip; strips left over go after the last professional.
  const blocks: ({ kind: "pro"; p: ProfessionalCardData } | { kind: "strip"; section: string; places: TopPlace[] })[] = [];
  let next = 0;
  pros.forEach((p, i) => {
    blocks.push({ kind: "pro", p });
    if ((i + 1) % PROS_PER_STRIP === 0 && next < rows.length) blocks.push({ kind: "strip", ...rows[next++] });
  });
  while (next < rows.length) blocks.push({ kind: "strip", ...rows[next++] });
  return (
    <div data-home-feed className="space-y-4 pb-8 pt-4">
      {blocks.length === 0 && (
        <div className="px-4 pt-6">
          <h2 className="text-[22px] font-extrabold leading-tight text-[#162543]">{t("emptyTitle")}</h2>
          <p className="mt-2 text-[15px] text-[#526277]">{t("emptyBody")}</p>
        </div>
      )}
      {blocks.map((b) => b.kind === "pro"
        ? <div key={b.p.id} className="px-4"><ProCard p={b.p} locale={locale} /></div>
        : (
          <section key={b.section} data-home-feed-strip={b.section} aria-label={DIRECTORY_SECTION_LABELS[b.section]?.[en ? "en" : "es"]} className="py-1">
            <Link href={`/${b.section}`} prefetch={false} className="mb-2 flex items-center gap-0.5 px-4 text-[16px] font-extrabold text-[#162543]">
              {DIRECTORY_SECTION_LABELS[b.section]?.[en ? "en" : "es"]}<ChevronRight className="h-4 w-4 text-[#7a899d]" aria-hidden />
            </Link>
            <ul className="flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {[...b.places].sort((x, y) => y.count - x.count).map((p, n) => <PlaceCard key={p.slug} p={{ ...p, distanceKm: null }} en={en} rank={n + 1} />)}
            </ul>
          </section>
        ))}
    </div>
  );
}

/** Owner, 2026-11-26: professionals top to bottom; every few of them, one business section left to right, in this order. */
const PROS_PER_STRIP = 3;
const STRIP_SECTIONS = ["restaurantes", "farmacias", "cafes", "supermercados", "gasolineras", "talleres", "belleza", "ferreterias", "veterinarias", "gimnasios", "hospedaje", "tours", "salud", "pulperias", "bancos", "parqueos", "lavacar", "atracciones", "tiendas", "mercados-y-carnicerias"];

async function feedProfessionals(): Promise<ProfessionalCardData[]> {
  try {
    const all = await Promise.race([searchProfessionals({ sortBy: "rating" } as Parameters<typeof searchProfessionals>[0]), new Promise<ProfessionalCardData[]>((r) => setTimeout(() => r([]), 2500))]);
    // Most reviews first; then everyone else (with a photo first), so the feed never stops at two cards.
    const reviewed = all.filter((p) => p.reviewCount > 0).sort((a, b) => b.reviewCount - a.reviewCount || b.ratingAvg - a.ratingAvg);
    const rest = all.filter((p) => !(p.reviewCount > 0)).sort((a, b) => Number(!!b.avatarUrl) - Number(!!a.avatarUrl));
    return [...reviewed, ...rest].slice(0, 30);
  } catch {
    return [];
  }
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
  // No photo at all (owner 2026-11-26): a compact text card with a small initial, never a giant letter.
  if (!photos.length && !p.avatarUrl) {
    return (
      <article>
        <Link href={`/profesionales/${p.slug}`} prefetch={false} data-home-feed-pro className="flex items-center gap-3.5 rounded-2xl border border-[#e5e9ee] bg-white p-4">
          <span aria-hidden className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#eef6fa] text-[18px] font-extrabold text-[#0083b0]">{p.fullName.slice(0, 1)}</span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="line-clamp-1 text-[16px] font-extrabold text-[#162543]">{p.fullName}</span>
            <span className="line-clamp-1 text-[13px] font-semibold text-[#526277]">{getCategoryLabel(p.categoryId, locale)}</span>
            <Rating avg={p.ratingAvg} count={p.reviewCount} en={locale === "en"} />
            {p.provinceName && <span className="flex items-center gap-1 text-[12.5px] text-[#6b7a8f]"><MapPin className="h-3 w-3" aria-hidden /><span className="line-clamp-1">{p.cantonName || p.provinceName}</span></span>}
          </span>
        </Link>
      </article>
    );
  }
  return (
    <article>
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
    </article>
  );
}

function PlaceCard({ p, en, rank }: { p: FeedPlace; en: boolean; rank: number }) {
  const label = DIRECTORY_SECTION_LABELS[p.section]?.[en ? "en" : "es"] ?? "";
  const km = p.distanceKm != null ? (p.distanceKm < 1 ? `${Math.round(p.distanceKm * 1000)} m` : `${p.distanceKm.toFixed(1)} km`) : null;
  const where = km ?? p.area ?? label;
  return (
    <li className={p.photo ? "w-[220px] shrink-0 snap-start" : "w-[200px] shrink-0 snap-start"}>
      <Link href={`/lugar/${p.slug}`} prefetch={false} data-home-feed-place className="flex h-full flex-col overflow-hidden rounded-2xl border border-[#e5e9ee] bg-white">
        {/* With a photo, the photo; without one (owner 2026-11-26) a text card: its position, the name large, stars and area. */}
        {p.photo ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- place photo served by our own photo route */}
            <img src={p.photo} alt="" className="aspect-[16/10] w-full object-cover" loading="lazy" />
            <span className="flex flex-1 flex-col gap-0.5 px-3 py-2.5">
              <span className="line-clamp-1 text-[15px] font-extrabold text-[#162543]">{rank}. {p.name}</span>
              <Rating avg={p.average} count={p.count} en={en} />
              <span className="line-clamp-1 text-[12.5px] text-[#6b7a8f]">{where}</span>
            </span>
          </>
        ) : (
          <span className="flex flex-1 flex-col gap-1.5 p-3.5">
            <span className="line-clamp-2 text-[15.5px] font-extrabold leading-snug text-[#162543]">{rank}. {p.name}</span>
            <Rating avg={p.average} count={p.count} en={en} />
            {where && <span className="flex items-center gap-1 text-[12.5px] text-[#6b7a8f]"><MapPin className="h-3 w-3 shrink-0" aria-hidden /><span className="line-clamp-1">{where}</span></span>}
          </span>
        )}
      </Link>
    </li>
  );
}

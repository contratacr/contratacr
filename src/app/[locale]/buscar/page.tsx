import { Suspense } from "react";
import { getTranslations, getLocale } from "next-intl/server";
import Link from "next/link";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";
import { LandingNavbar } from "@/components/landing/landing-navbar";
import { LandingFooter } from "@/components/landing/landing-footer";
import { SearchFilters, MobileServiceSearch } from "@/components/search/search-filters";
import { ProfessionalCard } from "@/components/professionals/professional-card";
import { SaveableCard } from "@/components/professionals/save-button";
import { searchProfessionals } from "@/lib/queries/professionals";
import { primaryPricingLabel } from "@/lib/pricing";
import { PROVINCES, nearestProvinceId } from "@/lib/data/cr-geography";
import { SearchResultsLayout } from "@/components/search/search-results-layout";
import { createClient } from "@/lib/supabase/server";
import { safeGetUser } from "@/lib/supabase/get-user";
import type { ScheduleSlot } from "@/components/professionals/professional-schedule";

const PAGE_SIZE = 9;

interface SearchPageProps {
  searchParams: Promise<{
    categoria?: string;
    provincia?: string;
    canton?: string;
    sortBy?: string;
    q?: string;
    page?: string;
    verificados?: string;
    aseguradora?: string;
    lat?: string;
    lng?: string;
    // "Buscar en esta área" — the map's visible bounds (N/S/E/W).
    n?: string;
    s?: string;
    e?: string;
    w?: string;
  }>;
}

const MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const params = await searchParams;
  const t = await getTranslations("search");
  const tCat = await getTranslations("categories");
  const locale = await getLocale();

  const currentPage = Math.max(1, parseInt(params.page ?? "1", 10) || 1);

  // Who is viewing — so we can hide self-service actions on a pro's OWN card.
  // safeGetUser never throws on a stale session (would otherwise crash this
  // public page for returning users with an expired token).
  const supabaseViewer = await createClient();
  const viewer = await safeGetUser(supabaseViewer);
  const viewerProfileId = viewer?.id;

  // "Buscar en esta área" → filter to the map's visible viewport (ADDS to the active
  // filters; the map sends N/S/E/W when the user searches the moved area).
  const mapBounds = params.n && params.s && params.e && params.w
    ? { north: Number(params.n), south: Number(params.s), east: Number(params.e), west: Number(params.w) }
    : undefined;

  const allResults = await searchProfessionals({
    categoryId: params.categoria,
    provinceId: params.provincia,
    cantonId: params.canton,
    sortBy: params.sortBy,
    query: params.q,
    verifiedOnly: params.verificados === "1",
    insurerId: params.aseguradora,
    nearLat: params.lat ? Number(params.lat) : undefined,
    nearLng: params.lng ? Number(params.lng) : undefined,
    bounds: mapBounds,
  });

  // "Disponibilidad inmediata" sort — order pros by their SOONEST upcoming bookable
  // slot (those with no upcoming slots go last). Done here (not in the SQL query)
  // because slots live in a separate table; best-effort, falls back to default order.
  let orderedResults = allResults;
  if (params.sortBy === "availability") {
    try {
      const supabase = await createClient();
      const todayISO = new Date().toISOString().slice(0, 10);
      const ids = allResults.filter((p) => p.availabilityPublic !== false).map((p) => p.id);
      const earliest: Record<string, string> = {};
      if (ids.length > 0) {
        const { data } = await supabase
          .from("availability_slots")
          .select("professional_id, slot_date, slot_time")
          .in("professional_id", ids)
          .gte("slot_date", todayISO)
          .order("slot_date")
          .order("slot_time")
          .limit(3000);
        for (const r of data ?? []) {
          const pid = r.professional_id as string;
          const key = `${r.slot_date}T${String(r.slot_time).slice(0, 5)}`;
          if (!earliest[pid] || key < earliest[pid]) earliest[pid] = key;
        }
      }
      orderedResults = [...allResults].sort((a, b) => {
        const ea = earliest[a.id];
        const eb = earliest[b.id];
        if (ea && eb) return ea < eb ? -1 : ea > eb ? 1 : 0;
        if (ea) return -1;
        if (eb) return 1;
        return 0;
      });
    } catch {
      /* fall back to default order */
    }
  }

  const totalPages = Math.max(1, Math.ceil(allResults.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const results = orderedResults.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  // Fetch upcoming published slots for the professionals on THIS page so each
  // card can show inline availability (Hulihealth-style). Private pros are
  // skipped — their slots must not appear.
  const slotsByPro: Record<string, ScheduleSlot[]> = {};
  const publicIds = results.filter((p) => p.availabilityPublic !== false).map((p) => p.id);
  if (publicIds.length > 0) {
    try {
      const supabase = await createClient();
      const todayISO = new Date().toISOString().slice(0, 10);
      let slotRows: Record<string, unknown>[] | null = null;
      ({ data: slotRows } = await supabase
        .from("availability_slots")
        .select("professional_id, slot_date, slot_time, location_id, category_id")
        .in("professional_id", publicIds)
        .gte("slot_date", todayISO)
        .order("slot_date")
        .order("slot_time")
        .limit(400));
      if (!slotRows) {
        // Pre-migration fallback (no category_id column).
        ({ data: slotRows } = await supabase
          .from("availability_slots")
          .select("professional_id, slot_date, slot_time, location_id")
          .in("professional_id", publicIds)
          .gte("slot_date", todayISO)
          .order("slot_date")
          .order("slot_time")
          .limit(400));
      }
      for (const r of slotRows ?? []) {
        (slotsByPro[r.professional_id as string] ??= []).push({
          date: r.slot_date as string,
          time: String(r.slot_time).slice(0, 5),
          locationId: (r as { location_id?: string }).location_id ?? null,
          categoryId: (r as { category_id?: string }).category_id ?? null,
        });
      }
    } catch {
      /* best-effort — cards just render without the strip */
    }
  }

  // Map pins for every matching professional (fixed-location → exact coords;
  // mobile pros → province centroid).
  // One pin per professional — or one pin per workplace when they have fixed
  // locations (each workplace shows on the map geographically).
  const mapData = allResults.flatMap((pro) => {
    const base = {
      id: pro.id,
      proId: pro.id,
      slug: pro.slug,
      fullName: pro.fullName,
      avatarUrl: pro.avatarUrl ?? null,
      ratingAvg: pro.ratingAvg,
      reviewCount: pro.reviewCount,
      categoryLabel: pro.categoryId ? tCat(pro.categoryId as Parameters<typeof tCat>[0]) : undefined,
      // Profession labels + verified flag power the pin popup mini-card.
      professions: ((pro.professions && pro.professions.length > 0) ? pro.professions : (pro.categoryId ? [pro.categoryId] : []))
        .map((id) => tCat(id as Parameters<typeof tCat>[0])),
      verified: pro.verificationStatus === "verified",
      hourlyRate: pro.hourlyRate ?? null,
      priceLabel: primaryPricingLabel(pro.pricing, pro.hourlyRate),
      provinceName: pro.provinceName,
    };
    const places = (pro.workplaces ?? []).filter((w) => typeof w.lat === "number" && typeof w.lng === "number");
    if (places.length > 0) {
      return places.map((w, i) => ({ ...base, id: `${pro.id}-${w.id ?? i}`, lat: w.lat as number, lng: w.lng as number }));
    }
    return [{ ...base, lat: pro.lat ?? null, lng: pro.lng ?? null }];
  });

  // Number the cards on THIS page (1..N top-to-bottom) and pass the same numbers
  // to the map so each pin shows its card's number (item 9, Hulihealth-style).
  const numbering: Record<string, number> = {};
  results.forEach((pro, i) => { numbering[pro.id] = i + 1; });

  const activeCategoryId = params.categoria && params.categoria !== "todas" ? params.categoria : undefined;
  const activeProvince = params.provincia && params.provincia !== "todas"
    ? PROVINCES.find((p) => p.id === params.provincia)
    : undefined;
  const activeCanton = activeProvince && params.canton && params.canton !== "todos"
    ? activeProvince.cantons.find((c) => c.id === params.canton)
    : undefined;

  const pageTitle = activeCategoryId
    ? tCat(activeCategoryId as Parameters<typeof tCat>[0])
    : t("title.default");

  // Area-aware count label: the cantón (most specific) → the province → the searched map
  // AREA (bounds centroid → nearest province) → generic "en Costa Rica". So the count and
  // the place name always match what's actually being searched.
  let areaName = activeCanton?.name ?? activeProvince?.name;
  if (!areaName && mapBounds) {
    const cLat = (mapBounds.north + mapBounds.south) / 2;
    const cLng = (mapBounds.east + mapBounds.west) / 2;
    areaName = PROVINCES.find((p) => p.id === nearestProvinceId(cLat, cLng))?.name;
  }
  const subtitle = areaName
    ? t("resultsIn", { count: allResults.length, location: areaName })
    : t("resultsInCR", { count: allResults.length });

  function buildPageUrl(page: number) {
    const next = new URLSearchParams();
    if (params.q) next.set("q", params.q);
    if (params.categoria && params.categoria !== "todas") next.set("categoria", params.categoria);
    if (params.provincia && params.provincia !== "todas") next.set("provincia", params.provincia);
    if (params.canton && params.canton !== "todos") next.set("canton", params.canton);
    if (params.sortBy && params.sortBy !== "rating") next.set("sortBy", params.sortBy);
    if (params.verificados === "1") next.set("verificados", "1");
    if (params.aseguradora && params.aseguradora !== "todas") next.set("aseguradora", params.aseguradora);
    if (params.lat) next.set("lat", params.lat);
    if (params.lng) next.set("lng", params.lng);
    // Preserve the searched map area across pagination.
    if (params.n) next.set("n", params.n);
    if (params.s) next.set("s", params.s);
    if (params.e) next.set("e", params.e);
    if (params.w) next.set("w", params.w);
    if (page > 1) next.set("page", String(page));
    const qs = next.toString();
    return qs ? `?${qs}` : "?";
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#f4f7fa]">
      {/* Same app-wide header as every page; it's fixed, so reserve its height. */}
      <LandingNavbar />
      <div className="h-16" aria-hidden />

      {/* Top bar — title + subtitle. Background MATCHES the page/results area (#f4f7fa)
          and is FLUSH with it: no shadow, divider or raised band, so the title reads as
          part of one continuous page. A brand accent bar sits to the left of the title.
          HIDDEN on mobile (Yelp layout) so the map gets full prominence — the in-sheet
          count carries the result total there. */}
      <div className="hidden lg:block bg-[#f4f7fa]">
        <div className="mx-auto max-w-[1920px] px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 h-6 w-1.5 shrink-0 rounded-full bg-[#009FD9]" aria-hidden />
            <div className="min-w-0">
              <h1 className="text-xl font-bold leading-tight text-[#111827]">{pageTitle}</h1>
              {/* On mobile the count is shown in the results panel (above the list); avoid
                  duplicating it here. Desktop keeps it in the header. */}
              <p className="hidden lg:block text-[#6b7280] text-[13px] leading-tight mt-0.5">{subtitle}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main content — 3-column shell (filters · results · map). On mobile the padding is
          zeroed so the Yelp map + bottom sheet go edge-to-edge; desktop keeps its gutters. */}
      <main className="flex-1">
        <div className="mx-auto max-w-[1920px] px-0 py-0 lg:px-8 lg:py-4">
          <SearchResultsLayout
            mapData={mapData}
            apiKey={MAPS_API_KEY}
            locale={locale}
            numbering={numbering}
            countLabel={subtitle}
            filters={<Suspense fallback={null}><SearchFilters /></Suspense>}
            mobileSearch={<Suspense fallback={null}><MobileServiceSearch /></Suspense>}
          >

            {/* ── Results list ── */}
            <div className="min-w-0">
              {allResults.length === 0 ? (
                <div className="text-center py-20 bg-white rounded-2xl border border-[#e5e7eb]">
                  <div className="flex justify-center mb-4">
                    <div className="w-16 h-16 rounded-full bg-[#f3f4f6] flex items-center justify-center">
                      <Search className="h-8 w-8 text-[#9ca3af]" />
                    </div>
                  </div>
                  <h2 className="text-xl font-semibold text-[#111827] mb-2">{t("noResults.title")}</h2>
                  <p className="text-[#6b7280] text-sm max-w-sm mx-auto">{t("noResults.desc")}</p>
                </div>
              ) : (
                <>
                  {/* SINGLE vertical column — one card per row. On MOBILE/tablet the card is
                      a single stacked column capped for readability (`max-w-[520px]`); on
                      DESKTOP (lg+) the card goes TWO-column (info | schedule) and fills the
                      wider results column (`lg:max-w-none`), which hugs the card width while
                      the map takes the rest (see search-results-layout). Content-driven
                      height — one card per row, each grows to its content. */}
                  <div className="flex flex-col gap-3">
                    {await Promise.all(results.map((pro, i) => (
                      // data-pro-id + scroll-mt let the map highlight/scroll to this
                      // card on pin hover; the number badge matches the map pin.
                      <div key={pro.id} id={`pro-card-${pro.id}`} data-pro-id={pro.id} className="relative w-full max-w-[520px] lg:max-w-none scroll-mt-24 rounded-2xl transition-shadow">
                        <SaveableCard pro={pro} isOwn={!!viewerProfileId && viewerProfileId === pro.profileId}>
                          <ProfessionalCard professional={pro} slots={slotsByPro[pro.id] ?? []} activeCategory={activeCategoryId} viewerProfileId={viewerProfileId} rank={i + 1} />
                        </SaveableCard>
                      </div>
                    )))}
                  </div>

                  {/* Pagination */}
                  {totalPages > 1 && (
                    <div className="mt-8 flex items-center justify-center gap-3">
                      {safePage > 1 ? (
                        <Link
                          href={buildPageUrl(safePage - 1)}
                          className="flex items-center gap-1 px-4 py-2 rounded-xl border border-[#e5e7eb] bg-white text-sm font-medium text-[#374151] hover:border-[#009FD9] hover:text-[#009FD9] transition-colors"
                        >
                          <ChevronLeft className="h-4 w-4" /> {t("pagination.prev")}
                        </Link>
                      ) : (
                        <span className="flex items-center gap-1 px-4 py-2 rounded-xl border border-[#e5e7eb] bg-[#f9fafb] text-sm font-medium text-[#d1d5db] cursor-not-allowed">
                          <ChevronLeft className="h-4 w-4" /> {t("pagination.prev")}
                        </span>
                      )}

                      <span className="text-sm text-[#6b7280] px-2">
                        {t.rich("pagination.pageOf", {
                          page: safePage,
                          total: totalPages,
                          b: (c) => <strong className="text-[#111827]">{c}</strong>,
                        })}
                      </span>

                      {safePage < totalPages ? (
                        <Link
                          href={buildPageUrl(safePage + 1)}
                          className="flex items-center gap-1 px-4 py-2 rounded-xl border border-[#e5e7eb] bg-white text-sm font-medium text-[#374151] hover:border-[#009FD9] hover:text-[#009FD9] transition-colors"
                        >
                          {t("pagination.next")} <ChevronRight className="h-4 w-4" />
                        </Link>
                      ) : (
                        <span className="flex items-center gap-1 px-4 py-2 rounded-xl border border-[#e5e7eb] bg-[#f9fafb] text-sm font-medium text-[#d1d5db] cursor-not-allowed">
                          {t("pagination.next")} <ChevronRight className="h-4 w-4" />
                        </span>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

          </SearchResultsLayout>
        </div>
      </main>

      {/* Footer hidden on mobile — the Yelp map + bottom sheet fill the screen (no scroll). */}
      <div className="hidden lg:block">
        <LandingFooter />
      </div>
    </div>
  );
}

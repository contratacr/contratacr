import { Suspense } from "react";
import { getTranslations, getLocale } from "next-intl/server";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { LandingNavbar } from "@/components/landing/landing-navbar";
import { LandingFooter } from "@/components/landing/landing-footer";
import { SearchFilters } from "@/components/search/search-filters";
import { ProfessionalCard } from "@/components/professionals/professional-card";
import { SaveableCard } from "@/components/professionals/save-button";
import { searchProfessionals } from "@/lib/queries/professionals";
import { primaryPricingLabel } from "@/lib/pricing";
import { getCategoryLabel, isHealthCategory, supportsVideoConsultCategory } from "@/lib/data/categories";
import { haversineKm, PROVINCES } from "@/lib/data/cr-geography";
import { SearchResultsLayout } from "@/components/search/search-results-layout";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { safeGetUser } from "@/lib/supabase/get-user";
import { crTodayISO } from "@/lib/time-cr";
import type { ScheduleSlot } from "@/components/professionals/professional-schedule";

interface SearchPageProps {
  searchParams: Promise<{
    categoria?: string;
    provincia?: string;
    canton?: string;
    sortBy?: string;
    q?: string;
    aseguradora?: string;
    idioma?: string;
    modalidad?: string;
    lat?: string;
    lng?: string;
    ubicacion?: string;
    // "Buscar en esta área" — the map's visible bounds (N/S/E/W).
    n?: string;
    s?: string;
    e?: string;
    w?: string;
    page?: string;
  }>;
}

const MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
const MAX_CARD_SLOTS_PER_PRO = 24;
const RESULTS_PER_PAGE = 20;

type SearchWorkplace = {
  id?: string;
  name?: string;
  address?: string;
  lat?: number;
  lng?: number;
  provinciaId?: string;
  provinceId?: string;
  cantonId?: string;
};

function isExactWorkplacePin(workplace: SearchWorkplace | undefined): workplace is SearchWorkplace & { lat: number; lng: number } {
  if (!workplace || typeof workplace.lat !== "number" || typeof workplace.lng !== "number") return false;
  return typeof workplace.address === "string" && workplace.address.trim().length > 0;
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const params = await searchParams;
  const t = await getTranslations("search");
  const locale = await getLocale();
  const catLabel = (id?: string | null) => id ? getCategoryLabel(id, locale) : "";
  const sortBy = params.sortBy && params.sortBy !== "cercania" ? params.sortBy : undefined;
  const selectedCategory = params.categoria && params.categoria !== "todas" ? params.categoria : undefined;
  const effectiveQuery = selectedCategory ? undefined : params.q;
  const parsedNearLat = params.lat ? Number(params.lat) : undefined;
  const parsedNearLng = params.lng ? Number(params.lng) : undefined;
  const nearLat = typeof parsedNearLat === "number" && Number.isFinite(parsedNearLat) ? parsedNearLat : undefined;
  const nearLng = typeof parsedNearLng === "number" && Number.isFinite(parsedNearLng) ? parsedNearLng : undefined;

  // Who is viewing — so we can hide self-service actions on a pro's OWN card.
  // safeGetUser never throws on a stale session (would otherwise crash this
  // public page for returning users with an expired token).
  const viewerPromise = createClient().then((supabaseViewer) => safeGetUser(supabaseViewer));

  // "Buscar en esta área" → filter to the map's visible viewport (ADDS to the active
  // filters; the map sends N/S/E/W when the user searches the moved area).
  const parsedMapBounds = params.n && params.s && params.e && params.w
    ? { north: Number(params.n), south: Number(params.s), east: Number(params.e), west: Number(params.w) }
    : undefined;
  const mapBounds = parsedMapBounds && Object.values(parsedMapBounds).every(Number.isFinite)
    ? parsedMapBounds
    : undefined;

  const canFilterByInsurer = isHealthCategory(params.categoria);

  const [viewer, allResults] = await Promise.all([
    viewerPromise,
    searchProfessionals({
      categoryId: selectedCategory,
      provinceId: params.provincia,
      cantonId: params.canton,
      sortBy,
      query: effectiveQuery,
      insurerId: canFilterByInsurer ? params.aseguradora : undefined,
      languageId: params.idioma,
      modality: params.modalidad === "video" || params.modalidad === "in_person" ? params.modalidad : "any",
      nearLat,
      nearLng,
      bounds: mapBounds,
    }),
  ]);
  const viewerProfileId = viewer?.id;

  // "Disponibilidad inmediata" sort — order pros by their SOONEST upcoming bookable
  // slot (those with no upcoming slots go last). Done here (not in the SQL query)
  // because slots live in a separate table; best-effort, falls back to default order.
  let orderedResults = allResults;

  // Fetch upcoming published slots for the professionals on THIS page so each
  // card can show inline availability (Hulihealth-style). Private pros are
  // skipped — their slots must not appear.
  const slotsByPro: Record<string, ScheduleSlot[]> = {};
  const earliestByPro: Record<string, string> = {};
  const videoMode = params.modalidad === "video";
  const publicIds = allResults.filter((p) => p.availabilityPublic !== false).map((p) => p.id);
  // Render the page and professional cards before availability finishes loading.
  // Each card keeps its established schedule skeleton while it refreshes client-side.
  // Availability sorting is the exception because slot timestamps determine order.
  if (publicIds.length > 0 && sortBy === "availability") {
    try {
      const supabase = createAdminClient();
      const todayISO = crTodayISO();
      const taken = new Set<string>();
      const slotLimit = 3000;
      const [takenResult, slotResult] = await Promise.all([
        supabase
          .from("bookings")
          .select("professional_id, scheduled_date, scheduled_time")
          .in("professional_id", publicIds)
          .in("status", ["pending", "confirmed", "in_progress", "awaiting_confirmation"])
          .not("scheduled_date", "is", null)
          .not("scheduled_time", "is", null),
        supabase
          .from("availability_slots")
          .select("professional_id, slot_date, slot_time, location_id, category_id")
          .in("professional_id", publicIds)
          .gte("slot_date", todayISO)
          .order("slot_date")
          .order("slot_time")
          .limit(slotLimit),
      ]);
      const takenRows = takenResult.data;
      for (const b of takenRows ?? []) {
        taken.add(`${b.professional_id}:${b.scheduled_date}:${String(b.scheduled_time).slice(0, 5)}`);
      }
      let slotRows = slotResult.data as Record<string, unknown>[] | null;
      if (!slotRows) {
        // Pre-migration fallback (no category_id column).
        ({ data: slotRows } = await supabase
          .from("availability_slots")
          .select("professional_id, slot_date, slot_time, location_id")
          .in("professional_id", publicIds)
          .gte("slot_date", todayISO)
          .order("slot_date")
          .order("slot_time")
          .limit(slotLimit));
      }
      for (const r of slotRows ?? []) {
        const professionalId = r.professional_id as string;
        const date = r.slot_date as string;
        const time = String(r.slot_time).slice(0, 5);
        if (taken.has(`${professionalId}:${date}:${time}`)) continue;
        const key = `${date}T${time}`;
        if (!earliestByPro[professionalId] || key < earliestByPro[professionalId]) earliestByPro[professionalId] = key;
        const visibleSlots = (slotsByPro[professionalId] ??= []);
        if (visibleSlots.length >= MAX_CARD_SLOTS_PER_PRO) continue;
        visibleSlots.push({
          date,
          time,
          locationId: (r as { location_id?: string }).location_id ?? null,
          categoryId: (r as { category_id?: string }).category_id ?? null,
        });
      }
    } catch {
      /* best-effort — cards just render without the strip */
    }
  }

  // Map pins only represent exact workplace pins marked on the map. Broad
  // province/canton coverage and legacy professional coordinates stay card-only.
  // "Disponibilidad inmediata" sort: order by the soonest bookable slot, reusing
  // the same availability read that powers the card strips.
  if (sortBy === "availability") {
    orderedResults = [...allResults].sort((a, b) => {
      const ea = earliestByPro[a.id];
      const eb = earliestByPro[b.id];
      if (ea && eb) return ea < eb ? -1 : ea > eb ? 1 : 0;
      if (ea) return -1;
      if (eb) return 1;
      return 0;
    });
  }

  const requestedPage = Number.parseInt(params.page ?? "1", 10);
  const totalPages = Math.max(1, Math.ceil(orderedResults.length / RESULTS_PER_PAGE));
  const currentPage = Number.isFinite(requestedPage)
    ? Math.min(Math.max(requestedPage, 1), totalPages)
    : 1;
  const resultOffset = (currentPage - 1) * RESULTS_PER_PAGE;
  const results = orderedResults.slice(resultOffset, resultOffset + RESULTS_PER_PAGE);

  // The map mirrors the current result page: only the professionals shown as
  // cards get pins. Changing pages swaps the map to the next visible set.
  const mapData = results.flatMap((pro) => {
    const base = {
      id: pro.id,
      proId: pro.id,
      slug: pro.slug,
      fullName: pro.fullName,
      businessName: pro.businessName,
      publicBusinessNameOnly: pro.publicBusinessNameOnly,
      avatarUrl: pro.avatarUrl ?? null,
      ratingAvg: pro.ratingAvg,
      reviewCount: pro.reviewCount,
      categoryLabel: catLabel(pro.categoryId),
      // Profession labels + verified flag power the pin popup mini-card.
      professions: ((pro.professions && pro.professions.length > 0) ? pro.professions : (pro.categoryId ? [pro.categoryId] : []))
        .map((id) => catLabel(id)),
      verified: pro.verificationStatus === "verified",
      hourlyRate: pro.hourlyRate ?? null,
      priceLabel: primaryPricingLabel(pro.pricing, pro.hourlyRate, locale),
      provinceName: pro.provinceName,
    };
    const places = ((pro.workplaces ?? []) as SearchWorkplace[]).filter(isExactWorkplacePin);
    if (places.length > 0) {
      return places.map((w, i) => ({ ...base, id: `${pro.id}-${w.id ?? i}`, lat: w.lat as number, lng: w.lng as number }));
    }
    return [];
  });

  // Visible cards get numbers 1..20; if one professional has several pins,
  // every pin repeats that same card number.
  const numbering: Record<string, number> = {};
  results.forEach((pro, index) => { numbering[pro.id] = index + 1; });

  const activeCategoryId = params.categoria && params.categoria !== "todas" ? params.categoria : undefined;
  const activeProvince = params.provincia && params.provincia !== "todas"
    ? PROVINCES.find((p) => p.id === params.provincia)
    : undefined;
  const activeCanton = activeProvince && params.canton && params.canton !== "todos"
    ? activeProvince.cantons.find((c) => c.id === params.canton)
    : undefined;
  const videoCompatibleSearch = !!activeCategoryId && supportsVideoConsultCategory(activeCategoryId);
  const selectedProvinceName = activeProvince?.name ?? "";
  const selectedCantonName = activeCanton?.name ?? "";
  const exactLocationActive = typeof nearLat === "number" && typeof nearLng === "number";

  function matchesSelectedPhysicalLocation(pro: (typeof results)[number]) {
    if (exactLocationActive) {
      const distances: number[] = [];
      for (const wp of (pro.workplaces ?? []) as SearchWorkplace[]) {
        if (isExactWorkplacePin(wp)) {
          distances.push(haversineKm(nearLat, nearLng, wp.lat as number, wp.lng as number));
        }
      }
      return distances.some((distance) => distance <= 25);
    }
    if (!activeProvince && !activeCanton) return true;
    const workplaces = (pro.workplaces ?? []) as SearchWorkplace[];
    if (activeCanton) {
      return pro.cantonName === selectedCantonName ||
        pro.coverage?.cantones?.includes(selectedCantonName) ||
        workplaces.some((w) => w.cantonId === activeCanton.id || w.name?.includes(selectedCantonName) || w.address?.includes(selectedCantonName));
    }
    return pro.provinceName === selectedProvinceName ||
      pro.coverage?.provincias?.includes(selectedProvinceName) ||
      workplaces.some((w) => w.provinciaId === activeProvince?.id || w.provinceId === activeProvince?.id || w.name?.includes(selectedProvinceName) || w.address?.includes(selectedProvinceName));
  }

  function shouldPreferVideoLocation(pro: (typeof results)[number]) {
    if (params.modalidad === "in_person") return false;
    if (!videoCompatibleSearch || (!pro.videoconsulta && !pro.coverage?.country)) return false;
    if (videoMode) return true;
    if (!activeProvince && !activeCanton && !exactLocationActive) return false;
    return !matchesSelectedPhysicalLocation(pro);
  }

  function shouldShowContactOnly(pro: (typeof results)[number]) {
    const preferVideo = shouldPreferVideoLocation(pro);
    if (preferVideo) return !(slotsByPro[pro.id] ?? []).some((slot) => slot.locationId === "videoconsulta");
    if (params.modalidad === "in_person") return false;
    if (!videoCompatibleSearch || (!pro.videoconsulta && !pro.coverage?.country)) return false;
    if (!activeProvince && !activeCanton && !exactLocationActive) return false;
    return !matchesSelectedPhysicalLocation(pro);
  }

  const pageTitle = activeCategoryId
    ? catLabel(activeCategoryId)
    : t("title.default");

  // Area-aware count label: exact map bounds -> "esta area"; otherwise canton
  // (most specific) -> province -> generic "en Costa Rica".
  const areaName = mapBounds ? t("thisArea") : params.ubicacion ?? activeCanton?.name ?? activeProvince?.name;
  const subtitle = areaName
    ? t("resultsIn", { count: allResults.length, location: areaName })
    : t("resultsInCR", { count: allResults.length });
  const filterInitialValues = {
    q: params.q,
    categoria: params.categoria,
    provincia: params.provincia,
    canton: params.canton,
    sortBy: params.sortBy,
    modalidad: params.modalidad,
    aseguradora: params.aseguradora,
    idioma: params.idioma,
    ubicacion: params.ubicacion,
    lat: params.lat,
    lng: params.lng,
  };
  const mapFocusTarget = mapBounds
    ? null
    : nearLat != null && nearLng != null
    ? {
        key: `coords:${nearLat.toFixed(5)},${nearLng.toFixed(5)}:${params.ubicacion ?? ""}`,
        lat: nearLat,
        lng: nearLng,
        zoom: 13,
      }
    : activeCanton && activeProvince
    ? {
        key: `canton:${activeCanton.id}`,
        label: `${activeCanton.name}, ${activeProvince.name}, Costa Rica`,
        zoom: 12,
      }
    : activeProvince
    ? {
        key: `province:${activeProvince.id}`,
        label: `${activeProvince.name}, Costa Rica`,
        zoom: 9,
      }
    : null;
  const filtersFallback = (
    <div className="rounded-2xl border border-[#e2e8ee] bg-white p-4 shadow-[0_2px_8px_rgba(15,23,42,0.05)]" aria-hidden="true">
      <div className="mb-5 flex items-center justify-between">
        <span className="ccr-delayed-loading ccr-skeleton-shimmer block h-5 w-20 rounded-md" />
        <span className="ccr-delayed-loading ccr-skeleton-shimmer block h-4 w-12 rounded-md" />
      </div>
      <div className="space-y-5">
        {[0, 1, 2, 3].map((item) => (
          <div key={item} className="space-y-2">
            <span className="ccr-delayed-loading ccr-skeleton-shimmer block h-3 w-20 rounded-md" />
            <span className="ccr-delayed-loading ccr-skeleton-shimmer block h-10 w-full rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
  const hasActiveFilters =
    !!selectedCategory ||
    !!activeProvince ||
    !!activeCanton ||
    !!mapBounds ||
    !!params.idioma ||
    !!nearLat ||
    (!!params.aseguradora && canFilterByInsurer) ||
    (!!params.sortBy && params.sortBy !== "rating" && params.sortBy !== "cercania") ||
    (!!params.modalidad && params.modalidad !== "any");
  const paginationParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (key !== "page" && value) paginationParams.set(key, value);
  }
  const pageHref = (page: number) => {
    const next = new URLSearchParams(paginationParams);
    if (page > 1) next.set("page", String(page));
    const query = next.toString();
    return query ? `/buscar?${query}` : "/buscar";
  };
  const paginationPages: Array<number | "ellipsis"> = (() => {
    if (totalPages <= 5) return Array.from({ length: totalPages }, (_, index) => index + 1);
    if (currentPage <= 3) return [1, 2, 3, "ellipsis", totalPages];
    if (currentPage >= totalPages - 2) return [1, "ellipsis", totalPages - 2, totalPages - 1, totalPages];
    return [1, "ellipsis", currentPage, "ellipsis", totalPages];
  })();

  return (
    <div className="min-h-screen flex flex-col bg-[#f4f7fa]">
      {/* Mobile keeps the header to logo + search + menu; filters float over the map. */}
      <LandingNavbar forceCompactSearch />
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
            hasActiveFilters={hasActiveFilters}
            mapFocusTarget={mapFocusTarget}
            resetKey={`${currentPage}:${paginationParams.toString()}`}
            filters={<Suspense fallback={filtersFallback}><SearchFilters initialValues={filterInitialValues} /></Suspense>}
            drawerFilters={<Suspense fallback={filtersFallback}><SearchFilters closable initialValues={filterInitialValues} /></Suspense>}
          >

            {/* ── Results list ── */}
            <div className="min-w-0">
              {allResults.length === 0 ? (
                <div className="text-center py-20 bg-white rounded-2xl border border-[#e5e7eb]">
                  <div className="flex justify-center mb-4">
                    <div className="w-16 h-16 rounded-full bg-[#EBF5FB] flex items-center justify-center">
                      <Search className="h-8 w-8 text-[#009FD9]" />
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
                          <ProfessionalCard
                            professional={pro}
                            slots={slotsByPro[pro.id] ?? []}
                            slotsInitiallyLoaded={sortBy === "availability"}
                            activeCategory={activeCategoryId}
                            viewerProfileId={viewerProfileId}
                            rank={i + 1}
                            forceContactOnly={shouldShowContactOnly(pro)}
                            preferredLocationId={shouldPreferVideoLocation(pro) ? "videoconsulta" : undefined}
                            restrictToPreferredLocation={shouldPreferVideoLocation(pro)}
                            syncScheduleWithSearchLoading
                          />
                        </SaveableCard>
                      </div>
                    )))}
                  </div>

                  {totalPages > 1 && (
                    <nav aria-label={t("pagination.label")} className="mt-5 flex flex-nowrap items-center justify-between gap-2 border-t border-[#e5e7eb] pt-4 sm:gap-3">
                      <div className="flex min-w-0 items-center gap-1 sm:gap-1.5">
                        {currentPage > 1 && (
                          <Link href={pageHref(currentPage - 1)} prefetch aria-label={t("pagination.prev")} className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-[#374151] transition hover:bg-[#EBF5FB] hover:text-[#0089BB] sm:h-10 sm:w-10">
                            <ChevronLeft className="h-4 w-4" />
                          </Link>
                        )}
                        {paginationPages.map((page, index) => page === "ellipsis" ? (
                          <span key={`ellipsis-${index}`} className="grid h-9 w-5 place-items-center text-sm text-[#9ca3af] sm:h-10 sm:w-7">...</span>
                        ) : page === currentPage ? (
                          <span key={page} aria-current="page" className="grid h-9 min-w-9 place-items-center rounded-md bg-[#009FD9] px-1.5 text-sm font-bold text-white sm:h-10 sm:min-w-10 sm:px-2">{page}</span>
                        ) : (
                          <Link key={page} href={pageHref(page)} prefetch aria-label={t("pagination.status", { page, total: totalPages })} className="grid h-9 min-w-9 place-items-center rounded-md px-1.5 text-sm font-medium text-[#6b7280] transition hover:bg-[#EBF5FB] hover:text-[#0089BB] sm:h-10 sm:min-w-10 sm:px-2">
                            {page}
                          </Link>
                        ))}
                      </div>
                      {currentPage < totalPages && (
                        <Link href={pageHref(currentPage + 1)} prefetch className="inline-flex h-9 min-w-24 flex-1 items-center justify-center gap-1.5 rounded-full bg-[#009FD9] px-3 text-sm font-bold text-white transition hover:bg-[#0089BB] sm:h-10 sm:max-w-64 sm:gap-2 sm:px-5">
                          {t("pagination.next")}
                          <ChevronRight className="h-4 w-4" />
                        </Link>
                      )}
                    </nav>
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

import { Suspense } from "react";
import { getTranslations, getLocale } from "next-intl/server";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { LandingNavbar } from "@/components/landing/landing-navbar";
import { LandingFooter } from "@/components/landing/landing-footer";
import { SearchFilters } from "@/components/search/search-filters";
import { ProfessionalCard } from "@/components/professionals/professional-card";
import { SaveableCard } from "@/components/professionals/save-button";
import { searchProfessionals, type ProService } from "@/lib/queries/professionals";
import { primaryPricingLabel } from "@/lib/pricing";
import { getCategoryLabel, isHealthCategory, supportsVideoConsultCategory } from "@/lib/data/categories";
import { haversineKm, PROVINCES } from "@/lib/data/cr-geography";
import { SearchResultsLayout } from "@/components/search/search-results-layout";
import { createClient } from "@/lib/supabase/server";
import { safeGetUser } from "@/lib/supabase/get-user";
import { recordServerInteraction } from "@/lib/analytics/server-events";

interface SearchPageProps {
  searchParams: Promise<{
    categoria?: string;
    provincia?: string;
    canton?: string;
    sortBy?: string;
    q?: string;
    aseguradora?: string;
    idioma?: string;
    precio?: "visible" | "quote" | "por_hora" | "por_consulta" | "por_proyecto";
    unidadPrecio?: string;
    modalidad?: string;
    lat?: string;
    lng?: string;
    ubicacion?: string;
    // "Buscar en esta area" - the map's visible bounds (N/S/E/W).
    n?: string;
    s?: string;
    e?: string;
    w?: string;
    page?: string;
    /** Regression-only cache bypass; ignored unless isolated fixtures are enabled. */
    regression?: string;
  }>;
}

const MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
const RESULTS_PER_PAGE = 20;
const SORT_OPTIONS = new Set(["rating", "cercania", "experience"]);
const PRICE_AVAILABILITY_OPTIONS = new Set(["visible", "quote"]);
const PRICE_UNIT_OPTIONS = new Set(["por_hora", "por_consulta", "por_proyecto"]);
type PriceUnit = "por_hora" | "por_consulta" | "por_proyecto";

function isPriceUnit(value: string | undefined): value is PriceUnit {
  return value !== undefined && PRICE_UNIT_OPTIONS.has(value);
}

function parseMultiParam(value: string | undefined): string[] {
  return [...new Set((value ?? "").split(",").map((item) => item.trim()).filter(Boolean))];
}

function isModality(value: string): value is "in_person" | "video" {
  return value === "in_person" || value === "video";
}

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
  const requestedSortBy = params.sortBy && SORT_OPTIONS.has(params.sortBy) ? params.sortBy : undefined;
  const legacyPriceUnit = isPriceUnit(params.precio) ? params.precio : undefined;
  const priceType = params.precio && PRICE_AVAILABILITY_OPTIONS.has(params.precio)
    ? params.precio as "visible" | "quote"
    : legacyPriceUnit
      ? "visible"
      : undefined;
  const parsedPriceUnits = parseMultiParam(params.unidadPrecio).filter(isPriceUnit);
  const priceUnits = parsedPriceUnits.length > 0
    ? parsedPriceUnits
    : legacyPriceUnit
      ? [legacyPriceUnit]
      : [];
  const modalities = parseMultiParam(params.modalidad).filter(isModality);
  const videoOnly = modalities.length === 1 && modalities[0] === "video";
  const inPersonOnly = modalities.length === 1 && modalities[0] === "in_person";
  const selectedCategory = params.categoria && params.categoria !== "todas" ? params.categoria : undefined;
  const selectedCantonId = params.canton && params.canton !== "todos" ? params.canton : undefined;
  const selectedProvinceId = params.provincia && params.provincia !== "todas"
    ? params.provincia
    : selectedCantonId
      ? PROVINCES.find((province) => province.cantons.some((canton) => canton.id === selectedCantonId))?.id
      : undefined;
  const effectiveQuery = selectedCategory ? undefined : params.q;
  const parsedNearLat = params.lat ? Number(params.lat) : undefined;
  const parsedNearLng = params.lng ? Number(params.lng) : undefined;
  const nearLat = typeof parsedNearLat === "number" && Number.isFinite(parsedNearLat) ? parsedNearLat : undefined;
  const nearLng = typeof parsedNearLng === "number" && Number.isFinite(parsedNearLng) ? parsedNearLng : undefined;
  const sortBy = nearLat !== undefined && nearLng !== undefined && requestedSortBy === "cercania"
    ? "rating"
    : requestedSortBy;

  // Who is viewing - so we can hide self-service actions on a pro's OWN card.
  // safeGetUser never throws on a stale session (would otherwise crash this
  // public page for returning users with an expired token).
  const viewerPromise = createClient().then((supabaseViewer) => safeGetUser(supabaseViewer));

  // "Buscar en esta area" filters to the map's visible viewport (ADDS to the active
  // filters; the map sends N/S/E/W when the user searches the moved area).
  const parsedMapBounds = params.n && params.s && params.e && params.w
    ? { north: Number(params.n), south: Number(params.s), east: Number(params.e), west: Number(params.w) }
    : undefined;
  const mapBounds = parsedMapBounds && Object.values(parsedMapBounds).every(Number.isFinite)
    ? parsedMapBounds
    : undefined;

  const canFilterByInsurer = isHealthCategory(params.categoria);
  const insurerIds = canFilterByInsurer ? parseMultiParam(params.aseguradora) : [];
  // Language is a single-choice filter. Older shared URLs may still contain a
  // comma-separated value, so keep the first valid choice for compatibility.
  const languageId = parseMultiParam(params.idioma)[0];

  const [viewer, allResults] = await Promise.all([
    viewerPromise,
    searchProfessionals({
      categoryId: selectedCategory,
      provinceId: selectedProvinceId,
      cantonId: selectedCantonId,
      sortBy,
      query: effectiveQuery,
      insurerIds,
      languageId,
      priceType,
      priceUnits,
      modalities,
      nearLat,
      nearLng,
      bounds: mapBounds,
    }, {
      fresh: process.env.E2E_FIXTURES_READY === "1" && Boolean(params.regression),
    }),
  ]);
  const viewerProfileId = viewer?.id;

  let orderedResults = allResults;

  const videoMode = videoOnly;

  const experienceMonths = (professional: (typeof allResults)[number]) => {
    const services = professional.services as ProService[] | undefined;
    const service = services?.find((item) => {
      if (typeof item.startedAt === "string" && item.startedAt.trim()) return true;
      const years = typeof item.years === "number" ? item.years : 0;
      const months = typeof item.months === "number" ? item.months : 0;
      return years > 0 || months > 0;
    });
    if (service?.startedAt && /^\d{4}-\d{2}$/.test(service.startedAt)) {
      const [yearRaw, monthRaw] = service.startedAt.split("-");
      const year = Number(yearRaw);
      const month = Number(monthRaw);
      if (Number.isFinite(year) && Number.isFinite(month) && month >= 1 && month <= 12) {
        const now = new Date();
        return Math.max(0, (now.getFullYear() * 12 + now.getMonth()) - (year * 12 + (month - 1)));
      }
    }
    const years = typeof service?.years === "number" ? service.years : professional.yearsExperience ?? 0;
    const months = typeof service?.months === "number" ? service.months : professional.monthsExperience ?? 0;
    return Math.max(0, years) * 12 + Math.max(0, Math.min(11, months));
  };
  const ratingTieBreak = (a: (typeof allResults)[number], b: (typeof allResults)[number]) =>
    (b.ratingAvg ?? 0) - (a.ratingAvg ?? 0) ||
    (b.reviewCount ?? 0) - (a.reviewCount ?? 0) ||
    experienceMonths(b) - experienceMonths(a);

  if (sortBy === "successCases") {
    orderedResults = [...allResults].sort((a, b) =>
      (b.portfolioCount ?? 0) - (a.portfolioCount ?? 0) || ratingTieBreak(a, b)
    );
  } else if (sortBy === "experience") {
    orderedResults = [...allResults].sort((a, b) =>
      experienceMonths(b) - experienceMonths(a) || ratingTieBreak(a, b)
    );
  } else if (sortBy === "followers") {
    orderedResults = [...allResults].sort((a, b) =>
      (b.followerCount ?? 0) - (a.followerCount ?? 0) || ratingTieBreak(a, b)
    );
  }

  // Map pins only represent exact workplace pins marked on the map. Broad
  // province/canton coverage and legacy professional coordinates stay card-only.
  const requestedPage = Number.parseInt(params.page ?? "1", 10);
  const totalPages = Math.max(1, Math.ceil(orderedResults.length / RESULTS_PER_PAGE));
  const currentPage = Number.isFinite(requestedPage)
    ? Math.min(Math.max(requestedPage, 1), totalPages)
    : 1;
  const resultOffset = (currentPage - 1) * RESULTS_PER_PAGE;
  const results = orderedResults.slice(resultOffset, resultOffset + RESULTS_PER_PAGE);
  if (currentPage === 1) {
    void recordServerInteraction({
      type: "search_performed",
      source: "search",
      locale,
      categoryId: params.categoria ?? null,
      metadata: { q: params.q ?? null, provincia: params.provincia ?? null, canton: params.canton ?? null, sortBy: params.sortBy ?? null, results: orderedResults.length },
    });
  }

  const popupMetricLabelFor = (pro: (typeof allResults)[number]): string | null => {
    if (sortBy === "experience") {
      const years = Math.floor(experienceMonths(pro) / 12);
      if (years <= 0) return null;
      return locale === "en"
        ? `${years} ${years === 1 ? "year experience" : "years experience"}`
        : `${years} ${years === 1 ? "año experiencia" : "años experiencia"}`;
    }
    if (sortBy === "successCases") {
      const count = pro.portfolioCount ?? 0;
      if (count <= 0) return null;
      return locale === "en"
        ? `${count} ${count === 1 ? "success case" : "success cases"}`
        : `${count} ${count === 1 ? "caso de éxito" : "casos de éxito"}`;
    }
    if (sortBy === "followers") {
      const count = pro.followerCount ?? 0;
      if (count <= 0) return null;
      return locale === "en"
        ? `${count} ${count === 1 ? "follower" : "followers"}`
        : `${count} ${count === 1 ? "seguidor" : "seguidores"}`;
    }
    if ((pro.reviewCount ?? 0) <= 0) return null;
    return locale === "en"
      ? `★ ${pro.ratingAvg.toFixed(1)} (${pro.reviewCount} ${pro.reviewCount === 1 ? "review" : "reviews"})`
      : `★ ${pro.ratingAvg.toFixed(1)} (${pro.reviewCount} ${pro.reviewCount === 1 ? "reseña" : "reseñas"})`;
  };
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
      popupMetricLabel: popupMetricLabelFor(pro),
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
  const activeProvince = selectedProvinceId
    ? PROVINCES.find((p) => p.id === selectedProvinceId)
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
    if (inPersonOnly) return false;
    if (!videoCompatibleSearch || (!pro.videoconsulta && !pro.coverage?.country)) return false;
    if (videoMode) return true;
    if (!activeProvince && !activeCanton && !exactLocationActive) return false;
    return !matchesSelectedPhysicalLocation(pro);
  }

  function shouldShowContactOnly(pro: (typeof results)[number]) {
    const preferVideo = shouldPreferVideoLocation(pro);
    if (preferVideo) return false;
    if (inPersonOnly) return false;
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
    provincia: selectedProvinceId,
    canton: selectedCantonId,
    sortBy: params.sortBy,
    modalidad: params.modalidad,
    aseguradora: params.aseguradora,
    idioma: languageId,
    precio: priceType,
    unidadPrecio: priceUnits.join(",") || undefined,
    ubicacion: params.ubicacion ?? (activeCanton && activeProvince ? `${activeCanton.name}, ${activeProvince.name}` : activeProvince?.name),
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
    !!languageId ||
    !!priceType ||
    priceUnits.length > 0 ||
    !!nearLat ||
    (!!params.aseguradora && canFilterByInsurer) ||
    (!!params.sortBy && params.sortBy !== "rating" && params.sortBy !== "cercania") ||
    (!!params.modalidad && params.modalidad !== "any");
  const searchReturnParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) searchReturnParams.set(key, value);
  }
  const searchReturnQuery = searchReturnParams.toString();
  const searchReturnHref = searchReturnQuery ? `/buscar?${searchReturnQuery}` : "/buscar";

  const paginationParams = new URLSearchParams(searchReturnParams);
  paginationParams.delete("page");
  const pageHref = (page: number) => {
    const next = new URLSearchParams(paginationParams);
    if (page > 1) next.set("page", String(page));
    const query = next.toString();
    return query ? `/buscar?${query}` : "/buscar";
  };
  const paginationPages: Array<number | "ellipsis"> = (() => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);

    const pages = new Set<number>([1, totalPages]);
    for (let page = currentPage - 1; page <= currentPage + 1; page += 1) {
      if (page > 1 && page < totalPages) pages.add(page);
    }
    if (currentPage <= 3) {
      pages.add(2);
      pages.add(3);
      pages.add(4);
    }
    if (currentPage >= totalPages - 2) {
      pages.add(totalPages - 3);
      pages.add(totalPages - 2);
      pages.add(totalPages - 1);
    }

    return [...pages]
      .sort((a, b) => a - b)
      .flatMap((page, index, list) => (index > 0 && page - list[index - 1] > 1 ? ["ellipsis" as const, page] : [page]));
  })();

  return (
    <div className="min-h-screen flex flex-col bg-[#f4f7fa]">
      {/* Mobile keeps the header to logo + search + menu; filters float over the map. */}
      <LandingNavbar forceCompactSearch mobileSearch />
      <div className="ccr-navbar-spacer h-16" aria-hidden />

      {/* Top bar - title + subtitle. Background MATCHES the page/results area (#f4f7fa)
          and is FLUSH with it: no shadow, divider or raised band, so the title reads as
          part of one continuous page. A brand accent bar sits to the left of the title.
          HIDDEN on mobile (Yelp layout) so the map gets full prominence - the in-sheet
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

      {/* Main content - 3-column shell (filters / results / map). On mobile the padding is
          zeroed so the Yelp map + bottom sheet go edge-to-edge; desktop keeps its gutters. */}
      <main className="flex-1 bg-[#f4f7fa]">
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
            filters={<Suspense fallback={null}><SearchFilters initialValues={filterInitialValues} /></Suspense>}
            quickFilters={<Suspense fallback={null}><SearchFilters variant="chips" initialValues={filterInitialValues} /></Suspense>}
            drawerFilters={<Suspense fallback={null}><SearchFilters closable initialValues={filterInitialValues} /></Suspense>}
          >

            {/* Results list */}
            <div className="min-w-0">
              {allResults.length === 0 ? (
                <div data-search-empty-state className="-mx-4 flex min-h-full w-[calc(100%+2rem)] flex-col items-center justify-center bg-white px-6 py-16 text-center lg:mx-0 lg:min-h-[24rem] lg:w-full lg:rounded-2xl lg:border lg:px-8 lg:py-20">
                  <div className="mb-4 flex justify-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#EBF5FB]">
                      <Search className="h-8 w-8 text-[#009FD9]" />
                    </div>
                  </div>
                  <h2 className="mb-2 text-xl font-semibold text-[#111827]">{t("noResults.title")}</h2>
                  <p className="mx-auto max-w-sm text-sm text-[#6b7280]">{t("noResults.desc")}</p>
                </div>
              ) : (
                <>
                  {/* SINGLE vertical column - one card per row. On MOBILE/tablet the card is
                      a single stacked column capped for readability (`max-w-[520px]`); on
                      DESKTOP (lg+) the card goes TWO-column (info | schedule) and fills the
                      wider results column (`lg:max-w-none`), which hugs the card width while
                      the map takes the rest (see search-results-layout). Content-driven
                      height - one card per row, each grows to its content. */}
                  <div className="ccr-search-results-list -mx-4 flex min-h-full w-[calc(100%+2rem)] min-w-0 max-w-none flex-col gap-1.5 overflow-x-clip bg-[#eef2f6] lg:mx-0 lg:min-h-0 lg:w-full lg:gap-3 lg:bg-transparent lg:overflow-visible">
                    {results.map((pro, i) => (
                      // data-pro-id + scroll-mt let the map highlight/scroll to this
                      // card on pin hover; the number badge matches the map pin.
                      <div key={pro.id} id={`pro-card-${pro.id}`} data-pro-id={pro.id} className="relative w-full scroll-mt-24 transition-shadow lg:max-w-none lg:rounded-2xl">
                        <SaveableCard pro={pro} isOwn={!!viewerProfileId && viewerProfileId === pro.profileId}>
                          <ProfessionalCard
                            professional={pro}
                            slots={[]}
                            slotsInitiallyLoaded={false}
                            activeCategory={activeCategoryId}
                            viewerProfileId={viewerProfileId}
                            rank={i + 1}
                            highlightMetric={sortBy === "experience" ? "experience" : "rating"}
                            forceContactOnly={shouldShowContactOnly(pro)}
                            preferredLocationId={shouldPreferVideoLocation(pro) ? "videoconsulta" : undefined}
                            restrictToPreferredLocation={shouldPreferVideoLocation(pro)}
                            syncScheduleWithSearchLoading
                            searchReturnHref={searchReturnHref}
                          />
                        </SaveableCard>
                      </div>
                    ))}
                  </div>

                  {totalPages > 1 && (
                    // One centred block on every size: previous · page numbers · next,
                    // with the position above and the total below. On the phone it
                    // sits on the same white surface as the sheet header, with the
                    // same side padding, so it reads as part of the list.
                    <nav aria-label={t("pagination.label")} className="-mx-4 mt-4 border-t border-[#eef2f6] bg-white px-4 pb-5 pt-4 lg:mx-0 lg:mt-6 lg:rounded-2xl lg:border lg:border-[#e5e7eb] lg:px-6">
                      <p className="text-center text-xs font-bold uppercase tracking-[0.08em] text-[#64748b]">{currentPage} / {totalPages}</p>
                      <div className="mt-3 flex items-center justify-center gap-2">
                        {currentPage > 1 ? (
                          <Link href={pageHref(currentPage - 1)} prefetch aria-label={t("pagination.prev")} className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-full border border-[#d5dfe8] bg-white px-4 text-sm font-bold text-[#162543] hover:bg-[#f8fafc]">
                            <ChevronLeft className="h-4 w-4" />
                            <span>{t("pagination.prev")}</span>
                          </Link>
                        ) : (
                          <span aria-hidden className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-full border border-[#e5e7eb] bg-white px-4 text-sm font-bold text-[#cbd5e1]">
                            <ChevronLeft className="h-4 w-4" />
                            <span>{t("pagination.prev")}</span>
                          </span>
                        )}
                        <div className="hidden items-center gap-1 rounded-full bg-[#f3f7fb] p-1 sm:flex">
                          {paginationPages.map((page, index) => page === "ellipsis" ? (
                            <span key={`ellipsis-${index}`} className="grid h-9 w-8 place-items-center text-sm font-semibold text-[#9ca3af]">…</span>
                          ) : page === currentPage ? (
                            <span key={page} aria-current="page" className="grid h-9 min-w-9 place-items-center rounded-full bg-[#009FD9] px-3 text-sm font-bold text-white shadow-sm">{page}</span>
                          ) : (
                            <Link key={page} href={pageHref(page)} prefetch aria-label={t("pagination.status", { page, total: totalPages })} className="grid h-9 min-w-9 place-items-center rounded-full px-3 text-sm font-bold text-[#475569] hover:bg-white hover:text-[#009FD9]">
                              {page}
                            </Link>
                          ))}
                        </div>
                        {currentPage < totalPages ? (
                          <Link href={pageHref(currentPage + 1)} prefetch aria-label={t("pagination.next")} className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-full bg-[#009FD9] px-4 text-sm font-bold text-white hover:bg-[#0089bb]">
                            <span>{t("pagination.next")}</span>
                            <ChevronRight className="h-4 w-4" />
                          </Link>
                        ) : (
                          <span aria-hidden className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-full border border-[#e5e7eb] bg-white px-4 text-sm font-bold text-[#cbd5e1]">
                            <span>{t("pagination.next")}</span>
                            <ChevronRight className="h-4 w-4" />
                          </span>
                        )}
                      </div>
                      <p className="mt-3 text-center text-sm font-medium text-[#64748b]">
                        {orderedResults.length.toLocaleString(locale === "en" ? "en-US" : "es-CR")} {locale === "en" ? "results" : "resultados"}
                      </p>
                    </nav>
                  )}

                  <div className="mt-6 -mx-4 lg:hidden">
                    <LandingFooter />
                  </div>

                </>
              )}
            </div>

          </SearchResultsLayout>
        </div>
      </main>

      <div className="hidden lg:block"><LandingFooter /></div>
    </div>
  );
}

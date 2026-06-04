import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Search, SlidersHorizontal, ChevronLeft, ChevronRight } from "lucide-react";
import { Navbar } from "@/components/layout/navbar";
import { LandingFooter } from "@/components/landing/landing-footer";
import { SearchFilters } from "@/components/search/search-filters";
import { ProfessionalCard } from "@/components/professionals/professional-card";
import { SaveableCard } from "@/components/professionals/save-button";
import { searchProfessionals } from "@/lib/queries/professionals";
import { PROVINCES } from "@/lib/data/cr-geography";
import { GoogleMapPanel } from "@/components/maps/google-map-panel";

const PAGE_SIZE = 9;

interface SearchPageProps {
  searchParams: Promise<{
    categoria?: string;
    provincia?: string;
    canton?: string;
    sortBy?: string;
    q?: string;
    page?: string;
  }>;
}

const MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const params = await searchParams;
  const t = await getTranslations("search");
  const tCat = await getTranslations("categories");

  const currentPage = Math.max(1, parseInt(params.page ?? "1", 10) || 1);

  const allResults = await searchProfessionals({
    categoryId: params.categoria,
    provinceId: params.provincia,
    cantonId: params.canton,
    sortBy: params.sortBy,
    query: params.q,
  });

  const totalPages = Math.max(1, Math.ceil(allResults.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const results = allResults.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const activeCategoryId = params.categoria && params.categoria !== "todas" ? params.categoria : undefined;
  const activeProvince = params.provincia && params.provincia !== "todas"
    ? PROVINCES.find((p) => p.id === params.provincia)
    : undefined;

  const pageTitle = activeCategoryId
    ? tCat(activeCategoryId as Parameters<typeof tCat>[0])
    : t("title.default");

  const subtitle = activeProvince
    ? t("resultsIn", { count: allResults.length, location: activeProvince.name })
    : t("resultsInCR", { count: allResults.length });

  function buildPageUrl(page: number) {
    const next = new URLSearchParams();
    if (params.q) next.set("q", params.q);
    if (params.categoria && params.categoria !== "todas") next.set("categoria", params.categoria);
    if (params.provincia && params.provincia !== "todas") next.set("provincia", params.provincia);
    if (params.canton && params.canton !== "todos") next.set("canton", params.canton);
    if (params.sortBy && params.sortBy !== "rating") next.set("sortBy", params.sortBy);
    if (page > 1) next.set("page", String(page));
    const qs = next.toString();
    return qs ? `?${qs}` : "?";
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#f4f7fa]">
      <Navbar />

      {/* Top bar — title + subtitle */}
      <div className="bg-white border-b border-[#e5e7eb]">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h1 className="text-xl font-bold text-[#111827]">{pageTitle}</h1>
              <p className="text-[#6b7280] text-sm mt-0.5">{subtitle}</p>
            </div>
            <div className="flex items-center gap-2 text-sm text-[#6b7280]">
              <SlidersHorizontal className="h-4 w-4" />
              <span>{t("filters.title")}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border-b border-[#e5e7eb]">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-3">
          <Suspense fallback={null}>
            <SearchFilters />
          </Suspense>
        </div>
      </div>

      {/* Main content */}
      <main className="flex-1">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex gap-6">

            {/* ── Results list ── */}
            <div className="flex-1 min-w-0">
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
                  <div className="flex flex-col gap-4">
                    {await Promise.all(results.map((pro) => (
                      <SaveableCard key={pro.id} pro={pro}>
                        <ProfessionalCard professional={pro} />
                      </SaveableCard>
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
                          <ChevronLeft className="h-4 w-4" /> Anterior
                        </Link>
                      ) : (
                        <span className="flex items-center gap-1 px-4 py-2 rounded-xl border border-[#e5e7eb] bg-[#f9fafb] text-sm font-medium text-[#d1d5db] cursor-not-allowed">
                          <ChevronLeft className="h-4 w-4" /> Anterior
                        </span>
                      )}

                      <span className="text-sm text-[#6b7280] px-2">
                        Página <strong className="text-[#111827]">{safePage}</strong> de <strong className="text-[#111827]">{totalPages}</strong>
                      </span>

                      {safePage < totalPages ? (
                        <Link
                          href={buildPageUrl(safePage + 1)}
                          className="flex items-center gap-1 px-4 py-2 rounded-xl border border-[#e5e7eb] bg-white text-sm font-medium text-[#374151] hover:border-[#009FD9] hover:text-[#009FD9] transition-colors"
                        >
                          Siguiente <ChevronRight className="h-4 w-4" />
                        </Link>
                      ) : (
                        <span className="flex items-center gap-1 px-4 py-2 rounded-xl border border-[#e5e7eb] bg-[#f9fafb] text-sm font-medium text-[#d1d5db] cursor-not-allowed">
                          Siguiente <ChevronRight className="h-4 w-4" />
                        </span>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* ── Map panel (desktop) ── */}
            <aside className="hidden xl:flex w-[420px] shrink-0">
              <div className="sticky top-20 w-full h-[calc(100vh-88px)] rounded-2xl overflow-hidden border border-[#e5e7eb] bg-white">
                <GoogleMapPanel apiKey={MAPS_API_KEY} />
              </div>
            </aside>

          </div>
        </div>
      </main>

      <LandingFooter />
    </div>
  );
}

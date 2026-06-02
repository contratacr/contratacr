import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { SearchFilters } from "@/components/search/search-filters";
import { ProfessionalCard } from "@/components/professionals/professional-card";
import { SaveableCard } from "@/components/professionals/save-button";
import { searchProfessionals } from "@/lib/queries/professionals";
import { PROVINCES } from "@/lib/data/cr-geography";

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
    ? t("title.withCategory", { category: tCat(activeCategoryId) })
    : t("title.default");

  const subtitle = activeProvince
    ? t("resultsIn", { count: allResults.length, location: activeProvince.name })
    : t("resultsInCR", { count: allResults.length });

  // Build a URL with updated page param while keeping other params
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
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1">
        <div className="bg-white border-b border-[#e5e7eb]">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
            <h1 className="text-2xl font-bold text-[#111827]">{pageTitle}</h1>
            <p className="text-[#6b7280] text-sm mt-1">{subtitle}</p>
          </div>
        </div>

        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
          <Suspense fallback={null}>
            <SearchFilters />
          </Suspense>

          <div className="mt-6">
            {allResults.length === 0 ? (
              <div className="text-center py-20">
                <div className="text-5xl mb-4">🔍</div>
                <h2 className="text-xl font-semibold text-[#111827] mb-2">{t("noResults.title")}</h2>
                <p className="text-[#6b7280] text-sm max-w-sm mx-auto">{t("noResults.desc")}</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {await Promise.all(results.map((pro) => (
                    <SaveableCard key={pro.id} pro={pro}>
                      <ProfessionalCard professional={pro} />
                    </SaveableCard>
                  )))}
                </div>

                {totalPages > 1 && (
                  <div className="mt-8 flex items-center justify-center gap-4">
                    {safePage > 1 ? (
                      <Link
                        href={buildPageUrl(safePage - 1)}
                        className="text-sm font-medium text-[#374151] hover:text-[#2563eb] transition-colors"
                      >
                        ← Anterior
                      </Link>
                    ) : (
                      <span className="text-sm font-medium text-[#d1d5db] cursor-not-allowed">
                        ← Anterior
                      </span>
                    )}

                    <span className="text-sm text-[#6b7280]">
                      Página {safePage} de {totalPages}
                    </span>

                    {safePage < totalPages ? (
                      <Link
                        href={buildPageUrl(safePage + 1)}
                        className="text-sm font-medium text-[#374151] hover:text-[#2563eb] transition-colors"
                      >
                        Siguiente →
                      </Link>
                    ) : (
                      <span className="text-sm font-medium text-[#d1d5db] cursor-not-allowed">
                        Siguiente →
                      </span>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}

import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { SearchFilters } from "@/components/search/search-filters";
import { ProfessionalCard } from "@/components/professionals/professional-card";
import { searchProfessionals } from "@/lib/queries/professionals";
import { PROVINCES } from "@/lib/data/cr-geography";

interface SearchPageProps {
  searchParams: Promise<{
    categoria?: string;
    provincia?: string;
    canton?: string;
    sortBy?: string;
  }>;
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const params = await searchParams;
  const t = await getTranslations("search");
  const tCat = await getTranslations("categories");

  const results = await searchProfessionals({
    categoryId: params.categoria,
    provinceId: params.provincia,
    cantonId: params.canton,
    sortBy: params.sortBy,
  });

  const activeCategoryId = params.categoria && params.categoria !== "todas" ? params.categoria : undefined;
  const activeProvince = params.provincia && params.provincia !== "todas"
    ? PROVINCES.find((p) => p.id === params.provincia)
    : undefined;

  const pageTitle = activeCategoryId
    ? t("title.withCategory", { category: tCat(activeCategoryId) })
    : t("title.default");

  const subtitle = activeProvince
    ? t("resultsIn", { count: results.length, location: activeProvince.name })
    : t("resultsInCR", { count: results.length });

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
            {results.length === 0 ? (
              <div className="text-center py-20">
                <div className="text-5xl mb-4">🔍</div>
                <h2 className="text-xl font-semibold text-[#111827] mb-2">{t("noResults.title")}</h2>
                <p className="text-[#6b7280] text-sm max-w-sm mx-auto">{t("noResults.desc")}</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {await Promise.all(results.map((pro) => (
                  <ProfessionalCard key={pro.id} professional={pro} />
                )))}
              </div>
            )}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}

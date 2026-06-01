import { Suspense } from "react";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { SearchFilters } from "@/components/search/search-filters";
import { ProfessionalCard } from "@/components/professionals/professional-card";
import { MOCK_PROFESSIONALS } from "@/lib/data/mock-professionals";
import { CATEGORIES, PROVINCIAS, getCantonById } from "@/lib/data/cr-geography";

interface SearchPageProps {
  searchParams: Promise<{
    categoria?: string;
    provincia?: string;
    canton?: string;
    sortBy?: string;
    q?: string;
  }>;
}

function filterAndSort(
  professionals: typeof MOCK_PROFESSIONALS,
  filters: Awaited<SearchPageProps["searchParams"]>
) {
  let results = [...professionals];

  if (filters.categoria && filters.categoria !== "todas") {
    const cat = CATEGORIES.find((c) => c.id === filters.categoria);
    if (cat) {
      results = results.filter((p) => p.category_name === cat.name);
    }
  }

  if (filters.provincia && filters.provincia !== "todas") {
    const prov = PROVINCIAS.find((p) => p.id === filters.provincia);
    if (prov) {
      results = results.filter((p) => p.provincia_name === prov.name);
    }
  }

  if (filters.canton && filters.canton !== "todos" && filters.canton !== "") {
    const canton = getCantonById(filters.canton);
    if (canton) {
      results = results.filter((p) => p.canton_name === canton.name);
    }
  }

  if (filters.q) {
    const q = filters.q.toLowerCase();
    results = results.filter(
      (p) =>
        p.full_name.toLowerCase().includes(q) ||
        p.category_name.toLowerCase().includes(q) ||
        p.bio.toLowerCase().includes(q)
    );
  }

  switch (filters.sortBy) {
    case "reviews":
      results.sort((a, b) => b.review_count - a.review_count);
      break;
    case "price_asc":
      results.sort((a, b) => (a.hourly_rate ?? 0) - (b.hourly_rate ?? 0));
      break;
    case "price_desc":
      results.sort((a, b) => (b.hourly_rate ?? 0) - (a.hourly_rate ?? 0));
      break;
    default:
      results.sort((a, b) => b.rating_avg - a.rating_avg);
  }

  return results;
}

export default async function BuscarPage({ searchParams }: SearchPageProps) {
  const filters = await searchParams;
  const results = filterAndSort(MOCK_PROFESSIONALS, filters);

  const activeCategory = CATEGORIES.find((c) => c.id === filters.categoria);
  const activeProvincia = PROVINCIAS.find((p) => p.id === filters.provincia);

  const pageTitle = activeCategory
    ? `${activeCategory.icon} ${activeCategory.name}`
    : "Todos los profesionales";

  const subtitle = activeProvincia
    ? `en ${activeProvincia.name}`
    : "en Costa Rica";

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-1">
        {/* Header */}
        <div className="bg-white border-b border-[#e5e7eb]">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
            <h1 className="text-2xl font-bold text-[#111827]">{pageTitle}</h1>
            <p className="text-[#6b7280] text-sm mt-1">
              {results.length} profesionales {subtitle}
            </p>
          </div>
        </div>

        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
          {/* Filters */}
          <Suspense fallback={null}>
            <SearchFilters />
          </Suspense>

          {/* Results */}
          <div className="mt-6">
            {results.length === 0 ? (
              <div className="text-center py-20">
                <div className="text-5xl mb-4">🔍</div>
                <h2 className="text-xl font-semibold text-[#111827] mb-2">
                  No encontramos resultados
                </h2>
                <p className="text-[#6b7280] text-sm max-w-sm mx-auto">
                  Intentá con otra categoría o expandí la zona de búsqueda.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {results.map((pro) => (
                  <ProfessionalCard key={pro.id} professional={pro} />
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}

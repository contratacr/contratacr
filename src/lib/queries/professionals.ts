import type { ProfessionalCardData } from "@/components/professionals/professional-card";
import { MOCK_PROFESSIONALS } from "@/lib/data/mock-professionals";
import { getMatchingCategoryIds } from "@/lib/data/categories";

const SUPABASE_CONFIGURED =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export type SearchFilters = {
  categoryId?: string;
  provinceId?: string;
  cantonId?: string;
  sortBy?: string;
  query?: string;
};

export type ProService = {
  id: string;
  name: string;
  description?: string;
  price?: string;
};

export type ProfessionalDetail = ProfessionalCardData & {
  portfolioUrls: string[];
  reviews: Review[];
  services: ProService[];
  availabilityPublic: boolean;
};

export type Review = {
  id: string;
  clientName: string;
  clientAvatarUrl?: string;
  rating: number;
  comment: string;
  createdAt: string;
};

// ---------------------------------------------------------------------------
// Search / list
// ---------------------------------------------------------------------------

export async function searchProfessionals(
  filters: SearchFilters
): Promise<ProfessionalCardData[]> {
  if (SUPABASE_CONFIGURED) {
    try {
      const { createClient } = await import("@/lib/supabase/server");
      const supabase = await createClient();

      let query = supabase
        .from("professionals")
        .select(
          `id, slug, hourly_rate, is_verified, is_featured, is_available,
           rating_avg, review_count, bio, whatsapp, years_experience, portfolio_urls,
           category_id, lat, lng, service_type,
           profiles(full_name, avatar_url),
           provincias(id, name),
           cantones(id, name)`
        );

      if (filters.categoryId && filters.categoryId !== "todas") {
        query = query.eq("category_id", filters.categoryId);
      }
      if (filters.provinceId && filters.provinceId !== "todas") {
        query = query.eq("provincia_id", filters.provinceId);
      }
      if (filters.cantonId && filters.cantonId !== "todos") {
        query = query.eq("canton_id", filters.cantonId);
      }
      if (filters.query) {
        const q = filters.query.trim();
        // Match text against bio/name AND expand keyword synonyms to category IDs
        const keywordCategoryIds = getMatchingCategoryIds(q);
        const textFilter = `bio.ilike.%${q}%,profiles.full_name.ilike.%${q}%,services::text.ilike.%${q}%`;
        if (keywordCategoryIds.length > 0 && !filters.categoryId) {
          // Include professionals whose category matches the keyword query
          const catFilter = keywordCategoryIds.map((id) => `category_id.eq.${id}`).join(",");
          query = query.or(`${textFilter},${catFilter}`);
        } else {
          query = query.or(textFilter);
        }
      }

      switch (filters.sortBy) {
        case "reviews":
          query = query.order("review_count", { ascending: false });
          break;
        case "priceAsc":
          query = query.order("hourly_rate", { ascending: true, nullsFirst: false });
          break;
        case "priceDesc":
          query = query.order("hourly_rate", { ascending: false, nullsFirst: false });
          break;
        case "newest":
          query = query.order("created_at", { ascending: false });
          break;
        default:
          query = query.order("rating_avg", { ascending: false });
      }

      const { data, error } = await query.limit(50);
      if (error) throw error;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((row: any) => ({
        id: row.id,
        slug: row.slug,
        fullName: row.profiles?.full_name ?? "Profesional",
        avatarUrl: row.profiles?.avatar_url ?? null,
        categoryId: row.category_id ?? "",
        categoryIcon: "",
        bio: row.bio,
        whatsapp: row.whatsapp,
        provinceName: row.provincias?.name ?? "",
        cantonName: row.cantones?.name ?? "",
        ratingAvg: Number(row.rating_avg ?? 0),
        reviewCount: row.review_count ?? 0,
        yearsExperience: row.years_experience,
        hourlyRate: row.hourly_rate,
        isVerified: row.is_verified ?? false,
        isFeatured: row.is_featured ?? false,
        isAvailable: row.is_available ?? true,
        lat: row.lat ?? null,
        lng: row.lng ?? null,
        serviceType: row.service_type ?? null,
      }));
    } catch (err) {
      console.error("[searchProfessionals] Supabase error, using mock data:", err);
    }
  }

  return applyMockFilters(MOCK_PROFESSIONALS, filters);
}

// ---------------------------------------------------------------------------
// Single professional by slug
// ---------------------------------------------------------------------------

export async function getProfessionalBySlug(
  slug: string
): Promise<ProfessionalDetail | null> {
  if (SUPABASE_CONFIGURED) {
    try {
      const { createClient } = await import("@/lib/supabase/server");
      const supabase = await createClient();

      // Use LEFT joins (not !inner) so missing categories/provincias/cantones
      // rows don't silently drop the professional from results.
      const { data: pro, error } = await supabase
        .from("professionals")
        .select(
          `id, slug, hourly_rate, is_verified, is_featured, is_available,
           rating_avg, review_count, bio, whatsapp, years_experience, portfolio_urls,
           category_id, services, availability_public, lat, lng, service_type,
           profiles(full_name, avatar_url),
           provincias(id, name),
           cantones(id, name),
           reviews(id, rating, comment, created_at, profiles(full_name, avatar_url))`
        )
        .eq("slug", slug)
        .single();

      if (error || !pro) throw error ?? new Error("Not found");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const reviews: Review[] = ((pro.reviews as any[]) ?? []).map((r: any) => ({
        id: r.id,
        clientName: r.profiles?.full_name ?? "Cliente",
        clientAvatarUrl: r.profiles?.avatar_url,
        rating: r.rating,
        comment: r.comment,
        createdAt: r.created_at,
      }));

      return {
        id: pro.id,
        slug: pro.slug,
        fullName: (pro.profiles as any)?.full_name ?? "Profesional",
        avatarUrl: (pro.profiles as any)?.avatar_url ?? null,
        // category_id is a plain text column — no join needed
        categoryId: (pro as any).category_id ?? "",
        categoryIcon: "",
        bio: pro.bio,
        whatsapp: pro.whatsapp,
        provinceName: (pro.provincias as any)?.name ?? "",
        cantonName: (pro.cantones as any)?.name ?? "",
        ratingAvg: Number(pro.rating_avg ?? 0),
        reviewCount: pro.review_count ?? 0,
        yearsExperience: pro.years_experience,
        hourlyRate: pro.hourly_rate,
        isVerified: pro.is_verified ?? false,
        isFeatured: pro.is_featured ?? false,
        isAvailable: pro.is_available ?? true,
        lat: (pro as any).lat ?? null,
        lng: (pro as any).lng ?? null,
        serviceType: (pro as any).service_type ?? null,
        portfolioUrls: pro.portfolio_urls ?? [],
        reviews,
        services: ((pro as any).services as ProService[]) ?? [],
        availabilityPublic: (pro as any).availability_public ?? true,
      };
    } catch (err) {
      console.error("[getProfessionalBySlug] Supabase error, using mock data:", err);
    }
  }

  const mock = MOCK_PROFESSIONALS.find((p) => p.slug === slug);
  if (!mock) return null;
  return { ...mock, portfolioUrls: [], reviews: MOCK_REVIEWS, services: [], availabilityPublic: true };
}

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function applyMockFilters(
  data: ProfessionalCardData[],
  filters: SearchFilters
): ProfessionalCardData[] {
  let results = [...data];

  if (filters.categoryId && filters.categoryId !== "todas") {
    results = results.filter((p) => p.categoryId === filters.categoryId);
  }
  if (filters.provinceId && filters.provinceId !== "todas") {
    const { PROVINCES } = require("@/lib/data/cr-geography");
    const province = PROVINCES.find((p: { id: string }) => p.id === filters.provinceId);
    if (province) results = results.filter((p) => p.provinceName === province.name);
  }
  if (filters.cantonId && filters.cantonId !== "todos") {
    const { getCantonById } = require("@/lib/data/cr-geography");
    const canton = getCantonById(filters.cantonId);
    if (canton) results = results.filter((p) => p.cantonName === canton.name);
  }
  if (filters.query) {
    const q = filters.query.toLowerCase().trim();
    const keywordCatIds = getMatchingCategoryIds(q);
    results = results.filter(
      (p) =>
        p.fullName.toLowerCase().includes(q) ||
        (p.bio ?? "").toLowerCase().includes(q) ||
        p.categoryId.toLowerCase().includes(q) ||
        keywordCatIds.includes(p.categoryId)
    );
  }

  switch (filters.sortBy) {
    case "reviews":
      results.sort((a, b) => b.reviewCount - a.reviewCount);
      break;
    case "priceAsc":
      results.sort((a, b) => (a.hourlyRate ?? 0) - (b.hourlyRate ?? 0));
      break;
    case "priceDesc":
      results.sort((a, b) => (b.hourlyRate ?? 0) - (a.hourlyRate ?? 0));
      break;
    default:
      results.sort((a, b) => b.ratingAvg - a.ratingAvg);
  }

  return results;
}

const MOCK_REVIEWS: Review[] = [
  {
    id: "r1",
    clientName: "Laura Fernández",
    clientAvatarUrl: "https://randomuser.me/api/portraits/women/12.jpg",
    rating: 5,
    comment: "Excelente trabajo. Muy puntual, limpio y profesional. El precio fue justo y el resultado quedó perfecto.",
    createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "r2",
    clientName: "José Arias",
    clientAvatarUrl: "https://randomuser.me/api/portraits/men/23.jpg",
    rating: 5,
    comment: "Muy buen profesional. Resolvió el problema rápidamente y explicó todo el proceso. Lo volvería a contratar.",
    createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "r3",
    clientName: "Patricia Solís",
    clientAvatarUrl: "https://randomuser.me/api/portraits/women/34.jpg",
    rating: 4,
    comment: "Buen servicio en general. Llegó un poco tarde pero el trabajo quedó bien hecho.",
    createdAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
  },
];

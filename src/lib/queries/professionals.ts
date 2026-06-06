import type { ProfessionalCardData } from "@/components/professionals/professional-card";
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
           category_id, professions, pricing, lat, lng, service_type, availability_public, contact_preference,
           profiles(full_name, avatar_url),
           provincias(id, name),
           cantones(id, name)`
        );

      if (filters.categoryId && filters.categoryId !== "todas") {
        // Match the professional if ANY of their professions matches (multi-category).
        query = query.or(`category_id.eq.${filters.categoryId},professions.cs.{${filters.categoryId}}`);
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

      // Featured ("destacado") professionals surface first — but only within the
      // already-filtered set, so they never bypass the active category/location/
      // search filters. Applied as the primary sort key ahead of the chosen order.
      query = query.order("is_featured", { ascending: false });

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
          // Default: highest average rating, total review count as tiebreaker.
          query = query
            .order("rating_avg", { ascending: false })
            .order("review_count", { ascending: false });
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
        professions: (row.professions as string[]) ?? (row.category_id ? [row.category_id] : []),
        pricing: (row.pricing as ProfessionalCardData["pricing"]) ?? [],
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
        availabilityPublic: row.availability_public ?? true,
        contactPreference: (row.contact_preference as ProfessionalCardData["contactPreference"]) ?? "ambas",
        lat: row.lat ?? null,
        lng: row.lng ?? null,
        serviceType: row.service_type ?? null,
      }));
    } catch (err) {
      console.error("[searchProfessionals] Supabase error:", err);
    }
  }

  // No fake/seed fallback — only real professionals are ever listed.
  return [];
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
           category_id, professions, pricing, services, availability_public, contact_preference, languages, lat, lng, service_type,
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        professions: ((pro as any).professions as string[]) ?? ((pro as any).category_id ? [(pro as any).category_id] : []),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        pricing: ((pro as any).pricing as ProfessionalCardData["pricing"]) ?? [],
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        contactPreference: ((pro as any).contact_preference as ProfessionalCardData["contactPreference"]) ?? "ambas",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        languages: ((pro as any).languages as string[]) ?? [],
      };
    } catch (err) {
      console.error("[getProfessionalBySlug] Supabase error:", err);
    }
  }

  // No fake/seed fallback.
  return null;
}

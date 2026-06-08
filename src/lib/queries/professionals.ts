import type { ProfessionalCardData } from "@/components/professionals/professional-card";
import { getMatchingCategoryIds } from "@/lib/data/categories";
import { getProvinceById, PROVINCE_CENTROIDS, haversineKm } from "@/lib/data/cr-geography";

// Build the real travel-coverage summary for "me desplazo" pros (item 16):
// whole country, specific provinces, and/or specific cantones (display names).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildCoverage(row: any): { country: boolean; provincias: string[]; cantones: string[] } {
  const country = !!row.coverage_country;
  const provincias = Array.isArray(row.coverage_provincias)
    ? (row.coverage_provincias as string[]).map((id) => getProvinceById(id)?.name ?? id).filter(Boolean)
    : [];
  const cantones = Array.isArray(row.coverage_areas)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ? (row.coverage_areas as any[])
        .filter((a) => (a?.level ?? (a?.cantonId ? "canton" : "")) === "canton")
        .map((a) => a?.cantonName)
        .filter(Boolean)
    : [];
  return { country, provincias, cantones };
}

const SUPABASE_CONFIGURED =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Province display name → id (for the proximity sort's centroid fallback).
const PROVINCE_NAME_TO_ID: Record<string, string> = {
  "San José": "sj", Alajuela: "al", Cartago: "ca", Heredia: "he",
  Guanacaste: "gu", Puntarenas: "pu", Limón: "li",
};
function getProvinceIdByName(name?: string): string {
  return (name && PROVINCE_NAME_TO_ID[name]) || "";
}

export type SearchFilters = {
  categoryId?: string;
  provinceId?: string;
  cantonId?: string;
  sortBy?: string;
  query?: string;
  /** "Solo con identidad verificada" — only show verified providers. */
  verifiedOnly?: boolean;
  /** Filter by an insurance network (aseguradora) the pro belongs to. */
  insurerId?: string;
  /** User coordinates (geolocation) — enables the "cerca de mí" proximity sort. */
  nearLat?: number;
  nearLng?: number;
};

export type ProService = {
  id: string;
  name: string;
  description?: string;
  price?: string;
};

export type PortfolioItem = { url: string; profession?: string };

export type ProfessionalDetail = ProfessionalCardData & {
  portfolioUrls: string[];
  portfolioItems: PortfolioItem[];
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
  /** The job (solicitud/proyecto) this review belongs to — shown for context. */
  jobTitle?: string | null;
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

      // Built as a closure so we can retry without the `is_banned` filter if that
      // column hasn't been migrated yet (migration 029) — search never breaks.
      // modern = use is_banned + location-aware search arrays (migrations 029/030).
      // legacy = fall back to the old single provincia_id/canton_id columns.
      const build = (modern: boolean) => {
        let query = supabase
          .from("professionals")
          .select(
            `id, slug, hourly_rate, is_verified, is_featured, is_available,
             rating_avg, review_count, bio, whatsapp, years_experience, portfolio_urls,
             category_id, professions, pricing, lat, lng, service_type, availability_public, contact_preference,
             business_name, workplaces, verification_status${modern ? ", no_cr_id, insurance_networks, coverage_areas, coverage_provincias, coverage_country, allow_phone_call" : ""},
             profiles(full_name, avatar_url${modern ? ", is_disabled" : ""}),
             provincias(id, name),
             cantones(id, name)`
          );

        if (modern) query = query.eq("is_banned", false);
        // No-ID professionals (no_cr_id) stay hidden from /buscar until an admin
        // approves them (verification_status = 'verified'). Visibility is driven
        // solely by status — there is no manual block toggle.
        if (modern) query = query.or("no_cr_id.eq.false,verification_status.eq.verified");
        // Rejected profiles are never visible (visibility is status-driven; there
        // is no manual block toggle).
        if (modern) query = query.neq("verification_status", "rejected");
        if (modern && filters.insurerId && filters.insurerId !== "todas") {
          query = query.contains("insurance_networks", [filters.insurerId]);
        }

        if (filters.categoryId && filters.categoryId !== "todas") {
          // Match the professional if ANY of their professions matches (multi-category).
          query = query.or(`category_id.eq.${filters.categoryId},professions.cs.{${filters.categoryId}}`);
        }
        if (filters.provinceId && filters.provinceId !== "todas") {
          // Hierarchy-aware: appears under every covered provincia (pins + cantón/
          // provincia coverage) OR whole-country coverage. Legacy fallback for
          // un-migrated pros.
          query = modern
            ? query.or(`search_provincias.cs.{${filters.provinceId}},provincia_id.eq.${filters.provinceId},coverage_country.eq.true`)
            : query.eq("provincia_id", filters.provinceId);
        }
        if (filters.cantonId && filters.cantonId !== "todos") {
          // A searched cantón matches if covered directly (search_cantones), via its
          // whole provincia (coverage_provincias), or via whole-country coverage.
          const parts = [`search_cantones.cs.{${filters.cantonId}}`, `canton_id.eq.${filters.cantonId}`];
          if (modern) {
            if (filters.provinceId && filters.provinceId !== "todas") parts.push(`coverage_provincias.cs.{${filters.provinceId}}`);
            parts.push("coverage_country.eq.true");
          }
          query = modern ? query.or(parts.join(",")) : query.eq("canton_id", filters.cantonId);
        }
        if (filters.verifiedOnly) {
          query = query.eq("verification_status", "verified");
        }
        if (filters.query) {
          const q = filters.query.trim();
          // Match text against bio/name AND expand keyword synonyms to category IDs
          const keywordCategoryIds = getMatchingCategoryIds(q);
          const textFilter = `bio.ilike.%${q}%,profiles.full_name.ilike.%${q}%,services::text.ilike.%${q}%,business_name.ilike.%${q}%,workplaces::text.ilike.%${q}%`;
          if (keywordCategoryIds.length > 0 && !filters.categoryId) {
            const catFilter = keywordCategoryIds.map((id) => `category_id.eq.${id}`).join(",");
            query = query.or(`${textFilter},${catFilter}`);
          } else {
            query = query.or(textFilter);
          }
        }

        // Featured ("destacado") professionals surface first within the filtered set.
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
            // No filters / "Mejor calificados": best-rated → most reviews → most
            // recently active, applied by default and reflected in the control.
            query = query
              .order("rating_avg", { ascending: false })
              .order("review_count", { ascending: false })
              .order("created_at", { ascending: false });
        }
        return query.limit(50);
      };

      let { data, error } = await build(true);
      if (error && /is_banned|search_provincias|search_cantones|coverage_|no_cr_id|column/i.test(error.message)) {
        ({ data, error } = await build(false)); // pre-migration fallback
      }
      if (error) throw error;

      const mapped = (data ?? [])
        // Hide soft-disabled accounts (item 17). undefined (pre-migration) → shown.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((row: any) => !row.profiles?.is_disabled)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((row: any) => ({
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
        businessName: row.business_name ?? undefined,
        workplaces: (row.workplaces as ProfessionalCardData["workplaces"]) ?? [],
        verificationStatus: (row.verification_status as ProfessionalCardData["verificationStatus"]) ?? "pending",
        lat: row.lat ?? null,
        lng: row.lng ?? null,
        serviceType: row.service_type ?? null,
        portfolioCount: Array.isArray(row.portfolio_urls) ? row.portfolio_urls.length : 0,
        insuranceNetworks: (row.insurance_networks as string[]) ?? [],
        coverage: buildCoverage(row),
        allowPhoneCall: row.allow_phone_call ?? false,
      }));

      // "Cerca de mí" — proximity sort by distance to the user's coordinates,
      // using the pro's exact pin when present, else their province centroid.
      if (filters.sortBy === "cercania" && typeof filters.nearLat === "number" && typeof filters.nearLng === "number") {
        const { nearLat, nearLng } = filters;
        const distOf = (p: ProfessionalCardData): number => {
          if (typeof p.lat === "number" && typeof p.lng === "number") return haversineKm(nearLat, nearLng, p.lat, p.lng);
          const wp = (p.workplaces ?? []).find((w) => typeof w.lat === "number" && typeof w.lng === "number");
          if (wp) return haversineKm(nearLat, nearLng, wp.lat as number, wp.lng as number);
          const c = PROVINCE_CENTROIDS[getProvinceIdByName(p.provinceName)];
          return c ? haversineKm(nearLat, nearLng, c.lat, c.lng) : Number.POSITIVE_INFINITY;
        };
        mapped.sort((a, b) => distOf(a) - distOf(b));
      }
      return mapped;
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
           category_id, professions, pricing, services, availability_public, contact_preference, languages, business_name, workplaces, verification_status, insurance_networks, lat, lng, service_type,
           profiles(full_name, avatar_url),
           provincias(id, name),
           cantones(id, name),
           reviews(id, rating, comment, created_at, profiles(full_name, avatar_url))`
        )
        .eq("slug", slug)
        .single();

      if (error || !pro) throw error ?? new Error("Not found");

      // Tagged casos-de-éxito + phone-call opt-in + coverage. Best-effort: separate
      // queries so a missing column (pre-migration 033/034) never breaks the profile.
      let portfolioItems: PortfolioItem[] = [];
      try {
        const { data: pi } = await supabase.from("professionals").select("portfolio_items").eq("id", pro.id).maybeSingle();
        if (pi && Array.isArray((pi as { portfolio_items?: PortfolioItem[] }).portfolio_items)) {
          portfolioItems = (pi as { portfolio_items: PortfolioItem[] }).portfolio_items;
        }
      } catch { /* column not migrated yet */ }
      let allowPhoneCall = false;
      let coverage = { country: false, provincias: [] as string[], cantones: [] as string[] };
      try {
        const { data: extra } = await supabase
          .from("professionals")
          .select("allow_phone_call, coverage_areas, coverage_provincias, coverage_country")
          .eq("id", pro.id)
          .maybeSingle();
        if (extra) {
          allowPhoneCall = !!(extra as { allow_phone_call?: boolean }).allow_phone_call;
          coverage = buildCoverage(extra);
        }
      } catch { /* columns not migrated yet */ }
      if (portfolioItems.length === 0) {
        portfolioItems = (pro.portfolio_urls ?? []).map((url: string) => ({ url }));
      }

      // Job-title snapshot per review (best-effort; column from migration 036) so
      // each review shows which job it belongs to. (Edited timestamps are NOT
      // surfaced publicly — only the author sees that, item 4.)
      const titleMap: Record<string, string | null> = {};
      try {
        const { data: rj } = await supabase.from("reviews").select("id, job_title").eq("professional_id", pro.id);
        for (const r of (rj ?? []) as { id: string; job_title?: string | null }[]) titleMap[r.id] = r.job_title ?? null;
      } catch { /* column not migrated yet */ }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const reviews: Review[] = ((pro.reviews as any[]) ?? []).map((r: any) => ({
        id: r.id,
        jobTitle: titleMap[r.id] ?? null,
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
        portfolioItems,
        allowPhoneCall,
        coverage,
        reviews,
        services: ((pro as any).services as ProService[]) ?? [],
        availabilityPublic: (pro as any).availability_public ?? true,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        contactPreference: ((pro as any).contact_preference as ProfessionalCardData["contactPreference"]) ?? "ambas",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        languages: ((pro as any).languages as string[]) ?? [],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        businessName: ((pro as any).business_name as string) ?? undefined,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        workplaces: ((pro as any).workplaces as ProfessionalCardData["workplaces"]) ?? [],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        verificationStatus: ((pro as any).verification_status as ProfessionalCardData["verificationStatus"]) ?? "pending",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        insuranceNetworks: ((pro as any).insurance_networks as string[]) ?? [],
      };
    } catch (err) {
      console.error("[getProfessionalBySlug] Supabase error:", err);
    }
  }

  // No fake/seed fallback.
  return null;
}

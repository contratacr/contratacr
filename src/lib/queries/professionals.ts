import type { ProfessionalCardData, Certification } from "@/components/professionals/professional-card";
import { createAdminClient } from "@/lib/supabase/admin";
import { deriveDisplayPricing } from "@/lib/pricing";
import { getMatchingCategoryIds, normalizeText, supportsVideoConsultCategory } from "@/lib/data/categories";
import { getProvinceById, PROVINCES, haversineKm } from "@/lib/data/cr-geography";
import { languageSearchValues } from "@/lib/data/languages";

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

const NEAR_ME_RADIUS_KM = 25;


type LocationQueryMatch =
  | { type: "province"; id: string }
  | { type: "canton"; id: string; provinceId: string };

function getMatchingLocationIds(raw: string): LocationQueryMatch[] {
  const q = normalizeText(raw.trim());
  if (q.length < 3) return [];

  const matches: LocationQueryMatch[] = [];
  const seen = new Set<string>();
  const add = (match: LocationQueryMatch) => {
    const key = `${match.type}:${match.id}`;
    if (!seen.has(key)) {
      seen.add(key);
      matches.push(match);
    }
  };

  for (const province of PROVINCES) {
    const provinceName = normalizeText(province.name);
    if (q === provinceName || q.includes(provinceName) || provinceName.includes(q)) {
      add({ type: "province", id: province.id });
    }
    for (const canton of province.cantons) {
      const cantonName = normalizeText(canton.name);
      if (q === cantonName || q.includes(cantonName) || cantonName.includes(q)) {
        add({ type: "canton", id: canton.id, provinceId: province.id });
      }
    }
  }

  return matches.slice(0, 8);
}

export type SearchFilters = {
  categoryId?: string;
  provinceId?: string;
  cantonId?: string;
  sortBy?: string;
  query?: string;
  /** "Solo con identidad verificada" â€” only show verified providers. */
  verifiedOnly?: boolean;
  /** Filter by an insurance network (aseguradora) the pro belongs to. */
  insurerId?: string;
  /** Filter by a language the professional can attend in. */
  languageId?: string;
  /** How the client wants to be attended. Video is only shown for compatible services. */
  modality?: "any" | "in_person" | "video";
  /** User coordinates (geolocation) â€” enables the "cerca de mÃ­" proximity sort. */
  nearLat?: number;
  nearLng?: number;
  /** "Buscar en esta Ã¡rea" â€” keep only pros within the map's visible viewport.
   *  Applied IN ADDITION to the other filters (a JS post-filter on the results). */
  bounds?: { north: number; south: number; east: number; west: number };
};

export type ProService = {
  id: string;
  name: string;
  description?: string;
  price?: string;
  priceAmount?: number | null;
  priceType?: import("@/lib/pricing").PricingType | null;
  category?: string;
  active?: boolean;
  modalities?: Array<"in_person" | "at_home" | "video">;
};

function hasActiveService(services: unknown): boolean {
  return activeServices(services).length > 0;
}

function activeServices(services: unknown): ProService[] {
  if (!Array.isArray(services)) return [];
  return services.filter((service): service is ProService => {
    if (!service || typeof service !== "object") return false;
    const item = service as { active?: boolean; category?: string; name?: string };
    return item.active !== false && Boolean(item.category || item.name);
  });
}

function uniqueIds(ids: string[]): string[] {
  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
}

function hasCategorizedServices(services: unknown): boolean {
  return Array.isArray(services)
    && services.some((service) => !!(service && typeof service === "object" && (service as { category?: string }).category?.trim()));
}

function publicProfessionsFromServices(services: unknown, fallbackProfessions: string[]): string[] {
  const activeCategories = uniqueIds(activeServices(services).map((service) => service.category ?? ""));
  if (activeCategories.length > 0) return activeCategories;
  // Legacy records may have services without category ids; keep their old professions.
  // When categorized services exist, do not fall back or inactive categories reappear.
  return hasCategorizedServices(services) ? [] : uniqueIds(fallbackProfessions);
}

function serviceCategoryContains(categoryId: string): string {
  return `services.cs.[{"category":"${categoryId}"}]`;
}

function primaryPriceAmount(p: ProfessionalCardData): number | null {
  const amount = p.pricing?.[0]?.amount;
  if (typeof amount === "number" && amount > 0) return amount;
  return null;
}

// Photos attach to a SERVICE INSTANCE (serviceId); `profession` kept for legacy.
export type PortfolioItem = { url: string; serviceId?: string; profession?: string };

// Optional website/social links. Social networks are stored as usernames; the
// website is stored as a normalized URL. Additive to "casos de Ã©xito" photos.
export type SocialLinks = { instagram?: string; facebook?: string; tiktok?: string; website?: string };

export type ProfessionalDetail = ProfessionalCardData & {
  portfolioUrls: string[];
  portfolioItems: PortfolioItem[];
  reviews: Review[];
  services: ProService[];
  availabilityPublic: boolean;
  certifications: Certification[];
  socialLinks?: SocialLinks;
};

export type Review = {
  id: string;
  clientName: string;
  clientAvatarUrl?: string;
  rating: number;
  comment: string;
  createdAt: string;
  /** The job (solicitud/proyecto) this review belongs to â€” shown for context. */
  jobTitle?: string | null;
};

// ---------------------------------------------------------------------------
// Search / list
// ---------------------------------------------------------------------------

function normalizeSearchFilters(filters: SearchFilters): SearchFilters {
  const normalized: SearchFilters = {
    categoryId: filters.categoryId || undefined,
    provinceId: filters.provinceId || undefined,
    cantonId: filters.cantonId || undefined,
    sortBy: filters.sortBy || undefined,
    query: filters.query?.trim() || undefined,
    verifiedOnly: filters.verifiedOnly || undefined,
    insurerId: filters.insurerId || undefined,
    languageId: filters.languageId || undefined,
    modality: filters.modality ?? "any",
  };
  if (typeof filters.nearLat === "number" && Number.isFinite(filters.nearLat)) normalized.nearLat = filters.nearLat;
  if (typeof filters.nearLng === "number" && Number.isFinite(filters.nearLng)) normalized.nearLng = filters.nearLng;
  if (filters.bounds && Object.values(filters.bounds).every(Number.isFinite)) normalized.bounds = { ...filters.bounds };
  return normalized;
}

export async function searchProfessionals(filters: SearchFilters): Promise<ProfessionalCardData[]> {
  const normalized = normalizeSearchFilters(filters);
  return searchProfessionalsUncached(normalized);
}

async function searchProfessionalsUncached(
  filters: SearchFilters
): Promise<ProfessionalCardData[]> {
  if (SUPABASE_CONFIGURED) {
    try {
      const supabase = createAdminClient();

      // Built as a closure so we can retry without the `is_banned` filter if that
      // column hasn't been migrated yet (migration 029) â€” search never breaks.
      // modern = use is_banned + location-aware search arrays (migrations 029/030).
      // legacy = fall back to the old single provincia_id/canton_id columns.
      const build = (modern: boolean) => {
        let query = supabase
          .from("professionals")
          .select(
            `id, profile_id, slug, hourly_rate, is_verified, is_featured, is_available,
             rating_avg, review_count, bio, whatsapp, years_experience, portfolio_urls,
             category_id, professions, pricing, services, lat, lng, service_type, availability_public, contact_preference, videoconsulta,
             business_name, workplaces, verification_status${modern ? ", languages, no_cr_id, insurance_networks, coverage_areas, coverage_provincias, coverage_country, allow_phone_call, certifications, call_phone" : ""},
             profiles(full_name, avatar_url${modern ? ", is_disabled" : ""}),
             provincias(id, name),
             cantones(id, name)`
          );

        if (modern) query = query.eq("is_banned", false);
        // Unverified professionals (no_cr_id / pending / under appeal) ARE listed â€”
        // shown with an explicit "Identidad sin verificar" label and ranked BELOW
        // verified ones (see the verified-first pass below). Only rejected profiles
        // are never visible.
        if (modern) query = query.neq("verification_status", "rejected");
        const includeVideoNationwide =
          filters.modality !== "in_person" &&
          (filters.modality === "video" ||
            (!!filters.categoryId && filters.categoryId !== "todas" && supportsVideoConsultCategory(filters.categoryId)));

        if (modern && filters.insurerId && filters.insurerId !== "todas") {
          query = query.contains("insurance_networks", [filters.insurerId]);
        }
        if (modern && filters.modality === "video") {
          query = query.or("videoconsulta.eq.true,coverage_country.eq.true");
        }

        if (filters.categoryId && filters.categoryId !== "todas") {
          // Match the professional if the selected service is their main category,
          // one of their professions, or one of the service rows they added in the
          // professional panel. The last case matters for multi-service profiles.
          query = query.or(`category_id.eq.${filters.categoryId},professions.cs.{${filters.categoryId}},${serviceCategoryContains(filters.categoryId)}`);
        }
        if (filters.provinceId && filters.provinceId !== "todas") {
          // Hierarchy-aware: appears under every covered provincia (pins + cantÃ³n/
          // provincia coverage) OR whole-country coverage. Legacy fallback for
          // un-migrated pros.
          query = modern
            ? query.or([
                `search_provincias.cs.{${filters.provinceId}}`,
                `provincia_id.eq.${filters.provinceId}`,
                includeVideoNationwide ? "coverage_country.eq.true" : "",
                includeVideoNationwide ? "videoconsulta.eq.true" : "",
              ].filter(Boolean).join(","))
            : query.eq("provincia_id", filters.provinceId);
        }
        if (filters.cantonId && filters.cantonId !== "todos") {
          // A searched cantÃ³n matches if covered directly (search_cantones), via its
          // whole provincia (coverage_provincias), or via whole-country coverage.
          const parts = [`search_cantones.cs.{${filters.cantonId}}`, `canton_id.eq.${filters.cantonId}`];
          if (modern) {
            if (filters.provinceId && filters.provinceId !== "todas") parts.push(`coverage_provincias.cs.{${filters.provinceId}}`);
            if (includeVideoNationwide) {
              parts.push("coverage_country.eq.true");
              parts.push("videoconsulta.eq.true");
            }
          }
          query = modern ? query.or(parts.join(",")) : query.eq("canton_id", filters.cantonId);
        }
        if (filters.verifiedOnly) {
          query = query.eq("verification_status", "verified");
        }
        if (filters.query) {
          // Sanitize before interpolating into the PostgREST `.or()` filter:
          // strip the structural chars (`,` `(` `)` `:`) that could inject extra
          // conditions and the LIKE wildcards (`% _ *`) a user could abuse, and
          // cap the length. Letters/numbers/accents/spaces (normal search) pass.
          const q = filters.query.trim().slice(0, 80).replace(/[,()*%_:\\"']/g, " ").replace(/\s+/g, " ").trim();
          // Match text against bio/name AND expand keyword synonyms to category IDs
          const keywordCategoryIds = getMatchingCategoryIds(filters.query.trim());
          const queryIncludesVideoNationwide =
            includeVideoNationwide ||
            (filters.modality !== "in_person" && keywordCategoryIds.some((id) => supportsVideoConsultCategory(id)));
          const locationMatches = getMatchingLocationIds(filters.query.trim());
          const locationFilterParts = locationMatches.flatMap((loc) => {
            if (loc.type === "province") {
              return modern
                ? [
                    `search_provincias.cs.{${loc.id}}`,
                    `provincia_id.eq.${loc.id}`,
                    queryIncludesVideoNationwide ? "coverage_country.eq.true" : "",
                    queryIncludesVideoNationwide ? "videoconsulta.eq.true" : "",
                  ].filter(Boolean)
                : [`provincia_id.eq.${loc.id}`];
            }
            return modern
              ? [
                  `search_cantones.cs.{${loc.id}}`,
                  `canton_id.eq.${loc.id}`,
                  `coverage_provincias.cs.{${loc.provinceId}}`,
                  queryIncludesVideoNationwide ? "coverage_country.eq.true" : "",
                  queryIncludesVideoNationwide ? "videoconsulta.eq.true" : "",
                ].filter(Boolean)
              : [`canton_id.eq.${loc.id}`];
          });
          const categoryFilterParts =
            keywordCategoryIds.length > 0 && !filters.categoryId
              ? keywordCategoryIds.flatMap((id) => [
                  `category_id.eq.${id}`,
                  `professions.cs.{${id}}`,
                  serviceCategoryContains(id),
                ])
              : [];
          const appliedStructuredTextFilter = categoryFilterParts.length > 0 && locationFilterParts.length > 0;
          if (appliedStructuredTextFilter) {
            query = query.or(categoryFilterParts.join(","));
            query = query.or(locationFilterParts.join(","));
            // A query like "desarrollo web nicoya guanacaste" should mean:
            // service AND place, while still allowing nationwide videoconsulta
            // providers for compatible services.
          } else if (!q) {
            const parts = [...locationFilterParts];
            parts.push(...categoryFilterParts);
            if (parts.length > 0) {
              query = query.or(parts.join(","));
            }
            // No usable text after sanitizing â†’ skip the text filter entirely.
          } else {
            const textFilter = `bio.ilike.%${q}%,business_name.ilike.%${q}%`;
            const parts = [textFilter, ...locationFilterParts];
            parts.push(...categoryFilterParts);
            query = query.or(parts.join(","));
          }
        }

        // Verified professionals surface first (built-in trust incentive), then
        // featured, then the chosen sort. Finalized authoritatively in JS below.
        query = query.order("is_verified", { ascending: false });
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
            // No filters / "Mejor calificados": reviewed pros first (best-rated,
            // most reviews), then recently active. JS below keeps unrated pros from
            // being treated like real 0.0 ratings.
            query = query
              .order("rating_avg", { ascending: false })
              .order("review_count", { ascending: false })
              .order("created_at", { ascending: false });
        }
        return query.limit(filters.bounds || filters.languageId || (typeof filters.nearLat === "number" && typeof filters.nearLng === "number") ? 250 : 50);
      };

      let { data, error } = await build(true);
      if (error && /is_banned|search_provincias|search_cantones|coverage_|no_cr_id|certifications|call_phone|column/i.test(error.message)) {
        ({ data, error } = await build(false)); // pre-migration fallback
      }
      if (error) throw error;

      let mapped = (data ?? [])
        // Hide soft-disabled accounts (item 17). undefined (pre-migration) â†’ shown.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((row: any) => !row.profiles?.is_disabled)
        // A professional must have at least one active service to appear in public
        // search. If they removed all services by mistake, the dashboard shows the
        // empty state and profile-completion prompt instead of listing a wrong card.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((row: any) => hasActiveService(row.services))
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((row: any) => {
          const rowActiveServices = activeServices(row.services);
          const legacyProfessions = (row.professions as string[]) ?? (row.category_id ? [row.category_id] : []);
          const publicProfessions = publicProfessionsFromServices(row.services, legacyProfessions);
          return ({
        id: row.id,
        slug: row.slug,
        fullName: row.profiles?.full_name ?? "Profesional",
        avatarUrl: row.profiles?.avatar_url ?? null,
        categoryId: publicProfessions[0] ?? row.category_id ?? "",
        categoryIcon: "",
        professions: publicProfessions,
        // Price now lives ONLY in Servicios â€” derive the card "Desde" from the
        // services (legacy profile-level pricing/hourly_rate kept as fallback).
        pricing: deriveDisplayPricing(rowActiveServices, row.pricing as ProfessionalCardData["pricing"], row.hourly_rate),
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
        languages: (row.languages as string[]) ?? [],
        lat: row.lat ?? null,
        lng: row.lng ?? null,
        serviceType: row.service_type ?? null,
        videoconsulta: !!row.videoconsulta,
        portfolioCount: Array.isArray(row.portfolio_urls) ? row.portfolio_urls.length : 0,
        certificationCount: Array.isArray(row.certifications) ? row.certifications.length : 0,
        insuranceNetworks: (row.insurance_networks as string[]) ?? [],
        coverage: buildCoverage(row),
        allowPhoneCall: row.allow_phone_call ?? false,
        profileId: row.profile_id ?? undefined,
        callPhone: row.call_phone ?? undefined,
        services: rowActiveServices,
          });
        });

      const requestedCategoryIds = new Set<string>();
      if (filters.categoryId && filters.categoryId !== "todas") requestedCategoryIds.add(filters.categoryId);
      if (filters.query) {
        for (const id of getMatchingCategoryIds(filters.query.trim())) requestedCategoryIds.add(id);
      }
      if (requestedCategoryIds.size > 0) {
        mapped = mapped.filter((p) => (p.professions ?? []).some((id) => requestedCategoryIds.has(id)));
      }

      if (filters.languageId && filters.languageId !== "todos") {
        const wanted = new Set(languageSearchValues(filters.languageId).map((value) => normalizeText(value)));
        mapped = mapped.filter((p) => (p.languages ?? []).some((language) => wanted.has(normalizeText(language))));
      }

      if (!filters.sortBy || filters.sortBy === "rating") {
        mapped.sort((a, b) => {
          const aHasReviews = a.reviewCount > 0;
          const bHasReviews = b.reviewCount > 0;
          if (aHasReviews && !bHasReviews) return -1;
          if (!aHasReviews && bHasReviews) return 1;
          if (aHasReviews && bHasReviews) {
            return (b.ratingAvg - a.ratingAvg) || (b.reviewCount - a.reviewCount);
          }
          return 0;
        });
      }

      if (filters.sortBy === "priceAsc" || filters.sortBy === "priceDesc") {
        mapped.sort((a, b) => {
          const pa = primaryPriceAmount(a);
          const pb = primaryPriceAmount(b);
          const aHasPrice = pa != null;
          const bHasPrice = pb != null;
          if (aHasPrice && bHasPrice) return filters.sortBy === "priceDesc" ? pb - pa : pa - pb;
          if (aHasPrice) return -1;
          if (bHasPrice) return 1;
          return 0;
        });
      }

      // "Cerca de mí" is a real location filter: exact professional pins or
      // exact workplace pins inside a short radius count first. For video-compatible
      // services, keep nationwide videoconsulta pros as remote results after that.
      if (typeof filters.nearLat === "number" && typeof filters.nearLng === "number") {
        const { nearLat, nearLng } = filters;
        const includeVideoNationwideForNear =
          filters.modality !== "in_person" &&
          (filters.modality === "video" ||
            (!!filters.categoryId && filters.categoryId !== "todas" && supportsVideoConsultCategory(filters.categoryId)));
        const distOfExactPin = (p: ProfessionalCardData): number => {
          const distances: number[] = [];
          if (typeof p.lat === "number" && typeof p.lng === "number") {
            distances.push(haversineKm(nearLat, nearLng, p.lat, p.lng));
          }
          for (const wp of p.workplaces ?? []) {
            if (typeof wp.lat === "number" && typeof wp.lng === "number") {
              distances.push(haversineKm(nearLat, nearLng, wp.lat as number, wp.lng as number));
            }
          }
          return distances.length ? Math.min(...distances) : Number.POSITIVE_INFINITY;
        };
        mapped = mapped.filter((p) => {
          const distance = distOfExactPin(p);
          if (distance <= NEAR_ME_RADIUS_KM) return true;
          return includeVideoNationwideForNear && (p.videoconsulta || !!p.coverage?.country);
        });
        mapped.sort((a, b) => {
          const da = distOfExactPin(a);
          const db = distOfExactPin(b);
          const aNear = da <= NEAR_ME_RADIUS_KM;
          const bNear = db <= NEAR_ME_RADIUS_KM;
          if (aNear && bNear) return da - db;
          if (aNear) return -1;
          if (bNear) return 1;
          return 0;
        });
      }

      // Verified-first ranking (default trust incentive): verified above unverified,
      // featured above non-featured â€” applied as a STABLE pass so the chosen sort
      // (rating/price/proximity/â€¦) is preserved within each rank group. Unverified
      // pros still appear, just lower.
      const rank = (p: ProfessionalCardData) =>
        (p.verificationStatus === "verified" ? 2 : 0) + (p.isFeatured ? 1 : 0);
      mapped.sort((a, b) => rank(b) - rank(a));

      // "Buscar en esta Ã¡rea" â€” keep only pros whose exact pin/workplace falls
      // within the map's visible viewport. A broad canton/province coverage zone
      // is not precise enough for a zoomed-in map rectangle.
      if (filters.bounds) {
        const b = filters.bounds;
        const within = (lat: number, lng: number) => lat <= b.north && lat >= b.south && lng <= b.east && lng >= b.west;
        return mapped.filter((p) => {
          if (typeof p.lat === "number" && typeof p.lng === "number" && within(p.lat, p.lng)) return true;
          if ((p.workplaces ?? []).some((w) => typeof w.lat === "number" && typeof w.lng === "number" && within(w.lat as number, w.lng as number))) return true;
          return false;
        });
      }

      return mapped;
    } catch (err) {
      console.error("[searchProfessionals] Supabase error:", err);
    }
  }

  // No fake/seed fallback â€” only real professionals are ever listed.
  return [];
}

// ---------------------------------------------------------------------------
// Real zone coverage (home "Encuentra profesionales en tu zona")
// ---------------------------------------------------------------------------
// Returns, per province id, the set of cantÃ³n ids that GENUINELY have at least
// one listed professional â€” mirroring /buscar search semantics so a clicked
// zone never lands on an empty result. NO fabricated counts: a province with no
// professionals returns an empty list, and the UI then hides the count / shows
// an honest empty state. Best-effort + column-fallback so it never breaks home.
export type ZoneCoverage = {
  /** province id â†’ covered cantÃ³n ids (deduped). Empty array = no coverage yet. */
  byProvince: Record<string, string[]>;
  /** True if ANY professional covers the whole country (every zone then matches). */
  countryWide: boolean;
};

export async function getZoneCoverage(): Promise<ZoneCoverage> {
  const empty: ZoneCoverage = { byProvince: {}, countryWide: false };
  if (!SUPABASE_CONFIGURED) return empty;
  try {
    const supabase = createAdminClient();

    const select = (modern: boolean) =>
      supabase
        .from("professionals")
        .select(
          `provincia_id, canton_id${modern ? ", search_provincias, search_cantones, coverage_provincias, coverage_country, is_banned" : ""}, verification_status, profiles(is_disabled)`
        );

    let res = await select(true).eq("is_banned", false).neq("verification_status", "rejected");
    if (res.error && /is_banned|search_|coverage_|column/i.test(res.error.message)) {
      res = await select(false).neq("verification_status", "rejected");
    }
    if (res.error || !res.data) return empty;

    const byProvince: Record<string, Set<string>> = {};
    let countryWide = false;
    const add = (prov?: string | null, canton?: string | null) => {
      if (!prov) return;
      (byProvince[prov] ??= new Set<string>());
      if (canton) byProvince[prov].add(canton);
    };

    for (const row of res.data as unknown as Record<string, unknown>[]) {
      if ((row.profiles as { is_disabled?: boolean } | null)?.is_disabled) continue;

      add(row.provincia_id as string, row.canton_id as string);

      const searchProvs = Array.isArray(row.search_provincias) ? (row.search_provincias as string[]) : [];
      const searchCants = Array.isArray(row.search_cantones) ? (row.search_cantones as string[]) : [];
      for (const p of searchProvs) add(p, null);
      for (const c of searchCants) {
        const prov = getProvinceById((c.split("-")[0] as string) || "")?.id ?? c.split("-")[0];
        add(prov, c);
      }

      // Whole-province coverage â†’ every cantÃ³n in that province genuinely matches.
      const covProvs = Array.isArray(row.coverage_provincias) ? (row.coverage_provincias as string[]) : [];
      for (const pid of covProvs) {
        const prov = getProvinceById(pid);
        if (prov) prov.cantons.forEach((ct) => add(prov.id, ct.id));
      }

      if (row.coverage_country) countryWide = true;
    }

    return {
      byProvince: Object.fromEntries(Object.entries(byProvince).map(([k, v]) => [k, [...v]])),
      countryWide,
    };
  } catch (err) {
    console.error("[getZoneCoverage] Supabase error:", err);
    return empty;
  }
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
          `id, profile_id, slug, hourly_rate, is_verified, is_featured, is_available,
           rating_avg, review_count, bio, whatsapp, years_experience, portfolio_urls,
           category_id, professions, pricing, services, availability_public, contact_preference, languages, business_name, workplaces, verification_status, insurance_networks, lat, lng, service_type, videoconsulta,
           profiles(full_name, avatar_url),
           provincias(id, name),
           cantones(id, name),
           reviews(id, rating, comment, created_at, profiles(full_name, avatar_url))`
        )
        .eq("slug", slug)
        .single();

      if (error || !pro) throw error ?? new Error("Not found");

      // Tagged casos-de-Ã©xito + phone-call opt-in + coverage. Best-effort: separate
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let certifications: any[] = [];
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
      try {
        const { data: certRow } = await supabase.from("professionals").select("certifications").eq("id", pro.id).maybeSingle();
        if (certRow && Array.isArray((certRow as { certifications?: unknown[] }).certifications)) {
          certifications = (certRow as { certifications: unknown[] }).certifications;
        }
      } catch { /* column not migrated yet */ }
      let callPhone: string | undefined;
      try {
        const { data: cpRow } = await supabase.from("professionals").select("call_phone").eq("id", pro.id).maybeSingle();
        callPhone = (cpRow as { call_phone?: string } | null)?.call_phone ?? undefined;
      } catch { /* column not migrated yet */ }
      // Optional public contact email (the pro opts in to show it). Best-effort so
      // an unmigrated DB doesn't 500 the whole profile.
      let contactEmail: string | undefined;
      try {
        const { data: ceRow } = await supabase.from("professionals").select("contact_email").eq("id", pro.id).maybeSingle();
        contactEmail = (ceRow as { contact_email?: string } | null)?.contact_email ?? undefined;
      } catch { /* column not migrated yet */ }
      // Optional social links (URLs only). Best-effort so an unmigrated DB doesn't 500.
      let socialLinks: SocialLinks | undefined;
      try {
        const { data: slRow } = await supabase.from("professionals").select("social_links").eq("id", pro.id).maybeSingle();
        const raw = (slRow as { social_links?: SocialLinks } | null)?.social_links;
        if (raw && typeof raw === "object") socialLinks = raw;
      } catch { /* column not migrated yet */ }
      if (portfolioItems.length === 0) {
        portfolioItems = (pro.portfolio_urls ?? []).map((url: string) => ({ url }));
      }

      // Job-title snapshot per review (best-effort; column from migration 036) so
      // each review shows which job it belongs to. (Edited timestamps are NOT
      // surfaced publicly â€” only the author sees that, item 4.)
      const titleMap: Record<string, string | null> = {};
      try {
        const { data: rj } = await supabase.from("reviews").select("id, job_title").eq("professional_id", pro.id);
        for (const r of (rj ?? []) as { id: string; job_title?: string | null }[]) titleMap[r.id] = r.job_title ?? null;
      } catch { /* column not migrated yet */ }

      /* eslint-disable @typescript-eslint/no-explicit-any */
      const reviews: Review[] = ((pro.reviews as any[]) ?? []).map((r: any) => ({
        id: r.id,
        jobTitle: titleMap[r.id] ?? null,
        clientName: r.profiles?.full_name ?? "Cliente",
        clientAvatarUrl: r.profiles?.avatar_url,
        rating: r.rating,
        comment: r.comment,
        createdAt: r.created_at,
      }));
      const rawServices = (pro as any).services as ProService[] | undefined;
      const visibleServices = activeServices(rawServices);
      const legacyProfessions = ((pro as any).professions as string[]) ?? ((pro as any).category_id ? [(pro as any).category_id] : []);
      const publicProfessions = publicProfessionsFromServices(rawServices, legacyProfessions);

      return {
        id: pro.id,
        slug: pro.slug,
        fullName: (pro.profiles as any)?.full_name ?? "Profesional",
        avatarUrl: (pro.profiles as any)?.avatar_url ?? null,
        // category_id is a plain text column â€” no join needed
        categoryId: publicProfessions[0] ?? (pro as any).category_id ?? "",
        categoryIcon: "",
        professions: publicProfessions,
        // Price derived from Servicios (single source), legacy fields as fallback.
        pricing: deriveDisplayPricing(visibleServices, (pro as any).pricing as ProfessionalCardData["pricing"], (pro as any).hourly_rate),
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
        videoconsulta: !!(pro as any).videoconsulta,
        portfolioUrls: pro.portfolio_urls ?? [],
        portfolioItems,
        allowPhoneCall,
        coverage,
        reviews,
        services: visibleServices,
        availabilityPublic: (pro as any).availability_public ?? true,
        contactPreference: ((pro as any).contact_preference as ProfessionalCardData["contactPreference"]) ?? "ambas",
        languages: ((pro as any).languages as string[]) ?? [],
        businessName: ((pro as any).business_name as string) ?? undefined,
        workplaces: ((pro as any).workplaces as ProfessionalCardData["workplaces"]) ?? [],
        verificationStatus: ((pro as any).verification_status as ProfessionalCardData["verificationStatus"]) ?? "pending",
        insuranceNetworks: ((pro as any).insurance_networks as string[]) ?? [],
        certifications: certifications as Certification[],
        profileId: (pro as any).profile_id ?? undefined,
        callPhone,
        contactEmail,
        socialLinks,
      };
      /* eslint-enable @typescript-eslint/no-explicit-any */
    } catch (err) {
      console.error("[getProfessionalBySlug] Supabase error:", err);
    }
  }

  // No fake/seed fallback.
  return null;
}

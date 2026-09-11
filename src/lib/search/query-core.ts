import { searchProfessionals, type ProService } from "@/lib/queries/professionals";
import { getAllCategories, isHealthCategory, supportsVideoConsultCategory } from "@/lib/data/categories";
import { haversineKm, PROVINCES } from "@/lib/data/cr-geography";

// Everything /buscar needs to turn a URL into an ordered list of professionals,
// in one place so the page and the "load more" endpoint can never drift apart:
// the same filters, the same order and the same per-card location decisions.

export const RESULTS_PER_PAGE = 20;
const SORT_OPTIONS = new Set(["rating", "cercania", "experience"]);
const PRICE_AVAILABILITY_OPTIONS = new Set(["visible", "quote"]);
const PRICE_UNIT_OPTIONS = new Set(["por_hora", "por_consulta", "por_proyecto"]);

export type SearchPageParams = {
  categoria?: string;
  /** Familia de servicios: "Todos los servicios de Agro". */
  grupo?: string;
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
  n?: string;
  s?: string;
  e?: string;
  w?: string;
  page?: string;
  regression?: string;
};

type PriceUnit = "por_hora" | "por_consulta" | "por_proyecto";
export type SearchResult = Awaited<ReturnType<typeof searchProfessionals>>[number];
type SearchWorkplace = { id?: string; lat?: number; lng?: number; cantonId?: string; provinciaId?: string; provinceId?: string; name?: string; address?: string };

function isPriceUnit(value: string | undefined): value is PriceUnit {
  return value !== undefined && PRICE_UNIT_OPTIONS.has(value);
}

export function parseMultiParam(value: string | undefined): string[] {
  return [...new Set((value ?? "").split(",").map((item) => item.trim()).filter(Boolean))];
}

function isModality(value: string): value is "in_person" | "video" {
  return value === "in_person" || value === "video";
}

export function isExactWorkplacePin(workplace: SearchWorkplace) {
  return typeof workplace.lat === "number" && typeof workplace.lng === "number";
}

/** Every decision the URL implies, resolved once. */
export function parseSearchParams(params: SearchPageParams) {
  const requestedSortBy = SORT_OPTIONS.has(params.sortBy ?? "") ? (params.sortBy as "rating" | "cercania" | "experience") : "rating";
  const legacyPriceUnit = isPriceUnit(params.precio) ? params.precio : undefined;
  const priceType = PRICE_AVAILABILITY_OPTIONS.has(params.precio ?? "") ? (params.precio as "visible" | "quote") : undefined;
  const priceUnits = params.unidadPrecio
    ? parseMultiParam(params.unidadPrecio).filter(isPriceUnit)
    : legacyPriceUnit
      ? [legacyPriceUnit]
      : [];
  const modalities = parseMultiParam(params.modalidad).filter(isModality);
  const videoOnly = modalities.length === 1 && modalities[0] === "video";
  const inPersonOnly = modalities.length === 1 && modalities[0] === "in_person";
  const selectedCategory = params.categoria && params.categoria !== "todas" ? params.categoria : undefined;
  // Una familia entera: se expande a sus categorías visibles. Si el grupo no
  // existe o quedó sin categorías, se ignora en vez de buscar sin filtro.
  const grupoPedido = !selectedCategory && params.grupo ? params.grupo : undefined;
  const selectedGroupCategoryIds = grupoPedido
    ? getAllCategories().filter((category) => category.groupId === grupoPedido).map((category) => category.id)
    : [];
  const selectedGroupId = selectedGroupCategoryIds.length > 0 ? grupoPedido : undefined;
  const selectedCantonId = params.canton && params.canton !== "todos" ? params.canton : undefined;
  const selectedProvinceId = params.provincia && params.provincia !== "todas"
    ? params.provincia
    : selectedCantonId
      ? PROVINCES.find((province) => province.cantons.some((canton) => canton.id === selectedCantonId))?.id
      : undefined;
  const effectiveQuery = selectedCategory || selectedGroupId ? undefined : params.q;
  const parsedNearLat = params.lat ? Number(params.lat) : undefined;
  const parsedNearLng = params.lng ? Number(params.lng) : undefined;
  const nearLat = typeof parsedNearLat === "number" && Number.isFinite(parsedNearLat) ? parsedNearLat : undefined;
  const nearLng = typeof parsedNearLng === "number" && Number.isFinite(parsedNearLng) ? parsedNearLng : undefined;
  const sortBy = nearLat !== undefined && nearLng !== undefined && requestedSortBy === "cercania" ? "rating" : requestedSortBy;
  const parsedMapBounds = params.n && params.s && params.e && params.w
    ? { north: Number(params.n), south: Number(params.s), east: Number(params.e), west: Number(params.w) }
    : undefined;
  const mapBounds = parsedMapBounds && Object.values(parsedMapBounds).every(Number.isFinite) ? parsedMapBounds : undefined;
  const languageIds = parseMultiParam(params.idioma);
  // Insurers only narrow health services; elsewhere the parameter is ignored.
  const insurerIds = isHealthCategory(params.categoria) ? parseMultiParam(params.aseguradora) : [];

  return {
    requestedSortBy, sortBy, priceType, priceUnits, modalities, videoOnly, inPersonOnly,
    selectedCategory, selectedGroupId, selectedGroupCategoryIds, selectedCantonId, selectedProvinceId, effectiveQuery,
    nearLat, nearLng, mapBounds, languageIds, insurerIds,
  };
}

export type SearchFiltersResolved = ReturnType<typeof parseSearchParams>;

/** Months of experience the card and the "experiencia" order both use. */
export function experienceMonths(professional: SearchResult) {
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
}

export function sortResults(results: SearchResult[], sortBy: string) {
  const ratingTieBreak = (a: SearchResult, b: SearchResult) =>
    (b.ratingAvg ?? 0) - (a.ratingAvg ?? 0) ||
    (b.reviewCount ?? 0) - (a.reviewCount ?? 0) ||
    experienceMonths(b) - experienceMonths(a);
  if (sortBy === "successCases") return [...results].sort((a, b) => (b.portfolioCount ?? 0) - (a.portfolioCount ?? 0) || ratingTieBreak(a, b));
  if (sortBy === "experience") return [...results].sort((a, b) => experienceMonths(b) - experienceMonths(a) || ratingTieBreak(a, b));
  if (sortBy === "followers") return [...results].sort((a, b) => (b.followerCount ?? 0) - (a.followerCount ?? 0) || ratingTieBreak(a, b));
  return results;
}

/**
 * Qué tan puntual es la cobertura de un profesional para la zona que se pidió.
 * 3 = marcó ese cantón (o vive ahí, o tiene un local ahí), 2 = cubre toda la
 * provincia, 1 = cubre todo el país, 0 = llega por otra vía (videoconsulta).
 *
 * Sin esto, quien marcó "todo Costa Rica" se mezclaba con el de Atenas y podía
 * salir de primero solo por tener mejor nota: el que sí trabaja en el cantón
 * que buscaste es más útil aunque tenga una estrella menos.
 */
export function localityTier(pro: SearchResult, filters: SearchFiltersResolved) {
  const provincia = filters.selectedProvinceId ? PROVINCES.find((p) => p.id === filters.selectedProvinceId) : undefined;
  const canton = provincia && filters.selectedCantonId
    ? provincia.cantons.find((c) => c.id === filters.selectedCantonId)
    : undefined;
  if (!provincia && !canton) return 0;
  const workplaces = (pro.workplaces ?? []) as SearchWorkplace[];
  if (canton) {
    const enElCanton = pro.cantonName === canton.name
      || pro.coverage?.cantones?.includes(canton.name)
      || workplaces.some((w) => w.cantonId === canton.id || w.name?.includes(canton.name) || w.address?.includes(canton.name));
    if (enElCanton) return 3;
  }
  if (provincia) {
    const enLaProvincia = pro.provinceName === provincia.name
      || pro.coverage?.provincias?.includes(provincia.name)
      // Marcar cantones sueltos de esa provincia también es estar en la
      // provincia: si no, en una búsqueda por provincia caía por debajo de
      // quien solo marcó "todo el país".
      || provincia.cantons.some((c) => pro.coverage?.cantones?.includes(c.name))
      || workplaces.some((w) => w.provinciaId === provincia.id || w.provinceId === provincia.id || w.name?.includes(provincia.name) || w.address?.includes(provincia.name));
    // Sin cantón elegido, cubrir la provincia es lo más puntual que hay.
    if (enLaProvincia) return canton ? 2 : 3;
  }
  return pro.coverage?.country ? 1 : 0;
}

/**
 * Ordena por cercanía administrativa sin tocar el orden elegido: el reordenado
 * es estable, así que dentro de cada grupo se conserva la nota, la verificación
 * y todo lo demás. No se aplica con coordenadas exactas: ahí la distancia real
 * ya es una señal mejor que el nombre del cantón.
 */
function porZonaPedida(results: SearchResult[], filters: SearchFiltersResolved) {
  if (typeof filters.nearLat === "number" && typeof filters.nearLng === "number") return results;
  if (!filters.selectedCantonId && !filters.selectedProvinceId) return results;
  const tier = new Map<SearchResult, number>();
  for (const pro of results) tier.set(pro, localityTier(pro, filters));
  return [...results].sort((a, b) => (tier.get(b) ?? 0) - (tier.get(a) ?? 0));
}

/** Which location a card should show, and whether it drops to contact-only. */
export function locationDecisions(params: SearchPageParams, filters: SearchFiltersResolved) {
  const activeCategoryId = params.categoria && params.categoria !== "todas" ? params.categoria : undefined;
  const activeProvince = filters.selectedProvinceId ? PROVINCES.find((p) => p.id === filters.selectedProvinceId) : undefined;
  const activeCanton = activeProvince && params.canton && params.canton !== "todos"
    ? activeProvince.cantons.find((c) => c.id === params.canton)
    : undefined;
  const videoCompatibleSearch = !!activeCategoryId && supportsVideoConsultCategory(activeCategoryId);
  const selectedProvinceName = activeProvince?.name ?? "";
  const selectedCantonName = activeCanton?.name ?? "";
  const exactLocationActive = typeof filters.nearLat === "number" && typeof filters.nearLng === "number";

  function matchesSelectedPhysicalLocation(pro: SearchResult) {
    if (exactLocationActive) {
      const distances: number[] = [];
      for (const wp of (pro.workplaces ?? []) as SearchWorkplace[]) {
        if (isExactWorkplacePin(wp)) {
          distances.push(haversineKm(filters.nearLat as number, filters.nearLng as number, wp.lat as number, wp.lng as number));
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

  function shouldPreferVideoLocation(pro: SearchResult) {
    if (filters.inPersonOnly) return false;
    if (!videoCompatibleSearch || (!pro.videoconsulta && !pro.coverage?.country)) return false;
    if (filters.videoOnly) return true;
    if (!activeProvince && !activeCanton && !exactLocationActive) return false;
    return !matchesSelectedPhysicalLocation(pro);
  }

  function shouldShowContactOnly(pro: SearchResult) {
    if (shouldPreferVideoLocation(pro)) return false;
    if (filters.inPersonOnly) return false;
    if (!videoCompatibleSearch || (!pro.videoconsulta && !pro.coverage?.country)) return false;
    if (!activeProvince && !activeCanton && !exactLocationActive) return false;
    return !matchesSelectedPhysicalLocation(pro);
  }

  return { activeCategoryId, activeProvince, activeCanton, videoCompatibleSearch, exactLocationActive, matchesSelectedPhysicalLocation, shouldPreferVideoLocation, shouldShowContactOnly };
}

// The ordered list for a URL is kept for a minute in this process: the first
// screen renders it, and every "load more" of the same search reads it back
// instead of running the query and the sort again. Regression runs bypass it.
const RESOLVED_TTL_MS = 60_000;
const resolved = new Map<string, { at: number; value: Promise<{ filters: SearchFiltersResolved; ordered: SearchResult[] }> }>();

function resolvedKey(params: SearchPageParams) {
  return Object.entries(params)
    .filter(([key, value]) => key !== "page" && value)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
}

/** The ordered result set for a URL — the single source of truth for both callers. */
export async function resolveSearchResults(params: SearchPageParams) {
  const key = resolvedKey(params);
  const cached = resolved.get(key);
  if (!params.regression && cached && Date.now() - cached.at < RESOLVED_TTL_MS) return cached.value;
  const value = resolveSearchResultsUncached(params);
  if (!params.regression) {
    resolved.set(key, { at: Date.now(), value });
    value.catch(() => resolved.delete(key));
    if (resolved.size > 200) resolved.delete(resolved.keys().next().value as string);
  }
  return value;
}

/** What a search card needs, and nothing heavier: descriptions and long bios
 *  never reach the browser from the list. */
export function cardData<T extends SearchResult>(professional: T): T {
  const services = (professional.services as Array<Record<string, unknown>> | undefined)?.map((service) => {
    const { description: _description, ...rest } = service;
    void _description;
    return rest;
  });
  return { ...professional, bio: (professional.bio ?? "").slice(0, 240), services } as T;
}

async function resolveSearchResultsUncached(params: SearchPageParams) {
  const filters = parseSearchParams(params);
  const results = await searchProfessionals({
    categoryId: filters.selectedCategory,
    categoryIds: filters.selectedGroupCategoryIds,
    provinceId: filters.selectedProvinceId,
    cantonId: filters.selectedCantonId,
    sortBy: filters.sortBy,
    query: filters.effectiveQuery,
    insurerIds: filters.insurerIds,
    languageIds: filters.languageIds,
    priceType: filters.priceType,
    priceUnits: filters.priceUnits,
    modalities: filters.modalities,
    nearLat: filters.nearLat,
    nearLng: filters.nearLng,
    bounds: filters.mapBounds,
  }, {
    fresh: process.env.E2E_FIXTURES_READY === "1" && Boolean(params.regression),
  });
  return { filters, ordered: porZonaPedida(sortResults(results, filters.sortBy), filters) };
}

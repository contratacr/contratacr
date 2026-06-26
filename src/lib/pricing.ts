// Professional pricing model — supports multiple tiers of different types.
export type PricingType =
  | "por_hora"
  | "por_consulta"
  | "por_proyecto"
  | "por_dia"
  | "paquete"
  | "a_convenir";

export type PricingTier = {
  id: string;
  type: PricingType;
  amount?: number; // colones; omitted for "a_convenir"
  label?: string;  // optional package name
};

export const PRICING_TYPES: { value: PricingType; label: string; suffix: string }[] = [
  { value: "por_hora", label: "Por hora", suffix: "/hora" },
  { value: "por_consulta", label: "Por consulta", suffix: "/consulta" },
  { value: "por_proyecto", label: "Por proyecto", suffix: "/proyecto" },
  { value: "por_dia", label: "Por día", suffix: "/día" },
  { value: "paquete", label: "Paquete", suffix: "" },
  { value: "a_convenir", label: "Consultar precio", suffix: "" },
];

export function formatColones(amount: number): string {
  return `₡${amount.toLocaleString("es-CR")}`;
}

const PRICING_COPY: Record<"es" | "en", Record<PricingType, { fallback: string; suffix: string; packagePrefix: string }>> = {
  es: {
    por_hora: { fallback: "Consultar precio", suffix: "/hora", packagePrefix: "Paquete: " },
    por_consulta: { fallback: "Consultar precio", suffix: "/consulta", packagePrefix: "Paquete: " },
    por_proyecto: { fallback: "Consultar precio", suffix: "/proyecto", packagePrefix: "Paquete: " },
    por_dia: { fallback: "Consultar precio", suffix: "/día", packagePrefix: "Paquete: " },
    paquete: { fallback: "a convenir", suffix: "", packagePrefix: "Paquete: " },
    a_convenir: { fallback: "Consultar precio", suffix: "", packagePrefix: "Paquete: " },
  },
  en: {
    por_hora: { fallback: "Ask for price", suffix: "/hour", packagePrefix: "Package: " },
    por_consulta: { fallback: "Ask for price", suffix: "/consultation", packagePrefix: "Package: " },
    por_proyecto: { fallback: "Ask for price", suffix: "/project", packagePrefix: "Package: " },
    por_dia: { fallback: "Ask for price", suffix: "/day", packagePrefix: "Package: " },
    paquete: { fallback: "to be agreed", suffix: "", packagePrefix: "Package: " },
    a_convenir: { fallback: "Ask for price", suffix: "", packagePrefix: "Package: " },
  },
};

function pricingLocale(locale?: string): "es" | "en" {
  return locale?.startsWith("en") ? "en" : "es";
}

/** Human-readable single tier, e.g. "₡15,000/hora" or "Consultar precio". */
export function formatPricingTier(tier: PricingTier, locale?: string): string {
  const copy = PRICING_COPY[pricingLocale(locale)][tier.type];
  if (tier.type === "a_convenir") return copy.fallback;
  const suffix = copy.suffix;
  if (tier.type === "paquete") {
    const base = tier.label ? `${tier.label}: ` : copy.packagePrefix;
    return tier.amount != null ? `${base}${formatColones(tier.amount)}` : `${base}${copy.fallback}`;
  }
  return tier.amount != null ? `${formatColones(tier.amount)} ${suffix}` : copy.fallback;
}

/** Format a single service's price from its amount + type, e.g. "₡15,000/hora". */
export function formatServicePrice(amount?: number | null, type?: PricingType | null, locale?: string): string | null {
  if (amount == null && !type) return null;
  return formatPricingTier({ id: "", type: type ?? "a_convenir", amount: amount ?? undefined }, locale);
}

/**
 * Single source of truth for the card "Desde" price: derive it from the pro's
 * SERVICES (price now lives ONLY in the Servicios tab). Picks the cheapest
 * priced service; if services exist but none are priced → "consultar precio". Falls
 * back to the legacy profile-level `pricing` / `hourly_rate` for pros who haven't
 * re-saved under the unified model yet (no displayed price is ever lost).
 */
export function deriveDisplayPricing(
  services: { priceAmount?: number | null; priceType?: PricingType | null }[] | null | undefined,
  legacyPricing?: PricingTier[] | null,
  hourlyRate?: number | null
): PricingTier[] {
  const list = Array.isArray(services) ? services : [];
  const priced = list.filter((s) => typeof s.priceAmount === "number" && (s.priceAmount as number) > 0);
  if (priced.length > 0) {
    const min = priced.reduce((a, b) => ((a.priceAmount as number) <= (b.priceAmount as number) ? a : b));
    return [{ id: "svc_min", type: (min.priceType as PricingType) ?? "por_proyecto", amount: min.priceAmount as number }];
  }
  // Legacy fallback first (back-compat for pros who set profile-level pricing).
  if (legacyPricing && legacyPricing.length > 0) return legacyPricing;
  if (hourlyRate) return [{ id: "legacy_hour", type: "por_hora", amount: hourlyRate }];
  // Has services but none priced → show "consultar precio".
  if (list.length > 0) return [{ id: "svc_na", type: "a_convenir" }];
  return [];
}

/** Compact "from" price for cards. Falls back to legacy hourlyRate. */
export function primaryPricingLabel(
  pricing: PricingTier[] | undefined | null,
  hourlyRate?: number | null,
  locale?: string
): string {
  if (pricing && pricing.length > 0) return formatPricingTier(pricing[0], locale);
  if (hourlyRate) return `${formatColones(hourlyRate)} ${pricingLocale(locale) === "en" ? "/hour" : "/hora"}`;
  return pricingLocale(locale) === "en" ? "Ask for price" : "Consultar precio";
}

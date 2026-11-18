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

export const TAX_INCLUDED_SUFFIX = "I.V.A.I.";

export const PRICING_TYPES: { value: PricingType; label: string; suffix: string }[] = [
  { value: "por_hora", label: "Por hora", suffix: "/hora" },
  { value: "por_consulta", label: "Por consulta", suffix: "/consulta" },
  { value: "por_proyecto", label: "Por trabajo", suffix: "" },
  { value: "por_dia", label: "Por trabajo", suffix: "" },
  { value: "paquete", label: "Por trabajo", suffix: "" },
  { value: "a_convenir", label: "Consultar precio", suffix: "" },
];

/**
 * SOLO DOS FORMAS DE COBRAR (18-nov-2026). De 386 perfiles, 327 no ponían
 * precio y casi todos los demás usaban "Por hora"; "Por proyecto", "Paquete",
 * "Por día" y "Por consulta" decían lo mismo con otro nombre: un precio por el
 * trabajo completo. Al profesional se le ofrece "Por trabajo" (guardado como
 * por_proyecto, sin migrar nada) o "Por hora"; en salud la primera se llama
 * "Por consulta". Lo viejo se sigue leyendo: por_dia y paquete se muestran
 * como "Por trabajo".
 */
const CATEGORIAS_POR_CONSULTA = new Set([
  "psicologia", "psiquiatria", "nutricion", "fisioterapia", "odontologia", "ortodoncia", "pediatria",
  "optometria", "medico_especialista", "cardiologia", "medicina_domicilio", "terapia_lenguaje",
  "terapia_ocupacional", "podologia", "acupuntura", "veterinaria",
]);
const CATEGORIAS_POR_HORA = new Set([
  "tutorias", "idiomas", "clases_frances", "clases_portugues", "clases_mandarin", "clases_japones", "musica",
  "matematicas", "preparacion_universitaria", "clases_manejo", "clases_baile", "clases_cocina",
  "entrenamiento_personal", "entrenamiento_deportivo", "enfermeria", "cuidado_adultos", "cuidado_discapacidad",
  "cuidado_infantil", "soporte_tecnico", "consultoria_ti", "legal", "consultoria",
]);

export type UnidadDeTarifa = "por_proyecto" | "por_consulta" | "por_hora";

/** Las dos unidades que se ofrecen para un servicio, la sugerida primero. */
export function unidadesDeTarifa(categoryId?: string | null): UnidadDeTarifa[] {
  const fija: UnidadDeTarifa = categoryId && CATEGORIAS_POR_CONSULTA.has(categoryId) ? "por_consulta" : "por_proyecto";
  return categoryId && CATEGORIAS_POR_HORA.has(categoryId) ? ["por_hora", fija] : [fija, "por_hora"];
}

/** La unidad que viene marcada para un servicio nuevo. */
export function unidadSugerida(categoryId?: string | null): UnidadDeTarifa {
  return unidadesDeTarifa(categoryId)[0];
}

/** Lleva una unidad guardada (también las viejas) a una de las dos que se ofrecen. */
export function unidadParaCategoria(type: PricingType | null | undefined, categoryId?: string | null): UnidadDeTarifa {
  if (type === "por_hora") return "por_hora";
  if (!type || type === "a_convenir") return unidadSugerida(categoryId);
  return unidadesDeTarifa(categoryId).find((u) => u !== "por_hora")!;
}

/**
 * Agrupa los miles a mano en vez de pedírselo al navegador. `toLocaleString("es-CR")`
 * no da lo mismo en todos los motores: Node y Chrome escriben ₡120.000 y Safari
 * escribe ₡120 000 (espacio fino). Como el precio se pinta en el servidor, esa
 * diferencia rompía la hidratación en iPhone y React rearmaba la tarjeta entera.
 */
export function agruparMiles(amount: number, separador = "."): string {
  const entero = Math.round(Math.abs(amount)).toString();
  const agrupado = entero.replace(/\B(?=(\d{3})+(?!\d))/g, separador);
  return amount < 0 ? `-${agrupado}` : agrupado;
}

export function formatColones(amount: number): string {
  return `₡${agruparMiles(amount)}`;
}

function formatColonesTaxIncluded(amount: number): string {
  return `${formatColones(amount)} ${TAX_INCLUDED_SUFFIX}`;
}

export function addTaxIncludedToPriceLabel(label: string): string {
  if (!label.includes("₡") || label.includes(TAX_INCLUDED_SUFFIX)) return label;
  return `${label} ${TAX_INCLUDED_SUFFIX}`;
}

export function splitPricingLabel(label: string): {
  amount: string;
  unit: string;
  taxSuffix: string;
  isColones: boolean;
} {
  const taxSuffix = label.includes(TAX_INCLUDED_SUFFIX) ? TAX_INCLUDED_SUFFIX : "";
  const clean = taxSuffix ? label.replace(TAX_INCLUDED_SUFFIX, "").trim() : label;
  const slash = clean.indexOf("/");
  return {
    amount: slash >= 0 ? clean.slice(0, slash).trim() : clean,
    unit: slash >= 0 ? clean.slice(slash).trim() : "",
    taxSuffix,
    isColones: clean.includes("₡"),
  };
}

const PRICING_COPY: Record<"es" | "en", Record<PricingType, { fallback: string; suffix: string; packagePrefix: string }>> = {
  es: {
    por_hora: { fallback: "Consultar precio", suffix: "/hora", packagePrefix: "Paquete: " },
    por_consulta: { fallback: "Consultar precio", suffix: "/consulta", packagePrefix: "Paquete: " },
    por_proyecto: { fallback: "Consultar precio", suffix: "", packagePrefix: "Paquete: " },
    por_dia: { fallback: "Consultar precio", suffix: "", packagePrefix: "Paquete: " },
    paquete: { fallback: "Consultar precio", suffix: "", packagePrefix: "Paquete: " },
    a_convenir: { fallback: "Consultar precio", suffix: "", packagePrefix: "Paquete: " },
  },
  en: {
    por_hora: { fallback: "Ask for price", suffix: "/hour", packagePrefix: "Package: " },
    por_consulta: { fallback: "Ask for price", suffix: "/consultation", packagePrefix: "Package: " },
    por_proyecto: { fallback: "Ask for price", suffix: "", packagePrefix: "Package: " },
    por_dia: { fallback: "Ask for price", suffix: "", packagePrefix: "Package: " },
    paquete: { fallback: "Ask for price", suffix: "", packagePrefix: "Package: " },
    a_convenir: { fallback: "Ask for price", suffix: "", packagePrefix: "Package: " },
  },
};

function pricingLocale(locale?: string): "es" | "en" {
  return locale?.startsWith("en") ? "en" : "es";
}

function formatAmountWithUnit(amount: number, suffix: string): string {
  return suffix
    ? `${formatColones(amount)} ${suffix} ${TAX_INCLUDED_SUFFIX}`
    : formatColonesTaxIncluded(amount);
}

/** Human-readable single tier, e.g. "₡15,000 /hora I.V.A.I." or "Consultar precio". */
function formatPricingTier(tier: PricingTier, locale?: string): string {
  const copy = PRICING_COPY[pricingLocale(locale)][tier.type];
  if (tier.type === "a_convenir") return copy.fallback;
  const suffix = copy.suffix;
  return tier.amount != null ? formatAmountWithUnit(tier.amount, suffix) : copy.fallback;
}

/** Format a single service's price from its amount + type, e.g. "₡15,000 /hora I.V.A.I.". */
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
  if (pricing && pricing.length > 0) {
    const label = formatPricingTier(pricing[0], locale);
    return pricing[0].type !== "a_convenir" && typeof pricing[0].amount === "number" && pricing[0].amount > 0
      ? `${pricingLocale(locale) === "en" ? "From" : "Desde"} ${label}` : label;
  }
  if (hourlyRate) return `${pricingLocale(locale) === "en" ? "From" : "Desde"} ${formatAmountWithUnit(hourlyRate, pricingLocale(locale) === "en" ? "/hour" : "/hora")}`;
  return pricingLocale(locale) === "en" ? "Ask for price" : "Consultar precio";
}

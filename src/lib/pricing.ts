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
  { value: "a_convenir", label: "Precio a convenir", suffix: "" },
];

export function formatColones(amount: number): string {
  return `₡${amount.toLocaleString("es-CR")}`;
}

/** Human-readable single tier, e.g. "₡15,000/hora" or "Precio a convenir". */
export function formatPricingTier(tier: PricingTier): string {
  if (tier.type === "a_convenir") return "Precio a convenir";
  const meta = PRICING_TYPES.find((p) => p.value === tier.type);
  const suffix = meta?.suffix ?? "";
  if (tier.type === "paquete") {
    const base = tier.label ? `${tier.label}: ` : "Paquete: ";
    return tier.amount != null ? `${base}${formatColones(tier.amount)}` : `${base}a convenir`;
  }
  return tier.amount != null ? `${formatColones(tier.amount)}${suffix}` : "Precio a convenir";
}

/** Format a single service's price from its amount + type, e.g. "₡15,000/hora". */
export function formatServicePrice(amount?: number | null, type?: PricingType | null): string | null {
  if (amount == null && !type) return null;
  return formatPricingTier({ id: "", type: type ?? "a_convenir", amount: amount ?? undefined });
}

/** Compact "from" price for cards. Falls back to legacy hourlyRate. */
export function primaryPricingLabel(
  pricing: PricingTier[] | undefined | null,
  hourlyRate?: number | null
): string {
  if (pricing && pricing.length > 0) return formatPricingTier(pricing[0]);
  if (hourlyRate) return `${formatColones(hourlyRate)}/hora`;
  return "Precio a convenir";
}

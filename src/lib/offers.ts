export const OFFER_TYPES = {
  service_offer: "Servicio en oferta",
  product: "Producto",
  package: "Paquete",
} as const;

export const OFFER_PRICE_UNITS = {
  total: "total",
  hour: "por hora",
  session: "por sesión",
  project: "por proyecto",
  month: "por mes",
} as const;

export type OfferType = keyof typeof OFFER_TYPES;
export type OfferPriceUnit = keyof typeof OFFER_PRICE_UNITS;

export type ProfessionalOffer = {
  id: string;
  professional_id: string;
  service_category_id?: string | null;
  title: string;
  description: string;
  offer_type: OfferType;
  service_label: string | null;
  image_urls: string[];
  price_now: number | null;
  price_before: number | null;
  currency: "CRC" | "USD";
  price_unit: OfferPriceUnit;
  location_label: string | null;
  valid_until: string | null;
  quantity_available: number | null;
  status: "draft" | "published" | "paused" | "expired" | "sold_out";
  created_at: string;
  professional_name?: string;
  professional_slug?: string | null;
  professional_avatar_url?: string | null;
  professional_whatsapp?: string | null;
  professional_allow_phone_call?: boolean | null;
  professional_call_phone?: string | null;
  professional_contact_email?: string | null;
};

export function isOfferExpired(offer: Pick<ProfessionalOffer, "valid_until">, today: string) {
  return Boolean(offer.valid_until && offer.valid_until < today);
}

export function effectiveOfferStatus(
  offer: Pick<ProfessionalOffer, "status" | "valid_until">,
  today: string,
): ProfessionalOffer["status"] {
  return offer.status === "published" && isOfferExpired(offer, today) ? "expired" : offer.status;
}

export function formatOfferPrice(
  offer: Pick<ProfessionalOffer, "price_now" | "currency" | "price_unit">,
  locale = "es",
) {
  if (offer.price_now == null) return locale === "en" ? "Price negotiable" : "A convenir";
  const symbol = offer.currency === "USD" ? "$" : "₡";
  const amount = `${symbol}${new Intl.NumberFormat(locale === "en" ? "en-US" : "es-CR").format(offer.price_now)}`;
  const unit = locale === "en"
    ? { total: "total", hour: "per hour", session: "per session", project: "per project", month: "per month" }[offer.price_unit]
    : OFFER_PRICE_UNITS[offer.price_unit];
  return offer.price_unit === "total" ? amount : `${amount} ${unit}`;
}

export function formatOfferBeforePrice(
  offer: Pick<ProfessionalOffer, "price_before" | "currency">,
  locale = "es",
) {
  if (offer.price_before == null) return null;
  const symbol = offer.currency === "USD" ? "$" : "₡";
  return `${symbol}${new Intl.NumberFormat(locale === "en" ? "en-US" : "es-CR").format(offer.price_before)}`;
}

export function sanitizeOfferImages(urls: string[]) {
  return urls
    .map((url) => url.trim())
    .filter((url) => /^https:\/\//iu.test(url))
    .slice(0, 5);
}

export function offerDiscountPercent(offer: Pick<ProfessionalOffer, "price_now" | "price_before">) {
  if (!offer.price_now || !offer.price_before || offer.price_before <= offer.price_now) return null;
  return Math.round((1 - offer.price_now / offer.price_before) * 100);
}

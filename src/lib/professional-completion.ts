import { hasBaseCanton } from "@/lib/location";
import { serviceSupportsProfessionalCredential } from "@/lib/professional-credentials";
import { countCases } from "@/lib/services";

type ProRecord = Record<string, unknown>;

export type CompletionItem = {
  key: string;
  done: boolean;
  tab: string;
  optional?: boolean;
};

function hasLen(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0;
}

function hasText(value: unknown, min = 1): boolean {
  return typeof value === "string" && value.trim().length >= min;
}

function firstObject(value: unknown): Record<string, unknown> {
  if (Array.isArray(value)) {
    const first = value.find((item) => item && typeof item === "object");
    return (first ?? {}) as Record<string, unknown>;
  }
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function activeServices(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((service) => {
    if (!service || typeof service !== "object") return false;
    return (service as { active?: unknown }).active !== false;
  }) as Array<Record<string, unknown>>;
}

function socialLinks(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function hasAnyText(...values: unknown[]) {
  return values.some((value) => hasText(value));
}

export function computeCompletion(pro: ProRecord): {
  percent: number;
  items: CompletionItem[];
  verified: boolean;
} {
  const profiles = firstObject(pro.profiles);
  const hasProfilePhoto =
    hasText(profiles.avatar_url) ||
    (typeof pro.avatar_url === "string" && pro.avatar_url.trim().length > 0);
  // Completion must follow the editor's actual rule: a saved, non-empty
  // description is complete. Requiring a second hidden minimum here caused a
  // correctly saved description to keep reappearing in the checklist.
  const hasBio = [pro.bio, pro.description, profiles.bio, profiles.description]
    .some((value) => hasText(value));

  const hasLocation = hasBaseCanton(pro.workplaces);
  const services = activeServices(pro.services);
  const hasSelectedServices = services.length > 0;
  const hasServiceDescription = services.some((service) => hasText(service.description));
  // Un «desde ₡» de verdad: «a convenir» ya no cuenta (9-oct-2026). Medido el
  // 8-oct: 21 de 313 perfiles tenían un precio, porque la casilla «a convenir»
  // daba el paso por hecho, y el panel pedía el precio en una tarjeta aparte
  // mientras la lista decía que estaba listo.
  const hasServicePrice = services.some((service) =>
    service.priceType !== "a_convenir" && (
      (typeof service.priceAmount === "number" && service.priceAmount > 0) ||
      hasText(service.price)
    )
  );
  // La primera reseña es lo que más sube los mensajes (Thumbtack: ~70 %). No es
  // un dato del perfil sino algo que se pide a los clientes; por eso su paso
  // abre WhatsApp con el mensaje listo en vez de una sección del panel.
  const hasReviews = Number(pro.review_count ?? 0) > 0;
  const hasServiceExperience = services.some((service) =>
    (typeof service.startedAt === "string" && /^\d{4}-\d{2}$/.test(service.startedAt)) ||
    (typeof service.years === "number" && service.years > 0) ||
    (typeof service.months === "number" && service.months > 0)
  );
  const links = socialLinks(pro.social_links);
  const hasPublicLinks = hasAnyText(links.website, links.instagram, links.facebook, links.tiktok, links.linkedin);
  // An empty legacy value means the platform default: Spanish.
  const hasLanguages = !Array.isArray(pro.languages) || pro.languages.length === 0 ||
    pro.languages.some((language) => hasText(language));
  const hasEducation = hasLen(pro.certifications);
  const hasPortfolio =
    countCases(
      Array.isArray(pro.portfolio_items) ? pro.portfolio_items : null,
      Array.isArray(pro.portfolio_urls) ? pro.portfolio_urls : null
    ) > 0 || hasLen(pro.portfolio);
  const hasServiceImage = services.some((service) => hasText(service.imageUrl));
  const credentialServices = services.filter((service) => {
    const category = typeof service.category === "string" ? service.category : "";
    return serviceSupportsProfessionalCredential(category);
  });
  const hasServiceCredential = credentialServices.length > 0 && credentialServices.every((service) =>
    hasText(service.professionalCredentialNumber)
  );
  const hasVerification = pro.verification_status === "verified";
  // Core steps in IMPACT order: what most affects getting hired goes first.
  const items: CompletionItem[] = [
    { key: "photo", done: hasProfilePhoto, tab: "profile" },
    { key: "whatsapp", done: hasText(pro.whatsapp), tab: "profile" },
    { key: "services", done: hasSelectedServices, tab: "services" },
    { key: "reviews", done: hasReviews, tab: "reviews" },
    { key: "servicePrice", done: hasServicePrice, tab: "services" },
    { key: "serviceDescription", done: hasServiceDescription, tab: "services" },
    { key: "serviceExperience", done: hasServiceExperience, tab: "services" },
    { key: "location", done: hasLocation, tab: "profile" },
    { key: "bio", done: hasBio, tab: "profile" },
    { key: "languages", done: hasLanguages, tab: "profile", optional: true },
    { key: "publicLinks", done: hasPublicLinks, tab: "profile", optional: true },
    { key: "education", done: hasEducation, tab: "profile", optional: true },
    { key: "verification", done: hasVerification, tab: "profile", optional: true },
    { key: "serviceImage", done: hasServiceImage, tab: "services", optional: true },
    ...(credentialServices.length > 0
      ? [{ key: "serviceCredential", done: hasServiceCredential, tab: "services", optional: true }]
      : []),
    { key: "portfolio", done: hasPortfolio, tab: "photos", optional: true },
  ];

  const coreItems = items.filter((item) => !item.optional);
  const optionalItems = items.filter((item) => item.optional);
  const coreDone = coreItems.filter((item) => item.done).length;
  const optionalDone = optionalItems.filter((item) => item.done).length;
  // Weighted: the essentials carry 80% — optional extras can no longer make an
  // unfinished profile read as "almost done".
  const percent = Math.round(
    (coreItems.length ? (coreDone / coreItems.length) * 80 : 80) +
    (optionalItems.length ? (optionalDone / optionalItems.length) * 20 : 20),
  );
  return { percent, items, verified: pro.verification_status === "verified" };
}

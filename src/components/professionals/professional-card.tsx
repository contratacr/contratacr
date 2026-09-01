"use client";

import { useLocale, useTranslations } from "next-intl";
import { Star } from "lucide-react";
import { ProfessionalSchedule, type ScheduleSlot } from "@/components/professionals/professional-schedule";
import { Link } from "@/i18n/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getInitials } from "@/lib/utils";
import { supportsVideoConsultCategory, getCategoryLabel } from "@/lib/data/categories";
import { primaryPricingLabel, splitPricingLabel, type PricingTier } from "@/lib/pricing";
import { getProfessionalDisplayName } from "@/lib/display-name";
import { ResponsiveServiceSummary } from "@/components/professionals/responsive-service-summary";
import { ResponsiveVerifiedName } from "@/components/professionals/responsive-verified-name";

// A certification is a plain TEXT entry (no images): the certificate name, and
// optionally the issuing institution + year. It belongs to a specific PROFESSION
// (category id) so a multi-profession pro lists them per profession. Authenticity
// isn't verified yet.
export type Certification = { id?: string; name: string; institution?: string; year?: string; profession?: string };

export type ProfessionalCardData = {
  id: string;
  /** Owner's auth user id (professionals.profile_id) — used to detect "this is my
   *  own profile" and hide self-service actions. */
  profileId?: string;
  slug: string;
  fullName: string;
  avatarUrl?: string;
  categoryId: string;
  categoryIcon: string;
  professions?: string[];
  pricing?: PricingTier[];
  bio: string;
  /** Empty for anonymous viewers — contact values are account-gated (src/lib/contact/redact.ts). */
  whatsapp: string;
  hasWhatsapp?: boolean;
  hasCallPhone?: boolean;
  hasContactEmail?: boolean;
  provinceName: string;
  cantonName: string;
  ratingAvg: number;
  reviewCount: number;
  yearsExperience?: number;
  monthsExperience?: number;
  hourlyRate?: number;
  isVerified: boolean;
  isFeatured: boolean;
  isAvailable: boolean;
  availabilityPublic?: boolean;
  contactPreference?: "solo_whatsapp" | "solo_citas" | "ambas";
  languages?: string[];
  businessName?: string;
  publicBusinessNameOnly?: boolean;
  workplaces?: { id?: string; name: string; address?: string; lat?: number; lng?: number }[];
  verificationStatus?: "pending" | "verified" | "rejected" | "under_appeal";
  lat?: number | null;
  lng?: number | null;
  serviceType?: string | null;
  /** General profile-level capability: the pro can attend online when appropriate. */
  videoconsulta?: boolean;
  /** Count of "casos de éxito" (portfolio photos) — drives the preview link. */
  portfolioCount?: number;
  /** Public follower count for the professional profile. */
  followerCount?: number;
  /** Count of certifications — drives the compact "Ver certificaciones (N)" link. */
  certificationCount?: number;
  /** Insurance networks (aseguradoras) the pro belongs to. */
  insuranceNetworks?: string[];
  /** Real travel-coverage summary (item 16): country-wide, provinces, cantones. */
  coverage?: { country: boolean; provincias: string[]; cantones: string[] };
  /** Per-service delivery modes. Existing records may omit modalities and default in UI. */
  services?: Array<{
    id?: string;
    name?: string;
    description?: string;
    price?: string;
    priceAmount?: number | null;
    priceType?: import("@/lib/pricing").PricingType | null;
    years?: number;
    months?: number;
    active?: boolean;
    category?: string;
    modalities?: Array<"in_person" | "at_home" | "video">;
  }>;
  /** Opt-in: the pro chose to expose phone-call contact (Disponibilidad). */
  allowPhoneCall?: boolean;
  /** Optional SEPARATE number for calls. When unset, the WhatsApp number is used
   *  for calls too. WhatsApp button always uses `whatsapp`. */
  callPhone?: string;
  /** Optional public contact email the pro opted in to show clients. */
  contactEmail?: string;
};

interface ProfessionalCardProps {
  professional: ProfessionalCardData;
  className?: string;
  highlightMetric?: "rating" | "successCases" | "experience" | "followers";
  slots?: ScheduleSlot[];
  /** False in search results when availability streams after profile data. */
  slotsInitiallyLoaded?: boolean;
  /** Active category filter from the search query — narrows the badges shown. */
  activeCategory?: string;
  /** Viewer's auth id — when it matches this pro's owner, hide self-service actions. */
  viewerProfileId?: string;
  /** 1-based rank — rendered as a navy badge overlapping the avatar, matching the map pin. */
  rank?: number;
  /** Search is explicitly for video consultation: show contact actions, not schedules. */
  forceContactOnly?: boolean;
  /** Search context should open a specific schedule tab, usually videoconsulta. */
  preferredLocationId?: string;
  /** Hide other location tabs when the search matched a specific modality/location only. */
  restrictToPreferredLocation?: boolean;
  /** Search page: align the schedule skeleton with the initial map/filter hydration. */
  syncScheduleWithSearchLoading?: boolean;
  /** Search page return path, including filters/page, so profile "Volver" restores results. */
  searchReturnHref?: string;
}

export function ProfessionalCard({ professional, className, highlightMetric = "rating", slots = [], slotsInitiallyLoaded = true, activeCategory, viewerProfileId, rank, forceContactOnly = false, preferredLocationId, restrictToPreferredLocation = false, syncScheduleWithSearchLoading = false, searchReturnHref }: ProfessionalCardProps) {
  const tCard = useTranslations("card");
  const tSchedule = useTranslations("schedule");
  const locale = useLocale();
  // Safe category label: if a translation key is missing, next-intl returns the
  // raw "categories.xxx" path — fall back to the taxonomy label (e.g. "otro" →
  // "Otro servicio") so no internal key ever leaks into the UI.
  const catLabel = (id: string) => {
    if (!id) return "";
    return getCategoryLabel(id, locale);
  };
  const isPrivate = professional.availabilityPublic === false;
  // Brand hierarchy: company name leads (clients recognize the brand), personal
  // name becomes the muted subtitle. No company → personal name leads, no subtitle.
  const businessName = professional.businessName?.trim();
  const displayName = getProfessionalDisplayName(professional.fullName, businessName);
  const categoryName = catLabel(professional.categoryId);
  const allProfessions = (professional.professions && professional.professions.length > 0
    ? professional.professions
    : [professional.categoryId]
  ).filter(Boolean);
  // When the user searched a specific category, show only that matching badge.
  // Mobile shows one complete service plus "+N". Two mobile chips repeatedly
  // produced two unreadable ellipses on real professional data. Desktop keeps
  // the denser three-chip summary.
  const displayProfessions =
    activeCategory && allProfessions.includes(activeCategory)
      ? [activeCategory]
      : allProfessions;
  // Si se buscó un servicio concreto, la tarjeta muestra ESE y nada más: el
  // resto va al contador "+N". Antes se anteponía el buscado pero se dejaba la
  // lista detrás, así que en pantallas anchas cabían dos y se veían servicios
  // que no se habían buscado.
  const mobileDisplayProfessions =
    activeCategory && allProfessions.includes(activeCategory)
      ? [activeCategory]
      : allProfessions;
  const mobileProfessionList = mobileDisplayProfessions.slice(0, 1);
  // Price split so the AMOUNT can be brand-blue and the /unit muted grey (matches the
  // target screenshots — e.g. "₡10 000" blue + " /hora" grey). A text price like
  // "Consultar precio" has no "/" and renders whole in grey.
  const priceLabel = primaryPricingLabel(professional.pricing, professional.hourlyRate, locale);
  const { amount: priceAmount, unit: priceUnit, taxSuffix: priceTaxSuffix } = splitPricingLabel(priceLabel);
  const mobileIsPriceOnRequest = Boolean(priceLabel && !priceUnit && !priceTaxSuffix);
  const mobilePricePrimary = mobileIsPriceOnRequest
    ? (locale === "en" ? "Price" : "Precio")
    : priceAmount;
  const mobilePriceSecondary = mobileIsPriceOnRequest
    ? (locale === "en" ? "On request" : "A consultar")
    : [priceUnit, priceTaxSuffix].filter(Boolean).join(" · ");
  const priceBoxClass = "max-w-[48%]";
  const isVerified = professional.verificationStatus === "verified";
  const mobileExtraProfessions = mobileDisplayProfessions.length - mobileProfessionList.length;
  const mobileServiceChipClass = "inline-flex max-w-full shrink-0 items-center whitespace-nowrap text-[12px] font-semibold leading-none text-[#6b7280]";
  const moreProfessionsClass = "relative z-10 inline-flex shrink-0 items-center self-center align-middle leading-none text-[12px] font-bold text-[#6b7280] transition-colors hover:text-[#009FD9]";
  // A pro viewing their OWN card cannot request a service from themselves. The
  // WhatsApp/Llamar/Solicitar actions now live together in the action zone (see
  // ProfessionalSchedule), so the card no longer renders separate top-row icons.
  const isOwn = !!viewerProfileId && viewerProfileId === professional.profileId;
  const appendReturnPath = (href: string) => {
    if (!searchReturnHref) return href;
    const [pathAndQuery, hash = ""] = href.split("#");
    const separator = pathAndQuery.includes("?") ? "&" : "?";
    return `${pathAndQuery}${separator}from=${encodeURIComponent(searchReturnHref)}${hash ? `#${hash}` : ""}`;
  };
  const profileHref = appendReturnPath(`/profesionales/${professional.slug}`);
  const reviewsHref = (() => {
    const params = new URLSearchParams({ tab: "resenas" });
    return appendReturnPath(`/profesionales/${professional.slug}?${params.toString()}#resenas`);
  })();
  const casesHref = (() => {
    const params = new URLSearchParams({ tab: "casos" });
    return appendReturnPath(`/profesionales/${professional.slug}?${params.toString()}#casos`);
  })();
  const portfolioCount = professional.portfolioCount ?? 0;
  const followerCount = professional.followerCount ?? 0;
  const candidateExperienceServices = activeCategory
    ? professional.services?.filter((service) => service.category === activeCategory)
    : professional.services;
  const serviceExperience = candidateExperienceServices?.find((service) => {
    const years = typeof service.years === "number" ? service.years : 0;
    const months = typeof service.months === "number" ? service.months : 0;
    return years > 0 || months > 0;
  });
  const yearsExperience = Math.max(0, Math.floor(serviceExperience?.years ?? professional.yearsExperience ?? 0));
  const casesLabel = locale === "en"
    ? `${portfolioCount} success ${portfolioCount === 1 ? "case" : "cases"}`
    : `${portfolioCount} ${portfolioCount === 1 ? "caso de éxito" : "casos de éxito"}`;
  const ratingLabel = professional.reviewCount > 0
    ? tCard("reviewsCount", { count: professional.reviewCount })
    : tCard("noReviews");
  const desktopMetricClass = "relative z-10 inline-flex min-w-0 items-center gap-1 text-[12px] font-semibold leading-none text-[#5f6f86] transition-colors hover:text-[#0089BB] focus:outline-none focus:ring-2 focus:ring-[#009FD9]/30";
  const desktopMetric = (() => {
    if (highlightMetric === "successCases") {
      if (portfolioCount <= 0) return null;
      return (
        <Link href={casesHref} className={desktopMetricClass} aria-label={casesLabel}>
          <span className="font-semibold tabular-nums text-[#5f6f86]">{portfolioCount}</span>
          <span>{portfolioCount === 1 ? (locale === "en" ? "success case" : "caso de éxito") : (locale === "en" ? "success cases" : "casos de éxito")}</span>
        </Link>
      );
    }
    if (highlightMetric === "experience") {
      if (yearsExperience <= 0) return null;
      return (
        <span className={desktopMetricClass}>
          <span className="font-semibold tabular-nums text-[#5f6f86]">{yearsExperience}</span>
          <span>{yearsExperience === 1 ? (locale === "en" ? "year experience" : "año experiencia") : (locale === "en" ? "years experience" : "años experiencia")}</span>
        </span>
      );
    }
    if (highlightMetric === "followers") {
      if (followerCount <= 0) return null;
      return (
        <span className={desktopMetricClass}>
          <span className="font-semibold tabular-nums text-[#5f6f86]">{followerCount}</span>
          <span>{followerCount === 1 ? (locale === "en" ? "follower" : "seguidor") : (locale === "en" ? "followers" : "seguidores")}</span>
        </span>
      );
    }
    if (professional.reviewCount <= 0) return null;
    return (
      <Link
        href={reviewsHref}
        className={desktopMetricClass}
        aria-label={tCard("reviewsCount", { count: professional.reviewCount })}
      >
        <Star className="h-3.5 w-3.5 shrink-0 fill-current text-[#f59e0b]" />
        <span className="font-bold tabular-nums text-[#162543]">{professional.ratingAvg.toFixed(1)}</span>
        <span>{ratingLabel}</span>
      </Link>
    );
  })();

  const mobileMetricClass = "relative z-10 inline-flex min-w-0 w-fit shrink-0 items-center gap-1 text-[12px] font-semibold leading-none text-[#5f6f86] transition-colors hover:text-[#0089BB] focus:outline-none focus:ring-2 focus:ring-[#009FD9]/30";
  const mobileMetric = (() => {
    if (highlightMetric === "experience") {
      if (yearsExperience <= 0) return null;
      return (
        <span className={mobileMetricClass} data-testid="professional-card-mobile-experience">
          <span className="font-bold tabular-nums text-[#162543]">{yearsExperience}</span>
          <span className="whitespace-nowrap">{yearsExperience === 1 ? (locale === "en" ? "year experience" : "año experiencia") : (locale === "en" ? "years experience" : "años experiencia")}</span>
        </span>
      );
    }
    if (highlightMetric === "successCases") {
      if (portfolioCount <= 0) return null;
      return (
        <Link href={casesHref} className={mobileMetricClass} aria-label={casesLabel}>
          <span className="font-bold tabular-nums text-[#162543]">{portfolioCount}</span>
          <span className="whitespace-nowrap">{portfolioCount === 1 ? (locale === "en" ? "success case" : "caso de éxito") : (locale === "en" ? "success cases" : "casos de éxito")}</span>
        </Link>
      );
    }
    if (highlightMetric === "followers") {
      if (followerCount <= 0) return null;
      return (
        <span className={mobileMetricClass}>
          <span className="font-bold tabular-nums text-[#162543]">{followerCount}</span>
          <span className="whitespace-nowrap">{followerCount === 1 ? (locale === "en" ? "follower" : "seguidor") : (locale === "en" ? "followers" : "seguidores")}</span>
        </span>
      );
    }
    if (professional.reviewCount <= 0) return null;
    return (
      <Link
        href={reviewsHref}
        className={mobileMetricClass}
        aria-label={tCard("reviewsCount", { count: professional.reviewCount })}
      >
        <Star className="h-3.5 w-3.5 shrink-0 fill-current text-[#f59e0b]" />
        <span className="font-bold tabular-nums text-[#162543]">{professional.ratingAvg.toFixed(1)}</span>
        <span className="whitespace-nowrap">{ratingLabel}</span>
      </Link>
    );
  })();
  const desktopPrice = priceLabel ? (
    <div className={`relative z-10 ml-auto hidden shrink-0 self-baseline text-right lg:block ${priceBoxClass}`}>
      <span className="inline-flex max-w-full flex-wrap items-baseline justify-end gap-x-1 gap-y-0.5 leading-[1.1]">
        <span className="text-[13px] font-bold text-[#009FD9]">{priceAmount}</span>
        {(priceUnit || priceTaxSuffix) && (
          <span className="whitespace-nowrap text-right leading-none">
            {priceUnit && <span className="text-[11px] font-medium text-[#9ca3af]">{priceUnit}</span>}
            {priceTaxSuffix && <span className="ml-1 text-[9px] font-semibold tracking-wide text-[#9ca3af]">{priceTaxSuffix}</span>}
          </span>
        )}
      </span>
    </div>
  ) : null;
  const mobilePriceText = priceLabel
    ? mobileIsPriceOnRequest
      ? (locale === "en" ? "Price on request" : "Consultar precio")
      : priceLabel
    : "";
  const mobilePrice = mobilePriceText ? (
    <span
      data-testid="professional-card-mobile-price-primary"
      aria-label={mobilePriceText}
      className="ml-auto min-w-0 shrink-0 whitespace-nowrap text-right text-[12px] font-bold leading-none text-[#009FD9]"
    >
      {mobilePriceText}
    </span>
  ) : null;

  // Location data for the schedule's location control (now rendered in the LEFT
  // column under the rating — see ProfessionalSchedule). The per-place TABS +
  // street addresses come from the pro's workplaces; here we only supply the
  // FALLBACK tab (province/cantón, shown when there are no named workplaces) and
  // the general province/cantón address. Video-only national coverage uses this
  // same row with "Videoconsulta" so the card never looks location-empty.
  // La videoconsulta pertenece al servicio, no al perfil: si lo que se buscó no
  // se atiende por video (una niñera), la tarjeta no la ofrece aunque el mismo
  // profesional tenga otro servicio (tutorías) que sí. Sin búsqueda específica
  // se muestran ambas cosas: sus lugares y la videoconsulta.
  const videoAplicaBusqueda = !activeCategory || supportsVideoConsultCategory(activeCategory);
  const placeFallback = professional.cantonName || professional.provinceName
    || (videoAplicaBusqueda && (professional.videoconsulta || professional.coverage?.country)
      ? tSchedule("videoconsulta")
      : professional.coverage?.country ? tSchedule("countryCoverage") : "");
  const placeAddress = [professional.cantonName, professional.provinceName].filter(Boolean).join(", ");

  // ── LEFT-column professional info (slotted into ProfessionalSchedule, which owns the
  // desktop two-column layout). Each block is a direct child of the schedule's left
  // column `flex flex-col gap-2`, so vertical spacing comes from that gap — no per-section
  // margins. Order: photo + name/Verificado/personal name + price → tags → rating →
  // location. The location TABS + selected address come AFTER this (in ProfessionalSchedule).
  const info = (
    <>
      {/* Identity: CIRCULAR photo on the LEFT carrying the navy ranking badge that mirrors
          its map pin. To its right, a TIGHT identity stack (gap-1): company name +
          Verificado + personal name, then the service tags and rating DIRECTLY beneath —
          so tags/reviews read as part of the same block right under the name (they used to
          be siblings of this row and got pushed BELOW the taller avatar, leaving a gap).
          PRICE is right-aligned on the company-name line only. The mobile `pr-8` keeps the
          price clear of the inside top-right bookmark (`lg:pr-0` on desktop). */}
      <div className="flex flex-wrap items-start gap-x-2.5 gap-y-1 lg:flex-nowrap lg:gap-x-3">
        <Link href={profileHref} className="relative z-10 shrink-0">
          <Avatar className="h-[52px] w-[52px] rounded-full lg:h-16 lg:w-16">
            <AvatarImage src={professional.avatarUrl} alt={professional.fullName} />
            <AvatarFallback
              delayMs={0}
              className="rounded-full bg-[#EBF5FB] text-[#009FD9] font-bold data-[delayed-open]:animate-pulse"
            >
              {getInitials(professional.fullName)}
            </AvatarFallback>
          </Avatar>
          {rank != null && (
            <span className="absolute -top-1.5 -left-1.5 hidden h-[22px] w-[22px] items-center justify-center rounded-full bg-[#162543] text-[10px] font-bold text-white ring-2 ring-white lg:flex">
              {rank}
            </span>
          )}
        </Link>
        <div className="flex min-w-0 flex-1 flex-col gap-1 lg:pr-0">
          {/* Company-name line + PRICE (right-aligned on THIS line only). */}
          <div className="flex min-w-0 flex-1 items-start gap-3 lg:items-center lg:pr-0">
            <div className="flex min-w-0 flex-1 flex-col gap-0">
              {/* Company/brand name (or personal name when there's no company). Wraps up to
                  never cut off on mobile; desktop keeps one-line cards tighter. Then
                  Verificado, then the personal name = first name + first surname. */}
              <div className="flex min-w-0 items-start gap-2 pr-8 lg:items-baseline lg:pr-0">
                <Link href={profileHref} className="relative z-10 min-w-0 flex-1">
                  <h3 title={businessName ? businessName : professional.fullName} className="min-w-0 font-bold text-[#111827] text-[15px] leading-[1.1] hover:text-[#009FD9] transition-colors">
                    <ResponsiveVerifiedName
                      name={displayName.primaryDesktop}
                      verified={isVerified}
                      verifiedLabel={tCard("verifiedTitle")}
                    />
                  </h3>
                </Link>
                {desktopPrice}
              </div>

              {(displayProfessions.length > 0 || professional.isFeatured) && (
                <ResponsiveServiceSummary
                  labels={mobileDisplayProfessions.map((cat) => catLabel(cat))}
                  totalCount={allProfessions.length}
                  profileHref={profileHref}
                  moreTitle={tCard("moreProfessions")}
                  featuredLabel={professional.isFeatured ? tCard("featured") : undefined}
                  testId="professional-card-service-summary"
                  className="mt-1.5 flex w-full min-w-0 max-w-full items-baseline gap-1 overflow-hidden lg:hidden"
                  itemClassName="inline-flex max-w-full shrink-0 items-baseline whitespace-nowrap text-[12px] font-semibold leading-none text-[#6b7280]"
                  itemTestId="professional-card-mobile-service"
                  moreTestId="professional-card-more-services"
                  moreClassName={moreProfessionsClass}
                  moreSuffix={tCard("servicesSuffix")}
                  separator=","
                />
              )}
              {(mobileMetric || mobilePrice) && (
                <div
                  data-testid="professional-card-mobile-meta-row"
                  className="mt-1.5 flex min-w-0 items-center justify-between gap-2 lg:hidden"
                >
                  {mobileMetric ?? <span className="min-w-0" />}
                  {mobilePrice}
                </div>
              )}
            </div>
          </div>

          {/* Service tags — DIRECTLY under the name; one line only, cap + "+N". */}
          {(displayProfessions.length > 0 || professional.isFeatured) && (
            <>
            <div className="mt-0.5 hidden w-full min-w-0 max-w-full lg:flex">
              <ResponsiveServiceSummary
                labels={displayProfessions.map((cat) => catLabel(cat))}
                totalCount={allProfessions.length}
                profileHref={profileHref}
                moreTitle={tCard("moreProfessions")}
                featuredLabel={professional.isFeatured ? tCard("featured") : undefined}
                moreSuffix={tCard("servicesSuffix")}
              />
            </div>
            </>
          )}
          {desktopMetric && (
          <div className="mt-1.5 hidden min-w-0 items-center justify-between gap-2 lg:flex">
              {desktopMetric}
          </div>
          )}
        </div>
      </div>
    </>
  );

  return (
    // CONTENT-DRIVEN height — NO fixed height, NO overflow clipping. DESKTOP (lg+) lays the
    // body out in TWO columns (info + location tabs | schedule), separated by a vertical
    // divider; MOBILE stacks them — all owned by ProfessionalSchedule, which holds the
    // schedule state and receives the info above as a slot. The ranking number now rides on
    // the avatar; the favorite bookmark sits inside the card so responsive sheets never clip it.
    <article className={`group relative flex h-full min-w-0 flex-col bg-white px-4 py-3 shadow-[0_8px_14px_-14px_rgba(15,23,42,0.55)] transition-shadow duration-200 lg:rounded-2xl lg:border lg:border-[#e5e7eb] lg:p-4 lg:shadow-none lg:hover:border-[#cbd5e1] lg:hover:shadow-md ${className ?? ""}`}>
      <ProfessionalSchedule
        info={info}
        professional={professional}
        categoryName={categoryName}
        availabilityPublic={!isPrivate}
        contactPreference={professional.contactPreference ?? "ambas"}
        slots={slots}
        slotsInitiallyLoaded={slotsInitiallyLoaded}
        activeCategory={activeCategory}
        videoConsultApplies={videoAplicaBusqueda}
        isOwn={isOwn}
        placeFallback={placeFallback}
        placeAddress={placeAddress}
        businessName={businessName ?? ""}
        forceContactOnly={forceContactOnly}
        preferredLocationId={preferredLocationId ?? (forceContactOnly ? "videoconsulta" : undefined)}
        restrictToPreferredLocation={restrictToPreferredLocation}
        syncWithSearchLoading={syncScheduleWithSearchLoading}
      />

      {/* Whole card → the professional's profile (stretched low-z overlay). The interactive
          bits (name/reviews links, location tabs, schedule chips, action buttons) are
          `relative z-10` and keep working; the favorite bookmark (z-20, SaveableCard) stays
          clickable. Keyboard/SR users use the focusable logo/name links (overlay aria-hidden). */}
      <Link
        href={profileHref}
        className="absolute inset-0 z-0"
        tabIndex={-1}
        aria-hidden
      />
    </article>
  );
}

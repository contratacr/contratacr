import { getLocale, getTranslations } from "next-intl/server";
import { Star } from "lucide-react";
import { ProfessionalSchedule, type ScheduleSlot } from "@/components/professionals/professional-schedule";
import { Link } from "@/i18n/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getInitials } from "@/lib/utils";
import { getCategoryLabel } from "@/lib/data/categories";
import { primaryPricingLabel, splitPricingLabel, type PricingTier } from "@/lib/pricing";
import { getProfessionalDisplayName } from "@/lib/display-name";

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
  whatsapp: string;
  provinceName: string;
  cantonName: string;
  ratingAvg: number;
  reviewCount: number;
  yearsExperience?: number;
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
}

export async function ProfessionalCard({ professional, className, slots = [], slotsInitiallyLoaded = true, activeCategory, viewerProfileId, rank, forceContactOnly = false, preferredLocationId, restrictToPreferredLocation = false, syncScheduleWithSearchLoading = false }: ProfessionalCardProps) {
  const tCard = await getTranslations("card");
  const tSchedule = await getTranslations("schedule");
  const locale = await getLocale();
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
  const displayName = getProfessionalDisplayName(professional.fullName, businessName, professional.publicBusinessNameOnly);
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
  const fitProfessionLabels = (maxReadableLength: number, maxItems: number) => displayProfessions.reduce<string[]>((items, id) => {
    const labelLength = catLabel(id).length;
    const currentLength = items.reduce((sum, item) => sum + catLabel(item).length, 0);
    if (items.length === 0) return [id];
    if (items.length < maxItems && currentLength + labelLength <= maxReadableLength) return [...items, id];
    return items;
  }, []);
  const mobileProfessionList = fitProfessionLabels(24, 1);
  const desktopProfessionList = fitProfessionLabels(24, 1);
  const wideDesktopProfessionList = fitProfessionLabels(55, 3);
  // Price split so the AMOUNT can be brand-blue and the /unit muted grey (matches the
  // target screenshots — e.g. "₡10 000" blue + " /hora" grey). A text price like
  // "Consultar precio" has no "/" and renders whole in grey.
  const priceLabel = primaryPricingLabel(professional.pricing, professional.hourlyRate, locale);
  const { amount: priceAmount, unit: priceUnit, taxSuffix: priceTaxSuffix, isColones: priceIsColones } = splitPricingLabel(priceLabel);
  const priceBoxClass = priceUnit || priceTaxSuffix ? "max-w-[38%] sm:max-w-[40%]" : "w-[74px] sm:w-[86px]";
  const isVerified = professional.verificationStatus === "verified";
  const mobileExtraProfessions = allProfessions.length - mobileProfessionList.length;
  const desktopExtraProfessions = allProfessions.length - desktopProfessionList.length;
  const wideDesktopExtraProfessions = allProfessions.length - wideDesktopProfessionList.length;
  const serviceChipClass = "inline-flex max-w-full shrink-0 items-center whitespace-nowrap rounded-full bg-[#f3f4f6] px-2 py-0.5 text-[11px] font-semibold leading-snug text-[#6b7280]";
  const moreProfessionsClass = "relative z-10 inline-flex shrink-0 rounded-full bg-[#f3f4f6] px-1.5 py-0.5 text-[10px] font-bold text-[#6b7280] transition-colors hover:bg-[#EBF5FB] hover:text-[#009FD9]";
  // A pro viewing their OWN card cannot request a service from themselves. The
  // WhatsApp/Llamar/Solicitar actions now live together in the action zone (see
  // ProfessionalSchedule), so the card no longer renders separate top-row icons.
  const isOwn = !!viewerProfileId && viewerProfileId === professional.profileId;

  // Verified trust mark — a compact brand-blue "Verificado" PILL (bg #009FD9 / white),
  // the SAME color as the canonical `Badge variant="verified"` used in the professional
  // panel/dashboard, for cross-surface consistency. Sits on its OWN line between the
  // company name and the personal name. Unverified shows NOTHING (no negative label).
  const verifiedMark = isVerified ? (
    <span title={tCard("verifiedTitle")} className="inline-flex w-fit items-center rounded-full bg-[#009FD9] px-2 py-0.5 text-[10px] font-semibold text-white">
      {tCard("verifiedShort")}
    </span>
  ) : null;

  // Location data for the schedule's location control (now rendered in the LEFT
  // column under the rating — see ProfessionalSchedule). The per-place TABS +
  // street addresses come from the pro's workplaces; here we only supply the
  // FALLBACK tab (province/cantón, shown when there are no named workplaces) and
  // the general province/cantón address. Video-only national coverage uses this
  // same row with "Videoconsulta" so the card never looks location-empty.
  const placeFallback = professional.cantonName || professional.provinceName || (professional.videoconsulta || professional.coverage?.country ? tSchedule("videoconsulta") : "");
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
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1 lg:flex-nowrap">
        <Link href={`/profesionales/${professional.slug}`} className="relative z-10 shrink-0">
          <Avatar className="h-14 w-14 rounded-full lg:h-16 lg:w-16">
            <AvatarImage src={professional.avatarUrl} alt={professional.fullName} />
            <AvatarFallback
              delayMs={professional.avatarUrl ? 700 : 0}
              className="rounded-full bg-[#EBF5FB] text-[#009FD9] font-bold data-[delayed-open]:animate-pulse"
            >
              {professional.avatarUrl ? "" : getInitials(professional.fullName)}
            </AvatarFallback>
          </Avatar>
          {rank != null && (
            <span className="absolute -top-1.5 -left-1.5 flex h-[22px] w-[22px] items-center justify-center rounded-full bg-[#162543] text-[10px] font-bold text-white ring-2 ring-white">
              {rank}
            </span>
          )}
        </Link>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {/* Company-name line + PRICE (right-aligned on THIS line only). */}
          <div className="flex min-w-0 flex-1 items-start gap-2 pr-8 lg:pr-0">
            <div className="flex min-w-0 flex-1 flex-col gap-0">
              {/* Company/brand name (or personal name when there's no company). Wraps up to
                  never cut off on mobile; desktop keeps one-line cards tighter. Then
                  Verificado, then the personal name = first name + first surname. */}
              <Link href={`/profesionales/${professional.slug}`} className="relative z-10 min-w-0">
                <h3 title={businessName ? businessName : professional.fullName} className="line-clamp-2 font-bold text-[#111827] text-[15px] leading-snug hover:text-[#009FD9] transition-colors">
                  <span className="lg:hidden">{displayName.primaryMobile}</span>
                  <span className="hidden lg:inline">{displayName.primaryDesktop}</span>
                </h3>
              </Link>
              {verifiedMark}
              {displayName.hasSecondary && (
                <p title={professional.fullName} className="text-[12px] font-medium leading-snug text-[#6b7280] lg:line-clamp-1">
                  <span className="lg:hidden">{displayName.secondaryMobile}</span>
                  <span className="hidden lg:inline">{displayName.secondaryDesktop}</span>
                </p>
              )}
            </div>
            {/* Price — on the name line, right-aligned. AMOUNT brand-blue, /unit muted grey;
                capped width so a long price wraps instead of crowding the name. */}
            {priceLabel && (
              <div className={`ml-auto shrink-0 text-right leading-tight ${priceBoxClass}`}>
                <span className={`font-bold text-[#009FD9] ${priceIsColones ? "text-[15px]" : "text-[13px]"}`}>{priceAmount}</span>
                {priceUnit && <span className="text-[11px] font-medium text-[#9ca3af]"> {priceUnit}</span>}
                {priceTaxSuffix && <span className="block text-[9px] font-semibold tracking-wide text-[#9ca3af]">{priceTaxSuffix}</span>}
              </div>
            )}
          </div>

          {/* Service tags — DIRECTLY under the name; one line only, cap + "+N". */}
          {(displayProfessions.length > 0 || professional.isFeatured) && (
            <>
            <div
              className="flex w-full min-w-0 max-w-full flex-nowrap items-center gap-1.5 overflow-hidden lg:hidden"
              data-testid="professional-card-service-summary"
              data-service-summary-version="single-row-v4"
            >
              {mobileProfessionList.map((cat) => (
                <span
                  key={`mobile-service-summary-${cat}`}
                  data-testid="professional-card-mobile-service"
                  data-full-label="true"
                  data-extra-count={mobileExtraProfessions}
                  className={serviceChipClass}
                  title={catLabel(cat)}
                >
                  {catLabel(cat)}
                </span>
              ))}
              {mobileExtraProfessions > 0 && (
                <Link
                  href={`/profesionales/${professional.slug}`}
                  title={tCard("moreProfessions")}
                  aria-label={tCard("moreProfessions")}
                  data-testid="professional-card-more-services"
                  className={moreProfessionsClass}
                >
                  +{mobileExtraProfessions}
                </Link>
              )}
              {professional.isFeatured && (
                <span className="inline-flex shrink-0 items-center rounded-full bg-[#fff8ed] px-2 py-0.5 text-[10px] font-semibold text-[#c74600]">
                  {tCard("featured")}
                </span>
              )}
            </div>
            <div className="hidden w-full min-w-0 max-w-full flex-nowrap items-center gap-1.5 overflow-hidden lg:flex 2xl:hidden">
              {desktopProfessionList.map((cat) => (
                <span key={`desktop-service-summary-${cat}`} className={serviceChipClass} title={catLabel(cat)}>
                  {catLabel(cat)}
                </span>
              ))}
              {desktopExtraProfessions > 0 && (
                <Link
                  href={`/profesionales/${professional.slug}`}
                  title={tCard("moreProfessions")}
                  aria-label={tCard("moreProfessions")}
                  className={moreProfessionsClass}
                >
                  +{desktopExtraProfessions}
                </Link>
              )}
              {professional.isFeatured && (
                <span className="inline-flex shrink-0 items-center rounded-full bg-[#fff8ed] px-2 py-0.5 text-[10px] font-semibold text-[#c74600]">
                  {tCard("featured")}
                </span>
              )}
            </div>
            <div className="hidden w-full min-w-0 max-w-full flex-nowrap items-center gap-1.5 overflow-hidden 2xl:flex">
              {wideDesktopProfessionList.map((cat) => (
                <span key={`wide-desktop-service-summary-${cat}`} className={serviceChipClass} title={catLabel(cat)}>
                  {catLabel(cat)}
                </span>
              ))}
              {wideDesktopExtraProfessions > 0 && (
                <Link
                  href={`/profesionales/${professional.slug}`}
                  title={tCard("moreProfessions")}
                  aria-label={tCard("moreProfessions")}
                  className={moreProfessionsClass}
                >
                  +{wideDesktopExtraProfessions}
                </Link>
              )}
              {professional.isFeatured && (
                <span className="inline-flex shrink-0 items-center rounded-full bg-[#fff8ed] px-2 py-0.5 text-[10px] font-semibold text-[#c74600]">
                  {tCard("featured")}
                </span>
              )}
            </div>
            </>
          )}
          {/* Rating + review count — DIRECTLY under the tags (only the count links out). */}
          <div className="basis-full lg:basis-auto">
            {professional.reviewCount > 0 ? (
              <Link
                href={`/profesionales/${professional.slug}?tab=resenas#resenas`}
                className="relative z-10 inline-flex w-fit items-center gap-1.5 rounded-md transition-colors hover:text-[#0089BB] focus:outline-none focus:ring-2 focus:ring-[#009FD9]/30"
                aria-label={tCard("reviewsCount", { count: professional.reviewCount })}
              >
                <Star className="h-3.5 w-3.5 fill-[#ff9b32] text-[#ff9b32]" />
                <span className="text-[13px] font-bold text-[#111827]">{professional.ratingAvg.toFixed(1)}</span>
                <span className="text-[11px] font-medium text-[#9ca3af] hover:underline">
                  ({tCard("reviewsCount", { count: professional.reviewCount })})
                </span>
              </Link>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-[11px] text-[#9ca3af]">
                <Star className="h-3.5 w-3.5 fill-[#e5e7eb] text-[#e5e7eb]" /> {tCard("noReviews")}
              </span>
            )}
          </div>
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
    <article className={`group relative flex h-full flex-col rounded-2xl border border-[#e5e7eb] bg-white p-4 transition-shadow duration-200 hover:border-[#cbd5e1] hover:shadow-md ${className ?? ""}`}>
      <ProfessionalSchedule
        info={info}
        professional={professional}
        categoryName={categoryName}
        availabilityPublic={!isPrivate}
        contactPreference={professional.contactPreference ?? "ambas"}
        slots={slots}
        slotsInitiallyLoaded={slotsInitiallyLoaded}
        activeCategory={activeCategory}
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
        href={`/profesionales/${professional.slug}`}
        className="absolute inset-0 z-0"
        tabIndex={-1}
        aria-hidden
      />
    </article>
  );
}

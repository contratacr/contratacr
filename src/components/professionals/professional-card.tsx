import { getTranslations } from "next-intl/server";
import { Star } from "lucide-react";
import { ProfessionalSchedule, type ScheduleSlot } from "@/components/professionals/professional-schedule";
import { Link } from "@/i18n/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getInitials } from "@/lib/utils";
import { getCategoryLabel } from "@/lib/data/categories";
import { primaryPricingLabel, type PricingTier } from "@/lib/pricing";

// CARD-ONLY: shorten a PERSON's name to first name + both surnames, dropping any
// middle name(s) — e.g. "Isaac Alberto Sanchez Monge" → "Isaac Sanchez Monge".
// Saves space and avoids truncation on the card. Names with 3 or fewer parts
// (one given name + up to two surnames) are left as-is. The FULL official name is
// still shown on the professional's profile page; this never touches a company
// /brand name (only the person's name).
function shortPersonName(name?: string): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 3) return parts.join(" ");
  return [parts[0], parts[parts.length - 2], parts[parts.length - 1]].join(" ");
}

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
  workplaces?: { id?: string; name: string; address?: string; lat?: number; lng?: number }[];
  verificationStatus?: "pending" | "verified" | "rejected" | "under_appeal";
  lat?: number | null;
  lng?: number | null;
  serviceType?: string | null;
  /** Count of "casos de éxito" (portfolio photos) — drives the preview link. */
  portfolioCount?: number;
  /** Count of certifications — drives the compact "Ver certificaciones (N)" link. */
  certificationCount?: number;
  /** Insurance networks (aseguradoras) the pro belongs to. */
  insuranceNetworks?: string[];
  /** Real travel-coverage summary (item 16): country-wide, provinces, cantones. */
  coverage?: { country: boolean; provincias: string[]; cantones: string[] };
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
  /** Active category filter from the search query — narrows the badges shown. */
  activeCategory?: string;
  /** Viewer's auth id — when it matches this pro's owner, hide self-service actions. */
  viewerProfileId?: string;
  /** 1-based rank — rendered as a navy badge overlapping the avatar, matching the map pin. */
  rank?: number;
}

export async function ProfessionalCard({ professional, className, slots = [], activeCategory, viewerProfileId, rank }: ProfessionalCardProps) {
  const tCat = await getTranslations("categories");
  const tCard = await getTranslations("card");
  // Safe category label: if a translation key is missing, next-intl returns the
  // raw "categories.xxx" path — fall back to the taxonomy label (e.g. "otro" →
  // "Otro servicio") so no internal key ever leaks into the UI.
  const catLabel = (id: string) => {
    if (!id) return "";
    const l = tCat(id as never);
    return l.startsWith("categories.") ? getCategoryLabel(id) : l;
  };
  const isPrivate = professional.availabilityPublic === false;
  // Brand hierarchy: company name leads (clients recognize the brand), personal
  // name becomes the muted subtitle. No company → personal name leads, no subtitle.
  const businessName = professional.businessName?.trim();
  // The PERSON's name is shortened for the card (first name + both surnames); a
  // company/brand name is shown verbatim. The full official name stays on the profile.
  const personName = shortPersonName(professional.fullName);
  const brandPrimary = businessName || personName;
  const brandSecondary = businessName ? personName : "";
  const categoryName = catLabel(professional.categoryId);
  const allProfessions = (professional.professions && professional.professions.length > 0
    ? professional.professions
    : [professional.categoryId]
  ).filter(Boolean);
  // When the user searched a specific category, show only that matching badge.
  // Fewer, cleaner chips — cap at 2 (the rest collapse to "+N").
  const professionList =
    activeCategory && allProfessions.includes(activeCategory)
      ? [activeCategory]
      : allProfessions.slice(0, 3);
  // Price split so the AMOUNT can be brand-blue and the /unit muted grey (matches the
  // target screenshots — e.g. "₡10 000" blue + " /hora" grey). A text price like
  // "Consultar precio" has no "/" and renders whole in grey.
  const priceLabel = primaryPricingLabel(professional.pricing, professional.hourlyRate);
  const priceSlash = priceLabel.indexOf("/");
  const priceAmount = priceSlash >= 0 ? priceLabel.slice(0, priceSlash).trim() : priceLabel;
  const priceUnit = priceSlash >= 0 ? priceLabel.slice(priceSlash) : "";
  const priceIsColones = priceLabel.includes("₡");
  const isVerified = professional.verificationStatus === "verified";
  const extraProfessions = allProfessions.length - professionList.length;
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
  // the general province/cantón address. Home service is shown as a separate chip,
  // never as the address line.
  const placeFallback = professional.cantonName || professional.provinceName || "";
  const placeAddress = [professional.cantonName, professional.provinceName].filter(Boolean).join(", ");
  const offersHomeService = professional.serviceType?.includes("mobile");
  const hasFixedPlace = (professional.workplaces?.length ?? 0) > 0 || !!placeAddress;
  const homeServiceLabel = offersHomeService ? tCard(hasFixedPlace ? "alsoAtHome" : "atHome") : "";

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
          price clear of the top-right bookmark (`lg:pr-0` on desktop). */}
      <div className="flex items-start gap-3 pr-8 lg:pr-0">
        <Link href={`/profesionales/${professional.slug}`} className="relative z-10 shrink-0">
          <Avatar className="h-14 w-14 rounded-full lg:h-16 lg:w-16">
            <AvatarImage src={professional.avatarUrl} alt={professional.fullName} />
            <AvatarFallback className="rounded-full bg-[#EBF5FB] text-[#009FD9] font-bold">{getInitials(professional.fullName)}</AvatarFallback>
          </Avatar>
          {rank != null && (
            <span className="absolute -top-1.5 -left-1.5 flex h-[22px] w-[22px] items-center justify-center rounded-full bg-[#162543] text-[10px] font-bold text-white ring-2 ring-white">
              {rank}
            </span>
          )}
        </Link>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {/* Company-name line + PRICE (right-aligned on THIS line only). */}
          <div className="flex items-start gap-2">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              {/* Company/brand name (or personal name when there's no company). Wraps up to
                  2 lines — never cut off. Then Verificado, then the personal name = first
                  name + both surnames (wraps up to 2 lines). */}
              <Link href={`/profesionales/${professional.slug}`} className="relative z-10 min-w-0">
                <h3 className="font-bold text-[#111827] text-[15px] leading-snug line-clamp-2 lg:line-clamp-1 hover:text-[#009FD9] transition-colors">{brandPrimary}</h3>
              </Link>
              {verifiedMark}
              {brandSecondary && (
                <p className="text-[12px] font-medium text-[#6b7280] line-clamp-2 lg:line-clamp-1">{brandSecondary}</p>
              )}
            </div>
            {/* Price — on the name line, right-aligned. AMOUNT brand-blue, /unit muted grey;
                capped width so a long price wraps instead of crowding the name. */}
            {priceLabel && (
              <div className="shrink-0 max-w-[45%] text-right leading-tight">
                <span className={`font-bold text-[#009FD9] ${priceIsColones ? "text-[15px]" : "text-[13px]"}`}>{priceAmount}</span>
                {priceUnit && <span className="text-[11px] font-medium text-[#9ca3af]"> {priceUnit}</span>}
              </div>
            )}
          </div>

          {/* Service tags — DIRECTLY under the name; wrap to multiple lines, cap + "+N". */}
          {(professionList.length > 0 || professional.isFeatured) && (
            <div className="flex flex-wrap items-center gap-1.5">
              {professionList.map((cat) => (
                <span key={cat} className="inline-flex items-center rounded-full bg-[#f3f4f6] px-2 py-0.5 text-[11px] font-medium text-[#6b7280]">
                  {catLabel(cat)}
                </span>
              ))}
              {/* "+N" → the profile (where ALL professions are listed). A LINK (not a span) so
                  it's tappable; `relative z-10` lifts it above the whole-card overlay; the pill
                  + hover (brand-blue bg/text + pointer) signals it's interactive without
                  cluttering the row — consistent with the other card→profile links. */}
              {extraProfessions > 0 && (
                <Link
                  href={`/profesionales/${professional.slug}`}
                  title={tCard("moreProfessions")}
                  aria-label={tCard("moreProfessions")}
                  className="relative z-10 inline-flex items-center rounded-full bg-[#f3f4f6] px-2 py-0.5 text-[11px] font-medium text-[#6b7280] transition-colors hover:bg-[#EBF5FB] hover:text-[#009FD9]"
                >
                  +{extraProfessions}
                </Link>
              )}
              {professional.isFeatured && (
                <span className="inline-flex items-center rounded-full bg-[#fff8ed] px-2 py-0.5 text-[10px] font-semibold text-[#c74600]">
                  {tCard("featured")}
                </span>
              )}
            </div>
          )}

          {/* Rating + review count — DIRECTLY under the tags (only the count links out). */}
          <div>
            {professional.reviewCount > 0 ? (
              <span className="inline-flex w-fit items-center gap-1.5">
                <Star className="h-3.5 w-3.5 fill-[#ff9b32] text-[#ff9b32]" />
                <span className="text-[13px] font-bold text-[#111827]">{professional.ratingAvg.toFixed(1)}</span>
                <Link href={`/profesionales/${professional.slug}?tab=resenas`} className="relative z-10 text-[11px] font-medium text-[#9ca3af] hover:underline">
                  ({tCard("reviewsCount", { count: professional.reviewCount })})
                </Link>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-[11px] text-[#9ca3af]">
                <Star className="h-3.5 w-3.5 fill-[#e5e7eb] text-[#e5e7eb]" /> {tCard("noReviews")}
              </span>
            )}
          </div>
          {homeServiceLabel && (
            <span className="inline-flex w-fit items-center rounded-full bg-[#EBF5FB] px-2 py-0.5 text-[11px] font-semibold text-[#0089bb]">
              {homeServiceLabel}
            </span>
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
    // the avatar; only the favorite bookmark (top-right, SaveableCard) floats over the top,
    // and the header's `pr-8` (mobile) keeps content clear of it.
    <article className={`group relative flex h-full flex-col rounded-2xl border border-[#e5e7eb] bg-white p-4 transition-shadow duration-200 hover:border-[#cbd5e1] hover:shadow-md ${className ?? ""}`}>
      <ProfessionalSchedule
        info={info}
        professional={professional}
        categoryName={categoryName}
        availabilityPublic={!isPrivate}
        contactPreference={professional.contactPreference ?? "ambas"}
        slots={slots}
        activeCategory={activeCategory}
        isOwn={isOwn}
        placeFallback={placeFallback}
        placeAddress={placeAddress}
        businessName={businessName ?? ""}
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

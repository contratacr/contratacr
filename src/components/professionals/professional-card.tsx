import { getTranslations } from "next-intl/server";
import { Star, Info } from "lucide-react";
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

// Human label for the pro's actual travel coverage, e.g. "Atiende en todo el país",
// "Se desplaza en Alajuela", "Se desplaza en Atenas, Escazú". Locale-aware via the
// `card` translator passed from the (async) ProfessionalCard.
function coverageLabel(
  c: ProfessionalCardData["coverage"] | undefined,
  tCard: (key: string, values?: Record<string, string>) => string
): string {
  if (c?.country) return tCard("coverageCountry");
  const areas = [...(c?.provincias ?? []), ...(c?.cantones ?? [])];
  if (areas.length === 0) return tCard("coverageYourLocation");
  const shown = areas.slice(0, 3).join(", ");
  const extra = areas.length > 3 ? ` +${areas.length - 3}` : "";
  return tCard("coverageAreas", { areas: `${shown}${extra}` });
}

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
      : allProfessions.slice(0, 2);
  const priceLabel = primaryPricingLabel(professional.pricing, professional.hourlyRate);
  const isVerified = professional.verificationStatus === "verified";
  const extraProfessions = allProfessions.length - professionList.length;
  // A pro viewing their OWN card cannot request a service from themselves. The
  // WhatsApp/Llamar/Solicitar actions now live together in the action zone (see
  // ProfessionalSchedule), so the card no longer renders separate top-row icons.
  const isOwn = !!viewerProfileId && viewerProfileId === professional.profileId;

  // Verified trust mark — on the /buscar card this is GREEN TEXT (no icon, no pill),
  // sitting on its OWN line between the company name and the personal name (HuliHealth
  // handoff). The solid brand-blue "Verificado" pill stays canonical on the profile /
  // dashboard / saved-pros mockup; this lighter treatment is the search card only.
  // Unverified shows NOTHING (no mark, no negative label).
  const verifiedMark = isVerified ? (
    <span title={tCard("verifiedTitle")} className="block text-[11px] font-semibold text-[#16a34a]">
      {tCard("verifiedShort")}
    </span>
  ) : null;

  // Location data for the schedule's location control (now rendered in the LEFT
  // column under the rating — see ProfessionalSchedule). The per-place TABS +
  // street addresses come from the pro's workplaces; here we only supply the
  // FALLBACK tab (province/cantón, shown when there are no named workplaces) and
  // the travel COVERAGE line ("se desplaza…") used when a place has no address.
  const placeFallback = professional.cantonName || professional.provinceName || "";
  const placeAddress = [professional.cantonName, professional.provinceName].filter(Boolean).join(", ");
  const coverageText = professional.serviceType?.includes("mobile") ? coverageLabel(professional.coverage, tCard) : "";

  // ── LEFT-column professional info (slotted into ProfessionalSchedule, which owns the
  // desktop two-column layout). Each block is a direct child of the schedule's left
  // column `flex flex-col gap-2`, so vertical spacing comes from that gap — no per-section
  // margins. Order: photo + name/Verificado/personal name + price → tags → rating →
  // location. The location TABS + selected address come AFTER this (in ProfessionalSchedule).
  const info = (
    <>
      {/* Identity: CIRCULAR photo on the LEFT carrying the navy ranking badge that mirrors
          its map pin; company name + Verificado + personal name in the middle; PRICE
          right-aligned. The mobile `pr-8` keeps the price clear of the top-right bookmark
          (on desktop the price sits in the LEFT column, far from it — `lg:pr-0`). */}
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
        <div className="min-w-0 flex-1">
          {/* Company/brand name (or personal name when there's no company) + Verificado.
              Wraps up to 2 lines — never cut off. */}
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
            <Link href={`/profesionales/${professional.slug}`} className="relative z-10 min-w-0">
              <h3 className="font-bold text-[#111827] text-[15px] leading-snug line-clamp-2 lg:line-clamp-1 hover:text-[#009FD9] transition-colors">{brandPrimary}</h3>
            </Link>
          </div>
          {/* Verificado (green text) on its own line, then the personal name = first name
              + both surnames; wraps up to 2 lines (long names never collide with the
              price — separate flex columns). */}
          {verifiedMark}
          {brandSecondary && (
            <p className="text-[12px] font-medium text-[#6b7280] line-clamp-2 lg:line-clamp-1">{brandSecondary}</p>
          )}
        </div>
        {/* Price + info icon (HuliHealth style) — top of the left column, on the name line,
            right-aligned. Just the amount; capped so a long price wraps. */}
        {priceLabel.includes("₡") && (
          <div className="shrink-0 flex max-w-[45%] items-start gap-1">
            <span className="text-right text-sm font-bold leading-snug text-[#111827]">{priceLabel}</span>
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#9ca3af]" aria-hidden />
          </div>
        )}
      </div>

      {/* Service tags — wrap to MULTIPLE lines; cap to a couple + "+N" overflow. */}
      {(professionList.length > 0 || professional.isFeatured) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {professionList.map((cat) => (
            <span key={cat} className="inline-flex items-center rounded-full bg-[#f3f4f6] px-2 py-0.5 text-[11px] font-medium text-[#6b7280]">
              {catLabel(cat)}
            </span>
          ))}
          {extraProfessions > 0 && (
            <span className="text-[11px] font-medium text-[#9ca3af]">+{extraProfessions}</span>
          )}
          {professional.isFeatured && (
            <span className="inline-flex items-center rounded-full bg-[#fff8ed] px-2 py-0.5 text-[10px] font-semibold text-[#c74600]">
              {tCard("featured")}
            </span>
          )}
        </div>
      )}

      {/* Rating + review count (only the count links to the reviews tab). */}
      <div>
        {professional.reviewCount > 0 ? (
          <span className="inline-flex w-fit items-center gap-1.5">
            <Star className="h-3.5 w-3.5 fill-[#ff9b32] text-[#ff9b32]" />
            <span className="text-[13px] font-bold text-[#111827]">{professional.ratingAvg.toFixed(1)}</span>
            <span aria-hidden className="text-[11px] text-[#9ca3af]">·</span>
            <Link href={`/profesionales/${professional.slug}?tab=resenas`} className="relative z-10 text-[11px] font-medium text-[#009FD9] hover:underline">
              {tCard("reviewsCount", { count: professional.reviewCount })}
            </Link>
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-[11px] text-[#9ca3af]">
            <Star className="h-3.5 w-3.5 fill-[#e5e7eb] text-[#e5e7eb]" /> {tCard("noReviews")}
          </span>
        )}
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
        coverageText={coverageText}
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

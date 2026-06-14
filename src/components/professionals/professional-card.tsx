import { getTranslations } from "next-intl/server";
import { MapPin, ShieldCheck, ShieldAlert, Truck, Image as ImageIcon, Star, Award } from "lucide-react";
import { ProfessionalSchedule, type ScheduleSlot } from "@/components/professionals/professional-schedule";
import { Link } from "@/i18n/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getInitials } from "@/lib/utils";
import { getCategoryLabel } from "@/lib/data/categories";
import { primaryPricingLabel, type PricingTier } from "@/lib/pricing";

// Listings show a READABLE place label — never a raw Plus Code / long geocoder
// string. Strips Plus Code tokens (e.g. "XJQ3+227") and noisy segments; returns
// the cleanest readable part, or "" to hide the chip (province/cantón tags remain).
function prettyPlace(name?: string): string {
  if (!name) return "";
  const dropped = /costa rica|provincia de|ruta nacional|^\s*$/i;
  const isPlusCode = (s: string) => /[A-Z0-9]{2,}\+[A-Z0-9]{2,}/.test(s);
  const parts = name.split(",").map((p) => p.trim()).filter((p) => p && !isPlusCode(p) && !dropped.test(p));
  // Prefer the first 2 meaningful segments (e.g. "C. Mercedes, Atenas").
  const readable = parts.slice(0, 2).join(", ");
  if (readable && !isPlusCode(readable)) return readable;
  return "";
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
}

export async function ProfessionalCard({ professional, className, slots = [], activeCategory, viewerProfileId }: ProfessionalCardProps) {
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
  const brandPrimary = businessName || professional.fullName;
  const brandSecondary = businessName ? professional.fullName : "";
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

  // Verified trust mark — rendered inline beside the name on desktop, but BELOW
  // the name on mobile so the name keeps the full top line and never truncates first.
  // Compact trust mark shown right next to the name (icon + short text, no box).
  const verifiedBadge = isVerified ? (
    <span title={tCard("verifiedTitle")} className="inline-flex shrink-0 items-center gap-0.5 text-[#16a34a]">
      <ShieldCheck className="h-3.5 w-3.5" />
      <span className="text-[11px] font-semibold">{tCard("verifiedShort")}</span>
    </span>
  ) : (
    <span title={tCard("unverifiedTitle")} className="inline-flex shrink-0 items-center gap-0.5 text-[#b45309]">
      <ShieldAlert className="h-3.5 w-3.5" />
      <span className="text-[11px] font-medium">{tCard("unverifiedShort")}</span>
    </span>
  );

  // ── ONE consolidated location line (keeps cards uniform): a fixed pro shows
  // their first readable workplace (+N), else province/cantón; a mobile pro shows
  // their real coverage. Both bits truncate so the row stays a single line. ──
  const placeLabels = (professional.workplaces ?? [])
    .map((w) => prettyPlace(w.name))
    .filter(Boolean) as string[];
  const fixedText = placeLabels.length > 0
    ? `${placeLabels[0]}${placeLabels.length > 1 ? ` +${placeLabels.length - 1}` : ""}`
    : [professional.provinceName, professional.cantonName].filter(Boolean).join(", ");
  const mobileText = professional.serviceType?.includes("mobile") ? coverageLabel(professional.coverage, tCard) : "";

  return (
    // Content-driven height with a floor (md:min-h): simple cards stay compact,
    // rich ones (multi-location/profession + many slots) grow. The number badge
    // (page wrapper) sits at the top-left, so the content is padded `pl-10`.
    <div className={`group relative rounded-2xl bg-white border border-[#e5e7eb] hover:border-[#cbd5e1] hover:shadow-md transition-all duration-200 md:min-h-[190px] ${className ?? ""}`}>
      <div className="p-3.5 pl-10 h-full">
        <div className="flex flex-col md:flex-row gap-3 h-full">
          {/* ── Identity zone ── */}
          <div className="flex-1 min-w-0 flex gap-3 overflow-hidden">
            <Link href={`/profesionales/${professional.slug}`} className="shrink-0">
              <Avatar className="h-[3.25rem] w-[3.25rem]">
                <AvatarImage src={professional.avatarUrl} alt={professional.fullName} />
                <AvatarFallback className="text-base bg-[#EBF5FB] text-[#009FD9] font-bold">{getInitials(professional.fullName)}</AvatarFallback>
              </Avatar>
            </Link>

            <div className="flex-1 min-w-0 flex flex-col gap-1 overflow-hidden">
              {/* Name has horizontal priority: it takes the full top line and
                  may wrap to 2 lines on mobile rather than truncating with "…".
                  The verified mark sits inline on desktop but drops BELOW the
                  name on mobile (see badge under the name) to free the space. */}
              <div className="flex items-start gap-2 min-w-0 pr-9 md:pr-0">
                {/* Name + verified mark share the left side; verified sits right of
                    the name (wraps under it on a very narrow card, never truncating
                    the name). The PRICE moves to the top-right (where the contact
                    icons used to be). */}
                <div className="min-w-0 flex-1 flex items-start gap-1.5 flex-wrap">
                  <Link href={`/profesionales/${professional.slug}`} className="min-w-0">
                    <h3 className="font-bold text-[#111827] text-[15px] leading-tight hover:text-[#009FD9] transition-colors line-clamp-2 md:line-clamp-1">{brandPrimary}</h3>
                  </Link>
                  <span className="shrink-0 mt-0.5">{verifiedBadge}</span>
                </div>

                {/* Price — just the amount, no "Desde/Tarifa" word. Shown only when
                    there's a real numeric price (avoids a prominent localized
                    "price on request" string leaking on the top line). */}
                {priceLabel.includes("₡") && (
                  <span className="shrink-0 font-bold text-[#111827] text-sm whitespace-nowrap mt-0.5">{priceLabel}</span>
                )}
              </div>

              {brandSecondary && (
                <p className="text-[11px] font-medium text-[#6b7280] truncate -mt-0.5">{brandSecondary}</p>
              )}

              {/* Profession tags — soft, muted, few (categories, not trust). */}
              <div className="flex items-center gap-1 flex-wrap">
                {professionList.map((cat) => (
                  <span key={cat} className="inline-flex shrink-0 items-center rounded-full bg-[#f3f4f6] text-[#6b7280] px-2 py-0.5 text-[11px] font-medium whitespace-nowrap">
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

              {/* Rating — star + value + count. With reviews it's a LINK to the
                  reviews tab (count styled brand-blue to read as tappable, like the
                  casos/certificaciones links). No reviews → honest, non-link state. */}
              {professional.reviewCount > 0 ? (
                <Link
                  href={`/profesionales/${professional.slug}?tab=resenas`}
                  className="inline-flex w-fit items-center gap-1.5 hover:underline"
                >
                  <Star className="h-3.5 w-3.5 fill-[#ff9b32] text-[#ff9b32]" />
                  <span className="text-[13px] font-bold text-[#111827]">{professional.ratingAvg.toFixed(1)}</span>
                  <span className="text-[11px] font-medium text-[#009FD9]">· {tCard("reviewsCount", { count: professional.reviewCount })}</span>
                </Link>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-[11px] text-[#9ca3af]">
                  <Star className="h-3.5 w-3.5 fill-[#e5e7eb] text-[#e5e7eb]" /> {tCard("noReviews")}
                </span>
              )}

              {/* Location + coverage — two truncating lines */}
              <div className="flex flex-col gap-0.5 text-[11px] text-[#6b7280]">
                {fixedText && (
                  <span className="inline-flex items-center gap-1.5 min-w-0">
                    <MapPin className="h-3 w-3 text-[#009FD9] shrink-0" />
                    <span className="truncate">{fixedText}</span>
                  </span>
                )}
                {mobileText && (
                  <span className="inline-flex items-center gap-1.5 min-w-0">
                    <Truck className="h-3 w-3 text-[#0089bb] shrink-0" />
                    <span className="truncate">{mobileText}</span>
                  </span>
                )}
              </div>

              {/* Casos de éxito + Certificaciones — compact links sharing ONE bottom
                  row so the card height stays uniform (they don't each add a line). */}
              {(professional.portfolioCount || professional.certificationCount) ? (
                <div className="mt-auto pt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                  {professional.portfolioCount ? (
                    <Link
                      href={`/profesionales/${professional.slug}?tab=casos`}
                      className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#009FD9] hover:underline w-fit"
                    >
                      <ImageIcon className="h-3.5 w-3.5" />
                      {tCard("viewCases", { count: professional.portfolioCount })}
                    </Link>
                  ) : null}
                  {professional.certificationCount ? (
                    <Link
                      href={`/profesionales/${professional.slug}?tab=certificaciones`}
                      className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#009FD9] hover:underline w-fit"
                    >
                      <Award className="h-3.5 w-3.5" />
                      {tCard("viewCertifications", { count: professional.certificationCount })}
                    </Link>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>

          {/* ── Action zone: availability + contact/primary actions. A mobile
                 min-height keeps every card the SAME height regardless of the
                 button-layout type (private/with-call/without-call); on desktop the
                 row layout + card min-h govern. ── */}
          <div className="md:w-[232px] md:shrink-0 md:border-l md:border-[#f3f4f6] md:pl-4 pt-3 md:pt-0 border-t border-[#f3f4f6] md:border-t-0 flex flex-col min-h-[150px] md:min-h-0">
            <div className="flex-1 min-h-0">
              <ProfessionalSchedule
                professional={professional}
                categoryName={categoryName}
                availabilityPublic={!isPrivate}
                contactPreference={professional.contactPreference ?? "ambas"}
                slots={slots}
                activeCategory={activeCategory}
                isOwn={isOwn}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

import { getTranslations } from "next-intl/server";
import { MapPin, Truck, Image as ImageIcon, Star, Award, ArrowRight } from "lucide-react";
import { ProfessionalSchedule, type ScheduleSlot } from "@/components/professionals/professional-schedule";
import { Link } from "@/i18n/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
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

  // Verified trust mark — the SAME visual as the professional dashboard (solid
  // brand-blue pill, `Badge variant="verified"`), placed to the RIGHT of the name
  // on the name line. Unverified shows NOTHING (no badge, no negative label).
  const verifiedBadge = isVerified ? (
    <Badge variant="verified" title={tCard("verifiedTitle")} className="shrink-0 px-2 py-0.5 text-[10px] font-semibold">
      {tCard("verifiedShort")}
    </Badge>
  ) : null;

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
    // FIXED, UNIFORM height sized for the MOST-information case so nothing is ever
    // cut off — the card is allowed to be tall (especially on mobile, where users
    // scroll) rather than dropping info. Every card is the same height; a minimal pro
    // and an info-heavy pro render identically (content top-anchored, actions/footer
    // bottom-anchored, so the extra room reads as clean breathing space). The number
    // badge (page wrapper) sits top-left, so the content is padded `pl-10`.
    <div className={`group relative rounded-2xl bg-white border border-[#e5e7eb] hover:border-[#cbd5e1] hover:shadow-md transition-all duration-200 h-[452px] md:h-[244px] overflow-hidden ${className ?? ""}`}>
      <div className="p-3.5 pl-10 h-full">
        <div className="flex flex-col md:flex-row gap-3 h-full">
          {/* ── Identity zone — a COLUMN: the avatar+info block (clips its own
                 overflow in the rare extreme case) plus an ALWAYS-visible footer
                 (casos/cert links + "Ver perfil completo") that is never clipped. ── */}
          <div className="flex-1 min-w-0 flex flex-col gap-1.5 overflow-hidden">
            <div className="flex gap-3 min-h-0 flex-1 overflow-hidden">
            <Link href={`/profesionales/${professional.slug}`} className="shrink-0">
              <Avatar className="h-[3.25rem] w-[3.25rem]">
                <AvatarImage src={professional.avatarUrl} alt={professional.fullName} />
                <AvatarFallback className="text-base bg-[#EBF5FB] text-[#009FD9] font-bold">{getInitials(professional.fullName)}</AvatarFallback>
              </Avatar>
            </Link>

            <div className="flex-1 min-w-0 flex flex-col gap-1 overflow-hidden">
              {/* Name line. DESKTOP (md, nowrap): the name takes only its content
                  width (shrinks/truncates to ONE line if very long) so the
                  "Verificado" pill sits IMMEDIATELY beside it; price pushed right
                  (md:ml-auto). MOBILE (wrap): the name shows in FULL (up to 2 lines,
                  never cut off) and the pill wraps to the next line if there's no
                  room. `pr-9 md:pr-0` clears the absolute save button on mobile. */}
              <div className="flex flex-wrap md:flex-nowrap items-start md:items-center gap-x-1.5 gap-y-0.5 min-w-0 pr-9 md:pr-0">
                <Link href={`/profesionales/${professional.slug}`} className="min-w-0">
                  <h3 className="font-bold text-[#111827] text-[15px] leading-tight hover:text-[#009FD9] transition-colors line-clamp-2 md:line-clamp-1">{brandPrimary}</h3>
                </Link>
                {verifiedBadge}
                {/* Price — just the amount, no "Desde/Tarifa" word. On DESKTOP it sits
                    far right on the name line; on MOBILE it moves to the secondary line
                    below (so the name line stays clean and never wraps awkwardly). */}
                {priceLabel.includes("₡") && (
                  <span className="hidden md:inline-block shrink-0 font-bold text-[#111827] text-sm whitespace-nowrap md:ml-auto">{priceLabel}</span>
                )}
              </div>

              {/* DESKTOP secondary: the PERSON's name (shown only when a company leads). */}
              {brandSecondary && (
                <p className="hidden md:block text-[11px] font-medium text-[#6b7280] truncate -mt-0.5">{brandSecondary}</p>
              )}

              {/* MOBILE secondary line: the PERSON's name (left) + price (right). The
                  person name ALWAYS shows here when there's a company, so it can never
                  disappear on mobile; the price is right-aligned and tidy. */}
              {(brandSecondary || priceLabel.includes("₡")) && (
                <div className="md:hidden flex items-center gap-2 -mt-0.5 pr-9">
                  {brandSecondary && (
                    <p className="min-w-0 truncate text-[11px] font-medium text-[#6b7280]">{brandSecondary}</p>
                  )}
                  {priceLabel.includes("₡") && (
                    <span className="ml-auto shrink-0 font-bold text-[#111827] text-sm whitespace-nowrap">{priceLabel}</span>
                  )}
                </div>
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

              {/* Rating — star + value are plain text; ONLY the "N reseñas" count is
                  the clickable link to the reviews tab (brand-blue + underline to read
                  as tappable). No reviews → honest, fully non-link state. */}
              {professional.reviewCount > 0 ? (
                <span className="inline-flex w-fit items-center gap-1.5">
                  <Star className="h-3.5 w-3.5 fill-[#ff9b32] text-[#ff9b32]" />
                  <span className="text-[13px] font-bold text-[#111827]">{professional.ratingAvg.toFixed(1)}</span>
                  <span aria-hidden className="text-[11px] text-[#9ca3af]">·</span>
                  <Link
                    href={`/profesionales/${professional.slug}?tab=resenas`}
                    className="text-[11px] font-medium text-[#009FD9] hover:underline"
                  >
                    {tCard("reviewsCount", { count: professional.reviewCount })}
                  </Link>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-[11px] text-[#9ca3af]">
                  <Star className="h-3.5 w-3.5 fill-[#e5e7eb] text-[#e5e7eb]" /> {tCard("noReviews")}
                </span>
              )}

              {/* Location SUMMARY — primary place "+N" and the coverage line, each a
                  SINGLE truncating line so they always fit on their line and are never
                  cut off. The full address list lives on the profile. */}
              <div className="flex flex-col gap-0.5 text-[11px] text-[#6b7280] min-w-0">
                {fixedText && (
                  <span className="flex items-center gap-1.5 min-w-0">
                    <MapPin className="h-3 w-3 text-[#009FD9] shrink-0" />
                    <span className="truncate">{fixedText}</span>
                  </span>
                )}
                {mobileText && (
                  <span className="flex items-center gap-1.5 min-w-0">
                    <Truck className="h-3 w-3 text-[#0089bb] shrink-0" />
                    <span className="truncate">{mobileText}</span>
                  </span>
                )}
              </div>
            </div>
            </div>

            {/* ALWAYS-visible footer (shrink-0, OUTSIDE the clipping block above):
                casos de éxito + certificaciones links (when present) and the
                "Ver perfil completo" lead-in — never clipped, even on info-heavy
                mobile cards. */}
            <div className="shrink-0 flex flex-col gap-1">
              {(professional.portfolioCount || professional.certificationCount) ? (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                  {professional.portfolioCount ? (
                    <Link
                      href={`/profesionales/${professional.slug}?tab=casos`}
                      className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#009FD9] hover:underline w-fit"
                    >
                      <ImageIcon className="h-3.5 w-3.5" />
                      {tCard("viewCases")}
                    </Link>
                  ) : null}
                  {professional.certificationCount ? (
                    <Link
                      href={`/profesionales/${professional.slug}?tab=certificaciones`}
                      className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#009FD9] hover:underline w-fit"
                    >
                      <Award className="h-3.5 w-3.5" />
                      {tCard("viewCertifications")}
                    </Link>
                  ) : null}
                </div>
              ) : null}
              <Link
                href={`/profesionales/${professional.slug}`}
                className="inline-flex w-fit items-center gap-1 text-[11px] font-semibold text-[#009FD9] hover:underline"
              >
                {tCard("viewProfile")} <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </div>

          {/* ── Action zone: availability + contact/primary actions. A mobile
                 min-height keeps every card the SAME height regardless of the
                 button-layout type (private/with-call/without-call); on desktop the
                 row layout + card min-h govern. ── */}
          <div className="md:w-[232px] md:shrink-0 md:border-l md:border-[#f3f4f6] md:pl-4 pt-3 md:pt-0 border-t border-[#f3f4f6] md:border-t-0 flex flex-col">
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

import { getTranslations } from "next-intl/server";
import { MapPin, ShieldCheck, ShieldAlert, Truck, Image as ImageIcon, Lock, Star } from "lucide-react";
import { ProfessionalSchedule, type ScheduleSlot } from "@/components/professionals/professional-schedule";
import { Link } from "@/i18n/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getInitials } from "@/lib/utils";
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

export type ProfessionalCardData = {
  id: string;
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
  /** Insurance networks (aseguradoras) the pro belongs to. */
  insuranceNetworks?: string[];
  /** Real travel-coverage summary (item 16): country-wide, provinces, cantones. */
  coverage?: { country: boolean; provincias: string[]; cantones: string[] };
  /** Opt-in: the pro chose to expose phone-call contact (Disponibilidad). */
  allowPhoneCall?: boolean;
};

// Human label for the pro's actual travel coverage, e.g. "Atiende en todo el país",
// "Se desplaza en Alajuela", "Se desplaza en Atenas, Escazú".
function coverageLabel(c?: ProfessionalCardData["coverage"]): string {
  if (c?.country) return "Atiende en todo el país";
  const areas = [...(c?.provincias ?? []), ...(c?.cantones ?? [])];
  if (areas.length === 0) return "Se desplaza a tu ubicación";
  const shown = areas.slice(0, 3).join(", ");
  const extra = areas.length > 3 ? ` +${areas.length - 3}` : "";
  return `Se desplaza en ${shown}${extra}`;
}

interface ProfessionalCardProps {
  professional: ProfessionalCardData;
  className?: string;
  slots?: ScheduleSlot[];
  /** Active category filter from the search query — narrows the badges shown. */
  activeCategory?: string;
}

export async function ProfessionalCard({ professional, className, slots = [], activeCategory }: ProfessionalCardProps) {
  const tCat = await getTranslations("categories");
  const tCard = await getTranslations("card");
  const isPrivate = professional.availabilityPublic === false;
  const categoryName = tCat(professional.categoryId);
  const allProfessions = (professional.professions && professional.professions.length > 0
    ? professional.professions
    : [professional.categoryId]
  ).filter(Boolean);
  // When the user searched a specific category, show only that matching badge.
  const professionList =
    activeCategory && allProfessions.includes(activeCategory)
      ? [activeCategory]
      : allProfessions.slice(0, 3);
  const priceLabel = primaryPricingLabel(professional.pricing, professional.hourlyRate);
  const hasNumericPrice = priceLabel.includes("₡");
  const isVerified = professional.verificationStatus === "verified";
  const extraProfessions = allProfessions.length - professionList.length;
  // Contact-only when the pro hid their availability OR only takes WhatsApp — shown
  // as a flush top band (cleaner than a floating paragraph in the panel).
  const contactOnly = isPrivate || professional.contactPreference === "solo_whatsapp";

  // ── ONE consolidated location line (keeps cards uniform): a fixed pro shows
  // their first readable workplace (+N), else province/cantón; a mobile pro shows
  // their real coverage. Both bits truncate so the row stays a single line. ──
  const placeLabels = (professional.workplaces ?? [])
    .map((w) => prettyPlace(w.name))
    .filter(Boolean) as string[];
  const fixedText = placeLabels.length > 0
    ? `${placeLabels[0]}${placeLabels.length > 1 ? ` +${placeLabels.length - 1}` : ""}`
    : [professional.provinceName, professional.cantonName].filter(Boolean).join(", ");
  const mobileText = professional.serviceType?.includes("mobile") ? coverageLabel(professional.coverage) : "";

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
              {/* Name (pr-9 on mobile clears the absolute favorites button) */}
              <div className="min-w-0 pr-9 md:pr-0">
                <Link href={`/profesionales/${professional.slug}`} className="min-w-0 block">
                  <h3 className="font-bold text-[#111827] text-[15px] leading-tight truncate hover:text-[#009FD9] transition-colors">{professional.fullName}</h3>
                </Link>
                {/* Verification label + business name on one row */}
                <div className="flex items-center gap-1.5 -mt-0.5 min-w-0">
                  {isVerified ? (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#dcfce7] border border-[#bbf7d0] px-1.5 py-0.5 text-[10px] font-bold text-[#15803d] leading-none">
                      <ShieldCheck className="h-3 w-3" /> Verificado
                    </span>
                  ) : (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#fef3c7] border border-[#fde68a] px-1.5 py-0.5 text-[10px] font-bold text-[#92400e] leading-none">
                      <ShieldAlert className="h-3 w-3" /> Sin verificar
                    </span>
                  )}
                  {professional.businessName && (
                    <p className="text-[11px] font-medium text-[#009FD9] truncate">{professional.businessName}</p>
                  )}
                </div>
              </div>

              {/* Profession chips + status (brand-tint pills) */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {professionList.map((cat) => (
                  <span key={cat} className="inline-flex shrink-0 items-center rounded-full bg-[#EBF5FB] text-[#0089bb] border border-[#bfdbfe] px-2 py-0.5 text-[11px] font-medium whitespace-nowrap">
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {tCat(cat as any)}
                  </span>
                ))}
                {extraProfessions > 0 && (
                  <span className="text-[11px] font-medium text-[#9ca3af]">+{extraProfessions}</span>
                )}
                {contactOnly && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#fff7ed] border border-[#fed7aa] px-2 py-0.5 text-[10px] font-semibold text-[#9a3412]">
                    <Lock className="h-3 w-3" /> {isPrivate ? "Coordina por WhatsApp" : "Solo WhatsApp"}
                  </span>
                )}
                {professional.isFeatured && (
                  <span className="inline-flex items-center rounded-full bg-[#fff8ed] border border-[#ffdba5] px-2 py-0.5 text-[10px] font-semibold text-[#c74600]">
                    {tCard("featured")}
                  </span>
                )}
              </div>

              {/* Rating — one star + value + count */}
              {professional.reviewCount > 0 ? (
                <div className="flex items-center gap-1.5">
                  <Star className="h-3.5 w-3.5 fill-[#ff9b32] text-[#ff9b32]" />
                  <span className="text-[13px] font-bold text-[#111827]">{professional.ratingAvg.toFixed(1)}</span>
                  <span className="text-[11px] text-[#6b7280]">· {professional.reviewCount} reseñas</span>
                </div>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-[11px] text-[#9ca3af]">
                  <Star className="h-3.5 w-3.5 fill-[#e5e7eb] text-[#e5e7eb]" /> Sin reseñas todavía
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

              {/* Casos de éxito — pinned to the bottom of the column */}
              {professional.portfolioCount ? (
                <Link
                  href={`/profesionales/${professional.slug}?tab=casos`}
                  className="mt-auto pt-0.5 inline-flex items-center gap-1.5 text-[11px] font-medium text-[#009FD9] hover:underline w-fit"
                >
                  <ImageIcon className="h-3.5 w-3.5" />
                  Ver casos de éxito ({professional.portfolioCount})
                </Link>
              ) : null}
            </div>
          </div>

          {/* ── Action zone: price + availability ── */}
          <div className="md:w-[232px] md:shrink-0 md:border-l md:border-[#f3f4f6] md:pl-4 pt-3 md:pt-0 border-t border-[#f3f4f6] md:border-t-0 flex flex-col">
            <div className="flex items-baseline justify-between gap-2 mb-1.5 pr-9 md:pr-10">
              <span className="text-[10px] font-bold uppercase tracking-wide text-[#9ca3af]">{hasNumericPrice ? "Desde" : "Tarifa"}</span>
              <span className="font-bold text-[#111827] text-[15px] whitespace-nowrap truncate">{priceLabel}</span>
            </div>
            <div className="flex-1 min-h-0">
              <ProfessionalSchedule
                professional={professional}
                categoryName={categoryName}
                availabilityPublic={!isPrivate}
                contactPreference={professional.contactPreference ?? "ambas"}
                slots={slots}
                activeCategory={activeCategory}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

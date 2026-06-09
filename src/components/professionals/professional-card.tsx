import { getTranslations } from "next-intl/server";
import { MapPin, ShieldCheck, Truck, Image as ImageIcon } from "lucide-react";
import { ProfessionalSchedule, type ScheduleSlot } from "@/components/professionals/professional-schedule";
import { Link } from "@/i18n/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { StarRating } from "@/components/ui/star-rating";
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
  const isVerified = professional.verificationStatus === "verified";
  const extraProfessions = allProfessions.length - professionList.length;

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
    <Card className={`group hover:shadow-md transition-shadow duration-200 overflow-hidden h-full ${className ?? ""}`}>
      {professional.isFeatured && (
        <div className="bg-gradient-to-r from-[#ff7c0a] to-[#ff9b32] px-4 py-1">
          <span className="text-[11px] font-semibold text-white tracking-wide">{tCard("featured")}</span>
        </div>
      )}

      <CardContent className="p-3">
        <div className="flex flex-col md:flex-row gap-3">
          {/* ── Left: professional info (bounded, consistent rhythm) ──────── */}
          <div className="flex-1 min-w-0 flex gap-2.5">
            <Link href={`/profesionales/${professional.slug}`} className="shrink-0">
              <Avatar className="h-11 w-11">
                <AvatarImage src={professional.avatarUrl} alt={professional.fullName} />
                <AvatarFallback className="text-sm bg-[#EBF5FB] text-[#009FD9] font-semibold">{getInitials(professional.fullName)}</AvatarFallback>
              </Avatar>
            </Link>

            <div className="flex-1 min-w-0 flex flex-col gap-1">
              {/* Name + price. pr-10 on mobile clears the absolute favorites button. */}
              <div className="flex items-start justify-between gap-2 pr-10 md:pr-0">
                <Link href={`/profesionales/${professional.slug}`} className="flex items-center gap-1 min-w-0">
                  <h3 className="font-semibold text-[#111827] text-[15px] leading-tight truncate hover:text-[#009FD9] transition-colors">{professional.fullName}</h3>
                  {isVerified && <ShieldCheck className="h-4 w-4 text-[#16a34a] shrink-0" />}
                </Link>
                <p className="font-bold text-[#111827] text-sm whitespace-nowrap shrink-0">{priceLabel}</p>
              </div>

              {professional.businessName && (
                <p className="text-xs font-medium text-[#009FD9] truncate -mt-0.5">{professional.businessName}</p>
              )}

              {/* Verified pill + profession chips on one wrapped row. */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {isVerified && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-[#dcfce7] px-1.5 py-0.5 text-[10px] font-semibold text-[#15803d]">
                    <ShieldCheck className="h-3 w-3" /> Identidad verificada
                  </span>
                )}
                {professionList.map((cat) => (
                  <Badge key={cat} variant="default" className="text-[11px]">
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {tCat(cat as any)}
                  </Badge>
                ))}
                {extraProfessions > 0 && (
                  <span className="text-[11px] font-medium text-[#9ca3af]">+{extraProfessions}</span>
                )}
              </div>

              {/* Rating */}
              {professional.reviewCount > 0 ? (
                <StarRating rating={professional.ratingAvg} showValue reviewCount={professional.reviewCount} size="sm" />
              ) : (
                <p className="text-xs text-[#9ca3af]">Sin reseñas todavía</p>
              )}

              {/* Single consolidated location/coverage line */}
              {(fixedText || mobileText) && (
                <div className="flex items-center gap-2 text-[11px] text-[#6b7280] min-w-0">
                  {fixedText && (
                    <span className="inline-flex items-center gap-1 min-w-0">
                      <MapPin className="h-3 w-3 text-[#009FD9] shrink-0" />
                      <span className="truncate">{fixedText}</span>
                    </span>
                  )}
                  {mobileText && (
                    <span className="inline-flex items-center gap-1 min-w-0">
                      <Truck className="h-3 w-3 text-[#0089bb] shrink-0" />
                      <span className="truncate">{mobileText}</span>
                    </span>
                  )}
                </div>
              )}

              {/* Casos de éxito preview */}
              {professional.portfolioCount ? (
                <Link
                  href={`/profesionales/${professional.slug}?tab=casos`}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-[#009FD9] hover:underline w-fit"
                >
                  <ImageIcon className="h-3.5 w-3.5" />
                  Ver casos de éxito ({professional.portfolioCount})
                </Link>
              ) : null}
            </div>
          </div>

          {/* ── Right: availability panel (md:pt-7 clears the corner favorites button) ── */}
          <div className="md:w-[244px] md:shrink-0 md:border-l md:border-[#f3f4f6] md:pl-3 md:pt-7 pt-3 border-t border-[#f3f4f6] md:border-t-0">
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
      </CardContent>
    </Card>
  );
}

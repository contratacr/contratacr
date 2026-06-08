import { getTranslations } from "next-intl/server";
import { MapPin, ShieldCheck, Building2, Truck, Image as ImageIcon } from "lucide-react";
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

  return (
    <Card className={`group hover:shadow-md transition-all duration-200 overflow-hidden ${className ?? ""}`}>
      {professional.isFeatured && (
        <div className="bg-gradient-to-r from-[#ff7c0a] to-[#ff9b32] px-4 py-1.5">
          <span className="text-xs font-semibold text-white tracking-wide">{tCard("featured")}</span>
        </div>
      )}

      <CardContent className="p-4">
        <div className="flex flex-col md:flex-row gap-4">
          {/* ── Left: professional info ─────────────────────────────── */}
          <div className="flex-1 min-w-0">
            <div className="flex gap-3">
              <Link href={`/profesionales/${professional.slug}`} className="shrink-0">
                <Avatar className="h-14 w-14">
                  <AvatarImage src={professional.avatarUrl} alt={professional.fullName} />
                  <AvatarFallback className="text-base bg-[#EBF5FB] text-[#009FD9] font-semibold">{getInitials(professional.fullName)}</AvatarFallback>
                </Avatar>
              </Link>

              <div className="flex-1 min-w-0">
                {/* pr-10 on mobile clears the absolute favorites button (no overlap) */}
                <div className="flex items-start justify-between gap-2 pr-10 md:pr-0">
                  <div className="min-w-0">
                    <Link href={`/profesionales/${professional.slug}`} className="flex items-center gap-1.5">
                      <h3 className="font-semibold text-[#111827] text-base leading-tight hover:text-[#009FD9] transition-colors">{professional.fullName}</h3>
                      {isVerified && <ShieldCheck className="h-4 w-4 text-[#16a34a] shrink-0" />}
                    </Link>
                    {isVerified && (
                      <span className="inline-flex items-center gap-1 mt-1 rounded-md bg-[#dcfce7] px-1.5 py-0.5 text-[10px] font-semibold text-[#15803d]">
                        <ShieldCheck className="h-3 w-3" /> Identidad verificada
                      </span>
                    )}
                    {professional.businessName && (
                      <p className="text-xs font-medium text-[#009FD9] mt-0.5 truncate">{professional.businessName}</p>
                    )}
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      {professionList.map((cat) => (
                        <Badge key={cat} variant="default" className="text-[11px]">
                          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                          {tCat(cat as any)}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <p className="font-bold text-[#111827] text-sm whitespace-nowrap shrink-0">{priceLabel}</p>
                </div>

                {professional.reviewCount > 0 ? (
                  <StarRating rating={professional.ratingAvg} showValue reviewCount={professional.reviewCount} size="sm" className="mt-1.5" />
                ) : (
                  <p className="text-xs text-[#9ca3af] mt-1.5">Sin reseñas todavía</p>
                )}

                {/* Location — province + canton when present; nothing (no empty pin) otherwise */}
                {(professional.provinceName || professional.cantonName) && (
                  <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                    {professional.provinceName && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-[#f3f4f6] px-2 py-0.5 text-[11px] font-medium text-[#374151]">
                        <MapPin className="h-3 w-3 text-[#009FD9]" />
                        {professional.provinceName}
                      </span>
                    )}
                    {professional.cantonName && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-[#f3f4f6] px-2 py-0.5 text-[11px] font-medium text-[#374151]">
                        <Building2 className="h-3 w-3 text-[#9ca3af]" />
                        {professional.cantonName}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {professional.serviceType?.includes("mobile") && (
              <div className="mt-2">
                <span className="inline-flex items-center gap-1 rounded-md bg-[#EBF5FB] px-2 py-0.5 text-[11px] font-medium text-[#0089bb]">
                  <Truck className="h-3 w-3 shrink-0" /> {coverageLabel(professional.coverage)}
                </span>
              </div>
            )}

            {professional.workplaces && professional.workplaces.length > 0 && (() => {
              const places = professional.workplaces
                .map((w, i) => ({ key: w.id ?? i, label: prettyPlace(w.name) }))
                .filter((p) => p.label)
                .slice(0, 3);
              if (places.length === 0) return null;
              return (
                <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                  {places.map((p) => (
                    <span key={p.key} className="inline-flex items-center gap-1 rounded-md bg-[#EBF5FB] px-2 py-0.5 text-[11px] font-medium text-[#0089bb] max-w-[180px] truncate">
                      <Building2 className="h-3 w-3 shrink-0" />
                      <span className="truncate">{p.label}</span>
                    </span>
                  ))}
                </div>
              );
            })()}

            {professional.bio && (
              <p className="text-xs text-[#9ca3af] mt-3 line-clamp-2 leading-snug">{professional.bio}</p>
            )}

            {/* Casos de éxito preview — link to the gallery before booking */}
            {professional.portfolioCount ? (
              <Link
                href={`/profesionales/${professional.slug}?tab=casos`}
                className="inline-flex items-center gap-1.5 mt-3 text-xs font-medium text-[#009FD9] hover:underline"
              >
                <ImageIcon className="h-3.5 w-3.5" />
                Ver casos de éxito ({professional.portfolioCount})
              </Link>
            ) : null}
          </div>

          {/* ── Right: availability panel (md:pt-7 clears the corner favorites button) ── */}
          <div className="md:w-[280px] md:shrink-0 md:border-l md:border-[#f3f4f6] md:pl-5 pt-4 md:pt-7 border-t border-[#f3f4f6] md:border-t-0">
            <ProfessionalSchedule
              professional={professional}
              categoryName={categoryName}
              availabilityPublic={!isPrivate}
              contactPreference={professional.contactPreference ?? "ambas"}
              slots={slots}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

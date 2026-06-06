import { getTranslations } from "next-intl/server";
import { MapPin, CheckCircle2, Building2 } from "lucide-react";
import { ProfessionalSchedule, type ScheduleSlot } from "@/components/professionals/professional-schedule";
import { Link } from "@/i18n/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { StarRating } from "@/components/ui/star-rating";
import { getInitials } from "@/lib/utils";
import { primaryPricingLabel, type PricingTier } from "@/lib/pricing";

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
  lat?: number | null;
  lng?: number | null;
  serviceType?: string | null;
};

interface ProfessionalCardProps {
  professional: ProfessionalCardData;
  className?: string;
  slots?: ScheduleSlot[];
}

export async function ProfessionalCard({ professional, className, slots = [] }: ProfessionalCardProps) {
  const tCat = await getTranslations("categories");
  const tCard = await getTranslations("card");
  const isPrivate = professional.availabilityPublic === false;
  const categoryName = tCat(professional.categoryId);
  const professionList = (professional.professions && professional.professions.length > 0
    ? professional.professions
    : [professional.categoryId]
  ).filter(Boolean).slice(0, 3);
  const priceLabel = primaryPricingLabel(professional.pricing, professional.hourlyRate);

  return (
    <Card className={`group hover:shadow-md transition-all duration-200 overflow-hidden ${className ?? ""}`}>
      {professional.isFeatured && (
        <div className="bg-gradient-to-r from-[#ff7c0a] to-[#ff9b32] px-4 py-1.5">
          <span className="text-xs font-semibold text-white tracking-wide">{tCard("featured")}</span>
        </div>
      )}

      <CardContent className="p-5">
        <div className="flex flex-col md:flex-row gap-5">
          {/* ── Left: professional info ─────────────────────────────── */}
          <div className="flex-1 min-w-0">
            <div className="flex gap-3.5">
              <Link href={`/profesionales/${professional.slug}`} className="shrink-0">
                <Avatar className="h-16 w-16">
                  <AvatarImage src={professional.avatarUrl} alt={professional.fullName} />
                  <AvatarFallback className="text-lg bg-[#EBF5FB] text-[#009FD9] font-semibold">{getInitials(professional.fullName)}</AvatarFallback>
                </Avatar>
              </Link>

              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link href={`/profesionales/${professional.slug}`} className="flex items-center gap-1.5">
                      <h3 className="font-semibold text-[#111827] text-base leading-tight hover:text-[#009FD9] transition-colors">{professional.fullName}</h3>
                      {professional.isVerified && <CheckCircle2 className="h-4 w-4 text-[#009FD9] shrink-0" />}
                    </Link>
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

                <StarRating rating={professional.ratingAvg} showValue reviewCount={professional.reviewCount} size="sm" className="mt-2" />

                <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                  <span className="inline-flex items-center gap-1 rounded-md bg-[#f3f4f6] px-2 py-0.5 text-[11px] font-medium text-[#374151]">
                    <MapPin className="h-3 w-3 text-[#009FD9]" />
                    {professional.provinceName}
                  </span>
                  {professional.cantonName && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-[#f3f4f6] px-2 py-0.5 text-[11px] font-medium text-[#374151]">
                      <Building2 className="h-3 w-3 text-[#9ca3af]" />
                      {professional.cantonName}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {professional.bio && (
              <p className="text-xs text-[#9ca3af] mt-3 line-clamp-2 leading-snug">{professional.bio}</p>
            )}
          </div>

          {/* ── Right: availability panel ───────────────────────────── */}
          <div className="md:w-[280px] md:shrink-0 md:border-l md:border-[#f3f4f6] md:pl-5 pt-4 md:pt-0 border-t border-[#f3f4f6] md:border-t-0">
            <ProfessionalSchedule
              professional={professional}
              categoryName={categoryName}
              availabilityPublic={!isPrivate}
              slots={slots}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

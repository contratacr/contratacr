import { getTranslations } from "next-intl/server";
import { MapPin, CheckCircle2 } from "lucide-react";
import { BookingButton } from "@/components/booking/booking-button";
import { ProfessionalSchedule, type ScheduleSlot } from "@/components/professionals/professional-schedule";
import { WhatsAppIcon } from "@/components/icons/whatsapp-icon";
import { Link } from "@/i18n/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StarRating } from "@/components/ui/star-rating";
import { getInitials, getWhatsAppLink } from "@/lib/utils";

export type ProfessionalCardData = {
  id: string;
  slug: string;
  fullName: string;
  avatarUrl?: string;
  categoryId: string;
  categoryIcon: string;
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
  const t = await getTranslations("card");
  const tCat = await getTranslations("categories");
  const isPrivate = professional.availabilityPublic === false;
  const categoryName = tCat(professional.categoryId);

  const waLink = getWhatsAppLink(
    professional.whatsapp,
    `Hola ${professional.fullName.split(" ")[0]}, vi tu perfil en ContrataCR y me gustaría consultarte sobre tus servicios.`
  );

  const expLabel =
    (professional.yearsExperience ?? 0) === 1 ? t("exp") : t("expPlural");

  return (
    <Card className={`group hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 ${className ?? ""}`}>
      {professional.isFeatured && (
        <div className="rounded-t-2xl bg-gradient-to-r from-[#ff7c0a] to-[#ff9b32] px-4 py-1.5">
          <span className="text-xs font-semibold text-white tracking-wide">{t("featured")}</span>
        </div>
      )}

      <CardContent className="p-5">
        <div className="flex gap-4">
          <div className="shrink-0">
            <Avatar className="h-20 w-20">
              <AvatarImage src={professional.avatarUrl} alt={professional.fullName} />
              <AvatarFallback className="text-xl bg-[#EBF5FB] text-[#009FD9] font-semibold">{getInitials(professional.fullName)}</AvatarFallback>
            </Avatar>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h3 className="font-semibold text-[#111827] text-base truncate">{professional.fullName}</h3>
              {professional.isVerified && <CheckCircle2 className="h-4 w-4 text-[#009FD9] shrink-0" />}
            </div>
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              <Badge variant="default" className="text-xs">
                {professional.categoryIcon} {tCat(professional.categoryId)}
              </Badge>
              {professional.yearsExperience && (
                <span className="text-xs text-[#6b7280]">
                  {professional.yearsExperience} {expLabel}
                </span>
              )}
            </div>

            <StarRating rating={professional.ratingAvg} showValue reviewCount={professional.reviewCount} size="sm" className="mt-2" />
            <p className="text-sm text-[#6b7280] mt-2 line-clamp-2">{professional.bio}</p>
            <div className="flex items-center gap-1 mt-2 text-xs text-[#6b7280]">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              <span>{professional.cantonName}, {professional.provinceName}</span>
            </div>
          </div>
        </div>

        {/* Inline availability (Hulihealth-style) — chips or private state */}
        <ProfessionalSchedule
          professional={professional}
          categoryName={categoryName}
          availabilityPublic={!isPrivate}
          slots={slots}
        />

        <div className="flex items-center justify-between mt-4 pt-4 border-t border-[#f3f4f6]">
          <div>
            {professional.hourlyRate ? (
              <div>
                <span className="text-xs text-[#9ca3af]">{t("from")}</span>
                <p className="font-bold text-[#111827]">
                  ₡{professional.hourlyRate.toLocaleString("es-CR")}
                  <span className="text-xs font-normal text-[#6b7280]">{t("perHour")}</span>
                </p>
              </div>
            ) : (
              <span className="text-xs text-[#6b7280]">{t("priceOnRequest")}</span>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href={`/profesionales/${professional.slug}`}>{t("viewProfile")}</Link>
            </Button>
            {isPrivate ? (
              <Button variant="whatsapp" size="sm" asChild>
                <a href={waLink} target="_blank" rel="noopener noreferrer">
                  <WhatsAppIcon className="h-4 w-4" />
                  WhatsApp
                </a>
              </Button>
            ) : (
              <BookingButton
                professional={professional}
                categoryName={categoryName}
                variant="default"
                size="sm"
              />
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

import Link from "next/link";
import { MapPin, CheckCircle2, Star, MessageCircle } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StarRating } from "@/components/ui/star-rating";
import { getInitials, getWhatsAppLink } from "@/lib/utils";

export type ProfessionalCardData = {
  id: string;
  slug: string;
  full_name: string;
  avatar_url?: string;
  category_name: string;
  category_icon: string;
  bio: string;
  whatsapp: string;
  provincia_name: string;
  canton_name: string;
  rating_avg: number;
  review_count: number;
  years_experience?: number;
  hourly_rate?: number;
  is_verified: boolean;
  is_featured: boolean;
  is_available: boolean;
};

interface ProfessionalCardProps {
  professional: ProfessionalCardData;
  className?: string;
}

export function ProfessionalCard({ professional, className }: ProfessionalCardProps) {
  const waLink = getWhatsAppLink(
    professional.whatsapp,
    `Hola ${professional.full_name.split(" ")[0]}, vi tu perfil en ContrataCR y me gustaría consultarte sobre tus servicios.`
  );

  return (
    <Card
      className={`group hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 ${className ?? ""}`}
    >
      {professional.is_featured && (
        <div className="rounded-t-2xl bg-gradient-to-r from-[#ff7c0a] to-[#ff9b32] px-4 py-1.5">
          <span className="text-xs font-semibold text-white tracking-wide">⭐ DESTACADO</span>
        </div>
      )}

      <CardContent className="p-5">
        <div className="flex gap-4">
          {/* Avatar */}
          <div className="relative shrink-0">
            <Avatar className="h-16 w-16 ring-2 ring-offset-1 ring-[#e5e7eb]">
              <AvatarImage src={professional.avatar_url} alt={professional.full_name} />
              <AvatarFallback className="text-lg">{getInitials(professional.full_name)}</AvatarFallback>
            </Avatar>
            {professional.is_available && (
              <span className="absolute bottom-0 right-0 h-4 w-4 rounded-full bg-emerald-400 border-2 border-white" title="Disponible" />
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <h3 className="font-semibold text-[#111827] text-base truncate">
                    {professional.full_name}
                  </h3>
                  {professional.is_verified && (
                    <CheckCircle2 className="h-4 w-4 text-[#319278] shrink-0" />
                  )}
                </div>
                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                  <Badge variant="default" className="text-xs">
                    {professional.category_icon} {professional.category_name}
                  </Badge>
                  {professional.years_experience && (
                    <span className="text-xs text-[#6b7280]">
                      {professional.years_experience} {professional.years_experience === 1 ? "año" : "años"} exp.
                    </span>
                  )}
                </div>
              </div>
            </div>

            <StarRating
              rating={professional.rating_avg}
              showValue
              reviewCount={professional.review_count}
              size="sm"
              className="mt-2"
            />

            <p className="text-sm text-[#6b7280] mt-2 line-clamp-2">{professional.bio}</p>

            <div className="flex items-center gap-1 mt-2 text-xs text-[#6b7280]">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              <span>{professional.canton_name}, {professional.provincia_name}</span>
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between mt-4 pt-4 border-t border-[#f3f4f6]">
          <div>
            {professional.hourly_rate ? (
              <div>
                <span className="text-xs text-[#9ca3af]">Desde</span>
                <p className="font-bold text-[#111827]">
                  ₡{professional.hourly_rate.toLocaleString("es-CR")}
                  <span className="text-xs font-normal text-[#6b7280]">/hora</span>
                </p>
              </div>
            ) : (
              <span className="text-xs text-[#6b7280]">Precio a consultar</span>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href={`/profesionales/${professional.slug}`}>Ver perfil</Link>
            </Button>
            <Button variant="whatsapp" size="sm" asChild>
              <a href={waLink} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="h-3.5 w-3.5" />
                WhatsApp
              </a>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

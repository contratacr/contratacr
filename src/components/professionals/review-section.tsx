"use client";

import { Star } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { StarRating } from "@/components/ui/star-rating";
import { getInitials } from "@/lib/utils";
import type { Review } from "@/lib/queries/professionals";

interface ReviewSectionProps {
  professionalId: string;
  professionalName: string;
  reviewCount: number;
  ratingAvg: number;
  reviews: Review[];
  isAuthenticated: boolean;
}

function timeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return "hoy";
  if (days === 1) return "hace 1 día";
  if (days < 7) return `hace ${days} días`;
  if (days < 14) return "hace 1 semana";
  if (days < 30) return `hace ${Math.floor(days / 7)} semanas`;
  return `hace ${Math.floor(days / 30)} mes(es)`;
}

export function ReviewSection({
  reviewCount,
  ratingAvg,
  reviews,
}: ReviewSectionProps) {
  return (
    <>
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-lg font-semibold text-[#111827]">
          Reseñas ({reviewCount})
        </h2>
        <div className="flex items-center gap-1">
          <Star className="h-5 w-5 text-[#ff9b32] fill-[#ff9b32]" />
          <span className="font-bold text-[#111827]">{ratingAvg.toFixed(1)}</span>
        </div>
      </div>

      <div className="flex flex-col gap-5">
        {reviews.map((review) => (
          <div key={review.id} className="flex gap-3">
            <Avatar className="h-9 w-9 shrink-0">
              <AvatarImage src={review.clientAvatarUrl} />
              <AvatarFallback>{getInitials(review.clientName)}</AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-[#111827]">{review.clientName}</span>
                {/* "editada" is intentionally NOT shown publicly (item 4). */}
                <span className="text-xs text-[#9ca3af]">{timeAgo(review.createdAt)}</span>
              </div>
              <StarRating rating={review.rating} size="sm" className="my-1" />
              {review.jobTitle && (
                <p className="text-xs text-[#9ca3af] mt-0.5">Reseña de “{review.jobTitle}”</p>
              )}
              <p className="text-sm text-[#374151] leading-relaxed mt-1">{review.comment}</p>
            </div>
          </div>
        ))}

        {reviews.length === 0 && (
          <p className="text-sm text-[#9ca3af] text-center py-6">
            Aún no hay reseñas. Solo los clientes que completaron un servicio pueden dejar una.
          </p>
        )}
      </div>
    </>
  );
}

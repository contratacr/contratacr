"use client";

import { Star } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { StarRating } from "@/components/ui/star-rating";
import { getInitials, formatRelativeTime } from "@/lib/utils";
import type { Review } from "@/lib/queries/professionals";

interface ReviewSectionProps {
  professionalId: string;
  professionalName: string;
  reviewCount: number;
  ratingAvg: number;
  reviews: Review[];
  isAuthenticated: boolean;
}

export function ReviewSection({
  reviewCount,
  ratingAvg,
  reviews,
}: ReviewSectionProps) {
  const t = useTranslations("profile");
  const locale = useLocale();
  return (
    <>
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-lg font-semibold text-[#111827]">
          {t("reviewsHeading", { count: reviewCount })}
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
                <span className="text-xs text-[#9ca3af]">{formatRelativeTime(review.createdAt, locale)}</span>
              </div>
              <StarRating rating={review.rating} size="sm" className="my-1" />
              {review.jobTitle && (
                <p className="text-xs text-[#9ca3af] mt-0.5">{t("reviewOf", { title: review.jobTitle })}</p>
              )}
              <p className="text-sm text-[#374151] leading-relaxed mt-1">{review.comment}</p>
            </div>
          </div>
        ))}

        {reviews.length === 0 && (
          <p className="text-sm text-[#9ca3af] text-center py-6">
            {t("noReviews")}
          </p>
        )}
      </div>
    </>
  );
}

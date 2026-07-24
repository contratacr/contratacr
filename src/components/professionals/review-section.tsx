"use client";

import { Star } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { StarRating } from "@/components/ui/star-rating";
import { getInitials, formatRelativeTime } from "@/lib/utils";
import { ALL_CATEGORIES, getCategoryLabel } from "@/lib/data/categories";
import type { Review } from "@/lib/queries/professionals";

interface ReviewSectionProps {
  professionalId: string;
  professionalName: string;
  reviewCount: number;
  ratingAvg: number;
  reviews: Review[];
  isAuthenticated: boolean;
}

const normalizeReviewTitle = (value: string) =>
  value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();

function localizedReviewJobTitle(title: string | null | undefined, locale: string) {
  if (!title) return "";
  const normalizedTitle = normalizeReviewTitle(title);
  const category = ALL_CATEGORIES.find((item) => {
    const esLabel = normalizeReviewTitle(getCategoryLabel(item.id, "es"));
    const enLabel = normalizeReviewTitle(getCategoryLabel(item.id, "en"));
    return normalizedTitle === esLabel || normalizedTitle === enLabel || normalizedTitle === item.id;
  });
  return category ? getCategoryLabel(category.id, locale) : title;
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
        {reviews.map((review) => {
          const clientName = review.clientName === "Cliente" && locale === "en" ? "Client" : review.clientName;
          const jobTitle = localizedReviewJobTitle(review.jobTitle, locale);
          return (
            <div key={review.id} className="flex gap-3">
              <Avatar className="h-9 w-9 shrink-0">
                <AvatarImage src={review.clientAvatarUrl} />
                <AvatarFallback>{getInitials(clientName)}</AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-[#111827]">{clientName}</span>
                  {/* "editada" is intentionally NOT shown publicly (item 4). */}
                  <span className="text-xs text-[#9ca3af]">{formatRelativeTime(review.createdAt, locale)}</span>
                </div>
                <StarRating rating={review.rating} size="sm" className="my-1" />
                {jobTitle && (
                  <p className="text-xs text-[#9ca3af] mt-0.5">{t("reviewOf", { title: jobTitle })}</p>
                )}
                <p className="text-sm text-[#374151] leading-relaxed mt-1">{review.comment}</p>
              </div>
            </div>
          );
        })}

        {reviews.length === 0 && (
          <p className="text-sm text-[#9ca3af] text-center py-6">
            {t("noReviews")}
          </p>
        )}
      </div>
    </>
  );
}

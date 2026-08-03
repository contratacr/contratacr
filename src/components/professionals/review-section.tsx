"use client";

import { useEffect, useMemo, useState } from "react";
import { Star } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { StarRating } from "@/components/ui/star-rating";
import { LeaveReviewModal } from "@/components/professionals/leave-review-modal";
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
  professionalId,
  professionalName,
  reviewCount,
  ratingAvg,
  reviews,
  isAuthenticated,
}: ReviewSectionProps) {
  const t = useTranslations("profile");
  const locale = useLocale();
  const router = useRouter();
  const [reviewOpen, setReviewOpen] = useState(false);
  const [translatedComments, setTranslatedComments] = useState<Record<string, string>>({});
  const commentsToTranslate = useMemo(
    () => reviews.filter((review) => review.comment.trim()).map((review) => ({ id: review.id, comment: review.comment.trim() })),
    [reviews]
  );

  useEffect(() => {
    let active = true;
    if (locale !== "en" || commentsToTranslate.length === 0) {
      setTranslatedComments({});
      return;
    }

    async function translateComments() {
      const missing = commentsToTranslate.filter((review) => !translatedComments[review.id]);
      if (missing.length === 0) return;

      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          texts: missing.map((review) => review.comment),
          source: "es",
          target: "en",
        }),
      }).catch(() => null);
      if (!res?.ok) return;

      const data = await res.json().catch(() => null);
      const translations = Array.isArray(data?.translations) ? data.translations : [];
      if (!active) return;

      setTranslatedComments((prev) => {
        const next = { ...prev };
        missing.forEach((review, index) => {
          const translated = typeof translations[index] === "string" ? translations[index].trim() : "";
          if (translated) next[review.id] = translated;
        });
        return next;
      });
    }

    translateComments();
    return () => { active = false; };
  }, [commentsToTranslate, locale, translatedComments]);

  function openReviewModal() {
    if (!isAuthenticated) {
      const redirect = `${window.location.pathname}?tab=resenas#resenas`;
      window.location.assign(`/${locale}/login?redirect=${encodeURIComponent(redirect)}`);
      return;
    }
    setReviewOpen(true);
  }

  return (
    <>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-lg font-semibold text-[#111827]">
            {t("reviewsHeading", { count: reviewCount })}
          </h2>
          <div className="mt-1 flex items-center gap-1 text-sm text-[#374151]">
            <Star className="h-4 w-4 text-[#ff9b32] fill-[#ff9b32]" />
            <span className="font-bold text-[#111827]">{ratingAvg.toFixed(1)}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={openReviewModal}
          className="rounded-full bg-[#009FD9] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#008fc3]"
        >
          {locale === "en" ? "Write review" : "Dejar reseña"}
        </button>
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
                <p className="text-sm text-[#374151] leading-relaxed mt-1">{translatedComments[review.id] ?? review.comment}</p>
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
      {reviewOpen && (
        <LeaveReviewModal
          professionalId={professionalId}
          professionalName={professionalName}
          onClose={() => setReviewOpen(false)}
          onSuccess={() => router.refresh()}
        />
      )}
    </>
  );
}

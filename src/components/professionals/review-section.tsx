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
  /** Recarga los datos del perfil tras publicar/editar una reseña. */
  onReviewSubmitted?: () => void | Promise<void>;
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
  onReviewSubmitted,
  isAuthenticated,
}: ReviewSectionProps) {
  const t = useTranslations("profile");
  const locale = useLocale();
  const router = useRouter();
  const [translatedComments, setTranslatedComments] = useState<Record<string, string>>({});
  const commentsToTranslate = useMemo(
    () => reviews.filter((review) => review.comment.trim()).map((review) => ({ id: review.id, comment: review.comment.trim() })),
    [reviews]
  );

  useEffect(() => {
    let active = true;
    if (locale !== "en" || commentsToTranslate.length === 0) {
      // Do not clear state here. The old synchronous `setState({})` created an
      // endless effect -> render loop in Spanish and starved App Router
      // transitions. Rendering below ignores translations outside English.
      return;
    }

    async function translateComments() {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          texts: commentsToTranslate.map((review) => review.comment),
          source: "es",
          target: "en",
        }),
      }).catch(() => null);
      if (!res?.ok) return;

      const data = await res.json().catch(() => null);
      const translations = Array.isArray(data?.translations) ? data.translations : [];
      if (!active) return;

      setTranslatedComments(() => {
        const next: Record<string, string> = {};
        commentsToTranslate.forEach((review, index) => {
          const translated = typeof translations[index] === "string" ? translations[index].trim() : "";
          if (translated) next[review.id] = translated;
        });
        return next;
      });
    }

    translateComments();
    return () => { active = false; };
  }, [commentsToTranslate, locale]);

  const reviewRedirectPath =
    typeof window === "undefined"
      ? `/${locale}/profesionales`
      : `${window.location.pathname}?tab=resenas&pendingReview=1#resenas`;

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-[#111827]">
            {t("reviewsHeading", { count: reviewCount })}
          </h2>
          <div className="mt-1 flex items-center gap-1 text-sm text-[#374151]">
            <Star className="h-4 w-4 text-[#ff9b32] fill-[#ff9b32]" />
            <span className="font-bold text-[#111827]">{ratingAvg.toFixed(1)}</span>
          </div>
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
                <p className="text-sm text-[#374151] leading-relaxed mt-1">
                  {locale === "en" ? translatedComments[review.id] ?? review.comment : review.comment}
                </p>
              </div>
            </div>
          );
        })}

        {reviews.length === 0 && (
          <div className="flex flex-col items-center py-8 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-[#fff6ec] text-[#ff9b32]">
              <Star className="h-5 w-5" />
            </span>
            <p className="mt-3 text-sm font-semibold text-[#374151]">{t("noReviews")}</p>
          </div>
        )}
      </div>

      {/* Leave/edit-your-review comes AFTER the social proof. */}
      <div className="mt-6">
        <LeaveReviewModal
          professionalId={professionalId}
          professionalName={professionalName}
          embedded
          isAuthenticated={isAuthenticated}
          loginRedirectPath={reviewRedirectPath}
          onClose={() => undefined}
          onSuccess={() => { void onReviewSubmitted?.(); router.refresh(); }}
        />
      </div>
    </>
  );
}

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
  const [translatedComments, setTranslatedComments] = useState<Record<string, string>>({});
  const commentsToTranslate = useMemo(
    () => reviews.filter((review) => review.comment.trim()).map((review) => ({ id: review.id, comment: review.comment.trim() })),
    [reviews]
  );

  useEffect(() => {
    let active = true;
    if (locale !== "en" || commentsToTranslate.length === 0) return;

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
    return () => {
      active = false;
    };
  }, [commentsToTranslate, locale, translatedComments]);

  function requestReviewLogin() {
    const redirect = `${window.location.pathname}?tab=resenas#resenas`;
    window.location.assign(`/${locale}/login?redirect=${encodeURIComponent(redirect)}`);
  }

  return (
    <>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-[#111827]">
            {locale === "en" ? "Reviews" : "Reseñas"}
          </h2>
          {reviewCount > 0 ? (
            <div className="mt-1 flex items-center gap-2 text-sm text-[#526277]">
              <span className="inline-flex items-center gap-1">
                <Star className="h-4 w-4 fill-[#ff9b32] text-[#ff9b32]" />
                <span className="font-bold text-[#111827]">{ratingAvg.toFixed(1)}</span>
              </span>
              <span className="text-[#c4ccd6]">·</span>
              <span>{t("reviewCountLabel", { count: reviewCount })}</span>
            </div>
          ) : (
            <p className="mt-1 text-sm text-[#6b7280]">
              {locale === "en" ? "Share your experience with this professional." : "Compartí tu experiencia con este profesional."}
            </p>
          )}
        </div>
      </div>

      <div className="mb-6">
        {isAuthenticated ? (
          <LeaveReviewModal
            embedded
            professionalId={professionalId}
            professionalName={professionalName}
            onClose={() => undefined}
            onSuccess={() => router.refresh()}
          />
        ) : (
          <button
            type="button"
            onClick={requestReviewLogin}
            className="flex w-full items-center gap-3 rounded-xl bg-white px-3 py-3 text-left transition hover:bg-[#f8fbfd]"
          >
            <span className="flex shrink-0 gap-0.5 text-[#d1d5db]" aria-hidden>
              {[1, 2, 3, 4, 5].map((star) => <Star key={star} className="h-5 w-5 fill-current" />)}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-bold text-[#162543]">{locale === "en" ? "Write a review" : "Escribir una reseña"}</span>
              <span className="block text-xs text-[#6b7280]">{locale === "en" ? "Sign in to share your experience." : "Inicia sesión para compartir tu experiencia."}</span>
            </span>
          </button>
        )}
      </div>

      <div className="flex flex-col gap-5">
        {reviews.map((review) => {
          const clientName = review.clientName === "Cliente" && locale === "en" ? "Client" : review.clientName;
          const jobTitle = localizedReviewJobTitle(review.jobTitle, locale);
          return (
            <div key={review.id} className="flex gap-3 rounded-2xl border border-[#eef2f6] bg-white p-3.5">
              <Avatar className="h-9 w-9 shrink-0">
                <AvatarImage src={review.clientAvatarUrl} />
                <AvatarFallback>{getInitials(clientName)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold text-[#111827]">{clientName}</span>
                  <span className="shrink-0 text-xs text-[#9ca3af]">{formatRelativeTime(review.createdAt, locale)}</span>
                </div>
                <StarRating rating={review.rating} size="sm" className="my-1" />
                {jobTitle && (
                  <p className="mt-0.5 text-xs text-[#9ca3af]">{t("reviewOf", { title: jobTitle })}</p>
                )}
                <p className="mt-1 text-sm leading-relaxed text-[#374151]">
                  {locale === "en" ? translatedComments[review.id] ?? review.comment : review.comment}
                </p>
              </div>
            </div>
          );
        })}

        {reviews.length === 0 && (
          <div className="rounded-2xl border border-dashed border-[#d7e4ee] bg-[#f8fbfd] px-4 py-6 text-center">
            <p className="text-sm font-semibold text-[#162543]">
              {locale === "en" ? "No reviews yet" : "Aún no hay reseñas"}
            </p>
            <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-[#6b7280]">
              {locale === "en"
                ? "Be the first person to share a real experience with this professional."
                : "Sé la primera persona en compartir una experiencia real con este profesional."}
            </p>
          </div>
        )}
      </div>
    </>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { prefijoDeIdioma } from "@/lib/prefijo-de-idioma";
import { Star } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { PanelEmptyState } from "@/components/ui/content-loading";
import { StarRating } from "@/components/ui/star-rating";
import { LeaveReviewModal } from "@/components/professionals/leave-review-modal";
import { ReportProfileModal } from "@/components/professionals/report-profile-modal";
import { getInitials, formatRelativeTime } from "@/lib/utils";
import { nombreCorto } from "@/lib/nombre-corto";
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
  /** "directory" (directory on, 2026-11-26 redesign): the place page's summary panel (big score + 5→1 bars when every
   *  review is loaded) and each review in its own card. Default: the classic layout, unchanged. */
  variant?: "classic" | "directory";
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
  variant = "classic",
}: ReviewSectionProps) {
  const directory = variant === "directory";
  const t = useTranslations("profile");
  const tModeration=useTranslations("moderation");
  const locale = useLocale();
  const router = useRouter();
  const [reportedReview,setReportedReview]=useState<string|null>(null);
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
      ? `${prefijoDeIdioma(locale)}/profesionales`
      : `${window.location.pathname}?tab=resenas&pendingReview=1#resenas`;

  const distribution = directory && reviews.length > 0 && reviews.length === reviewCount
    ? [1, 2, 3, 4, 5].map((s) => reviews.filter((r) => Math.round(r.rating) === s).length)
    : null;
  const maxBand = Math.max(1, ...(distribution ?? []));
  return (
    <>
      {directory ? (
        <div className="mb-6 space-y-4">
          <h2 className="text-xl font-extrabold tracking-tight text-[#162543]">{t("reviewsHeading", { count: reviewCount })}</h2>
          {reviewCount > 0 && (
            <div className="grid gap-5 rounded-2xl bg-gradient-to-br from-[#f3f9fc] to-white p-5 ring-1 ring-[#e5eef4] sm:grid-cols-[170px_1fr] sm:items-center sm:gap-8 sm:p-6">
              <div className="flex items-center gap-4 sm:block sm:space-y-2">
                <p className="text-[52px] font-extrabold leading-none tracking-tight text-[#162543]">{ratingAvg.toFixed(1)}</p>
                <div className="space-y-1"><StarRating rating={ratingAvg} size="md" />
                  <p className="text-sm font-medium text-[#526277]">{t("reviewCountLabel", { count: reviewCount })}</p></div>
              </div>
              {distribution && (
                <ul className="space-y-2" aria-label={t("ratingsByStars")}>
                  {[5, 4, 3, 2, 1].map((st) => {
                    const n = distribution[st - 1] ?? 0;
                    return (
                      <li key={st} className="grid grid-cols-[64px_1fr_28px] items-center gap-3 text-[13px]">
                        <span className="whitespace-nowrap font-semibold text-[#334155]">{t("starsCount", { count: st })}</span>
                        <span className="h-2 overflow-hidden rounded-full bg-[#e3eaf0]" aria-hidden="true"><span className="block h-full rounded-full bg-[#f5a623]" style={{ width: `${(n / maxBand) * 100}%` }} /></span>
                        <span className="text-right tabular-nums text-[#526277]">{n}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </div>
      ) : (
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-[#162543]">
            {t("reviewsHeading", { count: reviewCount })}
          </h2>
          <div className="mt-1 flex items-center gap-1 text-sm text-[#374151]">
            <Star className="h-4 w-4 text-[#ff9b32] fill-[#ff9b32]" />
            <span className="font-bold text-[#162543]">{ratingAvg.toFixed(1)}</span>
          </div>
        </div>
      </div>
      )}

      {/* Dejar o corregir la reseña va ARRIBA: quien entra a esta pestaña con algo
          que decir no debería recorrer toda la lista para encontrar dónde decirlo. */}
      <div className="mb-6">
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

      <div className={directory ? "flex flex-col gap-3" : "flex flex-col gap-5"}>
        {reviews.map((review) => {
          const clientName = nombreCorto(review.clientName === "Cliente" && locale === "en" ? "Client" : review.clientName);
          const jobTitle = localizedReviewJobTitle(review.jobTitle, locale);
          return (
            <div key={review.id} className={directory ? "flex gap-3 rounded-2xl border border-[#e8edf2] bg-white p-4 sm:p-5" : "flex gap-3"}>
              <Avatar className={directory ? "h-11 w-11 shrink-0" : "h-9 w-9 shrink-0"}>
                <AvatarImage src={review.clientAvatarUrl} />
                <AvatarFallback>{getInitials(clientName)}</AvatarFallback>
              </Avatar>
              <div className="flex-1">
                {/* Nombre en UNA línea y la fecha junto a las estrellas: la fecha en
                    su propia columna apretaba el nombre y lo partía en dos. */}
                <span className="block truncate text-sm font-medium text-[#162543]">{clientName}</span>
                <div className="my-1 flex items-center gap-2">
                  <StarRating rating={review.rating} size="sm" />
                  {/* "editada" is intentionally NOT shown publicly (item 4). */}
                  <span className="text-xs text-[#68778d]">· {formatRelativeTime(review.createdAt, locale)}</span>
                </div>
                {jobTitle && (
                  <p className="text-xs text-[#68778d] mt-0.5">{t("reviewOf", { title: jobTitle })}</p>
                )}
                <p className="text-sm text-[#374151] leading-relaxed mt-1">
                  {locale === "en" ? translatedComments[review.id] ?? review.comment : review.comment}
                </p>
                <button type="button" className="mt-2 min-h-10 text-xs text-slate-600 underline" onClick={()=>setReportedReview(review.id)}>{tModeration("reportReview")}</button>
              </div>
            </div>
          );
        })}

        {reviews.length === 0 && (
          // El MISMO vacío del resto del app. El círculo naranja de antes era
          // el único de su color en toda la ficha y se leía como un aviso.
          <PanelEmptyState plano tamano="compacto" icon={Star} title={t("noReviews")} className="min-h-[10rem]" />
        )}
      </div>

      {reportedReview&&<ReportProfileModal professionalName={professionalName} professionalSlug={professionalId} targetType="review" targetId={reportedReview} titulo={tModeration("reportReview")} onClose={()=>setReportedReview(null)}/>}
    </>
  );
}

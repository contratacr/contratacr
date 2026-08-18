"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { AlertCircle, Star, X } from "lucide-react";
import { SuccessIcon } from "@/components/ui/success-icon";

interface LeaveReviewModalProps {
  professionalId: string;
  professionalName: string;
  bookingId?: string;
  projectId?: string;
  contactId?: string;
  isAuthenticated?: boolean;
  loginRedirectPath?: string;
  onClose: () => void;
  onSuccess?: () => void;
  embedded?: boolean;
}

const PENDING_REVIEW_KEY_PREFIX = "contratacr:pending-profile-review:";

function currentLocalePrefix() {
  if (typeof window === "undefined") return "/es";
  const segment = window.location.pathname.split("/")[1];
  return segment === "en" ? "/en" : "/es";
}

export function LeaveReviewModal({
  professionalId,
  professionalName,
  bookingId,
  projectId,
  contactId,
  isAuthenticated = true,
  loginRedirectPath,
  onClose,
  onSuccess,
  embedded = false,
}: LeaveReviewModalProps) {
  const t = useTranslations("reviewModal");
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const pendingReviewKey = `${PENDING_REVIEW_KEY_PREFIX}${professionalId}`;

  useEffect(() => {
    if (!isAuthenticated) return;
    let active = true;
    const query = bookingId
      ? `bookingId=${bookingId}`
      : projectId
        ? `projectId=${projectId}`
        : contactId
          ? `contactId=${contactId}`
          : `professionalId=${professionalId}`;
    void (async () => {
      try {
        const response = await fetch(`/api/reviews?${query}`);
        const data = await response.json();
        if (active && data.review) {
          setRating(data.review.rating ?? 0);
          setComment(data.review.comment ?? "");
          setIsEditing(true);
        }
      } catch {
        // A new review can still be written if the prefill request fails.
      }
    })();
    return () => { active = false; };
  }, [bookingId, contactId, isAuthenticated, professionalId, projectId]);

  useEffect(() => {
    if (isAuthenticated || typeof window === "undefined") return;
    try {
      const raw = window.sessionStorage.getItem(pendingReviewKey);
      if (!raw) return;
      const draft = JSON.parse(raw) as { rating?: unknown; comment?: unknown };
      const draftRating = Number(draft.rating);
      const draftComment = typeof draft.comment === "string" ? draft.comment.slice(0, 300) : "";
      if (draftRating >= 0.5 && draftRating <= 5) setRating(draftRating);
      if (draftComment) setComment(draftComment);
    } catch {
      // Ignore malformed local drafts.
    }
  }, [isAuthenticated, pendingReviewKey]);

  useEffect(() => {
    if (!isAuthenticated || typeof window === "undefined") return;
    let cancelled = false;

    async function submitPendingReview() {
      let draft: { rating?: unknown; comment?: unknown; ts?: unknown } | null = null;
      try {
        const raw = window.sessionStorage.getItem(pendingReviewKey);
        if (!raw) return;
        draft = JSON.parse(raw);
      } catch {
        window.sessionStorage.removeItem(pendingReviewKey);
        return;
      }

      const draftRating = Number(draft?.rating);
      const draftComment = typeof draft?.comment === "string" ? draft.comment.trim() : "";
      const draftAge = Date.now() - Number(draft?.ts ?? 0);
      if (!(draftRating >= 0.5 && draftRating <= 5) || !draftComment || draftAge > 1000 * 60 * 60 * 24) {
        window.sessionStorage.removeItem(pendingReviewKey);
        return;
      }

      setRating(draftRating);
      setComment(draftComment.slice(0, 300));
      setLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/reviews", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ professionalId, rating: draftRating, comment: draftComment.slice(0, 300), bookingId, projectId, contactId }),
        });
        const data = await response.json().catch(() => ({}));
        if (cancelled) return;
        if (!response.ok) {
          setError(data.error ?? t("errSubmit"));
          return;
        }
        window.sessionStorage.removeItem(pendingReviewKey);
        setSuccess(true);
        window.setTimeout(() => {
          onSuccess?.();
          if (!embedded) onClose();
        }, 1200);
      } catch {
        if (!cancelled) setError(t("errConnection"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void submitPendingReview();
    return () => { cancelled = true; };
  }, [bookingId, contactId, embedded, isAuthenticated, onClose, onSuccess, pendingReviewKey, professionalId, projectId, t]);

  useEffect(() => {
    if (embedded) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [embedded, onClose]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (rating === 0) {
      setError(t("errRating"));
      return;
    }
    if (!comment.trim()) {
      setError(t("errComment"));
      return;
    }
    if (!isAuthenticated) {
      try {
        window.sessionStorage.setItem(
          pendingReviewKey,
          JSON.stringify({
            professionalId,
            rating,
            comment: comment.trim(),
            bookingId,
            projectId,
            contactId,
            ts: Date.now(),
            returnTo: loginRedirectPath ?? window.location.pathname + window.location.search + window.location.hash,
          }),
        );
      } catch {
        // If storage is blocked, the login redirect still preserves the destination.
      }
      const redirect = encodeURIComponent(loginRedirectPath ?? window.location.pathname + window.location.search + window.location.hash);
      window.location.assign(`${currentLocalePrefix()}/login?redirect=${redirect}`);
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const response = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ professionalId, rating, comment: comment.trim(), bookingId, projectId, contactId }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? t("errSubmit"));
        return;
      }
      setSuccess(true);
      window.setTimeout(() => {
        onSuccess?.();
        if (!embedded) onClose();
      }, 1200);
    } catch {
      setError(t("errConnection"));
    } finally {
      setLoading(false);
    }
  }

  const displayRating = hovered || rating;
  const formContent = success ? (
    <div className={`flex flex-col items-center ${embedded ? "gap-2 py-4" : "gap-3 px-6 py-8"}`}>
      <SuccessIcon size={embedded ? 40 : 52} />
      <p className={`${embedded ? "text-base" : "text-lg"} font-semibold text-[#111827]`}>{t("thanks")}</p>
      <div className="flex gap-1" aria-hidden>
        {[1, 2, 3, 4, 5].map((star) => (
          <Star key={star} className={`h-7 w-7 ${rating >= star ? "fill-yellow-400 text-yellow-400" : "fill-[#d1d5db] text-[#d1d5db]"}`} />
        ))}
      </div>
      <p className="text-center text-sm text-[#6b7280]">{t("thanksSub")}</p>
    </div>
  ) : (
    <form onSubmit={handleSubmit} className={`flex flex-col ${embedded ? "gap-3 rounded-2xl border border-[#dbe7ef] bg-white p-3.5 shadow-[0_10px_26px_-24px_rgba(15,23,42,0.55)] sm:p-4" : "gap-4 px-6 py-5"}`}>
      {embedded && (
        <div className="min-w-0">
          <p className="truncate text-sm font-extrabold text-[#162543]">
            {isEditing ? t("titleEdit") : t("embeddedPrompt")}
          </p>
        </div>
      )}
      <div>
        {!embedded && <p className="mb-2 text-sm font-medium text-[#374151]">{t("ratingLabel")}</p>}
        <div className={embedded ? "flex items-center justify-between gap-3" : "flex items-center gap-2"}>
          <div className="flex gap-0.5" onMouseLeave={() => setHovered(0)}>
            {[1, 2, 3, 4, 5].map((star) => {
              const full = displayRating >= star;
              const half = !full && displayRating >= star - 0.5;
              return (
                <div key={star} className={`relative ${embedded ? "h-7 w-7" : "h-9 w-9 sm:h-10 sm:w-10"}`}>
                  <Star className={`absolute inset-0 fill-[#d1d5db] text-[#d1d5db] ${embedded ? "h-7 w-7" : "h-9 w-9 sm:h-10 sm:w-10"}`} />
                  {(full || half) && (
                    <span className="absolute inset-0 overflow-hidden" style={{ width: full ? "100%" : "50%" }}>
                      <Star className={`fill-yellow-400 text-yellow-400 ${embedded ? "h-7 w-7" : "h-9 w-9 sm:h-10 sm:w-10"}`} />
                    </span>
                  )}
                  <button type="button" aria-label={t("halfStarAria", { value: star - 0.5 })} onMouseEnter={() => setHovered(star - 0.5)} onClick={() => setRating(star - 0.5)} className="absolute inset-y-0 left-0 z-10 w-1/2 cursor-pointer focus:outline-none" />
                  <button type="button" aria-label={t("starAria", { value: star })} onMouseEnter={() => setHovered(star)} onClick={() => setRating(star)} className="absolute inset-y-0 right-0 z-10 w-1/2 cursor-pointer focus:outline-none" />
                </div>
              );
            })}
          </div>
          {displayRating > 0 && <span className="text-sm font-semibold tabular-nums text-[#374151]">{displayRating.toFixed(1)}</span>}
        </div>
      </div>
      {(!embedded || rating > 0 || isEditing) && <div>
        <div className={`flex items-center ${embedded ? "mb-1.5 justify-end" : "mb-1.5 justify-between"}`}>
          {!embedded && <p className="text-sm font-medium text-[#374151]">{t("commentLabel")}</p>}
          <span className="text-xs tabular-nums text-[#9ca3af]">{comment.length}/300</span>
        </div>
        <textarea
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          maxLength={300}
          rows={embedded ? 3 : 4}
          placeholder={t("commentPlaceholder")}
          className={`w-full resize-none border border-[#dbe5ed] bg-white text-sm text-[#111827] placeholder:text-[#9ca3af] transition focus:border-[#009FD9] focus:outline-none focus:ring-2 focus:ring-[#009FD9]/20 ${embedded ? "rounded-xl px-3.5 py-3" : "rounded-xl px-3.5 py-3"}`}
        />
      </div>}
      {(!embedded || rating > 0 || isEditing) && error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-600">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}
      {(!embedded || rating > 0 || isEditing) && <button type="submit" disabled={loading} className={`bg-[#009FD9] text-sm font-semibold text-white transition hover:bg-[#0089bb] disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-[#009FD9]/40 ${embedded ? "ml-auto min-w-[146px] rounded-xl px-5 py-2.5" : "w-full rounded-xl px-4 py-3"}`}>
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            {t("sending")}
          </span>
        ) : isEditing ? t("submitUpdate") : t("submitNew")}
      </button>}
      {!embedded && <button type="button" onClick={onClose} className="text-sm font-medium text-[#6b7280] transition hover:text-[#111827]">{t("skip")}</button>}
    </form>
  );

  const panel = (
    <div className={embedded ? "w-full" : "app-bottom-sheet relative max-h-[92vh] w-full overflow-y-auto overscroll-contain rounded-t-2xl bg-white shadow-2xl sm:max-w-[420px] sm:rounded-2xl"}>
      {!embedded && (
        <div className="flex items-center justify-between border-b border-[#f3f4f6] px-6 pb-4 pt-6">
          <div>
            <h2 className="text-lg font-bold text-[#111827]">{isEditing ? t("titleEdit") : t("titleNew")}</h2>
            <p className="mt-0.5 text-sm text-[#6b7280]">{professionalName}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-1.5 text-[#9ca3af] transition hover:bg-[#f3f4f6] hover:text-[#374151]">
            <X className="h-5 w-5" />
          </button>
        </div>
      )}
      {formContent}
    </div>
  );

  if (embedded) return panel;
  return <div className="app-modal-screen fixed inset-0 z-[200] flex items-end justify-center bg-black/50 sm:items-center sm:px-4">{panel}</div>;
}

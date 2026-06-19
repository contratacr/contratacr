"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { AlertCircle, Star, X } from "lucide-react";
import { SuccessIcon } from "@/components/ui/success-icon";

interface LeaveReviewModalProps {
  professionalId: string;
  professionalName: string;
  /** Tie the review to a specific finished item (per-job reviews). */
  bookingId?: string;
  projectId?: string;
  onClose: () => void;
  onSuccess?: () => void;
}

export function LeaveReviewModal({
  professionalId,
  professionalName,
  bookingId,
  projectId,
  onClose,
  onSuccess,
}: LeaveReviewModalProps) {
  const t = useTranslations("reviewModal");
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const backdropRef = useRef<HTMLDivElement>(null);

  // Prefill from this item's existing review so it can be EDITED (stars filled).
  useEffect(() => {
    let active = true;
    const qs = bookingId ? `bookingId=${bookingId}` : projectId ? `projectId=${projectId}` : `professionalId=${professionalId}`;
    (async () => {
      try {
        const res = await fetch(`/api/reviews?${qs}`);
        const { review } = await res.json();
        if (active && review) {
          setRating(review.rating ?? 0);
          setComment(review.comment ?? "");
          setIsEditing(true);
        }
      } catch { /* ignore */ }
    })();
    return () => { active = false; };
  }, [professionalId, bookingId, projectId]);

  // Close on Escape (an explicit key — unlike an accidental outside-click, which is
  // intentionally NOT a dismiss here so a half-written review is never lost).
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (rating === 0) {
      setError(t("errRating"));
      return;
    }
    if (!comment.trim()) {
      setError(t("errComment"));
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ professionalId, rating, comment: comment.trim(), bookingId, projectId }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? t("errSubmit"));
        return;
      }
      setSuccess(true);
      setTimeout(() => {
        onSuccess?.();
        onClose();
      }, 1500);
    } catch {
      setError(t("errConnection"));
    } finally {
      setLoading(false);
    }
  }

  const displayRating = hovered || rating;

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 px-4"
    >
      <style>{`
        @keyframes modalIn {
          from { opacity: 0; transform: scale(0.94) translateY(8px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
      <div
        style={{ animation: "modalIn 0.22s cubic-bezier(0.16,1,0.3,1) both" }}
        className="relative w-full max-w-[420px] rounded-2xl bg-white shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-[#f3f4f6]">
          <div>
            <h2 className="text-lg font-bold text-[#111827]">{isEditing ? t("titleEdit") : t("titleNew")}</h2>
            <p className="text-sm text-[#6b7280] mt-0.5">{professionalName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-[#9ca3af] hover:bg-[#f3f4f6] hover:text-[#374151] transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {success ? (
          <div className="flex flex-col items-center gap-3 px-6 py-10">
            <SuccessIcon size={56} />
            <p className="text-lg font-semibold text-[#111827]">{t("thanks")}</p>
            {/* Filled stars so the user can see their submitted rating (half-capable). */}
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((star) => {
                const full = rating >= star;
                const half = !full && rating >= star - 0.5;
                return (
                  <span key={star} className="relative h-7 w-7">
                    <Star className="absolute inset-0 h-7 w-7 text-[#d1d5db] fill-[#d1d5db]" />
                    {(full || half) && (
                      <span className="absolute inset-0 overflow-hidden" style={{ width: full ? "100%" : "50%" }}>
                        <Star className="h-7 w-7 text-yellow-400 fill-yellow-400" />
                      </span>
                    )}
                  </span>
                );
              })}
            </div>
            <p className="text-sm text-[#6b7280] text-center">{t("thanksSub")}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="px-6 py-5 flex flex-col gap-5">
            {/* Star rating */}
            <div>
              <p className="text-sm font-medium text-[#374151] mb-3">{t("ratingLabel")}</p>
              {/* Half-star selection: the LEFT half of a star picks x.5, the RIGHT half
                  picks the whole star. Hover previews the same. */}
              <div className="flex items-center gap-3">
                <div className="flex gap-1.5" onMouseLeave={() => setHovered(0)}>
                  {[1, 2, 3, 4, 5].map((star) => {
                    const full = displayRating >= star;
                    const half = !full && displayRating >= star - 0.5;
                    return (
                      <div key={star} className="relative h-10 w-10">
                        <Star className="absolute inset-0 h-10 w-10 text-[#d1d5db] fill-[#d1d5db]" />
                        {(full || half) && (
                          <span className="absolute inset-0 overflow-hidden" style={{ width: full ? "100%" : "50%" }}>
                            <Star className="h-10 w-10 text-yellow-400 fill-yellow-400" />
                          </span>
                        )}
                        <button
                          type="button"
                          aria-label={t("halfStarAria", { value: star - 0.5 })}
                          onMouseEnter={() => setHovered(star - 0.5)}
                          onClick={() => setRating(star - 0.5)}
                          className="absolute inset-y-0 left-0 z-10 w-1/2 cursor-pointer focus:outline-none"
                        />
                        <button
                          type="button"
                          aria-label={t("starAria", { value: star })}
                          onMouseEnter={() => setHovered(star)}
                          onClick={() => setRating(star)}
                          className="absolute inset-y-0 right-0 z-10 w-1/2 cursor-pointer focus:outline-none"
                        />
                      </div>
                    );
                  })}
                </div>
                {displayRating > 0 && (
                  <span className="text-sm font-semibold tabular-nums text-[#374151]">{displayRating.toFixed(1)}</span>
                )}
              </div>
            </div>

            {/* Comment */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-sm font-medium text-[#374151]">{t("commentLabel")}</p>
                <span
                  className={`text-xs tabular-nums ${
                    comment.length > 300 ? "text-red-500" : "text-[#9ca3af]"
                  }`}
                >
                  {comment.length}/300
                </span>
              </div>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                maxLength={300}
                rows={4}
                placeholder={t("commentPlaceholder")}
                className="w-full resize-none rounded-xl border border-[#e5e7eb] bg-[#fafafa] px-3.5 py-3 text-sm text-[#111827] placeholder:text-[#9ca3af] focus:border-[#009FD9] focus:outline-none focus:ring-2 focus:ring-[#009FD9]/20 transition"
              />
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2.5 text-sm text-red-600">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-[#009FD9] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#0089bb] disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-[#009FD9]/40"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  {t("sending")}
                </span>
              ) : (
                isEditing ? t("submitUpdate") : t("submitNew")
              )}
            </button>
            {/* Reviewing is OPTIONAL — clear skip so the prompt never blocks. */}
            <button type="button" onClick={onClose} className="text-sm font-medium text-[#6b7280] hover:text-[#111827] transition-colors">
              {t("skip")}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

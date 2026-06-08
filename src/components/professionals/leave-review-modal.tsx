"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Star, X } from "lucide-react";

interface LeaveReviewModalProps {
  professionalId: string;
  professionalName: string;
  onClose: () => void;
  onSuccess?: () => void;
}

export function LeaveReviewModal({
  professionalId,
  professionalName,
  onClose,
  onSuccess,
}: LeaveReviewModalProps) {
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const backdropRef = useRef<HTMLDivElement>(null);

  // Prefill from an existing review so it can be EDITED (and the stars show filled).
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch(`/api/reviews?professionalId=${professionalId}`);
        const { review } = await res.json();
        if (active && review) {
          setRating(review.rating ?? 0);
          setComment(review.comment ?? "");
          setIsEditing(true);
        }
      } catch { /* ignore */ }
    })();
    return () => { active = false; };
  }, [professionalId]);

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  function handleBackdropClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === backdropRef.current) onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (rating === 0) {
      setError("Por favor selecciona una calificación.");
      return;
    }
    if (!comment.trim()) {
      setError("Por favor escribí un comentario.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ professionalId, rating, comment: comment.trim() }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Error al enviar la reseña.");
        return;
      }
      setSuccess(true);
      setTimeout(() => {
        onSuccess?.();
        onClose();
      }, 1500);
    } catch {
      setError("Error de conexión. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  const displayRating = hovered || rating;

  return (
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
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
            <h2 className="text-lg font-bold text-[#111827]">{isEditing ? "Editar tu reseña" : "Dejar una reseña"}</h2>
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
            <CheckCircle2 className="h-14 w-14 text-emerald-500" />
            <p className="text-lg font-semibold text-[#111827]">¡Gracias por tu reseña!</p>
            {/* Filled stars so the user can see their submitted rating. */}
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <Star key={star} className={`h-7 w-7 ${star <= rating ? "text-yellow-400 fill-yellow-400" : "text-[#d1d5db] fill-[#d1d5db]"}`} />
              ))}
            </div>
            <p className="text-sm text-[#6b7280] text-center">Tu opinión ayuda a otros clientes a elegir mejor.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="px-6 py-5 flex flex-col gap-5">
            {/* Star rating */}
            <div>
              <p className="text-sm font-medium text-[#374151] mb-3">Calificación</p>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRating(star)}
                    onMouseEnter={() => setHovered(star)}
                    onMouseLeave={() => setHovered(0)}
                    className="focus:outline-none transition-transform hover:scale-110"
                  >
                    <Star
                      className={`h-10 w-10 transition-colors ${
                        star <= displayRating
                          ? "text-yellow-400 fill-yellow-400"
                          : "text-[#d1d5db] fill-[#d1d5db]"
                      }`}
                    />
                  </button>
                ))}
              </div>
            </div>

            {/* Comment */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-sm font-medium text-[#374151]">Comentario</p>
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
                placeholder="Cuéntanos sobre tu experiencia con este profesional..."
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
                  Enviando...
                </span>
              ) : (
                isEditing ? "Actualizar reseña" : "Enviar reseña"
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

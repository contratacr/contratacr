"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Eye, EyeOff, Loader2, RotateCcw, Search, Star, Trash2 } from "lucide-react";
import { Link } from "@/i18n/navigation";

type AdminReview = {
  id: string;
  rating: number;
  comment: string;
  jobTitle: string | null;
  createdAt: string;
  editedAt: string | null;
  source: string;
  needsReview: boolean;
  moderationStatus: "published" | "hidden";
  moderationReason: string | null;
  moderatedAt: string | null;
  professional: { id: string | null; name: string; slug: string | null; profession: string | null };
  client: { id: string | null; name: string; email: string | null; avatarUrl: string | null };
};

type ReviewResponse = {
  reviews?: AdminReview[];
  counts?: { total: number; needsReview: number; profile: number; hidden: number };
  pagination?: { page: number; pageSize: number; total: number; pages: number };
};

function formatDate(value: string) {
  return new Date(value).toLocaleString("es-CR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function AdminReviews() {
  const [query, setQuery] = useState("");
  const [data, setData] = useState<ReviewResponse>({});
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<"all" | "published" | "hidden" | "alerts">("all");
  const [actingId, setActingId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    fetch(`/api/admin/reviews?${params.toString()}`)
      .then((res) => res.json())
      .then((json) => setData(json ?? {}))
      .finally(() => setLoading(false));
  }, [query]);

  useEffect(() => {
    const id = window.setTimeout(load, 180);
    return () => window.clearTimeout(id);
  }, [load]);

  const allReviews = data.reviews ?? [];
  const reviews = allReviews.filter((review) => {
    if (status === "alerts") return review.needsReview;
    if (status === "hidden") return review.moderationStatus === "hidden";
    if (status === "published") return review.moderationStatus === "published";
    return true;
  });
  const counts = data.counts ?? { total: 0, needsReview: 0, profile: 0, hidden: 0 };

  async function moderate(review: AdminReview, action: "hide" | "restore" | "delete") {
    const label = action === "hide" ? "ocultar" : action === "restore" ? "restaurar" : "eliminar permanentemente";
    const reason = window.prompt(`Motivo para ${label} esta reseña:`)?.trim();
    if (!reason) return;
    if (action === "delete" && !window.confirm("Esta eliminación es permanente. ¿Deseas continuar?")) return;

    setActingId(review.id);
    try {
      const response = await fetch("/api/admin/reviews", {
        method: action === "delete" ? "DELETE" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: review.id, action, reason }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "No se pudo moderar la reseña.");
      load();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "No se pudo moderar la reseña.");
    } finally {
      setActingId(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-[#d9e2ec] bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#64748b]">Moderación</p>
            <h1 className="mt-1 text-2xl font-bold text-[#0f172a]">Reseñas</h1>
            <p className="mt-1 text-sm text-[#64748b]">
              Revisa reseñas nuevas, reseñas directas del perfil y contenido que puede requerir atención.
            </p>
          </div>
          <div className="grid grid-cols-4 gap-2 text-center">
            <div className="rounded-xl bg-[#f1f5f9] px-4 py-3">
              <p className="text-xl font-bold text-[#0f172a]">{counts.total}</p>
              <p className="text-xs font-semibold text-[#64748b]">Total</p>
            </div>
            <div className="rounded-xl bg-[#eef9ff] px-4 py-3">
              <p className="text-xl font-bold text-[#009FD9]">{counts.profile}</p>
              <p className="text-xs font-semibold text-[#64748b]">Perfil</p>
            </div>
            <div className="rounded-xl bg-[#fff7ed] px-4 py-3">
              <p className="text-xl font-bold text-[#c2410c]">{counts.needsReview}</p>
              <p className="text-xs font-semibold text-[#64748b]">Alertas</p>
            </div>
            <div className="rounded-xl bg-[#fef2f2] px-4 py-3">
              <p className="text-xl font-bold text-[#b91c1c]">{counts.hidden}</p>
              <p className="text-xs font-semibold text-[#64748b]">Ocultas</p>
            </div>
          </div>
        </div>

        <label className="mt-5 flex h-11 items-center gap-2 rounded-xl border border-[#d9e2ec] bg-white px-3 text-sm text-[#64748b]">
          <Search className="h-4 w-4" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por cliente, profesional o comentario"
            className="h-full flex-1 bg-transparent text-[#0f172a] outline-none placeholder:text-[#94a3b8]"
          />
        </label>
        <div className="mt-3 flex flex-wrap gap-2" aria-label="Filtrar reseñas">
          {([
            ["all", "Todas"],
            ["published", "Publicadas"],
            ["alerts", "Alertas"],
            ["hidden", "Ocultas"],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setStatus(value)}
              className={`rounded-full border px-3 py-1.5 text-xs font-bold ${status === value ? "border-[#009FD9] bg-[#eef9ff] text-[#007cac]" : "border-[#d9e2ec] text-[#64748b] hover:bg-[#f8fafc]"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-[#d9e2ec] bg-white shadow-sm">
        {loading ? (
          <div className="flex justify-center py-14">
            <Loader2 className="h-7 w-7 animate-spin text-[#009FD9]" />
          </div>
        ) : reviews.length === 0 ? (
          <p className="py-12 text-center text-sm text-[#64748b]">No hay reseñas para mostrar.</p>
        ) : (
          <div className="divide-y divide-[#e5e7eb]">
            {reviews.map((review) => (
              <article key={review.id} className="p-5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#fff7ed] px-2.5 py-1 text-sm font-bold text-[#0f172a]">
                        <Star className="h-4 w-4 fill-[#ff9b32] text-[#ff9b32]" />
                        {Number(review.rating).toLocaleString("es-CR", { maximumFractionDigits: 1 })}
                      </span>
                      <span className="rounded-full bg-[#eef9ff] px-2.5 py-1 text-xs font-semibold text-[#0369a1]">{review.source}</span>
                      {review.needsReview && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#fee2e2] px-2.5 py-1 text-xs font-semibold text-[#b91c1c]">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          Revisar
                        </span>
                      )}
                      {review.moderationStatus === "hidden" && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#f1f5f9] px-2.5 py-1 text-xs font-semibold text-[#475569]">
                          <EyeOff className="h-3.5 w-3.5" /> Oculta
                        </span>
                      )}
                      {review.editedAt && <span className="text-xs text-[#94a3b8]">Editada</span>}
                    </div>
                    <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[#0f172a]">{review.comment}</p>
                    {review.jobTitle && <p className="mt-1 text-xs font-semibold text-[#64748b]">Contexto: {review.jobTitle}</p>}
                    {review.moderationReason && (
                      <p className="mt-2 text-xs text-[#64748b]">Último motivo de moderación: {review.moderationReason}</p>
                    )}
                  </div>
                  <p className="shrink-0 text-xs font-medium text-[#64748b]">{formatDate(review.createdAt)}</p>
                </div>

                <div className="mt-4 grid gap-3 text-sm md:grid-cols-2">
                  <div className="rounded-xl bg-[#f8fafc] p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#94a3b8]">Cliente</p>
                    <p className="mt-1 font-semibold text-[#0f172a]">{review.client.name}</p>
                    {review.client.email && <p className="text-xs text-[#64748b]">{review.client.email}</p>}
                  </div>
                  <div className="rounded-xl bg-[#f8fafc] p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#94a3b8]">Profesional</p>
                    {review.professional.slug ? (
                      <Link
                        href={`/profesionales/${review.professional.slug}?tab=resenas#resenas`}
                        className="mt-1 inline-flex font-semibold text-[#009FD9] hover:underline"
                      >
                        {review.professional.name}
                      </Link>
                    ) : (
                      <p className="mt-1 font-semibold text-[#0f172a]">{review.professional.name}</p>
                    )}
                    {review.professional.profession && <p className="text-xs text-[#64748b]">{review.professional.profession}</p>}
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-[#edf2f7] pt-3">
                  {review.moderationStatus === "hidden" ? (
                    <button type="button" disabled={actingId === review.id} onClick={() => void moderate(review, "restore")} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#b9dbea] px-3 text-sm font-bold text-[#007cac] hover:bg-[#eef9ff] disabled:opacity-50">
                      <RotateCcw className="h-4 w-4" /> Restaurar
                    </button>
                  ) : (
                    <button type="button" disabled={actingId === review.id} onClick={() => void moderate(review, "hide")} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#d9e2ec] px-3 text-sm font-bold text-[#334155] hover:bg-[#f8fafc] disabled:opacity-50">
                      <Eye className="h-4 w-4" /> Ocultar
                    </button>
                  )}
                  <button type="button" disabled={actingId === review.id} onClick={() => void moderate(review, "delete")} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#fecaca] px-3 text-sm font-bold text-[#b91c1c] hover:bg-[#fef2f2] disabled:opacity-50">
                    {actingId === review.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Eliminar
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

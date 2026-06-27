"use client";

import { useEffect, useState } from "react";
import { Check, X, Tag, Loader2, HeartPulse, Video } from "lucide-react";
import { ALL_CATEGORIES, classifySuggestedCategory, normalizeText } from "@/lib/data/categories";

type Suggestion = {
  id: string;
  label: string;
  suggested_name?: string | null;
  status: string;
  created_at: string;
};

const STATUSES = [
  { id: "pending", label: "Pendientes" },
  { id: "approved", label: "Aprobadas" },
  { id: "rejected", label: "Rechazadas" },
] as const;

// Lightweight duplicate guard: warn the admin if an existing catalog category looks
// like the suggestion (so they don't create "niñera" when "Cuidado infantil / Niñera"
// already exists). Compares the normalized name against fixed labels + keywords.
function findSimilarCategory(name: string): string | null {
  const q = normalizeText(name.trim());
  if (q.length < 3) return null;
  for (const c of ALL_CATEGORIES) {
    const lbl = normalizeText(c.label);
    if (lbl === q) return c.label;
    if (q.length >= 4 && (lbl.includes(q) || (lbl.length >= 4 && q.includes(lbl)))) return c.label;
    if (
      c.keywords.some((k) => {
        const nk = normalizeText(k);
        return nk === q || (q.length >= 4 && nk.length >= 4 && (nk.includes(q) || q.includes(nk)));
      })
    ) {
      return c.label;
    }
  }
  return null;
}

export function AdminCategories() {
  const [status, setStatus] = useState<"pending" | "approved" | "rejected">("pending");
  const [items, setItems] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  // id -> edited display text (admin can clean up wording before approving).
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  function load(s: string) {
    fetch(`/api/admin/categories?status=${s}`)
      .then((r) => r.json())
      .then(({ categories }) => setItems(categories ?? []))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(status); }, [status]);

  const nameOf = (i: Suggestion) => edits[i.id] ?? (i.suggested_name || i.label);

  async function decide(i: Suggestion, next: "approved" | "rejected") {
    let label: string | undefined;
    if (next === "approved") {
      label = nameOf(i).trim();
      if (!label) { window.alert("Escribe un nombre para la categoría antes de aprobar."); return; }
      const similar = findSimilarCategory(label);
      if (similar && !window.confirm(`Ya existe una categoría parecida: "${similar}".\n\n¿Agregar "${label}" de todos modos?`)) return;
    }
    setBusy(i.id);
    try {
      await fetch("/api/admin/categories", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: i.id, status: next, label }),
      });
      setItems((prev) => prev.filter((x) => x.id !== i.id));
      // Nudge AdminShell to re-poll the pending-count badges right away.
      window.dispatchEvent(new Event("focus"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <Tag className="h-5 w-5 text-[#009FD9]" />
        <h1 className="text-xl font-bold text-[#111827]">Categorías sugeridas</h1>
      </div>
      <p className="text-sm text-[#6b7280] mb-5">
        Sugerencias enviadas por usuarios con &ldquo;¿No ves tu categoría?&rdquo;. Al{" "}
        <span className="font-medium text-[#15803d]">Aprobar</span>, la categoría se agrega al catálogo automáticamente
        y queda seleccionable y buscable en toda la app. Puedes corregir el texto antes de aprobar.
      </p>

      <div className="flex items-center gap-2 mb-4">
        {STATUSES.map((s) => (
          <button
            key={s.id}
            onClick={() => {
              if (s.id === status) return;
              setLoading(true);
              setStatus(s.id);
            }}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${status === s.id ? "bg-[#009FD9] text-white border-[#009FD9]" : "bg-white text-[#374151] border-[#e5e7eb] hover:border-[#009FD9]"}`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-7 w-7 animate-spin text-[#009FD9]" /></div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 text-[#9ca3af]">
          <Tag className="h-10 w-10 mx-auto mb-2 text-[#cbd5e1]" />
          <p className="text-sm">No hay sugerencias {status === "pending" ? "pendientes" : status === "approved" ? "aprobadas" : "rechazadas"}.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((i) => (
            <div key={i.id} className="flex items-center gap-3 bg-white rounded-xl border border-[#e5e7eb] px-4 py-3">
              <div className="flex-1 min-w-0">
                {status === "pending" ? (
                  <input
                    value={nameOf(i)}
                    onChange={(e) => setEdits((p) => ({ ...p, [i.id]: e.target.value }))}
                    aria-label="Nombre de la categoría"
                    className="-ml-2 w-full rounded-lg border border-transparent bg-transparent px-2 py-1 text-sm font-semibold text-[#111827] hover:border-[#e5e7eb] focus:border-[#009FD9] focus:outline-none focus:ring-2 focus:ring-[#009FD9]/20"
                  />
                ) : (
                  <p className="text-sm font-semibold text-[#111827]">{i.suggested_name || i.label}</p>
                )}
                <div className="mt-1 flex flex-wrap items-center gap-1.5 px-0.5">
                  <p className="text-xs text-[#9ca3af]">Sugerida el {new Date(i.created_at).toLocaleDateString("es-CR")}</p>
                  {status === "pending" && (() => {
                    const review = classifySuggestedCategory(nameOf(i));
                    return (
                      <>
                        {review.healthLikely && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-[#ECFDF3] px-2 py-0.5 text-[11px] font-semibold text-[#15803d]">
                            <HeartPulse className="h-3 w-3" /> Revisar salud
                          </span>
                        )}
                        {review.videoConsultLikely && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-[#EBF5FB] px-2 py-0.5 text-[11px] font-semibold text-[#0077a3]">
                            <Video className="h-3 w-3" /> Revisar videoconsulta
                          </span>
                        )}
                      </>
                    );
                  })()}
                </div>
              </div>
              {status === "pending" && (
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => decide(i, "approved")}
                    disabled={busy === i.id}
                    className="inline-flex items-center gap-1 rounded-lg bg-[#16a34a] text-white text-sm font-medium px-3 py-1.5 hover:bg-[#15803d] disabled:opacity-50"
                  >
                    {busy === i.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Aprobar
                  </button>
                  <button
                    onClick={() => decide(i, "rejected")}
                    disabled={busy === i.id}
                    className="inline-flex items-center gap-1 rounded-lg bg-white border border-[#e5e7eb] text-[#374151] text-sm font-medium px-3 py-1.5 hover:bg-gray-50 disabled:opacity-50"
                  >
                    <X className="h-4 w-4" /> Rechazar
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Check, X, Tag, Loader2 } from "lucide-react";

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

export function AdminCategories() {
  const [status, setStatus] = useState<"pending" | "approved" | "rejected">("pending");
  const [items, setItems] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);

  function load(s: string) {
    setLoading(true);
    fetch(`/api/admin/categories?status=${s}`)
      .then((r) => r.json())
      .then(({ categories }) => setItems(categories ?? []))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(status); }, [status]);

  async function decide(id: string, next: "approved" | "rejected") {
    await fetch("/api/admin/categories", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: next }),
    });
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        {STATUSES.map((s) => (
          <button
            key={s.id}
            onClick={() => setStatus(s.id)}
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
                <p className="text-sm font-semibold text-[#111827]">{i.suggested_name || i.label}</p>
                <p className="text-xs text-[#9ca3af]">Sugerida el {new Date(i.created_at).toLocaleDateString("es-CR")}</p>
              </div>
              {status === "pending" && (
                <div className="flex items-center gap-2">
                  <button onClick={() => decide(i.id, "approved")} className="inline-flex items-center gap-1 rounded-lg bg-[#16a34a] text-white text-sm font-medium px-3 py-1.5 hover:bg-[#15803d]">
                    <Check className="h-4 w-4" /> Aprobar
                  </button>
                  <button onClick={() => decide(i.id, "rejected")} className="inline-flex items-center gap-1 rounded-lg bg-white border border-[#e5e7eb] text-[#374151] text-sm font-medium px-3 py-1.5 hover:bg-gray-50">
                    <X className="h-4 w-4" /> Rechazar
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <p className="text-xs text-[#9ca3af] mt-4">Al aprobar, agrega la categoría a la lista oficial (lib/data/categories.ts) para que sea seleccionable y filtrable.</p>
    </div>
  );
}

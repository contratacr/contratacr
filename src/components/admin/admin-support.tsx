"use client";

import { useEffect, useState } from "react";
import { Check, RotateCcw, LifeBuoy, Mail } from "lucide-react";

type Ticket = {
  id: string;
  name?: string | null;
  email: string;
  subject: string;
  message: string;
  status: string;
  created_at: string;
};

const STATUSES = [
  { id: "open", label: "Abiertos" },
  { id: "closed", label: "Cerrados" },
] as const;

export function AdminSupport() {
  const [status, setStatus] = useState<"open" | "closed">("open");
  const [items, setItems] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);

  function load(s: string) {
    setLoading(true);
    fetch(`/api/admin/support?status=${s}`)
      .then((r) => r.json())
      .then(({ tickets }) => setItems(tickets ?? []))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(status); }, [status]);

  async function setTicketStatus(id: string, next: "open" | "closed") {
    await fetch("/api/admin/support", {
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
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${status === s.id ? "bg-[#0f172a] text-white" : "bg-white text-[#374151] border border-[#e5e7eb] hover:bg-gray-50"}`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="h-7 w-7 animate-spin rounded-full border-2 border-[#0f172a] border-t-transparent" /></div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 text-[#9ca3af]">
          <LifeBuoy className="h-10 w-10 mx-auto mb-2 text-[#cbd5e1]" />
          <p className="text-sm">No hay tickets {status === "open" ? "abiertos" : "cerrados"}.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((t) => (
            <div key={t.id} className="bg-white rounded-xl border border-[#e5e7eb] p-4">
              <div className="flex items-start justify-between gap-3 mb-1.5">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[#111827]">{t.subject}</p>
                  <p className="text-xs text-[#9ca3af] truncate">{t.name || "Sin nombre"} · {t.email} · {new Date(t.created_at).toLocaleDateString("es-CR")}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <a
                    href={`mailto:${t.email}?subject=${encodeURIComponent("Re: " + t.subject)}`}
                    className="inline-flex items-center gap-1 rounded-lg bg-white border border-[#e5e7eb] text-[#374151] text-sm font-medium px-3 py-1.5 hover:bg-gray-50"
                  >
                    <Mail className="h-4 w-4" /> Responder
                  </a>
                  {status === "open" ? (
                    <button onClick={() => setTicketStatus(t.id, "closed")} className="inline-flex items-center gap-1 rounded-lg bg-[#16a34a] text-white text-sm font-medium px-3 py-1.5 hover:bg-[#15803d]">
                      <Check className="h-4 w-4" /> Resolver
                    </button>
                  ) : (
                    <button onClick={() => setTicketStatus(t.id, "open")} className="inline-flex items-center gap-1 rounded-lg bg-white border border-[#e5e7eb] text-[#374151] text-sm font-medium px-3 py-1.5 hover:bg-gray-50">
                      <RotateCcw className="h-4 w-4" /> Reabrir
                    </button>
                  )}
                </div>
              </div>
              <p className="text-sm text-[#374151] leading-relaxed whitespace-pre-wrap">{t.message}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { FileText, ChevronRight } from "lucide-react";
import { formatColones } from "@/lib/pricing";
import { isQuoteExpired, type Quote } from "@/lib/quotes";
import { QuoteEditorModal } from "@/components/quotes/quote-editor-modal";
import { QuoteDetailModal } from "@/components/quotes/quote-detail-modal";

/**
 * Lo que ve cada parte dentro de una cita o un proyecto: la última cotización
 * con su estado y, para el profesional, el botón de enviar una.
 */
export function QuoteBlock({ bookingId, projectId, role, canCreate = false, defaultTitle, professionalName }: {
  bookingId?: string | null; projectId?: string | null; role: "client" | "pro"; canCreate?: boolean; defaultTitle?: string; professionalName?: string | null;
}) {
  const t = useTranslations("quotes");
  const [quotes, setQuotes] = useState<Quote[] | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [editor, setEditor] = useState(false);
  const [detail, setDetail] = useState<Quote | null>(null);
  const key = bookingId ? `bookingId=${bookingId}` : projectId ? `projectId=${projectId}` : "";

  useEffect(() => {
    if (!key) return;
    let activo = true;
    void fetch(`/api/quotes?${key}`).then((r) => r.json()).then((d) => {
      if (!activo) return;
      if (d.unavailable) setUnavailable(true);
      setQuotes(Array.isArray(d.quotes) ? d.quotes : []);
    }).catch(() => { if (activo) setQuotes([]); });
    return () => { activo = false; };
  }, [key]);

  if (!key || unavailable || quotes === null) return null;
  const ultima = quotes[0] ?? null;
  const conNombre = ultima ? { ...ultima, professional_name: ultima.professional_name ?? professionalName ?? null } : null;
  const abierta = !!ultima && ultima.status === "sent" && !isQuoteExpired(ultima);
  const estado = (q: Quote) => isQuoteExpired(q) ? t("statusExpired") : q.status === "sent" ? t("statusSent") : q.status === "accepted" ? t("statusAccepted") : q.status === "declined" ? t("statusDeclined") : t("statusWithdrawn");
  // Al cliente no se le muestra nada si nunca le cotizaron.
  if (!ultima && role === "client") return null;
  if (!ultima && !canCreate) return null;

  return (
    <div className="flex flex-col gap-2">
      {conNombre && (
        <button type="button" onClick={() => setDetail(conNombre)} className="flex w-full items-center gap-3 rounded-2xl border border-[#e5eaf0] bg-white px-3.5 py-3 text-left transition-colors hover:border-[#bfe3f5] hover:bg-[#f8fcfe]">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#eaf7fc] text-[#009FD9]"><FileText className="h-5 w-5" /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-extrabold text-[#162543]">{t("blockTitle")} · {formatColones(conNombre.total)}</span>
            <span className={`block text-[12px] font-semibold ${conNombre.status === "accepted" ? "text-[#0089bb]" : "text-[#68778d]"}`}>{estado(conNombre)}</span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-[#9aa8ba]" />
        </button>
      )}
      {role === "pro" && canCreate && !abierta && (
        <button type="button" onClick={() => setEditor(true)} className="inline-flex h-11 w-full items-center justify-center rounded-full border-[1.5px] border-[#009FD9] bg-white px-4 text-[13px] font-bold text-[#009FD9] transition-colors hover:bg-[#EBF5FB]">
          {ultima ? t("sendAnother") : t("send")}
        </button>
      )}
      {editor && (
        <QuoteEditorModal open onClose={() => setEditor(false)} bookingId={bookingId} projectId={projectId} defaultTitle={defaultTitle}
          onSent={(q) => { setQuotes((prev) => [q, ...(prev ?? [])]); setEditor(false); }} />
      )}
      {detail && (
        <QuoteDetailModal quote={detail} role={role} open onClose={() => setDetail(null)}
          onChanged={(q) => { setQuotes((prev) => (prev ?? []).map((x) => (x.id === q.id ? { ...x, ...q } : x))); setDetail(null); }} />
      )}
    </div>
  );
}

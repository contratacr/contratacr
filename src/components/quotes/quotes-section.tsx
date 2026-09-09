"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Check, ChevronRight, Clock3, Plus, ReceiptText, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatColones } from "@/lib/pricing";
import { isQuoteExpired, type Quote } from "@/lib/quotes";
import { QuoteEditorModal } from "@/components/quotes/quote-editor-modal";
import { QuoteDetailModal } from "@/components/quotes/quote-detail-modal";

const DATE_LOCALE: Record<string, string> = { es: "es-CR", en: "en-US" };

/**
 * La sección "Cotizaciones" del profesional: la lista de lo que ha cotizado y
 * el botón para hacer una nueva. Creada, se abre lista para mandar.
 */
export function QuotesSection({ proName, puedeCrear = true }: { proName: string; puedeCrear?: boolean }) {
  const t = useTranslations("quotes");
  const locale = useLocale();
  const [quotes, setQuotes] = useState<Quote[] | null>(null);
  const [editor, setEditor] = useState(false);
  const [detalle, setDetalle] = useState<{ quote: Quote; recien: boolean } | null>(null);

  useEffect(() => {
    let vivo = true;
    void fetch("/api/quotes").then((r) => r.json()).then((d) => {
      if (!vivo) return;
      const filas = Array.isArray(d.quotes) ? d.quotes : [];
      // Un renglón mal formado (items que no es lista) no puede romper la sección.
      setQuotes(filas.map((q: Quote) => ({ ...q, items: Array.isArray(q.items) ? q.items : [] })));
    }).catch(() => { if (vivo) setQuotes([]); });
    return () => { vivo = false; };
  }, []);

  const estadoDe = (q: Quote) => isQuoteExpired(q) ? "expired" : q.status;
  const etiqueta = (q: Quote) => {
    const e = estadoDe(q);
    return e === "expired" ? t("statusExpired") : e === "sent" ? t("statusOpen") : e === "accepted" ? t("statusAccepted") : e === "declined" ? t("statusDeclined") : t("statusWithdrawn");
  };
  // Cada estado con su color y su ícono: se lee de un vistazo cuál está viva.
  const marca = (q: Quote) => {
    const e = estadoDe(q);
    if (e === "accepted") return { fondo: "bg-[#e9f9ef] text-[#166534]", icono: <Check className="h-3.5 w-3.5" strokeWidth={3} /> };
    if (e === "sent") return { fondo: "bg-[#fff4e2] text-[#b45309]", icono: <Clock3 className="h-3.5 w-3.5" /> };
    return { fondo: "bg-[#f3f4f6] text-[#6b7280]", icono: <X className="h-3.5 w-3.5" /> };
  };
  const lista = quotes ?? [];

  return (
    <div className="flex flex-col gap-4">
      {/* Solo el botón: la lista se explica sola. */}
      {puedeCrear && (quotes?.length ?? 0) > 0 && (
        <div className="flex sm:justify-end">
          <Button type="button" onClick={() => setEditor(true)} className="w-full sm:w-auto"><Plus className="h-4 w-4" />{t("new")}</Button>
        </div>
      )}

      {quotes === null ? (
        <div className="flex flex-col gap-2">{[0, 1, 2].map((i) => <div key={i} className="h-[76px] animate-pulse rounded-2xl bg-[#eef2f6]" />)}</div>
      ) : quotes.length === 0 ? (
        <div className="rounded-3xl border border-[#e5eaf0] bg-white px-6 py-10 text-center shadow-sm">
          <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-[#eaf7fc] to-[#d8eefb] text-[#0b5f80]"><ReceiptText className="h-8 w-8" /></span>
          <h3 className="mt-4 text-[20px] font-extrabold text-[#162543]">{t("emptyTitle")}</h3>
          <p className="mx-auto mt-2 max-w-md text-[14px] leading-6 text-[#52627a]">{t("emptyBody")}</p>
          {puedeCrear && <Button type="button" onClick={() => setEditor(true)} className="mt-5"><Plus className="h-4 w-4" />{t("emptyCta")}</Button>}
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            {lista.map((q) => {
              const m = marca(q);
              return (
                <button key={q.id} type="button" onClick={() => setDetalle({ quote: q, recien: false })} className="group flex w-full items-center gap-3.5 rounded-2xl border border-[#e5eaf0] bg-white px-4 py-3.5 text-left transition-colors hover:border-[#bfe3f5] hover:bg-[#f8fcfe]">
                  <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${m.fondo}`}>{m.icono}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-extrabold text-[#162543]">{q.client_name || q.title || t("noClientName")}</span>
                    {q.client_name && q.title && <span className="block truncate text-[13px] text-[#52627a]">{q.title}</span>}
                    <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${m.fondo}`}>{etiqueta(q)}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block whitespace-nowrap text-[17px] font-extrabold text-[#162543]">{formatColones(q.total)}</span>
                    <span className="mt-0.5 block whitespace-nowrap text-[12px] text-[#68778d]">{new Date(q.created_at).toLocaleDateString(DATE_LOCALE[locale] ?? "es-CR", { day: "numeric", month: "short" })}</span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-[#9aa8ba] transition-transform group-hover:translate-x-0.5" />
                </button>
              );
            })}
            {lista.length === 0 && <p className="rounded-2xl border border-dashed border-[#dbe4ee] py-8 text-center text-[14px] text-[#68778d]">{t("emptyFilter")}</p>}
          </div>
        </>
      )}

      {editor && (
        <QuoteEditorModal open onClose={() => setEditor(false)} onSent={(q) => { setQuotes((prev) => [q, ...(prev ?? [])]); setEditor(false); setDetalle({ quote: q, recien: true }); }} />
      )}
      {detalle && (
        <QuoteDetailModal quote={detalle.quote} role="pro" open proName={proName} recienCreada={detalle.recien} onClose={() => setDetalle(null)}
          onChanged={(q) => { setQuotes((prev) => (prev ?? []).map((x) => (x.id === q.id ? { ...x, ...q } : x))); setDetalle(null); }} />
      )}
    </div>
  );
}

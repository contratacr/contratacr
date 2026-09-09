"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ChevronRight, Plus, ReceiptText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatColones } from "@/lib/pricing";
import { isQuoteExpired, type Quote } from "@/lib/quotes";
import { QuoteEditorModal } from "@/components/quotes/quote-editor-modal";
import { QuoteDetailModal } from "@/components/quotes/quote-detail-modal";

const DATE_LOCALE: Record<string, string> = { es: "es-CR", en: "en-US" };
type Filtro = "all" | "open" | "accepted" | "closed";

/**
 * La sección "Cotizaciones" del profesional: la lista de lo que ha cotizado y
 * el botón para hacer una nueva. Creada, se abre lista para mandar.
 */
export function QuotesSection({ proName }: { proName: string }) {
  const t = useTranslations("quotes");
  const locale = useLocale();
  const [quotes, setQuotes] = useState<Quote[] | null>(null);
  const [filtro, setFiltro] = useState<Filtro>("all");
  const [editor, setEditor] = useState(false);
  const [detalle, setDetalle] = useState<{ quote: Quote; recien: boolean } | null>(null);

  useEffect(() => {
    let vivo = true;
    void fetch("/api/quotes").then((r) => r.json()).then((d) => { if (vivo) setQuotes(Array.isArray(d.quotes) ? d.quotes : []); }).catch(() => { if (vivo) setQuotes([]); });
    return () => { vivo = false; };
  }, []);

  const estadoDe = (q: Quote) => isQuoteExpired(q) ? "expired" : q.status;
  const etiqueta = (q: Quote) => {
    const e = estadoDe(q);
    return e === "expired" ? t("statusExpired") : e === "sent" ? t("statusOpen") : e === "accepted" ? t("statusAccepted") : e === "declined" ? t("statusDeclined") : t("statusWithdrawn");
  };
  const tono = (q: Quote) => {
    const e = estadoDe(q);
    return e === "accepted" ? "bg-[#eaf7fc] text-[#0089bb]" : e === "sent" ? "bg-[#fff4e2] text-[#b45309]" : "bg-[#f3f4f6] text-[#6b7280]";
  };
  const lista = (quotes ?? []).filter((q) => {
    const e = estadoDe(q);
    return filtro === "all" || (filtro === "open" && e === "sent") || (filtro === "accepted" && e === "accepted") || (filtro === "closed" && (e === "declined" || e === "withdrawn" || e === "expired"));
  });
  const chip = (valor: Filtro, texto: string) => (
    <button type="button" onClick={() => setFiltro(valor)} className={`h-9 shrink-0 rounded-full border px-3.5 text-[13px] font-bold transition-colors ${filtro === valor ? "border-[#009FD9] bg-[#eaf7fc] text-[#0089bb]" : "border-[#d7e1ea] bg-white text-[#162543] hover:bg-[#f6f9fb]"}`}>{texto}</button>
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Cabecera: qué es esto y el botón, siempre a la vista. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[14px] leading-6 text-[#52627a]">{t("sectionIntro")}</p>
        {(quotes?.length ?? 0) > 0 && (
          <Button type="button" onClick={() => setEditor(true)} className="shrink-0"><Plus className="h-4 w-4" />{t("new")}</Button>
        )}
      </div>

      {quotes === null ? (
        <div className="flex flex-col gap-2">{[0, 1, 2].map((i) => <div key={i} className="h-[76px] animate-pulse rounded-2xl bg-[#eef2f6]" />)}</div>
      ) : quotes.length === 0 ? (
        <div className="rounded-3xl border border-[#e5eaf0] bg-white px-6 py-10 text-center shadow-sm">
          <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-[#eaf7fc] to-[#d8eefb] text-[#0b5f80]"><ReceiptText className="h-8 w-8" /></span>
          <h3 className="mt-4 text-[20px] font-extrabold text-[#162543]">{t("emptyTitle")}</h3>
          <p className="mx-auto mt-2 max-w-md text-[14px] leading-6 text-[#52627a]">{t("emptyBody")}</p>
          <Button type="button" onClick={() => setEditor(true)} className="mt-5"><Plus className="h-4 w-4" />{t("emptyCta")}</Button>
        </div>
      ) : (
        <>
          <div className="scrollbar-none flex gap-2 overflow-x-auto">{chip("all", t("filterAll"))}{chip("open", t("filterOpen"))}{chip("accepted", t("filterAccepted"))}{chip("closed", t("filterClosed"))}</div>
          <div className="flex flex-col gap-2">
            {lista.map((q) => (
              <button key={q.id} type="button" onClick={() => setDetalle({ quote: q, recien: false })} className="flex w-full items-center gap-3.5 rounded-2xl border border-[#e5eaf0] bg-white px-4 py-3.5 text-left transition-colors hover:border-[#bfe3f5] hover:bg-[#f8fcfe]">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-extrabold text-[#162543]">{q.client_name || q.title || t("noClientName")}</span>
                  <span className="mt-0.5 block truncate text-[13px] text-[#52627a]">{q.client_name && q.title ? q.title : t("createdOn", { date: new Date(q.created_at).toLocaleDateString(DATE_LOCALE[locale] ?? "es-CR", { day: "numeric", month: "short" }) })}</span>
                  <span className={`mt-1.5 inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${tono(q)}`}>{etiqueta(q)}</span>
                </span>
                <span className="shrink-0 text-right text-[16px] font-extrabold text-[#162543]">{formatColones(q.total)}</span>
                <ChevronRight className="h-4 w-4 shrink-0 text-[#9aa8ba]" />
              </button>
            ))}
            {lista.length === 0 && <p className="py-6 text-center text-[14px] text-[#68778d]">—</p>}
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

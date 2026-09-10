"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CalendarCheck, ChevronRight, Clock3, Handshake, Plus, ReceiptText, X } from "lucide-react";
import { BrandIconBadge } from "@/components/ui/brand-icon-badge";
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
export function QuotesSection({ proName, proSlug, puedeCrear = true }: { proName: string; proSlug?: string | null; puedeCrear?: boolean }) {
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

  // "Esperando respuesta" solo tiene sentido donde alguien PUEDE responder: en
  // una cita o un proyecto del app. Una cotización suelta es un documento que se
  // mandó por WhatsApp; ahí no hay respuesta que esperar y el rótulo prometía
  // algo que nunca iba a pasar.
  const enElApp = (q: Quote) => !!(q.booking_id || q.project_id);
  const estadoDe = (q: Quote) => {
    if (isQuoteExpired(q)) return "expired";
    if (q.status === "withdrawn") return "withdrawn";
    return enElApp(q) ? "enviada" : "documento";
  };
  // Solo lo que cambia qué se puede hacer con ella: vencida o retirada. Que esté
  // dentro de una cita o de un proyecto se ve al abrirla, y como etiqueta se
  // leía como un estado más.
  const etiqueta = (q: Quote) => {
    const e = estadoDe(q);
    if (e === "expired") return t("statusExpired");
    if (e === "withdrawn") return t("statusWithdrawn");
    return null;
  };
  // Cada estado con su color y su ícono: se lee de un vistazo cuál está viva.
  const marca = (q: Quote) => {
    const e = estadoDe(q);
    // Ni palomita ni nada que suene a "aceptada": el ícono dice dónde vive la
    // cotización —en una cita o en un proyecto—, que es lo único cierto.
    // La caja es la misma de la marca en todas: lo que cambia es el icono, que
    // dice dónde vive la cotización. Un gris plano hacía ver la lista apagada.
    const caja = "bg-[linear-gradient(135deg,#eaf6fc_0%,#cbe8f6_55%,#f0f8fd_100%)] text-[#162543]";
    const apagada = "bg-[linear-gradient(135deg,#f4f6f9_0%,#e3e8ee_55%,#f7f9fb_100%)] text-[#68778d]";
    if (e === "enviada") return { fondo: caja, pastilla: "bg-[#eaf7fc] text-[#0089bb]", icono: q.booking_id ? <CalendarCheck className="h-[18px] w-[18px]" strokeWidth={1.6} /> : <Handshake className="h-[18px] w-[18px]" strokeWidth={1.6} /> };
    if (e === "documento") return { fondo: caja, pastilla: "bg-[#eef3f8] text-[#52627a]", icono: <ReceiptText className="h-[18px] w-[18px]" strokeWidth={1.6} /> };
    return { fondo: apagada, pastilla: "bg-[#f3f4f6] text-[#6b7280]", icono: <X className="h-4 w-4" strokeWidth={1.8} /> };
  };
  const lista = (quotes ?? []).filter((q) => !q.deleted_at);

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
          <BrandIconBadge icon={ReceiptText} size={64} className="mx-auto" />
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
                  <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-[14px] shadow-[0_10px_22px_-16px_rgba(15,23,42,0.55)] ${m.fondo}`}>{m.icono}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-extrabold text-[#162543]">{q.client_name || q.title || t("noClientName")}</span>
                    {q.client_name && q.title && <span className="block truncate text-[13px] text-[#52627a]">{q.title}</span>}
                    {etiqueta(q) && <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${m.pastilla}`}>{etiqueta(q)}</span>}
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
        <QuoteDetailModal quote={detalle.quote} role="pro" open proName={proName} proSlug={proSlug} recienCreada={detalle.recien} onClose={() => setDetalle(null)}
          onChanged={(q) => { setQuotes((prev) => (prev ?? []).filter((x) => !(x.id === q.id && q.deleted_at)).map((x) => (x.id === q.id ? { ...x, ...q } : x))); setDetalle(null); }} />
      )}
    </div>
  );
}

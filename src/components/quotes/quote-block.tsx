"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { FileText, ChevronRight } from "lucide-react";
import { formatColones } from "@/lib/pricing";
import { isQuoteExpired, numeroCotizacion, type Quote } from "@/lib/quotes";
import { actualizarCotizacion, agregarCotizacion, cargarCotizaciones, useCotizaciones } from "@/lib/quotes-store";
import { QuoteEditorModal } from "@/components/quotes/quote-editor-modal";
import { QuoteDetailModal } from "@/components/quotes/quote-detail-modal";

/**
 * Lo que ve cada parte dentro de una cita o un proyecto: la última cotización
 * con su estado y, para el profesional, el botón de enviar una.
 */
const DATE_LOCALE: Record<string, string> = { es: "es-CR", en: "en-US" };

export function QuoteBlock({ bookingId, projectId, role, canCreate = false, defaultTitle, professionalName, asButton = false }: {
  bookingId?: string | null; projectId?: string | null; role: "client" | "pro"; canCreate?: boolean; defaultTitle?: string; professionalName?: string | null;
  /** Solo el botón, con la forma de los demás botones de la tarjeta: va en la fila de acciones. */
  asButton?: boolean;
}) {
  const t = useTranslations("quotes");
  const locale = useLocale();
  const [editor, setEditor] = useState(false);
  const [detail, setDetail] = useState<Quote | null>(null);
  const key = bookingId ?? projectId ?? "";

  // Todas las cotizaciones se piden una sola vez para la pantalla entera; cada
  // bloque saca las suyas de ahí. Antes cada tarjeta hacía su propia consulta y
  // se veía cargar al abrirla.
  const { quotes: todas, unavailable } = useCotizaciones();
  useEffect(() => { cargarCotizaciones(); }, []);
  const quotes = useMemo(() => {
    if (todas === null) return null;
    return todas.filter((q) => (bookingId ? q.booking_id === bookingId : projectId ? q.project_id === projectId : false));
  }, [todas, bookingId, projectId]);

  if (!key || unavailable) return null;
  if (quotes === null) {
    // La primera vez, el profesional que puede cotizar ve su botón de una: es
    // lo que hay en la enorme mayoría de las citas, y evita el pulso de carga.
    if (!canCreate || role !== "pro") return null;
    return asButton ? (
      <button type="button" onClick={() => setEditor(true)} className="inline-flex h-11 w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-[#d7e1ea] bg-white px-4 text-[13px] font-bold text-[#162543] transition-colors hover:border-[#b9c8d6] hover:bg-[#f6f9fb]">
        <FileText className="h-4 w-4 shrink-0 text-[#009FD9]" />{t("rowSend")}
      </button>
    ) : (
      <button type="button" onClick={() => setEditor(true)} className="inline-flex h-11 w-full items-center justify-center rounded-full border border-[#d7e1ea] bg-white px-4 text-[13px] font-bold text-[#162543] transition-colors hover:border-[#b9c8d6] hover:bg-[#f6f9fb]">
        {t("send")}
      </button>
    );
  }
  const ultima = quotes[0] ?? null;
  const conNombre = ultima ? { ...ultima, professional_name: ultima.professional_name ?? professionalName ?? null } : null;
  const abierta = !!ultima && ultima.status === "sent" && !isQuoteExpired(ultima);
  const estado = (q: Quote) => isQuoteExpired(q)
    ? t("statusExpired")
    : q.status === "withdrawn"
      ? t("statusWithdrawn")
      : t("sentOn", { date: new Date(q.created_at).toLocaleDateString(DATE_LOCALE[locale] ?? "es-CR", { day: "numeric", month: "long" }) });
  // Al cliente no se le muestra nada si nunca le cotizaron.
  if (!ultima && role === "client") return null;
  if (!ultima && !canCreate) return null;

  const modales = (
    <>
      {editor && (
        <QuoteEditorModal open onClose={() => setEditor(false)} bookingId={bookingId} projectId={projectId} defaultTitle={defaultTitle}
          onSent={(q) => { agregarCotizacion(q); setEditor(false); }} />
      )}
      {detail && (
        <QuoteDetailModal quote={detail} role={role} open onClose={() => setDetail(null)}
          onChanged={(q) => { actualizarCotizacion(q); setDetail(null); }} />
      )}
    </>
  );

  // En la fila de acciones: un solo botón. Sin cotización, "Enviar cotización";
  // con una, su monto y estado, y al tocarlo se abre.
  if (asButton && role === "pro") {
    const clase = "inline-flex h-11 w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-[#d7e1ea] bg-white px-4 text-[13px] font-bold text-[#162543] transition-colors hover:border-[#b9c8d6] hover:bg-[#f6f9fb]";
    // Con cotización enviada, esto ya no es un botón más: es el dato de que
    // existe, con su número y su monto, y "Ver" para abrirla.
    return (
      <>
        {conNombre ? (
          <button type="button" onClick={() => setDetail(conNombre)} className="flex w-full items-center gap-3 rounded-2xl border border-[#e5eaf0] bg-[#f8fbfd] px-3.5 py-2.5 text-left transition-colors hover:border-[#bfe3f5] hover:bg-[#f2f9fd]">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-[#009FD9]"><FileText className="h-4 w-4" /></span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-extrabold text-[#162543]">
                {conNombre.quote_number ? `${t("rowQuote")} N.º ${numeroCotizacion(conNombre)}` : t("rowQuote")} · {formatColones(conNombre.total)}
              </span>
              <span className="block truncate text-[12px] text-[#68778d]">{estado(conNombre)}</span>
            </span>
            <span className="shrink-0 text-[13px] font-bold text-[#0089bb]">{t("view")}</span>
          </button>
        ) : canCreate ? (
          <button type="button" onClick={() => setEditor(true)} className={clase}>
            <FileText className="h-4 w-4 shrink-0 text-[#009FD9]" />{t("rowSend")}
          </button>
        ) : null}
        {modales}
      </>
    );
  }

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
        <button type="button" onClick={() => setEditor(true)} className="inline-flex h-11 w-full items-center justify-center rounded-full border border-[#d7e1ea] bg-white px-4 text-[13px] font-bold text-[#162543] transition-colors hover:border-[#b9c8d6] hover:bg-[#f6f9fb]">
          {ultima ? t("sendAnother") : t("send")}
        </button>
      )}
      {modales}
    </div>
  );
}

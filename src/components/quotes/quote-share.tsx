"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Check, Download, Loader2, Share2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNativeShare } from "@/hooks/use-native-share";
import { nombreArchivoCotizacion, numeroCotizacion, type Quote } from "@/lib/quotes";
import { enlacePerfil } from "@/lib/profile-url";
import { renderQuotePdf } from "@/lib/quote-image";
import { compartirConHojaNativa } from "@/lib/compartir-nativo";

const DATE_LOCALE: Record<string, string> = { es: "es-CR", en: "en-US" };

/**
 * Mandar una cotización es mandar el DOCUMENTO: el PDF, no un enlace.
 *
 * - Teléfono: «Compartir» abre la hoja del sistema con el PDF adjunto; ahí
 *   están los contactos de WhatsApp, el correo y «Guardar en Archivos».
 * - Computadora: no hay hoja del sistema, así que «Descargar PDF», que es lo
 *   que se adjunta en WhatsApp Web o en un correo.
 *
 * Antes había seis caminos —WhatsApp, Instagram, Facebook, correo, PDF y el
 * enlace— para una sola acción. Instagram y Facebook no reciben un PDF, y el
 * enlace de WhatsApp mandaba texto en vez del documento.
 */
export function useCompartirCotizacion({ quote, proName, proSlug, activo = true }: { quote: Quote; proName: string; proSlug?: string | null; activo?: boolean }) {
  const t = useTranslations("quotes");
  const locale = useLocale();
  const nativo = useNativeShare();
  const [pdf, setPdf] = useState<Blob | null>(null);
  const fecha = quote.valid_until ? new Date(`${quote.valid_until}T12:00:00`).toLocaleDateString(DATE_LOCALE[locale] ?? "es-CR", { day: "numeric", month: "long" }) : null;

  useEffect(() => {
    if (!activo) return;
    let vivo = true;
    void renderQuotePdf(quote, proName, {
      titulo: quote.quote_number ? t("imageTitleNumbered", { number: numeroCotizacion(quote) }) : t("imageTitle"),
      cliente: t("clientLabel"), vigente: fecha ? t("imageValidUntil", { date: fecha }) : "",
      subtotal: t("subtotal"), iva: t("tax"), total: t("total"),
      totalNota: quote.tax_mode === "incluido" ? t("totalWithTax") : quote.tax_mode === "mas_iva" ? t("totalPlusTax") : t("totalNoTax"),
      pie: t("imageFooter"), deQuien: t("publicFrom"), nota: t("noteLabel"),
    }, fecha, proSlug ? enlacePerfil(proSlug) : "").then((b) => { if (vivo) setPdf(b); });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activo, quote.id, quote.status, quote.booking_id, quote.project_id]);

  function descargar() {
    if (!pdf) return;
    const a = document.createElement("a"); a.href = URL.createObjectURL(pdf); a.download = `${nombreArchivoCotizacion(quote, proName)}.pdf`; a.click();
    window.setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  async function compartir() {
    if (!pdf) return;
    if (!nativo) { descargar(); return; }
    const file = new File([pdf], `${nombreArchivoCotizacion(quote, proName)}.pdf`, { type: "application/pdf" });
    // SOLO el archivo: al mandar archivo + texto juntos, iOS a veces suelta el
    // PDF y comparte el mensaje convertido en un .txt. Cerrar la hoja sin
    // elegir nada no descarga nada: fue una decisión, no una falla.
    if (await compartirConHojaNativa({ files: [file] }) !== "no-disponible") return;
    descargar();
  }

  return {
    preparando: activo && pdf === null,
    accion: () => void compartir(),
    etiqueta: nativo ? t("share") : t("downloadPdf"),
    Icono: nativo ? Share2 : Download,
  };
}

/** El botón de mandar la cotización, para el pie de la ventana. */
export function BotonCompartirCotizacion({ quote, proName, proSlug, className }: { quote: Quote; proName: string; proSlug?: string | null; className?: string }) {
  const { preparando, accion, etiqueta, Icono } = useCompartirCotizacion({ quote, proName, proSlug });
  return (
    <Button type="button" className={className} disabled={preparando} onClick={accion}>
      {preparando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icono className="h-4 w-4" />}
      {etiqueta}
    </Button>
  );
}

/**
 * Lo que queda en el cuerpo: si la cotización ya está pegada a una cita o a un
 * proyecto, lo dice y deja retirarla.
 */
export function QuoteShare({ quote, onChanged }: { quote: Quote; proName?: string; proSlug?: string | null; onChanged?: (q: Quote) => void }) {
  const t = useTranslations("quotes");
  const enviadaA = quote.booking_id ? t("attachedBooking") : quote.project_id ? t("attachedProject") : null;
  if (!enviadaA) return null;
  return (
    <div className="flex items-start gap-2 rounded-2xl bg-[#e9f9ef] px-4 py-3">
      <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#166534]" strokeWidth={3} />
      <p className="min-w-0 flex-1 text-[13px] font-bold leading-snug text-[#166534]">{enviadaA}</p>
      {quote.status === "sent" && <QuoteDetach quote={quote} onChanged={onChanged} />}
    </div>
  );
}

function QuoteDetach({ quote, onChanged }: { quote: Quote; onChanged?: (q: Quote) => void }) {
  const t = useTranslations("quotes");
  const [quitando, setQuitando] = useState(false);
  async function quitar() {
    setQuitando(true);
    try {
      const res = await fetch("/api/quotes", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: quote.id, action: "detach" }) });
      const d = await res.json().catch(() => ({}));
      if (res.ok) onChanged?.(d.quote as Quote);
    } finally { setQuitando(false); }
  }
  return (
    <button type="button" onClick={() => void quitar()} disabled={quitando} aria-label={t("detach")} title={t("detach")} className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[#166534] transition-colors hover:bg-[#d6f2e0] disabled:opacity-50">
      {quitando ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
    </button>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Download, FileText, Share2 } from "lucide-react";
import { ShareLinkPanel } from "@/components/ui/share-link-panel";
import { useNativeShare } from "@/hooks/use-native-share";
import { formatColones } from "@/lib/pricing";
import { enlaceCotizacion, nombreArchivoCotizacion, numeroCotizacion, whatsappDigits, type Quote } from "@/lib/quotes";
import { renderQuotePdf } from "@/lib/quote-image";

const DATE_LOCALE: Record<string, string> = { es: "es-CR", en: "en-US" };

/**
 * Cómo se manda la cotización: el enlace a la vista, WhatsApp (directo al
 * número si lo hay) y la imagen para el chat. Lo usan la pantalla de "lista
 * para enviar" y el detalle de cada cotización del profesional.
 */
export function QuoteShare({ quote, proName }: { quote: Quote; proName: string }) {
  const t = useTranslations("quotes");
  const locale = useLocale();
  const nativo = useNativeShare();
  const [pdf, setPdf] = useState<Blob | null>(null);
  const preparando = pdf === null;
  const url = enlaceCotizacion(quote.public_code);
  const mensaje = t("whatsappMessage", {
    name: quote.client_name ? ` ${quote.client_name.split(" ")[0]}` : "",
    title: quote.title ? ` de ${quote.title}` : "",
    total: formatColones(quote.total),
    url,
  });
  const digitos = whatsappDigits(quote.client_phone);
  const wa = `https://wa.me/${digitos}?text=${encodeURIComponent(mensaje)}`;
  const fecha = quote.valid_until ? new Date(`${quote.valid_until}T12:00:00`).toLocaleDateString(DATE_LOCALE[locale] ?? "es-CR", { day: "numeric", month: "long" }) : null;

  // La imagen se prepara al abrir, para que el botón responda al toque.
  useEffect(() => {
    let vivo = true;
    void renderQuotePdf(quote, proName, {
      titulo: quote.quote_number ? t("imageTitleNumbered", { number: numeroCotizacion(quote) }) : t("imageTitle"), cliente: t("clientLabel"), vigente: fecha ? t("imageValidUntil", { date: fecha }) : "",
      subtotal: t("subtotal"), iva: t("tax"), total: t("total"), ivai: t("ivaIncluded"), pie: t("imageFooter"), deQuien: t("publicFrom"),
    }, fecha).then((b) => { if (vivo) setPdf(b); });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quote.id, quote.status]);

  async function compartirPdf() {
    if (!pdf) return;
    const file = new File([pdf], `${nombreArchivoCotizacion(quote, proName)}.pdf`, { type: "application/pdf" });
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    if (nav.share && nav.canShare?.({ files: [file] })) {
      try { await nav.share({ files: [file], title: quote.title ?? t("detailTitle"), text: mensaje }); return; } catch { /* cancelado */ }
    }
    descargarPdf();
  }
  function descargarPdf() {
    if (!pdf) return;
    const a = document.createElement("a"); a.href = URL.createObjectURL(pdf); a.download = `${nombreArchivoCotizacion(quote, proName)}.pdf`; a.click();
    window.setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  return (
    <div className="flex flex-col gap-3">
      <ShareLinkPanel url={url} label={t("linkLabel")} copyLabel={t("copyLink")} copiedLabel={t("copied")} />
      <a href={wa} target="_blank" rel="noopener noreferrer" className="inline-flex h-11 w-full items-center justify-center rounded-full bg-[#25d366] px-5 text-[14px] font-bold text-white transition-colors hover:bg-[#1da851]">
        {t("sendWhatsApp")}
      </a>
      <button type="button" disabled={!pdf} onClick={() => void (nativo ? compartirPdf() : descargarPdf())} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full border border-[#d7e1ea] bg-white px-5 text-[14px] font-bold text-[#162543] transition-colors hover:border-[#b9c8d6] hover:bg-[#f6f9fb] disabled:opacity-60">
        {preparando ? <FileText className="h-4 w-4" /> : nativo ? <Share2 className="h-4 w-4" /> : <Download className="h-4 w-4" />}
        {preparando ? t("preparingPdf") : nativo ? t("sharePdf") : t("downloadPdf")}
      </button>
    </div>
  );
}

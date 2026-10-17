"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Check, Download, Loader2, Share2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNativeShare } from "@/hooks/use-native-share";
import { nombreArchivoCotizacion, numeroCotizacion, type Quote } from "@/lib/quotes";
import { enlacePerfil } from "@/lib/profile-url";
import { renderQuotePdf } from "@/lib/quote-image";
import { saveFile } from "@/lib/file-download";
import { useNativeApp } from "@/hooks/use-native-app";

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
function useCompartirCotizacion({ quote, proName, proSlug, activo = true }: { quote: Quote; proName: string; proSlug?: string | null; activo?: boolean }) {
  const t = useTranslations("quotes");
  const locale = useLocale();
  const hojaWeb = useNativeShare();
  const app = useNativeApp();
  const nativo = app || hojaWeb;
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const generationKey = JSON.stringify([quote, proName, proSlug, locale]);
  const [prepared, setPrepared] = useState<{ key: string; blob: Blob | null; failed: boolean } | null>(null);
  const current = prepared?.key === generationKey ? prepared : null;
  const pdf = current?.blob ?? null;
  const fecha = quote.valid_until ? new Date(`${quote.valid_until}T12:00:00`).toLocaleDateString(DATE_LOCALE[locale] ?? "es-CR", { day: "numeric", month: "long" }) : null;

  useEffect(() => {
    if (!activo) return;
    let vivo = true;
    void renderQuotePdf(quote, proName, {
      titulo: quote.quote_number ? t("imageTitleNumbered", { number: numeroCotizacion(quote) }) : t("imageTitle"),
      cliente: t("clientLabel"), vigente: fecha ? t("imageValidUntil", { date: fecha }) : "",
      subtotal: t("subtotal"), iva: t("tax"), total: t("total"),
      totalNota: quote.tax_mode === "exento" ? t("totalNoTax") : "",
      pie: t("imageFooter"), deQuien: t("publicFrom"), nota: t("noteLabel"),
    }, fecha, proSlug ? enlacePerfil(proSlug) : "").then((blob) => { if (vivo) setPrepared({ key: generationKey, blob, failed: !blob }); }).catch(() => { if (vivo) setPrepared({ key: generationKey, blob: null, failed: true }); });
    return () => { vivo = false; };
  }, [activo, quote, proName, proSlug, fecha, t, generationKey]);

  async function guardar(compartir = false) {
    if (!pdf || saving) return;
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const result = await saveFile(pdf, `${nombreArchivoCotizacion(quote, quote.professional_name || proName)}.pdf`, compartir);
      setSaved(result === "saved");
    } catch (failure) {
      if (failure instanceof Error && /cancel|dismiss/i.test(failure.message)) return;
      setError(failure instanceof Error && failure.message === "native-update-required" ? t("pdfUpdateRequired") : t("pdfError"));
    } finally { setSaving(false); }
  }

  return {
    preparando: activo && current === null,
    error: current?.failed ? t("pdfError") : error, saving, saved, listo: pdf !== null,
    /** Hay hoja del sistema (teléfono). En computadora no existe. */
    nativo,
    compartir: () => void guardar(true),
    descargar: () => void guardar(),
  };
}

/**
 * Lo que se puede hacer con una cotización terminada, para el pie de la ventana.
 *
 * EN COMPUTADORA, SOLO DESCARGAR. No existe la hoja del sistema, así que un
 * botón «Compartir» ahí solo podría descargar: diría una cosa y haría otra.
 *
 * EN EL TELÉFONO, LAS DOS. «Compartir» es a lo que uno viene —mandársela al
 * cliente por WhatsApp sin salir de la app— y por eso va de principal. Pero
 * guardarla también hace falta y no lo cubre la hoja: adjuntarla más tarde a un
 * correo, archivarla con el resto de los papeles del trabajo, o simplemente
 * tenerla cuando la hoja del sistema no ofrece la app que se busca. Antes solo
 * estaba «Compartir» y, si uno cerraba la hoja sin elegir nada, se quedaba sin
 * el archivo y sin manera de pedirlo.
 */
export function BotonCompartirCotizacion({ quote, proName, proSlug, className }: { quote: Quote; proName: string; proSlug?: string | null; className?: string }) {
  const t = useTranslations("quotes");
  const { preparando, nativo, compartir, descargar, error, saving, saved, listo } = useCompartirCotizacion({ quote, proName, proSlug });
  return (
    <>
      {saved && <p role="status" className="basis-full text-sm text-[#166534]">{t("pdfSaved")}</p>}
      {error && <p role="alert" className="basis-full text-sm text-red-600">{error}</p>}
      {/* En el teléfono el pie se apila al revés, así que «Descargar» escrito
          antes queda DEBAJO de «Compartir»: primero la acción principal. */}
      {nativo && (
        <Button type="button" variant="outline" className={className} disabled={preparando || saving || !listo} onClick={descargar}>
          {preparando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          {t("downloadPdf")}
        </Button>
      )}
      <Button type="button" className={className} disabled={preparando || saving || !listo} onClick={nativo ? compartir : descargar}>
        {preparando ? <Loader2 className="h-4 w-4 animate-spin" /> : nativo ? <Share2 className="h-4 w-4" /> : <Download className="h-4 w-4" />}
        {nativo ? t("share") : t("downloadPdf")}
      </Button>
    </>
  );
}

/** Received quotes use exactly the same generation and native saving path. */
export function BotonDescargarCotizacion({ quote, proName, className }: { quote: Quote; proName: string; className?: string }) {
  const t = useTranslations("quotes");
  const { preparando, descargar, error, saving, saved, listo } = useCompartirCotizacion({ quote, proName });
  return <>
    {saved && <p role="status" className="basis-full text-sm text-[#166534]">{t("pdfSaved")}</p>}
    {error && <p role="alert" className="basis-full text-sm text-red-600">{error}</p>}
    <Button type="button" className={className} disabled={preparando || saving || !listo} onClick={descargar}>
      {preparando || saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}{t("downloadClient")}
    </Button>
  </>;
}

/**
 * Lo que queda en el cuerpo: si la cotización ya está pegada a una cita o a un
 * proyecto, lo dice y deja retirarla.
 */
export function QuoteShare({ quote, onChanged }: { quote: Quote; proName?: string; proSlug?: string | null; onChanged?: (q: Quote) => void }) {
  const t = useTranslations("quotes");
  const enviadaA = quote.project_id ? t("attachedProject") : null;
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

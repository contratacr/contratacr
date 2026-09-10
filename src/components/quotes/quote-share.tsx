"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ArrowLeft, CalendarCheck, Check, ChevronRight, Copy, Download, Handshake, Loader2, Mail, Share2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FacebookIcon, InstagramIcon, WhatsAppIcon } from "@/components/ui/share-channels";
import { useNativeShare } from "@/hooks/use-native-share";
import { formatColones } from "@/lib/pricing";
import { enlaceCotizacion, nombreArchivoCotizacion, numeroCotizacion, whatsappDigits, type Quote } from "@/lib/quotes";
import { enlacePerfil } from "@/lib/profile-url";
import { renderQuotePdf } from "@/lib/quote-image";

const DATE_LOCALE: Record<string, string> = { es: "es-CR", en: "en-US" };
const TILE = "flex flex-col items-center gap-2 rounded-2xl border border-[#e5eaf0] bg-white px-2 py-3.5 text-center transition-colors hover:border-[#bfe3f5] hover:bg-[#f8fcfe]";

/**
 * Cómo se manda una cotización: igual que "Compartir mi perfil" —enlace a la
 * vista, WhatsApp, Instagram, Facebook, correo, el PDF— y además a una cita o
 * un proyecto del app, que es donde el cliente la acepta.
 */
export function QuoteShare({ quote, proName, proSlug, onChanged }: { quote: Quote; proName: string; proSlug?: string | null; onChanged?: (q: Quote) => void }) {
  const t = useTranslations("quotes");
  const locale = useLocale();
  const nativo = useNativeShare();
  const [pdf, setPdf] = useState<Blob | null>(null);
  const [avisoInstagram, setAvisoInstagram] = useState(false);
  const [copiado, setCopiado] = useState(false);
  async function copiarEnlace() {
    try { await navigator.clipboard.writeText(url); setCopiado(true); window.setTimeout(() => setCopiado(false), 1800); } catch { /* sin portapapeles */ }
  }
  const preparando = pdf === null;
  const url = enlaceCotizacion(quote, proName);
  const mensaje = t("whatsappMessage", {
    name: quote.client_name ? ` ${quote.client_name.split(" ")[0]}` : "",
    title: quote.title ? ` de ${quote.title}` : "",
    total: formatColones(quote.total),
    url,
  });
  const digitos = whatsappDigits(quote.client_phone);
  const wa = `https://wa.me/${digitos}?text=${encodeURIComponent(mensaje)}`;
  const fb = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
  const correo = `mailto:${quote.client_email ?? ""}?subject=${encodeURIComponent(t("emailSubject", { number: numeroCotizacion(quote), name: proName }))}&body=${encodeURIComponent(mensaje)}`;
  const fecha = quote.valid_until ? new Date(`${quote.valid_until}T12:00:00`).toLocaleDateString(DATE_LOCALE[locale] ?? "es-CR", { day: "numeric", month: "long" }) : null;

  useEffect(() => {
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
  }, [quote.id, quote.status, quote.booking_id, quote.project_id]);

  async function compartirPdf() {
    if (!pdf) return;
    const file = new File([pdf], `${nombreArchivoCotizacion(quote, proName)}.pdf`, { type: "application/pdf" });
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    // SOLO el archivo: al mandar archivo + texto juntos, iOS a veces suelta el
    // PDF y comparte el mensaje convertido en un .txt (el "text 6" que salía).
    if (nav.share && nav.canShare?.({ files: [file] })) {
      try { await nav.share({ files: [file] }); return; } catch { /* cancelado */ }
    }
    descargarPdf();
  }
  function descargarPdf() {
    if (!pdf) return;
    const a = document.createElement("a"); a.href = URL.createObjectURL(pdf); a.download = `${nombreArchivoCotizacion(quote, proName)}.pdf`; a.click();
    window.setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  // Instagram no recibe enlaces desde el navegador: se copia y se abre.
  async function instagram() {
    try { await navigator.clipboard.writeText(url); } catch { /* sin portapapeles */ }
    setAvisoInstagram(true);
    window.open("https://www.instagram.com/", "_blank", "noopener,noreferrer");
  }

  const enviadaA = quote.booking_id ? t("attachedBooking") : quote.project_id ? t("attachedProject") : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-2.5">
        <a href={wa} target="_blank" rel="noopener noreferrer" className={TILE}>
          <span className="grid h-11 w-11 place-items-center rounded-full bg-[#25d366] text-white"><WhatsAppIcon className="h-5 w-5" /></span>
          <span className="text-[13px] font-bold text-[#162543]">WhatsApp</span>
        </a>
        <button type="button" onClick={() => void instagram()} className={TILE}>
          <span className="grid h-11 w-11 place-items-center rounded-full bg-gradient-to-br from-[#f9ce34] via-[#ee2a7b] to-[#6228d7] text-white"><InstagramIcon className="h-5 w-5" /></span>
          <span className="text-[13px] font-bold text-[#162543]">Instagram</span>
        </button>
        <a href={fb} target="_blank" rel="noopener noreferrer" className={TILE}>
          <span className="grid h-11 w-11 place-items-center rounded-full bg-[#1877f2] text-white"><FacebookIcon className="h-5 w-5" /></span>
          <span className="text-[13px] font-bold text-[#162543]">Facebook</span>
        </a>
      </div>
      {avisoInstagram && <p className="rounded-2xl bg-[#eaf7fc] px-4 py-2.5 text-[13px] font-semibold leading-snug text-[#0b5f80]">{t("instagramHint")}</p>}
      <div className="grid grid-cols-3 gap-2.5">
        <a href={correo} className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-[#d7e1ea] bg-white px-4 text-[13px] font-bold text-[#162543] transition-colors hover:border-[#b9c8d6] hover:bg-[#f6f9fb]">
          {/* "Correo" a secas: "Enviar por correo" se partía en tres renglones
              dentro de la píldora, y el ícono ya dice qué es. */}
          <Mail className="h-4 w-4" />{t("email")}
        </a>
        <button type="button" disabled={!pdf} onClick={() => void (nativo ? compartirPdf() : descargarPdf())} className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-[#d7e1ea] bg-white px-4 text-[13px] font-bold text-[#162543] transition-colors hover:border-[#b9c8d6] hover:bg-[#f6f9fb] disabled:opacity-60">
          {preparando ? <Loader2 className="h-4 w-4 animate-spin" /> : nativo ? <Share2 className="h-4 w-4" /> : <Download className="h-4 w-4" />}
          {/* Dice lo que hace, no el formato: en la web baja el archivo; en la
              app abre la hoja del sistema con el PDF adjunto (ahí "guardar" es
              una de sus opciones), igual que "Más opciones" en el perfil. */}
          {nativo ? t("moreOptions") : t("downloadPdf")}
        </button>
        <button type="button" onClick={() => void copiarEnlace()} className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-[#d7e1ea] bg-white px-3 text-[13px] font-bold text-[#162543] transition-colors hover:border-[#b9c8d6] hover:bg-[#f6f9fb]">
          {copiado ? <Check className="h-4 w-4 text-[#15803d]" /> : <Copy className="h-4 w-4" />}
          {copiado ? t("copied") : t("copyLink")}
        </button>
      </div>

      {/* Al app: pegada a una cita o a un proyecto, el cliente la ve y la acepta
          desde su panel. Es la forma de contacto del app; lo demás es repartirla. */}
      {enviadaA ? (
        <div className="flex items-start gap-2 rounded-2xl bg-[#e9f9ef] px-4 py-3">
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#166534]" strokeWidth={3} />
          <p className="min-w-0 flex-1 text-[13px] font-bold leading-snug text-[#166534]">{enviadaA}</p>
          {quote.status === "sent" && <QuoteDetach quote={quote} onChanged={onChanged} />}
        </div>
      ) : quote.status === "sent" ? (
        <QuoteAttach quote={quote} onChanged={onChanged} />
      ) : null}
    </div>
  );
}

type Cita = { id: string; client_name?: string | null; service_description?: string | null; scheduled_date?: string | null; scheduled_time?: string | null; status: string };
type Propuesta = { id: string; project_id: string; status: string; projects?: { title?: string | null; description?: string | null } | null };
type Destino = { clave: string; titulo: string; detalle: string; envio: { bookingId?: string; projectId?: string } };

/**
 * Enviar la cotización a un trabajo del app. Es una ventana propia: primero se
 * elige entre citas y proyectos, y al tocar uno se ve a cuál va antes de
 * confirmar. Antes era una lista pegada dentro de la pantalla de compartir y se
 * mandaba de un toque, sin poder revisar ni volver.
 */
function QuoteAttach({ quote, onChanged }: { quote: Quote; onChanged?: (q: Quote) => void }) {
  const t = useTranslations("quotes");
  const locale = useLocale();
  const [abierto, setAbierto] = useState(false);
  const [pestana, setPestana] = useState<"citas" | "proyectos">("citas");
  const [citas, setCitas] = useState<Cita[] | null>(null);
  const [propuestas, setPropuestas] = useState<Propuesta[] | null>(null);
  const [elegido, setElegido] = useState<Destino | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!abierto || citas !== null) return;
    let vivo = true;
    void Promise.all([
      fetch("/api/bookings?role=professional", { cache: "no-store" }).then((r) => r.json()).catch(() => ({})),
      fetch("/api/proposals?mine=true", { cache: "no-store" }).then((r) => r.json()).catch(() => ({})),
    ]).then(([b, p]) => {
      if (!vivo) return;
      const listaCitas: Cita[] = (Array.isArray(b?.bookings) ? b.bookings : Array.isArray(b) ? b : []) as Cita[];
      const listaProps: Propuesta[] = (Array.isArray(p?.proposals) ? p.proposals : Array.isArray(p) ? p : []) as Propuesta[];
      setCitas(listaCitas.filter((c) => ["pending", "confirmed", "in_progress", "awaiting_confirmation"].includes(c.status)));
      setPropuestas(listaProps.filter((x) => x.status === "pending" || x.status === "accepted"));
    });
    return () => { vivo = false; };
  }, [abierto, citas]);

  function cerrar() { setAbierto(false); setElegido(null); setError(null); }

  async function confirmar() {
    if (!elegido) return;
    setEnviando(true); setError(null);
    try {
      const res = await fetch("/api/quotes", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: quote.id, action: "attach", ...elegido.envio }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setError(d.error ?? t("errorTitle")); return; }
      onChanged?.(d.quote as Quote);
      cerrar();
    } catch { setError(t("errorTitle")); } finally { setEnviando(false); }
  }

  const fecha = (iso?: string | null) => iso ? new Date(`${iso}T12:00:00`).toLocaleDateString(DATE_LOCALE[locale] ?? "es-CR", { day: "numeric", month: "long" }) : "";
  const destinosCitas: Destino[] = (citas ?? []).map((c) => ({
    clave: `b-${c.id}`,
    titulo: c.client_name || c.service_description || t("noClientName"),
    detalle: [fecha(c.scheduled_date), c.service_description ?? ""].filter(Boolean).join(" · "),
    envio: { bookingId: c.id },
  }));
  const destinosProyectos: Destino[] = (propuestas ?? []).map((p) => ({
    clave: `p-${p.id}`,
    titulo: p.projects?.title || t("attachProjects"),
    detalle: (p.projects?.description ?? "").slice(0, 90),
    envio: { projectId: p.project_id },
  }));
  const lista = pestana === "citas" ? destinosCitas : destinosProyectos;
  const cargando = citas === null;

  if (!abierto) {
    return (
      <button type="button" onClick={() => setAbierto(true)} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-[#162543] px-5 text-[14px] font-bold text-white transition-colors hover:bg-[#1d3557]">
        <CalendarCheck className="h-4 w-4" />{t("attachTitle")}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-[#e5eaf0] bg-white p-3.5">
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => (elegido ? setElegido(null) : cerrar())} aria-label={t("back")} className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[#162543] transition-colors hover:bg-[#f1f5f9]">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0">
          <p className="truncate text-[15px] font-extrabold text-[#162543]">{elegido ? t("attachConfirmTitle") : t("attachTitle")}</p>
          {!elegido && <p className="truncate text-[12px] text-[#68778d]">{t("attachSubtitle")}</p>}
        </div>
      </div>
      {(() => (
          elegido ? (
            // Confirmar: se ve a qué trabajo va antes de mandarla.
            <div className="flex flex-col gap-4">
              <div className="rounded-2xl border border-[#e5eaf0] bg-white p-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#68778d]">{pestana === "citas" ? t("attachTabBookings") : t("attachTabProjects")}</p>
                <p className="mt-1 text-[17px] font-extrabold leading-snug text-[#162543]">{elegido.titulo}</p>
                {elegido.detalle && <p className="mt-1 text-[14px] leading-snug text-[#52627a]">{elegido.detalle}</p>}
              </div>
              <div className="rounded-2xl bg-[#f4f7fa] p-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#68778d]">{t("rowQuote")}</p>
                <p className="mt-1 flex items-baseline justify-between gap-3 text-[15px] font-extrabold text-[#162543]">
                  <span className="min-w-0 truncate">{quote.title || t("detailTitle")}</span>
                  <span className="shrink-0">{formatColones(quote.total)}</span>
                </p>
              </div>
              <p className="text-[13px] leading-6 text-[#52627a]">{t("attachConfirmBody")}</p>
              {error && <p className="text-[13px] font-semibold text-red-600">{error}</p>}
              <div className="flex gap-2">
                <Button type="button" variant="secondary" className="flex-1" onClick={() => setElegido(null)} disabled={enviando}>{t("back")}</Button>
                <Button type="button" className="flex-1" onClick={() => void confirmar()} loading={enviando} disabled={enviando}>{t("attachSend")}</Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-1 rounded-full bg-[#eef3f8] p-1">
                {([["citas", t("attachTabBookings"), destinosCitas.length], ["proyectos", t("attachTabProjects"), destinosProyectos.length]] as const).map(([id, rotulo, cuantos]) => (
                  <button key={id} type="button" onClick={() => setPestana(id)} className={`h-10 rounded-full text-[14px] font-bold transition-colors ${pestana === id ? "bg-white text-[#0089bb] shadow-sm" : "text-[#52627a]"}`}>
                    {rotulo}{cuantos > 0 ? ` (${cuantos})` : ""}
                  </button>
                ))}
              </div>
              {cargando ? (
                <div className="flex flex-col gap-2">{[0, 1, 2].map((i) => <div key={i} className="h-[72px] animate-pulse rounded-2xl bg-[#eef2f6]" />)}</div>
              ) : lista.length === 0 ? (
                <p className="rounded-2xl bg-[#f8fafc] px-4 py-8 text-center text-[14px] leading-6 text-[#68778d]">{t("attachEmpty")}</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {lista.map((d) => (
                    <button key={d.clave} type="button" onClick={() => setElegido(d)} className="flex w-full items-center gap-3.5 rounded-2xl border border-[#e5eaf0] bg-white px-4 py-3.5 text-left transition-colors hover:border-[#bfe3f5] hover:bg-[#f8fcfe]">
                      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#eaf7fc] text-[#009FD9]">
                        {pestana === "citas" ? <CalendarCheck className="h-5 w-5" /> : <Handshake className="h-5 w-5" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-extrabold text-[#162543]">{d.titulo}</span>
                        {d.detalle && <span className="block truncate text-[13px] text-[#52627a]">{d.detalle}</span>}
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-[#9aa8ba]" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
      ))()}
    </div>
  );
}

/** Quitar la cotización de la cita o el proyecto: vuelve a ser un documento suelto. */
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

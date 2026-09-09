"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Printer } from "lucide-react";
import { VerifiedSeal } from "@/components/ui/verified-seal";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatColones } from "@/lib/pricing";
import { getInitials } from "@/lib/utils";
import { cldThumb } from "@/lib/cloudinary";
import { isQuoteExpired, type Quote } from "@/lib/quotes";
import { Totales } from "@/components/quotes/quote-detail-modal";

export type PublicQuoteData = {
  quote: Quote;
  pro: { name: string; avatarUrl: string | null; verified: boolean; whatsapp: string; profileUrl: string | null; oficio: string };
};

const DATE_LOCALE: Record<string, string> = { es: "es-CR", en: "en-US" };

/**
 * Lo que ve el cliente al abrir el enlace: quién cotiza, qué incluye, cuánto
 * es, y un botón para aceptar. Nada que descargar ni cuenta que crear. Es
 * también la puerta por la que ese cliente entra a ContrataCR.
 */
export function PublicQuote({ locale, data }: { locale: string; data: PublicQuoteData | null }) {
  const t = useTranslations("quotes");
  if (!data) {
    return (
      <Marco>
        <div className="rounded-3xl border border-[#e5eaf0] bg-white px-6 py-12 text-center shadow-sm">
          <h1 className="text-[22px] font-extrabold text-[#162543]">{t("publicNotFound")}</h1>
          <p className="mt-2 text-[15px] leading-6 text-[#52627a]">{t("publicNotFoundBody")}</p>
        </div>
      </Marco>
    );
  }
  const { quote, pro } = data;
  const vencida = isQuoteExpired(quote);
  const fecha = quote.valid_until ? new Date(`${quote.valid_until}T12:00:00`).toLocaleDateString(DATE_LOCALE[locale] ?? "es-CR", { day: "numeric", month: "long" }) : null;
  const wa = pro.whatsapp ? `https://wa.me/${pro.whatsapp}` : null;
  const oficio = pro.oficio;

  return (
    <Marco>
      {vencida && (
        <div className="print:hidden mb-4 rounded-3xl border border-[#e5eaf0] bg-white px-6 py-5 text-center">
          <h2 className="text-[18px] font-extrabold text-[#162543]">{t("publicExpiredTitle")}</h2>
          <p className="mt-1 text-[14px] leading-6 text-[#52627a]">{t("publicExpiredBody", { name: pro.name })}</p>
        </div>
      )}

      <article className="overflow-hidden rounded-3xl border border-[#e5eaf0] bg-white shadow-sm print:border-0 print:shadow-none">
        {/* Quién cotiza. */}
        <div className="flex items-center gap-4 border-b border-[#eef2f6] px-6 py-5">
          <Avatar className="h-16 w-16 shrink-0">
            <AvatarImage src={pro.avatarUrl ? cldThumb(pro.avatarUrl, 160) : undefined} alt={pro.name} className="object-cover" />
            <AvatarFallback className="bg-[#EBF5FB] text-lg font-bold text-[#009FD9]">{getInitials(pro.name)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#68778d]">{t("publicFrom")}</p>
            <p className="mt-0.5 flex items-center gap-1.5 text-[19px] font-extrabold leading-tight text-[#162543]">
              <span className="min-w-0 truncate">{pro.name}</span>
              {pro.verified && <VerifiedSeal className="h-4 w-4 shrink-0 text-[#009FD9]" label={t("publicIdentityVerified")} />}
            </p>
            {oficio && <p className="mt-0.5 text-[13px] text-[#52627a]">{oficio}</p>}
          </div>
        </div>

        <div className="px-6 py-5">
          {(quote.title || quote.client_name) && (
            <div className="mb-4">
              {quote.title && <h1 className="text-[20px] font-extrabold leading-snug text-[#162543]">{quote.title}</h1>}
              {quote.client_name && <p className="mt-1 text-[14px] text-[#52627a]">{t("clientLabel")}: <span className="font-semibold text-[#162543]">{quote.client_name}</span></p>}
            </div>
          )}
          <div className="divide-y divide-[#eef2f6] overflow-hidden rounded-2xl border border-[#e5eaf0]">
            {quote.items.map((it, i) => (
              <div key={i} className="flex items-start justify-between gap-3 px-4 py-3 text-[15px]">
                <span className="min-w-0 flex-1 text-[#162543]">{it.description}<span className="ml-1.5 text-[12px] text-[#68778d]">× {it.quantity}</span></span>
                <span className="shrink-0 font-bold text-[#162543]">{formatColones(Math.round(it.quantity * it.unit_price))}</span>
              </div>
            ))}
          </div>
          <div className="mt-3"><Totales quote={quote} /></div>
          {quote.notes && <p className="mt-4 whitespace-pre-line text-[14px] leading-6 text-[#52627a]">{quote.notes}</p>}
          {fecha && !vencida && <p className="mt-4 text-[13px] text-[#68778d]">{t("validUntil", { date: fecha })}</p>}
        </div>

        {/* La conversación sigue por WhatsApp: es como el profesional y el
            cliente ya se hablan. */}
        {wa && !vencida && (
          <div className="print:hidden border-t border-[#eef2f6] bg-[#fafcfd] px-6 py-5">
            <a href={wa} target="_blank" rel="noopener noreferrer" className="inline-flex h-12 w-full items-center justify-center rounded-full bg-[#25d366] px-5 text-[15px] font-bold text-white transition-colors hover:bg-[#1da851]">{t("publicWhatsApp")}</a>
          </div>
        )}
      </article>

      <div className="print:hidden mt-4 flex flex-col gap-2 sm:flex-row">
        {pro.profileUrl && <a href={pro.profileUrl} className="inline-flex h-11 flex-1 items-center justify-center rounded-full border border-[#d7e1ea] bg-white px-5 text-[14px] font-bold text-[#162543] hover:bg-[#f6f9fb]">{t("publicViewProfile")}</a>}
        <button type="button" onClick={() => window.print()} className="hidden h-11 flex-1 items-center justify-center gap-2 rounded-full border border-[#d7e1ea] bg-white px-5 text-[14px] font-bold text-[#162543] hover:bg-[#f6f9fb] sm:inline-flex"><Printer className="h-4 w-4" />{t("publicPrint")}</button>
      </div>

      <p className="print:hidden mt-8 text-center text-[13px] leading-6 text-[#68778d]">
        {t("publicFooter")} <Link href="/registro/profesional" className="font-bold text-[#009FD9] hover:underline">{t("publicFooterCta")}</Link>
      </p>
    </Marco>
  );
}

function Marco({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f4f7fa] print:bg-white">
      <header className="print:hidden border-b border-[#e3ebf2] bg-white">
        <div className="mx-auto flex h-16 max-w-2xl items-center px-5">
          {/* eslint-disable-next-line @next/next/no-img-element -- logotipo estático, sin optimizador */}
          <Link href="/" aria-label="ContrataCR"><img src="/logo-wordmark-transparent.png" alt="ContrataCR" className="h-8 w-auto" /></Link>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-10">{children}</main>
    </div>
  );
}

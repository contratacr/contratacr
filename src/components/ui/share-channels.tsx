"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Mail, Share2 } from "lucide-react";
import { ShareLinkPanel } from "@/components/ui/share-link-panel";
import { useNativeShare } from "@/hooks/use-native-share";

// El enlace y las tres formas en que la gente lo manda de verdad. Lo usan el
// "Compartir" del perfil y el kit del profesional, para que sea lo mismo en
// los dos lados.
type Props = { url: string; name: string; linkLabel?: string; copyLabel?: string };

export function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm0 18.15h-.01a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.19 8.19 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.25-8.24 2.2 0 4.27.86 5.83 2.42a8.19 8.19 0 0 1 2.41 5.83c0 4.54-3.7 8.23-8.24 8.23Zm4.52-6.17c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.24-.64.8-.78.97-.15.16-.29.18-.53.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.01-.38.11-.5.11-.11.25-.29.37-.44.12-.15.16-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.4-.42-.56-.43h-.47c-.16 0-.43.06-.65.31-.22.25-.85.83-.85 2.03s.87 2.35.99 2.51c.12.16 1.71 2.61 4.15 3.66.58.25 1.03.4 1.39.51.58.19 1.11.16 1.53.1.47-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.15-1.18-.06-.11-.22-.17-.47-.29Z" />
    </svg>
  );
}

export function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2.5" y="2.5" width="19" height="19" rx="5.5" />
      <circle cx="12" cy="12" r="4.2" />
      <circle cx="17.4" cy="6.6" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M22 12.06C22 6.5 17.52 2 12 2S2 6.5 2 12.06c0 5.02 3.66 9.18 8.44 9.94v-7.03H7.9v-2.91h2.54V9.85c0-2.52 1.49-3.91 3.77-3.91 1.09 0 2.24.2 2.24.2v2.47h-1.26c-1.24 0-1.63.78-1.63 1.57v1.88h2.78l-.44 2.91h-2.34V22c4.78-.76 8.44-4.92 8.44-9.94Z" />
    </svg>
  );
}

const TILE = "flex flex-col items-center gap-2 rounded-2xl border border-[#e5eaf0] bg-white px-2 py-3.5 text-center transition-colors hover:border-[#bfe3f5] hover:bg-[#f8fcfe]";

export function ShareChannels({ url, name, linkLabel, copyLabel }: Props) {
  const t = useTranslations("shareProfile");
  const nativo = useNativeShare();
  const [avisoInstagram, setAvisoInstagram] = useState(false);

  const texto = t("message", { name });
  const wa = `https://wa.me/?text=${encodeURIComponent(`${texto} ${url}`)}`;
  const fb = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
  const correo = `mailto:?subject=${encodeURIComponent(t("emailSubject", { name }))}&body=${encodeURIComponent(`${texto}\n${url}`)}`;

  // Instagram no deja compartir un enlace desde el navegador: lo que funciona
  // es copiarlo y pegarlo en la historia, el perfil o un mensaje.
  async function instagram() {
    try { await navigator.clipboard.writeText(url); } catch { /* sin portapapeles */ }
    setAvisoInstagram(true);
    window.open("https://www.instagram.com/", "_blank", "noopener,noreferrer");
  }

  return (
    <div className="flex flex-col gap-3">
      <ShareLinkPanel url={url} label={linkLabel ?? t("linkLabel")} copyLabel={copyLabel ?? t("copy")} copiedLabel={t("copied")} />
      <div className="grid grid-cols-3 gap-2.5">
        <a href={wa} target="_blank" rel="noopener noreferrer" className={TILE}>
          <span className="grid h-11 w-11 place-items-center rounded-full bg-[#25d366] text-white"><WhatsAppIcon className="h-5 w-5" /></span>
          <span className="text-[13px] font-bold text-[#162543]">{t("whatsapp")}</span>
        </a>
        <button type="button" onClick={() => void instagram()} className={TILE}>
          <span className="grid h-11 w-11 place-items-center rounded-full bg-gradient-to-br from-[#f9ce34] via-[#ee2a7b] to-[#6228d7] text-white"><InstagramIcon className="h-5 w-5" /></span>
          <span className="text-[13px] font-bold text-[#162543]">{t("instagram")}</span>
        </button>
        <a href={fb} target="_blank" rel="noopener noreferrer" className={TILE}>
          <span className="grid h-11 w-11 place-items-center rounded-full bg-[#1877f2] text-white"><FacebookIcon className="h-5 w-5" /></span>
          <span className="text-[13px] font-bold text-[#162543]">{t("facebook")}</span>
        </a>
      </div>
      {avisoInstagram && (
        <p className="rounded-2xl bg-[#eaf7fc] px-4 py-2.5 text-[13px] font-semibold leading-snug text-[#0b5f80]">{t("instagramHint")}</p>
      )}
      <div className="flex flex-wrap gap-2.5">
        <a href={correo} className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-full border border-[#d7e1ea] px-4 text-[13px] font-bold text-[#162543] transition-colors hover:border-[#b9c8d6] hover:bg-[#f6f9fb]">
          <Mail className="h-4 w-4" />{t("email")}
        </a>
        {nativo && (
          <button
            type="button"
            onClick={() => { void navigator.share({ title: name, text: texto, url }).catch(() => {}); }}
            className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-full border border-[#d7e1ea] px-4 text-[13px] font-bold text-[#162543] transition-colors hover:border-[#b9c8d6] hover:bg-[#f6f9fb]"
          >
            <Share2 className="h-4 w-4" />{t("more")}
          </button>
        )}
      </div>
    </div>
  );
}

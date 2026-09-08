"use client";

import { useTranslations } from "next-intl";
import { Mail, Share2 } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { ShareLinkPanel } from "@/components/ui/share-link-panel";
import { useNativeShare } from "@/hooks/use-native-share";

// Compartir un perfil desde el propio perfil. Antes solo copiaba el enlace y en
// computadora no se notaba que hubiera pasado algo; ahora el enlace se ve y
// están las tres formas en que la gente lo manda de verdad.
type Props = { open: boolean; onClose: () => void; url: string; name: string };

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm0 18.15h-.01a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.19 8.19 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.25-8.24 2.2 0 4.27.86 5.83 2.42a8.19 8.19 0 0 1 2.41 5.83c0 4.54-3.7 8.23-8.24 8.23Zm4.52-6.17c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.24-.64.8-.78.97-.15.16-.29.18-.53.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.01-.38.11-.5.11-.11.25-.29.37-.44.12-.15.16-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.4-.42-.56-.43h-.47c-.16 0-.43.06-.65.31-.22.25-.85.83-.85 2.03s.87 2.35.99 2.51c.12.16 1.71 2.61 4.15 3.66.58.25 1.03.4 1.39.51.58.19 1.11.16 1.53.1.47-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.15-1.18-.06-.11-.22-.17-.47-.29Z" />
    </svg>
  );
}

function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M22 12.06C22 6.5 17.52 2 12 2S2 6.5 2 12.06c0 5.02 3.66 9.18 8.44 9.94v-7.03H7.9v-2.91h2.54V9.85c0-2.52 1.49-3.91 3.77-3.91 1.09 0 2.24.2 2.24.2v2.47h-1.26c-1.24 0-1.63.78-1.63 1.57v1.88h2.78l-.44 2.91h-2.34V22c4.78-.76 8.44-4.92 8.44-9.94Z" />
    </svg>
  );
}

export function ShareProfileModal({ open, onClose, url, name }: Props) {
  const t = useTranslations("shareProfile");
  const nativo = useNativeShare();

  const texto = t("message", { name });
  const canales = [
    { key: "whatsapp", href: `https://wa.me/?text=${encodeURIComponent(`${texto} ${url}`)}`, Icon: WhatsAppIcon, fondo: "bg-[#25d366]" },
    { key: "facebook", href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`, Icon: FacebookIcon, fondo: "bg-[#1877f2]" },
    { key: "email", href: `mailto:?subject=${encodeURIComponent(t("emailSubject", { name }))}&body=${encodeURIComponent(`${texto}\n${url}`)}`, Icon: Mail, fondo: "bg-[#68778d]" },
  ] as const;

  return (
    <Modal open={open} onClose={onClose} title={t("title")} subtitle={t("subtitle")} size="sm" mobilePresentation="center" closeLabel={t("close")}>
      <div className="flex flex-col gap-4">
        <ShareLinkPanel url={url} label={t("linkLabel")} copyLabel={t("copy")} copiedLabel={t("copied")} />
        <div className="grid grid-cols-3 gap-2.5">
          {canales.map(({ key, href, Icon, fondo }) => (
            <a
              key={key}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col items-center gap-2 rounded-2xl border border-[#e5eaf0] bg-white px-2 py-3.5 transition-colors hover:border-[#bfe3f5] hover:bg-[#f8fcfe]"
            >
              <span className={`grid h-11 w-11 place-items-center rounded-full text-white ${fondo}`}><Icon className="h-5 w-5" /></span>
              <span className="text-[13px] font-bold text-[#162543]">{t(key)}</span>
            </a>
          ))}
        </div>
        {nativo && (
          <button
            type="button"
            onClick={() => { void navigator.share({ title: name, text: texto, url }).catch(() => {}); }}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full border border-[#d7e1ea] px-5 text-[14px] font-bold text-[#162543] transition-colors hover:border-[#b9c8d6] hover:bg-[#f6f9fb]"
          >
            <Share2 className="h-4 w-4" />{t("more")}
          </button>
        )}
      </div>
    </Modal>
  );
}

"use client";

import { useTranslations } from "next-intl";
import { WhatsAppLogo } from "@/components/ui/whatsapp-logo";
import { ShareLinkPanel } from "@/components/ui/share-link-panel";

// El enlace y las tres formas en que la gente lo manda de verdad. Lo usan el
// "Compartir" del perfil y el kit del profesional, para que sea lo mismo en
// los dos lados.
type Props = { url: string; name: string; linkLabel?: string; copyLabel?: string; mensaje?: string };

export function ShareChannels({ url, name, linkLabel, copyLabel, mensaje }: Props) {
  const t = useTranslations("shareProfile");
  const texto = mensaje ?? t("message", { name });
  const wa = `https://wa.me/?text=${encodeURIComponent(`${texto} ${url}`)}`;

  // DOS FORMAS, NO SEIS. Un enlace se manda por WhatsApp o se copia y se pega
  // donde sea; todo lo demas era relleno con problemas propios.
  //
  // Instagram NO RECIBE ENLACES: no hay forma de mandarle uno desde el
  // navegador. Lo que habia era un apano —copiar, abrir instagram.com y avisar
  // que lo pegaras— y encima el `window.open` iba despues de un `await` al
  // portapapeles, asi que el navegador lo bloqueaba por emergente. Facebook
  // solo funciona con una direccion publica y detras de un dialogo que pide
  // iniciar sesion. El correo no es como se comparte un perfil aqui, y «Mas
  // opciones» solo existia en el telefono: dos botones que la mitad de la
  // gente nunca veia.

  return (
    <div className="flex flex-col gap-2.5">
      <ShareLinkPanel url={url} label={linkLabel ?? t("linkLabel")} copyLabel={copyLabel ?? t("copy")} copiedLabel={t("copied")} />
      <a
        href={wa}
        target="_blank"
        rel="noopener noreferrer"
        // «WhatsApp» a secas era una etiqueta, no una accion: al lado de
        // «Copiar enlace» —que si dice lo que hace— parecia un rotulo de marca.
        className="inline-flex h-12 w-full items-center justify-center gap-2.5 rounded-2xl bg-[#25d366] px-5 text-[15px] font-bold text-white shadow-[0_8px_18px_-12px_rgba(37,211,102,0.9)] transition-colors hover:bg-[#1eb457]"
      >
        <WhatsAppLogo className="h-[18px] w-[18px]" />{t("shareWhatsapp")}
      </a>
    </div>
  );
}

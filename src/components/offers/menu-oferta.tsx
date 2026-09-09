"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Flag, Link2, Share2 } from "lucide-react";
import { MenuFicha } from "@/components/ui/menu-ficha";
import { useCompartir } from "@/components/ui/boton-compartir";
import { ModalCompartir } from "@/components/ui/modal-compartir";
import { ReportProfileModal } from "@/components/professionals/report-profile-modal";

/**
 * El "..." de la página de una oferta: compartir, copiar el enlace y reportar.
 * Vive aparte porque la página es de servidor y esto necesita ser del cliente.
 */
export function MenuOferta({
  ofertaId,
  titulo,
  enlace,
  profesionalNombre,
  profesionalSlug,
  esPropia = false,
  grande = false,
  className,
}: {
  ofertaId: string;
  titulo: string;
  enlace: string;
  profesionalNombre: string;
  profesionalSlug?: string | null;
  esPropia?: boolean;
  grande?: boolean;
  className?: string;
}) {
  const t = useTranslations("menuFicha");
  const tCompartir = useTranslations("compartirFicha");
  const tShare = useTranslations("shareProfile");
  const { copiar, avisoNodo } = useCompartir();
  const [compartiendo, setCompartiendo] = useState(false);
  const [reportando, setReportando] = useState(false);

  return (
    <>
      <MenuFicha
        className={className}
        grande={grande}
        opciones={[
          { id: "compartir", icono: <Share2 className="h-4 w-4" />, texto: t("share"), onSelect: () => setCompartiendo(true) },
          { id: "copiar", icono: <Link2 className="h-4 w-4" />, texto: t("copyLink"), onSelect: () => void copiar(enlace) },
          ...(esPropia || !profesionalSlug ? [] : [{ id: "reportar", icono: <Flag className="h-4 w-4" />, texto: t("reportOffer"), peligro: true, onSelect: () => setReportando(true) }]),
        ]}
      />
      {reportando && profesionalSlug && (
        <ReportProfileModal
          professionalName={profesionalNombre}
          professionalSlug={profesionalSlug}
          contexto={`Oferta "${titulo}" (${ofertaId})`}
          titulo={t("reportOffer")}
          onClose={() => setReportando(false)}
        />
      )}
      <ModalCompartir
        open={compartiendo}
        onClose={() => setCompartiendo(false)}
        url={enlace}
        nombre={titulo}
        titulo={tCompartir("offerTitle")}
        subtitulo={tCompartir("subtitle")}
        mensaje={tCompartir("offerMessage", { name: titulo })}
        asunto={tCompartir("offerSubject", { name: titulo })}
        enlaceLabel={tCompartir("offerLink")}
        cerrarLabel={tShare("close")}
      />
      {avisoNodo}
    </>
  );
}

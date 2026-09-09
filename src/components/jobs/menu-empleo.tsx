"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Flag, Share2 } from "lucide-react";
import { MenuFicha } from "@/components/ui/menu-ficha";
import { useCompartir } from "@/components/ui/boton-compartir";
import { ModalCompartir } from "@/components/ui/modal-compartir";
import { ReportProfileModal } from "@/components/professionals/report-profile-modal";

/**
 * El "..." de un empleo: compartir y reportar (copiar el enlace ya vive dentro
 * de la hoja de compartir). Vive en la
 * cabecera cuando la pantalla tiene una (el teléfono) y arriba de la ficha
 * cuando no la hay.
 */
export function MenuEmpleo({
  empleoId,
  titulo,
  enlace,
  empleadorNombre,
  empleadorSlug,
  esPropio = false,
  grande = false,
  className,
}: {
  empleoId: string;
  titulo: string;
  enlace: string;
  empleadorNombre: string;
  empleadorSlug?: string | null;
  esPropio?: boolean;
  grande?: boolean;
  className?: string;
}) {
  const t = useTranslations("menuFicha");
  const tCompartir = useTranslations("compartirFicha");
  const tShare = useTranslations("shareProfile");
  const { avisoNodo } = useCompartir();
  const [compartiendo, setCompartiendo] = useState(false);
  const [reportando, setReportando] = useState(false);

  return (
    <>
      <MenuFicha
        className={className}
        grande={grande}
        opciones={[
          { id: "compartir", icono: <Share2 className="h-4 w-4" />, texto: t("share"), onSelect: () => setCompartiendo(true) },
          ...(esPropio || !empleadorSlug ? [] : [{ id: "reportar", icono: <Flag className="h-4 w-4" />, texto: t("reportJob"), peligro: true, onSelect: () => setReportando(true) }]),
        ]}
      />
      {reportando && empleadorSlug && (
        <ReportProfileModal
          professionalName={empleadorNombre}
          professionalSlug={empleadorSlug}
          contexto={`Empleo "${titulo}" (${empleoId})`}
          titulo={t("reportJob")}
          onClose={() => setReportando(false)}
        />
      )}
      <ModalCompartir
        open={compartiendo}
        onClose={() => setCompartiendo(false)}
        url={enlace}
        nombre={titulo}
        titulo={tCompartir("jobTitle")}
        subtitulo={tCompartir("subtitle")}
        mensaje={tCompartir("jobMessage", { name: titulo })}
        asunto={tCompartir("jobSubject", { name: titulo })}
        enlaceLabel={tCompartir("jobLink")}
        cerrarLabel={tShare("close")}
      />
      {avisoNodo}
    </>
  );
}

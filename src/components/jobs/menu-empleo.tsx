"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Flag, Link2, Share2 } from "lucide-react";
import { MenuFicha } from "@/components/ui/menu-ficha";
import { useCompartir } from "@/components/ui/boton-compartir";
import { ReportProfileModal } from "@/components/professionals/report-profile-modal";

/**
 * El "..." de un empleo: compartir, copiar el enlace y reportar. Vive en la
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
  const { compartir, copiar, avisoNodo } = useCompartir();
  const [reportando, setReportando] = useState(false);

  return (
    <>
      <MenuFicha
        className={className}
        grande={grande}
        opciones={[
          { id: "compartir", icono: <Share2 className="h-4 w-4" />, texto: t("share"), onSelect: () => void compartir(enlace, titulo) },
          { id: "copiar", icono: <Link2 className="h-4 w-4" />, texto: t("copyLink"), onSelect: () => void copiar(enlace) },
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
      {avisoNodo}
    </>
  );
}

"use client";

import { Modal } from "@/components/ui/modal";
import { ShareChannels } from "@/components/ui/share-channels";

/**
 * La misma hoja de compartir del perfil, para cualquier ficha: el enlace
 * arriba, WhatsApp, Instagram y Facebook, correo y la hoja del teléfono. Antes
 * un empleo o una oferta solo copiaban el enlace y no se veía a dónde iban.
 */
export function ModalCompartir({
  open,
  onClose,
  url,
  nombre,
  titulo,
  subtitulo,
  mensaje,
  asunto,
  enlaceLabel,
  cerrarLabel,
}: {
  open: boolean;
  onClose: () => void;
  url: string;
  nombre: string;
  titulo: string;
  subtitulo?: string;
  mensaje?: string;
  asunto?: string;
  enlaceLabel?: string;
  cerrarLabel: string;
}) {
  // El enlace se muestra y se manda completo: relativo no le sirve a nadie.
  const completa = url.startsWith("http") || typeof window === "undefined" ? url : `${window.location.origin}${url}`;
  return (
    <Modal open={open} onClose={onClose} title={titulo} subtitle={subtitulo} size="sm" mobilePresentation="center" closeLabel={cerrarLabel}>
      <ShareChannels url={completa} name={nombre} mensaje={mensaje} asunto={asunto} linkLabel={enlaceLabel} />
    </Modal>
  );
}

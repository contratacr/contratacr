"use client";

import { useTranslations } from "next-intl";
import { Modal } from "@/components/ui/modal";
import { ShareChannels } from "@/components/ui/share-channels";

// Compartir un perfil desde el propio perfil. Antes solo copiaba el enlace y en
// computadora no se notaba que hubiera pasado algo.
type Props = { open: boolean; onClose: () => void; url: string; name: string };

export function ShareProfileModal({ open, onClose, url, name }: Props) {
  const t = useTranslations("shareProfile");
  return (
    <Modal open={open} onClose={onClose} title={t("title")} subtitle={t("subtitle")} size="sm" mobilePresentation="center" closeLabel={t("close")}>
      <ShareChannels url={url} name={name} />
    </Modal>
  );
}

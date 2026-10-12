"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Modal } from "@/components/ui/modal";

export const APPLE_LINK_DESTINATION = "/dashboard/profesional?tab=cuenta&connect=apple";

/** Choose the existing account before OAuth can create an Apple relay identity. */
export function AppleAccountNotice({ open, onClose, onContinue }: {
  open: boolean; onClose: () => void; onContinue: () => void;
}) {
  const t = useTranslations("auth.appleAccount");
  return (
    <Modal open={open} onClose={onClose} title={t("title")} closeLabel={t("close")} size="sm" mobilePresentation="center">
      <p className="text-sm text-[#374151]">{t("description")}</p>
      <div className="mt-5 flex flex-col gap-3">
        <Link onClick={onClose} href={`/login?redirect=${encodeURIComponent(APPLE_LINK_DESTINATION)}`} className="rounded-xl bg-[#009FD9] px-4 py-3 text-center text-sm font-semibold text-white">{t("existing")}</Link>
        <p className="text-xs text-[#68778d]">{t("continueHelp")}</p>
        <button type="button" onClick={() => { onClose(); onContinue(); }} className="rounded-xl bg-[#111827] px-4 py-3 text-sm font-semibold text-white">{t("continue")}</button>
      </div>
    </Modal>
  );
}

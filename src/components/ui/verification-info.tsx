"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Modal } from "@/components/ui/modal";
import { VerifiedSeal } from "@/components/ui/verified-seal";

export function VerificationExplanation({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations("verificationBadge");
  return <Modal open={open} onClose={onClose} title={t("title")} closeLabel={t("close")} size="sm" mobilePresentation="center">
    <p className="text-sm leading-6 text-[#374151]">{t("description")}</p>
    <p className="mt-3 text-sm leading-6 text-[#68778d]">{t("scope")}</p>
    <button type="button" onClick={onClose} className="mt-5 w-full rounded-xl bg-[#009FD9] px-4 py-3 text-sm font-semibold text-white">{t("understood")}</button>
  </Modal>;
}

export function VerificationInfo() {
  const t = useTranslations("verificationBadge");
  const [open, setOpen] = useState(false);
  return <span className="contents" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
    <button type="button" data-verification-badge aria-label={t("action")} aria-haspopup="dialog" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(true); }} className="relative z-10 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[#009FD9] pointer-events-auto hover:bg-[#eaf7fc] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#009FD9]">
      <VerifiedSeal className="h-4 w-4" />
    </button>
    <VerificationExplanation open={open} onClose={() => setOpen(false)} />
  </span>;
}

export function VerificationBadgeEducation({ context }: { context: "registration" | "panel" }) {
  const t = useTranslations("verificationBadge");
  return <p data-verification-education className="flex items-start gap-2 text-xs leading-5 text-[#68778d]">
    <VerifiedSeal className="mt-0.5 h-4 w-4 shrink-0 text-[#009FD9]" />
    <span>{t(context === "registration" ? "registrationHelp" : "panelHelp")}</span>
  </p>;
}

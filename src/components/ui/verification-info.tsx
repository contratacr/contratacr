"use client";

import { useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { Modal } from "@/components/ui/modal";
import { VerifiedSeal } from "@/components/ui/verified-seal";

export function VerificationExplanation({ open, onClose, audience = "professional" }: { open: boolean; onClose: () => void; audience?: "client" | "professional" }) {
  const t = useTranslations("verificationBadge");
  return <Modal open={open} onClose={onClose} title={t("title")} closeLabel={t("close")} size="sm" mobilePresentation="center">
    <p className="text-sm leading-6 text-[#374151]">{t("description")}</p>
    <p className="mt-3 text-sm leading-6 text-[#68778d]">{t(audience === "client" ? "clientScope" : "scope")}</p>
    <button type="button" onClick={onClose} className="mt-5 w-full rounded-xl bg-[#009FD9] px-4 py-3 text-sm font-semibold text-white">{t("understood")}</button>
  </Modal>;
}

const subscribeReady = () => () => {};

export function VerificationInfo({ educational = false, audience = "professional" }: { educational?: boolean; audience?: "client" | "professional" } = {}) {
  const ready = useSyncExternalStore(subscribeReady, () => true, () => false);
  const t = useTranslations("verificationBadge");
  const [open, setOpen] = useState(false);
  return <span className="contents" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
    <button type="button" disabled={!ready} data-verification-badge aria-label={t(educational ? "educationAction" : "action")} aria-haspopup="dialog" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(true); }} className="relative z-10 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[#009FD9] pointer-events-auto hover:bg-[#eaf7fc] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#009FD9]">
      <VerifiedSeal className="h-4 w-4" />
    </button>
    <VerificationExplanation open={open} onClose={() => setOpen(false)} audience={audience} />
  </span>;
}

export function VerificationBadgeEducation({ panel = false, verified = false }: { panel?: boolean; verified?: boolean } = {}) {
  const t = useTranslations("verificationBadge");
  return <div data-verification-education className={`flex items-start gap-2 text-xs leading-5 text-[#68778d] ${panel ? "pb-2" : ""}`}>
    <VerificationInfo educational />
    <div className="min-w-0">
      {panel && <p className="mb-1 text-sm font-semibold text-[#374151]">{t("educationAction")}</p>}
      <p>{t(verified ? "verifiedHelp" : "help")}</p>
    </div>
  </div>;
}

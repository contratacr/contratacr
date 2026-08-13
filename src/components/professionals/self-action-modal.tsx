"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Info } from "lucide-react";
import { BrandIconBadge } from "@/components/ui/brand-icon-badge";

// Per-action keys. The values are i18n keys (selfAction.messages.<key>), resolved
// inside the modal — so every call site stays `setSelfMsg(SELF_MSG.request)` while
// the copy is fully bilingual.
export const SELF_MSG = {
  request: "request",
  whatsapp: "whatsapp",
  call: "call",
  email: "email",
  proposal: "proposal",
  favorite: "favorite",
  follow: "follow",
} as const;

export type SelfMsgKey = (typeof SELF_MSG)[keyof typeof SELF_MSG];

// Shown when a professional triggers a CLIENT action on their OWN card/profile
// (request service, WhatsApp, call). We deliberately REVEAL every normal button
// so the pro sees their profile exactly as clients do — then block the action
// here with a friendly explanation instead of hiding the controls.
// Compact informational dialogs stay centered on every viewport. Bottom sheets are
// reserved for longer forms and selection flows.
export function SelfActionModal({
  open,
  onClose,
  message,
}: {
  open: boolean;
  onClose: () => void;
  /** A SELF_MSG key (selfAction.messages.<key>). */
  message: string;
}) {
  const t = useTranslations("selfAction");

  // Dismiss on Escape (the scrim already closes on tap) — per the dismiss standard.
  useEffect(() => {
    if (!open) return;
    document.documentElement.dataset.selfActionModalOpen = "true";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      delete document.documentElement.dataset.selfActionModalOpen;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="app-modal-screen app-centered-modal-screen fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="self-action-title"
        aria-describedby="self-action-description"
        className="app-centered-modal relative z-10 max-h-[calc(var(--app-visual-viewport-height)-2rem)] w-full max-w-sm overflow-y-auto overscroll-contain rounded-2xl bg-white p-6 text-center shadow-2xl"
      >
        <BrandIconBadge icon={Info} size={56} className="mx-auto mb-4" />
        <h3 id="self-action-title" className="mb-1.5 text-lg font-bold text-[#111827]">{t("title")}</h3>
        <p id="self-action-description" className="mb-5 text-sm leading-relaxed text-[#6b7280]">
          {message ? t(`messages.${message}` as Parameters<typeof t>[0]) : ""}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-xl bg-[#009FD9] hover:bg-[#0089bb] text-white font-semibold py-2.5 text-sm transition-colors"
        >
          {t("ok")}
        </button>
      </div>
    </div>
  );
}

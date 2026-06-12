"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Info } from "lucide-react";

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
} as const;

export type SelfMsgKey = (typeof SELF_MSG)[keyof typeof SELF_MSG];

// Shown when a professional triggers a CLIENT action on their OWN card/profile
// (request service, WhatsApp, call). We deliberately REVEAL every normal button
// so the pro sees their profile exactly as clients do — then block the action
// here with a friendly explanation instead of hiding the controls.
// Responsive: `max-w-sm` inside `p-4` page padding so it never overflows at ~360px.
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
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#EBF5FB]">
          <Info className="h-6 w-6 text-[#009FD9]" />
        </div>
        <h3 className="text-lg font-bold text-[#111827] mb-1.5">{t("title")}</h3>
        <p className="text-sm text-[#6b7280] mb-5 leading-relaxed">
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

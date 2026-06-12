"use client";

import { useEffect } from "react";
import { Info } from "lucide-react";

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
  message: string;
}) {
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
        <h3 className="text-lg font-bold text-[#111827] mb-1.5">Este es tu perfil</h3>
        <p className="text-sm text-[#6b7280] mb-5 leading-relaxed">{message}</p>
        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-xl bg-[#009FD9] hover:bg-[#0089bb] text-white font-semibold py-2.5 text-sm transition-colors"
        >
          Entendido
        </button>
      </div>
    </div>
  );
}

// Per-action copy (Costa Rican Spanish, no voseo). Same friendly tone everywhere.
export const SELF_MSG = {
  request: "No puedes solicitarte un servicio a ti mismo. Así es como los clientes te encuentran y reservan tus servicios.",
  whatsapp: "No puedes contactarte por WhatsApp a ti mismo. Así es como los clientes te escriben para coordinar.",
  call: "No puedes llamarte a ti mismo. Así es como los clientes te contactan por teléfono.",
  email: "No puedes escribirte a ti mismo. Así es como los clientes te contactan por correo.",
  proposal: "No puedes enviarte una propuesta a tu propio proyecto.",
} as const;

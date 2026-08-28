"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2 } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { SupportForm } from "@/components/support/support-form";

// The support form as a MODAL (over the current page) — reuses the shared Modal
// primitive + the SAME SupportForm as the /soporte page (single source of truth).
// Two success modes:
//  • `onSubmitted` provided (e.g. the in-panel Soporte section): the consumer owns
//    the outcome — we hand it the email so it can close the modal and refresh its
//    ticket list, with the freshly-created ticket appearing inline (no navigation,
//    no separate confirmation screen needed).
//  • `onSubmitted` omitted (standalone/over-page use): show a compact confirmation
//    and let the user close via the Cerrar button, X, backdrop, or Esc.
export function SupportModal({ onClose, onSubmitted }: { onClose: () => void; onSubmitted?: (email: string) => void }) {
  const t = useTranslations("soporte");
  const { user } = useAuth();
  const [doneEmail, setDoneEmail] = useState<string | null>(null);

  return (
    <Modal onClose={onClose} title={t("headerTitle")} subtitle={t("headerSubtitle")} size="lg" closeLabel={t("close")} mobilePresentation="fullscreen">
      {doneEmail === null ? (
        <SupportForm onSuccess={(email) => (onSubmitted ? onSubmitted(email) : setDoneEmail(email))} />
      ) : (
        <div className="flex flex-col items-center text-center gap-3 py-6">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#EBF5FB]">
            <CheckCircle2 className="h-8 w-8 text-[#009FD9]" />
          </div>
          <h3 className="text-lg font-bold text-[#111827]">{t("successTitle")}</h3>
          <p className="max-w-sm text-sm text-[#6b7280]">
            {user
              ? t("successUserDesc")
              : t.rich("successGuestDesc", {
                  email: doneEmail,
                  b: (c) => <span className="font-semibold text-[#111827]">{c}</span>,
                })}
          </p>
          <Button type="button" onClick={onClose} className="mt-1">{t("close")}</Button>
        </div>
      )}
    </Modal>
  );
}

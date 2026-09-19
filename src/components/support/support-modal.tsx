"use client";

import { BOTON_DE_EXITO, PantallaDeExito } from "@/components/ui/pantalla-de-exito";
import { useState } from "react";
import { useTranslations } from "next-intl";
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
    <Modal onClose={onClose} title={t("headerTitle")} subtitle={t("headerSubtitle")} size="lg" closeLabel={t("close")} mobilePresentation="fullscreen" bodyClassName="bg-[#f4f7fa] py-5">
      {doneEmail === null ? (
        <SupportForm onCancel={onClose} onSuccess={(email) => (onSubmitted ? onSubmitted(email) : setDoneEmail(email))} />
      ) : (
        <PantallaDeExito
          titulo={t("successTitle")}
          acciones={<Button type="button" size="lg" onClick={onClose} className={BOTON_DE_EXITO}>{t("close")}</Button>}
        >
          <p className="max-w-[22rem] text-sm leading-relaxed text-[#6b7280]">
            {user
              ? t("successUserDesc")
              : t.rich("successGuestDesc", {
                  email: doneEmail,
                  b: (c) => <span className="font-semibold text-[#162543]">{c}</span>,
                })}
          </p>
        </PantallaDeExito>
      )}
    </Modal>
  );
}

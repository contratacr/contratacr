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
// El formulario trae SU PROPIA franja de acciones, pegada al fondo del cuerpo
// («sticky bottom-0»). El cuerpo de la ventana, además, reserva aire abajo como
// todos: con los dos, la franja blanca se quedaba 20 px por encima del filo y
// asomaba una tira gris del lienzo debajo de los botones —que es justo lo que
// no pasa en «Crear proyecto», porque ahí los botones van en el pie de la
// ventana, fuera del área que se desplaza—. En computadora el aire de abajo lo
// pone la propia franja, así que el cuerpo no lo repite. En el teléfono sí se
// conserva: ahí la franja va fija y el contenido necesita ese hueco para no
// quedar debajo de ella.
export function SupportModal({ onClose, onSubmitted }: { onClose: () => void; onSubmitted?: (email: string) => void }) {
  const t = useTranslations("soporte");
  const { user } = useAuth();
  const [doneEmail, setDoneEmail] = useState<string | null>(null);

  return (
    <Modal onClose={onClose} title={t("headerTitle")} subtitle={t("headerSubtitle")} size="lg" closeLabel={t("close")} mobilePresentation="fullscreen" bodyClassName="bg-[#f4f7fa] py-5 sm:pb-0">
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

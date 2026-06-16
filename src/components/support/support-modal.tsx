"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { SuccessIcon } from "@/components/ui/success-icon";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { SupportForm } from "@/components/support/support-form";

// The support form as a MODAL (over the current page) — reuses the shared Modal
// primitive + the SAME SupportForm as the /soporte page (single source of truth).
// On success it shows a compact confirmation (no navigation away); closes on the
// Cerrar button, X, backdrop, or Esc.
export function SupportModal({ onClose }: { onClose: () => void }) {
  const t = useTranslations("soporte");
  const { user } = useAuth();
  const [doneEmail, setDoneEmail] = useState<string | null>(null);

  return (
    <Modal onClose={onClose} title={t("headerTitle")} subtitle={t("headerSubtitle")} size="lg" closeLabel={t("close")}>
      {doneEmail === null ? (
        <SupportForm onSuccess={(email) => setDoneEmail(email)} />
      ) : (
        <div className="flex flex-col items-center text-center gap-3 py-6">
          <SuccessIcon size={64} />
          <h3 className="text-lg font-bold text-[#111827]">{t("successTitle")}</h3>
          <p className="max-w-sm text-sm text-[#6b7280]">
            {user ? t("successUserDesc") : t("successGuestDesc", { email: doneEmail })}
          </p>
          <Button type="button" onClick={onClose} className="mt-1">{t("close")}</Button>
        </div>
      )}
    </Modal>
  );
}

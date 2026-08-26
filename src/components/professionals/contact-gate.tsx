"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Check } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { ClientRegistrationModal, type ContactIntent } from "@/components/auth/client-registration-modal";
import { BrandIconBadge } from "@/components/ui/brand-icon-badge";

// Every direct-contact action (WhatsApp, call, email) goes through this gate:
// a guest gets the in-page registration modal — never a redirect — and once the
// account exists the intended action is offered again on a button, so it runs
// from a real tap (browsers block window.open / tel: that fire after an await).

type GateOptions = {
  professionalName: string;
  intent: Exclude<ContactIntent, "booking">;
};

export function useContactGate({ professionalName, intent }: GateOptions) {
  const { user } = useAuth();
  const t = useTranslations("contactGate");
  const [registering, setRegistering] = useState(false);
  const [ready, setReady] = useState(false);
  const pending = useRef<(() => void) | null>(null);

  // Returns true when the caller may proceed right away.
  const requireAccount = useCallback((run: () => void) => {
    if (user) return true;
    pending.current = run;
    setRegistering(true);
    return false;
  }, [user]);

  const resume = () => {
    const run = pending.current;
    pending.current = null;
    setReady(false);
    run?.();
  };

  const modals: ReactNode = (
    <>
      <ClientRegistrationModal
        open={registering}
        onClose={() => { setRegistering(false); pending.current = null; }}
        onSuccess={() => { setRegistering(false); setReady(true); }}
        professionalName={professionalName}
        intent={intent}
      />
      {ready && (
        <div className="app-modal-screen app-centered-modal-screen fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => { setReady(false); pending.current = null; }} />
          <div role="dialog" aria-modal="true" aria-labelledby="contact-ready-title" className="app-centered-modal relative z-10 w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-2xl">
            <BrandIconBadge icon={Check} size={56} className="mx-auto mb-4" />
            <h3 id="contact-ready-title" className="mb-1.5 text-lg font-bold text-[#111827]">{t("readyTitle")}</h3>
            <p className="mb-5 text-sm leading-relaxed text-[#6b7280]">{t("readyBody", { name: professionalName })}</p>
            <button
              type="button"
              onClick={resume}
              className="w-full rounded-xl bg-[#009FD9] py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#0089bb]"
            >
              {intent === "whatsapp" ? t("openWhatsapp") : intent === "phone" ? t("call") : t("sendEmail")}
            </button>
            <button type="button" onClick={() => { setReady(false); pending.current = null; }} className="mt-2 w-full py-2 text-sm font-semibold text-[#6b7280]">
              {t("later")}
            </button>
          </div>
        </div>
      )}
    </>
  );

  return { requireAccount, modals, signedIn: !!user };
}

"use client";

import { useAppDialog } from "@/hooks/use-app-dialog";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { WhatsAppLogo } from "@/components/ui/whatsapp-logo";
import { useLocale } from "next-intl";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { trackInteraction } from "@/lib/analytics/interaction-events";
import { useNativeApp } from "@/hooks/use-native-app";
import { MessageLauncher } from "@/components/professionals/message-launcher";
import { useContactGate } from "@/components/professionals/contact-gate";

type DirectChatLauncherProps = {
  professionalId?: string;
  professionalName: string;
  bookingId?: string;
  projectId?: string;
  contextTitle?: string;
  isOwn?: boolean;
  className?: string;
  buttonLabel?: string;
  openDirectly?: boolean;
  initialMessage?: string;
  onSelfAction?: () => void;
  tone?: "primary" | "contrast" | "outline";
  analyticsSource?: "search" | "profile" | "profile_service" | "booking" | "favorites" | "jobs" | "offers" | "unknown";
  /** Da forma al mensaje: "job" escribe el saludo de una postulación. */
  intent?: "job";
  /** La publicación desde la que se escribe: puede tener su propio WhatsApp. */
  jobId?: string;
  offerId?: string;
};

export function DirectChatLauncher({
  professionalId = "",
  professionalName,
  bookingId,
  projectId,
  contextTitle,
  isOwn = false,
  className = "",
  buttonLabel,
  initialMessage = "",
  onSelfAction,
  tone = "primary",
  analyticsSource = "unknown",
  intent,
  jobId,
  offerId,
}: DirectChatLauncherProps) {
  const locale = useLocale();
  const isEn = locale === "en";
  const nativeApp = useNativeApp();
  const [loading, setLoading] = useState(false);
  // Un solo rótulo en todo el app: «WhatsApp» y el logo verde. El logo ya dice
  // «escribir», y el verbo largo («Contactar por…», «Escribir por…»,
  // «Postularme por…») no cabe cuando el botón comparte renglón con «Llamar»:
  // se salía de la píldora. Era además el único rótulo distinto por pantalla,
  // así que la misma acción se veía como cuatro acciones diferentes.
  const whatsappLabel = "WhatsApp";
  const { requireAccount, modals } = useContactGate({ professionalName, intent: "whatsapp", professionalId, source: analyticsSource });
  // El aviso del app, no el del navegador (ver BotonEscribir en Proyectos).
  const { dialogNode, showMessage } = useAppDialog();

  if (nativeApp) {
    const safeLabel = buttonLabel && !/whatsapp/i.test(buttonLabel) ? buttonLabel : undefined;
    return (
      <MessageLauncher
        professionalId={professionalId}
        professionalName={professionalName}
        bookingId={bookingId}
        projectId={projectId}
        contextTitle={contextTitle}
        isOwn={isOwn}
        className={className}
        buttonLabel={safeLabel}
        initialMessage={initialMessage}
        onSelfAction={onSelfAction}
        tone={tone}
      />
    );
  }

  async function openChat() {
    setLoading(true);
    try {
      const response = await fetch("/api/contact/whatsapp-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          professionalId,
          bookingId,
          professionalName,
          projectId,
          contextTitle,
          initialMessage,
          intent,
          jobId,
          offerId,
          locale,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.href) throw new Error(payload.error || "Could not open WhatsApp");
      if (professionalId) {
        trackInteraction({
          type: "whatsapp_click",
          professionalId,
          source: analyticsSource,
          locale,
        });
      }
      window.open(String(payload.href), "_blank", "noopener,noreferrer");
    } catch {
      await showMessage({ title: professionalName, description: isEn ? "This contact has no WhatsApp number available." : "Esta persona no tiene un número de WhatsApp disponible." });
    } finally {
      setLoading(false);
    }
  }

  function onClick() {
    if (isOwn) {
      onSelfAction?.();
      return;
    }
    // Nadie se queda afuera: el aviso al profesional sale por detrás.
    requireAccount();
    void openChat();
  }

  return (
    <>
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      aria-busy={loading}
      className={cn(
        buttonVariants({ variant: "whatsapp", size: "md" }),
        "gap-1.5 disabled:opacity-60",
        className || "w-full rounded-full py-2.5 text-[13px] font-semibold",
      )}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <WhatsAppLogo />}
      {buttonLabel || whatsappLabel}
    </button>
    {modals}
    {dialogNode}
    </>
  );
}

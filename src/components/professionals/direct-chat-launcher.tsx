"use client";

import { useAppDialog } from "@/hooks/use-app-dialog";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { WhatsAppLogo } from "@/components/ui/whatsapp-logo";
import { useLocale } from "next-intl";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { trackInteraction } from "@/lib/analytics/interaction-events";
import { trackMetaEvent } from "@/lib/analytics/meta-pixel";
import { useNativeApp } from "@/hooks/use-native-app";
import { useProfesionalConApp } from "@/hooks/use-profesional-con-app";
import { MessageLauncher } from "@/components/professionals/message-launcher";
import { useContactGate } from "@/components/professionals/contact-gate";

type DirectChatLauncherProps = {
  professionalId?: string;
  professionalName: string;
  projectId?: string;
  contextTitle?: string;
  contextKind?: "promocion" | "empleo";
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
  contextKind,
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

  // EN LA APP EL BOTÓN SE ADAPTA AL PROFESIONAL. Si tiene la app, «Mensaje»
  // abre el chat; si no, es WhatsApp, igual que en la web. Al lanzar casi ningún
  // profesional la tiene: con el chat fijo, el cliente escribía a alguien que
  // solo se enteraba por un aviso y tenía que volver a la app a contestar. El
  // chat crece solo a medida que los profesionales instalan la app.
  //
  // El botón dice a dónde va antes de tocarlo —uno que dice «Mensaje» y abre
  // WhatsApp engaña—: nace WhatsApp y pasa a «Mensaje» cuando se confirma que
  // el profesional tiene la app. Sin profesional (la otra punta de una
  // conversación ya existente) sigue siendo el chat.
  const conApp = useProfesionalConApp(professionalId, nativeApp);
  const usaChat = nativeApp && (!professionalId || conApp);
  if (usaChat) {
    const safeLabel = buttonLabel && !/whatsapp/i.test(buttonLabel) ? buttonLabel : undefined;
    return (
      <MessageLauncher
        professionalId={professionalId}
        professionalName={professionalName}
        projectId={projectId}
        contextTitle={contextTitle}
        isOwn={isOwn}
        className={className}
        buttonLabel={safeLabel}
        initialMessage={initialMessage}
        onSelfAction={onSelfAction}
        tone={tone}
        contextKind={contextKind}
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
        // El contacto es la conversión que importa y Meta no la veía: solo
        // llegaba el botón de llamar. Escribirle a quien publicó un empleo es
        // alguien buscando trabajo, no un cliente, así que ese no cuenta.
        if (!jobId) trackMetaEvent("Contact", { content_type: "professional_service", method: "whatsapp", source: analyticsSource });
      }
      window.open(String(payload.href), "_blank", "noopener,noreferrer");
      // La ficha escucha esto para ofrecer, al volver, publicar lo que necesita.
      window.dispatchEvent(new CustomEvent("ccr:whatsapp-abierto"));
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

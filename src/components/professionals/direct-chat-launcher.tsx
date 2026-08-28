"use client";

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
  proposalId?: string;
  contextTitle?: string;
  isOwn?: boolean;
  className?: string;
  buttonLabel?: string;
  openDirectly?: boolean;
  initialMessage?: string;
  onSelfAction?: () => void;
  tone?: "primary" | "contrast";
  analyticsSource?: "search" | "profile" | "profile_service" | "booking" | "favorites" | "unknown";
};

export function DirectChatLauncher({
  professionalId = "",
  professionalName,
  bookingId,
  projectId,
  proposalId,
  contextTitle,
  isOwn = false,
  className = "",
  buttonLabel,
  initialMessage = "",
  onSelfAction,
  tone = "primary",
  analyticsSource = "unknown",
}: DirectChatLauncherProps) {
  const locale = useLocale();
  const isEn = locale === "en";
  const nativeApp = useNativeApp();
  const [loading, setLoading] = useState(false);
  const whatsappLabel = isEn ? "Contact on WhatsApp" : "Contactar por WhatsApp";
  const { requireAccount, modals } = useContactGate({ professionalName, intent: "whatsapp", professionalId, source: analyticsSource });

  if (nativeApp) {
    const safeLabel = buttonLabel && !/whatsapp/i.test(buttonLabel) ? buttonLabel : undefined;
    return (
      <MessageLauncher
        professionalId={professionalId}
        professionalName={professionalName}
        bookingId={bookingId}
        projectId={projectId}
        proposalId={proposalId}
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
          proposalId,
          contextTitle,
          initialMessage,
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
      window.alert(isEn ? "No WhatsApp number is available for this contact." : "No hay un numero de WhatsApp disponible para este contacto.");
    } finally {
      setLoading(false);
    }
  }

  function onClick() {
    if (isOwn) {
      onSelfAction?.();
      return;
    }
    // Guests register in place; the link is requested again from the "Abrir
    // WhatsApp" tap so the new tab is never popup-blocked.
    if (!requireAccount(() => void openChat())) return;
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
        "bg-[#25d366] text-white hover:bg-[#1da851] focus-visible:ring-[#25d366]",
      )}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <WhatsAppLogo />}
      {buttonLabel || whatsappLabel}
    </button>
    {modals}
    </>
  );
}

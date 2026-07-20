"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useLocale } from "next-intl";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { trackInteraction } from "@/lib/analytics/interaction-events";

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

function WhatsAppLogo({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={className} fill="currentColor">
      <path d="M16.02 3.2A12.7 12.7 0 0 0 5.2 22.56L3.6 28.8l6.39-1.67A12.68 12.68 0 1 0 16.02 3.2Zm0 22.98a10.55 10.55 0 0 1-5.38-1.48l-.39-.23-3.8 1 1.02-3.7-.25-.39a10.53 10.53 0 1 1 8.8 4.8Zm5.79-7.9c-.32-.16-1.88-.93-2.17-1.04-.29-.1-.5-.16-.71.16-.21.31-.82 1.03-1 1.24-.18.21-.37.24-.68.08-.32-.16-1.34-.49-2.55-1.57-.94-.84-1.58-1.88-1.76-2.2-.18-.31-.02-.48.14-.64.14-.14.32-.37.47-.55.16-.18.21-.31.32-.52.1-.21.05-.39-.03-.55-.08-.16-.71-1.7-.97-2.33-.26-.62-.52-.53-.71-.54h-.6c-.21 0-.55.08-.84.39-.29.32-1.1 1.08-1.1 2.62 0 1.54 1.13 3.03 1.28 3.24.16.21 2.22 3.39 5.38 4.75.75.32 1.34.52 1.8.66.76.24 1.45.21 1.99.13.61-.09 1.88-.77 2.14-1.51.26-.74.26-1.38.18-1.51-.08-.13-.29-.21-.61-.37Z" />
    </svg>
  );
}

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
  analyticsSource = "unknown",
}: DirectChatLauncherProps) {
  const locale = useLocale();
  const isEn = locale === "en";
  const [loading, setLoading] = useState(false);
  const whatsappLabel = isEn ? "Contact on WhatsApp" : "Contactar por WhatsApp";

  async function openChat() {
    if (isOwn) {
      onSelfAction?.();
      return;
    }

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

  return (
    <button
      type="button"
      onClick={() => void openChat()}
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
  );
}

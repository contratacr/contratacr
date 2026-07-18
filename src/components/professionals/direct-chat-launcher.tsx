"use client";

import { useState } from "react";
import { Loader2, MessageSquareMore } from "lucide-react";
import { useLocale } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useAuth } from "@/hooks/use-auth";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
}: DirectChatLauncherProps) {
  const locale = useLocale();
  const router = useRouter();
  const { user } = useAuth();
  const isEn = locale === "en";
  const [loading, setLoading] = useState(false);
  const sendMessageLabel = isEn ? "Send message" : "Enviar mensaje";

  function chatHref() {
    const params = new URLSearchParams({ draftChat: "1" });
    if (professionalId) params.set("professionalId", professionalId);
    if (professionalName) params.set("professionalName", professionalName);
    if (bookingId) params.set("bookingId", bookingId);
    if (projectId) params.set("projectId", projectId);
    if (proposalId) params.set("proposalId", proposalId);
    if (contextTitle) params.set("contextTitle", contextTitle);
    if (initialMessage) params.set("draftMessage", initialMessage);
    return `/mensajes?${params.toString()}`;
  }

  function openChat() {
    if (isOwn) {
      onSelfAction?.();
      return;
    }
    const href = chatHref();
    if (!user) {
      router.push(`/login?next=${encodeURIComponent(href)}`);
      return;
    }
    setLoading(true);
    router.push(href);
  }

  return (
    <button
      type="button"
      onClick={openChat}
      disabled={loading}
      aria-busy={loading}
      className={cn(
        buttonVariants({ variant: tone === "contrast" ? "chat" : "default", size: "md" }),
        // Cyan is the default when messaging is the main action. Navy is opt-in only
        // when messaging sits beside another positive workflow action.
        "gap-1.5 disabled:opacity-60",
        className || "w-full rounded-full py-2.5 text-[13px] font-semibold",
      )}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquareMore className="h-4 w-4" />}
      {buttonLabel || sendMessageLabel}
    </button>
  );
}

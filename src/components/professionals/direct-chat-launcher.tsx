"use client";

import { useState } from "react";
import { Loader2, MessageSquareMore } from "lucide-react";
import { useLocale } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useAuth } from "@/hooks/use-auth";
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
}: DirectChatLauncherProps) {
  const locale = useLocale();
  const router = useRouter();
  const { user } = useAuth();
  const isEn = locale === "en";
  const [loading, setLoading] = useState(false);
  const sendMessageLabel = isEn ? "Send message" : "Enviar mensaje";

  function chatHref() {
    const params = new URLSearchParams({ tab: "chat", draftChat: "1" });
    if (professionalId) params.set("professionalId", professionalId);
    if (professionalName) params.set("professionalName", professionalName);
    if (bookingId) params.set("bookingId", bookingId);
    if (projectId) params.set("projectId", projectId);
    if (proposalId) params.set("proposalId", proposalId);
    if (contextTitle) params.set("contextTitle", contextTitle);
    if (initialMessage) params.set("draftMessage", initialMessage);
    return `/dashboard/profesional?${params.toString()}`;
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
        // Navy consistently identifies entry into person-to-person chat. Cyan remains
        // reserved for the primary workflow action and the send button inside the chat.
        "inline-flex items-center justify-center gap-1.5 bg-[#162543] text-white transition-colors hover:bg-[#233a5f] disabled:opacity-60",
        className || "w-full rounded-full py-2.5 text-[13px] font-semibold",
      )}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquareMore className="h-4 w-4" />}
      {buttonLabel || sendMessageLabel}
    </button>
  );
}

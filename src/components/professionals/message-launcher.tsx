"use client";

import { MessageSquareText } from "lucide-react";
import { useLocale } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";

type MessageLauncherProps = {
  professionalId?: string;
  professionalName: string;
  bookingId?: string;
  projectId?: string;
  proposalId?: string;
  contextTitle?: string;
  isOwn?: boolean;
  className?: string;
  buttonLabel?: string;
  initialMessage?: string;
  onSelfAction?: () => void;
  tone?: "primary" | "contrast";
};

function buildDraftHref({
  professionalId,
  professionalName,
  bookingId,
  projectId,
  proposalId,
  contextTitle,
  initialMessage,
}: MessageLauncherProps, isEn: boolean) {
  const params = new URLSearchParams({ draftChat: "1" });
  const contextKind = bookingId ? "booking" : proposalId ? "proposal" : projectId ? "project" : "profile";
  const defaultDraftMessage = initialMessage || (contextTitle && contextKind !== "profile"
    ? isEn
      ? `Hi, I am writing about the ${contextKind === "booking" ? "request" : contextKind === "proposal" ? "proposal" : "post"}: ${contextTitle}.`
      : `Hola, te escribo por ${contextKind === "booking" ? "la solicitud" : contextKind === "proposal" ? "la propuesta" : "la publicación"}: ${contextTitle}.`
    : "");
  if (professionalId) params.set("professionalId", professionalId);
  if (professionalName) params.set("professionalName", professionalName);
  if (bookingId) params.set("bookingId", bookingId);
  if (projectId) params.set("projectId", projectId);
  if (proposalId) params.set("proposalId", proposalId);
  if (contextTitle) params.set("contextTitle", contextTitle);
  if (defaultDraftMessage) params.set("draftMessage", defaultDraftMessage);
  return `/mensajes?${params.toString()}`;
}

export function MessageLauncher(props: MessageLauncherProps) {
  const {
    professionalId = "",
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
  } = props;
  const locale = useLocale();
  const isEn = locale === "en";
  const router = useRouter();
  const { user } = useAuth();
  const label = buttonLabel || (isEn ? "Send message" : "Enviar mensaje");

  async function openMessage() {
    if (isOwn) {
      onSelfAction?.();
      return;
    }

    const draftHref = buildDraftHref(props, isEn);
    if (!user) {
      router.push(`/login?redirect=${encodeURIComponent(draftHref)}`);
      return;
    }

    router.push(draftHref);
  }

  return (
    <button
      type="button"
      onClick={() => void openMessage()}
      className={cn(
        buttonVariants({ variant: tone === "contrast" ? "chat" : "default", size: "md" }),
        "gap-1.5 disabled:opacity-60",
        className || "w-full rounded-full py-2.5 text-[13px] font-semibold",
      )}
    >
      <MessageSquareText className="h-5 w-5 shrink-0" strokeWidth={2.25} />
      {label}
    </button>
  );
}

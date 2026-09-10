"use client";

import { useState } from "react";
import { Loader2, MessageSquareText } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Button, buttonVariants } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { ClientRegistrationModal } from "@/components/auth/client-registration-modal";
import { trackInteraction } from "@/lib/analytics/interaction-events";
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
  tone?: "primary" | "contrast" | "outline";
};

function buildDraftHref({
  professionalId,
  professionalName,
  bookingId,
  projectId,
  proposalId,
  contextTitle,
  initialMessage,
}: MessageLauncherProps) {
  const params = new URLSearchParams({ draftChat: "1" });
  if (typeof window !== "undefined") {
    const origin = (window.location.pathname + window.location.search).replace(/^\/(?:es|en)(?=\/|$)/u, "") || "/";
    params.set("back", origin);
  }
  if (professionalId) params.set("professionalId", professionalId);
  if (professionalName) params.set("professionalName", professionalName);
  if (bookingId) params.set("bookingId", bookingId);
  if (projectId) params.set("projectId", projectId);
  if (proposalId) params.set("proposalId", proposalId);
  if (contextTitle) params.set("contextTitle", contextTitle);
  if (initialMessage) params.set("draftMessage", initialMessage);
  return `/mensajes?${params.toString()}`;
}

export function MessageLauncher(props: MessageLauncherProps) {
  const {
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
  } = props;
  const locale = useLocale();
  const isEn = locale === "en";
  const t = useTranslations("mensajeInvitado");
  const router = useRouter();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  // Sin cuenta, primero se escribe y después se pide identificarse: mandarla a
  // la pantalla de ingresar antes de escribir la sacaba del perfil y casi nadie
  // volvía. Aquí no se sale de la página en ningún momento.
  const [redactando, setRedactando] = useState(false);
  const [borrador, setBorrador] = useState("");
  const [registrando, setRegistrando] = useState(false);
  const label = buttonLabel || (isEn ? "Send message" : "Enviar mensaje");

  const mensajeSugerido = initialMessage || (contextTitle && (bookingId || projectId || proposalId)
    ? (isEn ? `Hi, I'm writing about "${contextTitle}".` : `Hola, te escribo por "${contextTitle}".`)
    : "");

  async function abrirHilo(texto: string) {
    setLoading(true);
    try {
      const response = await fetch("/api/direct-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          professionalId, bookingId, projectId, proposalId, contextTitle,
          initialMessage: texto, openConversation: true,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (response.ok && payload.conversationId) {
        const origin = (window.location.pathname + window.location.search).replace(/^\/(?:es|en)(?=\/|$)/u, "") || "/";
        router.push(`/mensajes?conversation=${encodeURIComponent(String(payload.conversationId))}&back=${encodeURIComponent(origin)}${texto ? `&draftMessage=${encodeURIComponent(texto)}` : ""}`);
        return;
      }
      router.push(buildDraftHref({ ...props, initialMessage: texto }));
    } finally {
      setLoading(false);
    }
  }

  async function openMessage() {
    if (isOwn) {
      onSelfAction?.();
      return;
    }
    if (!user) {
      trackInteraction({
        type: "contact_gate_shown",
        professionalId: professionalId ?? null,
        source: "profile",
        metadata: { channel: "message" },
      });
      setBorrador(mensajeSugerido);
      setRedactando(true);
      return;
    }
    await abrirHilo(mensajeSugerido);
  }

  const modales = (
    <>
      {redactando && (
        <Modal
          open
          onClose={() => setRedactando(false)}
          title={t("titulo", { name: (professionalName || "").trim().split(/\s+/)[0] || professionalName })}
          subtitle={t("subtitulo")}
          size="sm"
          closeLabel={t("cerrar")}
          footer={(
            <Button
              type="button"
              size="lg"
              className="w-full"
              disabled={!borrador.trim() || loading}
              loading={loading}
              onClick={() => setRegistrando(true)}
            >
              {t("enviar")}
            </Button>
          )}
        >
          <label className="block">
            <span className="mb-2 block text-[13px] font-bold text-[#162543]">{t("etiqueta")}</span>
            <textarea
              value={borrador}
              onChange={(e) => setBorrador(e.target.value.slice(0, 1000))}
              rows={5}
              autoFocus
              placeholder={t("marcador")}
              className="w-full resize-none rounded-xl border border-[#e5e7eb] bg-white px-3.5 py-2.5 text-[15px] text-[#162543] placeholder:text-[#8f9aaa] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#009FD9]"
            />
          </label>
          <p className="mt-2 text-[12px] leading-snug text-[#68778d]">{t("nota")}</p>
        </Modal>
      )}
      <ClientRegistrationModal
        open={registrando}
        onClose={() => setRegistrando(false)}
        onSuccess={() => {
          setRegistrando(false);
          setRedactando(false);
          void abrirHilo(borrador.trim());
        }}
        professionalName={professionalName}
        intent="message"
      />
    </>
  );

  return (
    <>
    {modales}
    <button
      type="button"
      onClick={() => void openMessage()}
      disabled={loading}
      aria-busy={loading}
      className={cn(
        buttonVariants({ variant: tone === "contrast" ? "chat" : tone === "outline" ? "secondary" : "default", size: "md" }),
        "gap-1.5 disabled:opacity-60",
        className || "w-full rounded-full py-2.5 text-[13px] font-semibold",
      )}
    >
      {loading ? <Loader2 className="h-5 w-5 shrink-0 animate-spin" /> : <MessageSquareText className="h-5 w-5 shrink-0" strokeWidth={2.25} />}
      {label}
    </button>
    </>
  );
}

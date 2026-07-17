"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Loader2, MessageCircle, Send, X } from "lucide-react";
import { useLocale } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";

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
  openDirectly = false,
  initialMessage = "",
  onSelfAction,
}: DirectChatLauncherProps) {
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const isEn = locale === "en";
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const firstName = professionalName.split(" ")[0] || professionalName;

  useEffect(() => {
    if (!user || searchParams.get("chatProfessional") !== professionalId) return;
    queueMicrotask(() => setOpen(true));
    const url = new URL(window.location.href);
    url.searchParams.delete("chatProfessional");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }, [professionalId, searchParams, user]);

  async function openChat() {
    if (isOwn) {
      onSelfAction?.();
      return;
    }
    if (!user) {
      const target = new URL(window.location.href);
      target.searchParams.set("chatProfessional", professionalId);
      const next = encodeURIComponent(`${target.pathname}${target.search}`);
      router.push(`/login?next=${next}`);
      return;
    }
    if (openDirectly) {
      setLoading(true);
      setError("");
      try {
        const res = await fetch("/api/direct-chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            professionalId,
            bookingId,
            projectId,
            proposalId,
            contextTitle,
            initialMessage,
            openConversation: true,
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || (isEn ? "Could not open the chat." : "No se pudo abrir el chat."));
        router.push(`/dashboard/profesional?tab=chat&conversation=${json.conversationId}`);
      } catch (err) {
        setMessage(initialMessage);
        setError(err instanceof Error ? err.message : isEn ? "Could not open the chat." : "No se pudo abrir el chat.");
        setOpen(true);
      } finally {
        setLoading(false);
      }
      return;
    }
    setOpen(true);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const body = message.trim();
    if (!body) {
      setError(isEn ? "Write a message." : "Escribe un mensaje.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/direct-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          professionalId,
          bookingId,
          projectId,
          proposalId,
          contextTitle,
          message: body,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || (isEn ? "Could not send the message." : "No se pudo enviar el mensaje."));
      setOpen(false);
      setMessage("");
      router.push(`/dashboard/profesional?tab=chat&conversation=${json.conversationId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : isEn ? "Could not send the message." : "No se pudo enviar el mensaje.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void openChat()}
        disabled={loading}
        aria-busy={loading}
        className={className || "w-full inline-flex items-center justify-center gap-1.5 rounded-full bg-[#162543] py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-[#233a5f]"}
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
        {buttonLabel || (isEn ? "Message" : "Enviar mensaje")}
      </button>

      {open && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/45 p-3 sm:items-center">
          <div className="w-full max-w-md overflow-hidden rounded-[28px] bg-white shadow-2xl">
            <div className="flex items-center gap-3 border-b border-[#e6eef4] px-5 py-4">
              <span className="grid h-11 w-11 place-items-center rounded-full bg-[#e8f8ff] text-[#009FD9]">
                <MessageCircle className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-extrabold text-[#162543]">
                  {isEn ? `Message ${firstName}` : `Mensaje para ${firstName}`}
                </p>
                <p className="text-xs font-semibold text-[#64748b]">
                  {contextTitle || (isEn ? "This conversation stays organized in ContrataCR." : "La conversación quedará organizada en ContrataCR.")}
                </p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="grid h-9 w-9 place-items-center rounded-full text-[#64748b] hover:bg-[#f3f7fa]">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={submit} className="space-y-4 p-5">
              <label className="block">
                <span className="text-sm font-bold text-[#162543]">{isEn ? "Message" : "Mensaje"}</span>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={5}
                  maxLength={500}
                  placeholder={isEn ? "Hi, I saw your profile on ContrataCR..." : "Hola, vi tu perfil en ContrataCR..."}
                  className="mt-2 w-full resize-none rounded-2xl border border-[#d8e5ee] px-4 py-3 text-sm font-medium text-[#162543] outline-none focus:border-[#009FD9] focus:ring-4 focus:ring-[#EAF7FD]"
                />
              </label>
              {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</p>}
              <div className="flex items-center justify-end gap-2">
                <button type="button" onClick={() => setOpen(false)} className="rounded-full px-4 py-2 text-sm font-bold text-[#64748b] hover:bg-[#f3f7fa]">
                  {isEn ? "Cancel" : "Cancelar"}
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex items-center gap-2 rounded-full bg-[#009FD9] px-5 py-2.5 text-sm font-extrabold text-white hover:bg-[#008fc4] disabled:opacity-60"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  {isEn ? "Send" : "Enviar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

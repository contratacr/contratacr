"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { Ban, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SuccessIcon } from "@/components/ui/success-icon";
import { useAuth } from "@/hooks/use-auth";

/**
 * BLOQUEAR A UN USUARIO (6-oct-2026, regla 1.2 de Apple). Mismo lienzo que
 * «Reportar». Al confirmar, la API guarda el bloqueo, cierra la conversación
 * y avisa al equipo; `onBloqueado` quita el contenido de la pantalla al instante.
 */
export function BloquearUsuarioModal({ nombre, profileId, professionalId, slug, projectId, onClose, onBloqueado }: {
  nombre: string;
  profileId?: string | null;
  professionalId?: string | null;
  slug?: string | null;
  projectId?: string | null;
  onClose: () => void;
  onBloqueado?: () => void;
}) {
  const t = useTranslations("bloqueo");
  const { user } = useAuth();
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [listo, setListo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  async function bloquear() {
    if (!user) {
      const prefijo = /^\/en(?=\/|$)/.test(window.location.pathname) ? "/en" : "";
      window.location.assign(`${prefijo}/login?redirect=${encodeURIComponent(window.location.pathname)}`);
      return;
    }
    setEnviando(true); setError(null);
    try {
      const res = await fetch("/api/block", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profileId, professionalId, slug, projectId, reason: motivo }) });
      if (!res.ok) { setError(t("error")); return; }
      setListo(true);
      window.dispatchEvent(new CustomEvent("ccr:usuario-bloqueado"));
    } catch { setError(t("error")); } finally { setEnviando(false); }
  }

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="app-modal-screen app-sheet-compact-screen fixed inset-0 z-[1500] flex items-end justify-center bg-black/50 sm:items-center sm:px-4" onClick={onClose}>
      <div className="app-bottom-sheet app-sheet-compact relative max-h-[92vh] w-full overflow-y-auto overscroll-contain rounded-t-2xl bg-white shadow-2xl sm:max-w-[440px] sm:rounded-2xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="bloquear-titulo">
        <div className="flex items-center justify-between border-b border-[#e5e7eb] px-6 pb-4 pt-6">
          <div className="flex items-center gap-2.5">
            <Ban className="h-5 w-5 shrink-0 text-red-500" />
            <h2 id="bloquear-titulo" className="text-base font-bold text-[#162543]">{listo ? t("listo") : t("titulo", { nombre })}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label={t("cancelar")} className="rounded-full p-1.5 text-[#68778d] transition-colors hover:bg-[#f3f4f6] hover:text-[#374151]"><X className="h-5 w-5" /></button>
        </div>
        {listo ? (
          <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
            <SuccessIcon size={56} />
            <p className="text-sm text-[#6b7280]">{t("listoTexto")}</p>
            <Button size="lg" className="mt-2 w-full" onClick={() => { onBloqueado?.(); onClose(); }}>OK</Button>
          </div>
        ) : (
          <div className="flex flex-col gap-4 px-6 py-5">
            <p className="text-sm leading-relaxed text-[#374151]">{t("texto")}</p>
            <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={500} placeholder={t("motivo")} className="min-h-[88px] w-full resize-none rounded-xl border border-[#e5e7eb] px-3.5 py-2.5 text-[15px] text-[#162543] placeholder:text-[#8f9aaa] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#009FD9]" />
            {!user && <p className="text-xs text-[#6b7280]">{t("entrar")}</p>}
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex gap-2">
              <Button variant="outline" size="lg" className="flex-1" onClick={onClose}>{t("cancelar")}</Button>
              <Button size="lg" className="flex-1 bg-red-600 hover:bg-red-700" loading={enviando} disabled={enviando} onClick={() => void bloquear()}>{t("boton")}</Button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

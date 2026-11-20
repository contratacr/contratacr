"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { soltarFoco } from "@/lib/soltar-foco";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { serviceSuggestionEditorLink } from "@/lib/service-suggestion-request";
import { Check, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";

// Shared "¿No ves tu categoría? / ¿No ves tu profesión?" suggestion box.
// Used by category search and services editors so the UX and behavior stay identical.
export function CategorySuggestionBox({
  notListedLabel,
  placeholder,
  sendingLabel,
  cancelLabel,
  thanksLabel,
  className,
  prominent = false,
  variante = "pastilla",
  rowTitle,
  defaultName = "",
  onActiveChange,
  forOffering = false,
}: {
  forOffering?: boolean;
  notListedLabel: string;
  placeholder: string;
  sendLabel: string;
  sendingLabel: string;
  cancelLabel: string;
  thanksLabel: string;
  className?: string;
  /** Prominent = no loose top divider + pill CTA style for contained cards. */
  prominent?: boolean;
  /** Botón: ocupa el ancho de su barra, como el de publicar en las demás pantallas. */
  variante?: "pastilla" | "boton";
  /** Título que encabeza el panel al abrirse. */
  rowTitle?: string;
  defaultName?: string;
  /** Lets hosts (like dropdowns) keep open while suggestion input is focused. */
  onActiveChange?: (active: boolean) => void;
}) {
  const [suggesting, setSuggesting] = useState(false);
  const [name, setName] = useState("");
  const [sent, setSent] = useState(false);
  const [availableCategory, setAvailableCategory] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const locale = useLocale();
  const tr = useTranslations("serviceRequests");
  const { user } = useAuth();
  const offering = forOffering && !!user;

  useEffect(() => {
    onActiveChange?.(suggesting || sent);
  }, [suggesting, sent, onActiveChange]);

  // ── Acomodar el panel encima del teclado ───────────────────────────────
  // Se apunta al BORDE INFERIOR del panel, no al centro del campo: así el campo
  // y sus dos botones quedan a la vista y el teclado empieza justo debajo de
  // "Cancelar" y "Enviar". La pantalla que lo contiene ya se encoge con el
  // teclado, así que el fondo de su zona desplazable es el borde del teclado.
  //
  // El teclado no aparece de inmediato ni de un salto: llega unos cientos de
  // milisegundos después y mueve todo mientras sube. Por eso no basta un solo
  // ajuste —de ahí el "en veces no se ve el campo"—: se repite mientras el
  // teclado se acomoda y cada vez que el área visible cambia de tamaño.
  const acomodar = useCallback((suave: boolean) => {
    panelRef.current?.scrollIntoView({ behavior: suave ? "smooth" : "auto", block: "end" });
  }, []);

  useEffect(() => {
    if (!suggesting) return;
    const cuadro = requestAnimationFrame(() => acomodar(true));
    const esperas = [160, 380, 620].map((espera) => window.setTimeout(() => acomodar(false), espera));
    const vv = window.visualViewport;
    const alCambiarElArea = () => {
      // Solo mientras se escribe aquí: si el foco ya salió, mover la pantalla
      // sería quitarle el sitio a otra cosa.
      if (panelRef.current?.contains(document.activeElement)) acomodar(false);
    };
    vv?.addEventListener("resize", alCambiarElArea);
    return () => {
      cancelAnimationFrame(cuadro);
      for (const id of esperas) window.clearTimeout(id);
      vv?.removeEventListener("resize", alCambiarElArea);
    };
  }, [suggesting, acomodar]);

  async function send() {
    const clean = name.trim();
    if (!clean) return;
    setSending(true);
    setError("");

    try {
      const response = await fetch("/api/categories/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: clean, locale }),
      });
      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        alreadyApproved?: boolean;
        categoryId?: string;
        error?: string;
      } | null;

      if (!response.ok || !payload?.ok) {
        setError(payload?.error ?? "No se pudo enviar la sugerencia. Inténtalo de nuevo.");
        return;
      }

      soltarFoco();
      setAvailableCategory(payload.alreadyApproved && offering ? payload.categoryId ?? null : null);
      setSent(true);
      setName("");
      setSuggesting(false);
    } catch {
      setError("No se pudo enviar la sugerencia. Inténtalo de nuevo.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      ref={rootRef}
      className={cn(
        variante === "boton"
          ? ""
          : prominent
            ? (suggesting ? "w-full sm:w-auto sm:min-w-[360px]" : "")
            : "border-t border-[#eef2f6] px-3 py-2.5",
        className,
      )}
    >
      {sent ? (
        <div className="space-y-2">
          <p className="inline-flex items-center gap-1.5 text-sm text-[#15803d]">
            <Check className="h-3.5 w-3.5" /> {availableCategory ? tr("alreadyAvailable") : thanksLabel}
          </p>
          {availableCategory && <Link href={serviceSuggestionEditorLink(availableCategory)} className="block text-sm font-bold text-[#009FD9]">{tr("complete")}</Link>}
        </div>
      ) : suggesting ? (
        <div ref={panelRef} className="scroll-mb-4 flex flex-col gap-3">
          {rowTitle && variante === "boton" && (
            <p className="text-sm font-semibold text-[#162543]">{rowTitle}</p>
          )}
          <p className="text-sm leading-5 text-[#52627a]">{tr(offering ? "offerExplanation" : user ? "catalogExplanation" : "guestExplanation")}</p>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                send();
              }
            }}
            placeholder={placeholder}
            autoFocus
            onFocus={() => {
              window.setTimeout(() => acomodar(false), 0);
              window.setTimeout(() => acomodar(false), 240);
            }}
            className="h-12 w-full min-w-0 rounded-xl border border-[#d7e3ee] bg-white px-4 text-[15px] text-[#162543] placeholder:text-[#68778d] transition-shadow focus:border-[#009FD9] focus:outline-none focus:ring-4 focus:ring-[#009FD9]/15"
          />
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => {
                soltarFoco();
                setSuggesting(false);
                setError("");
              }}
              className="h-11 flex-1 rounded-xl border border-[#d7e3ee] bg-white text-sm font-semibold text-[#162543] transition-colors hover:bg-[#f4f7fa]"
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              disabled={!name.trim() || sending}
              onClick={send}
              className="h-11 flex-1 rounded-xl bg-[#009FD9] text-sm font-semibold text-white transition-colors hover:bg-[#0089bb] disabled:cursor-not-allowed disabled:opacity-45"
            >
              {sending ? sendingLabel : tr("request")}
            </button>
          </div>
          {error && <p className="text-xs font-medium text-[#dc2626]">{error}</p>}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            setError("");
            setName(defaultName.trim());
            setSuggesting(true);
          }}
          className={cn(
            variante === "boton"
              ? "flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#009FD9] px-4 text-sm font-bold text-white transition-colors hover:bg-[#0089bb]"
              : prominent
                ? "inline-flex items-center justify-center rounded-full bg-[#009FD9] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0089bb] transition-colors"
                : "text-xs font-medium text-[#009FD9] hover:underline",
          )}
        >
          {variante === "boton" ? (
            <>
              <Plus className="h-4 w-4 shrink-0" />
              {notListedLabel}
            </>
          ) : notListedLabel}
        </button>
      )}
    </div>
  );
}

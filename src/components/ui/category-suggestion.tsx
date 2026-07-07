"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale } from "next-intl";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";

// Shared "¿No ves tu categoría? / ¿No ves tu profesión?" suggestion box.
// Used by category search and services editors so the UX and behavior stay identical.
export function CategorySuggestionBox({
  notListedLabel,
  placeholder,
  sendLabel,
  sendingLabel,
  cancelLabel,
  thanksLabel,
  className,
  prominent = false,
  defaultName = "",
  onActiveChange,
}: {
  notListedLabel: string;
  placeholder: string;
  sendLabel: string;
  sendingLabel: string;
  cancelLabel: string;
  thanksLabel: string;
  className?: string;
  /** Prominent = no loose top divider + pill CTA style for contained cards. */
  prominent?: boolean;
  defaultName?: string;
  /** Lets hosts (like dropdowns) keep open while suggestion input is focused. */
  onActiveChange?: (active: boolean) => void;
}) {
  const [suggesting, setSuggesting] = useState(false);
  const [name, setName] = useState("");
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const locale = useLocale();
  const { user } = useAuth();

  useEffect(() => {
    onActiveChange?.(suggesting || sent);
  }, [suggesting, sent, onActiveChange]);

  useEffect(() => {
    if (!suggesting) return;
    const id = requestAnimationFrame(() => {
      rootRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
    return () => cancelAnimationFrame(id);
  }, [suggesting]);

  async function send() {
    const clean = name.trim();
    if (!clean) return;
    setSending(true);
    setError("");

    try {
      const response = await fetch("/api/categories/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: clean, locale, userId: user?.id }),
      });
      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
      } | null;

      if (!response.ok || !payload?.ok) {
        setError(payload?.error ?? "No se pudo enviar la sugerencia. Inténtalo de nuevo.");
        return;
      }

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
        prominent ? (suggesting ? "w-full sm:w-auto sm:min-w-[360px]" : "") : "border-t border-[#f3f4f6] px-3 py-2.5",
        className,
      )}
    >
      {sent ? (
        <p className="inline-flex items-center gap-1.5 text-sm text-[#15803d]">
          <Check className="h-3.5 w-3.5" /> {thanksLabel}
        </p>
      ) : suggesting ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
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
            className="h-9 min-w-0 flex-1 rounded-lg border border-[#e5e7eb] px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#009FD9]/20"
          />
          <button
            type="button"
            disabled={!name.trim() || sending}
            onClick={send}
            className="h-9 shrink-0 rounded-lg bg-[#009FD9] px-3 text-sm font-medium text-white disabled:opacity-50"
          >
            {sending ? sendingLabel : sendLabel}
          </button>
          <button
            type="button"
            onClick={() => {
              setSuggesting(false);
              setError("");
            }}
            className="h-9 shrink-0 px-2 text-sm text-[#9ca3af] hover:text-[#374151]"
          >
            {cancelLabel}
          </button>
          {error && <p className="w-full text-xs font-medium text-[#dc2626] sm:col-span-3">{error}</p>}
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
            prominent
              ? "inline-flex items-center justify-center rounded-full bg-[#009FD9] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0089bb] transition-colors"
              : "text-xs font-medium text-[#009FD9] hover:underline",
          )}
        >
          {notListedLabel}
        </button>
      )}
    </div>
  );
}

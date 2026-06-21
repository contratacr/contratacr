"use client";

import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

// Shared "¿No ves tu categoría? / ¿No ves tu profesión?" suggestion box.
// ONE implementation so publicar-proyecto (CategorySearch) and agregar-profesión
// (services-editor) have IDENTICAL design + behavior:
//   link → type the name → submit → POST /api/categories/suggest (admin ticket)
//   → "Gracias. Enviamos tu sugerencia al equipo para revisión."
// The submitted name lands in `category_suggestions` (pending) where the admin
// reviews it and, on approval, it becomes a real selectable/searchable category.
// There is NO "otro" auto-matching: a suggestion never creates a usable category
// on its own, so two unrelated custom entries can never match each other.
export function CategorySuggestionBox({
  notListedLabel,
  placeholder,
  sendLabel,
  sendingLabel,
  cancelLabel,
  thanksLabel,
  className,
  prominent = false,
  onActiveChange,
}: {
  notListedLabel: string;
  placeholder: string;
  sendLabel: string;
  sendingLabel: string;
  cancelLabel: string;
  thanksLabel: string;
  className?: string;
  /** Prominent = no loose top divider + the trigger is a pill CTA (for the /categorias
   *  contained card). Default (compact) keeps the inline text-link style used in forms. */
  prominent?: boolean;
  /** Fires when the box is "active" (the inline input is open or a suggestion was just
   *  sent). Lets a host like the navbar dropdown keep itself open while the user types
   *  the suggestion, instead of closing on the search input's blur. */
  onActiveChange?: (active: boolean) => void;
}) {
  const [suggesting, setSuggesting] = useState(false);
  const [name, setName] = useState("");
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    onActiveChange?.(suggesting || sent);
  }, [suggesting, sent, onActiveChange]);

  // When the box EXPANDS (the inline name input opens) it usually sits at the bottom of
  // a scroll area (the category dropdown / the publish form body), so the revealed input
  // + Enviar button land below the fold. Smooth-scroll the box into view so the user sees
  // everything without scrolling by hand (rAF lets the expanded content lay out first).
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
    try {
      await fetch("/api/categories/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: clean }),
      });
      setSent(true);
      setName("");
      setSuggesting(false);
    } catch {
      /* best-effort — the thank-you only shows on a resolved request */
    } finally {
      setSending(false);
    }
  }

  return (
    <div ref={rootRef} className={cn(prominent ? "" : "border-t border-[#f3f4f6] px-3 py-2.5", className)}>
      {sent ? (
        <p className="inline-flex items-center gap-1.5 text-sm text-[#15803d]">
          <Check className="h-3.5 w-3.5" /> {thanksLabel}
        </p>
      ) : suggesting ? (
        <div className="flex items-center gap-2">
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
            onClick={() => setSuggesting(false)}
            className="h-9 shrink-0 px-2 text-sm text-[#9ca3af] hover:text-[#374151]"
          >
            {cancelLabel}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setSuggesting(true)}
          className={cn(
            prominent
              ? "inline-flex items-center justify-center rounded-full bg-[#009FD9] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#0089bb] transition-colors"
              : "text-xs font-medium text-[#009FD9] hover:underline"
          )}
        >
          {notListedLabel}
        </button>
      )}
    </div>
  );
}

"use client";

import { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocale, useTranslations } from "next-intl";
import { X } from "lucide-react";
import { useAnchoredPosition } from "@/components/ui/anchored-dropdown";
import { LANGUAGES, languageLabel } from "@/lib/data/languages";

// Modern chip/tag multi-select with autocomplete over the full language list. Selected
// languages render as removable pills inside the field; typing filters the rest. The
// suggestions dropdown is PORTALED to <body> and positioned `fixed` from the field's rect, so
// it can NEVER be clipped by a card/section with `overflow:hidden` (the old `absolute z-20`
// dropdown was getting cut off). Available languages + save behavior are unchanged.
interface Props {
  value: string[];
  onChange: (next: string[]) => void;
}

function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export function LanguagesInput({ value, onChange }: Props) {
  const t = useTranslations("inputs");
  const locale = useLocale();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const suggestions = useMemo(() => {
    const q = normalize(query.trim());
    // Already-selected languages never appear again in the suggestions.
    return LANGUAGES.filter(
      (l) => !value.includes(l.id) && (q === "" || normalize(l.label).includes(q) || normalize(l.labelEn).includes(q))
    ).slice(0, 8);
  }, [query, value]);

  // Portaled dropdown positioned `fixed` from the field's rect via the shared,
  // keyboard-aware helper (opens below, flips up only with no room; never covers
  // the field; recomputes on scroll/resize + keyboard show/hide).
  const dropdownOpen = open && suggestions.length > 0;
  const pos = useAnchoredPosition(containerRef, dropdownOpen, 264);

  function add(id: string) {
    if (!value.includes(id)) onChange([...value, id]);
    setQuery("");
    setHighlight(0);
    setOpen(false);
    inputRef.current?.focus();
  }

  function remove(id: string) {
    onChange(value.filter((l) => l !== id));
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#e5e7eb] bg-white p-2.5 transition-all focus-within:ring-2 focus-within:ring-[#009FD9] focus-within:border-transparent">
        {value.map((id) => (
          <span key={id} className="inline-flex items-center gap-1 rounded-full bg-[#EBF5FB] py-1 pl-3 pr-1.5 text-sm font-medium text-[#0089bb]">
            {languageLabel(id, locale)}
            <button type="button" onClick={() => remove(id)} className="grid h-4 w-4 place-items-center rounded-full text-[#0089bb]/70 hover:bg-[#009FD9]/20 hover:text-[#0089bb] transition-colors" aria-label={t("remove")}>
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); setHighlight(0); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setHighlight((h) => Math.min(h + 1, suggestions.length - 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setHighlight((h) => Math.max(h - 1, 0)); }
            else if (e.key === "Enter" && suggestions[highlight]) { e.preventDefault(); add(suggestions[highlight].id); }
            else if (e.key === "Escape") { setOpen(false); }
            else if (e.key === "Backspace" && query === "" && value.length > 0) { remove(value[value.length - 1]); }
          }}
          placeholder={value.length === 0 ? t("languagePlaceholder") : t("addAnotherLanguage")}
          role="combobox"
          aria-expanded={dropdownOpen}
          aria-autocomplete="list"
          className="min-w-[120px] flex-1 bg-transparent py-1 text-sm text-[#111827] placeholder:text-[#9ca3af] focus:outline-none focus-visible:outline-none"
        />
      </div>

      {/* Portaled to <body> so the card's overflow can't clip it; matches the field width. */}
      {dropdownOpen && pos && typeof document !== "undefined" && createPortal(
        <ul
          style={{ position: "fixed", left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom, maxHeight: pos.maxH, zIndex: 9999 }}
          className="overflow-auto rounded-xl border border-[#e5e7eb] bg-white py-1 shadow-2xl"
          role="listbox"
        >
          {suggestions.map((s, i) => (
            <li key={s.id}>
              <button
                type="button"
                role="option"
                aria-selected={i === highlight}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setHighlight(i)}
                onClick={() => add(s.id)}
                className={`w-full px-3.5 py-2.5 text-left text-sm transition-colors ${i === highlight ? "bg-[#EBF5FB] text-[#0089bb]" : "text-[#374151] hover:bg-[#f9fafb]"}`}
              >
                {languageLabel(s.id, locale)}
              </button>
            </li>
          ))}
        </ul>,
        document.body
      )}
    </div>
  );
}

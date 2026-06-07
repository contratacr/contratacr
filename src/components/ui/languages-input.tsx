"use client";

import { useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { LANGUAGES, languageLabel } from "@/lib/data/languages";

// Optional chip/tag input with autocomplete over the full language list.
// Selecting a suggestion adds a removable chip; more can be added.
interface Props {
  value: string[];
  onChange: (next: string[]) => void;
}

function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export function LanguagesInput({ value, onChange }: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const suggestions = useMemo(() => {
    const q = normalize(query.trim());
    return LANGUAGES.filter((l) => !value.includes(l.id) && (q === "" || normalize(l.label).includes(q))).slice(0, 8);
  }, [query, value]);

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
    <div className="relative">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#e5e7eb] bg-white p-2 focus-within:border-[#009FD9] transition-all">
        {value.map((id) => (
          <span key={id} className="inline-flex items-center gap-1.5 rounded-lg bg-[#EBF5FB] text-[#0089bb] text-sm font-medium pl-2.5 pr-1.5 py-1">
            {languageLabel(id)}
            <button type="button" onClick={() => remove(id)} className="rounded-md p-0.5 hover:bg-[#009FD9]/20 transition-colors" aria-label="Quitar">
              <X className="h-3.5 w-3.5" />
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
            else if (e.key === "Backspace" && query === "" && value.length > 0) { remove(value[value.length - 1]); }
          }}
          placeholder={value.length === 0 ? "Escribí un idioma… ej. Inglés" : "Agregar otro…"}
          className="flex-1 min-w-[120px] bg-transparent text-sm text-[#111827] placeholder:text-[#9ca3af] focus:outline-none py-1"
        />
      </div>

      {open && suggestions.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full max-h-56 overflow-auto rounded-xl border border-[#e5e7eb] bg-white shadow-lg py-1">
          {suggestions.map((s, i) => (
            <li key={s.id}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => add(s.id)}
                className={`w-full text-left px-3 py-2 text-sm transition-colors ${i === highlight ? "bg-[#EBF5FB] text-[#0089bb]" : "text-[#374151] hover:bg-[#f9fafb]"}`}
              >
                {s.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Search, X, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CATEGORY_GROUPS,
  OTHER_CATEGORY,
  searchCategories,
  getCategoryLabel,
  normalizeText,
} from "@/lib/data/categories";

interface CategorySearchProps {
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  error?: string;
  className?: string;
}

export function CategorySearch({
  value,
  onChange,
  placeholder = "Escribí tu especialidad o buscá…",
  error,
  className,
}: CategorySearchProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedLabel = value ? getCategoryLabel(value) : "";

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Close on Escape
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") { setOpen(false); setQuery(""); }
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  function handleSelect(id: string) {
    onChange(id);
    setOpen(false);
    setQuery("");
  }

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation();
    onChange("");
    setQuery("");
    setOpen(false);
  }

  function openDropdown() {
    setOpen(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  const results = searchCategories(query);

  // Group results by groupLabel for display
  const grouped = query
    ? Object.entries(
        results.reduce<Record<string, typeof results>>((acc, item) => {
          const key = item.groupLabel;
          acc[key] = acc[key] ?? [];
          acc[key].push(item);
          return acc;
        }, {})
      )
    : CATEGORY_GROUPS.map((g) => [g.label, g.items.map((i) => ({ ...i, groupId: g.id, groupLabel: g.label }))] as [string, typeof results]);

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      {/* Trigger button */}
      <button
        type="button"
        onClick={openDropdown}
        className={cn(
          "w-full flex items-center justify-between h-10 px-3 rounded-xl border text-sm text-left transition-all bg-white",
          error ? "border-red-400" : "border-[#e5e7eb]",
          open ? "border-[#009FD9] ring-2 ring-[#009FD9]/20" : "hover:border-[#009FD9]/50"
        )}
      >
        {selectedLabel ? (
          <span className="text-[#111827] truncate flex-1">{selectedLabel}</span>
        ) : (
          <span className="text-[#9ca3af] truncate flex-1">{placeholder}</span>
        )}
        <div className="flex items-center gap-1 shrink-0 ml-2">
          {value && (
            <button
              type="button"
              onClick={handleClear}
              className="text-[#9ca3af] hover:text-[#374151] p-0.5"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          <ChevronDown className={cn("h-4 w-4 text-[#9ca3af] transition-transform", open && "rotate-180")} />
        </div>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-[#e5e7eb] rounded-xl shadow-xl z-50 overflow-hidden flex flex-col max-h-[320px]">
          {/* Search input */}
          <div className="p-2 border-b border-[#f3f4f6]">
            <div className="relative flex items-center">
              <Search className="absolute left-3 h-4 w-4 text-[#9ca3af] pointer-events-none" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Escribí tu servicio… ej. psicólogo, plomero, niñera"
                className="w-full pl-9 pr-3 py-2 text-sm text-[#111827] placeholder:text-[#9ca3af] bg-[#f9fafb] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#009FD9]/20"
              />
              {query && (
                <button type="button" onClick={() => setQuery("")} className="absolute right-2 text-[#9ca3af] hover:text-[#374151]">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Results */}
          <div className="overflow-y-auto flex-1">
            {query && results.length === 0 ? (
              <div className="px-3 py-4 text-center">
                <p className="text-sm text-[#374151] font-medium mb-1">No encontramos esa categoría</p>
                <p className="text-xs text-[#9ca3af]">Seleccioná "Otro servicio" y describí tu especialidad en tu perfil.</p>
              </div>
            ) : (
              grouped.map(([groupLabel, items]) => (
                <div key={groupLabel}>
                  <p className="px-3 pt-3 pb-1 text-[10px] font-bold text-[#9ca3af] uppercase tracking-widest">
                    {groupLabel}
                  </p>
                  {items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleSelect(item.id)}
                      className={cn(
                        "w-full text-left px-3 py-2 text-sm transition-colors",
                        value === item.id
                          ? "bg-[#EBF5FB] text-[#009FD9] font-medium"
                          : "text-[#374151] hover:bg-[#f9fafb]"
                      )}
                    >
                      {query ? (
                        <HighlightMatch text={item.label} query={query} />
                      ) : (
                        item.label
                      )}
                    </button>
                  ))}
                </div>
              ))
            )}

            {/* Otro option always at bottom */}
            <div className="border-t border-[#f3f4f6] mt-1">
              <p className="px-3 pt-3 pb-1 text-[10px] font-bold text-[#9ca3af] uppercase tracking-widest">
                Otro
              </p>
              <button
                type="button"
                onClick={() => handleSelect(OTHER_CATEGORY.id)}
                className={cn(
                  "w-full text-left px-3 py-2.5 text-sm transition-colors",
                  value === OTHER_CATEGORY.id
                    ? "bg-[#EBF5FB] text-[#009FD9] font-medium"
                    : "text-[#374151] hover:bg-[#f9fafb]"
                )}
              >
                Otro servicio — describirlo en mi perfil
              </button>
            </div>
          </div>
        </div>
      )}

      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}

/* ─── Highlight matching text ─── */
function HighlightMatch({ text, query }: { text: string; query: string }) {
  const q = normalizeText(query);
  const normalized = normalizeText(text);
  const idx = normalized.indexOf(q);
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-[#EBF5FB] text-[#009FD9] font-semibold rounded px-0.5">
        {text.slice(idx, idx + q.length)}
      </mark>
      {text.slice(idx + q.length)}
    </>
  );
}

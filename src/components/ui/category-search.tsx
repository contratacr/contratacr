"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useLocale, useTranslations } from "next-intl";
import { Search, X, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { CategorySuggestionBox } from "@/components/ui/category-suggestion";
import { useCustomCategories } from "@/lib/data/use-custom-categories";
import {
  CATEGORY_GROUPS,
  searchCategories,
  getCategoryLabel,
  getCategoryGroupLabel,
  normalizeText,
} from "@/lib/data/categories";

interface CategorySearchProps {
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  error?: string;
  className?: string;
  /** Open the picker immediately on mount (e.g. when revealed by an "add" action). */
  autoFocus?: boolean;
}

export function CategorySearch({
  value,
  onChange,
  placeholder,
  error,
  className,
  autoFocus = false,
}: CategorySearchProps) {
  const t = useTranslations("categorySearch");
  // Load admin-approved custom categories so they're selectable/searchable here too.
  const customCategories = useCustomCategories();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // The dropdown is rendered in a PORTAL (document.body) so it's never clipped
  // by a parent with overflow:hidden/auto (e.g. the accordion Section / card).
  // We position it as `fixed` from the trigger's rect, flipping up if there's
  // more room above than below, and recompute on scroll/resize.
  const [pos, setPos] = useState<{ left: number; width: number; top?: number; bottom?: number; maxH: number } | null>(null);

  const reposition = useCallback(() => {
    const el = containerRef.current;
    if (!el || typeof window === "undefined") return;
    const r = el.getBoundingClientRect();
    const MARGIN = 6, PAD = 12, MAXH = 340;
    const spaceBelow = window.innerHeight - r.bottom;
    const spaceAbove = r.top;
    const openUp = spaceBelow < 240 && spaceAbove > spaceBelow;
    if (openUp) {
      setPos({ left: r.left, width: r.width, bottom: window.innerHeight - r.top + MARGIN, maxH: Math.max(160, Math.min(MAXH, spaceAbove - PAD)) });
    } else {
      setPos({ left: r.left, width: r.width, top: r.bottom + MARGIN, maxH: Math.max(160, Math.min(MAXH, spaceBelow - PAD)) });
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    reposition();
    const onScroll = () => reposition();
    window.addEventListener("scroll", onScroll, true); // capture → catches scrolling parents
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open, reposition]);

  const locale = useLocale();
  const selectedLabel = value ? getCategoryLabel(value, locale) : "";

  // Close on outside click — the portaled panel lives outside containerRef, so
  // check both the trigger container AND the panel before closing.
  useEffect(() => {
    function handler(e: MouseEvent) {
      const t = e.target as Node;
      if (containerRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
      setQuery("");
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
  }

  // Open immediately when revealed by an explicit "add" action.
  useEffect(() => {
    if (autoFocus) setOpen(true);
  }, [autoFocus]);

  // Focus the search input once the portaled panel has mounted.
  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  const results = searchCategories(query);

  // Group results by groupLabel for display. The no-query browse lists the fixed
  // groups + (if any) an "Otras categorías" group of admin-approved customs; the
  // query branch already includes customs via searchCategories.
  const grouped = query
    ? Object.entries(
        results.reduce<Record<string, typeof results>>((acc, item) => {
          const key = item.groupLabel;
          acc[key] = acc[key] ?? [];
          acc[key].push(item);
          return acc;
        }, {})
      )
    : [
        ...CATEGORY_GROUPS.map((g) => [g.label, g.items.map((i) => ({ ...i, groupId: g.id, groupLabel: g.label }))] as [string, typeof results]),
        ...(customCategories.length ? [["Otras categorías", customCategories] as [string, typeof results]] : []),
      ];

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
          <span className="text-[#9ca3af] truncate flex-1">{placeholder ?? t("placeholderDefault")}</span>
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

      {/* Dropdown — portaled to <body> so no parent overflow can clip it. */}
      {open && pos && typeof document !== "undefined" && createPortal(
        <div
          ref={panelRef}
          style={{
            position: "fixed",
            left: pos.left,
            width: pos.width,
            top: pos.top,
            bottom: pos.bottom,
            maxHeight: pos.maxH,
            zIndex: 9999,
          }}
          className="bg-white border border-[#e5e7eb] rounded-xl shadow-2xl overflow-hidden flex flex-col"
        >
          {/* Search input */}
          <div className="p-2 border-b border-[#f3f4f6]">
            <div className="relative flex items-center">
              <Search className="absolute left-3 h-4 w-4 text-[#9ca3af] pointer-events-none" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("searchPlaceholder")}
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
                <p className="text-sm text-[#374151] font-medium mb-1">{t("noResults")}</p>
                <p className="text-xs text-[#9ca3af]">{t("noResultsHint")}</p>
              </div>
            ) : (
              grouped.map(([groupLabel, items]) => (
                <div key={groupLabel}>
                  <p className="px-3 pt-3 pb-1 text-[10px] font-bold text-[#9ca3af] uppercase tracking-widest">
                    {items[0]?.groupId ? getCategoryGroupLabel(items[0].groupId, locale) : groupLabel}
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
                        <HighlightMatch text={getCategoryLabel(item.id, locale)} query={query} />
                      ) : (
                        getCategoryLabel(item.id, locale)
                      )}
                    </button>
                  ))}
                </div>
              ))
            )}

            {/* "¿No ves tu categoría?" — the ONE escape hatch (no selectable
                "Otro"): a tracked suggestion the admin reviews and, on approval,
                turns into a real selectable/searchable category. Shared component
                so it's identical to the agregar-profesión picker. */}
            <CategorySuggestionBox
              className="mt-1"
              notListedLabel={t("notListed")}
              placeholder={t("suggestNamePlaceholder")}
              sendLabel={t("send")}
              sendingLabel={t("sending")}
              cancelLabel={t("cancel")}
              thanksLabel={t("suggestThanks")}
            />
          </div>
        </div>,
        document.body
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

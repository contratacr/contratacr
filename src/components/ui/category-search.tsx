"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useLocale, useTranslations } from "next-intl";
import { Search, X, ChevronDown, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAnchoredPosition } from "@/components/ui/anchored-dropdown";
import { CategorySuggestionBox } from "@/components/ui/category-suggestion";
import { CategoryGroupPicker, type CategoryPickerGroup } from "@/components/ui/category-group-picker";
import { useCustomCategories } from "@/lib/data/use-custom-categories";
import {
  getAllCategories,
  getAllCategoryGroups,
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
  clearable?: boolean;
  /** Open the picker immediately on mount (e.g. when revealed by an "add" action). */
  autoFocus?: boolean;
}

export function CategorySearch({
  value,
  onChange,
  placeholder,
  error,
  className,
  clearable = true,
  autoFocus = false,
}: CategorySearchProps) {
  const t = useTranslations("categorySearch");
  // Load admin-approved custom categories so they're selectable/searchable here too.
  const customCategories = useCustomCategories();
  void customCategories;
  const [open, setOpen] = useState(autoFocus);
  // En el teléfono el desplegable de 340px quedaba a medias detrás del teclado:
  // ahí el selector ocupa toda la pantalla, con el buscador arriba y filas grandes.
  const [pantallaChica, setPantallaChica] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const actualizar = () => setPantallaChica(mq.matches);
    queueMicrotask(actualizar);
    mq.addEventListener("change", actualizar);
    return () => mq.removeEventListener("change", actualizar);
  }, []);
  const [query, setQuery] = useState("");
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // The dropdown is rendered in a PORTAL (document.body) so it's never clipped by a
  // parent with overflow:hidden/auto, positioned `fixed` from the trigger's rect via
  // the shared, keyboard-aware helper (opens below, flips up only with no room).
  const pos = useAnchoredPosition(containerRef, open, 340);

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
      setActiveGroupId(null);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Close on Escape
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") { setOpen(false); setQuery(""); setActiveGroupId(null); }
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  function handleSelect(id: string) {
    onChange(id);
    setOpen(false);
    setQuery("");
    setActiveGroupId(null);
  }

  function handleClear() {
    onChange("");
    setQuery("");
    setOpen(false);
    setActiveGroupId(null);
  }

  function openDropdown() {
    setOpen(true);
  }

  // Focus the search input once the portaled panel has mounted.
  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  const results = searchCategories(query);
  const allGroups = getAllCategoryGroups();
  const allCategories = getAllCategories();

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
        ...allGroups.map((g) => [g.label, allCategories.filter((item) => item.groupId === g.id)] as [string, typeof results]),
      ];
  const browseGroups: CategoryPickerGroup[] = allGroups.map((g) => ({
    id: g.id,
    label: g.label,
    items: allCategories.filter((item) => item.groupId === g.id),
  }));

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      {/* Trigger controls are siblings so a selected service never creates a button inside a button. */}
      <div
        className={cn(
          "w-full flex items-center justify-between h-11 px-3.5 rounded-xl border text-sm text-left transition-all bg-white shadow-sm",
          error ? "border-red-400" : "border-[#e5e7eb]",
          open ? "border-[#009FD9] ring-2 ring-[#009FD9]/20" : "hover:border-[#009FD9]/50"
        )}
      >
        <button type="button" onClick={openDropdown} className="flex h-full min-w-0 flex-1 items-center gap-2 text-left">
          {!selectedLabel && <Search className="h-4 w-4 shrink-0 text-[#68778d]" />}
          {selectedLabel ? (
            <span className="truncate font-medium text-[#162543]">{selectedLabel}</span>
          ) : (
            <span className="truncate text-[#68778d]">{placeholder ?? t("placeholderDefault")}</span>
          )}
        </button>
        <div className="flex items-center gap-1 shrink-0 ml-2">
          {clearable && value && (
            <button
              type="button"
              onClick={handleClear}
              aria-label={locale === "en" ? "Clear service" : "Quitar servicio"}
              className="text-[#68778d] hover:text-[#374151] p-0.5"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={openDropdown}
            aria-label={placeholder ?? t("placeholderDefault")}
            className="grid h-7 w-7 place-items-center text-[#68778d]"
          >
            <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
          </button>
        </div>
      </div>

      {/* Dropdown — portaled to <body> so no parent overflow can clip it, and
          positioned absolute in DOCUMENT coords so it stays attached below the
          field (no detach when the page/keyboard shifts). */}
      {open && typeof document !== "undefined" && (pantallaChica || pos) && createPortal(
        <div
          ref={panelRef}
          style={pantallaChica || !pos ? undefined : {
            position: "absolute",
            left: pos.left,
            width: pos.width,
            top: pos.top,
            maxHeight: pos.maxH,
            zIndex: 9999,
          }}
          className={cn(
            "bg-white overflow-hidden flex flex-col",
            // Pantalla completa de verdad: con `inset-0` cubre siempre toda la
            // pantalla. Fijar el alto al "viewport visual" la dejaba más corta al
            // abrir el teclado y por debajo se asomaba el panel de atrás.
            pantallaChica
              ? "fixed inset-0 z-[9999] pt-[env(safe-area-inset-top)]"
              : "border border-[#e5e7eb] rounded-xl shadow-2xl",
          )}
        >
          {pantallaChica && (
            <div className="grid h-14 shrink-0 grid-cols-[52px_minmax(0,1fr)_52px] items-center border-b border-[#f3f4f6] px-1">
              <button
                type="button"
                onClick={() => { setOpen(false); setQuery(""); setActiveGroupId(null); }}
                aria-label={t("back")}
                className="grid h-11 w-11 place-items-center rounded-full text-[#162543] transition-colors hover:bg-[#f3f4f6]"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <p className="truncate text-center text-base font-bold text-[#162543]">{t("sheetTitle")}</p>
              <span />
            </div>
          )}
          {/* Search input */}
          <div className="p-2 border-b border-[#f3f4f6]">
            <div className="relative flex items-center">
              <Search className="absolute left-3 h-4 w-4 text-[#68778d] pointer-events-none" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("searchPlaceholder")}
                enterKeyHint="search"
                className={cn(
                  "w-full pl-9 pr-3 text-[#162543] placeholder:text-[#68778d] bg-[#f9fafb] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#009FD9]/20",
                  pantallaChica ? "h-11 text-base" : "py-2 text-sm",
                )}
              />
              {query && (
                <button type="button" onClick={() => setQuery("")} className="absolute right-2 text-[#68778d] hover:text-[#374151]">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            {/* Los ejemplos van debajo, no dentro del campo: en el teléfono el
                marcador se cortaba a media palabra ("...psicólogo, plome"). */}
            {!query && <p className="mt-1.5 px-1 text-xs text-[#68778d]">{t("searchExamples")}</p>}
          </div>

          {/* Results */}
          <div className={cn("overflow-y-auto flex-1", pantallaChica && "pb-[max(env(safe-area-inset-bottom),1rem)]")}>
            {query && results.length === 0 ? (
              <div className="px-3 py-4 text-center">
                <p className="text-sm text-[#374151] font-medium mb-1">{t("noResults")}</p>
                <p className="text-xs text-[#68778d]">{t("noResultsHint")}</p>
              </div>
            ) : (
              query ? grouped.map(([groupLabel, items]) => (
                <div key={groupLabel} className="px-2 py-1.5">
                  <p className="px-1.5 pb-1.5 pt-1 text-[10px] font-bold text-[#68778d] uppercase tracking-widest">
                    {items[0]?.groupId ? getCategoryGroupLabel(items[0].groupId, locale) : groupLabel}
                  </p>
                  <div className="grid grid-cols-1 gap-1.5">
                  {items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleSelect(item.id)}
                      className={cn(
                        "w-full rounded-xl border px-3.5 py-2.5 text-left text-sm transition-colors",
                        value === item.id
                          ? "border-[#009FD9] bg-[#EBF5FB] font-medium text-[#009FD9]"
                          : "border-[#e5e7eb] text-[#374151] hover:border-[#009FD9] hover:bg-[#f8fbfe] hover:text-[#0089bb]"
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
                </div>
              )) : (
                <CategoryGroupPicker
                  groups={browseGroups}
                  activeGroupId={activeGroupId}
                  onActiveGroupChange={setActiveGroupId}
                  onSelect={handleSelect}
                  selectedId={value}
                  backLabel={t("back")}
                  countLabel={(count) => t("optionsCount", { count })}
                  className="p-2"
                  groupClassName="rounded-xl border border-[#e5e7eb] bg-white hover:border-[#009FD9] hover:bg-[#f8fbfe]"
                  optionClassName="rounded-xl border border-[#e5e7eb] bg-white hover:border-[#009FD9] hover:bg-[#f8fbfe]"
                />
              )
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

      {error && <p role="alert" data-testid="category-field-error" className="text-xs text-red-500 mt-1">{error}</p>}
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

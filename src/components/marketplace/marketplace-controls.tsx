import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Clock3, Search, Wrench, X } from "lucide-react";

export function MarketplaceNavbarPortal({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    let frame = 0;
    const findTarget = () => {
      const node = document.getElementById("ccr-marketplace-navbar-slot");
      if (node) {
        setTarget(node);
        return;
      }
      frame = window.requestAnimationFrame(findTarget);
    };
    findTarget();
    return () => window.cancelAnimationFrame(frame);
  }, []);

  if (!target) return null;
  return createPortal(children, target);
}

const MARKETPLACE_RECENTS_KEY = "ccr-marketplace-search-recents";
const MAX_MARKETPLACE_RECENTS = 8;

function normalizeRecent(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function isUsefulPrimarySuggestion(value: string) {
  const letters = value.match(/\p{L}/gu)?.length ?? 0;
  return letters >= 3;
}

function readRecentSearches(storageKey: string) {
  if (typeof window === "undefined") return [] as string[];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey) || "[]");
    if (!Array.isArray(parsed)) return [] as string[];
    return parsed
      .map((item) => (typeof item === "string" ? normalizeRecent(item) : ""))
      .filter((item) => item && isUsefulPrimarySuggestion(item))
      .slice(0, MAX_MARKETPLACE_RECENTS);
  } catch {
    return [] as string[];
  }
}

type MarketplaceSecondarySearch = {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  suggestions?: string[];
  ariaLabel?: string;
};

export function MarketplaceSearch({
  value,
  onChange,
  placeholder,
  suggestions = [],
  onSubmit,
  secondary,
  recentStorageKey = MARKETPLACE_RECENTS_KEY,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  suggestions?: string[];
  onSubmit?: () => void;
  secondary?: MarketplaceSecondarySearch;
  recentStorageKey?: string;
}) {
  const [open, setOpen] = useState(false);
  const [desktopField, setDesktopField] = useState<"primary" | "secondary" | null>(null);
  const [mobileField, setMobileField] = useState<"primary" | "secondary">("primary");
  const [recents, setRecents] = useState<string[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fullInputRef = useRef<HTMLInputElement>(null);
  const cleanValue = value.trim().toLocaleLowerCase("es-CR");
  const uniqueSuggestions = useMemo(() => {
    const seen = new Set<string>();
    return suggestions.map(normalizeRecent).filter((suggestion) => {
      if (!suggestion || !isUsefulPrimarySuggestion(suggestion)) return false;
      const key = suggestion.toLocaleLowerCase("es-CR");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [suggestions]);
  const visibleSuggestions = useMemo(
    () => uniqueSuggestions
      .filter((suggestion) => cleanValue && suggestion.toLocaleLowerCase("es-CR").includes(cleanValue))
      .slice(0, 8),
    [cleanValue, uniqueSuggestions],
  );
  const exactSuggestion = uniqueSuggestions.some((suggestion) => suggestion.toLocaleLowerCase("es-CR") === cleanValue);
  const secondaryNeedle = secondary?.value.trim().toLocaleLowerCase("es-CR") ?? "";
  const uniqueSecondarySuggestions = useMemo(() => {
    const seen = new Set<string>();
    return (secondary?.suggestions ?? []).map(normalizeRecent).filter((suggestion) => {
      if (!suggestion) return false;
      const key = suggestion.toLocaleLowerCase("es-CR");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [secondary?.suggestions]);
  const visibleSecondarySuggestions = useMemo(
    () => uniqueSecondarySuggestions
      .filter((suggestion) => secondaryNeedle.length >= 1 && suggestion.toLocaleLowerCase("es-CR").includes(secondaryNeedle))
      .slice(0, 6),
    [secondaryNeedle, uniqueSecondarySuggestions],
  );

  useEffect(() => {
    setRecents(readRecentSearches(recentStorageKey));
  }, [recentStorageKey]);

  useEffect(() => {
    if (!desktopField) return;
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setDesktopField(null);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [desktopField]);

  useEffect(() => {
    if (!open) return;
    setRecents(readRecentSearches(recentStorageKey));
    const timer = window.setTimeout(() => fullInputRef.current?.focus(), 60);
    document.body.style.overflow = "hidden";
    return () => {
      window.clearTimeout(timer);
      document.body.style.overflow = "";
    };
  }, [open, recentStorageKey]);

  function writeRecents(next: string[]) {
    const cleaned = next.map(normalizeRecent).filter(Boolean).slice(0, MAX_MARKETPLACE_RECENTS);
    setRecents(cleaned);
    if (typeof window !== "undefined") window.localStorage.setItem(recentStorageKey, JSON.stringify(cleaned));
  }

  function saveRecent(rawValue = value) {
    const nextValue = normalizeRecent(rawValue);
    if (!nextValue) return;
    writeRecents([nextValue, ...recents.filter((item) => item.toLocaleLowerCase("es-CR") !== nextValue.toLocaleLowerCase("es-CR"))]);
  }

  function removeRecent(item: string) {
    writeRecents(recents.filter((recent) => recent.toLocaleLowerCase("es-CR") !== item.toLocaleLowerCase("es-CR")));
  }

  function clearRecents() {
    writeRecents([]);
  }

  function openMobileSearch() {
    if (window.innerWidth < 1024) {
      setMobileField("primary");
      setOpen(true);
      inputRef.current?.blur();
    }
  }

  function closeMobileSearch() {
    setOpen(false);
    inputRef.current?.blur();
  }

  function chooseSearch(nextValue: string) {
    const normalized = normalizeRecent(nextValue);
    if (!normalized) return;
    onChange(normalized);
    saveRecent(normalized);
    closeMobileSearch();
  }

  function submitSearch() {
    saveRecent();
    onSubmit?.();
  }

  function choosePrimarySuggestion(suggestion: string) {
    onChange(suggestion);
    saveRecent(suggestion);
    setDesktopField(null);
  }

  function chooseSecondarySuggestion(suggestion: string) {
    secondary?.onChange(suggestion);
    setDesktopField(null);
  }

  return (
    <div ref={rootRef} className="relative min-w-0 flex-1">
      <div className="flex h-12 w-full items-center gap-3 rounded-xl bg-white px-3 shadow-[0_4px_14px_rgba(15,23,42,0.08)] ring-1 ring-[#dfe5eb] transition focus-within:ring-2 focus-within:ring-[#009FD9]/25 lg:h-11 lg:rounded-[6px] lg:border lg:border-[#dfe5eb] lg:bg-white lg:px-4 lg:shadow-[0_4px_16px_rgba(15,23,42,0.08)] lg:ring-0 lg:focus-within:border-[#b9d9e8] lg:focus-within:ring-0">
        <Search className="h-5 w-5 shrink-0 text-[#162543] lg:text-gray-300" />
        <div className="relative min-w-0 flex-[1.85]">
          <input
            ref={inputRef}
            value={value}
            onChange={(event) => { onChange(event.target.value); setDesktopField("primary"); }}
            onFocus={() => { openMobileSearch(); if (window.innerWidth >= 1024) setDesktopField("primary"); }}
            onClick={openMobileSearch}
            placeholder={placeholder}
            enterKeyHint="search"
            onKeyDown={(event) => {
              if (event.key === "Enter") submitSearch();
            }}
            className="h-11 w-full min-w-0 bg-transparent pr-9 text-[15px] font-semibold text-[#162543] outline-none placeholder:text-[#8f9aaa] lg:text-base lg:font-normal lg:text-gray-700 lg:placeholder:text-gray-400"
          />
          {value && <button type="button" onClick={() => onChange("")} aria-label="Limpiar búsqueda" className="absolute right-0 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full text-[#8b96a5] hover:bg-[#edf3f7]"><X className="h-4 w-4" /></button>}
          {desktopField === "primary" && ((cleanValue && visibleSuggestions.length > 0) || (!cleanValue && recents.length > 0)) && (
            <div className="absolute -left-10 right-0 top-[calc(100%+8px)] z-50 hidden overflow-hidden rounded-xl border border-[#d7e1ea] bg-white py-1 shadow-[0_16px_38px_-24px_rgba(15,23,42,0.8)] lg:block">
              {!cleanValue && (
                <div className="flex items-center justify-between gap-3 border-b border-[#e6edf3] px-4 py-2">
                  <span className="text-xs font-extrabold uppercase text-[#68778d]">Recientes</span>
                  <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={clearRecents} className="text-xs font-bold text-[#009fd9] hover:text-[#0082b3]">Borrar todo</button>
                </div>
              )}
              {cleanValue
                ? visibleSuggestions.map((suggestion) => <button key={suggestion} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => choosePrimarySuggestion(suggestion)} className="block w-full px-4 py-2.5 text-left text-sm font-semibold text-[#162543] transition hover:bg-[#f1f9fc] focus:bg-[#f1f9fc] focus:outline-none">{suggestion}</button>)
                : recents.map((recent) => (
                  <div key={recent} className="group flex items-center gap-2 px-2 hover:bg-[#f1f9fc]">
                    <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => choosePrimarySuggestion(recent)} className="flex min-w-0 flex-1 items-center gap-3 px-2 py-2.5 text-left text-sm font-semibold text-[#162543] focus:outline-none">
                      <Clock3 className="h-4 w-4 shrink-0 text-[#7b8ba1]" />
                      <span className="truncate">{recent}</span>
                    </button>
                    <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => removeRecent(recent)} aria-label={`Eliminar ${recent} de búsquedas recientes`} className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[#94a3b8] hover:bg-[#e3edf4] hover:text-[#162543]">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
            </div>
          )}
        </div>
        {secondary && (
          <>
            <span aria-hidden="true" className="hidden h-6 w-px shrink-0 bg-[#dfe5eb] lg:block" />
            <div className="relative hidden min-w-[180px] flex-1 lg:block">
              <Wrench className="pointer-events-none absolute left-0 top-1/2 h-4 w-4 -translate-y-1/2 text-[#a1adbb]" aria-hidden="true" />
              <input value={secondary.value} onChange={(event) => { secondary.onChange(event.target.value); setDesktopField("secondary"); }} onFocus={() => setDesktopField("secondary")} placeholder={secondary.placeholder} aria-label={secondary.ariaLabel ?? secondary.placeholder} className="h-10 w-full bg-transparent pl-7 pr-8 text-base font-normal text-gray-700 outline-none placeholder:text-gray-400" />
              {secondary.value && <button type="button" onClick={() => secondary.onChange("")} aria-label="Limpiar servicio" className="absolute right-0 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full text-[#8b96a5] hover:bg-[#edf3f7]"><X className="h-4 w-4" /></button>}
            {desktopField === "secondary" && visibleSecondarySuggestions.length > 0 && (
              <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-50 overflow-hidden rounded-xl border border-[#d7e1ea] bg-white py-1 shadow-[0_16px_38px_-24px_rgba(15,23,42,0.8)]">
                {visibleSecondarySuggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => chooseSecondarySuggestion(suggestion)}
                    className="block w-full px-3 py-2.5 text-left text-sm font-semibold text-[#162543] transition hover:bg-[#f1f9fc] focus:bg-[#f1f9fc] focus:outline-none"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}
            </div>
          </>
        )}
      </div>
      {open && (
        <div className="fixed inset-0 z-[1300] bg-white text-[#162543] lg:hidden">
          <div className="flex min-h-16 items-center gap-2 border-b border-[#e7edf2] px-4">
            <button type="button" onClick={closeMobileSearch} aria-label="Cerrar búsqueda" className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-[#162543]">
              <X className="h-7 w-7" strokeWidth={2.3} />
            </button>
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-0 top-1/2 h-5 w-5 -translate-y-1/2 text-[#6b778a]" />
              <input
                ref={fullInputRef}
                value={value}
                onChange={(event) => { onChange(event.target.value); setMobileField("primary"); }}
                onFocus={() => setMobileField("primary")}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    submitSearch();
                    closeMobileSearch();
                  }
                }}
                placeholder={placeholder}
                enterKeyHint="search"
                className="h-14 w-full bg-transparent pl-8 pr-9 text-lg font-semibold outline-none placeholder:text-[#9aa8ba]"
              />
              {value && (
                <button type="button" onClick={() => onChange("")} aria-label="Limpiar búsqueda" className="absolute right-0 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full bg-[#edf3f7] text-[#64748b]">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
          {secondary && (
            <div className="border-b border-[#e7edf2] px-4 py-3">
              <label className="flex h-12 items-center gap-3 rounded-xl border border-[#d7e1ea] bg-white px-3 shadow-[0_8px_24px_rgba(15,23,42,0.08)]">
                <Wrench className="h-5 w-5 shrink-0 text-[#162543]" />
                <input
                  value={secondary.value}
                  onChange={(event) => { secondary.onChange(event.target.value); setMobileField("secondary"); }}
                  onFocus={() => setMobileField("secondary")}
                  placeholder={secondary.placeholder}
                  aria-label={secondary.ariaLabel ?? secondary.placeholder}
                  className="h-11 min-w-0 flex-1 bg-transparent text-base font-semibold text-[#162543] outline-none placeholder:text-[#9aa8ba]"
                />
                {secondary.value && (
                  <button type="button" onClick={() => secondary.onChange("")} aria-label="Limpiar servicio" className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#edf3f7] text-[#64748b]">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </label>
            </div>
          )}
          <div className="px-6 py-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-base font-extrabold">{mobileField === "secondary" || cleanValue ? "Sugerencias" : "Recientes"}</h2>
              {mobileField === "primary" && !cleanValue && recents.length > 0 && (
                <button type="button" onClick={clearRecents} className="rounded-full px-2 py-1 text-sm font-bold text-[#009FD9]">
                  Borrar
                </button>
              )}
            </div>
            <div className="space-y-1">
              {mobileField === "secondary" ? (
                visibleSecondarySuggestions.map((suggestion) => (
                  <button key={suggestion} type="button" onClick={() => chooseSecondarySuggestion(suggestion)} className="flex min-h-14 w-full items-center gap-4 rounded-xl px-1 text-left transition hover:bg-[#f4f8fb]">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#f4f8fb] text-[#162543]"><Search className="h-5 w-5" /></span>
                    <span className="truncate text-base font-bold">{suggestion}</span>
                  </button>
                ))
              ) : cleanValue ? (
                <>
                  {visibleSuggestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => chooseSearch(suggestion)}
                      className="flex min-h-14 w-full items-center gap-4 rounded-xl px-1 text-left transition hover:bg-[#f4f8fb]"
                    >
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#f4f8fb] text-[#162543]">
                        <Search className="h-5 w-5" />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-base font-bold">{suggestion}</span>
                        <span className="block text-sm font-semibold text-[#7a8798]">Costa Rica</span>
                      </span>
                    </button>
                  ))}
                  {value.trim() && !exactSuggestion && (
                    <button type="button" onClick={() => chooseSearch(value)} className="flex min-h-14 w-full items-center gap-4 rounded-xl px-1 text-left transition hover:bg-[#f4f8fb]">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#f4f8fb] text-[#162543]">
                        <Search className="h-5 w-5" />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-base font-bold">{value}</span>
                        <span className="block text-sm font-semibold text-[#7a8798]">Buscar en Costa Rica</span>
                      </span>
                    </button>
                  )}
                </>
              ) : (
                <>
                  {recents.map((recent) => (
                    <div key={recent} className="group flex min-h-14 w-full items-center gap-2 rounded-xl px-1 transition hover:bg-[#f4f8fb]">
                      <button type="button" onClick={() => chooseSearch(recent)} className="flex min-w-0 flex-1 items-center gap-4 text-left">
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#f4f8fb] text-[#162543]">
                          <Clock3 className="h-5 w-5" />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-base font-bold">{recent}</span>
                          <span className="block text-sm font-semibold text-[#7a8798]">Costa Rica</span>
                        </span>
                      </button>
                      <button type="button" onClick={() => removeRecent(recent)} aria-label="Borrar reciente" className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[#94a3b8] hover:bg-[#e8f0f6] hover:text-[#162543]">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                  {recents.length === 0 && (
                    <div className="rounded-2xl bg-[#f7fafc] px-4 py-5 text-sm font-semibold text-[#6b778a]">
                      Tus búsquedas recientes aparecerán aquí.
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function MarketplaceFilterChip({ label, value, options, onChange }: { label: string; value: string; options: Array<[string, string]>; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(value);
  const rootRef = useRef<HTMLDivElement>(null);
  const selectedLabel = options.find(([item]) => item === value)?.[1] ?? label;
  const active = value !== options[0]?.[0];

  useEffect(() => {
    if (!open) return;
    setPending(value);
    const close = (event: PointerEvent) => {
      if (window.innerWidth >= 1024 && !rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open, value]);

  return (
    <div ref={rootRef} className={`relative shrink-0 ${open ? "z-[140]" : "z-[1]"}`}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex h-9 max-w-[15rem] items-center gap-1.5 rounded-lg border px-3 text-[13px] font-bold ${active ? "border-[#009fd9] bg-[#eaf7fc] text-[#007fae]" : "border-[#cbd7e2] bg-white text-[#24344d]"}`}
      >
        <span className="truncate">{active ? selectedLabel : label}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0" />
      </button>
      {open && (
        <>
          <button type="button" aria-label="Cerrar filtro" onClick={() => setOpen(false)} className="fixed inset-0 z-[1190] bg-[#0f172a]/35 lg:hidden" />
          <div className="fixed inset-x-0 bottom-0 z-[1200] rounded-t-2xl bg-white px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-3 shadow-2xl lg:absolute lg:inset-auto lg:left-0 lg:top-[calc(100%+8px)] lg:z-[120] lg:w-80 lg:rounded-xl lg:border lg:border-[#dfe8f0] lg:p-4">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[#c7d2dc] lg:hidden" />
            <div className="flex min-h-12 items-center justify-between border-b border-[#e7edf2] lg:min-h-10">
              <h2 className="text-lg font-bold lg:text-base">{label}</h2>
              <button type="button" onClick={() => setOpen(false)} aria-label="Cerrar" className="grid h-10 w-10 place-items-center"><X className="h-5 w-5" /></button>
            </div>
            <div className="py-2">
              {options.map(([itemValue, itemLabel]) => (
                <button key={itemValue} type="button" onClick={() => setPending(itemValue)} className="flex min-h-12 w-full items-center justify-between gap-4 text-left text-sm font-semibold">
                  <span>{itemLabel}</span>
                  <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border ${pending === itemValue ? "border-[#009fd9] bg-[#009fd9] text-white" : "border-[#b9c5d1]"}`}>
                    {pending === itemValue && <Check className="h-4 w-4" />}
                  </span>
                </button>
              ))}
            </div>
            <button type="button" onClick={() => { onChange(pending); setOpen(false); }} className="h-12 w-full rounded-lg bg-[#009fd9] text-sm font-bold text-white hover:bg-[#008fc3]">Ver resultados</button>
          </div>
        </>
      )}
    </div>
  );
}

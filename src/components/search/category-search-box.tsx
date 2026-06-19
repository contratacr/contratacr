"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { AnchoredDropdown } from "@/components/ui/anchored-dropdown";
import { ALL_CATEGORIES, searchCategories, normalizeText, getCategoryLabel, getCategoryGroupLabel } from "@/lib/data/categories";

/**
 * Smart category search with autocomplete — accent-insensitive (via
 * `searchCategories`) plus a small edit-distance fallback for typos. Selecting a
 * suggestion jumps straight to /buscar filtered by that category; free text
 * falls back to a keyword search. Reusable (used on /categorias and elsewhere).
 */
function editDistance(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[m][n];
}

type CatMatch = (typeof ALL_CATEGORIES)[number];
function matchCategories(query: string, limit = 8): CatMatch[] {
  if (!query.trim()) return [];
  const direct = searchCategories(query);
  if (direct.length) return direct.slice(0, limit);
  const q = normalizeText(query.trim());
  const tol = q.length > 6 ? 2 : 1;
  return ALL_CATEGORIES
    .map((item) => {
      const words = normalizeText(item.label).split(/\s+/);
      const best = Math.min(...words.map((w) => editDistance(w, q)));
      return { item, best };
    })
    .filter((x) => x.best <= tol)
    .sort((a, b) => a.best - b.best)
    .slice(0, limit)
    .map((x) => x.item);
}

export function CategorySearchBox({
  placeholder,
  autoFocus = false,
}: {
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const router = useRouter();
  const locale = useLocale();
  const tp = useTranslations("categoriesPage");
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suggestions = useMemo(() => matchCategories(q), [q]);

  useEffect(() => {
    if (autoFocus) requestAnimationFrame(() => inputRef.current?.focus());
  }, [autoFocus]);
  useEffect(() => setActive(0), [q]);

  function go(id?: string) {
    if (id) router.push(`/buscar?categoria=${id}`);
    else if (q.trim()) router.push(`/buscar?q=${encodeURIComponent(q.trim())}`);
    else router.push("/buscar");
    setQ("");
    setFocused(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, suggestions.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); go(suggestions[active]?.id); }
    else if (e.key === "Escape") { setFocused(false); inputRef.current?.blur(); }
  }

  const open = focused && q.trim().length > 0;

  return (
    <div className="relative w-full max-w-xl mx-auto text-left">
      <form
        ref={formRef}
        onSubmit={(e) => { e.preventDefault(); go(suggestions[active]?.id); }}
        className="flex items-center gap-3 h-[52px] rounded-2xl border border-gray-200 bg-white px-4 shadow-[0_8px_28px_rgba(0,0,0,0.08)] transition-all focus-within:border-[#009FD9] focus-within:ring-2 focus-within:ring-[#009FD9]/20"
      >
        <Search className="h-5 w-5 text-gray-400 shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => { if (blurTimer.current) clearTimeout(blurTimer.current); setFocused(true); }}
          onBlur={() => { blurTimer.current = setTimeout(() => setFocused(false), 150); }}
          onKeyDown={onKeyDown}
          placeholder={placeholder ?? tp("searchPlaceholder")}
          aria-label={tp("searchAria")}
          className="flex-1 min-w-0 h-[52px] bg-transparent text-base text-gray-700 placeholder:text-gray-400 focus:outline-none"
        />
      </form>

      <AnchoredDropdown anchorRef={formRef} open={open} maxHeight={340} className="rounded-2xl border-gray-100 shadow-2xl">
        <div className="py-1.5">
          {suggestions.length === 0 ? (
            <>
              {/* No match → consistent "No encontramos esa categoría" wording + the suggest
                  action (scrolls to the contained suggestion card below, which submits to
                  admin). The "Ver todos los profesionales" link was removed (sprint 305). */}
              <div className="px-4 pt-3 pb-2 text-center">
                <p className="text-sm font-medium text-[#374151]">{tp("noResults")}</p>
                <p className="mt-0.5 text-xs text-gray-400">{tp("noResultsHint")}</p>
              </div>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  setFocused(false);
                  document.getElementById("sugerir-categoria")?.scrollIntoView({ behavior: "smooth", block: "center" });
                }}
                className="block w-full border-t border-gray-50 px-4 py-3 text-center text-sm font-semibold text-[#009FD9] hover:bg-gray-50"
              >
                {tp("suggestCta")}
              </button>
            </>
          ) : (
            suggestions.map((s, i) => (
              <button
                key={s.id}
                onMouseDown={(e) => { e.preventDefault(); go(s.id); }}
                onMouseEnter={() => setActive(i)}
                className={cn(
                  "w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors",
                  active === i ? "bg-[#EBF5FB]" : "hover:bg-gray-50"
                )}
              >
                <span className="text-sm font-medium text-[#1a2744]">{getCategoryLabel(s.id, locale)}</span>
                <span className="text-[11px] text-gray-400 shrink-0">{getCategoryGroupLabel(s.groupId, locale)}</span>
              </button>
            ))
          )}
        </div>
      </AnchoredDropdown>
    </div>
  );
}

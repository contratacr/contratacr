"use client";

import { useRouter, usePathname } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { PROVINCES, getCantonsByProvince } from "@/lib/data/cr-geography";
import { CATEGORY_GROUPS, getCategoryLabel } from "@/lib/data/categories";

export function SearchFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const t = useTranslations("search");

  const [query, setQuery] = useState(params.get("q") ?? "");
  const [category, setCategory] = useState(params.get("categoria") ?? "");
  const [province, setProvince] = useState(params.get("provincia") ?? "");
  const [canton, setCanton] = useState(params.get("canton") ?? "");
  const [sortBy, setSortBy] = useState(params.get("sortBy") ?? "rating");

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cantons = getCantonsByProvince(province);

  const applyFilters = useCallback(
    (overrides: Record<string, string> = {}) => {
      const next = new URLSearchParams();
      const vals = { q: query, categoria: category, provincia: province, canton, sortBy, ...overrides };
      if (vals.q) next.set("q", vals.q);
      if (vals.categoria && vals.categoria !== "todas") next.set("categoria", vals.categoria);
      if (vals.provincia && vals.provincia !== "todas") next.set("provincia", vals.provincia);
      if (vals.canton && vals.canton !== "todos" && vals.provincia) next.set("canton", vals.canton);
      if (vals.sortBy && vals.sortBy !== "rating") next.set("sortBy", vals.sortBy);
      router.push(`${pathname}?${next.toString()}`);
    },
    [query, category, province, canton, sortBy, router, pathname]
  );

  function handleQueryChange(value: string) {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => applyFilters({ q: value }), 400);
  }

  function handleQueryKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      applyFilters({ q: query });
    }
  }

  function clearQuery() {
    setQuery("");
    if (debounceRef.current) clearTimeout(debounceRef.current);
    applyFilters({ q: "" });
  }

  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

  function clearAll() {
    setQuery(""); setCategory(""); setProvince(""); setCanton(""); setSortBy("rating");
    if (debounceRef.current) clearTimeout(debounceRef.current);
    router.push(pathname);
  }

  const activeCount =
    (query ? 1 : 0) +
    [category, province, canton].filter((v) => v && v !== "todas" && v !== "todos").length;

  return (
    <div className="bg-white rounded-2xl border border-[#e5e7eb] p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-[#6b7280]" />
          <span className="text-sm font-semibold text-[#374151]">{t("filters.title")}</span>
          {activeCount > 0 && <Badge variant="default" className="text-xs">{activeCount}</Badge>}
        </div>
        {activeCount > 0 && (
          <button onClick={clearAll} className="flex items-center gap-1 text-xs text-[#6b7280] hover:text-red-500 transition-colors">
            <X className="h-3 w-3" />{t("filters.clear")}
          </button>
        )}
      </div>

      {/* Text search */}
      <div className="mb-3">
        <div className="relative flex items-center">
          <Search className="absolute left-3 h-4 w-4 text-[#9ca3af] pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            onKeyDown={handleQueryKeyDown}
            placeholder="Buscá cualquier servicio… ej. niñera Escazú, contador, fotógrafo"
            className="w-full rounded-xl border border-[#e5e7eb] bg-white py-2 pl-9 pr-9 text-sm text-[#111827] placeholder-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent transition"
          />
          {query && (
            <button onClick={clearQuery} className="absolute right-3 text-[#9ca3af] hover:text-[#374151] transition-colors" aria-label="Limpiar búsqueda">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        {query && (
          <p className="text-xs text-[#9ca3af] mt-1 pl-1">
            Buscando profesionales relacionados con <strong className="text-[#374151]">"{query}"</strong>
          </p>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        {/* Category — grouped select */}
        <div className="flex-1">
          <label className="text-xs font-medium text-[#6b7280] mb-1.5 block">{t("filters.category")}</label>
          <Select value={category} onValueChange={(v) => { setCategory(v); applyFilters({ categoria: v }); }}>
            <SelectTrigger className="text-sm">
              <SelectValue placeholder={t("filters.allCategories")}>
                {category && category !== "todas" ? getCategoryLabel(category) : t("filters.allCategories")}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">{t("filters.allCategories")}</SelectItem>
              {CATEGORY_GROUPS.map((group) => (
                <div key={group.id}>
                  <div className="px-2 py-1 text-[10px] font-bold text-[#9ca3af] uppercase tracking-widest sticky top-0 bg-white">
                    {group.emoji} {group.label}
                  </div>
                  {group.items.map((item) => (
                    <SelectItem key={item.id} value={item.id} className="pl-4">
                      {item.label}
                    </SelectItem>
                  ))}
                </div>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="sm:w-44">
          <label className="text-xs font-medium text-[#6b7280] mb-1.5 block">{t("filters.province")}</label>
          <Select value={province} onValueChange={(v) => { setProvince(v); setCanton(""); applyFilters({ provincia: v, canton: "" }); }}>
            <SelectTrigger className="text-sm">
              <SelectValue placeholder={t("filters.allProvinces")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">{t("filters.allProvinces")}</SelectItem>
              {PROVINCES.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="sm:w-44">
          <label className="text-xs font-medium text-[#6b7280] mb-1.5 block">{t("filters.canton")}</label>
          <Select value={canton} onValueChange={(v) => { setCanton(v); applyFilters({ canton: v }); }} disabled={!province || cantons.length === 0}>
            <SelectTrigger className="text-sm">
              <SelectValue placeholder={province ? t("filters.allCantons") : t("filters.selectProvince")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">{t("filters.allCantons")}</SelectItem>
              {cantons.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="sm:w-44">
          <label className="text-xs font-medium text-[#6b7280] mb-1.5 block">{t("filters.sortBy")}</label>
          <Select value={sortBy} onValueChange={(v) => { setSortBy(v); applyFilters({ sortBy: v }); }}>
            <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="rating">{t("sort.rating")}</SelectItem>
              <SelectItem value="reviews">{t("sort.reviews")}</SelectItem>
              <SelectItem value="priceAsc">{t("sort.priceAsc")}</SelectItem>
              <SelectItem value="priceDesc">{t("sort.priceDesc")}</SelectItem>
              <SelectItem value="newest">{t("sort.newest")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import { useLocale } from "next-intl";
import { useTranslations } from "next-intl";
import { LandingNavbar } from "@/components/landing/landing-navbar";
import { LandingFooter } from "@/components/landing/landing-footer";
import { CategorySuggestionBox } from "@/components/ui/category-suggestion";
import { Link, useRouter } from "@/i18n/navigation";
import { useCategoryCatalogReady, useCustomCategories } from "@/lib/data/use-custom-categories";
import { categorySearchScore, getAllCategories, getAllCategoryGroups, getCategoryGroupLabel, getCategoryLabel, isOtherCategoryGroup, normalizeText, searchCategories } from "@/lib/data/categories";
import { getCategoryGroupIcon } from "@/lib/data/category-group-visuals";
import {
  ArrowLeft,
  ChevronRight,
  Menu,
  Search,
  X,
} from "lucide-react";

export default function ServiciosPage() {
  const t = useTranslations("categories");
  const tp = useTranslations("categoriesPage");
  const locale = useLocale();
  const router = useRouter();
  const customCategories = useCustomCategories();
  const catalogReady = useCategoryCatalogReady();
  const [query, setQuery] = useState("");
  const [activeGroupKey, setActiveGroupKey] = useState("hogar");
  const [mobileGroupKey, setMobileGroupKey] = useState<string | null>(null);
  const [searchGroupSelection, setSearchGroupSelection] = useState<{ query: string; key: string } | null>(null);
  const groups = getAllCategoryGroups().map((group) => {
    return {
      key: group.id,
      Icon: getCategoryGroupIcon(group.id, group.iconKey),
      label: getCategoryGroupLabel(group.id, locale),
      ids: getAllCategories().filter((category) => category.groupId === group.id).map((category) => category.id),
    };
  });
  const categoriesById = useMemo(() => new Map(getAllCategories().map((category) => [category.id, category])), [customCategories]);
  const normalizedQuery = normalizeText(query.trim());
  const matchedIds = useMemo(() => {
    if (!normalizedQuery) return null;
    return new Set(searchCategories(query, locale).map((category) => category.id));
  }, [locale, normalizedQuery, query]);
  const visibleGroups = useMemo(() => groups
    .map((group) => ({
      ...group,
      visibleIds: matchedIds ? group.ids.filter((id) => matchedIds.has(id)) : [...group.ids],
      bestScore: matchedIds
        ? Math.max(0, ...group.ids
          .filter((id) => matchedIds.has(id))
          .map((id) => {
            const category = categoriesById.get(id);
            return category ? categorySearchScore(category, query, locale) : 0;
          }))
        : 0,
    }))
    .filter((group) => group.visibleIds.length > 0)
    .sort((a, b) => {
      const aOther = isOtherCategoryGroup(a.key, a.label);
      const bOther = isOtherCategoryGroup(b.key, b.label);
      if (aOther !== bOther) return aOther ? 1 : -1;
      if (!matchedIds) return 0;
      if (a.bestScore !== b.bestScore) return b.bestScore - a.bestScore;
      const aLabel = normalizeText(a.label);
      const bLabel = normalizeText(b.label);
      const aLabelMatch = aLabel.includes(normalizedQuery) ? 1 : 0;
      const bLabelMatch = bLabel.includes(normalizedQuery) ? 1 : 0;
      if (aLabelMatch !== bLabelMatch) return bLabelMatch - aLabelMatch;
      return b.visibleIds.length - a.visibleIds.length;
    }), [categoriesById, groups, locale, matchedIds, normalizedQuery, query]);
  const searchResults = useMemo(() => visibleGroups.flatMap((group) =>
    group.visibleIds.map((id) => ({ id, groupLabel: group.label, Icon: group.Icon }))
  ), [visibleGroups]);
  const resultCount = visibleGroups.reduce((sum, group) => sum + group.visibleIds.length, 0);
  const activeGroup = groups.find((group) => group.key === activeGroupKey) ?? groups[0];
  const selectedSearchGroupKey = searchGroupSelection?.query === normalizedQuery ? searchGroupSelection.key : "";
  const activeSearchGroup = visibleGroups.find((group) => group.key === selectedSearchGroupKey) ?? visibleGroups[0];
  const activeSearchIds = activeSearchGroup?.visibleIds ?? searchResults.map((item) => item.id);
  const activeGroupHasServices = activeGroup.ids.length > 0;
  const mobileGroups = useMemo(() => [...visibleGroups].sort((a, b) => {
    const aOther = isOtherCategoryGroup(a.key, a.label);
    const bOther = isOtherCategoryGroup(b.key, b.label);
    if (aOther !== bOther) return aOther ? 1 : -1;
    if (matchedIds && a.bestScore !== b.bestScore) return b.bestScore - a.bestScore;
    return a.label.localeCompare(b.label, locale);
  }), [locale, matchedIds, visibleGroups]);
  const mobileGroup = mobileGroupKey
    ? mobileGroups.find((group) => group.key === mobileGroupKey) ?? null
    : null;
  const servicesTitle = locale === "en" ? "Services" : "Servicios";
  const allCategoriesTitle = locale === "en" ? "All categories" : "Todas las categorías";
  const serviceSearchPlaceholder = locale === "en" ? "What service are you looking for?" : "¿Qué servicio estás buscando?";
  const serviceResultsTitle = locale === "en" ? "Matching services" : "Servicios encontrados";

  function submitSearch(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!query.trim()) {
      router.push("/buscar");
      return;
    }
    const first = searchResults[0]?.id;
    if (first) router.push(`/buscar?categoria=${first}`);
    else router.push("/buscar");
  }

  function clearMobileSearch() {
    setQuery("");
    setMobileGroupKey(null);
  }

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <div className="hidden lg:block">
        <LandingNavbar />
        <div className="ccr-navbar-spacer h-16" aria-hidden />
      </div>
      <div className="lg:hidden">
        <LandingNavbar mobileSearch={false} drawerOnly />
      </div>

      <main className="flex-1 bg-white lg:bg-[#f7fafc]">
        <section className="mx-auto w-full bg-white pb-[calc(5rem+env(safe-area-inset-bottom))] lg:hidden">
          <header className="sticky top-0 z-20 border-b border-[#d5d8dc] bg-white">
            <div className="relative flex min-h-[56px] items-center justify-center px-14">
              <button
                type="button"
                onClick={() => {
                  if (mobileGroup) {
                    setMobileGroupKey(null);
                    return;
                  }
                  window.dispatchEvent(new Event("ccr:open-mobile-menu"));
                }}
                className="absolute left-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center text-[#162543]"
                aria-label={mobileGroup ? (locale === "en" ? "Back to categories" : "Volver a categorías") : (locale === "en" ? "Open menu" : "Abrir menú")}
              >
                {mobileGroup ? <ArrowLeft className="h-7 w-7 stroke-[2.2]" /> : <Menu className="h-5 w-5 stroke-[2.5]" />}
              </button>
              <h1 className="truncate text-center text-[21px] font-extrabold text-[#162543]">
                {mobileGroup ? mobileGroup.label : servicesTitle}
              </h1>
            </div>

            <form onSubmit={submitSearch} data-testid="services-page-mobile-search" className="px-4 pb-4">
              <div className="flex h-12 w-full items-center gap-3 rounded-xl bg-white px-3 shadow-[0_4px_14px_rgba(15,23,42,0.08)] ring-1 ring-[#dfe5eb] transition focus-within:ring-2 focus-within:ring-[#009FD9]/25">
                <Search className="h-5 w-5 shrink-0 text-[#162543]" />
                <input
                  type="text"
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setMobileGroupKey(null);
                  }}
                  placeholder={serviceSearchPlaceholder}
                  aria-label={serviceSearchPlaceholder}
                  className="h-11 min-w-0 flex-1 bg-transparent text-[15px] font-semibold text-[#162543] placeholder:text-[#8f9aaa] focus:outline-none"
                />
                {query && (
                  <button type="button" onClick={clearMobileSearch} className="grid h-8 w-8 place-items-center rounded-full text-[#8b96a5]" aria-label={tp("clearSearch")}>
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </form>
          </header>

          {!catalogReady ? (
            <div className="mx-4 mt-3 overflow-hidden rounded border border-[#d2d6dc] bg-white">
              {Array.from({ length: 10 }).map((_, index) => (
                <div key={index} className="flex h-16 items-center border-b border-[#d7dbe0] px-4 last:border-b-0">
                  <span className="h-4 w-44 rounded-full bg-[#edf1f5]" />
                </div>
              ))}
            </div>
          ) : query.trim() && resultCount === 0 ? (
            <section className="mx-4 mt-4 rounded border border-[#d2d6dc] bg-white px-5 py-12 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#eef8fd] text-[#009FD9]">
                <Search className="h-6 w-6" />
              </div>
              <h2 className="mt-4 text-xl font-extrabold text-[#162543]">{tp("notListed")}</h2>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-[#64748b]">{tp("suggestDescription")}</p>
              <div className="mx-auto mt-5 flex max-w-xl flex-col items-center">
                <CategorySuggestionBox
                  prominent
                  defaultName={query}
                  notListedLabel={tp("suggestCta")}
                  placeholder={tp("suggestPlaceholder")}
                  sendLabel={tp("suggestSend")}
                  sendingLabel={tp("suggestSending")}
                  cancelLabel={tp("cancel")}
                  thanksLabel={tp("suggestThanks")}
                />
              </div>
            </section>
          ) : query.trim() && resultCount > 0 ? (
            <section className="mx-4 mt-3 overflow-hidden rounded border border-[#d2d6dc] bg-white">
              <p className="border-b border-[#d7dbe0] px-4 py-3 text-[13px] font-bold uppercase tracking-wide text-[#64748b]">
                {serviceResultsTitle}
              </p>
              {searchResults.map(({ id, groupLabel }) => (
                <Link key={id} href={`/buscar?categoria=${id}`} className="flex min-h-[62px] items-center justify-between gap-4 border-b border-[#d7dbe0] px-4 py-3 last:border-b-0">
                  <span className="min-w-0">
                    <span className="block text-[16px] font-extrabold leading-tight text-[#162543] [overflow-wrap:anywhere]">
                      {getCategoryLabel(id, locale)}
                    </span>
                    <span className="mt-0.5 block text-xs font-semibold text-[#7b8794]">{groupLabel}</span>
                  </span>
                  <ChevronRight className="h-6 w-6 shrink-0 text-[#c2c7cc]" />
                </Link>
              ))}
            </section>
          ) : mobileGroup ? (
            <section className="mx-4 mt-3 overflow-hidden rounded border border-[#d2d6dc] bg-white">
              <Link
                href={`/buscar?grupo=${mobileGroup.key}`}
                className="flex min-h-[62px] items-center border-b border-[#d7dbe0] px-4 py-3 text-[16px] font-extrabold leading-tight text-[#009FD9]"
              >
                {locale === "en" ? `All ${mobileGroup.label} services` : `Todos los servicios de ${mobileGroup.label}`}
              </Link>
              {mobileGroup.visibleIds.map((id) => (
                <Link key={id} href={`/buscar?categoria=${id}`} className="flex min-h-[62px] items-center border-b border-[#d7dbe0] px-4 py-3 last:border-b-0">
                  <span className="min-w-0 text-[16px] font-extrabold leading-tight text-[#162543] [overflow-wrap:anywhere]">
                    {getCategoryLabel(id, locale)}
                  </span>
                </Link>
              ))}
            </section>
          ) : (
            <>
              <p className="mx-4 mt-4 text-[15px] font-bold text-[#526277]">{allCategoriesTitle}</p>
              <section className="mx-4 mt-2 overflow-hidden rounded border border-[#d2d6dc] bg-white">
                {mobileGroups.map((group) => (
                  <button
                    key={group.key}
                    type="button"
                    data-testid="services-mobile-group-option"
                    onClick={() => setMobileGroupKey(group.key)}
                    className="flex min-h-[62px] w-full items-center justify-between gap-4 border-b border-[#d7dbe0] bg-white px-4 py-3 text-left last:border-b-0"
                  >
                    <span className="min-w-0 text-[16px] font-extrabold leading-tight text-[#162543] [overflow-wrap:anywhere]">{group.label}</span>
                    <ChevronRight className="h-6 w-6 shrink-0 text-[#c2c7cc]" />
                  </button>
                ))}
              </section>
            </>
          )}
        </section>

        <div className="hidden lg:block">
        <section className="relative z-30 px-4 pb-5 pt-12">
          <div className="mx-auto max-w-6xl">
            <div className="max-w-3xl">
              <span className="mb-2.5 inline-flex rounded-full bg-[#EBF5FB] px-3 py-1 text-xs font-bold uppercase text-[#0089bb]">
                {tp("eyebrow")}
              </span>
              <h1 className="text-[2rem] font-extrabold leading-tight text-[#1a2744] sm:text-4xl">
                {tp("title")}
              </h1>
            </div>
          </div>
        </section>

        <section className="px-4 pb-16 pt-0">
          <div className="mx-auto max-w-6xl">
          <div className="overflow-hidden rounded-[28px] border border-[#e1e9f0] bg-white shadow-[0_18px_44px_rgba(15,23,42,0.06)]">
            <div className="border-b border-[#eef2f6] bg-white p-3 sm:p-4">
              <form
                onSubmit={submitSearch}
                data-testid="services-page-search"
                className="flex h-12 w-full items-center gap-3 rounded-xl border border-[#dfe5eb] bg-white px-4 text-left shadow-[0_4px_14px_rgba(15,23,42,0.08)] transition focus-within:border-[#b9d9e8] focus-within:ring-2 focus-within:ring-[#009FD9]/20"
              >
                <Search className="h-5 w-5 shrink-0 text-[#8a94a6]" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={serviceSearchPlaceholder}
                  aria-label={serviceSearchPlaceholder}
                  className="h-11 min-w-0 flex-1 bg-transparent text-[15px] font-semibold text-gray-700 placeholder:text-gray-400 focus:outline-none"
                />
                {query && (
                  <button type="button" onClick={() => setQuery("")} className="rounded-full p-1.5 text-[#9ca3af] hover:bg-[#f3f4f6] hover:text-[#374151]" aria-label={tp("clearSearch")}>
                    <X className="h-4 w-4" />
                  </button>
                )}
              </form>
            </div>

            {!catalogReady ? (
              <section className="grid scroll-mt-32 lg:min-h-[560px] lg:grid-cols-[300px_minmax(0,1fr)]">
                <aside className="min-w-0 overflow-hidden border-b border-[#eef2f6] bg-[#f8fafc] p-2 lg:border-b-0 lg:border-r">
                  <div className="flex w-full min-w-0 gap-2 overflow-x-auto pb-1 lg:block lg:space-y-1 lg:overflow-visible lg:pb-0">
                    {Array.from({ length: 8 }).map((_, index) => (
                      <div key={index} className="flex min-h-[48px] shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 lg:w-full">
                        <span className="h-8 w-8 shrink-0 rounded-lg bg-[#e8eef5]" />
                        <span className="min-w-[130px] flex-1 lg:min-w-0">
                          <span className="block h-3 w-28 rounded-full bg-[#e8eef5]" />
                          <span className="mt-2 block h-2.5 w-16 rounded-full bg-[#eef3f7]" />
                        </span>
                      </div>
                    ))}
                  </div>
                </aside>
                <div className="min-w-0 p-4">
                  <div className="mb-4">
                    <div className="h-5 w-44 rounded-full bg-[#e8eef5]" />
                    <div className="mt-2 h-3 w-20 rounded-full bg-[#eef3f7]" />
                  </div>
                  <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                    {Array.from({ length: 12 }).map((_, index) => (
                      <div key={index} className="flex min-h-10 items-center justify-between gap-2 rounded-xl px-3 py-2">
                        <span className="h-3.5 w-36 rounded-full bg-[#eef3f7]" />
                        <span className="h-7 w-7 shrink-0 rounded-full bg-[#eef3f7]" />
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            ) : query.trim() && resultCount === 0 ? (
              <section className="px-4 py-12 text-center sm:px-6">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#f1f7fb] text-[#9ca3af]">
                  <Search className="h-6 w-6" />
                </div>
                <h2 className="mt-4 text-lg font-extrabold text-[#162543]">{tp("notListed")}</h2>
                <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-[#6b7280]">{tp("suggestDescription")}</p>
                <div className="mx-auto mt-4 flex max-w-xl flex-col items-center">
                  <CategorySuggestionBox
                    prominent
                    defaultName={query}
                    notListedLabel={tp("suggestCta")}
                    placeholder={tp("suggestPlaceholder")}
                    sendLabel={tp("suggestSend")}
                    sendingLabel={tp("suggestSending")}
                    cancelLabel={tp("cancel")}
                    thanksLabel={tp("suggestThanks")}
                  />
                </div>
              </section>
            ) : query.trim() && resultCount > 0 ? (
              <section className="scroll-mt-32 lg:min-h-[460px]">
                <div className="min-w-0 p-4">
                  <div className="mb-3 flex items-end justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="truncate text-lg font-extrabold leading-tight text-[#162543]">
                        {serviceResultsTitle}
                      </h2>
                      <p className="mt-0.5 text-[11px] font-medium text-[#9ca3af]">
                        {tp("optionsCount", { count: searchResults.length })}
                      </p>
                    </div>
                  </div>

                  <div className={`grid gap-1.5 ${searchResults.length === 1 ? "max-w-[320px] grid-cols-1" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"}`}>
                    {searchResults.map(({ id, groupLabel }) => (
                      <Link
                        key={id}
                        href={`/buscar?categoria=${id}`}
                        className="group flex min-h-12 items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm font-semibold leading-snug text-[#374151] transition-colors hover:bg-[#EBF5FB] hover:text-[#0089bb]"
                      >
                        <span className="min-w-0">
                          <span className="block [overflow-wrap:anywhere]">{getCategoryLabel(id, locale)}</span>
                          <span className="mt-0.5 block text-[11px] font-semibold text-[#8a94a6] group-hover:text-[#6b7280]">{groupLabel}</span>
                        </span>
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[#cbd5e1] transition-colors group-hover:bg-[#EAF7FD] group-hover:text-[#009FD9]">
                          <ChevronRight className="h-4 w-4" />
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>
              </section>
            ) : (
                <section className="grid scroll-mt-32 lg:min-h-[560px] lg:grid-cols-[300px_minmax(0,1fr)]">
                  <aside className="min-w-0 overflow-hidden border-b border-[#eef2f6] bg-[#f8fafc] p-2 lg:border-b-0 lg:border-r">
                    <div className="flex w-full min-w-0 gap-2 overflow-x-auto pb-1 lg:block lg:space-y-1 lg:overflow-visible lg:pb-0">
                      {groups.map((group) => {
                        const Icon = group.Icon;
                        const active = group.key === activeGroup.key;
                        return (
                          <button
                            key={group.key}
                            type="button"
                            data-testid="services-group-option"
                            onClick={() => setActiveGroupKey(group.key)}
                            className={`group flex min-h-[48px] shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors lg:w-full ${
                              active ? "bg-white text-[#162543] shadow-sm" : "text-[#526173] hover:bg-white/80 hover:text-[#162543]"
                            }`}
                          >
                            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${active ? "bg-[#EAF7FD] text-[#0089bb]" : "bg-white text-[#8a94a6] group-hover:text-[#0089bb]"}`}>
                              <Icon className="h-4 w-4" />
                            </span>
                            <span className="min-w-[130px] flex-1 lg:min-w-0">
                              <span className="block text-sm font-bold leading-tight [overflow-wrap:anywhere]">{group.label}</span>
                              <span className="mt-0.5 block text-[11px] font-medium text-[#9ca3af]">
                                {tp("optionsCount", { count: group.ids.length })}
                              </span>
                            </span>
                            <ChevronRight className={`h-4 w-4 shrink-0 ${active ? "text-[#009FD9]" : "text-[#cbd5e1]"}`} />
                          </button>
                        );
                      })}
                    </div>
                  </aside>

                  <div className="min-w-0 p-4">
                    <div className="mb-3 flex items-end justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="truncate text-lg font-extrabold leading-tight text-[#162543]">
                          {activeGroup.label}
                        </h2>
                        <p className="mt-0.5 text-[11px] font-medium text-[#9ca3af]">
                          {tp("optionsCount", { count: activeGroup.ids.length })}
                        </p>
                      </div>
                    </div>

                    {activeGroupHasServices ? (
                      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                        {activeGroup.ids.map((id) => (
                          <Link
                            key={id}
                            href={`/buscar?categoria=${id}`}
                            className="group flex min-h-10 items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm font-semibold leading-snug text-[#374151] transition-colors hover:bg-[#EBF5FB] hover:text-[#0089bb]"
                          >
                            <span className="min-w-0 [overflow-wrap:anywhere]">
                              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                              {getCategoryLabel(id, locale) || t(id as any)}
                            </span>
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[#cbd5e1] transition-colors group-hover:bg-[#EAF7FD] group-hover:text-[#009FD9]">
                              <ChevronRight className="h-4 w-4" />
                            </span>
                          </Link>
                        ))}
                      </div>
                    ) : (
                      <div className="px-2 py-10 text-sm font-medium text-[#8a94a6]">
                        {locale === "en" ? "This section does not have published services yet." : "Esta sección todavía no tiene servicios publicados."}
                      </div>
                    )}
                  </div>
                </section>
            )}
          </div>
          </div>
        </section>
        </div>
      </main>

      <LandingFooter />
    </div>
  );
}

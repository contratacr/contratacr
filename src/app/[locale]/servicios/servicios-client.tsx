"use client";

import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Carril } from "@/components/ui/carril";
import { useDesvanecidoVertical } from "@/hooks/use-desvanecido-vertical";
import { useHairlineOnScroll } from "@/components/util/use-hairline-on-scroll";
import { PanelEmptyState } from "@/components/ui/content-loading";
import { cn } from "@/lib/utils";
import { useLocale } from "next-intl";
import { useTranslations } from "next-intl";
import { ContrataCRMark, HeaderAccountLink, HeaderMessagesLink, HeaderNotificationsLink, LandingNavbar } from "@/components/landing/landing-navbar";
import { LandingFooter } from "@/components/landing/landing-footer";
import { CategorySuggestionBox } from "@/components/ui/category-suggestion";
import { Link, useRouter } from "@/i18n/navigation";
import { avisarCambioDeCatalogo, instalarCatalogoDelServidor, useCustomCategories } from "@/lib/data/use-custom-categories";
import { useNativeApp } from "@/hooks/use-native-app";
import { useAuth } from "@/hooks/use-auth";
import { categorySlug, categorySearchScore, getAllCategories, getAllCategoryGroups, getCategoryGroupLabel, getCategoryLabel, isOtherCategoryGroup, normalizeText, searchCategories, getCategoryGroupId } from "@/lib/data/categories";
import { getCategoryGroupIcon } from "@/lib/data/category-group-visuals";
import {
  ArrowLeft,
  ChevronRight,
  Menu,
  Search,
  Wrench,
  X,
} from "lucide-react";
import { CABECERA_BOTON, CABECERA_FILA, CABECERA_FILA_CENTRADA, CABECERA_GLIFO, CABECERA_TITULO } from "@/components/layout/cabecera";

export function ServiciosClient({ catalogoInicial }: { catalogoInicial: string | null }) {
  // EL CATÁLOGO COMPLETO, DESDE EL PRIMER PINTADO. Esta página es de cliente y se
  // pre-renderiza en una capa de módulos donde el registro de servicios está
  // vacío: pintaba el catálogo fijo y, al hidratar, los diez grupos cambiaban de
  // número («Hogar 33 opciones» → «52») y la lista entera se rehacía delante de
  // la persona. El servidor manda el catálogo como dato y aquí se instala
  // DENTRO del primer render —en el inicializador de un estado, que corre igual
  // en el servidor y al hidratar—, antes de que nada lo lea.
  const [catalogoCambio] = useState(() => instalarCatalogoDelServidor(catalogoInicial));
  // Si de verdad cambió algo (llegar aquí navegando, con un catálogo más nuevo
  // que el que ya había), el resto de la pantalla se entera ya fuera del render.
  useEffect(() => { if (catalogoCambio) avisarCambioDeCatalogo(); }, [catalogoCambio]);
  const listaDeGruposRef = useRef<HTMLElement | null>(null);
  const { mascara: mascaraDeGrupos } = useDesvanecidoVertical(listaDeGruposRef);
  const t = useTranslations("categories");
  const tp = useTranslations("categoriesPage");
  const locale = useLocale();
  const nativeApp = useNativeApp();
  const { user: usuario, loading: sesionCargando } = useAuth();
  const router = useRouter();
  const customCategories = useCustomCategories();
  const [query, setQuery] = useState("");
  const [activeGroupKey, setActiveGroupKey] = useState("hogar");
  const [mobileGroupKey, setMobileGroupKey] = useState<string | null>(null);
  // La línea bajo el buscador solo cuando hay contenido pasando por debajo:
  // en reposo el encabezado y la página son un mismo blanco y la raya era un
  // corte sin trabajo que hacer.
  const { cabeceraRef, conLinea } = useHairlineOnScroll();
  const categoryCatalogVersion = JSON.stringify(customCategories);
  const groups = useMemo(() => {
    void categoryCatalogVersion;
    const categories = getAllCategories();
    const idsByGroup = new Map<string, string[]>();
    for (const category of categories) {
      const ids = idsByGroup.get(category.groupId) ?? [];
      ids.push(category.id);
      idsByGroup.set(category.groupId, ids);
    }
    return getAllCategoryGroups().map((group) => ({
      key: group.id,
      Icon: getCategoryGroupIcon(group.id, group.iconKey),
      label: getCategoryGroupLabel(group.id, locale),
      ids: idsByGroup.get(group.id) ?? [],
    }));
  }, [categoryCatalogVersion, locale]);
  const categoriesById = useMemo(
    () => {
      void categoryCatalogVersion;
      return new Map(getAllCategories().map((category) => [category.id, category]));
    },
    [categoryCatalogVersion],
  );
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
  const resultCount = useMemo(
    () => visibleGroups.reduce((sum, group) => sum + group.visibleIds.length, 0),
    [visibleGroups],
  );
  const activeGroup = groups.find((group) => group.key === activeGroupKey) ?? groups[0];
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
  const allCategoriesTitle = locale === "en" ? "All services" : "Todos los servicios";
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

  const selectGroup = useCallback((groupKey: string, mobile: boolean) => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    startTransition(() => {
      if (mobile) setMobileGroupKey(groupKey);
      else setActiveGroupKey(groupKey);
    });
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <div className="hidden lg:block">
        <LandingNavbar />
        <div className="ccr-navbar-spacer h-16" aria-hidden />
      </div>
      <div className="lg:hidden">
        <LandingNavbar mobileSearch={false} drawerOnly />
      </div>

      <main className="flex-1 bg-white lg:bg-[#fafafa]">
        <section data-services-mobile="" className="mx-auto w-full bg-white pb-[calc(2rem+env(safe-area-inset-bottom))] [.ccr-native-app_&]:pb-3 lg:hidden">
          <header ref={cabeceraRef} className={cn("ccr-cabecera-pegada sticky top-0 z-20 border-b bg-white transition-colors duration-200", conLinea ? "border-[#e5e7eb]" : "border-transparent")}>
            {mobileGroup ? (
              <div className={CABECERA_FILA_CENTRADA}>
                <button
                  type="button"
                  onClick={() => setMobileGroupKey(null)}
                  className={cn("absolute left-4 top-1/2 -translate-y-1/2", CABECERA_BOTON)}
                  aria-label={locale === "en" ? "Back to categories" : "Volver a categorías"}
                >
                  <ArrowLeft className={cn(CABECERA_GLIFO, "stroke-[2.4]")} />
                </button>
                <h1 className={cn(CABECERA_TITULO, "text-center")}>{mobileGroup.label}</h1>
              </div>
            ) : (
              <div className={CABECERA_FILA}>
                <button
                  type="button"
                  onClick={() => window.dispatchEvent(new Event("ccr:open-mobile-menu"))}
                  className={CABECERA_BOTON}
                  aria-label={locale === "en" ? "Open menu" : "Abrir menú"}
                >
                  <Menu className="h-5 w-5" strokeWidth={2.5} />
                </button>
                <Link href="/" aria-label="ContrataCR inicio" className="shrink-0">
                  <ContrataCRMark />
                </Link>
                <p className={CABECERA_TITULO}>{servicesTitle}</p>
                {/* El icono de Mensajes es de la barra de la APP: en la web se
                    llega desde el menú y desde el panel. */}
                <div className="ml-auto flex shrink-0 items-center gap-0.5">
                  {nativeApp && (
                    <HeaderMessagesLink
                      unreadCount={0}
                      label={tp("messages")}
                      href={`/login?redirect=${encodeURIComponent(`/${locale}/mensajes`)}`}
                    />
                  )}
                  {nativeApp ? (
                    <HeaderNotificationsLink
                      href={`/login?redirect=${encodeURIComponent(`/${locale}/notificaciones`)}`}
                      label={tp("notifications")}
                    />
                  ) : (
                    /* El acceso SOLO sin sesión. Esta cabecera es propia de la
                       pantalla —no la barra—, así que no se enteraba de la
                       sesión y enseñaba la silueta de «Iniciar sesión» a quien
                       ya estaba dentro. Mientras la sesión se resuelve no se
                       pinta nada: evita que el icono aparezca y desaparezca. */
                    !sesionCargando && !usuario && <HeaderAccountLink />
                  )}
                </div>
              </div>
            )}

            <form onSubmit={submitSearch} data-testid="services-page-mobile-search" className="px-4 pb-4">
              <div className="flex h-11 w-full items-center gap-3 rounded-[10px] border border-[#e5e7eb] bg-white px-4 transition-colors focus-within:ring-2 focus-within:ring-[#009FD9]/20">
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

          {query.trim() && resultCount === 0 ? (
            <section className="mx-4 mt-4 rounded-2xl border border-[#e5e7eb] bg-white text-center shadow-sm">
              {/* El MISMO vacío del resto del app; el borde de antes era más
                  oscuro que el de cualquier tarjeta del sitio. */}
              <PanelEmptyState plano icon={Search} title={tp("notListed")} description={tp("suggestDescription")} className="min-h-0 pb-0" />
              <div className="mx-auto flex max-w-xl flex-col items-center px-5 pb-10">
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
            <section className="mx-4 mt-3 overflow-hidden rounded border border-[#d7e1ea] bg-white">
              <p className="border-b border-[#d7e1ea] px-4 py-3 text-[13px] font-bold uppercase tracking-wide text-[#64748b]">
                {serviceResultsTitle}
              </p>
              {/* Cada oficio lleva a SU página, no a los resultados de búsqueda.
                  Antes todos apuntaban a `/buscar?categoria=X`, así que las 784
                  páginas por oficio y provincia —que existen, están bien hechas
                  y están en el sitemap— no recibían UN SOLO enlace desde el
                  sitio. Search Console lo dijo con todas sus letras: «Página de
                  referencia: no se ha detectado ninguna» y «Último rastreo:
                  N/D». Google las conocía solo por el sitemap y nunca las
                  visitó, porque una página a la que nadie enlaza parece una
                  página que no importa.

                  La cadena ya estaba armada del segundo eslabón en adelante: la
                  página de oficio enlaza a sus provincias y a los perfiles, y
                  tiene salida a `/buscar` para quien quiera filtrar. Solo
                  faltaba el primero. */}
              {searchResults.map(({ id, groupLabel }) => {
                const IconoFamilia = getCategoryGroupIcon(getCategoryGroupId(id));
                return (
                <Link key={id} href={`/servicios/${categorySlug(id)}`} className="flex min-h-[62px] items-center justify-between gap-3 border-b border-[#d7e1ea] px-4 py-3 last:border-b-0">
                  <IconoFamilia className="h-5 w-5 shrink-0 text-[#64748b]" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[16px] font-extrabold leading-tight text-[#162543] [overflow-wrap:anywhere]">
                      {getCategoryLabel(id, locale)}
                    </span>
                    <span className="mt-0.5 block text-xs font-semibold text-[#7b8794]">{groupLabel}</span>
                  </span>
                  <ChevronRight className="h-6 w-6 shrink-0 text-[#c2c7cc]" />
                </Link>
                );
              })}
            </section>
          ) : mobileGroup ? (
            <section className="mx-4 mt-3 overflow-hidden rounded border border-[#d7e1ea] bg-white">
              <Link
                href={`/buscar?grupo=${mobileGroup.key}`}
                className="flex min-h-[62px] items-center gap-3 border-b border-[#d7e1ea] px-4 py-3 text-[16px] font-extrabold leading-tight text-[#009FD9]"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#eef8fc] text-[#009FD9]">
                  <mobileGroup.Icon className="h-[18px] w-[18px]" />
                </span>
                {locale === "en" ? `All ${mobileGroup.label} services` : `Todos los servicios de ${mobileGroup.label}`}
              </Link>
              {mobileGroup.visibleIds.map((id) => (
                <Link key={id} href={`/servicios/${categorySlug(id)}`} className="flex min-h-[62px] items-center border-b border-[#d7e1ea] px-4 py-3 last:border-b-0">
                  <span className="min-w-0 text-[16px] font-extrabold leading-tight text-[#162543] [overflow-wrap:anywhere]">
                    {getCategoryLabel(id, locale)}
                  </span>
                </Link>
              ))}
            </section>
          ) : (
            <>
              <p className="mx-4 mt-4 text-[15px] font-bold text-[#526277]">{allCategoriesTitle}</p>
              <section className="mx-4 mt-2 overflow-hidden rounded border border-[#d7e1ea] bg-white">
                {mobileGroups.map((group) => {
                  const IconoGrupo = group.Icon;
                  return (
                  <button
                    key={group.key}
                    type="button"
                    data-testid="services-mobile-group-option"
                    onClick={() => selectGroup(group.key, true)}
                    className="flex min-h-[62px] w-full items-center justify-between gap-3 border-b border-[#d7e1ea] bg-white px-4 py-3 text-left last:border-b-0"
                  >
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#eef8fc] text-[#009FD9]">
                      <IconoGrupo className="h-[18px] w-[18px]" />
                    </span>
                    <span className="min-w-0 flex-1 text-[16px] font-extrabold leading-tight text-[#162543] [overflow-wrap:anywhere]">{group.label}</span>
                    <ChevronRight className="h-6 w-6 shrink-0 text-[#c2c7cc]" />
                  </button>
                  );
                })}
              </section>
            </>
          )}
        </section>

        <div className="hidden lg:block">
        {/* SIN PORTADA. «SERVICIOS · Encuentra el servicio que necesitas» decía
            en dos renglones grandes lo que la pantalla ya demuestra: el buscador
            y la lista de servicios están justo debajo. Empujaba lo que sirve
            media pantalla hacia abajo, y ninguna otra sección del app se
            presenta a sí misma. El título sigue en la pestaña del navegador y
            en los metadatos, que es donde hace falta para Google. */}
        <section className="px-4 pb-16 pt-6 lg:pt-8">
          <div className="mx-auto max-w-6xl">
          <div className="overflow-hidden rounded-[28px] border border-[#e5e7eb] bg-white shadow-[0_18px_44px_rgba(15,23,42,0.06)]">
            <div className="border-b border-[#eef2f6] bg-white p-3 sm:p-4">
              <form
                onSubmit={submitSearch}
                data-testid="services-page-search"
                className="flex h-11 w-full items-center gap-3 rounded-[10px] border border-[#e5e7eb] bg-white px-4 text-left transition-colors focus-within:ring-2 focus-within:ring-[#009FD9]/20"
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
                  <button type="button" onClick={() => setQuery("")} className="rounded-full p-1.5 text-[#68778d] hover:bg-[#f3f4f6] hover:text-[#374151]" aria-label={tp("clearSearch")}>
                    <X className="h-4 w-4" />
                  </button>
                )}
              </form>
            </div>

            {query.trim() && resultCount === 0 ? (
              <section className="text-center">
                <PanelEmptyState plano icon={Search} title={tp("notListed")} description={tp("suggestDescription")} className="min-h-0 pb-0" />
                <div className="mx-auto flex max-w-xl flex-col items-center px-4 pb-10 sm:px-6">
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
                      <p className="mt-0.5 text-[11px] font-medium text-[#68778d]">
                        {tp("optionsCount", { count: searchResults.length })}
                      </p>
                    </div>
                  </div>

                  <div className={`grid gap-1.5 ${searchResults.length === 1 ? "max-w-[320px] grid-cols-1" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"}`}>
                    {searchResults.map(({ id, groupLabel }) => (
                      <Link
                        key={id}
                        href={`/servicios/${categorySlug(id)}`}
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
                  {/* EN COMPUTADORA LA LISTA SE DESPLAZA POR DENTRO Y SE DESVANECE
                      ABAJO. Medía lo que midiera la columna de al lado y estaba
                      en `overflow-hidden`: con un grupo corto elegido (Creatividad,
                      12 opciones) la columna quedaba más baja que las 17 categorías
                      y las últimas se cortaban SIN forma de llegar a ellas. Ahora
                      la lista se desplaza y el velo del borde deja ver la fila
                      cortada, que es lo que dice «hay más». */}
                  <aside ref={listaDeGruposRef} style={{ maskImage: mascaraDeGrupos, WebkitMaskImage: mascaraDeGrupos }} className="min-w-0 overflow-hidden border-b border-[#eef2f6] bg-[#f8fafc] p-2 lg:overflow-y-auto lg:border-b-0 lg:border-r">
                    <Carril className="flex w-full min-w-0 gap-2 overflow-x-auto pb-1 lg:block lg:space-y-1 lg:overflow-visible lg:pb-0">
                      {groups.map((group) => {
                        const Icon = group.Icon;
                        const active = group.key === activeGroup.key;
                        return (
                          <button
                            key={group.key}
                            type="button"
                            data-testid="services-group-option"
                            onClick={() => selectGroup(group.key, false)}
                            className={`group flex min-h-[48px] shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors lg:w-full ${
                              active ? "bg-white text-[#162543] shadow-sm" : "text-[#526173] hover:bg-white/80 hover:text-[#162543]"
                            }`}
                          >
                            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${active ? "bg-[#EAF7FD] text-[#0089bb]" : "bg-white text-[#8a94a6] group-hover:text-[#0089bb]"}`}>
                              <Icon className="h-4 w-4" />
                            </span>
                            <span className="min-w-[130px] flex-1 lg:min-w-0">
                              <span className="block text-sm font-bold leading-tight [overflow-wrap:anywhere]">{group.label}</span>
                              <span className="mt-0.5 block text-[11px] font-medium text-[#68778d]">
                                {tp("optionsCount", { count: group.ids.length })}
                              </span>
                            </span>
                            <ChevronRight className={`h-4 w-4 shrink-0 ${active ? "text-[#009FD9]" : "text-[#cbd5e1]"}`} />
                          </button>
                        );
                      })}
                    </Carril>
                  </aside>

                  <div className="min-w-0 p-4">
                    <div className="mb-3 flex items-end justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="truncate text-lg font-extrabold leading-tight text-[#162543]">
                          {activeGroup.label}
                        </h2>
                        <p className="mt-0.5 text-[11px] font-medium text-[#68778d]">
                          {tp("optionsCount", { count: activeGroup.ids.length })}
                        </p>
                      </div>
                    </div>

                    {activeGroupHasServices ? (
                      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                        {activeGroup.ids.map((id) => (
                          <Link
                            key={id}
                            href={`/servicios/${categorySlug(id)}`}
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
                      <PanelEmptyState
                        plano
                        tamano="compacto"
                        icon={Wrench}
                        title={locale === "en" ? "This section does not have published services yet." : "Esta sección todavía no tiene servicios publicados."}
                        className="min-h-[9rem]"
                      />
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

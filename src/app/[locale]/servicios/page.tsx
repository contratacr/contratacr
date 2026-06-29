"use client";

import { useMemo, useState } from "react";
import { useLocale } from "next-intl";
import { useTranslations } from "next-intl";
import { LandingNavbar } from "@/components/landing/landing-navbar";
import { LandingFooter } from "@/components/landing/landing-footer";
import { CategorySuggestionBox } from "@/components/ui/category-suggestion";
import { Link, useRouter } from "@/i18n/navigation";
import { useCustomCategories } from "@/lib/data/use-custom-categories";
import { getAllCategories, getAllCategoryGroups, getCategoryGroupLabel, getCategoryLabel, normalizeText, searchCategories } from "@/lib/data/categories";
import {
  Home,
  Leaf,
  Sparkles,
  Laptop,
  Briefcase,
  Heart,
  Star,
  BookOpen,
  Truck,
  CalendarDays,
  Shield,
  Car,
  ChevronRight,
  Search,
  Tag,
  X,
} from "lucide-react";

const GROUPS = [
  {
    key: "hogar",
    Icon: Home,
    ids: [
      "plomeria","electricidad","construccion","pintura","carpinteria",
      "remodelacion","techos","pisos","impermeabilizacion","fumigacion",
      "cerrajeria","aire_acondicionado","calentadores","ventanas_puertas",
      "soldadura","gypsum",
    ],
  },
  {
    key: "jardin",
    Icon: Leaf,
    ids: [
      "jardineria","poda_arboles","paisajismo","limpieza_piscinas",
      "riego_automatizado","control_plagas",
    ],
  },
  {
    key: "limpieza",
    Icon: Sparkles,
    ids: [
      "limpieza","limpieza_oficinas","desinfeccion","lavado_alfombras",
      "limpieza_post_construccion","lavado_vehiculos",
    ],
  },
  {
    key: "tecnologia",
    Icon: Laptop,
    ids: [
      "reparacion_computadoras","redes_internet","camaras_seguridad","domotica",
      "desarrollo_web","diseno_grafico","diseno_apps","soporte_tecnico",
      "impresion_3d","audio_video",
    ],
  },
  {
    key: "profesional",
    Icon: Briefcase,
    ids: [
      "contabilidad","legal","ingenieria_civil","arquitectura","topografia",
      "consultoria","traduccion","recursos_humanos","marketing_digital",
      "fotografia","produccion_video","bienes_raices",
    ],
  },
  {
    key: "salud",
    Icon: Heart,
    ids: [
      "entrenamiento_personal","nutricion","masajes","psicologia","fisioterapia",
      "enfermeria","cuidado_adultos","cuidado_infantil","veterinaria","peluqueria_canina",
    ],
  },
  {
    key: "belleza",
    Icon: Star,
    ids: [
      "peluqueria","maquillaje","unhas","pestanas","depilacion",
      "estetica_facial","bronceado",
    ],
  },
  {
    key: "educacion",
    Icon: BookOpen,
    ids: [
      "tutorias","idiomas","musica","matematicas","preparacion_universitaria",
      "clases_manejo","clases_cocina",
    ],
  },
  {
    key: "transporte",
    Icon: Truck,
    ids: ["mudanzas","fletes","mensajeria","transporte_mascotas"],
  },
  {
    key: "eventos",
    Icon: CalendarDays,
    ids: [
      "fotografia_eventos","videografia","dj_sonido","catering",
      "decoracion","animacion_infantil","bartending",
    ],
  },
  {
    key: "seguridad",
    Icon: Shield,
    ids: ["guardas_seguridad","alarmas","cctv","control_acceso"],
  },
  {
    key: "automotriz",
    Icon: Car,
    ids: ["mecanica","hojalateria","electricidad_automotriz","tapiceria","detailing","cambio_llantas"],
  },
] as const;

export default function ServiciosPage() {
  const t = useTranslations("categories");
  const tp = useTranslations("categoriesPage");
  const locale = useLocale();
  const router = useRouter();
  const customCategories = useCustomCategories();
  void customCategories;
  const [query, setQuery] = useState("");
  const [activeGroupKey, setActiveGroupKey] = useState("hogar");
  const groups = getAllCategoryGroups().map((group) => {
    const meta = GROUPS.find((item) => item.key === group.id);
    return {
      key: group.id,
      Icon: meta?.Icon ?? Tag,
      label: getCategoryGroupLabel(group.id, locale),
      ids: getAllCategories().filter((category) => category.groupId === group.id).map((category) => category.id),
    };
  });
  const normalizedQuery = normalizeText(query.trim());
  const matchedIds = useMemo(() => {
    if (!normalizedQuery) return null;
    return new Set(searchCategories(query).map((category) => category.id));
  }, [normalizedQuery, query]);
  const visibleGroups = useMemo(() => groups
    .map((group) => ({
      ...group,
      visibleIds: matchedIds ? group.ids.filter((id) => matchedIds.has(id)) : [...group.ids],
    }))
    .filter((group) => group.visibleIds.length > 0)
    .sort((a, b) => {
      if (!matchedIds) return 0;
      const aLabel = normalizeText(a.label);
      const bLabel = normalizeText(b.label);
      const aLabelMatch = aLabel.includes(normalizedQuery) ? 1 : 0;
      const bLabelMatch = bLabel.includes(normalizedQuery) ? 1 : 0;
      if (aLabelMatch !== bLabelMatch) return bLabelMatch - aLabelMatch;
      return b.visibleIds.length - a.visibleIds.length;
    }), [groups, matchedIds, normalizedQuery]);
  const searchResults = useMemo(() => visibleGroups.flatMap((group) =>
    group.visibleIds.map((id) => ({ id, groupLabel: group.label, Icon: group.Icon }))
  ), [visibleGroups]);
  const resultCount = visibleGroups.reduce((sum, group) => sum + group.visibleIds.length, 0);
  const activeGroup = groups.find((group) => group.key === activeGroupKey) ?? groups[0] ?? GROUPS[0];
  const activeSearchGroup = visibleGroups.find((group) => group.key === activeGroupKey) ?? visibleGroups[0];
  const activeSearchIds = activeSearchGroup?.visibleIds ?? searchResults.map((item) => item.id);
  const activeGroupHasServices = activeGroup.ids.length > 0;

  function submitSearch(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!query.trim()) {
      router.push("/buscar");
      return;
    }
    const first = visibleGroups[0]?.visibleIds[0];
    if (first) router.push(`/buscar?categoria=${first}`);
    else router.push("/buscar");
  }

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <LandingNavbar />

      <main className="flex-1 bg-[#f7fafc]">
        <section className="relative z-30 px-4 pb-5 pt-24 sm:pt-28">
          <div className="mx-auto max-w-6xl">
            <div className="max-w-3xl">
              <span className="mb-2.5 inline-flex rounded-full bg-[#EBF5FB] px-3 py-1 text-xs font-bold uppercase text-[#0089bb]">
                {tp("eyebrow")}
              </span>
              <h1 className="text-[2rem] font-extrabold leading-tight text-[#1a2744] sm:text-4xl">
                {tp("title")}
              </h1>
              <p className="mt-2.5 max-w-2xl text-sm leading-6 text-[#5f6b7a] sm:text-base">
                {tp("subtitle")}
              </p>
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
                className="flex h-[54px] items-center gap-3 rounded-2xl border border-[#dbe5ee] bg-[#fbfdff] px-4 text-left transition-all focus-within:border-[#009FD9] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#009FD9]/20"
              >
                <Search className="h-5 w-5 shrink-0 text-[#8a94a6]" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={tp("searchPlaceholder")}
                  aria-label={tp("searchAria")}
                  className="h-[50px] min-w-0 flex-1 bg-transparent text-base text-gray-700 placeholder:text-gray-400 focus:outline-none"
                />
                {query && (
                  <button type="button" onClick={() => setQuery("")} className="rounded-full p-1.5 text-[#9ca3af] hover:bg-[#f3f4f6] hover:text-[#374151]" aria-label={tp("clearSearch")}>
                    <X className="h-4 w-4" />
                  </button>
                )}
              </form>
              {query.trim() && resultCount > 0 && (
                <p className="px-1 pt-2 text-xs font-semibold text-[#6b7280]">
                  {tp("searchSummary", { count: resultCount, query: query.trim() })}
                </p>
              )}
            </div>

            {query.trim() && resultCount === 0 ? (
              <section className="px-4 py-12 text-center sm:px-6">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#f1f7fb] text-[#9ca3af]">
                  <Search className="h-6 w-6" />
                </div>
                <h2 className="mt-4 text-lg font-extrabold text-[#162543]">{tp("noResults")}</h2>
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
              <section className="grid scroll-mt-32 lg:min-h-[460px] lg:grid-cols-[300px_minmax(0,1fr)]">
                <aside className="min-w-0 overflow-hidden border-b border-[#edf2f7] bg-[#fbfdff] p-3 lg:border-b-0 lg:border-r">
                  <div className="px-1 pb-2">
                    <p className="text-xs font-bold uppercase tracking-wide text-[#8a94a6]">{tp("resultsTitle")}</p>
                    <h2 className="mt-1 text-lg font-extrabold text-[#162543]">
                      {tp("searchSummary", { count: resultCount, query: query.trim() })}
                    </h2>
                  </div>
                  <div className="flex w-full min-w-0 gap-2 overflow-x-auto pb-1 lg:block lg:space-y-1 lg:overflow-visible lg:pb-0">
                    {visibleGroups.map((group) => {
                      const Icon = group.Icon;
                      const active = group.key === activeSearchGroup?.key;
                      return (
                        <button
                          key={group.key}
                          type="button"
                          onClick={() => setActiveGroupKey(group.key)}
                          className={`group flex min-h-[48px] shrink-0 items-center gap-3 rounded-2xl border px-3 py-2 text-left transition-colors lg:w-full ${
                            active ? "border-[#c6edf9] bg-[#EBF5FB] text-[#0077a3]" : "border-transparent bg-white text-[#374151] hover:bg-[#f4f8fb]"
                          }`}
                        >
                          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${active ? "bg-[#009FD9] text-white" : "bg-[#f1f7fb] text-[#009FD9]"}`}>
                            <Icon className="h-[18px] w-[18px]" />
                          </span>
                          <span className="min-w-[130px] flex-1 lg:min-w-0">
                            <span className="block text-sm font-extrabold leading-tight [overflow-wrap:anywhere]">{group.label}</span>
                            <span className="mt-0.5 block text-xs font-semibold text-[#8a94a6]">
                              {tp("optionsCount", { count: group.visibleIds.length })}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </aside>

                <div className="min-w-0">
                  <div className="flex items-end justify-between gap-3 border-b border-[#eef2f6] px-4 py-4 sm:px-6">
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-[#8a94a6]">{tp("resultsTitle")}</p>
                      <h2 className="mt-0.5 text-xl font-extrabold leading-tight text-[#162543] [overflow-wrap:anywhere]">
                        {activeSearchGroup?.label}
                      </h2>
                      <p className="mt-0.5 text-xs font-medium text-[#8a94a6]">
                        {tp("optionsCount", { count: activeSearchIds.length })}
                      </p>
                    </div>
                  </div>

                  <div className={`grid grid-cols-1 ${activeSearchIds.length === 1 ? "sm:max-w-[320px]" : "sm:grid-cols-2 xl:grid-cols-3"}`}>
                    {activeSearchIds.map((id) => (
                      <Link
                        key={id}
                        href={`/buscar?categoria=${id}`}
                        className="group flex min-h-[58px] items-center justify-between gap-3 border-b border-[#f1f5f9] px-4 py-3 text-sm font-semibold leading-snug text-[#374151] transition-colors hover:bg-[#f8fbfe] hover:text-[#0089bb] sm:border-r sm:[&:nth-child(2n)]:border-r-0 xl:[&:nth-child(2n)]:border-r xl:[&:nth-child(3n)]:border-r-0"
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
                  <div className={`${activeSearchIds.length === 1 ? "" : "border-t border-[#eef2f6]"} bg-[#fbfdff] px-4 py-3 sm:px-6`}>
                    <div className="flex flex-col gap-2 bg-white px-1 py-2 sm:flex-row sm:items-center sm:gap-4">
                      <div className="min-w-0">
                        <p className="text-sm font-extrabold text-[#162543]">{tp("notListed")}</p>
                        <p className="mt-0.5 text-sm text-[#6b7280]">{tp("suggestDescription")}</p>
                      </div>
                      <CategorySuggestionBox
                        prominent
                        defaultName={query}
                        className="sm:shrink-0"
                        notListedLabel={tp("suggestCta")}
                        placeholder={tp("suggestPlaceholder")}
                        sendLabel={tp("suggestSend")}
                        sendingLabel={tp("suggestSending")}
                        cancelLabel={tp("cancel")}
                        thanksLabel={tp("suggestThanks")}
                      />
                    </div>
                  </div>
                </div>
              </section>
            ) : (
                <section className="grid min-h-[560px] scroll-mt-32 lg:grid-cols-[300px_minmax(0,1fr)]">
                  <aside className="min-w-0 overflow-hidden border-b border-[#edf2f7] bg-[#fbfdff] p-3 lg:border-b-0 lg:border-r">
                    <div className="flex w-full min-w-0 gap-2 overflow-x-auto pb-1 lg:block lg:space-y-1 lg:overflow-visible lg:pb-0">
                      {groups.map((group) => {
                        const Icon = group.Icon;
                        const active = group.key === activeGroup.key;
                        return (
                          <button
                            key={group.key}
                            type="button"
                            onClick={() => setActiveGroupKey(group.key)}
                            className={`group flex min-h-[48px] shrink-0 items-center gap-3 rounded-2xl border px-3 py-2 text-left transition-colors lg:w-full ${
                              active ? "border-[#c6edf9] bg-[#EBF5FB] text-[#0077a3]" : "border-transparent bg-white text-[#374151] hover:bg-[#f4f8fb]"
                            }`}
                          >
                            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${active ? "bg-[#009FD9] text-white" : "bg-[#f1f7fb] text-[#009FD9]"}`}>
                              <Icon className="h-[18px] w-[18px]" />
                            </span>
                            <span className="min-w-[130px] flex-1 lg:min-w-0">
                              <span className="block text-sm font-extrabold leading-tight [overflow-wrap:anywhere]">{group.label}</span>
                              <span className="mt-0.5 block text-xs font-semibold text-[#8a94a6]">
                                {tp("optionsCount", { count: group.ids.length })}
                              </span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </aside>

                  <div className="min-w-0">
                    <div className="flex items-end justify-between gap-3 border-b border-[#eef2f6] px-4 py-4 sm:px-6">
                      <div className="min-w-0">
                        <p className="text-[11px] font-bold uppercase tracking-wide text-[#8a94a6]">{tp("resultsTitle")}</p>
                        <h2 className="mt-0.5 text-xl font-extrabold leading-tight text-[#162543] [overflow-wrap:anywhere]">
                          {activeGroup.label}
                        </h2>
                        <p className="mt-0.5 text-xs font-medium text-[#8a94a6]">
                          {tp("optionsCount", { count: activeGroup.ids.length })}
                        </p>
                      </div>
                    </div>

                    {activeGroupHasServices ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
                        {activeGroup.ids.map((id) => (
                          <Link
                            key={id}
                            href={`/buscar?categoria=${id}`}
                            className="group flex min-h-[58px] items-center justify-between gap-3 border-t border-[#f1f5f9] px-4 py-3 text-sm font-semibold leading-snug text-[#374151] transition-colors hover:bg-[#f8fbfe] hover:text-[#0089bb] sm:border-r sm:[&:nth-child(2n)]:border-r-0 xl:[&:nth-child(2n)]:border-r xl:[&:nth-child(3n)]:border-r-0"
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
                      <div className="border-t border-[#f1f5f9] px-6 py-12 text-sm font-medium text-[#8a94a6]">
                        {locale === "en" ? "This section does not have published services yet." : "Esta sección todavía no tiene servicios publicados."}
                      </div>
                    )}
                  </div>
                </section>
            )}
          </div>
          </div>
        </section>
      </main>

      <LandingFooter />
    </div>
  );
}

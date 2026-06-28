"use client";

import { useMemo, useState } from "react";
import { useLocale } from "next-intl";
import { useTranslations } from "next-intl";
import { LandingNavbar } from "@/components/landing/landing-navbar";
import { LandingFooter } from "@/components/landing/landing-footer";
import { Link, useRouter } from "@/i18n/navigation";
import { getCategoryLabel, normalizeText, searchCategories } from "@/lib/data/categories";
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
    key: "mudanzas",
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

const POPULAR_SERVICE_IDS = [
  "plomeria",
  "electricidad",
  "limpieza",
  "reparacion_computadoras",
  "medicina_domicilio",
  "mecanica",
  "dj_sonido",
  "fotografia",
] as const;

function groupForService(id: string) {
  return GROUPS.find((group) => group.ids.some((serviceId) => serviceId === id));
}

export default function ServiciosPage() {
  const t = useTranslations("categories");
  const tg = useTranslations("categoryGroups");
  const tp = useTranslations("categoriesPage");
  const locale = useLocale();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const normalizedQuery = normalizeText(query.trim());
  const matchedIds = useMemo(() => {
    if (!normalizedQuery) return null;
    return new Set(searchCategories(query).map((category) => category.id));
  }, [normalizedQuery, query]);
  const visibleGroups = useMemo(() => GROUPS
    .map((group) => ({
      ...group,
      visibleIds: matchedIds ? group.ids.filter((id) => matchedIds.has(id)) : [...group.ids],
    }))
    .filter((group) => group.visibleIds.length > 0), [matchedIds]);
  const searchResults = useMemo(() => visibleGroups.flatMap((group) =>
    group.visibleIds.map((id) => ({ id, groupKey: group.key, Icon: group.Icon }))
  ), [visibleGroups]);
  const popularServices = useMemo(() => POPULAR_SERVICE_IDS.map((id) => {
    const group = groupForService(id);
    return { id, groupKey: group?.key, Icon: group?.Icon ?? Search };
  }), []);
  const resultCount = visibleGroups.reduce((sum, group) => sum + group.visibleIds.length, 0);
  const totalServices = GROUPS.reduce((sum, group) => sum + group.ids.length, 0);

  function submitSearch(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const first = visibleGroups[0]?.visibleIds[0];
    if (first) router.push(`/buscar?categoria=${first}`);
    else router.push("/buscar");
  }

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <LandingNavbar />

      <section className="relative z-30 border-b border-[#eef2f6] bg-white px-4 pb-5 pt-24 sm:pt-28">
        <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(360px,0.8fr)] lg:items-end">
            <div className="min-w-0">
              <span className="mb-2.5 inline-flex rounded-full bg-[#EBF5FB] px-3 py-1 text-xs font-bold uppercase text-[#0089bb]">
                {tp("eyebrow")}
              </span>
              <h1 className="max-w-2xl text-[2rem] font-extrabold leading-tight text-[#1a2744] sm:text-4xl">
                {tp("title")}
              </h1>
              <p className="mt-2.5 max-w-2xl text-sm leading-6 text-[#5f6b7a] sm:text-base">
                {tp("subtitle")}
              </p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold text-[#5f6b7a]">
                <span className="rounded-full bg-[#f6f8fb] px-3 py-1.5">{tp("groupCount", { count: GROUPS.length })}</span>
                <span className="rounded-full bg-[#f6f8fb] px-3 py-1.5">{tp("serviceCount", { count: totalServices })}</span>
              </div>
            </div>
            <div className="w-full">
              <form
                onSubmit={submitSearch}
                className="flex h-[56px] items-center gap-3 rounded-2xl border border-[#dbe5ee] bg-white px-4 text-left shadow-[0_14px_32px_rgba(15,23,42,0.08)] transition-all focus-within:border-[#009FD9] focus-within:ring-2 focus-within:ring-[#009FD9]/20"
              >
                <Search className="h-5 w-5 shrink-0 text-gray-400" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={tp("searchPlaceholder")}
                  aria-label={tp("searchAria")}
                  className="h-[52px] min-w-0 flex-1 bg-transparent text-base text-gray-700 placeholder:text-gray-400 focus:outline-none"
                />
                {query && (
                  <button type="button" onClick={() => setQuery("")} className="rounded-full p-1.5 text-[#9ca3af] hover:bg-[#f3f4f6] hover:text-[#374151]" aria-label={tp("clearSearch")}>
                    <X className="h-4 w-4" />
                  </button>
                )}
              </form>
              {query.trim() && (
                <div className="mt-3 text-left">
                  {resultCount > 0 ? (
                    <p className="text-sm font-medium text-[#5f6b7a]">
                      {tp("searchSummary", { count: resultCount, query: query.trim() })}
                    </p>
                  ) : (
                    <div className="rounded-2xl border border-[#d8eef8] bg-[#f8fbfe] px-4 py-3">
                      <p className="text-sm font-semibold text-[#374151]">{tp("noResults")}</p>
                      <p className="mt-0.5 text-xs text-[#9ca3af]">{tp("noResultsHint")}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
        </div>
      </section>

      <section className="border-b border-[#eef2f6] bg-white px-4 py-3">
        <div className="mx-auto max-w-6xl">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-xs font-bold uppercase tracking-wide text-[#8a94a6]">{tp("popularTitle")}</p>
            <Link href="/buscar" className="text-xs font-bold text-[#0089bb] hover:text-[#006f98]">
              {tp("searchAll")}
            </Link>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 hide-scrollbar">
            {popularServices.map(({ id, Icon }) => (
              <Link
                key={id}
                href={`/buscar?categoria=${id}`}
                className="group inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full border border-[#dbeaf2] bg-[#f8fbfe] px-3.5 py-2 text-sm font-bold text-[#374151] transition-colors hover:border-[#9eddf4] hover:bg-[#EBF5FB] hover:text-[#0089bb]"
              >
                <Icon className="h-4 w-4 text-[#009FD9]" />
                <span>{getCategoryLabel(id, locale)}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="sticky top-16 z-20 border-b border-[#eef2f6] bg-white/95 px-4 py-3 backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-6xl gap-2 overflow-x-auto hide-scrollbar">
          {visibleGroups.map((group) => {
            const Icon = group.Icon;
            return (
              <a
                key={group.key}
                href={`#${group.key}`}
                className="inline-flex shrink-0 items-center gap-2 rounded-full border border-[#e6edf3] bg-white px-3.5 py-2 text-sm font-semibold text-[#374151] shadow-sm transition-colors hover:bg-[#EBF5FB] hover:text-[#0089bb]"
              >
                <Icon className="h-4 w-4 text-[#009FD9]" />
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {tg(group.key as any)}
                {query.trim() && <span className="text-xs text-[#9ca3af]">{group.visibleIds.length}</span>}
              </a>
            );
          })}
        </div>
      </section>

      <section className="bg-[#f7fafc] px-4 pb-16 pt-6 sm:pt-8">
        <div className="mx-auto grid max-w-6xl gap-5 lg:grid-cols-[260px_minmax(0,1fr)] lg:items-start">
          <aside className="hidden lg:block">
            <div className="sticky top-24 rounded-2xl border border-[#e6edf3] bg-white p-2 shadow-[0_12px_28px_rgba(15,23,42,0.05)]">
              <div className="px-3 pb-2 pt-2">
                <p className="text-xs font-bold uppercase tracking-wide text-[#8a94a6]">
                  {tp("viewAll")}
                </p>
              </div>
              <nav className="max-h-[calc(100vh-190px)] overflow-y-auto py-1">
                {visibleGroups.map((group) => {
                  const Icon = group.Icon;
                  return (
                    <a
                      key={group.key}
                      href={`#${group.key}`}
                      className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-[#374151] transition-colors hover:bg-[#f8fbfe] hover:text-[#0089bb]"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#EAF7FD] text-[#009FD9]">
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                        {tg(group.key as any)}
                      </span>
                      <span className="shrink-0 rounded-full bg-[#f1f5f9] px-2 py-0.5 text-xs font-bold text-[#64748b]">
                        {query.trim() ? group.visibleIds.length : group.ids.length}
                      </span>
                    </a>
                  );
                })}
              </nav>
            </div>
          </aside>

          <div className="min-w-0 overflow-hidden rounded-3xl border border-[#e6edf3] bg-white shadow-[0_14px_34px_rgba(15,23,42,0.05)]">
            {query.trim() && resultCount > 0 ? (
              <section className="scroll-mt-32">
                  <div className="border-b border-[#eef2f6] px-4 py-4 sm:px-6">
                    <div>
                      <h2 className="text-lg font-extrabold leading-tight text-[#162543]">
                        {tp("resultsTitle")}
                      </h2>
                      <p className="mt-0.5 text-xs font-medium text-[#8a94a6]">
                        {tp("searchSummary", { count: resultCount, query: query.trim() })}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
                      {searchResults.map(({ id, groupKey, Icon }) => (
                        <Link
                          key={id}
                          href={`/buscar?categoria=${id}`}
                          className="group flex min-h-[70px] items-center justify-between gap-3 border-b border-[#eef2f6] px-4 py-3 text-left transition-colors hover:bg-[#f8fbfe] sm:border-r xl:[&:nth-child(3n)]:border-r-0"
                        >
                          <span className="flex min-w-0 items-center gap-3">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#EAF7FD] text-[#009FD9]">
                              <Icon className="h-4 w-4" />
                            </span>
                            <span className="min-w-0">
                              <span className="block text-sm font-semibold leading-snug text-[#374151] [overflow-wrap:anywhere] group-hover:text-[#0089bb]">
                                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                                {getCategoryLabel(id, locale) || t(id as any)}
                              </span>
                              <span className="mt-0.5 block text-xs font-medium text-[#9ca3af]">
                                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                                {tg(groupKey as any)}
                              </span>
                            </span>
                          </span>
                          <ChevronRight className="h-4 w-4 shrink-0 text-[#cbd5e1] transition-colors group-hover:text-[#009FD9]" />
                        </Link>
                      ))}
                  </div>
              </section>
            ) : visibleGroups.map((group) => {
              const Icon = group.Icon;
              return (
                <section key={group.key} id={group.key} className="scroll-mt-32 border-b border-[#eef2f6] last:border-b-0">
                    <div className="flex items-end justify-between gap-3 bg-[#fbfdff] px-4 py-4 sm:px-6">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#EAF7FD] text-[#009FD9]">
                          <Icon className="h-[18px] w-[18px]" />
                        </span>
                        <div className="min-w-0">
                          <h2 className="text-lg font-extrabold leading-tight text-[#162543] [overflow-wrap:anywhere]">
                            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                            {tg(group.key as any)}
                          </h2>
                          <p className="mt-0.5 text-xs font-medium text-[#8a94a6]">
                            {tp("optionsCount", { count: query.trim() ? group.visibleIds.length : group.ids.length })}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
                        {group.visibleIds.map((id) => (
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
                </section>
              );
            })}
          </div>
        </div>
      </section>

      <LandingFooter />
    </div>
  );
}

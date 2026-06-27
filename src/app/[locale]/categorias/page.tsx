"use client";

import { useTranslations } from "next-intl";
import { LandingNavbar } from "@/components/landing/landing-navbar";
import { LandingFooter } from "@/components/landing/landing-footer";
import { FadeInUp } from "@/components/landing/fade-in-up";
import { CategorySearchBox } from "@/components/search/category-search-box";
import { CategorySuggestionBox } from "@/components/ui/category-suggestion";
import { Link } from "@/i18n/navigation";
import {
  Home,
  Leaf,
  Sparkles,
  FolderPlus,
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

export default function CategoriasPage() {
  const t = useTranslations("categories");
  const tg = useTranslations("categoryGroups");
  const tp = useTranslations("categoriesPage");

  return (
    <div className="flex min-h-screen flex-col bg-[#f7f9fb]">
      <LandingNavbar />

      <section className="relative z-30 border-b border-[#e5e7eb] bg-white px-4 pb-8 pt-28 sm:pt-32">
        <FadeInUp>
          <div className="mx-auto flex max-w-4xl flex-col items-center text-center">
            <div className="min-w-0">
              <span className="mb-3 inline-flex rounded-full bg-[#EBF5FB] px-3 py-1 text-xs font-bold uppercase text-[#0089bb]">
                {tp("eyebrow")}
              </span>
              <h1 className="mx-auto max-w-2xl text-3xl font-extrabold leading-tight text-[#1a2744] sm:text-4xl">
                {tp("title")}
              </h1>
              <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-[#5f6b7a] sm:text-base">
                {tp("subtitle")}
              </p>
            </div>
            <div className="mt-6 w-full max-w-xl">
              <CategorySearchBox embeddedResults />
            </div>
          </div>
        </FadeInUp>
      </section>

      <section className="sticky top-16 z-20 border-b border-[#e5e7eb] bg-white/95 px-4 py-3 backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-6xl gap-2 overflow-x-auto hide-scrollbar">
          {GROUPS.map((group) => {
            const Icon = group.Icon;
            return (
              <a
                key={group.key}
                href={`#${group.key}`}
                className="inline-flex shrink-0 items-center gap-2 rounded-full border border-[#e5e7eb] bg-white px-3.5 py-2 text-sm font-semibold text-[#374151] shadow-sm transition-colors hover:border-[#009FD9] hover:bg-[#EBF5FB] hover:text-[#0089bb]"
              >
                <Icon className="h-4 w-4 text-[#009FD9]" />
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {tg(group.key as any)}
              </a>
            );
          })}
        </div>
      </section>

      <section className="px-4 pb-24 pt-8">
        <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[260px_minmax(0,1fr)] lg:items-start">
          <aside className="hidden lg:block">
            <div className="sticky top-24 overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white shadow-sm">
              <div className="border-b border-[#eef2f6] px-4 py-3">
                <p className="text-xs font-bold uppercase tracking-wide text-[#8a94a6]">
                  {tp("viewAll")}
                </p>
              </div>
              <nav className="max-h-[calc(100vh-180px)] overflow-y-auto py-1">
                {GROUPS.map((group) => {
                  const Icon = group.Icon;
                  return (
                    <a
                      key={group.key}
                      href={`#${group.key}`}
                      className="flex items-center gap-3 px-4 py-3 text-sm font-semibold text-[#374151] transition-colors hover:bg-[#f8fbfe] hover:text-[#0089bb]"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#EAF7FD] text-[#009FD9]">
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                        {tg(group.key as any)}
                      </span>
                      <span className="shrink-0 text-xs font-bold text-[#9ca3af]">
                        {group.ids.length}
                      </span>
                    </a>
                  );
                })}
              </nav>
            </div>
          </aside>

          <div className="flex min-w-0 flex-col gap-8">
            {GROUPS.map((group, gi) => {
              const Icon = group.Icon;
              return (
                <FadeInUp key={group.key} delay={gi * 20}>
                  <section id={group.key} className="scroll-mt-32">
                    <div className="mb-3 flex items-end justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#EAF7FD] text-[#009FD9]">
                          <Icon className="h-[18px] w-[18px]" />
                        </span>
                        <div className="min-w-0">
                          <h2 className="text-lg font-extrabold leading-tight text-[#162543] [overflow-wrap:anywhere]">
                            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                            {tg(group.key as any)}
                          </h2>
                          <p className="mt-0.5 text-xs font-medium text-[#8a94a6]">
                            {tp("optionsCount", { count: group.ids.length })}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white shadow-sm">
                      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
                        {group.ids.map((id) => (
                          <Link
                            key={id}
                            href={`/buscar?categoria=${id}`}
                            className="group flex min-h-12 items-center justify-between gap-3 border-b border-[#eef2f6] px-4 py-3 text-sm font-semibold leading-snug text-[#374151] transition-colors hover:bg-[#f8fbfe] hover:text-[#0089bb] sm:odd:border-r xl:border-r xl:[&:nth-child(3n)]:border-r-0"
                          >
                            <span className="min-w-0 [overflow-wrap:anywhere]">
                              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                              {t(id as any)}
                            </span>
                            <ChevronRight className="h-4 w-4 shrink-0 text-[#cbd5e1] transition-colors group-hover:text-[#009FD9]" />
                          </Link>
                        ))}
                      </div>
                    </div>
                  </section>
                </FadeInUp>
              );
            })}

            <FadeInUp delay={GROUPS.length * 20}>
              <div id="sugerir-categoria" className="scroll-mt-24 rounded-2xl border border-[#d8eef8] bg-white px-5 py-7 text-center shadow-sm sm:px-6">
                <FolderPlus className="mx-auto mb-2.5 h-7 w-7 text-[#009FD9]" strokeWidth={1.75} />
                <h2 className="text-lg font-bold text-[#1a2744]">{tp("notListed")}</h2>
                <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-[#5f6b7a]">{tp("suggestDescription")}</p>
                <div className="mx-auto mt-4 max-w-md">
                  <CategorySuggestionBox
                    prominent
                    notListedLabel={tp("suggestCta")}
                    placeholder={tp("suggestPlaceholder")}
                    sendLabel={tp("suggestSend")}
                    sendingLabel={tp("suggestSending")}
                    cancelLabel={tp("cancel")}
                    thanksLabel={tp("suggestThanks")}
                  />
                </div>
              </div>
            </FadeInUp>
          </div>
        </div>
      </section>

      <section className="bg-[#162543] px-4 py-16 text-center text-white">
        <FadeInUp>
          <h2 className="mb-3 text-3xl font-extrabold">{tp("ctaTitle")}</h2>
          <p className="mx-auto mb-8 max-w-md text-[#d8dee8]">
            {tp("ctaDesc")}
          </p>
          <div className="flex flex-col justify-center gap-3 sm:flex-row">
            <Link
              href="/buscar"
              className="inline-flex items-center justify-center rounded-lg bg-[#009FD9] px-7 py-3 font-bold text-white transition-colors hover:bg-[#0089bb]"
            >
              {tp("ctaSearch")}
            </Link>
            <Link
              href="/soporte"
              className="inline-flex items-center justify-center rounded-lg border border-white/20 bg-white/10 px-7 py-3 font-semibold text-white transition-colors hover:bg-white/20"
            >
              {tp("ctaContact")}
            </Link>
          </div>
        </FadeInUp>
      </section>

      <LandingFooter />
    </div>
  );
}

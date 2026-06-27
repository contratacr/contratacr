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
  const totalServices = GROUPS.reduce((sum, group) => sum + group.ids.length, 0);

  return (
    <div className="min-h-screen flex flex-col bg-[#f7f9fb]">
      <LandingNavbar />

      {/* Hero — `relative z-30` lifts the whole hero (and the search autocomplete
          that overflows below it) ABOVE the opaque category-grid section that
          follows, so suggestions overlay the categories instead of hiding behind. */}
      <section className="relative z-30 bg-white px-4 pb-10 pt-32">
        <FadeInUp>
          <div className="mx-auto flex max-w-5xl flex-col items-center text-center">
            <span className="mb-4 inline-flex rounded-full bg-[#EBF5FB] px-3 py-1 text-xs font-bold uppercase text-[#0089bb]">
              {tp("eyebrow")}
            </span>
            <h1 className="max-w-3xl text-4xl font-extrabold leading-tight text-[#1a2744] sm:text-5xl">
              {tp("title")}
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-[#5f6b7a] sm:text-lg">
              {tp("subtitle")}
            </p>
            <div className="mt-7 w-full">
              <CategorySearchBox />
            </div>
            <div className="mt-6 flex flex-wrap justify-center gap-2 text-xs font-semibold text-[#6b7280]">
              <span className="rounded-full border border-[#e5e7eb] bg-white px-3 py-1.5">{tp("groupCount", { count: GROUPS.length })}</span>
              <span className="rounded-full border border-[#e5e7eb] bg-white px-3 py-1.5">{tp("serviceCount", { count: totalServices })}</span>
            </div>
          </div>
        </FadeInUp>
      </section>

      <section className="border-y border-[#e5e7eb] bg-white px-4 py-3">
        <div className="mx-auto flex max-w-6xl gap-2 overflow-x-auto hide-scrollbar">
          {GROUPS.map((group) => {
            const Icon = group.Icon;
            return (
              <a
                key={group.key}
                href={`#${group.key}`}
                className="inline-flex shrink-0 items-center gap-2 rounded-full border border-[#e5e7eb] bg-white px-3.5 py-2 text-sm font-semibold text-[#374151] transition-colors hover:border-[#009FD9] hover:bg-[#EBF5FB] hover:text-[#0089bb]"
              >
                <Icon className="h-4 w-4 text-[#009FD9]" />
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {tg(group.key as any)}
              </a>
            );
          })}
        </div>
      </section>

      {/* Categories by group */}
      <section className="px-4 pb-24 pt-8">
        <div className="mx-auto grid max-w-6xl gap-5 lg:grid-cols-2">
          {GROUPS.map((group, gi) => {
            const Icon = group.Icon;
            return (
              <FadeInUp key={group.key} delay={gi * 25}>
                <section id={group.key} className="scroll-mt-28 overflow-hidden rounded-xl border border-[#e5e7eb] bg-white shadow-sm">
                  <div className="flex items-start gap-3 border-b border-[#eef2f6] px-4 py-4 sm:px-5">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#EBF5FB] text-[#009FD9]">
                      <Icon className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <h2 className="text-base font-bold text-[#162543] [overflow-wrap:anywhere]">
                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                        {tg(group.key as any)}
                      </h2>
                      <p className="mt-0.5 text-xs font-medium text-[#8a94a6]">{tp("optionsCount", { count: group.ids.length })}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2">
                    {group.ids.map((id) => (
                      <Link
                        key={id}
                        href={`/buscar?categoria=${id}`}
                        className="group flex min-h-12 items-center justify-between gap-3 border-b border-[#f3f4f6] px-4 py-3 text-sm font-medium leading-snug text-[#374151] transition-colors hover:bg-[#EBF5FB] hover:text-[#0089bb] sm:odd:border-r"
                      >
                        <span className="[overflow-wrap:anywhere]">
                          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                          {t(id as any)}
                        </span>
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#cbd5e1] transition-colors group-hover:bg-[#009FD9]" />
                      </Link>
                    ))}
                  </div>
                </section>
              </FadeInUp>
            );
          })}

          {/* "¿No ves tu categoría?" — a contained, intentional card (icon + heading +
              description + a clear CTA), NOT a loose link under a divider. The id is the
              scroll target the hero search jumps to when a search has no matches. */}
          <FadeInUp delay={GROUPS.length * 25}>
            <div id="sugerir-categoria" className="scroll-mt-24 rounded-xl border border-[#d8eef8] bg-white px-6 py-7 text-center shadow-sm lg:col-span-2">
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
      </section>

      {/* CTA Bottom */}
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

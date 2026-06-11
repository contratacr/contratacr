"use client";

import { useTranslations } from "next-intl";
import { LandingNavbar } from "@/components/landing/landing-navbar";
import { LandingFooter } from "@/components/landing/landing-footer";
import { FadeInUp } from "@/components/landing/fade-in-up";
import { CategorySearchBox } from "@/components/search/category-search-box";
import { Link } from "@/i18n/navigation";
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
    <div className="min-h-screen flex flex-col bg-white">
      <LandingNavbar />

      {/* Hero — `relative z-30` lifts the whole hero (and the search autocomplete
          that overflows below it) ABOVE the opaque category-grid section that
          follows, so suggestions overlay the categories instead of hiding behind. */}
      <section className="relative z-30 pt-32 pb-12 bg-white text-center px-4">
        <FadeInUp>
          <span className="inline-block text-xs font-bold uppercase tracking-widest text-[#009FD9] bg-[#EBF5FB] px-4 py-1.5 rounded-full mb-4">
            {tp("eyebrow")}
          </span>
          <h1 className="text-4xl sm:text-5xl font-extrabold text-[#1a2744] mb-4 leading-tight">
            {tp("title")}
          </h1>
          <p className="text-lg text-gray-500 max-w-xl mx-auto mb-7">
            {tp("subtitle")}
          </p>
          {/* Smart search — autocomplete over the full taxonomy, jumps to /buscar */}
          <CategorySearchBox />
        </FadeInUp>
      </section>

      {/* Categories by group */}
      <section className="pb-24 px-4 bg-[#f4f7fa]">
        <div className="mx-auto max-w-6xl pt-8 flex flex-col gap-10">
          {GROUPS.map((group, gi) => (
            <FadeInUp key={group.key} delay={gi * 30}>
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                {/* Group header */}
                <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 bg-[#f8fafc]">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#EBF5FB]">
                    <group.Icon className="h-5 w-5 text-[#009FD9]" />
                  </div>
                  <h2 className="text-base font-bold text-[#1a2744]">
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {tg(group.key as any)}
                  </h2>
                </div>
                {/* Category links grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-0 divide-x divide-y divide-gray-50">
                  {group.ids.map((id) => (
                    <Link
                      key={id}
                      href={`/buscar?categoria=${id}`}
                      className="px-4 py-3 text-sm text-[#374151] hover:bg-[#EBF5FB] hover:text-[#009FD9] font-medium transition-colors leading-snug"
                    >
                      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                      {t(id as any)}
                    </Link>
                  ))}
                </div>
              </div>
            </FadeInUp>
          ))}
        </div>
      </section>

      {/* CTA Bottom */}
      <section className="py-16 bg-[#1a2744] text-white text-center px-4">
        <FadeInUp>
          <h2 className="text-3xl font-extrabold mb-3">{tp("ctaTitle")}</h2>
          <p className="text-gray-300 mb-8 max-w-md mx-auto">
            {tp("ctaDesc")}
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/buscar"
              className="inline-flex items-center justify-center bg-[#009FD9] hover:bg-[#0089bb] text-white font-bold px-7 py-3 rounded-full transition-all"
            >
              {tp("ctaSearch")}
            </Link>
            <Link
              href="/contacto"
              className="inline-flex items-center justify-center bg-white/10 hover:bg-white/20 text-white font-semibold px-7 py-3 rounded-full transition-all border border-white/20"
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

"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useLocale } from "next-intl";
import {
  ArrowRight,
  Check,
  ChevronRight,
  Flower2,
  LayoutGrid,
  Leaf,
  MoreHorizontal,
  Sofa,
  Sparkles,
  Thermometer,
  Trees,
  Umbrella,
  type LucideIcon,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { categoryIcon, serviceGroupIcon } from "@/lib/visuals/section-visuals";
import { IconBadge as CategoryIconBadge } from "@/lib/visuals/section-icon";
import { useAuth } from "@/hooks/use-auth";
import { canOffer } from "@/lib/auth/capabilities";
import { rutaProyecto } from "@/lib/marketplace-url";
import type { ProyectoPublico } from "@/lib/proyectos";
import { cn } from "@/lib/utils";

// Pantalla "Proyectos" del modo directorio (móvil). Estructura tomada de docs/directory/yelp-app-spec; colores, iconos y
// textos son de ContrataCR. Los oficios llevan a la búsqueda de profesionales (/profesionales?categoria=<id>).

type Lang = "es" | "en";
type L2 = { es: string; en: string };

type Oficio = { icon: LucideIcon; label: L2; categoria: string };

const OFICIOS: Oficio[] = [
  { icon: categoryIcon("mudanzas"), label: { es: "Mudanzas", en: "Movers" }, categoria: "mudanzas" },
  { icon: categoryIcon("limpieza"), label: { es: "Limpieza del hogar", en: "Home cleaning" }, categoria: "limpieza" },
  { icon: categoryIcon("plomeria"), label: { es: "Plomeros", en: "Plumbers" }, categoria: "plomeria" },
  { icon: categoryIcon("reparacion_electrodomesticos"), label: { es: "Reparación de electrodomésticos", en: "Appliance repair" }, categoria: "reparacion_electrodomesticos" },
  { icon: categoryIcon("electricidad"), label: { es: "Electricistas", en: "Electricians" }, categoria: "electricidad" },
  { icon: categoryIcon("detailing"), label: { es: "Detallado automotriz", en: "Auto detailing" }, categoria: "detailing" },
  { icon: categoryIcon("construccion"), label: { es: "Contratistas", en: "Contractors" }, categoria: "construccion" },
];

const SIGUIENTE: { icon: LucideIcon; label: L2; categoria: string }[] = [
  { icon: categoryIcon("limpieza"), label: { es: "Limpieza del hogar", en: "Home cleaning" }, categoria: "limpieza" },
  { icon: serviceGroupIcon("hogar"), label: { es: "Mantenimiento del hogar", en: "Home maintenance" }, categoria: "remodelacion" },
  { icon: categoryIcon("construccion"), label: { es: "Contratistas generales", en: "General contractors" }, categoria: "construccion" },
];

type Tarjeta = { n: number; icon: LucideIcon; titulo: L2; boton: L2; categoria: string };
type Carrusel = { titulo: L2; tono: string; tarjetas: Tarjeta[] };

const CARRUSELES: Carrusel[] = [
  {
    titulo: { es: "Haga de su hogar su lugar feliz", en: "Make your home your happy place" },
    tono: "from-[#0b5f86] to-[#009FD9]",
    tarjetas: [
      { n: 1, icon: Sofa, titulo: { es: "Renueve su cocina", en: "Refresh your kitchen" }, boton: { es: "Buscar expertos en cocinas", en: "Find kitchen pros" }, categoria: "carpinteria" },
      { n: 2, icon: Flower2, titulo: { es: "Mejore la fachada", en: "Upgrade your curb appeal" }, boton: { es: "Buscar paisajistas", en: "Find landscapers" }, categoria: "paisajismo" },
    ],
  },
  {
    titulo: { es: "Cree un refugio en su patio", en: "Create a backyard retreat" },
    tono: "from-[#1d6f5c] to-[#35b58f]",
    tarjetas: [
      { n: 1, icon: Trees, titulo: { es: "Disfrute el espacio al aire libre", en: "Enjoy the outdoors" }, boton: { es: "Buscar expertos en terrazas", en: "Find deck and patio pros" }, categoria: "carpinteria" },
    ],
  },
  {
    titulo: { es: "Cuide sus exteriores", en: "Maintain your outdoors" },
    tono: "from-[#162543] to-[#3d5a86]",
    tarjetas: [
      { n: 1, icon: Umbrella, titulo: { es: "Adelántese a las goteras", en: "Get ahead of leaks" }, boton: { es: "Buscar techadores", en: "Find roofers" }, categoria: "techos" },
      { n: 2, icon: Leaf, titulo: { es: "Mantenga sus árboles", en: "Keep your trees healthy" }, boton: { es: "Buscar podadores", en: "Find tree pros" }, categoria: "poda_arboles" },
    ],
  },
  {
    titulo: { es: "Renueve sus interiores", en: "Refresh your indoors" },
    tono: "from-[#7a4d1d] to-[#d9983f]",
    tarjetas: [
      { n: 1, icon: Thermometer, titulo: { es: "Mantenga el ambiente cómodo", en: "Keep the air comfortable" }, boton: { es: "Buscar expertos en climatización", en: "Find HVAC pros" }, categoria: "aire_acondicionado" },
    ],
  },
];

const T = {
  es: {
    titulo: "Proyectos",
    tituloDe: (n: string) => `Proyectos de ${n}`,
    menu: "Más opciones",
    mias: "Mis solicitudes",
    publicar: "Publicar solicitud",
    ayuda: "Ayuda",
    pastilla: "Obtenga ayuda con el Asistente",
    contrate: "Contrate a un profesional local hoy",
    mas: "Más",
    siguiente: "¿Qué sigue en su lista?",
    iniciar: "Iniciar proyecto",
    agregar: "Agregar al plan",
    enPlan: "En su plan",
    comunidad: "Solicitudes de la comunidad",
    oportunidades: "Oportunidades",
    comunidadAyuda: "Lo que la gente necesita cerca de usted.",
    oportunidadesAyuda: "Solicitudes de clientes a las que puede responder.",
    verTodas: "Ver todas las solicitudes",
    sinSolicitudes: "Todavía no hay solicitudes publicadas.",
  },
  en: {
    titulo: "Projects",
    tituloDe: (n: string) => `${n}'s Projects`,
    menu: "More options",
    mias: "My requests",
    publicar: "Post a request",
    ayuda: "Help",
    pastilla: "Get help with the Assistant",
    contrate: "Hire a local pro today",
    mas: "More",
    siguiente: "What's next on your list?",
    iniciar: "Start project",
    agregar: "Add to plan",
    enPlan: "In your plan",
    comunidad: "Community requests",
    oportunidades: "Opportunities",
    comunidadAyuda: "What people near you need.",
    oportunidadesAyuda: "Client requests you can answer.",
    verTodas: "See all requests",
    sinSolicitudes: "No requests have been posted yet.",
  },
} as const;

const PLAN_KEY = "ccr:plan:v1";
function leerPlan(): string[] {
  try {
    const v = JSON.parse(window.localStorage.getItem(PLAN_KEY) || "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}
function guardarPlan(v: string[]) {
  try { window.localStorage.setItem(PLAN_KEY, JSON.stringify(v)); } catch { /* sin almacenamiento: el plan vive solo en esta visita */ }
}

const buscar = (categoria: string) => `/profesionales?categoria=${encodeURIComponent(categoria)}`;

function nombreDe(user: ReturnType<typeof useAuth>["user"]): string {
  const meta = (user?.user_metadata ?? {}) as Record<string, unknown>;
  const completo = String(meta.full_name ?? meta.name ?? "").trim();
  return completo.split(/\s+/)[0] ?? "";
}

function Seccion({ titulo, children, ayuda }: { titulo: string; children: ReactNode; ayuda?: string }) {
  return (
    <section className="mt-8">
      <h2 className="px-4 text-[22px] font-extrabold leading-7 text-[#162543]">{titulo}</h2>
      {ayuda && <p className="px-4 pt-0.5 text-sm text-[#5b6b80]">{ayuda}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function MenuPuntos({ lang }: { lang: Lang }) {
  const t = T[lang];
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setAbierto(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setAbierto(false); };
    document.addEventListener("pointerdown", fuera);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", fuera); document.removeEventListener("keydown", esc); };
  }, [abierto]);
  const item = "flex min-h-11 w-full items-center px-4 text-left text-[15px] font-semibold text-[#162543] hover:bg-[#f3f8fb]";
  return (
    <div ref={ref} className="relative">
      <button type="button" aria-label={t.menu} aria-haspopup="menu" aria-expanded={abierto} data-hub-menu onClick={() => setAbierto((v) => !v)}
        className="grid h-10 w-10 place-items-center rounded-full text-[#162543] transition hover:bg-[#eef7fb] active:scale-95">
        <MoreHorizontal className="h-6 w-6" />
      </button>
      {abierto && (
        <div role="menu" className="absolute right-0 top-11 z-40 w-56 overflow-hidden rounded-2xl border border-[#dfe8ee] bg-white py-1 shadow-[0_18px_40px_-18px_rgba(22,37,67,0.45)]">
          <Link role="menuitem" href="/dashboard/profesional?tab=sent_projects" className={item} onClick={() => setAbierto(false)}>{t.mias}</Link>
          <Link role="menuitem" href="/publicar-solicitud" className={item} onClick={() => setAbierto(false)}>{t.publicar}</Link>
          <Link role="menuitem" href="/ayuda" className={item} onClick={() => setAbierto(false)}>{t.ayuda}</Link>
        </div>
      )}
    </div>
  );
}

export function ProjectsHub({ proyectos = [] }: { proyectos?: ProyectoPublico[] }) {
  const lang: Lang = useLocale() === "en" ? "en" : "es";
  const t = T[lang];
  const { user } = useAuth();
  const esPro = canOffer(user);
  const nombre = nombreDe(user);
  const titulo = nombre ? t.tituloDe(nombre) : t.titulo;
  const [plan, setPlan] = useState<string[]>([]);
  const [desplazado, setDesplazado] = useState(false);
  const [compacto, setCompacto] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setPlan(leerPlan()));
    return () => cancelAnimationFrame(id);
  }, []);
  useEffect(() => {
    const alDesplazar = () => {
      const y = window.scrollY;
      setDesplazado(y > 56);
      setCompacto(y > 90);
    };
    alDesplazar();
    window.addEventListener("scroll", alDesplazar, { passive: true });
    return () => window.removeEventListener("scroll", alDesplazar);
  }, []);

  const alternarPlan = useCallback((categoria: string) => {
    setPlan((actual) => {
      const siguiente = actual.includes(categoria) ? actual.filter((c) => c !== categoria) : [...actual, categoria];
      guardarPlan(siguiente);
      return siguiente;
    });
  }, []);

  const tituloComunidad = esPro ? t.oportunidades : t.comunidad;
  const recientes = proyectos.slice(0, 5);

  return (
    <div data-projects-hub className="ccr-hub-root relative bg-white pb-40 text-[#162543]">
      {/* En la franja del hub el documento sí se desplaza (la pantalla de tablero de escritorio lo fija). */}
      <style>{`@media (max-width:1023px){html.ccr-ruta-sin-desplazar:has(.ccr-hub-root),html.ccr-ruta-sin-desplazar:has(.ccr-hub-root) body{height:auto!important;overflow:visible!important;overscroll-behavior:auto!important}.ccr-cascaron-tablero:has(.ccr-hub-root){height:auto!important;min-height:100dvh!important;overflow:visible!important}.ccr-cascaron-tablero:has(.ccr-hub-root) .ccr-cascaron-contenido{display:block!important;overflow:visible!important}}`}</style>

      <header className="sticky top-0 z-30 border-b border-transparent bg-white/95 backdrop-blur" style={{ borderColor: desplazado ? "#e5ebf0" : "transparent" }}>
        <div className="relative flex min-h-14 items-center justify-center px-14">
          <h1 className={cn("text-[19px] font-extrabold leading-6 transition-opacity", desplazado ? "opacity-100" : "opacity-0")} aria-hidden={!desplazado}>{titulo}</h1>
          <div className="absolute right-3 top-2"><MenuPuntos lang={lang} /></div>
        </div>
      </header>

      <div className="-mt-2 px-4">
        <p className="text-[32px] font-extrabold leading-9 tracking-tight" data-hub-title>{titulo}</p>
      </div>

      <Seccion titulo={t.contrate}>
        <ul className="grid grid-cols-4 gap-x-2 gap-y-5 px-3" data-hub-oficios>
          {OFICIOS.map(({ icon: Icono, label, categoria }) => (
            <li key={categoria}>
              <Link href={buscar(categoria)} className="flex flex-col items-center gap-1.5 text-center active:scale-95">
                <CategoryIconBadge icon={Icono} size="xl" />
                <span className="line-clamp-2 text-[12px] font-semibold leading-tight text-[#162543]">{label[lang]}</span>
              </Link>
            </li>
          ))}
          <li>
            <Link href="/categorias" className="flex flex-col items-center gap-1.5 text-center active:scale-95">
              <span className="grid h-14 w-14 place-items-center rounded-2xl bg-[#eef1f5] text-[#41536b]"><LayoutGrid className="h-7 w-7" /></span>
              <span className="text-[12px] font-semibold leading-tight text-[#162543]">{t.mas}</span>
            </Link>
          </li>
        </ul>
      </Seccion>

      <Seccion titulo={t.siguiente}>
        <ul className="space-y-3 px-4" data-hub-plan>
          {SIGUIENTE.map(({ icon: Icono, label, categoria }) => {
            const agregado = plan.includes(categoria);
            return (
              <li key={categoria} className="rounded-2xl border border-[#e1e9ef] bg-white p-3.5 shadow-[0_6px_18px_-16px_rgba(22,37,67,0.5)]">
                <div className="flex items-center gap-3">
                  <CategoryIconBadge icon={Icono} size="lg" />
                  <p className="text-[17px] font-extrabold">{label[lang]}</p>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2.5">
                  <Link href={`/publicar-solicitud?categoria=${encodeURIComponent(categoria)}`} data-hub-iniciar
                    className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#009FD9] px-3 text-[15px] font-bold text-white transition active:scale-[0.98] hover:bg-[#008fca]">
                    {t.iniciar}
                  </Link>
                  <button type="button" data-hub-agregar aria-pressed={agregado} onClick={() => alternarPlan(categoria)}
                    className={cn("inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full px-3 text-[15px] font-bold transition active:scale-[0.98]",
                      agregado ? "bg-[#e8f6fc] text-[#007bab]" : "bg-[#eceff3] text-[#162543] hover:bg-[#e2e6eb]")}>
                    {agregado && <Check className="h-4 w-4" />}{agregado ? t.enPlan : t.agregar}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </Seccion>

      {CARRUSELES.map((c) => (
        <Seccion key={c.titulo.es} titulo={c.titulo[lang]}>
          <ul className="flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" data-hub-carrusel>
            {c.tarjetas.map(({ n, icon: Icono, titulo: tt, boton, categoria }) => (
              <li key={n} className="w-[272px] shrink-0 snap-start">
                <div className={cn("relative grid h-[172px] place-items-center overflow-hidden rounded-2xl bg-gradient-to-br text-white", c.tono)}>
                  <Icono className="h-16 w-16 opacity-90" strokeWidth={1.5} />
                  <span className="absolute left-3 top-3 grid h-8 w-8 place-items-center rounded-full bg-white text-[15px] font-extrabold text-[#162543]">{n}</span>
                </div>
                <p className="mt-2.5 text-[17px] font-extrabold leading-snug">{tt[lang]}</p>
                <Link href={buscar(categoria)} className="mt-2 inline-flex min-h-10 items-center rounded-full bg-[#eceff3] px-4 text-[14px] font-bold text-[#162543] hover:bg-[#e2e6eb] active:scale-[0.98]">{boton[lang]}</Link>
              </li>
            ))}
          </ul>
        </Seccion>
      ))}

      <Seccion titulo={tituloComunidad} ayuda={esPro ? t.oportunidadesAyuda : t.comunidadAyuda}>
        <div className="px-4" data-hub-comunidad>
          {recientes.length === 0 ? (
            <p className="rounded-2xl bg-[#f4f7fa] p-4 text-sm text-[#5b6b80]">{t.sinSolicitudes}</p>
          ) : (
            <ul className="divide-y divide-[#e8eef3] overflow-hidden rounded-2xl border border-[#e1e9ef]">
              {recientes.map((p) => (
                <li key={p.id}>
                  <Link href={rutaProyecto(p)} className="flex items-center gap-3 px-3.5 py-3 active:bg-[#f3f8fb]">
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-bold [overflow-wrap:anywhere]">{p.title}</span>
                      <span className="mt-0.5 block text-[13px] text-[#5b6b80]">{[p.category_name, p.location_label].filter(Boolean).join(" · ")}</span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-[#9aa8b8]" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Link href="/solicitudes?vista=comunidad" className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-[#eceff3] px-4 text-[15px] font-bold text-[#162543] hover:bg-[#e2e6eb]">
            {t.verTodas}<ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </Seccion>

      <Link href="/asistente" data-hub-pill aria-label={t.pastilla}
        className={cn("fixed right-4 z-40 inline-flex h-14 items-center justify-center overflow-hidden rounded-full bg-[#009FD9] text-white shadow-[0_14px_30px_-10px_rgba(0,111,160,0.75)] transition-all duration-300 active:scale-95 bottom-[calc(96px+env(safe-area-inset-bottom))]",
          compacto ? "w-14" : "w-[min(calc(100vw-2rem),21rem)] gap-2 px-5")}>
        <Sparkles className="h-6 w-6 shrink-0" />
        <span className={cn("whitespace-nowrap text-[15px] font-bold transition-all duration-300", compacto ? "w-0 opacity-0" : "opacity-100")}>{t.pastilla}</span>
      </Link>
    </div>
  );
}

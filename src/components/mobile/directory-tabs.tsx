"use client";
import type { RefObject } from "react";
import { Bookmark, ClipboardList, Search, Sparkles, UserRound, type LucideIcon } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

// Barra de abajo del directorio: cinco pestañas con la estructura de la app de Yelp (Buscar, Proyectos, Asistente,
// Mis listas, Yo) en NUESTROS colores. Vive aparte de native-bottom-nav.tsx para que la barra de siempre (directorio
// apagado) no cambie ni un byte. Textos locales (es/en) en vez de messages/*.json, que es un archivo compartido.

export type DirectoryTabId = "buscar" | "proyectos" | "asistente" | "listas" | "yo";

const LABELS: Record<DirectoryTabId, { es: string; en: string }> = {
  buscar: { es: "Buscar", en: "Search" },
  proyectos: { es: "Proyectos", en: "Projects" },
  asistente: { es: "Asistente", en: "Assistant" },
  listas: { es: "Mis listas", en: "My Lists" },
  yo: { es: "Yo", en: "Me" },
};

export const DIRECTORY_TAB_ORDER: readonly DirectoryTabId[] = ["buscar", "proyectos", "asistente", "listas", "yo"];

export function directoryTabLabel(id: DirectoryTabId, locale: string): string {
  const en = locale === "en";
  return en ? LABELS[id].en : LABELS[id].es;
}

/** Cuál pestaña está encendida para una ruta (sin prefijo de idioma). `null` si ninguna (p. ej. /empleos, /promociones: viven en «Más»). */
export function directoryActiveTab(pathname: string | null | undefined, sections: readonly string[] = [], esBusqueda = false): DirectoryTabId | null {
  const ruta = (pathname ?? "").replace(/\/+$/, "") || "/";
  const en = (base: string) => ruta === base || ruta.startsWith(`${base}/`);
  if (en("/solicitudes")) return "proyectos";
  if (en("/asistente")) return "asistente";
  if (en("/listas") || en("/lista")) return "listas";
  if (en("/yo") || en("/notificaciones") || en("/mensajes") || en("/dashboard") || ruta === "/empleos/mis-empleos" || ruta === "/promociones/mis-promociones") return "yo";
  if (ruta === "/" || ruta === "/buscar" || en("/buscar") || en("/lugar") || en("/lugares") || en("/servicios") || en("/profesionales") || esBusqueda) return "buscar";
  if (sections.some((section) => en(`/${section}`))) return "buscar";
  return null;
}

/** Tope de la insignia: «99+» por encima de 99, nada con 0. */
export function directoryBadgeText(count: number): string | null {
  if (!Number.isFinite(count) || count <= 0) return null;
  return count > 99 ? "99+" : String(Math.floor(count));
}

const ICONS: Record<DirectoryTabId, LucideIcon> = { buscar: Search, proyectos: ClipboardList, asistente: Sparkles, listas: Bookmark, yo: UserRound };

export function DirectoryTabs({
  navRef,
  ariaLabel,
  locale,
  active,
  loggedIn,
  badge,
  onTabClick,
}: {
  navRef: RefObject<HTMLElement | null>;
  ariaLabel: string;
  locale: string;
  active: DirectoryTabId | null;
  loggedIn: boolean;
  badge: number;
  onTabClick?: (event: React.MouseEvent<HTMLAnchorElement>, href: string) => void;
}) {
  const hrefDe = (id: DirectoryTabId): string =>
    id === "buscar" ? "/" : id === "proyectos" ? "/solicitudes" : id === "asistente" ? "/asistente" : id === "listas" ? "/listas" : loggedIn ? "/yo" : "/login?redirect=%2Fyo";
  return (
    <nav ref={navRef} aria-label={ariaLabel} data-directory-tabs="" className="ccr-native-bottom-nav ccr-barra-flotante pointer-events-none fixed inset-x-0 bottom-0 z-[90] px-4 lg:hidden">
      <div className="ccr-barra-flotante-pastilla pointer-events-auto relative mx-auto flex h-[60px] w-full max-w-[420px] items-stretch rounded-full p-1">
        {DIRECTORY_TAB_ORDER.map((id, i) => {
          const Icon = ICONS[id];
          const encendida = active === id;
          const href = hrefDe(id);
          const texto = id === "yo" ? directoryBadgeText(badge) : null;
          return (
            <Link
              key={id}
              href={href}
              prefetch={false}
              data-native-tab={i}
              data-directory-tab={id}
              aria-current={encendida ? "page" : undefined}
              onClick={(event) => { if (id !== "yo" || loggedIn) onTabClick?.(event, href); }}
              className={cn(
                "relative z-10 flex h-full min-h-[44px] min-w-0 flex-1 basis-0 flex-col items-center justify-center gap-0.5 rounded-full transition-colors duration-200 ccr-toque-barra",
                encendida ? "bg-[#162543]/10 text-[#162543]" : "text-[#162543]/70",
              )}
            >
              <span className="relative">
                <Icon className="h-[22px] w-[22px]" strokeWidth={encendida ? 2.4 : 1.9} aria-hidden />
                {texto && (
                  <span data-directory-badge="" className="absolute -right-2.5 -top-1.5 flex h-[16px] min-w-[16px] items-center justify-center rounded-full bg-[#009FD9] px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white">{texto}</span>
                )}
              </span>
              <span className={cn("max-w-full truncate text-[11px] leading-none", encendida ? "font-extrabold" : "font-medium")}>{directoryTabLabel(id, locale)}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

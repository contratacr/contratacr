"use client";

import { useEffect, useRef, useState } from "react";
import { MessageCircle, ShieldCheck, Flag, Shield, Tag, Headset, Users, LayoutGrid, BarChart3, ClipboardList, ArrowLeft, Star, Briefcase, BadgePercent, MapPinned, Wallet, Megaphone } from "lucide-react";
import { useLinkStatus } from "next/link";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { ContrataCRLogo } from "@/components/landing/landing-navbar";
import { ADMIN_REFRESH_EVENT } from "@/hooks/use-admin-auto-refresh";

export type AdminTab =
  | "resumen" | "verificacion" | "usuarios" | "publicaciones" | "reportes" | "aseguradoras"
  | "categorias" | "cuentas" | "soporte" | "analitica" | "actividad" | "resenas" | "empleos" | "promociones" | "cobertura" | "costos" | "campanas" | "contactos";

// Cada página del panel monta su propio AdminShell, así que el componente se
// desmonta y vuelve a montar en cada cambio de sección. Los contadores viven
// aquí, fuera del componente, para que la barra no los pierda (ni parpadee) al
// navegar y para no volver a pedirlos en cada toque: se piden de nuevo solo si
// tienen más de 30 s, además del minuto, el foco y la vuelta a la pestaña.
let countsCache: Record<string, number> = {};
let countsCacheAt = 0;
const COUNTS_FRESH_MS = 30_000;

// Respuesta inmediata al tocar una sección: sin prefetch (ver
// src/i18n/navigation.ts) la página tarda un viaje al servidor en llegar, y
// en el teléfono parecía que el toque no había hecho nada. Mientras la
// navegación está pendiente, la pestaña tocada se marca y muestra una barra.
function PendingMark({ variant }: { variant: "side" | "top" }) {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return (
    <span
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-x-2 h-0.5 animate-pulse rounded-full bg-[#38bdf8]",
        variant === "side" ? "bottom-0.5" : "bottom-0"
      )}
    />
  );
}

// Admin chrome — a navy (#0f172a) LEFT SIDEBAR with a #38bdf8 accent (horizontal
// scroll strip on small screens). "Resumen" is the home/overview; the other
// sections (Verificación, Usuarios, …) are unchanged.
export function AdminShell({
  adminName,
  active = "resumen",
  children,
}: {
  adminName: string;
  active?: AdminTab;
  children: React.ReactNode;
}) {
  // Pending-count badges for EVERY section with an actionable queue (not just
  // Soporte) — verificación, reportes, soporte — from ONE polled
  // endpoint so the counts stay accurate and consistent. Polled + refreshed on
  // window focus so resolving an item updates its badge.
  const [counts, setCounts] = useState<Record<string, number>>(countsCache);
  const countsRef = useRef<Record<string, number>>(countsCache);
  useEffect(() => {
    let alive = true;
    const fetchCounts = () => {
      if (document.visibilityState !== "visible") return;
      countsCacheAt = Date.now();
      fetch("/api/admin/pending-counts")
        .then((r) => r.json())
        .then((d) => {
          if (!alive) return;
          const nextCounts = (d ?? {}) as Record<string, number>;
          countsCache = nextCounts;
          const changed = JSON.stringify(nextCounts) !== JSON.stringify(countsRef.current);
          if (!changed) return;
          const hadPreviousCounts = Object.keys(countsRef.current).length > 0;
          countsRef.current = nextCounts;
          setCounts(nextCounts);
          if (hadPreviousCounts) window.dispatchEvent(new Event(ADMIN_REFRESH_EVENT));
        })
        .catch(() => {});
    };
    if (Date.now() - countsCacheAt > COUNTS_FRESH_MS) fetchCounts();
    // Sin correos de aviso, el contador es el aviso: se refresca solo cada
    // minuto mientras la pestaña está a la vista, no solo al volver a ella.
    const cadaMinuto = window.setInterval(fetchCounts, 60_000);
    const onFocus = () => fetchCounts();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      alive = false;
      window.clearInterval(cadaMinuto);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, []);

  // The phone rail scrolls sideways; bring the active section into view so
  // the admin always sees where they are after navigating.
  const railRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const rail = railRef.current;
    const current = rail?.querySelector<HTMLElement>("[data-admin-active='true']");
    if (!rail || !current) return;
    const target = current.offsetLeft - (rail.clientWidth - current.offsetWidth) / 2;
    rail.scrollTo({ left: Math.max(0, target), behavior: "instant" });
  }, [active]);

  const items: { id: AdminTab; label: string; icon: typeof ShieldCheck; href: string; badge: number }[] = [
    { id: "resumen", label: "Resumen", icon: LayoutGrid, href: "/admin", badge: 0 },
    { id: "verificacion", label: "Verificación", icon: ShieldCheck, href: "/admin/verificacion", badge: counts.verificacion ?? 0 },
    { id: "usuarios", label: "Usuarios", icon: Users, href: "/admin/usuarios", badge: 0 },
    { id: "publicaciones", label: "Proyectos", icon: ClipboardList, href: "/admin/publicaciones", badge: 0 },
    { id: "resenas", label: "Reseñas", icon: Star, href: "/admin/resenas", badge: 0 },
    { id: "empleos", label: "Empleos", icon: Briefcase, href: "/admin/empleos", badge: 0 },
    { id: "promociones", label: "Promociones", icon: BadgePercent, href: "/admin/promociones", badge: 0 },
    { id: "cobertura", label: "Cobertura", icon: MapPinned, href: "/admin/cobertura", badge: 0 },
    { id: "costos", label: "Costos", icon: Wallet, href: "/admin/costos", badge: 0 },
    { id: "contactos", label: "Contactos", icon: MessageCircle, href: "/admin/contactos", badge: 0 },
    { id: "reportes", label: "Reportes", icon: Flag, href: "/admin/reportes", badge: counts.reportes ?? 0 },
    { id: "aseguradoras", label: "Aseguradoras", icon: Shield, href: "/admin/aseguradoras", badge: 0 },
    { id: "categorias", label: "Servicios", icon: Tag, href: "/admin/servicios", badge: counts.categorias ?? 0 },
    { id: "soporte", label: "Soporte", icon: Headset, href: "/admin/soporte", badge: counts.soporte ?? 0 },
    { id: "cuentas", label: "Cuentas", icon: Shield, href: "/admin/cuentas", badge: counts.cuentas ?? 0 },
    { id: "analitica", label: "Analítica", icon: BarChart3, href: "/admin/analitica", badge: 0 },
    { id: "campanas", label: "Campañas", icon: Megaphone, href: "/admin/campanas", badge: 0 },
  ];

  // The sidebar footer is narrow — show ONLY first name + first surname so the name
  // never truncates with "…". (First surname = the second-to-last word in a CR name.)
  const shortAdminName = (() => {
    const w = adminName.trim().split(/\s+/).filter(Boolean);
    return w.length <= 2 ? adminName : `${w[0]} ${w[w.length - 2]}`;
  })();

  const navLink = (it: (typeof items)[number], variant: "side" | "top") => (
    <Link
      key={it.id}
      href={it.href}
      data-admin-active={active === it.id ? "true" : undefined}
      className={cn(
        variant === "side"
          ? "relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
          : "relative flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap shrink-0 transition-colors",
        active === it.id
          ? variant === "side" ? "bg-white/10 text-white" : "border-[#38bdf8] text-white"
          : variant === "side" ? "text-white/55 hover:bg-white/5 hover:text-white" : "border-transparent text-white/60 hover:text-white"
      )}
    >
      {active === it.id && variant === "side" && <span className="absolute left-0 h-5 w-1 rounded-r bg-[#38bdf8]" aria-hidden />}
      <span className="relative shrink-0">
        <it.icon className={cn("h-4 w-4", active === it.id && "text-[#38bdf8]")} />
        {it.badge > 0 && (
          <span className="absolute -right-2.5 -top-2 grid h-[17px] min-w-[17px] place-items-center rounded-full bg-[#38bdf8] px-1 text-center text-[9px] font-bold leading-none text-[#0f172a] ring-2 ring-[#0f172a]">
            {it.badge.toLocaleString("es-CR")}
          </span>
        )}
      </span>
      <span className="truncate">{it.label}</span>
      {active !== it.id && <PendingMark variant={variant} />}
    </Link>
  );

  return (
    <div className="min-h-screen bg-[#f4f7fa] lg:flex">
      {/* ── Desktop sidebar ── */}
      <aside className="hidden lg:flex lg:w-60 lg:flex-col lg:fixed lg:inset-y-0 bg-[#0f172a] text-white">
        <div className="shrink-0 px-5 py-4">
          <Link href="/admin" className="flex items-center gap-2">
            <ContrataCRLogo tone="dark" />
          </Link>
          <Link
            href="/"
            className="mt-3 inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-semibold text-white/60 transition-colors hover:bg-white/10 hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Volver a ContrataCR
          </Link>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-2">
          {[
            { label: "Principal", ids: ["resumen", "usuarios"] },
            { label: "Operación", ids: ["verificacion", "publicaciones", "resenas", "reportes", "soporte"] },
            { label: "Marketplace", ids: ["empleos", "promociones", "campanas"] },
            { label: "Gestión", ids: ["categorias", "aseguradoras", "cuentas"] },
            { label: "Información", ids: ["analitica", "cobertura", "costos"] },
          ].map((group, index) => (
            <div key={group.label} className={index === 0 ? "" : "mt-4 border-t border-white/10 pt-3"}>
              <p className="mb-1 px-3 text-[10px] font-semibold uppercase text-white/35">{group.label}</p>
              <div className="space-y-0.5">
                {items.filter((item) => group.ids.includes(item.id)).map((item) => (
                  <div key={item.id} className="relative">{navLink(item, "side")}</div>
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="border-t border-white/10 p-3">
          <p className="truncate text-sm font-semibold leading-tight">{shortAdminName}</p>
          <p className="text-[11px] text-white/50">Administrador</p>
        </div>
      </aside>

      {/* ── Mobile top bar (horizontal scroll) ── */}
      <header className="lg:hidden bg-[#0f172a] text-white">
        <div className="px-4 py-3 flex items-center justify-between">
          <Link href="/admin" className="flex items-center gap-2">
            <ContrataCRLogo tone="dark" />
          </Link>
          <Link href="/" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-white/10 px-3 text-xs font-semibold text-white/85 transition-colors hover:bg-white/20 hover:text-white">
            <ArrowLeft className="h-4 w-4" /> Volver a ContrataCR
          </Link>
        </div>
        <div ref={railRef} className="scrollbar-none flex gap-1 overflow-x-auto px-2">
          {items.map((it) => navLink(it, "top"))}
        </div>
      </header>

      {/* ── Content ── ONE shared, centered max-width container so EVERY admin page lines
          up at the same width (the width is defined here, once — never per page). Wide
          tables/queues (Usuarios, Verificación, Reportes) fill it; sparse detail pages
          (e.g. the verification-detail) get balanced side margins. Pages must NOT re-apply
          their own `max-w`/`mx-auto` — they inherit this. */}
      <main className="lg:ml-60 flex-1 min-w-0">
        <div className="mx-auto w-full max-w-[1320px] px-4 sm:px-6 lg:px-8 py-6">{children}</div>
      </main>
    </div>
  );
}

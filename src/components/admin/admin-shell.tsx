"use client";

import { useEffect, useState } from "react";
import { ShieldCheck, LogOut, Flag, Shield, Tag, UserX, Headset, Users, CreditCard, LayoutGrid, BarChart3, Activity } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { ContrataCRLogo } from "@/components/landing/landing-navbar";

export type AdminTab =
  | "resumen" | "verificacion" | "usuarios" | "reportes" | "aseguradoras"
  | "categorias" | "cuentas" | "suscripciones" | "soporte" | "analitica" | "actividad";

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
  // Soporte) — verificación, reportes, suscripciones, soporte — from ONE polled
  // endpoint so the counts stay accurate and consistent. Polled + refreshed on
  // window focus so resolving an item updates its badge.
  const [counts, setCounts] = useState<Record<string, number>>({});
  useEffect(() => {
    let alive = true;
    const fetchCounts = () =>
      fetch("/api/admin/pending-counts")
        .then((r) => r.json())
        .then((d) => { if (alive) setCounts(d ?? {}); })
        .catch(() => {});
    fetchCounts();
    const id = setInterval(fetchCounts, 30000);
    const onFocus = () => fetchCounts();
    window.addEventListener("focus", onFocus);
    return () => { alive = false; clearInterval(id); window.removeEventListener("focus", onFocus); };
  }, []);

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.assign("/es/admin");
  }

  const items: { id: AdminTab; label: string; icon: typeof ShieldCheck; href: string; badge: number }[] = [
    { id: "resumen", label: "Resumen", icon: LayoutGrid, href: "/admin", badge: 0 },
    { id: "verificacion", label: "Verificación", icon: ShieldCheck, href: "/admin/verificacion", badge: counts.verificacion ?? 0 },
    { id: "usuarios", label: "Usuarios", icon: Users, href: "/admin/usuarios", badge: 0 },
    { id: "reportes", label: "Reportes", icon: Flag, href: "/admin/reportes", badge: counts.reportes ?? 0 },
    { id: "aseguradoras", label: "Aseguradoras", icon: Shield, href: "/admin/aseguradoras", badge: 0 },
    { id: "categorias", label: "Categorías", icon: Tag, href: "/admin/categorias", badge: counts.categorias ?? 0 },
    { id: "cuentas", label: "Cuentas", icon: UserX, href: "/admin/cuentas", badge: 0 },
    { id: "suscripciones", label: "Suscripciones", icon: CreditCard, href: "/admin/suscripciones", badge: counts.suscripciones ?? 0 },
    { id: "soporte", label: "Soporte", icon: Headset, href: "/admin/soporte", badge: counts.soporte ?? 0 },
    { id: "analitica", label: "Analítica", icon: BarChart3, href: "/admin/analitica", badge: 0 },
    { id: "actividad", label: "Actividad", icon: Activity, href: "/admin/actividad", badge: 0 },
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
      className={cn(
        variant === "side"
          ? "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
          : "flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap shrink-0 transition-colors",
        active === it.id
          ? variant === "side" ? "bg-white/10 text-white" : "border-[#38bdf8] text-white"
          : variant === "side" ? "text-white/55 hover:bg-white/5 hover:text-white" : "border-transparent text-white/60 hover:text-white"
      )}
    >
      {active === it.id && variant === "side" && <span className="absolute left-0 h-5 w-1 rounded-r bg-[#38bdf8]" aria-hidden />}
      <it.icon className={cn("h-4 w-4 shrink-0", active === it.id && "text-[#38bdf8]")} />
      <span className="truncate">{it.label}</span>
      {it.badge > 0 && (
        <span className="ml-auto inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#38bdf8] px-1 text-[10px] font-bold leading-none text-[#0f172a]">
          {it.badge > 9 ? "9+" : it.badge}
        </span>
      )}
    </Link>
  );

  return (
    <div className="min-h-screen bg-[#f4f7fa] lg:flex">
      {/* ── Desktop sidebar ── */}
      <aside className="hidden lg:flex lg:w-60 lg:flex-col lg:fixed lg:inset-y-0 bg-[#0f172a] text-white">
        <Link href="/admin" className="flex h-16 shrink-0 items-center gap-2 px-5">
          <ContrataCRLogo tone="dark" />
          <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] font-semibold text-white/60">Admin</span>
        </Link>
        <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-0.5">
          {items.map((it) => (
            <div key={it.id} className="relative">{navLink(it, "side")}</div>
          ))}
        </nav>
        <div className="border-t border-white/10 p-3 flex items-center gap-2.5">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold leading-tight">{shortAdminName}</p>
            <p className="text-[11px] text-white/50">Administrador</p>
          </div>
          <button onClick={signOut} aria-label="Salir" className="flex h-8 w-8 items-center justify-center rounded-lg text-white/60 hover:bg-white/10 hover:text-white transition-colors">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </aside>

      {/* ── Mobile top bar (horizontal scroll) ── */}
      <header className="lg:hidden bg-[#0f172a] text-white">
        <div className="px-4 py-3 flex items-center justify-between">
          <Link href="/admin" className="flex items-center gap-2">
            <ContrataCRLogo tone="dark" />
            <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] font-semibold text-white/60">Admin</span>
          </Link>
          <button onClick={signOut} className="flex items-center gap-1.5 rounded-lg bg-white/10 hover:bg-white/20 px-3 py-1.5 text-sm transition-colors">
            <LogOut className="h-4 w-4" /> Salir
          </button>
        </div>
        <div className="px-2 flex gap-1 overflow-x-auto">
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

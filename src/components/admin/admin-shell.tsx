"use client";

import { ShieldCheck, LogOut, Flag, Shield, Tag, UserX } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

// Minimal, fast ops chrome for the admin panel. Consistent with the brand
// but deliberately plain — this is a daily review tool, clarity over decoration.
// The panel is exception + moderation + support only (no per-user approvals):
//  - "Verificación": exceptions that couldn't auto-verify (pendientes + apelaciones).
//  - "Reportes": complaints/moderation (remove fake photos, ban, revoke).
export function AdminShell({
  adminName,
  active = "verificacion",
  children,
}: {
  adminName: string;
  active?: "verificacion" | "reportes" | "aseguradoras" | "categorias" | "cuentas";
  children: React.ReactNode;
}) {
  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.assign("/es/admin");
  }

  const tabs = [
    { id: "verificacion", label: "Verificación", icon: ShieldCheck, href: "/admin" as const },
    { id: "reportes", label: "Reportes", icon: Flag, href: "/admin/reportes" as const },
    { id: "aseguradoras", label: "Aseguradoras", icon: Shield, href: "/admin/aseguradoras" as const },
    { id: "categorias", label: "Categorías", icon: Tag, href: "/admin/categorias" as const },
    { id: "cuentas", label: "Cuentas", icon: UserX, href: "/admin/cuentas" as const },
  ];

  return (
    <div className="min-h-screen bg-[#f4f7fa]">
      <header className="bg-[#0f172a] text-white">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-3 flex items-center justify-between">
          <Link href="/admin" className="flex items-center gap-2 font-bold">
            <ShieldCheck className="h-5 w-5 text-[#38bdf8]" />
            ContrataCR · Admin
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-white/70 hidden sm:inline">{adminName}</span>
            <button
              onClick={signOut}
              className="flex items-center gap-1.5 rounded-lg bg-white/10 hover:bg-white/20 px-3 py-1.5 transition-colors"
            >
              <LogOut className="h-4 w-4" /> Salir
            </button>
          </div>
        </div>
        <div className="mx-auto max-w-6xl px-4 sm:px-6 flex gap-1">
          {tabs.map((t) => (
            <Link
              key={t.id}
              href={t.href}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 transition-colors",
                active === t.id ? "border-[#38bdf8] text-white" : "border-transparent text-white/60 hover:text-white"
              )}
            >
              <t.icon className="h-4 w-4" /> {t.label}
            </Link>
          ))}
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 sm:px-6 py-6">{children}</main>
    </div>
  );
}

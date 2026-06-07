"use client";

import { ShieldCheck, LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Link } from "@/i18n/navigation";

// Minimal, fast ops chrome for the admin panel. Consistent with the brand
// but deliberately plain — this is a daily review tool, clarity over decoration.
export function AdminShell({ adminName, children }: { adminName: string; children: React.ReactNode }) {
  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.assign("/es/admin/login");
  }

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
      </header>
      <main className="mx-auto max-w-6xl px-4 sm:px-6 py-6">{children}</main>
    </div>
  );
}

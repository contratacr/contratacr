"use client";

import { useState } from "react";
import { ShieldCheck, AlertCircle, Lock } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ContrataCRLogo } from "@/components/landing/landing-navbar";

async function waitForAuthCookie(maxMs = 2000): Promise<void> {
  const hasAuthCookie = () =>
    typeof document !== "undefined" &&
    document.cookie.split(";").some((cookie) => {
      const name = cookie.trim();
      return name.startsWith("sb-") && name.includes("-auth-token");
    });

  const start = Date.now();
  while (!hasAuthCookie() && Date.now() - start < maxMs) {
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
}

// Inline admin login (rendered at /admin when the visitor isn't an admin).
// Signs in, confirms role=admin, and only then reloads into the panel.
export function AdminLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();

    const { data, error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
    if (signInErr || !data.user) {
      setLoading(false);
      setError("Credenciales inválidas.");
      return;
    }

    const { data: profile } = await supabase.from("profiles").select("role").eq("id", data.user.id).maybeSingle();
    if (profile?.role !== "admin") {
      await supabase.auth.signOut();
      setLoading(false);
      setError("Esta cuenta no tiene acceso de administrador.");
      return;
    }

    await waitForAuthCookie();
    window.location.assign("/es/admin");
  }

  const inputClass =
    "w-full h-11 rounded-xl border border-[#e5e7eb] bg-white pl-10 pr-4 text-sm text-[#111827] placeholder:text-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent transition-all";

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-[#0f172a] px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-8">
        <div className="flex flex-col items-center mb-6">
          <ContrataCRLogo />
          <div className="mt-4 flex items-center gap-2 text-[#1a2744]">
            <ShieldCheck className="h-5 w-5 text-[#009FD9]" />
            <span className="font-bold text-lg">Panel de administración</span>
          </div>
          <p className="text-xs text-[#6b7280] mt-1">Acceso restringido al equipo de ContrataCR.</p>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 mb-4 bg-red-50 border border-red-100 rounded-xl text-xs text-red-600">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9ca3af] text-sm">@</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Correo de administrador" className={inputClass} required />
          </div>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#9ca3af]" />
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Contraseña" className={inputClass} required />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="mt-2 w-full h-11 rounded-xl bg-[#009FD9] hover:bg-[#0089bb] text-white font-bold text-sm transition-all active:scale-[0.98] disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {loading && <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />}
            {loading ? "Ingresando…" : "Ingresar"}
          </button>
        </form>
      </div>
    </main>
  );
}

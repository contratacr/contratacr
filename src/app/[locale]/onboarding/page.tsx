"use client";

import { useState, useEffect } from "react";
import { Search, Briefcase, ArrowRight } from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import { useAuth } from "@/hooks/use-auth";
import { createClient } from "@/lib/supabase/client";
import { ContrataCRLogo } from "@/components/landing/landing-navbar";
import { LandingFooter } from "@/components/landing/landing-footer";

export default function OnboardingPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [selecting, setSelecting] = useState<"client" | "professional" | null>(null);

  // Redirect if not logged in
  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [user, authLoading, router]);

  // If already completed onboarding, skip to dashboard
  useEffect(() => {
    if (!authLoading && user) {
      const done = user.user_metadata?.onboarding_completed === true;
      if (done) {
        const role = user.user_metadata?.role as string | undefined;
        router.push(role === "professional" ? "/dashboard/profesional" : "/dashboard/cliente");
      }
    }
  }, [user, authLoading, router]);

  async function selectRole(role: "client" | "professional") {
    if (!user || selecting) return;
    setSelecting(role);
    const supabase = createClient();

    // Upsert so this works whether or not a trigger pre-created the row
    await supabase.from("profiles").upsert(
      {
        id: user.id,
        email: user.email ?? "",
        full_name:
          (user.user_metadata?.full_name as string) ??
          (user.user_metadata?.name as string) ??
          user.email?.split("@")[0] ??
          "",
        role,
        onboarding_completed: true,
      },
      { onConflict: "id" }
    );

    // Sync metadata so navbar + middleware see role immediately
    await supabase.auth.updateUser({
      data: { role, onboarding_completed: true },
    });

    if (role === "professional") {
      router.push("/registro/profesional");
    } else {
      // Clients go home — ready to search
      router.push("/");
    }
  }

  if (authLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#009FD9] border-t-transparent" />
      </div>
    );
  }

  const displayName = (user.user_metadata?.full_name ??
    user.user_metadata?.name ??
    user.email?.split("@")[0] ??
    "") as string;

  return (
    <div className="min-h-screen flex flex-col bg-[#f4f7fa]">
      {/* Minimal header */}
      <header className="bg-white border-b border-gray-100 px-4 py-4 flex justify-center">
        <Link href="/">
          <ContrataCRLogo />
        </Link>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-4 py-12">
        <div className="w-full max-w-xl">
          <div className="text-center mb-10">
            {displayName && (
              <p className="text-sm text-[#009FD9] font-semibold mb-2 uppercase tracking-wide">
                Hola, {displayName.split(" ")[0]}
              </p>
            )}
            <h1 className="text-3xl font-bold text-[#111827] mb-3">
              ¿Para qué usarás ContrataCR?
            </h1>
            <p className="text-[#6b7280] text-base">
              Elegí cómo querés usar la plataforma. Podés cambiar esto más adelante.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

            {/* Client card */}
            <button
              onClick={() => selectRole("client")}
              disabled={!!selecting}
              className="group flex flex-col items-center gap-5 p-8 bg-white border-2 border-[#e5e7eb] rounded-2xl hover:border-[#009FD9] hover:shadow-lg transition-all duration-200 disabled:opacity-60 text-center"
            >
              <div className="h-16 w-16 rounded-full bg-[#EBF5FB] flex items-center justify-center group-hover:bg-[#009FD9] transition-colors duration-200 shrink-0">
                {selecting === "client" ? (
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#009FD9] border-t-transparent group-hover:border-white" />
                ) : (
                  <Search className="h-8 w-8 text-[#009FD9] group-hover:text-white transition-colors duration-200" />
                )}
              </div>
              <div>
                <h2 className="text-xl font-bold text-[#111827] mb-2">
                  Busco profesionales
                </h2>
                <p className="text-sm text-[#6b7280] leading-relaxed">
                  Necesito contratar servicios: plomería, electricidad, limpieza, diseño y más.
                </p>
              </div>
              <span className="flex items-center gap-1.5 text-sm font-semibold text-[#009FD9] opacity-0 group-hover:opacity-100 transition-opacity">
                Continuar <ArrowRight className="h-4 w-4" />
              </span>
            </button>

            {/* Professional card */}
            <button
              onClick={() => selectRole("professional")}
              disabled={!!selecting}
              className="group flex flex-col items-center gap-5 p-8 bg-white border-2 border-[#e5e7eb] rounded-2xl hover:border-[#009FD9] hover:shadow-lg transition-all duration-200 disabled:opacity-60 text-center"
            >
              <div className="h-16 w-16 rounded-full bg-[#EBF5FB] flex items-center justify-center group-hover:bg-[#009FD9] transition-colors duration-200 shrink-0">
                {selecting === "professional" ? (
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#009FD9] border-t-transparent group-hover:border-white" />
                ) : (
                  <Briefcase className="h-8 w-8 text-[#009FD9] group-hover:text-white transition-colors duration-200" />
                )}
              </div>
              <div>
                <h2 className="text-xl font-bold text-[#111827] mb-2">
                  Soy profesional
                </h2>
                <p className="text-sm text-[#6b7280] leading-relaxed">
                  Ofrezco mis servicios y quiero conectar con clientes en Costa Rica.
                </p>
              </div>
              <span className="flex items-center gap-1.5 text-sm font-semibold text-[#009FD9] opacity-0 group-hover:opacity-100 transition-opacity">
                Continuar <ArrowRight className="h-4 w-4" />
              </span>
            </button>

          </div>
        </div>
      </main>

      <LandingFooter />
    </div>
  );
}

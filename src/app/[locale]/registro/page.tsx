"use client";

import { Search, Briefcase, ArrowRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Navbar } from "@/components/layout/navbar";
import { LandingFooter } from "@/components/landing/landing-footer";

export default function RegisterPage() {
  return (
    <div className="min-h-screen flex flex-col bg-[#f4f7fa]">
      <Navbar />
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-12">
        <div className="w-full max-w-xl">
          <div className="text-center mb-10">
            <h1 className="text-3xl font-bold text-[#111827] mb-2">Crear cuenta gratis</h1>
            <p className="text-[#6b7280] text-base">¿Cómo quieres usar ContrataCR?</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Client */}
            <Link
              href="/registro/cliente"
              className="group flex flex-col items-center gap-5 p-8 bg-white border-2 border-[#e5e7eb] rounded-2xl hover:border-[#009FD9] hover:shadow-lg transition-all duration-200 text-center"
            >
              <div className="h-16 w-16 rounded-full bg-[#EBF5FB] flex items-center justify-center group-hover:bg-[#009FD9] transition-colors duration-200 shrink-0">
                <Search className="h-8 w-8 text-[#009FD9] group-hover:text-white transition-colors duration-200" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-[#111827] mb-2">Busco profesionales</h2>
                <p className="text-sm text-[#6b7280] leading-relaxed">
                  Necesito contratar servicios: plomería, electricidad, limpieza, diseño y más.
                </p>
              </div>
              <span className="flex items-center gap-1.5 text-sm font-semibold text-[#009FD9] opacity-0 group-hover:opacity-100 transition-opacity">
                Continuar <ArrowRight className="h-4 w-4" />
              </span>
            </Link>

            {/* Professional */}
            <Link
              href="/registro/profesional"
              className="group flex flex-col items-center gap-5 p-8 bg-white border-2 border-[#e5e7eb] rounded-2xl hover:border-[#009FD9] hover:shadow-lg transition-all duration-200 text-center"
            >
              <div className="h-16 w-16 rounded-full bg-[#EBF5FB] flex items-center justify-center group-hover:bg-[#009FD9] transition-colors duration-200 shrink-0">
                <Briefcase className="h-8 w-8 text-[#009FD9] group-hover:text-white transition-colors duration-200" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-[#111827] mb-2">Soy profesional</h2>
                <p className="text-sm text-[#6b7280] leading-relaxed">
                  Ofrezco mis servicios y quiero conectar con clientes en Costa Rica.
                </p>
              </div>
              <span className="flex items-center gap-1.5 text-sm font-semibold text-[#009FD9] opacity-0 group-hover:opacity-100 transition-opacity">
                Continuar <ArrowRight className="h-4 w-4" />
              </span>
            </Link>
          </div>

          <p className="text-center text-sm text-[#6b7280] mt-8">
            ¿Ya tienes cuenta?{" "}
            <Link href="/login" className="text-[#009FD9] font-medium hover:underline">
              Inicia sesión
            </Link>
          </p>
        </div>
      </main>
      <LandingFooter />
    </div>
  );
}

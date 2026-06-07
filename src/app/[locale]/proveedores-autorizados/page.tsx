import { ShieldCheck, IdCard, FileCheck2, BookOpen, RefreshCw, Search } from "lucide-react";
import { Navbar } from "@/components/layout/navbar";
import { LandingFooter } from "@/components/landing/landing-footer";
import { Link } from "@/i18n/navigation";
import { VerificationCta } from "@/components/professionals/verification-cta";

export const metadata = {
  title: "¿Qué es un Proveedor Autorizado? — ContrataCR",
  description:
    "Cómo funciona el respaldo de verificación de identidad y documentos de ContrataCR. La insignia confirma identidad y documentos; no garantiza el resultado de ningún trabajo.",
};

const STEPS = [
  {
    icon: IdCard,
    title: "Verificación de identidad",
    body: "Confirmamos el documento de identidad (cédula, DIMEX o NITE) del proveedor y que corresponda a la persona registrada.",
  },
  {
    icon: FileCheck2,
    title: "Revisión de documentos",
    body: "Nuestro equipo revisa manualmente la información y las fotos del perfil antes de otorgar la insignia.",
  },
  {
    icon: BookOpen,
    title: "Código de conducta",
    body: "El proveedor acepta un código de conducta de trato profesional, honestidad y respeto hacia los clientes.",
  },
  {
    icon: RefreshCw,
    title: "Evaluación continua",
    body: "La insignia puede revisarse en cualquier momento. Si surge un incumplimiento, el respaldo puede ser retirado.",
  },
];

export default function AuthorizedProvidersPage() {
  return (
    <div className="min-h-screen flex flex-col bg-[#f4f7fa]">
      <Navbar />
      <main className="flex-1">
        {/* Hero */}
        <section className="bg-white border-b border-[#e5e7eb]">
          <div className="mx-auto max-w-3xl px-4 sm:px-6 py-12 text-center">
            <div className="inline-flex items-center gap-2 rounded-full bg-[#dcfce7] px-3 py-1 text-sm font-semibold text-[#15803d]">
              <ShieldCheck className="h-4 w-4" /> Proveedor Autorizado
            </div>
            <h1 className="mt-4 text-3xl font-bold text-[#111827]">¿Qué es un Proveedor Autorizado?</h1>
            <p className="mt-3 text-[#6b7280] leading-relaxed">
              Es un respaldo que otorga ContrataCR tras verificar la <strong>identidad y los documentos</strong> de
              un proveedor. Es una insignia que se gana: le da más visibilidad ante los clientes que buscan mayor
              confianza, sin bloquear a nadie.
            </p>
          </div>
        </section>

        {/* Steps */}
        <section className="mx-auto max-w-3xl px-4 sm:px-6 py-10">
          <h2 className="text-lg font-bold text-[#111827] mb-5">¿Cómo se otorga?</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            {STEPS.map((s) => (
              <div key={s.title} className="bg-white rounded-xl border border-[#e5e7eb] p-5">
                <div className="h-9 w-9 rounded-lg bg-[#EBF5FB] flex items-center justify-center mb-3">
                  <s.icon className="h-5 w-5 text-[#009FD9]" />
                </div>
                <h3 className="font-semibold text-[#111827] text-sm">{s.title}</h3>
                <p className="text-sm text-[#6b7280] mt-1 leading-relaxed">{s.body}</p>
              </div>
            ))}
          </div>

          {/* Disclaimer — intermediary framing, no "garantía" */}
          <div className="mt-8 rounded-xl border border-[#fde68a] bg-[#fffbeb] p-5">
            <h3 className="font-semibold text-[#92400e] text-sm">Aviso importante</h3>
            <p className="text-sm text-[#92400e] mt-1.5 leading-relaxed">
              ContrataCR es una <strong>plataforma intermediaria</strong> que conecta a clientes con proveedores de
              servicios; no es la proveedora del servicio. La insignia de Proveedor Autorizado confirma la
              verificación de identidad y documentos y el compromiso con un código de conducta. <strong>No garantiza
              ni asegura el resultado, la calidad ni la finalización de ningún trabajo.</strong> La contratación y el
              acuerdo del servicio ocurren directamente entre el cliente y el proveedor.
            </p>
          </div>

          {/* CTAs */}
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/buscar?autorizados=1"
              className="inline-flex items-center gap-2 rounded-xl bg-[#16a34a] px-5 py-3 text-sm font-bold text-white hover:bg-[#15803d]"
            >
              <Search className="h-4 w-4" /> Ver Proveedores Autorizados
            </Link>
            <VerificationCta className="inline-flex items-center gap-2 rounded-xl border border-[#e5e7eb] bg-white px-5 py-3 text-sm font-bold text-[#374151] hover:border-[#009FD9]" />
          </div>
        </section>
      </main>
      <LandingFooter />
    </div>
  );
}

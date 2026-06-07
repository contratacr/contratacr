import { ShieldCheck, IdCard, ScanFace, RefreshCw, Search } from "lucide-react";
import { Navbar } from "@/components/layout/navbar";
import { LandingFooter } from "@/components/landing/landing-footer";
import { Link } from "@/i18n/navigation";
import { VerificationCta } from "@/components/professionals/verification-cta";

export const metadata = {
  title: "¿Qué es la verificación de identidad? — ContrataCR",
  description:
    "Cómo funciona la verificación de identidad de ContrataCR: confirmamos que la cédula es real y el nombre coincide con los registros oficiales. Verificamos identidad, no la calidad ni el resultado de los trabajos.",
};

const STEPS = [
  {
    icon: IdCard,
    title: "Cédula real",
    body: "Confirmamos automáticamente que el número de identificación (cédula, DIMEX o NITE) exista en los registros oficiales del TSE.",
  },
  {
    icon: ScanFace,
    title: "El nombre coincide",
    body: "Comparamos el nombre registrado con el del padrón. Si coincide, la verificación se otorga al instante, sin esperas.",
  },
  {
    icon: RefreshCw,
    title: "Datos siempre al día",
    body: "El padrón se actualiza periódicamente. Si tu caso no pasa automáticamente, podés apelar y se vuelve a verificar.",
  },
];

export default function IdentityVerificationPage() {
  return (
    <div className="min-h-screen flex flex-col bg-[#f4f7fa]">
      <Navbar />
      <main className="flex-1">
        {/* Hero */}
        <section className="bg-white border-b border-[#e5e7eb]">
          <div className="mx-auto max-w-3xl px-4 sm:px-6 py-12 text-center">
            <div className="inline-flex items-center gap-2 rounded-full bg-[#dcfce7] px-3 py-1 text-sm font-semibold text-[#15803d]">
              <ShieldCheck className="h-4 w-4" /> Identidad verificada
            </div>
            <h1 className="mt-4 text-3xl font-bold text-[#111827]">¿Qué es la verificación de identidad?</h1>
            <p className="mt-3 text-[#6b7280] leading-relaxed">
              Es un respaldo que confirma que la <strong>cédula del proveedor es real</strong> y que su
              <strong> nombre coincide con los registros oficiales</strong>. Es automática y se gana: da más
              visibilidad ante los clientes que buscan mayor confianza, sin bloquear a nadie.
            </p>
          </div>
        </section>

        {/* Steps */}
        <section className="mx-auto max-w-3xl px-4 sm:px-6 py-10">
          <h2 className="text-lg font-bold text-[#111827] mb-5">¿Cómo funciona?</h2>
          <div className="grid sm:grid-cols-3 gap-4">
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

          {/* Disclaimer — intermediary framing, no "garantía" / "autorizado" */}
          <div className="mt-8 rounded-xl border border-[#fde68a] bg-[#fffbeb] p-5">
            <h3 className="font-semibold text-[#92400e] text-sm">Aviso importante</h3>
            <p className="text-sm text-[#92400e] mt-1.5 leading-relaxed">
              ContrataCR es una <strong>plataforma intermediaria</strong> que conecta a clientes con proveedores de
              servicios; no es la proveedora del servicio. La insignia <strong>“Identidad verificada”</strong> confirma
              únicamente que la cédula es real y el nombre coincide con los registros oficiales. <strong>No garantiza ni
              asegura la calidad, el resultado ni la finalización de ningún trabajo</strong>, y no prueba por sí sola que
              quien se registró sea físicamente esa persona. La contratación ocurre directamente entre el cliente y el
              proveedor.
            </p>
          </div>

          {/* CTAs */}
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/buscar?verificados=1"
              className="inline-flex items-center gap-2 rounded-xl bg-[#16a34a] px-5 py-3 text-sm font-bold text-white hover:bg-[#15803d]"
            >
              <Search className="h-4 w-4" /> Ver proveedores con identidad verificada
            </Link>
            <VerificationCta className="inline-flex items-center gap-2 rounded-xl border border-[#e5e7eb] bg-white px-5 py-3 text-sm font-bold text-[#374151] hover:border-[#009FD9]" />
          </div>
        </section>
      </main>
      <LandingFooter />
    </div>
  );
}

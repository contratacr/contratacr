import { LandingNavbar } from "@/components/landing/landing-navbar";
import { LandingFooter } from "@/components/landing/landing-footer";
import { Link } from "@/i18n/navigation";
import { SUPPORT_EMAIL } from "@/lib/constants";
import { AlertTriangle } from "lucide-react";

export const metadata = {
  title: "Términos y condiciones — ContrataCR",
  description: "Términos y condiciones de uso de ContrataCR, el mercado de servicios profesionales para Costa Rica.",
};

const SECTIONS: { id: string; h: string; p: string[] }[] = [
  {
    id: "aceptacion",
    h: "1. Aceptación de los términos",
    p: [
      "Al crear una cuenta o usar ContrataCR aceptas estos Términos y Condiciones. Si no estás de acuerdo, no uses la plataforma.",
      "Para usar ContrataCR debes ser mayor de edad y proporcionar información veraz.",
    ],
  },
  {
    id: "que-es",
    h: "2. Qué es ContrataCR",
    p: [
      "ContrataCR es una plataforma intermediaria que conecta a clientes con profesionales de servicios en Costa Rica. No somos los proveedores de los servicios ni participamos en su ejecución.",
      "La contratación, el precio, la fecha y el pago se acuerdan y se realizan directamente entre el cliente y el profesional. ContrataCR no cobra comisiones por las contrataciones.",
    ],
  },
  {
    id: "cuentas",
    h: "3. Cuentas y verificación de identidad",
    p: [
      "Cada usuario es responsable de la veracidad de su información y de la actividad en su cuenta. Los profesionales confirman su identidad mediante la cédula, que validamos contra el padrón del Tribunal Supremo de Elecciones (TSE).",
      "La insignia “Identidad verificada” confirma únicamente que la cédula es real y que el nombre coincide con los registros oficiales. No certifica la calidad, la idoneidad ni el resultado de ningún trabajo, y no prueba por sí sola que quien se registró sea físicamente esa persona.",
    ],
  },
  {
    id: "uso",
    h: "4. Uso de la plataforma",
    p: [
      "Los clientes pueden buscar profesionales, publicar proyectos y solicitar servicios. Los profesionales pueden crear un perfil, recibir solicitudes y enviar propuestas.",
      "Te comprometes a usar la plataforma de buena fe, sin suplantar a terceros, sin publicar información falsa y sin usarla para fines ilícitos.",
    ],
  },
  {
    id: "pagos",
    h: "5. Pagos",
    p: [
      "Los pagos ocurren fuera de la plataforma, directamente entre el cliente y el profesional. ContrataCR no procesa, retiene ni garantiza pagos, y no cobra comisiones por las transacciones.",
    ],
  },
  {
    id: "resenas",
    h: "6. Reseñas y reportes",
    p: [
      "Solo los clientes que recibieron un servicio pueden dejar una reseña. Las reseñas deben ser honestas y respetuosas. La reputación funciona en ambas direcciones: los profesionales también pueden reportar a un cliente.",
      "Podemos moderar, ocultar o eliminar contenido que incumpla estos términos o la ley.",
    ],
  },
  {
    id: "responsabilidad",
    h: "7. Limitación de responsabilidad",
    p: [
      "ContrataCR no garantiza la disponibilidad, la calidad, la seguridad ni el resultado de los servicios contratados a través de la plataforma. La relación de servicio es exclusivamente entre el cliente y el profesional.",
      "En la medida permitida por la ley, ContrataCR no será responsable por daños derivados de los acuerdos, trabajos o pagos realizados entre las partes.",
    ],
  },
  {
    id: "datos",
    h: "8. Protección de datos",
    p: [
      "El tratamiento de tus datos personales se rige por nuestra Política de Privacidad y por la Ley N.º 8968 de Costa Rica, aplicando el principio de minimización de datos.",
    ],
  },
  {
    id: "cambios",
    h: "9. Cambios y ley aplicable",
    p: [
      "Podemos actualizar estos términos cuando sea necesario; los cambios relevantes se comunicarán en la plataforma. Estos términos se rigen por las leyes de la República de Costa Rica.",
    ],
  },
];

export default function TerminosPage() {
  return (
    <div className="min-h-screen flex flex-col bg-white">
      <LandingNavbar />
      <main className="flex-1 pt-28 pb-20 px-4">
        <div className="mx-auto max-w-3xl">

          {/* Draft notice */}
          <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-[#92400e]">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <p>
              <strong>Borrador pendiente de revisión legal.</strong> Esta es una versión preliminar de ContrataCR,
              pendiente de revisión por un abogado costarricense antes del lanzamiento. No constituye asesoría legal
              ni la versión definitiva del documento.
            </p>
          </div>

          {/* Title */}
          <header className="mt-8">
            <h1 className="text-3xl sm:text-4xl font-extrabold text-[#111827]">Términos y condiciones</h1>
            <p className="text-[#6b7280] mt-2">Última actualización: 9 de junio de 2026</p>
          </header>

          {/* Table of contents */}
          <nav aria-label="Contenido" className="mt-8 rounded-2xl border border-[#e5e7eb] bg-[#f9fafb] p-5">
            <p className="text-xs font-bold uppercase tracking-widest text-[#9ca3af] mb-3">Contenido</p>
            <ol className="grid sm:grid-cols-2 gap-x-6 gap-y-2">
              {SECTIONS.map((s) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} className="text-sm text-[#009FD9] hover:underline">{s.h}</a>
                </li>
              ))}
            </ol>
          </nav>

          {/* Sections */}
          <div className="mt-10 flex flex-col gap-10">
            {SECTIONS.map((s) => (
              <section key={s.id} id={s.id} className="scroll-mt-24">
                <h2 className="text-xl font-bold text-[#111827] mb-3">{s.h}</h2>
                <div className="space-y-3 text-[#374151] leading-relaxed">
                  {s.p.map((para, i) => <p key={i}>{para}</p>)}
                </div>
              </section>
            ))}

            <div className="rounded-2xl border border-[#e5e7eb] bg-[#f9fafb] p-5 text-sm text-[#6b7280]">
              ¿Dudas sobre estos términos? Escríbenos a{" "}
              <a href={`mailto:${SUPPORT_EMAIL}`} className="font-semibold text-[#009FD9] hover:underline">{SUPPORT_EMAIL}</a>{" "}
              o desde <Link href="/soporte" className="font-semibold text-[#009FD9] hover:underline">Contactar soporte</Link>. Revisa también nuestra{" "}
              <Link href="/privacidad" className="font-semibold text-[#009FD9] hover:underline">Política de Privacidad</Link>.
            </div>
          </div>
        </div>
      </main>
      <LandingFooter />
    </div>
  );
}

import { LandingNavbar } from "@/components/landing/landing-navbar";
import { LandingFooter } from "@/components/landing/landing-footer";
import { Link } from "@/i18n/navigation";
import { SUPPORT_EMAIL } from "@/lib/constants";

export const metadata = {
  title: "Términos y condiciones — ContrataCR",
  description: "Términos y condiciones de uso de ContrataCR, el mercado de servicios profesionales para Costa Rica.",
};

const SECTIONS: { h: string; p: string[] }[] = [
  {
    h: "1. Aceptación de los términos",
    p: [
      "Al crear una cuenta o usar ContrataCR aceptas estos Términos y Condiciones. Si no estás de acuerdo, no uses la plataforma.",
      "Para usar ContrataCR debes ser mayor de edad y proporcionar información veraz.",
    ],
  },
  {
    h: "2. Qué es ContrataCR",
    p: [
      "ContrataCR es una plataforma intermediaria que conecta a clientes con profesionales de servicios en Costa Rica. No somos los proveedores de los servicios ni participamos en su ejecución.",
      "La contratación, el precio, la fecha y el pago se acuerdan y se realizan directamente entre el cliente y el profesional. ContrataCR no cobra comisiones por las contrataciones.",
    ],
  },
  {
    h: "3. Cuentas y verificación de identidad",
    p: [
      "Cada usuario es responsable de la veracidad de su información y de la actividad en su cuenta. Los profesionales confirman su identidad mediante la cédula, que validamos contra el padrón del Tribunal Supremo de Elecciones (TSE).",
      "La insignia “Identidad verificada” confirma únicamente que la cédula es real y que el nombre coincide con los registros oficiales. No certifica la calidad, la idoneidad ni el resultado de ningún trabajo, y no prueba por sí sola que quien se registró sea físicamente esa persona.",
    ],
  },
  {
    h: "4. Uso de la plataforma",
    p: [
      "Los clientes pueden buscar profesionales, publicar proyectos y solicitar servicios. Los profesionales pueden crear un perfil, recibir solicitudes y enviar propuestas.",
      "Te comprometes a usar la plataforma de buena fe, sin suplantar a terceros, sin publicar información falsa y sin usarla para fines ilícitos.",
    ],
  },
  {
    h: "5. Pagos",
    p: [
      "Los pagos ocurren fuera de la plataforma, directamente entre el cliente y el profesional. ContrataCR no procesa, retiene ni garantiza pagos, y no cobra comisiones por las transacciones.",
    ],
  },
  {
    h: "6. Reseñas y reportes",
    p: [
      "Solo los clientes que recibieron un servicio pueden dejar una reseña. Las reseñas deben ser honestas y respetuosas. La reputación funciona en ambas direcciones: los profesionales también pueden reportar a un cliente.",
      "Podemos moderar, ocultar o eliminar contenido que incumpla estos términos o la ley.",
    ],
  },
  {
    h: "7. Limitación de responsabilidad",
    p: [
      "ContrataCR no garantiza la disponibilidad, la calidad, la seguridad ni el resultado de los servicios contratados a través de la plataforma. La relación de servicio es exclusivamente entre el cliente y el profesional.",
      "En la medida permitida por la ley, ContrataCR no será responsable por daños derivados de los acuerdos, trabajos o pagos realizados entre las partes.",
    ],
  },
  {
    h: "8. Cambios y ley aplicable",
    p: [
      "Podemos actualizar estos términos cuando sea necesario; los cambios relevantes se comunicarán en la plataforma. Estos términos se rigen por las leyes de la República de Costa Rica.",
    ],
  },
];

export default function TerminosPage() {
  return (
    <div className="min-h-screen flex flex-col bg-white">
      <LandingNavbar />
      <main className="flex-1">
        <section className="relative overflow-hidden pt-32 pb-10 px-4 border-b border-[#f3f4f6]">
          <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[280px] bg-[radial-gradient(70%_60%_at_50%_0%,#EBF5FB_0%,transparent_72%)]" />
          <div className="relative mx-auto max-w-3xl">
            <h1 className="text-3xl sm:text-4xl font-extrabold text-[#111827]">Términos y condiciones</h1>
            <p className="text-[#6b7280] mt-2">Última actualización: 9 de junio de 2026</p>
          </div>
        </section>

        <section className="py-12 px-4">
          <div className="mx-auto max-w-3xl flex flex-col gap-8">
            {SECTIONS.map((s) => (
              <div key={s.h}>
                <h2 className="text-lg font-bold text-[#111827] mb-2">{s.h}</h2>
                <div className="space-y-3 text-[#374151] leading-relaxed text-[15px]">
                  {s.p.map((para, i) => <p key={i}>{para}</p>)}
                </div>
              </div>
            ))}

            <div className="rounded-2xl border border-[#e5e7eb] bg-[#f9fafb] p-5 text-sm text-[#6b7280]">
              ¿Dudas sobre estos términos? Escríbenos a{" "}
              <a href={`mailto:${SUPPORT_EMAIL}`} className="font-semibold text-[#009FD9] hover:underline">{SUPPORT_EMAIL}</a>{" "}
              o desde <Link href="/soporte" className="font-semibold text-[#009FD9] hover:underline">Contactar soporte</Link>. Revisa también nuestra{" "}
              <Link href="/privacidad" className="font-semibold text-[#009FD9] hover:underline">Política de Privacidad</Link>.
            </div>
          </div>
        </section>
      </main>
      <LandingFooter />
    </div>
  );
}

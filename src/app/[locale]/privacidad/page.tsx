import { LandingNavbar } from "@/components/landing/landing-navbar";
import { LandingFooter } from "@/components/landing/landing-footer";
import { Link } from "@/i18n/navigation";
import { SUPPORT_EMAIL } from "@/lib/constants";

export const metadata = {
  title: "Política de Privacidad — ContrataCR",
  description: "Cómo ContrataCR trata y protege tus datos personales, conforme a la Ley 8968 de Costa Rica.",
};

const SECTIONS: { h: string; p: string[] }[] = [
  {
    h: "1. Quiénes somos",
    p: [
      "ContrataCR es una plataforma costarricense que conecta a clientes con profesionales de servicios. Esta política explica qué datos personales tratamos y cómo los protegemos, conforme a la Ley N.º 8968, Ley de Protección de la Persona frente al tratamiento de sus datos personales.",
    ],
  },
  {
    h: "2. Qué datos tratamos",
    p: [
      "Datos de cuenta: nombre, correo electrónico, teléfono y contraseña.",
      "Verificación de identidad (profesionales): número de cédula, que validamos contra el padrón del TSE para confirmar que es real y que el nombre coincide. Aplicamos minimización de datos: guardamos únicamente el resultado necesario de esa verificación.",
      "Datos de uso del servicio: zona (provincia/cantón), categorías, solicitudes, proyectos y reseñas que generas al usar la plataforma.",
    ],
  },
  {
    h: "3. Para qué los usamos",
    p: [
      "Para crear y administrar tu cuenta, mostrar perfiles, conectar a clientes con profesionales, otorgar la insignia de identidad verificada y permitir la coordinación del servicio.",
      "No vendemos tus datos personales. Tu número de teléfono y tu correo no se muestran públicamente en la plataforma; el contacto entre las partes ocurre cuando decides iniciarlo (por lo general por WhatsApp).",
    ],
  },
  {
    h: "4. Con quién los compartimos",
    p: [
      "Solo compartimos los datos necesarios para que el servicio funcione (por ejemplo, mostrar tu perfil profesional a clientes) y con proveedores tecnológicos que nos ayudan a operar la plataforma, bajo obligaciones de confidencialidad. No los cedemos a terceros con fines de mercadeo.",
    ],
  },
  {
    h: "5. Tus derechos",
    p: [
      "Conforme a la Ley 8968 tienes derecho a acceder, rectificar, actualizar y eliminar tus datos, así como a revocar tu consentimiento. Puedes cerrar tu cuenta desde tu panel en cualquier momento.",
      `Para ejercer estos derechos, escríbenos a ${SUPPORT_EMAIL}.`,
    ],
  },
  {
    h: "6. Seguridad y conservación",
    p: [
      "Aplicamos medidas razonables para proteger tu información y conservamos los datos solo mientras tu cuenta esté activa o mientras sea necesario para cumplir con obligaciones legales.",
    ],
  },
  {
    h: "7. Cambios",
    p: [
      "Podemos actualizar esta política cuando sea necesario; los cambios relevantes se comunicarán en la plataforma.",
    ],
  },
];

export default function PrivacidadPage() {
  return (
    <div className="min-h-screen flex flex-col bg-white">
      <LandingNavbar />
      <main className="flex-1">
        <section className="relative overflow-hidden pt-32 pb-10 px-4 border-b border-[#f3f4f6]">
          <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[280px] bg-[radial-gradient(70%_60%_at_50%_0%,#EBF5FB_0%,transparent_72%)]" />
          <div className="relative mx-auto max-w-3xl">
            <h1 className="text-3xl sm:text-4xl font-extrabold text-[#111827]">Política de Privacidad</h1>
            <p className="text-[#6b7280] mt-2">Última actualización: 9 de junio de 2026 · Ley 8968 (Costa Rica)</p>
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
              ¿Preguntas sobre tus datos? Escríbenos a{" "}
              <a href={`mailto:${SUPPORT_EMAIL}`} className="font-semibold text-[#009FD9] hover:underline">{SUPPORT_EMAIL}</a>{" "}
              o desde <Link href="/soporte" className="font-semibold text-[#009FD9] hover:underline">Contactar soporte</Link>. Revisa también nuestros{" "}
              <Link href="/terminos" className="font-semibold text-[#009FD9] hover:underline">Términos y condiciones</Link>.
            </div>
          </div>
        </section>
      </main>
      <LandingFooter />
    </div>
  );
}

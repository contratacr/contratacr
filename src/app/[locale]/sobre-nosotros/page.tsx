import { LandingNavbar } from "@/components/landing/landing-navbar";
import { LandingFooter } from "@/components/landing/landing-footer";
import { FadeInUp } from "@/components/landing/fade-in-up";
import { SmartRegisterLink } from "@/components/layout/smart-register-link";
import { Link } from "@/i18n/navigation";
import { ShieldCheck, Link2, Star, MapPin, Search, ArrowRight } from "lucide-react";

export const metadata = {
  title: "Sobre nosotros — ContrataCR",
  description:
    "ContrataCR es el mercado de servicios profesionales hecho para Costa Rica: conecta a clientes con profesionales de identidad verificada, sin comisiones y de forma directa.",
};

const VALUES = [
  { icon: <ShieldCheck className="h-5 w-5" />, title: "Confianza primero", desc: "Verificamos la identidad de cada profesional contra el padrón del TSE antes de mostrar la insignia." },
  { icon: <Link2 className="h-5 w-5" />, title: "Conexiones directas", desc: "Somos el punto de encuentro: el trato y el pago ocurren directamente entre el cliente y el profesional, sin comisiones." },
  { icon: <Star className="h-5 w-5" />, title: "Reputación real", desc: "Solo quienes recibieron un servicio dejan reseña, y la reputación funciona en ambas direcciones." },
  { icon: <MapPin className="h-5 w-5" />, title: "Hecho para Costa Rica", desc: "Provincias, cantones, cédula, coordinación por WhatsApp: pensado para cómo se contrata aquí." },
];

export default function SobreNosotrosPage() {
  return (
    <div className="min-h-screen flex flex-col bg-white">
      <LandingNavbar />

      {/* Hero */}
      <section className="relative overflow-hidden pt-32 pb-16 text-center px-4">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[400px] bg-[radial-gradient(70%_60%_at_50%_0%,#EBF5FB_0%,transparent_72%)]" />
        <FadeInUp>
          <span className="relative inline-block text-xs font-bold uppercase tracking-widest text-[#009FD9] bg-[#EBF5FB] px-4 py-1.5 rounded-full mb-4">Sobre nosotros</span>
          <h1 className="relative text-4xl sm:text-5xl font-extrabold text-[#111827] mb-4 leading-tight">Contratar servicios,<br className="hidden sm:block" /> simple y confiable</h1>
          <p className="relative text-lg text-[#6b7280] max-w-2xl mx-auto">
            ContrataCR nació en Costa Rica con una idea sencilla: cuando necesitas un plomero, una niñera o un electricista, encontrar a la persona correcta debería ser rápido y dar confianza.
          </p>
        </FadeInUp>
      </section>

      {/* Story */}
      <section className="py-12 px-4 bg-white">
        <div className="mx-auto max-w-3xl">
          <FadeInUp>
            <div className="space-y-5 text-[#374151] leading-relaxed">
              <p>
                Somos un <strong>mercado de servicios profesionales exclusivo para Costa Rica</strong>. Conectamos a las personas que necesitan un servicio con profesionales de su zona, y nos aseguramos de que cada profesional tenga su <strong>identidad verificada</strong> contra los registros oficiales.
              </p>
              <p>
                ContrataCR es una <strong>plataforma intermediaria</strong>: facilitamos el encuentro entre cliente y profesional, pero no somos quienes prestan el servicio ni cobramos comisión alguna. El precio, la fecha y el pago se acuerdan directamente entre las dos partes, por lo general por WhatsApp.
              </p>
              <p>
                Creemos que la confianza se construye con transparencia: verificación de identidad real, reseñas de clientes que sí recibieron el servicio, y reglas claras en ambas direcciones. Es gratis para clientes y profesionales.
              </p>
            </div>
          </FadeInUp>
        </div>
      </section>

      {/* Values */}
      <section className="py-16 px-4 bg-[#f9fafb]">
        <div className="mx-auto max-w-6xl">
          <FadeInUp>
            <h2 className="text-2xl sm:text-3xl font-bold text-[#111827] text-center mb-12">Lo que nos guía</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {VALUES.map((v) => (
                <div key={v.title} className="rounded-2xl border border-[#e5e7eb] bg-white p-6">
                  <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-[#EBF5FB] text-[#009FD9]">{v.icon}</div>
                  <h3 className="font-semibold text-[#111827] mb-1.5">{v.title}</h3>
                  <p className="text-sm text-[#6b7280] leading-relaxed">{v.desc}</p>
                </div>
              ))}
            </div>
          </FadeInUp>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 px-4 bg-white">
        <div className="mx-auto max-w-3xl text-center">
          <FadeInUp>
            <h2 className="text-2xl sm:text-3xl font-bold text-[#111827] mb-6">¿Empezamos?</h2>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link href="/buscar" className="inline-flex items-center justify-center gap-2 bg-[#009FD9] hover:bg-[#0089bb] text-white font-bold px-7 py-3.5 rounded-2xl transition-all">
                <Search className="h-4 w-4" /> Buscar profesionales
              </Link>
              <SmartRegisterLink className="inline-flex items-center justify-center gap-2 border border-[#e5e7eb] bg-white text-[#374151] font-bold px-7 py-3.5 rounded-2xl hover:border-[#009FD9] transition-all">
                Registra tu perfil <ArrowRight className="h-4 w-4" />
              </SmartRegisterLink>
            </div>
          </FadeInUp>
        </div>
      </section>

      <LandingFooter />
    </div>
  );
}

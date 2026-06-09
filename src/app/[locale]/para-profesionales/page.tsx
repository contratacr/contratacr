import { LandingNavbar } from "@/components/landing/landing-navbar";
import { LandingFooter } from "@/components/landing/landing-footer";
import { FadeInUp } from "@/components/landing/fade-in-up";
import { SmartRegisterLink } from "@/components/layout/smart-register-link";
import { Link } from "@/i18n/navigation";
import {
  ArrowRight, ShieldCheck, MapPin, CalendarClock, Image as ImageIcon,
  Star, UserPlus, BadgeCheck, Ban,
} from "lucide-react";
import { WhatsAppIcon } from "@/components/icons/whatsapp-icon";

export const metadata = {
  title: "Trabaja con ContrataCR — Registra tu perfil gratis",
  description:
    "Recibe clientes directos en Costa Rica. Perfil gratis, sin comisiones, identidad verificada y control total de tu agenda. Registra tu perfil hoy.",
};

const BENEFITS = [
  { icon: <WhatsAppIcon className="h-5 w-5" />, title: "Clientes directos por WhatsApp", desc: "Las solicitudes te llegan directo al chat. Coordinas precio y fecha sin intermediarios." },
  { icon: <Ban className="h-5 w-5" />, title: "Sin comisiones", desc: "Te quedas con el 100% de lo que cobras. ContrataCR no toca el pago — el dinero es entre tú y el cliente." },
  { icon: <BadgeCheck className="h-5 w-5" />, title: "Identidad verificada gratis", desc: "Confirmamos tu cédula contra el padrón (TSE) y obtienes la insignia que genera confianza." },
  { icon: <MapPin className="h-5 w-5" />, title: "Visible en tu cantón", desc: "Apareces cuando alguien de tu zona busca justo el servicio que ofreces." },
  { icon: <CalendarClock className="h-5 w-5" />, title: "Controlas tu agenda", desc: "Publica tus horarios o atiende solo por WhatsApp. Tú decides cómo recibir clientes." },
  { icon: <ImageIcon className="h-5 w-5" />, title: "Muestra tu trabajo", desc: "Casos de éxito y reseñas reales que convencen a quien te está comparando." },
];

const STEPS = [
  { n: 1, icon: <UserPlus className="h-5 w-5" />, title: "Crea tu perfil gratis", desc: "Tu profesión, servicios, zona de cobertura, precios y casos de éxito. Toma unos minutos." },
  { n: 2, icon: <BadgeCheck className="h-5 w-5" />, title: "Verifica tu identidad", desc: "Validamos tu cédula contra el padrón (TSE) y ganas la insignia de identidad verificada." },
  { n: 3, icon: <Star className="h-5 w-5" />, title: "Recibe clientes", desc: "Apareces en las búsquedas de tu cantón, recibes solicitudes y respondes proyectos." },
];

export default function ParaProfesionalesPage() {
  return (
    <div className="min-h-screen flex flex-col bg-white">
      <LandingNavbar />

      {/* Hero */}
      <section className="pt-32 pb-16 text-center px-4 bg-white">
        <FadeInUp>
          <span className="inline-block text-xs font-bold uppercase tracking-widest text-[#009FD9] bg-[#EBF5FB] px-4 py-1.5 rounded-full mb-4">Para profesionales</span>
          <h1 className="text-4xl sm:text-5xl font-extrabold text-[#111827] mb-4 leading-tight">
            Haz crecer tu negocio<br className="hidden sm:block" /> en Costa Rica
          </h1>
          <p className="text-lg text-[#6b7280] max-w-xl mx-auto mb-8">
            Miles de personas buscan profesionales como tú todos los días. Crea tu perfil gratis y recibe clientes directos por WhatsApp.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <SmartRegisterLink className="inline-flex items-center gap-2 bg-[#009FD9] hover:bg-[#0089bb] text-white font-bold text-base px-8 py-4 rounded-2xl transition-colors shadow-sm">
              Registra tu perfil gratis <ArrowRight className="h-5 w-5" />
            </SmartRegisterLink>
            <Link href="/como-funciona" className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#374151] hover:text-[#009FD9] transition-colors">
              Ver cómo funciona
            </Link>
          </div>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs sm:text-sm text-[#6b7280]">
            <span className="inline-flex items-center gap-1.5 font-medium"><BadgeCheck className="h-4 w-4 text-[#009FD9]" /> Perfil 100% gratis</span>
            <span className="inline-flex items-center gap-1.5 font-medium"><Ban className="h-4 w-4 text-[#16a34a]" /> Sin comisiones</span>
            <span className="inline-flex items-center gap-1.5 font-medium"><ShieldCheck className="h-4 w-4 text-[#16a34a]" /> Verificación gratis</span>
          </div>
        </FadeInUp>
      </section>

      {/* Benefits */}
      <section className="py-16 sm:py-20 px-4 bg-white">
        <div className="mx-auto max-w-6xl">
          <FadeInUp>
            <div className="text-center mb-12">
              <h2 className="text-2xl sm:text-3xl font-bold text-[#111827]">Todo a tu favor</h2>
              <p className="text-[#6b7280] mt-2 max-w-xl mx-auto">Las herramientas para conseguir clientes, sin letra pequeña.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {BENEFITS.map((b) => (
                <div key={b.title} className="rounded-2xl border border-[#e5e7eb] bg-white p-6">
                  <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-[#EBF5FB] text-[#009FD9]">{b.icon}</div>
                  <h3 className="font-semibold text-[#111827] mb-1.5">{b.title}</h3>
                  <p className="text-sm text-[#6b7280] leading-relaxed">{b.desc}</p>
                </div>
              ))}
            </div>
          </FadeInUp>
        </div>
      </section>

      {/* How it works for pros */}
      <section className="py-16 sm:py-20 px-4 bg-[#f9fafb]">
        <div className="mx-auto max-w-5xl">
          <FadeInUp>
            <div className="text-center mb-12">
              <h2 className="text-2xl sm:text-3xl font-bold text-[#111827]">Empieza en 3 pasos</h2>
              <p className="text-[#6b7280] mt-2">Sin costo y sin complicaciones.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              {STEPS.map((s) => (
                <div key={s.n} className="relative rounded-2xl border border-[#e5e7eb] bg-white p-6 pt-7">
                  <span className="absolute -top-3 left-6 flex h-7 w-7 items-center justify-center rounded-full bg-[#009FD9] text-white text-sm font-bold shadow">{s.n}</span>
                  <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-[#EBF5FB] text-[#009FD9]">{s.icon}</div>
                  <h3 className="font-semibold text-[#111827] mb-1.5">{s.title}</h3>
                  <p className="text-sm text-[#6b7280] leading-relaxed">{s.desc}</p>
                </div>
              ))}
            </div>
          </FadeInUp>
        </div>
      </section>

      {/* Identity-verified trust angle */}
      <section className="py-16 sm:py-20 px-4 bg-white">
        <div className="mx-auto max-w-4xl">
          <FadeInUp>
            <div className="rounded-2xl border border-[#bbf7d0] bg-[#f0fdf4] p-8 sm:p-12 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#dcfce7] text-[#16a34a]">
                <ShieldCheck className="h-7 w-7" />
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold text-[#111827] mb-3">La verificación que te diferencia</h2>
              <p className="text-[#374151] leading-relaxed max-w-2xl mx-auto mb-6">
                Confirmamos tu cédula contra el padrón del TSE y mostramos la insignia <strong>“Identidad verificada”</strong> en tu perfil. Los clientes priorizan a quienes pueden confiar — y es totalmente gratis.
              </p>
              <Link href="/proveedores-autorizados" className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#16a34a] hover:underline">
                Cómo funciona la verificación <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </FadeInUp>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-16 px-4 bg-[#1a2744] text-center">
        <h2 className="text-2xl sm:text-3xl font-extrabold text-white leading-tight mb-3">Tu próximo cliente te está buscando</h2>
        <p className="text-[#93c5fd] text-sm sm:text-base leading-relaxed mb-8 max-w-xl mx-auto">Crea tu perfil hoy. Es gratis, toma unos minutos y empiezas a recibir solicitudes por WhatsApp.</p>
        <SmartRegisterLink className="inline-flex items-center gap-2 bg-[#009FD9] hover:bg-[#0089bb] text-white font-bold text-base px-8 py-3.5 rounded-2xl transition-colors">
          Registra tu perfil gratis <ArrowRight className="h-5 w-5" />
        </SmartRegisterLink>
      </section>

      <LandingFooter />
    </div>
  );
}

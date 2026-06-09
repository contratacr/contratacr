"use client";

import { useState } from "react";
import { LandingNavbar } from "@/components/landing/landing-navbar";
import { LandingFooter } from "@/components/landing/landing-footer";
import { FadeInUp } from "@/components/landing/fade-in-up";
import { Link } from "@/i18n/navigation";
import {
  ChevronDown, Search, BadgeCheck, MessageCircle, FileText,
  Bell, Users, Banknote, CalendarClock, ArrowRight,
} from "lucide-react";

/* ── FAQ ── */
const FAQ_ITEMS = [
  {
    q: "¿Es gratis buscar profesionales?",
    a: "Sí, completamente gratuito para clientes. Puedes buscar, comparar y contactar profesionales sin pagar nada.",
  },
  {
    q: "¿Cómo verifican a los profesionales?",
    a: "Verificamos la cédula de identidad de cada profesional con el Registro Civil de Costa Rica. Solo aparecen en la plataforma una vez confirmada su identidad.",
  },
  {
    q: "¿Cómo coordino el servicio?",
    a: "Te ponemos en contacto directo por WhatsApp con el profesional. Sin intermediarios, sin comisiones. Coordinas precio, fecha y horario directamente con ellos.",
  },
  {
    q: "¿Qué es la publicación de proyectos?",
    a: "Puedes publicar un proyecto describiendo exactamente lo que necesitas. Los profesionales de la red verán tu publicación y te enviarán propuestas con precio y disponibilidad. Tú eliges con quién trabajar.",
  },
  {
    q: "¿Cómo dejo una reseña?",
    a: "Después de completar un servicio, puedes dejar una reseña desde tu panel de cliente. Las reseñas son verificadas y solo pueden hacerlas clientes que realmente usaron el servicio.",
  },
];

function FaqAccordion() {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div className="divide-y divide-gray-100">
      {FAQ_ITEMS.map((item, i) => (
        <div key={i}>
          <button
            onClick={() => setOpen(open === i ? null : i)}
            className="w-full flex items-center justify-between py-5 text-left gap-4 group"
          >
            <span className="text-base font-semibold text-[#1a2744] group-hover:text-[#009FD9] transition-colors">
              {item.q}
            </span>
            <ChevronDown
              className={`h-5 w-5 text-gray-400 shrink-0 transition-transform duration-200 ${open === i ? "rotate-180 text-[#009FD9]" : ""}`}
            />
          </button>
          {open === i && (
            <p className="pb-5 text-sm text-gray-500 leading-relaxed">{item.a}</p>
          )}
        </div>
      ))}
    </div>
  );
}

/* ── Mini step card ── */
function MiniStep({ n, label, sub }: { n: number; label: string; sub: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="h-7 w-7 rounded-full bg-[#009FD9] text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
        {n}
      </div>
      <div>
        <p className="text-sm font-semibold text-[#1a2744]">{label}</p>
        <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{sub}</p>
      </div>
    </div>
  );
}

export default function ComoFuncionaPage() {
  return (
    <div className="min-h-screen flex flex-col bg-white">
      <LandingNavbar />

      {/* Hero */}
      <section className="pt-32 pb-16 bg-white text-center px-4">
        <FadeInUp>
          <span className="inline-block text-xs font-bold uppercase tracking-widest text-[#009FD9] bg-[#EBF5FB] px-4 py-1.5 rounded-full mb-4">
            Cómo funciona
          </span>
          <h1 className="text-4xl sm:text-5xl font-extrabold text-[#1a2744] mb-4 leading-tight">
            Dos formas de encontrar<br className="hidden sm:block" /> al profesional correcto
          </h1>
          <p className="text-lg text-gray-500 max-w-2xl mx-auto">
            ContrataCR conecta clientes con profesionales verificados de Costa Rica.
            Eliges cómo quieres buscar.
          </p>
        </FadeInUp>
      </section>

      {/* Two paths */}
      <section className="pb-20 px-4">
        <div className="mx-auto max-w-4xl">
          <FadeInUp>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

              {/* Path 1 — Search */}
              <div className="bg-white border-2 border-[#e5e7eb] rounded-3xl p-8 hover:border-[#009FD9]/40 hover:shadow-md transition-all">
                <div className="flex items-center gap-3 mb-6">
                  <div className="h-12 w-12 rounded-2xl bg-[#EBF5FB] flex items-center justify-center">
                    <Search className="h-6 w-6 text-[#009FD9]" />
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-widest text-[#009FD9]">Opción 1</p>
                    <h2 className="text-xl font-bold text-[#1a2744]">Busca un profesional</h2>
                  </div>
                </div>
                <p className="text-sm text-gray-500 mb-6 leading-relaxed">
                  Explora los perfiles disponibles, revisa trabajos anteriores y agenda una cita directamente.
                </p>
                <div className="flex flex-col gap-4">
                  <MiniStep
                    n={1}
                    label="Busca por categoría o cantón"
                    sub="Filtra por tipo de servicio, provincia y cantón para encontrar profesionales cerca de ti."
                  />
                  <MiniStep
                    n={2}
                    label="Revisa el perfil verificado"
                    sub="Fotos de trabajos anteriores, reseñas de clientes reales y cédula verificada."
                  />
                  <MiniStep
                    n={3}
                    label="Agenda y coordina por WhatsApp"
                    sub="Contacto directo sin intermediarios. Acordás precio, fecha y horario en WhatsApp."
                  />
                </div>
                <Link
                  href="/buscar"
                  className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-[#009FD9] hover:underline"
                >
                  Ver profesionales <ArrowRight className="h-4 w-4" />
                </Link>
              </div>

              {/* Path 2 — Post project */}
              <div className="bg-white border-2 border-[#e5e7eb] rounded-3xl p-8 hover:border-[#009FD9]/40 hover:shadow-md transition-all">
                <div className="flex items-center gap-3 mb-6">
                  <div className="h-12 w-12 rounded-2xl bg-[#EBF5FB] flex items-center justify-center">
                    <FileText className="h-6 w-6 text-[#009FD9]" />
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-widest text-[#009FD9]">Opción 2</p>
                    <h2 className="text-xl font-bold text-[#1a2744]">Publica tu proyecto</h2>
                  </div>
                </div>
                <p className="text-sm text-gray-500 mb-6 leading-relaxed">
                  Describe lo que necesitas y deja que los profesionales te envíen propuestas con precio y disponibilidad.
                </p>
                <div className="flex flex-col gap-4">
                  <MiniStep
                    n={1}
                    label="Describe tu proyecto"
                    sub="Título, descripción detallada, zona y presupuesto estimado. Toma menos de 2 minutos."
                  />
                  <MiniStep
                    n={2}
                    label="Profesionales te contactan"
                    sub="Los profesionales registrados en tu zona ven tu proyecto y te envían propuestas."
                  />
                  <MiniStep
                    n={3}
                    label="Eliges la mejor propuesta"
                    sub="Comparas precios y perfiles, aceptas la propuesta y coordinas por WhatsApp."
                  />
                </div>
                <Link
                  href="/publicar-proyecto"
                  className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-[#009FD9] hover:underline"
                >
                  Publicar proyecto <ArrowRight className="h-4 w-4" />
                </Link>
              </div>

            </div>
          </FadeInUp>
        </div>
      </section>

      {/* Para profesionales */}
      <section className="py-20 px-4" style={{ background: "#EBF5FB" }}>
        <div className="mx-auto max-w-4xl">
          <FadeInUp>
            <div className="text-center">
              <span className="inline-block text-xs font-bold uppercase tracking-widest text-[#009FD9] bg-white px-4 py-1.5 rounded-full mb-4">
                Para profesionales
              </span>
              <h2 className="text-3xl font-extrabold text-[#1a2744] mb-4">
                ¿Eres profesional? Registra tu perfil gratis.
              </h2>
              <p className="text-gray-500 mb-8 text-sm leading-relaxed max-w-xl mx-auto">
                Crea tu perfil en minutos y empieza a recibir clientes directos en Costa Rica.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
                {[
                  { Icon: Banknote, text: "Sin comisiones" },
                  { Icon: BadgeCheck, text: "Cédula verificada" },
                  { Icon: Users, text: "Clientes directos" },
                  { Icon: CalendarClock, text: "Control de agenda" },
                ].map(({ Icon, text }) => (
                  <div key={text} className="bg-white rounded-2xl p-4 text-center border border-white/80">
                    <Icon className="h-6 w-6 text-[#009FD9] mx-auto mb-2" />
                    <p className="text-xs font-semibold text-[#374151]">{text}</p>
                  </div>
                ))}
              </div>
              <Link
                href="/registro/profesional"
                className="inline-flex items-center gap-2 bg-[#009FD9] hover:bg-[#0089bb] text-white font-bold px-8 py-3.5 rounded-full transition-all shadow-sm hover:shadow-[0_4px_20px_rgba(0,159,217,0.35)]"
              >
                Registrarte gratis <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </FadeInUp>

          {/* How projects work for pros */}
          <FadeInUp delay={80}>
            <div className="mt-12 bg-white rounded-3xl p-8 border border-white/80">
              <div className="flex items-center gap-3 mb-5">
                <Bell className="h-5 w-5 text-[#009FD9]" />
                <h3 className="text-base font-bold text-[#1a2744]">¿Cómo funcionan los proyectos para ti?</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
                {[
                  { icon: "📋", title: "Ves los proyectos", sub: "Revisás proyectos abiertos filtrados por tu categoría y zona." },
                  { icon: "✉️", title: "Enviás propuesta", sub: "Describes tu oferta, precio y disponibilidad en segundos." },
                  { icon: "🤝", title: "Cierras el trato", sub: "Si el cliente acepta, coordinas directo por WhatsApp." },
                ].map(({ icon, title, sub }) => (
                  <div key={title} className="p-4">
                    <div className="text-3xl mb-2">{icon}</div>
                    <p className="text-sm font-semibold text-[#1a2744] mb-1">{title}</p>
                    <p className="text-xs text-gray-400">{sub}</p>
                  </div>
                ))}
              </div>
            </div>
          </FadeInUp>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-20 px-4 bg-white">
        <div className="mx-auto max-w-4xl">
          <FadeInUp>
            <h2 className="text-3xl font-extrabold text-[#1a2744] mb-2 text-center">
              Preguntas frecuentes
            </h2>
            <p className="text-gray-500 text-center mb-10">
              Respondemos las dudas más comunes sobre ContrataCR.
            </p>
            <FaqAccordion />
          </FadeInUp>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-16 px-4 bg-[#1a2744] text-center">
        <FadeInUp>
          <h2 className="text-3xl font-extrabold text-white mb-3">
            ¿Listo para empezar?
          </h2>
          <p className="text-[#93c5fd] mb-8 max-w-md mx-auto text-sm">
            Busca profesionales verificados en Costa Rica o publica tu proyecto gratis.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/buscar"
              className="inline-flex items-center justify-center gap-2 bg-[#009FD9] hover:bg-[#0089bb] text-white font-bold px-7 py-3 rounded-full transition-all"
            >
              <Search className="h-4 w-4" /> Buscar profesionales
            </Link>
            <Link
              href="/publicar-proyecto"
              className="inline-flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 text-white font-bold px-7 py-3 rounded-full transition-all border border-white/20"
            >
              <MessageCircle className="h-4 w-4" /> Publicar mi proyecto
            </Link>
          </div>
        </FadeInUp>
      </section>

      <LandingFooter />
    </div>
  );
}

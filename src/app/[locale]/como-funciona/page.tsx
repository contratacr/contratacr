"use client";

import { useState } from "react";
import { LandingNavbar } from "@/components/landing/landing-navbar";
import { LandingFooter } from "@/components/landing/landing-footer";
import { FadeInUp } from "@/components/landing/fade-in-up";
import { Link } from "@/i18n/navigation";
import { ChevronDown } from "lucide-react";

/* ── FAQ Accordion (Client Component) ── */
const FAQ_ITEMS = [
  {
    q: "¿Es gratis buscar profesionales?",
    a: "Sí, completamente gratuito para clientes. Podés buscar, comparar y contactar profesionales sin pagar nada.",
  },
  {
    q: "¿Cómo verifican a los profesionales?",
    a: "Verificamos la cédula de identidad de cada profesional con el Registro Civil de Costa Rica. Solo aparecen en la plataforma una vez confirmada su identidad.",
  },
  {
    q: "¿Cómo coordino el servicio?",
    a: "Te ponemos en contacto directo por WhatsApp con el profesional. Sin intermediarios, sin comisiones. Coordinás precio, fecha y horario directamente con ellos.",
  },
  {
    q: "¿Qué pasa si tengo un problema?",
    a: "Escribinos a soporte. Nuestro equipo responde en menos de 24 horas y te ayudamos a resolver cualquier inconveniente con el servicio.",
  },
  {
    q: "¿Cómo dejo una reseña?",
    a: "Después de completar un servicio, podés dejar una reseña desde tu panel de cliente. Las reseñas son verificadas y solo pueden hacerlas clientes que realmente usaron el servicio.",
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
            <span className="text-base font-semibold text-[#1a2744] group-hover:text-[#2563EB] transition-colors">
              {item.q}
            </span>
            <ChevronDown
              className={`h-5 w-5 text-gray-400 shrink-0 transition-transform duration-200 ${open === i ? "rotate-180 text-[#2563EB]" : ""}`}
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

/* ── Step Card ── */
function StepCard({
  number,
  icon,
  title,
  description,
}: {
  number: number;
  icon: string;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center text-center px-6 py-8 bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
      <div className="w-14 h-14 rounded-full bg-[#EBF5FB] flex items-center justify-center text-2xl mb-4">
        {icon}
      </div>
      <div className="w-7 h-7 rounded-full bg-[#2563EB] text-white text-xs font-bold flex items-center justify-center mb-3">
        {number}
      </div>
      <h3 className="text-lg font-bold text-[#1a2744] mb-2">{title}</h3>
      <p className="text-sm text-gray-500 leading-relaxed">{description}</p>
    </div>
  );
}

/* ── Page ── */
export default function ComoFuncionaPage() {
  return (
    <div className="min-h-screen flex flex-col bg-white">
      <LandingNavbar />

      {/* Hero */}
      <section className="pt-32 pb-16 bg-white text-center px-4">
        <FadeInUp>
          <span className="inline-block text-xs font-bold uppercase tracking-widest text-[#2563EB] bg-[#EBF5FB] px-4 py-1.5 rounded-full mb-4">
            Cómo funciona
          </span>
          <h1 className="text-4xl sm:text-5xl font-extrabold text-[#1a2744] mb-4 leading-tight">
            Cómo funciona ContrataCR.
          </h1>
          <p className="text-lg text-gray-500 max-w-xl mx-auto">
            Encontrá el profesional correcto en 3 simples pasos.
          </p>
        </FadeInUp>
      </section>

      {/* 3 Steps */}
      <section className="pb-20 px-4">
        <div className="mx-auto max-w-5xl">
          <FadeInUp>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <StepCard
                number={1}
                icon="🔍"
                title="Describí lo que necesitás"
                description="Contanos tu proyecto en detalle — plomero para baño, pintura de sala de 4x4m, etc."
              />
              <StepCard
                number={2}
                icon="✅"
                title="Conectamos con profesionales verificados"
                description="Revisás perfiles con cédula verificada, fotos de trabajos anteriores y reseñas reales."
              />
              <StepCard
                number={3}
                icon="💬"
                title="Coordinás directo por WhatsApp"
                description="Sin intermediarios, sin comisiones. Hablás directo con el profesional y acordás precio."
              />
            </div>
          </FadeInUp>
        </div>
      </section>

      {/* Para profesionales */}
      <section className="py-20 px-4" style={{ background: "#EBF5FB" }}>
        <div className="mx-auto max-w-5xl">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <FadeInUp>
              <div>
                <span className="inline-block text-xs font-bold uppercase tracking-widest text-[#2563EB] bg-white px-4 py-1.5 rounded-full mb-4">
                  Para profesionales
                </span>
                <h2 className="text-3xl font-extrabold text-[#1a2744] mb-4">
                  ¿Sos profesional? Registrá tu perfil gratis.
                </h2>
                <ul className="space-y-3 mb-8">
                  {[
                    { icon: "💸", text: "Sin comisiones — cobrás el 100% del trabajo" },
                    { icon: "🪪", text: "Cédula verificada — más confianza con clientes" },
                    { icon: "👥", text: "Clientes directos — sin intermediarios" },
                    { icon: "📅", text: "Control de agenda — vos manejás tu disponibilidad" },
                  ].map(({ icon, text }) => (
                    <li key={text} className="flex items-center gap-3 text-sm text-gray-700">
                      <span className="text-lg">{icon}</span>
                      <span>{text}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href="/registro/profesional"
                  className="inline-flex items-center gap-2 bg-[#2563EB] hover:bg-[#1d4ed8] text-white font-bold px-7 py-3 rounded-full transition-all shadow-sm hover:shadow-[0_4px_20px_rgba(37,99,235,0.35)]"
                >
                  Registrarte gratis →
                </Link>
              </div>
            </FadeInUp>
            <FadeInUp delay={80}>
              <div className="rounded-2xl overflow-hidden shadow-xl aspect-[4/3]">
                <img
                  src="https://images.unsplash.com/photo-1560250097-0b93528c311a?w=800&q=80"
                  alt="Profesional trabajando"
                  className="w-full h-full object-cover"
                />
              </div>
            </FadeInUp>
          </div>
        </div>
      </section>

      {/* Trust signals */}
      <section className="py-14 bg-white border-y border-gray-100">
        <div className="mx-auto max-w-4xl px-4">
          <FadeInUp>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-center">
              {[
                { stat: "1,000+", label: "profesionales" },
                { stat: "7", label: "provincias" },
                { stat: "100%", label: "verificados con cédula" },
              ].map(({ stat, label }) => (
                <div key={label} className="py-6">
                  <div className="text-4xl font-extrabold text-[#2563EB] mb-1">{stat}</div>
                  <div className="text-sm text-gray-500 font-medium">{label}</div>
                </div>
              ))}
            </div>
          </FadeInUp>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-20 px-4 bg-white">
        <div className="mx-auto max-w-2xl">
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

      <LandingFooter />
    </div>
  );
}

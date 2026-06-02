"use client";

import { useState } from "react";
import { LandingNavbar } from "@/components/landing/landing-navbar";
import { LandingFooter } from "@/components/landing/landing-footer";
import { FadeInUp } from "@/components/landing/fade-in-up";
import { ChevronDown } from "lucide-react";

/* ── Popular Questions Accordion ── */
const POPULAR_QUESTIONS = [
  {
    q: "¿Cómo me registro?",
    a: "Podés registrarte con tu correo electrónico o mediante Google/Facebook. El proceso toma menos de 2 minutos. Solo necesitás un correo válido y una contraseña.",
  },
  {
    q: "¿Cómo verifico mi cédula?",
    a: "Una vez dentro de tu perfil, accedé a la sección 'Verificación de identidad', ingresá tu número de cédula y lo confirmamos automáticamente con el Registro Civil de Costa Rica.",
  },
  {
    q: "¿Cómo solicito un servicio?",
    a: "Buscá el profesional que necesitás, revisá su perfil y reseñas, y hacé clic en 'Contactar'. Te conectamos de inmediato por WhatsApp para que coordinés directamente.",
  },
  {
    q: "¿Cómo cancelo una reserva?",
    a: "Podés cancelar desde tu panel de cliente en la sección 'Mis servicios'. Si ya coordinaste con el profesional, te recomendamos avisarle directamente por WhatsApp con al menos 24 horas de anticipación.",
  },
  {
    q: "¿ContrataCR cobra comisión?",
    a: "No. ContrataCR es completamente gratuito tanto para clientes como para profesionales. No cobramos comisión por los servicios contratados. Nuestro modelo se basa en subscripciones premium opcionales para profesionales.",
  },
];

function PopularAccordion() {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div className="divide-y divide-gray-100">
      {POPULAR_QUESTIONS.map((item, i) => (
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

/* ── Help Category Cards ── */
const HELP_CATEGORIES = [
  {
    icon: "👤",
    title: "Cuenta y registro",
    description: "Creá tu cuenta, verificá tu identidad y gestioná tu perfil",
  },
  {
    icon: "📋",
    title: "Reservas y servicios",
    description: "Cómo solicitar, confirmar y cancelar servicios",
  },
  {
    icon: "💳",
    title: "Pagos y precios",
    description: "Información sobre precios, comisiones y formas de pago",
  },
  {
    icon: "🔨",
    title: "Para profesionales",
    description: "Registrate, manejá tu agenda y recibí clientes",
  },
  {
    icon: "🔒",
    title: "Seguridad y privacidad",
    description: "Cómo protegemos tus datos",
  },
  {
    icon: "💬",
    title: "Contactar soporte",
    description: "Hablar con nuestro equipo",
  },
];

/* ── Page ── */
export default function AyudaPage() {
  return (
    <div className="min-h-screen flex flex-col bg-white">
      <LandingNavbar />

      {/* Hero */}
      <section className="pt-32 pb-12 bg-white text-center px-4">
        <FadeInUp>
          <span className="inline-block text-xs font-bold uppercase tracking-widest text-[#2563EB] bg-[#EBF5FB] px-4 py-1.5 rounded-full mb-4">
            Soporte
          </span>
          <h1 className="text-4xl sm:text-5xl font-extrabold text-[#1a2744] mb-4 leading-tight">
            Centro de ayuda.
          </h1>
          <p className="text-lg text-gray-500 max-w-xl mx-auto">
            Encontrá respuestas rápidas o contactanos directamente.
          </p>
        </FadeInUp>
      </section>

      {/* Category Cards */}
      <section className="pb-20 px-4" style={{ background: "#f4f7fa" }}>
        <div className="mx-auto max-w-5xl">
          <FadeInUp>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 pt-10">
              {HELP_CATEGORIES.map((cat, i) => (
                <FadeInUp key={cat.title} delay={i * 50}>
                  <div className="bg-white border border-gray-100 rounded-2xl p-6 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
                    <div className="text-3xl mb-3">{cat.icon}</div>
                    <h3 className="text-base font-bold text-[#1a2744] mb-1">{cat.title}</h3>
                    <p className="text-sm text-gray-400 leading-relaxed">{cat.description}</p>
                  </div>
                </FadeInUp>
              ))}
            </div>
          </FadeInUp>
        </div>
      </section>

      {/* Popular Questions */}
      <section className="py-20 px-4 bg-white">
        <div className="mx-auto max-w-2xl">
          <FadeInUp>
            <h2 className="text-3xl font-extrabold text-[#1a2744] mb-2 text-center">
              Preguntas frecuentes
            </h2>
            <p className="text-gray-500 text-center mb-10">
              Las consultas más comunes de nuestra comunidad.
            </p>
            <PopularAccordion />
          </FadeInUp>
        </div>
      </section>

      {/* Contact Section */}
      <section className="py-16 px-4" style={{ background: "#f4f7fa" }}>
        <div className="mx-auto max-w-2xl text-center">
          <FadeInUp>
            <h2 className="text-2xl font-extrabold text-[#1a2744] mb-2">
              ¿No encontraste lo que buscás?
            </h2>
            <p className="text-gray-500 mb-8">
              Nuestro equipo responde en menos de 24 horas. Escribinos por WhatsApp o correo.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <a
                href="https://wa.me/50600000000"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#1db954] text-white font-bold px-7 py-3 rounded-full transition-all shadow-sm"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 00-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                </svg>
                WhatsApp
              </a>
              <a
                href="mailto:soporte@contratacr.com"
                className="inline-flex items-center justify-center gap-2 bg-white hover:bg-gray-50 text-[#1a2744] font-bold px-7 py-3 rounded-full transition-all border border-gray-200 shadow-sm"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <rect x="2" y="4" width="20" height="16" rx="2" />
                  <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                </svg>
                Enviar correo
              </a>
            </div>
          </FadeInUp>
        </div>
      </section>

      <LandingFooter />
    </div>
  );
}

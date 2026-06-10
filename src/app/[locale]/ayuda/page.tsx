"use client";

import { useState } from "react";
import { LandingNavbar } from "@/components/landing/landing-navbar";
import { LandingFooter } from "@/components/landing/landing-footer";
import { FadeInUp } from "@/components/landing/fade-in-up";
import { Link } from "@/i18n/navigation";
import { ChevronDown, MessageSquare, Search, UserCheck, CalendarDays, Star, ShieldCheck, HelpCircle } from "lucide-react";
import { SUPPORT_WHATSAPP_URL } from "@/lib/constants";

/* ── FAQ ── */
const FAQ_ITEMS = [
  {
    icon: <HelpCircle className="h-4 w-4" />,
    q: "¿ContrataCR cobra alguna comisión o cargo?",
    a: "No. ContrataCR es completamente gratuito para clientes y para profesionales. No cobramos comisiones, no cobramos mensualidades, no cobramos ningún tipo de cargo. Crear un perfil, buscar profesionales, publicar proyectos y recibir contactos es gratis sin excepción.",
  },
  {
    icon: <UserCheck className="h-4 w-4" />,
    q: "¿Cómo me registro como profesional?",
    a: "Haz clic en 'Registrarse como profesional' en la barra de navegación. Puedes registrarte con tu correo o con Google/Facebook. El proceso tiene 2 pasos: primero seleccionas tu tipo de servicio y zona, luego subes una foto y describes tu experiencia. Toma menos de 5 minutos.",
  },
  {
    icon: <ShieldCheck className="h-4 w-4" />,
    q: "¿Cómo se verifica la cédula de un profesional?",
    a: "Comparamos la cédula con el padrón del Registro Civil (TSE). Cuando coincide, el perfil muestra el sello 'Identidad verificada' y aparece primero en los resultados. Es una verificación de identidad (confirma que la persona es real y verificable), no una calificación de la calidad del trabajo. Los profesionales sin verificar también pueden aparecer, marcados como 'Identidad sin verificar'.",
  },
  {
    icon: <Search className="h-4 w-4" />,
    q: "¿Cómo busco un profesional?",
    a: "Usa la barra de búsqueda en la página principal o la página de búsqueda de profesionales. Puedes buscar por tipo de servicio (plomero, psicólogo, diseñador, etc.), por provincia y cantón, y ordenar por calificación. El buscador entiende sinónimos — si escribes 'niñera' también va a encontrar profesionales de cuidado infantil.",
  },
  {
    icon: <CalendarDays className="h-4 w-4" />,
    q: "¿Cómo coordino el servicio con el profesional?",
    a: "Una vez que encuentras el profesional que quieres, haces clic en su perfil y te conectamos directamente por WhatsApp. Desde ahí coordinas precio, fecha y todo lo necesario sin intermediarios.",
  },
  {
    icon: <Star className="h-4 w-4" />,
    q: "¿Cómo dejo una reseña?",
    a: "Después de completar un servicio, puedes dejar una reseña desde tu panel de cliente en la sección 'Solicitudes'. Solo clientes que realmente contrataron ese servicio pueden dejar reseñas — así se garantiza que son auténticas.",
  },
  {
    icon: <HelpCircle className="h-4 w-4" />,
    q: "¿Qué es publicar un proyecto?",
    a: "Publicar un proyecto es una alternativa a buscar directamente. Describes lo que necesitas (por ejemplo: 'pintura de sala 4x4m, presupuesto ₡80.000'), y los profesionales de tu zona que tienen esa especialidad te envían propuestas con su precio. Tú eliges con quién trabajar.",
  },
  {
    icon: <UserCheck className="h-4 w-4" />,
    q: "¿Mi información personal está segura?",
    a: "Sí. Tu número de teléfono y correo nunca son visibles públicamente en la plataforma. Cuando haces contacto con un profesional, lo haces vía WhatsApp de forma directa. Cumplimos con la Ley 8968 de Protección de Datos de Costa Rica.",
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
            <div className="flex items-center gap-3 flex-1">
              <span className="text-[#009FD9] shrink-0">{item.icon}</span>
              <span className="text-base font-semibold text-[#1a2744] group-hover:text-[#009FD9] transition-colors">
                {item.q}
              </span>
            </div>
            <ChevronDown
              className={`h-5 w-5 text-gray-400 shrink-0 transition-transform duration-200 ${open === i ? "rotate-180 text-[#009FD9]" : ""}`}
            />
          </button>
          {open === i && (
            <p className="pb-5 text-sm text-gray-500 leading-relaxed pl-7">{item.a}</p>
          )}
        </div>
      ))}
    </div>
  );
}

/* ── Help Categories ── */
const HELP_CATEGORIES = [
  {
    icon: <UserCheck className="h-6 w-6 text-[#009FD9]" />,
    title: "Crear tu cuenta",
    description: "Regístrate con correo, Google o Facebook. El proceso toma menos de 2 minutos.",
    href: null,
  },
  {
    icon: <Search className="h-6 w-6 text-[#009FD9]" />,
    title: "Buscar profesionales",
    description: "Busca por servicio, provincia y cantón. El buscador entiende sinónimos.",
    href: "/buscar",
  },
  {
    icon: <ShieldCheck className="h-6 w-6 text-[#009FD9]" />,
    title: "Verificación de identidad",
    description: "Cómo confirmamos la identidad de los profesionales con el padrón del TSE.",
    href: null,
  },
  {
    icon: <CalendarDays className="h-6 w-6 text-[#009FD9]" />,
    title: "Solicitudes y proyectos",
    description: "Cómo solicitar un servicio, publicar un proyecto y gestionar propuestas.",
    href: "/publicar-proyecto",
  },
  {
    icon: <Star className="h-6 w-6 text-[#009FD9]" />,
    title: "Reseñas y calificaciones",
    description: "Cómo dejar y gestionar reseñas verificadas de servicios.",
    href: null,
  },
  {
    icon: <MessageSquare className="h-6 w-6 text-[#009FD9]" />,
    title: "Contactar soporte",
    description: "¿No encontraste lo que buscas? Nuestro equipo responde en menos de 24 horas.",
    href: "/soporte",
  },
];

export default function AyudaPage() {
  return (
    <div className="min-h-screen flex flex-col bg-white">
      <LandingNavbar />

      {/* Hero */}
      <section className="pt-32 pb-14 bg-white text-center px-4">
        <FadeInUp>
          <span className="inline-block text-xs font-bold uppercase tracking-widest text-[#009FD9] bg-[#EBF5FB] px-4 py-1.5 rounded-full mb-4">
            Centro de ayuda
          </span>
          <h1 className="text-4xl sm:text-5xl font-extrabold text-[#1a2744] mb-4 leading-tight">
            ¿En qué te podemos ayudar?
          </h1>
          <p className="text-lg text-gray-500 max-w-lg mx-auto">
            Encuentra respuestas rápidas o contáctanos directamente.
          </p>
        </FadeInUp>
      </section>

      {/* Category Cards — same max-width as FAQ below */}
      <section className="pb-16 px-4 bg-[#f4f7fa]">
        <div className="mx-auto max-w-4xl">
          <FadeInUp>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-10">
              {HELP_CATEGORIES.map((cat, i) => {
                const card = (
                  <div className="bg-white border border-gray-100 rounded-2xl p-6 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 h-full">
                    <div className="mb-3">{cat.icon}</div>
                    <h3 className="text-sm font-bold text-[#1a2744] mb-1">{cat.title}</h3>
                    <p className="text-sm text-gray-400 leading-relaxed">{cat.description}</p>
                  </div>
                );
                return (
                  <FadeInUp key={cat.title} delay={i * 50}>
                    {cat.href ? (
                      <Link href={cat.href} className="block h-full">{card}</Link>
                    ) : (
                      card
                    )}
                  </FadeInUp>
                );
              })}
            </div>
          </FadeInUp>
        </div>
      </section>

      {/* FAQ — same max-width as category cards above */}
      <section className="py-16 px-4 bg-white">
        <div className="mx-auto max-w-4xl">
          <FadeInUp>
            <h2 className="text-2xl font-extrabold text-[#1a2744] mb-1">Preguntas frecuentes</h2>
            <p className="text-gray-500 mb-8 text-sm">Las consultas más comunes de nuestra comunidad.</p>
            <FaqAccordion />
          </FadeInUp>
        </div>
      </section>

      {/* Contact */}
      <section className="py-14 px-4 bg-[#f4f7fa]">
        <div className="mx-auto max-w-4xl">
          <FadeInUp>
            <div className="bg-white rounded-3xl border border-gray-100 p-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
              <div>
                <h2 className="text-xl font-bold text-[#1a2744] mb-1">¿No encontraste lo que buscas?</h2>
                <p className="text-sm text-gray-500">Nuestro equipo responde rápido.</p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 shrink-0">
                <Link
                  href="/soporte"
                  className="inline-flex items-center justify-center gap-2 bg-[#009FD9] hover:bg-[#0089bb] text-white font-bold px-6 py-3 rounded-full transition-all text-sm whitespace-nowrap"
                >
                  <MessageSquare className="h-4 w-4" />
                  Abrir ticket de soporte
                </Link>
                <a
                  href={SUPPORT_WHATSAPP_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#1db954] text-white font-bold px-6 py-3 rounded-full transition-all text-sm whitespace-nowrap"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 00-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                  </svg>
                  WhatsApp
                </a>
              </div>
            </div>
          </FadeInUp>
        </div>
      </section>

      <LandingFooter />
    </div>
  );
}
